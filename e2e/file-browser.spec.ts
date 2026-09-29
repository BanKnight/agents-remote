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
  // the ?rightTab=files deep link. §6.12j 批次 3 检视 IA 收敛：左栏 middle tab
  // [文件] 已删，文件检视归右栏 Inspector。v1.4 批3：右栏 = RightPanelTabs（ptabs 动态
  // 标签，05:99），?rightTab= 深链渲染期一次性映射为「面板展开 + 标签激活」（不写回 URL，
  // 右栏自动展开无需点 RailButton）；files 标签 = FilesToolPanel（.frow 行）。树点文件
  // → 新增/激活 file 预览标签（PanelFileTabBody：l3-file-preview + 文件名标题 + ✕ 可关，
  // 03ab peek 语义）；返回列表 = 点「文件」标签（叠层保活，cwd 保留）。
  const projectRow = page.locator(`nav.side .srow2[title="${projectName}"]`);
  await expect(projectRow).toBeVisible();
  await projectRow.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  await page.goto(`/projects/${projectName}?rightTab=files`);
  // 深链映射（WorkbenchRoute rightTab effect）自动展开右栏——aside 直接出现（DOM 第 2 个
  // complementary），ptabs 标签条「文件」激活。
  const files = page.getByRole("complementary").nth(1);
  await expect(files.getByRole("tab", { name: "Files", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(files.locator(".frow").first()).toBeVisible();

  await expect(files.locator(".frow", { hasText: /src/ }).first()).toBeVisible();
  await expect(files.locator(".frow", { hasText: /README\.md/ }).first()).toBeVisible();
  // Dot-files stay visible (fd424ff 最小黑名单：只藏 .git，其余 dot 项让用户能检查
  // 插件配置文件)；.git 是唯一黑名单项，不出现在列表。
  await expect(files.locator(".frow", { hasText: /\.config/ }).first()).toBeVisible();
  await expect(files.locator(".frow", { hasText: /\.env\.example/ }).first()).toBeVisible();
  await expect(files.locator(".frow", { hasText: /\.git$/ })).toHaveCount(0);

  // 根目录列表限定 files 标签 body——三基础标签常驻（2026-09-29 反馈②）后 Git/Wiki 面板
  // 叠层保活挂载（invisible 仍在 DOM），其 .frow .p（git 变更行）会混入全局选择器。
  const rootNames = await files
    .locator('[data-panel-tab-body="files"] .frow .p')
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
  // 树点文件 → 新增 file 标签并激活（03ab peek）：标签名 = 文件名，预览 = l3-file-preview
  //（PanelFileTabBody 单源，移动 L3 同一份）。
  await files
    .locator(".frow", { hasText: /index\.ts/ })
    .first()
    .click();
  const indexTab = files.getByRole("tab", { name: "index.ts", exact: true });
  await expect(indexTab).toHaveAttribute("aria-selected", "true");
  // 预览断言限定激活标签的叠层容器（多签并排后非激活签的 l3-file-preview 仍在 DOM）。
  const indexBody = files.locator(
    `[data-panel-tab-body="file:${projectName}/src/index.ts"] [data-role="l3-file-preview"]`,
  );
  await expect(indexBody).toContainText("fileBrowserE2e");

  // 返回列表 = 点「文件」标签（叠层保活：files 标签不卸载，cwd 仍在 src）——「..」行
  // 返回根目录（03o 编号① 保底）。
  await files.getByRole("tab", { name: "Files", exact: true }).click();
  await files
    .locator(".frow")
    .filter({ hasText: /^\.\.$/ })
    .click();
  await files
    .locator(".frow", { hasText: /README\.md/ })
    .first()
    .click();
  await expect(
    files.locator(
      `[data-panel-tab-body="file:${projectName}/README.md"] [data-role="l3-file-preview"]`,
    ),
  ).toContainText("file-browser-e2e-text-ok");

  // 图片预览：file 标签 image 分支 → ImageViewer（缩放/旋转手势工具条）。svg 后端分类 =
  // image（imageMediaType 命中）。多文件并排标签（05 ptabs）：README.md 与 logo.svg 各一签。
  await files.getByRole("tab", { name: "Files", exact: true }).click();
  await files
    .locator(".frow", { hasText: /logo\.svg/ })
    .first()
    .click();
  await expect(files.getByRole("tab", { name: "logo.svg", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    files.locator(
      `[data-panel-tab-body="file:${projectName}/logo.svg"] [data-role="l3-file-preview"] img`,
    ),
  ).toBeVisible();

  // file 标签 ✕ 可关（三基础标签不可关）：关激活的 logo.svg → 标签消失、「文件」标签回正
  //（README.md 标签仍开着——多文件并排是 ptabs 语义；✕ 限定标签内定位避多签同名按钮）。
  await files
    .getByRole("tab", { name: "logo.svg", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(files.getByRole("tab", { name: "logo.svg", exact: true })).toHaveCount(0);
  await expect(files.getByRole("tab", { name: "Files", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

// v1.4 批4 文件操作：03y 新建 sheet（文件|文件夹 segc + 名称 + 位置）→ 03w2 重命名
// Alert（预填全选 + ✓ 可用）→ 03w3 移动 sheet（目录浏览 + ✓ 选中 + 移动到此处）→
// 03w4 删除确认（文件/文件夹措辞）。右栏 FilesToolPanel 桌面语境：行右键 = 03w 菜单。
test("batch-4 file operations: new item sheet, rename, move, delete confirm", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  const projectRow = page.locator(`nav.side .srow2[title="${projectName}"]`);
  await expect(projectRow).toBeVisible();
  await page.goto(`/projects/${projectName}?rightTab=files`);
  const files = page.getByRole("complementary").nth(1);
  // 深链映射完成信号（对齐上方测试同款）：右栏 aside 挂载 + files 标签激活，再等列表行
  //——fresh page 直达深链时 aside/inspection/files 三层串行就绪，直接等 .frow 会竞速失败。
  await expect(files.getByRole("tab", { name: "Files", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(files.locator(".frow").first()).toBeVisible();

  const stamp = Date.now().toString(36);
  const fileName = `e2e-b4-${stamp}.txt`;
  // 行定位限定 files 标签 body：三基础常驻后 Git 面板叠层保活（invisible 仍在 DOM），新建/
  // 重命名文件的 git 变更行与 files 列表行同 hasText → 全局 .frow 会 strict violation。
  const filesBody = files.locator('[data-panel-tab-body="files"]');

  // ── 03y 新建 sheet：toolChip 行「＋」（05e:54，第二批起桌面 .links 行 lg:hidden、
  //    入口移至 toolChip AddMenu 单源）→「New…」菜单项，segc 文件态 + 名称 + 位置（项目根）。──
  await files.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "New…" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("tab", { name: "File", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(sheet.getByText("project root")).toBeVisible();
  // 重名即时校验：输入既有名 → 行内红字；换唯一名 → 可创建。
  await sheet.getByLabel("Name").fill("README.md");
  await expect(sheet.getByText(/already exists/i)).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Create" })).toBeDisabled();
  await sheet.getByLabel("Name").fill(fileName);
  await sheet.getByRole("button", { name: "Create" }).click();
  await expect(filesBody.locator(".frow", { hasText: fileName })).toBeVisible();

  // ── 03w2 重命名 Alert：右键行 → 菜单「Rename」→ 预填全选覆盖输入 + ✓ Available。──
  await filesBody.locator(".frow", { hasText: fileName }).click({ button: "right" });
  await page.locator('[role="menuitem"]', { hasText: "Rename" }).click();
  const renameBox = page.getByRole("dialog");
  await expect(renameBox.getByRole("button", { name: "Rename" })).toBeDisabled(); // 未改名禁用
  await renameBox.getByLabel("Rename").fill(`e2e-b4-${stamp}-renamed.txt`);
  await expect(renameBox.getByText("✓ Available")).toBeVisible();
  await renameBox.getByRole("button", { name: "Rename" }).click();
  await expect(filesBody.locator(".frow", { hasText: `-renamed.txt` })).toBeVisible();

  // ── 03w3 移动 sheet：右键 → 「Move to…」→ 当前目录行 ✓ + 点 src 进入 + 移动到此处。──
  await filesBody.locator(".frow", { hasText: `-renamed.txt` }).click({ button: "right" });
  await page.locator('[role="menuitem"]', { hasText: "Move to…" }).click();
  const moveBox = page.getByRole("dialog");
  await expect(moveBox.locator(".ck")).toHaveText("✓");
  await moveBox.locator(".mvrow", { hasText: "src" }).click();
  await moveBox.getByRole("button", { name: "Move here" }).click();
  // 移动后：进 src 目录看到文件；原根层不再有。定位用子串匹配（与上方 /src/ 同款——
  // .frow 行 textContent 带行内空白，锚定正则 ^src$ 不匹配）。
  await filesBody.locator(".frow", { hasText: /src/ }).first().click();
  await expect(filesBody.locator(".frow", { hasText: `-renamed.txt` })).toBeVisible();

  // ── 03w4 删除确认：src 层右键 renamed 文件 → confirm 文案（文件版措辞）→ 确认移除。──
  await filesBody.locator(".frow", { hasText: `-renamed.txt` }).click({ button: "right" });
  await page.locator('[role="menuitem"]', { hasText: "Delete" }).click();
  const delBox = page.getByRole("dialog");
  await expect(delBox).toContainText("removed from the project and the Git worktree");
  await delBox.getByRole("button", { name: "Delete", exact: true }).click();
  // count 0 保持全局（files + git 变更行都应消失，比 body 限定更严）。
  await expect(files.locator(".frow", { hasText: `-renamed.txt` })).toHaveCount(0);
});
