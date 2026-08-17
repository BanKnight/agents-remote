// 探针：桌面项目切换器（ProjectSwitcher 桌面形态 = Radix DropdownMenu popover）。与移动 drawer
// 底部 sheet 同一组件（probe-mobile-project-drawer.mjs 断言 11），此处验证桌面左栏挂点：
// 进 /projects/proj1 → 左栏 header 项目名 button（aria-label=workbench.switchProject）→ 点击 →
// popover 弹项目列表（当前 proj1 勾选 disabled + proj2）→ 点 proj2 → URL /projects/proj2 +
// header 显示 proj2。免「返回 /projects → 点项目进入」两步。
//
// 密码由脚本自读（env → config.yaml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-project-switcher-desktop.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const AGENT_A = {
  id: "agent_probe-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe Agent A",
  status: "idle",
  createdAt: "2026-07-26T00:00:00.000Z",
};
const AGENT_B = {
  id: "agent_probe-2",
  projectName: "proj2",
  provider: "claude",
  displayName: "Probe Agent B",
  status: "idle",
  createdAt: "2026-07-26T00:00:00.000Z",
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

function sessionDetail(session) {
  return {
    session,
    availableModels: ["sonnet", "opus", "haiku"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
}

async function setupMocks(page) {
  // 项目切换器数据源：/api/overview projectNames（useGlobalInstanceCandidates kind=global）。
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1", "proj2"], candidates: [] }),
    }),
  );
  // 两项目会话列表（桌面 project scope 左栏 InstanceLeftOverview；切 proj2 后同样需要）。
  for (const [name, agent] of [
    ["proj1", AGENT_A],
    ["proj2", AGENT_B],
  ]) {
    await page.route(new RegExp(`/api/projects/${name}/agent-sessions(?:\\?.*)?$`), (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [agent] }),
      }),
    );
    await page.route(new RegExp(`/api/projects/${name}/agent-sessions/${agent.id}$`), (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionDetail(agent)),
      }),
    );
    await page.route(new RegExp(`/api/projects/${name}/terminal-sessions(?:\\?.*)?$`), (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [] }),
      }),
    );
  }
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

    console.log("===== 1. 进 /projects/proj1 → 左栏 header 项目名切换器 =====");
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    const switcher = page.getByRole("button", { name: "切换项目" });
    await switcher.waitFor({ timeout: 8000 });
    const triggerText = (await switcher.textContent()) ?? "";
    record(
      triggerText.includes("proj1"),
      `左栏 header 项目名可点击（切换器 trigger 显示 proj1：${triggerText.trim()}）`,
    );
    // cursor pointer 断言（2026-08-17 用户反馈修复）：桌面端切换器 + 折叠按钮是 `<button>`，
    // Tailwind v4 默认 cursor:default 无 pointer——computed style 硬数据验证两个都回到 pointer。
    const switcherCursor = await switcher.evaluate((el) => getComputedStyle(el).cursor);
    record(switcherCursor === "pointer", `切换器 trigger cursor=pointer（实际 ${switcherCursor}）`);
    const collapseBtn = page.getByRole("button", { name: "收起左栏" });
    await collapseBtn.waitFor({ timeout: 5000 });
    const collapseCursor = await collapseBtn.evaluate((el) => getComputedStyle(el).cursor);
    record(collapseCursor === "pointer", `左栏折叠按钮 cursor=pointer（实际 ${collapseCursor}）`);

    console.log("===== 2. 点击 → popover 项目列表（当前勾选 disabled + 其他项目）=====");
    await switcher.click({ timeout: 5000 });
    const itemProj1 = page.getByRole("menuitem", { name: "proj1" });
    await itemProj1.waitFor({ timeout: 5000 });
    // Radix DropdownMenuItem 是 div role=menuitem，disabled 经 data-disabled attribute（非原生
    // disabled），与移动 sheet 的原生 button disabled 不同——用 attribute 判断。
    record(
      (await itemProj1.getAttribute("data-disabled")) !== null,
      "popover 中当前项目 proj1 勾选 disabled（data-disabled，不可重选）",
    );
    const itemProj2 = page.getByRole("menuitem", { name: "proj2" });
    await itemProj2.waitFor({ timeout: 5000 });

    console.log("===== 3. 点 proj2 → URL 直接切项目 =====");
    await itemProj2.click({ timeout: 5000 });
    await page.waitForURL(/\/projects\/proj2/, { timeout: 8000 });
    record(true, "点 proj2 → URL /projects/proj2（免「返回 → 再进入」）");
    const switcherAfter = page.getByRole("button", { name: "切换项目" });
    await switcherAfter.waitFor({ timeout: 8000 });
    const afterText = (await switcherAfter.textContent()) ?? "";
    record(afterText.includes("proj2"), `切后左栏 header 显示 proj2（${afterText.trim()}）`);
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
