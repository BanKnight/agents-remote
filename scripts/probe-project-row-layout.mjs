// 探针：项目总览项目标题行重设计（2026-08-10）。
// 验证：① 点项目名 = 进入项目（URL → /projects/$key）；② ▾ 独立折叠按钮（点行主体不再折叠）；
// ③ ⋯ 展开为行内按钮（+Claude/+Terminal/🗑 各自独立，触发各自 Dialog 不冒泡导航）；
// ④ 空项目行无 ▾；⑤ 移动端布局无横向溢出 + touch 放大类挂载。
//
// 注意：§7——Chromium 无法模拟 `(pointer: coarse)`/`(hover: none)`，`touch:` 类在 Chromium 下
// media 不匹配、运行时按钮仍是 h-7 w-7(28px)。故移动断言验证「类名已挂 touch:h-10/touch:w-10 +
// 布局无溢出」，真实触摸目标 40px 由真机确认（§7 混合策略：运行时验证桌面态 + 静态类验证触屏态）。
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
    // ── 桌面：进入 / 折叠 / 行内按钮语义 ─────────────────────────
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

    // 返回总览继续断言。
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

    // 断言 3：点 +Claude → 创建名 prompt Dialog，取消后不导航。
    const urlC = page.url();
    await page.getByRole("button", { name: "Claude", exact: true }).first().click();
    await page.getByRole("dialog").waitFor({ timeout: 5000 });
    const dialogText = await page.getByRole("dialog").textContent();
    record(dialogText.includes("创建 Agent 会话"), "断言3a 点+Claude弹创建 prompt");
    await page.getByRole("button", { name: "取消" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    record(page.url() === urlC, `断言3b 取消后 URL 不变（不导航，=${page.url() === urlC}）`);

    // 断言 4：点 +Terminal → prompt，取消后不导航（操作按钮不冒泡）。
    const urlT = page.url();
    await page.getByRole("button", { name: "终端", exact: true }).first().click();
    await page.getByRole("dialog").waitFor({ timeout: 5000 });
    const dialogT = await page.getByRole("dialog").textContent();
    record(dialogT.includes("创建终端"), "断言4a 点+Terminal弹创建 prompt");
    await page.getByRole("button", { name: "取消" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    record(
      page.url() === urlT,
      `断言4b 取消后 URL 不变（操作按钮不冒泡导航，=${page.url() === urlT}）`,
    );

    // 断言 5：点 🗑 → 删除 confirm，取消后不导航。
    const urlD = page.url();
    await page.getByRole("button", { name: "删除项目", exact: true }).first().click();
    await page.getByRole("dialog").waitFor({ timeout: 5000 });
    const dialogD = await page.getByRole("dialog").textContent();
    record(dialogD.includes("删除项目"), "断言5a 点🗑弹删除 confirm");
    await page.getByRole("button", { name: "取消" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    record(
      page.url() === urlD,
      `断言5b 取消后 URL 不变（删除按钮不导航，=${page.url() === urlD}）`,
    );

    await ctx.close();

    // ── 移动：布局 + touch 放大类 + 无横向溢出 ──────────────────
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
    });
    const mpage = await mctx.newPage();
    await loginAndMock(mpage, { width: 390, height: 844 });

    // 先等列表渲染锚点（🗑 在项目行内，出现即列表已 commit），再做各断言（避免 count 跑在渲染前）。
    const delBtn = mpage.getByRole("button", { name: "删除项目", exact: true }).first();
    await delBtn.waitFor({ timeout: 10000 });

    const foldCount = await mpage.getByRole("button", { name: /折叠项目组|展开项目组/ }).count();
    record(
      foldCount === 1,
      `断言6a 移动端 ▾ 折叠按钮仅实例项目行有（count=${foldCount}=1，空项目行无 ▾）`,
    );
    const delCls = (await delBtn.getAttribute("class")) ?? "";
    record(
      delCls.includes("touch:h-10") && delCls.includes("touch:w-10"),
      `断言6b 移动端操作按钮挂 touch 放大类（touch:h-10/w-10）`,
    );
    const enterBtn = mpage.getByRole("button", { name: "进入项目", exact: true }).first();
    const enterCls = (await enterBtn.getAttribute("class")) ?? "";
    record(
      enterCls.includes("touch:h-10") && enterCls.includes("touch:w-10"),
      `断言6c 移动端 › 按钮挂 touch 放大类`,
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
