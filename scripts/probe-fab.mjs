// 探针：移动 FAB 渲染/定位 + 上传 picker 时序（风险点 C）+ 桌面 lg:hidden。
// 断言：
//  1. 全局总览 FAB（移动默认页）：position fixed / bottom>0 / right≈12 / size 56×56 / rounded-full / 在视口内。
//  2. 全局总览 FAB 点击 → ProjectSetupPanel Dialog 打开（直跳模式）。
//  3. 项目工作台 Files tab FAB：渲染（enablePreview=true, readOnly=false）；点 FAB→底部 sheet→点「上传」→
//     filechooser 触发（Radix Dialog menuitem onSelect 同步链保持用户激活，风险点 C）。
//  4. 桌面（lg: 1280px）：FAB display:none（lg:hidden，桌面保留 header 入口）。
// 密码自读不打印。用法：node scripts/probe-fab.mjs
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

async function readRawPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const cfg = path.join(os.homedir(), ".agents-remote", "config.toml");
  try {
    const txt = await readFile(cfg, "utf8");
    const m = txt.match(/^app_password\s*=\s*["']([^"']*)["']/m);
    if (m && m[1]) return m[1];
  } catch {}
  const pid = execSync(
    "ss -ltnp 2>/dev/null | grep ':43011' | grep -oP 'pid=\\K[0-9]+' | head -1",
    { encoding: "utf8" },
  ).trim();
  if (pid) {
    const env = await readFile(`/proc/${pid}/environ`, "utf8");
    const entry = env.split("\0").find((e) => e.startsWith("APP_PASSWORD="));
    if (entry) return entry.slice("APP_PASSWORD=".length);
  }
  throw new Error("password not found");
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

// 找 FAB：position fixed + className 含 size-14（MobileFab 底座）。返回几何 + 是否在视口内。
async function findFab(page) {
  return await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const fab = btns.find((b) => {
      const s = getComputedStyle(b);
      return s.position === "fixed" && b.className.includes("size-14");
    });
    if (!fab) return null;
    const s = getComputedStyle(fab);
    const r = fab.getBoundingClientRect();
    const navEl = document.querySelector("nav[aria-label]");
    const capsule = navEl?.querySelector("div.mx-auto");
    return {
      position: s.position,
      bottom: Math.round(parseFloat(s.bottom)),
      left: Math.round(r.left),
      right: Math.round(parseFloat(s.right)),
      zIndex: s.zIndex,
      width: Math.round(r.width),
      height: Math.round(r.height),
      borderRadius: s.borderRadius,
      display: s.display,
      ariaLabel: fab.getAttribute("aria-label"),
      capsuleRight: capsule ? Math.round(capsule.getBoundingClientRect().right) : null,
      inViewport:
        r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1 && r.top >= -1,
    };
  });
}

// 读底部 nav 胶囊几何（center/width/right）+ 4 个 label 截断检测（nav span.truncate）。
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
  await page.getByLabel("Password").fill(await readRawPassword());
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

    console.log("\n===== 1. 全局总览 FAB（移动默认页，直跳模式）=====");
    const fab1 = await findFab(page);
    if (!fab1) {
      record(false, "全局总览 FAB 渲染");
    } else {
      console.log(`  FAB 几何: ${JSON.stringify(fab1)}`);
      record(fab1.position === "fixed", `position=fixed（got ${fab1.position}）`);
      // FAB 落 nav 避让带：bottom=safe-area（playwright 无 safe-area=0；真机=34），不再浮 nav 上方压内容。
      record(fab1.bottom >= 0, `bottom=${fab1.bottom}=safe-area（落 nav 带）`);
      record(fab1.right > 0 && fab1.right < 30, `right=${fab1.right}≈12`);
      // nav 胶囊条经 group-has-[.mobile-fab]:max-w-[13rem] 自身收窄 + mx-auto 居中（2026-08-04 改版，
      // 撤销旧 pr-[4.5rem] 左推）：capsule 中心恒定居中、宽度随 FAB 收窄，右沿不与 FAB 重叠。
      // 详细几何见 runCapsuleGeometry（三视口 + 无 FAB 对比 + 切换零跳变）。
      record(
        fab1.capsuleRight !== null && fab1.capsuleRight <= fab1.left,
        `nav 让位不重叠（capsule.right=${fab1.capsuleRight} <= fab.left=${fab1.left}）`,
      );
      record(
        fab1.width === 56 && fab1.height === 56,
        `size 56×56（got ${fab1.width}×${fab1.height}）`,
      );
      // Tailwind v4 rounded-full = calc(infinity*1px)，浏览器 computed 成 ~3.35e7px
      //（>> 元素尺寸即视觉圆形，非旧 v3 的 9999px）。
      const radiusPx1 = parseFloat(fab1.borderRadius);
      record(
        Number.isFinite(radiusPx1) && radiusPx1 > fab1.width,
        `rounded-full（got ${fab1.borderRadius}，radius > width=${fab1.width} 即圆形）`,
      );
      record(fab1.inViewport, "FAB 在视口内不超出");
      // FAB 全在 nav 避让带内（navSpace ≥ 56），不凸入内容滚动区 = 用户避让策略核心目标。
      const navSpace = await page.evaluate(() => {
        const main = document.querySelector("main");
        return main
          ? parseFloat(getComputedStyle(main).getPropertyValue("--shell-mobile-bottom-nav-space"))
          : NaN;
      });
      record(navSpace >= 56, `FAB 不压内容（navSpace=${navSpace} ≥ FAB 高 56）`);
      record(
        /adopt Project|新建项目|Create or adopt/.test(fab1.ariaLabel ?? ""),
        `aria-label 直跳（got "${fab1.ariaLabel}"）`,
      );
    }

    console.log("\n===== 2. 全局总览 FAB 点击 → ProjectSetupPanel Dialog =====");
    await page.locator("button.size-14").first().click();
    await page.waitForTimeout(450);
    const dialogOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    record(dialogOpen, "点 FAB 打开 Dialog（直跳 onClick=setSetupOpen(true)）");
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(350);

    console.log("\n===== 3. 项目工作台 Files tab FAB + 上传时序（风险点 C）=====");
    await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
    await page.waitForTimeout(800);
    // 切 Files tab（MobileTabHeader，label Files/文件）。
    await page
      .getByRole("tab", { name: /^Files$|^文件$/ })
      .or(page.getByText(/^Files$|^文件$/, { exact: true }).first())
      .first()
      .click({ timeout: 5000 })
      .catch(async () => {
        await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('[role="tab"], button'));
          const t = els.find((el) => /^(Files|文件)$/.test((el.textContent ?? "").trim()));
          if (t) t.click();
        });
      });
    await page.waitForTimeout(800);

    const fab2 = await findFab(page);
    record(!!fab2, "Files tab FAB 渲染（enablePreview=true, readOnly=false）");
    if (fab2) {
      console.log(`  FAB 几何: ${JSON.stringify(fab2)}`);
      // 上传时序：点 FAB → 底部 sheet → 点「上传」→ filechooser。
      const fileChooserPromise = page
        .waitForEvent("filechooser", { timeout: 5000 })
        .catch(() => null);
      await page.locator("button.size-14").first().click();
      await page.waitForTimeout(450);
      const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
      record(opened, "点 Files FAB 打开底部 sheet 菜单");
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
    console.log("\n===== 4. 桌面（lg: 1280px）FAB 不渲染 =====");
    const fab = await findFab(page);
    const hidden = !fab || fab.display === "none";
    record(
      hidden,
      `桌面 FAB display:none（lg:hidden，桌面保留 header 入口）${
        fab ? `（got display=${fab.display}）` : "（FAB 未在 DOM）"
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

// 5. capsule 居中收窄几何（2026-08-04 nav 让位策略改版：pr 左推 → 自身收窄居中）。
// 有 FAB 页（/）三视口 capsule 收窄居中 + 不重叠 + label 无截断；无 FAB 页（/files）撑满居中；
// 切换 / ↔ /files capsule.center 恒定（零跳变——本次核心价值）。
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

      console.log(`\n===== 5. capsule 居中收窄（${vp.name} ${vp.w}×${vp.h}）=====`);
      // / 页（有 FAB）：capsule 收窄居中。
      const capFab = await readCapsule(page);
      const fab = await findFab(page);
      if (!capFab || !fab) {
        record(false, `${vp.w}w /页 capsule/FAB 渲染（cap=${!!capFab} fab=${!!fab}）`);
        continue;
      }
      console.log(
        `  /页 capsule: width=${capFab.width} center=${capFab.center} right=${capFab.right}; FAB.left=${fab.left}`,
      );
      record(
        Math.abs(capFab.center - vp.w / 2) <= 1,
        `${vp.w}w /页 capsule 居中（center=${capFab.center} ≈ 视口中心 ${vp.w / 2}，不左推——核心）`,
      );
      record(
        capFab.right <= fab.left - 4,
        `${vp.w}w /页 capsule 不重叠 FAB（right=${capFab.right} ≤ FAB.left=${fab.left} − 4）`,
      );
      record(capFab.width <= 254, `${vp.w}w /页 capsule 收窄（width=${capFab.width}，上限 254）`);
      const truncated = capFab.labels.filter((l) => l.truncated);
      record(
        truncated.length === 0,
        `${vp.w}w /页 4 label 无截断（${capFab.labels.map((l) => l.text).join("/")}）`,
      );

      // /files 页（无 FAB）：capsule 撑满居中。
      await page.goto(`${WEB_ORIGIN}/files`);
      await page.waitForTimeout(700);
      const capNoFab = await readCapsule(page);
      const fabNoFab = await findFab(page);
      if (!capNoFab) {
        record(false, `${vp.w}w /files页 capsule 渲染`);
        continue;
      }
      console.log(
        `  /files页 capsule: width=${capNoFab.width} center=${capNoFab.center}; FAB=${!!fabNoFab}`,
      );
      record(!fabNoFab, `${vp.w}w /files页 无 FAB（capsule 不需让位）`);
      record(
        capNoFab.width > capFab.width + 50,
        `${vp.w}w /files页 capsule 撑满（width=${capNoFab.width} > /页 收窄 ${capFab.width}）`,
      );
      record(
        Math.abs(capNoFab.center - vp.w / 2) <= 1,
        `${vp.w}w /files页 capsule 居中（center=${capNoFab.center}）`,
      );
      // 切换零跳变：/ 与 /files capsule.center 相等（同视口，核心断言）。
      record(
        capFab.center === capNoFab.center,
        `${vp.w}w 切换 / ↔ /files capsule.center 恒定（${capFab.center} === ${capNoFab.center}，零跳变——核心）`,
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
