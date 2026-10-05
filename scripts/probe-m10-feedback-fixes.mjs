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
  // file 预览（v1.4 批3 file 标签：面板点文件 → MobileL3FilePreview 发 preview 请求；
  // 无 mock 请求会落到真实 api 404 → l3-file-preview 不渲染）。
  await page.route(/\/api\/projects\/proj1\/files\/preview(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "text",
        projectName: "proj1",
        path: new URL(r.request().url()).searchParams.get("path") ?? "",
        name: new URL(r.request().url()).searchParams.get("path")?.split("/").pop() ?? "",
        size: 24,
        content: "deep file content",
        // ProjectTextFilePreview 契约必填（mobile-l3.tsx 直接 new Date(mtimeMs)）——缺了
        // RangeError → React 树崩溃卸载，探针面板直接消失。
        mtimeMs: Date.now() - 60000,
      }),
    }),
  );
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
  // range 口径（2026-09-30 真机反馈）：移动历史 sheet 与桌面第五批②统一 "all"（旧 "week"
  // 只拉近 7 天窗口）；mock 随实现同口径。
  await page.route(/\/api\/projects\/proj1\/agent-history\?range=all$/, async (r) => {
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
    const closeInHeader = await page.getByRole("button", { name: "关闭", exact: true }).count();
    record(closeInHeader === 0, "独立「关闭」✕ 不在 nav");
    await page.getByRole("button", { name: "更多操作" }).click();
    await page.waitForTimeout(400);
    // v1.5 批1：独立 ℹ 钮退役（MobileFocusActions）→ 实例信息入口合并进 ⋯ 菜单。
    const infoItem = page.getByRole("menuitem", { name: "实例信息" });
    record(await infoItem.isVisible().catch(() => false), "⋯ 菜单含「实例信息」");
    const closeItem = page.getByText("关闭会话…", { exact: true });
    // v1.5 批1：关闭动作收进实例信息面板 .acts footer（⋯ 菜单仅 会话历史/实例信息）。
    record(
      !(await closeItem.isVisible().catch(() => false)),
      "关闭动作不在 ⋯ 菜单（已收进实例信息）",
    );

    // ── C 问题⑤：info sheet 对齐 03k ─────────────────────────────
    console.log("C. info sheet 几何（03k）");
    await infoItem.click();
    await page.waitForTimeout(600);
    const sheet = page.locator("[role=dialog]").last();
    record(await sheet.isVisible().catch(() => false), "sheet 挂载");
    const geo = await page.evaluate(() => {
      const dialog = [...document.querySelectorAll("[role=dialog]")].pop();
      if (!dialog) return null;
      const grab = dialog.querySelector("div[aria-hidden=true]");
      const h2 = dialog.querySelector("h2");
      // §6.12n 迁 MobileSheet 后：h2 在 shd 内，status 状态行按内容（含●）定位。
      const statusLine = [...dialog.querySelectorAll("p")].find((p) =>
        p.textContent?.includes("●"),
      );
      const rows = [...dialog.querySelectorAll("dl > div")];
      const btns = [...dialog.querySelectorAll("div > button")].filter(
        (b) => b.closest("dl") === null,
      );
      const style = (el) => (el ? getComputedStyle(el) : null);
      return {
        grab: grab
          ? { w: grab.getBoundingClientRect().width, h: grab.getBoundingClientRect().height }
          : null,
        h2Text: h2?.textContent ?? "",
        rowsText: rows.map((r) => r.textContent ?? "").join("|"),
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
      // 第八轮批次 2a：标题 = 会话 displayName（03k:61 h2=会话名），名称不进 krow；effort 行存在
      //（mock 无 effort 字段 → 兜底 "high"，与 EffortSelector 同口径；值不 i18n，CLI 标识符直通）。
      record(geo.h2Text === "AAA-running", `h2 = displayName（got "${geo.h2Text}"）`);
      record(!geo.rowsText.includes("名称"), "krow 无「名称」行（displayName 已上移标题位）");
      record(
        geo.rowsText.includes("推理 effort") && geo.rowsText.includes("high"),
        "effort 行存在（label 推理 effort，值兜底 high）",
      );
      // 第八轮批次 2b：三设置行可点下钻（role=button + › chevron affordance，03k:65-67）。
      const chev = await page.evaluate(() => {
        const dialog = [...document.querySelectorAll("[role=dialog]")].pop();
        const rows = [...(dialog?.querySelectorAll("dl > div[role=button]") ?? [])];
        return rows.map((r) => ({
          label: r.querySelector("dt")?.textContent ?? "",
          chevron: r.querySelector("dd svg") !== null,
        }));
      });
      record(
        chev.length === 3 &&
          chev[0]?.label === "模型" &&
          chev[1]?.label === "权限" &&
          chev[2]?.label === "推理 effort" &&
          chev.every((r) => r.chevron),
        `模型/权限/effort 三行 role=button + chevron（got ${JSON.stringify(chev)}）`,
      );
      // 点模型行 → RuntimeConfigDialog 叠出（Radix 嵌套第二层 dialog，h2=字段名 + 选项行）。
      await page.locator("[role=dialog] dl > div[role=button]").first().click();
      await page.waitForTimeout(400);
      const cfg = await page.evaluate(() => {
        const dialogs = [...document.querySelectorAll("[role=dialog]")];
        const top = dialogs[dialogs.length - 1];
        if (!top) return null;
        return {
          layers: dialogs.length,
          h2: top.querySelector("h2")?.textContent ?? "",
          opts: [...top.querySelectorAll("button")].map((b) => ({
            text: b.textContent?.trim(),
            check: b.querySelector("svg") !== null,
          })),
        };
      });
      record(
        cfg !== null && cfg.layers === 2 && cfg.h2 === "模型",
        `点模型行 → 选择面叠出（dialog 层数 ${cfg?.layers}，h2="${cfg?.h2}"）`,
      );
      record(
        (cfg?.opts ?? []).some((o) => o.text === "Opus" && o.check),
        `选项行 Opus 带 check 选中态（got ${JSON.stringify(cfg?.opts)}）`,
      );
      // 点选即收起（切换无 spinner 状态机，值由 detail 刷新回填）→ 回到 info sheet 层。
      await page.locator("[role=dialog]").last().getByRole("button", { name: "Opus" }).click();
      await page.waitForTimeout(400);
      const after = await page.evaluate(
        () => [...document.querySelectorAll("[role=dialog]")].length,
      );
      record(after === 1, `点选后选择面收起（dialog 层数 ${after}）`);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // ── D 问题⑦⑧：插件页几何 + 溢出 ───────────────────────────────
    console.log("D. 插件页几何（09）");
    await page.goto(`${WEB_ORIGIN}/plugins`);
    await page.waitForTimeout(900);
    const pgeo = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      // 搜索框已从内联 utility 换 .psearch 单源（第十一轮复验跨页统一），选择器跟随。
      const search = document.querySelector(".psearch");
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
    const ticon = page.locator('button[aria-label="检视面板"]');
    // F4 问题⑬：检视 ticon 视觉盒 19×19（v1.4 批2 IA：单检视 ticon 替代三工具 ticon，
    // 热区 -inset-2 扩展在 ::after 不进布局盒）。
    const tgeo = await page.evaluate(() => {
      const icons = [...document.querySelectorAll("button.ticon")];
      const rects = icons.map((b) => b.getBoundingClientRect());
      return {
        count: icons.length,
        w: rects[0]?.width,
      };
    });
    if (record(tgeo.count === 1, `检视 ticon ×1（got ${tgeo.count}）`)) {
      record(
        tgeo.w !== null && Math.abs(tgeo.w - 19) < 1.5,
        `检视 ticon 视觉盒 19px（got ${tgeo.w}）`,
      );
    }
    // F1 问题⑨：聚焦 agent 的 chips 行在进文件工具后隐藏（此前只 gate 聚焦实例类型漏 tool）。
    // v1.4（03f）退役语义：chips 行整体删除（2026-09-28 真机反馈连 terminal tmux chip 一并删），
    // 问题⑨⑩的「chips 隐藏/恢复」不再存在——恒不渲染即为正确态。
    await ticon.click();
    await page.waitForSelector('[data-inspection-panel="open"]', { timeout: 5000 });
    await page.waitForTimeout(400);
    record((await page.locator(".chips").count()) === 0, "开面板后 chips 恒不渲染（问题⑨）");
    // F2 问题⑩：关面板（‹ 工作台）→ URL 无 tab 维度（panelOpen 内存态，不写回）。
    await page.locator('[data-inspection-panel="open"] .nav .back').click();
    await page.waitForTimeout(500);
    record(!page.url().includes("tab="), `关面板 URL 无 tab（got ${page.url()}）`);
    record((await page.locator(".chips").count()) === 0, "agent chips 行已退役（v1.4）");
    // F3 v1.4 批3（链接直达 03ab）：面板内点文件 = file 预览标签新增/激活——树点 src →
    // deep.ts，断言 file 标签「deep.ts」激活 + 叠层内 l3-file-preview（transient L3 旧体系退役）。
    await ticon.click();
    await page.waitForTimeout(500);
    await page
      .locator('[data-panel-tab-body="files"] button.frow', { hasText: "src" })
      .first()
      .click();
    await page.waitForTimeout(500);
    await page
      .locator('[data-panel-tab-body="files"] button.frow', { hasText: "deep.ts" })
      .first()
      .click();
    await page.waitForTimeout(700);
    const f3 = await page.evaluate(() => {
      const panel = document.querySelector('[data-inspection-panel="open"]');
      const deepTab = panel?.querySelector('[role="tab"][aria-label="deep.ts"]');
      const preview = panel?.querySelector(
        '[data-panel-tab-body="file:proj1/src/deep.ts"] [data-role="file-preview-pane"]',
      );
      return {
        hasTab: deepTab != null,
        selected: deepTab?.getAttribute("aria-selected") === "true",
        preview: preview != null,
        backLabel: panel?.querySelector(".nav .back")?.textContent?.trim() ?? "",
      };
    });
    record(f3.hasTab && f3.selected, `树点 deep.ts → file 标签激活（got ${JSON.stringify(f3)}）`);
    record(f3.preview, "file 标签叠层渲染 l3-file-preview");
    record(
      f3.backLabel === "工作台",
      `file 标签态面板 nav 仍为「工作台」（got "${f3.backLabel}"）`,
    );

    // ── G 第三轮：链接直达标签动线 + 历史浮层加载态（①）+ 下拉收起（③）──
    console.log("G. 第三轮（标签直达/加载态/下拉收起）");
    // G1 v1.4 批3：点回 files 标签 = 回树（内容保活：crumb 停在 src、deep.ts 标签不丢）。
    await page.locator('[data-inspection-panel="open"] [role="tab"][aria-label="文件"]').click();
    await page.waitForTimeout(500);
    const g1 = await page.evaluate(() => {
      const panel = document.querySelector('[data-inspection-panel="open"]');
      const filesTab = panel?.querySelector('[role="tab"][aria-label="文件"]');
      return {
        filesSelected: filesTab?.getAttribute("aria-selected") === "true",
        crumb: panel?.querySelector(".crumb")?.textContent ?? "",
        deepTabKept: panel?.querySelector('[role="tab"][aria-label="deep.ts"]') != null,
      };
    });
    record(g1.filesSelected, `点 files 标签回树（got ${JSON.stringify(g1)}）`);
    record(g1.crumb.includes("src"), `树保活 crumb 停在 src（got "${g1.crumb}"）`);
    record(g1.deepTabKept, "deep.ts file 标签保活不丢");

    // G2 问题⑭：git 变更行 → 面板内 diff（panelDiff 瞬态 L3）→ back = 「Git 检视」
    //（03r 原型）→ 点后回面板 Git 标签。
    await page.locator('button[aria-label="新建标签"]').click();
    await page.waitForTimeout(300);
    await page.getByRole("menuitem", { name: /Git/ }).click();
    await page.waitForTimeout(500);
    // 叠层保活（perf-review m1）后 files 面板 invisible 保活在 children——限定 Git 标签叠层。
    await page
      .locator('[data-panel-tab-body="git"] button.frow', { hasText: "deep.ts" })
      .first()
      .click();
    await page.waitForTimeout(700);
    const gitBack = await page.evaluate(() => {
      const panel = document.querySelector('[data-inspection-panel="open"]');
      return {
        back: panel?.querySelector(".nav .back")?.textContent?.trim() ?? "",
        title: panel?.querySelector(".nav h1")?.textContent?.trim() ?? "",
      };
    });
    record(
      gitBack.back === "Git 检视" && gitBack.title === "deep.ts",
      `git diff L3 back =「Git 检视」+ title = deep.ts（got ${JSON.stringify(gitBack)}）`,
    );
    await page.locator('[data-inspection-panel="open"] .nav .back').click();
    await page.waitForTimeout(500);
    const g2 = await page.evaluate(() => {
      const panel = document.querySelector('[data-inspection-panel="open"]');
      const on = panel?.querySelector('[role="tab"][aria-selected="true"]');
      return on?.getAttribute("aria-label") ?? null;
    });
    record(g2 === "Git", `git diff back 回面板 Git 标签（got ${g2}）`);

    // G3 问题①：历史 sheet 打开先见加载骨架（[role=status]）再见数据行。
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await page.waitForTimeout(900);
    // v1.5 批1：/projects/$key 直链即聚焦态（autoFocus 上次实例）——h1 内 AAA-running 是
    // ▾ 切换触发器，误点会开 Radix modal 菜单（外部 aria-hidden → ⋯ 移出 a11y tree）。
    await page.getByRole("button", { name: "更多操作" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("menuitem", { name: "会话历史" }).click();
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
      await page.getByRole("menuitem", { name: "会话历史" }).click();
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
    await page.locator('button[aria-label="检视面板"]').click();
    await page.waitForSelector('[data-inspection-panel="open"]', { timeout: 5000 });
    await page.locator('[role="tab"][aria-label="Git"]').click();
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
    await page.locator('[role="tab"][aria-label="文件"]').click();
    await page.waitForTimeout(500);
    // （面板 open 态：上一步已开面板，此处切 files 标签）
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
    // H6：行高基准 = tokens.json typography.line-height-ui 1.4（用户拍板方案 A）。
    // v2-primitives 裸字号类统一 var(--line-height-ui)；终端/代码区固定行高（.tterm 22px
    // 等 9 块）不参与，由 rg 机检保证未被覆盖。
    const h6 = await page.evaluate(() => {
      const cs = (sel, prop) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el)[prop] : null;
      };
      return {
        r1Fs: cs(".pcard .r1", "fontSize"),
        r1Lh: cs(".pcard .r1", "lineHeight"),
        d2Lh: cs(".pcard .d2", "lineHeight"),
        psectLh: cs(".psect", "lineHeight"),
      };
    });
    if (record(h6.r1Lh !== null, "pcard r1 渲染")) {
      record(h6.r1Fs === "14.5px", `r1 字号 14.5px（got ${h6.r1Fs}）`);
      record(h6.r1Lh === "20.3px", `r1 行高 1.4→20.3px（got ${h6.r1Lh}）`);
      record(h6.d2Lh === "16.1px", `d2 行高 1.4→16.1px（got ${h6.d2Lh}）`);
      record(h6.psectLh === "18.2px", `psect 行高 1.4→18.2px（got ${h6.psectLh}）`);
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
