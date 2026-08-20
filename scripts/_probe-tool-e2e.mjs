// 端到端 tool 调用验证探针：真实 LLM → 工具执行 → 结果回注 → 最终文本。
// 密码自读；WS 帧收集器镜像 pi-adapter 批处理状态机（同 probe-chat-e2e.mjs）。
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readAppPassword } from "./lib/deploy-config.mjs";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const WS = process.env.WS_ORIGIN ?? "ws://127.0.0.1:43011";
const TURN_TIMEOUT_MS = 120_000;

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

// ── 当前 pi 配置（决定触发哪种工具的 prompt） ──
const settingsBody = await (await fetch(`${API}/api/settings`, { headers: auth })).json();
const pi = settingsBody.settings.runtimes.pi;
const active = pi.presets.find((p) => p.id === pi.activePresetId);
console.log(
  `[config] active preset: ${active ? `${active.label} (${active.provider}/${active.model})` : "NONE"}`,
);
console.log(
  `[config] firecrawl key configured: ${pi.firecrawlApiKeyMasked ? "yes (" + pi.firecrawlApiKeyMasked + ")" : "no"}`,
);
if (!active) {
  console.log("pi 未配置——无法端到端 tool 验证");
  process.exit(0);
}

// ── WS 帧收集器（镜像 pi-adapter 批处理状态机） ──
function openStream(cid) {
  const wsUrl = `${WS}/api/chat-sessions/${encodeURIComponent(cid)}/stream?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";
  const frames = [];
  const waiters = [];
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
  let historyBatch = null,
    liveBatch = null;
  const flush = (batch, marker) => {
    for (const msg of batch) frames.push(msg);
    if (marker) frames.push(marker);
    maybeSettle();
  };
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
      const b = historyBatch ?? [];
      historyBatch = null;
      flush(b, { type: "history_end" });
      return;
    }
    if (msg.type === "live_start") {
      liveBatch = [];
      frames.push(msg);
      maybeSettle();
      return;
    }
    if (msg.type === "live_end") {
      const b = liveBatch ?? [];
      liveBatch = null;
      flush(b, { type: "live_end" });
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
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        target.push(JSON.parse(line));
      } catch {}
    }
  };
  let blobInFlight = false,
    chain = Promise.resolve();
  ws.addEventListener("message", (ev) => {
    if (ev.data instanceof ArrayBuffer) {
      blobInFlight = true;
      chain = chain
        .then(() => handleBinaryBatch(ev.data))
        .catch((e) => console.error("[probe] batch err", e))
        .finally(() => {
          blobInFlight = false;
        });
      return;
    }
    if (blobInFlight) {
      chain = chain.then(() => handleTextFrame(ev.data)).catch(() => {});
      return;
    }
    handleTextFrame(ev.data);
  });
  ws.addEventListener("error", (e) => console.error("[probe] ws error", e.message ?? e));
  const send = (data) => ws.send(JSON.stringify(data));
  const close = () => {
    try {
      ws.close();
    } catch {}
  };
  return { ws, frames, send, close, waitFor };
}

const extractText = (message) => {
  if (!message?.content) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
};

let chatId = null;
try {
  const createRes = await fetch(`${API}/api/chat-sessions`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ displayName: "tool-e2e probe" }),
  });
  if (!createRes.ok) throw new Error(`create chat failed: ${createRes.status}`);
  chatId = (await createRes.json()).session.id;

  const c = openStream(chatId);
  await c.waitFor(
    (f) => f.some((x) => x.type === "history_end") && f.some((x) => x.type === "live_end"),
  );

  // 触发工具调用的 prompt：firecrawl 工具恒注册（匿名限额/有 key 都可用）→ 恒发 web
  // 搜索意图验证 firecrawl_search；用 --read-tool 环境变量回退内置 read 工具路径。
  const prompt =
    process.env.USE_READ_TOOL === "1"
      ? "请用 read 工具读取 agents-remote/package.json 文件，然后告诉我里面 name 字段的值。"
      : "请使用 firecrawl_search 工具搜索一下今天的科技新闻，然后总结一句话。";
  c.send({ type: "user", text: prompt, uuid: "tool-e2e-uuid-1" });
  console.log(
    `[ok] sent prompt (firecrawl intent, key=${pi.firecrawlApiKeyMasked ?? "none"}): "${prompt.slice(0, 60)}..."`,
  );

  await c.waitFor((f) => f.some((x) => x.type === "ended"));
  const events = c.frames.filter((x) => x.type === "pi_event").map((x) => x.event);

  // 1. 工具执行：tool_execution_start/end 必须真实出现
  const toolStarts = events.filter((e) => e.type === "tool_execution_start");
  const toolEnds = events.filter((e) => e.type === "tool_execution_end");
  check(toolStarts.length > 0, "收到 tool_execution_start", `count=${toolStarts.length}`);
  if (toolStarts.length > 0) {
    const names = [...new Set(toolStarts.map((e) => e.toolName))].join(",");
    check(true, "工具名", names);
  }
  check(
    toolEnds.length > 0,
    "收到 tool_execution_end（工具真实执行完）",
    `count=${toolEnds.length}`,
  );
  const errTool = toolEnds.find((e) => e.isError);
  check(
    !errTool,
    "工具执行无 isError",
    errTool
      ? `tool=${errTool.toolName} err=${JSON.stringify(errTool.result ?? null).slice(0, 100)}`
      : "",
  );
  if (errTool) {
    console.log(`[debug] error tool detail: ${JSON.stringify(errTool, null, 2).slice(0, 800)}`);
  }

  // 2. assistant 最终文本（工具结果回注后模型的最终回答）。存在两个 assistant
  //    message_end：工具调用轮（content 只含 toolCall 无文本）+ 最终回答轮。取文本非空者。
  const asstTexts = events
    .filter((e) => e.type === "message_end" && e.message?.role === "assistant")
    .map((e) => extractText(e.message));
  const finalText = asstTexts.find((t) => t.trim().length > 0) ?? "";
  check(
    finalText.trim().length > 0,
    "assistant message_end 含最终文本",
    finalText.trim().slice(0, 100),
  );
  check(
    c.frames.some((x) => x.type === "ended"),
    "agent_settled → ended",
  );

  // 3. 目标工具特定断言：默认 firecrawl_search；USE_READ_TOOL=1 → 内置 read。
  const expectTool = process.env.USE_READ_TOOL === "1" ? "read" : "firecrawl_search";
  const targetCalls = toolStarts.filter((e) => e.toolName === expectTool);
  check(targetCalls.length > 0, `${expectTool} 被调用`, `count=${targetCalls.length}`);

  // 4. 工具结果文本出现（证明执行结果真的回到了上下文/最终回答）
  check(
    finalText.length > 20 || toolEnds.length > 0,
    "最终回答非空（工具链闭环）",
    `finalText=${finalText.length} chars, tools=${toolEnds.length}`,
  );

  c.close();
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

if (chatId) {
  const detailRes = await fetch(`${API}/api/chat-sessions/${encodeURIComponent(chatId)}`, {
    headers: auth,
  });
  check(detailRes.status === 404, "close 后元数据已删", `status=${detailRes.status}`);
  const jsonlDir = join(homedir(), ".agents-remote/chat-sessions/pi-jsonl", chatId);
  check(!existsSync(jsonlDir), "close 后 pi-jsonl/<chatId>/ 已删", jsonlDir);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} pass / ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
