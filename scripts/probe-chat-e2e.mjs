// probe-chat-e2e.mjs —— Phase 4 真实端到端（configured 路径）：创建 chat → WS 流式
// 对话（pi_user_echo + pi_event 帧）→ agent_settled 收 ended → 重开 WS 断言 JSONL
// 历史回放（resume:true + history_start count>0 + 回放帧）→ 关闭 chat 清理。
//
// 需 runtimes.pi 已配置（agnes preset，apiKey/baseUrl 已在 settings.yaml）——本脚本
// 是 live-LLM 验证域，由用户要求跑；CI 安全路径（unconfigured）见 probe-pi-stream.mjs。
//
// 帧解析镜像 web pi-adapter 的批处理状态机：history/live 窗口内 gzip 二进制批 →
// 解压拆行缓冲，end marker 批量处理；窗口外单行文本帧直接处理。
// 用法：bun scripts/probe-chat-e2e.mjs
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readAppPassword } from "./lib/deploy-config.mjs";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const WS = process.env.WS_ORIGIN ?? "ws://127.0.0.1:43011";
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? 90_000); // 真实 LLM 一次 turn 上限

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

// ── 0. 探测 pi 已配置（settings 外层包 {settings: {runtimes}}） ──
const settingsRes = await fetch(`${API}/api/settings`, { headers: auth });
if (!settingsRes.ok) throw new Error(`GET /api/settings failed: ${settingsRes.status}`);
const settingsBody = await settingsRes.json();
const settings = settingsBody.settings ?? settingsBody;
const pi = settings.runtimes?.pi;
const piConfigured = !!pi && pi.presets?.length > 0 && !!pi.activePresetId;
if (!piConfigured) {
  console.log("[SKIP] runtimes.pi 未配置——真实端到端不可测（先配 preset 再跑）");
  process.exit(0);
}

// ── WS 帧收集器（镜像 pi-adapter 批处理状态机） ──
// 返回 { ws, frames, send, close, waitFor }。frames 为已处理行（去重）；waitFor
// 轮询 predicates 列表直到满足或超时（帧在批处理时逐条 push，不依赖 message 事件节拍）。
function openStream(cid) {
  const wsUrl = `${WS}/api/chat-sessions/${encodeURIComponent(cid)}/stream?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";

  const frames = [];
  const waiters = []; // { pred, resolve }
  const maybeSettle = () => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(frames)) {
        waiters.splice(i, 1)[0].resolve(frames);
      }
    }
  };
  const waitFor = (pred, timeoutMs = TURN_TIMEOUT_MS) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      waiters.push({
        pred,
        resolve: (f) => {
          clearTimeout(timer);
          resolve(f);
        },
      });
      maybeSettle();
    });

  const decompressGzip = async (buf) => {
    const stream = new Response(buf).body.pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  };

  let historyBatch = null;
  let liveBatch = null;
  const flush = (batch, marker) => {
    for (const msg of batch) {
      frames.push(msg);
    }
    if (marker) frames.push(marker);
    maybeSettle();
  };

  // 与 web pi-adapter 同构：start/end marker 也入 frames（probe 要断言 count，不消费）。
  // gzip 二进制批与文本帧用 promise chain 串行（镜像 pi-adapter 的 blobInFlight 逻辑），
  // 防 end marker 文本先到、把 batch 置 null 后解压行被丢。
  const handleTextFrame = (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "history_start") {
      historyBatch = [];
      frames.push(msg);
      maybeSettle();
      return;
    }
    if (msg.type === "history_end") {
      const batch = historyBatch ?? [];
      historyBatch = null;
      flush(batch, { type: "history_end" });
      return;
    }
    if (msg.type === "live_start") {
      liveBatch = [];
      frames.push(msg);
      maybeSettle();
      return;
    }
    if (msg.type === "live_end") {
      const batch = liveBatch ?? [];
      liveBatch = null;
      flush(batch, { type: "live_end" });
      return;
    }
    if (historyBatch) {
      historyBatch.push(msg);
      return;
    }
    if (liveBatch) {
      liveBatch.push(msg);
      return;
    }
    flush([msg]);
  };

  const handleBinaryBatch = async (buf) => {
    const text = await decompressGzip(buf);
    const target = historyBatch ?? liveBatch;
    if (!target) return;
    if (text.length > 0) {
      for (const line of text.split("\n")) {
        if (!line) continue;
        try {
          target.push(JSON.parse(line));
        } catch {
          // skip malformed line
        }
      }
    }
  };

  // 二进制批异步解压——串行 promise chain 保序（镜像 pi-adapter）。blobInFlight 期间
  // 到达的文本帧排队等链前续解压完成，避免 end marker 提前冲掉 batch 窗口。
  let blobInFlight = false;
  let chain = Promise.resolve();
  ws.addEventListener("message", (ev) => {
    if (ev.data instanceof ArrayBuffer) {
      blobInFlight = true;
      chain = chain
        .then(() => handleBinaryBatch(ev.data))
        .catch((e) => console.error("[probe] binary batch error", e))
        .finally(() => {
          blobInFlight = false;
        });
      return;
    }
    if (blobInFlight) {
      chain = chain
        .then(() => handleTextFrame(ev.data))
        .catch((e) => console.error("[probe] handleFrame error", e));
      return;
    }
    handleTextFrame(ev.data);
  });
  ws.addEventListener("open", () => console.log("[ok] ws open"));
  ws.addEventListener("error", (e) => console.error("[probe] ws error", e.message ?? e));

  const send = (data) => ws.send(JSON.stringify(data));
  const close = () => {
    try {
      ws.close();
    } catch {}
  };
  return { ws, frames, send, close, waitFor };
}

let chatId = null;
try {
  // ── 1. 创建 chat ──
  const createRes = await fetch(`${API}/api/chat-sessions`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ displayName: "pi-chat-e2e probe" }),
  });
  if (!createRes.ok) throw new Error(`create chat failed: ${createRes.status}`);
  const { session } = await createRes.json();
  chatId = session.id;
  check(true, "create chat", `id=${chatId}`);

  // ── 2. 首连（空历史）→ 发消息 → 等 turn 完成 ──
  console.log(`\n── [1] 首连 + 发消息 ──`);
  const c1 = openStream(chatId);
  // 等完整批（session_init → history_* → live_*）到齐再断言 markers；只等 session_init
  // 会漏掉尚在途的后序帧。
  await c1.waitFor(
    (f) => f.some((x) => x.type === "history_end") && f.some((x) => x.type === "live_end"),
  );
  const init1 = c1.frames.find((x) => x.type === "session_init");
  check(init1?.type === "session_init" && init1.resume === false, "首连 session_init resume:false");
  const hs1 = c1.frames.find((x) => x.type === "history_start");
  check(hs1?.type === "history_start" && hs1.count === 0, "首连 history_start count:0");
  check(
    c1.frames.some((x) => x.type === "live_start") && c1.frames.some((x) => x.type === "live_end"),
    "首连 live_start/live_end markers",
  );

  const prompt = "你好，pi！用一句话回复即可。";
  c1.send({ type: "user", text: prompt, uuid: "e2e-uuid-1" });
  console.log(`[ok] sent prompt: "${prompt}"`);

  // 等 assistant turn 完成：收到 message_end{assistant} + ended（agent_settled 广播）。
  await c1.waitFor((f) => f.some((x) => x.type === "ended"));
  const echo = c1.frames.find((x) => x.type === "pi_user_echo" && x.uuid === "e2e-uuid-1");
  check(
    !!echo && echo.text === prompt,
    "pi_user_echo 回显（uuid 对齐）",
    JSON.stringify(echo ?? null),
  );
  const asstMsgs = c1.frames.filter(
    (x) =>
      x.type === "pi_event" &&
      x.event?.type === "message_start" &&
      x.event?.message?.role === "assistant",
  );
  const asstEnd = c1.frames.find(
    (x) =>
      x.type === "pi_event" &&
      x.event?.type === "message_end" &&
      x.event?.message?.role === "assistant",
  );
  check(asstMsgs.length > 0, "收到 assistant message_start", `count=${asstMsgs.length}`);
  const asstText = extractAssistantText(asstEnd?.event?.message);
  check(
    !!asstEnd && asstText.trim().length > 0,
    "assistant message_end 终态含文本",
    asstText.trim().slice(0, 60),
  );
  check(
    c1.frames.some((x) => x.type === "ended"),
    "agent_settled → 收 ended",
  );
  c1.close();

  // ── 3. 重开 WS：live 缓冲回放（会话保活，不重建——同进程重连语义） ──
  // 注：ensureRunning 在 sessions.has(chatId) 时幂等，重连不重建 AgentSession。重连者从
  // 同一 relay 收 history(定格于首帧 JSONL, 空) + live(buffer 全量)——故 resume:false +
  // history count:0 + live 帧回放是**正确行为**。跨 API 重启的 JSONL 磁盘回放
  // （resume:true + count>0）由 pi-runtime.test.ts fixture 确定性覆盖，probe 内无法触发。
  console.log(`\n── [2] 重开（live 缓冲回放） ──`);
  const c2 = openStream(chatId);
  await c2.waitFor((f) => f.some((x) => x.type === "live_end"));
  const init2 = c2.frames.find((x) => x.type === "session_init");
  check(
    init2?.type === "session_init" && init2.resume === false,
    "重连 session_init resume:false（会话保活）",
  );
  const hs2 = c2.frames.find((x) => x.type === "history_start");
  check(
    hs2?.type === "history_start" && hs2.count === 0,
    "重连 history_start count:0（定格于空 JSONL）",
  );
  const ls2 = c2.frames.find((x) => x.type === "live_start");
  check(
    ls2?.type === "live_start" && ls2.count > 0,
    "重连 live_start count>0",
    `count=${ls2?.count}`,
  );
  const replayedUser = c2.frames.find(
    (x) =>
      x.type === "pi_event" &&
      x.event?.type === "message_start" &&
      x.event?.message?.role === "user",
  );
  const replayedUserText = replayedUser ? extractAssistantText(replayedUser.event.message) : "";
  check(
    !!replayedUser && replayedUserText.includes(prompt),
    "重连回放 user 消息帧（live buffer）",
    JSON.stringify(replayedUser?.event?.message ?? null),
  );
  const replayedAsst = c2.frames.find(
    (x) =>
      x.type === "pi_event" &&
      x.event?.type === "message_end" &&
      x.event?.message?.role === "assistant",
  );
  check(
    !!replayedAsst && (extractAssistantText(replayedAsst.event.message) ?? "").trim().length > 0,
    "重连回放 assistant 终态帧（live buffer）",
  );
  check(
    c2.frames.some((x) => x.type === "history_end") && c2.frames.some((x) => x.type === "live_end"),
    "重连 history_end + live_end",
  );
  c2.close();
} finally {
  if (chatId) {
    try {
      await fetch(`${API}/api/chat-sessions/${encodeURIComponent(chatId)}/close`, {
        method: "POST",
        headers: auth,
      });
    } catch {}
  }
}

// ── 清理断言 ──
if (chatId) {
  const detailRes = await fetch(`${API}/api/chat-sessions/${encodeURIComponent(chatId)}`, {
    headers: auth,
  });
  check(detailRes.status === 404, "close 后元数据已删（GET 404）", `status=${detailRes.status}`);
  const jsonlDir = join(homedir(), ".agents-remote/chat-sessions/pi-jsonl", chatId);
  check(!existsSync(jsonlDir), "close 后 pi-jsonl/<chatId>/ 已删", jsonlDir);
}

// assistant 消息 content 提取文本（TextContent 数组）。
function extractAssistantText(message) {
  if (!message?.content) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} pass / ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
