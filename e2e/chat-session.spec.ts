import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const chatId = "e2e-chat-session-1";
const displayName = "Pi Chat (e2e)";

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

test("Chat: session list + detail render pi stream frames with firecrawl tool-call", async ({
  page,
}) => {
  const assertNoConsoleErrors = collectConsoleErrors(page);

  // Mock the chat-session list REST (ChatOverview query).
  await page.route(new RegExp("/api/chat-sessions$"), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessions: [
          {
            id: chatId,
            displayName,
            status: "idle",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  // Mock the chat-session detail REST.
  await page.route(new RegExp(`/api/chat-sessions/${chatId}$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: {
          id: chatId,
          displayName,
          status: "idle",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  // Mock the pi stream WebSocket. The adapter batches frames between
  // history_start/history_end and live_start/live_end, so the mock must send
  // both windows (the live window carries the pi_event sequence). tool-call
  // renders via getToolRenderer("firecrawl_search") → FirecrawlSearchToolUI.
  await page.routeWebSocket(new RegExp(`/api/chat-sessions/${chatId}/stream`), (ws) => {
    ws.onMessage((message) => {
      // Client sends heartbeat pings; the e2e window is well under 25s, ignore.
      void message;
    });
    const frames = [
      { type: "session_init", resume: false },
      { type: "history_start", count: 0 },
      { type: "history_end" },
      { type: "live_start", count: 6 },
      { type: "pi_user_echo", text: "搜一下最新的 AI 资讯", uuid: "e2e-u1" },
      {
        type: "pi_event",
        event: {
          type: "message_start",
          message: { role: "user", content: "搜一下最新的 AI 资讯", timestamp: 1 },
        },
      },
      {
        type: "pi_event",
        event: {
          type: "message_end",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "t1",
                name: "firecrawl_search",
                arguments: { query: "latest AI news" },
              },
              { type: "text", text: "这是搜索结果摘要。" },
            ],
            stopReason: "stop",
            timestamp: 2,
          },
        },
      },
      {
        type: "pi_event",
        event: {
          type: "message_end",
          message: {
            role: "toolResult",
            toolCallId: "t1",
            toolName: "firecrawl_search",
            content: [{ type: "text", text: "result body" }],
            isError: false,
            timestamp: 3,
          },
        },
      },
      { type: "live_end" },
    ];
    for (const frame of frames) ws.send(JSON.stringify(frame));
  });

  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();
  // Desktop workbench (Phase 1+) — gate on the workbench being interactive
  // before navigating to the chat list route.
  await expect(page.getByRole("button", { name: "Agent", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // Chat mode list (/projects?mode=chat): the mocked session row renders.
  await page.goto("/projects?mode=chat");
  const listRow = page.getByText(displayName, { exact: true });
  await expect(listRow).toBeVisible({ timeout: 15_000 });

  // Enter the chat detail → pi stream frames drive the render.
  await listRow.click();

  // user echo bubble + assistant text + firecrawl tool badge (FirecrawlSearchToolUI,
  // badge = "Firecrawl Search", not the GenericToolUI "Tool" label).
  await expect(page.getByText("搜一下最新的 AI 资讯")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("这是搜索结果摘要。")).toBeVisible();
  await expect(page.getByText("Firecrawl Search", { exact: true })).toBeVisible();
  await expect(page.getByText("latest AI news")).toBeVisible();

  assertNoConsoleErrors();
});
