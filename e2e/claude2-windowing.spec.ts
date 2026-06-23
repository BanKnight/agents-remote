import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";
const fakeSessionId = "e2e-test-session-windowing";

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

test("Claude2: slash menu renders catalog entries including plugin namespaced commands", async ({
  page,
}) => {
  const assertNoConsoleErrors = collectConsoleErrors(page);

  // Mock the skill-slash-catalog REST — the sole source for the slash menu.
  await page.route(
    new RegExp("/api/projects/.+/agent-sessions/.+/skill-slash-catalog$"),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          commands: [
            {
              name: "commit-commands:commit",
              description: "Generate a commit message",
              kind: "command",
            },
            { name: "review", description: "Code review", kind: "command" },
            {
              name: "context7-mcp",
              description: "Fetch library docs from Context7",
              kind: "skill",
            },
          ],
        }),
      });
    },
  );

  // Mock session detail REST.
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
            displayName: "Claude 2 Agent (e2e-windowing)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
          availableModels: ["sonnet", "opus", "haiku"],
          availablePermissionModes: ["default", "bypassPermissions"],
        }),
      });
    },
  );

  // Route WebSocket to the real server — the fake session doesn't exist so the
  // server will error, but the page must render the composer and slash menu
  // anyway. The slash menu is catalog-driven, not WS-driven.
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

  const chatInput = page.getByPlaceholder("Ask Claude...");
  await expect(chatInput).toBeVisible({ timeout: 15_000 });

  // Type / to trigger the slash popover.
  await chatInput.focus();
  await chatInput.pressSequentially("/", { timeout: 3_000 });

  // The slash popover should show catalog entries.
  await expect(page.getByText("commit-commands:commit")).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText("Generate a commit message")).toBeVisible();
  await expect(page.getByText("context7-mcp")).toBeVisible();

  assertNoConsoleErrors();
});

test("Claude2: empty catalog does not crash the page or composer", async ({ page }) => {
  const assertNoConsoleErrors = collectConsoleErrors(page);

  // Mock catalog with empty commands.
  await page.route(
    new RegExp("/api/projects/.+/agent-sessions/.+/skill-slash-catalog$"),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ commands: [] }),
      });
    },
  );

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
            displayName: "Claude 2 Agent (e2e-empty-catalog)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
          availableModels: ["sonnet"],
          availablePermissionModes: ["default"],
        }),
      });
    },
  );

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

  const chatInput = page.getByPlaceholder("Ask Claude...");
  await expect(chatInput).toBeVisible({ timeout: 15_000 });

  // Type / — no commands, but the page must stay up.
  await chatInput.focus();
  await chatInput.pressSequentially("/", { timeout: 3_000 });

  await page.waitForTimeout(500);
  await expect(chatInput).toBeVisible();

  assertNoConsoleErrors();
});
