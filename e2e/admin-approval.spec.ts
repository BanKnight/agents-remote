import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

// admin 管理卡 fixture（批次 2 isHotTool：MCP_ADMIN_MANAGE_TOOLS 恒红）。
const adminCard = {
  projectName,
  sessionId: "agent_admin-probe-origin",
  sessionName: "Admin Probe",
  runtimeKey: "test:agent_admin-probe-origin",
  controlRequestId: "mcp-admin:e2e-fixture",
  toolName: "project_create",
  inputSummary: "project_create /tmp/demo-e2e",
  createdAt: new Date().toISOString(),
  runtimeAlive: true,
  provider: "mcp-admin",
};

const respondBodies: unknown[] = [];

test("Admin approval card renders hot and allow dispatches respond", async ({ page }) => {
  // 审批快照 REST 初值（useApprovals query 初值）。
  await page.route(new RegExp("/api/approvals$"), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ approvals: [adminCard] }),
    });
  });

  // approvals-stream WS：open 即推全量帧（复刻服务端行为），card 经单一管道进同一 query cache。
  await page.routeWebSocket(new RegExp("/api/approvals/stream$"), (ws) => {
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
    ws.send(JSON.stringify({ type: "open" }));
    ws.send(JSON.stringify({ type: "approvals", approvals: [adminCard] }));
  });

  // respond 应答捕获（形状断言用）：返回 delivered 成功面。
  await page.route(/\/api\/approvals\/respond$/, async (route) => {
    respondBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ delivered: true }),
    });
  });

  // overview mock（StatusBar 实例计数 query；真实 api 空快照亦可，mock 掉免噪音）。
  await page.route(new RegExp("/api/overview$"), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // 登录后 workbench 挂载 → sbar 审批 chip（N 项待审批）出现。
  const chip = page.getByRole("button", { name: "1 pending approvals ›" });
  await expect(chip).toBeVisible({ timeout: 15_000 });

  // 点开 ApprovalPopover：admin 卡渲染 + isHotTool 恒红（.cmd.hot）。
  await chip.click();
  const hotCmd = page.locator(".apop .acard .cmd.hot");
  await expect(hotCmd).toBeVisible();
  await expect(hotCmd).toHaveText("project_create /tmp/demo-e2e");

  // Allow → POST /api/approvals/respond，请求形状带发起会话身份（admin 卡 projectName/sessionId）。
  await page.locator(".apop .acard").getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => respondBodies.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(respondBodies[0]).toEqual({
    controlRequestId: "mcp-admin:e2e-fixture",
    decision: "allow",
    projectName,
    sessionId: "agent_admin-probe-origin",
  });
});
