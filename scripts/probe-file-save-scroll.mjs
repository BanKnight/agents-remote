// 探针：保存 md 文件后 CodeMirror 滚动位置保持（不在保存后跳回文件开头）。
//
// 根因（已修）：save onSuccess 里 setEditContent(undefined) 在 preview refetch 完成前执行，
// editValue 短暂回落到旧服务端内容；@uiw/react-codemirror 对受控 value 变化做全文档 replace
// （from:0 → 整篇），滚动锚点失效 → 保存后滚动跳回开头。修法：await preview refetch 把新内容
// 拉回缓存后再清 editContent，editValue 与编辑器 doc 相等 → 不 replace → 滚动保留。
//
// 断言（zh-CN + iPhone 12 Pro 390×844，全新 context 无 SW）：
//  1. md 文件 source 模式 CodeMirror 可滚动（内容足够长）。
//  2. 滚动到中部后编辑内容，Save 可点（isDirty）。
//  3. 保存后 CodeMirror scrollTop 保持（不回落 0）——核心断言。
//  4. 编辑内容保存后仍在文档中（未被中间回落丢弃）。
//
// preview mock 延迟 350ms：放大「保存后 refetch 完成前」的窗口，旧实现必然暴露中间回落；
// 新实现 await refetch 后才清，无论延迟多久滚动都保持。
//
// 用法：bun scripts/probe-file-save-scroll.mjs
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

const lines = ["# Doc", ""];
for (let i = 1; i <= 120; i++) {
  lines.push(
    `Line ${i}: This is a placeholder paragraph with some content to make the document tall enough to scroll.`,
  );
}
const INITIAL_MD = lines.join("\n");

async function setup(page) {
  const state = { updatedContent: null };
  // page.route 正则匹配完整 URL（含 origin），不能带 ^ 锚定路径开头。
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1"], candidates: [] }),
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
        entries: [{ name: "doc.md", path: "doc.md", type: "file", hidden: false, size: 2048 }],
      }),
    }),
  );
  // preview：保存后 refetch 返回保存请求里记录的 content（= 编辑器 doc），否则新内容与
  // 编辑器不一致会触发 replace；350ms 延迟放大中间回落窗口（旧实现必暴露，新实现免疫）。
  await page.route(/\/api\/projects\/proj1\/files\/preview(?:\?.*)?$/, async (r) => {
    await new Promise((res) => setTimeout(res, 350));
    const url = new URL(r.request().url());
    const path = url.searchParams.get("path") ?? "";
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "text",
        projectName: "proj1",
        path,
        name: path.split("/").pop(),
        size: 2048,
        content: state.updatedContent ?? INITIAL_MD,
      }),
    });
  });
  await page.route(/\/api\/projects\/proj1\/files\/save$/, (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    state.updatedContent = body.content;
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entry: {
          name: body.path.split("/").pop(),
          path: body.path,
          type: "file",
          hidden: false,
          size: 2048,
        },
      }),
    });
  });
  return state;
}

async function openProjectFilesTab(page) {
  await page.goto(`${WEB_ORIGIN}/projects/proj1`);
  await page.waitForSelector("nav[aria-label]", { timeout: 8000 });
  await page
    .getByRole("tab", { name: /^文件$|^Files$/ })
    .or(page.getByText(/^文件$|^Files$/, { exact: true }).first())
    .first()
    .click({ timeout: 5000 })
    .catch(async () => {
      await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[role="tab"], button'));
        const el = els.find((n) => /^(文件|Files)$/.test((n.textContent ?? "").trim()));
        if (el) el.click();
      });
    });
  await page.waitForSelector("aside", { timeout: 8000 });
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const page = await ctx.newPage();
    await setup(page);
    await page.goto(`${WEB_ORIGIN}/`);
    await page
      .getByLabel("密码")
      .or(page.getByLabel("Password"))
      .fill(await readAppPassword());
    await page.getByRole("button", { name: /解锁|Unlock/ }).click();
    await page.waitForTimeout(700);

    console.log("\n===== 打开项目 → 文件 tab → doc.md 预览 =====");
    await openProjectFilesTab(page);
    await page.locator("aside").getByText("doc.md", { exact: true }).first().click();
    await page.waitForSelector('section[aria-label="File preview"]', { timeout: 8000 });
    await page
      .locator('section[aria-label="File preview"]')
      .getByRole("button", { name: "源码" })
      .click();
    await page.waitForSelector(".cm-scroller", { timeout: 10000 });

    console.log("\n===== CodeMirror 滚动到中部 + 编辑 =====");
    await page.waitForFunction(
      () => {
        const s = document.querySelector(".cm-scroller");
        return s && s.scrollHeight > 600;
      },
      null,
      { timeout: 8000 },
    );
    const scroller = page.locator(".cm-scroller");
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight * 0.4;
    });
    const before = await scroller.evaluate((el) => el.scrollTop);
    record(before > 50, `编辑器可滚动且已滚到中部（scrollTop=${Math.round(before)}）`);
    // 点可视区中部（避开左侧 gutter），光标落在当前可见行，输入触发 isDirty。
    await scroller.click({ position: { x: 140, y: 60 } });
    await page.keyboard.type("hello ");
    await page.waitForTimeout(200);
    const docHasEdit = await page.evaluate(
      () => document.querySelector(".cm-content")?.textContent?.includes("hello") ?? false,
    );
    record(docHasEdit, "编辑器已输入内容（isDirty 触发）");

    console.log("\n===== 保存后滚动位置保持 =====");
    await page.waitForFunction(
      () => {
        const btns = Array.from(
          document.querySelectorAll('section[aria-label="File preview"] button'),
        );
        const save = btns.find((b) => (b.textContent ?? "").trim() === "保存");
        return save && !save.disabled;
      },
      null,
      { timeout: 8000 },
    );
    await page
      .locator('section[aria-label="File preview"]')
      .getByRole("button", { name: "保存" })
      .click();
    // "已保存" 出现 = onSuccess 已跑；再等 refetch（350ms）+ setEditContent 完成。
    await page.waitForFunction(
      () => {
        const btns = Array.from(
          document.querySelectorAll('section[aria-label="File preview"] button'),
        );
        return btns.some((b) => (b.textContent ?? "").trim() === "已保存");
      },
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(900);
    const after = await scroller.evaluate((el) => el.scrollTop);
    record(
      Math.abs(after - before) <= 1,
      `保存后滚动位置保持（before=${Math.round(before)} after=${Math.round(after)}）`,
    );
    const docAfter = await page.evaluate(
      () => document.querySelector(".cm-content")?.textContent ?? "",
    );
    record(docAfter.includes("hello"), `编辑内容保存后仍在文档中（含 hello）`);
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
