// 批 16 真机反馈探针：①文件编辑 aux 工具条三钮 Lucide 化（字符 ↩/↪/⌄ 的平台字形差异 →
// SVG 跨平台统一；断言 svg 在场 + 显式尺寸非零，frontend-notes §15⑤ WebKit flex 收缩隐形防护）
// ②检视面板钮右侧形制（panel-right，非 panel-left）③md mermaid 自动渲染（合法块出图 +
// 非法块错误行 + 源码保留；MarkdownString → CodeBlock 管线单点）。
// PASS/FAIL 断言式；bun scripts/probe-v16-batch16.mjs。
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { LUCIDE_ICONS } from "../web/src/assets/icons.ts";

const ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const P = "batch16-demo";

const MERMAID_CONTENT = [
  "# Mermaid Demo",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[Start] --> B[End]",
  "```",
  "",
  "```mermaid",
  "this is not a valid diagram >>>",
  "```",
  "",
].join("\n");

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function setup(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(json({ projectNames: [P], candidates: [] })),
  );
  await page.route(/\/api\/projects\/[^/]+\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/[^/]+\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/[^/]+$/, (r) =>
    r.fulfill(
      json({
        project: {
          name: P,
          path: `/tmp/${P}`,
          agentSessionCount: 0,
          terminalSessionCount: 0,
          gitBranch: "main",
        },
      }),
    ),
  );
  await page.route(/\/api\/projects\/[^/]+\/files(?:\?.*)?$/, (r) => {
    const path = new URL(r.request().url()).searchParams.get("path") ?? "";
    if (path !== "") return r.fulfill(json({ parentPath: "", entries: [] }));
    return r.fulfill(
      json({
        projectName: P,
        path: "",
        parentPath: null,
        entries: [{ name: "README.md", path: "README.md", type: "file" }],
      }),
    );
  });
  await page.route(/\/api\/projects\/[^/]+\/files\/preview(?:\?.*)?$/, (r) => {
    const path = new URL(r.request().url()).searchParams.get("path") ?? "";
    return r.fulfill(
      json({
        type: "text",
        projectName: P,
        path,
        name: path,
        content: MERMAID_CONTENT,
        mtimeMs: Date.now(),
      }),
    );
  });
}

async function login(page) {
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /登录|Sign in/ }).click();
  await page.waitForTimeout(700);
}

// 面板 tab / 文件路径 localStorage 持久化清理（batch13 同款五键）。
function clean(page) {
  return page.evaluate(() => {
    for (const k of [
      "workbenchPanelTabs",
      "workbenchPanelActive",
      "workbenchMobileProjectFilesPath",
      "workbenchMobileGlobalFilesPath",
      "workbenchRightCollapsed",
    ]) {
      localStorage.removeItem(k);
    }
  });
}

// CodeBlock 根容器（className "group/code"，CSS 转义）。
const codeBlocks = (page) => page.locator("div.group\\/code");

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    // ── Part 1 桌面 1280：③ mermaid 渲染（md 预览渲染态）──
    {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: "en-US",
      });
      const page = await ctx.newPage();
      await setup(page);
      await page.goto(`${ORIGIN}/projects/${P}`);
      await login(page);
      // 桌面右栏展开 + 面板 tab 持久化清理（batch13 同款）：检视面板 → 文件行点击打开中栏预览。
      await clean(page);
      await page.evaluate(() =>
        localStorage.setItem("workbenchRightCollapsed", JSON.stringify(false)),
      );
      await page.goto(`${ORIGIN}/projects/${P}`);
      await page.waitForSelector("[data-desktop-inspector]", { timeout: 10000 });
      await page.waitForTimeout(500);
      await page
        .locator("[data-desktop-inspector] button.frow", { hasText: "README.md" })
        .first()
        .click();
      // file tab 打开（.tb 按钮在场）→ PreviewBody 渲染 md（h1 文本在场）。
      await page.waitForSelector(".tb", { timeout: 8000 });
      await page.waitForSelector("text=Mermaid Demo", { timeout: 8000 });

      console.log("== ③ mermaid 自动渲染 ==");
      // 合法块：mermaid 图 svg（render 注入 id="mmd-N"，与 header 内 Copy/Check 小图标区分）。
      // svg 出现即渲染完成（动态 import 首拉 chunk，waitFor 覆盖）。
      const validBlock = codeBlocks(page).first();
      const mmdSvg = validBlock.locator('svg[id^="mmd-"]');
      await mmdSvg.waitFor({ timeout: 15000 });
      const geo = await mmdSvg.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      });
      check(
        "1a 合法 flowchart 块出图（svg 尺寸非零）",
        geo.w > 0 && geo.h > 0,
        `w=${geo.w} h=${geo.h}`,
      );
      const gonePre = await validBlock.locator("pre").count();
      check("1b 渲染成功后源码 pre 被图替换", gonePre === 0, `pre count=${gonePre}`);

      // 非法块：错误行（i18n "Mermaid render failed"）+ 源码 pre 保留。
      const invalidBlock = codeBlocks(page).nth(1);
      await invalidBlock.getByText("Mermaid render failed").waitFor({ timeout: 15000 });
      check("1c 非法块错误行在场（Mermaid render failed）", true);
      const kept = await invalidBlock.locator("pre").innerText();
      check(
        "1d 非法块源码 pre 保留",
        kept.includes("this is not a valid diagram"),
        kept.slice(0, 40).replace(/\n/g, "\\n"),
      );

      // 复制按钮仍复制源码（渲染态不破坏代码能力）——仅断言按钮在场（渲染态 svg 替换了 pre，
      // copy 按钮与语言标签恒在 header）。
      const copyBtns = await page.getByRole("button", { name: "Copy code" }).count();
      check("1e 两个 CodeBlock 复制按钮恒在", copyBtns === 2, `count=${copyBtns}`);
      await ctx.close();
    }

    // ── Part 2+3 移动 390：② 面板钮 panel-right + ① aux 三钮 ──
    {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        locale: "zh-CN",
      });
      const page = await ctx.newPage();
      await setup(page);
      await page.goto(`${ORIGIN}/projects/${P}`);
      await login(page);
      await clean(page);
      await page.reload();
      await page.waitForSelector('[data-inspection-panel="closed"]', {
        state: "attached",
        timeout: 10000,
      });

      console.log("== ② 检视面板钮右侧形制 ==");
      // innerHTML 序列化差异（浏览器把 <path/> 展开为 <path></path>）→ 两边过 DOMParser
      // 规范化后对比形状。
      const svgBodyEq = (page, loc, expected) =>
        loc.evaluate((el, exp) => {
          const norm = (h) =>
            new DOMParser().parseFromString(`<svg>${h}</svg>`, "image/svg+xml").documentElement
              .innerHTML;
          return norm(el.innerHTML) === norm(exp);
        }, expected);
      const panelBtnSvg = page.getByLabel("检视面板", { exact: true }).locator("svg").first();
      const panelRight = await svgBodyEq(page, panelBtnSvg, LUCIDE_ICONS["panel-right"].body);
      check(
        "2a 面板钮 svg = panel-right body（非 panel-left）",
        panelRight &&
          (await svgBodyEq(page, panelBtnSvg, LUCIDE_ICONS["panel-left"].body)) === false,
      );

      console.log("== ① aux 工具条三钮 Lucide 化 ==");
      await page.getByLabel("检视面板", { exact: true }).click();
      await page.waitForSelector('[data-inspection-panel="open"]', { timeout: 5000 });
      // panel 滑入动画（450ms）+ 余量后再取几何（frontend-notes §18）。
      await page.waitForTimeout(700);
      await page.locator("button.frow", { hasText: "README.md" }).first().click();
      await page.getByRole("button", { name: "编辑", exact: true }).waitFor({ timeout: 8000 });
      await page.getByRole("button", { name: "编辑", exact: true }).click();
      // CodeEditor lazy 挂载（CodeMirror 在场）→ aux 条出现。
      await page.locator(".aux").waitFor({ timeout: 10000 });
      const auxSpec = [
        { label: "撤销", body: LUCIDE_ICONS["undo-2"].body },
        { label: "重做", body: LUCIDE_ICONS["redo-2"].body },
        { label: "收起键盘", body: LUCIDE_ICONS["chevron-down"].body },
      ];
      for (const { label, body } of auxSpec) {
        const btn = page.locator(".aux button", { hasText: label });
        const cnt = await btn.count();
        if (cnt !== 1) {
          check(`3 ${label} 钮唯一在场`, false, `count=${cnt}`);
          continue;
        }
        const shapeEq = await btn
          .locator("svg")
          .first()
          .evaluate((el, exp) => {
            const norm = (h) =>
              new DOMParser().parseFromString(`<svg>${h}</svg>`, "image/svg+xml").documentElement
                .innerHTML;
            return norm(el.innerHTML) === norm(exp);
          }, body);
        const size = await btn
          .locator("svg")
          .first()
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
          });
        check(
          `3 ${label} 钮 svg 形状对 + 显式尺寸非零`,
          shapeEq && size.w > 0 && size.h > 0,
          `w=${size.w} h=${size.h}`,
        );
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: PASS ${pass} / FAIL ${fail} — ${fail === 0 ? "ALL PASS" : "有 FAIL"}`);
  process.exit(fail === 0 ? 0 : 1);
})();
