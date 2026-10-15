import { type Page, expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";
// 会话类型由 id 前缀推断（agent_ → AgentPanelRouter），同 claude-windowing.spec.ts。
const fakeSessionId = "agent_e2e-test-session-mode";

/**
 * 双模式（2026-10-15）：⋯ 菜单「在终端打开／回到对话」入口 + mode 渲染分流。
 * 全 mock（detail/list/overview/POST mode/WS）——真实链路（真 tmux pane + 真 CLI + 状态文件
 * 状态机）另有 scripts/probe-session-mode.mjs 覆盖；本 spec 只证 web 侧：入口文案随 mode 变、
 * 点击发 POST /mode、切完面板从 ChatPanel 换到终端面板（xterm）。
 */
type ModeState = { mode: "chat" | "terminal"; posted: Array<{ mode?: string }> };

const sessionBody = (state: ModeState) => ({
  session: {
    id: fakeSessionId,
    projectName,
    provider: "claude",
    displayName: "Claude Agent (e2e-mode)",
    status: "idle",
    mode: state.mode,
    createdAt: new Date().toISOString(),
  },
  availableModels: ["sonnet", "opus", "haiku"],
  availablePermissionModes: ["default", "bypassPermissions"],
});

async function mockModeApi(page: Page, state: ModeState) {
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}/mode$`),
    async (route) => {
      const body = route.request().postDataJSON() as { mode?: string };
      state.posted.push(body);
      if (body.mode === "chat" || body.mode === "terminal") state.mode = body.mode;
      // 真实 POST /mode 是同步等服务端切完才返回（1-3s）；mock 给 300ms 短延时让 pending
      // 细条（AgentPanelRouter 顶部 spinner）在断言窗口内可观测，否则瞬时 fulfill 会闪过。
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionBody(state)),
      });
    },
  );
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}$`),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionBody(state)),
      });
    },
  );
  // list + overview：工作台的 stale-tab prune 用它们判活，缺了 focus tab 会被删（同 claude-windowing）。
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [sessionBody(state).session] }),
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
            displayName: "Claude Agent (e2e-mode)",
            status: "idle",
            provider: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });
  // 两条 WS 都 mock（假会话在服务端不存在，真 upgrade 会 404）：claude-stream（chat 面板）
  // 回 pong 维持半开自愈；session-stream（终端面板）只挂不断。
  for (const suffix of ["claude-stream", "stream"]) {
    await page.routeWebSocket(
      new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}/${suffix}`),
      (ws) => {
        ws.onMessage((data) => {
          try {
            const msg = JSON.parse(String(data)) as { type?: string };
            if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
          } catch {
            /* 非 JSON 帧忽略 */
          }
        });
      },
    );
  }
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(`nav.side .srow2[title="${projectName}"]`)).toBeVisible();
}

test("chat 形态 ⋯ 显示「在终端打开」，点击发 POST /mode 后面板换成终端（xterm）", async ({
  page,
}) => {
  const state: ModeState = { mode: "chat", posted: [] };
  await mockModeApi(page, state);
  await signIn(page);
  await page.goto(`/projects/${projectName}/agent-sessions/${fakeSessionId}/claude`);

  await expect(page.getByPlaceholder("Ask Claude...")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "More actions" }).click();
  const modeItem = page.getByRole("menuitem", { name: "Open in terminal" });
  await expect(modeItem).toBeVisible();
  await modeItem.click();

  // 点击即关浮层（keepOpen 已删，真机反馈 2026-10-15）：菜单项消失。
  await expect(modeItem).toBeHidden();

  // 点击 → POST /mode {mode:"terminal"}（服务端另有 idle-only 守卫，此处只证 web 侧发出）。
  await expect.poll(() => state.posted.length).toBeGreaterThan(0);
  expect(state.posted.at(-1)).toEqual({ mode: "terminal" });

  // POST 同步窗口内面板顶部显 pending 细条（spinner + 文案）——keepOpen 删除后唯一的进行中反馈。
  await expect(page.getByText("Switching session mode…")).toBeVisible();

  // 形态落定后 AgentPanelRouter 分流：ChatPanel 撤下、终端面板（xterm）顶上，细条消失。
  await expect(page.locator(".xterm")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Switching session mode…")).toBeHidden();
  await expect(page.getByPlaceholder("Ask Claude...")).toHaveCount(0);

  // 菜单已关 → 重开断言同一项翻转成「回到对话」。
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Back to chat" })).toBeVisible();
});

test("terminal 形态直接进入：渲染终端面板，⋯ 显示「回到对话」，点击切回对话", async ({ page }) => {
  const state: ModeState = { mode: "terminal", posted: [] };
  await mockModeApi(page, state);
  await signIn(page);
  await page.goto(`/projects/${projectName}/agent-sessions/${fakeSessionId}/claude`);

  // 终形态面板（xterm）+ 无对话输入框。
  await expect(page.locator(".xterm")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder("Ask Claude...")).toHaveCount(0);

  await page.getByRole("button", { name: "More actions" }).click();
  const backItem = page.getByRole("menuitem", { name: "Back to chat" });
  await expect(backItem).toBeVisible();
  await backItem.click();

  // 点击即关浮层（keepOpen 已删）：菜单项消失。
  await expect(backItem).toBeHidden();
  await expect.poll(() => state.posted.length).toBeGreaterThan(0);
  expect(state.posted.at(-1)).toEqual({ mode: "chat" });
  await expect(page.getByPlaceholder("Ask Claude...")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".xterm")).toHaveCount(0);
});
