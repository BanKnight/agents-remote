// 探针：API 重启后 terminal 形态会话的 status watcher 是否被 hydrate 重挂（双模式，
// 2026-10-15）。这条路径单测覆盖不到：tmux pane 独立于 API 存活，但内存里的 fs.watch 随
// 进程消失——index.ts startApi 的 hydrate 不补，重启后 TUI 状态点就永久停更。
// 流程：建会话 → 切 terminal → 状态文件 user_input（证切换期 watcher 在）→ respawn ar-dev
// api（runbook 标准重启）→ 重启后 metadata.mode 仍 terminal + working 归一 idle →
// 状态文件 turn_done → watcher 真重挂则翻 done。
// ⚠️ 本探针会重启 ar-dev api（会打断正在使用的会话面板连接，随后自动重连）。
// 密码自读不打印（scripts/lib/deploy-config.mjs）；只清理 displayName 以 "[probe-hydrate]"
// 标记的自建会话（含崩溃残留）。
// 用法：systemd-run --scope --user -p MemoryMax=2G bun scripts/probe-agent-tui-hydrate.mjs
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readAppPassword } from "./lib/deploy-config.mjs";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const PROJECT = process.env.PROBE_PROJECT ?? "test";
const MARKER = "[probe-hydrate]";
const RUN_DIR =
  process.env.AGENTS_REMOTE_RUN_DIR ??
  (process.env.XDG_RUNTIME_DIR
    ? `${process.env.XDG_RUNTIME_DIR}/agents-remote`
    : "/run/user/1000/agents-remote");

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pw = await readAppPassword();
const login = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: pw }),
});
const { token } = await login.json();
const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const getDetail = async (id) =>
  (
    await (
      await fetch(`${API}/api/projects/${PROJECT}/agent-sessions/${id}`, { headers: auth })
    ).json()
  ).session;
const waitStatus = async (id, expected, ms = 8000) => {
  const until = Date.now() + ms;
  let seen = "";
  while (Date.now() < until) {
    seen = (await getDetail(id))?.status ?? "";
    if (seen === expected) return seen;
    await sleep(100);
  }
  return seen;
};

// 清理自建残留
const listed = await (
  await fetch(`${API}/api/projects/${PROJECT}/agent-sessions`, { headers: auth })
).json();
for (const s of listed.sessions ?? []) {
  if (s.displayName?.startsWith(MARKER)) {
    await fetch(`${API}/api/projects/${PROJECT}/agent-sessions/${s.id}/close`, {
      method: "POST",
      headers: auth,
    });
  }
}

const created = (
  await (
    await fetch(`${API}/api/projects/${PROJECT}/agent-sessions`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ provider: "claude", displayName: MARKER }),
    })
  ).json()
).session;
const id = created.id;
try {
  const switched = await fetch(`${API}/api/projects/${PROJECT}/agent-sessions/${id}/mode`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ mode: "terminal" }),
  });
  check(switched.status === 200, "切 terminal 200", `status=${switched.status}`);
  const meta = JSON.parse(await readFile(join(RUN_DIR, "sessions", `${id}.json`), "utf8"));
  const statusFile = join(RUN_DIR, "agent-status", meta.runtimeKey);

  await writeFile(statusFile, "user_input");
  check((await waitStatus(id, "working")) === "working", "重启前 watcher 在：user_input → working");

  // 重启 API（runbook 标准重启）
  Bun.spawnSync([
    "tmux",
    "respawn-pane",
    "-k",
    "-t",
    "ar-dev:api",
    "bun run --filter @agents-remote/api dev",
  ]);
  let health = 0;
  for (let i = 0; i < 60 && health !== 200; i++) {
    await sleep(500);
    health = await fetch(`${API}/api/health`).then(
      (r) => r.status,
      () => 0,
    );
  }
  check(health === 200, "API 重启后 health 200", `health=${health}`);
  const afterRestart = await getDetail(id);
  check(afterRestart?.mode === "terminal", "重启后形态仍 terminal（落盘恢复）", afterRestart?.mode);
  check(
    afterRestart?.status === "idle",
    "重启后 working 归一 idle（parseMetadata）",
    afterRestart?.status,
  );

  // 关键断言：重启后写状态文件，watcher 若被 hydrate 重挂则应翻 done
  await writeFile(statusFile, "turn_done");
  const done = await waitStatus(id, "done");
  check(done === "done", "重启后 watcher 已重挂（hydrate）：turn_done → done", done);
} finally {
  await fetch(`${API}/api/projects/${PROJECT}/agent-sessions/${id}/close`, {
    method: "POST",
    headers: auth,
  });
}
console.log(`\n${fail === 0 ? "ALL PASS" : "SOME FAILED"}: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
