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

test("MCP Apps card: template host + handshake locale + tools/call refresh + ui/message confirm gate", async ({
  page,
}) => {
  // 模板构建期内联 mermaid（5.65MB srcdoc）——iframe 相关步骤在受限环境下
  // 慢 3-5 倍，全链 ~36s；默认 30s timeout 不够（trace 实测步骤全过、总时长超限）。
  test.setTimeout(90_000);
  const assertNoConsoleErrors = collectConsoleErrors(page);

  // 应用语言偏好 = zh（localStorage 直设；默认 system 会跟浏览器 en-US）。
  // hostContext.locale 应取应用偏好而非 navigator.language——模板按钮文案是
  // 该链路的可见面（code-review P2-2 修复的回归锁）。
  await page.addInitScript(() => {
    localStorage.setItem("lang", "zh");
  });

  // Session detail / list / overview mocks：让 fake 会话进 workbench 且 stale-tab
  // prune 不删 tab（先例 claude-windowing.spec.ts）。
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}$`),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: fakeSessionId,
            projectName,
            provider: "claude",
            displayName: "Claude Agent (e2e-mcp-app)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
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
      body: JSON.stringify({
        sessions: [
          {
            id: fakeSessionId,
            projectName,
            provider: "claude",
            displayName: "Claude Agent (e2e-mcp-app)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
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
            sessionId: fakeSessionId,
            displayName: "Claude Agent (e2e-mcp-app)",
            status: "idle",
            provider: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

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
  const card = page.locator('iframe[title="MCP app"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveAttribute("sandbox", "allow-scripts");
  const frame = page.frameLocator('iframe[title="MCP app"]');
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

  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${gitSessionId}$`),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: gitSessionId,
            projectName,
            provider: "claude",
            displayName: "Claude Agent (e2e-mcp-git)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
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
      body: JSON.stringify({
        sessions: [
          {
            id: gitSessionId,
            projectName,
            provider: "claude",
            displayName: "Claude Agent (e2e-mcp-git)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
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
            sessionId: gitSessionId,
            displayName: "Claude Agent (e2e-mcp-git)",
            status: "idle",
            provider: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

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
  const card = page.locator('iframe[title="MCP app"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveAttribute("sandbox", "allow-scripts");
  const frame = page.frameLocator('iframe[title="MCP app"]');

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
