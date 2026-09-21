// M7 设置与登录探针（v2 M7：07 设置页五组 / 06 登录页完整态 / 退出登录）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1 07 设置 root：五组结构（.sect 组标题 ×4 + .sgroup ×4 + .logout）+ 值行内容
//     （外观/语言三态值、Claude/Pi 预设名、Firecrawl 已设置 ok 绿、自动重试真实默认值 3 次
//      60 秒 mono 文案、服务器 host mono）+ .setrow 几何 ≥44px + `.back` 返回文字「项目」。
//   Part 2 设置 detail：外观/语言行 → general detail（两个 SegmentedControl，语言三态）→
//     语言切 en → UI 文案变英文（真实语言切换）→ 切回中文；Claude 行 → claude detail；
//     `.back` 文字变「设置」→ 回 root。
//   Part 3 退出登录：点 .logout → useConfirm Alert（danger 红字 + 几何）→ 取消不登出 →
//     确认 → POST /api/auth/logout 恰 1 次 + 清 auth_ok + 回登录帧。
//   Part 4 06 登录页：密码错误 → 输入框 border-error 描红 + aria-invalid + 行内提示；
//     断网（auth/me 500）→ 错误帧 + 「重试连接」按钮 → 点后重试变成功进应用。
//
// 全 mock API（无真实数据创建/删除）；密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v2-m7-settings-auth.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";

let passCount = 0;
let failCount = 0;
function ok(cond, msg) {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${msg}`);
  } else {
    failCount++;
    console.error(`  ✗ ${msg}`);
  }
}

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

const SETTINGS = {
  settings: {
    runtimes: {
      claude: {
        presets: [
          {
            id: "p1",
            label: "Anthropic 官方",
            baseUrl: "https://api.anthropic.com",
            apiKeyMasked: "sk-ant-…abcd",
            modelMapping: { default: "sonnet", opus: "opus", sonnet: "sonnet", haiku: "haiku" },
          },
        ],
        activePresetId: "p1",
        enable1mContext: false,
        effort: "high",
      },
      pi: {
        presets: [
          {
            id: "pi1",
            label: "Pi 主预设",
            provider: "openai",
            model: "gpt-x",
            apiKeyMasked: "sk-…1234",
          },
        ],
        activePresetId: "pi1",
        firecrawlApiKeyMasked: "fc-…9xyz",
      },
      acp: {},
    },
    skills: { sources: [] },
  },
};

// 请求记录。
let logoutPosts = 0;
/** auth/me 首轮 500（模拟断网），点「重试连接」后转成功。 */
let authMeFail = false;
let authMeCalls = 0;
/** 登录态（auth/me 回显）：login 成功置 true、logout 置 false——真实登录帧流转。 */
let authed = false;
/** 登录密码错误一次（后续正确）——Part 4 描红断言用。 */
let loginShouldFail = false;
/** logout 500（失败路径）：行内错误提示 + 不清 auth_ok + 留在应用。 */
let logoutShouldFail = false;

async function setupMocks(page) {
  await page.route("**/api/projects", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill(json([{ name: "proj1", path: "/p/proj1" }]));
    return r.fulfill(json({ ok: true }));
  });
  await page.route("**/api/overview", (r) =>
    r.fulfill(json({ projectNames: ["proj1"], instances: [] })),
  );
  await page.route("**/api/settings", (r) => r.fulfill(json(SETTINGS)));
  await page.route("**/api/agent-providers", (r) => r.fulfill(json({ providers: [] })));
  await page.route("**/api/pi/providers", (r) => r.fulfill(json({ providers: [] })));
  await page.route("**/api/auth/me", (r) => {
    authMeCalls++;
    if (authMeFail) return r.fulfill(json({ error: { code: "X", message: "offline" } }, 500));
    return r.fulfill(json({ authenticated: authed }));
  });
  await page.route("**/api/auth/login", (r) => {
    if (loginShouldFail)
      return r.fulfill(json({ error: { code: "INVALID_PASSWORD", message: "密码错误" } }, 401));
    authed = true;
    return r.fulfill(
      json({ ok: true, token: "tok", expiresAt: new Date(Date.now() + 864e5).toISOString() }),
    );
  });
  await page.route("**/api/auth/logout", (r) => {
    logoutPosts++;
    if (logoutShouldFail) return r.fulfill(json({ error: { code: "X", message: "x" } }, 500));
    authed = false;
    return r.fulfill(json({ ok: true }));
  });
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN",
});
const page = await ctx.newPage();
await setupMocks(page);
await login(page);

// ── Part 1: 07 设置 root 五组 ──────────────────────────────────────────────
console.log("Part 1: 07 设置 root（五组结构 + 值行 + 几何）");
await page.goto(`${ORIGIN}/settings`);
await page.waitForSelector(".sgroup", { timeout: 10000 });
const sectTexts = await page.locator(".sect").allTextContents();
ok(
  sectTexts.length === 4,
  `.sect 组标题 = 4（通用/RUNTIME/自动重试/服务器；实际 ${sectTexts.length}）`,
);
ok(sectTexts[0] === "通用", "① 通用");
ok(sectTexts[1].includes("RUNTIME 预设"), "② RUNTIME 预设");
ok(sectTexts[2].includes("自动重试默认"), "③ 自动重试默认");
ok(sectTexts[3] === "服务器", "④ 服务器");
ok((await page.locator(".sgroup").count()) === 4, ".sgroup 组容器 = 4");
ok((await page.locator(".logout").count()) === 1, "退出登录钮 = 1");

// 值行：外观/语言三态值（默认跟随系统）+ Claude/Pi 预设名 + Firecrawl 已设置 + 自动重试真实默认值。
// 值文本统一去尾 ›（chevron 在 .v 内，07 原型同构）。
const stripAr = (s) => s.replace(/›\s*$/, "").trim();
const group1 = page.locator(".sgroup").nth(0);
ok((await group1.locator(".setrow").count()) === 2, "通用组 = 2 行（外观/语言）");
const g1v = (await group1.locator(".setrow .v").allTextContents()).map(stripAr);
ok(g1v[0] === "跟随系统" && g1v[1] === "跟随系统", "外观/语言默认值 = 跟随系统");
const group2 = page.locator(".sgroup").nth(1);
ok((await group2.locator(".setrow").count()) === 4, "RUNTIME 组 = 4 行（Claude/Pi/Firecrawl/ACP）");
const g2v = (await group2.locator(".setrow .v").allTextContents()).map(stripAr);
ok(g2v[0] === "Anthropic 官方", "Claude 行 = 激活预设名");
ok(g2v[1] === "Pi 主预设", "Pi 行 = 激活预设名");
ok(g2v[2] === "已设置", "Firecrawl 行 = 已设置");
ok(
  (await group2.locator(".setrow").nth(2).locator(".v").getAttribute("class"))?.includes("ok") ===
    true,
  "Firecrawl 已设置 = ok 绿",
);
ok(g2v[3] === "未配置", "ACP 行 = 未配置（mock acp 无凭据）");
const group3 = page.locator(".sgroup").nth(2);
const g3v = await group3.locator(".setrow .v").allTextContents();
const g3labels = await group3.locator(".setrow").allTextContents();
ok(g3labels[0].includes("次数上限"), `首行标签 = 次数上限（07 原型；实际「${g3labels[0]}」）`);
ok(g3v[0] === "3 次", `次数上限 = 真实默认 3 次（实际「${g3v[0]}」）`);
ok(g3v[1].includes("60 秒"), `重试间隔 = 真实默认 60 秒（实际「${g3v[1]}」）`);
ok(g3v[1].includes("30 分钟"), `重试间隔含真实窗口 30 分钟（实际「${g3v[1]}」）`);
ok(g3v[1].includes("指数退避") === false, "禁编造「指数退避」字样（无此机制）");
ok(
  (await group3.locator(".setrow").nth(2).locator(".v").getAttribute("class"))?.includes("mono") ===
    true,
  "重发文案 = mono 值",
);
ok(g3v[2].includes("请继续"), "重发文案含真实默认文案");
const group4 = page.locator(".sgroup").nth(3);
// `.ar` › chevron：可进 detail 的行（通用/RUNTIME）有，静态行（自动重试/PWA/host）无——07 原型。
ok((await group1.locator(".setrow .ar").count()) === 2, "通用组 2 行均带 › chevron");
ok((await group2.locator(".setrow .ar").count()) === 4, "RUNTIME 组 4 行均带 › chevron");
ok((await group3.locator(".setrow .ar").count()) === 0, "自动重试组静态行无 ›");
ok(
  (await group4.locator(".setrow .ar").count()) === 0,
  "服务器组静态行无 ›（多服务器不做，§6.8-4）",
);
ok(
  (await group4.locator(".setrow").nth(0).textContent())?.includes(
    ORIGIN.replace("http://", ""),
  ) === true,
  "服务器行 = 当前 host",
);
// 几何：.setrow 高 ≥44px；.logout 高 ≥44px。
const rowBox = await page.locator(".setrow").first().boundingBox();
ok(rowBox !== null && rowBox.height >= 44, `.setrow 几何高 ≥44px（实际 ${rowBox?.height}）`);
const logoutBox = await page.locator(".logout").boundingBox();
ok(logoutBox !== null && logoutBox.height >= 44, `.logout 几何高 ≥44px`);
// `.back` 设计语言：可见返回文字「项目」。
ok(
  (await page.locator("header .back").textContent()) === "项目",
  ".back 返回文字 = 项目（root 态）",
);
// 几何/样式硬数据（design review 建议补）：.sgroup 圆角/底/描边、.sect 字号与墨色、
// .logout 圆角与 danger 色、.back 主色 15px。
const sgStyle = await page
  .locator(".sgroup")
  .first()
  .evaluate((el) => {
    const s = getComputedStyle(el);
    return { radius: s.borderRadius, bg: s.backgroundColor, border: s.borderTopColor };
  });
ok(sgStyle.radius === "16px", `.sgroup radius 16px（实际 ${sgStyle.radius}）`);
ok(sgStyle.border !== "rgba(0, 0, 0, 0)", ".sgroup 有描边色（--sep）");
// P1-1 真根因断言：组卡片底必须与滚动容器底**不同**（同色则卡片隐形只剩描边）。
const scrollerBg = await page
  .locator(".sgroup")
  .first()
  .evaluate((el) => {
    const scroller = el.closest(".overflow-y-auto");
    return scroller ? getComputedStyle(scroller).backgroundColor : "none";
  });
ok(sgStyle.bg !== scrollerBg, `组卡片底 ≠ 页面底（卡片 ${sgStyle.bg} vs 底 ${scrollerBg}）`);
const sectStyle = await page
  .locator(".sect")
  .first()
  .evaluate((el) => {
    const s = getComputedStyle(el);
    return { size: s.fontSize, weight: s.fontWeight };
  });
ok(sectStyle.size === "12px", `.sect 字号 12px（实际 ${sectStyle.size}）`);
ok(sectStyle.weight === "600", ".sect 字重 600");
const logoutStyle = await page.locator(".logout").evaluate((el) => {
  const s = getComputedStyle(el);
  return { radius: s.borderRadius, color: s.color, weight: s.fontWeight, size: s.fontSize };
});
ok(logoutStyle.radius === "16px", ".logout radius 16px");
ok(logoutStyle.weight === "600", ".logout 字重 600");
ok(logoutStyle.size === "14.5px", ".logout 字号 14.5px");
const dangerHex = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--c-danger").trim(),
);
ok(logoutStyle.color !== "rgb(0, 0, 0)", `.logout 红字有实色（--c-danger=${dangerHex}）`);
const backStyle = await page.locator("header .back").evaluate((el) => {
  const s = getComputedStyle(el);
  const before = getComputedStyle(el, "::before");
  return { size: s.fontSize, color: s.color, chevron: before.borderLeftWidth };
});
ok(backStyle.size === "15px", `.back 字号 15px（实际 ${backStyle.size}）`);
ok(
  Number.parseFloat(backStyle.chevron) >= 2,
  `.back ::before chevron ≥2px（CSS 2.2px，浏览器取整报 ${backStyle.chevron}）`,
);

// ── Part 2: 设置 detail（general 语言三态 + claude） ────────────────────────
console.log("Part 2: 设置 detail（通用语言三态真实切换 + back 文字）");
await group1.locator(".setrow").nth(1).click();
await page.waitForTimeout(500);
const segs = page.locator('[role="group"]');
ok((await segs.count()) >= 2, "general detail = 外观 + 语言两个 SegmentedControl");
ok(
  (await page.locator("header .back").textContent()) === "设置",
  ".back 返回文字 = 设置（detail 态）",
);
ok((await page.getByText("语言").count()) >= 1, "语言段标题可见");
// 语言三态：切 English → UI 文案变英文（真实切换，非仅状态）。
const langSeg = page.locator('[aria-label="语言"][role="group"]');
ok((await langSeg.locator("button").count()) === 3, "语言分段 = 3 态（跟随系统/中文/English）");
await langSeg.locator("button", { hasText: "English" }).click();
await page.waitForTimeout(400);
ok((await page.getByText("Language").count()) >= 1, "切 English 后文案变英文（真实语言切换）");
// 切回中文（localStorage 已写 en；显式切回）。
await page.locator('[aria-label="Language"][role="group"] button', { hasText: "中文" }).click();
await page.waitForTimeout(400);
ok((await page.getByText("语言").count()) >= 1, "切回中文生效");
// 回 root → 点 Claude 行进 claude detail。
await page.locator("header .back").click();
await page.waitForTimeout(500);
await page.locator(".sgroup").nth(1).locator(".setrow").nth(0).click();
await page.waitForTimeout(500);
ok(
  (await page.locator("header .nv-t").textContent()) === "Claude 运行时",
  "Claude 行 → claude detail（标题 = Claude 运行时）",
);
await page.locator("header .back").click();
await page.waitForTimeout(400);

// ── Part 3: 退出登录（确认 Alert + API 调用） ───────────────────────────────
console.log("Part 3: 退出登录（useConfirm Alert → POST /api/auth/logout）");
await page.locator(".logout").click();
await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 5000 });
ok(
  (await page.locator('[data-slot="dialog-content"] h2').textContent())?.includes("退出登录") ===
    true,
  "退出确认 Alert 标题",
);
const confirmBtn = page
  .locator('[data-slot="dialog-content"] button', { hasText: "退出登录" })
  .first();
ok(
  (await confirmBtn.getAttribute("class"))?.includes("text-error") === true,
  "Alert 确认钮红字（destructive）",
);
ok(
  (await page.locator('[data-slot="dialog-content"]').textContent())?.includes("服务端数据") ===
    true,
  "Alert 文案说明「服务端数据不受影响」",
);
// 取消：不登出。
await page.locator('[data-slot="dialog-content"] button', { hasText: "取消" }).click();
await page.waitForTimeout(700);
ok(logoutPosts === 0, "取消后未调 logout API");
ok(page.url().endsWith("/settings"), "取消后仍在设置页");
// 失败路径（security review P2）：登出 API 500 → 行内错误提示 + 不清 auth_ok + 留在应用。
logoutShouldFail = true;
await page.locator(".logout").click();
await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 5000 });
await page.locator('[data-slot="dialog-content"] button', { hasText: "退出登录" }).first().click();
await page.waitForTimeout(1200);
ok((await page.getByText("退出登录失败").count()) === 1, "登出失败: 行内错误提示可见");
ok(
  (await page.evaluate(() => localStorage.getItem("auth_ok"))) !== null,
  "登出失败: 保留 auth_ok（不清免登标记）",
);
ok((await page.locator(".logout").count()) === 1, "登出失败: 留在设置页（未回登录帧）");
logoutShouldFail = false;

// 确认：调 API + 回登录帧。
await page.locator(".logout").click();
await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 5000 });
await page.locator('[data-slot="dialog-content"] button', { hasText: "退出登录" }).first().click();
await page.waitForTimeout(1200);
ok(logoutPosts === 2, `POST /api/auth/logout 失败+成功共 2 次（实际 ${logoutPosts}）`);
ok((await page.locator('input[type="password"]').count()) === 1, "登出后回登录帧（密码框可见）");
ok(
  (await page.evaluate(() => localStorage.getItem("auth_ok"))) === null,
  "登出清 auth_ok 免登标记",
);

// ── Part 4: 06 登录页完整态（描红 + 断网重试） ──────────────────────────────
console.log("Part 4: 06 登录页（密码描红 + 断网重试连接）");
loginShouldFail = true;
await page.getByLabel("访问密码").fill("wrong-password");
await page.getByRole("button", { name: "登录" }).click();
await page.waitForTimeout(900);
const pwInput = page.locator('input[type="password"]');
ok((await pwInput.getAttribute("aria-invalid")) === "true", "密码错: aria-invalid=true");
ok(
  (await pwInput.getAttribute("class"))?.includes("border-error") === true,
  "密码错: 输入框 border-error 描红",
);
ok((await page.getByText("登录失败").count()) >= 1, "密码错: 行内提示可见（客户端 i18n 文案）");
// 断网：auth/me 500 → **保留登录帧**、主按钮换「重试连接」（spec §3.1，非独立错误帧）。
loginShouldFail = false;
authMeFail = true;
const beforeRetry = authMeCalls;
await page.reload();
await page.waitForTimeout(1500);
const retryBtn = page.getByRole("button", { name: "重试连接" });
ok((await retryBtn.count()) === 1, "断网: 「重试连接」按钮出现");
ok((await page.getByText("无法验证访问权限").count()) === 1, "断网: 错误说明文案可见");
ok(
  (await page.locator('input[type="password"]').count()) === 1,
  "断网: 密码框仍在（登录帧保留，非独立错误帧）",
);
// 点重试前先放开 mock，验证重试真的恢复应用（非死页）。
authMeFail = false;
await retryBtn.click();
await page.waitForTimeout(1500);
ok(authMeCalls > beforeRetry, "点重试触发 auth/me 重查");
// 重试成功（authed=false → 正常登录帧）：重试按钮消失、回主按钮。
ok(
  (await page.getByRole("button", { name: "重试连接" }).count()) === 0,
  "重试成功后「重试连接」消失（回主按钮）",
);
ok((await page.getByRole("button", { name: "登录" }).count()) === 1, "重试成功后回登录主按钮");

// ── 汇总 ───────────────────────────────────────────────────────────────────
console.log(`\n${passCount} pass, ${failCount} fail`);
await browser.close();
process.exit(failCount > 0 ? 1 : 0);
