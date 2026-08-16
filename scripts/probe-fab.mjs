// 探针：移动新建入口 header 右上角（2026-08-16 FAB 全迁 header）+ 上传 picker 时序
//（风险点 C）+ 桌面 lg:hidden + 底部 nav 胶囊无 FAB 让位。
// 断言：
//  1. 全局总览（/）：header 右上角「新建项目」+ icon 按钮渲染（header 行内、x 靠右）→ 点击开
//     ProjectSetupPanel Dialog；全页无 fixed 悬浮按钮（FAB 已删）。
//  2. 项目工作台 drawer 顶部行右上角「新建」按钮（按段切换）：文件段 → 点开底部 sheet →
//     点「上传」→ filechooser 触发（Radix Dialog menuitem onSelect 同步链保持用户激活，风险点 C）。
//  3. 桌面（lg: 1280px）：移动 icon 按钮 display:none（max-lg:flex）；桌面 header「+ 新建」
//     文字按钮仍可见。
//  4. 底部 nav 胶囊（三视口）：无 FAB 让位（w-fit 内容宽、居中、/ ↔ /files 零跳变、label
//     无截断）——FAB 删除后 group-has-[.mobile-fab] 让位 CSS 已清理，capsule 恒为 base 态。
// 密码自读不打印。用法：bun scripts/probe-fab.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

async function setupMocks(page) {
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  // 项目内文件：让 FilesPanel 非 rootListing（readOnly=false）+ 非空。
  const projFiles = Array.from({ length: 5 }, (_, i) => ({
    name: `file-${i}.ts`,
    path: `file-${i}.ts`,
    type: "file",
  }));
  await page.route(new RegExp(`/api/projects/${projectName}/files`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: projFiles, path: "" }),
    }),
  );
}

// 找 header 新建 icon 按钮（aria-label 匹配，2026-08-16 起 header 右上角，替代旧 FAB）。
// 返回几何 + 是否在视口内 + display。regex 匹配 i18n 两语 aria-label。
async function findCreateButton(page, ariaRegex) {
  return await page.evaluate((pattern) => {
    const re = new RegExp(pattern);
    const btns = Array.from(document.querySelectorAll("button[aria-label]"));
    const btn = btns.find((b) => re.test(b.getAttribute("aria-label") ?? ""));
    if (!btn) return null;
    const s = getComputedStyle(btn);
    const r = btn.getBoundingClientRect();
    const header = btn.closest("header");
    const hr = header?.getBoundingClientRect() ?? null;
    return {
      ariaLabel: btn.getAttribute("aria-label"),
      display: s.display,
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
      inHeader: hr !== null,
      headerRight: hr ? Math.round(hr.right) : null,
      viewportW: window.innerWidth,
      inViewport:
        r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1 && r.top >= -1,
    };
  }, ariaRegex);
}

// 全页扫 fixed 悬浮按钮（FAB 残留检测：FAB 删除后应为空）。
async function findFixedFloatButtons(page) {
  return await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .filter((b) => getComputedStyle(b).position === "fixed")
      .map((b) => b.getAttribute("aria-label") ?? b.className),
  );
}

// 读底部 nav 胶囊几何（center/width）+ 4 个 label 截断检测（nav span.truncate）。
async function readCapsule(page) {
  return await page.evaluate(() => {
    const navEl = document.querySelector("nav[aria-label]");
    const capsule = navEl?.querySelector("div.mx-auto");
    if (!capsule) return null;
    const r = capsule.getBoundingClientRect();
    const labels = Array.from(navEl.querySelectorAll("span.truncate")).map((el) => ({
      text: (el.textContent ?? "").trim(),
      truncated: el.scrollWidth > el.clientWidth + 1,
    }));
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      center: Math.round(r.left + r.width / 2),
      viewportW: window.innerWidth,
      labels,
    };
  });
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Unlock console" }).click();
}

async function runMobile() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);
    await page.waitForTimeout(700);

    console.log("\n===== 1. 全局总览（/）header 右上角「新建项目」=====");
    // aria-label：zh「创建或采用项目」/ en "Create or adopt Project"（home.createProjectAria）。
    const btn1 = await findCreateButton(page, "创建或采用项目|Create or adopt");
    if (!btn1) {
      record(false, "全局总览 header「新建项目」icon 按钮渲染");
    } else {
      console.log(`  按钮几何: ${JSON.stringify(btn1)}`);
      record(btn1.display !== "none", "按钮可见（非 display:none）");
      record(btn1.inHeader, "按钮在 header 行内（MobilePageHeader.actions）");
      record(
        btn1.headerRight !== null && btn1.x > btn1.viewportW * 0.7,
        `按钮靠右上角（x=${btn1.x} > 视口 70%=${Math.round(btn1.viewportW * 0.7)}）`,
      );
      record(btn1.inViewport, "按钮在视口内");
      record(
        btn1.width >= 36 && btn1.height >= 36,
        `触控目标 ≥36px（got ${btn1.width}×${btn1.height}）`,
      );
    }
    const fixed1 = await findFixedFloatButtons(page);
    record(fixed1.length === 0, `全页无 fixed 悬浮按钮（FAB 已删，got ${fixed1.length} 个）`);

    console.log("\n===== 2. header「新建项目」点击 → ProjectSetupPanel Dialog =====");
    const createBtn = page.locator(
      'button[aria-label*="创建或采用项目"], button[aria-label*="Create or adopt"]',
    );
    if ((await createBtn.count()) === 0) {
      record(false, "「新建项目」按钮存在（可点击）");
    } else {
      await createBtn.first().click();
      await page.waitForTimeout(450);
      const dialogOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
      record(dialogOpen, "点按钮打开 Dialog（useCreateProjectDialog openCreate）");
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(350);
    }

    console.log("\n===== 3. 项目工作台 drawer 顶部行文件段新建 + 上传时序（风险点 C）=====");
    await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
    await page.waitForTimeout(800);
    // 2026-08-17 起新建入口统一在 drawer 顶部行右上角（返回+项目名那行，按段切换）：drawer 默认
    // 展开（浏览态）；点「文件」段按钮 → activeSection=files → 顶部按钮 aria 变 files.createAria，
    // sheet = 新建文件夹/上传。FilesPanel 不再内嵌移动入口（聚焦态 tab 内容是查看语义）。
    await page
      .getByRole("button", { name: /^Files$|^文件$/ })
      .first()
      .click({ timeout: 5000 })
      .catch(async () => {
        await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll("button"));
          const t = els.find((el) => /^(Files|文件)$/.test((el.textContent ?? "").trim()));
          if (t) t.click();
        });
      });
    await page.waitForTimeout(800);

    // aria-label：zh「新建文件或文件夹」/ en "New file or folder"（files.createAria）——
    // drawer 顶部行右上角 ActionMenu trigger（文件段，按段切换后 aria 命中）。
    const filesBtn = await findCreateButton(page, "新建文件或文件夹|New file or folder");
    record(
      !!filesBtn,
      "drawer 顶部行文件段新建按钮渲染（按段切换，files 段 aria=files.createAria）",
    );
    if (filesBtn) {
      console.log(`  按钮几何: ${JSON.stringify(filesBtn)}`);
      const fixed3 = await findFixedFloatButtons(page);
      record(fixed3.length === 0, `Files tab 无 fixed 悬浮按钮（got ${fixed3.length} 个）`);
      // 上传时序：点 trigger → 底部 sheet → 点「上传」→ filechooser。
      const fileChooserPromise = page
        .waitForEvent("filechooser", { timeout: 5000 })
        .catch(() => null);
      const trigger = page.locator(
        'button[aria-label*="新建文件或文件夹"], button[aria-label*="New file or folder"]',
      );
      await trigger
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(450);
      const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
      record(opened, "点 header 新建按钮打开底部 sheet 菜单");
      await page
        .getByText(/^Upload$|^上传$/, { exact: true })
        .first()
        .click({ timeout: 3000 })
        .catch(async () => {
          await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('button, [role="menuitem"]'));
            const t = els.find((el) => /^(Upload|上传)$/.test((el.textContent ?? "").trim()));
            if (t) t.click();
          });
        });
      const fc = await fileChooserPromise;
      record(
        fc !== null,
        "上传 menuitem 触发原生 filechooser（用户激活上下文保持，风险点 C 通过）",
      );
      // FileChooser 触发即验证通过；picker 由 finally 中 browser.close() 清理（FileChooser 无 cancel API）。
    }

    console.log("\n===== 3b. drawer 页面段新建页面根（createRequest 信号触发 PagesPanel）=====");
    await page
      .getByRole("button", { name: /^Pages$|^页面$/ })
      .first()
      .click({ timeout: 5000 })
      .catch(async () => {
        await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll("button"));
          const t = els.find((el) => /^(Pages|页面)$/.test((el.textContent ?? "").trim()));
          if (t) t.click();
        });
      });
    await page.waitForTimeout(600);
    const pagesBtn = await findCreateButton(page, "添加页面根|Add pages root");
    record(
      !!pagesBtn,
      "drawer 顶部行页面段新建按钮渲染（按段切换，pages 段 aria=pages.createAria）",
    );
    if (pagesBtn) {
      const trigger = page.locator(
        'button[aria-label*="添加页面根"], button[aria-label*="Add pages root"]',
      );
      await trigger
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(450);
      // 点「添加根」→ createRequest 信号 → PagesPanel useEffect → PagesRootDialog。dialog 计数
      // 从 drawer 1 个增至 ≥2（drawer + PagesRootDialog）。
      const dialogs = await page.evaluate(
        () => document.querySelectorAll('[role="dialog"]').length,
      );
      record(dialogs >= 2, `点「添加根」打开 PagesRootDialog（dialog 数 ${dialogs} ≥ 2）`);
    }
  } finally {
    await browser.close();
  }
}

async function runDesktop() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);
    await page.waitForTimeout(700);
    console.log("\n===== 4. 桌面（lg: 1280px）移动按钮不渲染 + header 入口保留 =====");
    // 桌面命中桌面 header 按钮（GlobalProjectsOverview hidden lg:flex 行，同 aria-label）
    // 属预期——断言的是「MobilePageHeader.actions 移动按钮」不可见：h-9 w-9 纯 icon 方按钮
    //（无文本内容）。桌面视口下它应 display:none（max-lg:flex）。
    const mobileBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button[aria-label]")).filter((b) =>
        /创建或采用项目|Create or adopt/.test(b.getAttribute("aria-label") ?? ""),
      );
      // 纯 icon 按钮（textContent 空或仅空白）= 移动 MobilePageHeader.actions 的那个。
      const icon = btns.find((b) => (b.textContent ?? "").trim().length === 0);
      if (!icon) return null;
      return { display: getComputedStyle(icon).display };
    });
    const hidden = !mobileBtn || mobileBtn.display === "none";
    record(
      hidden,
      `桌面移动 icon 按钮 display:none（max-lg:flex）${
        mobileBtn ? `（got display=${mobileBtn.display}）` : "（未在 DOM）"
      }`,
    );
    // 桌面应保留 header「+ 新建项目」按钮（hidden lg:inline-flex）。
    const headerBtnVisible = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /createMenu|Create|新建/.test(b.textContent ?? ""),
      );
      if (!btn) return false;
      return getComputedStyle(btn).display !== "none";
    });
    record(headerBtnVisible, "桌面 header「+ 新建」按钮仍可见（hidden lg:inline-flex）");
  } finally {
    await browser.close();
  }
}

// 5. capsule 无 FAB 让位几何（2026-08-16 FAB 全删后）：所有页 capsule 恒为 base 态
//（w-fit 内容宽 + mx-auto 居中），/ ↔ /files 切换零跳变、label 无截断。
async function runCapsuleGeometry() {
  const viewports = [
    { w: 390, h: 844, name: "iPhone 14" },
    { w: 375, h: 812, name: "iPhone SE" },
    { w: 360, h: 740, name: "小 Android" },
  ];
  for (const vp of viewports) {
    const browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await setupMocks(page);
      await login(page);
      await page.waitForTimeout(700);

      console.log(`\n===== 5. capsule 无 FAB 让位（${vp.name} ${vp.w}×${vp.h}）=====`);
      const capHome = await readCapsule(page);
      if (!capHome) {
        record(false, `${vp.w}w /页 capsule 渲染`);
        continue;
      }
      console.log(`  /页 capsule: width=${capHome.width} center=${capHome.center}`);
      record(
        Math.abs(capHome.center - vp.w / 2) <= 1,
        `${vp.w}w /页 capsule 居中（center=${capHome.center} ≈ 视口中心 ${vp.w / 2}）`,
      );
      const truncated = capHome.labels.filter((l) => l.truncated);
      record(
        truncated.length === 0,
        `${vp.w}w /页 label 无截断（${capHome.labels.map((l) => l.text).join("/")}）`,
      );

      await page.goto(`${WEB_ORIGIN}/files`);
      await page.waitForTimeout(700);
      const capFiles = await readCapsule(page);
      if (!capFiles) {
        record(false, `${vp.w}w /files页 capsule 渲染`);
        continue;
      }
      console.log(`  /files页 capsule: width=${capFiles.width} center=${capFiles.center}`);
      record(
        Math.abs(capFiles.center - vp.w / 2) <= 1,
        `${vp.w}w /files页 capsule 居中（center=${capFiles.center}）`,
      );
      // 无 FAB 让位：两页 capsule 都是内容宽（w-fit），宽度随 label 内容而非 FAB 让位变化。
      record(
        capHome.center === capFiles.center,
        `${vp.w}w 切换 / ↔ /files capsule.center 恒定（${capHome.center} === ${capFiles.center}，零跳变）`,
      );
    } finally {
      await browser.close();
    }
  }
}

(async () => {
  await runMobile();
  await runDesktop();
  await runCapsuleGeometry();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
