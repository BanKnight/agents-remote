// 探针：移动端 /skills 管理列表滚动区底部 padding 避让一级底部胶囊。
// 根因：SkillsPanel 滚动容器漏消费 --shell-mobile-bottom-nav-space（文件/项目总览已有，技能页漏）。
// 断言：scroll.paddingBottom ≈ nav.height（容差 2px）；scroll 内容底不被 nav 盖住。
// 密码自读，不进 agent 上下文、不打印值。
// 用法：node scripts/probe-skills-bottom-nav-space.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";

async function setupMocks(page) {
  // /skills 只需 overview 让登录后导航不炸；技能列表走真实 API 或空态均可测 padding。
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  // 装一堆假 skill，让 Manage 列表够长、能滚到底（验证 padding 真正顶开内容）。
  const skills = Array.from({ length: 20 }, (_, i) => ({
    name: `probe-skill-${i + 1}`,
    path: `~/.claude/skills/probe-skill-${i + 1}`,
    agent: "claude-code",
  }));
  await page.route(new RegExp("/api/skills/installed"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ skills }),
    }),
  );
  await page.route(new RegExp("/api/skills"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ skills: [] }),
    }),
  );
}

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await setupMocks(page);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.getByLabel("Password").fill(await readAppPassword());
    await page.getByRole("button", { name: "Unlock console" }).click();
    await page.goto(`${WEB_ORIGIN}/skills`);
    // 切到管理 tab（中文/英文 label 兼容）。
    const manageTab = page
      .getByRole("tab", { name: /管理|Manage/i })
      .or(page.getByRole("button", { name: /管理|Manage/i }))
      .or(page.getByText(/管理|Manage/i).first());
    await manageTab
      .first()
      .click({ timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    const m = await page.evaluate(() => {
      // 一级底部胶囊：MobilePrimaryNav 的 nav.absolute.inset-x-0.bottom-0
      const bottomNav =
        document.querySelector("nav.absolute.inset-x-0.bottom-0") ||
        document.querySelector("nav.absolute.bottom-0") ||
        Array.from(document.querySelectorAll("nav")).find((n) => {
          const s = getComputedStyle(n);
          return s.position === "absolute" && s.bottom === "0px";
        });
      // SkillsPanel 滚动容器：overflow-y-auto + 含 bottom-nav-space 的 pb
      const scroll = Array.from(document.querySelectorAll("div")).find((el) => {
        const s = getComputedStyle(el);
        return (
          (s.overflowY === "auto" || s.overflowY === "scroll") &&
          el.className.includes("overflow-y-auto") &&
          el.className.includes("flex-1")
        );
      });
      if (!bottomNav) return { error: "一级底部 nav 未找到" };
      if (!scroll) return { error: "SkillsPanel 滚动容器未找到" };
      const navBox = bottomNav.getBoundingClientRect();
      const scrollBox = scroll.getBoundingClientRect();
      const pb = parseFloat(getComputedStyle(scroll).paddingBottom) || 0;
      const cssVar = getComputedStyle(document.querySelector("main") || document.documentElement)
        .getPropertyValue("--shell-mobile-bottom-nav-space")
        .trim();
      return {
        navHeight: Math.round(navBox.height * 10) / 10,
        navTop: Math.round(navBox.top * 10) / 10,
        scrollPaddingBottom: Math.round(pb * 10) / 10,
        scrollBottom: Math.round(scrollBox.bottom * 10) / 10,
        cssVar,
        scrollClassHasVar: scroll.className.includes("shell-mobile-bottom-nav-space"),
      };
    });

    if (m.error) {
      console.log(`✗ ${m.error}`);
      process.exit(1);
    }
    console.log(
      `nav.h=${m.navHeight} nav.top=${m.navTop} scroll.pb=${m.scrollPaddingBottom} cssVar=${m.cssVar} classHasVar=${m.scrollClassHasVar}`,
    );
    // pb 应接近 nav 高度（≥ nav.h - 2，允许亚像素/安全区舍入）。
    const pbOk = m.scrollPaddingBottom >= m.navHeight - 2 && m.scrollPaddingBottom > 20;
    const varOk = m.scrollClassHasVar === true;
    console.log(
      `${pbOk ? "✓" : "✗"} scroll.paddingBottom(${m.scrollPaddingBottom}) ≥ nav.h(${m.navHeight})-2 且 >20`,
    );
    console.log(`${varOk ? "✓" : "✗"} 滚动容器 class 含 shell-mobile-bottom-nav-space`);
    const allPass = pbOk && varOk;
    console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
    process.exit(allPass ? 0 : 1);
  } finally {
    await browser.close();
  }
})();
