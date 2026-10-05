// v1.5 批 3 预览矩阵·移动探针（spec §4.5/3.4，DOM 几何硬数据禁截图）。
//
// 断言域：
//   Part 1 面板 file 标签预览态（workspace-preview）：.fmeta = 「TypeScript · N 行 · 更新 …」
//     + nav [pencil][⋯]（text enabled）+ ⋯ 菜单三项（复制内容/复制路径/查看 diff）+ 无 segc。
//   Part 2 编辑态：.emeta（fdim 编辑中·N 行 + dirty ● 未保存变更）+ fact 放弃/完成 + .aux
//     三钮（撤销/重做/收起键盘，贴屏底——P2-2 编辑态去 pb）+ 放弃（clean 直接退 / dirty 弹确认）。
//   Part 3 MD 文件：.fmeta = 「Markdown · …」+ .fright>.segc.mini「渲染|源码」（几何 ≈28px）。
//   Part 4 unsupported 空态：.unsupported(.big+.t+.d 两行 pre-line) + fmeta = Binary（无
//     「更新」段——preview 非 text 分支无 mtimeMs，不伪造）+ nav 无 pencil（条件渲染，P1-1）。
//   Part 5 FAB 实心主色：computed background = c-primary + .plus 白。
//   Part 6 push 容器（files-global-preview）：.nav back=父目录 + h1 文件名（mono 14px）+
//     [pencil][⋯]；根文件 back=「服务器根」；无 tabbar；⋯ 仅两项（无查看 diff）。
//   Part 7 wikiread 标签（wiki-reader）：wiki 深链 → 面板 wikiread 标签 + .fmeta「Markdown ·
//     … · 更新 …」+ .actbtn「让 Agent 读这篇」+ ⋯ = 复制内容/查看 diff（原型 pin②，P1-2）。
//
// 全 mock API（无真实数据创建/删除）；密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v15-batch3-preview.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";

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

function json(body) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

const AGENTS = [
  {
    id: "agent_a",
    projectName: "proj1",
    provider: "claude",
    displayName: "AAA-running",
    status: "running",
    createdAt: "2026-09-22T00:00:00.000Z",
    model: "opus",
    permissionMode: "plan",
    claudeSessionId: "uuid-aaaa",
  },
];

const HOUR_AGO = Date.now() - 3_600_000;

const FILE_ENTRIES = [
  { name: "src", path: "src", type: "directory", hidden: false, size: null },
  { name: "index.ts", path: "index.ts", type: "file", hidden: false, size: 486 },
  { name: "README.md", path: "README.md", type: "file", hidden: false, size: 64 },
  { name: "notes.md", path: "notes.md", type: "file", hidden: false, size: 96 },
  { name: "archive.zip", path: "archive.zip", type: "file", hidden: false, size: 2048 },
];

const PREVIEWS = {
  "src/index.ts": {
    type: "text",
    projectName: "proj1",
    path: "src/index.ts",
    name: "index.ts",
    size: 486,
    mtimeMs: HOUR_AGO,
    content: 'export const main = (): void => {\n  console.log("hello");\n};\n',
  },
  "index.ts": {
    type: "text",
    projectName: "proj1",
    path: "index.ts",
    name: "index.ts",
    size: 486,
    mtimeMs: HOUR_AGO,
    content: 'export const main = (): void => {\n  console.log("hello");\n};\n',
  },
  "README.md": {
    type: "text",
    projectName: "proj1",
    path: "README.md",
    name: "README.md",
    size: 64,
    mtimeMs: HOUR_AGO,
    content: "# proj1\n\nhello **world**\n",
  },
  "notes.md": {
    type: "text",
    projectName: "proj1",
    path: "notes.md",
    name: "notes.md",
    size: 96,
    mtimeMs: HOUR_AGO,
    content: "# notes\n\n- a\n- b\n",
  },
  "archive.zip": {
    type: "unsupported",
    projectName: "proj1",
    path: "archive.zip",
    name: "archive.zip",
    size: 2048,
    reason: "unsupported_type",
  },
};

// GET /wiki/{slug} → 裸 WikiPage（api/src/index.ts:1152 Response.json(page)，非 {page} 包裹）。
const WIKI_PAGE = {
  slug: "intro",
  frontmatter: {
    title: "Intro",
    tags: [],
    created: "2026-09-01",
    updated: "2026-10-04",
  },
  body: "# Intro\n\nwiki body line.\n",
};

async function setupMocks(page) {
  await page.route("**/api/projects", (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }]));
    }
    return r.fulfill(json({ ok: true }));
  });
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: ["proj1"],
        candidates: AGENTS.map((a) => ({
          sessionId: a.id,
          projectName: a.projectName,
          displayName: a.displayName,
          status: a.status,
          provider: a.provider,
          type: "agent",
          createdAt: a.createdAt,
          updatedAt: a.createdAt,
        })),
      }),
    ),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/[^/]+$/, (r) =>
    r.fulfill(
      json({
        session: AGENTS[0],
        availableModels: ["opus"],
        availablePermissionModes: ["plan"],
      }),
    ),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: AGENTS })),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/files(\?.*)?$/, (r) => {
    const path = decodeURIComponent(
      r
        .request()
        .url()
        .match(/path=([^&]*)/)?.[1] ?? "",
    );
    if (path === "src") {
      return r.fulfill(
        json({
          path: "src",
          parentPath: "",
          entries: [
            { name: "index.ts", path: "src/index.ts", type: "file", hidden: false, size: 486 },
          ],
        }),
      );
    }
    return r.fulfill(
      json({
        path: "",
        parentPath: "",
        entries: FILE_ENTRIES,
      }),
    );
  });
  await page.route(/\/api\/projects\/proj1\/files\/preview\?path=([^&]+)$/, (r) => {
    const path = decodeURIComponent(
      r
        .request()
        .url()
        .match(/path=([^&]+)$/)?.[1] ?? "",
    );
    return r.fulfill(json(PREVIEWS[path] ?? PREVIEWS["archive.zip"]));
  });
  await page.route(/\/api\/projects\/proj1\/git\/diff(\?.*)?$/, (r) =>
    r.fulfill(json({ files: [] })),
  );
  // 单文件 diff（/git/diff/file?scope=…&path=…）：非 repo 形状 → 面板 diff 容器落错误分支
  //（Part 7 ⑨ 断言「查看 diff 走到 diff 管道」；mock 不依赖真实 dev api）。
  await page.route(/\/api\/projects\/proj1\/git\/diff\/file\?/, (r) =>
    r.fulfill(json({ repository: false })),
  );
  await page.route(/\/api\/projects\/proj1\/git\/branches(\?.*)?$/, (r) =>
    r.fulfill(json({ branches: [{ name: "main", current: true, ahead: 0, behind: 0 }] })),
  );
  await page.route(/\/api\/projects\/proj1\/wiki\/intro\/search(\?.*)?$/, (r) =>
    r.fulfill(json({ matches: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/wiki\/intro$/, (r) => r.fulfill(json(WIKI_PAGE)));
  await page.route(/\/api\/projects\/proj1\/wiki\/search\?.*$/, (r) =>
    r.fulfill(json({ matches: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/wiki$/, (r) =>
    r.fulfill(
      json({
        pages: [{ slug: "intro", title: "Intro", tags: [], updated: "2026-10-04" }],
      }),
    ),
  );
  // 插件/文件域杂项（shell 可能拉取）。
  await page.route(/\/api\/mcp(\?.*)?$/, (r) => r.fulfill(json({ servers: [] })));
  await page.route(/\/api\/skills\/installed\?.*$/, (r) => r.fulfill(json({ skills: [] })));
  await page.route(/\/api\/skills\/updates\?.*$/, (r) => r.fulfill(json({ updates: [] })));
  // session 面板 WS（聚焦态会连；直连真实 dev api，错误帧由面板承接）。
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1500);
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
await setupMocks(page);

// ───────────────────────── Part 1 面板 file 标签预览态 ─────────────────────────
console.log("Part 1 面板 file 标签预览态（workspace-preview）");
await login(page);
await page.goto(`${ORIGIN}/projects/proj1?tab=files`);
await page
  .locator('[data-inspection-panel="open"]')
  .waitFor({ state: "visible", timeout: 10000 })
  .catch(() => {});
ok(
  (await page.locator('[data-inspection-panel="open"]').count()) > 0,
  "① ?tab=files 深链 → 检视面板 open",
);
// 点根目录 index.ts 行 → file 标签。
const fileRow = page
  .locator('[data-inspection-panel="open"]')
  .getByText("index.ts", { exact: true });
ok((await fileRow.count()) > 0, "② files 列表含 index.ts 行");
await fileRow.first().click();
await page.waitForTimeout(800);
const fileBody = page.locator('[data-panel-tab-body="file:proj1/index.ts"]');
ok((await fileBody.count()) > 0, "③ file 标签体挂载（file:proj1/index.ts）");
const fmeta = fileBody.locator(".fmeta");
ok((await fmeta.count()) > 0, "④ .fmeta 元信息行存在");
const fmetaText = (await fmeta.textContent()) ?? "";
ok(
  /TypeScript · \d+ 行 · 更新 /.test(fmetaText),
  `⑤ fmeta 文本 = 类型·行数·更新时间（${fmetaText.trim().slice(0, 40)}）`,
);
ok((await fileBody.locator(".fmeta .segc").count()) === 0, "⑥ .ts 非 md/html → 无 segc 切换");
const pencil = page.locator('[data-inspection-panel="open"] .nav [aria-label="编辑"]');
ok((await pencil.count()) === 1, "⑦ nav [pencil 编辑] 存在");
ok(!(await pencil.isDisabled()), "⑧ text 文件 pencil enabled");
const dotsBtn = page.locator('[data-inspection-panel="open"] .nav [aria-label="更多操作"]');
ok((await dotsBtn.count()) === 1, "⑨ nav [⋯] 存在");
await dotsBtn.click();
await page.waitForTimeout(400);
const menuText = await page
  .locator('[role="menu"]')
  .textContent()
  .catch(() => "");
ok(
  /复制内容/.test(menuText ?? "") &&
    /复制路径/.test(menuText ?? "") &&
    /查看 diff/.test(menuText ?? ""),
  "⑩ ⋯ 菜单 = 复制内容/复制路径/查看 diff",
);
await page.keyboard.press("Escape");
// §18 同源：sheet 退出动画（~450ms + fill-mode-forwards）播完再点 nav 钮，防 scrim 残留挡点击。
await page.waitForTimeout(700);

// ───────────────────────── Part 2 编辑态 ─────────────────────────
console.log("Part 2 编辑态（emeta/aux/fact）");
await pencil.click();
await page.waitForTimeout(700);
const pane = page.locator('[data-role="file-preview-pane"]');
const emeta = pane.locator(".emeta");
ok((await emeta.count()) > 0, "① 编辑态 .emeta 出现");
const fdimText = (await emeta.locator(".fdim").textContent()) ?? "";
ok(/编辑中 · \d+ 行/.test(fdimText), `② fdim = ${fdimText.trim()}`);
ok((await emeta.locator(".dirty").count()) === 0, "③ 未改动 → 无 dirty");
const factText = (await emeta.locator(".fact").textContent()) ?? "";
ok(/放弃/.test(factText) && /完成/.test(factText), "④ fact = 放弃 + 完成");
const auxText = (await pane.locator(".aux").textContent()) ?? "";
ok(
  /撤销/.test(auxText) && /重做/.test(auxText) && /收起键盘/.test(auxText),
  "⑤ .aux = 撤销/重做/收起键盘",
);
// P2-2：编辑态去 pb → .aux 贴屏底（bottom ≈ 视口高，容差 2px 防亚像素）。
const auxBox = await pane.locator(".aux").boundingBox();
const vpH = page.viewportSize()?.height ?? 0;
ok(
  auxBox !== null && Math.abs(auxBox.y + auxBox.height - vpH) <= 2,
  `⑤b 编辑态 .aux 贴屏底（bottom=${(auxBox?.y ?? 0) + (auxBox?.height ?? 0)} / vp=${vpH}）`,
);
ok((await pane.locator(".cm-editor").count()) > 0, "⑥ CodeMirror 在场");
// clean 放弃 → 直接退出回预览态。
await emeta.locator(".fact .giveup").click();
await page.waitForTimeout(500);
ok((await pane.locator(".emeta").count()) === 0, "⑦ clean 放弃 → 回预览态");
// 再进编辑 → 输入产生 dirty → 放弃弹确认 → 确认后退出。
await pencil.click();
await page.waitForTimeout(700);
await page.locator(".cm-content").click();
await page.keyboard.type("dirty");
await page.waitForTimeout(400);
ok((await pane.locator(".emeta .dirty").count()) === 1, "⑧ 输入后 dirty ● 未保存变更 出现");
await pane.locator(".emeta .fact .giveup").click();
await page.waitForTimeout(400);
const confirmBtn = page.getByRole("dialog").getByRole("button", { name: "放弃" }).first();
ok((await confirmBtn.count()) > 0, "⑨ dirty 放弃弹 confirm");
await confirmBtn.click();
await page.waitForTimeout(500);
ok((await pane.locator(".emeta").count()) === 0, "⑩ 确认后退出回预览态");
// 完成（无改动 finish）→ 回预览态（nav 恢复 pencil）。
await pencil.click();
await page.waitForTimeout(700);
await pane.locator(".emeta .fact button:not(.giveup)").click();
await page.waitForTimeout(500);
ok(
  (await page.locator('[data-inspection-panel="open"] .nav [aria-label="编辑"]').count()) === 1,
  "⑪ 完成 → nav 恢复 pencil",
);

// ───────────────────────── Part 3 MD segc.mini ─────────────────────────
console.log("Part 3 MD 文件 fmeta + segc.mini");
// 叠层保活：file 标签激活时 files 列表 invisible——点文件前先回「文件」标签。
async function backToFilesTab() {
  await page
    .locator('[data-role="ptabs"] [role="tab"]')
    .filter({ hasText: "文件" })
    .first()
    .click();
  await page.waitForTimeout(500);
}
await backToFilesTab();
const notesRow = page
  .locator('[data-inspection-panel="open"]')
  .getByText("notes.md", { exact: true });
await notesRow.first().click();
await page.waitForTimeout(800);
const notesBody = page.locator('[data-panel-tab-body="file:proj1/notes.md"]');
const notesFmeta = notesBody.locator(".fmeta");
const notesText = (await notesFmeta.textContent()) ?? "";
ok(/Markdown · /.test(notesText), `① fmeta 类型 = Markdown（${notesText.trim().slice(0, 30)}）`);
const segc = notesFmeta.locator(".segc.mini");
ok((await segc.count()) > 0, "② .fright>.segc.mini 存在");
const segcBox = await segc.boundingBox();
ok(
  segcBox !== null && segcBox.height >= 24 && segcBox.height <= 34,
  `③ segc.mini 高 ≈28px（实测 ${segcBox?.height.toFixed(1)}）`,
);
const segcText = (await segc.textContent()) ?? "";
ok(/渲染/.test(segcText) && /源码/.test(segcText), "④ segc.mini = 渲染|源码 两钮");
const onBtn = segc.locator("button.on");
ok(
  (await onBtn.count()) === 1 && /渲染/.test((await onBtn.textContent()) ?? ""),
  "⑤ md 默认渲染态（.on = 渲染）",
);

// ───────────────────────── Part 4 unsupported 空态 ─────────────────────────
console.log("Part 4 unsupported 空态");
await backToFilesTab();
await page
  .locator('[data-inspection-panel="open"]')
  .getByText("archive.zip", { exact: true })
  .first()
  .click();
await page.waitForTimeout(800);
const zipBody = page.locator('[data-panel-tab-body="file:proj1/archive.zip"]');
const unsup = zipBody.locator(".unsupported");
ok((await unsup.count()) > 0, "① .unsupported 空态出现");
ok((await unsup.locator(".big").count()) > 0, "② .big 文档图标");
const unsupT = (await unsup.locator(".t").textContent()) ?? "";
ok(/不支持预览/.test(unsupT), "③ .t = 不支持预览");
const unsupD = (await unsup.locator(".d").textContent()) ?? "";
ok(/限制/.test(unsupD) || unsupD.includes("\n") || unsupD.length > 10, "④ .d 两行说明");
// P2-1：i18n 文案 \n 不被折叠（white-space: pre-line 渲染两行）。
const unsupDWs = await unsup.locator(".d").evaluate((el) => getComputedStyle(el).whiteSpace);
ok(unsupDWs === "pre-line", `④b .d white-space = pre-line（got ${unsupDWs}）`);
const zipFmeta = (await zipBody.locator(".fmeta").textContent()) ?? "";
ok(/Binary · /.test(zipFmeta), `⑤ fmeta = Binary · 大小（${zipFmeta.trim().slice(0, 24)}）`);
ok(!/更新 /.test(zipFmeta), "⑥ 非 text 无 mtimeMs → fmeta 无「更新」段");
ok(
  (await page.locator('[data-inspection-panel="open"] .nav [aria-label="编辑"]').count()) === 0,
  "⑦ unsupported → nav 无 pencil 图标钮（text 条件渲染，P1-1）",
);

// ───────────────────────── Part 5 FAB 实心主色 ─────────────────────────
console.log("Part 5 FAB 实心主色");
await page.locator('[data-role="ptabs"] [role="tab"]').filter({ hasText: "文件" }).first().click();
await page.waitForTimeout(500);
const fab = page.locator('[data-inspection-panel="open"] .fab');
ok((await fab.count()) === 1, "① files 标签 FAB 存在");
const fabBg = await fab.evaluate((el) => getComputedStyle(el).backgroundColor);
ok(fabBg !== "rgba(0, 0, 0, 0)" && fabBg !== "transparent", `② FAB 实心底（${fabBg}）`);
const fabPlusColor = await fab
  .locator(".plus")
  .evaluate((el) => getComputedStyle(el).color)
  .catch(() => "");
ok(fabPlusColor !== "", `③ .plus 可取色（${fabPlusColor}）`);

// ───────────────────────── Part 6 push 容器 ─────────────────────────
console.log("Part 6 push 容器（files-global-preview）");
await page.goto(`${ORIGIN}/files/file/proj1/src/index.ts`);
await page.waitForTimeout(1500);
const navBack = page.locator("main .nav .back").first();
ok(/src/.test((await navBack.textContent()) ?? ""), "① back = 父目录名（src）");
const navH1 = (await page.locator("main .nav h1").textContent()) ?? "";
ok(/index\.ts/.test(navH1), "② h1 = 文件名（index.ts）");
ok((await page.locator('nav[aria-label="移动端主导航"]').count()) === 0, "③ push 页无 tabbar");
const pushPencil = page.locator("main .nav [aria-label='编辑']");
ok((await pushPencil.count()) === 1 && !(await pushPencil.isDisabled()), "④ nav [pencil] enabled");
await page.locator("main .nav [aria-label='更多操作']").click();
await page.waitForTimeout(400);
const pushMenu = (await page.locator('[role="menu"]').textContent()) ?? "";
ok(
  /复制内容/.test(pushMenu) && /复制路径/.test(pushMenu) && !/查看 diff/.test(pushMenu),
  "⑤ push ⋯ 仅两项（根作用域无查看 diff）",
);
await page.keyboard.press("Escape");
// §18 同源：sheet 退出动画播完再点 pencil。
await page.waitForTimeout(700);
// push 编辑态 nav [放弃][完成]。
await pushPencil.click();
await page.waitForTimeout(700);
const pushFact = (await page.locator("main .nav .fact").textContent()) ?? "";
ok(/放弃/.test(pushFact) && /完成/.test(pushFact), "⑥ 编辑态 nav .fact = 放弃/完成");
// 字号档（files-global-preview-edit 页私规格）：放弃 15px 次级 / 完成 14px-600 主色
//——与面板 .emeta .fact（13px 同档）刻意不同，防两态被合并成一套。
const pushFactGeo = await page.evaluate(() => {
  const fact = document.querySelector("main .nav .fact");
  const gi = fact?.querySelector(".giveup");
  const done = fact?.querySelector("button:not(.giveup)");
  const st = (el) => (el ? getComputedStyle(el) : null);
  return {
    giveupFs: st(gi)?.fontSize,
    giveupColor: st(gi)?.color,
    doneFs: st(done)?.fontSize,
    doneFw: st(done)?.fontWeight,
    doneColor: st(done)?.color,
  };
});
ok(
  pushFactGeo.giveupFs === "15px" &&
    pushFactGeo.doneFs === "14px" &&
    pushFactGeo.doneFw === "600" &&
    pushFactGeo.doneColor === "rgb(0, 122, 255)",
  `⑥b push fact 字号档 放弃15/完成14-600 主色（got ${JSON.stringify(pushFactGeo)}）`,
);
await page.locator("main .nav .fact .giveup").click();
await page.waitForTimeout(400);
// 根文件 back = 服务器根。
await page.goto(`${ORIGIN}/files/file/proj1/README.md`);
await page.waitForTimeout(1500);
const rootBack = (await page.locator("main .nav .back").first().textContent()) ?? "";
ok(/服务器根/.test(rootBack), `⑦ 根文件 back = 服务器根（${rootBack}）`);

// ───────────────────────── Part 7 wikiread 标签 ─────────────────────────
console.log("Part 7 wikiread 标签（wiki 深链映射）");
await page.goto(`${ORIGIN}/projects/proj1/wiki/intro`);
await page
  .locator('[data-inspection-panel="open"]')
  .waitFor({ state: "visible", timeout: 10000 })
  .catch(() => {});
ok(
  (await page.locator('[data-inspection-panel="open"]').count()) > 0,
  "① wiki 深链 → 检视面板 open",
);
const wikiTab = page.locator('[data-role="ptabs"] [role="tab"]').filter({ hasText: "Intro" });
ok((await wikiTab.count()) >= 1, "② ptabs 出现 wikiread 标签（Intro）");
const wikiReader = page.locator('[data-panel-tab-body^="wikiread:"]');
const wikiFmeta =
  (await wikiReader
    .locator(".fmeta")
    .textContent()
    .catch(() => "")) ?? "";
ok(
  /Markdown · /.test(wikiFmeta) && /更新 /.test(wikiFmeta),
  `③ wikiread .fmeta = Markdown·大小·更新（${wikiFmeta.trim().slice(0, 36)}）`,
);
const actBtn = wikiReader.locator(".fmeta .actbtn");
ok((await actBtn.count()) === 1, "④ .fmeta 右端 .actbtn 存在");
ok(/让 Agent 读这篇/.test((await actBtn.textContent()) ?? ""), "⑤ actbtn 文案 = 让 Agent 读这篇");
const actBtnBox = await actBtn.boundingBox();
ok(
  actBtnBox !== null && actBtnBox.height >= 24 && actBtnBox.height <= 34,
  `⑥ actbtn 高 ≈28px（实测 ${actBtnBox?.height.toFixed(1)}）`,
);
// P1-2（wiki 复审）：wikiread nav ⋯ = 复制内容/查看 diff（wiki-reader 原型 pin②），无复制链接。
const wikiDots = page.locator('[data-inspection-panel="open"] .nav [aria-label="更多操作"]');
ok((await wikiDots.count()) === 1, "⑦ wikiread nav [⋯] 存在");
await wikiDots.click();
// §18：sheet 450ms 全程升起 enter——动画播完前 menuitem boundingBox 落屏外，click 不命中。
await page.waitForTimeout(700);
const wikiMenu =
  (await page
    .locator('[role="menu"]')
    .textContent()
    .catch(() => "")) ?? "";
ok(
  /复制内容/.test(wikiMenu) && /查看 diff/.test(wikiMenu) && !/复制链接/.test(wikiMenu),
  "⑧ wikiread ⋯ = 复制内容/查看 diff（无复制链接）",
);
// ⑨ 查看 diff → wiki 源文件（wiki/intro.md）走面板 file diff 管道（panelDiff from "file"）。
// mock diff API 非 repo 形状 → MobileL3GitDiff 落 fileError 分支（l3-git-diff 容器只在成功
// 分支渲染）——l3 覆盖层 + 「无法打开此差异」文案 = diff query 被走到即达标。
await page.locator('[role="menuitem"]').filter({ hasText: "查看 diff" }).first().click();
await page.waitForTimeout(800);
const wikiDiffPage = page.locator('[data-role="l3-page"]');
ok(
  (await wikiDiffPage.count()) > 0 &&
    /无法打开此差异/.test((await wikiDiffPage.textContent().catch(() => "")) ?? ""),
  "⑨ wikiread 查看 diff → l3 覆盖层 + diff 管道（wiki/{slug}.md 走到 diff query）",
);

console.log(`\n结果: ${passCount} pass / ${failCount} fail`);
await browser.close();
process.exit(failCount > 0 ? 1 : 0);
