import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can inspect Git worktree and staged diffs", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("link", { name: projectName }).click();

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await page.getByRole("button", { name: /^Git/ }).click();

  const files = page.getByLabel("Git changed files");
  await expect(files.getByRole("button", { name: /README\.md/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /src\/index\.ts/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /notes\.txt/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /README\.md/ })).toContainText("Worktree");
  await expect(files.getByRole("button", { name: /src\/index\.ts/ })).toContainText("Staged");

  await files.getByRole("button", { name: /README\.md/ }).click();
  const diff = page.getByLabel("Git file diff");
  await expect(diff).toContainText("README.md");
  await expect(diff).toContainText("Worktree · Modified");
  await expect(diff).toContainText("+git-diff-e2e-worktree-ok");

  await files.getByRole("button", { name: /src\/index\.ts/ }).click();
  await expect(diff).toContainText("src/index.ts");
  await expect(diff).toContainText("Staged · Modified");
  await expect(diff).toContainText("+export const gitDiffE2eStaged = true;");
});
