// 探针：Provider 品牌图标全面接入（2026-11-02 品牌件批）。
// 断言面：① 桌面会话 tab（xs 裸标）品牌 svg 在场 + claude 品牌色 path fill（非 currentColor）
// + inline style 容器免疫（computed fill 非 none）；② 桌面左栏实例试点行（.dicon 容器）
// 三 provider 行：claude 彩色 / omp text-warning 染色 / svg 显式尺寸非 0×0（§15⑤ WebKit
// flex 收缩防线）；③ 桌面新建菜单三行品牌化（agent 行无 sparkles ShellIcon 残留 = 旧通用
// 图标退役负向证据）；④ 移动新建 sheet 三行品牌化 + tile 中性底。
// 密码由脚本自读，不进 agent 上下文。用法：bun scripts/probe-provider-icons.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const sessions = [
  {
    id: "agent_probe-icons-claude",
    projectName,
    provider: "claude",
    displayName: "Probe Icons Claude",
    status: "idle",
    permissionMode: "default",
    createdAt: new Date().toISOString(),
  },
  {
    id: "agent_probe-icons-codex",
    projectName,
    provider: "codex",
    displayName: "Probe Icons Codex",
    status: "idle",
    permissionMode: "default",
    createdAt: new Date().toISOString(),
  },
  {
    id: "agent_probe-icons-omp",
    projectName,
    provider: "omp",
    displayName: "Probe Icons Omp",
    status: "idle",
    createdAt: new Date().toISOString(),
  },
];

const results = [];
const check = (label, ok, detail = "") => {
  results.push(ok);
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` (${detail})` : ""}`);
};

async function setupMocks(page) {
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions }),
    }),
  );
  // 三个 detail 各 mock 一份（tab 面板按聚焦 id 查 detail）。
  for (const session of sessions) {
    await page.route(
      new RegExp(`/api/projects/${projectName}/agent-sessions/${session.id}$`),
      (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ session }),
        }),
    );
  }
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectNames: [projectName],
        candidates: sessions.map((s) => ({
          type: "agent",
          projectName,
          sessionId: s.id,
          displayName: s.displayName,
          status: s.status,
          provider: s.provider,
          createdAt: s.createdAt,
        })),
      }),
    }),
  );
  // 会话壳快照通道静默（useSessionShells 直写 ["overview"] 缓存——连真实服务会把本机真实
  // 项目实例灌进候选，盖掉上面的 overview mock，候选集断言随环境漂移）。
  await page.routeWebSocket(/\/api\/sessions\/stream/, () => {});
  // WS 全 mock（fake session 无真实 server）：open + pong 保持 connected。
  await page.routeWebSocket(/claude-stream/, (ws) => {
    ws.onMessage((data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
      } catch {
        /* 非 JSON 帧忽略 */
      }
    });
  });
}

// 品牌件几何 + 染色读取：rect 非 0×0（§15⑤）、span tone class、svg inline style、
// claude 品牌色 path fill、容器免疫（computed fill 非 none = inline style 压过容器规则）。
const readIcon = (page, provider) =>
  page.evaluate((p) => {
    const span = document.querySelector(`[data-provider-icon="${p}"]`);
    if (!span) return null;
    const svg = span.querySelector("svg");
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const coloredPath = [...svg.querySelectorAll("path")].find((el) => {
      const f = el.getAttribute("fill");
      return f && f !== "currentColor";
    });
    return {
      spanClass: span.getAttribute("class") ?? "",
      svgStyle: svg.getAttribute("style") ?? "",
      w: rect.width,
      h: rect.height,
      pathFill: coloredPath ? coloredPath.getAttribute("fill") : null,
      computedFill: getComputedStyle(svg).fill,
      pathCount: svg.querySelectorAll("path").length,
    };
  }, provider);

// ── 前置：CSS 落盘三道闸（改 web 包内文件的硬闸前置）。
const css = await verifyCssFlushed({ origin: WEB_ORIGIN });
if (!css.pass) {
  console.error(css.details.join("\n"));
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await ctx.newPage();
  await setupMocks(page);
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByLabel("访问密码").waitFor({ state: "detached", timeout: 15000 });

  // ── Part 1：桌面会话 tab（xs 裸标，detail route tabstrip）。
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/agent-sessions/${sessions[0].id}/claude`);
  await page.locator("[data-composer-float] textarea").first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.waitForTimeout(200);
  const tabIcon = await readIcon(page, "claude");
  check(
    "Part1 会话 tab：claude 品牌 svg 在场 + 显式尺寸",
    tabIcon && tabIcon.w > 0 && tabIcon.h > 0,
    tabIcon ? `w=${tabIcon.w.toFixed(1)} h=${tabIcon.h.toFixed(1)}` : "span 缺失",
  );
  check(
    "Part1 会话 tab：claude 品牌色 path fill（非 currentColor）+ inline 防御",
    tabIcon && tabIcon.pathFill === "#D97757" && tabIcon.svgStyle.includes("stroke:none"),
    tabIcon ? `fill=${tabIcon.pathFill} computed=${tabIcon.computedFill}` : "span 缺失",
  );

  // ── Part 2：桌面左栏实例试点行（.dicon 容器，三 provider 行）。
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
  await page.waitForTimeout(400);
  for (const s of sessions) {
    const icon = await readIcon(page, s.provider);
    check(
      `Part2 左栏 ${s.provider} 行：品牌 svg 在场 + 非 0×0`,
      icon && icon.w > 0 && icon.h > 0,
      icon
        ? `w=${icon.w.toFixed(1)} h=${icon.h.toFixed(1)} computedFill=${icon.computedFill}`
        : "行缺失",
    );
  }
  const ompIcon = await readIcon(page, "omp");
  check(
    "Part2 omp：text-warning 染色 + 容器免疫（computed fill 非 none）",
    ompIcon &&
      ompIcon.spanClass.includes("text-warning") &&
      ompIcon.computedFill !== "none" &&
      ompIcon.pathCount >= 1,
    ompIcon
      ? `class 含 warning=${ompIcon.spanClass.includes("text-warning")} computedFill=${ompIcon.computedFill} paths=${ompIcon.pathCount}`
      : "行缺失",
  );

  // ── Part 3：桌面新建菜单（createSessionMenuItems 三行品牌化；agent 行无 sparkles 残留）。
  // Radix 锚定弹层 menuitem click 有「outside of viewport」引擎误判前科（§26）——
  // 用 dispatchEvent 语义等价 onSelect。
  const newButton = page.getByRole("button", { name: /新建|new/i }).first();
  await newButton.click();
  await page.waitForTimeout(300);
  const menuState = await page.evaluate(() => {
    // 只查菜单作用域：页面常驻左栏实例行也有 data-provider-icon，全局选择器会假绿。
    const providers = ["claude", "codex", "omp"].map((p) =>
      Boolean(document.querySelector(`[role="menuitem"] [data-provider-icon="${p}"]`)),
    );
    // 四行菜单 = 三 provider 品牌件 + 终端 ShellIcon：data-shell-icon 计数必须恰为 1
    //（>1 = agent 行还有通用图标残留；0 = 终端行丢图标）。
    const shellIconRows = document.querySelectorAll('[role="menuitem"] [data-shell-icon]').length;
    return { providers, shellIconRows };
  });
  check(
    "Part3 新建菜单：claude/codex/omp 三行品牌 svg 在场（菜单作用域）",
    menuState.providers.every(Boolean),
    `在场=${menuState.providers.join(",")}`,
  );
  check(
    "Part3 新建菜单：仅终端行保留 ShellIcon（agent 行无通用图标残留）",
    menuState.shellIconRows === 1,
    `data-shell-icon=${menuState.shellIconRows}`,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await ctx.close();

  // ── Part 4：移动新建 sheet（tile 中性底 + 三行品牌化）。
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    isMobile: true,
    hasTouch: true,
  });
  const mpage = await mctx.newPage();
  await setupMocks(mpage);
  await mpage.goto(`${WEB_ORIGIN}/`);
  await mpage.getByLabel("访问密码").fill(await readAppPassword());
  await mpage.getByRole("button", { name: "登录" }).click();
  await mpage.getByLabel("访问密码").waitFor({ state: "detached", timeout: 15000 });
  await mpage.goto(`${WEB_ORIGIN}/projects/${projectName}`);
  await mpage.waitForTimeout(400);
  // ＋ 新建实例入口在 ▾ 实例切换菜单钉底行（03j sheet 入口）。标题 trigger = aria-label
  // 含「切换实例」；menuitem click 有 §26 引擎误判前科 → dispatchEvent（语义等价 onSelect）。
  await mpage
    .getByRole("button", { name: /切换实例/ })
    .first()
    .click();
  await mpage.getByRole("menuitem", { name: /新建实例/ }).dispatchEvent("click");
  await mpage
    .locator(".tile [data-provider-icon]")
    .first()
    .waitFor({ state: "visible", timeout: 8000 });
  const sheetRows = await mpage.evaluate(() => {
    const rows = [...document.querySelectorAll(".tile")].filter((el) =>
      el.querySelector("[data-provider-icon]"),
    );
    return rows.map((tile) => ({
      provider: tile.querySelector("[data-provider-icon]")?.getAttribute("data-provider-icon"),
      tileClass: tile.getAttribute("class") ?? "",
      svgRect: (() => {
        const r = tile.querySelector("svg")?.getBoundingClientRect();
        return r ? `${r.width.toFixed(1)}x${r.height.toFixed(1)}` : "0x0";
      })(),
      spanClass: tile.querySelector("[data-provider-icon]")?.getAttribute("class") ?? "",
    }));
  });
  const providersInSheet = sheetRows.map((r) => r.provider).sort();
  check(
    "Part4 移动新建 sheet：claude/codex/omp 三行品牌 svg",
    JSON.stringify(providersInSheet) === JSON.stringify(["claude", "codex", "omp"]) &&
      sheetRows.every((r) => !r.svgRect.startsWith("0x0")),
    sheetRows.map((r) => `${r.provider}:${r.svgRect}`).join(" "),
  );
  check(
    "Part4 移动新建 sheet：tile 中性底（无 tint 色，bg-ink-2/10）",
    sheetRows.every((r) => r.tileClass.includes("bg-ink-2/10") && !r.tileClass.includes("tint")),
    sheetRows.map((r) => r.tileClass).join(" | "),
  );
  const ompRow = sheetRows.find((r) => r.provider === "omp");
  check(
    "Part4 移动新建 sheet：omp text-warning 染色",
    Boolean(ompRow && ompRow.spanClass.includes("text-warning")),
    ompRow ? ompRow.spanClass : "行缺失",
  );

  await mctx.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} 断言通过`);
process.exit(failed > 0 ? 1 : 0);
