// 批 17/18 键盘 inset 探针：visualViewport → :root 全局变量（--kb-offset/--kb-active）→
// 编辑态面板 padding 缩链 + .aux 联动的接线正确性（批 17）+ focusin 终态补测与诊断浮层
// 接线（批 18）。
// 边界（重要）：Chromium 桌面对真实键盘 visualViewport 行为结构性失明（同 env() 教训）——
// 本探针用页内 defineProperty mock vv.height + dispatchEvent 驱动，只证「监听在挂、公式
// 正确、CSS 变量在写、消费端在跟随」；真实键盘行为必须真机验证（机制调研与证伪表见
// docs/research/claude-ios-keyboard-viewport.md；工程教训沉淀 frontend-notes「键盘 inset」条目）。
// PASS/FAIL 断言式；bun scripts/probe-keyboard-inset.mjs。
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const P = "batch17-demo";
const CONTENT = ["export function demo() {", "  return 1;", "}", ""].join("\n");

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function setup(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(json({ projectNames: [P], candidates: [] })),
  );
  await page.route(/\/api\/projects\/[^/]+\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/[^/]+\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/[^/]+$/, (r) =>
    r.fulfill(
      json({
        project: {
          name: P,
          path: `/tmp/${P}`,
          agentSessionCount: 0,
          terminalSessionCount: 0,
          gitBranch: "main",
        },
      }),
    ),
  );
  await page.route(/\/api\/projects\/[^/]+\/files(?:\?.*)?$/, (r) => {
    const path = new URL(r.request().url()).searchParams.get("path") ?? "";
    if (path !== "") return r.fulfill(json({ parentPath: "", entries: [] }));
    return r.fulfill(
      json({
        projectName: P,
        path: "",
        parentPath: null,
        entries: [{ name: "demo.ts", path: "demo.ts", type: "file" }],
      }),
    );
  });
  await page.route(/\/api\/projects\/[^/]+\/files\/preview(?:\?.*)?$/, (r) => {
    const path = new URL(r.request().url()).searchParams.get("path") ?? "";
    return r.fulfill(
      json({
        type: "text",
        projectName: P,
        path,
        name: path,
        content: CONTENT,
        mtimeMs: Date.now(),
      }),
    );
  });
}

async function login(page) {
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /登录|Sign in/ }).click();
  await page.waitForTimeout(700);
}

function clean(page) {
  return page.evaluate(() => {
    for (const k of [
      "workbenchPanelTabs",
      "workbenchPanelActive",
      "workbenchMobileProjectFilesPath",
      "workbenchMobileGlobalFilesPath",
      "workbenchRightCollapsed",
    ]) {
      localStorage.removeItem(k);
    }
  });
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    // 移动仿真上下文：hasTouch → pointer: coarse = true，observeKeyboardInset 的
    // 触屏 guard 自然通过（hook 挂载在 app 根，无需额外 mock matchMedia）。
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
    });
    const page = await ctx.newPage();
    // vv.height/offsetTop 是原型 getter，实例 defineProperty 覆盖成可改写 own property；
    // 初始值 = innerHeight（844）→ visible=false 基线，与真实无键盘态一致。
    await page.addInitScript(() => {
      const vv = window.visualViewport;
      Object.defineProperty(vv, "height", { value: window.innerHeight, configurable: true });
      Object.defineProperty(vv, "offsetTop", { value: 0, configurable: true });
    });
    await setup(page);
    await page.goto(`${ORIGIN}/projects/${P}`);
    await login(page);
    await clean(page);
    await page.reload();
    await page.waitForSelector('[data-inspection-panel="closed"]', {
      state: "attached",
      timeout: 10000,
    });

    // 到达文件编辑态（检视面板 → 文件行 → 编辑钮 → .aux 在场；batch16 同款路径）。
    await page.getByLabel("检视面板", { exact: true }).click();
    await page.waitForSelector('[data-inspection-panel="open"]', { timeout: 5000 });
    await page.waitForTimeout(700);
    await page.locator("button.frow", { hasText: "demo.ts" }).first().click();
    await page.getByRole("button", { name: "编辑", exact: true }).waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.locator(".aux").waitFor({ timeout: 10000 });

    const rootVars = (page) =>
      page.evaluate(() => ({
        offset: document.documentElement.style.getPropertyValue("--kb-offset"),
        active: document.documentElement.style.getPropertyValue("--kb-active"),
      }));

    console.log("== 基线（无键盘态） ==");
    const base = await rootVars(page);
    check("1a 挂载首调写基线 --kb-offset=0px", base.offset === "0px", base.offset);
    check("1b 挂载首调写基线 --kb-active=0", base.active === "0", base.active);
    const panePadBase = await page
      .locator('[data-role="file-preview-pane"]')
      .evaluate((el) => getComputedStyle(el).paddingBottom);
    check(
      "1c 编辑态容器 padding-bottom 消费 --kb-offset（基线 0px）",
      panePadBase === "0px",
      panePadBase,
    );

    console.log("== 键盘在场态（mock vv 缩小 477px） ==");
    // 改 own property 值 + dispatch：apply 走 rAF（与浏览器布局同帧），waitForFunction 轮询。
    await page.evaluate(() => {
      const vv = window.visualViewport;
      Object.defineProperty(vv, "height", { value: 367, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(
      () => document.documentElement.style.getPropertyValue("--kb-offset") === "477px",
      { timeout: 5000 },
    );
    const kb = await rootVars(page);
    check("2a 公式写入 --kb-offset=477px（844-367-0）", kb.offset === "477px", kb.offset);
    check("2b --kb-active=1（键盘在场系数）", kb.active === "1", kb.active);
    const panePad = await page
      .locator('[data-role="file-preview-pane"]')
      .evaluate((el) => getComputedStyle(el).paddingBottom);
    check("2c 编辑态容器 padding-bottom 跟随缩链（477px）", panePad === "477px", panePad);
    const auxH = await page.locator(".aux").evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { css: cs.height, box: +r.height.toFixed(1) };
    });
    // Chromium env(safe-area-inset-bottom)=0 → height 恒 40px（env 乘 (1-1) 的联动项数值为
    // 0，真机才有非零 env 可辨）。这里断联动表达式不破坏基线 40px。
    check(
      "2d .aux 高度联动后基线保持 40px（env=0 数学退化）",
      auxH.css === "40px" && auxH.box === 40,
      `css=${auxH.css} box=${auxH.box}`,
    );
    const auxRule = await page.evaluate(() => {
      // 规则可能嵌在 @layer/@media 块内，递归遍历；产物 minify 后逗号后无空格，宽松 includes。
      const scan = (rules) => {
        for (const rule of rules) {
          if (rule.selectorText === ".aux") return rule.cssText;
          if (rule.cssRules) {
            const hit = scan(rule.cssRules);
            if (hit) return hit;
          }
        }
        return "";
      };
      for (const sheet of document.styleSheets) {
        const hit = scan(sheet.cssRules);
        if (hit) return hit;
      }
      return "";
    });
    check(
      "2e 落盘 .aux 规则含 --kb-active 联动表达式",
      auxRule.includes("--kb-active") && auxRule.includes("safe-area-inset-bottom"),
      auxRule.slice(0, 80),
    );

    console.log("== scroll 事件路径（键盘动画收尾靠 scroll 保证 offset 准确） ==");
    // 双监听的另一半：不改 height、只改 offsetTop 后仅 dispatch scroll（不 dispatch resize），
    // 锁「scroll 监听 → schedule → 公式含 offsetTop → 写变量」这条线（code review 批 17 P2-2）。
    await page.evaluate(() => {
      const vv = window.visualViewport;
      Object.defineProperty(vv, "offsetTop", { value: 40, configurable: true });
      vv.dispatchEvent(new Event("scroll"));
    });
    await page.waitForFunction(
      () => document.documentElement.style.getPropertyValue("--kb-offset") === "437px",
      { timeout: 5000 },
    );
    check("2f scroll 触发重算且 offsetTop 参与公式（477→437px）", true, "477→437px");

    console.log("== 键盘收起恢复 ==");
    await page.evaluate(() => {
      const vv = window.visualViewport;
      Object.defineProperty(vv, "height", { value: window.innerHeight, configurable: true });
      Object.defineProperty(vv, "offsetTop", { value: 0, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(
      () =>
        document.documentElement.style.getPropertyValue("--kb-offset") === "0px" &&
        document.documentElement.style.getPropertyValue("--kb-active") === "0",
      { timeout: 5000 },
    );
    const restoredPad = await page
      .locator('[data-role="file-preview-pane"]')
      .evaluate((el) => getComputedStyle(el).paddingBottom);
    check("3a 收起后变量归零 + padding 回 0px", restoredPad === "0px", restoredPad);

    console.log("== 批 18：focusin 终态补测 + 诊断浮层 ==");
    // focusin 兜底路径：只改 vv 值、不 dispatch vv 事件、仅 dispatch focusin（focusin
    // 冒泡到 window，observeKeyboardInset 批 18 新增监听）→ measure 读当前 vv 值写回。
    // 锁「focus 监听 → schedule → apply → 变量」这条线。
    await page.evaluate(() => {
      const vv = window.visualViewport;
      Object.defineProperty(vv, "height", { value: 467, configurable: true });
      Object.defineProperty(vv, "offsetTop", { value: 40, configurable: true });
      window.dispatchEvent(new FocusEvent("focusin"));
    });
    await page.waitForFunction(
      () => document.documentElement.style.getPropertyValue("--kb-offset") === "337px",
      { timeout: 5000 },
    );
    const focusOffset = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--kb-offset"),
    );
    check("4a focusin 补测驱动重算（844-467-40=337px）", focusOffset === "337px", focusOffset);

    const dbg = await page.evaluate(() => {
      const el = document.querySelector("[data-kb-debug]");
      return {
        present: !!el,
        lastLine: el?.textContent.split("\n").pop() ?? "",
        transform: el?.style.transform ?? "",
      };
    });
    // 4a 的 focusin dispatch 是最后一个事件 → 最后一行即本次溯源（focusin 值 + root 读回）。
    check(
      "4b 诊断浮层在场且最后一行为本次 focusin 行（src 溯源在打点）",
      dbg.present && dbg.lastLine.includes("focusin") && dbg.lastLine.includes("root=337px"),
      dbg.lastLine,
    );
    check(
      "4c 浮层钉在 visual viewport 顶部（translateY 跟随 vv.offsetTop）",
      dbg.transform === "translateY(40px)",
      dbg.transform,
    );

    await ctx.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: PASS ${pass} / FAIL ${fail} — ${fail === 0 ? "ALL PASS" : "有 FAIL"}`);
  process.exit(fail === 0 ? 0 : 1);
})();
