#!/usr/bin/env bun
// probe-pages-anchor-row.mjs — pages 行交互探针（2026-11-09 预览层批；2026-11-10
// standalone gate 批重排：预览层只在移动安装的 PWA 打开——standalone + 触屏（
// isMobileStandaloneDisplay），非移动 PWA 平台（桌面浏览器/桌面 Chrome PWA）点行放行
// 原生 target=_blank 新标签跳出浏览器（2026-11-10 用户拍板「桌面端跳出浏览器更合适」）。
//
// 单测验不到的面：真浏览器内行点击行为链——
//  普通浏览器段：行根是真链接（href/target/rel 正确）、左键点行 = 原生新标签（popup，
//    预览层不出现）、FAB「添加根」开 PagesRootDialog（pages tab 的 ＋）、行内操作按钮
//    点击不触发导航（actions 容器 preventDefault 防线）。
//  移动 PWA 段（mock navigator.standalone + 触屏 matchMedia）：点行开 app 内预览层（iframe
//    src 正确、不导航、不开新页）、地址栏点击编辑 → 导航 404 自然呈现 + 顶栏跟随、
//    iframe 内点站内链接地址跟随、关闭后重开回入口页、Ctrl+click 交浏览器原生开新页。
//  桌面 PWA 段（mock navigator.standalone、无触屏 mock）：点行放行原生新标签跳出浏览器，
//    预览层不出现——桌面 Chrome/Edge PWA 的 Chromium _blank 能正常开新标签。
// 跑法：bun scripts/probe-pages-anchor-row.mjs（dev api 43011 + web 43012 在跑）。
// 注意：右栏各 tab 面板 DOM 常驻 + hidden 切换，凡「查面板内元素」的断言必须限定在
// 具体面板容器内或按可见性过滤，否则会命中隐藏面板的残留 DOM；预览层关闭钮 aria-label
// =「关闭」（session.close）是全 app 通用文案，必须限定 [data-pages-preview] 作用域。
// 密码自读不打印。
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = "http://127.0.0.1:43012";
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("workbenchRightCollapsed", "false"));
  await page.goto(`${WEB_ORIGIN}/`);
  await page.locator("input[type='password']").fill(await readAppPassword());
  await page.locator("button[type='submit']").click();
  await page.waitForTimeout(600);
  await page.goto(`${WEB_ORIGIN}/projects/agents-remote?v=2`);
  await page.waitForSelector("nav.side", { timeout: 15000 });

  const aside = page.locator("main > div > aside").nth(1);
  await aside.getByRole("tab", { name: "页面" }).click();
  await page
    .waitForFunction(
      () => {
        const a = document.querySelectorAll("main > div > aside")[1];
        return a?.querySelector('[aria-label="页面静态根"] a') != null;
      },
      { timeout: 8000 },
    )
    .catch(() => {});

  // 1) 行根是真 <a>：href/target/rel 正确。
  const anchor = await page.evaluate(() => {
    const a = document.querySelectorAll("main > div > aside")[1];
    const el = a?.querySelector('[aria-label="页面静态根"] a');
    if (!(el instanceof HTMLAnchorElement)) return null;
    return {
      href: el.getAttribute("href"),
      target: el.getAttribute("target"),
      rel: el.getAttribute("rel"),
      cls: el.className,
    };
  });
  record(
    "row root is <a target=_blank rel=noopener>",
    anchor != null &&
      anchor.href === "/p/agents-remote/" &&
      anchor.target === "_blank" &&
      (anchor.rel ?? "").includes("noopener"),
    JSON.stringify(anchor),
  );

  // 2) 左键点击行（普通浏览器 = 非 standalone）→ 放行原生 target=_blank 新标签；
  //    预览层不出现、页面自身不导航（2026-11-10 用户拍板「其他平台跳转浏览器打开」）。
  //    race 5s 兜底（同 2e）：gate 回归成 preventDefault 时 popup 永不开 → 记 FAIL
  //    而非裸 TimeoutError 死亡（诊断质量）。
  const before = context.pages().length;
  const rowPopupPromise = context.waitForEvent("page");
  await page.locator('[aria-label="页面静态根"] a').first().click();
  const rowPopup = await Promise.race([
    rowPopupPromise,
    new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (rowPopup) await rowPopup.waitForLoadState();
  await page.waitForTimeout(400); // 预览层若有也应挂出（exit 桥 300ms 量级，宽限观察）
  const previewAfterRow = await page.evaluate(
    () => document.querySelector("[data-pages-preview]") != null,
  );
  record(
    "row click opens native new tab without preview",
    rowPopup != null &&
      rowPopup.url().includes("/p/agents-remote/") &&
      !previewAfterRow &&
      page.url().includes("/projects/agents-remote") &&
      context.pages().length === before + 1,
    `popup=${rowPopup ? rowPopup.url() : "none"} preview=${previewAfterRow} pages=${context.pages().length}`,
  );
  if (rowPopup) await rowPopup.close();

  // 2b) FAB「添加根」（pages tab 的 ＋，2026-11-10 FAB 扩展批）→ PagesRootDialog 在场。
  await page.locator('[data-desktop-inspector] button[aria-label="添加根"]').click();
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
  const fabDialogOpen = await page.evaluate(
    () => document.querySelectorAll('[role="dialog"]').length >= 1,
  );
  record("panel FAB opens add-root dialog", fabDialogOpen);
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 8000 });

  // 3) 行内编辑按钮点击 → 不导航、dialog 在场（actions preventDefault 防线）。
  const row = page.locator('[aria-label="页面静态根"] a').first();
  await row.hover();
  await row.locator("button").first().click();
  await page.waitForTimeout(400);
  const dialogOpen = await page.evaluate(() => document.querySelector("[role='dialog']") != null);
  const stillOnProject = page.url().includes("/projects/agents-remote");
  record(
    "row action button edits without navigating",
    dialogOpen && stillOnProject,
    `dialog=${dialogOpen} url=${page.url()}`,
  );
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 8000 });

  // ── 移动 PWA 段：mock navigator.standalone + 触屏 matchMedia（iPhone PWA 语义——
  //    gate = isMobileStandaloneDisplay = standalone + (hover:none)+(pointer:coarse)，
  //    addInitScript 对后续导航生效）→ 点行进 app 内预览层（唯一出路：同源链接开不了
  //    新窗口的平台硬限制）。matchMedia mock 用 defineProperty 覆盖 MediaQueryList.matches
  //    （getter 不可直接赋值）。
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const mql = orig(query);
      if (query === "(hover: none) and (pointer: coarse)") {
        Object.defineProperty(mql, "matches", { value: true, configurable: true });
      }
      return mql;
    };
  });
  await page.goto(`${WEB_ORIGIN}/projects/agents-remote?v=3`);
  await page.waitForSelector("nav.side", { timeout: 15000 });
  await page.locator("main > div > aside").nth(1).getByRole("tab", { name: "页面" }).click();
  await page.locator('[aria-label="页面静态根"] a').first().waitFor({ timeout: 8000 });

  // 2c) 点行 → 预览层在位（iframe src 正确、不导航、不开新页）。
  const beforeStandalone = context.pages().length;
  await page.locator('[aria-label="页面静态根"] a').first().click();
  const frame = page.locator("[data-pages-preview] iframe");
  await frame.waitFor({ timeout: 8000 });
  const frameSrc = await frame.getAttribute("src");
  const topbarUrl = await page.evaluate(
    () => document.querySelector("[data-pages-preview] button[title^='http']")?.textContent ?? "",
  );
  const origUrl = page.url();
  record(
    "standalone row click opens in-place preview layer",
    frameSrc === "/p/agents-remote/" &&
      topbarUrl.startsWith(`${WEB_ORIGIN}/p/agents-remote`) &&
      origUrl.includes("/projects/agents-remote") &&
      context.pages().length === beforeStandalone,
    `src=${frameSrc} topbar=${topbarUrl} url=${origUrl} pages=${context.pages().length}`,
  );

  // 2f) 地址栏编辑（2026-11-10 用户反馈「非 PWA 下可以自由输入地址」）：点只读地址 →
  //     input 在场 → 输入不存在路径回车 → iframe src 变 + 我们 serve 的 404 错误页
  //     自然呈现（不 clamp 路径的诚实语义）+ 顶栏跟随新路径（onLoad 同步）。
  await page.locator("[data-pages-preview] button[title^='http']").click();
  const addressInput = page.locator("[data-pages-preview] input[aria-label='站点地址']");
  await addressInput.waitFor({ timeout: 8000 });
  await addressInput.fill("/p/agents-remote/no-such-page.html");
  await addressInput.press("Enter");
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-pages-preview] iframe")
        ?.getAttribute("src")
        ?.includes("no-such-page.html") === true,
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-pages-preview] iframe")
        ?.contentDocument?.body?.textContent.includes("页面不存在") === true,
    { timeout: 8000 },
  );
  const topbar404 = await page.evaluate(
    () => document.querySelector("[data-pages-preview] button[title^='http']")?.textContent ?? "",
  );
  record(
    "address bar navigates and follows frame location",
    topbar404.includes("no-such-page.html"),
    `topbar=${topbar404}`,
  );

  // 2g) 地址跟随（iframe 内点站内链接 → 顶栏同步）：向 404 页注入相对链接并真点击
  //     （frameLocator 走原生 hit-test 导航链路）。
  await page.evaluate(() => {
    const doc = document.querySelector("[data-pages-preview] iframe")?.contentDocument;
    const a = doc?.createElement("a");
    if (!a || !doc) return;
    a.href = "deeper.html";
    a.textContent = "go-deeper";
    doc.body.appendChild(a);
  });
  await page.frameLocator("[data-pages-preview] iframe").locator("a").click();
  await page.waitForFunction(
    () =>
      (
        document.querySelector("[data-pages-preview] button[title^='http']")?.textContent ?? ""
      ).includes("deeper.html"),
    { timeout: 8000 },
  );
  record("address bar follows in-frame link navigation", true);

  // 2h) 同文档导航跟随——hash 锚点（不触发 iframe load，靠 load 时挂的 hashchange 监听）：
  //     注入锚点链接并真点击 → 顶栏 hash 跟随（2026-11-10 用户提醒「页面间跳转地址栏也要更新」）。
  await page.evaluate(() => {
    const doc = document.querySelector("[data-pages-preview] iframe")?.contentDocument;
    const a = doc?.createElement("a");
    if (!a || !doc) return;
    a.href = "#anchor-2h";
    a.textContent = "go-hash";
    doc.body.appendChild(a);
  });
  await page.frameLocator("[data-pages-preview] iframe").locator("a").last().click();
  await page.waitForFunction(
    () =>
      (
        document.querySelector("[data-pages-preview] button[title^='http']")?.textContent ?? ""
      ).includes("#anchor-2h"),
    { timeout: 8000 },
  );
  record("address bar follows in-frame hash navigation", true);

  // 2i) 同文档导航跟随——SPA pushState（不触发 load，靠 currententrychange）：注入按钮
  //     调 history.pushState → 顶栏路径跟随（Navigation API 单一事件源覆盖）。闭包里
  //     history 必须显式取 doc.defaultView——evaluate 的函数对象携带宿主 realm，裸
  //     history 会解析到宿主页（pushState 打错对象，iframe 顶栏自然不动）。
  await page.evaluate(() => {
    const doc = document.querySelector("[data-pages-preview] iframe")?.contentDocument;
    const win = doc?.defaultView;
    const b = doc?.createElement("button");
    if (!b || !doc || !win) return;
    b.id = "spa-push";
    b.textContent = "push-state";
    b.onclick = () => win.history.pushState(null, "", "/p/agents-remote/spa-view");
    doc.body.appendChild(b);
  });
  await page.frameLocator("[data-pages-preview] iframe").locator("#spa-push").click();
  await page.waitForFunction(
    () =>
      (
        document.querySelector("[data-pages-preview] button[title^='http']")?.textContent ?? ""
      ).includes("spa-view"),
    { timeout: 8000 },
  );
  record("address bar follows in-frame pushState navigation", true);

  // 2d) 关闭钮 → 预览层卸载（exit 动画 + 300ms 桥，detached 等待天然容忍时长）。
  await page.locator("[data-pages-preview] button[aria-label='关闭']").click();
  await page.waitForSelector("[data-pages-preview]", { state: "detached", timeout: 8000 });
  record(
    "close dismisses preview without navigation",
    page.url().includes("/projects/agents-remote"),
    `url=${page.url()}`,
  );

  // 2d2) 关闭后重开 → 回入口页（导航地址是预览层内部 state，关闭即弃——「浏览器
  //      新开标签」语义，不污染父级 previewing）。
  await page.locator('[aria-label="页面静态根"] a').first().click();
  await page.locator("[data-pages-preview] iframe").waitFor({ timeout: 8000 });
  const reopenSrc = await page.locator("[data-pages-preview] iframe").getAttribute("src");
  record("reopen returns to entry url", reopenSrc === "/p/agents-remote/", `src=${reopenSrc}`);
  await page.locator("[data-pages-preview] button[aria-label='关闭']").click();
  await page.waitForSelector("[data-pages-preview]", { state: "detached", timeout: 8000 });

  // 2e) Ctrl+click 行 → 修饰键守卫放行浏览器原生开新页，预览层不出现（桌面安装的
  //     Chrome PWA 同为 standalone 形态，守卫仍必要）。
  const ctrlPopupPromise = context.waitForEvent("page");
  await page
    .locator('[aria-label="页面静态根"] a')
    .first()
    .click({ modifiers: ["Control"] });
  const ctrlPopup = await Promise.race([
    ctrlPopupPromise,
    new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (ctrlPopup) await ctrlPopup.waitForLoadState();
  const previewAfterCtrl = await page.evaluate(
    () => document.querySelector("[data-pages-preview]") != null,
  );
  record(
    "ctrl+click opens native new page without preview",
    ctrlPopup != null && ctrlPopup.url().includes("/p/agents-remote/") && !previewAfterCtrl,
    `popup=${ctrlPopup ? ctrlPopup.url() : "none"} preview=${previewAfterCtrl}`,
  );
  if (ctrlPopup) await ctrlPopup.close();
  await context.close();

  // ── 段 3：桌面安装的 PWA（standalone 无触屏——Chromium context 默认 pointer:fine）
  //    点行放行原生 target=_blank 跳浏览器开新标签，预览层不出现（2026-11-10 用户拍板
  //    「桌面端跳出浏览器更合适」）。新 context：mock 集与移动 PWA 段互不污染。
  const desktopCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const dPage = await desktopCtx.newPage();
  await dPage.addInitScript(() => localStorage.setItem("workbenchRightCollapsed", "false"));
  await dPage.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      value: true,
      configurable: true,
    });
  });
  await dPage.goto(`${WEB_ORIGIN}/`);
  await dPage.locator("input[type='password']").fill(await readAppPassword());
  await dPage.locator("button[type='submit']").click();
  await dPage.waitForTimeout(600);
  await dPage.goto(`${WEB_ORIGIN}/projects/agents-remote?v=4`);
  await dPage.waitForSelector("nav.side", { timeout: 15000 });
  await dPage.locator("main > div > aside").nth(1).getByRole("tab", { name: "页面" }).click();
  await dPage.locator('[aria-label="页面静态根"] a').first().waitFor({ timeout: 8000 });
  const desktopBefore = desktopCtx.pages().length;
  const desktopPopupPromise = desktopCtx.waitForEvent("page");
  await dPage.locator('[aria-label="页面静态根"] a').first().click();
  const desktopPopup = await Promise.race([
    desktopPopupPromise,
    new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (desktopPopup) await desktopPopup.waitForLoadState();
  const desktopPreview = await dPage.evaluate(
    () => document.querySelector("[data-pages-preview]") != null,
  );
  record(
    "desktop PWA row click opens native new tab (no preview)",
    desktopPopup != null &&
      desktopPopup.url().includes("/p/agents-remote/") &&
      !desktopPreview &&
      desktopCtx.pages().length === desktopBefore + 1,
    `popup=${desktopPopup ? desktopPopup.url() : "none"} preview=${desktopPreview}`,
  );
  if (desktopPopup) await desktopPopup.close();
  await desktopCtx.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
