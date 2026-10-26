// 探针：回放缓存的生命周期清理（claude-replay-cache，2026-10-26）。真链路（真实 UI 删除
// 流程，零 mock）：自建 agent session → 预写缓存 entry → 打开会话页（entry 仍在，打开=
// 恢复不清理）→ 顶栏 ⋯「关闭会话…」confirm（useCloseSession 统一流程）→ 断言 entry 被
// 即时清扫（key 消失或只剩墓碑——卸载 flush 的迟到重写被墓碑挡住，不复活）。
// 会话由本探针自建自删（displayName 标记前缀），零残留。
//
// 密码由脚本自读，不进 agent 上下文。用法：bun scripts/probe-replay-cache-cleanup.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const mark = `probe-rc-cleanup-${Date.now().toString(36)}`;

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  const suffix = detail ? `  (${detail})` : "";
  console.log(ok ? `PASS ${label}${suffix}` : `FAIL ${label}${suffix}`);
  if (ok) pass += 1;
  else fail += 1;
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // 登录一次（cookie 在 ctx 内，后续请求复用）。
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(1500);
  // 探针 lang 坑（frontend-notes）：默认跟浏览器 locale（en），addInitScript 钉 zh，
  // 后续 getByRole 文案定位才稳定。
  await page.addInitScript(() => localStorage.setItem("lang", "zh"));

  // 自建 agent session（探针自建自删；displayName 带标记前缀）。
  const createRes = await page.request.post(
    `${WEB_ORIGIN}/api/projects/${encodeURIComponent(projectName)}/agent-sessions`,
    { data: { provider: "claude", displayName: `probe-rc-cleanup ${mark}` } },
  );
  check("① 自建 agent session（API）", createRes.ok(), `status=${createRes.status()}`);
  const created = await createRes.json();
  const sessionId = created?.session?.id;
  check(
    "② 响应含 session.id（agent_ 前缀——UI 按 id 前缀推断会话类型，预写/删除必须用真实 id）",
    typeof sessionId === "string" && sessionId.startsWith("agent_"),
    sessionId,
  );
  const cacheKey = `claudeReplayCache:${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}`;

  // 预写缓存 entry（模拟「之前访问过」；行是合法 JSON 且带 uuid → loadReplayCache 可命中）。
  // 在导航前注入，进页时已就位。
  const line = JSON.stringify({
    type: "assistant",
    uuid: "probe-anchor-uuid",
    message: { id: "probe-1", role: "assistant", content: [{ type: "text", text: "probe" }] },
  });
  await page.addInitScript(
    ([k, v]) => {
      localStorage.setItem(k, v);
    },
    [
      cacheKey,
      JSON.stringify({
        savedAt: Date.now(),
        v: 1,
        cursorUuid: "probe-anchor-uuid",
        resume: false,
        raw: line,
      }),
    ],
  );

  // 打开会话页：entry 不应被打开动作清掉（load 恢复语义）。
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/session/${sessionId}`);
  await page.waitForTimeout(2500);
  const keyAfterOpen = await page.evaluate((k) => localStorage.getItem(k), cacheKey);
  check("③ 打开会话页后 entry 仍在（打开=恢复，不清理）", keyAfterOpen !== null);

  // UI 删除（useCloseSession 统一流程）：顶栏 ⋯（「更多操作」）→「关闭会话…」→ confirm「关闭」。
  await page.getByRole("button", { name: "更多操作" }).click();
  const menuItem = page.getByRole("menuitem", { name: "关闭会话…" });
  await menuItem.waitFor({ state: "visible", timeout: 5000 });
  // §26：portal 弹层 menuitem 偶发 in-viewport 误判，dispatchEvent 语义等价 onSelect。
  await menuItem.dispatchEvent("click");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.waitForTimeout(1500);

  const keyAfterClose = await page.evaluate((k) => localStorage.getItem(k), cacheKey);
  // 清扫语义 = 无可用缓存：key 消失或只剩墓碑（removed:true——卸载 flush 不复活）。
  const swept = keyAfterClose === null || JSON.parse(keyAfterClose).removed === true;
  check("④ UI 关闭会话后 entry 被即时清扫（墓碑）", swept, keyAfterClose?.slice(0, 60));

  console.log("");
  console.log(`共 ${pass + fail} 项：${pass} pass / ${fail} fail`);
} finally {
  // 收尾兜底：无论探针成败，自建会话必须关闭（幂等；已删除时 404 可忽略）。
  // close 的 id = 会话真实 id；失败场景下 mark 可能尚未取到 id——按 displayName 前缀
  // 留给 /check 惯例（探针只删自己创建的）：这里只能 close 已知 id，未知 id 不盲删。
  try {
    const ctx = browser.contexts()[0];
    if (ctx && typeof sessionId !== "undefined") {
      await ctx.request.post(
        `${WEB_ORIGIN}/api/projects/${encodeURIComponent(projectName)}/agent-sessions/${encodeURIComponent(sessionId)}/close`,
      );
    }
  } catch {
    // ignore
  }
  await browser.close();
}
if (fail > 0) process.exit(1);
