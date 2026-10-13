// 桌面中栏排版断言探针（2026-10-12 真机反馈三联修）。
// Part 1 设置页 560px 居中列（07m `.col{width:560px;margin:0 auto}`）——mx-auto 在场。
// Part 2 中栏满铺——file tab panel 落点与 group 壳/中栏根左右齐平（contentRect 无内缩）。
// Part 3 渲染态首元素 margin-top 压平——md 渲染容器 first-child mt=0（间隔收敛到纯容器 padding）。
// Part 4 分屏 grip——胶囊中心 == gutter 中心 + .grip svg 在场（图标化防回归，字体 fallback 免疫）。
// PASS/FAIL 断言式；bun scripts/probe-desktop-layout.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = "http://127.0.0.1:43012";
const PROJECT = "proj1";
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const now = Date.now();

const LONG_MD = ["# 标题", ""];
for (let i = 1; i <= 60; i++) LONG_MD.push(`第 ${i} 行：占位段落，用来撑高文档。`);
const LONG_MD_TEXT = LONG_MD.join("\n");

function setup(page) {
  void page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: [PROJECT],
        candidates: [
          {
            type: "agent",
            projectName: PROJECT,
            sessionId: "agent_layout-1",
            displayName: "布局探针会话",
            status: "idle",
            provider: "claude",
            createdAt: "2026-07-26T00:00:00.000Z",
          },
        ],
      }),
    ),
  );
  void page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(
      json({
        sessions: [
          {
            id: "agent_layout-1",
            projectName: PROJECT,
            provider: "claude",
            displayName: "布局探针会话",
            status: "idle",
            createdAt: "2026-07-26T00:00:00.000Z",
          },
        ],
      }),
    ),
  );
  void page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/agent_layout-1$`), (r) =>
    r.fulfill(
      json({
        session: {
          id: "agent_layout-1",
          projectName: PROJECT,
          provider: "claude",
          displayName: "布局探针会话",
          status: "idle",
          createdAt: "2026-07-26T00:00:00.000Z",
        },
        availableModels: ["sonnet"],
        availablePermissionModes: ["default"],
      }),
    ),
  );
  void page.route(new RegExp(`/api/projects/${PROJECT}/terminal-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  void page.route(/\/api\/root\/files(?:\?.*)?$/, (r) =>
    r.fulfill(
      json({
        projectName: "",
        path: "",
        parentPath: null,
        entries: [{ name: "proj1", type: "directory", path: "proj1", hidden: false, size: 0 }],
      }),
    ),
  );
  void page.route(/\/api\/projects\/proj1\/files(?:\?.*)?$/, (r) =>
    r.fulfill(
      json({
        projectName: PROJECT,
        path: "",
        parentPath: null,
        entries: [
          { name: "src", path: "src", type: "directory", hidden: false, size: 0 },
          { name: "README.md", path: "README.md", type: "file", hidden: false, size: 128 },
          { name: "main.ts", path: "main.ts", type: "file", hidden: false, size: 96 },
        ],
      }),
    ),
  );
  void page.route(/\/api\/projects\/proj1\/files\/preview\?.*path=README\.md/, (r) =>
    r.fulfill(
      json({
        type: "text",
        projectName: PROJECT,
        path: "README.md",
        name: "README.md",
        size: 128,
        content: LONG_MD_TEXT,
        mtimeMs: now,
      }),
    ),
  );
  void page.route(/\/api\/projects\/proj1\/files\/preview\?.*path=main\.ts/, (r) =>
    r.fulfill(
      json({
        type: "text",
        projectName: PROJECT,
        path: "main.ts",
        name: "main.ts",
        size: 96,
        content: "const x = 1;\nconsole.log(x);\n",
        mtimeMs: now,
      }),
    ),
  );
  void page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await ctx.newPage();
  setup(page);
  await login(page);

  console.log("== Part 1：设置页 560px 居中列 ==");
  await page.goto(`${ORIGIN}/projects?leftMode=settings`);
  await page.waitForTimeout(1200);
  const s = await page.evaluate(() => {
    const col = document.querySelector("main .max-w-\\[560px\\]");
    if (!col) return null;
    const b = col.getBoundingClientRect();
    return { left: b.x, right: b.x + b.width, viewport: window.innerWidth };
  });
  check("560 列在场", !!s);
  if (s) {
    const leftGap = s.left - 250; // 中栏左缘 = side 250
    const rightGap = s.viewport - s.right;
    check(
      `居中（左 ${leftGap.toFixed(1)}px ≈ 右 ${rightGap.toFixed(1)}px）`,
      Math.abs(leftGap - rightGap) <= 2,
      `leftGap=${leftGap.toFixed(1)} rightGap=${rightGap.toFixed(1)}`,
    );
  }

  console.log("== Part 2：中栏满铺（file tab panel 落点齐平） ==");
  await page.goto(`${ORIGIN}/projects/${PROJECT}/file/README.md`);
  await page.waitForTimeout(1500);
  const p2 = await page.evaluate(() => {
    const rb = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, w: b.width, right: b.x + b.width };
    };
    const root = document.querySelector("main div.relative.h-full.w-full");
    const panel = [...(root?.children ?? [])].find((c) =>
      (c.className || "").toString().includes("absolute z-0"),
    );
    const fmeta = document.querySelector("main .fmeta");
    // 分隔线连续性（review P1 盲区封堵）：panel 满铺后会盖住 group 壳 border-r 的内容段——
    // 内容段线必须由 panel 自带同 x 补画（tab 段 group 壳 + 内容段 panel 连续）。
    const shell = document.querySelector("main [data-drop-group]");
    return {
      root: rb(root),
      panel: rb(panel),
      fmeta: rb(fmeta),
      panelBrW: panel ? getComputedStyle(panel).borderRightWidth : null,
      shellBrW: shell ? getComputedStyle(shell).borderRightWidth : null,
      panelBrX: panel ? panel.getBoundingClientRect().right - 0.5 : null,
      shellBrX: shell ? shell.getBoundingClientRect().right - 0.5 : null,
    };
  });
  check("panel 落点在场", !!p2.panel);
  check(
    `分隔线连续（panel border ${p2.panelBrW} @${p2.panelBrX?.toFixed(1)} == 壳 border ${p2.shellBrW} @${p2.shellBrX?.toFixed(1)}）`,
    p2.panelBrW === "1px" && p2.shellBrW === "1px" && Math.abs(p2.panelBrX - p2.shellBrX) <= 0.5,
    `panelBrW=${p2.panelBrW} shellBrW=${p2.shellBrW} Δx=${(p2.panelBrX - p2.shellBrX).toFixed(2)}`,
  );
  if (p2.panel && p2.root) {
    check(
      `panel 左缘 == 中栏根左缘（${p2.panel.x.toFixed(1)} vs ${p2.root.x.toFixed(1)}）`,
      Math.abs(p2.panel.x - p2.root.x) <= 1,
      `Δ=${(p2.panel.x - p2.root.x).toFixed(2)}`,
    );
    check(
      `panel 右缘 == 中栏根右缘（${p2.panel.right.toFixed(1)} vs ${(p2.root.x + p2.root.w).toFixed(1)}）`,
      Math.abs(p2.panel.right - (p2.root.x + p2.root.w)) <= 1,
      `Δ=${(p2.panel.right - p2.root.x - p2.root.w).toFixed(2)}`,
    );
  }
  if (p2.fmeta && p2.panel) {
    check(
      `fmeta 左缘 == panel 左缘`,
      Math.abs(p2.fmeta.x - p2.panel.x) <= 1,
      `Δ=${(p2.fmeta.x - p2.panel.x).toFixed(2)}`,
    );
  }

  console.log("== Part 3：渲染态首元素 margin-top 压平 ==");
  // 渲染容器 = fmeta 的父容器内的 overflow-auto 直接子（PreviewBody md 分支）；断言目标 =
  // MARKDOWN_CLASS div 内的首子 h1（mt-4 的真实携带者）computed marginTop。
  const p3 = await page.evaluate(() => {
    const fmeta = document.querySelector("main .fmeta");
    const wrap = fmeta?.parentElement?.querySelector(":scope > .overflow-auto");
    const h1 = wrap?.querySelector("h1");
    if (!fmeta || !wrap || !h1) return null;
    const fb = fmeta.getBoundingClientRect();
    const hb = h1.getBoundingClientRect();
    return {
      h1: true,
      mt: getComputedStyle(h1).marginTop,
      gap: hb.top - fb.bottom,
    };
  });
  check("渲染态 h1 在场（fmeta → overflow 容器 → MARKDOWN_CLASS → h1）", !!p3?.h1);
  check(`h1 margin-top = 0px（实测 ${p3?.mt}）`, p3?.mt === "0px");
  // 几何复验：fmeta 底 → h1 顶的可见间隔 = 纯容器 padding（桌面 sm:p-6 = 24px），≤ 26px。
  check(
    `fmeta→h1 间隔收敛到容器 padding（实测 ${p3 ? p3.gap.toFixed(1) : "—"}px ≤ 26px）`,
    !!p3 && p3.gap > 0 && p3.gap <= 26,
  );

  console.log("== Part 4：分屏 sash（窗格紧贴 + 把手压交界线）==");
  await page.goto(`${ORIGIN}/projects/${PROJECT}`);
  await page.waitForTimeout(800);
  await page.locator('button:has-text("布局探针会话")').first().click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "分屏", exact: true }).first().click();
  await page.waitForTimeout(900);
  const p4 = await page.evaluate(() => {
    const capsule = document.querySelector("main .grip");
    if (!capsule) return null;
    const cb = capsule.getBoundingClientRect();
    const gb = capsule.parentElement.getBoundingClientRect();
    // sash 检查（2026-10-13 紧贴拍板）：两 group 紧贴，交界线 x = 左 group 右缘 = 右 group 左缘；
    // 命中区以交界线为中心的透明条（固定 10px）。按「最贴近命中区中心线」找相邻 group
    //（命中区半宽 5px + 亚像素余量）。row gutter（横条）x 轴不适用，字段置 null → 断言失败。
    //（2026-10-13 code review P2-5 措辞校正：并非「跳过」，是响亮失败；当前 Part 4 场景恒为 col。）
    const gc = gb.x + gb.width / 2;
    const isCol = gb.width < gb.height;
    const rects = [...document.querySelectorAll("main [data-drop-group]")].map((g) =>
      g.getBoundingClientRect(),
    );
    const left = isCol
      ? rects.filter((r) => r.right <= gc + 12).sort((a, b) => b.right - a.right)[0]
      : undefined;
    const right = isCol
      ? rects.filter((r) => r.left >= gc - 12).sort((a, b) => a.left - b.left)[0]
      : undefined;
    return {
      capsuleCenter: cb.x + cb.width / 2,
      flushGap: left && right ? right.left - left.right : null,
      gutterCenter: gc,
      borderX: left && right ? left.right : null,
      hasSvg: !!capsule.querySelector("svg"),
    };
  });
  check("grip 在场", !!p4);
  if (p4) {
    check(
      `胶囊中心 == 命中区中心（Δ=${Math.abs(p4.capsuleCenter - p4.gutterCenter).toFixed(2)}px）`,
      Math.abs(p4.capsuleCenter - p4.gutterCenter) <= 0.5,
    );
    check(
      `两 group 紧贴无缝（gap=${p4.flushGap === null ? "—" : p4.flushGap.toFixed(3)}px ≤ 0.2px）`,
      p4.flushGap !== null && Math.abs(p4.flushGap) <= 0.2,
    );
    check(
      `命中区中心 == 两 group 交界线（Δ=${p4.borderX === null ? "—" : Math.abs(p4.gutterCenter - p4.borderX).toFixed(2)}px）`,
      p4.borderX !== null && Math.abs(p4.gutterCenter - p4.borderX) <= 0.2,
    );
    check("把手已图标化（.grip svg 在场，字体 fallback 免疫）", p4.hasSvg);
  }
  console.log("== Part 5：源码态画布间隔区 bg 覆盖 ==");
  // 非 md 文件默认源码态（CodeMirror）。fmeta 分割线与画布之间的 10px 呼吸区（py-2.5）
  // 必须被 codeblock 色覆盖（原型 .ed/.code bg+padding 同元素绘制语义）——透明则露出面板
  // 底色形成异色带（2026-10-12 真机反馈②追加澄清）。
  await page.goto(`${ORIGIN}/projects/${PROJECT}/file/main.ts`);
  await page.waitForSelector("main .cm-editor", { timeout: 15000 });
  await page.waitForTimeout(500);
  const p5 = await page.evaluate(() => {
    // .cm-editor 最近 bg-codeblock 祖先 = CodeEditor 根；再上一层 = py-2.5 呼吸区容器
    //（该容器现也挂 bg-codeblock——DOM 序在 CodeEditor 根之前，不能全局 find 取首个）。
    const cm = document.querySelector("main .cm-editor");
    const canvas = cm?.closest("[class*='bg-codeblock']");
    const wrap = canvas?.parentElement;
    return {
      canvasBg: canvas ? getComputedStyle(canvas).backgroundColor : null,
      wrapBg: wrap ? getComputedStyle(wrap).backgroundColor : null,
      transparent: "rgba(0, 0, 0, 0)",
    };
  });
  check("CodeEditor 画布在场", !!p5.canvasBg);
  check(`呼吸区容器 bg 非透明（实测 ${p5.wrapBg}）`, !!p5.wrapBg && p5.wrapBg !== p5.transparent);
  check(
    `呼吸区 bg == 画布 bg（${p5.wrapBg} == ${p5.canvasBg}）`,
    !!p5.wrapBg && p5.wrapBg === p5.canvasBg,
  );

  await ctx.close();
} finally {
  await browser.close();
}

console.log(fail === 0 ? `\nPASS (${pass}/${pass + fail})` : `\nFAIL (${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
