// 探针：omp（ACP）provider 正名 + 历史 + configOptions 切换 + 样式对齐 真链路验证
// （ar-dev 常驻服务 43011/43012）。
// 覆盖：
//  1. [REST] 存量迁移归一：legacy runtimeKey "-agent-acp-" 会话在列表/详情中 provider 归一为 "omp"。
//  2. [REST] omp 历史合流：agent-history 含 provider "omp" 条目（acpSessionId 携带）。
//  3. [REST] 创建 omp 会话：provider=omp、runtimeKey 段=acp、acpSessionId spawn 后回填。
//  4. [Browser] configOptions 透传与切换：WS 流收到 acp_config（agent 广告 model 选择器）→
//     发 set_config 切 model → 帧 currentvalue 变化 + 页面选择器 trigger 同步 → 切回原值。
//  5. [Browser] 真实 omp turn：echo 气泡 → 工具卡片带边框/圆角（DOM 几何，非截图）+
//     runtimeBody 容器背景（bg-surface-inset/15）。
//  6. [REST] 历史判活：活跃 omp 会话出现在 acp activeMap（hasActiveSession true）。
//  7. [Browser] 历史点击恢复：close 后历史行点击 → 命名确认 → 新实例 session/load 回放可见，
//     acpSessionId 与原会话一致。
// 密码自读不打印（scripts/lib/deploy-config.mjs）；只清理 displayName 以 "[probe-omp]" 标记的
// 自建会话（含崩溃残留）。用法：bun scripts/probe-omp-realchain.mjs
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readAppPassword } from "./lib/deploy-config.mjs";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = process.env.PROBE_PROJECT ?? "test";
const MARKER = "[probe-omp]";
const PROMPT = "请运行 ls 命令查看当前目录里有哪些文件（必须调用工具）";
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? 180_000);
// api runDir（session metadata 落盘处；DTO 不含 runtimeKey，存量迁移判定从磁盘读）。
const RUN_DIR =
  process.env.AR_RUN_DIR ?? `${process.env.XDG_RUNTIME_DIR ?? "/run/user/1000"}/agents-remote`;

const results = [];
const check = (ok, name, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pw = await readAppPassword();
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: pw }),
});
if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
const { token } = await loginRes.json();
const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };

const listSessions = async () => {
  const res = await fetch(`${API}/api/projects/${PROJECT}/agent-sessions`, { headers: auth });
  if (!res.ok) throw new Error(`list sessions failed: ${res.status}`);
  return (await res.json()).sessions ?? [];
};
const closeSession = async (id) => {
  const res = await fetch(`${API}/api/projects/${PROJECT}/agent-sessions/${id}/close`, {
    method: "POST",
    headers: auth,
  });
  return res.ok;
};
const getDetail = async (id) => {
  const res = await fetch(`${API}/api/projects/${PROJECT}/agent-sessions/${id}`, { headers: auth });
  return res.ok ? (await res.json()).session : null;
};
const getHistory = async () => {
  const res = await fetch(`${API}/api/projects/${PROJECT}/agent-history?range=all`, {
    headers: auth,
  });
  if (!res.ok) throw new Error(`history failed: ${res.status}`);
  return (await res.json()).entries ?? [];
};
/** 关闭本探针标记的全部会话（含崩溃残留）。 */
const cleanupProbeSessions = async (extraIds = []) => {
  const sessions = await listSessions();
  const mine = sessions.filter((s) => (s.displayName ?? "").startsWith(MARKER));
  for (const s of [...mine, ...extraIds.map((id) => ({ id }))]) {
    await closeSession(s.id).catch(() => {});
  }
  return mine.length + extraIds.length;
};

await cleanupProbeSessions();

// ── 1. 存量迁移归一：磁盘 metadata 仍是 provider "acp"（归一只在内存），API 列表/详情
//      必须已归一为 "omp"（防 keepIfRuntimeExists 误删的归一化先行验证）。 ──
const { readdir } = await import("node:fs/promises");
let legacyIds = [];
try {
  const files = await readdir(join(RUN_DIR, "sessions"));
  for (const f of files.filter((n) => n.endsWith(".json"))) {
    const raw = JSON.parse(await readFile(join(RUN_DIR, "sessions", f), "utf8"));
    if (raw.provider === "acp" && raw.projectName === PROJECT) legacyIds.push(raw.id);
  }
} catch {
  // runDir 不可读 → 无存量可验（下方 count=0 会给出可见失败信号）
}
const listed = await listSessions();
const legacyListed = listed.filter((s) => legacyIds.includes(s.id));
check(
  legacyIds.length > 0 && legacyListed.every((s) => s.provider === "omp"),
  "存量 acp 会话列表归一为 omp（磁盘仍是 acp，API 输出 omp）",
  `legacy=${legacyIds.length} providers=[${legacyListed.map((s) => s.provider).join(",")}]`,
);
let legacyDetailOk = legacyIds.length > 0;
for (const id of legacyIds) {
  const d = await getDetail(id);
  if (!d || d.provider !== "omp") legacyDetailOk = false;
}
check(legacyDetailOk, "存量 acp 会话详情可打开且 provider=omp");

// ── 2. 创建 omp 会话（REST）+ acpSessionId 回填 + runtimeKey 段（磁盘 metadata 验证） ──
const createRes = await fetch(`${API}/api/projects/${PROJECT}/agent-sessions`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ provider: "omp", displayName: `${MARKER} border check` }),
});
const created = createRes.ok ? (await createRes.json()).session : null;
check(
  !!created && created.provider === "omp",
  "创建 omp 会话（provider=omp）",
  `id=${created?.id}`,
);
let acpSessionId = null;
for (let i = 0; i < 30 && !acpSessionId; i++) {
  await sleep(1000);
  acpSessionId = (await getDetail(created.id))?.acpSessionId ?? null;
}
check(!!acpSessionId, "acpSessionId spawn 后回填", acpSessionId ?? "timeout");
let runtimeKeyOk = false;
try {
  const meta = JSON.parse(await readFile(join(RUN_DIR, "sessions", `${created.id}.json`), "utf8"));
  runtimeKeyOk = (meta.runtimeKey ?? "").includes("-agent-acp-");
} catch {}
check(runtimeKeyOk, "omp 会话 runtimeKey 段 = transport 家族 acp（磁盘 metadata）");

// ── 4. 浏览器：真实 turn 渲染 + 工具卡片边框/背景（DOM 几何） ──
const browser = await chromium.launch();
let resumed = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("lang", "en"));

  // 页面真实 WS 捕获 + 原始帧收集（goto 前注册）：
  // - Playwright 的 page.on("websocket") 对象只读（无 send()），上行必须用页面自己的
  //   真实 WebSocket 实例——initScript 包一层构造函数把实例挂到 window（acp-adapter
  //   用 new WebSocket(...) 创建，捕获到的即它持有并消费的那个）。
  // - 下行帧同理：包装后的实例上挂 framereceived 收集器，解码后的文本推给 __wsFrames。
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.__acpSockets = [];
    window.__wsFrames = [];
    class TracedWebSocket extends Native {
      constructor(...args) {
        super(...args);
        window.__acpSockets.push(this);
        this.addEventListener("message", async (ev) => {
          const data = ev.data;
          try {
            if (typeof data === "string") {
              window.__wsFrames.push(data);
            } else {
              // createBatchEmitter gzip 分块（块边界=行边界）：浏览器侧解压。
              const ds = new DecompressionStream("gzip");
              const text = await new Response(new Blob([data]).stream().pipeThrough(ds)).text();
              window.__wsFrames.push(text);
            }
          } catch {
            /* 非 gzip 二进制忽略 */
          }
        });
      }
    }
    window.WebSocket = TracedWebSocket;
  });

  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Unlock console" }).click();
  await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}/session/${created.id}`);

  // 发送真实 prompt → echo 气泡（acp_user_echo 注入）→ running（Stop 出现）→ ended（Stop 消失）。
  const input = page.getByPlaceholder("Ask Claude...");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  check(true, "omp 面板挂载 + composer 可用");

  // ── 4. configOptions 透传与切换（页面内 WS 原始帧，计划 §门禁3）──
  // 帧序扫描 acp_config（响应回灌）与 acp_event.config_option_update（omp 主动推），
  // 取最新的 model 项状态。帧读取走页面 window.__wsFrames（TracedWebSocket 收集的实时缓冲）。
  const latestModelOption = async () =>
    page.evaluate(() => {
      const allText = (window.__wsFrames ?? []).join("\n");
      let cur = null;
      for (const line of allText.split("\n")) {
        if (!line.trim()) continue;
        let m;
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        const opts =
          m.type === "acp_config" && Array.isArray(m.configOptions)
            ? m.configOptions
            : m.type === "acp_event" && m.event?.sessionUpdate === "config_option_update"
              ? m.event.configOptions
              : null;
        const found = opts?.find((o) => o.id === "model");
        if (found) cur = found;
      }
      return cur;
    });
  const waitModelOption = async (pred, label, timeoutMs = 30_000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const model = await latestModelOption();
      if (model && pred(model)) return model;
      await sleep(300);
    }
    throw new Error(`config wait timeout: ${label}`);
  };
  const sendConfig = (configId, value) =>
    page.evaluate(
      ([id, v]) => {
        const socket = (window.__acpSockets ?? []).find((s) => s.readyState === 1);
        if (!socket) throw new Error("no open acp socket");
        socket.send(JSON.stringify({ type: "set_config", configId: id, value: v }));
        return true;
      },
      [configId, value],
    );

  let configModel = null;
  try {
    configModel = await waitModelOption(
      (m) => Array.isArray(m.options) && m.options.length > 0,
      "initial acp_config",
    );
  } catch {}
  check(
    !!configModel,
    "WS 流收到 acp_config（agent 广告 model 选择器）",
    configModel ? `current=${configModel.currentValue}` : "no model option in frames",
  );

  if (configModel) {
    const original = configModel.currentValue;
    const switchTo = configModel.options.find((o) => o.value !== original)?.value;
    const switchName = configModel.options.find((o) => o.value === switchTo)?.name;
    if (switchTo) {
      let switched = null;
      try {
        await sendConfig("model", switchTo);
        switched = await waitModelOption(
          (m) => m.currentValue === switchTo,
          `switch to ${switchTo}`,
        );
      } catch {}
      check(
        !!switched,
        "set_config 切换 model → 帧流 currentValue 变化",
        switched ? `original=${original} → ${switchTo}` : `no change (original=${original})`,
      );

      // 页面选择器 trigger 同步（页面 React 消费同一帧流；名称取帧第一手数据）。
      const triggerText = `${configModel.name}·${switchName}`;
      const triggerSeen = await page
        .getByRole("button")
        .filter({ hasText: triggerText })
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      check(triggerSeen, "composer 底部选择器 trigger 同步切换", triggerText);

      let restored = false;
      try {
        await sendConfig("model", original);
        await waitModelOption((m) => m.currentValue === original, "restore original");
        restored = true;
      } catch {}
      check(restored, "set_config 切回原 model", original ?? "unknown");
    } else {
      check(false, "model 仅一个选项，无法验证切换", JSON.stringify(configModel.options));
    }
  }

  await input.fill(PROMPT);
  await input.press("Enter");
  await page.getByText(PROMPT).first().waitFor({ state: "visible", timeout: 15_000 });
  check(true, "echo 气泡可见（上行注入回路）");
  const stopBtn = page.getByRole("button", { name: "Stop" });
  const runningSeen = await stopBtn
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  check(runningSeen, "发送后进入 running（Stop 按钮出现）");
  const endedSeen = await stopBtn
    .waitFor({ state: "hidden", timeout: TURN_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  check(endedSeen, "turn 结束（Stop 按钮消失）");

  // omp 历史合流：turn 落盘后 omp JSONL 已存在，agent-history 必须出现 provider "omp" 条目。
  const ompEntries = (await getHistory()).filter(
    (e) => e.provider === "omp" && e.acpSessionId === acpSessionId,
  );
  check(
    ompEntries.length === 1,
    "agent-history 合流 omp 条目（acpSessionId 匹配）",
    `omp=${ompEntries.length} title=${ompEntries[0]?.title ?? ompEntries[0]?.firstMessage ?? "null"}`,
  );

  // 工具卡片边框：卡片根 div 同时挂 cardBorder solo（rounded-lg border）+ bg-surface-raised/40
  // （ClaudeSessionDetailRoute 同一元素），断言其自身 computed border 1px + radius 8px。
  // 加 rounded-lg+border 类过滤，避开 shell-navigation 的 bg-surface-raised/40（rounded-2xl）。
  const card = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("div")).find(
      (d) =>
        d.classList.contains("bg-surface-raised/40") &&
        d.classList.contains("rounded-lg") &&
        d.classList.contains("border"),
    );
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      borderTopWidth: cs.borderTopWidth,
      borderStyle: cs.borderTopStyle,
      borderRadius: cs.borderTopLeftRadius,
    };
  });
  // 主题 --radius-lg = calc(var(--radius) * 1.4) = 14px（styles/index.css），非 Tailwind 默认 8px。
  check(
    !!card &&
      card.borderTopWidth === "1px" &&
      card.borderStyle !== "none" &&
      card.borderRadius === "14px",
    "工具卡片带边框+圆角（DOM 几何）",
    card ? JSON.stringify(card) : "tool-card root not found",
  );

  // 容器 runtimeBody 背景（bg-surface-inset/15 utility 落 DOM）。
  const bodyBg = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("div")).find((d) =>
      d.classList.contains("bg-surface-inset/15"),
    );
    return el ? getComputedStyle(el).backgroundColor : null;
  });
  check(
    !!bodyBg && bodyBg !== "rgba(0, 0, 0, 0)",
    "聊天容器 runtimeBody 背景落盘",
    bodyBg ?? "class missing",
  );

  // ── 5. 历史判活 ──
  const activeEntry = (await getHistory()).find((e) => e.acpSessionId === acpSessionId);
  check(
    !!activeEntry && activeEntry.hasActiveSession && activeEntry.activeSessionId === created.id,
    "活跃 omp 会话进历史判活 map",
    activeEntry ? `hasActive=${activeEntry.hasActiveSession}` : "entry missing",
  );

  // close → 历史判活解除。
  check(await closeSession(created.id), "close 探针会话");
  let closedInHistory = false;
  for (let i = 0; i < 20 && !closedInHistory; i++) {
    await sleep(1000);
    const e = (await getHistory()).find((x) => x.acpSessionId === acpSessionId);
    closedInHistory = !!e && !e.hasActiveSession;
  }
  check(closedInHistory, "close 后历史条目 hasActiveSession=false");

  // ── 6. 历史点击恢复（resume → session/load 回放） ──
  const entry = (await getHistory()).find((e) => e.acpSessionId === acpSessionId);
  const rowTitle = (entry?.title ?? entry?.firstMessage ?? "").slice(0, 30);
  await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}?tab=history`);
  const row = page
    .locator('div[role="button"]')
    .filter({ has: page.locator(`span[data-list-row-title]`, { hasText: rowTitle }) })
    .first();
  await row.waitFor({ state: "visible", timeout: 20_000 });
  const markerIcon = await row.evaluate((el) => el.querySelector("svg")?.innerHTML ?? "");
  check(markerIcon.length > 0, "omp 历史行带 marker 图标");
  await row.click();
  // 命名对话框（预填历史标题）→ Create 确认 → 新实例。
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  // 导航到新会话 → loadSession 回放渲染原 prompt 文本。
  await page.waitForURL(/\/session\/agent_/, { timeout: 30_000 });
  const newId = page.url().split("/session/")[1];
  check(!!newId && newId !== created.id, "历史点击 → resume 成新活跃实例", `new=${newId}`);
  resumed = newId ?? null;
  await page.getByText(PROMPT).first().waitFor({ state: "visible", timeout: 60_000 });
  check(true, "session/load 回放历史可见（原 prompt 文本）");
  const resumedDetail = await getDetail(newId);
  check(
    !!resumedDetail &&
      resumedDetail.provider === "omp" &&
      resumedDetail.acpSessionId === acpSessionId,
    "resume 实例 provider=omp 且 acpSessionId 与原会话一致",
    resumedDetail ? `acp=${resumedDetail.acpSessionId}` : "detail missing",
  );
} finally {
  await browser.close();
  const cleaned = await cleanupProbeSessions([created?.id, resumed].filter(Boolean));
  console.log(`[cleanup] closed ${cleaned} probe session(s)`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
