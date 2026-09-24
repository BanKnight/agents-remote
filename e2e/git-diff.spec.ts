import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can inspect Git worktree and staged diffs", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Desktop workbench: enter the project, then drive the Git inspection tab via
  // the URL-visible ?rightTab=git state. §6.12j 批次 3 检视 IA 收敛：左栏 middle tab
  // [Git] 已删，Git 检视归右栏 Inspector。第十二轮批次 3：右栏 git tab = GitToolPanel
  //（03m 形态：githead 态势行 + 工作区改动 .frow）——点行 → 栏内 diff 详情态
  //（data-role="l3-git-diff"，移动 L3 同一份，列表 ↔ 详情切换）。批次 4+ 复验拍板：
  // 右栏与移动端同构承载 git 三段（最近提交/全部历史/分支）——links 进栏内历史/分支，
  // 历史点 commit 进详情，返回逐级弹栈。
  // §6.12k 合并 side 项目行（title 属性 = 项目名，项目行独有）进项目。
  const projectRow = page.locator(`nav.side .srow2[title="${projectName}"]`);
  await expect(projectRow).toBeVisible();
  await projectRow.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  await page.goto(`/projects/${projectName}?rightTab=git`);
  // 右栏默认收起（workbenchRightCollapsedAtom 默认 true，RailButton 唤出）——先展开再取 aside
  //（折叠态右栏 aside 不渲染，展开后才是 DOM 第 2 个 complementary）。
  await page.getByRole("button", { name: "Expand right panel" }).click();
  const files = page.getByRole("complementary").nth(1);
  await expect(files.locator(".frow", { hasText: /README\.md/ })).toBeVisible();
  await expect(files.locator(".frow", { hasText: /src\/index\.ts/ })).toBeVisible();
  await expect(files.locator(".frow", { hasText: /notes\.txt/ })).toBeVisible();

  await files.locator(".frow", { hasText: /README\.md/ }).click();
  const diff = files.locator('[data-role="l3-git-diff"]');
  await expect(diff).toContainText("README.md");
  await expect(diff).toContainText("+git-diff-e2e-worktree-ok");

  // 栏内详情态独占列表位（非旧 GitDiffPanel inline 并存）：返回列表再点下一行。
  // 同构三段（批次 4+ 复验拍板）：最近提交段 + links「All history / Branches (N)」——
  // 全部历史 → 栏内历史（03t）→ 点 commit → 栏内 commit 详情（03u），返回逐级弹栈。
  // 先退出上方 diff 详情态（详情独占列表位）再断言列表态的段。
  await files.getByRole("button", { name: "Back to changed files" }).click();
  await expect(files.getByText("Recent commits")).toBeVisible();
  await files.getByRole("button", { name: "All history" }).click();
  const history = files.locator('[data-role="l3-git-history"]');
  await expect(history).toBeVisible();
  await history.locator("button.crow").first().click();
  await expect(files.locator('[data-role="l3-git-commit"]')).toBeVisible();
  await files.getByRole("button", { name: "Back to history" }).click();
  await expect(history).toBeVisible();
  await files.getByRole("button", { name: "Back to changed files" }).click();
  await expect(files.locator(".frow", { hasText: /README\.md/ })).toBeVisible();

  await files.getByRole("button", { name: /Branches \(\d+\)/ }).click();
  await expect(files.locator('[data-role="l3-git-branches"]')).toBeVisible();
  await files.getByRole("button", { name: "Back to changed files" }).click();
  await expect(files.locator(".frow", { hasText: /README\.md/ })).toBeVisible();
});
