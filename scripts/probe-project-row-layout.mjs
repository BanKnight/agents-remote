// 探针：项目总览项目标题行重设计（2026-08-10 迭代）。
// 验证：① 点项目名 = 进入项目；② ▾ 独立折叠按钮（点行主体不再折叠）+ 紧凑对齐置顶（chevron 紧贴左缘、
// 紧挨 📁，纠正首版 ▾ 方块 button 致离 📁 14px 的布局错误）；③ 新建合并为 ➕ 二级菜单（点 ➕ 出菜单 →
// 选 Claude/Terminal → 弹 name prompt，不冒泡导航）；④ 🗑 删除独立按钮（confirm 不导航）；
// ⑤ 空项目行无 ▾；⑥ 移动端无横向溢出 + touch 放大类挂载；
// ⑦ 实例区结构（3 卡单列 + topSeparator inset + 无 carousel/ViewSwitcher）+ 折叠 localStorage
// 记忆（reload 后仍折叠）+ 置顶分组生命周期（置顶/取消置顶/双显示/aria-pressed/pin 几何/折叠记忆）
// + create header 显隐（桌面 flex / 移动 none）——并入自 probe-grouped-section.mjs 的独有断言。
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

// proj1 有 3 个实例（2 agent + 1 terminal，渲染卡片，topSeparator=2）；proj-empty 空项目（只标题行，无 ▾）。
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
    {
      type: "agent",
      projectName: "proj1",
      sessionId: "row-agent-2",
      displayName: "会话 B",
      status: "idle",
      provider: "claude2",
    },
    {
      type: "terminal",
      projectName: "proj1",
      sessionId: "row-term-1",
      displayName: "终端 C",
      status: "idle",
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
  // 空 pinned mock：桌面/移动 ctx 无置顶分组（确定性；否则依赖真实 state.yaml 的置顶状态，
  // 真实有置顶会让下方 sections/卡片计数断言 flaky）。actx 单独用可变 mock 测置顶生命周期。
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
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
  // lock 解除有延迟，第二次 ➕ force click 可能因 lock 残留致 Trigger 不响应（探针时序，非真实 UI bug——
  // 真实用户操作间隔远大于 lock 解除时间）。清残留 pointer-events + 菜单未开重试兜底。
  const trigger = page.getByRole("button", { name: /新建会话|New session/ }).first();
  const item = page.getByRole("menuitem", { name: itemRe }).first();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      document.body.style.pointerEvents = "";
    });
    await trigger.click({ force: true });
    try {
      await item.waitFor({ timeout: 3000 });
      break;
    } catch {
      // lock 残留致菜单未开，重试。
    }
  }
  await item.click();
}

async function run() {
  // 前置：CSS 落盘三道闸（web DOM 探针铁律，frontend-notes §2/§10）。
  const css = await verifyCssFlushed({
    origin: WEB_ORIGIN,
    expectClasses: [
      "bg-surface-raised",
      "text-on-surface-muted",
      "divide-on-surface/5",
      "touch:h-10",
    ],
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
    // 🗑 处在 body 层（非 Dialog Content 内），断言 4b 的 createTerminal Dialog 关闭后 Radix body
    // pointer-events lock 解除有延迟会拦截 click——清残留 lock + force click 绕过 hit-test。
    await page.evaluate(() => {
      document.body.style.pointerEvents = "";
    });
    await page
      .getByRole("button", { name: "删除项目", exact: true })
      .first()
      .click({ force: true });
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
    // chevron 贴左 = 相对标题行容器左缘 ≈ pl-3(12)（绝对 left 受左总览栏偏移影响，改用相对偏移）。
    // 行容器 = chevron 所在 section（含 bg-surface-raised 的祖先；2026-08-10 section bg 凸起语义 token）。
    const chevronRelRow = await foldBtn.evaluate((el) => {
      let node = el.parentElement;
      while (node && !node.className.includes("bg-surface-raised")) node = node.parentElement;
      const row = node ?? el.parentElement;
      return (
        el.querySelector("svg").getBoundingClientRect().left - row.getBoundingClientRect().left
      );
    });
    record(
      chevronRelRow >= 8 && chevronRelRow <= 16,
      `断言7b ▾ chevron 贴左（相对行左缘 ${chevronRelRow.toFixed(1)}px，pl-3=12 基准）`,
    );

    // ── 实例区结构 + 折叠记忆 + create header（并入 probe-grouped-section 独有断言，2026-08-10）────
    // 断言 12：proj1 3 卡单列 + 非首卡 topSeparator inset + 空项目无实例区 + 无 carousel/ViewSwitcher
    // + 折叠 localStorage 记忆（reload 后仍折叠）+ create header 桌面 flex。
    const gridData = await page.evaluate(() => {
      const secs = [...document.querySelectorAll('section[class*="bg-surface-raised"]')];
      const proj = secs.find((s) =>
        [...s.querySelectorAll("button")].some((b) => b.textContent.trim() === "proj1"),
      );
      if (!proj) return null;
      const grid = [...proj.querySelectorAll("div")].find(
        (d) => getComputedStyle(d).display === "grid",
      );
      if (!grid) return null;
      const cards = [...grid.children];
      const lefts = cards.map((c) => Math.round(c.getBoundingClientRect().left));
      const topSep = cards.filter((c) =>
        [...c.querySelectorAll("div")].some(
          (d) =>
            String(d.className || "").includes("left-15") &&
            getComputedStyle(d).position === "absolute",
        ),
      ).length;
      return { cardCount: cards.length, lefts, topSep };
    });
    record(
      !!gridData && gridData.cardCount === 3,
      `断言12a proj1 实例区 3 卡（got ${gridData?.cardCount ?? "null"}）`,
    );
    record(
      !!gridData && gridData.lefts.every((l) => Math.abs(l - gridData.lefts[0]) <= 1),
      `断言12b 卡片单列（left 全 ${gridData?.lefts?.join(",")}）`,
    );
    record(
      !!gridData && gridData.topSep === 2,
      `断言12c 非首卡 topSeparator = 2（got ${gridData?.topSep ?? "null"}）`,
    );
    const emptyNoGrid = await page.evaluate(() => {
      const secs = [...document.querySelectorAll('section[class*="bg-surface-raised"]')];
      const empty = secs.find((s) =>
        [...s.querySelectorAll("button")].some((b) => b.textContent.trim() === "proj-empty"),
      );
      if (!empty) return null;
      return ![...empty.querySelectorAll("div")].some(
        (d) => getComputedStyle(d).display === "grid",
      );
    });
    record(emptyNoGrid === true, `断言12d 空项目只名行、无实例区（got ${emptyNoGrid}）`);
    const noCarousel = await page.evaluate(
      () => document.querySelectorAll(".snap-x, .snap-mandatory").length,
    );
    record(noCarousel === 0, `断言12e 无 carousel snap 容器（got ${noCarousel}）`);
    const noSwitcher = await page.evaluate(
      () =>
        document.querySelectorAll(
          '[role="group"][aria-label*="视图"], [role="group"][aria-label*="View"], button[aria-label*="Grouped"], button[aria-label*="分组"], button[aria-label*="Grid"], button[aria-label*="网格"]',
        ).length,
    );
    record(noSwitcher === 0, `断言12f 无 ViewSwitcher 残留（got ${noSwitcher}）`);
    // 折叠 proj1 → reload → 仍折叠（localStorage 记忆，workbenchProjectGroupsCollapsedAtom）。
    await page.evaluate(() => {
      document.body.style.pointerEvents = "";
    });
    await page
      .getByRole("button", { name: /折叠项目组/ })
      .first()
      .click();
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForTimeout(800);
    const foldedAfterReload = await page
      .getByRole("button", { name: /展开项目组/ })
      .first()
      .count();
    const cardAfterReload = await page
      .locator('[role="button"]')
      .filter({ hasText: "会话 A" })
      .count();
    record(
      foldedAfterReload === 1 && cardAfterReload === 0,
      `断言12g 折叠后 reload 仍折叠（展开按钮=${foldedAfterReload}=1，卡片${cardAfterReload}=0，localStorage 记忆）`,
    );
    // create header 行桌面 display:flex（并入 probe-grouped-section 移动 header 清理）。
    const headerDisplayDesktop = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="创建或采用项目"]');
      return btn ? getComputedStyle(btn.parentElement).display : "not-found";
    });
    record(
      headerDisplayDesktop === "flex",
      `断言12h 桌面 create header 行 display:flex（got ${headerDisplayDesktop}）`,
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
    // create header 行移动端 display:none（并入 probe-grouped-section 移动 header 清理——
    // 零残留空条/分割线；lg:hidden 侧）。
    const headerDisplayMobile = await mpage.evaluate(() => {
      const btn = document.querySelector('button[aria-label="创建或采用项目"]');
      return btn ? getComputedStyle(btn.parentElement).display : "not-found";
    });
    record(
      headerDisplayMobile === "none",
      `断言6g 移动端 create header 行 display:none（got ${headerDisplayMobile}，零残留空条）`,
    );

    await mctx.close();

    // 断言 8：chevron 对齐置顶（用户诉求「以置顶为参考」）。mock 一个置顶 session → 置顶分组渲染，
    // 对比置顶组 chevron svg 与项目组 chevron svg 的 left。Chromium 无法模拟 (pointer:coarse)（§7），
    // touch:h-10 在 headless 不生效——用 addStyleTag 强制 .touch:h-10 无条件生效模拟移动真机 touch 态。
    // 改 touch:h-10（只放大高度不放大宽度）后，项目组 chevron button 宽度保持 16（= 置顶 chevron 直接子宽），
    // svg 不居中偏移 → 两组 Δ≤1（旧 touch:size-10 撑大 40 致 svg 居中偏右 12px 已修）。
    const actx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "zh-CN",
    });
    const apage = await actx.newPage();
    await apage.route(/\/api\/overview$/, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: OVERVIEW_BODY }),
    );
    // 可变 pinned 服务端 mock：GET 返回 pinnedServer，POST/DELETE 增删（模拟真实 state.yaml 读写），
    // 供置顶分组生命周期断言（13b 取消置顶 / 13c 重新置顶）走乐观 mutation + invalidate refetch。
    let pinnedServer = ["row-agent-1"];
    await apage.route(/\/api\/state\/overview\/pinned-sessions(\/.*)?$/, (r) => {
      const method = r.request().method();
      if (method === "POST") {
        const id = decodeURIComponent(r.request().url().split("/pinned-sessions/")[1]);
        if (!pinnedServer.includes(id)) pinnedServer.push(id);
      } else if (method === "DELETE") {
        const id = decodeURIComponent(r.request().url().split("/pinned-sessions/")[1]);
        pinnedServer = pinnedServer.filter((x) => x !== id);
      }
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: pinnedServer }),
      });
    });
    await apage.goto(`${WEB_ORIGIN}/`);
    await apage
      .getByLabel("密码")
      .or(apage.getByLabel("Password"))
      .fill(await readAppPassword());
    await apage.getByRole("button", { name: /解锁|Unlock/ }).click();
    await apage.waitForResponse((r) => r.url().endsWith("/api/overview"), { timeout: 10000 });
    await apage.waitForTimeout(500);
    // 强制 touch:h-10 / touch:size-10 / touch:w-10 无条件生效（模拟移动真机 pointer:coarse）。
    await apage.addStyleTag({
      content: [
        ".touch\\:h-10 { height:2.5rem !important; }",
        ".touch\\:w-10 { width:2.5rem !important; }",
        ".touch\\:size-10 { width:2.5rem !important; height:2.5rem !important; }",
      ].join("\n"),
    });
    await apage.waitForTimeout(200);
    // 折叠两组（测「全折叠对齐」）。
    await apage
      .getByRole("button", { name: /置顶|Pinned/ })
      .first()
      .click();
    await apage.waitForTimeout(150);
    await apage
      .getByRole("button", { name: /折叠项目组/ })
      .first()
      .click();
    await apage.waitForTimeout(200);
    const pinnedChev = await apage
      .getByRole("button", { name: /置顶|Pinned/ })
      .first()
      .locator("svg")
      .first()
      .boundingBox();
    const projChev = await apage
      .getByRole("button", { name: /展开项目组|折叠项目组/ })
      .first()
      .locator("svg")
      .first()
      .boundingBox();
    const delta = Math.abs(projChev.x - pinnedChev.x);
    record(
      delta <= 1,
      `断言8 ▾ chevron 对齐置顶（touch 强制下 Δ=${delta.toFixed(1)}px ≤1，置顶=${pinnedChev.x.toFixed(1)} 项目=${projChev.x.toFixed(1)}）`,
    );
    // 同步验证 📁 与置顶 📌 icon 对齐（chevron 同宽 → icon 列对齐）。
    const pinnedIcon = await apage
      .getByRole("button", { name: /置顶|Pinned/ })
      .first()
      .locator("svg")
      .nth(1)
      .boundingBox();
    const projIcon = await apage
      .locator("button")
      .filter({ hasText: "proj1" })
      .first()
      .locator("svg")
      .first()
      .boundingBox();
    const iconDelta = Math.abs(projIcon.x - pinnedIcon.x);
    record(
      iconDelta <= 1,
      `断言8b 📁 icon 对齐置顶 📌（Δ=${iconDelta.toFixed(1)}px ≤1，置顶📌=${pinnedIcon.x.toFixed(1)} 项目📁=${projIcon.x.toFixed(1)}）`,
    );
    // 断言 9：分组无空隙 + 标题行 section 横跨 content。2026-08-10 bg 从标题行 div 上移到 section
    // 容器（展开块标题行+卡片一体 bg），列表根去 divide-y。全折叠时 section 是连续圆角条带段——
    // 相邻 collapsed section 间 border-t 紧贴（gap=0），无 space-y-2 空隙。
    const layout = await apage.evaluate(() => {
      const secs = [...document.querySelectorAll('section[class*="bg-surface-raised"]')].map(
        (el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        },
      );
      const root = secs.length
        ? document.querySelector('section[class*="bg-surface-raised"]').parentElement
        : null;
      const cr = root.getBoundingClientRect();
      const cs = getComputedStyle(root);
      return {
        rows: secs,
        contentLeft: cr.left + parseFloat(cs.paddingLeft),
        contentRight: cr.right - parseFloat(cs.paddingRight),
      };
    });
    const allSpan = layout.rows.every(
      (r) =>
        Math.abs(r.left - layout.contentLeft) <= 1 && Math.abs(r.right - layout.contentRight) <= 1,
    );
    record(
      allSpan,
      `断言9a 标题行 section 横跨 content（${layout.rows.length} 行 left/right ≈ content 内边=${allSpan}）`,
    );
    const gaps = [];
    for (let i = 1; i < layout.rows.length; i++)
      gaps.push(layout.rows[i].top - layout.rows[i - 1].bottom);
    const maxGap = gaps.length ? Math.max(...gaps) : 0;
    record(
      maxGap <= 1,
      `断言9b 折叠条带段内无空隙（相邻 gap max=${maxGap.toFixed(1)}px ≤1，border-t 紧贴非 space-y-2 的 8px）`,
    );
    // 断言 10：surface-raised 凸起方向两主题统一（用户「明亮灰底+更灰分组凹陷」真根因修正）。
    // 旧 on-surface/10 = 文字色叠加，明主题深色叠加浅底=凹陷、暗主题浅色叠加深底=凸起，方向翻转（明暗不对称）。
    // 改 surface-raised（凸起语义 token）：明 #ffffff / 暗 #141b28，两主题都比底色（shell bg-surface/20 on
    // bg-base）亮 → 凸起方向统一，对齐苹果 inset-grouped「分组永远比底亮」。验证：读 :root token hex 算
    // WCAG 相对亮度（分组=surface-raised / 底=surface@20% alpha 叠加 bg-base），断言 分组L > 底L 两主题成立；
    // 辅以 getComputedStyle(section) 实色 = surface-raised（明 rgb(255,255,255) / 暗 rgb(20,27,40)）确认落盘。
    const raised = await apage.evaluate(() => {
      function color(s) {
        s = (s || "").trim();
        let m = s.match(/^#([0-9a-f]{6})$/i);
        if (m) {
          const n = parseInt(m[1], 16);
          return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
        }
        // 浏览器 getComputedStyle 会把 #ffffff 规范化成 3 位简写 #fff。
        m = s.match(/^#([0-9a-f]{3})$/i);
        if (m) {
          return {
            r: parseInt(m[1][0] + m[1][0], 16),
            g: parseInt(m[1][1] + m[1][1], 16),
            b: parseInt(m[1][2] + m[1][2], 16),
          };
        }
        return null;
      }
      function channel(c) {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      }
      function luminance({ r, g, b }) {
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      }
      function read() {
        const cs = getComputedStyle(document.documentElement);
        const group = color(cs.getPropertyValue("--surface-raised"));
        const surface = color(cs.getPropertyValue("--surface"));
        const bgBase = color(cs.getPropertyValue("--bg-base"));
        // 底色 = shell bg-surface/20：surface @20% alpha 叠加 bg-base（body radial 近似底）。
        const a = 0.2;
        const base =
          surface && bgBase
            ? {
                r: surface.r * a + bgBase.r * (1 - a),
                g: surface.g * a + bgBase.g * (1 - a),
                b: surface.b * a + bgBase.b * (1 - a),
              }
            : null;
        // section 实际渲染 bg（surface-raised 实色，绕过半透明叠加）。
        const sec = document.querySelector('section[class*="bg-surface-raised"]');
        const secBg = sec ? getComputedStyle(sec).backgroundColor : null;
        return {
          groupL: group ? luminance(group) : null,
          baseL: base ? luminance(base) : null,
          secBg,
        };
      }
      const light = read();
      document.documentElement.classList.add("dark");
      const dark = read();
      document.documentElement.classList.remove("dark");
      return { light, dark };
    });
    record(
      raised.light?.groupL !== null &&
        raised.light?.baseL !== null &&
        raised.light.groupL > raised.light.baseL &&
        raised.dark?.groupL !== null &&
        raised.dark?.baseL !== null &&
        raised.dark.groupL > raised.dark.baseL,
      `断言10a surface-raised 凸起方向两主题统一（分组L > 底L：明 ${raised.light?.groupL?.toFixed(3)} > ${raised.light?.baseL?.toFixed(3)}；暗 ${raised.dark?.groupL?.toFixed(4)} > ${raised.dark?.baseL?.toFixed(4)}）`,
    );
    record(
      raised.light?.secBg === "rgb(255, 255, 255)" && raised.dark?.secBg === "rgb(20, 27, 40)",
      `断言10b section bg = surface-raised 实色（明 ${raised.light?.secBg} = #fff；暗 ${raised.dark?.secBg} = #141b28）`,
    );
    // 断言 11：Apple 动态圆角（2026-08-10，inset grouped）。当前状态 = 全折叠（置顶 + proj1 折叠、
    // proj-empty 空）→ 3 个连续折叠 section 组圆角条带段：首行置顶 rounded-t-lg、末行 proj-empty
    // rounded-b-lg、中段 proj1 方角 + 段内 border-t 分割线、无间距。展开 proj1 后：proj1 脱离成独立
    // 圆角块（rounded-lg 四角），置顶/proj-empty 各成独立圆角块（上下圆），展开块与折叠段间 mt-2
    // 间距断开、无分割线（分割线不穿过展开块）。
    const strip = await apage.evaluate(() =>
      [...document.querySelectorAll('section[class*="bg-surface-raised"]')].map((el) => {
        const cs = getComputedStyle(el);
        return {
          topRadius: cs.borderTopLeftRadius,
          bottomRadius: cs.borderBottomLeftRadius,
          borderTop: cs.borderTopWidth,
          marginTop: cs.marginTop,
        };
      }),
    );
    record(
      strip.length === 3 &&
        strip[0].topRadius !== "0px" &&
        strip[0].bottomRadius === "0px" &&
        strip[1].topRadius === "0px" &&
        strip[1].bottomRadius === "0px" &&
        strip[2].topRadius === "0px" &&
        strip[2].bottomRadius !== "0px" &&
        strip[1].borderTop !== "0px" &&
        strip[2].borderTop !== "0px" &&
        strip.every((s) => s.marginTop === "0px"),
      `断言11a 全折叠条带段（置顶顶圆/中段方角/末行底圆 + 段内分割线 + 紧贴：topR=${strip.map((s) => s.topRadius).join(",")} botR=${strip.map((s) => s.bottomRadius).join(",")} border=${strip.map((s) => s.borderTop).join(",")} mt=${strip.map((s) => s.marginTop).join(",")}）`,
    );
    // 展开 proj1（当前折叠态 ▾ 按钮 aria-label=展开项目组；proj-empty 空无 ▾，置顶无 aria-label）。
    await apage
      .getByRole("button", { name: /展开项目组/ })
      .first()
      .click();
    await apage.waitForTimeout(250);
    const expanded = await apage.evaluate(() =>
      [...document.querySelectorAll('section[class*="bg-surface-raised"]')].map((el) => {
        const cs = getComputedStyle(el);
        return {
          topRadius: cs.borderTopLeftRadius,
          bottomRadius: cs.borderBottomLeftRadius,
          borderTop: cs.borderTopWidth,
          marginTop: cs.marginTop,
        };
      }),
    );
    record(
      expanded.length === 3 &&
        expanded[0].topRadius !== "0px" &&
        expanded[0].bottomRadius !== "0px" &&
        expanded[1].topRadius !== "0px" &&
        expanded[1].bottomRadius !== "0px" &&
        expanded[2].topRadius !== "0px" &&
        expanded[2].bottomRadius !== "0px" &&
        expanded[0].marginTop === "0px" &&
        expanded[1].marginTop === "8px" &&
        expanded[2].marginTop === "8px" &&
        expanded.every((s) => s.borderTop === "0px"),
      `断言11b 展开 proj1 后（置顶/展开块/proj-empty 各四角圆 + mt-2 间距断开 + 无分割线：topR=${expanded.map((s) => s.topRadius).join(",")} botR=${expanded.map((s) => s.bottomRadius).join(",")} border=${expanded.map((s) => s.borderTop).join(",")} mt=${expanded.map((s) => s.marginTop).join(",")}）`,
    );
    // ── 置顶分组生命周期（并入 probe-grouped-section 独有断言，2026-08-10）────
    // 当前状态（延续断言 11b）：置顶组折叠（断言 8 折叠过）、proj1 展开（3 卡）。断言 13 走
    // 真实乐观 pin/unpin mutation + invalidate refetch（pinnedServer mock 增删），闭环验证
    // 置顶/取消置顶 → 分组出现/消失/双显示 → aria-pressed → pin 几何 → 折叠记忆。
    // 13a：展开置顶组 → 置顶卡出现（会话A 双显示 2）。
    await apage
      .getByRole("button", { name: /置顶|Pinned/ })
      .first()
      .click();
    await apage.waitForTimeout(250);
    const pinnedCardsExpanded = await apage
      .locator('[role="button"]')
      .filter({ hasText: "会话 A" })
      .count();
    record(
      pinnedCardsExpanded === 2,
      `断言13a 展开置顶组 → 会话A 双显示（置顶组+项目组，count=${pinnedCardsExpanded}=2）`,
    );
    // 13b：置顶组卡（首个 section）取消置顶 → 置顶组消失（sections 3→2，会话A 回 1）。
    await apage
      .locator('section[class*="bg-surface-raised"]')
      .first()
      .getByRole("button", { name: "取消置顶", exact: true })
      .click();
    await apage.waitForTimeout(250);
    const secsAfterUnpin = await apage.locator('section[class*="bg-surface-raised"]').count();
    const aAfterUnpin = await apage
      .locator('[role="button"]')
      .filter({ hasText: "会话 A" })
      .count();
    record(
      secsAfterUnpin === 2 && aAfterUnpin === 1,
      `断言13b 置顶组取消置顶 → 分组消失（sections ${secsAfterUnpin}=2，会话A ${aAfterUnpin}=1）`,
    );
    // 13c：项目组会话A 卡置顶 → 置顶组恢复（sections 2→3，会话A 双显示 2）。
    await apage
      .locator('[role="button"]')
      .filter({ hasText: "会话 A" })
      .getByRole("button", { name: "置顶", exact: true })
      .click();
    await apage.waitForTimeout(250);
    const secsAfterPin = await apage.locator('section[class*="bg-surface-raised"]').count();
    const aAfterPin = await apage.locator('[role="button"]').filter({ hasText: "会话 A" }).count();
    record(
      secsAfterPin === 3 && aAfterPin === 2,
      `断言13c 项目组置顶 → 置顶组恢复（sections ${secsAfterPin}=3，会话A ${aAfterPin}=2 双显示）`,
    );
    // 13d：置顶卡（双份）aria-pressed=true。
    const pressedStates = await apage
      .locator('[role="button"]')
      .filter({ hasText: "会话 A" })
      .getByRole("button", { name: "取消置顶", exact: true })
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed")));
    record(
      pressedStates.length === 2 && pressedStates.every((v) => v === "true"),
      `断言13d 置顶卡 aria-pressed=true（got ${JSON.stringify(pressedStates)}）`,
    );
    // 13e-13j：pin 几何（并入 probe-grouped-section pinGeom）：① absolute 脱流；② 垂直中心对齐 meta
    // 行中心（与时间同行）；③ meta 行高 ≤17px（text-xs 行高，不被 pin 撑高）；④ pin 高 > meta 行高
    // （溢出而非撑高）；⑤ pin 不与 meta 文本 2D 重叠（pr-7/touch:pr-9 让位）。
    const pinGeom = await apage.evaluate(() => {
      const pin = document.querySelector(
        'button[aria-label="Unpin"], button[aria-label="Pin"], button[aria-label="取消置顶"], button[aria-label="置顶"]',
      );
      if (!pin) return null;
      const metaRow = pin.parentElement;
      const pinR = pin.getBoundingClientRect();
      const metaR = metaRow.getBoundingClientRect();
      const metaSpans = Array.from(metaRow.children).filter((el) => el.tagName === "SPAN");
      const maxMetaTextRight = Math.max(...metaSpans.map((s) => s.getBoundingClientRect().right));
      const pinCy = pinR.top + pinR.height / 2;
      const metaCy = metaR.top + metaR.height / 2;
      const overlap2d = (a, b) =>
        a.left < b.right - 1 &&
        a.right > b.left + 1 &&
        a.top < b.bottom - 1 &&
        a.bottom > b.top + 1;
      return {
        pinAbsolute: getComputedStyle(pin).position === "absolute",
        centerAligns: Math.abs(pinCy - metaCy) <= 1,
        metaHeight: Math.round(metaR.height),
        metaNotInflated: metaR.height <= 17,
        pinOverflowsMeta: pinR.height > metaR.height + 1,
        clearsMetaText: !overlap2d(pinR, {
          left: metaSpans[0]?.getBoundingClientRect().left ?? pinR.left,
          right: maxMetaTextRight,
          top: metaR.top,
          bottom: metaR.bottom,
        }),
      };
    });
    record(!!pinGeom, `断言13e 读取到置顶 pin 几何`);
    if (pinGeom) {
      record(pinGeom.pinAbsolute, `断言13f pin position absolute（不进 flex 流，不撑高 meta）`);
      record(pinGeom.centerAligns, `断言13g pin 垂直中心对齐 meta 中心（与时间同行）`);
      record(
        pinGeom.metaNotInflated,
        `断言13h meta 行不被 pin 撑高（${pinGeom.metaHeight}px ≤17 = text-xs 行高）`,
      );
      record(pinGeom.pinOverflowsMeta, `断言13i pin 溢出 meta 行而非撑高`);
      record(pinGeom.clearsMetaText, `断言13j pin 不与 meta 文本 2D 重叠（pr-7/touch:pr-9 让位）`);
    }
    // 13k：按钮尺寸主次（并入 probe-grouped-section）：⋯(h-9=36) 显著 > pin(h-5=20)（桌面；
    // addStyleTag 只强制 touch:h-10/w-10/size-10，不触及 ⋯ touch:h-11 / pin touch:h-7 → 桌面尺寸）。
    const btnSizes = await apage.evaluate(() => {
      const px = (el) => (el ? el.getBoundingClientRect().width : null);
      const pin = document.querySelector(
        'button[aria-label="Unpin"], button[aria-label="Pin"], button[aria-label="取消置顶"], button[aria-label="置顶"]',
      );
      const more = document.querySelector(
        'button[aria-label="Actions"], button[aria-label="操作"]',
      );
      return { pin: px(pin), more: px(more) };
    });
    record(
      btnSizes.pin !== null &&
        btnSizes.more !== null &&
        Math.abs(btnSizes.pin - 20) <= 1 &&
        Math.abs(btnSizes.more - 36) <= 1 &&
        btnSizes.more > btnSizes.pin,
      `断言13k 按钮尺寸主次：⋯ ${btnSizes.more ?? "null"}px > pin ${btnSizes.pin ?? "null"}px（桌面 36/20）`,
    );
    // 13l：折叠置顶组 → 置顶卡隐藏（sections 仍 3，会话A 回 1；置顶组折叠记忆同项目组 localStorage）。
    await apage
      .getByRole("button", { name: /置顶|Pinned/ })
      .first()
      .click();
    await apage.waitForTimeout(250);
    const secsAfterFold = await apage.locator('section[class*="bg-surface-raised"]').count();
    const aAfterFold = await apage.locator('[role="button"]').filter({ hasText: "会话 A" }).count();
    record(
      secsAfterFold === 3 && aAfterFold === 1,
      `断言13l 折叠置顶组 → 置顶卡隐藏（sections ${secsAfterFold}=3，会话A ${aAfterFold}=1）`,
    );
    await actx.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
