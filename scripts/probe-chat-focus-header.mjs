// 探针：会话页语境与中栏聚焦解耦（workbench-views §3.1 mode tab 常驻 + stickyWorkbenchSearch
// 粘性透传）。回归背景：sessionPage 曾要求 focusId===undefined，任何中栏 tab 聚焦（chat/file/
// agent session）都使左栏标题从 SessionModeTabs 回退「会话」文案、chat 模式左栏 body 掉回项目
// 总览；且 navigate 调用点手抄 search 合并漏 mode，点中栏 tab 后 mode 从 URL 丢失。
// 断言（桌面 1280×900，chat-sessions API 走真实后端 43011）：
//  1. /projects?mode=chat 前置态：mode tab 在左栏标题区 + ChatOverview 搜索框在。
//  2. 新建会话 → 中栏聚焦（URL /projects/session/chat_*?mode=chat）：mode tab 仍在左栏 +
//     搜索框仍在（body 未掉回项目总览）+ 中栏 chat composer 渲染。
//  3. 点 Agent tab → 回列表态：mode 键消失、搜索框消失（项目总览）、mode tab 仍在。
//  4. 切回 Chat → 点已有会话行聚焦：mode tab + 搜索框仍保持（行点击路径同断言）。
//  5. chat 模式 + file tab 聚焦（/files/file/...?mode=chat）：mode tab + ChatOverview 保持。
//  6. agent 模式聚焦态（/projects/session/agent_*）：mode tab 常驻（agent 高亮），左栏项目总览。
// ⚠️ 数据安全（正式环境纪律）：探针只创建/删除**自己**的会话——创建后立即 rename 加
// `probe-focus-` 标记前缀，清理只按标记识别（含上次崩溃残留），绝不 close/删除用户真实会话。
// 密码自读不打印。用法：bun scripts/probe-chat-focus-header.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
// 探针会话标记前缀：创建后立即 rename 加此前缀，清理只按标记识别（绝不碰用户会话）。
const PROBE_MARKER = "probe-focus-";

// 清理探针标记的会话（含上次崩溃残留）；返回清理数。只按 displayName 标记识别。
async function closeProbeSessions(request) {
  const res = await request.get(`${WEB_ORIGIN}/api/chat-sessions`);
  if (!res.ok()) return 0;
  const { sessions } = await res.json();
  let n = 0;
  for (const sess of sessions) {
    if (!sess.displayName.startsWith(PROBE_MARKER)) continue;
    await request.post(`${WEB_ORIGIN}/api/chat-sessions/${sess.id}/close`);
    n += 1;
  }
  return n;
}

// 新建会话立即加标记名（rename API），纳入探针可识别范围。
async function markSessionFromUrl(request, url) {
  const chatId = new URL(url).pathname.split("/").pop();
  await request.post(`${WEB_ORIGIN}/api/chat-sessions/${chatId}/rename`, {
    data: { displayName: `${PROBE_MARKER}${Date.now()}` },
  });
}

const MODE_TAB_GROUP =
  'div[role="group"][aria-label="Session mode switch"], div[role="group"][aria-label="会话模式切换"]';
const SEARCH_BOX =
  'input[aria-label="搜索对话…"], input[aria-label="Search chats…"], input[type="search"]';
const CHAT_COMPOSER =
  'textarea[placeholder="向 Claude 提问..."], textarea[placeholder="Ask Claude..."]';

// ⚠️ MODE_TAB_GROUP 是逗号 selector list，`${MODE_TAB_GROUP} button` 的后缀只作用于最后一个
// selector（匹配到 group div 本身而非按钮）。必须链式 .locator("button") 收窄。
function modeTabButtons(page) {
  return page.locator(MODE_TAB_GROUP).locator("button");
}

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /解锁|Unlock/ }).click();
  await page.waitForTimeout(700);
}

// 左栏 = 第 2 个 aside（index 1，活动栏之后）。
async function modeTabInLeftAside(page) {
  return page.evaluate((sel) => {
    const left = document.querySelectorAll("aside")[1];
    return !!left && !!left.querySelector(sel);
  }, MODE_TAB_GROUP);
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page);

  // 清残留：只清探针标记的会话（上轮超时退出可能留下），绝不碰用户真实会话。
  {
    const cleaned = await closeProbeSessions(page.request);
    if (cleaned > 0) console.log(`  （清理探针标记残留 ${cleaned} 个）`);
  }

  console.log("\n-- 1. 前置态：/projects?mode=chat 列表态 --");
  await page.goto(`${WEB_ORIGIN}/projects?mode=chat`);
  await page.waitForSelector(MODE_TAB_GROUP, { timeout: 8000 });
  record(await modeTabInLeftAside(page), "mode tab 在左栏标题区");
  record((await page.locator(SEARCH_BOX).count()) === 1, "ChatOverview 搜索框渲染");

  console.log("\n-- 2. 新建会话 → 中栏聚焦：mode tab + ChatOverview 保持（核心回归）--");
  await page
    .getByRole("button", { name: /新对话|新建对话|New chat/ })
    .first()
    .click();
  await page.waitForURL(/\/projects\/session\/chat_/, { timeout: 8000 });
  // UI 新建的会话立即加探针标记名（rename API），纳入本探针可清理范围。
  await markSessionFromUrl(page.request, page.url());
  record(
    /\/projects\/session\/chat_[^/?]+/.test(new URL(page.url()).pathname),
    `URL 聚焦 chat tab（${new URL(page.url()).pathname}）`,
  );
  record(new URL(page.url()).searchParams.get("mode") === "chat", "URL ?mode=chat 保持");
  record(await modeTabInLeftAside(page), "聚焦后 mode tab 仍在左栏标题区（不回退「会话」标题）");
  record(
    (await page.locator(SEARCH_BOX).count()) === 1,
    "聚焦后左栏 body 仍 ChatOverview（不掉回项目总览）",
  );
  await page.waitForSelector(CHAT_COMPOSER, { timeout: 8000 });
  record(true, "中栏 chat composer 渲染（embedded ChatSessionDetailBody）");

  console.log("\n-- 3. 点 Agent tab → 回列表态 --");
  await modeTabButtons(page).nth(0).click();
  await page.waitForTimeout(600);
  record(
    /\/projects\/?$/.test(new URL(page.url()).pathname) &&
      !new URL(page.url()).searchParams.has("mode"),
    `回列表态（${new URL(page.url()).pathname}${new URL(page.url()).search}）`,
  );
  record(
    (await page.locator(SEARCH_BOX).count()) === 0,
    "Agent 模式左栏 body 换回项目总览（搜索框消失）",
  );
  record(await modeTabInLeftAside(page), "mode tab 仍在");

  console.log("\n-- 4. 切回 Chat → 点会话行聚焦：同断言保持 --");
  await modeTabButtons(page).nth(1).click();
  await page.waitForSelector(SEARCH_BOX, { timeout: 8000 });
  // 行名 = 探针标记名（场景 2 rename 过；refetch 未及时完成时兼容旧默认名）。
  const row = page
    .locator('div[aria-label="对话列表"], div[aria-label="Chat list"]')
    .getByRole("button", { name: new RegExp(`${PROBE_MARKER}|新对话|新建对话|New chat`) })
    .first();
  record((await row.count()) === 1, "会话行存在（探针标记会话在列表）");
  await row.click();
  await page.waitForURL(/\/projects\/session\/chat_/, { timeout: 8000 });
  record(await modeTabInLeftAside(page), "行点击聚焦后 mode tab 仍在左栏标题区");
  record((await page.locator(SEARCH_BOX).count()) === 1, "行点击聚焦后左栏 body 仍 ChatOverview");

  console.log("\n-- 5. chat 模式 + file tab 聚焦：mode tab + ChatOverview 保持（架构回归）--");
  // 直接 goto file focus URL（focus effect 据 focusId 开 file tab）。leftMode 继承缺省 auto +
  // mode=chat → 会话页语境应保持（sessionPage 与 focusId 解耦，stickyWorkbenchSearch 透传 mode）。
  await page.goto(`${WEB_ORIGIN}/files/file/agents-remote/package.json?mode=chat`);
  await page.waitForSelector(MODE_TAB_GROUP, { timeout: 8000 });
  record(
    /\/files\/file\//.test(new URL(page.url()).pathname),
    `file focus URL（${new URL(page.url()).pathname}）`,
  );
  record(await modeTabInLeftAside(page), "file 聚焦后 mode tab 仍在左栏标题区");
  record((await page.locator(SEARCH_BOX).count()) === 1, "file 聚焦后左栏 body 仍 ChatOverview");

  console.log("\n-- 6. agent 模式聚焦态：mode tab 常驻（原「会话」标题回归）--");
  // agent session focus（focusId 非 chat_）→ mode tab 应保持（agent 高亮），不掉回「会话」文案。
  await page.goto(`${WEB_ORIGIN}/projects/session/agent_probe_focus`);
  await page.waitForSelector(MODE_TAB_GROUP, { timeout: 8000 });
  record(await modeTabInLeftAside(page), "agent 聚焦后 mode tab 仍在左栏标题区");
  record(
    (await page.locator(SEARCH_BOX).count()) === 0,
    "agent 聚焦左栏 body = 项目总览（agent 模式语义）",
  );

  // 清理：只 close 探针标记的会话（绝不碰用户真实会话），并复查无标记残留。
  const cleanedEnd = await closeProbeSessions(page.request);
  console.log("\n===== 探针残留复查 =====");
  const residual = await closeProbeSessions(page.request);
  record(residual === 0, `无探针标记会话残留（本轮清理 ${cleanedEnd} 个，复查 ${residual} 个）`);
  await ctx.close();

  await browser.close();
  console.log(`\n${allPass ? "✅ ALL PASS" : "❌ FAIL"}`);
  process.exit(allPass ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
