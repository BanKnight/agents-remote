// 探针：回放缓存的生命周期清理（claude-replay-cache，2026-10-26）。真链路（真实 UI 删除
// 流程，零 mock）：自建 agent session → 预写缓存 entry → 打开会话页（entry 仍在，打开=
// 恢复不清理）→ 顶栏 ⋯「关闭会话…」confirm（useCloseSession 统一流程）→ 断言 entry 被
// 即时清扫（记录消失或只剩墓碑——卸载 flush 的迟到重写被墓碑挡住，不复活）。
// 会话由本探针自建自删（displayName 标记前缀），零残留。
//
// IDB 迁移批（2026-10-26）：预写改「登录后先 evaluate 直写 IDB 再导航」——不用
// addInitScript（IDB 写是异步的，init script 的写与应用首个恢复读竞态，预写可能落
// 在读之后 → 假 FAIL）。DB/store 名与 web/src/lib/replay-cache-store.ts 互指。
//
// 密码由脚本自读，不进 agent 上下文。用法：bun scripts/probe-replay-cache-cleanup.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const mark = `probe-rc-cleanup-${Date.now().toString(36)}`;

const IDB_NAME = "agents-remote-replay-cache";
const IDB_ENTRY_STORE = "entries";
// meta store 在 store 层是私有常量（replay-cache-store.ts），探针只在其 upgrade 建库
// 时需要同名——与实现互指，改一处必改两处。
const IDB_META_STORE = "meta";

/** 页内内联 async IDB 读单条记录（探针只读；open→tx→get→close）。 */
async function readIdbRecord(page, key) {
  return await page.evaluate(
    async ([dbName, storeName, k]) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, "readonly");
          const req = tx.objectStore(storeName).get(k);
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => reject(req.error);
        });
      } finally {
        db.close();
      }
    },
    [IDB_NAME, IDB_ENTRY_STORE, key],
  );
}

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
  // IDB 版：登录后先在当前页 evaluate 直写 IDB，再导航到会话页——写先于应用的首次
  // 恢复读，无竞态。两个坑（首批实测）：① 值必须是**对象**（存字符串会被 loadReplayCache
  // 的形状校验拒收）；② upgrade 必须把 entries+meta 两个 store 建全——残缺 DB（缺 meta）
  // 会让应用所有写 tx（scope 含 meta）失败静默，tombstone 写不进去 → ④ 假 FAIL。
  const line = JSON.stringify({
    type: "assistant",
    uuid: "probe-anchor-uuid",
    message: { id: "probe-1", role: "assistant", content: [{ type: "text", text: "probe" }] },
  });
  await page.evaluate(
    async ([dbName, storeName, metaStore, k, v]) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          const _db = req.result;
          if (!_db.objectStoreNames.contains(storeName)) _db.createObjectStore(storeName);
          if (!_db.objectStoreNames.contains(metaStore)) _db.createObjectStore(metaStore);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, "readwrite");
          tx.objectStore(storeName).put(v, k);
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    [
      IDB_NAME,
      IDB_ENTRY_STORE,
      IDB_META_STORE,
      cacheKey,
      {
        savedAt: Date.now(),
        v: 1,
        cursorUuid: "probe-anchor-uuid",
        resume: false,
        raw: line,
      },
    ],
  );

  // 打开会话页：entry 不应被打开动作清掉（load 恢复语义）。
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/session/${sessionId}`);
  await page.waitForTimeout(2500);
  const keyAfterOpen = await readIdbRecord(page, cacheKey);
  check(
    "③ 打开会话页后 entry 仍在（打开=恢复，不清理）",
    keyAfterOpen !== null && keyAfterOpen.removed !== true,
    keyAfterOpen === null ? "entry=null" : `cursor=${keyAfterOpen.cursorUuid}`,
  );

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

  const keyAfterClose = await readIdbRecord(page, cacheKey);
  // 清扫语义 = 无可用缓存：记录消失或只剩墓碑（removed:true——卸载 flush 不复活）。
  const swept = keyAfterClose === null || keyAfterClose.removed === true;
  check(
    "④ UI 关闭会话后 entry 被即时清扫（墓碑）",
    swept,
    keyAfterClose === null ? "record=null" : JSON.stringify(keyAfterClose).slice(0, 60),
  );

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
