// 探针：三项优化回归（PASS/FAIL 断言，入库版）。
// 1. 源码模式字号：.md 预览切源码 → CodeMirror .cm-content fontSize=14px(0.875rem)，与渲染模式
//    MarkdownString 正文 text-sm 一致。CodeBlock(渲染内代码块)仍 0.75rem 不在此测。
// 2. 移动文件树 cwd 跨 tab 保活：移动 focus 态 → 切文件 → 进子目录 → 切输出/git → 切回文件 →
//    文件树仍在子目录（非根目录）。覆盖 MobileFocusBody（focus）+ MobileProjectOverview（list）。
// 密码自读不打印。用法: node scripts/probe-three-optimizations.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

async function setupMocks(page) {
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  // 项目内文件列表：一个 .md（默认 render）+ 一个子目录（用于 cwd 保活测试）。
  await page.route(new RegExp(`/api/projects/${projectName}/files$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [
          { name: "sub", path: "sub", type: "directory" },
          { name: "readme.md", path: "readme.md", type: "file" },
        ],
        path: "",
      }),
    }),
  );
  // 子目录内文件列表（cwd 保活：切回后应停在此层）。精确匹配带 query 的列表请求，
  // 避免前缀吞掉 /files/preview（preview 单独 route 处理）。
  await page.route(new RegExp(`/api/projects/${projectName}/files\\?`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [{ name: "nested.md", path: "sub/nested.md", type: "file" }],
        path: "sub",
      }),
    }),
  );
  // .md 预览内容（精确匹配 /files/preview?，不落真实 API）。
  await page.route(new RegExp(`/api/projects/${projectName}/files/preview`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "text",
        name: "readme.md",
        path: "readme.md",
        content: "# Title\n\nThis is **rendered** markdown body text.\n",
      }),
    }),
  );
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Unlock console" }).click();
}

async function newMobilePage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  return await ctx.newPage();
}

// ── 问题1：源码模式字号 ──────────────────────────────────────────────
async function probeSourceFont() {
  const browser = await chromium.launch();
  try {
    const page = await newMobilePage(browser);
    await setupMocks(page);
    await login(page);
    await page.waitForTimeout(500);
    // 进项目工作台 → 切文件 tab → 点 .md 预览。
    await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
    await page.waitForTimeout(800);
    // 点文件 tab（移动：Files/文件）。
    await page
      .getByRole("tab", { name: /^Files$|^文件$/ })
      .first()
      .click({ timeout: 5000 })
      .catch(async () => {
        await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('[role="tab"], button')).find((e) =>
            /^(Files|文件)$/.test((e.textContent ?? "").trim()),
          );
          if (el) el.click();
        });
      });
    await page.waitForTimeout(400);
    // 点 readme.md 文件行（预览态 enablePreview=true，文件行点击开预览浮窗）。.first() 规避
    // strict mode 多匹配；点击失败时兜底 evaluate 直接找行文本。
    await page
      .getByText("readme.md", { exact: true })
      .first()
      .click({ timeout: 5000 })
      .catch(async () => {
        await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('[role="button"], button, div')).find(
            (e) => (e.textContent ?? "").trim() === "readme.md",
          );
          if (el) el.click();
        });
      });
    await page.waitForTimeout(700);

    console.log("\n===== 问题1：源码模式字号对齐渲染模式 =====");
    // 断言预览浮窗已打开（FilePreviewPanel section aria-label），确保后续选择器落在预览内。
    const previewOpen = await page
      .getByLabel("File preview")
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    record(previewOpen, "文件预览浮窗已打开（FilePreviewPanel）");
    if (!previewOpen) return;
    // 渲染模式（.md 默认 render）：预览内 MarkdownString 正文 fontSize（MARKDOWN_CLASS text-sm）。
    const renderFont = await page.evaluate(() => {
      const panel = document.querySelector('[aria-label="File preview"]');
      if (!panel) return null;
      const md = panel.querySelector(".text-sm");
      if (!md) return null;
      return parseFloat(getComputedStyle(md).fontSize);
    });
    // 切到源码模式：点 Source 切换按钮。
    await page
      .getByRole("button", { name: /^Source$|^源码$/ })
      .click({ timeout: 5000 })
      .catch(async () => {
        await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll("button")).find((b) =>
            /^(Source|源码)$/.test((b.textContent ?? "").trim()),
          );
          if (el) el.click();
        });
      });
    await page.waitForTimeout(600);
    const sourceFont = await page.evaluate(() => {
      const cm = document.querySelector(".cm-content");
      if (!cm) return null;
      return parseFloat(getComputedStyle(cm).fontSize);
    });
    if (renderFont == null) {
      record(false, "渲染模式 MarkdownString 正文找到（未进预览或结构变更）");
    } else {
      record(Math.abs(renderFont - 14) < 0.5, `渲染模式正文 fontSize=14px（got ${renderFont}）`);
    }
    if (sourceFont == null) {
      record(false, "源码模式 .cm-content 找到（未切到源码或 CodeMirror 未挂载）");
    } else {
      record(Math.abs(sourceFont - 14) < 0.5, `源码模式 fontSize=14px（got ${sourceFont}）`);
      if (renderFont != null) {
        record(
          Math.abs(sourceFont - renderFont) < 0.5,
          `源码与渲染字号一致（source=${sourceFont} render=${renderFont}）`,
        );
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }
}

// ── 问题3：移动文件树 cwd 跨 tab 保活 ────────────────────────────────
async function probeMobileFileCwd(useFocus) {
  const browser = await chromium.launch();
  try {
    const page = await newMobilePage(browser);
    await setupMocks(page);
    await login(page);
    await page.waitForTimeout(500);
    await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
    await page.waitForTimeout(800);

    if (useFocus) {
      // focus 态：项目工作台无实例时，先造一个 agent session 再点进 focus。
      // mock sessions 列表（overview 用）。
      await page.route(new RegExp(`/api/projects/${projectName}/sessions$`), (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            sessions: [
              {
                id: `ar-agent-claude-${projectName}-focusprobe`,
                projectName,
                provider: "claude",
                displayName: "Focus Probe",
                status: "idle",
                type: "agent",
                createdAt: Date.now(),
              },
            ],
          }),
        }),
      );
      await page.reload();
      await page.waitForTimeout(800);
      // 点实例卡片进 focus。
      await page
        .getByText("Focus Probe", { exact: true })
        .click({ timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(800);
    }

    console.log(
      `\n===== 问题3：移动文件树 cwd 跨 tab 保活（${useFocus ? "focus 态" : "列表态"}）=====`,
    );

    // 切文件 tab。
    const clickFilesTab = async () =>
      page
        .getByRole("tab", { name: /^Files$|^文件$/ })
        .first()
        .click({ timeout: 5000 })
        .catch(async () => {
          await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('[role="tab"], button')).find((e) =>
              /^(Files|文件)$/.test((e.textContent ?? "").trim()),
            );
            if (el) el.click();
          });
        });
    await clickFilesTab();
    await page.waitForTimeout(500);
    // 进子目录 "sub"。
    await page
      .getByText("sub", { exact: true })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    // 记录 cwd = sub（应能看到 nested.md，看不到 readme.md）。
    const inSub = await page.evaluate(() => {
      const hasNested = document.body.innerText.includes("nested.md");
      const hasReadme = document.body.innerText.includes("readme.md");
      return { hasNested, hasReadme };
    });
    record(inSub.hasNested, `进 sub 目录后看到 nested.md（cwd=sub）`);
    record(!inSub.hasReadme, `进 sub 后看不到根目录 readme.md（确认离开了根）`);

    // 切到输出/总览 tab 再切回文件（focus 态切 output，列表态切 overview）。
    const awayTab = useFocus ? /^Output$|^输出$/ : /^Overview$|^总览$/;
    await page
      .getByRole("tab", { name: awayTab })
      .first()
      .click({ timeout: 5000 })
      .catch(async () => {
        await page.evaluate(
          (nameReSrc) => {
            const re = new RegExp(nameReSrc);
            const el = Array.from(document.querySelectorAll('[role="tab"], button')).find((e) =>
              re.test((e.textContent ?? "").trim()),
            );
            if (el) el.click();
          },
          awayTab.source.slice(1, -1),
        );
      });
    await page.waitForTimeout(500);
    await clickFilesTab();
    await page.waitForTimeout(600);

    // 断言：切回后仍在 sub（看到 nested.md，看不到 readme.md）—— cwd 保活成功。
    const afterSwitch = await page.evaluate(() => {
      const hasNested = document.body.innerText.includes("nested.md");
      const hasReadme = document.body.innerText.includes("readme.md");
      return { hasNested, hasReadme };
    });
    record(
      afterSwitch.hasNested && !afterSwitch.hasReadme,
      `切走再切回文件后仍在 sub（cwd 保活，非回根目录）—— nested=${afterSwitch.hasNested} readme=${afterSwitch.hasReadme}`,
    );
    await page.close();
  } finally {
    await browser.close();
  }
}

// ── 问题2：权限金色边框批准后清除 + Allow/Deny 按钮 cursor-pointer ─────
// 走 routeWebSocket 注入最小 claude-stream 帧序列（不连真实 server）：
//   session_init → assistant(tool_use Bash) → control_request(挂 controlRequestId)
//   → [断言金边框 ring-assistant 存在 + Allow/Deny cursor=pointer]
//   → user(tool_result 匹配 tool_use_id) → [断言边框消失]
// 依赖 adapter 数据管道：control_request 按 request.tool_use_id 给 tool-call part 挂
// controlRequestId（adapter:2806）；user tool_result 按 tool_use_id 配对 result
// （adapter:2293/2309）→ needsPermission(result==null && !isInterrupted) 翻 false →
// SystemChatBubble amberRing/pulseClass 清空（ClaudeSessionDetailRoute:1472）。
async function probePermissionBorder() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);
    await page.waitForTimeout(500);

    // 新 workbench 语义：/projects/$key/session/$id → focusId=sessionId → instance-area 打开
    // ClaudeChat。⚠️ sessionId 必须以 `agent_` 开头（inferSessionTypeFromId）才判 agent session，
    // 否则渲染 PlaceholderPanel（无 WS）。detail 走 getAgentSession(projectName, sessionId)
    // （instance-area useAgentDetail），URL 仍是 /api/projects/<key>/agent-sessions/<id>。
    const fakeSessionId = "agent_probe-permission";
    const session = {
      id: fakeSessionId,
      projectName,
      provider: "claude",
      displayName: "Permission Probe",
      status: "running",
      createdAt: "2026-08-02T00:00:00.000Z",
    };
    const detail = { session, availableModels: ["sonnet"], availablePermissionModes: ["default"] };
    await page.route(
      new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}$`),
      (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }),
    );
    await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [session] }),
      }),
    );

    // ── mock WS：注入最小 claude-stream 帧序列 ──────────────────────
    let socket;
    await page.routeWebSocket(/claude-stream/, (ws) => {
      socket = ws;
      ws.onMessage((msg) => {
        // 客户端只发心跳 ping；探针用 onMessage 确认连接建立（不响应也可，PONG 超时 50s ≫ 探针时长）。
        void msg;
      });
    });

    console.log("\n===== 问题2：权限金色边框批准后清除 + 确认按钮 cursor =====");
    // 新 workbench 语义路径（router.tsx：/agent-sessions/... 旧路由已 redirect 到 /projects/$key/session/$id）。
    await page.goto(`${WEB_ORIGIN}/projects/${projectName}/session/${fakeSessionId}`);
    // 等 WS 路由挂载（routeWebSocket 拦截在导航后生效）+ focus 打开 ClaudeChat。
    await page.waitForTimeout(800);
    if (!socket) {
      record(false, "WebSocket 连接建立（routeWebSocket 未拦截到 claude-stream）");
      await ctx.close();
      return;
    }

    const toolUseId = "toolu_probe_permission_01";
    // BashToolUI detail：有 description 时返回 description 本身、无 description 才返回
    // `$ <cmd>`（tool-ui-registry BashToolUI）。不传 description 让 detail=`$ echo probe`，
    // 该串只在 detail span 出现一次（args 渲染是 `command:` + 值，无 `$` 前缀），定位唯一。
    const detailText = "$ echo probe";
    const send = (data) => socket.send(JSON.stringify(data));
    send({ type: "session_init", resume: false }); // 真实协议仅 {type, resume}（session-relay.ts:71）
    // assistant：Bash tool_use（通用 tool-card 分支）。
    send({
      type: "assistant",
      message: {
        id: "msg-assistant-probe",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: toolUseId,
            name: "Bash",
            input: { command: "echo probe" },
          },
        ],
      },
    });
    await page.waitForTimeout(500);
    // control_request：按 tool_use_id 给 tool-call 挂 controlRequestId。
    send({
      type: "control_request",
      request_id: "cr-probe-01",
      request: { tool_use_id: toolUseId },
    });
    await page.waitForTimeout(800);

    // 定位 tool-card：Bash detail 文本（`$ echo probe`）唯一，向上找金边框层。
    // 用 XPath text() 只匹配「直接文本节点」含 detail 的最内层元素——`querySelectorAll("*")`
    // 的 textContent 会把祖先（body 等）也纳入（子树文本传播），targets[0] 落在外层导致
    // 祖先链上永远没有 ring-assistant。text() 只查直接子文本节点，精确命中 span 叶子。
    // ⚠️ Node 端先调用返回代码字符串，再 page.evaluate(字符串) 执行——不能把函数传给
    // evaluate（那样返回的是函数本身的字符串，不是执行结果）。
    const findRingAncestor = (clsName) => `
      (() => {
        const xpath = "//*[text()[contains(.,'${detailText}')]]";
        const res = document.evaluate(
          xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
        );
        const el = res.singleNodeValue;
        if (!el) return null;
        let n = el.parentElement;
        while (n && !String(n.className ?? "").includes("${clsName}")) {
          n = n.parentElement;
        }
        return n ? String(n.className) : "";
      })()
    `;

    // 断言 1：tool-card 渲染（detail span 出现）+ 待批准期金边框（ring-assistant/40）存在。
    // 不用 getByText().first()——它按文档序匹配含该串的祖先（body 的 textContent 也含），
    // 恒真；XPath text() 只匹配直接文本节点，精确命中 detail span。
    const cardVisible = await page
      .locator(`xpath=//*[text()[contains(.,'${detailText}')]]`)
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    record(cardVisible, "tool-card 渲染（Bash 工具卡片，detail=`$ echo probe`）");
    if (cardVisible) {
      const ringCls = await page.evaluate(findRingAncestor("ring-assistant"));
      record(
        !!ringCls,
        `待批准期金边框存在（ring-assistant/40）—— got ${ringCls ? "ring-2 ring-assistant/40" : "无边框"}`,
      );
      const pulseCls = await page.evaluate(findRingAncestor("animate-pulse"));
      record(!!pulseCls, "待批准期 animate-pulse 存在（同层脉冲）");
    }

    // 断言 2：Allow/Deny 按钮 cursor-pointer（getComputedStyle 硬数据）。中英双语匹配。
    const allowRe = /^Allow$|^允许$/;
    const denyRe = /^Deny$|^拒绝$/;
    const cursorAllow = await page
      .getByRole("button", { name: allowRe })
      .first()
      .evaluate((el) => getComputedStyle(el).cursor)
      .catch(() => null);
    const cursorDeny = await page
      .getByRole("button", { name: denyRe })
      .first()
      .evaluate((el) => getComputedStyle(el).cursor)
      .catch(() => null);
    record(
      cursorAllow === "pointer",
      `Allow/允许 按钮 cursor=pointer（got ${cursorAllow ?? "未找到"}）`,
    );
    record(
      cursorDeny === "pointer",
      `Deny/拒绝 按钮 cursor=pointer（got ${cursorDeny ?? "未找到"}）`,
    );

    // 断言 3：注入 tool_result → 边框消失（批准路径：tool_result 按 tool_use_id 配对 result
    // → needsPermission(result==null && !isInterrupted) 翻 false → amberRing/pulseClass 清空）。
    send({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUseId, content: "probe done" }],
      },
    });
    await page.waitForTimeout(800);
    const ringAfter = await page.evaluate(findRingAncestor("ring-assistant"));
    record(
      !ringAfter,
      `批准后金边框清除（tool_result 到达 → result 配对 → needsPermission=false）—— got ${ringAfter ? "仍有边框" : "边框消失"}`,
    );
    // Allow/Deny 按钮也应随 status→complete 消失（tool-ui-registry needsPermission gate）。
    const allowAfter = await page
      .getByRole("button", { name: allowRe })
      .count()
      .catch(() => 0);
    record(allowAfter === 0, "批准后 Allow/允许 按钮消失（status→complete）");

    await ctx.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await probeSourceFont();
  await probePermissionBorder();
  await probeMobileFileCwd(false);
  await probeMobileFileCwd(true);
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
