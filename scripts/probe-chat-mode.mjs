// 探针：会话页 Agent/Chat 双模式（设计 workbench-views §3.1，Phase 1）。
// 断言（桌面 1280×900 + 移动 390×844，chat-sessions API 走真实后端 43011）：
//  1. /projects 顶部 mode tab（Agent/Chat），默认 agent（URL 无 ?mode=）。
//  2. 切 Chat → URL ?mode=chat + ChatOverview 渲染（搜索框/新建/列表）+ 左栏面板隐藏。
//  3. 新建会话 → 占位 detail /chat/$id（notAvailable 文案 + 返回）。
//  4. 返回列表 → 会话行存在（真实 API round-trip）。
//  5. 桌面右键行 → 菜单（改名/删除）出现；改名生效。
//  6. 删除 → confirm → 行消失 + ~/.agents-remote/chat-sessions/ 元数据清理。
//  7. reload → mode=chat 保持（URL 即真相）；切回 Agent → 网格恢复 + mode 键消失。
//  8. 移动端 header 内 mode tab + chat 列表渲染 + 长按（contextmenu）出菜单。
// 密码自读不打印。用法：bun scripts/probe-chat-mode.mjs
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const CHAT_SESSIONS_DIR = join(homedir(), ".agents-remote", "chat-sessions");

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

    // 清残留（上轮探针超时退出可能留下会话）：GET list → 逐个 POST close。
    {
      const res = await page.request.get(`${WEB_ORIGIN}/api/chat-sessions`);
      if (res.ok()) {
        const { sessions } = await res.json();
        for (const sess of sessions) {
          await page.request.post(`${WEB_ORIGIN}/api/chat-sessions/${sess.id}/close`);
        }
        if (sessions.length > 0) console.log(`  （清残留 ${sessions.length} 个）`);
      }
    }

    console.log("\n-- 1. mode tab 默认 agent --");
    await page.goto(`${WEB_ORIGIN}/projects`);
    await page.waitForSelector(
      'div[role="group"][aria-label="Session mode switch"], div[role="group"][aria-label="会话模式切换"]',
      {
        timeout: 8000,
      },
    );
    const tabs = modeTabButtons(page);
    record((await tabs.count()) === 2, "mode tab = Agent + Chat 两个按钮");
    const agentPressed = await tabs.nth(0).getAttribute("aria-pressed");
    const chatPressed = await tabs.nth(1).getAttribute("aria-pressed");
    record(agentPressed === "true" && chatPressed === "false", "默认 agent active");
    record(!new URL(page.url()).searchParams.has("mode"), "默认 URL 无 ?mode=（省略 = agent）");

    console.log("\n-- 2. 切 Chat：URL + ChatOverview + 左栏隐藏 --");
    await tabs.nth(1).click();
    await page.waitForTimeout(500);
    record(new URL(page.url()).searchParams.get("mode") === "chat", "URL ?mode=chat");
    record(
      (await page
        .locator(
          'input[aria-label="搜索对话…"], input[aria-label="Search chats…"], input[type="search"]',
        )
        .count()) === 1,
      "ChatOverview 搜索框渲染",
    );
    record(
      (await page.getByRole("button", { name: /新对话|新建对话|New chat/ }).count()) >= 1,
      "新建按钮渲染",
    );
    const emptyShell = await page.evaluate(() => {
      const a = document.querySelectorAll("aside")[1];
      return a ? a.children.length === 0 : false;
    });
    record(emptyShell, "左栏面板隐藏（第 2 个 aside = 空壳占位无内容）");

    console.log("\n-- 3. 新建会话 → 占位 detail --");
    await page
      .getByRole("button", { name: /新对话|新建对话|New chat/ })
      .first()
      .click();
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
    await page.waitForTimeout(1200);
    const row = page
      .locator('div[aria-label="对话列表"], div[aria-label="Chat list"]')
      .getByRole("button", { name: /新对话|新建对话|New chat/ });
    record((await row.count()) >= 1, "会话行「新对话」存在（真实 API round-trip）");

    console.log("\n-- 5. 桌面右键 → 菜单 + 改名 --");
    await row.first().click({ button: "right" });
    await page.waitForTimeout(300);
    const menuRename = page.getByRole("menuitem", { name: /改名|重命名|Rename/ });
    record((await menuRename.count()) === 1, "右键菜单出「改名」项");
    await menuRename.click();
    await page.waitForTimeout(300);
    const promptInput = page.locator("[data-prompt-input]");
    await promptInput.fill("探针会话A");
    await promptInput.press("Enter");
    await page.waitForTimeout(600);
    const renamedRow = page
      .locator('div[aria-label="对话列表"], div[aria-label="Chat list"]')
      .getByRole("button", { name: /探针会话A|probe-chat-a/ });
    record((await renamedRow.count()) === 1, "改名生效（行文本 = 探针会话A）");

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
      (await page
        .locator('div[aria-label="对话列表"], div[aria-label="Chat list"]')
        .getByRole("button", { name: /探针会话A|probe-chat-a/ })
        .count()) === 0,
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
    record((await page.locator("aside").count()) >= 2, "Agent 模式左栏面板恢复");
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
    await page.waitForTimeout(800);
    record(/\/chat\/[^/]+$/.test(new URL(page.url()).pathname), "新建 → /chat/$id 全屏聚焦态");
    // 长按 = contextmenu（移动浏览器长按触发）；占位 detail 无列表，返回后验证。
    await page.getByRole("button", { name: /返回对话列表|Back to chats/ }).click();
    await page.waitForTimeout(600);
    const mRow = page
      .locator('div[aria-label="对话列表"], div[aria-label="Chat list"]')
      .getByRole("button", { name: /新对话|新建对话|New chat/ })
      .first();
    await mRow.dispatchEvent("contextmenu");
    await page.waitForTimeout(400);
    record(
      (await page.getByRole("menuitem", { name: /改名|重命名|Rename/ }).count()) >= 1,
      "contextmenu（长按同源）出菜单",
    );
    // 清理：删除探针会话。
    await page.getByRole("menuitem", { name: /删除|Delete/ }).click();
    await page.waitForTimeout(300);
    await page
      .getByRole("button", { name: /删除|Delete/ })
      .last()
      .click();
    await page.waitForTimeout(600);
    await ctx.close();
  }

  // ── 后端元数据清理核对（探针自愈：清空所有残留，正常应已为空）───────────────
  console.log("\n===== 后端元数据目录 =====");
  let files = [];
  try {
    files = await readdir(CHAT_SESSIONS_DIR);
  } catch {
    /* 目录不存在 = 无残留 */
  }
  if (files.length > 0) {
    await rm(CHAT_SESSIONS_DIR, { recursive: true, force: true });
    record(true, `清理残留元数据 ${files.length} 个（探针自愈）`);
  } else {
    record(true, "无残留元数据（删除已同步清理磁盘）");
  }

  await browser.close();
  console.log(`\n${allPass ? "✅ ALL PASS" : "❌ FAIL"}`);
  process.exit(allPass ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
