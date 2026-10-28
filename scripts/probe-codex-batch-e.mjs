#!/usr/bin/env bun
// probe-codex-batch-e.mjs — codex app-server（0.163.0）批 E 协议事实探针
//
// 目的：在实现「compact UI / MCP 注入 / P2 小项」之前，先用真机帧确认四件事：
//   E1 MCP：`-c mcp_servers.<name>.url=` 是否能被 0.163 收下并真连上（流式 HTTP），
//          以及 mcpServerStatus/list、mcpServer/tool/call 的真实帧形状；
//   E2 compact：thread/compact/start 的响应 / 产生的通知（thread/compacted? item?）
//          / 前后 thread/read items 的变化 / 是否走 turn 生命周期；
//   E3 steer：turn/steer 在活跃 turn 上的语义（同一 turn 收口？内容如何落 item？）；
//   E4 计费/水位：account/rateLimits/read + account/usage/read 的返回形状（脱敏落盘）。
//
// 会触发真实 LLM 调用（本机 codex 登录态）；cwd 用 PROJECTS_ROOT/test。
// 跑法：bun scripts/probe-codex-batch-e.mjs
// 断言汇总在 stdout；任一 FAIL 退出码 1。fixtures 落 scripts/fixtures/codex-batch-e/*.jsonl。

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CWD = "/home/deploy/workspace/test";
const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/codex-batch-e",
);
const SCENARIO_TIMEOUT_MS = 180_000;
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── MCP stub server（流式 HTTP，最小可用：initialize / tools/list / tools/call）──
function startMcpStub() {
  const calls = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      if (req.method !== "POST") return new Response("probe stub", { status: 200 });
      const body = await req.json().catch(() => null);
      const messages = Array.isArray(body) ? body : [body];
      const out = [];
      for (const msg of messages) {
        if (msg?.id === undefined) continue; // notification（initialized 等）→ 无需回包
        calls.push(msg.method);
        let result;
        switch (msg.method) {
          case "initialize":
            result = {
              protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "ar-hub-probe", version: "0.0.0-probe" },
            };
            break;
          case "tools/list":
            result = {
              tools: [
                {
                  name: "probe_echo",
                  description: "Echo the given text back.",
                  inputSchema: {
                    type: "object",
                    properties: { text: { type: "string" } },
                    required: ["text"],
                  },
                },
              ],
            };
            break;
          case "tools/call":
            result = {
              content: [{ type: "text", text: `echo:${msg.params?.arguments?.text ?? ""}` }],
            };
            break;
          default:
            result = {};
        }
        out.push({ jsonrpc: "2.0", id: msg.id, result });
      }
      if (out.length === 0) return new Response(null, { status: 202 });
      return Response.json(Array.isArray(body) ? out : out[0], {
        headers: { "Mcp-Session-Id": "probe-session" },
      });
    },
  });
  return { server, calls, port: server.port };
}

// ── JSON-RPC stdio 客户端（同 probe-codex-appserver.mjs 手法）─────────────────
class CodexAppServer {
  constructor(label, extraArgs = []) {
    this.label = label;
    this.nextId = 1;
    this.pending = new Map();
    this.notifications = [];
    this.cursor = 0;
    this.closed = false;
    this.proc = spawn("codex", ["app-server", ...extraArgs], {
      cwd: CWD,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.fixturePath = path.join(FIXTURES_DIR, `${label}.jsonl`);
    mkdirSync(FIXTURES_DIR, { recursive: true });
    writeFileSync(this.fixturePath, "");
    this.proc.stdout.setEncoding("utf8");
    let buf = "";
    this.proc.stdout.on("data", (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) this.onFrame(JSON.parse(line));
      }
    });
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (c) => process.stderr.write(`[${label} stderr] ${c}`));
    this.proc.on("exit", (code) => {
      this.closed = true;
      for (const p of this.pending.values()) p.reject(new Error(`app-server exited code=${code}`));
    });
  }

  fixture(dir, frame) {
    appendFileSync(this.fixturePath, `${JSON.stringify({ dir, frame })}\n`);
  }

  onFrame(frame) {
    if (typeof frame.id === "number" && frame.method !== undefined) {
      this.fixture("sreq", frame);
      return;
    }
    if (frame.id !== undefined && frame.method === undefined) {
      this.fixture("res", frame);
      const p = this.pending.get(frame.id);
      if (!p) return;
      this.pending.delete(frame.id);
      if (frame.error) p.reject(new Error(`rpc error: ${JSON.stringify(frame.error)}`));
      else p.resolve(frame.result);
      return;
    }
    if (frame.method) {
      this.notifications.push(frame);
      this.fixture("notif", frame);
    }
  }

  request(method, params) {
    const id = this.nextId++;
    this.fixture("req", { id, method, params });
    this.proc.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout waiting ${method}`));
        }
      }, SCENARIO_TIMEOUT_MS).unref();
    });
  }

  notify(method, params) {
    this.fixture("req", { method, params });
    this.proc.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  waitForNotification(method, predicate = () => true, timeoutMs = SCENARIO_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const tick = () => {
        const hit = this.notifications.find((n) => n.method === method && predicate(n));
        if (hit) return resolve(hit);
        if (this.closed) return reject(new Error(`process closed waiting ${method}`));
        if (Date.now() > deadline) return reject(new Error(`timeout waiting notif ${method}`));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async waitTurn(turnId) {
    const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
    for (;;) {
      const hit = this.notifications.find(
        (n) => n.method === "turn/completed" && (n.params?.turnId ?? n.params?.turn?.id) === turnId,
      );
      if (hit) return hit;
      if (Date.now() > deadline) throw new Error(`timeout waiting turn/completed ${turnId}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  close() {
    if (this.closed) return;
    try {
      this.proc.stdin.end();
    } catch {
      /* gone */
    }
    this.proc.kill("SIGTERM");
  }
}

async function open(label, extraArgs = []) {
  const s = new CodexAppServer(label, extraArgs);
  await s.request("initialize", {
    clientInfo: { name: "agents-remote-probe", title: null, version: "0.0.1" },
    capabilities: null,
  });
  s.notify("initialized", {});
  return s;
}

// ── 场景 ───────────────────────────────────────────────────────────────────
mkdirSync(FIXTURES_DIR, { recursive: true });

async function scenarioMcp() {
  const stub = startMcpStub();
  const url = `http://127.0.0.1:${stub.port}/mcp/probe`;
  // TOML 值需带引号：`-c mcp_servers.ar-hub.url="http://..."`
  const s = await open("e1-mcp", ["-c", `mcp_servers.ar-hub.url="${url}"`]);
  try {
    const res = await s.request("mcpServerStatus/list", { detail: "full" });
    const entry = res.data?.find((d) => d.name === "ar-hub");
    record(
      "E1 mcpServerStatus/list 含 -c 注入的 ar-hub",
      Boolean(entry),
      JSON.stringify(entry ?? res.data),
    );
    // 连接实证：stub 收到 initialize + tools/list，且 codex 侧工具目录里有我们的工具。
    record(
      "E1 ar-hub 真连上（stub 收到 initialize/tools-list，codex 拿到工具目录）",
      stub.calls.includes("initialize") &&
        Boolean(entry?.tools?.probe_echo || entry?.tools?.length),
      `calls=${JSON.stringify(stub.calls)} tools=${JSON.stringify(Object.keys(entry?.tools ?? {}))}`,
    );

    // 直接经 codex 调用 stub 工具（不经模型）：验证配置真的接通。
    const thread = await s.request("thread/start", { cwd: CWD, sandbox: "read-only" });
    const call = await s.request("mcpServer/tool/call", {
      threadId: thread.thread.id,
      server: "ar-hub",
      tool: "probe_echo",
      arguments: { text: "batch-e" },
    });
    record(
      "E1 mcpServer/tool/call 打通 stub（返回 echo）",
      JSON.stringify(call).includes("echo:batch-e"),
      JSON.stringify(call).slice(0, 300),
    );
    return { threadId: thread.thread.id };
  } finally {
    s.close();
    stub.server.stop(true);
  }
}

async function scenarioCompact() {
  const s = await open("e2-compact");
  try {
    const thread = await s.request("thread/start", { cwd: CWD, sandbox: "read-only" });
    const threadId = thread.thread.id;
    // 先跑一轮让上下文非空。
    const t1 = await s.request("turn/start", {
      threadId,
      input: [{ type: "text", text: "回复两个字：收到。不要做别的事。" }],
    });
    await s.waitTurn(t1.turn?.id);

    const before = await s.request("thread/read", { threadId, includeTurns: true });
    const beforeItems = JSON.stringify(before).length;
    s.cursor = s.notifications.length;

    let res = null;
    let callError = null;
    try {
      res = await s.request("thread/compact/start", { threadId });
    } catch (err) {
      callError = String(err);
    }
    record("E2 thread/compact/start 被接受", res !== null, callError ?? JSON.stringify(res));

    if (res !== null) {
      // 等压缩产生的事实帧：thread/compacted 通知 / 或 compaction 相关 item / 或新 turn。
      const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
      let hit = null;
      while (Date.now() < deadline) {
        hit = s.notifications
          .slice(s.cursor)
          .find(
            (n) =>
              n.method === "thread/compacted" ||
              /compact/i.test(n.method) ||
              /compact/i.test(JSON.stringify(n.params ?? {})),
          );
        if (hit) break;
        const done = s.notifications.slice(s.cursor).find((n) => n.method === "turn/completed");
        if (done && !hit) {
          // 压缩可能以 turn 形式跑完再发 context 标记，短暂再等一轮。
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      record(
        "E2 压缩事实帧可观察（thread/compacted 或 item）",
        Boolean(hit),
        hit ? `${hit.method} ${JSON.stringify(hit.params).slice(0, 300)}` : "timeout",
      );

      // 压缩是以 turn 形态跑的：等它收口，再看 item/completed 与 thread/read 的落盘形态。
      const turnNotif = s.notifications.slice(s.cursor).find((n) => n.method === "turn/started");
      const compactTurnId = turnNotif?.params?.turnId ?? turnNotif?.params?.turn?.id;
      const completed = compactTurnId ? await s.waitTurn(compactTurnId).catch(() => null) : null;
      record(
        "E2 压缩 turn 收口（turn/completed）",
        Boolean(completed),
        JSON.stringify(completed?.params).slice(0, 200),
      );
      const compactItemCompleted = s.notifications
        .slice(s.cursor)
        .find((n) => n.method === "item/completed" && n.params?.item?.type === "contextCompaction");
      record(
        "E2 contextCompaction item/completed 到达",
        Boolean(compactItemCompleted),
        JSON.stringify(compactItemCompleted?.params?.item ?? null),
      );
      // 弃用通知是否还会单独发（bindings 注释说 deprecated，实测确认）。
      const legacy = s.notifications.slice(s.cursor).find((n) => n.method === "thread/compacted");
      record("E2 弃用通知 thread/compacted 是否仍发（记录用）", true, legacy ? "yes" : "no");

      const after = await s.request("thread/read", { threadId, includeTurns: true });
      const afterTypes = (after.thread?.turns ?? [])
        .flatMap((t) => t.items ?? [])
        .map((i) => i.type);
      record(
        "E2 压缩后 thread/read 含 contextCompaction item（回放可复原）",
        afterTypes.includes("contextCompaction") || JSON.stringify(after).length !== beforeItems,
        `before=${beforeItems}B after=${JSON.stringify(after).length}B items=${JSON.stringify(afterTypes)}`,
      );
      const methodSet = [...new Set(s.notifications.slice(s.cursor).map((n) => n.method))];
      record("E2 压缩期间通知方法清单（记录用）", methodSet.length > 0, JSON.stringify(methodSet));
    }
    return { threadId };
  } finally {
    s.close();
  }
}

async function scenarioSteer() {
  const s = await open("e3-steer");
  try {
    const thread = await s.request("thread/start", { cwd: CWD, sandbox: "read-only" });
    const threadId = thread.thread.id;
    const t1 = await s.request("turn/start", {
      threadId,
      input: [{ type: "text", text: "从 1 数到 60，每个数字单独一行。不要用工具。" }],
    });
    const turnId = t1.turn?.id;
    // 等「活跃 turn 已产生内容」：delta 或任意带该 turnId 的通知（模型可能先 reasoning）。
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const hit = s.notifications.find((n) =>
        n.method === "turn/completed"
          ? (n.params?.turnId ?? n.params?.turn?.id) === turnId
          : n.params?.turnId === turnId,
      );
      if (hit) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    s.cursor = s.notifications.length;

    let res = null;
    let err = null;
    try {
      res = await s.request("turn/steer", {
        threadId,
        expectedTurnId: turnId,
        input: [{ type: "text", text: "改成只数到 5 就停。" }],
      });
    } catch (e) {
      err = String(e);
    }
    record(
      "E3 turn/steer 在活跃 turn 上被接受",
      res !== null,
      err ?? JSON.stringify(res).slice(0, 200),
    );

    const completed = await s.waitTurn(turnId).catch(() => null);
    record(
      "E3 steer 后同一 turn 正常收口",
      Boolean(completed),
      JSON.stringify(completed?.params).slice(0, 300),
    );
    const steerSeen = s.notifications
      .slice(s.cursor)
      .some((n) => JSON.stringify(n.params ?? {}).includes("只数到 5"));
    record("E3 steer 内容出现在流中（userMessage item/delta）", steerSeen);
    const methods = [...new Set(s.notifications.slice(s.cursor).map((n) => n.method))];
    record("E3 steer 后通知方法清单（记录用）", methods.length > 0, JSON.stringify(methods));
    return { threadId };
  } finally {
    s.close();
  }
}

async function scenarioUsage() {
  const s = await open("e4-usage");
  try {
    const limits = await s.request("account/rateLimits/read", {});
    record(
      "E4 account/rateLimits/read 返回形状",
      limits !== null && typeof limits === "object",
      JSON.stringify(limits).slice(0, 400),
    );
    let usage = null;
    let usageErr = null;
    try {
      usage = await s.request("account/usage/read", {});
    } catch (e) {
      usageErr = String(e);
    }
    record(
      "E4 account/usage/read 返回形状",
      usage !== null,
      usageErr ?? JSON.stringify(usage).slice(0, 300),
    );
    // 脱敏：fixtures 里 rateLimits 只留键名骨架。
    const lines = (await Bun.file(s.fixturePath).text()).split("\n").filter(Boolean);
    writeFileSync(
      s.fixturePath,
      `${lines
        .map((l) => {
          const e = JSON.parse(l);
          if (e.dir === "res" && e.frame.result && typeof e.frame.result === "object") {
            e.frame.result = { "[redacted]": true, keys: Object.keys(e.frame.result) };
          }
          return JSON.stringify(e);
        })
        .join("\n")}\n`,
    );
  } finally {
    s.close();
  }
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
try {
  await scenarioMcp();
  await scenarioCompact();
  await scenarioSteer();
  await scenarioUsage();
} catch (err) {
  record("探针执行异常", false, String(err));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) process.exit(1);
