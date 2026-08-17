// 探针：桌面中栏 session tab ℹ 实例信息（2026-08-17）。进 /projects/proj1 → 左总览点会话卡
// 开 tab → tab chip ℹ 按钮（aria-label=session.instanceInfo.title）→ 点击 → 居中 modal
// （非底部 sheet）显示实例信息字段（name/project/type/model/permission/createdAt/status）。
// 验证三断言：① session tab 有 ℹ 按钮；② 点击弹居中 modal（dialog-content 非 fixed bottom——
// 居中 = left-1/2 top-1/2 未被覆盖）；③ modal 内字段与 mock detail 一致（displayName/provider/model/
// permissionMode/createdAt/status）+ file/git tab 无 ℹ（对照，可选）。
//
// 密码由脚本自读（env → config.yaml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-desktop-instance-info.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const AGENT = {
  id: "agent_probe-info-1",
  projectName: "proj1",
  provider: "claude2",
  displayName: "Probe Info Agent",
  status: "idle",
  createdAt: "2026-08-17T00:00:00.000Z",
  model: "sonnet",
  permissionMode: "default",
  claudeSessionId: "claude-resume-uuid-1234-5678",
};

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

const DESKTOP_CTX = {
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
};

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1"], candidates: [] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [AGENT] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1/agent-sessions/${AGENT.id}$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: AGENT,
        availableModels: ["sonnet", "opus"],
        availablePermissionModes: ["default", "bypassPermissions"],
      }),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1/terminal-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
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

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext(DESKTOP_CTX);
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);

    console.log("===== 1. 进 /projects/proj1 → 左总览点会话卡 → 中栏开 session tab =====");
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    const card = page.getByRole("button", { name: new RegExp(AGENT.displayName) });
    await card.waitFor({ timeout: 8000 });
    await card.click();
    // 点卡片开 tab（活动 group 开新 tab）→ 中栏 group tab 栏出现 session tab chip
    await page.waitForTimeout(500);

    console.log("===== 2. session tab chip ℹ 按钮 → 点击弹居中 modal =====");
    const infoBtn = page.getByRole("button", { name: "实例信息" });
    await infoBtn.waitFor({ timeout: 8000 });
    record(true, "session tab chip 有 ℹ 按钮（aria-label=实例信息）");
    await infoBtn.click({ timeout: 5000 });

    // 居中 modal 断言：dialog-content 无 fixed bottom-0（底部 sheet 特征），是居中 left-1/2 top-1/2
    const dialog = page.locator('[data-slot="dialog-content"][data-state="open"]');
    await dialog.waitFor({ timeout: 5000 });
    const position = await dialog.evaluate((el) => {
      const cls = el.className;
      const rect = el.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      return {
        isBottomSheet: cls.includes("bottom-0"),
        isCentered:
          !cls.includes("bottom-0") &&
          rect.left > 0 &&
          rect.right < viewportW &&
          rect.top > 0 &&
          rect.bottom < viewportH,
      };
    });
    record(!position.isBottomSheet, "非底部 sheet（无 bottom-0 类）");
    record(position.isCentered, "居中卡片（矩形在视口内、非贴边）");

    console.log("===== 3. modal 字段与 mock detail 一致 =====");
    const bodyText = (await dialog.textContent()) ?? "";
    for (const expected of [
      AGENT.displayName,
      "proj1",
      "Claude 2",
      AGENT.model,
      AGENT.permissionMode,
      AGENT.claudeSessionId,
    ]) {
      record(bodyText.includes(expected), `modal 含字段值 ${expected}`);
    }
    // resume id wrap 展示：value 不 truncate（scrollWidth ≤ clientWidth，无溢出截断）+ label 行存在
    const resumeWrap = await dialog.evaluate((el) => {
      const dds = Array.from(el.querySelectorAll("dd"));
      const dd = dds.find((n) => (n.textContent ?? "").includes("claude-resume-uuid"));
      if (!dd) return { found: false, notTruncated: false };
      return { found: true, notTruncated: dd.scrollWidth <= dd.clientWidth };
    });
    record(resumeWrap.found && resumeWrap.notTruncated, "resume id 完整展示（wrap 不 truncate）");

    console.log("===== 4. Esc 关闭 modal =====");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const stillOpen = await page.locator('[data-slot="dialog-content"][data-state="open"]').count();
    record(stillOpen === 0, "Esc 后 modal 关闭");
    await ctx.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
