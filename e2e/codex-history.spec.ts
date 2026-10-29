import { expect, test, type Page } from "@playwright/test";

/**
 * 批 F：codex 历史第三路 e2e。
 *
 * 列表面走真实 api（run-e2e.ts 以 CODEX_HOME seam 种入 fixture rollout：demo 项目一条 +
 * other 项目一条）——rollout 扫描 / cwd 过滤 / 三路合流 / mtime 排序都在 api 真实执行；
 * resume 分流走 page 级 REST/WS mock（真实 POST 会在 api 侧拉起 codex CLI，e2e 惯例不碰
 * 真 codex，见 codex-session.spec）。
 *
 * 断言面：
 * 1. 项目历史态：codex 行以 firstMessage 呈现（codex 无 title 通道的回落），其它项目的
 *    rollout 被 cwd 过滤不在场；点行 → 命名框 → POST body 断言 provider + codexThreadId
 *    → navigate 到新实例并挂载 codex 面板。
 * 2. 全局「全部」段：两项目的 codex 行同列，行 subtitle 带项目限定符（04g pin②）。
 */

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

// 与 scripts/run-e2e.ts 的 fixture 种子共享同一份事实（threadId / 首条用户消息）。
const CODEX_THREAD_DEMO = "eeeeeeee-1111-4111-8111-111111111111";
const FIRST_DEMO = "codex-e2e-history-demo";
const FIRST_OTHER = "codex-e2e-history-other";

// resume mock 响应的新实例 id（agent_ 前缀 = PanelRouter 分流约定，codex-session.spec 同款）。
const resumedSessionId = "agent_e2e-codex-resumed";

// Collect browser console errors during the test to catch React runtime errors
// (e.g. "Rendered fewer hooks than expected") that error boundaries swallow.
function collectConsoleErrors(page: Page) {
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

const side = (page: Page) => page.locator("nav.side");

const login = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // §6.12k 合并 side 项目行（srow2）= 登录 gate（title 属性 = 项目名，项目行独有）。
  await expect(page.locator(`nav.side .srow2[title="${projectName}"]`)).toBeVisible({
    timeout: 15_000,
  });
};

/** 进项目页 + 时钟切入历史态（组头切「Session history · <name>」，05c）。 */
const enterHistoryMode = async (page: Page) => {
  await side(page).locator(`.srow2[title="${projectName}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));
  await side(page).getByRole("button", { name: "View session history" }).click();
  await expect(side(page).getByText(`Session history · ${projectName}`)).toBeVisible();
};

/** codex_config 帧默认载荷（真实 model/list 常见形态；codex-session.spec 同款）。 */
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

/**
 * resume 目标实例的 REST + WS mock；捕获 POST /agent-sessions body 供上行断言。
 * 列表与创建共用同一路径：按 method 分流（避免多 route 注册顺序耦合）。
 */
async function mockResumedSession(page: Page, onPost: (body: Record<string, unknown>) => void) {
  const session = {
    id: resumedSessionId,
    projectName,
    provider: "codex",
    codexThreadId: CODEX_THREAD_DEMO,
    displayName: FIRST_DEMO,
    status: "idle",
    createdAt: new Date().toISOString(),
  };
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      onPost(req.postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [session] }),
    });
  });
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${resumedSessionId}$`),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session }),
      });
    },
  );
  // overview / sessions 列表是 stale-tab prune 判活来源，缺一则 focus tab 被判 stale
  // 删除、面板永不挂载（acp/claude/codex spec 同坑）。
  await page.route(new RegExp("/api/overview$"), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectNames: [projectName, "other"],
        candidates: [
          {
            type: "agent",
            projectName,
            sessionId: resumedSessionId,
            displayName: FIRST_DEMO,
            status: "idle",
            provider: "codex",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });
  await page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${resumedSessionId}/codex-stream`),
    (ws) => {
      const frames = [
        { type: "session_init", resume: true },
        { type: "history_start", count: 0 },
        { type: "history_end" },
        { type: "live_start", count: 1 },
        { type: "codex_user_echo", text: FIRST_DEMO, uuid: "e2e-r1" },
        { type: "codex_config", ...DEFAULT_CODEX_CONFIG },
        { type: "live_end" },
      ];
      for (const frame of frames) ws.send(JSON.stringify(frame));
    },
  );
}

test("项目历史态列出 codex 行（cwd 过滤），点行 resume 上行 provider+codexThreadId", async ({
  page,
}) => {
  const assertNoConsoleErrors = collectConsoleErrors(page);
  const postBodies: Record<string, unknown>[] = [];
  await mockResumedSession(page, (body) => postBodies.push(body));

  await login(page);
  await enterHistoryMode(page);

  // codex 行以 firstMessage 呈现（真实 api 扫描 fixture rollout；组 = 今天）。
  const demoRow = side(page).getByRole("button", { name: FIRST_DEMO });
  await expect(demoRow).toBeVisible({ timeout: 15_000 });
  await expect(side(page).getByText("Today", { exact: true })).toBeVisible();
  // cwd 过滤：other 项目的 rollout 不出现在本项目历史（第三路过滤在 api 真实执行）。
  await expect(side(page).getByRole("button", { name: FIRST_OTHER })).toHaveCount(0);

  // 点行 → 命名框（预填 = firstMessage 回落标题）→ Create 触发 resume。
  await demoRow.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-prompt-input]")).toHaveValue(FIRST_DEMO);
  await dialog.getByRole("button", { name: "Create" }).click();

  // POST body 断言（web 分流接线）：provider=codex + codexThreadId=fixture thread。
  await expect.poll(() => postBodies.at(0), { timeout: 10_000 }).toBeTruthy();
  expect(postBodies.at(0)?.provider).toBe("codex");
  expect(postBodies.at(0)?.codexThreadId).toBe(CODEX_THREAD_DEMO);

  // resume 成功 → navigate 到新实例（tab=overview），codex 面板挂载（composer 在场）。
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}/session/${resumedSessionId}`), {
    timeout: 15_000,
  });
  await expect(page.getByPlaceholder("Ask Claude...")).toBeVisible({ timeout: 15_000 });

  assertNoConsoleErrors();
});

test("全局「全部」段：两项目 codex 行同列，行 subtitle 带项目限定符", async ({ page }) => {
  const assertNoConsoleErrors = collectConsoleErrors(page);

  await login(page);
  await enterHistoryMode(page);

  // seg4 切「全部」→ 全局作用域查询（真实 /api/agent-history 跨项目合流）。
  const seg4 = side(page).getByRole("tablist", { name: "Instances" });
  await seg4.getByRole("tab", { name: "All", exact: true }).click();

  const demoRow = side(page).getByRole("button", { name: FIRST_DEMO });
  const otherRow = side(page).getByRole("button", { name: FIRST_OTHER });
  await expect(demoRow).toBeVisible({ timeout: 15_000 });
  await expect(otherRow).toBeVisible();
  // 04g pin②：全局行 subtitle 前缀归属项目（「demo · …」「other · …」）。
  await expect(demoRow).toContainText(`${projectName} ·`);
  await expect(otherRow).toContainText("other ·");

  assertNoConsoleErrors();
});
