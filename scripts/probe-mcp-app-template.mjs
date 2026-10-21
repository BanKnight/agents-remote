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
              "# Heading\n\n- item one\n- item two\n\n`code` and **bold**\n\n| h1 | h2 |\n| --- | --- |\n| a | b |\n\n<b>raw html</b>\n\n<script>window.__xss=1</script>\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n```js\nvar x = 1;\n```",
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
    xssScriptInBody: document.querySelectorAll("#body script").length,
    tableCells: document.querySelectorAll("#body th").length,
    rawHtmlB: document.querySelector("#body b")?.textContent ?? "",
    scriptCount: document.querySelectorAll("script").length,
    inlineScripts: [...document.querySelectorAll("script")].filter((s) => !s.hasAttribute("src"))
      .length,
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
  // 渲染时刻的 pre 数 = js 块 + mermaid 围栏（升级前）= 2；升级后余 1 在 mermaid 断言后复验。
  assert("code blocks rendered pre-upgrade", rendered.preLen === 2, String(rendered.preLen));
  // rich 管线（marked + DOMPurify）：raw <script> 被剥除（元素移除），非 legacy 转义。
  assert(
    "XSS script stripped (not executed)",
    rendered.xssExecuted !== true && rendered.xssScriptInBody === 0,
    `exec=${rendered.xssExecuted} inBody=${rendered.xssScriptInBody}`,
  );
  assert("table rendered", rendered.tableCells === 2, String(rendered.tableCells));
  assert(
    "raw html passthrough (whitelisted b tag)",
    rendered.rawHtmlB === "raw html",
    rendered.rawHtmlB,
  );
  // 构建期内联 3 库 + 1 主脚本，全部无 src（零外域——CSP script-src 'unsafe-inline' 契约）。
  assert(
    "scripts all inline (3 libs + 1 main)",
    rendered.scriptCount === 4 && rendered.inlineScripts === 4,
    `${rendered.scriptCount}/${rendered.inlineScripts}`,
  );

  // mermaid 围栏 → 异步升级为 SVG（渲染库首次 initialize + render 较慢，轮询等待）。
  let mermaidState;
  try {
    await page.waitForSelector("#body .mermaid-box svg", { timeout: 8000 });
    mermaidState = await page.evaluate(() => ({
      boxes: document.querySelectorAll("#body .mermaid-box").length,
      nodes: document.querySelectorAll("#body .mermaid-box svg g").length,
      leftover: document.querySelectorAll("#body pre code.language-mermaid").length,
    }));
  } catch {
    mermaidState = { boxes: 0, nodes: 0, leftover: -1 };
  }
  assert(
    "mermaid fence upgraded to svg",
    mermaidState.boxes === 1 && mermaidState.nodes > 0 && mermaidState.leftover === 0,
    JSON.stringify(mermaidState),
  );
  // 升级后 js 代码块独存且内容完整（升级不误伤普通围栏）。
  const preCode = await page.evaluate(
    () => document.querySelector("#body pre code")?.textContent ?? "",
  );
  assert(
    "code block intact after mermaid upgrade",
    preCode.includes("var x = 1"),
    preCode.slice(0, 20),
  );

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

  // 主题切换触发 mermaid 全量重渲染（异步）——SVG 重建回来。
  try {
    await page.waitForFunction(
      () => document.querySelectorAll("#body .mermaid-box svg").length === 1,
      { timeout: 8000 },
    );
    assert("mermaid re-rendered after theme switch", true);
  } catch {
    assert(
      "mermaid re-rendered after theme switch",
      false,
      String(await page.evaluate(() => document.querySelectorAll("#body .mermaid-box").length)),
    );
  }

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
  // 新 markdown 无 mermaid 围栏 → 全量重写后旧 SVG 盒不残留。
  const mermaidGone = await page.evaluate(
    () => document.querySelectorAll("#body .mermaid-box").length,
  );
  assert("refresh without mermaid clears boxes", mermaidGone === 0, String(mermaidGone));

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

  // 9.5 file-preview kind(富模板双 kind 共用面的回归防线):.md 走富渲染(h1),
  //     非 .md 包 fence;刷新/追问请求按 kind 分派(read_file + 当前 path)。
  await page.evaluate(() => {
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          structuredContent: {
            kind: "file-preview",
            path: "docs/README.md",
            name: "README.md",
            size: 1024,
            content: "# File Heading\n\nfile body",
          },
        },
      },
      "*",
    );
  });
  await page.waitForTimeout(50);
  const fileMd = await page.evaluate(() => ({
    title: document.getElementById("title").textContent,
    meta: document.getElementById("meta").textContent,
    h1: document.querySelector("#body h1")?.textContent ?? "",
  }));
  assert(
    "file-preview .md renders rich (h1 via marked)",
    fileMd.title === "README.md" &&
      fileMd.meta.includes("docs/README.md") &&
      fileMd.h1 === "File Heading",
    JSON.stringify(fileMd),
  );
  await page.evaluate(() => {
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          structuredContent: {
            kind: "file-preview",
            path: "src/app.py",
            name: "app.py",
            size: 64,
            content: "print('hi')",
          },
        },
      },
      "*",
    );
  });
  await page.waitForTimeout(50);
  const fileTxt = await page.evaluate(() => ({
    pre: document.querySelector("#body pre code")?.textContent ?? "",
    headings: document.querySelectorAll("#body h1").length,
  }));
  assert(
    "file-preview non-md wrapped in fence (no rich heading)",
    fileTxt.pre.includes("print('hi')") && fileTxt.headings === 0,
    JSON.stringify(fileTxt),
  );
  await page.click("#refresh");
  await page.waitForTimeout(50);
  msgs = await page.evaluate(() => window.__msgs);
  const fileRefresh = [...msgs].reverse().find((m) => m && m.method === "tools/call");
  assert(
    "file-preview refresh dispatches read_file with current path",
    fileRefresh?.params?.name === "read_file" &&
      fileRefresh?.params?.arguments?.path === "src/app.py",
    JSON.stringify(fileRefresh?.params ?? null),
  );
  await page.evaluate((id) => {
    window.postMessage(
      { jsonrpc: "2.0", id, result: { content: [], structuredContent: null } },
      "*",
    );
  }, fileRefresh?.id ?? 0);
  await page.fill("#ask-input", "这个文件做什么");
  await page.click("#ask-send");
  await page.waitForTimeout(50);
  msgs = await page.evaluate(() => window.__msgs);
  const fileAsk = [...msgs].reverse().find((m) => m && m.method === "ui/message");
  const fileAskText =
    typeof fileAsk?.params?.content?.text === "string" ? fileAsk.params.content.text : "";
  assert(
    "file-preview ask wraps with file context prefix",
    fileAskText.includes("关于文件「app.py") && fileAskText.includes("这个文件做什么"),
    fileAskText,
  );
  await page.evaluate((id) => {
    window.postMessage({ jsonrpc: "2.0", id, result: {} }, "*");
  }, fileAsk?.id ?? 0);

  // 9.6 legacy 兜底渲染器(renderBlocks,rich 管线抛异常时回落):标题/加粗命中,
  //     纯文本不被误包 strong(P2-1 转义层级回归防线)。
  await page.evaluate(() => {
    const throwing = () => {
      throw new Error("probe: force legacy fallback");
    };
    window.marked = { parse: throwing };
    window.DOMPurify = { sanitize: throwing };
  });
  await page.evaluate(() => {
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          structuredContent: {
            kind: "wiki-page",
            slug: "probe",
            title: "Fallback",
            markdown: "# Fallback Heading\n\nplain text line\n\n**real bold** and `code`",
          },
        },
      },
      "*",
    );
  });
  await page.waitForTimeout(50);
  const fallback = await page.evaluate(() => ({
    h1: document.querySelector("#body h1")?.textContent ?? "",
    plainStrong: [...document.querySelectorAll("#body p strong")].map((s) => s.textContent),
    bold: document.querySelector("#body p strong")?.textContent ?? "",
    code: document.querySelector("#body p code")?.textContent ?? "",
  }));
  assert(
    "legacy fallback renders headings + real bold, plain text untouched",
    fallback.h1 === "Fallback Heading" &&
      fallback.bold === "real bold" &&
      fallback.code === "code" &&
      !fallback.plainStrong.includes("plain text line"),
    JSON.stringify(fallback),
  );

  // 10. 零 pageerror。
  assert("no page errors", pageErrors.length === 0, pageErrors.join("; "));
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
