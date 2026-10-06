import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can create and interact with a Terminal Session", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Desktop workbench: §6.12k 合并 side 项目行（title 属性 = 项目名，项目行独有）进项目，
  // 再从 side 实例组头 plus（aria-label "New session"，§6.12k 后唯一桌面创建入口）开
  // ActionMenu 建 Terminal。
  const projectRow = page.locator(`nav.side .srow2[title="${projectName}"]`);
  await expect(projectRow).toBeVisible();
  await projectRow.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  await page.getByRole("button", { name: "New session" }).click();
  // Creating a session opens an optional-name prompt; confirm to create.
  // createTerminal's onSuccess navigates straight to the session detail,
  // so there is no need to click the "Open stream" link manually.
  await page.getByRole("menuitem", { name: "Terminal" }).click();
  // prompt「Create」限定 dialog：side plus 可访问名 "Create or adopt Project" 子串撞名
  //（getByRole name 默认 substring）。
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();

  // Wait for the connection to establish — the "Reconnecting" overlay
  // should disappear once the terminal is connected.
  await expect(page.getByText("Reconnecting")).not.toBeVisible({
    timeout: 10_000,
  });

  const streamError = page.getByText("Session stream connection failed.");
  if (await streamError.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await page.getByRole("button", { name: "Reconnect" }).click();
  }

  // v1.5 批 7（spec §4.7）：终端输入默认收起——常驻行 = 快捷键条 + 「展开输入」钮，
  // composer 条件渲染。先展开再输入。
  await page.getByRole("button", { name: "Expand input" }).click();

  // Terminal is ready when the input box is enabled (stream connected)
  await expect(page.getByLabel("Send input")).toBeEnabled({
    timeout: 10_000,
  });

  await page.getByLabel("Send input").fill('printf "e2e-terminal-baseline-ok\\n"');
  await page.getByRole("button", { name: "⏎" }).click();

  // Input clears after send
  await expect(page.getByLabel("Send input")).toHaveValue("", { timeout: 10_000 });
});
