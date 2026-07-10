import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can create and interact with a Terminal Session", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  // Desktop workbench (Phase 1+): project nodes are buttons in the left panel,
  // not links, and there is no "Projects" heading. Enter the project by
  // clicking its node, then create a Terminal from the left-panel
  // CreateSessionBar ("+ Create" -> "Terminal" menu item).
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  // The project workbench renders multiple "+ Create" bars (left-panel header
  // + empty-instance area); pick the left-panel one (first in DOM order).
  await page.getByRole("button", { name: "+ Create" }).first().click();
  // Creating a session opens an optional-name prompt; confirm to create.
  // createTerminal's onSuccess navigates straight to the session detail,
  // so there is no need to click the "Open stream" link manually.
  await page.getByRole("menuitem", { name: "Terminal" }).click();
  await page.getByRole("button", { name: "Create" }).click();

  // Wait for the connection to establish — the "Reconnecting" overlay
  // should disappear once the terminal is connected.
  await expect(page.getByText("Reconnecting")).not.toBeVisible({
    timeout: 10_000,
  });

  const streamError = page.getByText("Session stream connection failed.");
  if (await streamError.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await page.getByRole("button", { name: "Reconnect" }).click();
  }

  // Terminal is ready when the input box is enabled (stream connected)
  await expect(page.getByLabel("Send input")).toBeEnabled({
    timeout: 10_000,
  });

  await page.getByLabel("Send input").fill('printf "e2e-terminal-baseline-ok\\n"');
  await page.getByRole("button", { name: "⏎" }).click();

  // Input clears after send
  await expect(page.getByLabel("Send input")).toHaveValue("", { timeout: 10_000 });
});
