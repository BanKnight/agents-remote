import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";
// The workbench's PanelRouter routes panels by inferring the session type
// from the id prefix ("agent_" / "terminal_"). A claude session is an agent
// session, so the fake id must carry the "agent_" prefix for the focus route
// to mount the AgentPanelRouter -> ChatPanel (claude) instead of a placeholder.
const fakeSessionId = "agent_e2e-test-session-windowing";

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

test("Claude: slash menu renders catalog entries including plugin namespaced commands", async ({
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
            provider: "claude",
            displayName: "Claude Agent (e2e-windowing)",
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
  // session absent from the list, so the ClaudeChat panel never mounts and
  // the composer/slash-menu never renders.
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
            displayName: "Claude Agent (e2e-windowing)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  // Mock /api/overview（Phase 2 聚合端点）：桌面 workbench 的 stale-tab prune 用
  // globalRefs（= overview candidates）判活而非 scope list；e2e 临时环境真实 overview
  // 返空会把 focus effect 刚加的 fake tab 判 stale 删掉，ChatPanel 永不挂载。
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
            displayName: "Claude Agent (e2e-windowing)",
            status: "idle",
            provider: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  // Mock the WebSocket entirely (no connectToServer): the fake session doesn't
  // exist on the server (upgrade → 404), and since 7c2f975 the composer is
  // disabled while disconnected. A fully-mocked WS makes the page-side socket
  // open (→ connected → composer enabled). Reply "pong" to the client heartbeat
  // so the half-open self-heal never closes the mock socket. The slash menu is
  // catalog-driven, not WS-driven.
  await page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}/claude-stream`),
    (ws) => {
      ws.onMessage((data) => {
        try {
          const msg = JSON.parse(String(data)) as { type?: string };
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          /* non-JSON frames ignored */
        }
      });
    },
  );

  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();
  // Desktop workbench (Phase 1+) has no "Projects" heading; gate on the
  // project node button being visible before navigating to the session route.
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();

  await page.goto(`/projects/${projectName}/agent-sessions/${fakeSessionId}/claude`);

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

test("Claude: empty catalog does not crash the page or composer", async ({ page }) => {
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
            provider: "claude",
            displayName: "Claude Agent (e2e-empty-catalog)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
          availableModels: ["sonnet"],
          availablePermissionModes: ["default"],
        }),
      });
    },
  );

  // Mock the agent-session list (same reason as the first test) so the stale-
  // tab prune does not drop the focus tab before the composer mounts.
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
            displayName: "Claude Agent (e2e-empty-catalog)",
            status: "idle",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  // Mock /api/overview（同首测）：桌面 prune 用 globalRefs 判活，需含 fake candidate。
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
            displayName: "Claude Agent (e2e-empty-catalog)",
            status: "idle",
            provider: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  // Fully-mocked WS (same as above): connected composer for the empty-catalog
  // crash check; pong keeps the heartbeat half-open detector satisfied.
  await page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}/claude-stream`),
    (ws) => {
      ws.onMessage((data) => {
        try {
          const msg = JSON.parse(String(data)) as { type?: string };
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          /* non-JSON frames ignored */
        }
      });
    },
  );

  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();
  // Desktop workbench (Phase 1+) has no "Projects" heading; gate on the
  // project node button being visible before navigating to the session route.
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();

  await page.goto(`/projects/${projectName}/agent-sessions/${fakeSessionId}/claude`);

  const chatInput = page.getByPlaceholder("Ask Claude...");
  await expect(chatInput).toBeVisible({ timeout: 15_000 });

  // Type / — no commands, but the page must stay up.
  await chatInput.focus();
  await chatInput.pressSequentially("/", { timeout: 3_000 });

  await page.waitForTimeout(500);
  await expect(chatInput).toBeVisible();

  assertNoConsoleErrors();
});
