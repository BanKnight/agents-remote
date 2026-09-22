// 探针：M10 用户反馈修复回归（2026-09-22，8 问题批次①③④）。
// 断言：
//   A 问题① 置顶真正置顶——/projects 活动卡首行 = 被置顶会话（rank 序让位于置顶）+ 紫标可见。
//   B 问题③ 聚焦态 nav 右上两图标——info 在、独立「关闭」✕ 不在；⋯ 菜单含「关闭会话…」。
//   C 问题⑤ info sheet 对齐 03k——grab 40×5 / h2 17px-600 / 状态行 12px-600 含● / krow 行分隔 /
//     .acts 三动作 14px-600（重命名/置顶/关闭会话…）。
//   D 问题⑦⑧ 插件页——h1 30px-800 / 搜索框 38px r12 / segc 32px / d2 overflow-wrap:anywhere /
//     长命令 fixture 下 document 无横向溢出。
//   E 问题⑥ 全局文件 sanity——/files mainPage 树可见 + 首行几何对照数据输出（换皮前 baseline）。
// 密码由脚本自读（readAppPassword），不进 agent 上下文。用法：bun scripts/probe-m10-feedback-fixes.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const MOBILE_CTX = { viewport: { width: 393, height: 852 }, locale: "zh-CN" };

const PINNED_ID = "agent_pin";
const AGENTS = [
  {
    id: "agent_a",
    projectName: "proj1",
    provider: "claude",
    displayName: "AAA-running",
    status: "running",
    createdAt: "2026-09-22T00:00:00.000Z",
    model: "opus",
    permissionMode: "plan",
    claudeSessionId: "uuid-aaaa",
  },
  {
    id: "agent_b",
    projectName: "proj1",
    provider: "claude",
    displayName: "BBB-running",
    status: "running",
    createdAt: "2026-09-22T01:00:00.000Z",
    model: "opus",
    permissionMode: "plan",
    claudeSessionId: "uuid-bbbb",
  },
  {
    id: PINNED_ID,
    projectName: "proj1",
    provider: "claude",
    displayName: "PINNED-idle",
    status: "idle",
    createdAt: "2026-09-22T02:00:00.000Z",
    model: "opus",
    permissionMode: "plan",
    claudeSessionId: "uuid-cccc",
  },
];

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectNames: ["proj1"],
        candidates: AGENTS.map((a) => ({
          sessionId: a.id,
          projectName: a.projectName,
          displayName: a.displayName,
          status: a.status,
          provider: a.provider,
          type: "agent",
          createdAt: a.createdAt,
          updatedAt: a.createdAt,
        })),
      }),
    }),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions(\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [PINNED_ID] }),
    }),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions\/[^/]+$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [PINNED_ID] }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: AGENTS }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  for (const a of AGENTS) {
    await page.route(new RegExp(`/api/projects/proj1/agent-sessions/${a.id}$`), (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: a,
          availableModels: ["opus"],
          availablePermissionModes: ["plan"],
        }),
      }),
    );
  }
  // 插件页：长命令 stdio MCP + 长路径技能（问题⑦ 溢出 fixture）。
  await page.route(/\/api\/mcp(\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        servers: [
          {
            name: "probe-long-cmd",
            type: "stdio",
            command: "/usr/local/share/global-path/very/deep/runtime/dir/bin/node-exec",
            args: [
              "--experimental-loader=/usr/local/share/cache/loader/ts-loader.mjs",
              "--max-old-space-size=8192",
              "server.js",
            ],
          },
        ],
      }),
    }),
  );
  await page.route(/\/api\/skills\/installed\?.*$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skills: [
          {
            name: "probe-skill",
            path: "/srv/projects/agents-remote/.claude/skills/probe-skill/SKILL.md",
            description: "probe",
          },
        ],
      }),
    }),
  );
  await page.route(/\/api\/skills\/updates\?.*$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ updates: [] }),
    }),
  );
  // 全局文件（问题⑥）：根层 /api/root/files 列项目目录；子层项目文件列表。
  await page.route(/\/api\/root\/files$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [{ name: "proj1", path: "proj1", type: "directory", hidden: false, size: null }],
      }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/files\?.*$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [
          { name: "src", path: "src", type: "directory", hidden: false, size: null },
          {
            name: "index.ts",
            path: "index.ts",
            type: "file",
            hidden: false,
            size: 12,
            mtimeMs: Date.now() - 86400000,
          },
        ],
      }),
    }),
  );
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /登录|Sign in/ }).click();
  await page.waitForTimeout(700);
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext(MOBILE_CTX);
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);

    // ── A 问题①：置顶恒排最前 ──────────────────────────────────────
    console.log("A. 置顶排序（/projects 活动卡）");
    await page.goto(`${WEB_ORIGIN}/projects`);
    await page.waitForTimeout(900);
    const rowTitles = await page.evaluate(() => {
      // 活动行 title = text-subhead font-semibold 行内 truncate span；无专用类，按类签名定位。
      const titles = [...document.querySelectorAll("span.truncate.text-subhead")];
      return titles.map((el) => el.textContent?.trim() ?? "");
    });
    if (
      record(
        Array.isArray(rowTitles) && rowTitles.length >= 3,
        `活动行渲染 ≥3（got ${rowTitles?.length}）`,
      )
    ) {
      record(rowTitles[0] === "PINNED-idle", `首行 = 置顶会话（got "${rowTitles[0]}"）`);
      const rankTail = rowTitles.slice(1);
      record(
        rankTail.join(",") === "AAA-running,BBB-running",
        `置顶组后保持 rank 序（got "${rankTail.join(",")}"）`,
      );
      const pinChip = await page
        .locator("span", { hasText: /^置顶$/ })
        .first()
        .isVisible()
        .catch(() => false);
      record(pinChip, "置顶行紫标可见");
    }

    // ── B 问题③：聚焦态 nav 两图标 + ⋯ 菜单关闭项 ──────────────────
    console.log("B. 聚焦态 header（问题③）");
    await page
      .getByRole("button", { name: /AAA-running/ })
      .first()
      .click();
    await page.waitForTimeout(900);
    const infoBtn = page.getByRole("button", { name: "实例信息" });
    record(await infoBtn.isVisible().catch(() => false), "ℹ 按钮可见");
    const closeInHeader = await page.getByRole("button", { name: "关闭", exact: true }).count();
    record(closeInHeader === 0, "独立「关闭」✕ 不在 nav");
    await page.getByRole("button", { name: "更多操作" }).click();
    await page.waitForTimeout(400);
    const closeItem = page.getByText("关闭会话…", { exact: true });
    record(await closeItem.isVisible().catch(() => false), "⋯ 菜单含「关闭会话…」");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // ── C 问题⑤：info sheet 对齐 03k ─────────────────────────────
    console.log("C. info sheet 几何（03k）");
    await infoBtn.click();
    await page.waitForTimeout(600);
    const sheet = page.locator("[role=dialog]").last();
    record(await sheet.isVisible().catch(() => false), "sheet 挂载");
    const geo = await page.evaluate(() => {
      const dialog = [...document.querySelectorAll("[role=dialog]")].pop();
      if (!dialog) return null;
      const grab = dialog.querySelector("div[aria-hidden=true]");
      const h2 = dialog.querySelector("h2");
      const statusLine = h2?.nextElementSibling;
      const rows = [...dialog.querySelectorAll("dl > div")];
      const btns = [...dialog.querySelectorAll("div > button")].filter(
        (b) => b.closest("dl") === null,
      );
      const style = (el) => (el ? getComputedStyle(el) : null);
      return {
        grab: grab
          ? { w: grab.getBoundingClientRect().width, h: grab.getBoundingClientRect().height }
          : null,
        h2: style(h2),
        status: style(statusLine),
        statusText: statusLine?.textContent ?? "",
        row2Border: style(rows[0]),
        btns: btns.map((b) => ({
          text: b.textContent?.trim(),
          fs: getComputedStyle(b).fontSize,
          fw: getComputedStyle(b).fontWeight,
        })),
      };
    });
    if (record(geo !== null, "sheet 几何可读")) {
      record(
        geo.grab && Math.abs(geo.grab.w - 40) < 2 && Math.abs(geo.grab.h - 5) < 2,
        `grab 40×5（got ${geo.grab?.w}×${geo.grab?.h}）`,
      );
      record(
        geo.h2?.fontSize === "17px" && geo.h2?.fontWeight === "600",
        `h2 17px/600（got ${geo.h2?.fontSize}/${geo.h2?.fontWeight}）`,
      );
      record(
        geo.statusText.includes("●") &&
          geo.status?.fontSize === "12px" &&
          geo.status?.fontWeight === "600",
        `状态行 12px/600 含●（got "${geo.statusText}" ${geo.status?.fontSize}/${geo.status?.fontWeight}）`,
      );
      record(
        geo.row2Border?.borderBottomWidth === "1px",
        `krow 行间分隔线（got border-bottom ${geo.row2Border?.borderBottomWidth}）`,
      );
      record(
        geo.btns.length === 3 &&
          geo.btns[0]?.text === "重命名" &&
          geo.btns[1]?.text === "置顶" &&
          geo.btns[2]?.text === "关闭会话…" &&
          geo.btns.every((b) => b.fs === "14px" && b.fw === "600"),
        `acts 三动作 14px/600（got ${JSON.stringify(geo.btns)}）`,
      );
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // ── D 问题⑦⑧：插件页几何 + 溢出 ───────────────────────────────
    console.log("D. 插件页几何（09）");
    await page.goto(`${WEB_ORIGIN}/plugins`);
    await page.waitForTimeout(900);
    const pgeo = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const search = [...document.querySelectorAll("div")].find((d) =>
        d.className?.includes?.("rounded-[12px]"),
      );
      const segc = document.querySelector(".segc");
      const d2 = document.querySelector(".pcard .d2");
      const style = (el) => (el ? getComputedStyle(el) : null);
      return {
        h1: style(h1),
        search: style(search),
        segc: style(segc),
        d2ow: style(d2)?.overflowWrap,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      };
    });
    if (record(pgeo.h1 !== null, "插件页元素可读")) {
      record(
        pgeo.h1.fontSize === "30px" && pgeo.h1.fontWeight === "800",
        `h1 30px/800（got ${pgeo.h1.fontSize}/${pgeo.h1.fontWeight}）`,
      );
      record(
        pgeo.search?.borderRadius === "12px" && pgeo.search?.height === "38px",
        `搜索框 38px r12（got ${pgeo.search?.height}/${pgeo.search?.borderRadius}）`,
      );
      record(pgeo.segc?.height === "32px", `segc 32px（got ${pgeo.segc?.height}）`);
      record(pgeo.d2ow === "anywhere", `d2 overflow-wrap:anywhere（got ${pgeo.d2ow}）`);
      record(
        pgeo.scrollW <= pgeo.innerW + 1,
        `长命令 fixture 无横向溢出（scrollW ${pgeo.scrollW} ≤ ${pgeo.innerW}）`,
      );
    }

    // ── E 问题⑥：全局文件 10-tab 卡形态（移动）─────────────────────
    console.log("E. 全局文件（/files）10-tab 卡形态");
    await page.goto(`${WEB_ORIGIN}/files`);
    await page.waitForTimeout(900);
    const tree = page.getByLabel("Project files");
    record(await tree.isVisible().catch(() => false), "mainPage 全局文件区可见");
    const fgeo = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const card = document.querySelector(".gfcard");
      const row = document.querySelector(".gfrow");
      const ic = row?.querySelector(".ic");
      const n = row?.querySelector(".n");
      const d = row?.querySelector(".d");
      const live = row?.querySelector(".live");
      const st = (el) => (el ? getComputedStyle(el) : null);
      return {
        h1: st(h1),
        cardRadius: st(card)?.borderRadius,
        cardBorder: st(card)?.borderTopWidth,
        icBox: ic
          ? `${Math.round(ic.getBoundingClientRect().width)}×${Math.round(ic.getBoundingClientRect().height)}`
          : null,
        icRadius: st(ic)?.borderRadius,
        nFs: st(n)?.fontSize,
        nFw: st(n)?.fontWeight,
        nText: n?.textContent?.trim() ?? "",
        dText: d?.textContent?.trim() ?? "",
        liveText: live?.textContent?.trim() ?? "",
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      };
    });
    if (record(fgeo.h1 !== null, "卡形态元素可读")) {
      record(
        fgeo.h1.fontSize === "30px" && fgeo.h1.fontWeight === "800",
        `h1 30px/800（got ${fgeo.h1.fontSize}/${fgeo.h1.fontWeight}）`,
      );
      record(
        fgeo.cardRadius === "16px" && fgeo.cardBorder === "1px",
        `gfcard r16 border 1px（got ${fgeo.cardRadius}/${fgeo.cardBorder}）`,
      );
      record(
        fgeo.icBox === "30×30" && fgeo.icRadius === "8px",
        `徽章 30×30 r8（got ${fgeo.icBox}/${fgeo.icRadius}）`,
      );
      record(
        fgeo.nFs === "14.5px" && fgeo.nFw === "600" && fgeo.nText === "proj1",
        `项目行 n 14.5px/600（got ${fgeo.nText} ${fgeo.nFs}/${fgeo.nFw}）`,
      );
      record(fgeo.dText.includes("3 实例"), `副行统计（got "${fgeo.dText}"）`);
      record(fgeo.liveText === "● 2", `live ● running 数（got "${fgeo.liveText}"）`);
      record(fgeo.scrollW <= fgeo.innerW + 1, `无横向溢出（${fgeo.scrollW} ≤ ${fgeo.innerW}）`);
    }
  } finally {
    await browser.close();
  }
  console.log(allPass ? "\n全部断言通过" : "\n存在失败断言");
  process.exit(allPass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
