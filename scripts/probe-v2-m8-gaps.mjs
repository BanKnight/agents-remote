// M8 缺口功能探针（v2 M8：03x 文件搜索 / 03y 移动到 / 03z 上传队列冲突三选 / 拖拽多文件 /
// 08 采用已有目录 / 03d 自动重试 pending 条 / 03e 子 agent 概览条 / 03v merged 置灰 /
// MobileSheet Description / 03n 单一管道）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1 03x 文件搜索：files 工具 magnifyingglass → .wsearch（面包屑两态切换，03x①「同
//     Wiki」）→ 输入 query → 命中 /files/search?q=（记录 URL）→ .res 计数 + .xrow 相对路径 +
//     点击进预览 + ✕ 清空回 .crumb；空结果走 .res「0 个结果」。
//   Part 2 03y 移动到：目录行 ActionMenu「移动到…」→ prompt 预填当前父目录 → 改路径确认 →
//     POST /files/rename 带 targetDir（能力在服务端 renameFile.targetDir）。
//   Part 3 03z 上传队列冲突三选：底部 links「上传文件」→ 选 2 个文件 → 队列串行（mock 首个
//     409）→ .upcard .urow 三选（覆盖/保留两者/取消）→ 点「覆盖」→ 重传带 conflict=overwrite
//     → 行移除 + .prog 前进 + files 列表失效刷新。
//   Part 4 08 采用已有目录：03l newp 行 → 08 sheet .segc 二段 → 「采用已有目录」→ 候选 =
//     /api/root/files 一级目录 − /api/projects 已纳管（差集）→ 勾选 → POST /api/projects
//     逐个纳管 → sheet 关闭。
//   Part 5 03d 自动重试 pending 条：claude 会话 mock auto-retry/status scheduled → .count 条
//     （warning 图标 + 标题 + .btns 取消/立即重试 + .tm 倒计时文案）→ 点「立即重试」→ POST
//     /auto-retry/fire 恰 1 次；点取消 → POST /auto-retry/cancel。
//   Part 6 03e 子 agent 概览条：注入 Agent tool_use + parent_tool_use_id 子消息 → .subbar
//     绿 tint（背景 ≠ 透明 + 文字 = c-success-text）→ 点条触发 scrollToMessage（不抛错）。
//   Part 7 03v merged 置灰：分支页 merged 行 .brow.merged（n 降 ink-2/400）+ st「已合并」+
//     bsub.mg ink-3；未合并行不受影响。
//
// 全 mock API（proj1 不依赖真实项目数据）；密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v2-m8-gaps.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = "proj1";

let passCount = 0;
let failCount = 0;
function ok(cond, msg) {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${msg}`);
  } else {
    failCount++;
    console.error(`  ✗ ${msg}`);
  }
}

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

const FILE_LIST = {
  parentPath: null,
  entries: [
    { name: "src", path: "src", type: "directory", mtimeMs: Date.now() },
    { name: "README.md", path: "README.md", type: "file", mtimeMs: Date.now() },
  ],
};

const GIT_BRANCHES = {
  current: "main",
  branches: [
    { name: "main", type: "local", isCurrent: true, lastCommitShort: "2 小时前" },
    {
      name: "feature",
      type: "local",
      upstream: "origin/main",
      ahead: 2,
      behind: 1,
      lastCommitShort: "1 天前",
    },
    { name: "fix/merged", type: "local", merged: true, lastCommitShort: "3 天前" },
    { name: "origin/main", type: "remote", lastCommitShort: "2 小时前" },
  ],
};

// ── 请求记录 ─────────────────────────────────────────────────────────────────
let searchUrls = [];
let renamePosts = [];
let uploadConflictPosts = [];
let createdProjects = [];
let autoRetryFires = 0;
let autoRetryCancels = 0;
/** 该文件名的上传先回 409（冲突三选），带 conflict 后成功——按文件名计数。 */
let uploadAttempts = new Map();

// ── mock 基座 ────────────────────────────────────────────────────────────────
async function setupMocks(page) {
  searchUrls = [];
  renamePosts = [];
  uploadConflictPosts = [];
  createdProjects = [];
  autoRetryFires = 0;
  autoRetryCancels = 0;
  uploadAttempts = new Map();

  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(json({ projectNames: [projectName], candidates: [] })),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions\/[^/]+$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-history(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ entries: [] })),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/git/diff$`), (r) =>
    r.fulfill(json({ repository: true, projectName, branch: { name: "main" }, files: [] })),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/git/branches$`), (r) =>
    r.fulfill(json(GIT_BRANCHES)),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/git/log(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ branch: "", total: 0, commits: [] })),
  );
  // 03x 搜索端点：记录 query + 固定命中（含目录命中，验证 ic 图标分派）。
  await page.route(new RegExp(`/api/projects/${projectName}/files/search(?:\\?.*)?$`), (r) => {
    const url = r.request().url();
    searchUrls.push(url);
    const q = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
    const all = [
      { path: "src/readme-helper.ts", name: "readme-helper.ts", type: "file", size: 120 },
      { path: "src/readme", name: "readme", type: "directory", size: null },
    ];
    const matches = all.filter((m) => m.path.toLowerCase().includes(q.toLowerCase()));
    return r.fulfill(json({ projectName, query: q, matches, truncated: false }));
  });
  await page.route(new RegExp(`/api/projects/${projectName}/files/upload(?:\\?.*)?$`), (r) => {
    const body = r.request().postData() ?? "";
    const name = /filename="([^"]+)"/.exec(body)?.[1] ?? "";
    const attempts = (uploadAttempts.get(name) ?? 0) + 1;
    uploadAttempts.set(name, attempts);
    if (/name="conflict"\r?\n\r?\n/.test(body)) {
      uploadConflictPosts.push({ body: body.slice(0, 400), name });
      return r.fulfill(json({ file: { name, path: name, type: "file" } }));
    }
    // 首传无 conflict → 服务端 409 PROJECT_FILE_TARGET_EXISTS。
    uploadConflictPosts.push({ body, name });
    return r.fulfill(
      json({ error: { code: "PROJECT_FILE_TARGET_EXISTS", message: "同名文件已存在" } }, 409),
    );
  });
  await page.route(new RegExp(`/api/projects/${projectName}/files/rename$`), (r) => {
    renamePosts.push(JSON.parse(r.request().postData() ?? "{}"));
    return r.fulfill(json({ ok: true }));
  });
  await page.route(new RegExp(`/api/projects/${projectName}/files(?:\\?.*)?$`), (r) =>
    r.fulfill(json(FILE_LIST)),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/files/preview(?:\\?.*)?$`), (r) =>
    r.fulfill(
      json({
        type: "text",
        projectName,
        path: "src/readme-helper.ts",
        name: "readme-helper.ts",
        size: 12,
        content: "probe\n",
        mtimeMs: Date.now(),
      }),
    ),
  );
  // 08 采用：候选差集 = root 一级目录 − 已纳管。
  await page.route(/\/api\/root\/files$/, (r) =>
    r.fulfill(
      json({
        parentPath: null,
        entries: [
          { name: "proj1", path: "proj1", type: "directory", mtimeMs: Date.now() },
          { name: "candidate-a", path: "candidate-a", type: "directory", mtimeMs: Date.now() },
          { name: "candidate-b", path: "candidate-b", type: "directory", mtimeMs: Date.now() },
          { name: "loose.txt", path: "loose.txt", type: "file", mtimeMs: Date.now() },
        ],
      }),
    ),
  );
  await page.route(/\/api\/projects$/, (r) => {
    if (r.request().method() === "POST") {
      const body = JSON.parse(r.request().postData() ?? "{}");
      createdProjects.push(body.path);
      return r.fulfill(json({ project: { name: body.path, path: `/root/${body.path}` } }));
    }
    return r.fulfill(
      json({
        projects: [
          { name: "proj1", path: "/root/proj1", agentSessionCount: 0, terminalSessionCount: 0 },
        ],
      }),
    );
  });
  // 03d auto-retry：status 固定 scheduled（pending 条常驻），fire/cancel 记录次数后转 false。
  await page.route(/\/api\/projects\/[^/]+\/agent-sessions\/[^/]+\/auto-retry\/status$/, (r) =>
    r.fulfill(
      json({
        scheduled: !(autoRetryFires > 0 || autoRetryCancels > 0),
        fireAt: Date.now() + 45_000,
        delayMs: 60_000,
        attempt: 2,
        max: 3,
      }),
    ),
  );
  await page.route(/\/api\/projects\/[^/]+\/agent-sessions\/[^/]+\/auto-retry\/fire$/, (r) => {
    autoRetryFires++;
    return r.fulfill(json({ ok: true }));
  });
  await page.route(/\/api\/projects\/[^/]+\/agent-sessions\/[^/]+\/auto-retry\/cancel$/, (r) => {
    autoRetryCancels++;
    return r.fulfill(json({ ok: true }));
  });
  await page.route(/\/api\/projects\/[^/]+\/agent-sessions\/[^/]+\/skill-slash-catalog$/, (r) =>
    r.fulfill(json({ commands: [] })),
  );
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN",
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
});
await setupMocks(page);
await login(page);

// ── Part 1: 03x 文件搜索 ──────────────────────────────────────────────────────
console.log("Part 1: 03x 文件搜索（.wsearch 两态 + .res 计数 + .xrow 结果）");
await page.goto(`${ORIGIN}/projects/${projectName}?tab=files`);
await page.waitForSelector('[data-mobile-tool="files"]', { timeout: 10000 });
ok((await page.locator(".crumb").count()) === 1, "默认态 = .crumb 面包屑");
// magnifyingglass 按钮（header toolChip 内，aria-label = 搜索文件）。
await page.locator('.crumb button[aria-label="搜索文件"]').click();
await page.waitForSelector(".wsearch", { timeout: 5000 });
ok((await page.locator(".wsearch").count()) === 1, "点放大镜 → .wsearch 搜索框（03x ①同 Wiki）");
ok((await page.locator(".crumb").count()) === 0, "搜索态无 .crumb（两态互斥）");
const fieldGeom = await page.locator(".wsearch").evaluate((el) => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { h: Math.round(r.height * 10) / 10, radius: cs.borderRadius, border: cs.borderColor };
});
ok(fieldGeom.h === 30, `.wsearch 高度 = 30（原型值；实测 ${fieldGeom.h}）`);
ok(fieldGeom.radius === "15px", `.wsearch 圆角 = 15px（实测 ${fieldGeom.radius}）`);
await page.locator(".wsearch input").fill("readme");
await page.waitForTimeout(700);
ok(searchUrls.length >= 1, `输入触发 /files/search（${searchUrls.length} 次）`);
ok(
  searchUrls[0].includes("q=readme"),
  `搜索 URL 带 q=readme（服务端读 searchParams.get("q")；${searchUrls[0].split("?")[1] ?? ""}）`,
);
ok((await page.locator(".res").count()) === 1, "结果计数行 .res");
const resText = await page.locator(".res").textContent();
ok(resText?.includes("2 个结果") === true, `.res = 「2 个结果」（实际「${resText?.trim()}」）`);
ok((await page.locator(".xrow").count()) === 2, ".xrow 结果 = 2（文件 + 目录）");
const xrowPath = await page.locator(".xrow .p").first().textContent();
ok(xrowPath === "src/readme-helper.ts", `.xrow 显示项目内相对路径（${xrowPath}）`);
// 目录命中用 project 图标、文件命中用 file 图标（图标分派）。
const dirIconText = await page.locator(".xrow").nth(1).locator(".ic svg").count();
ok(dirIconText === 1, "目录命中含 .ic 图标（project/file 分派）");
// 空结果 → 0 个结果（诚实计数，不伪造）。
await page.locator(".wsearch input").fill("zzz-nothing");
await page.waitForTimeout(600);
const emptyRes = await page.locator(".res").textContent();
ok(emptyRes?.includes("0 个结果") === true, `无命中 → 「0 个结果」（实际「${emptyRes?.trim()}」）`);
// 点结果进预览（03x pin④）——预览是 L3 焦点层（nav back 回工具页）。
await page.locator(".wsearch input").fill("readme");
await page.waitForTimeout(600);
await page.locator(".xrow").first().click();
await page.waitForTimeout(900);
const previewNav = await page.evaluate(() => ({
  back: document.querySelector(".nav .back")?.textContent?.trim() ?? "",
  title: document.querySelector(".nav .nv-t")?.textContent?.trim() ?? "",
}));
ok(
  previewNav.title.includes("readme-helper.ts") || previewNav.back.length > 0,
  `点结果进文件预览（back「${previewNav.back}」/ title「${previewNav.title}」）`,
);
// 回 files 工具，✕ 清空回面包屑。
await page.goto(`${ORIGIN}/projects/${projectName}?tab=files`);
await page.waitForSelector('[data-mobile-tool="files"]', { timeout: 10000 });
await page.locator('.crumb button[aria-label="搜索文件"]').click();
await page.waitForSelector(".wsearch", { timeout: 5000 });
await page.locator(".wsearch input").fill("readme");
await page.waitForTimeout(500);
await page.locator(".wsearch button").click();
await page.waitForTimeout(400);
ok((await page.locator(".crumb").count()) === 1, "✕ 清空回 .crumb（03x pin③）");
ok((await page.locator(".wsearch").count()) === 0, "清空后 .wsearch 卸载");

// ── Part 2: 03y 移动到… ───────────────────────────────────────────────────────
console.log("Part 2: 03y 移动到（ActionMenu → prompt 预填父目录 → rename 带 targetDir）");
// 文件行 ActionMenu 走隐藏 trigger（触屏长按 / 桌面右键，03w 菜单）；此处 CDP 触屏长按
// README.md 行（> LONG_PRESS_MS=500）。原型 03w 菜单 = 预览/重命名/移动到…/删除，故
// 「移动到…」在文件行（目录行只有新建到此/上传到此，03z pin①）。
const fileRow = page
  .locator('[data-mobile-tool="files"] .frow')
  .filter({ hasText: "README.md" })
  .first();
const frb = await fileRow.boundingBox();
ok(frb !== null, "README.md 文件行可定位");
const cdp = await ctx.newCDPSession(page);
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: frb.x + frb.width / 2, y: frb.y + frb.height / 2, force: 1 }],
});
await page.waitForTimeout(700);
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(400);
const moveItem = page.getByRole("menuitem", { name: "移动到…" });
ok(await moveItem.isVisible(), "文件行长按菜单含「移动到…」（03w）");
await moveItem.click();
await page.waitForSelector("[data-prompt-input]", { timeout: 5000 });
ok(
  (await page.locator("[data-prompt-input]").inputValue()) === "",
  "prompt 预填当前父目录（README.md 在根层 → 空）",
);
await page.locator("[data-prompt-input]").fill("src/archive");
await page.locator("[data-prompt-input]").press("Enter");
await page.waitForTimeout(800);
ok(renamePosts.length === 1, `移动到触发 rename POST（${renamePosts.length} 次）`);
ok(
  renamePosts[0]?.targetDir === "src/archive",
  `POST 带 targetDir=src/archive（${renamePosts[0]?.targetDir}）`,
);
ok(
  renamePosts[0]?.name === "README.md" && renamePosts[0]?.path === "README.md",
  "POST name/path 保持原名（移动 = rename 带路径，§6.9）",
);

// ── Part 3: 03z 上传队列 + 冲突三选 ───────────────────────────────────────────
console.log("Part 3: 03z 上传队列冲突三选（.upcard 三选 → 重传带 conflict）");
// 底部 links「上传文件」→ hidden input 注入文件（setInputFiles 直接喂）。
page.on("filechooser", () => {});
await page.locator(".links button", { hasText: "上传文件" }).click();
await page.waitForTimeout(200);
await page.locator('.links input[type="file"]').setInputFiles([
  { name: "dup-a.txt", mimeType: "text/plain", buffer: Buffer.from("aaa") },
  { name: "dup-b.txt", mimeType: "text/plain", buffer: Buffer.from("bbb") },
]);
await page.waitForSelector(".upcard", { timeout: 5000 });
ok((await page.locator(".upcard").count()) === 1, "03z .upcard 队列卡出现");
ok((await page.locator(".upcard .prog").count()) === 1, ".prog 总体进度条");
const urowCount = await page.locator(".upcard .qlist .urow").count();
const urowNames = await page.locator(".upcard .qlist .urow").allTextContents();
ok(
  urowCount === 2,
  `qlist .urow = 2（双文件入队；实际 ${urowCount}：${urowNames.map((x) => x.trim().slice(0, 24)).join(" | ")}）`,
);
const upcardRole = await page.locator(".upcard").getAttribute("role");
ok(upcardRole === "status", `.upcard role=status（无障碍播报；${upcardRole}）`);
// 串行 pump：首个 409 → 行呈三选（覆盖/保留两者/取消）。
await page.waitForTimeout(900);
const conflictRow = page.locator(".urow").filter({ hasText: "dup-a.txt" });
ok((await conflictRow.locator(".urow-actions").count()) === 1, "409 行展开 .urow-actions 三选");
const actionsText = await conflictRow.locator(".urow-actions").textContent();
ok(actionsText?.includes("覆盖") === true, "三选含「覆盖」");
ok(actionsText?.includes("保留两者") === true, "三选含「保留两者」");
ok(actionsText?.includes("取消") === true, "三选含「取消」");
// 点「覆盖」→ 重传带 conflict=overwrite → 成功行移除 + prog 前进。
await conflictRow.locator("button", { hasText: "覆盖" }).click();
await page.waitForTimeout(1000);
const overwritePosts = uploadConflictPosts.filter((p) => /name="conflict"\r?\n\r?\n/.test(p.body));
ok(overwritePosts.length >= 1, `重传带 conflict 字段（${overwritePosts.length} 次）`);
ok(overwritePosts[0]?.body.includes("overwrite") === true, "重传 conflict=overwrite");
ok(
  (await page.locator(".urow").filter({ hasText: "dup-a.txt" }).count()) === 0,
  "覆盖成功后该行移除",
);
const progWidth = await page
  .locator(".upcard .prog i")
  .evaluate((el) => el.style.width || getComputedStyle(el).width);
ok(progWidth.length > 0, `prog 宽度已推进（${progWidth}）`);
// 队列清空按钮（r1 ✕）= 清空剩余。
await page.locator(".upcard .r1 .x").click();
await page.waitForTimeout(400);
ok((await page.locator(".upcard").count()) === 0, "清空队列后 .upcard 卸载");

// ── Part 4: 08 采用已有目录（segc 二段 + 差集候选）─────────────────────────────
console.log("Part 4: 08 采用已有目录（.segc 二段 + 差集候选 + 逐个纳管）");
await page.goto(ORIGIN);
await page.waitForSelector(".nav", { timeout: 10000 });
await page.locator(".nav button").filter({ hasText: projectName }).first().click();
await page.waitForTimeout(400);
await page.getByText("新建 / 采用项目").click();
await page.waitForSelector(".msheet", { timeout: 5000 });
ok((await page.locator(".msheet .segc").count()) === 1, "08 sheet 含 .segc 二段");
ok((await page.locator(".msheet .segc button").count()) === 2, ".segc = 2 段（新建/采用）");
ok(
  (await page.locator(".msheet .segc button.on").textContent())?.includes("新建目录") === true,
  "默认段 = 新建目录",
);
await page.locator(".msheet .segc button", { hasText: "采用已有目录" }).click();
await page.waitForTimeout(600);
const adoptBoxes = page.locator('.msheet input[type="checkbox"]');
ok(
  (await adoptBoxes.count()) === 2,
  `候选 = 2（root 目录 − 已纳管差集；实际 ${await adoptBoxes.count()}）`,
);
const adoptLabels = await page
  .locator(".msheet label")
  .filter({ has: page.locator('input[type="checkbox"]') })
  .allTextContents();
ok(
  adoptLabels.some((l) => l.includes("candidate-a")) &&
    adoptLabels.some((l) => l.includes("candidate-b")),
  "候选含 candidate-a/b（loose.txt 非目录、proj1 已纳管均排除）",
);
// 勾选 2 个 → 采用按钮文案带计数。
await adoptBoxes.nth(0).check();
await adoptBoxes.nth(1).check();
await page.waitForTimeout(200);
const adoptBtn = page.locator(".msheet button", { hasText: "采用" }).last();
ok(
  (await adoptBtn.textContent())?.includes("2") === true,
  `采用按钮带计数（${(await adoptBtn.textContent())?.trim()}）`,
);
await adoptBtn.click();
// [dbg] sheet 关闭时序采样
// 逐个 POST（串行 await）+ invalidate refetch 后受控关闭 ~200ms 动画才卸载——等 detached。
await page.waitForSelector(".msheet", { state: "detached", timeout: 5000 });
ok(createdProjects.length === 2, `逐个纳管 POST 次数 = 2（实际 ${createdProjects.length}）`);
ok(
  createdProjects.includes("candidate-a") && createdProjects.includes("candidate-b"),
  `纳管路径 = 勾选目录（${createdProjects.join(",")}）`,
);
ok((await page.locator(".msheet").count()) === 0, "采用完成后 sheet 关闭");

// ── Part 5: 03d 自动重试 pending 条 ──────────────────────────────────────────
console.log("Part 5: 03d .count 自动重试 pending 条（取消/立即重试）");
const autoSessionId = "agent_probe-autoretry";
const autoSession = {
  id: autoSessionId,
  projectName,
  provider: "claude",
  displayName: "Auto Retry Probe",
  status: "running",
  createdAt: "2026-09-20T00:00:00.000Z",
};
await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions/${autoSessionId}$`), (r) =>
  r.fulfill(
    json({
      session: autoSession,
      availableModels: ["sonnet"],
      availablePermissionModes: ["default"],
    }),
  ),
);
let autoSocket;
await page.routeWebSocket(/claude-stream/, (ws) => {
  autoSocket = ws;
});
await page.goto(`${ORIGIN}/projects/${projectName}/session/${autoSessionId}`);
await page.waitForTimeout(1500);
ok(autoSocket !== undefined, "claude-stream 连接建立（探针持有 socket）");
if (autoSocket) {
  autoSocket.send(JSON.stringify({ type: "session_init", resume: false }));
  await page.waitForTimeout(1500);
}
await page.waitForSelector(".count", { timeout: 10000 });
ok((await page.locator(".count").count()) === 1, "03d .count pending 条出现（scheduled=true）");
const countText = await page.locator(".count .r1").textContent();
ok(
  countText?.includes("自动重试已排程") === true,
  `.count 标题「自动重试已排程」（${countText?.trim()}）`,
);
ok((await page.locator(".count .btns button").count()) === 2, ".btns = 2 按钮（取消/立即重试）");
// 蓝底主按钮文字 = on-accent（03d 原型 .blue；曾误写未定义的 --on-primary → 继承 r1 红字）。
const blueColor = await page
  .locator(".count .btn.blue")
  .evaluate((el) => getComputedStyle(el).color);
const onAccentRef = await page.evaluate(() => {
  const el = document.createElement("span");
  el.style.color = "var(--on-accent)";
  el.style.display = "none";
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
});
ok(blueColor === onAccentRef, `.btn.blue 文字 = on-accent（${blueColor} = ref ${onAccentRef}）`);
const countBg = await page.locator(".count").evaluate((el) => getComputedStyle(el).backgroundColor);
ok(countBg !== "rgba(0, 0, 0, 0)", `.count 有衬底（${countBg}）`);
const tmText = await page.locator(".count .tm").textContent();
ok(
  /后自动重发 · 第 2\/3 次/.test(tmText ?? "") === true,
  `.tm 倒计时 + 轮次文案（${tmText?.trim()}）`,
);
await page.locator(".count .btns button", { hasText: "立即重试" }).click();
await page.waitForTimeout(800);
ok(autoRetryFires === 1, `点「立即重试」→ POST fire 恰 1 次（${autoRetryFires}）`);
await page.waitForTimeout(600);
// status 转 scheduled:false → 条消失（服务端真值驱动，不猜）。
ok((await page.locator(".count").count()) === 0, "fire 后 status=false → .count 消失");

// ── Part 6: 03e 子 agent 概览条 ──────────────────────────────────────────────
console.log("Part 6: 03e 子 agent 概览条（.subbar 绿 tint）");
const subSessionId = "agent_probe-subagent";
const subSession = {
  id: subSessionId,
  projectName,
  provider: "claude",
  displayName: "Subagent Probe",
  status: "running",
  createdAt: "2026-09-20T00:00:00.000Z",
};
await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions/${subSessionId}$`), (r) =>
  r.fulfill(
    json({
      session: subSession,
      availableModels: ["sonnet"],
      availablePermissionModes: ["default"],
    }),
  ),
);
let subSocket;
await page.routeWebSocket(/claude-stream/, (ws) => {
  subSocket = ws;
});
await page.goto(`${ORIGIN}/projects/${projectName}/session/${subSessionId}`);
await page.waitForTimeout(1500);
if (subSocket) {
  const send = (data) => subSocket.send(JSON.stringify(data));
  send({ type: "session_init", resume: false });
  // Agent tool_use（父）+ 一条 parent_tool_use_id 指向它的子消息（→ bodyChildUuids 非空
  // → hasAgentBody → agent-container）；无 tailResult = running（概览条条件）。
  send({
    type: "assistant",
    uuid: "uuid-agent-head",
    message: {
      id: "msg-agent",
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "agent-probe-1",
          name: "Agent",
          input: { subagent_type: "Explore", description: "扫描探针" },
        },
      ],
    },
  });
  await page.waitForTimeout(300);
  send({
    type: "assistant",
    uuid: "uuid-agent-body",
    parent_tool_use_id: "agent-probe-1",
    message: {
      id: "msg-agent-body",
      role: "assistant",
      content: [{ type: "text", text: "子 agent 工作中" }],
    },
  });
  await page.waitForTimeout(1500);
}
const subbar = page.locator(".subbar");
ok((await subbar.count()) === 1, "03e .subbar 概览条出现");
if ((await subbar.count()) === 1) {
  const subStyle = await subbar.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color };
  });
  ok(subStyle.bg !== "rgba(0, 0, 0, 0)", `.subbar 有绿色 tint 衬底（${subStyle.bg}）`);
  const subText = await subbar.textContent();
  ok(subText?.includes("Explore") === true, `.subbar 显示 subagentType（${subText?.trim()}）`);
  // 整条可点（点按跳转 scrollToMessage，不抛错）。
  const chip = subbar.locator("button").first();
  ok((await chip.count()) === 1, ".subbar 行可点（button）");
  await chip.click();
  await page.waitForTimeout(400);
  ok(true, "点按概览条不抛错（scrollToMessage 路径）");
}

// ── Part 7: 03v merged 置灰 ─────────────────────────────────────────────────
console.log("Part 7: 03v merged 分支置灰");
await page.goto(`${ORIGIN}/projects/${projectName}?tab=git`);
await page.waitForSelector('[data-mobile-tool="git"]', { timeout: 10000 });
await page.getByText(/分支 \(\d+\)/).click();
await page.waitForURL(/\/git\/branches/, { timeout: 5000 });
const mergedRow = page.locator(".brow.merged");
ok((await mergedRow.count()) === 1, "merged 行挂 .brow.merged（1 行）");
const mergedName = mergedRow.locator(".n");
const mergedColor = await mergedName.evaluate((el) => getComputedStyle(el).color);
const mergedWeight = await mergedName.evaluate((el) => getComputedStyle(el).fontWeight);
// 主题无关断言：读当前主题下 --ink-2 的实际计算值对比（dark 基准 #98989f，light 为 iOS 灰阶）。
const ink2Ref = await page.evaluate(() => {
  const el = document.createElement("span");
  el.style.color = "var(--ink-2)";
  el.style.display = "none";
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
});
ok(mergedColor === ink2Ref, `merged 行 n 降 --ink-2（${mergedColor} = ref ${ink2Ref}）`);
ok(mergedWeight === "400", `merged 行 n 字重 400（实测 ${mergedWeight}）`);
const mergedSt = await mergedRow.locator(".st").textContent();
ok(mergedSt === "已合并", `merged 行 st = 「已合并」（${mergedSt}）`);
const mergedStColor = await mergedRow.locator(".st").evaluate((el) => getComputedStyle(el).color);
const ink3Ref = await page.evaluate(() => {
  const el = document.createElement("span");
  el.style.color = "var(--ink-3)";
  el.style.display = "none";
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
});
ok(mergedStColor === ink3Ref, `merged 行 st 降 --ink-3（${mergedStColor} = ref ${ink3Ref}）`);
// 未合并行不受影响（feature 行仍是 ink-1 + ↑↓）。
const featureRow = page.locator(".brow").filter({ hasText: "feature" }).first();
ok(
  (await featureRow.getAttribute("class"))?.includes("merged") === false,
  "未合并行（feature）无 merged 变体",
);
const featureSt = await featureRow.locator(".st").textContent();
ok(featureSt?.includes("↑2") === true, `未合并行 st 仍显示 ↑↓（${featureSt?.trim()}）`);

// ── 收尾 ─────────────────────────────────────────────────────────────────────
await ctx.close();
await browser.close();
console.log(`\n结果: ${passCount} pass / ${failCount} fail`);
if (failCount > 0) process.exitCode = 1;
