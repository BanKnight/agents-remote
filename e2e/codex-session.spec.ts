import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";
// Workbench PanelRouter 前缀推断 + detail.provider 分流：agent session 须带 "agent_" 前缀，
// codex 分流还要 codexThreadId 在 detail 里（诚实形态标记——无 threadId 走终端面板）。
const fakeSessionId = "agent_e2e-codex-1";
const displayName = "Codex Agent (e2e)";

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

type ClientMsg = { type?: string; text?: string; decision?: string; controlRequestId?: string };

/** codex_config 帧载荷（批 E：可选 account 额度段——服务端 ChatGPT 登录下才采集到）。 */
type CodexConfigFrame = typeof DEFAULT_CODEX_CONFIG & { account?: Record<string, unknown> };

/** codex-stream WS mock：回 pong 心跳；记录客户端上行，供发送/审批应答断言。 */
function routeCodexStream(
  page: import("@playwright/test").Page,
  onClientMessage?: (msg: ClientMsg) => void,
  configFrame?: CodexConfigFrame,
) {
  return page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}/codex-stream`),
    (ws) => {
      ws.onMessage((data) => {
        try {
          onClientMessage?.(JSON.parse(String(data)) as ClientMsg);
        } catch {
          /* non-JSON frames ignored */
        }
      });
      sendInitialFrames(ws, configFrame);
    },
  );
}

// 初始流（函数提出去避免回调嵌套过深）：session_init → 空 history → live 批窗口
//（与 pi/claude/acp 同构批处理）。帧序模拟真实 turn：echo → userMessage 对齐 → config
// → reasoning delta → 文本 delta → commandExecution started → outputDelta → 审批请求（金框）。
/** codex_config 帧默认载荷：目录含当前模型（真实 model/list 常见形态）。 */
const DEFAULT_CODEX_CONFIG = {
  models: [
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      supportedReasoningEfforts: ["low", "medium", "high"],
      defaultReasoningEffort: "medium",
    },
  ],
  current: {
    model: "gpt-5.4",
    effort: "high",
    approvalPolicy: "default",
    sandbox: "workspace-write",
  },
};

function sendInitialFrames(
  ws: { send: (data: string) => void },
  configFrame?: CodexConfigFrame,
): void {
  const frames = [
    { type: "session_init", resume: false },
    { type: "history_start", count: 0 },
    { type: "history_end" },
    { type: "live_start", count: 9 },
    { type: "codex_user_echo", text: "帮我看看这个项目", uuid: "e2e-u1" },
    {
      type: "codex_event",
      event: {
        method: "item/started",
        params: {
          item: {
            type: "userMessage",
            id: "u1",
            content: [{ type: "text", text: "帮我看看这个项目" }],
          },
        },
      },
    },
    { type: "codex_config", ...(configFrame ?? DEFAULT_CODEX_CONFIG) },
    {
      type: "codex_event",
      event: {
        method: "item/reasoning/summaryTextDelta",
        params: { itemId: "r1", delta: "thinking", summaryIndex: 0 },
      },
    },
    {
      type: "codex_event",
      event: { method: "item/agentMessage/delta", params: { itemId: "a1", delta: "好的，" } },
    },
    {
      type: "codex_event",
      event: { method: "item/agentMessage/delta", params: { itemId: "a1", delta: "我来看看。" } },
    },
    {
      type: "codex_event",
      event: {
        method: "item/started",
        params: {
          item: { type: "commandExecution", id: "c1", command: "echo hi", status: "inProgress" },
        },
      },
    },
    {
      type: "codex_event",
      event: {
        method: "item/commandExecution/outputDelta",
        params: { itemId: "c1", delta: "hi\n" },
      },
    },
    {
      // 形状按 api/src/codex-generated/v2/ThreadTokenUsageUpdatedNotification 绑定：
      // params = {threadId, turnId, tokenUsage: {total, last, modelContextWindow}}。
      type: "codex_event",
      event: {
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "thread-e2e-1",
          turnId: "turn-e2e-1",
          tokenUsage: {
            total: {
              totalTokens: 20000,
              inputTokens: 19000,
              cachedInputTokens: 8000,
              cacheWriteInputTokens: 0,
              outputTokens: 900,
              reasoningOutputTokens: 100,
            },
            last: {
              totalTokens: 20000,
              inputTokens: 19000,
              cachedInputTokens: 8000,
              cacheWriteInputTokens: 0,
              outputTokens: 900,
              reasoningOutputTokens: 100,
            },
            modelContextWindow: 258400,
          },
        },
      },
    },
    {
      type: "codex_approval_request",
      controlRequestId: "codex:7",
      toolName: "commandExecution",
      inputSummary: "echo hi",
      item: { itemId: "c1", command: "echo hi" },
    },
    { type: "live_end" },
  ];
  for (const frame of frames) ws.send(JSON.stringify(frame));
}

// Mock session detail REST + list + overview（AgentPanelRouter codex 分流读 provider +
// codexThreadId；列表/overview 是 stale-tab prune 判活来源，缺一则 focus tab 被判 stale
// 删除、面板永不挂载——acp/claude spec 同坑）。
async function mockSessionRest(page: import("@playwright/test").Page) {
  const session = {
    id: fakeSessionId,
    projectName,
    provider: "codex",
    codexThreadId: "thread-e2e-1",
    displayName,
    status: "idle",
    createdAt: new Date().toISOString(),
  };
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}$`),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session }),
      });
    },
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [session] }),
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
            provider: "codex",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });
}

test("Codex: session detail renders stream (echo, reasoning, text, Bash card, approval) and send loop", async ({
  page,
}) => {
  const assertNoConsoleErrors = collectConsoleErrors(page);
  const sentMessages: ClientMsg[] = [];

  await mockSessionRest(page);
  routeCodexStream(page, (msg) => sentMessages.push(msg));

  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // §6.12k 合并 side 项目行（srow2）= 登录 gate（title 属性 = 项目名，项目行独有）。
  await expect(page.locator(`nav.side .srow2[title="${projectName}"]`)).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`/projects/${projectName}/session/${fakeSessionId}`);

  // echo 气泡 + reasoning（折叠态）+ 聚合文本 + Bash 工具卡（detail = $ echo hi）。
  await expect(page.getByText("帮我看看这个项目")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("好的，我来看看。")).toBeVisible();
  await expect(page.getByRole("button", { name: /echo hi/ })).toBeVisible();

  // 配置选择器（model/effort/审批策略）跟随 codex_config 帧：SelectorTrigger 双形态，
  // pill 文本 = 当前项裸值、accessible name = aria-label（label）。count=1 防多按钮歧义。
  await expect(page.getByRole("button", { name: "Permission" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Permission" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Model" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reasoning" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Reasoning" })).toBeVisible();
  // pill 当前值文本（P3-1）：跟随 codex_config.current 渲染——Default/GPT-5.4/high。
  await expect(page.getByRole("button", { name: "Permission" })).toContainText("Default");
  await expect(page.getByRole("button", { name: "Model" })).toContainText("GPT-5.4");
  await expect(page.getByRole("button", { name: "Reasoning" })).toContainText("high");

  // usage 环渲染（真实通知形状覆盖）：thread/tokenUsage/updated → 环形仪表 + 百分比。
  // 百分比口径 = last.inputTokens / modelContextWindow（19000/258400 ≈ 7.35% → 7%）。
  await expect(page.getByRole("button", { name: /Context usage/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Context usage/ })).toContainText("7%");

  // 审批金框（needsPermission = controlRequestId + in_progress）：文案 + Allow/Deny 按钮。
  await expect(page.getByText("Awaiting confirmation")).toBeVisible();
  const allow = page.getByRole("button", { name: "Allow" });
  await expect(allow).toBeVisible();
  await expect(page.getByRole("button", { name: "Deny" })).toBeVisible();

  // 点 Allow → 上行 respond 帧（controlRequestId = codex:<rpcId>，decision = accept）。
  await allow.click();
  await expect
    .poll(
      () =>
        sentMessages.find(
          (m) =>
            m.type === "respond" && m.decision === "accept" && m.controlRequestId === "codex:7",
        ),
      { timeout: 10_000 },
    )
    .toBeTruthy();

  // 发送路径：composer → user 帧上行（echo/turn 回放由 mock 服务端角色承担，不在本 spec）。
  const chatInput = page.getByPlaceholder("Ask Claude...");
  await expect(chatInput).toBeVisible({ timeout: 15_000 });
  await chatInput.fill("ping codex");
  await chatInput.press("Enter");
  await expect
    .poll(() => sentMessages.find((m) => m.type === "user" && m.text === "ping codex"), {
      timeout: 10_000,
    })
    .toBeTruthy();

  assertNoConsoleErrors();
});

// 真机反馈 2026-10-28「缺推理深度设置」的根因回归：thread 回读的模型不在 model/list
// 目录（旧 thread 的账号默认模型，如 gpt-5.4 不在 0.163 目录）——efforts 档位词表跨
// 模型通用，选择器必须按目录首个非空词表兜底渲染，不能整个卸载。
test("Codex: 当前模型不在 model/list 目录时推理深度选择器仍渲染（词表兜底）", async ({ page }) => {
  await mockSessionRest(page);
  routeCodexStream(page, undefined, {
    models: [
      {
        id: "gpt-5.1-codex",
        displayName: "GPT-5.1 Codex",
        supportedReasoningEfforts: ["minimal", "low", "medium", "high"],
        defaultReasoningEffort: "medium",
      },
    ],
    current: {
      model: "gpt-5.4",
      effort: "high",
      approvalPolicy: "default",
      sandbox: "workspace-write",
    },
  });

  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(`nav.side .srow2[title="${projectName}"]`)).toBeVisible({
    timeout: 15_000,
  });
  await page.goto(`/projects/${projectName}/session/${fakeSessionId}`);

  const reasoning = page.getByRole("button", { name: "Reasoning" });
  await expect(reasoning).toHaveCount(1, { timeout: 15_000 });
  await expect(reasoning).toBeVisible();
  await expect(reasoning).toContainText("high");
});

// 批 E parity：上下文占用浮层的额度段（account 存在才渲染）+ 压缩动作行——点「Compact
// context」上行 `{type:"compact"}`，服务端把压缩以 turn 形态跑（contextCompaction item
// started → completed），流内先出「Compacting」进度 pill、完成后定格为压缩事实块
// （manual 标记来自本端按钮，回放降级为 auto——单测覆盖，e2e 只验按钮路径）。
test("Codex: context usage popover shows account quota + compact action drives stream", async ({
  page,
}) => {
  await mockSessionRest(page);
  const sent: ClientMsg[] = [];
  const sockets: { send: (data: string) => void }[] = [];
  await page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}/codex-stream`),
    (ws) => {
      sockets.push(ws);
      ws.onMessage((data) => {
        try {
          sent.push(JSON.parse(String(data)) as ClientMsg);
        } catch {
          /* non-JSON frames ignored */
        }
      });
      sendInitialFrames(ws, {
        ...DEFAULT_CODEX_CONFIG,
        // 服务端 codexAccountFromResponses 的宽进子集（planType/window/lifetime）。
        account: {
          planType: "pro",
          primary: { usedPercent: 42.6, windowDurationMins: 300 },
          lifetimeTokens: 1234567,
        },
      });
    },
  );

  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(`nav.side .srow2[title="${projectName}"]`)).toBeVisible({
    timeout: 15_000,
  });
  await page.goto(`/projects/${projectName}/session/${fakeSessionId}`);

  const trigger = page.getByRole("button", { name: /Context usage/ });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const pop = page.getByRole("dialog");
  await expect(pop).toBeVisible();
  // 额度段：套餐 + 主窗口百分比（42.6 → 43%）+ 累计消耗；缺字段行不渲染由单测覆盖。
  await expect(pop.getByText("Plan")).toBeVisible();
  await expect(pop.getByText("pro", { exact: true })).toBeVisible();
  await expect(pop.getByText("5-hour window")).toBeVisible();
  await expect(pop.getByText("43%")).toBeVisible();
  await expect(pop.getByText("Lifetime tokens")).toBeVisible();

  // 动作行在浮层最底（明细 → 额度 → 压缩）。锚定浮层里的点击用 dispatchEvent 跳过
  // playwright 的 CDP quads 视口判定（frontend-notes §26：动画期 quads 中间态会误判
  // outside of the viewport）；语义等价于真实点击（React onClick 照常触发）。
  const compactButton = pop.getByRole("button", { name: "Compact context" });
  await expect(compactButton).toBeVisible();
  await compactButton.dispatchEvent("click");
  await expect.poll(() => sent.find((m) => m.type === "compact"), { timeout: 10_000 }).toBeTruthy();

  // 服务端回上下文压缩 turn（探针 E2 帧序）：started → 流内「Compacting」进度 pill，
  // completed → 「Context compacted」事实块（manual 来源）。
  const compactItem = (method: "item/started" | "item/completed") => ({
    type: "codex_event",
    event: {
      method,
      params: {
        item: { type: "contextCompaction", id: "cmp-e2e" },
        threadId: "thread-e2e-1",
        turnId: "turn-e2e-cmp",
      },
    },
  });
  sockets[0]!.send(JSON.stringify(compactItem("item/started")));
  await expect(page.getByText("Compacting")).toBeVisible({ timeout: 10_000 });
  sockets[0]!.send(JSON.stringify(compactItem("item/completed")));
  await expect(page.getByText("Context compacted")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("manual", { exact: true })).toBeVisible();
});

// 移动端创建入口（多端同构，容器不同）：空态卡 CTA → 新建实例 sheet 的 Codex 富行。
// 桌面入口由 createSessionMenuItems 覆盖，本用例钉住移动 sheet 行（acp 同款回归锚）。
test.describe("Codex mobile create entry", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile project create sheet exposes codex", async ({ page }) => {
    // 移动项目页请求列表 + overview + project detail（不进会话，无需 codex-stream mock）。
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
    // M3-a 项目 Tab：项目行 button label = 名称 + 活动副标题，非 exact。
    await expect(page.getByRole("button", { name: projectName })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/projects/${projectName}`);
    // 空态项目走 03h 空态卡 CTA 打开新建实例 sheet——Codex 行文案 =「＋ Codex」。
    const createButton = page.locator(".empty-cta").first();
    await expect(createButton).toBeVisible({ timeout: 15_000 });
    await createButton.click();
    await expect(page.getByRole("button", { name: "＋ Codex" })).toBeVisible();
  });
});
