import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can browse Project files and preview text and images", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Desktop workbench: enter the project, then drive the Files inspection via
  // the URL-visible ?rightTab=files state. §6.12j 批次 3 检视 IA 收敛：左栏 middle tab
  // [文件] 已删，文件检视归右栏 Inspector（唯一检视入口，FilesPanel enablePreview=true
  // 预览语义，不开中栏 tab）；file-tree 选择器 scoped 到右栏 aside（§6.12k 三列后 DOM
  // 第 2 个 complementary: side=0/Inspector=1）。File preview 用 getByRole("region")
  //（visibility-aware）：预览面板 <section aria-label="File preview">，getByRole 默认
  // 排除 hidden；防御性保持（未来 keep-alive 多 file tab 场景 getByLabel 会 strict 冲突）。
  // §6.12k 合并 side 项目行（title 属性 = 项目名，项目行独有）进项目。
  const projectRow = page.locator(`nav.side .srow2[title="${projectName}"]`);
  await expect(projectRow).toBeVisible();
  await projectRow.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  await page.goto(`/projects/${projectName}?rightTab=files`);
  // 右栏默认收起（workbenchRightCollapsedAtom 默认 true，RailButton 唤出）——先展开再取 aside
  //（折叠态右栏 aside 不渲染，展开后才是 DOM 第 2 个 complementary）。
  await page.getByRole("button", { name: "Expand right panel" }).click();
  const files = page.getByRole("complementary").nth(1).getByLabel("Project files");
  await expect(files).toBeVisible();

  await expect(files.getByRole("button", { name: /src/ }).first()).toBeVisible();
  await expect(files.getByRole("button", { name: /README\.md/ }).first()).toBeVisible();
  // Dot-files stay visible (fd424ff 最小黑名单：只藏 .git，其余 dot 项让用户能检查
  // 插件配置文件)；.git 是唯一黑名单项，不出现在列表。每行有 row div + actions
  // trigger 两个带名字的 button，用 .first() 规避 strict mode。
  await expect(files.getByRole("button", { name: /\.config/ }).first()).toBeVisible();
  await expect(files.getByRole("button", { name: /\.env\.example/ }).first()).toBeVisible();
  await expect(files.getByRole("button", { name: /\.git$/ })).toHaveCount(0);

  const rootNames = await files
    .locator("[data-list-row-title]")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
  // 目录在前（.config/src），文件按 localeCompare（.env.example 首位）。
  expect(rootNames).toEqual([
    ".config",
    "src",
    ".env.example",
    "logo.svg",
    "notes.txt",
    "README.md",
  ]);

  await files.getByRole("button", { name: /src/ }).first().click();
  await expect(files.getByRole("button", { name: /index\.ts/ }).first()).toBeVisible();
  await files
    .getByRole("button", { name: /index\.ts/ })
    .first()
    .click();
  await expect(page.getByRole("region", { name: "File preview" })).toContainText("fileBrowserE2e");

  await page.getByRole("complementary").nth(1).getByRole("button", { name: "Root" }).click();
  await files
    .getByRole("button", { name: /README\.md/ })
    .first()
    .click();
  await expect(page.getByRole("region", { name: "File preview" })).toContainText(
    "file-browser-e2e-text-ok",
  );

  await files
    .getByRole("button", { name: /logo\.svg/ })
    .first()
    .click();
  await expect(page.getByRole("img", { name: "logo.svg" })).toBeVisible();
});
