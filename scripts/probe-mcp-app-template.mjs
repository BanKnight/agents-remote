// MCP Apps wiki 模板浏览器探针：真实 Chromium 内验证模板脚本行为。
// 单测（jsdom）不执行 srcdoc 内脚本——主题切换、内容高度上报、XSS 转义、
// 数据渲染只有真浏览器能断言。模板经 bun TS import 从单源表直取。
//
// 跑法：bun scripts/probe-mcp-app-template.mjs
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { HUB_UI_RESOURCES } from "../api/src/mcp-hub-server.ts";

const html = HUB_UI_RESOURCES["ui://ar-hub/wiki-page"].html;
if (!html || !html.includes("ui/notifications/tool-result")) {
  console.error("FAIL: template missing or wrong uri");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "ar-mcp-probe-"));
const file = join(dir, "wiki-page.html");
writeFileSync(file, html);

const results = [];
const assert = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // 收集模板发往 parent 的消息（file:// 下 parent = self，回环可收）。注册必须
  // 先于模板 script——初始 load/ResizeObserver 上报发生在 goto 完成前后，晚注册
  // 会把首条 size-changed 错过（2026-10-20 探针实抓）。
  await page.addInitScript(() => {
    window.__msgs = [];
    window.addEventListener("message", (e) => window.__msgs.push(e.data));
  });

  await page.goto(`file://${file}`);
  await page.waitForTimeout(100);

  // 1. 主题：默认深色（:root 基准）。
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert("default theme dark bg", darkBg === "rgb(15, 17, 21)", darkBg);

  // 2. host-context-changed → light。
  await page.evaluate(() => {
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: { theme: "light" },
      },
      "*",
    );
  });
  await page.waitForTimeout(50);
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert("host-context theme=light bg", lightBg === "rgb(255, 255, 255)", lightBg);

  // 3. tool-result 渲染 + XSS 转义。
  await page.evaluate(() => {
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          structuredContent: {
            kind: "wiki-page",
            slug: "probe",
            title: "Probe <img src=x onerror=alert(1)>",
            tags: ["a", "b"],
            markdown:
              "# Heading\n\n- item one\n- item two\n\n`code` and **bold**\n\n```js\nvar x = 1;\n```\n\n<script>window.__xss=1</script>",
          },
        },
      },
      "*",
    );
  });
  await page.waitForTimeout(50);
  const rendered = await page.evaluate(() => ({
    title: document.getElementById("title").textContent,
    // textContent 会把实体解码回原文——转义断言的正确形状是「文本完整 + 无
    // 被解析出的元素」，而不是 textContent 不含 < 字符。
    titleImg: document.querySelectorAll("#title img").length,
    tags: document.querySelectorAll(".tag").length,
    items: document.querySelectorAll("#body li").length,
    bold: document.querySelector("#body strong")?.textContent ?? "",
    code: document.querySelector("#body code")?.textContent ?? "",
    preLen: document.querySelectorAll("#body pre").length,
    xssExecuted: window.__xss === 1,
    scriptCount: document.querySelectorAll("script").length,
  }));
  assert(
    "title rendered (text intact, no img element)",
    rendered.title === "Probe <img src=x onerror=alert(1)>" && rendered.titleImg === 0,
    rendered.title,
  );
  assert("tags rendered", rendered.tags === 2, String(rendered.tags));
  assert("list items rendered", rendered.items === 2, String(rendered.items));
  assert(
    "inline code + bold",
    rendered.bold === "bold" && rendered.code === "code",
    `${rendered.bold}/${rendered.code}`,
  );
  assert("code block rendered", rendered.preLen === 1, String(rendered.preLen));
  assert("XSS script escaped (not executed)", rendered.xssExecuted !== true);
  assert("no extra script elements", rendered.scriptCount === 1, String(rendered.scriptCount));

  // 4. 高度上报：渲染后模板应发出 size-changed（取最后一条 = 渲染后的高度；
  //    首条是空模板初始上报，height≈44 属正常）。
  await page.waitForTimeout(100);
  let msgs = await page.evaluate(() => window.__msgs);
  const sizeMsgs = msgs.filter(
    (m) =>
      m && m.method === "ui/notifications/size-changed" && typeof m.params?.height === "number",
  );
  assert(
    "size-changed reported with numeric height",
    sizeMsgs.length >= 2,
    JSON.stringify(msgs.map((m) => m?.method)),
  );
  const height = sizeMsgs[sizeMsgs.length - 1]?.params?.height ?? 0;
  assert("height grows with content (>100px)", height > 100, String(height));

  // 5. 主题切回 dark。
  await page.evaluate(() => {
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: { theme: "dark" },
      },
      "*",
    );
  });
  await page.waitForTimeout(50);
  const darkAgain = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert("theme back to dark", darkAgain === "rgb(15, 17, 21)", darkAgain);

  // 6. 握手：模板加载即发 ui/initialize 请求（file:// 回环 → 收集器收到）。
  msgs = await page.evaluate(() => window.__msgs);
  const initReq = msgs.find((m) => m && m.method === "ui/initialize");
  assert(
    "handshake ui/initialize request sent",
    !!initReq,
    JSON.stringify(initReq?.params?.appInfo ?? null),
  );

  // 7. 应答 hostContext{light, zh-CN} → initialized 通知 + locale 文案应用。
  await page.evaluate((id) => {
    window.postMessage(
      {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2026-01-26",
          hostInfo: { name: "agents-remote", version: "0.0.0" },
          hostCapabilities: {},
          hostContext: { theme: "light", locale: "zh-CN" },
        },
      },
      "*",
    );
  }, initReq?.id ?? 0);
  await page.waitForTimeout(50);
  msgs = await page.evaluate(() => window.__msgs);
  assert(
    "initialized notification after handshake reply",
    msgs.some((m) => m && m.method === "ui/notifications/initialized"),
  );
  const localeState = await page.evaluate(() => ({
    refresh: document.getElementById("refresh").textContent,
    placeholder: document.getElementById("ask-input").getAttribute("placeholder"),
  }));
  assert(
    "locale zh applied (refresh btn + ask placeholder)",
    localeState.refresh === "刷新" && localeState.placeholder === "向 agent 追问本页…",
    JSON.stringify(localeState),
  );

  // 8. 刷新钮：点击 → tools/call 请求（arguments.slug 取当前页）→ 应答新
  //    structuredContent → 标题更新 + 按钮恢复。
  await page.click("#refresh");
  await page.waitForTimeout(50);
  msgs = await page.evaluate(() => window.__msgs);
  const refreshReq = [...msgs].reverse().find((m) => m && m.method === "tools/call");
  assert(
    "refresh sends tools/call with current slug",
    refreshReq?.params?.name === "wiki_read_page" &&
      refreshReq?.params?.arguments?.slug === "probe",
    JSON.stringify(refreshReq?.params ?? null),
  );
  await page.evaluate((id) => {
    window.postMessage(
      {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: "{}" }],
          structuredContent: {
            kind: "wiki-page",
            slug: "probe",
            title: "Refreshed Page",
            tags: ["a"],
            markdown: "# v2",
          },
        },
      },
      "*",
    );
  }, refreshReq?.id ?? 0);
  await page.waitForTimeout(50);
  const refreshed = await page.evaluate(() => ({
    title: document.getElementById("title").textContent,
    refreshDisabled: document.getElementById("refresh").disabled,
  }));
  assert(
    "refresh applies new structuredContent + button re-enabled",
    refreshed.title === "Refreshed Page" && refreshed.refreshDisabled === false,
    JSON.stringify(refreshed),
  );

  // 9. 追问条：输入文本 + 点发送 → ui/message 请求（role=user + 前缀包装）→
  //    应答 {} 后输入框清空。
  await page.fill("#ask-input", "这块为什么这样设计");
  await page.click("#ask-send");
  await page.waitForTimeout(50);
  msgs = await page.evaluate(() => window.__msgs);
  const askReq = [...msgs].reverse().find((m) => m && m.method === "ui/message");
  const askText =
    typeof askReq?.params?.content?.text === "string" ? askReq.params.content.text : "";
  assert(
    "ask sends ui/message with wrapped text",
    askReq?.params?.role === "user" &&
      askReq?.params?.content?.type === "text" &&
      askText.includes("Refreshed Page") &&
      askText.includes("这块为什么这样设计"),
    askText,
  );
  await page.evaluate((id) => {
    window.postMessage({ jsonrpc: "2.0", id, result: {} }, "*");
  }, askReq?.id ?? 0);
  await page.waitForTimeout(50);
  const askCleared = await page.evaluate(() => document.getElementById("ask-input").value);
  assert("ask input cleared after reply", askCleared === "", askCleared);

  // 10. 零 pageerror。
  assert("no page errors", pageErrors.length === 0, pageErrors.join("; "));
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
