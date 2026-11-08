#!/usr/bin/env bun
// probe-pages-default-root.mjs — pages 默认根兜底探针（2026-11-07 default-on 批次验收）
//
// 单测验不到的面：跨进程 /p/{project} 公开面全链（无凭据 → site/ 默认根 → 200）、
// token 翻转后无凭据 401、UI 入口全链（检视面板「页面」标签 → 默认根行）、恢复语义
//（fs 层恢复配置文件）。
// 断言：
//   A. 无凭据 GET /p/test/ → 200 + text/html + 内容含探针标记（自建 site/index.html）。
//   B. 带 auth GET pages/config → roots 恰为 [{/,site,public}]（生效视图）。
//   C. UI：真登录桌面右栏 ptabs = [文件,Git,页面,Wiki]（pages 平级接入）→ 点「页面」→
//      PagesPanel 默认根行（title = /p/test/ + 公开徽标紧跟，subtitle → site）。
//   D. PUT {/,site,token} → 无凭据 GET /p/test/ → 401（per-root 鉴权分流对默认根生效）。
// 恢复纪律：pages.json 有备份写回、无则 fs unlink（绝不能 PUT roots:[] 恢复——那会把
// test 项目永久置为显式关闭）；自建的 site/index.html 经 files/delete 删除（自建才删）。
// 密码自读不打印。跑法：bun scripts/probe-pages-default-root.mjs
//（dev api 43011 + web 43012 需在跑；C 段走 web 真登录）。

import { readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { readAppPassword, readDeployConfig } from "./lib/deploy-config.mjs";

const API_BASE = "http://127.0.0.1:43011";
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const TEST_PROJECT = "test";

const deployConfig = await readDeployConfig();
const PROJECTS_ROOT = deployConfig?.projects_root ?? "/home/deploy/workspace";
const PAGES_CONFIG_PATH = join(PROJECTS_ROOT, TEST_PROJECT, ".agents-remote", "pages.json");
const SITE_INDEX_RELATIVE = "site/index.html";
const PROBE_MARKER = `ar-pages-default-root-probe-${Date.now().toString(36)}`;

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── REST 客户端（login 拿 token → Bearer；公开面请求不带 auth）───────────────
let authToken = "";

async function login() {
  const password = await readAppPassword();
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  authToken = ((await res.json()) ?? {}).token ?? "";
  if (!authToken) throw new Error("login returned empty token");
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ── 原状备份与恢复（fs 层，见头部恢复纪律）───────────────────────────────────
async function backupPagesConfig() {
  if (!existsSync(PAGES_CONFIG_PATH)) return null;
  return readFile(PAGES_CONFIG_PATH, "utf8");
}

async function restorePagesConfig(backup) {
  if (backup === null) {
    if (existsSync(PAGES_CONFIG_PATH)) await unlink(PAGES_CONFIG_PATH);
    return;
  }
  await writeFile(PAGES_CONFIG_PATH, backup);
}

// site/index.html 已存在（用户数据）→ 不覆盖不删除，返回 false；自建 → true。
async function ensureSiteIndex() {
  // /files/preview 探测存在性：200 即已存在（用户数据，不覆盖不删除，内容断言放宽）。
  const preview = await api(`/api/projects/${TEST_PROJECT}/files/preview`, {
    method: "POST",
    body: JSON.stringify({ path: SITE_INDEX_RELATIVE }),
  });
  if (preview.status === 200) {
    record(
      "site/index.html pre-existing (kept, content assertions relaxed)",
      true,
      "user data — not overwritten",
    );
    return false;
  }
  // save 只覆盖已存在文件（不自动 mkdir/建文件）：先 mkdir site/（best-effort，已存在
  // 忽略），再 create index.html，最后 save 写入探针标记内容。
  await api(`/api/projects/${TEST_PROJECT}/files/mkdir`, {
    method: "POST",
    body: JSON.stringify({ name: "site" }),
  });
  const created = await api(`/api/projects/${TEST_PROJECT}/files/create?path=site`, {
    method: "POST",
    body: JSON.stringify({ name: "index.html" }),
  });
  if (created.status !== 200 && created.status !== 201) {
    throw new Error(
      `create site/index.html failed: ${created.status} ${JSON.stringify(created.body)}`,
    );
  }
  const save = await api(`/api/projects/${TEST_PROJECT}/files/save`, {
    method: "POST",
    body: JSON.stringify({
      path: SITE_INDEX_RELATIVE,
      content: `<!doctype html><html><body>${PROBE_MARKER}</body></html>`,
    }),
  });
  if (save.status !== 200 && save.status !== 201) {
    throw new Error(`save site/index.html failed: ${save.status} ${JSON.stringify(save.body)}`);
  }
  return true;
}

async function deleteSiteIndex() {
  await api(`/api/projects/${TEST_PROJECT}/files/delete`, {
    method: "POST",
    body: JSON.stringify({ path: SITE_INDEX_RELATIVE }),
  });
}

// ── 断言 A/B/D：HTTP 面 ──────────────────────────────────────────────────────
async function assertPublicServe(expectedMarker) {
  const res = await fetch(`${API_BASE}/p/${TEST_PROJECT}/`);
  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  record(
    "A default root serves publicly without credentials",
    res.status === 200 && contentType.includes("text/html") && text.includes(expectedMarker),
    `status=${res.status} ct=${contentType} marker=${text.includes(expectedMarker)}`,
  );
}

async function assertConfigView() {
  const { status, body } = await api(`/api/projects/${TEST_PROJECT}/pages/config`);
  const roots = body?.config?.roots ?? null;
  record(
    "B config GET returns effective view (default root)",
    status === 200 &&
      JSON.stringify(roots) === JSON.stringify([{ urlPath: "/", fsDir: "site", auth: "public" }]),
    `status=${status} roots=${JSON.stringify(roots)}`,
  );
}

async function assertTokenGate() {
  const put = await api(`/api/projects/${TEST_PROJECT}/pages/config`, {
    method: "PUT",
    body: JSON.stringify({ roots: [{ urlPath: "/", fsDir: "site", auth: "token" }] }),
  });
  if (put.status !== 200) {
    record("D token root PUT", false, `status=${put.status} ${JSON.stringify(put.body)}`);
    return;
  }
  const res = await fetch(`${API_BASE}/p/${TEST_PROJECT}/`);
  record(
    "D token root requires auth (401 without credentials)",
    res.status === 401,
    `status=${res.status}`,
  );
}

// ── 断言 C：UI 入口（桌面右栏「页面」标签 → PagesPanel 默认根行）─────────────
// 真登录（无 mock，读 test 项目真实生效态——与 B 同前提：pages.json 不存在 = 默认根）。
// 必须在 assertTokenGate 之前跑：D 段把根翻成 token 后徽标会变「需登录」。
async function assertInspectorPagesTab() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "zh-CN",
    });
    const page = await context.newPage();
    // 右栏默认展开（收起态 atomWithLocalOnlyStorage 默认 true；注入展开态少一个交互依赖，
    // probe-inspector-row-menus 同款）。
    await page.addInitScript(() => localStorage.setItem("workbenchRightCollapsed", "false"));
    await page.goto(`${WEB_ORIGIN}/`);
    await page.locator("input[type='password']").fill(await readAppPassword());
    await page.locator("button[type='submit']").click();
    await page.waitForTimeout(600);
    await page.goto(`${WEB_ORIGIN}/projects/${TEST_PROJECT}?v=1`);
    await page.waitForSelector("nav.side", { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll("main > div > aside").length === 2, {
      timeout: 8000,
    });
    const readPanelTabs = () =>
      page.evaluate(() => {
        const aside = document.querySelectorAll("main > div > aside")[1];
        return aside
          ? [...aside.querySelectorAll('[role="tab"]')].map((b) => b.getAttribute("aria-label"))
          : null;
      });
    // C1 四基础常驻标签（pages 2026-11-07 平级接入，序随 WORKBENCH_TAB_PLUGINS）。
    await page
      .waitForFunction(
        () => {
          const aside = document.querySelectorAll("main > div > aside")[1];
          return (aside?.querySelectorAll('[role="tab"]').length ?? 0) >= 4;
        },
        { timeout: 8000 },
      )
      .catch(() => {});
    const tabs = await readPanelTabs();
    record(
      "C1 inspector ptabs = [文件,Git,页面,Wiki] (pages as 4th base tab)",
      tabs?.join(",") === "文件,Git,页面,Wiki",
      `tabs=${JSON.stringify(tabs)}`,
    );
    // C2 点「页面」→ PagesPanel 默认根行（§6.17 二轮收敛）：title = 完整访问 URL
    // "/p/test/" + 「公开」徽章紧跟（urlPath 不再单独成字——与 URL 重复，用户真机
    // 反馈），subtitle = "→ site"；且无「需登录」（token 徽标在场 = 读到了翻转后
    // 状态，时序错位）。
    await page.locator("main > div > aside").nth(1).getByRole("tab", { name: "页面" }).click();
    await page
      .waitForFunction(
        () => {
          const aside = document.querySelectorAll("main > div > aside")[1];
          return aside?.textContent?.includes("/p/test/") ?? false;
        },
        { timeout: 8000 },
      )
      .catch(() => {});
    const row = await page.evaluate(() => {
      const aside = document.querySelectorAll("main > div > aside")[1];
      const group = aside?.querySelector('[aria-label="页面静态根"]');
      if (!group) {
        return { groupFound: false };
      }
      const text = group.textContent ?? "";
      // 几何断言（frontend-notes §34：文本断言对布局回归盲）：徽章须与主标题 URL 同行
      // 且紧跟（间距 <16px）、右缘不贴行尾（距行右缘 >100px，§6.17 布局契约）。
      const firstRow = group.firstElementChild;
      const rowRect = firstRow?.getBoundingClientRect();
      const spans = firstRow ? [...firstRow.querySelectorAll("span")] : [];
      const badge = spans.find(
        (s) => s.textContent === "公开" && s.className.includes("rounded-full"),
      );
      const urlSpan = spans.find(
        (s) => s.textContent === "/p/test/" && s.className.includes("font-mono"),
      );
      const badgeRect = badge?.getBoundingClientRect();
      const urlRect = urlSpan?.getBoundingClientRect();
      const gap = badgeRect && urlRect ? badgeRect.left - urlRect.right : null;
      const gapOk = gap !== null && gap >= 0 && gap < 16;
      const sameLine = badgeRect && urlRect ? Math.abs(badgeRect.top - urlRect.top) < 4 : false;
      const notAtRowEnd = badgeRect && rowRect ? rowRect.right - badgeRect.right > 100 : false;
      return {
        groupFound: true,
        hasServeUrl: text.includes("/p/test/"),
        hasFsDir: text.includes("→ site"),
        hasPublicBadge: text.includes("公开"),
        hasTokenBadge: text.includes("需登录"),
        badgeInline: gapOk && sameLine && notAtRowEnd,
      };
    });
    record(
      "C2 pages panel renders default root row (URL title + public badge, → site)",
      row.groupFound &&
        row.hasServeUrl &&
        row.hasFsDir &&
        row.hasPublicBadge &&
        row.badgeInline &&
        !row.hasTokenBadge,
      `group=${row.groupFound} serveUrl=${row.hasServeUrl} dir=${row.hasFsDir} public=${row.hasPublicBadge} badgeInline=${row.badgeInline} token=${row.hasTokenBadge}`,
    );
  } finally {
    await browser.close();
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const backup = await backupPagesConfig();
  let createdSiteIndex = false;
  try {
    await login();
    createdSiteIndex = await ensureSiteIndex();

    // 默认态断言（A/B/C）在前，token 翻转（D）放最后，恢复前完成。
    if (!createdSiteIndex) {
      // 用户已有 index.html：A 的内容断言放宽为 200 + text/html。
      const res = await fetch(`${API_BASE}/p/${TEST_PROJECT}/`);
      const contentType = res.headers.get("content-type") ?? "";
      record(
        "A default root serves publicly without credentials",
        res.status === 200 && contentType.includes("text/html"),
        `status=${res.status} ct=${contentType} (pre-existing content)`,
      );
    } else {
      await assertPublicServe(PROBE_MARKER);
    }
    await assertConfigView();
    await assertInspectorPagesTab();
    await assertTokenGate();
  } finally {
    if (createdSiteIndex) await deleteSiteIndex();
    await restorePagesConfig(backup);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length > 0
        ? `；FAIL 明细：\n${failed.map((f) => `- ${f.name}: ${f.detail}`).join("\n")}`
        : ""),
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`probe crashed: ${error?.stack ?? error}`);
  process.exit(1);
});
