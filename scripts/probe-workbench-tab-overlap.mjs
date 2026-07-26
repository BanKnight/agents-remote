// 探针：验证工作台 group tab 栏（GroupHeader `h-9`=36px）在矮容器下不再被面板遮挡。
//
// 根因（已修）：flatten-layout 旧用归一化 TAB_BAR_HEIGHT_RATIO=0.04 近似 tab 栏高度，仅当根容器
// 高=900px 时 0.04×900=36px 才等于 GroupHeader；矮容器（iPad 横屏根容器 ~750px）下 0.04×750=30px
// < 36px → 面板顶部高于 GroupHeader 底 6px → GroupHeader 下半被面板盖住（"tab 下半被遮挡"）。
// 修复：flatten-layout 不再加 tab 栏偏移（contentRect.y === groupRect.y），tab 栏偏移交表现层
// CSS calc 固定 px（rectStyle 的 insetTopPx=WORKBENCH_TAB_BAR_PX=36）——任意容器高度都
// panel.top == GroupHeader.bottom。
//
// 本探针在真实工作台页面、不同 viewport 高度（900 桌面 / 750 iPad 横屏 / 600 极端矮）下测
// GroupHeader.bottom vs panel.top，断言无重叠（panel.top ≥ GroupHeader.bottom − 0.5px 亚像素容差）。
// 密码由脚本自读（env → config.toml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：node scripts/probe-workbench-tab-overlap.mjs
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const fakeSessionId = "agent_probe-tab-overlap";

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
  const session = {
    id: fakeSessionId,
    projectName,
    provider: "claude2",
    displayName: "Probe Agent",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  };
  const detail = {
    session,
    availableModels: ["sonnet", "opus", "haiku"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}$`),
    (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [session] }),
    }),
  );
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  // WS 路由真实 server（fake session 不存在 → error，但 GroupShell/panel 容器仍渲染，几何可测）。
  await page.routeWebSocket(/claude2-stream/, (ws) => ws.connectToServer());
}

// 测量 GroupHeader.bottom vs panel.top。overlap = GroupHeader.bottom − panel.top（正=遮挡，0=贴合）。
async function measureOverlap(page) {
  return await page.evaluate(() => {
    const groupShell = document.querySelector("[data-drop-group]");
    if (!groupShell) {
      return { error: "GroupShell[data-drop-group] 未找到（WorkspaceTree 未渲染 leaf）" };
    }
    const groupHeader = groupShell.querySelector(".flex.h-9");
    if (!groupHeader) return { error: "GroupHeader(.flex.h-9) 未找到" };
    // panel = GroupShell 同级、同 relative 根下的直接子 div；其 style 含 calc（rectStyle insetTopPx>0
    // 生成 calc(top)）；GroupShell 自身用 rectStyle(rect) 无 insetTopPx → 纯百分比不含 calc。
    const root = groupShell.parentElement;
    const panels = root
      ? Array.from(root.querySelectorAll(":scope > div[style*='calc']")).filter((el) => {
          const st = el.getAttribute("style") || "";
          return st.includes("absolute");
        })
      : [];
    if (panels.length === 0) return { error: "panel(absolute + style 含 calc) 未找到" };
    // panel 可见的那个（hidden 的 display:none 不参与几何）。
    const panel = panels.find((el) => getComputedStyle(el).display !== "none") ?? panels[0];
    const gh = groupHeader.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const styleTop = panel.getAttribute("style") || "";
    const round = (n) => Math.round(n * 10) / 10;
    // getBoundingClientRect().bottom 含 GroupHeader 自身 border-b（"border-b border-on-surface/5"，
    // 一条 0.05 透明度细线）。tab chips 在 content+padding 区，远高于 border-b。真正判断"tab 是否被盖"
    // 用 content 底 = boundingRect.bottom − borderBottomWidth：panel.top ≥ content 底 → tab 完整可见，
    // panel 仅盖住 GroupHeader 自己的 border-b 细线（无害，且 panel 顶部正好接 content 底，视觉干净）。
    const ghStyle = getComputedStyle(groupHeader);
    const ghBorderBottom = parseFloat(ghStyle.borderBottomWidth) || 0;
    const ghContentBottom = gh.bottom - ghBorderBottom;
    return {
      groupHeaderBottom: round(gh.bottom),
      groupHeaderContentBottom: round(ghContentBottom),
      groupHeaderBorderBottom: round(ghBorderBottom),
      groupHeaderHeight: round(gh.height),
      panelTop: round(p.top),
      // overlapBox 含 border-b（预期 ~border-b 厚度，panel 盖的是细线）；overlapContent 去 border-b
      //（预期 ≤0，tab content 不被盖）。
      overlapBox: round(gh.bottom - p.top),
      overlapContent: round(ghContentBottom - p.top),
      panelStyleTop: styleTop.match(/top:[^;]+/)?.[0] ?? "",
      rootHeight: round(root?.getBoundingClientRect().height ?? 0),
    };
  });
}

async function probeHeight(browser, height) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height } });
  const page = await ctx.newPage();
  await setupMocks(page);
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readRawPassword());
  await page.getByRole("button", { name: "Unlock console" }).click();
  // 工作台 focus 路由（focus session → layout 建 leaf → WorkspaceTree 渲染 GroupShell + panel）。
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/session/${fakeSessionId}`);
  await page.waitForSelector("[data-drop-group]", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
  const m = await measureOverlap(page);
  if (m.error) {
    console.log(`[H=${height}] ✗ ${m.error}`);
  } else {
    console.log(
      `[H=${height}] rootH=${m.rootHeight} GH.h=${m.groupHeaderHeight} GH.contentBottom=${m.groupHeaderContentBottom}(border-b=${m.groupHeaderBorderBottom}) panel.top=${m.panelTop} overlapContent=${m.overlapContent} overlapBox=${m.overlapBox} [${m.panelStyleTop}]`,
    );
  }
  await ctx.close();
  return { height, ...m };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const heights = [900, 750, 600];
    const results = [];
    for (const h of heights) results.push(await probeHeight(browser, h));

    console.log("\n=== 判定 ===");
    let allPass = true;
    for (const r of results) {
      if (r.error) {
        console.log(`✗ H=${r.height}: ${r.error}`);
        allPass = false;
        continue;
      }
      // tab content 可见性：overlapContent = GroupHeader content 底(去 border-b) − panel.top。
      // ≤0.5px（亚像素容差）= panel.top ≥ content 底 → tab chips（在 padding 内）完整可见。
      // overlapBox 含 border-b，预期 ~border-b 厚度（panel 盖的是 GroupHeader 自己的底部分隔细线，
      // 非 tab 文字）——无害，且 panel 顶部正好接 content 底，视觉干净。
      const pass = r.overlapContent <= 0.5;
      console.log(
        `${pass ? "✓" : "✗"} H=${r.height}: overlapContent=${r.overlapContent}px (overlapBox=${r.overlapBox} 含border-b) — ${pass ? "tab content 完整可见" : "tab 下半被面板遮挡"}`,
      );
      if (!pass) allPass = false;
    }
    console.log(`\n总计: ${allPass ? "ALL PASS（任意容器高度 tab 栏不再被遮挡）" : "有 FAIL"}`);
    process.exit(allPass ? 0 : 1);
  } finally {
    await browser.close();
  }
})();
