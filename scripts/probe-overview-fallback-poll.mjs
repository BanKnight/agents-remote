// 一次性行为验证（2026-11-12 模式切换菜单误报排障）：WorkbenchRoute 根级 overview
// 兜底轮询在**项目视图**生效——WS 断线时 status 的唯一 REST 兜底（修复前缺失）。
// 断言：登录 → 进 agents-remote 项目工作台（非全局视图）→ 15s 内 /api/overview 请求 ≥2
//（初始 1 次 + 10s interval ≥1 次）。
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const browser = await chromium.launch({ executablePath: EXEC });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  let overviewRequests = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/overview") overviewRequests += 1;
  });

  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1200);

  // 进项目视图（非 global scope）——修复前此视图 overview 恒冻结。
  await page.goto(`${ORIGIN}/projects/agents-remote`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const baseline = overviewRequests;
  console.log(`初始加载 overview 请求数: ${baseline}`);

  await page.waitForTimeout(15_000); // 跨一个 10s interval 边界
  const polled = overviewRequests - baseline;
  console.log(`15s 内项目视图轮请新增请求数: ${polled}`);

  const ok = baseline >= 1 && polled >= 1;
  console.log(ok ? "PASS" : "FAIL", "— 根级兜底轮询", ok ? "在项目视图生效" : "未生效");
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
}
