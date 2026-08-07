// 探针：验证左栏文件 tab cwd 跨 middle tab 切换保活（问题1 核心行为）+ file tab refresh 按钮渲染（问题2）。
//
// 根因修复：
// - cwd 保活：FilesLeftPanel currentPath 受控 lift 到 ProjectLeftPanel filesPath state；ProjectLeftPanel
//   常驻左栏（middle tab 切换只换 middleBody 子树，不 unmount ProjectLeftPanel）→ filesPath 保留 →
//   切回文件 tab currentPath 仍是子目录，不回根目录。切项目时 derived-state 重置 filesScopeKey 变 → setFilesPath("")。
// - refresh：FilePreviewPanel header 加 onRefresh 按钮（invalidate preview query）+ preview query staleTime:0。
//
// 单测验不到（跨组件 unmount/remount + middle tab 切换 + 项目切换），需真实浏览器驱动。
// 密码自读（config.yaml → api environ），不进 agent 上下文、不打印值。
// 用法：node scripts/probe-files-cwd-refresh.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const subdir = process.env.PROBE_SUBDIR ?? "diagrams";

// 读左栏文件树 PathBreadcrumb 的 segments（目录名，不含 root home 按钮）。
// PathBreadcrumb：flex flex-wrap 容器 + root button(含 svg) + segment buttons(纯文本)。
async function readFilesCwdSegments(page) {
  return await page.evaluate(() => {
    const crumbs = document.querySelectorAll("div.flex.min-w-0.flex-wrap");
    for (const c of crumbs) {
      const buttons = [...c.querySelectorAll("button")];
      if (buttons.length === 0) continue;
      // segment button 无 svg（root button 含 home svg）；文本 = 目录名。
      return buttons.filter((b) => !b.querySelector("svg")).map((b) => b.textContent?.trim() ?? "");
    }
    return [];
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  try {
    await page.goto(`${WEB_ORIGIN}/`);
    await page.getByLabel("Password").fill(await readAppPassword());
    await page.getByRole("button", { name: "Unlock console" }).click();
    await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
    await page.waitForSelector("nav[aria-label]", { timeout: 10000 });
    await page.waitForTimeout(500);

    // 切到 [文件] middle tab（用 TabButton 的 text-xs.font-semibold class 区分活动栏 icon button，
    // 后者用 aria-label 也会被 getByRole name 匹配，导致 strict mode 命中多个）
    const middleFiles = page
      .locator("button.text-xs.font-semibold")
      .filter({ hasText: /^(文件|Files)$/ });
    const middleOverview = page
      .locator("button.text-xs.font-semibold")
      .filter({ hasText: /^(实例|Overview)$/ });
    await middleFiles.click();
    await page.waitForTimeout(700);
    const segs0 = await readFilesCwdSegments(page);
    console.log(`[初始] 文件 tab cwd segments = ${JSON.stringify(segs0)}（应 []，根目录）`);

    // 点子目录进入
    const folder = page
      .locator("span.font-mono")
      .filter({ hasText: new RegExp(`^${subdir}$`) })
      .first();
    if (!(await folder.count())) {
      throw new Error(`子目录 ${subdir} 未在文件列表找到（PROBE_SUBDIR 配置或 test 项目结构）`);
    }
    await folder.click();
    await page.waitForTimeout(700);
    const segs1 = await readFilesCwdSegments(page);
    console.log(`[进入 ${subdir}] cwd segments = ${JSON.stringify(segs1)}（应含 "${subdir}"）`);
    if (!segs1.includes(subdir)) errors.push(`进入子目录失败：segments=${JSON.stringify(segs1)}`);

    // 切 [实例/输出] tab → 切回 [文件] tab
    await middleOverview.click();
    await page.waitForTimeout(400);
    await middleFiles.click();
    await page.waitForTimeout(700);
    const segs2 = await readFilesCwdSegments(page);
    console.log(`[切输出再切回文件] cwd segments = ${JSON.stringify(segs2)}（应仍含 "${subdir}"）`);
    const cwdPreserved = segs2.includes(subdir);
    console.log(`  → cwd 跨 tab 保活：${cwdPreserved ? "✓ PASS" : "✗ FAIL"}`);
    if (!cwdPreserved)
      errors.push(`cwd 丢失：切回后 segments=${JSON.stringify(segs2)} 不含 ${subdir}`);

    // ── refresh 按钮渲染（中栏 file tab）──
    // 回根目录点一个文件 → onOpenFile 开中栏 file tab → FileTabPreview header 渲染 refresh 按钮。
    // 回根目录（点面包屑 root）
    const rootBtn = page.locator("div.flex.min-w-0.flex-wrap button").first();
    await rootBtn.click();
    await page.waitForTimeout(500);
    const aFile = page
      .locator("span.font-mono")
      .filter({ hasText: /^[\w.-]+\.(ts|md|json|js)$/ })
      .first();
    if (await aFile.count()) {
      await aFile.click();
      await page.waitForTimeout(1000);
      // refresh 按钮 aria-label = files.refresh（zh"刷新预览" / en"Refresh preview"）
      const refreshBtn = page.locator('button[aria-label*="刷新"], button[aria-label*="Refresh"]');
      const n = await refreshBtn.count();
      console.log(
        `  → file tab refresh 按钮渲染：${n > 0 ? "✓ PASS" : "✗ FAIL（中栏 file tab 可能未开）"}`,
      );
      if (n === 0) errors.push("file tab 未渲染 refresh 按钮（或 file tab 未打开）");
    } else {
      console.log(`  → 跳过 refresh 验证（根目录无可点击文件）`);
    }

    console.log(`\n=== 判定 ===`);
    if (errors.length === 0) {
      console.log("ALL PASS：cwd 跨 middle tab 保活 + file tab refresh 按钮渲染");
    } else {
      console.log(`FAIL：\n  - ${errors.join("\n  - ")}`);
    }
  } catch (e) {
    console.error(`探针异常：${e.message}`);
    errors.push(e.message);
  } finally {
    await browser.close();
    process.exit(errors.length === 0 ? 0 : 1);
  }
})();
