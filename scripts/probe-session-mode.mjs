// 探针：Agent 会话双模式（GUI 对话 ↔ TUI 终端，2026-10-15）真链路验证（ar-dev 常驻服务
// 43011/43012）。覆盖：
//  1. [REST] 新建 claude 会话即钉 claudeSessionId + 缺省形态 chat。
//  2. [REST] POST /mode terminal → 200 且 mode 落盘；详情回读一致。
//  3. [WS]   形态切到 terminal 后 session-stream 可 attach（= tmux pane 真在）；
//            claude-stream 被守卫拒绝（SESSION_STATE_CONFLICT，防同 id 双写 JSONL）。
//  3.5 [真链路] CLI 真加载 hooks（--settings，review P1-1 断链修复实证）：tmux send-keys
//            提交一句话 → UserPromptSubmit hook printf 写状态文件（此前 argv 漏 --settings，
//            状态文件恒空、TUI 状态点停更）。
//  4. [REST] 切换门槛严格 idle-only：状态文件注入 user_input 翻 working → POST mode 409。
//  5. [REST] 状态文件信号驱动状态机（关键三态）：turn_done → done。
//  6. [REST] POST /mode chat → 200；状态/settings 文件随之清理。
//  7. [WS]   切回 chat 后 claude-stream 可连（收到非错误帧）；session-stream 随之失效。
//  8. [REST] 非 claude provider（omp）→ /mode 404（能力对消费面隐藏）。
// 密码自读不打印（scripts/lib/deploy-config.mjs）；只清理 displayName 以 "[probe-mode]" 标记的
// 自建会话（含崩溃残留）。用法：systemd-run --scope --user -p MemoryMax=2G bun scripts/probe-session-mode.mjs
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readAppPassword } from "./lib/deploy-config.mjs";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const PROJECT = process.env.PROBE_PROJECT ?? "test";
const MARKER = "[probe-mode]";
const RUN_DIR =
  process.env.AR_RUN_DIR ?? resolveRunDir(process.env.XDG_RUNTIME_DIR ?? "/run/user/1000");
const WS_TIMEOUT_MS = Number(process.env.WS_TIMEOUT_MS ?? 15_000);

function resolveRunDir(xdg) {
  return `${xdg}/agents-remote`;
}

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
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
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return (await res.json()).sessions ?? [];
};
const getDetail = async (id) => {
  const res = await fetch(`${API}/api/projects/${PROJECT}/agent-sessions/${id}`, { headers: auth });
  if (!res.ok) return undefined;
  return (await res.json()).session;
};
const postMode = async (id, mode) => {
  const res = await fetch(`${API}/api/projects/${PROJECT}/agent-sessions/${id}/mode`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ mode }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const closeSession = (id) =>
  fetch(`${API}/api/projects/${PROJECT}/agent-sessions/${id}/close`, {
    method: "POST",
    headers: auth,
  });
const metadata = async (id) =>
  JSON.parse(await readFile(join(RUN_DIR, "sessions", `${id}.json`), "utf8"));
const statusPath = (runtimeKey) => join(RUN_DIR, "agent-status", runtimeKey);
const settingsPath = (runtimeKey) => join(RUN_DIR, "agent-settings", `${runtimeKey}.json`);

/** 连 WS 收集帧直到超时/满足条件，返回收到的帧数组。 */
const collectFrames = async (url, until = () => false, timeoutMs = WS_TIMEOUT_MS) => {
  const frames = [];
  const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
  const done = new Promise((resolve) => {
    const finish = () => {
      try {
        socket.close();
      } catch {}
      resolve(frames);
    };
    const timer = setTimeout(finish, timeoutMs);
    socket.onmessage = (event) => {
      const frame = JSON.parse(String(event.data));
      frames.push(frame);
      if (until(frame)) {
        clearTimeout(timer);
        finish();
      }
    };
    socket.onerror = () => {
      clearTimeout(timer);
      finish();
    };
    socket.onclose = () => {
      clearTimeout(timer);
      finish();
    };
  });
  return done;
};

const streamUrl = (id) =>
  `ws://127.0.0.1:43011/api/projects/${PROJECT}/agent-sessions/${id}/stream`;
const claudeStreamUrl = (id) =>
  `ws://127.0.0.1:43011/api/projects/${PROJECT}/agent-sessions/${id}/claude-stream`;

// ── 清理自建残留（只动 MARKER 标记的会话）─────────────────────────────────
const own = (await listSessions()).filter((s) => s.displayName?.startsWith(MARKER));
for (const s of own) await closeSession(s.id);

let claudeId;
let ompId;
try {
  // 1 新建 + 钉 id + 缺省 chat
  const createRes = await fetch(`${API}/api/projects/${PROJECT}/agent-sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ provider: "claude", displayName: `${MARKER} claude` }),
  });
  const created = (await createRes.json()).session;
  claudeId = created.id;
  check(created.mode === undefined, "新建 claude 会话缺省形态 = chat", `mode=${created.mode}`);
  check(
    /^[0-9a-f-]{36}$/.test(created.claudeSessionId ?? ""),
    "新建即钉 claudeSessionId（双模式可切前提）",
    created.claudeSessionId,
  );

  // 2 切 terminal
  const toTerminal = await postMode(claudeId, "terminal");
  check(toTerminal.status === 200, "POST /mode terminal → 200", `status=${toTerminal.status}`);
  check(
    toTerminal.body.session?.mode === "terminal",
    "响应 session.mode = terminal",
    toTerminal.body.session?.mode,
  );
  const meta = await metadata(claudeId);
  const runtimeKey = meta.runtimeKey;
  const detailAfter = await getDetail(claudeId);
  check(detailAfter?.mode === "terminal", "详情回读 mode = terminal", detailAfter?.mode);

  // 3 terminal 形态：session-stream 可 attach（tmux pane 真在）；claude-stream 被守卫拒绝。
  // 收集窗给 4s：既证 attach，也证 pane 内 CLI **真起来了**——argv 经 shell 单引号包裹 + CLI
  // flag 合法性（--resume/--model/--permission-mode/--effort/--mcp-config）任一有错，pane 会
  // 立刻死（只余 shell 报错文本 + ended 帧）。
  const streamFrames = await collectFrames(streamUrl(claudeId), () => false, 4000);
  check(
    streamFrames.some((f) => f.type === "status" && f.status === "connected"),
    "terminal 形态 session-stream attach 成功（tmux pane 在）",
    JSON.stringify(streamFrames.slice(0, 2)),
  );
  const paneText = streamFrames
    .filter((f) => f.type === "output")
    .map((f) => f.data)
    .join("");
  const paneError = paneText.match(
    /command not found|unknown option|invalid (value|choice)|No conversation found/,
  );
  check(
    !streamFrames.some((f) => f.type === "ended") &&
      paneText.trim().length > 0 &&
      paneError === null,
    "TUI pane 内 CLI 已启动（有界面输出、无 argv/shell 报错、未立即退出）",
    paneError
      ? `报错：${paneError[0]}`
      : `${paneText.trim().length} chars，尾：${paneText.trim().slice(-120)}`,
  );
  const claudeFrames = await collectFrames(claudeStreamUrl(claudeId), (f) => f.type === "error");
  check(
    claudeFrames.some((f) => f.type === "error" && f.code === "SESSION_STATE_CONFLICT"),
    "terminal 形态 claude-stream 被拒（防同 id 双写 JSONL）",
    JSON.stringify(claudeFrames.slice(0, 1)),
  );

  // 3.5 CLI 真加载 hooks（--settings 断链修复实证）：向 pane 提交一句话，UserPromptSubmit
  // hook（经 --settings 挂载）printf 写状态文件——不再手工写 token，验证「CLI → hook →
  // 状态文件」全链。轮询状态文件本体而非 detail.status（后者还叠了 watcher/状态机层）。
  const send = Bun.spawnSync(["tmux", "send-keys", "-t", runtimeKey, "probe hook verify", "Enter"]);
  check(send.exitCode === 0, "tmux send-keys 提交触发语", `exit=${send.exitCode}`);
  let hookToken = "";
  for (let i = 0; i < 100 && hookToken !== "user_input"; i++) {
    hookToken = (await readFile(statusPath(runtimeKey), "utf8").catch(() => "")).trim();
    if (hookToken !== "user_input") await sleep(100);
  }
  check(
    hookToken === "user_input",
    "CLI 真加载 hooks：UserPromptSubmit 写状态文件（--settings 接通）",
    `token=${hookToken || "(空)"}`,
  );

  // 4/5 状态文件信号驱动状态机（关键三态）+ idle-only 门槛
  await writeFile(statusPath(runtimeKey), "user_input");
  let observed = "";
  for (let i = 0; i < 100 && observed !== "working"; i++) {
    observed = (await getDetail(claudeId))?.status ?? "";
    if (observed !== "working") await sleep(50);
  }
  check(observed === "working", "状态文件 user_input → working", observed);
  const busySwitch = await postMode(claudeId, "chat");
  check(
    busySwitch.status === 409 && busySwitch.body.error?.code === "SESSION_STATE_CONFLICT",
    "working 中切换 → 409（严格 idle-only）",
    `status=${busySwitch.status} code=${busySwitch.body.error?.code}`,
  );

  await writeFile(statusPath(runtimeKey), "approval");
  for (let i = 0; i < 100 && observed !== "blocked"; i++) {
    observed = (await getDetail(claudeId))?.status ?? "";
    if (observed !== "blocked") await sleep(50);
  }
  check(observed === "blocked", "状态文件 approval → blocked", observed);

  await writeFile(statusPath(runtimeKey), "turn_done");
  for (let i = 0; i < 100 && observed !== "done"; i++) {
    observed = (await getDetail(claudeId))?.status ?? "";
    if (observed !== "done") await sleep(50);
  }
  check(observed === "done", "状态文件 turn_done → done", observed);

  // 6 切回 chat
  const toChat = await postMode(claudeId, "chat");
  check(toChat.status === 200, "POST /mode chat → 200", `status=${toChat.status}`);
  check(
    (await getDetail(claudeId))?.mode === "chat",
    "详情回读 mode = chat",
    (await getDetail(claudeId))?.mode,
  );
  const filesGone = await Promise.all(
    [statusPath(runtimeKey), settingsPath(runtimeKey)].map((p) =>
      readFile(p, "utf8").then(
        () => false,
        () => true,
      ),
    ),
  );
  check(filesGone.every(Boolean), "状态/settings 文件随形态切换清理");

  // 7 切回 chat 后 claude-stream 可连（收到启动标记而非错误帧）
  const chatFrames = await collectFrames(
    claudeStreamUrl(claudeId),
    (f) => f.type === "session_init" || f.type === "history_start" || f.type === "error",
  );
  check(
    chatFrames.length > 0 && !chatFrames.some((f) => f.type === "error"),
    "切回 chat 后 claude-stream 可连（无守卫错误）",
    JSON.stringify(chatFrames.slice(0, 1)),
  );

  // 8 非 claude provider → 404
  const ompRes = await fetch(`${API}/api/projects/${PROJECT}/agent-sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ provider: "omp", displayName: `${MARKER} omp` }),
  });
  ompId = (await ompRes.json()).session?.id;
  if (ompId) {
    const ompMode = await postMode(ompId, "terminal");
    check(ompMode.status === 404, "非 claude provider /mode → 404", `status=${ompMode.status}`);
    check((await getDetail(ompId))?.mode === undefined, "omp 会话形态不被改写");
  }
} finally {
  // 清理：只关自建会话（terminal 形态走 tmux kill 路径；状态/settings 文件随 close 拆除）。
  // PROBE_KEEP=1 跳过（调试挂起现场用，手动清理）。
  if (process.env.PROBE_KEEP !== "1") {
    if (claudeId) await closeSession(claudeId);
    if (ompId) await closeSession(ompId);
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "SOME FAILED"}: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
