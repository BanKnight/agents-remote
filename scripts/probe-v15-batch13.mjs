// 批 13 真机反馈第四轮探针：①右栏 mtime ②右栏 FAB ③crumb 对齐 ④segc 居中+源码 CodeMirror
// ⑤md 内链开 tab ⑦插件作用域分段。⑥分屏复制语义由 workbench-model.test.ts 单测覆盖。
// PASS/FAIL 断言式；bun scripts/probe-v15-batch13.mjs。
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = "http://127.0.0.1:43012";
const P = "proj1";
const LONG = "proj1-一个非常非常非常长的项目名称示例用来测试溢出行为";
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
const entries = [
  { name: "src", type: "directory", path: "src", mtimeMs: Date.now() },
  { name: "README.md", type: "file", path: "README.md", mtimeMs: Date.now() - 3600e3 },
];

async function setup(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(json({ projectNames: [P, LONG], candidates: [] })),
  );
  await page.route(new RegExp(`/api/projects/${P}/files\\?.*path=`), (r) =>
    r.fulfill(json({ parentPath: null, entries })),
  );
  await page.route(new RegExp(`/api/projects/${P}/files$`), (r) =>
    r.fulfill(json({ parentPath: null, entries })),
  );
  await page.route(new RegExp(`/api/projects/${P}/files/preview\\?.*path=docs`), (r) =>
    r.fulfill(
      json({
        type: "text",
        projectName: P,
        path: "docs/next.md",
        name: "next.md",
        size: 20,
        content: "# next\n\n下一页。\n",
        mtimeMs: Date.now(),
      }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${P}/files/preview\\?.*`), (r) =>
    r.fulfill(
      json({
        type: "text",
        projectName: P,
        path: "README.md",
        name: "README.md",
        size: 60,
        content: "# t\n\n内链 [next](docs/next.md) 与外链 [w](https://example.com)。\n",
        mtimeMs: Date.now(),
      }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${P}/git/diff$`), (r) =>
    r.fulfill(json({ repository: false, projectName: P, files: [] })),
  );
  await page.route(/\/api\/skills\/installed\?.*$/, (r) =>
    r.fulfill(
      json({
        skills: [{ name: "demo-skill", description: "演示技能", source: "", disabled: false }],
      }),
    ),
  );
  await page.route(/\/api\/skills\/updates\?.*$/, (r) => r.fulfill(json({ updates: [] })));
  await page.route(/\/api\/skills\/search\?.*$/, (r) => r.fulfill(json({ skills: [] })));
  await page.route(/\/api\/mcp(\?.*)?$/, (r) => r.fulfill(json({ servers: [] })));
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}
async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1500);
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

const browser = await chromium.launch();

// ── 桌面 1280：①②⑤⑦桌面 ──
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    locale: "zh-CN",
  });
  const page = await ctx.newPage();
  await setup(page);
  await page.goto(`${ORIGIN}/projects/${P}`);
  await login(page);
  await clean(page);
  await page.evaluate(() => localStorage.setItem("workbenchRightCollapsed", JSON.stringify(false)));
  await page.goto(`${ORIGIN}/projects/${P}`);
  await page.waitForSelector("[data-desktop-inspector]", { timeout: 10000 });
  await page.waitForTimeout(500);

  console.log("== ① 桌面右栏文件树 mtime ==");
  const tm = await page.evaluate(() => {
    const el = document.querySelector("[data-desktop-inspector] .frow .tm");
    if (!el) return null;
    return { display: getComputedStyle(el).display, text: el.textContent };
  });
  check(
    "1a .frow .tm 在场且可见",
    !!tm && tm.display !== "none",
    tm ? `display=${tm.display} text=${tm.text}` : "absent",
  );

  console.log("== ② 桌面右栏 FAB 统一 ==");
  const fab = await page.evaluate(() => {
    const host = document.querySelector("[data-desktop-inspector]");
    const fab = host?.querySelector(".fab");
    const plusBtns = [...(host?.querySelectorAll("button") ?? [])].filter(
      (b) => b.textContent?.trim() === "＋",
    );
    const chipRow = [...(host?.children ?? [])].find((d) => d.className?.includes?.("mx-4"));
    const plusInChip = chipRow
      ? [...chipRow.querySelectorAll("button")].some((b) => b.textContent?.trim() === "＋")
      : null;
    return { fab: !!fab, plusBtnCount: plusBtns.length, plusInChip };
  });
  check("2a 右栏 FAB 在场", fab.fab);
  check("2b toolChip 行无「＋」钮", fab.plusInChip === false, `plusInChip=${fab.plusInChip}`);

  console.log("== ⑤ md 内链开新 tab ==");
  await page
    .locator("[data-desktop-inspector] button.frow", { hasText: "README.md" })
    .first()
    .click();
  await page.waitForSelector(".tb", { timeout: 8000 });
  await page.waitForTimeout(600);
  const link = await page.evaluate(() => {
    const a = [...document.querySelectorAll('main a, [role="main"] a, body a')].find(
      (x) => x.getAttribute("href") === "docs/next.md",
    );
    return a ? { found: true } : { found: false };
  });
  check("5a 渲染态相对 .md 内链在场", link.found);
  const tabsBefore = await page.evaluate(() => document.querySelectorAll(".tb").length);
  if (link.found) {
    await page.locator('a[href="docs/next.md"]').first().click();
    await page.waitForTimeout(800);
  }
  const tabsAfter = await page.evaluate(() => ({
    n: document.querySelectorAll(".tb").length,
    hasNext: [...document.querySelectorAll(".tb")].some((t) => t.textContent?.includes("next.md")),
  }));
  check(
    "5b 点内链 file tab +1 且激活 next.md",
    tabsAfter.n === tabsBefore + 1 && tabsAfter.hasNext,
    `before=${tabsBefore} after=${tabsAfter.n} hasNext=${tabsAfter.hasNext}`,
  );

  console.log("== ⑦桌面 插件作用域分段 ==");
  // 7w 短项目名固定宽（design review P1-1：原型 09m seg4 = width:290px 固定，max-w 只是上限
  // ——短名下会缩到内容宽、两段不再对半分；修 = w-[290px]）。短名态断言宽度，长名态断言截断。
  await page.evaluate(
    (v) => localStorage.setItem("workbench.lastProjectKey", v),
    JSON.stringify(P),
  );
  await page.goto(`${ORIGIN}/plugins`);
  await page.waitForSelector(".segc:not(.mini)", { timeout: 10000 });
  await page.waitForTimeout(300);
  const shortSeg = await page.evaluate(() => {
    const r = document.querySelector(".segc:not(.mini)")?.getBoundingClientRect();
    return r ? +r.width.toFixed(1) : null;
  });
  check(
    "7w 短项目名 segc 固定宽 290",
    shortSeg !== null && Math.abs(shortSeg - 290) <= 2,
    `w=${shortSeg}`,
  );
  await page.evaluate(
    (v) => localStorage.setItem("workbench.lastProjectKey", v),
    JSON.stringify(LONG),
  );
  await page.goto(`${ORIGIN}/plugins`);
  await page.waitForSelector(".segc:not(.mini)", { timeout: 10000 });
  await page.waitForTimeout(300);
  const seg = await page.evaluate(() => {
    const s = document.querySelector(".segc:not(.mini)");
    const h1 = [...document.querySelectorAll("h1")].find((x) => x.textContent?.includes("插件"));
    const sr = s.getBoundingClientRect();
    const hr = h1?.getBoundingClientRect();
    const span = s.querySelectorAll(":scope > button")[1]?.querySelector("span");
    const caretSvg = s.querySelector("svg");
    return {
      sameRow: hr ? sr.y < hr.bottom - 4 && sr.y + sr.height > hr.y + 4 : null,
      nearRight: sr.right > window.innerWidth - 120,
      trunc: span ? span.scrollWidth > span.clientWidth : null,
      caretIsSvg: !!caretSvg,
      caretText: (s.querySelector(":scope > button:nth-child(2)")?.textContent ?? "").includes("▾"),
    };
  });
  check("7a segc 与标题同行（actions 槽）", seg.sameRow === true, `sameRow=${seg.sameRow}`);
  check("7a' segc 靠右（h1 推右）", seg.nearRight === true);
  check("7b 长项目名尾截断", seg.trunc === true);
  check("7c caret 为 Lucide svg", seg.caretIsSvg === true && seg.caretText === false);
  await ctx.close();
}

// ── 移动 390：③④⑦移动 ──
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  });
  const page = await ctx.newPage();
  await setup(page);
  await page.goto(`${ORIGIN}/projects/${P}`);
  await login(page);
  await clean(page);
  await page.goto(`${ORIGIN}/files`);
  await page.waitForSelector(".crumb", { timeout: 10000 });

  console.log("== ③ 全局文件页 crumb 对齐两侧 ==");
  const crumb = await page.evaluate(() => {
    const r = document.querySelector(".crumb")?.getBoundingClientRect();
    const p = document.querySelector(".psearch")?.getBoundingClientRect();
    return r && p
      ? {
          dx: +(r.x - p.x).toFixed(1),
          dr: +(p.right - r.right).toFixed(1),
          x: +r.x.toFixed(1),
          right: +r.right.toFixed(1),
        }
      : null;
  });
  check(
    "3a crumb 与 .psearch 左缘对齐",
    !!crumb && Math.abs(crumb.dx) <= 1.5,
    crumb ? `dx=${crumb.dx}` : "n/a",
  );
  check(
    "3b crumb 与 .psearch 右缘对齐",
    !!crumb && Math.abs(crumb.dr) <= 1.5,
    crumb ? `dr=${crumb.dr}` : "n/a",
  );

  console.log("== ④ 检视面板 file tab：toggle 居中 + 源码 CodeMirror ==");
  await page.goto(`${ORIGIN}/projects/${P}`);
  await page.waitForSelector('[data-inspection-panel="closed"]', {
    state: "attached",
    timeout: 10000,
  });
  await page.getByLabel("检视面板").click();
  await page.waitForSelector('[data-inspection-panel="open"]', { timeout: 5000 });
  await page.waitForTimeout(450);
  await page.locator("button.frow", { hasText: "README.md" }).first().click();
  await page.waitForSelector(".fmeta", { timeout: 8000 });
  await page.waitForTimeout(400);
  const center = await page.evaluate(() => {
    const activeBody = [...document.querySelectorAll("[data-panel-tab-body]")].find(
      (el) => getComputedStyle(el).visibility !== "hidden" && el.querySelector(".fmeta"),
    );
    if (!activeBody) return null;
    const fm = activeBody.querySelector(".fmeta").getBoundingClientRect();
    const sg = activeBody.querySelector(".fmeta .segc")?.getBoundingClientRect();
    return sg
      ? {
          off: +(sg.y + sg.height / 2 - (fm.y + fm.height / 2)).toFixed(1),
          sgH: +sg.height.toFixed(1),
        }
      : null;
  });
  check(
    "4a segc 在 fmeta 行内垂直居中",
    !!center && Math.abs(center.off) <= 1.5,
    center ? `offset=${center.off}px` : "n/a",
  );
  await page.locator(".segc.mini button", { hasText: "源码" }).click();
  await page.waitForSelector('[data-inspection-panel="open"] .cm-editor', { timeout: 8000 });
  const src = await page.evaluate(() => {
    const body = [...document.querySelectorAll("[data-panel-tab-body]")].find(
      (el) => getComputedStyle(el).visibility !== "hidden" && el.querySelector(".cm-editor"),
    );
    const cm = body?.querySelector(".cm-editor");
    return {
      cm: !!cm,
      lines: !!cm?.querySelector(".cm-gutters .cm-lineNumbers"),
      lnDom: !!body?.querySelector(".ln, .no"),
    };
  });
  check("4b 源码态 = CodeMirror（含行号 gutter）", src.cm && src.lines);
  check("4b' 手写行号 DOM 已退役", src.cm && !src.lnDom);

  console.log("== ⑦移动 插件页满宽段长名截断 ==");
  await page.evaluate(
    (v) => localStorage.setItem("workbench.lastProjectKey", v),
    JSON.stringify(LONG),
  );
  await page.goto(`${ORIGIN}/plugins`);
  await page.waitForSelector(".segc:not(.mini)", { timeout: 10000 });
  const mseg = await page.evaluate(() => {
    const s = document.querySelector(".segc:not(.mini)");
    const span = s.querySelectorAll(":scope > button")[1]?.querySelector("span");
    const r = s.getBoundingClientRect();
    return {
      trunc: span ? span.scrollWidth > span.clientWidth : null,
      w: +r.width.toFixed(1),
      x: +r.x.toFixed(1),
    };
  });
  check("7b' 移动满宽段长名截断生效", mseg.trunc === true, `w=${mseg.w} x=${mseg.x}`);
  await ctx.close();
}

await browser.close();
console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
