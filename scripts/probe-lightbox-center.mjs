// 探针：image-lightbox 桌面端全屏居中形态（2026-09-10，用户报「点开后桌面端偏左」）。
// 诊断结论：DialogContent 全屏覆盖串漏 sm:max-w-none → base 的 sm:max-w-lg 残留，
// 桌面被钳 512px；且 inset-0 纯 CSS 输给 left-1/2（依赖 twMerge 去重，覆盖串必须
// 与 FullscreenReader 同款三件套：inset-0 + translate-x/y-0 + max-w-none sm:max-w-none）。
//
// 验证：① twMerge 合并真实 base+override 后无残留冲突类；② 构建产物 CSS 中
// sm:max-w-none 落盘；③ DOM 复现 merged 串 → 盒子几何 = 全屏（0,0,viewport）。
// 密码由脚本自读（env → config.yaml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-lightbox-center.mjs
import { chromium } from "@playwright/test";
// twMerge 只装在 web 包（bun isolated installs）：从 web 的 node_modules 相对定位，
// probe 文件本身在 scripts/（根目录解析不到该依赖）。
import { twMerge } from "../web/node_modules/tailwind-merge/dist/bundle-mjs.mjs";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

const DESKTOP_CTX = {
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
};

// 与 ui/dialog.tsx DialogContent base + ui/image-lightbox.tsx ImageLightbox override 一致。
const BASE =
  "pointer-events-auto fixed left-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 outline-none sm:max-w-lg";
const OVERRIDE =
  "fixed inset-0 z-[100] max-w-none sm:max-w-none w-full translate-x-0 translate-y-0 flex flex-col border-0 bg-black/95 p-0";

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /解锁|Unlock/ }).click();
  await page.waitForTimeout(700);
}

async function run() {
  // ── 1. twMerge 合并断言（node 侧，覆盖串残留检查）────────────────────────
  console.log("===== 1. twMerge 合并：冲突 base 类必须被剔除 =====");
  const merged = twMerge(BASE, OVERRIDE);
  const leaked = [
    "left-1/2",
    "top-1/2",
    "-translate-x-1/2",
    "-translate-y-1/2",
    "sm:max-w-lg",
  ].filter((c) => merged.split(" ").includes(c));
  record(leaked.length === 0, `冲突 base 类全部剔除（残留: ${leaked.join(",") || "无"}）`);
  record(merged.split(" ").includes("sm:max-w-none"), "sm:max-w-none 保留（解除桌面 512px 钳制）");
  record(merged.split(" ").includes("inset-0"), "inset-0 保留（全屏定位）");
  record(merged.split(" ").includes("flex"), "flex 保留（覆盖 base grid）");

  // ── 2. DOM 几何断言（真实浏览器 + 构建产物 CSS）─────────────────────────
  console.log("===== 2. DOM 几何：merged 串在构建产物 CSS 下的盒子 =====");
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext(DESKTOP_CTX);
    const page = await ctx.newPage();
    await login(page); // 真实环境加载构建产物 CSS（utility 必须真实落盘）
    await page.goto(`${WEB_ORIGIN}/projects`);
    await page.waitForTimeout(800);

    const geo = await page.evaluate((className) => {
      const div = document.createElement("div");
      div.className = className;
      document.body.appendChild(div);
      const cs = getComputedStyle(div);
      const rect = div.getBoundingClientRect();
      return {
        left: cs.left,
        top: cs.top,
        right: cs.right,
        bottom: cs.bottom,
        maxWidth: cs.maxWidth,
        display: cs.display,
        transform: cs.transform,
        rectX: rect.x,
        rectY: rect.y,
        rectW: rect.width,
        rectH: rect.height,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    }, merged);
    console.log(JSON.stringify(geo, null, 2));

    record(geo.left === "0px" && geo.top === "0px", `left/top = 0（当前 ${geo.left}/${geo.top}）`);
    record(geo.maxWidth === "none", `max-width = none（当前 ${geo.maxWidth}，512px 即残留 bug）`);
    record(
      Math.abs(geo.rectX) < 0.5 && Math.abs(geo.rectY) < 0.5,
      `盒子锚在视口原点（x=${geo.rectX}, y=${geo.rectY}）`,
    );
    record(
      Math.abs(geo.rectW - geo.vw) < 0.5 && Math.abs(geo.rectH - geo.vh) < 0.5,
      `盒子铺满视口（${geo.rectW}x${geo.rectH} vs ${geo.vw}x${geo.vh}）`,
    );
    record(geo.display === "flex", `display = flex（当前 ${geo.display}）`);
  } finally {
    await browser.close();
  }

  console.log(allPass ? "\nPASS" : "\nFAIL");
  process.exit(allPass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
