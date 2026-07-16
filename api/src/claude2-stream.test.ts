import type { SessionStreamServerMessage } from "@agents-remote/shared";
import { describe, expect, mock, test } from "bun:test";
import {
  chunkBatchLines,
  createBatchEmitter,
  Claude2StreamController,
  type BatchEmit,
} from "./claude2-stream";
import type { Claude2Runtime } from "./claude2-runtime";
import type { RuntimeResources, SessionRegistry } from "./session-registry";

// A minimal legal non-batch row. createBatchEmitter only branches on `type`, so
// the row payload is irrelevant to the batch logic under test.
const dataRow = (): string =>
  JSON.stringify({ type: "ended" } satisfies SessionStreamServerMessage);
const json = (msg: SessionStreamServerMessage): string => JSON.stringify(msg);

const setup = () => {
  const frames: Array<string | Uint8Array> = [];
  const emit: BatchEmit = (frame) => {
    frames.push(frame);
  };
  const onRealtimeRow = mock(
    (_line: string, _parsed: SessionStreamServerMessage, _emit: BatchEmit) => undefined,
  );
  const onData = createBatchEmitter({ emit, onRealtimeRow });
  return { frames, onRealtimeRow, onData };
};

const decodeBlob = (frame: string | Uint8Array): string => {
  if (!(frame instanceof Uint8Array)) throw new Error("expected Uint8Array blob");
  return Buffer.from(Bun.gunzipSync(frame)).toString();
};

describe("createBatchEmitter", () => {
  test("history batch: start text → one gzip blob → end text; rows compressed verbatim", () => {
    const { frames, onRealtimeRow, onData } = setup();
    const rows = [dataRow(), dataRow(), dataRow()];
    onData(json({ type: "history_start", count: rows.length }));
    for (const r of rows) onData(r);
    onData(json({ type: "history_end" }));

    expect(frames).toHaveLength(3);
    expect(frames[0]).toBe(json({ type: "history_start", count: rows.length }));
    expect(frames[2]).toBe(json({ type: "history_end" }));
    expect(decodeBlob(frames[1]!)).toBe(rows.join("\n"));
    expect(onRealtimeRow).not.toHaveBeenCalled();
  });

  test("live batch is compressed the same way", () => {
    const { frames, onData } = setup();
    const rows = [dataRow(), dataRow()];
    onData(json({ type: "live_start", count: rows.length }));
    for (const r of rows) onData(r);
    onData(json({ type: "live_end" }));
    expect(decodeBlob(frames[1]!)).toBe(rows.join("\n"));
  });

  test("count=0 batch emits no binary blob", () => {
    const { frames, onData } = setup();
    onData(json({ type: "history_start", count: 0 }));
    onData(json({ type: "history_end" }));
    expect(frames).toEqual([
      json({ type: "history_start", count: 0 }),
      json({ type: "history_end" }),
    ]);
    expect(frames.every((f) => typeof f === "string")).toBe(true);
  });

  test("rows after a batch closes go to the real-time handler", () => {
    const { onRealtimeRow, onData } = setup();
    onData(json({ type: "history_start", count: 1 }));
    onData(dataRow());
    onData(json({ type: "history_end" }));
    expect(onRealtimeRow).not.toHaveBeenCalled();

    const rt = dataRow();
    onData(rt);
    expect(onRealtimeRow).toHaveBeenCalledTimes(1);
    expect(onRealtimeRow.mock.calls[0]?.[0]).toBe(rt);
  });

  test("gzip failure falls back to per-row text frames", () => {
    const frames: Array<string | Uint8Array> = [];
    const original = Bun.gzipSync;
    const consoleErr = console.error;
    (Bun as unknown as { gzipSync: unknown }).gzipSync = () => {
      throw new Error("gzip boom");
    };
    console.error = mock(() => undefined);
    try {
      const onData = createBatchEmitter({
        emit: (f) => {
          frames.push(f);
        },
        onRealtimeRow: () => undefined,
      });
      const rows = [dataRow(), dataRow()];
      onData(json({ type: "history_start", count: rows.length }));
      for (const r of rows) onData(r);
      onData(json({ type: "history_end" }));
      expect(frames).toEqual([
        json({ type: "history_start", count: rows.length }),
        rows[0],
        rows[1],
        json({ type: "history_end" }),
      ]);
      expect(frames.every((f) => typeof f === "string")).toBe(true);
    } finally {
      (Bun as unknown as { gzipSync: unknown }).gzipSync = original;
      console.error = consoleErr;
    }
  });

  test("unparseable line is skipped silently", () => {
    const { frames, onRealtimeRow, onData } = setup();
    onData("{not valid json");
    expect(frames).toHaveLength(0);
    expect(onRealtimeRow).not.toHaveBeenCalled();
  });
});

describe("chunkBatchLines", () => {
  test("single chunk when total under target", () => {
    expect(chunkBatchLines(["a", "b", "c"], 1024)).toEqual(["a\nb\nc"]);
  });

  test("splits when cumulative size exceeds target and round-trips the original rows", () => {
    // Target 10 bytes; with "\n" separators the lines are "aaa"(4) "bbbb"(5) "cc"(3) "dddddd"(7).
    const chunks = chunkBatchLines(["aaa", "bbbb", "cc", "dddddd"], 10);
    expect(chunks.join("\n")).toBe("aaa\nbbbb\ncc\ndddddd");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk)).toBeLessThanOrEqual(10 + 6);
    }
  });

  test("empty input yields no chunks", () => {
    expect(chunkBatchLines([])).toEqual([]);
  });

  test("oversized single line becomes its own chunk", () => {
    const long = "x".repeat(100);
    const chunks = chunkBatchLines(["a", long, "b"], 10);
    expect(chunks.join("\n")).toBe(`a\n${long}\nb`);
    expect(chunks.length).toBe(3);
    expect(Buffer.byteLength(chunks[1]!)).toBe(Buffer.byteLength(long));
  });
});

describe("Claude2StreamController.message routes CLI stdin inputs", () => {
  // The fix for the model-switch bug: model/mode switches are sent as
  // control_request{set_model / set_permission_mode} per the CLI's real
  // stream-json protocol, forwarded verbatim to stdin. They are NOT a kill +
  // respawn (restartWith). The old path destroyed the relay + replayed history
  // (stream refresh) and left the pre-switch turn with no `result` (running stuck).
  // This test pins the forwarding behavior and asserts no fabricated
  // switch_model_result is emitted back to the socket.

  type FakeSocket = {
    data: unknown;
    sends: string[];
    closeCalls: number;
    send: (m: string) => void;
    close: () => void;
  };

  const makeSocket = (): FakeSocket => {
    const socket: FakeSocket = {
      data: {
        kind: "claude2-stream",
        sessionType: "agent",
        projectName: "demo",
        sessionId: "sess-1",
        runtimeKey: "ar-claude2-claude-demo-sess-1",
        status: "running",
      },
      sends: [],
      closeCalls: 0,
      send: (m: string) => {
        socket.sends.push(m);
      },
      close: () => {
        socket.closeCalls += 1;
      },
    };
    return socket;
  };

  const makeController = (opts?: {
    resolveControlModel?: (model: string | undefined) => Promise<string | undefined>;
  }) => {
    const writes: string[] = [];
    const injections: Array<{ key: string; line: string }> = [];
    const closedKeys: string[] = [];
    const effortUpdates: Array<{ sessionId: string; effort: string }> = [];
    const claude2Runtime = {
      write: async (_key: string, data: string) => {
        writes.push(data);
      },
      injectLiveLine: (key: string, line: string) => {
        injections.push({ key, line });
      },
      // Default passthrough = default config (alias mapping, 1m off): the
      // controller forwards the model unchanged. Tests inject a resolver to
      // simulate modelMapping/1m resolution.
      resolveControlModel:
        opts?.resolveControlModel ?? ((m: string | undefined) => Promise.resolve(m)),
      close: async (key: string) => {
        closedKeys.push(key);
      },
      ensureRunning: async () => {},
      stream: async () => ({ close: () => {} }),
    };
    const sessionRegistry = {
      getAgentMetadata: async () => ({
        projectPath: "/proj/demo",
        claudeSessionId: "claude-1",
        model: "sonnet",
        permissionMode: "default",
        effort: "high",
      }),
      setEffort: async (sessionId: string, effort: string) => {
        effortUpdates.push({ sessionId, effort });
      },
      recordActivity: async () => {},
    };
    const controller = new Claude2StreamController(
      claude2Runtime as unknown as Claude2Runtime,
      {} as RuntimeResources,
      sessionRegistry as unknown as SessionRegistry,
    );
    return { controller, writes, injections, closedKeys, effortUpdates };
  };

  test("set_model control_request is forwarded to CLI stdin (in-process switch, no restart)", async () => {
    const { controller, writes } = makeController();
    const socket = makeSocket();
    const msg = {
      type: "control_request",
      request_id: "req-model",
      request: { subtype: "set_model", model: "opus" },
    };
    await controller.message(socket, JSON.stringify(msg));
    expect(writes).toEqual([`${JSON.stringify(msg)}\n`]);
    // No error frame, no fabricated switch_model_result — the CLI replies on stdout
    // and the relay forwards it; the controller must not synthesize one.
    expect(socket.sends).toEqual([]);
  });

  test("set_model applies spawn-time model resolution (modelMapping + [1m]) before forwarding", async () => {
    // resolveControlModel is the runtime's spawn-equivalent resolver; stub it to
    // simulate modelMapping.opus=claude-opus-4-8 + enable1mContext so the raw
    // "opus" alias the client sent is rewritten to the concrete id + [1m].
    const { controller, writes } = makeController({
      resolveControlModel: async () => "claude-opus-4-8[1m]",
    });
    const socket = makeSocket();
    const msg = {
      type: "control_request",
      request_id: "req-model",
      request: { subtype: "set_model", model: "opus" },
    };
    await controller.message(socket, JSON.stringify(msg));
    expect(writes).toHaveLength(1);
    const forwarded = JSON.parse(writes[0]!) as {
      type: string;
      request_id: string;
      request: { subtype: string; model: string };
    };
    expect(forwarded.type).toBe("control_request");
    expect(forwarded.request_id).toBe("req-model");
    expect(forwarded.request.model).toBe("claude-opus-4-8[1m]");
    expect(socket.sends).toEqual([]);
  });

  test("set_permission_mode control_request is forwarded to CLI stdin", async () => {
    const { controller, writes } = makeController();
    const msg = {
      type: "control_request",
      request_id: "req-mode",
      request: { subtype: "set_permission_mode", mode: "plan" },
    };
    await controller.message(makeSocket(), JSON.stringify(msg));
    expect(writes).toEqual([`${JSON.stringify(msg)}\n`]);
  });

  test("user / interrupt control_request / control_response are forwarded to CLI stdin", async () => {
    const { controller, writes } = makeController();
    const cases = [
      { type: "user", message: { role: "user", content: [{ type: "text", text: "hi" }] } },
      { type: "control_request", request_id: "r1", request: { subtype: "interrupt" } },
      { type: "control_response", response: { subtype: "success", request_id: "r2" } },
    ];
    for (const c of cases) {
      await controller.message(makeSocket(), JSON.stringify(c));
    }
    expect(writes).toEqual(cases.map((c) => `${JSON.stringify(c)}\n`));
  });

  test("unrecognized message type is silently dropped (not forwarded, no error)", async () => {
    const { controller, writes } = makeController();
    const socket = makeSocket();
    await controller.message(socket, JSON.stringify({ type: "result", subtype: "success" }));
    expect(writes).toEqual([]);
    expect(socket.sends).toEqual([]);
  });

  test("ping heartbeat is dropped without touching business state (no stdin write, no echo, no ack)", async () => {
    const { controller, writes, injections, closedKeys, effortUpdates } = makeController();
    const socket = makeSocket();
    await controller.message(socket, JSON.stringify({ type: "ping" }));
    expect(writes).toEqual([]);
    expect(injections).toEqual([]);
    expect(closedKeys).toEqual([]);
    expect(effortUpdates).toEqual([]);
    // 不回 ack——出站 ping 流量本身已双向保活,服务端无需响应。
    expect(socket.sends).toEqual([]);
  });

  test("user message is echoed into the live cache (CLI never echoes user input on stdout)", async () => {
    const { controller, writes, injections } = makeController();
    const msg = {
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "hello" }] },
    };
    await controller.message(makeSocket(), JSON.stringify(msg));
    // forwarded to stdin verbatim (no uuid — CLI accepts it, generates its own in JSONL)
    expect(writes).toEqual([`${JSON.stringify(msg)}\n`]);
    // echoed into the relay live cache with a synthetic injected- uuid so the
    // client (which dedupes by uuid) renders the user bubble. Tagged with
    // isUserInput so the client can open running on it before the first
    // assistant event (the CLI's own user messages don't carry this flag).
    expect(injections).toHaveLength(1);
    expect(injections[0]!.key).toBe("ar-claude2-claude-demo-sess-1");
    const echoed = JSON.parse(injections[0]!.line) as Record<string, unknown>;
    expect(echoed).toMatchObject({ type: "user", message: msg.message });
    expect(echoed.isUserInput).toBe(true);
    expect(typeof echoed.uuid).toBe("string");
    expect((echoed.uuid as string).startsWith("injected-")).toBe(true);
  });

  test("control_request and control_response are forwarded but NOT echoed into the live cache", async () => {
    const { controller, writes, injections } = makeController();
    const cases = [
      { type: "control_request", request_id: "r1", request: { subtype: "interrupt" } },
      { type: "control_response", response: { subtype: "success", request_id: "r2" } },
    ];
    for (const c of cases) {
      await controller.message(makeSocket(), JSON.stringify(c));
    }
    expect(writes).toEqual(cases.map((c) => `${JSON.stringify(c)}\n`));
    expect(injections).toEqual([]);
  });

  test("set_runtime_effort persists effort, kills the CLI, and closes the requesting socket", async () => {
    const { controller, closedKeys, effortUpdates } = makeController();
    const socket = makeSocket();
    await controller.message(socket, JSON.stringify({ type: "set_runtime_effort", effort: "max" }));
    expect(effortUpdates).toEqual([{ sessionId: "sess-1", effort: "max" }]);
    expect(closedKeys).toEqual(["ar-claude2-claude-demo-sess-1"]);
    // requesting socket closed → client auto-reconnects → ensureRunning respawns
    expect(socket.closeCalls).toBe(1);
    // nothing forwarded to stdin (not a control_request) + no error frame
    expect(socket.sends).toEqual([]);
  });

  test("set_runtime_effort closes ALL sockets streaming the session (multi-client)", async () => {
    const { controller } = makeController();
    const a = makeSocket();
    const b = makeSocket();
    // open() registers each socket under the session's runtimeKey
    await controller.open(a);
    await controller.open(b);
    await controller.message(a, JSON.stringify({ type: "set_runtime_effort", effort: "low" }));
    // both clients must reconnect into the respawned stream
    expect(a.closeCalls).toBe(1);
    expect(b.closeCalls).toBe(1);
  });

  test("set_runtime_effort with invalid effort sends an error and does not restart", async () => {
    const { controller, closedKeys, effortUpdates } = makeController();
    const socket = makeSocket();
    // raw JSON bypasses TS — the handler must validate at runtime (JSON.parse
    // ignores types, so a malformed client can send any effort string)
    await controller.message(
      socket,
      JSON.stringify({ type: "set_runtime_effort", effort: "bogus" }),
    );
    expect(effortUpdates).toEqual([]);
    expect(closedKeys).toEqual([]);
    expect(socket.closeCalls).toBe(0);
    expect(socket.sends).toHaveLength(1);
    const err = JSON.parse(socket.sends[0]!) as { type: string; code: string };
    expect(err.type).toBe("error");
    expect(err.code).toBe("SESSION_RUNTIME_ERROR");
  });
});
