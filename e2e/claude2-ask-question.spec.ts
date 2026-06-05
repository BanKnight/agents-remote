import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";
const fakeSessionId = "e2e-test-session-ask-question-history";

test("Claude2 AskUserQuestion: session detail renders with mocked REST data", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();

  await page.goto(`/projects/${projectName}/agent-sessions/${fakeSessionId}/claude2`);

  // The page must render the chat input even when the WebSocket errors.
  const chatInput = page.getByPlaceholder("Ask Claude...");
  await expect(chatInput).toBeVisible({ timeout: 15_000 });

  // Session detail should show the mock data.
  await expect(page.getByText("Claude 2 Agent (e2e-test)")).toBeVisible();
});
