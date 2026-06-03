import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

// Use a fake session id — we mock the API responses, so no real session needed.
const fakeSessionId = "e2e-test-session-ask-question-history";

test("Claude2 AskUserQuestion: history shows 已回答 when answer is persisted", async ({ page }) => {
  // ── Mock session detail API ───────────────────────────────────────
  await page.route(
    `**/api/projects/${projectName}/agent-sessions/${fakeSessionId}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: fakeSessionId,
            projectName,
            provider: "claude2",
            displayName: `Claude 2 Agent (e2e-test)`,
            status: "idle",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    },
  );

  // ── Mock messages API with the "Continue" bug scenario ────────────
  // Simulates Claude JSONL where an intervening "Continue from where you
  // left off." user message separates tool_use from its tool_result.
  await page.route(
    `**/api/projects/${projectName}/agent-sessions/${fakeSessionId}/messages`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: fakeSessionId,
          messages: [
            {
              type: "user",
              message: {
                role: "user",
                content: [{ type: "text", text: "用AskUserQuestion工具问我一个问题" }],
              },
            },
            {
              type: "assistant",
              message: {
                id: "msg_e2e_001",
                role: "assistant",
                content: [
                  { type: "text", text: "好的，让我用AskUserQuestion工具来问你。" },
                  {
                    type: "tool_use",
                    id: "toolu_e2e_ask_001",
                    name: "AskUserQuestion",
                    input: {
                      questions: [
                        {
                          question: "What is your favorite color?",
                          header: "Color",
                          options: [
                            { label: "Red", description: "The color of passion" },
                            { label: "Blue", description: "The color of calm" },
                          ],
                          multiSelect: false,
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Intervening user text — this is the "Continue" message that
            // causes the assistant to be flushed before the tool_result arrives.
            {
              type: "user",
              message: {
                role: "user",
                content: [{ type: "text", text: "Continue from where you left off." }],
              },
            },
            // Tool result arrives AFTER the Continue message.
            {
              type: "user",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: "toolu_e2e_ask_001",
                    content: "Red",
                  },
                ],
              },
            },
            {
              type: "assistant",
              message: {
                id: "msg_e2e_002",
                role: "assistant",
                content: [{ type: "text", text: "谢谢你的回答！Red 是个不错的颜色。" }],
              },
            },
          ],
        }),
      });
    },
  );

  // ── 1. Login and navigate directly to the session detail page ────
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();

  // Navigate directly to the Claude2 session detail page.
  await page.goto(`/projects/${projectName}/agent-sessions/${fakeSessionId}/claude2`);

  // Wait for the chat input to appear (indicates the page loaded).
  const chatInput = page.getByPlaceholder("Ask Claude...");
  await expect(chatInput).toBeVisible({ timeout: 15_000 });

  // ── 2. Verify the AskUserQuestion card renders ────────────────────
  // The card uses amber border styling.
  const questionCard = page.locator(".border-amber-500\\/30").first();
  await expect(questionCard).toBeVisible({ timeout: 10_000 });

  // ── 3. Verify the card shows "已回答" (not "等待回答…") ──────────
  // The tool_result "Red" was matched to the tool-call despite the
  // intervening "Continue" user message.
  await expect(questionCard.getByText("已回答")).toBeVisible({ timeout: 5_000 });
});
