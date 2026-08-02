// 探针：文件树三 bug 回归（PASS/FAIL 断言，入库版）。
// Bug 1: 文件树滚动容器可滚（actuallyScrolls=true，移动 + 桌面）——flex 高度链回归（frontend-notes §8）。
// Bug 2: 点行 ⋯ → 菜单开 → 点菜单外 → 不导航（移动；portal fiber 冒泡回归，§4 contains 守卫）。
// Bug 3: 桌面行右键开同一菜单（role=menu，ActionMenu 坐标触发）；源码无 MoreVertical 残留（图标统一 ⋯）。
// mock 30 行触发溢出；hook history.pushState 记录导航。密码自读不打印。
// 用法: node scripts/probe-files-tree-bugs.mjs [mobile|desktop|both]
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const which = process.argv[2] ?? "both";

let allPass = true;
function record(ok, _label) {
  if (!ok) allPass = false;
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
  // 根目录(rootBrowse):30 个假目录,够溢出移动视口 + 提供目录行进入项目。
  const rootDirs = Array.from({ length: 30 }, (_, i) => ({
    name: `dir-${String(i).padStart(2, "0")}`,
    path: `dir-${String(i).padStart(2, "0")}`,
    type: "directory",
  }));
  await page.route(new RegExp("/api/root/files$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: rootDirs, path: "" }),
    }),
  );
  // 项目内:30 个假文件,文件行(readOnly=false)有 ⋯ 菜单 + 右键,测 Bug 2/3。
  const projFiles = Array.from({ length: 30 }, (_, i) => ({
    name: `file-${String(i).padStart(2, "0")}.ts`,
    path: `file-${String(i).padStart(2, "0")}.ts`,
    type: "file",
  }));
  await page.route(/\/api\/projects\/dir-\d+\/files/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: projFiles, path: "" }),
    }),
  );
}

// Bug 1 几何:找 overflow-y-auto 滚动容器,测可滚性;失败时沿父链打印断点(便于诊断)。
async function measureScroll(page, label) {
  const m = await page.evaluate(() => {
    const scroll = Array.from(document.querySelectorAll("div")).find((el) => {
      const s = getComputedStyle(el);
      return (
        (s.overflowY === "auto" || s.overflowY === "scroll") &&
        el.className.includes("overflow-y-auto")
      );
    });
    if (!scroll) return { error: "滚动容器未找到" };
    const beforeTop = scroll.scrollTop;
    scroll.scrollTop = 80;
    const actuallyScrolls = scroll.scrollTop === 80;
    scroll.scrollTop = beforeTop;
    const chain = [];
    let el = scroll;
    for (let i = 0; i < 10 && el; i++) {
      const s = getComputedStyle(el);
      chain.push({
        tag: el.tagName,
        cls: (el.className || "").slice(0, 90),
        display: s.display,
        flexDirection: s.flexDirection,
        flex: s.flex,
        minHeight: s.minHeight,
        clientH: Math.round(el.getBoundingClientRect().height),
        scrollH: el.scrollHeight,
      });
      el = el.parentElement;
    }
    return {
      scrollH: scroll.scrollHeight,
      clientH: scroll.clientHeight,
      actuallyScrolls,
      chain,
    };
  });
  console.log(`\n[${label}] Bug 1 几何:`);
  if (m.error) {
    console.log(`  ✗ ${m.error}`);
    return record(false, `${label} Bug 1 滚动容器存在`);
  }
  console.log(
    `  滚动容器 scrollH=${m.scrollH} clientH=${m.clientH} actuallyScrolls=${m.actuallyScrolls}`,
  );
  const ok = m.actuallyScrolls === true;
  if (!ok) {
    console.log("  父链(滚动容器 → main),找「flex 系数但 display≠flex」断点:");
    for (const c of m.chain) {
      const flexGap =
        c.flex !== "0 1 auto" && !c.flex.includes("none") && c.display !== "flex"
          ? " ⚠️ flex 系数但 display≠flex(死属性)"
          : "";
      console.log(
        `    <${c.tag}> disp=${c.display} flexDir=${c.flexDirection} flex=${c.flex} minH=${c.minHeight} clientH=${c.clientH} scrollH=${c.scrollH}${flexGap}`,
      );
      console.log(`      cls: ${c.cls}`);
    }
  }
  console.log(`  ${ok ? "✓" : "✗"} 滚动容器 ${ok ? "可滚" : "不可滚(高度链断裂)"}`);
  return record(ok, `${label} Bug 1 文件树可滚动`);
}

// Bug 2 交互流:hook pushState → 点 ⋯ → 菜单开 → 点菜单外 → 断言不导航。
// 修复前:移动 Dialog sheet scrim dismiss 的 click 按 fiber 冒泡到行 onClick → 打开文件(§4)。
async function probeDotsClick(page, label) {
  await page.evaluate(() => {
    window.__navLog = [];
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...a) {
      window.__navLog.push({ kind: "push", url: a[2] });
      return origPush.apply(this, a);
    };
    history.replaceState = function (...a) {
      window.__navLog.push({ kind: "replace", url: a[2] });
      return origReplace.apply(this, a);
    };
  });
  const dots = page.locator('button[aria-label$="actions"]').first();
  if ((await dots.count()) === 0) {
    console.log(`[${label}] Bug 2: 文件行 ⋯ button 未找到(可能 readOnly 无菜单)`);
    return record(false, `${label} Bug 2 三点按钮存在`);
  }
  const urlBefore = page.url();
  await dots.click({ force: true });
  await page.waitForTimeout(250);
  const hasMenu = await page.evaluate(() => !!document.querySelector('[role="menu"]'));
  // 点菜单外(body 左上角,header 区域)关闭 → 看是否 navigate。
  const bodyBox = await page.evaluate(() => {
    const r = document.body.getBoundingClientRect();
    return { x: r.left + 5, y: r.top + 5 };
  });
  await page.mouse.click(bodyBox.x, bodyBox.y);
  await page.waitForTimeout(300);
  const navLog = await page.evaluate(() => window.__navLog);
  const urlAfter = page.url();
  const navigated = navLog.length > 0 || urlBefore !== urlAfter;
  console.log(`\n[${label}] Bug 2 交互流(点 ⋯ → 点菜单外):`);
  console.log(
    `  菜单开=${hasMenu} url: ${urlBefore} → ${urlAfter} navLog: ${JSON.stringify(navLog)}`,
  );
  const menuOk = record(hasMenu, `${label} Bug 2 三点打开菜单`);
  const noNav = record(!navigated, `${label} Bug 2 菜单外点击不导航`);
  console.log(
    `  ${hasMenu ? "✓" : "✗"} 三点打开菜单; ${navigated ? "✗ BUG 复现:菜单外点击触发导航" : "✓ 菜单外点击未导航"}`,
  );
  return menuOk && noNav;
}

// Bug 3 桌面右键:行上右键(避开 ⋯ 按钮)→ 断言同一 ActionMenu 菜单出现。
async function probeRightClick(page, label) {
  const rowTitle = page.locator("[data-list-row-title]").first();
  if ((await rowTitle.count()) === 0) {
    console.log(`[${label}] Bug 3: 文件行未找到`);
    return record(false, `${label} Bug 3 桌面行右键开菜单`);
  }
  const box = await rowTitle.boundingBox();
  // 右键行左中部(避开右侧 ⋯ 按钮区)。
  await page.mouse.click(box.x + 60, box.y + box.height / 2, { button: "right" });
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    menu: !!document.querySelector('[role="menu"]'),
    popper: !!document.querySelector("[data-radix-popper-content-wrapper]"),
  }));
  const opened = state.menu && state.popper;
  console.log(
    `[${label}] Bug 3 桌面右键: ${opened ? "✓ 行右键打开同一菜单" : "✗ 未打开(role=menu 缺失)"}`,
  );
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);
  return record(opened, `${label} Bug 3 桌面行右键开菜单`);
}

// Bug 3 图标统一静态检查:全 web/src 无 lucide MoreVertical 残留。
function assertNoMoreVertical() {
  const out = execSync(
    `grep -rn "MoreVertical" web/src --include="*.tsx" --include="*.ts" || true`,
    { encoding: "utf8" },
  ).trim();
  const ok = out.length === 0;
  console.log(
    `\n[静态] Bug 3 图标统一: ${ok ? "✓ 无 MoreVertical 残留(全 ⋯)" : `✗ 残留:\n${out}`}`,
  );
  return record(ok, "静态 MoreVertical 零残留");
}

async function runViewport(label, viewport, isMobile) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
    const page = await ctx.newPage();
    await setupMocks(page);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.getByLabel("Password").fill(await readRawPassword());
    await page.getByRole("button", { name: "Unlock console" }).click();
    await page.goto(`${WEB_ORIGIN}/files`);
    await page.waitForTimeout(800);

    console.log(`\n========== ${label} /files 根目录层(目录行,readOnly 无菜单) ==========`);
    await measureScroll(page, `${label} 根层`);

    // 进入项目(点第一个目录行)→ 文件行(readOnly=false)有 ⋯ 菜单 + 右键。
    await page
      .locator("[data-list-row-title]")
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(600);

    console.log(`\n========== ${label} test 项目内(文件行) ==========`);
    await measureScroll(page, `${label} 项目内`);
    await probeDotsClick(page, `${label} 文件行`);
    if (!isMobile) {
      await probeRightClick(page, label);
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  if (which === "mobile" || which === "both") {
    await runViewport("移动 390×844", { width: 390, height: 844 }, true);
  }
  if (which === "desktop" || which === "both") {
    await runViewport("桌面 1280×900", { width: 1280, height: 900 }, false);
  }
  assertNoMoreVertical();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
