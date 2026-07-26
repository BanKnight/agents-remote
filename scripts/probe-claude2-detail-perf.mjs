// 测进入 Claude2 detail 的服务端耗时分解，回答"是否变慢、慢在哪"。
//   GET  agent-session/:id  → getAgentSession + parseClaudePermissionModes(首次 spawn claude --help，后续缓存)
//                             + settingsStore.read(每次 readFile 读盘，无缓存) + buildAvailableAliases(纯计算)
//   WS   claude2-stream      → relay.activate(读 JSONL history) → seed_init(含 modelAlias) → history → live
// 密码自读（env → config.toml → /proc/<api-pid>/environ），不进 agent 上下文、不打印值。
// 用法：node scripts/probe-claude2-detail-perf.mjs
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const PROJECTS = (process.env.PROBE_PROJECTS ?? "test,novels,lang-partner,简易会话").split(",");
const N = Number(process.env.N ?? 6);

async function readPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const cfg = path.join(os.homedir(), ".agents-remote", "config.toml");
  try {
    const txt = await readFile(cfg, "utf8");
    const m = txt.match(/^app_password\s*=\s*["']([^"']*)["']/m);
    if (m && m[1]) return m[1];
  } catch {}
  try {
    const pid = execSync(
      "ss -ltnp 2>/dev/null | grep ':43011' | grep -oP 'pid=\\K[0-9]+' | head -1",
      { encoding: "utf8" },
    ).trim();
    if (pid) {
      const env = await readFile(`/proc/${pid}/environ`, "utf8");
      const found = env.split("\0").find((e) => e.startsWith("APP_PASSWORD="));
      if (found) return found.slice("APP_PASSWORD=".length);
    }
  } catch {}
  throw new Error("password not found (env / config.toml / api environ 均无)");
}

const pw = await readPassword();
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: pw }),
});
if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
const { token } = await loginRes.json();
const auth = { authorization: `Bearer ${token}` };
console.log("[ok] login");

// 找一个 claude2 session
let session = null;
let projectName = null;
for (const p of PROJECTS) {
  const r = await fetch(`${API}/api/projects/${encodeURIComponent(p)}/agent-sessions`, {
    headers: auth,
  });
  if (!r.ok) continue;
  const { sessions } = await r.json();
  const found = (sessions ?? []).find((s) => s.provider === "claude2");
  if (found) {
    session = found;
    projectName = p;
    break;
  }
}
if (!session) {
  console.error("未找到 claude2 session，项目：", PROJECTS.join("/"));
  console.error("（test 项目没有 claude2 session；可先在 test 项目网页里建一个再测）");
  process.exit(1);
}
console.log(
  `[ok] project=${projectName} session=${session.id}\n` +
    `      claudeSessionId=${session.claudeSessionId ?? "none"} model=${session.model ?? "?"} modelAlias=${session.modelAlias ?? "?"} status=${session.status}`,
);

// ── GET agent-session/:id 多次计时 ──
const detailUrl = `${API}/api/projects/${encodeURIComponent(projectName)}/agent-sessions/${encodeURIComponent(session.id)}`;
console.log(
  `\n=== GET agent-session/:id 耗时（${N} 次，首次含 parseClaudePermissionModes spawn 'claude --help'）===`,
);
const times = [];
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  const r = await fetch(detailUrl, { headers: auth });
  const body = await r.json();
  const dt = performance.now() - t0;
  times.push(dt);
  const resolvedKeys = Object.keys(body.availableModelResolved ?? {});
  console.log(
    `  #${i + 1}: ${dt.toFixed(1).padStart(6)}ms  status=${r.status}  resolved=[${resolvedKeys.join(",")}]  models=${(body.availableModels ?? []).join("/")}`,
  );
}
const sorted = [...times].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(
  `  → 首次=${times[0].toFixed(1)}ms  后续中位=${median.toFixed(1)}ms  min=${sorted[0].toFixed(1)}ms  max=${sorted[sorted.length - 1].toFixed(1)}ms`,
);
console.log(
  `  → 首次−后续 ≈ parseClaudePermissionModes 首次 spawn 成本（cachedPermissionModes 缓存前）`,
);
console.log(
  `  → 后续稳定值 ≈ getAgentSession + settingsStore.read(读盘) + buildAvailableAliases + 网络`,
);

// ── WS claude2-stream 首帧延迟 ──
console.log(`\n=== WS /claude2-stream 首帧延迟（token 走 query）===`);
const wsUrl = `ws://127.0.0.1:43011/api/projects/${encodeURIComponent(projectName)}/agent-sessions/${encodeURIComponent(session.id)}/claude2-stream?token=${encodeURIComponent(token)}`;
await new Promise((resolve) => {
  const tOpen = { v: 0 };
  const milestones = {};
  let historyCount = 0;
  let firstHistoryAt = 0;
  const ws = new WebSocket(wsUrl);
  const stop = (reason) => {
    console.log(
      `  open=${fmt(tOpen.v)}ms  ${Object.entries(milestones)
        .map(([k, v]) => `${k}=${fmt(v)}ms`)
        .join("  ")}`,
    );
    console.log(`  history 行数=${historyCount}  首条history=${fmt(firstHistoryAt)}ms  ${reason}`);
    try {
      ws.close();
    } catch {}
    resolve();
  };
  const timer = setTimeout(() => stop("⏱ 8s 超时收尾"), 8000);
  ws.addEventListener("open", () => {
    tOpen.v = performance.now() - t0;
  });
  ws.addEventListener("error", (e) => {
    clearTimeout(timer);
    console.log("  WS error:", e.message ?? e);
    resolve();
  });
  ws.addEventListener("close", (e) => {
    clearTimeout(timer);
    stop(`close code=${e.code} reason=${e.reason ?? ""}`);
  });
  ws.addEventListener("message", (ev) => {
    const now = performance.now() - t0;
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === "system" && msg.subtype === "seed_init") milestones.seed_init = now;
    if (msg.type === "history_start") milestones.history_start = now;
    if (msg.type === "live_start") {
      milestones.live_start = now;
      clearTimeout(timer);
      stop("✓ live_start（回放完成进入实时）");
    }
    if (msg.type === "history_end") milestones.history_end = now;
    if (msg.type === "assistant" || msg.type === "user") {
      historyCount += 1;
      if (!firstHistoryAt) firstHistoryAt = now;
    }
  });
  const t0 = performance.now();
});
console.log("\n[done]");

function fmt(n) {
  return n ? n.toFixed(1) : "—";
}
