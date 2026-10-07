// 探针：文件树三 bug 回归（PASS/FAIL 断言，入库版）。
// Bug 1: 文件树滚动容器可滚（actuallyScrolls=true，移动 + 桌面）——flex 高度链回归（frontend-notes §8）。
// Bug 2: 点行 ⋯ → 菜单开 → 点菜单外 → 不导航（移动；portal fiber 冒泡回归，§4 contains 守卫）。
// Bug 3: 桌面行右键开同一菜单（role=menu，ActionMenu 坐标触发）；源码无 MoreVertical 残留（图标统一 ⋯）。
// mock 30 行触发溢出；hook history.pushState 记录导航。密码自读不打印。
// 用法: node scripts/probe-files-tree-bugs.mjs [mobile|desktop|both]
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const which = process.argv[2] ?? "both";

let allPass = true;
function record(ok, _label) {
  if (!ok) allPass = false;
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
  // 根目录(rootBrowse):30 个假目录,够溢出移动视口 + 提供目录行进入项目。
  // 隔离真实环境 overview 数据（批次 3/4 后桌面 sidewin 项目总览会穿透真实 api，
  // 污染滚动容器查找与根层点击定位——IA 重排后补的 mock）。
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1"], candidates: [] }),
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
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
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
    // 限定 10m mainPage 主体（.psearch 所在 section）内的滚动容器——桌面还有 sidewin/
    // Inspector 等多个 overflow-y-auto 容器，全局第一个匹配会选错目标（IA 重排后教训）。
    // （全局文件页搜索框 = .psearch 单源；2026-09-29 反馈③ .sfield 页私档退役。）
    const wsearch = document.querySelector(".psearch");
    const scope = wsearch ? (wsearch.closest("section") ?? document) : document;
    const scroll = Array.from(scope.querySelectorAll("div")).find((el) => {
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

// Bug 2 交互流:hook pushState → 触发行菜单 → 菜单开 → 点菜单外 → 断言不导航。
// 修复前:移动 Dialog sheet scrim dismiss 的 click 按 fiber 冒泡到行 onClick → 打开文件(§4)。
// v1.5 批 10 适配（反馈⑦ .frow 同构）：行尾 ⋯ 钮退役（工具区同构——操作 = 长按/右键菜单），
// 触发按端分流：触屏 = 长按（useLongPressActions pointerdown 计时）、桌面 = 右键。
async function probeDotsClick(page, label, isMobile) {
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
  const row = page.locator(".frow .p").first();
  if ((await row.count()) === 0) {
    console.log(`[${label}] Bug 2: 文件行未找到`);
    return record(false, `${label} Bug 2 行菜单触发`);
  }
  const urlBefore = page.url();
  const box = await row.boundingBox();
  if (isMobile) {
    // 触屏长按（pointerType:touch pointerdown 合成 + 800ms > 阈值）——lp.bind 只响应 touch
    // pointerType，Playwright mouse 的 pointerType=mouse 不触发长按反而派发 click 导航。
    // 先例 = probe-inspector-row-menus ⑤。
    await row.dispatchEvent("pointerdown", {
      bubbles: true,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      pointerId: 7,
      pointerType: "touch",
    });
    await page.waitForTimeout(800);
  } else {
    await page.mouse.click(box.x + 60, box.y + box.height / 2, { button: "right" });
  }
  await page.waitForTimeout(250);
  const hasMenu = await page.evaluate(() => !!document.querySelector('[role="menu"]'));
  // 批次 6（§6.12j）：05e 菜单 5 项结构断言——文件行菜单项文本序 = 预览/重命名/移动/上传/删除。
  if (hasMenu) {
    const itemTexts = await page.evaluate(() =>
      [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map(
        (el) => el.textContent?.trim() ?? "",
      ),
    );
    // 05e 菜单五项序（批次 6）：预览/重命名/移动/上传/删除；中英双语（探针无 locale → en）
    // + 过滤移动 sheet 形态的 Cancel 项。
    const expect5 = [
      ["Open preview", "打开预览"],
      ["Rename", "重命名"],
      ["Move to…", "移动到…"],
      ["Upload File…", "上传文件…"],
      ["Delete", "删除"],
    ];
    const filtered = itemTexts.filter((s) => s !== "Cancel" && s !== "取消");
    const itemsOk =
      filtered.length === expect5.length &&
      expect5.every(([en, zh], i) => filtered[i] === en || filtered[i] === zh);
    console.log(
      `  菜单项(${filtered.length}/${itemTexts.length}): ${JSON.stringify(itemTexts)} → ${itemsOk ? "✓ 05e 五项序" : "✗ 不符 05e 五项序"}`,
    );
    record(itemsOk, `${label} 批次 6 文件行菜单 05e 五项（预览/重命名/移动/上传/删除）`);
  }
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

// Bug 3 桌面右键:行上右键 → 断言同一 ActionMenu 菜单出现（.frow 行，批 10 适配定位）。
async function probeRightClick(page, label) {
  const rowTitle = page.locator(".frow .p").first();
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

// 批 10 反馈⑨a:upcard data-state="uploading" CSS 扫动条真命中(选择器层错位防线——
// 曾把规则写成 .upcard .prog[data-state] 而 data-state 挂 .upcard 根,永不命中)。
async function assertUploadSweep(page) {
  const res = await page.evaluate(() => {
    const mk = (state) => {
      const host = document.createElement("div");
      host.className = "upcard";
      host.dataset.state = state;
      host.innerHTML = '<div class="prog"><i></i></div>';
      document.body.appendChild(host);
      const s = getComputedStyle(host.querySelector("i"));
      const out = { animationName: s.animationName, widthPct: s.width };
      host.remove();
      return out;
    };
    return { uploading: mk("uploading"), queued: mk("queued") };
  });
  console.log(`\n[静态] Bug 9a 上传扫动条: uploading=${JSON.stringify(res.uploading)}`);
  const ok = res.uploading.animationName === "upcard-sweep" && res.queued.animationName === "none";
  return record(ok, "静态 upcard uploading 扫动条命中 / queued 无动画");
}

// 批 11 反馈②同构断言:两侧文件树 = 同一份 FileTreeRows/FileCrumb 的 DOM 特征
// (.ic/.ar/.crumb .cico) + 贴边收敛(容器水平 padding 0,行自身承载 16px;桌面
// inspector 密度分档 14px——2026-09-29 真机拍板保留)。
async function probeIsomorphism() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setupMocks(page);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.getByLabel("Password").fill(await readAppPassword());
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForTimeout(800); // 等 session cookie 落定，未登录 goto 一律 401 回登录页
    // 读一侧树:行 DOM 特征 + 行左缘-容器左缘(贴边) + crumb 同构要素。
    const readSide = (scopeSel) =>
      page.evaluate((sel) => {
        const scope = sel ? document.querySelector(sel) : document;
        const row = scope ? scope.querySelector(".frow") : null;
        const crumb = scope ? scope.querySelector(".crumb") : null;
        if (!row) return { error: "no .frow" };
        let cont = row.parentElement;
        let container = null;
        while (cont) {
          const s = getComputedStyle(cont);
          if (s.overflowY === "auto" || s.overflowY === "scroll") {
            container = cont;
            break;
          }
          cont = cont.parentElement;
        }
        const rr = row.getBoundingClientRect();
        return {
          ic: !!row.querySelector(".ic"),
          ar: !!row.querySelector(".ar"),
          pad: getComputedStyle(row).paddingLeft,
          flush: container ? rr.left - container.getBoundingClientRect().left : null,
          crumbIcon: !!(crumb && crumb.querySelector(".cico")),
          crumbSeg: !!(crumb && crumb.querySelector(".cseg")),
        };
      }, scopeSel);

    // 工具侧(桌面右栏 inspector,深链直开 files 标签)。
    await page.goto(`${WEB_ORIGIN}/projects/dir-00?rightTab=files`);
    await page.waitForTimeout(800);
    const tool = await readSide("[data-desktop-inspector]");
    // 全局侧(/files 进项目文件夹)。
    await page.goto(`${WEB_ORIGIN}/files`);
    await page.waitForTimeout(800);
    await page
      .getByText("dir-00", { exact: true })
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(600);
    const glob = await readSide(null);

    console.log(
      `\n[批11] 同构: 工具侧=${JSON.stringify(tool)}\n          全局侧=${JSON.stringify(glob)}`,
    );
    const ok =
      !tool.error &&
      !glob.error &&
      tool.ic &&
      tool.ar &&
      tool.crumbIcon &&
      glob.ic &&
      glob.ar &&
      glob.crumbIcon &&
      glob.crumbSeg &&
      tool.pad === "14px" &&
      glob.pad === "16px" &&
      tool.flush !== null &&
      glob.flush !== null &&
      Math.abs(tool.flush) < 1.5 &&
      Math.abs(glob.flush) < 1.5;
    return record(ok, "批 11 双侧文件树同构(行 DOM/贴边 0/分档/crumb 图标)");
  } finally {
    await browser.close();
  }
}

async function runViewport(label, viewport, isMobile) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
    const page = await ctx.newPage();
    await setupMocks(page);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.getByLabel("Password").fill(await readAppPassword());
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.goto(`${WEB_ORIGIN}/files`);
    await page.waitForTimeout(800);

    console.log(`\n========== ${label} /files 根目录层(目录行,readOnly 无菜单) ==========`);
    await measureScroll(page, `${label} 根层`);
    await assertUploadSweep(page);

    // 进入项目(点第一个目录行)→ 文件行(readOnly=false)有 ⋯ 菜单 + 右键。
    await page
      .getByText("dir-00", { exact: true })
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(600);

    console.log(`\n========== ${label} test 项目内(文件行) ==========`);
    await measureScroll(page, `${label} 项目内`);
    await probeDotsClick(page, `${label} 文件行`, isMobile);
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
  if (which !== "mobile") {
    await probeIsomorphism();
  }
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
