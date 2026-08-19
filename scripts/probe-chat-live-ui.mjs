// probe-chat-live-ui.mjs —— chat detail 真实浏览器发消息链路探针（live-LLM 验证域）。
// 覆盖 probe-chat-e2e.mjs（裸 WS）测不到的 web 渲染链：登录 → 创建 chat → 进 /chat/$id
// → 发消息 → 断言（1）无 console error / pageerror（用户报错的直接证据），
// （2）user 气泡渲染（echo 确认），（3）assistant 气泡渲染（含文本）。
//
// 需 runtimes.pi 已配置（agnes preset）。密码自读不打印。
// 用法：bun scripts/probe-chat-live-ui.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const results = [];
const check = (ok, name, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /解锁|Unlock/ }).click();
  await page.waitForTimeout(700);
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
  const page = await ctx.newPage();

  // 捕获浏览器 console + 未捕获异常（用户报错的直接证据）。
  const consoleErrors = [];
  const pageErrors = [];
  const wsRaw = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") consoleErrors.push(text);
    if (text.includes("[pi-adapter]")) console.log(`  [browser console] ${text}`);
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  const failedResponses = [];
  page.on("response", (res) => {
    if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`);
  });
  page.on("websocket", (ws) => {
    ws.on("framesent", (f) => wsRaw.push({ dir: "sent", text: f.payload }));
    ws.on("framereceived", (f) => wsRaw.push({ dir: "recv", text: f.payload }));
  });

  try {
    await login(page);

    // ── 创建 chat + 进 detail ──
    // 不传 displayName——走默认名「新对话」，LLM 标题落盘守卫（仅默认名可覆盖）才能真实走通。
    const createRes = await page.request.post(`${WEB_ORIGIN}/api/chat-sessions`, {
      data: {},
    });
    const { session } = await createRes.json();
    const chatId = session.id;
    check(true, "create chat", `id=${chatId}`);

    await page.goto(`${WEB_ORIGIN}/chat/${chatId}`);
    // 等 WS 连接 + 首批（composer 由 connected 驱动可输入）。
    await page.waitForTimeout(2500);

    const composer = page.getByRole("textbox").first();
    check((await composer.count()) === 1, "composer textbox 渲染");
    const inputDisabled = await composer.isDisabled();
    check(!inputDisabled, "composer 可输入（WS connected）", `disabled=${inputDisabled}`);

    // ── 发消息 ──
    const prompt = "你好，pi！用一句话回复即可。";
    await composer.fill(prompt);
    await composer.press("Enter");
    console.log(`[ok] sent prompt: "${prompt}"`);

    // ── 等 assistant 气泡 ──
    await page.waitForTimeout(15000);

    // ── 等 LLM 标题生成（turn 结束后 completeSimple 异步调用，真实 LLM 有几秒延迟）──
    let titleFrame = null;
    for (let i = 0; i < 30; i++) {
      titleFrame = wsRaw.find((f) => f.dir === "recv" && f.text.includes('"chat_title"'));
      if (titleFrame) break;
      await page.waitForTimeout(1000);
    }
    let headerTitle = "";
    try {
      headerTitle = await page.locator("header span.truncate").first().textContent();
    } catch {}

    // user 气泡：echo 确认（乐观 user 气泡出现即渲染链路活了）。
    const userBubbles = await page.getByText(prompt).count();
    check(userBubbles > 0, "user 气泡渲染（echo 确认）", `count=${userBubbles}`);

    // 豁免：页面初始加载探测登录态 → /api/auth/me 401 是预期语义
    // （getAuthStatus 对 401 return false，见 web/src/api/client.ts），浏览器对 4xx fetch
    // 自动打 console.error「Failed to load resource: 401」。仅当 401 全部来自 /api/auth/me
    // 且无其它 >=400 时视为预期，否则照常计入失败。
    const authMe401 = failedResponses.filter(
      (r) => r.startsWith("401 ") && r.includes("/api/auth/me"),
    );
    const otherHttpFail = failedResponses.filter(
      (r) => !(r.startsWith("401 ") && r.includes("/api/auth/me")),
    );
    const expectedAuthProbe =
      authMe401.length > 0 &&
      authMe401.length === failedResponses.length &&
      consoleErrors.every((e) => e.includes("status of 401"));
    const effectiveConsoleErrors = expectedAuthProbe
      ? consoleErrors.filter((e) => !e.includes("status of 401"))
      : consoleErrors;
    // 诊断：dump 聊天区 DOM（线程 role 容器 + 文本），定位渲染层是否产出气泡。
    const threadDump = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll(
        "[data-role], [data-turn-message-ids], [data-testid]",
      )) {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("data-role");
        const turns = el.getAttribute("data-turn-message-ids");
        const testid = el.getAttribute("data-testid");
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
        out.push(
          `${tag}${role ? ` role=${role}` : ""}${turns ? ` turns=${turns}` : ""}${testid ? ` tid=${testid}` : ""}: ${text}`,
        );
      }
      return out.slice(0, 30);
    });
    console.log("\n── thread DOM ──");
    for (const line of threadDump) console.log(`  ${line}`);
    console.log(
      `  [roles] ${threadDump.filter((l) => l.includes("role=")).length} role 容器 / ${threadDump.length} 总匹配`,
    );
    check(
      effectiveConsoleErrors.length === 0,
      "无 console.error",
      effectiveConsoleErrors.slice(0, 3).join(" | "),
    );
    check(pageErrors.length === 0, "无 pageerror", pageErrors.slice(0, 3).join(" | "));

    // assistant 文本（Agnes 回复，不确定文案，找任意非空文本块——真实回复形如
    // "你好！我是 Agnes，由 Sapiens AI 开发。"，回复会变化，只锚定自我介绍 + 常用问候）。
    const pageText = await page.evaluate(() => document.body.innerText);
    const hasAssistantText = /我是 (Agnes|agnes|pi|Pi)|我并非 pi|有什么可以帮你|你好/.test(
      pageText,
    );
    check(hasAssistantText, "assistant 气泡渲染（含回复文本）", pageText.slice(0, 120));

    // ── LLM 智能标题（首条消息后一次性生成）──
    check(
      !!titleFrame,
      "WS recv chat_title 帧",
      titleFrame ? titleFrame.text.slice(0, 80) : "未收到",
    );
    check(
      !!headerTitle && headerTitle !== "新对话",
      "header 标题更新（非默认名）",
      `title="${headerTitle ?? ""}"`,
    );
    // 持久化：registry 元数据 displayName 已落盘（关闭前查 API）。
    let persistedName = "";
    try {
      const detailRes = await page.request.get(`${WEB_ORIGIN}/api/chat-sessions/${chatId}`);
      const body = await detailRes.json();
      persistedName = body?.session?.displayName ?? "";
    } catch {}
    check(
      persistedName === headerTitle,
      "标题已落盘 registry 元数据",
      `displayName="${persistedName}"`,
    );

    // WS 帧摘要（诊断：echo/pi_event 是否到达浏览器）。
    const sent = wsRaw.filter((f) => f.dir === "sent" && f.text.includes('"user"'));
    const recvEcho = wsRaw.filter((f) => f.dir === "recv" && f.text.includes("pi_user_echo"));
    const recvAsst = wsRaw.filter((f) => f.dir === "recv" && f.text.includes("message_end"));
    check(sent.length > 0, "WS sent user 帧", `count=${sent.length}`);
    check(recvEcho.length > 0, "WS recv pi_user_echo", `count=${recvEcho.length}`);
    check(recvAsst.length > 0, "WS recv assistant message_end", `count=${recvAsst.length}`);

    if (effectiveConsoleErrors.length > 0 || pageErrors.length > 0 || otherHttpFail.length > 0) {
      console.log("\n── 错误详情 ──");
      for (const e of effectiveConsoleErrors.slice(0, 5)) console.log(`[console.error] ${e}`);
      for (const e of pageErrors.slice(0, 5)) console.log(`[pageerror] ${e}`);
      for (const r of otherHttpFail.slice(0, 5)) console.log(`[http>=400] ${r}`);
    }

    // ── 诊断：列出收到的 pi_event 帧（type + role + 文本截断）──
    const piFrames = wsRaw.filter((f) => f.dir === "recv" && f.text.includes("pi_event"));
    console.log(`\n── 浏览器收到的 pi_event 帧（${piFrames.length}）──`);
    for (const f of piFrames) {
      let parsed;
      try {
        parsed = JSON.parse(f.text);
      } catch {
        continue;
      }
      const ev = parsed.event ?? {};
      const m = ev.message ?? {};
      const contentText = Array.isArray(m.content)
        ? m.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join(" ")
        : m.content;
      console.log(
        `  [recv] ${ev.type} role=${m.role ?? "-"} content=${(contentText ?? "").toString().slice(0, 60)}`,
      );
    }

    // ── 清理 ──
    try {
      await page.request.post(`${WEB_ORIGIN}/api/chat-sessions/${chatId}/close`);
    } catch {}
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed} pass / ${failed} fail`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
