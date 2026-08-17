// 验证全局总览 agent 卡片渲染第二行（聊天内容）——问题 1 的前端侧闭环。
// 服务端（listCandidateSubtitles 收集 agent lastAssistantMessage）由单测 + 真实验证覆盖；
// 本探针 mock 两阶段 API（/api/overview + /api/overview/subtitles），断言：
//   1. 有 subtitle 的 agent 卡片渲染第二行，文本与服务端 map 一致；
//   2. 无 subtitle（codex）的 agent 卡片退化 2 行（无第二行）。
// 与项目总览对照：同一 agent 卡片第二行文本 = lastAssistantMessage。
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const MOCK_AGENT_SUBS = {
  a1: "这是路由网关最后一条 assistant 回复，用于验证第二行",
  a2: "语伴最后一条 assistant 回复：M44 收尾完成",
};
const MOCK_AGENTS = [
  {
    type: "agent",
    projectName: "proj1",
    sessionId: "a1",
    displayName: "路由网关",
    status: "running",
    provider: "claude",
  },
  {
    type: "agent",
    projectName: "proj1",
    sessionId: "a2",
    displayName: "语伴",
    status: "running",
    provider: "claude",
  },
  {
    type: "agent",
    projectName: "proj1",
    sessionId: "a3",
    displayName: "codex 会话",
    status: "running",
    provider: "codex",
  },
];

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
});
const page = await ctx.newPage();
await page.route(/\/api\/overview$/, (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ projectNames: ["proj1"], candidates: MOCK_AGENTS }),
  }),
);
await page.route(/\/api\/overview\/subtitles$/, (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ subtitles: MOCK_AGENT_SUBS }),
  }),
);

await page.goto(`${WEB_ORIGIN}/projects`);
await page
  .getByLabel("密码")
  .or(page.getByLabel("Password"))
  .fill(await readAppPassword());
await page.getByRole("button", { name: /解锁|Unlock/ }).click();

// 等待卡片渲染（mock overview 秒回，subtitle 慢填充）
await page.waitForSelector('[role="button"]', { timeout: 10000 });
await page.waitForTimeout(800);

// 收集所有 InstanceCard 卡片：title（text-sm font-semibold）+ subtitle（text-xs 纯文本 div）
const cards = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('[role="button"]')) {
    const content = el.querySelector("div.min-w-0.flex-1.flex.flex-col.gap-1");
    if (!content) continue;
    const title = content.querySelector(":scope > span.text-sm.font-semibold")?.textContent?.trim();
    if (!title) continue;
    const sub = [...content.querySelectorAll(":scope > div")]
      .find(
        (d) =>
          d.classList.contains("text-xs") &&
          d.classList.contains("text-on-surface-muted") &&
          d.children.length === 0,
      )
      ?.textContent?.trim();
    out.push({ title, subtitle: sub ?? null });
  }
  return out;
});

console.log(`\n渲染卡片（title → subtitle）：`);
for (const c of cards)
  console.log(`  ${c.title} → ${c.subtitle ? JSON.stringify(c.subtitle) : "(无第二行)"}`);

// 断言 1：claude agent 卡片有第二行，文本与 mock 一致
for (const a of MOCK_AGENTS.filter((a) => a.provider === "claude")) {
  const card = cards.find((c) => c.title === a.displayName);
  record(
    !!card && card.subtitle === MOCK_AGENT_SUBS[a.sessionId],
    `claude agent「${a.displayName}」卡片第二行 = "${MOCK_AGENT_SUBS[a.sessionId]}"`,
  );
}

// 断言 2：codex agent 卡片无第二行（退化 2 行，与项目总览一致）
const codex = MOCK_AGENTS.find((a) => a.provider === "codex");
const codexCard = cards.find((c) => c.title === codex.displayName);
record(
  codexCard !== undefined && codexCard.subtitle === null,
  `codex agent「${codex.displayName}」无第二行（退化 2 行）`,
);

await browser.close();
console.log(allPass ? "\nPASS: 全局总览 agent 卡片第二行渲染正确" : "\nFAIL: 存在断言未通过");
process.exit(allPass ? 0 : 1);
