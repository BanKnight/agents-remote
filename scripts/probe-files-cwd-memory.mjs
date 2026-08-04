// 探针：移动端文件树 cwd 记忆（后台重开停留）+ 路径不存在回退。
// 断言（zh-CN locale，iPhone 12 Pro 390×844，全新 context 无 SW）：
//  1. 项目 Files tab 逐级进入 A→B→C→D，breadcrumb 停在 D。
//  2. reload 后仍停在 D（localStorage 记忆——本任务核心）。
//  3. 切「总览」tab 再切回「文件」仍停在 D（跨 tab 保活）。
//  4. 切项目（proj2）Files tab 回根（按项目 key 隔离，不串项目）。
//  5. 回 proj1 Files tab 仍停在 D（记忆按 key 分组）。
//  6. 记忆路径不存在（mock 该目录 404）reload 后回退根目录（边界处理）。
// 密码自读不打印。用法：bun scripts/probe-files-cwd-memory.mjs
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

async function readRawPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const cfg = path.join(os.homedir(), ".agents-remote", "config.toml");
  try {
    const txt = await readFile(cfg, "utf8");
    const m = txt.match(/^app_password\s*=\s*["']([^"']*)["']/m);
    if (m && m[1]) return m[1];
  } catch {}
  const pid = execSync(
    "ss -ltnp 2>/dev/null | grep ':43011' | grep -oP 'pid=\\K[0-9]+' | head -1",
    { encoding: "utf8" },
  ).trim();
  if (pid) {
    const env = await readFile(`/proc/${pid}/environ`, "utf8");
    const entry = env.split("\0").find((e) => e.startsWith("APP_PASSWORD="));
    if (entry) return entry.slice("APP_PASSWORD=".length);
  }
  throw new Error("password not found");
}

// 目录树 mock：proj1 = A/B/C/D 链，proj2 = X/y。deletedPath 非空时该路径返回 404。
function buildTreeMocks({ deletedPath = null } = {}) {
  const proj1 = (p) => {
    const entries =
      p === ""
        ? [
            { name: "A", path: "A", type: "directory" },
            { name: "file1.ts", path: "file1.ts", type: "file" },
          ]
        : p === "A"
          ? [{ name: "B", path: "A/B", type: "directory" }]
          : p === "A/B"
            ? [{ name: "C", path: "A/B/C", type: "directory" }]
            : p === "A/B/C"
              ? [{ name: "D", path: "A/B/C/D", type: "directory" }]
              : p === "A/B/C/D"
                ? [{ name: "deep.ts", path: "A/B/C/D/deep.ts", type: "file" }]
                : [];
    return {
      projectName: "proj1",
      path: p,
      parentPath: p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : null,
      entries,
    };
  };
  const proj2 = (p) => {
    const entries =
      p === ""
        ? [
            { name: "X", path: "X", type: "directory" },
            { name: "y.ts", path: "y.ts", type: "file" },
          ]
        : p === "X"
          ? [{ name: "z.ts", path: "X/z.ts", type: "file" }]
          : [];
    return {
      projectName: "proj2",
      path: p,
      parentPath: p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : null,
      entries,
    };
  };
  return (url) => {
    const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/files$/);
    if (!m) return null;
    const project = decodeURIComponent(m[1]);
    const p = url.searchParams.get("path") ?? "";
    if (deletedPath !== null && p === deletedPath) {
      return { status: 404, body: null };
    }
    const data = project === "proj1" ? proj1(p) : project === "proj2" ? proj2(p) : null;
    if (!data) return { status: 404, body: null };
    return { status: 200, body: data };
  };
}

async function setup(page) {
  const state = { deletedPath: null };
  // 登录走真实后端（43012 → api 43011，密码自读）。仅 mock 项目数据：
  // 1) /api/overview 提供 proj1/proj2 两个假项目（隔离断言用）；2) 文件树目录 mock。
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1", "proj2"], candidates: [] }),
    }),
  );
  // 项目文件列表（目录树），按 path query 返回；404 flag 由 state.deletedPath 控制。
  await page.route(/\/api\/projects\/[^/]+\/files(?:\?.*)?$/, (r) => {
    const handler = buildTreeMocks({ deletedPath: state.deletedPath });
    const hit = handler(new URL(r.request().url()));
    if (!hit) return r.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    return r.fulfill({
      status: hit.status,
      contentType: "application/json",
      body: hit.status === 200 ? JSON.stringify(hit.body) : JSON.stringify({}),
    });
  });
  return state;
}

// 读当前 breadcrumb 路径：最后一段 = 当前目录；根目录 = 无段。PathBreadcrumb 是
// `div.flex.min-w-0.flex-wrap` 容器，含 root 按钮（aria-label=files.goRoot）+ segment 按钮。
// segment 按钮无 svg（root 按钮含 home svg）。
async function readPath(page) {
  return await page.evaluate(() => {
    const crumbs = Array.from(document.querySelectorAll("div.flex.min-w-0.flex-wrap"));
    for (const c of crumbs) {
      const btns = Array.from(c.querySelectorAll("button"));
      if (btns.length === 0) continue;
      const rootBtn = btns.find((b) => /root|根/i.test(b.getAttribute("aria-label") ?? ""));
      if (!rootBtn) continue;
      const segments = btns
        .filter((b) => b !== rootBtn && !b.querySelector("svg"))
        .map((b) => (b.textContent ?? "").trim())
        .filter((s) => s.length > 0);
      return {
        last: segments.length > 0 ? segments[segments.length - 1] : null,
        segments,
        hasRoot: true,
      };
    }
    return { last: null, segments: [], hasRoot: false };
  });
}

async function waitLast(page, expected) {
  await page
    .waitForFunction(
      (exp) => {
        const crumbs = Array.from(document.querySelectorAll("div.flex.min-w-0.flex-wrap"));
        for (const c of crumbs) {
          const btns = Array.from(c.querySelectorAll("button"));
          if (btns.length === 0) continue;
          const rootBtn = btns.find((b) => /root|根/i.test(b.getAttribute("aria-label") ?? ""));
          if (!rootBtn) continue;
          const segs = btns
            .filter((b) => b !== rootBtn && !b.querySelector("svg"))
            .map((b) => (b.textContent ?? "").trim())
            .filter((s) => s.length > 0);
          return segs.length > 0 ? segs[segs.length - 1] === exp : exp === null;
        }
        return false;
      },
      expected,
      { timeout: 8000 },
    )
    .catch(() => {});
}

// 进入项目 Files tab 并逐级点击目录链。
async function openProjectFiles(page, projectName) {
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
  await page.waitForSelector("nav[aria-label]", { timeout: 8000 });
  // 切到「文件」tab（列表态 MobileProjectOverview header tab）。
  await page
    .getByRole("tab", { name: /^文件$|^Files$/ })
    .or(page.getByText(/^文件$|^Files$/, { exact: true }).first())
    .first()
    .click({ timeout: 5000 })
    .catch(async () => {
      await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[role="tab"], button'));
        const t = els.find((el) => /^(文件|Files)$/.test((el.textContent ?? "").trim()));
        if (t) t.click();
      });
    });
  await page.waitForSelector("aside", { timeout: 8000 });
  await page.waitForTimeout(500);
}

// 点击目录行进入下一级（目录行 = aside 内 div[role=button]，文本精确匹配）。
async function enterDir(page, dirName) {
  await page
    .locator('aside [role="button"]')
    .filter({ has: page.locator(`text="${dirName}"`) })
    .first()
    .click({ timeout: 4000 })
    .catch(async () => {
      await page
        .locator("aside")
        .getByText(dirName, { exact: true })
        .first()
        .click({ timeout: 4000 });
    });
  await page.waitForTimeout(450);
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const page = await ctx.newPage();
    const state = await setup(page);
    await page.goto(`${WEB_ORIGIN}/`);
    await page
      .getByLabel("密码")
      .or(page.getByLabel("Password"))
      .fill(await readRawPassword());
    await page.getByRole("button", { name: /解锁|Unlock/ }).click();
    await page.waitForTimeout(700);

    console.log("\n===== 1. 项目 Files tab 逐级进入 A→B→C→D =====");
    await openProjectFiles(page, "proj1");
    await enterDir(page, "A");
    await waitLast(page, "A");
    await enterDir(page, "B");
    await waitLast(page, "B");
    await enterDir(page, "C");
    await waitLast(page, "C");
    await enterDir(page, "D");
    await waitLast(page, "D");
    record((await readPath(page)).last === "D", "文件树停在 D（breadcrumb 最后段 = D）");

    console.log("\n===== 2. reload 后仍停在 D（localStorage 记忆）=====");
    await page.reload();
    await page.waitForSelector("aside", { timeout: 8000 });
    await waitLast(page, "D");
    record((await readPath(page)).last === "D", "reload 后仍停在 D（记忆核心断言）");

    console.log("\n===== 3. 切 总览 tab 再切回 文件 仍停在 D =====");
    await page
      .getByText(/^总览$|^Overview$/, { exact: true })
      .first()
      .click({ timeout: 4000 });
    await page.waitForTimeout(400);
    await page
      .getByText(/^文件$|^Files$/, { exact: true })
      .first()
      .click({ timeout: 4000 });
    await page.waitForSelector("aside", { timeout: 8000 });
    await waitLast(page, "D");
    record((await readPath(page)).last === "D", "切 tab 保活（总览→文件仍 D）");

    console.log("\n===== 4. 切项目 proj2：Files tab 回根（按项目隔离）=====");
    await openProjectFiles(page, "proj2");
    await waitLast(page, null);
    const p2 = await readPath(page);
    record(p2.last === null, `proj2 Files 回根（last=${p2.last ?? "null"}，不串 proj1 的 D）`);

    console.log("\n===== 5. 回 proj1 Files tab 仍停在 D（记忆按 key 分组）=====");
    await openProjectFiles(page, "proj1");
    await waitLast(page, "D");
    record((await readPath(page)).last === "D", "回 proj1 仍停在 D（按项目 key 分组）");

    console.log("\n===== 6. 记忆路径不存在（mock 404）→ 回退根目录 =====");
    // 当前 proj1 记忆在 D；让 D 变 404 模拟目录被删，reload 后应回退根。
    state.deletedPath = "A/B/C/D";
    await page.reload();
    await page.waitForSelector("aside", { timeout: 8000 });
    await waitLast(page, null);
    const pAfter404 = await readPath(page);
    record(pAfter404.last === null, `路径不存在回退根（last=${pAfter404.last ?? "null"}）`);
    // 回退后 cwd 记忆应已清空（下次重开也在根，不会再撞 404）。
    await page.reload();
    await page.waitForSelector("aside", { timeout: 8000 });
    await waitLast(page, null);
    record((await readPath(page)).last === null, "回退后记忆已清空（二次 reload 仍在根）");
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
