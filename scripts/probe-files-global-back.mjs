// 探针：全局 /files 文件预览浮窗（MobileFileFocus）的返回目标（2026-09-30 用户反馈
// 「在全局文件中，预览文件后，返回的却不是全局文件」）。
//
// 根因：MobileFileFocus 的 back/✕ 写死 navigate /projects/$key（项目工作台）——注释声称
// 「返回回全局文件树（/files）」但实现从未跟上。修复：useWorkbenchBack pop 优先回来源
//（主路径 /files push 进来 → 回 /files；项目工作台跨项目打开 → 回该项目），深链直达无来路
// 时兜底 /files。
//
// 断言（移动 390×844，mock preview API，真实登录加载构建产物）：
//  1. 主路径：底部 nav「文件」→ proj1 → 点文件 → 预览浮窗 → 返回 → URL 回 /files 且列表在场
//     （pop 命中，来源是 push）。
//  2. cwd 记忆保持：返回后仍停在 proj1 目录内（globalFilesPath 不被返回动作破坏）。
//  3. 深链兜底：直达 /files/file/$（无来路）→ 返回 → 兜底回 /files。
//
// 用法：bun scripts/probe-files-global-back.mjs
import { chromium } from "@playwright/test";
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

const HTML_CONTENT = `<!DOCTYPE html>
<html><head><title>probe</title></head><body><p id="probe-marker">probe-file</p></body></html>`;

async function setup(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1"], candidates: [] }),
    }),
  );
  await page.route(/\/api\/root\/files(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectName: "",
        path: "",
        parentPath: null,
        entries: [{ name: "proj1", path: "proj1", type: "directory", hidden: false, size: 0 }],
      }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/files(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectName: "proj1",
        path: "",
        parentPath: null,
        entries: [
          { name: "index.html", path: "index.html", type: "file", hidden: false, size: 64 },
        ],
      }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/files\/preview(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "text",
        projectName: "proj1",
        path: "index.html",
        name: "index.html",
        size: 64,
        content: HTML_CONTENT,
      }),
    }),
  );
}

// 登录 → 底部 nav「文件」→ proj1 → 点文件 → 预览浮窗在场（主路径 push 链）。
async function openPreviewViaFilesNav(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("navigation").getByText("文件", { exact: true }).click();
  await page.locator(".gfrow button", { hasText: "proj1" }).waitFor({ timeout: 8000 });
  await page.locator(".gfrow button", { hasText: "proj1" }).click();
  const row = page.locator(".frow .p", { hasText: "index.html" });
  await row.waitFor({ timeout: 8000 });
  await row.click();
  await page.locator('iframe[title="Sandboxed HTML render"]').waitFor({ timeout: 10000 });
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
      isMobile: true,
      hasTouch: true,
    });

    console.log("\n===== 1. 主路径：/files → 预览 → 返回（pop 优先回 /files） =====");
    const page = await ctx.newPage();
    await setup(page);
    await openPreviewViaFilesNav(page);
    record(
      /\/files\/file\//.test(new URL(page.url()).pathname),
      "点文件后进入预览浮窗 URL（/files/file/proj1/index.html）",
    );
    // 批 3 预览 nav 改造后 back = 父目录名（根文件 → 「服务器根」），不再是「返回文件列表」。
    const backBtn = page.locator(".nav .back");
    const backText = (await backBtn.textContent())?.trim();
    record(
      backText === "服务器根",
      `批3 语义：back=父目录名（根文件 → 「服务器根」），实际「${backText}」`,
    );
    await backBtn.click();
    await page.waitForTimeout(400);
    record(
      new URL(page.url()).pathname === "/files",
      `返回后 URL = /files（实际 ${page.url()}）；修复前 = /projects/proj1`,
    );
    record(
      await page.locator(".frow .p", { hasText: "index.html" }).isVisible(),
      "返回后文件列表在场（pop 回 /files 且 cwd=proj1 渲染目录内容）",
    );

    console.log("\n===== 2. cwd 记忆保持：返回后仍在 proj1 目录内 =====");
    record(
      await page.locator(".frow .p", { hasText: "index.html" }).isVisible(),
      "返回后仍停在 proj1 目录（cwd 记忆未被返回动作重置）",
    );
    await page.close();

    console.log("\n===== 3. 深链兜底：直达 /files/file/$ 无来路 → 返回 → /files =====");
    const page2 = await ctx.newPage();
    await setup(page2);
    // 复用同 ctx 已登录 cookie：深链可能免密直达（无密码框），race 后按需登录。
    await page2.goto(`${WEB_ORIGIN}/files/file/proj1/index.html`);
    const pwdInput = page2.locator('input[type="password"]');
    if (await pwdInput.waitFor({ state: "visible", timeout: 3000 }).catch(() => null)) {
      await pwdInput.fill(await readAppPassword());
      await page2.getByRole("button", { name: "登录" }).click();
    }
    await page2.locator('iframe[title="Sandboxed HTML render"]').waitFor({ timeout: 10000 });
    await page2.locator(".nav .back").click();
    await page2.waitForTimeout(400);
    record(
      new URL(page2.url()).pathname === "/files",
      `深链返回兜底 URL = /files（实际 ${page2.url()}）；修复前 = /projects/proj1`,
    );
    await page2.close();
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
