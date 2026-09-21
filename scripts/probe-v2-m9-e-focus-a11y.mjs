// M9 批次 e 探针：键盘可达性 + 对比度（focus-visible 统一环 / .ar 对比度 / seg4 aria-controls）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）——1600×1000 桌面：
//   F. focus-visible 统一环 CSS 落盘（cssCodeSplit:false 单 css 文本含五类选择器规则）。
//   G. .ar 对比度修复：设置行「›」computed color = ink-2（批次 e 前 ink-3 双主题 <3:1）。
//   H. seg4 作用域分段：span aria-controls → #instance-scope-panel[role=tabpanel]。
//   I. 键盘 focus-visible 实测：Tab 激活键盘启发式后聚焦行类，matches(":focus-visible")
//      且 computed outline 2px solid（--c-primary）。
//
// mock 三铁律同族（形状对齐 shared / overview 完备 / approvals stream abort）。
// 用法：bun scripts/probe-v2-m9-e-focus-a11y.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

const AGENT_A_OV = {
  type: "agent",
  sessionId: "agent_m9e-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe Agent A",
  status: "running",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};
const TERM_T_OV = {
  type: "terminal",
  sessionId: "term_m9e-1",
  projectName: "proj1",
  displayName: "probe-term",
  status: "running",
  createdAt: "2026-07-26T02:00:00.000Z",
  updatedAt: "2026-07-26T02:00:00.000Z",
};
const AGENT_A_S = { ...AGENT_A_OV, id: "agent_m9e-1" };
const TERM_T_S = { ...TERM_T_OV, id: "term_m9e-1" };

let passCount = 0;
let failCount = 0;
function ok(cond, msg) {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${msg}`);
  } else {
    failCount++;
    console.error(`  ✗ ${msg}`);
  }
}

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectNames: ["proj1"],
        candidates: [AGENT_A_OV, TERM_T_OV],
      }),
    }),
  );
  await page.route(/\/api\/overview\/subtitles$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ subtitles: {} }),
    }),
  );
  await page.route(/\/api\/approvals$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ approvals: [] }),
    }),
  );
  // 铁律③：拒掉真实环境 approvals WS，防空快照竞速覆盖 REST mock。
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
  await page.route(/\/api\/projects\/proj1\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [AGENT_A_S] }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [TERM_T_S] }),
    }),
  );
  // 07m 设置页数据（SettingsRootView 只读展示）——G 段 .ar 断言需要可点设置行（带「›」）。
  await page.route(/\/api\/settings$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        settings: {
          runtimes: {
            claude: { presets: [], activePresetId: "", enable1mContext: false, effort: "medium" },
            pi: { presets: [], activePresetId: "", firecrawlApiKeyMasked: "" },
            acp: {},
          },
          skills: { sources: [] },
        },
      }),
    }),
  );
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
}

(async () => {
  const browser = await chromium.launch();
  try {
    console.log("Part 1: 1600×1000 桌面 → focus-visible / .ar 对比度 / seg4 aria-controls");
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "zh-CN",
    });
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);

    // ── F. focus-visible 统一环 CSS 落盘 ──
    const cssHref = await page.evaluate(() => {
      const link = document.querySelector('link[rel="stylesheet"]');
      return link instanceof HTMLLinkElement ? link.href : "";
    });
    const cssText = await page.evaluate(async (href) => await (await fetch(href)).text(), cssHref);
    ok(cssText.includes(".setrow:focus-visible"), "F1 CSS 落盘 .setrow:focus-visible");
    ok(cssText.includes(".logout:focus-visible"), "F2 CSS 落盘 .logout:focus-visible");
    ok(cssText.includes(".srow2:focus-visible"), "F3 CSS 落盘 .srow2:focus-visible");
    ok(
      cssText.includes(".footnav button:focus-visible"),
      "F4 CSS 落盘 .footnav button:focus-visible",
    );
    ok(cssText.includes(".seg4 span:focus-visible"), "F5 CSS 落盘 .seg4 span:focus-visible");

    // ── G. .ar 对比度（设置 mainPage 的可点设置行「›」） ──
    await page.goto(`${WEB_ORIGIN}/projects?leftMode=settings`);
    await page.waitForTimeout(1200);
    const arInfo = await page.evaluate(() => {
      const el = document.querySelector(".setrow .ar");
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { color: cs.color, text: el.textContent?.trim() };
    });
    ok(arInfo !== null, "G1 设置行「›」存在（.setrow .ar）");
    ok(
      arInfo !== null && ["rgb(142, 142, 147)", "rgb(152, 152, 159)"].includes(arInfo.color),
      `G2 .ar computed color = ink-2（浅 #8e8e93 / 深 #98989f，实际 ${arInfo?.color ?? "n/a"}）`,
    );

    // ── H. seg4 aria-controls / tabpanel ──
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await page.waitForTimeout(1200);
    const segInfo = await page.evaluate(() => {
      const span = document.querySelector('.seg4.mini span[aria-controls="instance-scope-panel"]');
      const panel = document.querySelector('#instance-scope-panel[role="tabpanel"]');
      return {
        spanOk: span !== null,
        panelOk: panel !== null,
        onCount: document.querySelectorAll(".seg4.mini span.on").length,
      };
    });
    ok(segInfo.spanOk, "H1 seg4 span aria-controls=instance-scope-panel");
    ok(segInfo.panelOk, "H2 tabpanel #instance-scope-panel[role=tabpanel] 存在");
    ok(segInfo.onCount === 1, "H3 seg4 默认单段 .on（默认「项目」段）");

    // ── I. 键盘 focus-visible 实测（seg4 span + setrow） ──
    const segSpan = page.locator(".seg4.mini span").first();
    await page.keyboard.press("Tab"); // 激活键盘交互启发式（后续编程 focus 判 focus-visible）
    await segSpan.focus();
    await page.waitForTimeout(120);
    const segFv = await segSpan.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        fv: el.matches(":focus-visible"),
        outline: `${cs.outlineWidth} ${cs.outlineStyle}`,
      };
    });
    ok(segFv.fv, "I1 seg4 span 键盘聚焦后 matches(:focus-visible)");
    ok(segFv.outline === "2px solid", `I2 outline 2px solid（实际 ${segFv.outline}）`);
    ok(
      await segSpan.evaluate((el) => getComputedStyle(el).outlineColor !== "rgba(0, 0, 0, 0)"),
      "I3 outline 色 = token primary（非透明）",
    );

    // setrow 同规则实测（回设置 mainPage）
    await page.goto(`${WEB_ORIGIN}/projects?leftMode=settings`);
    await page.waitForTimeout(1000);
    await page.keyboard.press("Tab");
    const row = page.locator("button.setrow").first();
    await row.focus();
    await page.waitForTimeout(120);
    const rowFv = await row.evaluate((el) => el.matches(":focus-visible"));
    ok(rowFv, "I4 .setrow 键盘聚焦后 matches(:focus-visible)");

    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n结果: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
})();
