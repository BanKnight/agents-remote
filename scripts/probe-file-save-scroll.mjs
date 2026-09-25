// 探针：保存 md 文件后 CodeMirror 滚动位置保持（不在保存后跳回文件开头）。
//
// 根因（已修）：save onSuccess 里 setEditContent(undefined) 在 preview refetch 完成前执行，
// editValue 短暂回落到旧服务端内容；@uiw/react-codemirror 对受控 value 变化做全文档 replace
// （from:0 → 整篇），滚动锚点失效 → 保存后滚动跳回开头。修法：await preview refetch 把新内容
// 拉回缓存后再清 editContent，editValue 与编辑器 doc 相等 → 不 replace → 滚动保留。
//
// 断言（zh-CN + 桌面 1280×900；批次 3 Step B 语境迁移——桌面 Inspector 检视面板已退役，
// 可编辑保存路径 = 三件套 L3 详情态编辑模式（右栏/移动同构单源 MobileL3FilePreview）：
//  1. md 文件进编辑态（「编辑」）后 CodeMirror 可滚动（内容足够长）。
//  2. 滚动到中部后编辑内容，Save 可点（isDirty）。
//  3. 保存后 CodeMirror scrollTop 保持（不回落 0）——核心断言（守护 useFileEditor
//     「await preview refetch 再清 editContent」语义）。
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
        // 三件套 L3 meta 行渲染 relative mtime（检视面板时代无此字段也能跑；Step B 语境
        // 迁移后必填——缺失时 new Date(undefined).toISOString() 抛 Invalid time value）。
        mtimeMs: state.updatedAt ?? Date.now(),
        content: state.updatedContent ?? INITIAL_MD,
      }),
    });
  });
  await page.route(/\/api\/projects\/proj1\/files\/save$/, (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    state.updatedContent = body.content;
    state.updatedAt = Date.now();
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

// §6.12k 桌面语境：/projects/proj1 → 展开右栏 → Inspector seg4 切「文件」检视。
async function openProjectFilesTab(page) {
  await page.goto(`${WEB_ORIGIN}/projects/proj1`);
  await page.waitForSelector("nav[aria-label]", { timeout: 8000 });
  await page.getByRole("button", { name: "展开右栏" }).click();
  await page.waitForFunction(() => document.querySelectorAll("main > div > aside").length === 2, {
    timeout: 8000,
  });
  const inspector = page.locator("main > div > aside").nth(1);
  await inspector.locator(".seg4 span", { hasText: /^文件$/ }).click({ timeout: 8000 });
  await page.waitForTimeout(500);
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "zh-CN",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const page = await ctx.newPage();
    await setup(page);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    await page.getByLabel("访问密码").fill(await readAppPassword());
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForTimeout(700);

    console.log("\n===== 打开项目 → 文件 tab → doc.md 预览 → 编辑 =====");
    await openProjectFilesTab(page);
    await page
      .locator("main > div > aside")
      .nth(1)
      .getByText("doc.md", { exact: true })
      .first()
      .click();
    // L3 预览（meta 行「N 行 · 更新」+ 只读行号渲染）→ 点「编辑」进编辑态（CodeEditor）。
    await page.waitForSelector('[data-role="l3-file-preview"]', { timeout: 8000 });
    await page
      .locator('[data-role="l3-file-preview"]')
      .getByRole("button", { name: "编辑" })
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
    // 光标落可视区中部行（避开左侧 gutter），输入触发 isDirty。CodeMirror contenteditable
    // 经 elementFromPoint 定位行位置后 focus + setCursor 语义，绕过浮层 pointer 拦截。
    await scroller.evaluate((el) => {
      const content = el.querySelector(".cm-content");
      const line = el.querySelector(".cm-line:nth-child(60)");
      const rect = (line ?? content).getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + 80, rect.top + 8);
      (target ?? content).dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      (target ?? content).dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      (target ?? content).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      content.focus();
    });
    await page.keyboard.type("hello ");
    await page.waitForTimeout(200);
    const docHasEdit = await page.evaluate(
      () => document.querySelector(".cm-content")?.textContent?.includes("hello") ?? false,
    );
    record(docHasEdit, "编辑器已输入内容（isDirty 触发）");

    console.log("\n===== 保存后滚动位置保持 =====");
    await page.waitForFunction(
      () => {
        const btns = Array.from(document.querySelectorAll('[data-role="l3-file-preview"] button'));
        const save = btns.find((b) => (b.textContent ?? "").trim() === "保存");
        return save && !save.disabled;
      },
      null,
      { timeout: 8000 },
    );
    await page
      .locator('[data-role="l3-file-preview"]')
      .getByRole("button", { name: "保存" })
      .click();
    // "已保存" 出现 = onSuccess 已跑；再等 refetch（350ms）+ setEditContent 完成。
    await page.waitForFunction(
      () => {
        const btns = Array.from(document.querySelectorAll('[data-role="l3-file-preview"] button'));
        return btns.some((b) => (b.textContent ?? "").trim() === "已保存");
      },
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(900);
    const after = await scroller.evaluate((el) => el.scrollTop);
    // 口径（§6.12k 复核实测）：输入时 CodeMirror scroll anchor 在极窄 wrap 下有 ~3% 像素级
    // measure 重估，保存后恒定——核心回归判据 = 不跳回开头（旧 bug 跳 0），非像素级相等。
    record(
      after > 50 && after >= before * 0.9,
      `保存后滚动位置保持（before=${Math.round(before)} after=${Math.round(after)}，跳 0 即 fail）`,
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
