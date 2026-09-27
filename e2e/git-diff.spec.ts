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
  // 深链映射（v1.4 批3）：?rightTab=git 渲染期一次性映射为「面板展开 + git 标签激活」
  //（不写回 URL，右栏自动展开无需点 RailButton）——aside 直接出现（DOM 第 2 个
  // complementary），ptabs「Git」标签激活。
  const files = page.getByRole("complementary").nth(1);
  await expect(files.getByRole("tab", { name: "Git", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // .frow 查询限定 git 叠层容器：ptabs 叠层保活下 files 标签的同名树行（README.md 等）
  // 仍在 DOM（invisible）——不限定的多匹配会 strict violation。
  const gitRows = files.locator('[data-panel-tab-body="git"] .frow');
  await expect(gitRows.filter({ hasText: /README\.md/ })).toBeVisible();
  await expect(gitRows.filter({ hasText: /src\/index\.ts/ })).toBeVisible();
  await expect(gitRows.filter({ hasText: /notes\.txt/ })).toBeVisible();

  await gitRows.filter({ hasText: /README\.md/ }).click();
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
  await expect(gitRows.filter({ hasText: /README\.md/ })).toBeVisible();

  await files.getByRole("button", { name: /Branches \(\d+\)/ }).click();
  await expect(files.locator('[data-role="l3-git-branches"]')).toBeVisible();
  await files.getByRole("button", { name: "Back to changed files" }).click();
  await expect(gitRows.filter({ hasText: /README\.md/ })).toBeVisible();
});
