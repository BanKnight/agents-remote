// 探针：上传体验打磨批（2026-11-06）——composer chip 真进度/处理中/错误细分/重试、
// 发送按钮 disabled 翻转、文件树 upcard data-progress="live" + inline width。
// mock 段（route 拦截吞 XHR progress 事件——probe-composer-attach.mjs :402-404 记档先例）
// 只断最终态；live 断言（data-progress/inline width/处理中窗口）放真链路段（43011 dev api）。
// 密码自读不打印；web DOM 探针前置过 ar-verify-css 三道闸；对真实后端只登录只读，
// 上传测试用自建前缀文件、跑完只删自建数据。
// 用法：bun scripts/probe-upload-polish.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const PROBE_SESSION_ID = "agent_uppolish-probe";
const PROBE_PROJECT = "proj-uppolish";

// 主流程（函数声明 + 末尾调用：helper/常量定义在后也不触发 TDZ）。
async function main() {
  // web DOM 探针强制前置：CSS 落盘三道闸。
  const css = await verifyCssFlushed({
    expectClasses: ["bg-surface-inset"],
    origin: WEB_ORIGIN,
  });
  if (!css.pass) {
    console.error(css.details.join("\n"));
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    // ── 段 A：mock 段（route 拦截吞 progress 事件——只断最终态）──
    {
      const page = await (
        await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN" })
      ).newPage();
      await openSessionPage(page);

      // A1: 空输入时 Send 不渲染（showSend=hasInput）；输入文本后 Send 在场且 enabled。
      const textarea = page.locator(COMPOSER_TEXTAREA);
      await textarea.fill("上传体验探针");
      const sendBtn = page.getByRole("button", { name: "发送", exact: true });
      await sendBtn.waitFor({ state: "visible", timeout: 5000 });
      check("A1: 输入后 Send 在场", await sendBtn.isEnabled());

      // A2: mock 上传端点 600ms 延迟 → 选文件 → uploading 期 Send disabled + 等待文案 title。
      await page.route(new RegExp(`/api/projects/${PROBE_PROJECT}/files/upload`), async (r) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        await r.fulfill(pageJson({ entry: { path: "uploads/probe-uppolish.pdf" } }));
      });
      await page.locator('input[type="file"]:not([accept])').setInputFiles(BIG_PDF);
      await page
        .locator("[data-attachment-chip]", { hasText: "上传中" })
        .waitFor({ timeout: 5000 });
      check("A2: uploading 期 chip「上传中」", true);
      check("A2: uploading 期 Send disabled", !(await sendBtn.isEnabled()));
      check(
        "A2: Send title=等待附件上传完成",
        (await sendBtn.getAttribute("title")) === "等待附件上传完成",
      );

      // A3: 响应后 chip ready（uploads/ 路径）→ Send enabled + title 恢复。
      await page
        .locator("[data-attachment-chip]", { hasText: "uploads/probe-uppolish.pdf" })
        .waitFor({ timeout: 5000 });
      check("A3: 响应后 chip ready 显示 uploads/ 路径", true);
      check("A3: Send 恢复 enabled", await sendBtn.isEnabled());
      check("A3: Send title 恢复「发送」", (await sendBtn.getAttribute("title")) === "发送");
      // 清残留：× 移除（后续断言不叠加 chip 计数）。
      await page.locator("[data-attachment-chip]").locator('button[aria-label="移除附件"]').click();
      await page.locator("[data-attachment-chip]").waitFor({ state: "detached", timeout: 5000 });

      // A4: mock 413 TOO_LARGE → chip 细分文案「文件超过 50MB 上限」+ ↻ 重试 affordance。
      await page.route(new RegExp(`/api/projects/${PROBE_PROJECT}/files/upload`), (r) =>
        r.fulfill({
          status: 413,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "PROJECT_FILE_UPLOAD_TOO_LARGE",
              message: "File exceeds upload size limit",
            },
          }),
        }),
      );
      await page.locator('input[type="file"]:not([accept])').setInputFiles(BIG_PDF);
      await page
        .locator("[data-attachment-chip]", { hasText: "文件超过 50MB 上限" })
        .waitFor({ timeout: 5000 });
      check("A4: 413 → chip 细分文案「文件超过 50MB 上限」", true);
      // 整块 chip 即重试按钮（命中区 ⊇ 视觉，frontend-notes §31）：aria = 「重试上传 <名>」。
      const retryBtnA4 = page.locator('[data-attachment-chip] button[aria-label^="重试上传"]');
      await retryBtnA4.waitFor({ timeout: 3000 });
      const retryBox = await retryBtnA4.boundingBox();
      check(
        "A4: ↻ 重试 = 整块 chip 可点（命中区 ≥ 100×32）",
        (await retryBtnA4.isVisible()) &&
          (retryBox?.width ?? 0) >= 100 &&
          (retryBox?.height ?? 0) >= 32,
        `${retryBox?.width}x${retryBox?.height}`,
      );

      // A5: 点 ↻ → mock 改回 200 → chip 重走 uploading → ready（重试链路闭环）。
      await page.route(new RegExp(`/api/projects/${PROBE_PROJECT}/files/upload`), (r) =>
        r.fulfill(pageJson({ entry: { path: "uploads/probe-uppolish.pdf" } })),
      );
      await retryBtnA4.click();
      await page
        .locator("[data-attachment-chip]", { hasText: "uploads/probe-uppolish.pdf" })
        .waitFor({ timeout: 5000 });
      check("A5: 点 ↻ 后重试成功 chip ready", true);

      // A6: mock 断连（route.abort）→「网络连接中断」+ ↻（哨兵码文案分流）。
      await page.locator("[data-attachment-chip]").locator('button[aria-label="移除附件"]').click();
      await page.route(new RegExp(`/api/projects/${PROBE_PROJECT}/files/upload`), (r) => r.abort());
      await page.locator('input[type="file"]:not([accept])').setInputFiles(BIG_PDF);
      await page
        .locator("[data-attachment-chip]", { hasText: "网络连接中断" })
        .waitFor({ timeout: 5000 });
      check("A6: 断连 → chip 细分文案「网络连接中断」", true);
      // A7: × 移除 error chip（abort 通道终态清理）。
      await page.locator("[data-attachment-chip]").locator('button[aria-label="移除附件"]').click();
      await page.locator("[data-attachment-chip]").waitFor({ state: "detached", timeout: 5000 });
      check("A7: × 移除 error chip 无残留", true);

      // A8: 上传中点 × = 真中断。同批两个文件：第一个被 × 移除（abort）后 Promise 必须
      // settle，第二个才能继续上传——曾漏挂 xhr.onabort（abort 只派发 abort+loadend，
      // 不派发 error）导致 Promise 永挂 → 同批后续文件全部停「上传中 0%」永不推进。
      let uploadCalls = 0;
      await page.route(new RegExp(`/api/projects/${PROBE_PROJECT}/files/upload`), async (r) => {
        uploadCalls += 1;
        if (uploadCalls === 1) await new Promise((res) => setTimeout(res, 1200));
        await r.fulfill(pageJson({ entry: { path: "uploads/probe-uppolish-second.pdf" } }));
      });
      await page.locator('input[type="file"]:not([accept])').setInputFiles([BIG_PDF, PDF2]);
      await page.locator("[data-attachment-chip]").nth(1).waitFor({ timeout: 5000 });
      await page
        .locator("[data-attachment-chip]")
        .nth(0)
        .locator('button[aria-label="移除附件"]')
        .click();
      await page
        .locator("[data-attachment-chip]")
        .filter({ hasText: "probe-uppolish.pdf" })
        .waitFor({ state: "detached", timeout: 5000 });
      check("A8: 上传中点 × → 该 chip 移除（abort 真中断）", true);
      // 若 abort 后 Promise 未 settle，第二个文件会永停在「上传中 0%」（queued 永不推进）。
      await page
        .locator("[data-attachment-chip]", { hasText: "uploads/probe-uppolish-second.pdf" })
        .waitFor({ timeout: 8000 });
      check("A8: abort 后同批第二个文件仍完成（队列不 wedged）", true);
    }

    // ── 段 B：真链路段（43012 真后端，test 项目；自建前缀数据 + 跑完清理）──
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(TIMEOUT);
      // 页内同源 API helper（cookie 自动携带）。
      const api = (path, init) =>
        page.evaluate(
          async ([path, init]) => {
            const res = await fetch(path, init);
            return { status: res.status, body: await res.json().catch(() => null) };
          },
          [path, init],
        );

      // 登录（en 默认 locale；真后端无 mock）。
      await page.goto(`${WEB_ORIGIN}/`);
      await page.getByLabel("Password").fill(await readAppPassword());
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForLoadState("networkidle");

      // 清掉历史轮次落根目录的自建残留（前轮 B3 卡住时清理段未跑 → sweep.txt 留根目录，
      // 下轮 keepBoth 同名 409 冲突 → 行进三选态、pump 不消费 → upcard 恒 queued 卡死）。
      const rootList = await api(`/api/projects/test/files?path=`);
      const staleRoots = (rootList.body?.entries ?? [])
        .map((e) => e.name ?? e.path ?? "")
        .filter((n) => n.startsWith("probe-uppolish"));
      for (const name of staleRoots) {
        await api(`/api/projects/test/files/delete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: name }),
        });
      }

      // ── B1: uploads/ 自动建目录（composer uploads/ 首传 404 根因修复）──
      // mkdir 契约 = files/mkdir + JSON {name}（files/create 是「新建空文件」，body {name} +
      // query path=父目录——曾误用致空 body 在 bun 层 500 HTML）。
      const cleanDir = "probe-uppolish-live";
      const mk = await api(`/api/projects/test/files/mkdir`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: cleanDir }),
      });
      check("B1: mkdir 容器目录", mk.status === 200, `status=${mk.status}`);
      // 上传到「不存在的子目录」nested——服务端自动建目录才是本批修复的核心（mkdir 手建
      // 目录不算数）。
      const upTarget = `${cleanDir}/nested`;
      const liveName = `${LIVE_PREFIX}.txt`;
      const up1 = await page.evaluate(
        async ([dir, name]) => {
          const fd = new FormData();
          fd.append("file", new File([new ArrayBuffer(1024)], name, { type: "text/plain" }));
          fd.append("conflict", "keepBoth");
          const res = await fetch(
            `/api/projects/test/files/upload?path=${encodeURIComponent(dir)}`,
            {
              method: "POST",
              body: fd,
            },
          );
          return { status: res.status, body: await res.json().catch(() => null) };
        },
        [upTarget, liveName],
      );
      check(
        "B1: 上传到不存在子目录自动建目录（200 + entry.path）",
        up1.status === 200 && String(up1.body?.entry?.path ?? "").startsWith(`${upTarget}/`),
        `status=${up1.status} path=${up1.body?.entry?.path ?? "null"}`,
      );
      const listed = await api(`/api/projects/test/files?path=${encodeURIComponent(upTarget)}`);
      const names = (listed.body?.entries ?? []).map((e) => e.name ?? e.path ?? "");
      check(
        "B1: 文件真落盘（list 含自建文件名）",
        listed.status === 200 && names.includes(liveName),
        `status=${listed.status} names=${JSON.stringify(names)}`,
      );

      // ── B2: 413 预检（真 51MB body → content-length 真实超限 → 预检 413）。「谎报头不发
      // body」测法在 bun.serve 下不可达 handler——bun 必须收完声明的 body 才构造 Request，
      // 不完整请求在 bun 层直接 500 HTML，记档。直连 API_ORIGIN：vite preview 代理转发
      // 51MB body 偶发 502（代理层瞬态，直连 413 7ms 稳定）；本断言验证服务端预检行为，
      // 不涉 DOM，与浏览器等价。
      const directCookie = await fetch(`${API_ORIGIN}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: await readAppPassword() }),
      }).then((r) => (r.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; "));
      const fd413 = new FormData();
      fd413.append(
        "file",
        new File([new ArrayBuffer(51 * 1024 * 1024 + 1024)], "probe-413-big.bin", {
          type: "application/octet-stream",
        }),
      );
      fd413.append("conflict", "keepBoth");
      const res413 = await fetch(
        `${API_ORIGIN}/api/projects/test/files/upload?path=${encodeURIComponent(upTarget)}`,
        { method: "POST", headers: { cookie: directCookie }, body: fd413 },
      ).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
      check(
        "B2: 真 51MB body → 413 + PROJECT_FILE_UPLOAD_TOO_LARGE",
        res413.status === 413 && res413.body?.error?.code === "PROJECT_FILE_UPLOAD_TOO_LARGE",
        `status=${res413.status} code=${res413.body?.error?.code ?? "null"}`,
      );

      // ── B3: upcard 真字节进度（data-progress="live" + inline width 推进）。CDP
      // emulateNetworkConditions 节流带宽给观察窗口（route 拦截会吞 progress 事件，不能用）。
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable", {});
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: 2 * 1024 * 1024,
      });
      await page.goto(`${WEB_ORIGIN}/projects/test?rightTab=files`);
      const filesPanel = page.getByRole("complementary").nth(1);
      await filesPanel.getByRole("button", { name: "Add", exact: true }).click();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 5000 }),
        page.getByRole("menuitem", { name: "Upload…", exact: true }).click(),
      ]);
      const big = Buffer.alloc(5 * 1024 * 1024, 0x62);
      await chooser.setFiles({
        name: `${LIVE_PREFIX}-sweep.txt`,
        mimeType: "text/plain",
        buffer: big,
      });
      // 上传中轮询采样：upcard 在场 → data-progress="live" + .prog i inline width 真字节值。
      let sawLive = false;
      let sawWidth = "";
      const sampleDeadline = Date.now() + 15000;
      while (Date.now() < sampleDeadline) {
        const s = await page.evaluate(() => {
          const card = document.querySelector(".upcard");
          if (!card) return null;
          const bar = card.querySelector(".prog i");
          return {
            progress: card.getAttribute("data-progress"),
            width: bar?.getAttribute("style") ?? "",
          };
        });
        if (!s) break;
        if (s.progress === "live") sawLive = true;
        if (s.progress === "live" && /width:\s*[1-9]/.test(s.width)) sawWidth = s.width;
        await page.waitForTimeout(120);
      }
      check("B3: uploading 期 data-progress=live", sawLive);
      check("B3: inline width 真字节推进（>0%）", sawWidth !== "", sawWidth || "未捕获");
      // 完成态：upcard 消失 + 文件真落盘。超时先 dump qlist（第一手数据：卡的是哪个 item）。
      try {
        await page.locator(".upcard").waitFor({ state: "detached", timeout: 20000 });
      } catch {
        const dump = await page.evaluate(() => {
          const card = document.querySelector(".upcard");
          const rows = [...document.querySelectorAll(".upcard .urow")];
          return {
            state: card?.getAttribute("data-state"),
            progress: card?.getAttribute("data-progress"),
            rows: rows.map((r) => r.textContent?.slice(0, 80)),
            cardText: card?.textContent?.slice(0, 200),
          };
        });
        console.error("B3 超时 dump:", JSON.stringify(dump, null, 2));
        throw new Error("upcard 未消失");
      }
      const b3list = await api(`/api/projects/test/files?path=`);
      check(
        "B3: 上传完成 upcard 消失 + 文件落盘",
        (b3list.body?.entries ?? []).some((e) => (e.name ?? "") === `${LIVE_PREFIX}-sweep.txt`),
      );

      // ── 清理：自建容器目录 + 根目录 sweep 残留（纪律：只删 probe-uppolish-*）──
      const del = await api(`/api/projects/test/files/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: cleanDir }),
      });
      check("清理自建目录", del.status === 200, `status=${del.status}`);
      const sweepDel = await api(`/api/projects/test/files/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: `${LIVE_PREFIX}-sweep.txt` }),
      });
      check("清理根目录 sweep", sweepDel.status === 200, `status=${sweepDel.status}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

const PROBE_SESSION = {
  id: PROBE_SESSION_ID,
  projectName: PROBE_PROJECT,
  provider: "claude",
  displayName: "探针上传体验",
  status: "idle",
  createdAt: "2026-11-06T00:00:00.000Z",
};

// 段 A fixture：大 PDF（2MB）+ 600ms 延迟响应——uploading 态有稳定观察窗口（最终态断言）。
const BIG_PDF = {
  name: "probe-uppolish.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.concat([
    Buffer.from("%PDF-1.4 probe uppolish"),
    Buffer.alloc(2 * 1024 * 1024, 0x61),
  ]),
};
// A8 同批第二文件（abort 后仍能完成的不 wedged 断言）。
const PDF2 = {
  name: "probe-uppolish-second.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.alloc(1024, 0x62),
};
// 真链路段自建文件名（标记前缀，跑完只删自建数据）。
const LIVE_PREFIX = "probe-uppolish-live";
const COMPOSER_TEXTAREA = 'textarea[placeholder="向 Claude 提问..."]';
const TIMEOUT = 15000;

const results = [];
function check(name, cond, detail = "") {
  results.push(Boolean(cond));
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const pageJson = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForSelector('input[type="password"]', { state: "detached", timeout: 15000 });
}

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(pageJson({ projectNames: [PROBE_PROJECT], candidates: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill(pageJson({ sessions: [] })),
  );
  await page.route(/\/api\/approvals$/, (r) => r.fulfill(pageJson({ approvals: [] })));
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
  await page.route(new RegExp(`/api/projects/${PROBE_PROJECT}/agent-history(?:\\?.*)?$`), (r) =>
    r.fulfill(pageJson({ entries: [] })),
  );
  await page.route(new RegExp(`/api/projects/${PROBE_PROJECT}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(pageJson({ sessions: [PROBE_SESSION] })),
  );
  await page.route(
    new RegExp(`/api/projects/${PROBE_PROJECT}/agent-sessions/${PROBE_SESSION_ID}$`),
    (r) =>
      r.fulfill(
        pageJson({
          session: PROBE_SESSION,
          availableModels: ["sonnet"],
          availablePermissionModes: ["default"],
        }),
      ),
  );
  await page.route(
    new RegExp(
      `/api/projects/${PROBE_PROJECT}/agent-sessions/${PROBE_SESSION_ID}/auto-retry/status$`,
    ),
    (r) => r.fulfill(pageJson({ scheduled: false })),
  );
}

async function openSessionPage(page) {
  const sockets = [];
  await page.routeWebSocket(/\/claude-stream$/, (ws) => {
    sockets.push(ws);
  });
  await setupMocks(page);
  await login(page);
  await page.goto(`${WEB_ORIGIN}/projects/${PROBE_PROJECT}/session/${PROBE_SESSION_ID}`);
  const deadline = Date.now() + 10000;
  while (sockets.length === 0 && Date.now() < deadline) await page.waitForTimeout(100);
  const socket = sockets.at(-1);
  if (!socket) throw new Error("claude-stream WS 未建立");
  socket.send(JSON.stringify({ type: "session_init", resume: false }));
  socket.send(
    JSON.stringify({
      type: "assistant",
      uuid: "uuid-uppolish-hello",
      message: {
        id: "msg-uppolish-hello",
        role: "assistant",
        content: [{ type: "text", text: "上传体验探针欢迎行" }],
      },
    }),
  );
  await page.locator(COMPOSER_TEXTAREA).waitFor({ state: "visible", timeout: 10000 });
  return socket;
}

await main();
