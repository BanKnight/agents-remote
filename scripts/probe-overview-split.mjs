// 验证 overview 两阶段拆分：核心 /api/overview 毫秒级（无 subtitle）+ /api/overview/subtitles 独立返回。
// 密码自读（env → config.yaml → /proc/<api-pid>/environ），不进 agent 上下文、不打印值。
// 用法：node scripts/probe-overview-split.mjs
import { readAppPassword } from "./lib/deploy-config.mjs";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const N = Number(process.env.N ?? 6);

const pw = await readAppPassword();
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: pw }),
});
if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
const { token } = await loginRes.json();
const auth = { authorization: `Bearer ${token}` };
console.log("[ok] login");

// ── 核心 /api/overview（应无 subtitle，毫秒级）──
console.log(`\n=== GET /api/overview（核心列表，应无 subtitle）×${N} ===`);
const coreTimes = [];
let coreCandidates = 0;
let withSubtitle = 0;
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  const r = await fetch(`${API}/api/overview`, { headers: auth });
  const body = await r.json();
  const dt = performance.now() - t0;
  coreTimes.push(dt);
  coreCandidates = (body.candidates ?? []).length;
  withSubtitle = (body.candidates ?? []).filter((c) => c.subtitle != null).length;
  console.log(
    `  #${i + 1}: ${dt.toFixed(1).padStart(7)}ms  status=${r.status}  candidates=${coreCandidates}  带subtitle=${withSubtitle}`,
  );
}
const cs = [...coreTimes].sort((a, b) => a - b);
console.log(
  `  → 中位=${cs[Math.floor(cs.length / 2)].toFixed(1)}ms  min=${cs[0].toFixed(1)}ms  max=${cs[cs.length - 1].toFixed(1)}ms`,
);
console.log(
  `  → 核心响应带 subtitle 的候选数应为 0（已剥离）：${withSubtitle === 0 ? "✓ PASS" : "✗ FAIL"}`,
);

// ── /api/overview/subtitles（独立端点）──
console.log(`\n=== GET /api/overview/subtitles（第二阶段）×${N} ===`);
const subTimes = [];
let subCount = 0;
let subStatus = 0;
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  const r = await fetch(`${API}/api/overview/subtitles`, { headers: auth });
  subStatus = r.status;
  const body = await r.json();
  const dt = performance.now() - t0;
  subTimes.push(dt);
  subCount = Object.keys(body.subtitles ?? {}).length;
  console.log(
    `  #${i + 1}: ${dt.toFixed(1).padStart(7)}ms  status=${r.status}  subtitles=${subCount}`,
  );
}
const ss = [...subTimes].sort((a, b) => a - b);
console.log(
  `  → 中位=${ss[Math.floor(ss.length / 2)].toFixed(1)}ms  min=${ss[0].toFixed(1)}ms  max=${ss[ss.length - 1].toFixed(1)}ms`,
);
console.log(
  `  → 端点存在（非 404）：${subStatus === 200 ? "✓ PASS" : `✗ FAIL (status=${subStatus})`}`,
);

console.log("\n[done]");
