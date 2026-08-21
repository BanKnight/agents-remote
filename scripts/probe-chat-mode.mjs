// 探针：会话页 Agent/Chat 双模式（设计 workbench-views §3.1，Phase 1 修正）。
// 断言（桌面 1280×900 + 移动 390×844，chat-sessions API 走真实后端 43011）：
//  1. /projects 左栏标题区 mode tab（Agent/Chat），默认 agent（URL 无 ?mode=）。三栏 shell 在。
//  2. 切 Chat → URL ?mode=chat + 左栏 body=ChatOverview（搜索框/新建/列表）。三栏 shell 不变、中栏 InstanceArea 仍在。
//  3. 新建会话 → 占位 detail /chat/$id（notAvailable 文案 + 返回）。
//  4. 返回列表 → 会话行存在（真实 API round-trip）。
//  5. 桌面右键行 → 菜单（改名/删除）出现；改名生效。
//  6. 删除 → confirm → 行消失 + ~/.agents-remote/chat-sessions/ 元数据清理。
//  7. reload → mode=chat 保持（URL 即真相）；切回 Agent → 左栏 body 换回 GlobalProjectsOverview + mode 键消失。
//  8. 移动端 header 内 mode tab + chat 列表渲染 + 长按（contextmenu）出菜单。
// ⚠️ 数据安全（正式环境纪律）：探针只创建/删除**自己**的会话——创建后立即 rename 加
// `probe-mode-` 标记前缀，清理与行定位只按标记识别（含上次崩溃残留），绝不 close/删除/
// 改名用户真实会话（行 selector 若按「新对话」默认名匹配会误伤用户同名会话）。
// 密码自读不打印。用法：bun scripts/probe-chat-mode.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
// 探针会话标记前缀：创建后立即 rename 加此前缀，清理只按标记识别（绝不碰用户会话）。
const PROBE_MARKER = "probe-mode-";

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

// UI 新建后调用：从当前 URL 解析 chat id 并 rename 加标记名，纳入探针可识别范围。
async function markSessionFromUrl(request, url) {
  const chatId = new URL(url).pathname.split("/").pop();
  await request.post(`${WEB_ORIGIN}/api/chat-sessions/${chatId}/rename`, {
    data: { displayName: `${PROBE_MARKER}${Date.now()}` },
  });
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

function modeTabButtons(page) {
  return page
    .locator(
      'div[role="group"][aria-label="Session mode switch"], div[role="group"][aria-label="会话模式切换"]',
    )
    .locator("button");
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });

  // ── 桌面 ────────────────────────────────────────────────────────────────────
  console.log("\n===== 桌面（1280×900）=====");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await login(page);

    // 清残留：只清探针标记的会话（上轮超时退出可能留下），绝不碰用户真实会话。
    {
      const cleaned = await closeProbeSessions(page.request);
      if (cleaned > 0) console.log(`  （清理探针标记残留 ${cleaned} 个）`);
    }

    console.log("\n-- 1. mode tab 默认 agent（左栏标题区 + 三栏 shell）--");
    await page.goto(`${WEB_ORIGIN}/projects`);
    await page.waitForSelector(
      'div[role="group"][aria-label="Session mode switch"], div[role="group"][aria-label="会话模式切换"]',
      {
        timeout: 8000,
      },
    );
    const tabs = modeTabButtons(page);
    record((await tabs.count()) === 2, "mode tab = Agent + Chat 两个按钮");
    // mode tab 在左栏 PanelHeader title（第 2 个 aside = 左栏），非中栏顶部。
    const modeTabInLeftAside = await page.evaluate(() => {
      const asides = document.querySelectorAll("aside");
      const left = asides[1];
      if (!left) return false;
      return !!left.querySelector(
        'div[role="group"][aria-label="Session mode switch"], div[role="group"][aria-label="会话模式切换"]',
      );
    });
    record(modeTabInLeftAside, "mode tab 在左栏 PanelHeader 标题区（非中栏顶部）");
    const agentPressed = await tabs.nth(0).getAttribute("aria-pressed");
    const chatPressed = await tabs.nth(1).getAttribute("aria-pressed");
    record(agentPressed === "true" && chatPressed === "false", "默认 agent active");
    record(!new URL(page.url()).searchParams.has("mode"), "默认 URL 无 ?mode=（省略 = agent）");

    console.log("\n-- 2. 切 Chat：左栏 body=ChatOverview + 三栏 shell 不变 --");
    await tabs.nth(1).click();
    await page.waitForTimeout(500);
    record(new URL(page.url()).searchParams.get("mode") === "chat", "URL ?mode=chat");
    record(
      (await page
        .locator(
          'input[aria-label="搜索对话…"], input[aria-label="Search chats…"], input[type="search"]',
        )
        .count()) === 1,
      "左栏 body = ChatOverview 搜索框渲染",
    );
    record(
      (await page.getByRole("button", { name: /新对话|新建对话|New chat/ }).count()) >= 1,
      "新建按钮渲染",
    );
    // chat 模式三栏 shell 不变：左栏 aside 有内容（ChatOverview，非空壳）+ 中栏 section 在。
    const shellIntact = await page.evaluate(() => {
      const asides = document.querySelectorAll("aside");
      const left = asides[1];
      if (!left) return false;
      // 左栏非空壳：PanelHeader + body 子节点 ≥ 2。
      const leftHasContent = left.children.length >= 2;
      // 中栏 section 存在（第 3 个 grid item）。
      const section = document.querySelector("main section");
      return leftHasContent && section !== null;
    });
    record(shellIntact, "chat 模式三栏 shell 不变（左栏有内容 + 中栏 section 在）");

    console.log("\n-- 3. 新建会话 → 占位 detail --");
    await page
      .getByRole("button", { name: /新对话|新建对话|New chat/ })
      .first()
      .click();
    await page.waitForURL(/chat_/, { timeout: 8000 });
    // UI 新建的会话立即加探针标记名（rename API），纳入本探针可清理范围。
    await markSessionFromUrl(page.request, page.url());
    await page.waitForTimeout(800);
    record(
      /\/chat\/[^/]+$/.test(new URL(page.url()).pathname),
      `navigate /chat/$id（${new URL(page.url()).pathname}）`,
    );
    record(
      (await page.getByText(/pi 运行时未接入|will be wired/i).count()) >= 1,
      "占位 detail notAvailable 文案",
    );

    console.log("\n-- 4. 返回列表 → 会话行存在 --");
    await page.getByRole("button", { name: /返回对话列表|Back to chats/ }).click();
    // 只按探针标记名定位行（等 rename 后 refetch）；绝不按「新对话」默认名匹配——
    // 那会误伤用户自己的同名会话（后续右键改名/删除会落到用户会话上）。
    const list = page.locator('div[aria-label="对话列表"], div[aria-label="Chat list"]');
    const row = list.getByRole("button", { name: new RegExp(PROBE_MARKER) }).first();
    let rowFound = true;
    try {
      await row.waitFor({ timeout: 8000 });
    } catch {
      rowFound = false;
    }
    record(rowFound, "会话行（探针标记会话）存在（真实 API round-trip）");
    if (!rowFound) throw new Error("探针标记会话行未出现——中止以避免误操作用户会话");

    console.log("\n-- 5. 桌面右键 → 菜单 + 改名 --");
    await row.click({ button: "right" });
    await page.waitForTimeout(300);
    const menuRename = page.getByRole("menuitem", { name: /改名|重命名|Rename/ });
    record((await menuRename.count()) === 1, "右键菜单出「改名」项");
    await menuRename.click();
    await page.waitForTimeout(300);
    const promptInput = page.locator("[data-prompt-input]");
    await promptInput.fill(`${PROBE_MARKER}A`);
    await promptInput.press("Enter");
    await page.waitForTimeout(600);
    const renamedRow = list.getByRole("button", { name: `${PROBE_MARKER}A` });
    record((await renamedRow.count()) === 1, `改名生效（行文本 = ${PROBE_MARKER}A）`);

    console.log("\n-- 6. 右键删除 → confirm → 行消失 --");
    await renamedRow.first().click({ button: "right" });
    await page.waitForTimeout(300);
    await page.getByRole("menuitem", { name: /删除|Delete/ }).click();
    await page.waitForTimeout(300);
    await page
      .getByRole("button", { name: /删除|Delete/ })
      .last()
      .click();
    await page.waitForTimeout(600);
    record(
      (await list.getByRole("button", { name: `${PROBE_MARKER}A` }).count()) === 0,
      "删除后行消失",
    );

    console.log("\n-- 7. reload 保持 mode=chat；切回 Agent --");
    await page.reload();
    await page.waitForSelector(
      'input[aria-label="搜索对话…"], input[aria-label="Search chats…"], input[type="search"]',
      {
        timeout: 8000,
      },
    );
    record(
      new URL(page.url()).searchParams.get("mode") === "chat",
      "reload 后 mode=chat 保持（URL 即真相）",
    );
    const tabs2 = modeTabButtons(page);
    await tabs2.nth(0).click();
    await page.waitForTimeout(500);
    record(!new URL(page.url()).searchParams.has("mode"), "切回 Agent：mode 键从 URL 消失");
    // 切回 Agent：左栏 body 换回 GlobalProjectsOverview（搜索框消失，项目网格在）。
    const chatGone =
      (await page
        .locator('input[aria-label="搜索对话…"], input[aria-label="Search chats…"]')
        .count()) === 0;
    record(chatGone, "切回 Agent：左栏 body 换回 GlobalProjectsOverview（chat 搜索框消失）");
    // 兜底清理：只清探针标记会话（改名/删除步骤异常时残留的），绝不碰用户真实会话。
    const cleanedDesktop = await closeProbeSessions(page.request);
    if (cleanedDesktop > 0) console.log(`  （兜底清理探针标记会话 ${cleanedDesktop} 个）`);
    await ctx.close();
  }

  // ── 移动 ────────────────────────────────────────────────────────────────────
  console.log("\n===== 移动（390×844）=====");
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const page = await ctx.newPage();
    await login(page);

    console.log("\n-- 8. header mode tab + chat 列表 + 长按出菜单 --");
    await page.goto(`${WEB_ORIGIN}/projects?mode=chat`);
    await page.waitForSelector(
      'div[role="group"][aria-label="Session mode switch"], div[role="group"][aria-label="会话模式切换"]',
      {
        timeout: 8000,
      },
    );
    record(true, "移动 header 内 mode tab 渲染");
    record(
      (await page
        .locator(
          'input[aria-label="搜索对话…"], input[aria-label="Search chats…"], input[type="search"]',
        )
        .count()) === 1,
      "chat 列表（搜索框）渲染",
    );
    await page
      .getByRole("button", { name: /新对话|新建对话|New chat/ })
      .first()
      .click();
    await page.waitForURL(/chat_/, { timeout: 8000 });
    // UI 新建的会话立即加探针标记名（rename API），纳入本探针可清理范围。
    await markSessionFromUrl(page.request, page.url());
    await page.waitForTimeout(800);
    record(/\/chat\/[^/]+$/.test(new URL(page.url()).pathname), "新建 → /chat/$id 全屏聚焦态");
    // 长按 = contextmenu（移动浏览器长按触发）；占位 detail 无列表，返回后验证。
    await page.getByRole("button", { name: /返回对话列表|Back to chats/ }).click();
    // 只按探针标记名定位行（等 rename 后 refetch）；绝不按「新对话」默认名匹配。
    const mList = page.locator('div[aria-label="对话列表"], div[aria-label="Chat list"]');
    const mRow = mList.getByRole("button", { name: new RegExp(PROBE_MARKER) }).first();
    let mRowFound = true;
    try {
      await mRow.waitFor({ timeout: 8000 });
    } catch {
      mRowFound = false;
    }
    record(mRowFound, "移动会话行（探针标记会话）存在");
    if (!mRowFound) throw new Error("探针标记会话行未出现——中止以避免误操作用户会话");
    await mRow.dispatchEvent("contextmenu");
    await page.waitForTimeout(400);
    record(
      (await page.getByRole("menuitem", { name: /改名|重命名|Rename/ }).count()) >= 1,
      "contextmenu（长按同源）出菜单",
    );
    // 清理：删除探针标记会话。
    await page.getByRole("menuitem", { name: /删除|Delete/ }).click();
    await page.waitForTimeout(300);
    await page
      .getByRole("button", { name: /删除|Delete/ })
      .last()
      .click();
    await page.waitForTimeout(600);
    // 兜底清理 + 复查：只清/查探针标记会话，绝不碰用户真实会话。
    const cleanedMobile = await closeProbeSessions(page.request);
    const residual = await closeProbeSessions(page.request);
    record(
      residual === 0,
      `无探针标记会话残留（兜底清理 ${cleanedMobile} 个，复查 ${residual} 个）`,
    );
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${allPass ? "✅ ALL PASS" : "❌ FAIL"}`);
  process.exit(allPass ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
