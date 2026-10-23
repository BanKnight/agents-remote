// MCP Apps 轻模板浏览器探针（git-status / git-log / markdown-lite 卡）：真实 Chromium 内
// 验证零库结构化卡 + markdown 轻变体的渲染/XSS 转义/主题/高度上报/刷新回灌/追问条。
// 单测（jsdom）不执行 srcdoc 内脚本——主题切换、esc 转义、表格渲染只有真浏览器能断言。
// 模板经 bun TS import 从单源表直取。富卡行为由 probe-mcp-app-template.mjs（26 断言）守护。
//
// 跑法：bun scripts/probe-mcp-app-light-template.mjs
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { HUB_UI_RESOURCES } from "../api/src/mcp-hub-server.ts";

const GIT_STATUS_HTML = HUB_UI_RESOURCES["ui://ar-hub/git-status"].html;
const GIT_LOG_HTML = HUB_UI_RESOURCES["ui://ar-hub/git-log"].html;
const MD_LITE_HTML = HUB_UI_RESOURCES["ui://ar-hub/markdown-lite"]?.html;
const RICH_HTML = HUB_UI_RESOURCES["ui://ar-hub/wiki-page"].html;
if (!GIT_STATUS_HTML || !GIT_LOG_HTML || !MD_LITE_HTML || !RICH_HTML) {
  console.error("FAIL: templates missing from HUB_UI_RESOURCES");
  process.exit(1);
}

const results = [];
const assert = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── 静态:轻重分流（轻卡零库,富卡内联三库）──
assert(
  "git-status template is light (<100KB)",
  GIT_STATUS_HTML.length < 100_000,
  `${(GIT_STATUS_HTML.length / 1024).toFixed(1)}KB`,
);
assert(
  "git-log template is light (<100KB)",
  GIT_LOG_HTML.length < 100_000,
  `${(GIT_LOG_HTML.length / 1024).toFixed(1)}KB`,
);
assert(
  "rich template carries inline libs (>1MB)",
  RICH_HTML.length > 1_000_000,
  `${(RICH_HTML.length / 1024 / 1024).toFixed(1)}MB`,
);
assert(
  "light template has no markdown/mermaid pipeline",
  !GIT_STATUS_HTML.includes("upgradeMermaidBlocks") &&
    !GIT_STATUS_HTML.includes("renderBody") &&
    !GIT_LOG_HTML.includes("upgradeMermaidBlocks"),
);

// ── 静态:markdown 轻变体（轻/重模板分流,2026-10-23）──
// 供给面:lite <150KB、markdown 真管线在、mermaid 运行时不在（esbuild bundle 导出桥
// 是库内联唯一特征——模板自身的 upgradeMermaidBlocks 守卫函数 lite 也有）。
assert(
  "markdown-lite template is light (<150KB)",
  MD_LITE_HTML.length < 150_000,
  `${(MD_LITE_HTML.length / 1024).toFixed(1)}KB`,
);
assert(
  "markdown-lite keeps markdown pipeline (marked+DOMPurify)",
  MD_LITE_HTML.includes("renderBody") &&
    MD_LITE_HTML.includes("marked.parse") &&
    MD_LITE_HTML.includes("DOMPurify"),
);
assert("markdown-lite has no mermaid runtime", !MD_LITE_HTML.includes("__esbuild_esm_mermaid_nm"));

const dir = mkdtempSync(join(tmpdir(), "ar-mcp-light-"));
const browser = await chromium.launch();

/** 每卡独立 page：写模板文件 + 注入消息收集器,返回 context 数据。 */
const openCard = async (name, html) => {
  const file = join(dir, `${name}.html`);
  writeFileSync(file, html);
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  // 收集模板发往 parent 的消息（file:// 下 parent = self 回环）。必须先于模板 script。
  await page.addInitScript(() => {
    window.__msgs = [];
    window.addEventListener("message", (e) => window.__msgs.push(e.data));
  });
  await page.goto(`file://${file}`);
  await page.waitForTimeout(100);
  return { page, pageErrors };
};

const feedToolResult = (page, sc) =>
  page.evaluate((data) => {
    window.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: { structuredContent: data },
      },
      "*",
    );
  }, sc);

const feedHostContext = (page, params) =>
  page.evaluate((p) => {
    window.postMessage(
      { jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: p },
      "*",
    );
  }, params);

const msgs = (page) => page.evaluate(() => window.__msgs);

// ── git-status 卡 ──────────────────────────────────────────────────────
try {
  {
    const { page, pageErrors } = await openCard("git-status", GIT_STATUS_HTML);

    // 1. 默认深色（CARD_CSS :root 基准,与富卡同基座）。
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert("git-status default dark bg", darkBg === "rgb(15, 17, 21)", darkBg);

    // 2. 主题切换 → light。
    await feedHostContext(page, { theme: "light" });
    await page.waitForTimeout(50);
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert("git-status host-context light bg", lightBg === "rgb(255, 255, 255)", lightBg);

    // 3. 喂 dirty 数据（path 带 XSS 载荷,工作区 2 文件）。握手前 loc 未定,en 兜底。
    await feedToolResult(page, {
      kind: "git-status",
      branch: "main",
      clean: false,
      files: [
        {
          path: '<img src=x onerror="window.__xss=1">',
          status: "modified",
          scope: "worktree",
          addedLines: 1,
          removedLines: 1,
        },
        {
          path: "src/new.ts",
          status: "added",
          scope: "worktree",
          addedLines: 12,
          removedLines: null,
        },
      ],
    });
    await page.waitForTimeout(50);
    const rendered = await page.evaluate(() => ({
      title: document.getElementById("title").textContent,
      meta: document.getElementById("meta").textContent,
      rows: document.querySelectorAll("#body table tr").length,
      imgTags: document.querySelectorAll("#body img").length,
      firstPath: document.querySelector("#body .path-cell")?.textContent ?? "",
      badge: document.querySelector("#body .st")?.textContent ?? "",
      numAdd: document.querySelector("#body .num-add")?.textContent ?? "",
      numDel: document.querySelector("#body .num-del")?.textContent ?? "",
    }));
    assert(
      "dirty render: title/meta/table rows",
      rendered.title === "Git changes · main" &&
        rendered.meta === "2 changed files" &&
        rendered.rows === 3,
      JSON.stringify(rendered),
    );
    assert(
      "status badge M/A and ±lines",
      rendered.badge === "M" && rendered.numAdd === "+1" && rendered.numDel === "-1",
      JSON.stringify(rendered),
    );
    assert(
      "XSS path escaped (no img element, literal text)",
      rendered.imgTags === 0 && rendered.firstPath.includes("<img"),
      JSON.stringify(rendered),
    );

    // 4. 握手：ui/initialize → reply zh-CN → initialized 通知 + 中文文案重渲染
    //    （applyLocale → renderKind(lastData)）。
    let m = await msgs(page);
    const initReq = m.find((x) => x && x.method === "ui/initialize");
    assert("git-status handshake ui/initialize sent", !!initReq);
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
    m = await msgs(page);
    assert(
      "git-status initialized notification",
      m.some((x) => x && x.method === "ui/notifications/initialized"),
    );
    const zhState = await page.evaluate(() => ({
      title: document.getElementById("title").textContent,
      placeholder: document.getElementById("ask-input")?.getAttribute("placeholder") ?? "",
    }));
    assert(
      "zh re-render after handshake (title + generic placeholder)",
      zhState.title === "Git 变更 · main" && zhState.placeholder === "向 agent 追问…",
      JSON.stringify(zhState),
    );

    // 5. clean 数据 → 工作区干净文案,无 table。
    await feedToolResult(page, { kind: "git-status", branch: "main", clean: true, files: [] });
    await page.waitForTimeout(50);
    const cleanState = await page.evaluate(() => ({
      meta: document.getElementById("meta").textContent,
      tables: document.querySelectorAll("#body table").length,
    }));
    assert(
      "clean render: meta text + no table",
      cleanState.meta === "工作区干净" && cleanState.tables === 0,
      JSON.stringify(cleanState),
    );

    // 6. size-changed 上报存在 + 轻卡无 mermaid 盒。
    m = await msgs(page);
    assert(
      "size-changed reported",
      m.some((x) => x && x.method === "ui/notifications/size-changed"),
    );
    const mermaidBoxes = await page.evaluate(
      () => document.querySelectorAll("#body .mermaid-box").length,
    );
    assert("no mermaid boxes in light card", mermaidBoxes === 0, String(mermaidBoxes));

    // 7. 刷新钮 → tools/call name=git_status（refreshArgsSource="{}"）→ 回新
    //    sc（branch feature）→ zh 标题跟随 + 按钮恢复。
    await page.click("#refresh");
    await page.waitForTimeout(50);
    m = await msgs(page);
    const refreshReq = [...m].reverse().find((x) => x && x.method === "tools/call");
    assert(
      "refresh sends tools/call git_status with {} args",
      refreshReq?.params?.name === "git_status" &&
        JSON.stringify(refreshReq?.params?.arguments ?? null) === "{}",
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
              kind: "git-status",
              branch: "feature",
              clean: false,
              files: [
                {
                  path: "a.txt",
                  status: "modified",
                  scope: "worktree",
                  addedLines: 2,
                  removedLines: 0,
                },
              ],
            },
          },
        },
        "*",
      );
    }, refreshReq?.id ?? 0);
    await page.waitForTimeout(50);
    const refreshed = await page.evaluate(() => ({
      title: document.getElementById("title").textContent,
      meta: document.getElementById("meta").textContent,
      refreshDisabled: document.getElementById("refresh").disabled,
    }));
    assert(
      "refresh applies new sc (branch feature) + button re-enabled",
      refreshed.title === "Git 变更 · feature" &&
        refreshed.meta === "1 个文件变更" &&
        refreshed.refreshDisabled === false,
      JSON.stringify(refreshed),
    );

    // 8. 追问条：git 卡用 git 专用前缀包装。
    await page.fill("#ask-input", "帮我总结这些变更");
    await page.click("#ask-send");
    await page.waitForTimeout(50);
    m = await msgs(page);
    const askReq = [...m].reverse().find((x) => x && x.method === "ui/message");
    const askText =
      typeof askReq?.params?.content?.text === "string" ? askReq.params.content.text : "";
    assert(
      "ask wraps with git-status prefix",
      askReq?.params?.role === "user" &&
        askText.includes("关于 git 变更「") &&
        askText.includes("帮我总结这些变更"),
      askText,
    );
    await page.evaluate((id) => {
      window.postMessage({ jsonrpc: "2.0", id, result: {} }, "*");
    }, askReq?.id ?? 0);
    await page.waitForTimeout(50);
    const askCleared = await page.evaluate(() => document.getElementById("ask-input").value);
    assert("ask input cleared after reply", askCleared === "", askCleared);

    assert("git-status no page errors", pageErrors.length === 0, pageErrors.join("; "));
    await page.close();
  }

  // ── git-log 卡 ───────────────────────────────────────────────────────
  {
    const { page, pageErrors } = await openCard("git-log", GIT_LOG_HTML);
    await feedHostContext(page, { theme: "light" });
    await page.waitForTimeout(50);
    // 握手 reply zh-CN（locale 只经 ui/initialize hostContext 应用,host-context
    // 通知只带 theme）→ 后续渲染直接 zh 文案。
    const m0 = await msgs(page);
    const initReq0 = m0.find((x) => x && x.method === "ui/initialize");
    assert("git-log handshake ui/initialize sent", !!initReq0);
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
    }, initReq0?.id ?? 0);
    await page.waitForTimeout(50);
    await feedToolResult(page, {
      kind: "git-log",
      branch: "main",
      total: 2,
      commits: [
        {
          hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
          message: "second commit\n\nlonger body line",
          author: "Test User",
          relativeTime: "just now",
        },
        {
          hash: "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b",
          message: '<script>window.__xss=1</script> initial <img src=x onerror="p()">',
          author: "<b>evil</b>",
          relativeTime: "2m ago",
        },
      ],
    });
    await page.waitForTimeout(50);
    const rendered = await page.evaluate(() => ({
      title: document.getElementById("title").textContent,
      meta: document.getElementById("meta").textContent,
      commits: document.querySelectorAll("#body .commit").length,
      firstHash: document.querySelector("#body .commit-hash")?.textContent ?? "",
      firstMsg: document.querySelector("#body .commit-msg")?.textContent ?? "",
      firstSub: document.querySelector("#body .commit-sub")?.textContent ?? "",
      scripts: document.querySelectorAll("#body script").length,
      imgs: document.querySelectorAll("#body img").length,
      bolds: document.querySelectorAll("#body b").length,
    }));
    assert(
      "git-log render: zh title/meta/commit rows",
      rendered.title === "Git 提交 · main" &&
        rendered.meta === "2 条提交" &&
        rendered.commits === 2,
      JSON.stringify(rendered),
    );
    assert(
      "hash 8 chars + message first-line + author · time",
      rendered.firstHash === "a1b2c3d4" &&
        rendered.firstMsg === "second commit" &&
        rendered.firstSub === "Test User · just now",
      JSON.stringify(rendered),
    );
    assert(
      "XSS in log escaped (no script/img/b elements)",
      rendered.scripts === 0 && rendered.imgs === 0 && rendered.bolds === 0,
      JSON.stringify(rendered),
    );

    assert("git-log no page errors", pageErrors.length === 0, pageErrors.join("; "));
    await page.close();
  }

  // ── markdown-lite 卡（轻/重模板分流,2026-10-23）──
  {
    const { page, pageErrors } = await openCard("markdown-lite", MD_LITE_HTML);
    // 1. 喂含表格 + 标题 + 行内格式的 wiki 数据（无 mermaid 围栏）。
    await feedToolResult(page, {
      kind: "wiki-page",
      slug: "demo",
      title: "Lite Demo",
      markdown: [
        "# Heading 1",
        "",
        "| col a | col b |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "some `code` and **bold** text",
        "",
        "```mermaid",
        "graph TD",
        "A-->B",
        "```",
      ].join("\n"),
    });
    await page.waitForTimeout(100);
    const rendered = await page.evaluate(() => ({
      title: document.getElementById("title").textContent,
      tableRows: document.querySelectorAll("#body table tr").length,
      h1: document.querySelector("#body h1")?.textContent ?? "",
      code: document.querySelector("#body code")?.textContent ?? "",
      strong: document.querySelectorAll("#body strong").length,
      // mermaid 围栏在 lite 下必须保持代码块（typeof mermaid === "undefined" 守卫）。
      mermaidPre: document.querySelectorAll("#body pre > code.language-mermaid").length,
      mermaidBoxes: document.querySelectorAll("#body .mermaid-box").length,
    }));
    assert(
      "markdown-lite renders table/h1/inline formats",
      rendered.title === "Lite Demo" &&
        rendered.tableRows === 2 &&
        rendered.h1 === "Heading 1" &&
        rendered.code === "code" &&
        rendered.strong === 1,
      JSON.stringify(rendered),
    );
    assert(
      "markdown-lite keeps mermaid fence as code block",
      rendered.mermaidPre === 1 && rendered.mermaidBoxes === 0,
      JSON.stringify(rendered),
    );

    // 2. 主题切换（lite 与富卡同基座 CSS 变量）。
    await feedHostContext(page, { theme: "light" });
    await page.waitForTimeout(50);
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert("markdown-lite follows host theme", lightBg === "rgb(255, 255, 255)", lightBg);

    // 3. 追问条（lite 展开 RICH_SPEC 继承 wiki 专用前缀「关于 wiki 页「」）。
    await page.fill("#ask-input", "总结一下这页");
    await page.click("#ask-send");
    await page.waitForTimeout(50);
    const mLite = await msgs(page);
    const askLite = [...mLite].reverse().find((x) => x && x.method === "ui/message");
    assert("markdown-lite ask reaches host", askLite?.params?.role === "user");
    await page.evaluate((id) => {
      window.postMessage({ jsonrpc: "2.0", id, result: {} }, "*");
    }, askLite?.id ?? 0);

    assert("markdown-lite no page errors", pageErrors.length === 0, pageErrors.join("; "));
    await page.close();
  }
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
