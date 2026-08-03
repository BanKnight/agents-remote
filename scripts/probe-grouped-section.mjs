// 探针：项目总览分组视图——section 带 bg 边框 + topSeparator inset + 移动端对齐桌面端（满宽 + dots）。
//
// 覆盖两轮诉求：
//   轮 1（2026-08-03）：两端统一带 bg 边框 section + topSeparator 两端 inset（撤销决策 38 移动 full-bleed 无边框）。
//   轮 2（2026-08-03）：移动端对齐桌面端——名行两端统一 pl-3 pr-2 + button px-0（图标≡marker、⋯≡action）、
//     退化态/carousel 态卡片满宽（撤销决策 39-43 peek 范式）、移动 carousel dots 指示器。
//
// 断言策略：
//   - section border+bg+rounded + topSeparator inset（轮 1）：桌面+移动 grouped。
//   - 名行图标≡首卡 marker（轮 2 诉求 1）：移动退化态几何（修正原 12px 错位）。
//   - 名行 ⋯≡卡片 action（轮 2 诉求 1）：移动退化态几何。
//   - section 右侧 bg 空白≡桌面（轮 2 诉求 2）：移动 ≤ 桌面（原 28px→对齐桌面 8px）。
//   - carousel 满宽 + dots（轮 2 诉求 3）：移动 carousel 态（1 project × 5 candidate >3）页 w-full + dots 存在。
//
// 密码自读（config.toml / /proc/<pid>/environ），不打印。DOM 几何（getBoundingClientRect），不用 vision。
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

// 退化态 mock：2 项目 × 2 candidate（≤pageSize=3 → 退化态满宽）。
const PROJECT_A = "probe-grouped-a";
const PROJECT_B = "probe-grouped-b";

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

const DEGEN_OVERVIEW = {
  projectNames: [PROJECT_A, PROJECT_B],
  candidates: [
    candidate(PROJECT_A, "agent_aaaaaaaaaaaaaaa1", "Claude A1", "agent", "claude"),
    candidate(PROJECT_A, "agent_aaaaaaaaaaaaaaa2", "Claude A2", "agent", "claude"),
    candidate(PROJECT_B, "terminal_bbbbbbbbbbbbbb1", "Terminal B1", "terminal"),
    candidate(PROJECT_B, "terminal_bbbbbbbbbbbbbb2", "Terminal B2", "terminal"),
  ],
};

// carousel 态 mock：1 项目 × 5 candidate（>pageSize=3 → carousel 分页 + dots）。
const CAROUSEL_PROJECT = "probe-carousel-p";
const CAROUSEL_OVERVIEW = {
  projectNames: [CAROUSEL_PROJECT],
  candidates: Array.from({ length: 5 }, (_, i) =>
    candidate(
      CAROUSEL_PROJECT,
      `agent_cccccccccccccc${i + 1}`,
      `Claude C${i + 1}`,
      "agent",
      "claude",
    ),
  ),
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

async function setupMocks(page, overview) {
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(overview),
    }),
  );
  await page.route(new RegExp("/api/overview/subtitles"), (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
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

// 切 ViewSwitcher 视图（aria-label 双语兼容：en Grouped/Grid · zh 分组/网格）。
async function switchView(page, view) {
  const labels = view === "grouped" ? ["Grouped", "分组"] : ["Grid", "网格"];
  for (const label of labels) {
    const btn = page.locator(`button[aria-label="${label}"]`).first();
    if ((await btn.count()) > 0) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

// 读所有 grouped section：border / bg / rounded。
async function readSections(page) {
  return await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll("section")).filter((s) =>
      s.className.includes("bg-surface-raised"),
    );
    return sections.map((s) => {
      const cs = getComputedStyle(s);
      return {
        borderTopWidth: parseFloat(cs.borderTopWidth),
        borderStyle: cs.borderTopStyle,
        backgroundColor: cs.backgroundColor,
        borderRadius: parseFloat(cs.borderRadius),
        left: Math.round(s.getBoundingClientRect().left),
        right: Math.round(s.getBoundingClientRect().right),
      };
    });
  });
}

// 读所有 topSeparator（left-15 + absolute + top:0 + height:1px）的 left 计算值。
async function readTopSeparators(page) {
  return await page.evaluate(() => {
    const seps = Array.from(document.querySelectorAll('[class*="left-15"]')).filter((el) => {
      const cs = getComputedStyle(el);
      return cs.position === "absolute" && cs.height === "1px" && cs.top === "0px";
    });
    return seps.map((el) => parseFloat(getComputedStyle(el).left));
  });
}

// 读名行图标、首卡 marker 方框、名行 ⋯ trigger、卡片 action 几何（轮 2 诉求 1：对齐断言）。
async function readNameCardGeom(page) {
  return await page.evaluate(() => {
    const section = document.querySelector("section[class*='bg-surface-raised']");
    if (!section) return { err: "no section" };
    const nameRow = section.firstElementChild;
    const nameBtn = nameRow?.querySelector("button");
    // 名行项目图标 = button 内第一个 ShellIcon svg（name="project"），裸 size-5 无方框，left = button.left。
    const nameIcon = nameBtn?.querySelector("svg");
    // 名行 ⋯ trigger = 名行内带 aria-label 的 button（session.actions）。
    const nameMenuBtn = nameRow?.querySelector("button[aria-label]");
    // 首卡 InstanceCard 根（含 p-3）。marker 方框 = StatusMarker 外层 span（relative inline-flex shrink-0，
    // 包裹 IconMarker h-9 w-9 方框 + StatusDot），其 left = card.p-3 = 与 nameIcon left 对齐的基准
    //（不是 IconMarker 内部 14px icon——那个居中方框内 left=marker+11，会误判差 11px）。
    const card = section.querySelector("[class*='p-3']");
    const marker = card?.querySelector("span.relative.shrink-0, span.shrink-0.relative");
    const actionBtn = card?.querySelector(".absolute.right-2 button[aria-label]");
    const r = (el) => {
      if (!el) return null;
      const x = el.getBoundingClientRect();
      return {
        left: Math.round(x.left),
        right: Math.round(x.right),
        cx: Math.round(x.left + x.width / 2),
      };
    };
    return {
      nameIcon: r(nameIcon),
      marker: r(marker),
      nameMenuBtn: r(nameMenuBtn),
      actionBtn: r(actionBtn),
      sectionRight: Math.round(section.getBoundingClientRect().right),
    };
  });
}

async function runDegenViewport(mobile) {
  const browser = await chromium.launch();
  try {
    const label = mobile ? "移动" : "桌面";
    const page = await newPage(browser, mobile);
    await setupMocks(page, DEGEN_OVERVIEW);
    await login(page);
    await page.waitForTimeout(800);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.waitForTimeout(1000);

    console.log(`\n===== 退化态 grouped（${label}）：section + topSeparator + 名行≡卡片对齐 =====`);
    await switchView(page, "grouped");
    await page.waitForTimeout(500);

    // 轮 1：section border+bg+rounded。
    const sections = await readSections(page);
    console.log(`  找到 ${sections.length} 个 grouped section`);
    record(sections.length >= 2, `≥2 个 section（got ${sections.length}，前提）`);
    for (const [i, s] of sections.entries()) {
      record(
        s.borderTopWidth > 0 && s.borderStyle !== "none",
        `section[${i}] 有 border（width=${s.borderTopWidth}px style=${s.borderStyle}）`,
      );
      record(
        s.backgroundColor !== "rgba(0, 0, 0, 0)",
        `section[${i}] 有 bg（${s.backgroundColor}）`,
      );
      record(s.borderRadius > 0, `section[${i}] 有 rounded（${s.borderRadius}px）`);
    }

    // 轮 1：topSeparator inset。
    const seps = await readTopSeparators(page);
    if (seps.length > 0) {
      record(
        seps.every((l) => Math.abs(l - 60) < 1),
        `topSeparator left≈60（got ${JSON.stringify(seps)}，跳过 marker 列）`,
      );
    } else {
      console.log("  (退化态 carousel 单页可能未渲染 topSeparator——grid 视图覆盖)");
    }

    // 轮 2 诉求 1：名行图标≡首卡 marker + 名行⋯≡卡片 action。
    const g = await readNameCardGeom(page);
    if (g.err) {
      console.log(`  (skip 几何：${g.err})`);
    } else if (g.nameIcon && g.marker) {
      const iconVsMarker = Math.abs(g.nameIcon.left - g.marker.left);
      record(
        iconVsMarker <= 1,
        `名行图标≡首卡 marker left（差 ${iconVsMarker}px，≤1px，修正原移动 12px 错位）`,
      );
    }
    if (g.nameMenuBtn && g.actionBtn) {
      const menuVsAction = Math.abs(g.nameMenuBtn.cx - g.actionBtn.cx);
      record(menuVsAction <= 1, `名行⋯≡卡片 action center.x（差 ${menuVsAction}px，≤1px）`);
    }

    // 轮 2 诉求 2：section 右侧 bg 空白≡桌面。名行⋯trigger.right 到 section.right 的间隙 = 右侧空白。
    if (g.nameMenuBtn && g.sectionRight) {
      const rightGap = g.sectionRight - g.nameMenuBtn.right;
      // 满宽 action absolute right-2=8，名行 pr-2=8 → 两侧右侧空白均 ≈8px（含 button 自身 right-2 padding）。
      // 退化态断言 ≤12px（容忍 1px 抖动 + border）；原移动 28px。
      record(rightGap <= 12, `section 右侧空白≤12px（got ${rightGap}px，对齐桌面，原移动 28px）`);
    }

    await page.close();
  } finally {
    await browser.close();
  }
}

async function runCarouselViewport(mobile) {
  const browser = await chromium.launch();
  try {
    const label = mobile ? "移动" : "桌面";
    const page = await newPage(browser, mobile);
    await setupMocks(page, CAROUSEL_OVERVIEW);
    await login(page);
    await page.waitForTimeout(800);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.waitForTimeout(1000);

    console.log(`\n===== carousel 态 grouped（${label}）：页满宽 + dots/页码行 =====`);
    await switchView(page, "grouped");
    await page.waitForTimeout(500);

    // 轮 2 诉求 3：carousel 页满宽 + dots（移动）/ 页码行（桌面）。
    const c = await page.evaluate(() => {
      const section = document.querySelector("section[class*='bg-surface-raised']");
      if (!section) return { err: "no section" };
      // carousel 容器 = section 内 flex snap-x 滚动 div。
      const scroll = section.querySelector(".snap-x");
      const pages = scroll ? Array.from(scroll.children) : [];
      // 移动 dots = scroll 容器后的 flex.justify-center.gap-1.5（含 button[aria-current]）。
      // 桌面页码行 = hidden lg:flex（含 ‹› + 数字 button aria-current）。
      const dotsOrPager = section.querySelectorAll("button[aria-current]");
      const pageWidths = pages.map((p) => Math.round(p.getBoundingClientRect().width));
      const scrollWidth = scroll ? Math.round(scroll.getBoundingClientRect().width) : 0;
      return {
        pageCount: pages.length,
        pageWidths,
        scrollWidth,
        indicatorCount: dotsOrPager.length,
        hasDotsOrPager: dotsOrPager.length > 0,
      };
    });
    if (c.err) {
      console.log(`  (skip carousel：${c.err})`);
    } else {
      record(c.pageCount >= 2, `carousel 分 ≥2 页（got ${c.pageCount}，5 candidate > pageSize 3）`);
      if (c.pageWidths.length > 0) {
        const allFull = c.pageWidths.every((w) => Math.abs(w - c.scrollWidth) <= 1);
        record(
          allFull,
          `carousel 页满宽（页宽 ${JSON.stringify(c.pageWidths)} ≈ scroll ${c.scrollWidth}，无 px-5 缩进）`,
        );
      }
      record(
        c.hasDotsOrPager,
        `${mobile ? "移动 dots" : "桌面页码行"} 指示器存在（got ${c.indicatorCount} 个 aria-current）`,
      );
      if (mobile) {
        // 移动 dots：aria-label 含「页」/「Page」的 button 数 = pageCount。
        const dotsCount = await page
          .locator("button[aria-label*='页'], button[aria-label*='Page']")
          .count();
        record(
          dotsCount === c.pageCount,
          `移动 dots 数 = 页数（dots ${dotsCount} = pages ${c.pageCount}）`,
        );
      }
    }

    await page.close();
  } finally {
    await browser.close();
  }
}

// 轮 1：grid 视图 topSeparator 两端 inset（grid 视图平铺多卡，第 2+ 卡必渲染 topSeparator）。
async function runGridTopSeparator(mobile) {
  const browser = await chromium.launch();
  try {
    const label = mobile ? "移动" : "桌面";
    const page = await newPage(browser, mobile);
    await setupMocks(page, DEGEN_OVERVIEW);
    await login(page);
    await page.waitForTimeout(800);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.waitForTimeout(1000);
    console.log(`\n===== grid 视图 topSeparator（${label}）：两端 inset left=60 =====`);
    await switchView(page, "grid");
    await page.waitForTimeout(500);
    const gridSeps = await readTopSeparators(page);
    record(gridSeps.length > 0, `grid 渲染 topSeparator（got ${gridSeps.length}）`);
    if (gridSeps.length > 0) {
      record(
        gridSeps.every((l) => Math.abs(l - 60) < 1),
        `grid topSeparator 全部 left≈60（got ${JSON.stringify(gridSeps)}）`,
      );
    }
    await page.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  // 轮 2 退化态几何：移动（修正对象）+ 桌面（标杆，零回归验证）。
  await runDegenViewport(false);
  await runDegenViewport(true);
  // 轮 2 carousel 态：移动 dots + 桌面页码行。
  await runCarouselViewport(false);
  await runCarouselViewport(true);
  // 轮 1 grid topSeparator 两端 inset（连带验证）。
  await runGridTopSeparator(false);
  await runGridTopSeparator(true);
  console.log(`\n总计: ${allPass ? "ALL PASS" : "FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
