// probe-pi-stream.mjs —— Phase 3 pi-stream WS 探针（api-only，无浏览器，无 ar-verify-css 闸）。
//
//   unconfigured 路径（CI 安全，确定性）：settings.runtimes.pi 未配置时，open WS →
//     断言首帧 {type:"error", code:"SESSION_NOT_CONFIGURED"} → close chat → 断言元数据 +
//     pi-jsonl/<id>/ 均删（closeHook 兜底）。
//   configured 路径：pi 已配置 = live-LLM 手动验证域（CLAUDE.md live-stream-only 约定），
//     探针跳过并提示手动 checklist。
//
// 密码自读（scripts/lib/deploy-config.mjs），token 走 query（与 probe-claude-detail-perf 同范式）。
// 用法：bun scripts/probe-pi-stream.mjs
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readAppPassword } from "./lib/deploy-config.mjs";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const WS = process.env.WS_ORIGIN ?? "ws://127.0.0.1:43011";

const results = [];
const check = (ok, name, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}${detail ? ` — ${detail}` : ""}`);
};

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

// ── 探测 pi 是否已配置（v5：presets 非空且 activePresetId 命中） ──
const settingsRes = await fetch(`${API}/api/settings`, { headers: auth });
if (!settingsRes.ok) throw new Error(`GET /api/settings failed: ${settingsRes.status}`);
const settingsBody = await settingsRes.json();
// 响应外层包 {settings: {runtimes: {...}}}（见 settings-routes GET /api/settings）。
const settings = settingsBody.settings ?? settingsBody;
const pi = settings.runtimes?.pi;
const piConfigured = !!pi && pi.presets?.length > 0 && !!pi.activePresetId;

if (piConfigured) {
  console.log("\n⚠️  runtimes.pi 已配置 —— 未配置路径不可测，本次跳过。");
  console.log(
    "   live-LLM 流式对话 + 历史回放为手动验证域（CLAUDE.md live-stream-only 约定），请用户在网页手动验证：",
  );
  console.log("   ① chat 会话点进 detail 发消息；");
  console.log("   ② 断言收到 pi_event（message_start/text_delta）+ pi_user_echo；");
  console.log("   ③ agent_settled → 收 ended；");
  console.log("   ④ GET /api/chat-sessions/:id 显示 piSessionId backfill。");
  console.log(
    "   ⑤ 刷新页面 → history_start count>0 + 历史消息帧 + history_end + live 续流（Phase 4 JSONL 回放）；",
  );
  console.log("   ⑥ API 重启（tmux 重启 ar-dev api）后重连 → 历史仍在（loadHistory 从磁盘重建）。");
  console.log(
    "   历史回放的确定性断言已由 api/src/pi-runtime.test.ts 覆盖（chat-with-history / fresh-chat fixture）。",
  );
  console.log(`\n${results.length} pass / ${results.length} fail (skipped: configured)`);
  process.exit(0);
}

// ── unconfigured 路径 ──
let chatId = null;
try {
  const createRes = await fetch(`${API}/api/chat-sessions`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ displayName: "pi-stream probe" }),
  });
  if (!createRes.ok) throw new Error(`create chat failed: ${createRes.status}`);
  const { session } = await createRes.json();
  chatId = session.id;
  console.log(`[ok] created chat id=${chatId}`);

  // open WS → 断言首帧 SESSION_NOT_CONFIGURED
  const wsUrl = `${WS}/api/chat-sessions/${encodeURIComponent(chatId)}/stream?token=${encodeURIComponent(token)}`;
  let firstFrame = null;
  let wsError = null;
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      wsError = "timeout waiting first frame";
      try {
        ws.close();
      } catch {}
      resolve();
    }, 8000);
    ws.addEventListener("message", (ev) => {
      if (firstFrame !== null) return;
      clearTimeout(timer);
      firstFrame = JSON.parse(ev.data);
      resolve();
    });
    ws.addEventListener("error", (e) => {
      clearTimeout(timer);
      wsError = e.message ?? "ws error";
      resolve();
    });
    ws.addEventListener("close", (e) => {
      clearTimeout(timer);
      if (firstFrame === null && !wsError) wsError = `closed code=${e.code}`;
      resolve();
    });
  });
  try {
    ws.close();
  } catch {}

  if (wsError) {
    check(false, "open → SESSION_NOT_CONFIGURED 首帧", wsError);
  } else {
    check(
      firstFrame?.type === "error" && firstFrame?.code === "SESSION_NOT_CONFIGURED",
      "open → SESSION_NOT_CONFIGURED 首帧",
      JSON.stringify(firstFrame),
    );
  }
} finally {
  // 无论 WS 断言成败，都 close chat（元数据 + pi-jsonl 清理），防残留「pi-stream probe」行。
  if (chatId) {
    try {
      await fetch(`${API}/api/chat-sessions/${encodeURIComponent(chatId)}/close`, {
        method: "POST",
        headers: auth,
      });
    } catch {}
  }
}

// ── close 后清理断言 ──
const detailRes = await fetch(`${API}/api/chat-sessions/${encodeURIComponent(chatId)}`, {
  headers: auth,
});
check(detailRes.status === 404, "close 后元数据已删（GET 404）", `status=${detailRes.status}`);

const jsonlDir = join(homedir(), ".agents-remote/chat-sessions/pi-jsonl", chatId);
check(!existsSync(jsonlDir), "close 后 pi-jsonl/<chatId>/ 已删（closeHook 兜底 rm）", jsonlDir);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} pass / ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
