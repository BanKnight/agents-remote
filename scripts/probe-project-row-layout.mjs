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
      "bg-on-surface/10",
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
    // 行容器 = bg-on-surface/10 的标题行 div（2026-08-10 去 rounded-lg 后不再有 rounded-lg 标记；
    // 2026-08-10 bg 从 surface-raised/30 → on-surface/10 主题自适应）。
    const chevronRelRow = await foldBtn.evaluate((el) => {
      let node = el.parentElement;
      while (node && !node.className.includes("bg-on-surface/10")) node = node.parentElement;
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
    await apage.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: ["row-agent-1"] }),
      }),
    );
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
      const secs = [...document.querySelectorAll('section[class*="bg-on-surface/10"]')].map(
        (el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        },
      );
      const root = secs.length
        ? document.querySelector('section[class*="bg-on-surface/10"]').parentElement
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
    // 断言 10：on-surface/10 两主题都明显（用户「多主题」核心诉求）。直接读 :root 的 --on-surface +
    // --surface-raised（左栏底近似）hex，手算 on-surface @10% alpha 叠加底色的合成色 Δ（绕过 getComputedStyle
    // 解析 color-mix 的不确定性）。明主题 + 加 .dark class 暗主题各一次。on-surface 主题自适应[明 #0f1520 深 /
    // 暗 #eef4ff 浅]，两主题 Δ≈66~69（三通道和）远高于旧 surface-raised/30 与底自我叠加的 ≈0。
    const themeDelta = await apage.evaluate(() => {
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
        // 或解析成 rgb()（空格或逗号分隔）。
        m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
        if (m) return { r: +m[1], g: +m[2], b: +m[3] };
        return null;
      }
      function read() {
        const cs = getComputedStyle(document.documentElement);
        const onSurfaceRaw = cs.getPropertyValue("--on-surface");
        const baseRaw = cs.getPropertyValue("--surface-raised");
        const onSurface = color(onSurfaceRaw);
        const base = color(baseRaw);
        let delta = null;
        if (onSurface && base) {
          const a = 0.1;
          const final = {
            r: onSurface.r * a + base.r * (1 - a),
            g: onSurface.g * a + base.g * (1 - a),
            b: onSurface.b * a + base.b * (1 - a),
          };
          delta =
            Math.abs(final.r - base.r) + Math.abs(final.g - base.g) + Math.abs(final.b - base.b);
        }
        return { delta, onSurfaceRaw: onSurfaceRaw.trim(), baseRaw: baseRaw.trim() };
      }
      const light = read();
      document.documentElement.classList.add("dark");
      const dark = read();
      document.documentElement.classList.remove("dark");
      return { light, dark };
    });
    record(
      themeDelta.light?.delta > 30 && themeDelta.dark?.delta > 30,
      `断言10 on-surface/10 两主题都明显（明 Δ=${themeDelta.light?.delta?.toFixed(0)} / 暗 Δ=${themeDelta.dark?.delta?.toFixed(0)} >30；旧 surface-raised/30 自叠加 ≈0）`,
    );
    // 断言 11：Apple 动态圆角（2026-08-10，inset grouped）。当前状态 = 全折叠（置顶 + proj1 折叠、
    // proj-empty 空）→ 3 个连续折叠 section 组圆角条带段：首行置顶 rounded-t-lg、末行 proj-empty
    // rounded-b-lg、中段 proj1 方角 + 段内 border-t 分割线、无间距。展开 proj1 后：proj1 脱离成独立
    // 圆角块（rounded-lg 四角），置顶/proj-empty 各成独立圆角块（上下圆），展开块与折叠段间 mt-2
    // 间距断开、无分割线（分割线不穿过展开块）。
    const strip = await apage.evaluate(() =>
      [...document.querySelectorAll('section[class*="bg-on-surface/10"]')].map((el) => {
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
      [...document.querySelectorAll('section[class*="bg-on-surface/10"]')].map((el) => {
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
