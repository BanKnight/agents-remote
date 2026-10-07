// 批 11 反馈①复现探针：文件树上传落点（用户报「上传成功时不在当前目录，反而在项目根」）。
// 原型语义 pin（tool-files-upload.html）：上传目标 = 当前目录；长按文件夹行 → 上传到此。
//
// 静态读码全链路无异常（client enqueueUploads(projectName, directoryPath) → ?path= →
// api resolvePath），按 frontend-notes §22 证据纪律不猜修——本探针打真实 API（test 项目）
// 拿第一手数据：每个入口上传后断言文件落在「操作时的 cwd」而非项目根，并记录每个
// POST /files/upload 请求的 ?path= 实际值（uploadCalls）作为失败时的根因证据。
//
// 覆盖 4 入口：
//   ① 桌面右栏 toolChip ＋ AddMenu「Upload…」（right-panel-tabs uploadTargetRef 路径）
//   ② 桌面右栏文件行右键「Upload File…」（FilesToolPanel menuItems，目标 = cwd）
//   ③ 桌面右栏目录行右键「Upload here」（dirMenuItems，目标 = entry.path）
//   ④ 移动全局文件页进项目子目录 ＋ AddMenu「Upload…」（overviewUploadTargetRef 路径）
//
// 数据纪律：只创建/删除 probe-up-target-<ts>/ 前缀自建数据；跑完清理（200 校验）。
// 跑法：bun scripts/probe-files-upload-target.mjs（43011/43012 dev 常驻）。

import { chromium } from "@playwright/test";

import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:43012";
const EXEC =
  process.env.PLAYWRIGHT_CHROMIUM ??
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const PROJECT = "test";
const STAMP = `${process.pid.toString(36)}${Date.now().toString(36)}`;
const DIR = `probe-up-target-${STAMP}`;
const TIMEOUT = 15_000;

const results = [];
const record = (ok, label, extra = "") => {
  results.push({ ok, label });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: EXEC,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

// 每个上传请求的 ?path= 第一手数据（失败时对照「操作时 cwd」即知断在哪层）。
const uploadCalls = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);

  context.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname.endsWith("/files/upload")) {
      uploadCalls.push(`${req.method()} ${url.pathname}${url.search}`);
    }
  });

  // 页内同源 API helper（cookie 自动携带；不用 Node fetch 省去 cookie 搬运）。
  const api = (path, init) =>
    page.evaluate(
      async ([path, init]) => {
        const res = await fetch(path, init);
        return { status: res.status, body: await res.json().catch(() => null) };
      },
      [path, init],
    );

  const listDir = (dir) =>
    api(`/api/projects/${PROJECT}/files${dir ? `?path=${encodeURIComponent(dir)}` : ""}`);
  const namesIn = (body) =>
    (body?.entries ?? body?.files ?? []).map((e) =>
      typeof e === "string" ? e : (e.name ?? e.path ?? ""),
    );
  const waitForInDir = async (dir, name) => {
    const deadline = Date.now() + TIMEOUT;
    while (Date.now() < deadline) {
      const names = namesIn((await listDir(dir)).body);
      if (names.includes(name)) return true;
      await page.waitForTimeout(300);
    }
    return false;
  };
  // 清掉历史探针轮次可能落根的 probe-up-file 残留（前缀自建数据，纪律允许）。
  const cleanupRootFiles = async () => {
    const names = namesIn((await listDir("")).body).filter((n) => n.startsWith("probe-up-file"));
    for (const name of names) {
      await api(`/api/projects/${PROJECT}/files/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: name }),
      });
    }
  };

  // ── 登录（UI；默认 en 与 e2e 同款文案）──
  await page.goto(WEB_ORIGIN);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
  await cleanupRootFiles();

  // ── setup：自建子目录 + 锚文件（Part② 的右键目标）──
  const mk = await api(`/api/projects/${PROJECT}/files/mkdir`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: DIR }),
  });
  if (mk.status !== 200) throw new Error(`mkdir ${DIR} failed: ${mk.status}`);
  const mkAnchor = await api(
    `/api/projects/${PROJECT}/files/create?path=${encodeURIComponent(DIR)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "anchor.txt" }),
    },
  );
  if (mkAnchor.status !== 200) throw new Error(`create anchor.txt failed: ${mkAnchor.status}`);

  const filesPanel = page.getByRole("complementary").nth(1);
  const filesBody = filesPanel.locator('[data-panel-tab-body="files"]');
  // 幂等导航：cwd atom 持久化后 reload 会恢复上次目录——列表含 anchor.txt = 已在 DIR，跳过
  // 点行；否则（在根层）点 DIR 行进入。进入判据用 DIR 内锚文件而非 crumb 文本（少一层依赖）。
  const ensureInDir = async () => {
    await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}?rightTab=files`);
    await expectTabActive();
    const bodyText = await filesBody
      .locator(".frow .p")
      .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
    if (!bodyText.includes("anchor.txt")) {
      await filesBody.locator(".frow", { hasText: DIR }).first().click();
      await filesBody
        .locator(".frow", { hasText: "anchor.txt" })
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUT });
    }
  };
  const ensureAtRoot = async () => {
    await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}?rightTab=files`);
    await expectTabActive();
    const bodyText = await filesBody
      .locator(".frow .p")
      .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
    if (bodyText.includes("anchor.txt")) {
      // 已在 DIR：「..」行回根（e2e 同款），等 DIR 目录行出现。
      await filesBody
        .locator(".frow")
        .filter({ hasText: /^\.\.$/ })
        .first()
        .click();
      await filesBody
        .locator(".frow", { hasText: DIR })
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUT });
    }
  };
  async function expectTabActive() {
    await filesPanel
      .getByRole("tab", { name: "Files", exact: true })
      .waitFor({ state: "visible", timeout: TIMEOUT });
    await filesBody.locator(".frow").first().waitFor({ state: "visible", timeout: TIMEOUT });
  }

  // ── Part ①：toolChip ＋ AddMenu「Upload…」（目标应为 cwd = DIR；＋ 在 toolChip 行——
  // aside 层，不在 [data-panel-tab-body] 内，与 e2e 定位同款作用于 aside）──
  await ensureInDir();
  const chooser1 = page.waitForEvent("filechooser", { timeout: TIMEOUT });
  await filesPanel.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Upload…", exact: true }).click();
  await (
    await chooser1
  ).setFiles({
    name: "probe-up-file-1.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("upload target probe 1\n"),
  });
  record(await waitForInDir(DIR, "probe-up-file-1.txt"), "① 右栏 ＋「Upload…」文件落在当前子目录");
  const rootNames = namesIn((await listDir("")).body);
  record(!rootNames.includes("probe-up-file-1.txt"), "① 项目根目录不含该文件");

  // ── Part ②：文件行右键「Upload File…」（目标应为 cwd = DIR）──
  await ensureInDir();
  const chooser2 = page.waitForEvent("filechooser", { timeout: TIMEOUT });
  await filesBody.locator(".frow", { hasText: "anchor.txt" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Upload File…", exact: true }).click();
  await (
    await chooser2
  ).setFiles({
    name: "probe-up-file-2.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("upload target probe 2\n"),
  });
  record(
    await waitForInDir(DIR, "probe-up-file-2.txt"),
    "② 行菜单「Upload File…」文件落在当前子目录",
  );

  // ── Part ③：目录行右键「Upload here」（目标应为该目录 = DIR，操作位置在项目根）──
  await ensureAtRoot();
  const chooser3 = page.waitForEvent("filechooser", { timeout: TIMEOUT });
  await filesBody.locator(".frow", { hasText: DIR }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Upload here", exact: true }).click();
  await (
    await chooser3
  ).setFiles({
    name: "probe-up-file-3.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("upload target probe 3\n"),
  });
  record(await waitForInDir(DIR, "probe-up-file-3.txt"), "③ 目录行「Upload here」文件落在目标目录");

  // ── Part ④：移动全局文件页进项目子目录 ＋「Upload…」──
  const mpage = await context.newPage();
  await mpage.setViewportSize({ width: 390, height: 844 });
  mpage.setDefaultTimeout(TIMEOUT);
  const mapi = (path, init) =>
    mpage.evaluate(
      async ([path, init]) => {
        const res = await fetch(path, init);
        return { status: res.status, body: await res.json().catch(() => null) };
      },
      [path, init],
    );
  const mWaitForInDir = async (dir, name) => {
    const deadline = Date.now() + TIMEOUT;
    while (Date.now() < deadline) {
      const res = await mapi(`/api/projects/${PROJECT}/files?path=${encodeURIComponent(dir)}`);
      const names = (res.body?.entries ?? res.body?.files ?? []).map((e) =>
        typeof e === "string" ? e : (e.name ?? e.path ?? ""),
      );
      if (names.includes(name)) return true;
      await mpage.waitForTimeout(300);
    }
    return false;
  };
  await mpage.goto(`${WEB_ORIGIN}/files`);
  await mpage.getByRole("button", { name: "Add", exact: true }).waitFor({ state: "visible" });
  // 根层 globalCard：点项目卡（.gfrow 内 button）进入项目层，再点子目录行进入 DIR。
  // "test" 不是 "agents-remote" 的子串，filter hasText 不会误命中。
  await mpage
    .locator(".gfcard .gfrow")
    .filter({ hasText: "test" })
    .locator("button")
    .first()
    .click();
  await mpage.locator(".frow", { hasText: DIR }).first().click();
  await mpage.waitForTimeout(400);
  const chooser4 = mpage.waitForEvent("filechooser", { timeout: TIMEOUT });
  await mpage.getByRole("button", { name: "Add", exact: true }).click();
  await mpage.getByRole("menuitem", { name: "Upload…", exact: true }).click();
  await (
    await chooser4
  ).setFiles({
    name: "probe-up-file-4.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("upload target probe 4\n"),
  });
  record(
    await mWaitForInDir(DIR, "probe-up-file-4.txt"),
    "④ 移动全局文件页 ＋「Upload…」文件落在当前子目录",
  );

  // ── 上传请求第一手数据 ──
  console.log("\n── POST /files/upload 请求记录（?path= 实际值）──");
  for (const call of uploadCalls) console.log(`  ${call}`);
  const allInDir = uploadCalls.every((call) => call.includes(`path=${encodeURIComponent(DIR)}`));
  record(allInDir && uploadCalls.length >= 4, "全部上传请求 ?path= 指向当前子目录");
} catch (err) {
  record(false, "探针执行异常", String(err));
} finally {
  // ── 清理：只删自建目录（递归随目录删除，批 10 收尾同款 DELETE API）──
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(WEB_ORIGIN);
    await page.getByLabel("Password").fill(await readAppPassword());
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForLoadState("networkidle");
    const res = await page.evaluate(
      async ([project, path]) => {
        const r = await fetch(`/api/projects/${project}/files/delete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path }),
        });
        return r.status;
      },
      [PROJECT, DIR],
    );
    record(res === 200, `清理自建目录 ${DIR}`, `status=${res}`);
    await context.close();
  } catch (cleanupErr) {
    record(false, `清理自建目录 ${DIR} 失败`, String(cleanupErr));
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} PASS${failed.length ? `（FAIL ${failed.length}）` : ""}`,
);
process.exit(failed.length ? 1 : 0);
