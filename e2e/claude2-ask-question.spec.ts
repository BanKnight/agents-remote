import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";
// The workbench's PanelRouter routes panels by inferring the session type
// from the id prefix ("agent_" / "terminal_"). A claude2 session is an agent
// session, so the fake id must carry the "agent_" prefix for the focus route
// to mount the AgentPanelRouter -> ChatPanel (claude2) instead of a placeholder.
const fakeSessionId = "agent_e2e-test-session-ask-question-history";

test("Claude2: session detail renders with mocked REST data", async ({ page }) => {
  // Mock session detail REST API.
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
            provider: "claude2",
            displayName: "Claude 2 Agent (e2e-test)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
          availableModels: ["sonnet", "opus", "haiku"],
          availablePermissionModes: ["default", "bypassPermissions"],
        }),
      });
    },
  );

  // Mock the agent-session list so the fake session appears in the workbench's
  // active-instance refs (useScopeInstanceOrder). Without this, the Phase 1+
  // workbench's stale-tab prune (refsLoaded gate) removes the focus tab for a
  // session that isn't in the list, so the Claude2Chat panel never mounts and
  // the chat input never renders.
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessions: [
          {
            id: fakeSessionId,
            projectName,
            provider: "claude2",
            displayName: "Claude 2 Agent (e2e-test)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  // Mock /api/overview（Phase 2 聚合端点）：桌面 workbench 的 stale-tab prune 用
  // globalRefs（= overview candidates）判活而非 scope list；e2e 临时环境真实 overview
  // 返空会把 focus effect 刚加的 fake tab 判 stale 删掉，chatInput 永不挂载。
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
            displayName: "Claude 2 Agent (e2e-test)",
            status: "idle",
            provider: "claude2",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  // Route the WebSocket to the real server — the fake session doesn't exist
  // so the server will return an error, but the page must handle it without
  // crashing.  (Playwright's routeWebSocket does not support injecting mock
  // messages reliably; the full AskUserQuestion rendering is tested via
  // loadMessagesFromRaw unit tests in claude2-adapter.test.ts.)
  await page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}/claude2-stream`),
    (ws) => {
      ws.connectToServer();
    },
  );

  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();
  // Desktop workbench (Phase 1+) has no "Projects" heading; gate on the
  // project node button being visible before navigating to the session route.
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();

  await page.goto(`/projects/${projectName}/agent-sessions/${fakeSessionId}/claude2`);

  // The page must render the chat input even when the WebSocket errors.
  const chatInput = page.getByPlaceholder("Ask Claude...");
  await expect(chatInput).toBeVisible({ timeout: 15_000 });

  // Session detail should show the mock data. The focused panel's tab chip
  // carries the mock displayName as its accessible name; scope to it (exact)
  // to avoid matching the same displayName in the left-overview InstanceCard,
  // whose accessible name is prefixed with the status ("Waiting for input …").
  await expect(
    page.getByRole("button", { name: "Claude 2 Agent (e2e-test)", exact: true }),
  ).toBeVisible();
});
