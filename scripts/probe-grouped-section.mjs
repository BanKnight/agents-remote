// 探针：全局总览融合视图手风琴（问题 2 + 2026-08-06 手风琴化）——项目标题行折叠/展开 + › 进项目 + ⋯ 删除。
//
// 覆盖（替代原 grouped/grid 双视图 + carousel/ViewSwitcher 断言）：
//   1. 标题行 = projectNames 数（含空项目）；有实例行 = [▾/▸ 折叠 chevron + 📁 项目名 整体 button 折叠/展开
//      （min-h-11 ≥44px 热区，aria-expanded）][› 进项目独立按钮][⋯ 删除]；空项目行主区非按钮仍可进/可删。
//   2. 实例区 = InstanceGrid 单列连续（display:grid + 卡片同列）；无 section 圆角边框容器。
//   3. 无 carousel snap 容器（snap-x 不存在）；无 ViewSwitcher（role=group 视图切换不存在）。
//   4. 空项目只名行无实例区；有实例项目行下有卡片（含 subtitle 第二行 + 非首卡 topSeparator inset）。
//   5. 手风琴：tap 折叠 toggle → 卡 0（折叠 chevron ▸）→ 再 tap → 卡 3（展开 chevron ▾）。
//   6. localStorage 记忆：折叠后 reload → 仍折叠（0 卡）。
//   7. › 进项目导航 /projects/$key。
//   8. 移动端 GlobalProjectsOverview create header 行 display:none（零残留空条/分割线）；桌面 display:flex。
//   9. 间距几何（用户反馈「项目间距过大、间距不统一」硬数据）：名行↔卡片 gap、项目间 gap、root 内边距。
// 桌面 1280×900 + 移动 390×844 两视口。密码自读（config.toml），不打印。DOM 几何（getBoundingClientRect），不用 vision。
// 用法：bun scripts/probe-grouped-section.mjs
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

// 融合视图 mock：2 项目（A 3 实例 + EMPTY 空项目）→ 2 标题行，A 行下 3 卡、EMPTY 行只名行。
const PROJECT_A = "probe-merge-a";
const PROJECT_EMPTY = "probe-merge-empty";

// aria-label（en-US 默认 locale）；enter 按钮两种语言都匹配以免疫 locale。
const ENTER_SELECTOR = 'button[aria-label="Enter project"], button[aria-label="进入项目"]';

function candidate(projectName, sessionId, displayName, type, provider) {
  return {
    type,
    projectName,
    sessionId,
    displayName,
    status: "idle",
    provider: type === "agent" ? provider : undefined,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    subtitle: "probe subtitle",
  };
}

const OVERVIEW = {
  projectNames: [PROJECT_A, PROJECT_EMPTY],
  candidates: [
    candidate(PROJECT_A, "agent_aaaaaaaaaaaaaaaa1", "Claude A1", "agent", "claude"),
    candidate(PROJECT_A, "agent_aaaaaaaaaaaaaaaa2", "Claude A2", "agent", "claude"),
    candidate(PROJECT_A, "terminal_bbbbbbbbbbbbbb1", "Terminal B1", "terminal"),
  ],
};

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
      body: JSON.stringify(OVERVIEW),
    }),
  );
  // overview 第二阶段：subtitle 走独立 subtitles 端点 patch 进卡片第二行（candidate.subtitle 字段已不承载）。
  const subtitles = Object.fromEntries(
    OVERVIEW.candidates.map((c) => [c.sessionId, "probe subtitle"]),
  );
  await page.route(new RegExp("/api/overview/subtitles"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ subtitles }),
    }),
  );
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readRawPassword());
  await page.getByRole("button", { name: "Unlock console" }).click();
}

async function newPage(browser, mobile) {
  const ctx = mobile
    ? await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      })
    : await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return await ctx.newPage();
}

// 读取全部 section：标题行结构 + 实例区 InstanceGrid + 卡片信息 + 间距几何。
// 只统计 GroupedProjectsList 的项目段（名行含 › 进项目按钮 button[aria-label]）——桌面三栏外壳可能有
// 其它裸 `<section>`（如主工作区），须过滤，否则项目段数虚高。
async function readSections(page, enterSelector) {
  return await page.evaluate((enterSel) => {
    const sections = Array.from(document.querySelectorAll("section"));
    return sections.map((section) => {
      const nameRow = section.firstElementChild;
      // › 进项目独立按钮（有实例行 + 空项目行都有）。
      const enterBtn = nameRow?.querySelector(enterSel);
      // 折叠 toggle（仅 hasCards 行有）：min-h-11 热区 button。
      const foldBtn = nameRow?.querySelector("button[class*='min-h-11']");
      const nameSpan = (foldBtn ?? nameRow)?.querySelector(
        "span[class*='text-base'][class*='font-semibold']",
      );
      const hasIcon = !!nameRow?.querySelector("svg");
      // 折叠 chevron path：expanded `M4 6l4 4 4-4`（▾ 下）/ collapsed `M6 4l4 4-4 4`（▸ 右）。
      const foldChevrons = foldBtn
        ? Array.from(foldBtn.querySelectorAll("path")).map((p) => p.getAttribute("d"))
        : [];
      const hasEnterChevron = enterBtn
        ? Array.from(enterBtn.querySelectorAll("path")).some(
            (p) => p.getAttribute("d") === "M6 4l4 4-4 4",
          )
        : false;
      // ⋯ 操作按钮 = nameRow 内带 aria-label 的 button 减去 › 进项目。
      const menuBtnCount = nameRow
        ? nameRow.querySelectorAll("button[aria-label]").length - (enterBtn ? 1 : 0)
        : 0;
      // InstanceGrid = section 内 display:grid 容器（INSTANCE_GRID_STYLE 1fr 单列）；
      // 容器 children 即卡片（单列 grid 无其它子节点；勿用 .group 类判卡——桌面挂 hover-capable
      // 变体卡片可能不带 group 类，而移动带，两视口不一致）。
      const grid = Array.from(section.querySelectorAll("div")).find(
        (d) => getComputedStyle(d).display === "grid",
      );
      const cards = grid ? Array.from(grid.children) : [];
      // group 段判定：名行含 › 进项目按钮。非 group 段（外壳裸 section）isGroup=false。
      const isGroup = !!enterBtn;
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          right: Math.round(r.right),
          height: Math.round(r.height),
        };
      };
      const nameRowRect = rect(nameRow);
      const gridRect = rect(grid);
      return {
        isGroup,
        projectName: nameSpan?.textContent ?? null,
        hasIcon,
        hasFoldToggle: !!foldBtn,
        foldChevrons,
        hasEnterChevron,
        menuBtnCount,
        cardCount: cards.length,
        cardLefts: cards.map((c) => Math.round(c.getBoundingClientRect().left)),
        // subtitle 第二行 = 卡片内非 flex 的 text-xs text-on-surface-muted div（meta 行是 flex）。
        subtitles: cards.map((c) => {
          const sub = Array.from(c.querySelectorAll("div")).find(
            (d) =>
              d.classList.contains("truncate") &&
              d.classList.contains("text-on-surface-muted") &&
              !d.classList.contains("flex"),
          );
          return sub ? (sub.textContent ?? "").trim() : null;
        }),
        // 非首卡 topSeparator（absolute left-15 h-px）。
        topSeparatorCount: cards.filter(
          (c) =>
            c.querySelector("[class*='left-15']") &&
            getComputedStyle(c.querySelector("[class*='left-15']")).position === "absolute",
        ).length,
        nameRowRect,
        gridRect,
        sectionTop: Math.round(section.getBoundingClientRect().top),
        sectionBottom: Math.round(section.getBoundingClientRect().bottom),
      };
    });
  }, enterSelector);
}

async function runViewport(mobile) {
  const browser = await chromium.launch();
  try {
    const label = mobile ? "移动" : "桌面";
    const page = await newPage(browser, mobile);
    await setupMocks(page);
    await login(page);
    await page.waitForTimeout(800);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.waitForTimeout(1000);

    console.log(
      `\n===== 融合视图手风琴（${label}）：折叠/展开 + › 进项目 + 移动 header 清理 =====`,
    );

    // ── 结构：2 标题行（含空项目），A 行折叠 toggle + › + ⋯，EMPTY 主区非按钮仍可进/可删 ──
    const allSections = await readSections(page, ENTER_SELECTOR);
    const sections = allSections.filter((s) => s.isGroup);
    if (allSections.length !== sections.length) {
      console.log(
        `  (过滤 ${allSections.length - sections.length} 个外壳裸 section，非 GroupedProjectsList 项目段)`,
      );
    }
    record(sections.length === 2, `标题行数 = 2（含空项目，got ${sections.length}）`);
    const byName = Object.fromEntries(sections.map((s) => [s.projectName, s]));
    record(
      !!byName[PROJECT_A] && !!byName[PROJECT_EMPTY],
      `标题行含 ${PROJECT_A} 与 ${PROJECT_EMPTY}`,
    );
    const a = byName[PROJECT_A];
    const empty = byName[PROJECT_EMPTY];

    // A（有实例）：行主按钮 = 折叠 toggle（min-h-11），默认展开 chevron ▾
    record(a.hasFoldToggle, `[${PROJECT_A}] 有折叠 toggle 按钮（min-h-11 热区）`);
    record(
      a.foldChevrons.includes("M4 6l4 4 4-4"),
      `[${PROJECT_A}] 折叠 chevron = ▾ 下（展开，got ${JSON.stringify(a.foldChevrons)}）`,
    );
    record(a.hasEnterChevron, `[${PROJECT_A}] 行有独立 › 进项目按钮`);
    record(a.menuBtnCount >= 1, `[${PROJECT_A}] 行有 ⋯ 删除按钮`);
    record(
      a.nameRowRect?.height >= 44,
      `[${PROJECT_A}] 行高 ≥44px（got ${a.nameRowRect?.height}px，触屏热区）`,
    );
    record(a.hasIcon, `[${PROJECT_A}] 行有 project 图标`);

    // EMPTY（空项目）：主区非按钮（无折叠 toggle、无折叠 chevron），仍可进/可删
    record(!empty.hasFoldToggle, `[${PROJECT_EMPTY}] 空项目无折叠 toggle（主区非按钮）`);
    record(empty.hasEnterChevron, `[${PROJECT_EMPTY}] 空项目仍有 › 进项目按钮`);
    record(empty.menuBtnCount >= 1, `[${PROJECT_EMPTY}] 空项目仍有 ⋯ 删除按钮`);
    record(
      empty.nameRowRect?.height >= 44,
      `[${PROJECT_EMPTY}] 行高 ≥44px（got ${empty.nameRowRect?.height}px，触屏热区）`,
    );
    record(empty.hasIcon, `[${PROJECT_EMPTY}] 行有 project 图标`);

    // ── 移动端 header 残留清理：create 按钮所在 header 行（两种 locale 都匹配）──
    const headerDisplay = await page.evaluate(() => {
      const btn =
        document.querySelector('button[aria-label="Create or adopt Project"]') ??
        document.querySelector('button[aria-label="创建或采用项目"]');
      if (!btn) return "not-found";
      return getComputedStyle(btn.parentElement).display;
    });
    record(
      mobile ? headerDisplay === "none" : headerDisplay === "flex",
      `${label} create header 行 display:${headerDisplay}（移动应 none / 桌面应 flex，零残留空条）`,
    );

    // ── 实例区：A 3 卡单列（含 subtitle + topSeparator），EMPTY 无卡 ──
    record(a.cardCount === 3, `[${PROJECT_A}] 实例区 3 卡（got ${a.cardCount}）`);
    record(
      a.cardLefts.every((l) => Math.abs(l - a.cardLefts[0]) <= 1),
      `[${PROJECT_A}] 卡片单列（left 全 ${JSON.stringify(a.cardLefts)}）`,
    );
    record(
      a.subtitles.every((t) => t === "probe subtitle"),
      `[${PROJECT_A}] 卡片 subtitle 第二行全部渲染（got ${JSON.stringify(a.subtitles)}）`,
    );
    record(
      a.topSeparatorCount === 2,
      `[${PROJECT_A}] 非首卡 topSeparator 数 = 2（got ${a.topSeparatorCount}）`,
    );
    record(empty.cardCount === 0, `[${PROJECT_EMPTY}] 空项目只名行、无实例区`);

    // ── 无 carousel / 无 ViewSwitcher ──
    const noCarousel = await page.evaluate(
      () => document.querySelectorAll(".snap-x, .snap-mandatory").length,
    );
    record(noCarousel === 0, `无 carousel snap 容器（got ${noCarousel}）`);
    const noSwitcher = await page.evaluate(
      () =>
        document.querySelectorAll(
          '[role="group"][aria-label*="视图"], [role="group"][aria-label*="View"], button[aria-label*="Grouped"], button[aria-label*="分组"], button[aria-label*="Grid"], button[aria-label*="网格"]',
        ).length,
    );
    record(noSwitcher === 0, `无 ViewSwitcher（got ${noSwitcher} 视图切换控件）`);

    // ── 间距几何（用户反馈「项目间距过大、不统一」的硬数据）──
    const firstCardTop = a.gridRect?.top ?? 0;
    const nameToCard = firstCardTop - (a.nameRowRect?.bottom ?? 0);
    const interProject = empty.sectionTop - a.sectionBottom;
    // root py-2：首 section 顶 - root 顶。root = sections 父容器。
    const rootTop = await page.evaluate(() => {
      const first = document.querySelector("section");
      const parent = first?.parentElement;
      return parent ? Math.round(parent.getBoundingClientRect().top) : 0;
    });
    const rootPy = a.sectionTop - rootTop;
    console.log(
      `  间距：名行↔卡片 ${nameToCard}px（负数=紧贴重叠）· 项目间 ${interProject}px · root 顶 padding ${rootPy}px`,
    );
    record(Math.abs(nameToCard) <= 2, `名行↔卡片紧贴（|${nameToCard}|px ≤2，无莫名间隙）`);
    record(interProject <= 10, `项目间间距紧凑（${interProject}px ≤10）`);
    record(rootPy >= 4 && rootPy <= 12, `root 顶部内边距适中（${rootPy}px）`);

    // ── 手风琴折叠/展开：tap A 行折叠 toggle → A 卡 0（折叠 ▸）→ 再 tap → 3（展开 ▾）──
    const aFoldBtn = page.locator(
      `section:has(span:text-is("${PROJECT_A}")) button[class*='min-h-11']`,
    );
    await aFoldBtn.click();
    await page.waitForTimeout(300);
    let after = await readSections(page, ENTER_SELECTOR);
    let a2 = after.find((s) => s.isGroup && s.projectName === PROJECT_A);
    record(a2.cardCount === 0, `tap 折叠 toggle → [${PROJECT_A}] 卡 0（got ${a2.cardCount}）`);
    record(
      a2.foldChevrons.includes("M6 4l4 4-4 4"),
      `折叠态 chevron = ▸ 右（got ${JSON.stringify(a2.foldChevrons)}）`,
    );
    await aFoldBtn.click();
    await page.waitForTimeout(300);
    after = await readSections(page, ENTER_SELECTOR);
    a2 = after.find((s) => s.isGroup && s.projectName === PROJECT_A);
    record(
      a2.cardCount === 3,
      `再 tap 折叠 toggle → [${PROJECT_A}] 卡恢复 3（got ${a2.cardCount}）`,
    );

    // ── localStorage 记忆：折叠 A 后 reload → A 仍折叠（0 卡）；再展开恢复 ──
    await aFoldBtn.click();
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForTimeout(800);
    after = await readSections(page, ENTER_SELECTOR);
    a2 = after.find((s) => s.isGroup && s.projectName === PROJECT_A);
    record(
      a2.cardCount === 0,
      `折叠 A 后 reload → [${PROJECT_A}] 仍折叠（0 卡，got ${a2.cardCount}，localStorage 记忆）`,
    );
    await page
      .locator(`section:has(span:text-is("${PROJECT_A}")) button[class*='min-h-11']`)
      .click();
    await page.waitForTimeout(300);
    after = await readSections(page, ENTER_SELECTOR);
    a2 = after.find((s) => s.isGroup && s.projectName === PROJECT_A);
    record(a2.cardCount === 3, `reload 后展开 A → [${PROJECT_A}] 卡恢复 3（got ${a2.cardCount}）`);

    // ── 进项目导航：点 A 行 › 进项目按钮 → /projects/$key ──
    const before = page.url();
    await page
      .locator(`section:has(span:text-is("${PROJECT_A}")) ${ENTER_SELECTOR}`)
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    const afterUrl = page.url();
    record(
      afterUrl !== before && afterUrl.includes(`/projects/${PROJECT_A}`),
      `› 进项目导航 /projects/${PROJECT_A}（${before} → ${afterUrl}）`,
    );

    await page.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  // CSS 落盘硬闸（frontend-notes §2/§10）：HTML 注入 stylesheet + content-type text/css + 关键 utility 落正文。
  const css = await verifyCssFlushed({
    expectClasses: ["space-y-2", "min-h-11", "left-15", "pl-3", "pr-2"],
  });
  if (!css.pass) {
    console.error(css.details.join("\n"));
    process.exit(1);
  }
  console.log("CSS 落盘三道闸通过（融合视图关键 utility 已生成）");
  await runViewport(false);
  await runViewport(true);
  console.log(`\n总计: ${allPass ? "ALL PASS" : "FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
