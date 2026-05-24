import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can create and interact with a Terminal Session", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("link", { name: projectName }).click();

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await page.getByRole("button", { name: /Terminal/ }).click();
  await page.getByRole("button", { name: "New Terminal Session" }).click();
  await page
    .getByRole("link", { name: /Open stream/i })
    .first()
    .click();

  await expect(page.getByRole("heading", { name: "Runtime stream" })).toBeVisible();

  const streamError = page.getByText("Session stream connection failed.");
  if (await streamError.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await page.getByRole("button", { name: "Reconnect" }).click();
  }

  await expect(page.getByText("connected", { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });

  const output = page.locator("pre");
  await expect(output).toBeVisible();

  await page.getByLabel("Send input").fill('printf "e2e-terminal-baseline-ok\\n"');
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(output).toContainText("e2e-terminal-baseline-ok", { timeout: 10_000 });
});
