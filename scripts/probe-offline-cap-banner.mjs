// 探针：离线提示横幅形态（2026-10-26 悬浮胶囊→全宽实底状态条返工批）。真链路：
// routeWebSocket 接管会话 WS（先转发让首连成功），消息渲染后中断页面侧连接（= 飞行
// 模式语义，非 mock 帧）→ 断言横幅 DOM 几何：全宽 / 实底（alpha=1）/ 上下边框 /
// 贴 composer 浮层顶缘 / 回底浮球让位不相交；恢复转发后横幅在淡出窗口内卸载、浮球
// 回落。跑两轮：移动 390（composer 浮层形态）+ 桌面 1280 直开（lg:static 形态）。
// ⚠️ 不能用「390 进页后 setViewportSize 切 1280」——跨 lg 断点切形态会触发既有
// React #310 崩溃（hooks 数量漂移，与本批无关，基线可复现；待单独立批修）。
// 用 remount 探针同款固定会话（PROBE_SESSION 可覆盖），只读不写、零数据残留。
//
// 密码由脚本自读，不进 agent 上下文。用法：bun scripts/probe-offline-cap-banner.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const sessionId = process.env.PROBE_SESSION ?? "agent_8edb4fb6fca3497d";

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  const suffix = detail ? `  (${detail})` : "";
  console.log(ok ? `PASS ${label}${suffix}` : `FAIL ${label}${suffix}`);
  if (ok) pass += 1;
  else fail += 1;
}

async function runRound(browser, label, viewport, isMobile) {
  console.log(`—— ${label} ——`);
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();

  // WS 接管（三态）：normal=全部转发（导航期首页/会话页可能各开一条 WS，句柄只绑最后
  // 一条——断线用）；offline=拒绝所有新连接（页面自动重连维持断线态）；online=放行
  // 恢复。closeWs() 只断页面侧（服务器无感）。
  let phase = "normal";
  let closeWs = null;
  await page.routeWebSocket(/\/api\//, (ws) => {
    if (phase === "offline") {
      ws.close();
      return;
    }
    ws.connectToServer();
    if (phase === "normal") {
      closeWs = () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    }
  });

  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(1500);
  // 探针 lang 坑（frontend-notes）：钉 zh，文案定位才稳定。
  await page.addInitScript(() => localStorage.setItem("lang", "zh"));

  await page.goto(
    `${WEB_ORIGIN}/projects/${encodeURIComponent(projectName)}/session/${encodeURIComponent(sessionId)}`,
  );
  // 等首连 + 回放渲染完成（composer 在场 + 内容窗口出现）。
  await page.waitForSelector("textarea", { timeout: 15000 });
  await page.waitForTimeout(2500);

  // 桌面布局同款类滚动容器有 2 个（侧面板 + 消息区），文档序第一个可能不可滚——
  // 交互一律打「可滚的那个」（scrollHeight > clientHeight）。
  const scrollToTopInScroller = () =>
    page.evaluate(() => {
      const els = [...document.querySelectorAll("main div.min-h-0.flex-1.overflow-y-auto")];
      const el = els.find((e) => e.scrollHeight > e.clientHeight) ?? els.at(-1);
      if (el) el.scrollTop = 0;
      return el?.clientWidth ?? 0;
    });
  const geo = () =>
    page.evaluate(() => {
      const cap = document.querySelector("div[role='status'].cap");
      const capRect = cap?.getBoundingClientRect();
      const capStyle = cap ? getComputedStyle(cap) : null;
      const fab = document.querySelector("button[aria-label='Scroll to bottom']");
      const fabRect = fab?.getBoundingClientRect();
      const composerFloat = document.querySelector("[data-composer-float]");
      const composerRect = composerFloat?.getBoundingClientRect();
      return {
        capExists: !!cap,
        capWidth: capRect?.width ?? 0,
        capBottom: capRect?.bottom ?? 0,
        capTop: capRect?.top ?? 0,
        capBg: capStyle?.backgroundColor ?? "",
        capBorderTop: capStyle?.borderTopWidth ?? "",
        capBorderBottom: capStyle?.borderBottomWidth ?? "",
        fabBottom: fabRect?.bottom ?? 0,
        composerTop: composerRect?.top ?? 0,
      };
    });

  // 向上滚出回底浮球：长消息气泡自带 max-h 内部滚动容器，wheel 的 hit-test 会命中
  // 气泡（实测）——改直接设 scroller.scrollTop（unpin 判定按 scrollTop 减小量，与
  // 输入来源无关），记录浮球原位。
  await scrollToTopInScroller();
  const fab = page.getByRole("button", { name: "Scroll to bottom" });
  await fab.waitFor({ state: "visible", timeout: 5000 });
  const before = await geo();
  check("① 断线前浮球在场且横幅不在（基线）", !before.capExists && before.fabBottom > 0);

  // 断线：页面侧 WS 关闭 + 拒绝重连 → connected=false → 横幅浮现。
  phase = "offline";
  closeWs?.();
  await page.waitForSelector("div[role='status'].cap", { timeout: 10000 });
  await page.waitForTimeout(450); // 浮球让位 transition（300ms）播完再采几何。

  const during = await geo();
  const scrollerWidth = await scrollToTopInScroller(); // 复用：取可滚 scroller 的宽度。
  check(
    "② 横幅全宽（= scroller 宽 ±2px）",
    Math.abs(during.capWidth - scrollerWidth) <= 2,
    `${during.capWidth.toFixed(1)} vs ${scrollerWidth}`,
  );
  check(
    "③ 实底不透明（bg-surface，alpha=1）",
    // Chromium 对不透明色返回 rgb() 形式（无 alpha 段），rgba(...,1) 同样算实底。
    /^rgb\(\d+, \d+, \d+\)$/.test(during.capBg) || /rgba\([^)]+, 1\)$/.test(during.capBg),
    during.capBg,
  );
  check(
    "④ 上下边框在（border-y 1px）",
    during.capBorderTop === "1px" && during.capBorderBottom === "1px",
    `${during.capBorderTop}/${during.capBorderBottom}`,
  );
  if (isMobile) {
    // 移动专属：横幅底缘贴 composer 浮层顶上方 ~6px（--composer-float-inset + 0.375rem）。
    // 桌面 composer 是流内布局（lg:static），横幅锚 scroller 底缘（= composer 顶），
    // 间隙语义不同不在此断言。
    check(
      "⑤ 贴 composer 上缘（间隙 ~6px ±4）",
      Math.abs(during.composerTop - during.capBottom - 6) <= 4,
      `gap=${(during.composerTop - during.capBottom).toFixed(1)}px`,
    );
  }
  // 让位：浮球在横幅上方不相交，且比断线前上移了。
  check(
    "⑥ 浮球让位（浮球底 ≤ 横幅顶，不相交）",
    during.fabBottom <= during.capTop + 1,
    `fabBottom=${during.fabBottom.toFixed(1)} capTop=${during.capTop.toFixed(1)}`,
  );
  check(
    "⑦ 浮球比原位上移",
    during.fabBottom < before.fabBottom - 10,
    `before=${before.fabBottom.toFixed(1)} after=${during.fabBottom.toFixed(1)}`,
  );

  // 恢复：放行重连 → 横幅在淡出窗口（200ms + 容差）内卸载。重连节奏由 adapter 退避
  // 决定，等待上限放宽；浮球回落 300ms 过渡后采样。
  phase = "online";
  await page.waitForFunction(() => !document.querySelector("div[role='status'].cap"), null, {
    timeout: 30000,
  });
  check("⑧ 重连后横幅卸载（淡出收场，内容零跳动）", true);
  await page.waitForTimeout(450);
  const after = await geo();
  check(
    "⑨ 浮球回落原位（±10px）",
    after.fabBottom > 0 && Math.abs(after.fabBottom - before.fabBottom) <= 10,
    `before=${before.fabBottom.toFixed(1)} after=${after.fabBottom.toFixed(1)}`,
  );

  await ctx.close();
  console.log("");
}

const browser = await chromium.launch();
try {
  await runRound(browser, "移动 390×844（composer 浮层）", { width: 390, height: 844 }, true);
  // 桌面直开 1280（lg:static composer）——覆盖 lg 让位常量（lg:bottom-[2.875rem]）。
  // 见头部注释：不能用 setViewportSize 从 390 切入（既有 #310 崩溃路径）。
  await runRound(browser, "桌面 1280×800（composer 流内）", { width: 1280, height: 800 }, false);
  console.log(`共 ${pass + fail} 项：${pass} pass / ${fail} fail`);
} finally {
  await browser.close();
}
if (fail > 0) process.exit(1);
