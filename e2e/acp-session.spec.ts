import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";
// Workbench PanelRouter 按 id 前缀推断 session 类型：agent session 须带 "agent_" 前缀，
// focus 路由才会挂 AgentPanelRouter（provider 分流在 detail REST 的 session.provider）。
const fakeSessionId = "agent_e2e-acp-1";
const displayName = "ACP Agent (e2e)";

// Collect browser console errors during the test to catch React runtime errors
// (e.g. "Rendered fewer hooks than expected") that error boundaries swallow.
function collectConsoleErrors(page: import("@playwright/test").Page) {
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

/** acp-stream WS mock：回 pong 心跳；记录客户端上行，供发送路径断言。 */
function routeAcpStream(
  page: import("@playwright/test").Page,
  onClientMessage?: (msg: { type?: string; text?: string }) => void,
) {
  return page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}/acp-stream`),
    (ws) => {
      ws.onMessage((data) => {
        try {
          const msg = JSON.parse(String(data)) as { type?: string; text?: string };
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
            return;
          }
          onClientMessage?.(msg);
        } catch {
          /* non-JSON frames ignored */
        }
      });
      // 初始流：session_init → 空 history → live 批窗口携带 turn 输出 → ended → live_end。
      // acp-adapter 在 history/live 窗口内缓冲、end marker 时批量落 state（与 pi/claude 同构）。
      const frames = [
        { type: "session_init", resume: false, acpSessionId: "acp-e2e-1" },
        { type: "history_start", count: 0 },
        { type: "history_end" },
        { type: "live_start", count: 5 },
        { type: "acp_user_echo", text: "帮我看看这个项目", uuid: "e2e-u1" },
        {
          type: "acp_event",
          event: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "好的，" },
          },
        },
        {
          type: "acp_event",
          event: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "我来看看。" },
          },
        },
        {
          type: "acp_event",
          event: {
            sessionUpdate: "tool_call",
            toolCallId: "t1",
            title: "list files",
            kind: "read",
            status: "pending",
          },
        },
        {
          type: "acp_event",
          event: {
            sessionUpdate: "tool_call_update",
            toolCallId: "t1",
            status: "completed",
            content: [{ type: "content", content: { type: "text", text: "README.md src/" } }],
          },
        },
        { type: "ended", stopReason: "end_turn" },
        { type: "live_end" },
      ];
      for (const frame of frames) ws.send(JSON.stringify(frame));
    },
  );
}

test("ACP: session detail renders omp stream (echo bubble, chunk text, tool call) and send loop", async ({
  page,
}) => {
  const assertNoConsoleErrors = collectConsoleErrors(page);
  const sentMessages: { type?: string; text?: string }[] = [];

  // Mock session detail REST（AgentPanelRouter 按 session.provider === "omp" 分流 AcpPanel；
  // provider 粒度 = CLI，transport 才是协议家族——见 agent-provider-profiles.ts）。
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
            provider: "omp",
            displayName,
            status: "idle",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    },
  );

  // Mock the agent-session list + overview（workbench stale-tab prune 的判活来源，
  // 缺一则 focus tab 被判 stale 删除、AcpPanel 永不挂载——claude-windowing.spec 同坑）。
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessions: [
          {
            id: fakeSessionId,
            projectName,
            provider: "omp",
            displayName,
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
            displayName,
            status: "idle",
            provider: "omp",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  routeAcpStream(page, (msg) => sentMessages.push(msg));

  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`/projects/${projectName}/session/${fakeSessionId}`);

  // user echo 气泡 + assistant chunk 聚合气泡 + tool 卡片。completed result 在
  // VirtualizedThreadContent 的 tool-call part 折叠为字符计数（"README.md src/".length
  // = 14）——折叠指示出现即证明 resultText 已进渲染管道（展开交互属 claude 渲染链既有覆盖）。
  await expect(page.getByText("帮我看看这个项目")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("好的，我来看看。")).toBeVisible();
  await expect(page.getByRole("button", { name: /list files 14 chars/ })).toBeVisible();

  // 发送路径：composer → user 帧上行 → mock 回声 turn → 新气泡渲染（第二 echo 直接可见）。
  const chatInput = page.getByPlaceholder("Ask Claude...");
  await expect(chatInput).toBeVisible({ timeout: 15_000 });
  await chatInput.fill("ping acp");
  await chatInput.press("Enter");

  await expect
    .poll(() => sentMessages.find((m) => m.type === "user" && m.text === "ping acp"), {
      timeout: 10_000,
    })
    .toBeTruthy();

  assertNoConsoleErrors();
});

// 移动端创建入口回归（2026-09-16 真机故障修复）：Phase 1 只在桌面 CreateSessionBar 加了
// omp 项，移动端三处独立菜单（MobileCreateButton / project drawer / global overview
// ProjectRowActions）漏加 → 用户手机上找不到 omp 创建入口。本测试钉住移动端项目页菜单项。
test.describe("ACP mobile create entry", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile project create menu exposes omp", async ({ page }) => {
    // 移动项目页请求列表 + overview + project detail（不进会话，无需 acp-stream mock）。
    await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [] }),
      });
    });
    await page.route(new RegExp("/api/overview$"), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
      });
    });
    await page.route(
      new RegExp(`/api/projects/${projectName}$`),
      async (route) =>
        void (await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            project: {
              name: projectName,
              path: `/tmp/e2e-${projectName}`,
              agentSessionCount: 0,
              terminalSessionCount: 0,
            },
          }),
        })),
    );

    await page.goto("/");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // M3-a 项目 Tab：项目行 button label = 名称 + 活动副标题（如 "demo Idle —"），非 exact。
    await expect(page.getByRole("button", { name: projectName })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/projects/${projectName}`);
    // v2 M5-a：row2 ＋ 与 03h 空态卡 CTA 均打开 03j 新建实例 sheet（srow 富行，取代 ActionMenu
    // 菜单形态）——omp 行文案 =「＋ omp」（sheet 行是 button 非 menuitem）。
    const createButton = page.getByRole("button", { name: "New session" }).first();
    await expect(createButton).toBeVisible({ timeout: 15_000 });
    await createButton.click();
    await expect(page.getByRole("button", { name: "＋ omp" })).toBeVisible();
  });
});
