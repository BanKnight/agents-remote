// 探针：M10 用户反馈修复回归（2026-09-22，8 问题批次①③④）。
// 断言：
//   A 问题① 置顶真正置顶——/projects 活动卡首行 = 被置顶会话（rank 序让位于置顶）+ 紫标可见。
//   B 问题③ 聚焦态 nav 右上两图标——info 在、独立「关闭」✕ 不在；⋯ 菜单含「关闭会话…」。
//   C 问题⑤ info sheet 对齐 03k——grab 40×5 / h2 17px-600 / 状态行 12px-600 含● / krow 行分隔 /
//     .acts 三动作 14px-600（重命名/置顶/关闭会话…）。
//   D 问题⑦⑧ 插件页——h1 30px-800 / 搜索框 38px r12 / segc 32px / d2 overflow-wrap:anywhere /
//     长命令 fixture 下 document 无横向溢出。
//   E 问题⑥ 全局文件 sanity——/files mainPage 树可见 + 首行几何对照数据输出（换皮前 baseline）。
//   F 问题⑨⑩⑪⑬ 项目工作台——chips 工具态隐藏/取消工具回原 tab/file L3 完整父路径/ticon 间距。
//   G 第三轮（预览 back=上一层 / 历史浮层加载态 / 下拉收起）：
//     G1 file 预览 back → ?tab=files + crumb 在父目录层（03q back 语义）
//     G2 git 预览 back = 「Git 检视」→ 点后 ?tab=git（03r back 语义）
//     G3 历史 sheet 打开先见加载骨架（[role=status]）再见数据行
//     G4 sheet 下拉 ≥96px 收起关闭；慢速小位移回弹不关闭
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
          {
            name: "probe-very-long-server-name-without-any-spaces-for-overflow",
            type: "http",
            url: "https://mcp.example.com/very/long/path/segment/that/keeps/going/on/endpoint",
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
  await page.route(/\/api\/projects\/proj1\/files(\?.*)?$/, (r) => {
    // 动态分流：根层 = src 目录 + index.ts；src 子层 = src/deep.ts（F 组路径断言 fixture）。
    const path = new URL(r.request().url()).searchParams.get("path") ?? "";
    const entries =
      path === "src"
        ? [
            {
              name: "deep.ts",
              path: "src/deep.ts",
              type: "file",
              hidden: false,
              size: 12,
              mtimeMs: Date.now() - 3600000,
            },
          ]
        : [
            { name: "src", path: "src", type: "directory", hidden: false, size: null },
            {
              name: "index.ts",
              path: "index.ts",
              type: "file",
              hidden: false,
              size: 12,
              mtimeMs: Date.now() - 86400000,
            },
          ];
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries,
        parentPath: path ? path.split("/").slice(0, -1).join("/") || null : null,
      }),
    });
  });
  // git diff（G2）：repository + worktree 改动 src/deep.ts（badge M 行 fixture）。
  await page.route(/\/api\/projects\/proj1\/git\/diff$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repository: true,
        projectName: "proj1",
        branch: { name: "main", ahead: 0, behind: 0 },
        files: [
          {
            path: "src/deep.ts",
            status: "modified",
            scope: "worktree",
            addedLines: 1,
            removedLines: null,
          },
        ],
      }),
    }),
  );
  // git log/branches（H1）：超长 commit message fixture（crow 溢出回归）。
  const LONG_MSG =
    "fix(web): 超长提交消息回归 fixture——中文与英文 mixed with long-path words like web/src/components/workbench/mobile-project-tools.tsx 需要在移动端 ellipsis 而不是横向撑破面板";
  await page.route(/\/api\/projects\/proj1\/git\/log$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        branch: "main",
        total: 3,
        commits: [
          { hash: "abc1234", message: LONG_MSG, author: "probe", relativeTime: "5小时前" },
          { hash: "def5678", message: LONG_MSG, author: "probe", relativeTime: "1天前" },
          { hash: "ghi9012", message: LONG_MSG, author: "probe", relativeTime: "3天前" },
        ],
      }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/git\/branches$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: "main",
        branches: [{ name: "main", type: "local", isCurrent: true }],
      }),
    }),
  );
  // agent-history（G3/G4）：延迟 400ms 返回 1 条（加载窗口内可断言加载骨架）。
  await page.route(/\/api\/projects\/proj1\/agent-history\?range=week$/, async (r) => {
    await new Promise((res) => setTimeout(res, 400));
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [
          {
            provider: "claude",
            claudeSessionId: "uuid-aaaa",
            title: "probe-history-entry",
            firstMessage: null,
            startedAt: "2026-09-22T03:00:00.000Z",
            lastActivityAt: new Date().toISOString(),
            fileSize: 123,
            hasActiveSession: true,
            activeSessionId: "agent_a",
          },
        ],
      }),
    });
  });
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
          color: getComputedStyle(b).color,
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
      // 关闭会话… = --c-danger（03k 原型 var(--c-danger)；此前 text-error-text 无效类，用户
      // 实测颜色没对齐——修复后应为 danger 红（深 #ff453a / 浅 #ff3b30）而非继承前景色）。
      record(
        geo.btns[2]?.color === "rgb(255, 69, 58)" || geo.btns[2]?.color === "rgb(255, 59, 48)",
        `关闭会话 danger 色（got ${geo.btns[2]?.color}）`,
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
    // ── F 问题⑨⑩⑪⑬：项目工作台（chips 工具态/取消回 tab/路径/ticon 间距）─────────
    console.log("F. 项目工作台（问题⑨⑩⑪⑬）");
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await page.waitForTimeout(900);
    const ticon = page.locator('button[aria-label="文件"]');
    // F4 问题⑬：ticon 视觉盒 19×19（.ticon svg 原型规格）+ 相邻间距 6px（.row2 gap）——
    // 此前 p-1/touch:w-9 把点击区做进布局盒，触屏下间距被撑到 ~23px。
    const tgeo = await page.evaluate(() => {
      const icons = [...document.querySelectorAll("button.ticon")];
      const rects = icons.map((b) => b.getBoundingClientRect());
      return {
        count: icons.length,
        w: rects[0]?.width,
        gap: rects.length >= 2 ? rects[1].left - (rects[0].left + rects[0].width) : null,
      };
    });
    if (record(tgeo.count === 3, `ticon ×3（got ${tgeo.count}）`)) {
      record(tgeo.w !== null && Math.abs(tgeo.w - 19) < 1.5, `ticon 视觉盒 19px（got ${tgeo.w}）`);
      record(
        tgeo.gap !== null && Math.abs(tgeo.gap - 6) < 1.5,
        `ticon 间距 6px（got ${tgeo.gap}）`,
      );
    }
    // F1 问题⑨：聚焦 agent 的 chips 行在进文件工具后隐藏（此前只 gate 聚焦实例类型漏 tool）。
    await ticon.click();
    await page.waitForTimeout(500);
    record((await page.locator(".chips").count()) === 0, "工具态 chips 隐藏（问题⑨）");
    // F2 问题⑩：取消工具（再点同 ticon）→ URL 无 tab 维度（解析回退 rememberedMiddleTab），
    // chips 恢复 = 回实例主体。
    await ticon.click();
    await page.waitForTimeout(500);
    record(!page.url().includes("tab="), `取消工具 URL 无 tab（got ${page.url()}）`);
    record((await page.locator(".chips").count()) > 0, "取消工具 chips 恢复");
    // F3 问题⑪：文件工具 → src 目录 → deep.ts → header back = 完整父目录 "src"（03q 原型；
    // 此前 .split("/").pop() 只取最后一段）。
    await ticon.click();
    await page.waitForTimeout(500);
    await page.locator("button.frow", { hasText: "src" }).first().click();
    await page.waitForTimeout(500);
    await page.locator("button.frow", { hasText: "deep.ts" }).first().click();
    await page.waitForTimeout(700);
    const backLabel = await page.evaluate(
      () => document.querySelector(".nav .back")?.textContent?.trim() ?? "",
    );
    record(backLabel === "src", `file L3 back = 完整父目录（got "${backLabel}"）`);

    // ── G 第三轮：预览 back = 返回上一层（⑭）+ 历史浮层加载态（①）+ 下拉收起（③）──
    console.log("G. 第三轮（back=上一层/加载态/下拉收起）");
    // G1 问题⑭：file 预览 back → 删 tab + ?tab=files，文件树落在父目录（crumb 含 src）。
    await page.locator(".nav .back").click();
    await page.waitForTimeout(500);
    record(page.url().includes("tab=files"), `file back → ?tab=files（got ${page.url()}）`);
    const crumbText = await page.evaluate(
      () => document.querySelector(".crumb")?.textContent ?? "",
    );
    record(crumbText.includes("src"), `file back crumb 在父目录层（got "${crumbText}"）`);

    // G2 问题⑭：git 预览 back = 「Git 检视」（03r 原型）→ 点后 ?tab=git 回工具面板。
    await page.locator('button[aria-label="Git"]').click();
    await page.waitForTimeout(500);
    await page.locator("button.frow", { hasText: "deep.ts" }).first().click();
    await page.waitForTimeout(700);
    const gitBack = await page.evaluate(
      () => document.querySelector(".nav .back")?.textContent?.trim() ?? "",
    );
    record(gitBack === "Git 检视", `git L3 back = 「Git 检视」（got "${gitBack}"）`);
    await page.locator(".nav .back").click();
    await page.waitForTimeout(500);
    record(page.url().includes("tab=git"), `git back → ?tab=git（got ${page.url()}）`);

    // G3 问题①：历史 sheet 打开先见加载骨架（[role=status]）再见数据行。
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await page.waitForTimeout(700);
    await page
      .getByRole("button", { name: /AAA-running/ })
      .first()
      .click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "更多操作" }).click();
    await page.waitForTimeout(300);
    await page.getByText("会话历史", { exact: true }).click();
    await page.waitForTimeout(120); // mock 延迟 400ms 的加载窗口内
    const loadVisible = await page
      .locator("[role=status]")
      .last()
      .isVisible()
      .catch(() => false);
    record(loadVisible, "历史 sheet 加载骨架可见（问题①）");
    await page.waitForTimeout(700);
    const histRows = await page.locator("button.hrow").count();
    record(histRows >= 1, `历史行渲染（got ${histRows}）`);

    // G4 问题③：sheet 下拉收起（grab 条热区拖 120px ≥ 阈值 → 关闭）+ 慢速小位移回弹不关。
    const grab = page.locator("[role=dialog] .grab").last();
    const gb = await grab.boundingBox();
    if (record(gb !== null, "grab 条可定位")) {
      const cx = gb.x + gb.width / 2;
      const cy = gb.y + gb.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy + 120, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      record((await page.locator("[role=dialog]").count()) === 0, "下拉 120px 收起关闭");
      // 回弹：重开 sheet（mock history 已缓存，直出行），慢速拖 40px（v≈0.11px/ms < 阈值）。
      await page.getByRole("button", { name: "更多操作" }).click();
      await page.waitForTimeout(300);
      await page.getByText("会话历史", { exact: true }).click();
      await page.waitForTimeout(500);
      const gb2 = await page.locator("[role=dialog] .grab").last().boundingBox();
      if (record(gb2 !== null, "重开 sheet grab 可定位")) {
        const cx2 = gb2.x + gb2.width / 2;
        const cy2 = gb2.y + gb2.height / 2;
        await page.mouse.move(cx2, cy2);
        await page.mouse.down();
        for (let i = 1; i <= 4; i++) {
          await page.mouse.move(cx2, cy2 + i * 10);
          await page.waitForTimeout(90);
        }
        await page.mouse.up();
        await page.waitForTimeout(500);
        record((await page.locator("[role=dialog]").count()) > 0, "慢速 40px 回弹不关闭");
      }
    }

    // ── H 第四轮：git 面板溢出（crow 护栏）/ 移动到图标 / 插件页溢出 / 搜索图标 ──
    console.log("H. 第四轮（git 溢出/移动到图标/插件页/搜索图标）");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // H1：git 工具面板超长 commit message → crow 被父约束、.m ellipsis、doc 无溢出
    //（此前 button width:auto=fit-content 被内容撑破，.m 的 min-width:0/ellipsis 全失效）。
    await page.locator('button[aria-label="Git"]').click();
    await page.waitForTimeout(700);
    const h1 = await page.evaluate(() => {
      const crow = document.querySelector("button.crow");
      const m = crow?.querySelector(".m");
      return {
        docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        crowW: crow ? Math.round(crow.getBoundingClientRect().width) : null,
        mEllipsis: m ? getComputedStyle(m).textOverflow : "",
        mClip: m ? m.clientWidth < m.scrollWidth : false,
      };
    });
    if (record(h1.crowW !== null, "crow 行渲染")) {
      record(h1.docOverflow <= 1, `git 面板无横向溢出（doc 溢出 ${h1.docOverflow}px）`);
      record(h1.crowW <= 393, `crow 被父约束 <=393（got ${h1.crowW}）`);
      record(h1.mEllipsis === "ellipsis", `.m ellipsis（got ${h1.mEllipsis}）`);
      record(h1.mClip === true, ".m 实际截断生效（clientWidth < scrollWidth）");
    }
    // H2：文件行右键 → 03w 菜单「移动到…」图标 svg 存在（name="folder" 未注册渲染空白）。
    await page.locator('button[aria-label="文件"]').click();
    await page.waitForTimeout(500);
    await page
      // G1 之后 files cwd 记忆停在 src（§13 持久化语义在探针进程内同样生效），src 下是 deep.ts。
      .locator("button.frow", { hasText: "deep.ts" })
      .first()
      .click({ button: "right" });
    await page.waitForTimeout(400);
    const moveItem = page.locator("[role=menuitem]", { hasText: "移动到" }).first();
    record((await moveItem.locator("svg").count()) > 0, "「移动到…」菜单项 svg 图标可见");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // H3：插件页可点卡（button.pcard）宽度语义——此前 w-full(100%) 叠 .pcard 横向 margin
    // 右侧溢出 32px（用户 iPhone 真机「MCP 服务开始超出右边」），且溢出发生在内层滚动容器
    //（overflow-y:auto 连带 overflow-x:auto）内部，doc 层测不到——断言必须量滚动容器层。
    await page.goto(`${WEB_ORIGIN}/plugins`);
    await page.waitForTimeout(900);
    const h3 = await page.evaluate(() => {
      const vw = window.innerWidth;
      const r1 = [...document.querySelectorAll(".pcard .r1")].find((el) =>
        (el.textContent ?? "").includes("probe-very-long-server-name"),
      );
      const btnCard = document.querySelector("button.pcard");
      const card = [...document.querySelectorAll("button.pcard")].find((el) =>
        (el.textContent ?? "").includes("probe-very-long-server-name"),
      );
      // 从卡向上找第一个 overflow 滚动容器，量其内部横向溢出（真溢出所在层）。
      let scroller = card;
      while (scroller && scroller !== document.body) {
        const ov = getComputedStyle(scroller).overflowY;
        if (ov === "auto" || ov === "scroll") break;
        scroller = scroller.parentElement;
      }
      const mrow = document.querySelector("button.mrow");
      return {
        r1Wrap: r1 ? getComputedStyle(r1).overflowWrap : null,
        cardRight: card ? Math.round(card.getBoundingClientRect().right) : null,
        cardW: card ? Math.round(card.getBoundingClientRect().width) : null,
        btnW: btnCard ? Math.round(btnCard.getBoundingClientRect().width) : null,
        scOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : null,
        mrowW: mrow ? Math.round(mrow.getBoundingClientRect().width) : null,
        vw,
      };
    });
    record(h3.r1Wrap === "anywhere", `pcard r1 anywhere（got ${h3.r1Wrap}）`);
    if (record(h3.cardRight !== null, "button.pcard 渲染")) {
      record(h3.cardRight <= h3.vw + 1, `卡右缘不出屏（got ${h3.cardRight} / vw ${h3.vw}）`);
      record(h3.cardW <= h3.vw - 32 + 1, `卡宽被 margin 扣减（got ${h3.cardW}）`);
      record(h3.scOverflow <= 1, `滚动容器无横向溢出（got ${h3.scOverflow}px）`);
    }
    if (record(h3.mrowW !== null, "button.mrow 渲染")) {
      record(h3.mrowW <= h3.vw - 32 + 1, `mrow 撑满非 fit-content（got ${h3.mrowW}）`);
    }
    // H3b：/plugins/sources 的 button.addsrc 同族修正（fit-content → 撑满）。
    await page.goto(`${WEB_ORIGIN}/plugins/sources`);
    await page.waitForTimeout(700);
    const h3b = await page.evaluate(() => {
      const el = document.querySelector("button.addsrc");
      return el ? Math.round(el.getBoundingClientRect().width) : null;
    });
    if (record(h3b !== null, "button.addsrc 渲染")) {
      record(h3b <= h3.vw - 32 + 1, `addsrc 撑满非 fit-content（got ${h3b}）`);
    }
    // H4：搜索框放大镜 svg 存在（name="search" 未注册渲染空白，×3 处）。
    // H3b 停在 /plugins/sources（无搜索框），回 /plugins 再测。
    await page.goto(`${WEB_ORIGIN}/plugins`);
    await page.waitForTimeout(700);
    const h4 = await page.evaluate(() => {
      const box = document.querySelector("input[type=search]")?.parentElement;
      return box ? box.querySelector("svg") !== null : false;
    });
    record(h4, "搜索框放大镜 svg 可见");
    // H5：MCP 组 ＋ = 20×20 图标（原型 .plus 形态），非 11px 文字「＋」。
    const h5 = await page.evaluate(() => {
      const btn = document.querySelector(".psect .r");
      const svg = btn?.querySelector("svg");
      const r = svg?.getBoundingClientRect();
      return r ? Math.round(r.width) : null;
    });
    if (record(h5 !== null, "MCP 组 ＋ 图标渲染")) {
      record(h5 >= 18 && h5 <= 22, `＋ 为 20px 图标（got ${h5}px）`);
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
