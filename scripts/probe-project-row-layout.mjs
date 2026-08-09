// 探针：项目总览项目标题行重设计（2026-08-10 迭代）。
// 验证：① 点项目名 = 进入项目；② ▾ 独立折叠按钮（点行主体不再折叠）+ 紧凑对齐置顶（chevron 紧贴左缘、
// 紧挨 📁，纠正首版 ▾ 方块 button 致离 📁 14px 的布局错误）；③ 新建合并为 ➕ 二级菜单（点 ➕ 出菜单 →
// 选 Claude/Terminal → 弹 name prompt，不冒泡导航）；④ 🗑 删除独立按钮（confirm 不导航）；
// ⑤ 空项目行无 ▾；⑥ 移动端无横向溢出 + touch 放大类挂载。
//
// §7：Chromium 无法模拟 (pointer:coarse)/(hover:none)，touch: 类运行时 media 不匹配（按钮仍 h-7 w-7）。
// 故移动断言验证「类名挂 touch + 布局无溢出」，真实 40px 触摸目标由真机确认。
// 密码自读不打印。用法：bun scripts/probe-project-row-layout.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

// proj1 有 1 个 agent 实例（渲染卡片）；proj-empty 空项目（只标题行，无 ▾）。
const OVERVIEW_BODY = JSON.stringify({
  projectNames: ["proj1", "proj-empty"],
  candidates: [
    {
      type: "agent",
      projectName: "proj1",
      sessionId: "row-agent-1",
      displayName: "会话 A",
      status: "running",
      provider: "claude2",
    },
  ],
});

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

async function loginAndMock(page, viewport) {
  await page.setViewportSize(viewport);
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: OVERVIEW_BODY }),
  );
  await page.goto(`${WEB_ORIGIN}/`);
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /解锁|Unlock/ }).click();
  await page.waitForResponse((r) => r.url().endsWith("/api/overview"), { timeout: 10000 });
}

// 点 ➕ trigger（aria-label=新建会话/New session）→ 等菜单 menuitem → 点匹配项。
async function openCreateMenuAndPick(page, itemRe) {
  // Radix 在快速「DropdownMenu 开 → Dialog 开 → Dialog 关」连续 modal 切换后，body pointer-events
  // lock 解除有延迟，Playwright 严格 actionability 撞上 <html> intercepts（探针时序，非真实 UI bug——
  // 真实用户操作间隔远大于 lock 解除时间）。force click 绕过 hit-test 直接触发 ➕ onClick 开菜单。
  await page
    .getByRole("button", { name: /新建会话|New session/ })
    .first()
    .click({ force: true });
  const item = page.getByRole("menuitem", { name: itemRe }).first();
  await item.waitFor({ timeout: 5000 });
  await item.click();
}

async function run() {
  // 前置：CSS 落盘三道闸（web DOM 探针铁律，frontend-notes §2/§10）。
  const css = await verifyCssFlushed({
    origin: WEB_ORIGIN,
    expectClasses: ["bg-surface-raised/30", "text-on-surface-muted"],
  });
  if (!css.pass) {
    console.error("CSS 落盘验证失败，探针中止：");
    css.details.forEach((d) => console.error(`  ${d}`));
    process.exit(1);
  }
  console.log("✓ CSS 落盘 + content-type 正常");

  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    // ── 桌面：进入 / 折叠 / ➕ 菜单 / 删除 / 几何对齐 ─────────────
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "zh-CN",
    });
    const page = await ctx.newPage();
    await loginAndMock(page, { width: 1280, height: 900 });

    // 断言 1：点项目名 → 进入项目（URL 变 /projects/proj1）。
    const nameBtn = page.locator("button").filter({ hasText: "proj1" }).first();
    await nameBtn.waitFor({ timeout: 10000 });
    await nameBtn.click();
    await page.waitForURL(/\/projects\/proj1/, { timeout: 10000 });
    record(true, "断言1 点项目名进入项目（URL → /projects/proj1）");
    await page.goto(`${WEB_ORIGIN}/`);
    await page.waitForTimeout(400);

    // 断言 2：点 ▾ 折叠独立触发（卡片隐藏、URL 不变），再点展开。
    const foldBtn = page.getByRole("button", { name: /折叠项目组|展开项目组/ }).first();
    await foldBtn.waitFor({ timeout: 10000 });
    const urlBefore = page.url();
    const cardBefore = await page.locator('[role="button"]').filter({ hasText: "会话 A" }).count();
    record(cardBefore === 1, `断言2a 展开态实例卡片可见（count=${cardBefore}=1）`);
    await foldBtn.click();
    await page.waitForTimeout(200);
    const cardAfter = await page.locator('[role="button"]').filter({ hasText: "会话 A" }).count();
    record(
      cardAfter === 0 && page.url() === urlBefore,
      `断言2b 点▾折叠独立触发（卡片${cardAfter}=0，URL 不变=${page.url() === urlBefore}）`,
    );
    await foldBtn.click();
    await page.waitForTimeout(200);
    const cardReopen = await page.locator('[role="button"]').filter({ hasText: "会话 A" }).count();
    record(cardReopen === 1, `断言2c 再点▾展开（卡片${cardReopen}=1）`);

    // 断言 3：点 ➕ → 菜单 → 选 Claude → name prompt，取消不导航。
    const urlC = page.url();
    await openCreateMenuAndPick(page, /claude/i);
    await page
      .getByRole("dialog")
      .filter({ hasText: "创建 Agent 会话" })
      .waitFor({ timeout: 5000 });
    record(true, "断言3a 点➕选Claude弹创建 Agent prompt");
    await page.getByRole("button", { name: "取消" }).first().click();
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    record(page.url() === urlC, `断言3b 取消后 URL 不变（不导航，=${page.url() === urlC}）`);

    // 断言 4：点 ➕ → 菜单 → 选 Terminal → prompt，取消不导航（操作不冒泡）。
    const urlT = page.url();
    await openCreateMenuAndPick(page, /terminal|终端/i);
    await page.getByRole("dialog").filter({ hasText: "创建终端" }).waitFor({ timeout: 5000 });
    record(true, "断言4a 点➕选Terminal弹创建终端 prompt");
    await page.getByRole("button", { name: "取消" }).first().click();
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    record(
      page.url() === urlT,
      `断言4b 取消后 URL 不变（菜单项不冒泡导航，=${page.url() === urlT}）`,
    );

    // 断言 5：点 🗑 → 删除 confirm，取消不导航。
    const urlD = page.url();
    await page.getByRole("button", { name: "删除项目", exact: true }).first().click();
    await page.getByRole("dialog").filter({ hasText: "删除项目" }).waitFor({ timeout: 5000 });
    record(true, "断言5a 点🗑弹删除 confirm");
    await page.getByRole("button", { name: "取消" }).first().click();
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    record(
      page.url() === urlD,
      `断言5b 取消后 URL 不变（删除按钮不导航，=${page.url() === urlD}）`,
    );

    // 断言 7：▾ chevron 紧凑对齐（桌面几何）——chevron 紧贴左缘 + 紧挨 📁（纠正首版离 📁 14px）。
    const chevronBox = await foldBtn.locator("svg").boundingBox();
    const iconBox = await nameBtn.locator("svg").first().boundingBox();
    const gap = iconBox.x - (chevronBox.x + chevronBox.width);
    record(
      gap >= 0 && gap <= 10,
      `断言7a ▾ chevron 紧挨 📁（gap=${gap.toFixed(1)}px ≤10，非首版 14px）`,
    );
    // chevron 贴左 = 相对行容器左缘 ≈ pl-3(12)（绝对 left 受左总览栏偏移影响，改用相对偏移）。
    const chevronRelRow = await foldBtn.evaluate((el) => {
      let node = el.parentElement;
      while (node && !node.classList.contains("rounded-lg")) node = node.parentElement;
      const row = node ?? el.parentElement;
      return (
        el.querySelector("svg").getBoundingClientRect().left - row.getBoundingClientRect().left
      );
    });
    record(
      chevronRelRow >= 8 && chevronRelRow <= 16,
      `断言7b ▾ chevron 贴左（相对行左缘 ${chevronRelRow.toFixed(1)}px，pl-3=12 基准）`,
    );

    await ctx.close();

    // ── 移动：布局 + touch 放大类 + 无横向溢出 ──────────────────
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
    });
    const mpage = await mctx.newPage();
    await loginAndMock(mpage, { width: 390, height: 844 });

    // 先等列表渲染锚点（🗑 在项目行内，出现即列表已 commit），再做各断言。
    const delBtn = mpage.getByRole("button", { name: "删除项目", exact: true }).first();
    await delBtn.waitFor({ timeout: 10000 });

    const foldCount = await mpage.getByRole("button", { name: /折叠项目组|展开项目组/ }).count();
    record(foldCount === 1, `断言6a 移动端 ▾ 仅实例项目行有（count=${foldCount}=1，空项目行无 ▾）`);
    const delCls = (await delBtn.getAttribute("class")) ?? "";
    record(
      delCls.includes("touch:h-10") && delCls.includes("touch:w-10"),
      `断言6b 移动端 🗑 挂 touch 放大类（touch:h-10/w-10）`,
    );
    const plusCls =
      (await mpage
        .getByRole("button", { name: /新建会话|New session/ })
        .first()
        .getAttribute("class")) ?? "";
    record(
      plusCls.includes("touch:h-10") && plusCls.includes("touch:w-10"),
      `断言6c 移动端 ➕ 挂 touch 放大类`,
    );
    const emptyName = await mpage.locator("button").filter({ hasText: "proj-empty" }).count();
    record(emptyName === 1, `断言6d 空项目行名 button 存在（count=${emptyName}=1）`);
    const overflow = await mpage.evaluate(() => document.body.scrollWidth > window.innerWidth);
    record(!overflow, `断言6e 移动端无横向溢出（scrollWidth ≤ innerWidth）`);
    // 名文本 span：ShellIcon 是外层 span wrapper（不含项目名文本），须用 hasText 过滤出真正的名 span。
    const nameSpanCls =
      (await mpage
        .locator("button")
        .filter({ hasText: "proj1" })
        .first()
        .locator("span")
        .filter({ hasText: "proj1" })
        .first()
        .getAttribute("class")) ?? "";
    record(nameSpanCls.includes("truncate"), `断言6f 项目名 span 挂 truncate`);

    await mctx.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
