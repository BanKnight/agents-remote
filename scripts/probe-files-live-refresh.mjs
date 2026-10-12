// 探针：文件面板实时刷新（2026-10-12 反馈④）+ 编辑器换行按文件类型分档（反馈⑤）。
// Part 1：FilesPanel 的 files query 挂载后以 10s 间隔轮询（桌面放置不动也能看到外部变化；
//   桌面/移动共用同一 query 单点，多端同构——移动导航最稳故用移动 context 验证）。
// Part 2：md 源码态 .cm-content 带 cm-lineWrapping（散文折行）；ts 无（源码横向滚动）。
//   断言 scope 到 file-preview-pane 容器（全文档查询会被导航残留 DOM 满足）。
// Part 3：完成后留源码态（反馈②原路返回）+ 滚动位保持（editSession 重建实例不跳顶，
//   review P2：留源码态后跳顶对用户原地可见）。
// PASS/FAIL 断言式；bun scripts/probe-files-live-refresh.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = "http://127.0.0.1:43012";
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
// README 初始内容撑到可滚动（Part 3 断言「完成后滚动位保持」的前提）。
const LONG_MD = ["# 标题", ""];
for (let i = 1; i <= 60; i++) {
  LONG_MD.push(`第 ${i} 行：用来把文档撑到足够滚动高度的占位段落内容。`);
}
const LONG_MD_TEXT = LONG_MD.join("\n");
const ENTRIES = [
  { name: "README.md", type: "file", path: "README.md", size: 64, mtimeMs: now - 3600e3 },
  { name: "app.ts", type: "file", path: "app.ts", size: 32, mtimeMs: now - 3600e3 },
];

function setup(page) {
  // 保存内容回填 preview（Part 3 完成后 refetch 拉回编辑后内容，避免旧内容触发文档 replace）。
  const state = { updatedMd: null };
  void page.route(/\/api\/overview$/, (r) =>
    r.fulfill(json({ projectNames: ["proj1"], candidates: [] })),
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
    r.fulfill(json({ projectName: "proj1", path: "", parentPath: null, entries: ENTRIES })),
  );
  void page.route(/\/api\/projects\/proj1\/files\/preview\?.*path=README\.md/, (r) =>
    r.fulfill(
      json({
        type: "text",
        projectName: "proj1",
        path: "README.md",
        name: "README.md",
        size: 64,
        content: state.updatedMd ?? LONG_MD_TEXT,
        mtimeMs: now,
      }),
    ),
  );
  void page.route(/\/api\/projects\/proj1\/files\/preview\?.*path=app\.ts/, (r) =>
    r.fulfill(
      json({
        type: "text",
        projectName: "proj1",
        path: "app.ts",
        name: "app.ts",
        size: 32,
        content: "const a = 1;\nconst b = 2;\n",
        mtimeMs: now,
      }),
    ),
  );
  void page.route(/\/api\/projects\/proj1\/files\/save$/, (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    state.updatedMd = body.content;
    return r.fulfill(
      json({
        entry: { name: "README.md", path: "README.md", type: "file", hidden: false, size: 64 },
      }),
    );
  });
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  setup(page);
  // Part 1 计数：/files 列表请求（$ 锚排除 /files/preview）。
  let filesCalls = 0;
  page.on("request", (r) => {
    if (/\/api\/projects\/proj1\/files(?:\?.*)?$/.test(r.url())) filesCalls++;
  });

  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("navigation").getByText("文件", { exact: true }).click();
  await page.locator(".gfrow button", { hasText: "proj1" }).waitFor({ timeout: 8000 });
  await page.locator(".gfrow button", { hasText: "proj1" }).click();
  await page.locator(".frow .p", { hasText: "README.md" }).waitFor({ timeout: 8000 });

  console.log("== Part 1：files 列表 10s 轮询 ==");
  check("挂载后初始拉取 1 次", filesCalls === 1, `calls=${filesCalls}`);
  const t0 = Date.now();
  while (filesCalls < 2 && Date.now() - t0 < 16000) await page.waitForTimeout(500);
  check("放置不动 16s 内轮询再拉（≥2 次）", filesCalls >= 2, `calls=${filesCalls}`);

  console.log("== Part 2：换行按文件类型分档 ==");
  // push 预览容器锚点：全部编辑器断言 scope 到容器内（全文档 querySelector 会被导航
  // 退出后的残留 DOM 满足，假挂/假绿都可能）。
  const pane = page.locator('[data-role="file-preview-pane"]');
  await page.locator(".frow .p", { hasText: "README.md" }).click();
  const srcBtn = page.getByRole("button", { name: "源码", exact: true });
  await srcBtn.waitFor({ timeout: 8000 });
  await srcBtn.click();
  await pane.locator(".cm-editor").waitFor({ timeout: 10000 });
  const mdWrap = await page.evaluate(
    () =>
      document.querySelector('[data-role="file-preview-pane"] .cm-content.cm-lineWrapping') !==
      null,
  );
  check("md 源码态自动折行（cm-lineWrapping 在场）", mdWrap);

  await page.locator(".nav .back").click();
  const tsRow = page.locator(".frow .p", { hasText: "app.ts" });
  await tsRow.waitFor({ timeout: 8000 });
  await tsRow.click();
  await pane.locator(".cm-editor").waitFor({ timeout: 10000 });
  const tsWrap = await page.evaluate(
    () =>
      document.querySelector('[data-role="file-preview-pane"] .cm-content.cm-lineWrapping') !==
      null,
  );
  check("ts 源码态不折行（横向滚动）", !tsWrap);

  console.log("== Part 3：完成后留源码态（反馈②原路返回） ==");
  await page.locator(".nav .back").click();
  const mdRow = page.locator(".frow .p", { hasText: "README.md" });
  await mdRow.waitFor({ timeout: 8000 });
  await mdRow.click();
  await page.getByRole("button", { name: "源码", exact: true }).waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await page.locator(".cm-editor").waitFor({ timeout: 10000 });
  // 移动 L3 无「编辑」按钮：编辑入口 = tapToEdit（源码态点正文任意处，mobile-l3 §tapToEdit）。
  // 「完成/放弃」= nav 模式（/files push 语境 editingActions="nav"）渲染在容器 nav 栏，
  // 不在 pane 内（meta 模式才在 .emeta）→ scope .nav 定位，避开确认 sheet 同名钮双匹配。
  await pane.locator(".cm-content").click();
  const doneBtn = page.locator(".nav").getByRole("button", { name: "完成", exact: true });
  await doneBtn.waitFor({ timeout: 8000 });
  // 滚到中部再输入：完成 → editSession++ 重建实例（清 undo 栈），断言滚动位还原不跳顶
  //（2026-10-12 review P2：留源码态后跳顶从「闪帧即切走」变成用户停在原地可见）。
  const scroller = pane.locator(".cm-scroller");
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight * 0.5;
  });
  const beforeTop = await scroller.evaluate((el) => Math.round(el.scrollTop));
  await page.keyboard.type("编辑内容 ");
  await page.waitForTimeout(300);
  // 「完成」= dirty 即保存并退出编辑；保存完成后断言仍在源码态（未被强制切渲染）。
  await doneBtn.click();
  await doneBtn.waitFor({ state: "detached", timeout: 8000 });
  await page.waitForTimeout(600);
  // push 预览容器 data-role = file-preview-pane（l3-file-preview 是详情态容器）。
  const stillSourceAfterDone = await page.evaluate(
    () => document.querySelector('[data-role="file-preview-pane"] .cm-editor') !== null,
  );
  check("完成后留在源码态（cm-editor 在场）", stillSourceAfterDone);
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(150);
    samples.push(
      await page.evaluate(() => {
        const el = document.querySelector('[data-role="file-preview-pane"] .cm-scroller');
        return el ? Math.round(el.scrollTop) : null;
      }),
    );
  }
  console.log(`  [diag] scroll 曲线 before=${beforeTop}:`, samples.join(" → "));
  const afterTop = samples[samples.length - 1] ?? 0;
  // 口径：不跳 0、不超设、曲线收敛稳定（物理约束：退出编辑后 .emeta→.fmeta + 容器 pb
  // 变化让视口变高，scrollTop 可能被浏览器 clamp 到最大可滚量——内容锚点无更优解）。
  check(
    `完成后滚动位保持（before=${beforeTop} after=${afterTop}，跳 0/漂移即 fail）`,
    beforeTop > 50 &&
      afterTop > 50 &&
      afterTop <= beforeTop &&
      samples[samples.length - 1] === samples[samples.length - 2],
  );

  console.log("== Part 4：放弃后留源码态 ==");
  await pane.locator(".cm-content").click();
  const discardBtn = page.locator(".nav").getByRole("button", { name: "放弃", exact: true });
  await discardBtn.waitFor({ timeout: 8000 });
  // 先输入制造 dirty（无 dirty 的放弃直接退出、不弹确认 sheet——行为本身正确）。
  await page.keyboard.type("再编辑 ");
  await page.waitForTimeout(300);
  await discardBtn.click();
  // 确认 sheet（MobileSheet .msheet 内「放弃」confirm；编辑态钮已 pane scope，不与 sheet 同名钮双匹配）。
  const sheetConfirm = page.locator(".msheet button", { hasText: "放弃" });
  await sheetConfirm.waitFor({ timeout: 8000 });
  await sheetConfirm.click();
  await discardBtn.waitFor({ state: "detached", timeout: 8000 });
  await page.waitForTimeout(600);
  const stillSourceAfterDiscard = await page.evaluate(
    () => document.querySelector('[data-role="file-preview-pane"] .cm-editor') !== null,
  );
  check("放弃后留在源码态（cm-editor 在场）", stillSourceAfterDiscard);

  await ctx.close();
} finally {
  await browser.close();
}

console.log(fail === 0 ? `\nPASS (${pass}/${pass + fail})` : `\nFAIL (${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
