import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can create and interact with a Terminal Session", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await page.getByRole("link", { name: projectName }).click();

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await page.getByRole("button", { name: /^Terminal/ }).click();
  await page.getByRole("button", { name: "New Terminal" }).click();
  await page
    .getByRole("link", { name: /Open stream/i })
    .first()
    .click();

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
