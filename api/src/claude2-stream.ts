import type { Claude2StreamClientMessage, SessionStreamServerMessage } from "@agents-remote/shared";
import { ProjectPathError, resolveProjectPath } from "./project-paths";
import { jsonError } from "./http-auth";
import { SessionRegistry, type RuntimeResources, type RuntimeStream } from "./session-registry";
import { EFFORT_LEVELS, type AgentSessionStatus, type SessionType } from "@agents-remote/shared";
import type { Claude2Runtime } from "./claude2-runtime";

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: Record<string, unknown> }): boolean;
};

export type Claude2WebSocketData = {
  kind: "claude2-stream";
  sessionType: SessionType;
  projectName: string;
  sessionId: string;
  runtimeKey: string;
  status: AgentSessionStatus;
};

type StreamSocket = {
  data?: unknown;
  send(message: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
};

/** Emit one wire frame: a text JSON string (control frame / real-time row) or a
 *  gzipped `Uint8Array` (a replay batch blob). Maps directly to `socket.send`. */
export type BatchEmit = (frame: string | Uint8Array) => void;

export type BatchEmitterOptions = {
  emit: BatchEmit;
  /** Handle a real-time (post-batch) row: capture system.init, forward the raw
   *  line, and inject the synthetic `ended` after a `result`. */
  onRealtimeRow: (line: string, parsed: SessionStreamServerMessage, emit: BatchEmit) => void;
};

const BATCH_START_TYPES: ReadonlySet<string> = new Set(["history_start", "live_start"]);
const BATCH_END_TYPES: ReadonlySet<string> = new Set(["history_end", "live_end"]);

/**
 * Target uncompressed bytes per compressed chunk frame. Profiling a single
 * monolithic blob showed cloudflared drains one large WS message at ~6 Mbps,
 * while the old per-line text frames (≈2 KB each) reached ~11 Mbps — the tunnel
 * appears to buffer whole messages before forwarding, so splitting the batch
 * into several smaller independently-gzipped frames lets them pipeline through
 * the tunnel instead of stalling on one giant message. 512 KB keeps windowed
 * tail blocks to 2–4 chunks (reasonable) while still giving large sessions
 * enough frames for multi-frame pipelining. Each chunk is gzipped independently
 * so the client decompresses each without reassembly.
 */
const BATCH_CHUNK_TARGET_BYTES = 512 * 1024;

/**
 * Split raw JSONL batch lines into chunks whose joined size stays at or below
 * `targetBytes` (the last chunk may be smaller; a single line larger than the
 * target becomes its own chunk since lines can't be split). JSON rows never
 * contain a raw newline, so re-joining all chunks with `"\n"` round-trips the
 * original batch losslessly regardless of how it's chunked.
 */
export function chunkBatchLines(
  lines: string[],
  targetBytes: number = BATCH_CHUNK_TARGET_BYTES,
): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentBytes = 0;
  for (const line of lines) {
    // +1 accounts for the "\n" separator join will insert between lines.
    const lineBytes = Buffer.byteLength(line) + 1;
    if (currentBytes > 0 && currentBytes + lineBytes > targetBytes) {
      chunks.push(current.join("\n"));
      current = [];
      currentBytes = 0;
    }
    current.push(line);
    currentBytes += lineBytes;
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks;
}

/**
 * Wrap the relay's per-line `onData` so the history/live replay batches are
 * emitted as a sequence of independently-gzipped binary frames instead of N text
 * frames, while real-time (post-batch) rows keep their per-line text frames.
 * Cloudflare's edge strips `permessage-deflate`, so compression must happen at
 * the application layer; the client decompresses each chunk with
 * `DecompressionStream('gzip')`.
 *
 * Batch data rows are forwarded verbatim (raw JSONL) — no re-parse/re-stringify —
 * which also removes the double serialization on the replay path. Control markers
 * and real-time rows stay text so the client's batch state machine is unchanged.
 * JSON rows never contain a raw newline, so `join("\n")`/`split("\n")` round-trips
 * losslessly. On gzip failure the batch falls back to per-row text frames.
 */
export function createBatchEmitter(opts: BatchEmitterOptions): (line: string) => void {
  let accumulate: string[] | null = null;
  return (line: string) => {
    let parsed: SessionStreamServerMessage;
    try {
      parsed = JSON.parse(line) as SessionStreamServerMessage;
    } catch {
      return;
    }
    try {
      const type = parsed.type;
      if (BATCH_START_TYPES.has(type)) {
        opts.emit(line);
        accumulate = [];
        return;
      }
      if (BATCH_END_TYPES.has(type)) {
        const batch = accumulate ?? [];
        accumulate = null;
        if (batch.length > 0) {
          try {
            for (const chunk of chunkBatchLines(batch)) {
              opts.emit(Bun.gzipSync(Buffer.from(chunk)));
            }
          } catch (e) {
            console.error("[claude2-stream] gzip failed, falling back to text rows", e);
            for (const raw of batch) opts.emit(raw);
          }
        }
        opts.emit(line);
        return;
      }
      if (accumulate !== null) {
        accumulate.push(line);
        return;
      }
      opts.onRealtimeRow(line, parsed, opts.emit);
    } catch {
      // isolate per-line failures (e.g. send on a closing socket) from other rows
    }
  };
}

type StreamRouteMatch = {
  projectName: string;
  sessionId: string;
};

export const handleClaude2StreamUpgrade = async (
  request: Request,
  url: URL,
  projectsRoot: string,
  registry: SessionRegistry,
  server: UpgradeServer,
): Promise<{ matched: boolean; response?: Response }> => {
  const match = matchClaude2StreamRoute(url.pathname);

  if (!match) {
    return { matched: false };
  }

  try {
    const project = await resolveProjectPath(projectsRoot, match.projectName);
    const metadata = await registry.getAgentMetadata(project.name, match.sessionId);

    if (!metadata || metadata.provider !== "claude2") {
      return {
        matched: true,
        response: jsonError("SESSION_STREAM_MISMATCH", "Session is not a Claude2 session", 400),
      };
    }

    const session = await registry.getAgentSession(project.name, match.sessionId);
    if (!session) {
      return {
        matched: true,
        response: jsonError("SESSION_NOT_FOUND", "Session not found", 404),
      };
    }

    if (
      server.upgrade(request, {
        data: {
          kind: "claude2-stream",
          sessionType: "agent",
          projectName: project.name,
          sessionId: metadata.id,
          runtimeKey: metadata.runtimeKey,
          status: session.status,
        },
      })
    ) {
      return { matched: true };
    }

    return { matched: true, response: new Response("WebSocket upgrade required", { status: 426 }) };
  } catch (error) {
    if (error instanceof ProjectPathError) {
      return { matched: true, response: projectPathErrorResponse(error) };
    }

    throw error;
  }
};

export class Claude2StreamController {
  private readonly streams = new WeakMap<StreamSocket, RuntimeStream>();
  // Reverse index runtimeKey → live sockets, so an effort switch (which must
  // reconnect ALL clients of a session to respawn the CLI) can close every
  // socket even if multiple clients stream the same session.
  private readonly socketsByRuntimeKey = new Map<string, Set<StreamSocket>>();

  constructor(
    private readonly claude2Runtime: Claude2Runtime,
    private readonly runtime: RuntimeResources,
    private readonly sessionRegistry: SessionRegistry,
  ) {}

  private registerSocket(runtimeKey: string, socket: StreamSocket): void {
    let set = this.socketsByRuntimeKey.get(runtimeKey);
    if (!set) {
      set = new Set();
      this.socketsByRuntimeKey.set(runtimeKey, set);
    }
    set.add(socket);
  }

  private unregisterSocket(runtimeKey: string, socket: StreamSocket): void {
    const set = this.socketsByRuntimeKey.get(runtimeKey);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.socketsByRuntimeKey.delete(runtimeKey);
  }

  async open(socket: StreamSocket) {
    const data = sessionData(socket);

    if (!data) {
      console.log("[claude2-stream] open: no session data");
      return;
    }

    console.log(`[claude2-stream] open: sessionId=${data.sessionId} tmux=${data.runtimeKey}`);
    this.registerSocket(data.runtimeKey, socket);

    // Resolve metadata for projectPath and claudeSessionId
    const metadata = await this.sessionRegistry.getAgentMetadata(data.projectName, data.sessionId);
    console.log(
      `[claude2-stream] metadata found=${!!metadata} claudeSessionId=${metadata?.claudeSessionId ?? "none"}`,
    );

    // Ensure the Claude2 process is running (respawn with --resume if needed)
    await this.claude2Runtime.ensureRunning(
      data.runtimeKey,
      metadata?.projectPath ?? "",
      data.sessionId,
      metadata?.claudeSessionId,
      metadata?.model,
      metadata?.permissionMode,
      metadata?.effort,
    );

    // History and live cache are replayed from the relay on connect.
    // The relay sends history_start/end and live_start/end batch markers.

    try {
      await this.startStream(socket, data);
    } catch (e) {
      console.error(`[claude2-stream] startStream error ${data.sessionId}`, e);
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to start Claude2 stream",
      });
    }
  }

  async message(socket: StreamSocket, raw: string | Buffer) {
    const data = sessionData(socket);

    if (!data) {
      console.log(
        `[claude2-stream] message dropped — no session data, kind=${(socket.data as Record<string, unknown> | null)?.kind ?? "none"} raw=${raw.toString().slice(0, 200)}`,
      );
      return;
    }

    let parsed: Claude2StreamClientMessage;
    try {
      parsed = JSON.parse(raw.toString()) as Claude2StreamClientMessage;
    } catch {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Invalid stream message",
      });
      return;
    }

    try {
      // 应用层心跳:客户端定时发 {type:"ping"} 保活(见 web/src/lib/ws-heartbeat.ts)。
      // 早返回,不转发 stdin、不污染 messages/tasks state——出站 ping 流量已双向
      // 重置 cloudflare/NAT/Bun idle 超时,无需回 ack。
      if (parsed.type === "ping") {
        return;
      }

      // Per-session effort switch: the CLI has no runtime effort switch on a
      // direct-pull host, so persist metadata.effort + relaunch the CLI
      // (--resume + new CLAUDE_CODE_EFFORT_LEVEL) + close every WS for the
      // session. Clients auto-reconnect → open() → ensureRunning(metadata.effort)
      // → spawnAndStart with the new effort env. Order is load-bearing: persist
      // + kill the CLI BEFORE closing sockets, otherwise the reconnect's
      // ensureRunning sees a live process and early-returns without respawning.
      // A running turn is interrupted (JSONL has no result → isResume renders
      // it interrupted) — the accepted cost of switching effort mid-flight.
      if (parsed.type === "set_runtime_effort") {
        if (!(EFFORT_LEVELS as readonly string[]).includes(parsed.effort)) {
          send(socket, {
            type: "error",
            code: "SESSION_RUNTIME_ERROR",
            message: `Invalid effort level: ${parsed.effort}`,
          });
          return;
        }
        console.log(`[claude2-stream] set_runtime_effort ${parsed.effort}: ${data.runtimeKey}`);
        await this.sessionRegistry.setEffort(data.sessionId, parsed.effort);
        await this.claude2Runtime.close(data.runtimeKey);
        // Close the requesting socket and any other sockets streaming this
        // session so every client reconnects into the respawned stream.
        // open() registers each socket, so the index normally already contains
        // the requester; close `socket` directly so the restart triggers even
        // if it was never registered, then close the rest (deduped).
        const others = [...(this.socketsByRuntimeKey.get(data.runtimeKey) ?? [])];
        socket.close();
        for (const s of others) {
          if (s !== socket) s.close();
        }
        return;
      }

      if (
        parsed.type === "user" ||
        parsed.type === "control_response" ||
        parsed.type === "control_request"
      ) {
        // Client→CLI messages are forwarded to stdin: user text, permission
        // control_response (allow/deny), and control_request actions
        // (set_model / set_permission_mode / interrupt). The CLI switches
        // model/mode in-process and replies control_response on stdout, which
        // the relay forwards automatically. The CLI process stays alive.
        //
        // set_model is the one exception to verbatim forwarding: resolve the
        // model via resolveControlModel (same resolveSpawnModel as spawn —
        // modelMapping + [1m]) so a mid-session switch matches spawn-time
        // resolution. Without this the raw tier alias the client sent would
        // lose [1m] / version pinning. request_id is untouched → CLI
        // control_response correlation holds. Default config (alias mapping,
        // 1m off) resolves to the same value → no-op.
        let forwarded: Claude2StreamClientMessage = parsed;
        if (parsed.type === "control_request" && parsed.request.subtype === "set_model") {
          const resolved = await this.claude2Runtime.resolveControlModel(parsed.request.model);
          if (resolved && resolved !== parsed.request.model) {
            forwarded = { ...parsed, request: { ...parsed.request, model: resolved } };
          }
        }
        console.log(`[claude2-stream] message ${parsed.type}: ${data.runtimeKey}`);
        await this.claude2Runtime.write(data.runtimeKey, JSON.stringify(forwarded) + "\n");
        // 用户消息 / 权限响应 / 控制请求都算 session 活动 → bump updatedAt（分钟截断，同分钟短路）。
        void this.sessionRegistry.recordActivity(data.sessionId);

        // The CLI never echoes user input on stream-json stdout (live capture:
        // 0 user-type stdout lines, for both plain text and slash commands).
        // hapi self-injects via onUserMessage + persists to SQLite so reconnects
        // see user messages; we mirror by buffering the user message into the
        // relay's live cache (injectLiveLine) so current AND future subscribers
        // see it. control_response/control_request are permission/model actions,
        // not chat content — not injected. The echo gets a synthetic uuid
        // (client sends none; CLI generates one only in JSONL, never on stdout).
        if (parsed.type === "user") {
          const echo = JSON.stringify({
            ...parsed,
            isUserInput: true,
            uuid: `injected-${crypto.randomUUID()}`,
          });
          this.claude2Runtime.injectLiveLine(data.runtimeKey, echo);
        }
      }
    } catch {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to write to Claude2 stream",
      });
    }
  }

  close(socket: StreamSocket) {
    const data = sessionData(socket);
    if (data) this.unregisterSocket(data.runtimeKey, socket);
    const stream = this.streams.get(socket);
    if (stream) {
      this.streams.delete(socket);
      void stream.close();
    }
  }

  private async startStream(socket: StreamSocket, data: NonNullable<Claude2WebSocketData>) {
    const emit: BatchEmit = (frame) => {
      if (frame instanceof Uint8Array) {
        // Time socket.send for each compressed chunk frame. send() is normally
        // non-blocking (buffers into the socket); if a chunk's sendMs spikes,
        // cloudflared is backpressuring. Cross-check the client *BlobBytes and
        // historyRecv to see whether multi-frame pipelining beats the old
        // single-blob drain.
        const t0 = performance.now();
        socket.send(frame);
        console.log(
          `[claude2-stream] blob flushed: bytes=${frame.byteLength} sendMs=${(performance.now() - t0).toFixed(0)}`,
        );
      } else {
        socket.send(frame);
      }
    };
    const onData = createBatchEmitter({
      emit,
      onRealtimeRow: (line, parsed) => {
        // Capture claudeSessionId and model from system.init. The replay seed
        // (claude2-runtime buildSeedInitLine) uses subtype "seed_init" precisely so
        // this branch skips it — it is excluded by subtype, not by a missing
        // session_id, so the seed can never hijack claudeSessionId/model.
        if (
          parsed.type === "system" &&
          "subtype" in parsed &&
          parsed.subtype === "init" &&
          "session_id" in parsed
        ) {
          const init = parsed as { session_id: string; model?: string };
          if (init.session_id) {
            console.log(
              `[claude2-stream] captured claudeSessionId=${init.session_id} model=${init.model ?? "none"}`,
            );
            this.claude2Runtime.setClaudeSessionId(data.runtimeKey, init.session_id, init.model);
            void this.sessionRegistry.setClaudeSessionId(
              data.sessionId,
              init.session_id,
              init.model,
            );
          }
        }
        // agent 产出（每条 stdout 行）= session 活动 → bump updatedAt。高频但同分钟短路 O(1) 廉价。
        void this.sessionRegistry.recordActivity(data.sessionId);
        emit(line);
        if (parsed.type === "result") {
          emit(JSON.stringify({ type: "ended" }));
        }
      },
    });
    const stream = await this.claude2Runtime.stream(data.runtimeKey, onData, (error: Error) => {
      emit(
        JSON.stringify({
          type: "error",
          code: "SESSION_RUNTIME_ERROR",
          message: error.message,
        }),
      );
    });
    this.streams.set(socket, stream);
  }
}

export const matchClaude2StreamRoute = (pathname: string): StreamRouteMatch | undefined => {
  const segments = pathname.split("/").filter(Boolean);

  if (
    segments[0] !== "api" ||
    segments[1] !== "projects" ||
    segments[3] !== "agent-sessions" ||
    segments[5] !== "claude2-stream"
  ) {
    return undefined;
  }

  const projectName = decodePathSegment(segments[2]);
  const sessionId = decodePathSegment(segments[4]);

  if (!projectName || !sessionId) {
    return undefined;
  }

  return { projectName, sessionId };
};

const send = (socket: StreamSocket, message: SessionStreamServerMessage) => {
  socket.send(JSON.stringify(message));
};

const sessionData = (socket: StreamSocket): Claude2WebSocketData | undefined => {
  const data = socket.data;

  if (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    data.kind === "claude2-stream" &&
    "sessionType" in data &&
    "projectName" in data &&
    "sessionId" in data &&
    "runtimeKey" in data &&
    "status" in data
  ) {
    return data as Claude2WebSocketData;
  }

  return undefined;
};

const decodePathSegment = (value: string | undefined) => {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const projectPathErrorResponse = (error: ProjectPathError) => {
  if (error.code === "PROJECT_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
  }
  if (error.code === "PROJECT_FS_ERROR") {
    return jsonError(error.code, error.message, 500);
  }
  return jsonError(error.code, error.message, 400);
};
