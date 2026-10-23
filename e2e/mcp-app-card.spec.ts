import { expect, test, type Page } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";
// agent_ 前缀 = workbench PanelRouter 按 id 前缀路由到 claude ChatPanel（同
// claude-windowing.spec.ts 头注）。
const fakeSessionId = "agent_e2e-test-session-mcp-app";
const gitSessionId = "agent_e2e-test-session-mcp-git";

// MCP Apps 卡片端到端（SEP-1865 阶段 4 全链）：WS mock 只负责喂流帧
// （assistant tool_use → user tool_result + tool_use_result envelope），此后
// 全部走真实链路、零 mock：
//   mcp-ui-resource REST（模板回源，HUB_UI_RESOURCES 单源表）
//   → 宿主桥 postMessage feed + ui/initialize 应答（hostContext.theme/locale）
//   → 刷新钮 tools/call → mcp-hub-tools-call 代理路由（真实直调 ProjectWikiService）
//   → ui/message 确认闸 → bridge.sendMessage → WS user 帧。
// mock 帧里的 structuredContent 标题刻意与 demo/wiki/intro.md 真实标题不同：
// 点刷新后模板渲染 api 真实读到的内容 = 代理链路的端到端证据。

const STALE_SC = {
  kind: "wiki-page",
  slug: "intro",
  title: "Stale Title",
  tags: ["e2e"],
  markdown: "# Stale body\n\nold mock content",
};

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return () => {
    const reactErrors = errors.filter(
      (e) =>
        e.includes("Rendered fewer hooks") ||
        e.includes("Rendered more hooks") ||
        e.includes("should have a queue"),
    );
    if (reactErrors.length > 0) {
      throw new Error(`React runtime errors in browser console:\n${reactErrors.join("\n")}`);
    }
  };
}

// Session detail / list / overview mocks：让 fake 会话进 workbench 且 stale-tab
// prune 不删 tab（先例 claude-windowing.spec.ts）。三个用例同构，抽此处共用。
async function setupMcpSession(page: Page, sessionId: string, displayName: string) {
  const sessionShape = {
    id: sessionId,
    projectName,
    provider: "claude",
    displayName,
    status: "idle",
    createdAt: new Date().toISOString(),
  };
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${sessionId}$`),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: sessionShape,
          availableModels: ["sonnet"],
          availablePermissionModes: ["default"],
        }),
      });
    },
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [sessionShape] }),
    });
  });
  await page.route(new RegExp("/api/overview$"), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectNames: [projectName],
        candidates: [
          {
            type: "agent",
            projectName,
            sessionId,
            displayName,
            status: "idle",
            provider: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });
}

test("MCP Apps card: template host + handshake locale + tools/call refresh + ui/message confirm gate", async ({
  page,
}) => {
  // 轻/重模板分流（2026-10-23）：STALE_SC 无 mermaid 围栏 → 宿主选 markdown-lite
  // 轻变体（~76KB，回源 uri 断言见步骤 1），全链显著快于富卡（原 5.65MB srcdoc
  // 全链 ~36s）。90s 上限保留作环境波动余量。
  test.setTimeout(90_000);
  const assertNoConsoleErrors = collectConsoleErrors(page);
  // 记录模板回源 uri（轻/重分流的端到端证据：无 mermaid 内容必须请求 lite）。
  const requestedUris: string[] = [];
  await page.route("**/mcp-ui-resource*", async (route) => {
    requestedUris.push(route.request().url());
    await route.continue();
  });

  // 应用语言偏好 = zh（localStorage 直设；默认 system 会跟浏览器 en-US）。
  // hostContext.locale 应取应用偏好而非 navigator.language——模板按钮文案是
  // 该链路的可见面（code-review P2-2 修复的回归锁）。
  await page.addInitScript(() => {
    localStorage.setItem("lang", "zh");
  });

  // Session detail / list / overview mocks（共用 helper）。
  await setupMcpSession(page, fakeSessionId, "Claude Agent (e2e-mcp-app)");

  // WS mock：窗口帧 + wiki_read_page 流帧；收集客户端上行（ui/message 确认后的
  // bridge.sendMessage 应在此出现为 {type:"user"} 帧）。
  const sentFrames: Array<Record<string, unknown>> = [];
  await page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}/claude-stream`),
    (ws) => {
      ws.onMessage((data) => {
        try {
          const msg = JSON.parse(String(data)) as Record<string, unknown>;
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
            return;
          }
          sentFrames.push(msg);
        } catch {
          /* non-JSON frames ignored */
        }
      });
      const frames = [
        { type: "session_init", resume: false },
        { type: "history_start", count: 0 },
        { type: "history_end" },
        { type: "live_start", count: 3 },
        {
          type: "assistant",
          uuid: "a1",
          message: {
            id: "msg-a1",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tu-e2e-1",
                name: "mcp__ar-hub__wiki_read_page",
                input: { slug: "intro" },
              },
            ],
          },
        },
        {
          type: "user",
          uuid: "u1",
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "tu-e2e-1", content: "wiki page payload" },
            ],
          },
          tool_use_result: { structuredContent: STALE_SC },
        },
        {
          type: "assistant",
          uuid: "a2",
          message: {
            id: "msg-a2",
            role: "assistant",
            content: [{ type: "text", text: "Wiki 页已读取。" }],
          },
        },
        { type: "live_end" },
      ];
      for (const frame of frames) ws.send(JSON.stringify(frame));
    },
  );

  await page.goto("/");
  // lang=zh 在首个 document 前已注入 → 登录页本身就是中文文案（非 en 的 Password/Sign in）。
  await page.getByLabel("访问密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.locator(`nav.side .srow2[title="${projectName}"]`)).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`/projects/${projectName}/agent-sessions/${fakeSessionId}/claude`);
  await expect(page.getByText("Wiki 页已读取。")).toBeVisible({ timeout: 15_000 });

  // 1. 卡片渲染：沙箱 iframe + 宿主喂数据后的模板 render（mock 帧的 stale 内容）。
  const card = page.locator('iframe[data-testid="mcp-app-frame"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveAttribute("sandbox", "allow-scripts");
  // 轻/重分流：无 mermaid 内容 → 回源请求必须命中 markdown-lite（前端判定
  // contentNeedsMermaid 的端到端锁）。
  await expect
    .poll(() => requestedUris.some((u) => u.includes("uri=ui%3A%2F%2Far-hub%2Fmarkdown-lite")), {
      timeout: 10_000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe[data-testid="mcp-app-frame"]');
  await expect(frame.locator("#title")).toHaveText("Stale Title", { timeout: 15_000 });
  await expect(frame.locator(".tag", { hasText: "e2e" })).toBeVisible();
  await expect(frame.getByText("old mock content")).toBeVisible();

  // 2. ui/initialize 握手（真实宿主应答）→ hostContext.locale=zh 应用 → 模板中文文案。
  //    浏览器 locale 是 en-US——若 locale 错取 navigator.language 这里会显示英文。
  await expect(frame.locator("#refresh")).toHaveText("刷新", { timeout: 10_000 });
  await expect(frame.locator("#ask-input")).toHaveAttribute("placeholder", "向 agent 追问本页…");

  // 3. 高度自适应：模板上报后 inline height 覆盖 420px 兜底类。
  const cardHeight = await card.evaluate((el) => Number.parseInt(el.style.height, 10));
  expect(Number.isFinite(cardHeight) && cardHeight > 0).toBe(true);

  // 4. 刷新钮全链：tools/call → 真实 mcp-hub-tools-call 代理 → ProjectWikiService
  //    读 wiki/intro.md → structuredContent 回灌 → 模板 render。标题从 stale 变为
  //    磁盘上的真实标题 = 代理 + 服务 + 回灌三段同时锁死。
  await frame.locator("#refresh").click();
  await expect(frame.locator("#title")).toHaveText("Fresh Wiki Page", { timeout: 15_000 });
  await expect(frame.getByText("hub wiki service e2e content ok")).toBeVisible();

  // 5. ui/message 确认闸（确认路径）：追问 → 桌面确认框 → 发送 → WS user 帧
  //    （bridge.sendMessage → sendToSocket 全链）+ 输入框清空。
  const askText = "这条数据的链路是什么？";
  await frame.locator("#ask-input").fill(askText);
  await frame.locator("#ask-send").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("发送到会话")).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText(`关于 wiki 页「Fresh Wiki Page」：${askText}`)).toBeVisible();
  await dialog.getByRole("button", { name: "发送" }).click();
  await expect
    .poll(() => sentFrames.some((f) => f.type === "user"), { timeout: 10_000 })
    .toBe(true);
  const sentUser = sentFrames.find((f) => f.type === "user") as {
    message?: { role?: string; content?: Array<{ type?: string; text?: string }> };
  };
  expect(sentUser.message?.role).toBe("user");
  expect(sentUser.message?.content?.[0]?.text).toBe(`关于 wiki 页「Fresh Wiki Page」：${askText}`);
  await expect(frame.locator("#ask-input")).toHaveValue("");

  // 6. ui/message 取消路径：取消后不产生新 user 帧。
  const userFrameCount = sentFrames.filter((f) => f.type === "user").length;
  await frame.locator("#ask-input").fill("这条不该被发送");
  await frame.locator("#ask-send").click();
  await expect(dialog.getByText("发送到会话")).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("button", { name: "取消" }).click();
  await page.waitForTimeout(500);
  expect(sentFrames.filter((f) => f.type === "user").length).toBe(userFrameCount);
  await expect(frame.locator("#ask-input")).toHaveValue("这条不该被发送");

  assertNoConsoleErrors();
});

// git 变更卡全链（铺卡批）：mock 帧喂 mcp__ar-hub__git_status + stale
// structuredContent（branch=stale-branch-x + clean=true,与 demo 真实状态相反）→
// 卡片渲染 stale → 刷新钮走真实 mcp-hub-tools-call 代理 → 真实
// ProjectGitDiffService.listDiff(demo) → 回灌真实工作区态（3 文件 + main 分支）。
// demo 预置恒 3 文件（README worktree 改 + src/index.ts staged 新增 + notes.txt
// untracked）,分支名被 run-e2e 固定为 main——刷新后断言可精确匹配。
// ui/message 确认闸/握手 locale/高度自适应与卡无关的桥行为已由 wiki 用例锁定,
// 此用例不重复。
const GIT_STALE_SC = {
  kind: "git-status",
  branch: "stale-branch-x",
  clean: true,
  files: [],
};

test("MCP Apps git status card: stale mock → real listDiff refresh round-trip", async ({
  page,
}) => {
  const assertNoConsoleErrors = collectConsoleErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem("lang", "zh");
  });

  await setupMcpSession(page, gitSessionId, "Claude Agent (e2e-mcp-git)");

  await page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${gitSessionId}/claude-stream`),
    (ws) => {
      ws.onMessage((data) => {
        try {
          const msg = JSON.parse(String(data)) as Record<string, unknown>;
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          /* non-JSON frames ignored */
        }
      });
      const frames = [
        { type: "session_init", resume: false },
        { type: "history_start", count: 0 },
        { type: "history_end" },
        { type: "live_start", count: 3 },
        {
          type: "assistant",
          uuid: "g1",
          message: {
            id: "msg-g1",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tu-e2e-git",
                name: "mcp__ar-hub__git_status",
                input: {},
              },
            ],
          },
        },
        {
          type: "user",
          uuid: "gu1",
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "tu-e2e-git", content: "git status payload" },
            ],
          },
          tool_use_result: { structuredContent: GIT_STALE_SC },
        },
        {
          type: "assistant",
          uuid: "g2",
          message: {
            id: "msg-g2",
            role: "assistant",
            content: [{ type: "text", text: "Git 变更卡已就绪。" }],
          },
        },
        { type: "live_end" },
      ];
      for (const frame of frames) ws.send(JSON.stringify(frame));
    },
  );

  await page.goto("/");
  await page.getByLabel("访问密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.locator(`nav.side .srow2[title="${projectName}"]`)).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`/projects/${projectName}/agent-sessions/${gitSessionId}/claude`);
  await expect(page.getByText("Git 变更卡已就绪。")).toBeVisible({ timeout: 15_000 });

  // 1. kind 守卫命中 → 沙箱 iframe 卡片（而非通用 MCP tool 卡回退）。
  const card = page.locator('iframe[data-testid="mcp-app-frame"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveAttribute("sandbox", "allow-scripts");
  const frame = page.frameLocator('iframe[data-testid="mcp-app-frame"]');

  // 2. stale 渲染（握手 zh 后）：branch stale-branch-x + 工作区干净。
  await expect(frame.locator("#title")).toHaveText("Git 变更 · stale-branch-x", {
    timeout: 15_000,
  });
  await expect(frame.locator("#meta")).toHaveText("工作区干净");

  // 3. 刷新全链：tools/call → 真实代理 → listDiff(demo) → 回灌。stale branch 变
  //    main、clean 变 3 文件表,notes.txt（untracked）在列。
  await frame.locator("#refresh").click();
  await expect(frame.locator("#title")).toHaveText("Git 变更 · main", { timeout: 15_000 });
  await expect(frame.locator("#meta")).toHaveText("3 个文件变更");
  await expect(frame.locator("tr", { hasText: "notes.txt" })).toBeVisible();

  assertNoConsoleErrors();
});

// 限高 + 全屏放大(限高放大批):流内卡片高度钳到 FRAME_MAX_HEIGHT_PX(420,超出
// 在 iframe 文档内滚——模板 html/body 无 overflow 声明,UA 滚动机制接管);放大钮
// (ToolHead trailing 槽)开全屏 Dialog 内嵌第二个 McpAppCard 实例(fillHeight:
// 忽略上报高度撑满 body)。用例同时锁:
//   ① 双实例独立喂数据(frameLocator 内 #title 实证)② fill 模式 inline style 抑制
//   ③ Radix focus trap × sandbox iframe 不抢焦(iframe 内追问可发出)+ 确认闸
//     (z-50 后挂载)经 portal DOM 序压在全屏层上 ④ 关闭销毁第二实例、流内钳高不变。
const tallSessionId = "agent_e2e-test-session-mcp-tall";
// 含 mermaid 围栏 → contentNeedsMermaid 判 true → 宿主保持富模板（轻/重分流的
// 另一侧锁,与 case1 的 lite 断言互补）。
const TALL_SC = {
  kind: "wiki-page",
  slug: "intro",
  title: "Tall Title",
  tags: ["e2e"],
  markdown: [
    ...Array.from({ length: 400 }, (_, i) => `tall-para-${i} 内容灌水行`),
    "",
    "```mermaid",
    "graph TD",
    "A-->B",
    "```",
  ].join("\n\n"),
};

test("MCP Apps card: in-flow height clamp + fullscreen enlarge", async ({ page }) => {
  // 双 iframe(5.65MB srcdoc ×2 parse)在受限环境更慢,给足超时。
  test.setTimeout(150_000);
  const assertNoConsoleErrors = collectConsoleErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem("lang", "zh");
  });

  await setupMcpSession(page, tallSessionId, "Claude Agent (e2e-mcp-tall)");

  await page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${tallSessionId}/claude-stream`),
    (ws) => {
      ws.onMessage((data) => {
        try {
          const msg = JSON.parse(String(data)) as Record<string, unknown>;
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          /* non-JSON frames ignored */
        }
      });
      const frames = [
        { type: "session_init", resume: false },
        { type: "history_start", count: 0 },
        { type: "history_end" },
        { type: "live_start", count: 3 },
        {
          type: "assistant",
          uuid: "t1",
          message: {
            id: "msg-t1",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tu-e2e-tall",
                name: "mcp__ar-hub__wiki_read_page",
                input: { slug: "intro" },
              },
            ],
          },
        },
        {
          type: "user",
          uuid: "tu1",
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "tu-e2e-tall", content: "wiki page payload" },
            ],
          },
          tool_use_result: { structuredContent: TALL_SC },
        },
        {
          type: "assistant",
          uuid: "t2",
          message: {
            id: "msg-t2",
            role: "assistant",
            content: [{ type: "text", text: "Tall 卡已就绪。" }],
          },
        },
        { type: "live_end" },
      ];
      for (const frame of frames) ws.send(JSON.stringify(frame));
    },
  );

  await page.goto("/");
  await page.getByLabel("访问密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.locator(`nav.side .srow2[title="${projectName}"]`)).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`/projects/${projectName}/agent-sessions/${tallSessionId}/claude`);
  await expect(page.getByText("Tall 卡已就绪。")).toBeVisible({ timeout: 15_000 });

  // 1. 流内钳高:上报内容高(400 段 ≫420)被钳到 420,iframe 文档内滚。
  //    (frameLocator 在打开全屏前创建并仅在此前使用——全屏开后同选择器会匹配两个。)
  const card = page.locator('iframe[data-testid="mcp-app-frame"]');
  const flowFrame = page.frameLocator('iframe[data-testid="mcp-app-frame"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(flowFrame.locator("#title")).toHaveText("Tall Title", { timeout: 15_000 });
  // 富模板锁：mermaid 围栏异步升级为 SVG（轻/重分流的 rich 侧证据——lite 会把
  // 围栏保持为代码块；首渲染含 mermaid initialize，在受限环境较慢）。
  await expect(flowFrame.locator("#body .mermaid-box svg")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('iframe[data-testid="mcp-app-frame"]');
    return el instanceof HTMLIFrameElement && el.style.height !== "";
  });
  expect(await card.evaluate((el) => el.style.height)).toBe("420px");
  const cardBox = await card.boundingBox();
  expect(cardBox?.height ?? 0).toBeLessThanOrEqual(421);
  // 全屏打开前唯一的 srcdoc 帧 = 流内卡内文档;直接拿 Frame evaluate。
  const flowInner = page
    .frames()
    .find((f) => f.url().startsWith("about:srcdoc") && f.parentFrame() !== null);
  expect(flowInner).toBeDefined();
  const innerScroll = await flowInner!.evaluate(() => ({
    contentH: document.body.scrollHeight,
    scrolled: window.scrollY,
  }));
  expect(innerScroll.contentH).toBeGreaterThan(420);

  // 2. 放大钮(ToolHead trailing)→ 全屏 Dialog + 第二实例(fillHeight)。
  await page.getByRole("button", { name: "放大查看" }).click();
  const fullscreen = page.locator('[data-slot="dialog-content"]');
  await expect(fullscreen).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('iframe[data-testid="mcp-app-frame"]')).toHaveCount(2);
  // 双实例独立喂数据:全屏内模板渲染出 mock stale 标题(宿主 postMessage 喂的是
  // 同一份 structuredContent,两实例各自完成 load → feed)。
  const fsFrame = fullscreen.frameLocator('iframe[data-testid="mcp-app-frame"]');
  await expect(fsFrame.locator("#title")).toHaveText("Tall Title", { timeout: 15_000 });

  // 3. fill 几何:inline height 被抑制(空)、撑满 body(>420)、文档内滚未滚动。
  const fsCard = fullscreen.locator('iframe[data-testid="mcp-app-frame"]');
  expect(await fsCard.evaluate((el) => el.style.height)).toBe("");
  const fsBox = await fsCard.boundingBox();
  expect(fsBox?.height ?? 0).toBeGreaterThan(420);
  // 全屏内文档:从 iframe elementHandle 取 contentFrame(srcdoc 帧有两份,不能按 url 找)。
  const fsHandle = await fsCard.elementHandle();
  const fsInner = (await fsHandle?.contentFrame()) ?? undefined;
  if (!fsInner) throw new Error("fullscreen content frame not found");
  const fsScroll = await fsInner.evaluate(() => ({
    contentH: document.body.scrollHeight,
    viewportH: window.innerHeight,
    scrolled: window.scrollY,
  }));
  expect(fsScroll.contentH).toBeGreaterThan(fsScroll.viewportH);
  expect(fsScroll.scrolled).toBe(0);

  // 4. focus trap × sandbox iframe + 确认闸 z 序:iframe 内聚焦后(父 activeElement
  //    = iframe 元素)Radix FocusScope 判 contained 不抢焦 → 追问可发出;确认 dialog
  //    (z-50,后挂载)必须经 portal DOM 序可见地压在全屏层上。走取消路径收尾。
  await fsFrame.locator("#ask-input").fill("全屏内追问");
  await fsFrame.locator("#ask-send").click();
  const confirmDialog = page.getByRole("dialog").filter({ hasText: "发送到会话" });
  await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
  await confirmDialog.getByRole("button", { name: "取消" }).click();
  await expect(confirmDialog).not.toBeVisible();
  await expect(fullscreen).toBeVisible();

  // 5. 关闭销毁:✕ → Dialog 卸载第二实例;流内卡钳高不变。
  await fullscreen.getByRole("button", { name: "关闭" }).click();
  await expect(fullscreen).not.toBeVisible({ timeout: 10_000 });
  await expect(page.locator('iframe[data-testid="mcp-app-frame"]')).toHaveCount(1);
  expect(await card.evaluate((el) => el.style.height)).toBe("420px");

  assertNoConsoleErrors();
});
