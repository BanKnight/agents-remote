// probe-chat-firecrawl.mjs —— chat 模式 firecrawl 工具链路复现探针：
// 创建 chat → WS 连接 → 发一条必须联网搜索的指令 → 逐帧收集 tool_use / tool_result /
// assistant 文本 → 断言模型是否可见并调用 firecrawl_*、execute 是否返回可用数据。
// 只收集第一手帧，不做任何修复假设。数据自清理（close 删元数据 + pi-jsonl）。
// 用法：bun scripts/probe-chat-firecrawl.mjs
import { readAppPassword } from "./lib/deploy-config.mjs";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const WS = process.env.WS_ORIGIN ?? "ws://127.0.0.1:43011";
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? 120_000);

const pw = await readAppPassword();
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: pw }),
});
if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
const { token } = await loginRes.json();
const auth = { authorization: `Bearer ${token}` };

// 收集器：与 probe-chat-e2e 同构（gzip 批 + markers）。
function openStream(cid) {
  const wsUrl = `${WS}/api/chat-sessions/${encodeURIComponent(cid)}/stream?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";
  const frames = [];
  const waiters = [];
  const maybeSettle = () => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(frames)) waiters.splice(i, 1)[0].resolve(frames);
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
  const decompress = async (buf) =>
    await new Response(new Response(buf).body.pipeThrough(new DecompressionStream("gzip"))).text();
  let historyBatch = null,
    liveBatch = null;
  const flush = (batch, marker) => {
    for (const m of batch) frames.push(m);
    if (marker) frames.push(marker);
    maybeSettle();
  };
  const handleText = (raw) => {
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
      flush(historyBatch ?? [], { type: "history_end" });
      historyBatch = null;
      return;
    }
    if (msg.type === "live_start") {
      liveBatch = [];
      frames.push(msg);
      maybeSettle();
      return;
    }
    if (msg.type === "live_end") {
      flush(liveBatch ?? [], { type: "live_end" });
      liveBatch = null;
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
  const handleBin = async (buf) => {
    const text = await decompress(buf);
    const target = historyBatch ?? liveBatch;
    if (!target) return;
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        target.push(JSON.parse(line));
      } catch {}
    }
  };
  let chain = Promise.resolve();
  ws.addEventListener("message", (ev) => {
    if (ev.data instanceof ArrayBuffer) {
      chain = chain.then(() => handleBin(ev.data)).catch(() => {});
      return;
    }
    chain = chain.then(() => handleText(ev.data)).catch(() => {});
  });
  const send = (d) => ws.send(JSON.stringify(d));
  const close = () => {
    try {
      ws.close();
    } catch {}
  };
  return { ws, frames, send, close, waitFor };
}

// 从帧流提取人类可读摘要。
function summarize(frames) {
  const out = [];
  for (const f of frames) {
    if (f.type === "pi_event" && f.event) {
      const e = f.event;
      if (e.type === "message_start" || e.type === "message_end") {
        const role = e.message?.role;
        const content = e.message?.content;
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c.type === "text")
              out.push(`[${e.type}/${role}] text: ${(c.text ?? "").slice(0, 150)}`);
            else if (c.type === "thinking")
              out.push(`[${e.type}/${role}] thinking(${(c.thinking ?? "").length} chars)`);
            else out.push(`[${e.type}/${role}] block: ${JSON.stringify(c).slice(0, 200)}`);
          }
        }
      } else if (e.type === "tool_execution_start") {
        out.push(`[tool_start] ${e.toolName} args=${JSON.stringify(e.args ?? {}).slice(0, 160)}`);
      } else if (e.type === "tool_execution_end") {
        out.push(
          `[tool_end] ${e.toolName} isError=${e.isError} result=${JSON.stringify(e.result ?? {}).slice(0, 300)}`,
        );
      } else {
        out.push(`[pi_event] ${e.type} ${JSON.stringify(e).slice(0, 120)}`);
      }
    } else if (
      !["history_start", "history_end", "live_start", "live_end", "ping"].includes(f.type)
    ) {
      out.push(`[${f.type}] ${JSON.stringify(f).slice(0, 140)}`);
    }
  }
  return out;
}

let chatId = null;
try {
  const createRes = await fetch(`${API}/api/chat-sessions`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ displayName: "probe-firecrawl" }),
  });
  if (!createRes.ok) throw new Error(`create chat failed: ${createRes.status}`);
  chatId = (await createRes.json()).session.id;
  console.log(`[ok] chat id=${chatId}`);

  const c1 = openStream(chatId);
  await c1.waitFor(
    (f) => f.some((x) => x.type === "history_end") && f.some((x) => x.type === "live_end"),
  );
  c1.close();

  // 直接探测 SDK 工具可见性：服务端有没有把 firecrawl 工具交给模型？
  // 证据 1：明确要求用 firecrawl_search 的指令 → 看 tool_execution_start 是否出现。
  const c2 = openStream(chatId);
  await c2.waitFor((f) => f.some((x) => x.type === "live_end"));
  c2.send({
    type: "user",
    text: '请用 firecrawl_search 工具搜索 "bun runtime latest version"，然后用一句话告诉我第一个结果的标题。',
    uuid: "probe-fc-1",
  });
  console.log("[ok] sent: 明确指定 firecrawl_search 的搜索请求");
  const done = await c2.waitFor((f) => f.some((x) => x.type === "ended"));
  c2.close();

  const summary = done ? summarize(done) : [];
  console.log("\n=== 全部帧摘要 ===");
  for (const s of summary.slice(-40)) console.log(s);

  // 断言层
  const toolStarts = (done ?? []).filter(
    (f) =>
      f.type === "pi_event" &&
      f.event?.type === "tool_execution_start" &&
      String(f.event.toolName ?? "").startsWith("firecrawl"),
  );
  const toolEnds = (done ?? []).filter(
    (f) =>
      f.type === "pi_event" &&
      f.event?.type === "tool_execution_end" &&
      String(f.event.toolName ?? "").startsWith("firecrawl"),
  );
  // 选最后一个 assistant message_end：turn 内 thinking 先以独立 message_end 收口，
  // 带 text 的才是终态（first 命中 thinking-only 帧 → extractText 为空的假阴性）。
  const asstEnd = [...(done ?? [])]
    .reverse()
    .find(
      (f) =>
        f.type === "pi_event" &&
        f.event?.type === "message_end" &&
        f.event.message?.role === "assistant",
    );
  const asstText = asstEnd
    ? (asstEnd.event.message.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("")
    : "";

  console.log(`\n=== 结论 ===`);
  console.log(
    `${toolStarts.length > 0 ? "[PASS]" : "[FAIL]"} 模型调用了 firecrawl_*（tool_execution_start=${toolStarts.length}）`,
  );
  for (const t of toolEnds) {
    const ok = !t.event.isError;
    console.log(
      `${ok ? "[PASS]" : "[FAIL]"} ${t.event.toolName} execute 完成 isError=${t.event.isError}`,
    );
    const txt = JSON.stringify(t.event.result ?? "");
    console.log(`       result 前 400 字符: ${txt.slice(0, 400)}`);
  }
  console.log(
    `${asstText.trim() ? "[PASS]" : "[FAIL]"} assistant 终态文本: ${asstText.trim().slice(0, 200)}`,
  );

  const failed =
    toolStarts.length === 0 ||
    toolEnds.length !== toolStarts.length ||
    toolEnds.some((t) => t.event.isError) ||
    !asstText.trim();
  process.exit(failed ? 1 : 0);
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
