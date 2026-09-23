import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can inspect Git worktree and staged diffs", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Desktop workbench: enter the project, then drive the Git inspection tab via
  // the URL-visible ?rightTab=git state. §6.12j 批次 3 检视 IA 收敛：左栏 middle tab
  // [Git] 已删，Git 检视归右栏 Inspector（唯一检视入口，GitDiffPanel）——URL 直连从
  // ?tab=git 改 ?rightTab=git；文件列表/diff 面板 DOM 特征不变，渲染位置为右栏 aside
  //（§6.12k 三列后 DOM 第 2 个 complementary：side=0/Inspector=1）。
  // §6.12k 合并 side 项目行（title 属性 = 项目名，项目行独有）进项目。
  const projectRow = page.locator(`nav.side .srow2[title="${projectName}"]`);
  await expect(projectRow).toBeVisible();
  await projectRow.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  await page.goto(`/projects/${projectName}?rightTab=git`);
  // 右栏默认收起（workbenchRightCollapsedAtom 默认 true，RailButton 唤出）——先展开再取 aside
  //（折叠态右栏 aside 不渲染，展开后才是 DOM 第 2 个 complementary）。
  await page.getByRole("button", { name: "Expand right panel" }).click();
  const files = page.getByRole("complementary").nth(1).getByLabel("Git changed files");
  await expect(files.getByRole("button", { name: /README\.md/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /src\/index\.ts/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /notes\.txt/ })).toBeVisible();

  await files.getByRole("button", { name: /README\.md/ }).click();
  // GitFileDiffPanel 在右栏 GitDiffPanel 内 inline 渲染（<section aria-label="Git file
  // diff">）。仍用 getByRole("region")（visibility-aware）：防御性保持——未来 keep-alive
  // 场景（拖 git 行开中栏 git tab，§7.2）会出多个 region，getByRole 排除 hidden 只命中
  // 可见 diff。
  const diff = page.getByRole("region", { name: "Git file diff" });
  await expect(diff).toContainText("README.md");
  await expect(diff).toContainText("+git-diff-e2e-worktree-ok");

  await files.getByRole("button", { name: /src\/index\.ts/ }).click();
  await expect(diff).toContainText("src/index.ts");
  await expect(diff).toContainText("+export const gitDiffE2eStaged = true;");
});
