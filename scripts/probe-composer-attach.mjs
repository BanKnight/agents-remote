// 探针：composer 发图批（2026-10-04）——+ 菜单（图片/相机/文件）、图片内联 stream-json、
// 文件上传 uploads/ 提及行、纯附件发送（append 兜底）、下行图片气泡渲染、chip 移除。
// 全程 mock API + mock claude-stream WS（routeWebSocket）：上行捕获进 frames 断言组帧
//（{type:"user", message:{role,content:[图片块?,文本块?]}}）——小 PNG 达标直传，
// source.data 与常量精确比对；重编码判定逻辑由 composer-attach 单测覆盖，不在本探针面。
// 下行推含 image block 的 user 行 → 断言气泡 <img src^=data:image> 渲染（禁截图，DOM 硬数据）。
// 桌面 1280×800 断言相机项 hover-capable:hidden；移动 390×844 断言 sheet 形态相机项常显
//（默认方向；§7 pointer media Chromium 模拟不了，触屏真机交清单）。
// 密码自读不打印；web DOM 探针前置过 ar-verify-css 三道闸；对真实后端只登录只读，不写数据。
// 用法：bun scripts/probe-composer-attach.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROBE_SESSION_ID = "agent_attach-probe";
const PROBE_PROJECT = "proj-attach";

const PROBE_SESSION = {
  id: PROBE_SESSION_ID,
  projectName: PROBE_PROJECT,
  provider: "claude",
  displayName: "Composer Attach Probe",
  status: "idle",
  createdAt: "2026-10-04T00:00:00.000Z",
};

// 1×1 PNG fixture：png 直传类型 + 尺寸 ≪ 1568 → normalizeImageFile 原样透传（保真链路）。
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_FILE = {
  name: "probe.png",
  mimeType: "image/png",
  buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
};
const PDF_FILE = {
  name: "probe-attach.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 probe attach"),
};
const UPLOAD_PATH = "uploads/probe-attach.pdf";
const COMPOSER_TEXTAREA = 'textarea[placeholder="向 Claude 提问..."]';

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

/** 页面内：按文案找 menuitem，回 { inDom, display }（display:none = CSS 隐藏的硬证据）。 */
function menuItemInfo(page, label) {
  return page.evaluate((label) => {
    const el = [...document.querySelectorAll('[role="menuitem"]')].find((n) =>
      n.textContent?.includes(label),
    );
    return el ? { inDom: true, display: getComputedStyle(el).display } : { inDom: false };
  }, label);
}

async function setupAttachMocks(page, frames) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(pageJson({ projectNames: [PROBE_PROJECT], candidates: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill(pageJson({ sessions: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions\/[^/]+$/, (r) =>
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
  // mock 上传端点（composer「文件」项）：writeUpload 契约形 = { entry: { path } }。
  await page.route(new RegExp(`/api/projects/${PROBE_PROJECT}/files/upload`), (r) =>
    r.fulfill(pageJson({ entry: { path: UPLOAD_PATH, name: "probe-attach.pdf", kind: "file" } })),
  );
  const sockets = [];
  await page.routeWebSocket(new RegExp(`/claude-stream$`), (ws) => {
    sockets.push(ws);
    // 上行（浏览器 → mock server）帧捕获：组帧断言的数据源。
    ws.onMessage((data) => {
      try {
        frames.push(JSON.parse(String(data)));
      } catch {
        /* 非 JSON 帧（ping 等）忽略 */
      }
    });
  });
  return sockets;
}

/** 打开会话页：mock + 登录 + 导航 + seed（session_init + 欢迎行），等 composer 在场。 */
async function openSessionPage(page, frames) {
  const sockets = await setupAttachMocks(page, frames);
  await login(page);
  await page.goto(`${WEB_ORIGIN}/projects/${PROBE_PROJECT}/session/${PROBE_SESSION_ID}`);
  const deadline = Date.now() + 10000;
  while (sockets.length === 0 && Date.now() < deadline) await page.waitForTimeout(100);
  const socket = sockets.at(-1);
  check("claude-stream 连接建立", socket != null);
  if (!socket) throw new Error("claude-stream WS 未建立");
  socket.send(JSON.stringify({ type: "session_init", resume: false }));
  socket.send(
    JSON.stringify({
      type: "assistant",
      uuid: "uuid-probe-hello",
      message: {
        id: "msg-probe-hello",
        role: "assistant",
        content: [{ type: "text", text: "探针欢迎行" }],
      },
    }),
  );
  await page.locator(COMPOSER_TEXTAREA).waitFor({ state: "visible", timeout: 10000 });
  return socket;
}

/** 从 frames[cursor.i] 起找第一条命中帧（游标防旧帧重复命中），超时 check-fail 返回 null。 */
async function waitForFrame(page, frames, cursor, pred, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const idx = frames.slice(cursor.i).findIndex(pred);
    if (idx >= 0) {
      cursor.i += idx + 1;
      return frames[cursor.i - 1];
    }
    await page.waitForTimeout(80);
  }
  check(label, false, "超时未捕获上行帧");
  return null;
}

(async () => {
  // web DOM 探针强制前置：CSS 落盘三道闸（hover-capable:hidden 为本批新 utility 锚）。
  const css = await verifyCssFlushed({
    expectClasses: ["hover-capable:hidden", "bg-surface-inset"],
    origin: WEB_ORIGIN,
  });
  if (!css.pass) {
    console.error(css.details.join("\n"));
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    // ── Part 1–6：桌面（hover-capable → 相机项隐藏；Enter 发送）──
    {
      const page = await (
        await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN" })
      ).newPage();
      const frames = [];
      const cursor = { i: 0 };
      const socket = await openSessionPage(page, frames);

      // Part 1: + 按钮与菜单（相机项桌面隐藏）
      const addBtn = page.getByRole("button", { name: "添加附件" });
      await addBtn.waitFor({ state: "visible", timeout: 8000 });
      check("Part1: + 按钮在场（aria-label=添加附件）", true);
      await addBtn.click();
      await page
        .getByRole("menuitem", { name: "图片" })
        .waitFor({ state: "visible", timeout: 5000 });
      check(
        "Part1: 菜单含 图片/文件",
        await page.getByRole("menuitem", { name: "文件" }).isVisible(),
      );
      const cam = await menuItemInfo(page, "相机");
      check(
        "Part1: 桌面相机项不可见（hover-capable:hidden）",
        !cam.inDom || cam.display === "none",
        `inDom=${cam.inDom} display=${cam.display ?? "-"}`,
      );
      // 图标显式尺寸契约（真机 WebKit 裸 svg 在 flex 里收缩 0×0——图形隐形但按钮可点，
      // Chromium 探针复现不了该差异，锁「有显式尺寸」防回归）。
      const plusSvg = await page.evaluate(() => {
        const svg = document.querySelector('button[aria-label="添加附件"] svg');
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      check(
        "Part1: + 图标 svg 有显式尺寸（16×16）",
        !!plusSvg && plusSvg.w === 16 && plusSvg.h === 16,
        `w=${plusSvg?.w ?? "null"} h=${plusSvg?.h ?? "null"}`,
      );
      await page.keyboard.press("Escape");

      // Part 2: 图片 pick → chip → Enter 发送 → 上行帧含 base64 图片块 + 文本块
      await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles(PNG_FILE);
      await page
        .locator('[data-attachment-chip] img[src^="data:image/png;base64,"]')
        .waitFor({ timeout: 8000 });
      check("Part2: 图片 chip 在场（缩略图 dataUrl）", true);
      const composer = page.locator(COMPOSER_TEXTAREA);
      await composer.fill("看看这张图");
      await composer.press("Enter");
      const frame2 = await waitForFrame(
        page,
        frames,
        cursor,
        (f) => f.type === "user" && f.message?.content?.some?.((b) => b.type === "image"),
        "Part2: 上行 user 帧含图片块",
      );
      if (frame2) {
        const c = frame2.message.content;
        check(
          "Part2: 图片块 = base64 png 精确透传（stream-json 形状）",
          c[0].type === "image" &&
            c[0].source?.type === "base64" &&
            c[0].source?.media_type === "image/png" &&
            c[0].source?.data === TINY_PNG_BASE64,
        );
        check("Part2: 文本块并入帧", c[1]?.type === "text" && c[1].text === "看看这张图");
        check(
          "Part2: 发送后 chips 清空",
          (await page.locator("[data-composer-attachments]").count()) === 0,
        );
      }

      // Part 3: 纯附件发送（无文本 → append(" ") 兜底）→ 帧仅图片块
      await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles(PNG_FILE);
      await page.locator("[data-attachment-chip]").waitFor({ timeout: 8000 });
      await composer.press("Enter");
      const frame3 = await waitForFrame(
        page,
        frames,
        cursor,
        (f) =>
          f.type === "user" &&
          Array.isArray(f.message?.content) &&
          f.message.content.some((b) => b.type === "image"),
        "Part3: 纯附件上行帧",
      );
      if (frame3) {
        const c = frame3.message.content;
        check(
          "Part3: 无文本纯图帧（image-only，不丢发）",
          c.length === 1 && c[0].type === "image" && c[0].source?.data === TINY_PNG_BASE64,
          `content types=${c.map((b) => b.type).join(",")}`,
        );
      }

      // Part 4: 文件 pick（mock 上传）→ chip 就绪显示路径 → 提及行并入帧文本
      await page.locator('input[type="file"]:not([accept])').setInputFiles(PDF_FILE);
      await page
        .locator("[data-attachment-chip]", { hasText: UPLOAD_PATH })
        .waitFor({ timeout: 8000 });
      check("Part4: 文件 chip 就绪显示 uploads/ 路径", true);
      await composer.press("Enter");
      const frame4 = await waitForFrame(
        page,
        frames,
        cursor,
        (f) => f.type === "user" && JSON.stringify(f.message?.content ?? []).includes(UPLOAD_PATH),
        "Part4: 文件提及行上行帧",
      );
      if (frame4) {
        const c = frame4.message.content;
        check(
          "Part4: 纯文件帧 = 单文本块「附件：uploads/probe-attach.pdf」",
          c.length === 1 && c[0].type === "text" && c[0].text === `附件：${UPLOAD_PATH}`,
          `text=${c[0]?.text ?? "?"}`,
        );
      }

      // Part 5: 下行渲染——mock WS 推含 image block 的 user 行 → 气泡 <img>（Pass 1 不丢图）
      const before = await page.locator("img[src^='data:image/png;base64,']").count();
      socket.send(
        JSON.stringify({
          type: "user",
          uuid: "uuid-attach-down",
          message: {
            id: "msg-attach-down",
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: TINY_PNG_BASE64 },
              },
              { type: "text", text: "下行图片气泡" },
            ],
          },
        }),
      );
      let downOk = false;
      try {
        await page.waitForFunction(
          (n) => document.querySelectorAll("img[src^='data:image/png;base64,']").length > n,
          before,
          { timeout: 8000 },
        );
        downOk = true;
      } catch {
        downOk = false;
      }
      check("Part5: 下行 user 行（含 image block）渲染气泡 img", downOk, `before=${before}`);

      // Part 6: chip × 移除
      await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles(PNG_FILE);
      await page.locator("[data-attachment-chip]").waitFor({ timeout: 8000 });
      const xSvg = await page.evaluate(() => {
        const svg = document.querySelector(
          '[data-attachment-chip] button[aria-label="移除附件"] svg',
        );
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      check(
        "Part6: × 图标 svg 有显式尺寸（16×16，同 + 钮契约）",
        !!xSvg && xSvg.w === 16 && xSvg.h === 16,
        `w=${xSvg?.w ?? "null"}`,
      );
      await page.getByRole("button", { name: "移除附件" }).click();
      check(
        "Part6: × 移除后 chip 行消失",
        (await page.locator("[data-composer-attachments]").count()) === 0,
      );
      await page.context().close();
    }

    // ── Part M：移动 viewport → ActionMenu sheet 形态，相机项常显（默认方向；
    // hover-capable:hidden 不命中即常显，触屏 media 真值交真机清单）──
    {
      const page = await (
        await browser.newContext({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
          locale: "zh-CN",
        })
      ).newPage();
      await openSessionPage(page, []);
      await page.getByRole("button", { name: "添加附件" }).click();
      await page
        .getByRole("menuitem", { name: "相机" })
        .waitFor({ state: "visible", timeout: 6000 });
      const camM = await menuItemInfo(page, "相机");
      check(
        "PartM: 移动 sheet 相机项常显（默认方向）",
        camM.inDom && camM.display !== "none",
        `display=${camM.display ?? "-"}`,
      );
      await page.context().close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${results.length} assertions)`);
  process.exit(failed === 0 ? 0 : 1);
})();
