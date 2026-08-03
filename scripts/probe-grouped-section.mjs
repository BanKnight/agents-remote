// 探针：项目总览分组视图「两端统一带 bg 边框 section」+「topSeparator 两端 inset」。
//
// 覆盖用户三项诉求（2026-08-03）：
//   1. 移动/桌面分组视图两端统一（撤销决策 38 移动 full-bleed 无边框）。
//   2. 分组带 bg（bg-surface-raised，复刻设置 Card grouped 带 bg 范式）。
//   3. 分割条 inset（topSeparator 两端 left=60px，跳过 marker 列；撤销桌面 lg:left-0 全宽）。
//
// 断言策略：
//   - grouped 视图 section（诉求 1+2 核心）：桌面+移动，section 有 border + 非透明 bg + rounded。
//   - topSeparator left≈60（诉求 3）：grid 视图最可靠（InstanceGrid 平铺多卡，第 2+ 卡必渲染
//     topSeparator）；grouped 视图 carousel 单卡/页时可能懒渲染第 2 卡，读到就断言、读不到 skip
//     （不 fail）——诉求 3 由 grid 视图充分覆盖（topSeparator 是 InstanceCard 级 className，
//     grouped/grid 共用同一处代码）。
//
// 密码自读（config.toml / /proc/<pid>/environ），不打印。DOM 几何（getComputedStyle），不用 vision。
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

// 造 2 个项目 × 各 2 个 candidate：触发 2 个 grouped section + 多卡 topSeparator。
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

const OVERVIEW = {
  projectNames: [PROJECT_A, PROJECT_B],
  candidates: [
    candidate(PROJECT_A, "agent_aaaaaaaaaaaaaaa1", "Claude A1", "agent", "claude"),
    candidate(PROJECT_A, "agent_aaaaaaaaaaaaaaa2", "Claude A2", "agent", "claude"),
    candidate(PROJECT_B, "terminal_bbbbbbbbbbbbbb1", "Terminal B1", "terminal"),
    candidate(PROJECT_B, "terminal_bbbbbbbbbbbbbb2", "Terminal B2", "terminal"),
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

// 读所有 grouped section（<section> 含 bg-surface-raised）：border / bg / rounded 几何。
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

    // ── 诉求 1+2：grouped section 两端统一 border + bg + rounded ──────────────
    console.log(`\n===== grouped 视图 section（${label}）：两端统一 border+bg+rounded =====`);
    const switched = await switchView(page, "grouped");
    await page.waitForTimeout(500);
    const sections = await readSections(page);
    console.log(`  (switchView=${switched}) 找到 ${sections.length} 个 grouped section`);
    record(sections.length >= 2, `≥2 个 section（got ${sections.length}，诉求1+2 前提）`);
    for (const [i, s] of sections.entries()) {
      record(
        s.borderTopWidth > 0 && s.borderStyle !== "none",
        `section[${i}] 有 border（width=${s.borderTopWidth}px style=${s.borderStyle}，诉求1）`,
      );
      record(
        s.backgroundColor !== "rgba(0, 0, 0, 0)",
        `section[${i}] 有 bg（${s.backgroundColor}，诉求2 bg-surface-raised）`,
      );
      record(s.borderRadius > 0, `section[${i}] 有 rounded（${s.borderRadius}px，诉求1 圆角）`);
    }
    // 诉求 3 grouped 侧（尽力）：carousel 单卡/页可能懒渲染第 2 卡，读到就断言。
    const groupedSeps = await readTopSeparators(page);
    if (groupedSeps.length > 0) {
      console.log(`  grouped topSeparator left 值：${JSON.stringify(groupedSeps)}`);
      record(
        groupedSeps.every((l) => Math.abs(l - 60) < 1),
        `grouped topSeparator left≈60（inset 跳过 marker 列，诉求3）`,
      );
    } else {
      console.log("  (grouped carousel 未渲染 topSeparator——诉求3 由下方 grid 视图覆盖)");
    }

    // ── 诉求 3：grid 视图 topSeparator 两端统一 inset left=60 ──────────────────
    console.log(`\n===== grid 视图 topSeparator（${label}）：两端统一 inset left=60 =====`);
    await switchView(page, "grid");
    await page.waitForTimeout(500);
    const gridSeps = await readTopSeparators(page);
    console.log(`  找到 ${gridSeps.length} 个 topSeparator`);
    record(gridSeps.length > 0, `grid 视图渲染了 topSeparator（got ${gridSeps.length}）`);
    if (gridSeps.length > 0) {
      console.log(`  grid topSeparator left 值：${JSON.stringify(gridSeps)}`);
      record(
        gridSeps.every((l) => Math.abs(l - 60) < 1),
        `grid topSeparator 全部 left≈60（两端统一 inset，跳过 marker 列，诉求3）`,
      );
    }

    await page.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await runViewport(false);
  await runViewport(true);
  console.log(`\n总计: ${allPass ? "ALL PASS" : "FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
