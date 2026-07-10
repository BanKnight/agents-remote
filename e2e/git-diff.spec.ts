import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can inspect Git worktree and staged diffs", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  // Desktop workbench (Phase 1+): project nodes are buttons in the left panel,
  // not links, and there is no "Projects" heading. Enter the project, then
  // drive the Git inspection tab via the URL-visible ?tab=git state (the
  // middle-column "Git" tab and the activity-bar share accessible names, so a
  // URL gate is unambiguous).
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  await page.goto(`/projects/${projectName}?tab=git`);
  const files = page.getByLabel("Git changed files");
  await expect(files.getByRole("button", { name: /README\.md/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /src\/index\.ts/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /notes\.txt/ })).toBeVisible();

  await files.getByRole("button", { name: /README\.md/ }).click();
  const diff = page.getByLabel("Git file diff");
  await expect(diff).toContainText("README.md");
  await expect(diff).toContainText("+git-diff-e2e-worktree-ok");

  await files.getByRole("button", { name: /src\/index\.ts/ }).click();
  await expect(diff).toContainText("src/index.ts");
  await expect(diff).toContainText("+export const gitDiffE2eStaged = true;");
});
