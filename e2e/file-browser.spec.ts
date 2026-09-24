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
  // [文件] 已删，文件检视归右栏 Inspector。第十二轮批次 3：右栏 files tab = FilesToolPanel
  //（03o 形态，双端共享三件套）——行 = .frow（button，role 可达）；点文件 → 栏内预览态
  //（data-role="l3-file-preview"，移动 L3 同一份，返回「..」行 = 03o 编号①）。
  // §6.12k 合并 side 项目行（title 属性 = 项目名，项目行独有）进项目。
  const projectRow = page.locator(`nav.side .srow2[title="${projectName}"]`);
  await expect(projectRow).toBeVisible();
  await projectRow.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  await page.goto(`/projects/${projectName}?rightTab=files`);
  // 右栏默认收起（workbenchRightCollapsedAtom 默认 true，RailButton 唤出）——先展开再取 aside
  //（折叠态右栏 aside 不渲染，展开后才是 DOM 第 2 个 complementary）。
  await page.getByRole("button", { name: "Expand right panel" }).click();
  const files = page.getByRole("complementary").nth(1);
  await expect(files.locator(".frow").first()).toBeVisible();

  await expect(files.locator(".frow", { hasText: /src/ }).first()).toBeVisible();
  await expect(files.locator(".frow", { hasText: /README\.md/ }).first()).toBeVisible();
  // Dot-files stay visible (fd424ff 最小黑名单：只藏 .git，其余 dot 项让用户能检查
  // 插件配置文件)；.git 是唯一黑名单项，不出现在列表。
  await expect(files.locator(".frow", { hasText: /\.config/ }).first()).toBeVisible();
  await expect(files.locator(".frow", { hasText: /\.env\.example/ }).first()).toBeVisible();
  await expect(files.locator(".frow", { hasText: /\.git$/ })).toHaveCount(0);

  const rootNames = await files
    .locator(".frow .p")
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

  await files.locator(".frow", { hasText: /src/ }).first().click();
  await expect(files.locator(".frow", { hasText: /index\.ts/ }).first()).toBeVisible();
  await files
    .locator(".frow", { hasText: /index\.ts/ })
    .first()
    .click();
  await expect(files.locator('[data-role="l3-file-preview"]')).toContainText("fileBrowserE2e");

  // 栏内详情态逐级返回：预览 → 列表（DetailBackBar），列表 → 上级「..」行（03o 编号①
  // 保底；旧 FilesPanel「Root」按钮随检视面板退役）。
  await files.getByRole("button", { name: "Back to files" }).click();
  await files
    .locator(".frow")
    .filter({ hasText: /^\.\.$/ })
    .click();
  await files
    .locator(".frow", { hasText: /README\.md/ })
    .first()
    .click();
  await expect(files.locator('[data-role="l3-file-preview"]')).toContainText(
    "file-browser-e2e-text-ok",
  );

  // 图片预览：三件套详情态 = 移动 L3 同一份（MobileL3FilePreview 仅文本形态，非文本 →
  // unsupported 文案）；图片预览归 FilesPanel 检视语境（§6.12l 记档能力边界）。
  await files.getByRole("button", { name: "Back to files" }).click();
  await files
    .locator(".frow", { hasText: /logo\.svg/ })
    .first()
    .click();
  // unsupported 是早退分支（无 data-role 根，仅一行 cap 文案）。
  await expect(files).toContainText("not supported for preview yet");
});
