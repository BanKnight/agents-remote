// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { JSDOM } from "jsdom";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import {
  useClaudeSession,
  RESTORE_TIMEOUT_MS,
  SESSION_INIT_WATCHDOG_MS,
  WS_CONNECT_TIMEOUT_MS,
} from "./claude-adapter";
import {
  replayCacheKey,
  saveReplayCache,
  setReplayCacheStoreForTests,
  REPLAY_WINDOW_MAX_CHARS,
} from "../lib/claude-replay-cache";
import { createMemReplayStore } from "../lib/replay-cache-store";
import { queryClient } from "../lib/query-client";
import { setSocketLoggingEnabled } from "../lib/debug-flags";
import { HEARTBEAT_INTERVAL_MS } from "../lib/ws-heartbeat";

// bun:test 的 afterEach 不是裸全局（typeof afterEach === "undefined"），RTL 的
// auto-cleanup 注册条件不满足 → 组件从不跨测试卸载 → 上一测试的 WebSocket/重连
// 定时器泄漏进后续测试（500ms scheduleReconnect 触发泄漏组件 effect 重跑 → 新
// socket 污染 MockSocket.instances → waitFor(length 1) 偶发失败）。手动补注册：
// 每测试结束卸载全部渲染结果，WS effect cleanup 关闭 socket、detach fiber。
afterEach(() => {
  cleanup();
  setReplayCacheStoreForTests(null); // 还原生产懒创建路径
});

class MockSocket {
  static instances: MockSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readyState = MockSocket.CONNECTING;
  sent: string[] = [];
  listeners = new Map<string, Array<() => void>>();
  onopen: null | (() => void) = null;
  onmessage: null | ((event: { data: ArrayBuffer | string }) => void) = null;
  onclose: null | (() => void) = null;
  onerror: null | ((event: unknown) => void) = null;

  constructor(public url: string) {
    MockSocket.instances.push(this);
  }

  addEventListener(type: string, cb: () => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }

  send(raw: string) {
    this.sent.push(raw);
  }

  close() {
    this.readyState = MockSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    this.readyState = MockSocket.OPEN;
    this.onopen?.();
    for (const cb of this.listeners.get("open") ?? []) cb();
  }

  emit(data: SessionStreamServerMessage) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  // Emit one gzipped binary frame exactly as the server's createBatchEmitter
  // does: rows joined with "\n", gzip-compressed, delivered as an ArrayBuffer
  // (binaryType="arraybuffer" shape). Relies on the host's DecompressionStream
  // (Bun provides it natively; the test exercises the real decompress path).
  emitBinary(rows: SessionStreamServerMessage[]) {
    const text = rows.map((r) => JSON.stringify(r)).join("\n");
    const gz = Bun.gzipSync(Buffer.from(text));
    this.onmessage?.({ data: gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) });
  }
}

const setFetch = () => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ session: { id: "s1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
};

// 回放缓存恢复用例的存储注入：bun/jsdom 无 IndexedDB，用 replay-cache-store 的内存
// 实现替代（生产 IDB 路径靠浏览器探针验证）。
let memStore: ReturnType<typeof createMemReplayStore>;

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.navigator = dom.window.navigator as unknown as Navigator;
  // JSDOM localStorage 保留（composer-draft 等其它消费方仍用）；回放缓存不再走它。
  globalThis.localStorage = dom.window.localStorage;
  memStore = createMemReplayStore();
  setReplayCacheStoreForTests(memStore);
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: dom.window.location,
  });
  globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
  MockSocket.instances = [];
  setFetch();
});

describe("useClaudeSession websocket lifecycle", () => {
  test("first live message can arrive without replay markers", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "assistant",
        message: { id: "live-1", role: "assistant", content: [{ type: "text", text: "hello" }] },
        session_id: "s1",
      } as never);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.storeAdapter.messages).toHaveLength(1);
    expect(result.current.storeAdapter.messages[0]?.role).toBe("assistant");
  });

  test("initialModel/permissionMode arriving async does not reopen the socket", async () => {
    // The session-detail query resolves after mount: detail.data?.session.model
    // goes undefined → string. resetSessionState must NOT change identity, or the
    // WebSocket effect re-runs mid-replay, tears the connection down, reconnects,
    // and replays twice (historyStart=2, inflated historyRecv).
    let model: string | undefined;
    let permissionMode: string | undefined;
    const { rerender } = renderHook(() => useClaudeSession("proj", "sess", model, permissionMode));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));

    model = "claude-sonnet-4-6";
    permissionMode = "default";
    rerender();

    expect(MockSocket.instances).toHaveLength(1);
  });

  test("empty output batch does not crash or add messages", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "live_start", count: 0 } as never);
      socket.emit({ type: "live_end" } as never);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.tasks).toEqual([]);
  });

  test("pong heartbeat ack is not rendered into the message stream", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "live_start", count: 0 } as never);
      socket.emit({ type: "live_end" } as never);
      socket.emit({ type: "pong" } as never);
    });

    // pong 是 transport 控制帧(心跳 ack),在 handleTextFrame 早返回——
    // 不进 rawMessages、不渲染成消息气泡。
    expect(result.current.storeAdapter.messages).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });

  test("pong timeout closes half-open socket and triggers reconnect", async () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useClaudeSession("proj", "sess"));
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const socket = MockSocket.instances[0];
      act(() => socket.open());
      expect(socket.readyState).toBe(MockSocket.OPEN);

      // 模拟 half-open:服务端不回 pong(lastPongRef 停在 onopen 时刻)。心跳每
      // HEARTBEAT_INTERVAL_MS tick;累计超过 PONG_TIMEOUT_MS(2 倍周期)后,心跳检查
      // 判定超时 → socket.close → onclose → scheduleReconnect 自愈。
      // 第 3 次 tick(75s)时 75000-0 > 50000 → close。
      act(() => {
        vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
      });
      expect(socket.readyState).toBe(MockSocket.CLOSED);

      act(() => {
        vi.advanceTimersByTime(500); // scheduleReconnect 的 500ms 退避
      });
      await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
    } finally {
      vi.useRealTimers();
    }
  });

  test("session_init watchdog closes a silent-but-open socket and reconnects", async () => {
    // 2026-10-26 骨架永驻批：socket open 但从未被订阅时（服务端 open 失败等半死形态），
    // pong 照常回复——心跳/浏览器都发现不了，骨架永驻。open 后 SESSION_INIT_WATCHDOG_MS
    // 内没等到 session_init → 主动 close → onclose → 500ms 重连自愈。
    vi.useFakeTimers();
    try {
      renderHook(() => useClaudeSession("proj", "sess"));
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const socket = MockSocket.instances[0];
      act(() => socket.open());

      // 容差内不误杀：差 1ms 到期仍是 OPEN。
      act(() => {
        vi.advanceTimersByTime(SESSION_INIT_WATCHDOG_MS - 1);
      });
      expect(socket.readyState).toBe(MockSocket.OPEN);

      // 到期：看门狗关掉半死连接。
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(socket.readyState).toBe(MockSocket.CLOSED);

      act(() => {
        vi.advanceTimersByTime(500); // scheduleReconnect 的 500ms 退避
      });
      await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
    } finally {
      vi.useRealTimers();
    }
  });

  test("connect watchdog closes a socket stuck in CONNECTING and reconnects", async () => {
    // 2026-10-26「一直在连接中」批：既有全部自愈机制（session_init 看门狗/心跳/退避）
    // 都武装在 onopen 之后——握手挂起（onopen 永不到）期间 CONNECTING 裸奔，UI 停在
    // 「正在建立连接中…」直到系统级 TCP 超时。连接级看门狗在 new WebSocket 后武装，
    // 到期 close → onclose → 退避重连自愈。
    vi.useFakeTimers();
    try {
      renderHook(() => useClaudeSession("proj", "sess"));
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const socket = MockSocket.instances[0];
      // 握手未落定：不调 open()，模拟挂起的握手。
      expect(socket.readyState).toBe(MockSocket.CONNECTING);

      // 未到点不误杀。分两段推进而非「差 1ms」：本看门狗武装在 effect 内（waitFor 之前），
      // 而 RTL 的 waitFor 在 fake timers 下会推进虚拟时钟 ~1ms（实测）——「差 1ms」的余量
      // 会被这 1ms 吃满导致提前 fire。半程断言对这类毫秒级内部偏移鲁棒。
      act(() => {
        vi.advanceTimersByTime(WS_CONNECT_TIMEOUT_MS / 2);
      });
      expect(socket.readyState).toBe(MockSocket.CONNECTING);

      // 到期：砍掉挂死的握手。
      act(() => {
        vi.advanceTimersByTime(WS_CONNECT_TIMEOUT_MS / 2 + 1);
      });
      expect(socket.readyState).toBe(MockSocket.CLOSED);

      // 到期：砍掉挂死的握手。
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(socket.readyState).toBe(MockSocket.CLOSED);

      act(() => {
        vi.advanceTimersByTime(500); // scheduleReconnect 的 500ms 退避
      });
      await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
    } finally {
      vi.useRealTimers();
    }
  });

  test("connect watchdog hands off to session_init watchdog on open (no double-fire)", async () => {
    // onopen 落定必须解除连接级看门狗（clear 后同一 timer 槽转武装 session_init 看门狗）——
    // 否则旧 timer 泄漏并在 open 后 10s 误杀活连接（活 socket 被砍 = 无谓断线循环）。
    vi.useFakeTimers();
    try {
      renderHook(() => useClaudeSession("proj", "sess"));
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const socket = MockSocket.instances[0];
      act(() => socket.open());

      // 跨两个看门狗时长之和推进：session_init 看门狗已被 session_init 到达解除，
      // 连接级看门狗若未在 onopen 时解除，此处必误杀（timer 相加仍在窗口内）。
      act(() => {
        socket.emit({ type: "session_init", resume: false, replay: "full" } as never);
      });
      act(() => {
        vi.advanceTimersByTime(WS_CONNECT_TIMEOUT_MS + SESSION_INIT_WATCHDOG_MS);
      });
      expect(socket.readyState).toBe(MockSocket.OPEN);
    } finally {
      vi.useRealTimers();
    }
  });

  test("session_init arrival disarms the watchdog (no false kill on slow replay)", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useClaudeSession("proj", "sess"));
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const socket = MockSocket.instances[0];
      act(() => socket.open());
      act(() => {
        socket.emit({ type: "session_init", resume: false, replay: "full" } as never);
      });

      // 订阅建立的第一帧已到——远超看门狗时长也不误杀（合法慢路径：respawn + 大 JSONL
      // 读期间连接保活）。loading 仍 true（full 回放尚未开始），但 socket 必须活着。
      act(() => {
        vi.advanceTimersByTime(SESSION_INIT_WATCHDOG_MS * 2);
      });
      expect(socket.readyState).toBe(MockSocket.OPEN);
      expect(result.current.loading).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("persistent reconnect failure backs off exponentially (500ms then 1s)", async () => {
    // perf review（2026-10-26 骨架永驻批）：服务端 open 失败 error+close 成受控重连循环后，
    // 固定 500ms = ~2 次/秒无界风暴（CLI fork + 状态条闪烁）。钉退避：连续 onclose 下
    // 重连延迟 500ms → 1s 指数增长（cap 30s 不在此测——只钉增长方向）。
    vi.useFakeTimers();
    try {
      renderHook(() => useClaudeSession("proj", "sess"));
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const failSocket = (socket: MockSocket) => {
        act(() => socket.open());
        // 模拟服务端 open 失败快速失败：直接 close（onclose → scheduleReconnect 退避）。
        act(() => socket.close());
      };

      failSocket(MockSocket.instances[0]!);
      // 第 1 次重连：500ms（2⁰）。差 1ms 不连、到点连上。
      act(() => {
        vi.advanceTimersByTime(499);
      });
      expect(MockSocket.instances).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      await waitFor(() => expect(MockSocket.instances).toHaveLength(2));

      failSocket(MockSocket.instances[1]!);
      // 第 2 次重连：1s（2¹）——若退避没生效仍会 500ms 就连上，此断言 fail。
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(MockSocket.instances).toHaveLength(2);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      await waitFor(() => expect(MockSocket.instances).toHaveLength(3));
    } finally {
      vi.useRealTimers();
    }
  });

  test("SESSION_STATE_CONFLICT error frame stops reconnect and fires onModeConflict", async () => {
    vi.useFakeTimers();
    try {
      const onModeConflict = vi.fn();
      const { result } = renderHook(() =>
        useClaudeSession("proj", "sess", undefined, undefined, { onModeConflict }),
      );
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const socket = MockSocket.instances[0];
      act(() => socket.open());

      // 多端跟随（2026-10-16）：另一端切 terminal 后本端重连撞 open() 守卫——识别该帧
      // → 通知外层失效 detail + 关 socket；onclose 不再 scheduleReconnect（500ms 后无新
      // socket = 重连已停，防与 AgentPanelRouter 换形态后的新面板叠连）。
      act(() => {
        socket.emit({
          type: "error",
          code: "SESSION_STATE_CONFLICT",
          message: "Session is in terminal mode",
        } as never);
      });
      expect(onModeConflict).toHaveBeenCalledTimes(1);
      expect(socket.readyState).toBe(MockSocket.CLOSED);
      // P3-7：连接态一并清理（connected/loading 归零），不留假连接态给其它消费面。
      expect(result.current.connected).toBe(false);
      expect(result.current.loading).toBe(false);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(MockSocket.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("handles replay, switch model, and control_request branches", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "history_start", count: 1 });
      socket.emit({
        type: "assistant",
        message: { id: "a1", role: "assistant", content: [] },
        session_id: "s1",
      });
      socket.emit({ type: "history_end" });
      socket.emit({ type: "live_start", count: 0 } as never);
      socket.emit({ type: "live_end" } as never);
    });

    expect(result.current.loading).toBe(false);
    // assistant(1) + history divider(1 system) = 2
    // (markers are no longer rendered as raw bubbles)
    expect(result.current.storeAdapter.messages).toHaveLength(2);
  });

  test("compressed history batch decompresses and renders like the text path", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    await act(async () => {
      socket.emit({ type: "history_start", count: 1 });
      socket.emitBinary([
        {
          type: "assistant",
          message: { id: "a1", role: "assistant", content: [{ type: "text", text: "hi" }] },
          session_id: "s1",
        } as never,
      ]);
      socket.emit({ type: "history_end" });
      socket.emit({ type: "live_start", count: 0 } as never);
      socket.emit({ type: "live_end" } as never);
    });

    await waitFor(() => expect(result.current.storeAdapter.messages).toHaveLength(2));
    expect(result.current.loading).toBe(false);
  });

  test("compressed live batch decompresses and clears loading", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    await act(async () => {
      socket.emit({ type: "history_start", count: 0 } as never);
      socket.emit({ type: "history_end" });
      socket.emit({ type: "live_start", count: 1 } as never);
      socket.emitBinary([
        {
          type: "assistant",
          message: { id: "l1", role: "assistant", content: [{ type: "text", text: "live" }] },
          session_id: "s1",
        } as never,
      ]);
      socket.emit({ type: "live_end" });
    });

    // No history (count 0) ⇒ no boundary divider; only the one live assistant
    // message should render.
    await waitFor(() => expect(result.current.storeAdapter.messages).toHaveLength(1));
    expect(result.current.loading).toBe(false);
  });

  test("reconnect replays only the missing uuid tail", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useClaudeSession("proj", "sess"));
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const socket = MockSocket.instances[0];
      act(() => socket.open());

      act(() => {
        socket.emit({
          type: "assistant",
          uuid: "uuid-1",
          message: { id: "a1", role: "assistant", content: [{ type: "text", text: "first" }] },
          session_id: "s1",
        } as never);
      });
      expect(result.current.storeAdapter.messages).toHaveLength(1);

      act(() => {
        socket.onclose?.();
      });
      expect(result.current.loading).toBe(true);
      expect(result.current.storeAdapter.messages).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(500);
      });
      await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
      const reconnectSocket = MockSocket.instances[1];
      act(() => reconnectSocket.open());

      act(() => {
        reconnectSocket.emit({ type: "history_start", count: 2 } as never);
        reconnectSocket.emit({
          type: "assistant",
          uuid: "uuid-1",
          message: { id: "a1", role: "assistant", content: [{ type: "text", text: "first" }] },
          session_id: "s1",
        } as never);
        reconnectSocket.emit({
          type: "assistant",
          uuid: "uuid-2",
          message: { id: "a2", role: "assistant", content: [{ type: "text", text: "second" }] },
          session_id: "s1",
        } as never);
        reconnectSocket.emit({ type: "history_end" } as never);
        reconnectSocket.emit({ type: "live_start", count: 0 } as never);
        reconnectSocket.emit({ type: "live_end" } as never);
      });

      expect(result.current.loading).toBe(false);
      // normalizeChatStream groups by message.id: the first-conn a1 and
      // replay a1 share the same id so they merge into one bubble (no
      // duplicate). Result: merged assistant a1 + assistant a2 + history
      // divider = 3.
      expect(result.current.storeAdapter.messages).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test("delta reconnect keeps state, sends the anchor, and closes without a divider", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useClaudeSession("proj", "sess"));
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const socket = MockSocket.instances[0];
      act(() => socket.open());
      act(() => {
        socket.emit({
          type: "assistant",
          uuid: "uuid-1",
          message: { id: "a1", role: "assistant", content: [{ type: "text", text: "first" }] },
          session_id: "s1",
        } as never);
      });
      expect(result.current.storeAdapter.messages).toHaveLength(1);

      act(() => {
        socket.onclose?.();
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
      const reconnectSocket = MockSocket.instances[1];
      // 重连 URL 携带本地锚（最后一条带 uuid 消息）。
      expect(reconnectSocket.url).toContain("since=uuid-1");
      act(() => reconnectSocket.open());

      act(() => {
        reconnectSocket.emit({ type: "session_init", resume: true, replay: "delta" } as never);
        reconnectSocket.emit({ type: "history_start", count: 0 } as never);
        reconnectSocket.emit({ type: "history_end" } as never);
        reconnectSocket.emit({ type: "live_start", count: 1 } as never);
        reconnectSocket.emit({
          type: "assistant",
          uuid: "uuid-2",
          message: { id: "a2", role: "assistant", content: [{ type: "text", text: "second" }] },
          session_id: "s1",
        } as never);
        reconnectSocket.emit({ type: "live_end" } as never);
      });

      expect(result.current.loading).toBe(false);
      // delta 路径：不 reset（首连的 a1 保留）+ 不注 divider → 恰 2 条。扛判别的
      // 是 deltaEnter 的 from=1（隐含 a1 保留）——长度断言区分不了 full-reset 回归
      //（full 同样 2 条：reset 清掉 a1 后重放 a1+a2）。
      expect(result.current.storeAdapter.messages).toHaveLength(2);
      const firstText = (
        result.current.storeAdapter.messages[0]?.content as Array<{ type: string; text: string }>
      )?.[0]?.text;
      expect(firstText).toContain("first");
      await waitFor(() => expect(result.current.deltaEnter).toEqual({ from: 1, to: 2 }));
      // 增量回合结束后，后续 live 行不再计入淡入范围（范围已封口）。
      act(() => {
        reconnectSocket.emit({
          type: "assistant",
          uuid: "uuid-3",
          message: { id: "a3", role: "assistant", content: [{ type: "text", text: "third" }] },
          session_id: "s1",
        } as never);
      });
      expect(result.current.deltaEnter).toEqual({ from: 1, to: 2 });
      // 封口 ~600ms 后摘除动画 class（防虚拟列表滚出滚回重播淡入）。
      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(result.current.deltaEnter).toBe(null);
    } finally {
      vi.useRealTimers();
    }
  });

  test("delta replay does not fake running when the history tail ends with an open assistant", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useClaudeSession("proj", "sess"));
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const socket = MockSocket.instances[0];
      act(() => socket.open());
      // 断线时正在流式：user echo + 悬空 assistant（无 result）。
      act(() => {
        socket.emit({
          type: "user",
          uuid: "uuid-u1",
          isUserInput: true,
          message: { role: "user", content: [{ type: "text", text: "go" }] },
          session_id: "s1",
        } as never);
        socket.emit({
          type: "assistant",
          uuid: "uuid-1",
          message: { id: "a1", role: "assistant", content: [{ type: "text", text: "…" }] },
          session_id: "s1",
        } as never);
      });

      act(() => {
        socket.onclose?.();
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
      const reconnectSocket = MockSocket.instances[1];
      act(() => reconnectSocket.open());

      // delta 补齐段尾 = 悬空 assistant（断线瞬间 CLI 的 live 尾行），live 段空。
      act(() => {
        reconnectSocket.emit({ type: "session_init", resume: true, replay: "delta" } as never);
        reconnectSocket.emit({ type: "history_start", count: 1 } as never);
        reconnectSocket.emit({
          type: "assistant",
          uuid: "uuid-2",
          message: { id: "a2", role: "assistant", content: [{ type: "text", text: "more" }] },
          session_id: "s1",
        } as never);
        reconnectSocket.emit({ type: "history_end" } as never);
        reconnectSocket.emit({ type: "live_start", count: 0 } as never);
        reconnectSocket.emit({ type: "live_end" } as never);
      });

      // liveStart 必须落在补齐段之后：补齐段内的悬空 assistant 不算 running
      //（没有正在进行的 turn——CLI 已停，只是补历史）。liveStart 若照抄
      // batch.length，扫描会覆盖前缀里的悬空 assistant → 假 running。
      expect(result.current.storeAdapter.isRunning).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("messages flow through pipeline without errors", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "system",
        subtype: "status",
        status: "compacting",
        session_id: "s1",
      } as never);
      socket.emit({
        type: "assistant",
        message: {
          id: "ask",
          role: "assistant",
          content: [
            { type: "tool_use", id: "tu-ask", name: "AskUserQuestion", input: { questions: [] } },
          ],
        },
        session_id: "s1",
      } as never);
      socket.emit({ type: "result", subtype: "success", session_id: "s1", num_turns: 1 } as never);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.storeAdapter.messages.length).toBeGreaterThan(0);
  });

  test("bridge methods and transport lifecycle keep local state in sync", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "user",
        message: { role: "user", content: "hello" },
      } as never);
    });

    // user prompt rendered as a visible bubble
    expect(result.current.storeAdapter.messages.length).toBeGreaterThan(0);

    await act(async () => {
      await result.current.storeAdapter.onNew({
        content: [{ type: "text", text: "hello" }],
      } as never);
    });
    expect(socket.sent.some((s) => s.includes('"text":"hello"'))).toBe(true);

    act(() => {
      result.current.bridge.respondToControlRequest("req-1", {
        foo: "bar",
        answers: ["yes"],
      } as never);
      result.current.bridge.cancelControlRequest("req-2");
      result.current.bridge.sendToolResult("tool-1", [{ type: "text", text: "ok" }] as never);
      result.current.bridge.sendMessage("world");
      result.current.bridge.switchModel("opus");
      result.current.bridge.switchPermissionMode("default");
      result.current.bridge.switchEffort("max");
    });

    expect(result.current.currentModel).toBe("opus");
    expect(result.current.permissionMode).toBe("default");
    expect(
      socket.sent.some(
        (s) => s.includes('"request_id":"req-1"') && s.includes('"behavior":"allow"'),
      ),
    ).toBe(true);
    expect(
      socket.sent.some(
        (s) => s.includes('"request_id":"req-2"') && s.includes('"message":"User skipped"'),
      ),
    ).toBe(true);
    expect(socket.sent.some((s) => s.includes('"tool_use_id":"tool-1"'))).toBe(true);
    expect(socket.sent.some((s) => s.includes('"text":"world"'))).toBe(true);
    expect(
      socket.sent.some(
        (s) =>
          s.includes('"type":"control_request"') &&
          s.includes('"subtype":"set_model"') &&
          s.includes('"model":"opus"'),
      ),
    ).toBe(true);
    expect(
      socket.sent.some(
        (s) =>
          s.includes('"type":"control_request"') &&
          s.includes('"subtype":"set_permission_mode"') &&
          s.includes('"mode":"default"'),
      ),
    ).toBe(true);
    // effort switch: not a CLI control_request (no request_id), just a
    // set_runtime_effort frame the server turns into a CLI relaunch + reconnect
    expect(
      socket.sent.some(
        (s) => s.includes('"type":"set_runtime_effort"') && s.includes('"effort":"max"'),
      ),
    ).toBe(true);

    act(() => {
      socket.onerror?.({ message: "boom" });
      socket.onclose?.();
    });

    expect(result.current.loading).toBe(true);
    // Messages persist across disconnect (live output is preserved)
    expect(result.current.storeAdapter.messages.length).toBeGreaterThan(0);
  });

  test("messages after compact flow through pipeline", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "result", subtype: "success", session_id: "s1", num_turns: 1 } as never);
      socket.emit({
        type: "assistant",
        message: {
          id: "live",
          role: "assistant",
          content: [{ type: "text", text: "after compact" }],
        },
        session_id: "s1",
      } as never);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.storeAdapter.messages.length).toBeGreaterThan(0);
  });

  test("onCancel sends interrupt request", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    await act(async () => {
      await result.current.storeAdapter.onCancel();
    });

    expect(socket.sent.some((s) => s.includes('"subtype":"interrupt"'))).toBe(true);
  });

  test("live messages flow through pipeline to storeAdapter", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "assistant",
        message: {
          id: "msg-1",
          role: "assistant",
          content: [{ type: "tool_use", id: "tu-1", name: "Bash", input: {} }],
        },
        session_id: "s1",
      } as never);
      socket.emit({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: "echo" }] },
      } as never);
    });

    expect(result.current.storeAdapter.messages.some((msg) => msg.role === "user")).toBe(true);
    // tool_use-only assistant → tool-card system message, no assistant bubble
    expect(
      result.current.storeAdapter.messages.some(
        (msg) =>
          msg.role === "system" &&
          ((msg.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
            "tool-card",
      ),
    ).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  test("empty text input is not sent to socket", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    await act(async () => {
      await result.current.storeAdapter.onNew({
        content: [{ type: "text", text: "   " }],
      } as never);
    });
    expect(socket.sent.some((s) => s.includes('"text":"   "'))).toBe(false);
  });

  test("initial props hydrate via rerender when values arrive later", async () => {
    const { result, rerender } = renderHook(
      ({ model, permissionMode }: { model?: string; permissionMode?: string }) =>
        useClaudeSession("proj", "sess", model, permissionMode),
      {
        initialProps: { model: undefined, permissionMode: undefined },
      },
    );
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));

    rerender({ model: "gpt-4.1", permissionMode: "auto" });

    await waitFor(() => expect(result.current.resolvedModel).toBe("gpt-4.1"));
    await waitFor(() => expect(result.current.permissionMode).toBe("auto"));
  });

  test("initial props, deferred sends, and empty composer input are handled", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess", "gpt-4.1", "auto"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];

    expect(result.current.resolvedModel).toBe("gpt-4.1");
    expect(result.current.permissionMode).toBe("auto");

    act(() => {
      result.current.bridge.sendMessage("queued before open");
      result.current.bridge.sendToolResult("tu-1", [{ type: "text", text: "queued" }] as never);
    });
    expect(socket.sent).toHaveLength(0);
    act(() => socket.open());
    expect(socket.sent.some((s) => s.includes('"text":"queued before open"'))).toBe(true);
    expect(socket.sent.some((s) => s.includes('"tool_use_id":"tu-1"'))).toBe(true);

    await act(async () => {
      await result.current.storeAdapter.onNew({
        content: [{ type: "text", text: "   " }],
      } as never);
    });
    expect(socket.sent.some((s) => s.includes('"text":"   "'))).toBe(false);
  });

  test("open-path sends hit the immediate send error handler", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sendSpy = vi.spyOn(socket, "send").mockImplementation(() => {
      throw new Error("open boom");
    });

    act(() => socket.open());
    act(() => {
      result.current.bridge.sendMessage("now");
    });

    expect(sendSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    sendSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("deferred sends hit the open listener error path", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sendSpy = vi.spyOn(socket, "send").mockImplementation(() => {
      throw new Error("deferred boom");
    });

    act(() => {
      result.current.bridge.sendMessage("queued while connecting");
    });
    expect(socket.sent).toHaveLength(0);
    act(() => socket.open());

    expect(sendSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    sendSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("EnterPlanMode tool_use sets permissionMode to plan", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "assistant",
        userType: "external",
        message: {
          id: "m1",
          role: "assistant",
          content: [{ type: "tool_use", id: "tu-plan", name: "EnterPlanMode", input: {} }],
        },
      } as never);
    });

    expect(result.current.permissionMode).toBe("plan");
  });

  test("permission-mode message sets permissionMode without rendering a bubble", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const before = result.current.storeAdapter.messages.length;
    act(() => {
      socket.emit({
        type: "permission-mode",
        permissionMode: "acceptEdits",
      } as never);
    });

    expect(result.current.permissionMode).toBe("acceptEdits");
    // permission-mode is global state (set at resume), not a chat event — it
    // updates the scalar only, no inline notice in the stream.
    expect(result.current.storeAdapter.messages.length).toBe(before);
  });

  test("ai-title and agent-name are state signals, produce no bubble", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const before = result.current.storeAdapter.messages.length;
    act(() => {
      socket.emit({ type: "ai-title", aiTitle: "测试标题" } as never);
    });
    expect(result.current.aiTitle).toBe("测试标题");
    expect(result.current.storeAdapter.messages.length).toBe(before);

    act(() => {
      socket.emit({ type: "agent-name", agentName: "test-agent" } as never);
    });
    expect(result.current.agentName).toBe("test-agent");
    expect(result.current.storeAdapter.messages.length).toBe(before);

    // Dedup: same value should not trigger re-render count change (react batches)
    act(() => {
      socket.emit({ type: "ai-title", aiTitle: "测试标题" } as never);
    });
    expect(result.current.aiTitle).toBe("测试标题");
    expect(result.current.storeAdapter.messages.length).toBe(before);
  });
});

describe("useClaudeSession queue-operation", () => {
  test("live enqueue does not produce bubble, updates inputQueue", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const before = result.current.storeAdapter.messages.length;
    act(() => {
      socket.emit({
        type: "queue-operation",
        operation: "enqueue",
        content: "/model opusplan",
      } as never);
    });

    expect(result.current.storeAdapter.messages.length).toBe(before);
    expect(result.current.inputQueue).toEqual([{ content: "/model opusplan", source: "user" }]);
  });

  test("enqueue/dequeue/remove/popAll sequence", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "queue-operation",
        operation: "enqueue",
        content: "/model opusplan",
      } as never);
      socket.emit({
        type: "queue-operation",
        operation: "enqueue",
        content: "<task-notification><task-id>a1</task-id></task-notification>",
      } as never);
    });
    expect(result.current.inputQueue).toHaveLength(2);
    expect(result.current.inputQueue[0].source).toBe("user");
    expect(result.current.inputQueue[1].source).toBe("assistant");

    act(() => socket.emit({ type: "queue-operation", operation: "dequeue" } as never));
    expect(result.current.inputQueue).toHaveLength(1);

    act(() => socket.emit({ type: "queue-operation", operation: "remove" } as never));
    expect(result.current.inputQueue).toHaveLength(0);

    // popAll on already-empty queue → []
    act(() =>
      socket.emit({ type: "queue-operation", operation: "popAll", content: "old text" } as never),
    );
    expect(result.current.inputQueue).toHaveLength(0);
  });

  test("history replay batch processes queue-operation without bubble", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "history_start", count: 2 });
      socket.emit({
        type: "assistant",
        message: { id: "a1", role: "assistant", content: [] },
        session_id: "s1",
      });
      socket.emit({ type: "queue-operation", operation: "enqueue", content: "/model" } as never);
      socket.emit({ type: "history_end" });
      socket.emit({ type: "live_start", count: 0 } as never);
      socket.emit({ type: "live_end" } as never);
    });

    expect(result.current.loading).toBe(false);
    // Only the assistant message should be in the list
    expect(result.current.storeAdapter.messages.some((m) => m.role === "assistant")).toBe(true);
    expect(result.current.inputQueue).toEqual([{ content: "/model", source: "user" }]);
  });

  test("session reset clears inputQueue", async () => {
    const { result, rerender } = renderHook(
      ({ project, session }: { project: string; session: string }) =>
        useClaudeSession(project, session),
      { initialProps: { project: "proj", session: "sess" } },
    );
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "queue-operation", operation: "enqueue", content: "/model" } as never);
    });
    expect(result.current.inputQueue).toHaveLength(1);

    // Switch session triggers reset
    rerender({ project: "proj", session: "sess2" });
    await waitFor(() => expect(result.current.inputQueue).toHaveLength(0));
  });

  test("ws recv log still prints queue-operation", async () => {
    // Socket logging is gated behind a runtime switch (default OFF). The recv
    // log is only emitted while opted in, so enable it for this assertion and
    // restore the default afterward to avoid leaking into sibling tests.
    setSocketLoggingEnabled(true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const msg = { type: "queue-operation", operation: "enqueue", content: "/model" } as const;
    act(() => socket.emit(msg as never));

    expect(logSpy).toHaveBeenCalledWith("[claude-adapter] ws recv", msg);
    logSpy.mockRestore();
    setSocketLoggingEnabled(false);
  });

  test("XML content → assistant source, plain text → user source", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "queue-operation",
        operation: "enqueue",
        content: "<task-notification><task-id>a1</task-id></task-notification>",
      } as never);
      socket.emit({ type: "queue-operation", operation: "enqueue", content: "普通文本" } as never);
      socket.emit({ type: "queue-operation", operation: "enqueue" } as never);
    });

    expect(result.current.inputQueue[0]).toEqual({
      content: "<task-notification><task-id>a1</task-id></task-notification>",
      source: "assistant",
    });
    expect(result.current.inputQueue[1]).toEqual({ content: "普通文本", source: "user" });
    expect(result.current.inputQueue[2]).toEqual({ content: "", source: "user" });
  });
});

describe("useClaudeSession API error handling", () => {
  const apiErrorMsg = (overrides: Record<string, unknown> = {}) =>
    ({
      type: "assistant",
      message: {
        id: "err-1",
        role: "assistant",
        model: "<synthetic>",
        content: [{ type: "text", text: "500 Request failed" }],
      },
      userType: "external",
      isApiErrorMessage: true,
      error: "server_error",
      uuid: "err-uuid",
      parentUuid: "parent-uuid",
      ...overrides,
    }) as unknown as SessionStreamServerMessage;

  const extAssistant = (id: string, text: string, uuid: string): SessionStreamServerMessage =>
    ({
      type: "assistant",
      message: { id, role: "assistant", content: [{ type: "text", text }] },
      userType: "external",
      uuid,
    }) as unknown as SessionStreamServerMessage;

  const getMessages = (result: { current: ReturnType<typeof useClaudeSession> }) =>
    result.current.storeAdapter.messages;

  test("live: API error after parent attaches to parent bubble, no extra bubble", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(extAssistant("a1", "hello", "parent-uuid"));
      socket.emit(apiErrorMsg({ parentUuid: "parent-uuid" }));
    });

    // assistant only; error NOT standalone
    expect(getMessages(result)).toHaveLength(1);
    const custom = getMessages(result)[0]?.metadata?.custom as Record<string, unknown>;
    const apiErrors = custom?.apiErrors as unknown[];
    expect(apiErrors).toHaveLength(1);
  });

  test("live: error before parent → pending, then resolved when parent arrives", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(apiErrorMsg({ parentUuid: "parent-uuid", uuid: "e1" }));
      socket.emit(extAssistant("a1", "hello", "parent-uuid"));
    });

    // assistant only; error NOT standalone
    expect(getMessages(result)).toHaveLength(1);
    const custom = getMessages(result)[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom?.apiErrors).toHaveLength(1);
  });

  test("history batch: parent + error in same batch → error attaches, no standalone", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "history_start", count: 2 });
      socket.emit(extAssistant("a1", "hello", "parent-uuid"));
      socket.emit(apiErrorMsg({ parentUuid: "parent-uuid", uuid: "e1" }));
      socket.emit({ type: "history_end" });
    });

    // assistant + history divider = 2 messages; markers not rendered; error NOT standalone
    const msgs = getMessages(result);
    const assistantMsgs = msgs.filter((m) => m.role === "assistant");
    expect(assistantMsgs).toHaveLength(1);
    const custom = assistantMsgs[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom?.apiErrors).toHaveLength(1);
  });

  test("output batch: API error does not create standalone bubble", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "live_start", count: 2 } as never);
      socket.emit(extAssistant("a2", "world", "pu-2"));
      socket.emit(apiErrorMsg({ parentUuid: "pu-2", uuid: "e2" }));
      socket.emit({ type: "live_end" } as never);
    });

    const msgs = getMessages(result);
    const assistantMsgs = msgs.filter((m) => m.role === "assistant");
    expect(assistantMsgs).toHaveLength(1);
    const custom = assistantMsgs[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom?.apiErrors).toHaveLength(1);
  });

  test("normal external assistant still rendered (no regression)", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(extAssistant("a1", "normal reply", "uuid-a1"));
    });

    expect(getMessages(result)).toHaveLength(1);
    expect(getMessages(result)[0]?.role).toBe("assistant");
  });
});

describe("useClaudeSession batch marker rendering", () => {
  const getMessages = (result: { current: ReturnType<typeof useClaudeSession> }) =>
    result.current.storeAdapter.messages;

  test("empty history batch: no messages, no divider", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "history_start", count: 0 } as never);
      socket.emit({ type: "history_end" } as never);
    });

    // neither marker renders; no divider (empty batch)
    expect(getMessages(result)).toHaveLength(0);
  });

  test("empty output batch: no divider", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "live_start", count: 0 } as never);
      socket.emit({ type: "live_end" } as never);
    });

    // no divider
    expect(getMessages(result)).toHaveLength(0);
  });

  test("history batch with visible assistant → divider after batch", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "history_start", count: 1 });
      socket.emit({
        type: "assistant",
        message: { id: "a1", role: "assistant", content: [{ type: "text", text: "hello" }] },
      } as never);
      socket.emit({ type: "history_end" });
    });

    const msgs = getMessages(result);
    // assistant + divider = 2
    expect(msgs).toHaveLength(2);
    const last = msgs[msgs.length - 1];
    expect((last?.metadata?.custom as Record<string, unknown>)?.systemMessageType).toBe(
      "batch-boundary",
    );
  });

  test("output batch with only queue-operation: no divider", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "live_start", count: 1 } as never);
      socket.emit({ type: "queue-operation", operation: "enqueue", content: "/help" } as never);
      socket.emit({ type: "live_end" } as never);
    });

    // queue-operation is a side-effect, no visible bubble
    expect(getMessages(result)).toHaveLength(0);
    expect(result.current.inputQueue).toHaveLength(1);
  });
});

describe("useClaudeSession tool_result matching (external path)", () => {
  const getMessages = (result: { current: ReturnType<typeof useClaudeSession> }) =>
    result.current.storeAdapter.messages;

  const externalToolUseAssistant = (
    id: string,
    toolUses: Array<{ tool_use_id: string; name: string }>,
  ): SessionStreamServerMessage =>
    ({
      type: "assistant",
      userType: "external",
      message: {
        id,
        role: "assistant",
        content: toolUses.map((tu) => ({
          type: "tool_use",
          id: tu.tool_use_id,
          name: tu.name,
          input: {},
        })),
      },
    }) as unknown as SessionStreamServerMessage;

  const externalToolResultUser = (
    results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>,
  ): SessionStreamServerMessage =>
    ({
      type: "user",
      userType: "external",
      message: {
        role: "user",
        content: results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.tool_use_id,
          content: r.content,
          ...(r.is_error ? { is_error: true } : {}),
        })),
      },
    }) as unknown as SessionStreamServerMessage;

  test("single tool_use → tool_result: no user bubble, tool-call gets result", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-1", name: "Read" }]));
      socket.emit(externalToolResultUser([{ tool_use_id: "tu-1", content: "file contents" }]));
    });

    const msgs = getMessages(result);
    // Tool-card system message only (no assistant text part, no user bubble)
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.role).toBe("system");
    const custom = msgs[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom?.systemMessageType).toBe("tool-card");
    expect(custom?.toolCallId).toBe("tu-1");
    expect(custom?.result).toBe("file contents");
  });

  test("parallel tools: two tool_use in one assistant, two tool_result in one user", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(
        externalToolUseAssistant("a1", [
          { tool_use_id: "tu-a", name: "ToolA" },
          { tool_use_id: "tu-b", name: "ToolB" },
        ]),
      );
      socket.emit(
        externalToolResultUser([
          { tool_use_id: "tu-a", content: "result A" },
          { tool_use_id: "tu-b", content: "result B" },
        ]),
      );
    });

    const msgs = getMessages(result);
    // Two tool-card messages (from assistant with 2 tool_use, no text)
    expect(msgs).toHaveLength(2);
    const toolCards = msgs.map((m) => m.metadata?.custom as Record<string, unknown>);
    expect(toolCards[0]?.systemMessageType).toBe("tool-card");
    expect(toolCards[0]?.toolCallId).toBe("tu-a");
    expect(toolCards[0]?.result).toBe("result A");
    expect(toolCards[1]?.systemMessageType).toBe("tool-card");
    expect(toolCards[1]?.toolCallId).toBe("tu-b");
    expect(toolCards[1]?.result).toBe("result B");
  });

  test("hybrid text+tool_result: user bubble for text, tool-call gets result", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-1", name: "Read" }]));
      socket.emit({
        type: "user",
        userType: "external",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Continue from where you left off." },
            { type: "tool_result", tool_use_id: "tu-1", content: "file contents" },
          ],
        },
      } as unknown as SessionStreamServerMessage);
    });

    const msgs = getMessages(result);
    // Tool-card system message + user text bubble = 2
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("system");
    expect(msgs[1]?.role).toBe("user");
    expect(msgs[1]?.content).toBe("Continue from where you left off.");

    const toolCustom = msgs[0]?.metadata?.custom as Record<string, unknown>;
    expect(toolCustom?.systemMessageType).toBe("tool-card");
    expect(toolCustom?.toolCallId).toBe("tu-1");
    expect(toolCustom?.result).toBe("file contents");
  });

  test("tool_result with is_error sets isError on tool-call", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-ask", name: "Bash" }]));
      socket.emit(
        externalToolResultUser([{ tool_use_id: "tu-ask", content: "failed", is_error: true }]),
      );
    });

    const msgs = getMessages(result);
    expect(msgs).toHaveLength(1);
    const toolCustom = msgs[0]?.metadata?.custom as Record<string, unknown>;
    expect(toolCustom?.systemMessageType).toBe("tool-card");
    expect(toolCustom?.toolCallId).toBe("tu-ask");
    expect(toolCustom?.isError).toBe(true);
  });

  test("unhandled message type renders as visible fallback bubble", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "unknown_type",
        message: { some: "payload" },
        session_name: "proj/sess",
      } as unknown as SessionStreamServerMessage);
    });

    const msgs = getMessages(result);
    expect(msgs).toHaveLength(1);
    // Unknown types fall through to messageToThreadLike default → system role
    // with a summary line (type · subtype · uuid#), not raw JSON.
    expect(msgs[0]?.role).toBe("system");
    const content = msgs[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    const text = (content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("unknown_type");
    // Debug info is available via the _raw metadata on the bubble.
    const custom = msgs[0]?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?._raw).toBeDefined();
  });
});

describe("useClaudeSession resume-gated orphan marking", () => {
  const getMessages = (result: { current: ReturnType<typeof useClaudeSession> }) =>
    result.current.storeAdapter.messages;

  const externalToolUseAssistant = (
    id: string,
    toolUses: Array<{ tool_use_id: string; name: string }>,
  ): SessionStreamServerMessage =>
    ({
      type: "assistant",
      userType: "external",
      message: {
        id,
        role: "assistant",
        content: toolUses.map((tu) => ({
          type: "tool_use",
          id: tu.tool_use_id,
          name: tu.name,
          input: {},
        })),
      },
    }) as unknown as SessionStreamServerMessage;

  const externalToolResultUser = (
    results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>,
  ): SessionStreamServerMessage =>
    ({
      type: "user",
      userType: "external",
      message: {
        role: "user",
        content: results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.tool_use_id,
          content: r.content,
          is_error: r.is_error ?? false,
        })),
      },
    }) as unknown as SessionStreamServerMessage;

  test("resume history: pending tool_use marked orphaned at history_end", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "session_init", resume: true } as SessionStreamServerMessage);
      socket.emit({ type: "history_start", count: 1 } as SessionStreamServerMessage);
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-o", name: "Read" }]));
      socket.emit({ type: "history_end" } as SessionStreamServerMessage);
    });

    const msgs = getMessages(result);
    const toolCard = msgs.find(
      (m) =>
        m.role === "system" &&
        ((m.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
          "tool-card",
    );
    expect(toolCard).toBeDefined();
    const custom = toolCard!.metadata?.custom as Record<string, unknown>;
    expect(custom?.isInterrupted).toBe(true);
    expect(custom?.toolCallId).toBe("tu-o");
  });

  test("live (non-resume) history: pending tool_use NOT orphaned", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "session_init", resume: false } as SessionStreamServerMessage);
      socket.emit({ type: "history_start", count: 1 } as SessionStreamServerMessage);
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-p", name: "Read" }]));
      socket.emit({ type: "history_end" } as SessionStreamServerMessage);
    });

    const msgs2 = getMessages(result);
    const liveToolCard = msgs2.find(
      (m) =>
        m.role === "system" &&
        ((m.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
          "tool-card",
    );
    expect(liveToolCard).toBeDefined();
    const liveCustom = liveToolCard!.metadata?.custom as Record<string, unknown>;
    expect(liveCustom?.toolCallId).toBe("tu-p");
    expect(liveCustom?.isInterrupted).toBeUndefined();
  });

  test("resume: tool_use with already-matched result NOT orphaned", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "session_init", resume: true } as SessionStreamServerMessage);
      socket.emit({ type: "history_start", count: 2 } as SessionStreamServerMessage);
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-done", name: "Ask" }]));
      socket.emit(externalToolResultUser([{ tool_use_id: "tu-done", content: "answer" }]));
      socket.emit({ type: "history_end" } as SessionStreamServerMessage);
    });

    const msgs3 = getMessages(result);
    const doneToolCard = msgs3.find(
      (m) =>
        m.role === "system" &&
        ((m.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
          "tool-card",
    );
    expect(doneToolCard).toBeDefined();
    const doneCustom = doneToolCard!.metadata?.custom as Record<string, unknown>;
    expect(doneCustom?.result).toBe("answer");
    expect(doneCustom?.isInterrupted).toBeUndefined();
  });
});

// ── Attachment subtype integration tests ──────────────────────────────

describe("useClaudeSession attachment subtypes", () => {
  const attMsg = (subtype: string, fields?: Record<string, unknown>): SessionStreamServerMessage =>
    ({
      type: "attachment",
      userType: "external",
      uuid: "u-att",
      parentUuid: null,
      isSidechain: false,
      timestamp: "2025-06-16T00:00:00.000Z",
      sessionId: "s-1",
      attachment: { type: subtype, ...fields },
    }) as unknown as SessionStreamServerMessage;

  test("plan_mode sets permissionMode to plan and adds system bubble", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(attMsg("plan_mode"));
    });

    expect(result.current.permissionMode).toBe("plan");
    const msgs = result.current.storeAdapter.messages;
    const bubble = msgs[msgs.length - 1];
    expect(bubble?.role).toBe("system");
    const custom = bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("plan_mode");
  });

  test("auto_mode_exit sets permissionMode to default", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(attMsg("auto_mode_exit"));
    });

    expect(result.current.permissionMode).toBe("default");
  });

  test("task_reminder updates tasks without adding bubble", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const before = result.current.storeAdapter.messages.length;
    act(() => {
      socket.emit(
        attMsg("task_reminder", {
          content: [{ id: "t1", subject: "Fix bug", status: "running" }],
        }),
      );
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].id).toBe("t1");
    expect(result.current.storeAdapter.messages.length).toBe(before);
  });

  test("mcp_instructions_delta accumulates mcpServers", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(attMsg("mcp_instructions_delta", { addedNames: ["a", "b"], addedBlocks: [] }));
    });

    expect(result.current.mcpServers).toEqual(["a", "b"]);
  });

  test("file adds system bubble with attachmentType", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(attMsg("file", { filePath: "/src/index.ts" }));
    });

    const msgs = result.current.storeAdapter.messages;
    const bubble = msgs[msgs.length - 1];
    expect(bubble?.role).toBe("system");
    const custom = bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("file");
  });

  test("session_init resets mcpServers", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(attMsg("mcp_instructions_delta", { addedNames: ["srv"], addedBlocks: [] }));
    });

    expect(result.current.mcpServers).toEqual(["srv"]);

    act(() => {
      socket.emit({ type: "session_init", resume: false } as SessionStreamServerMessage);
    });

    expect(result.current.mcpServers).toEqual([]);
  });
});

describe("useClaudeSession vcs_state_changed (Git query refresh)", () => {
  test("vcs_state_changed invalidates Git workspace queries, renders one lightweight row", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    try {
      act(() => {
        socket.emit({ type: "live_start", count: 0 } as SessionStreamServerMessage);
        socket.emit({ type: "live_end" } as SessionStreamServerMessage);
        socket.emit({
          type: "system",
          subtype: "vcs_state_changed",
          kind: "commit",
          branch: "main",
          uuid: "vcs-hook-1",
        } as unknown as SessionStreamServerMessage);
      });

      // Git workspace data must refresh without a manual reload.
      const invalidatedKeys = invalidateSpy.mock.calls.map((c) =>
        JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey),
      );
      expect(invalidatedKeys).toContain(JSON.stringify(["projects", "proj", "git"]));

      // And the stream carries the lightweight vcs-change row.
      const customTypes = result.current.storeAdapter.messages.map(
        (m) => (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType,
      );
      expect(customTypes).toContain("vcs-change");
    } finally {
      invalidateSpy.mockRestore();
    }
  });
});

describe("useClaudeSession cost-state 标量（CLI 2.1.299+）", () => {
  const costFrame = (total: number): SessionStreamServerMessage =>
    ({
      type: "cost-state",
      sessionId: "s-1",
      totalCostUSD: total,
      totalAPIDuration: 1000,
      modelUsage: { "claude-opus-5[1m]": { costUSD: total } },
    }) as unknown as SessionStreamServerMessage;

  test("cost-state 帧折 costState 标量（latest-wins），不产聊天气泡", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const before = result.current.storeAdapter.messages.length;
    act(() => {
      socket.emit(costFrame(1.5));
      socket.emit(costFrame(2.25));
    });

    // latest-wins：后者覆盖前者。
    expect(result.current.costState?.totalCostUSD).toBe(2.25);
    // scalar-only：不进渲染列表。
    expect(result.current.storeAdapter.messages.length).toBe(before);
  });

  test("bridge.getCostState 快照读取（ℹ 信息面数据通道）", async () => {
    const { result } = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    expect(result.current.bridge.getCostState?.()).toBeUndefined();
    act(() => {
      socket.emit(costFrame(7.5));
    });
    expect(result.current.bridge.getCostState?.()?.totalCostUSD).toBe(7.5);
  });
});

// session_status 标量（原 describe「useClaudeSession sessionStatus 标量」）已随壳/内容
// 分离拆除（2026-10-19）：壳状态走 sessions-stream（use-session-shells），chat 流不再
// 承载 turn 状态——消费面读 REST detail（sessions-stream invalidate 保鲜）。

// ── 跨 remount 回放缓存恢复（claude-replay-cache）────────────────────────────
// 锚 + raw 尾窗持久化，remount 恢复后 WS 带 since → delta 只补离开期间的增量。
// remount = renderHook → unmount → 二次 renderHook（composer-draft.test.tsx 同款模式）。
describe("useClaudeSession 跨 remount 回放缓存恢复", () => {
  const assistantMsg = (uuid: string, id: string, text: string) =>
    ({
      type: "assistant",
      uuid,
      message: { id, role: "assistant", content: [{ type: "text", text }] },
      session_id: "s1",
    }) as never;

  test("remount 恢复：窗口未连 WS 即刻呈现 + 二次连接 URL 带 since 锚", async () => {
    const first = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());
    // 首连无缓存 → URL 不带 since。
    expect(socket.url).not.toContain("since=");
    act(() => {
      socket.emit(assistantMsg("uuid-1", "a1", "first"));
    });
    expect(first.result.current.storeAdapter.messages).toHaveLength(1);

    // unmount → cleanup replayFlush（save 已是异步 fire-and-forget，waitFor 落盘）。
    first.unmount();
    await waitFor(() =>
      expect(memStore.load("claudeReplayCache:proj/sess")).resolves.toMatchObject({
        cursorUuid: "uuid-1",
      }),
    );

    // 二次 mount：恢复现为异步 IDB 读（waitFor），完成后未连 WS 即已渲染。
    const second = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(second.result.current.rawMessagesRef.current).toHaveLength(1));
    expect(second.result.current.loading).toBe(false);
    await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
    expect(MockSocket.instances[1]!.url).toContain("since=uuid-1");
    // 恢复渲染面与首连一致（1 条）。
    expect(second.result.current.storeAdapter.messages).toHaveLength(1);
    second.unmount();
  });

  test("恢复 + delta：保留状态补增量，deltaEnter.from = 恢复后 rendered 长度", async () => {
    const first = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());
    act(() => {
      socket.emit(assistantMsg("uuid-1", "a1", "first"));
    });
    first.unmount();

    const second = renderHook(() => useClaudeSession("proj", "sess"));
    // 恢复现为异步：先等恢复落地（rawMessages 有内容）再看二次连接。
    await waitFor(() => expect(second.result.current.rawMessagesRef.current).toHaveLength(1));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
    const reconnectSocket = MockSocket.instances[1];
    expect(reconnectSocket.url).toContain("since=uuid-1");
    act(() => reconnectSocket.open());
    act(() => {
      reconnectSocket.emit({ type: "session_init", resume: true, replay: "delta" } as never);
      reconnectSocket.emit({ type: "history_start", count: 0 } as never);
      reconnectSocket.emit({ type: "history_end" } as never);
      reconnectSocket.emit({ type: "live_start", count: 1 } as never);
      reconnectSocket.emit(assistantMsg("uuid-2", "a2", "second"));
      reconnectSocket.emit({ type: "live_end" } as never);
    });

    // delta 路径不 reset：恢复窗口（a1）保留 + 增量（a2）补上 = 2 条,无 divider。
    expect(second.result.current.storeAdapter.messages).toHaveLength(2);
    // from = 恢复后 rendered 长度（1）——闭包过期会把 from 写成 0（整个恢复窗口
    // 套上淡入动画）,此断言即 P0 前置修复的回归闸。
    await waitFor(() => expect(second.result.current.deltaEnter).toEqual({ from: 1, to: 2 }));
    second.unmount();
  });

  test("恢复后 session_init full → reset 重放（缓存窗口被服务端数据替换）", async () => {
    const first = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());
    act(() => {
      socket.emit(assistantMsg("uuid-1", "a1", "first"));
    });
    first.unmount();

    const second = renderHook(() => useClaudeSession("proj", "sess"));
    // 恢复现为异步（waitFor 落地后再断言 + 等二次连接）。
    await waitFor(() => expect(second.result.current.rawMessagesRef.current).toHaveLength(1));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
    const reconnectSocket = MockSocket.instances[1];
    act(() => reconnectSocket.open());
    act(() => {
      // 无 replay 字段 = full（锚 miss 场景）。
      reconnectSocket.emit({ type: "session_init", resume: true } as never);
      reconnectSocket.emit({ type: "history_start", count: 2 } as never);
      reconnectSocket.emit(assistantMsg("uuid-1", "a1", "first"));
      reconnectSocket.emit(assistantMsg("uuid-2", "a2", "second"));
      reconnectSocket.emit({ type: "history_end" } as never);
      reconnectSocket.emit({ type: "live_start", count: 0 } as never);
      reconnectSocket.emit({ type: "live_end" } as never);
    });

    // full reset 清恢复窗口后按服务端数据重建：a1+a2 合并同 id a1（normalizeChatStream
    // 按 message.id 分组）= 2 条 + divider。
    expect(second.result.current.storeAdapter.messages).toHaveLength(3);
    second.unmount();
  });

  test("StrictMode 双挂载恢复幂等（不翻倍、二次连接仍带锚）", async () => {
    const first = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());
    act(() => {
      socket.emit(assistantMsg("uuid-1", "a1", "first"));
    });
    first.unmount();
    await waitFor(() =>
      expect(memStore.load("claudeReplayCache:proj/sess")).resolves.toMatchObject({
        cursorUuid: "uuid-1",
      }),
    );

    // .ts 文件无 JSX——StrictMode 本身就是接受 children 的组件，直接作 wrapper。
    // StrictMode double-effect 的两次 setup 都真实执行（模拟卸载重挂）→ 恢复分支
    // 跑两遍。异步恢复版：首轮 setup 的 IIFE 被 StrictMode cleanup 的 cancelled
    // 拦下（bail 不开连，恢复版不再有同步「首轮 socket」）；第二轮恢复命中窗口
    // → 唯一连接带锚。幂等语义 = 不翻倍。
    const second = renderHook(() => useClaudeSession("proj", "sess"), { wrapper: StrictMode });
    // 恢复现为异步：首轮 setup 的 IIFE 被 StrictMode cleanup 的 cancelled 拦下
    //（diag 实证 gen=1/2 cancelled=true bail）；第二轮恢复命中窗口 → 唯一的新连接
    // 带锚。instances 含 first 的首连 socket（数组跨本轮累计）→ 期望 2 = first + second。
    await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
    // rawMessagesRef 是 commit 后的 effect 派生（socket 建立是同步的，先于 commit）
    // ——断言同样等 waitFor。
    await waitFor(() => expect(second.result.current.rawMessagesRef.current).toHaveLength(1));
    expect(second.result.current.storeAdapter.messages).toHaveLength(1);
    expect(MockSocket.instances[1]!.url).toContain("since=uuid-1");
    second.unmount();
  });

  test("恢复窗口起点在回合中间（首行 assistant 无前置 user）渲染不崩", async () => {
    // 尾窗语义下任意起点都可能成为窗口头——直接预写缓存（首行 assistant 开头）。
    await saveReplayCache(
      replayCacheKey("proj", "sess"),
      false,
      [assistantMsg("uuid-1", "a1", "first"), assistantMsg("uuid-2", "a2", "second")].map((m) =>
        JSON.stringify(m),
      ),
    );
    const { result, unmount: um } = renderHook(() => useClaudeSession("proj", "sess"));
    // 恢复现为异步 IDB 读：先等恢复落地再断言。
    await waitFor(() => expect(result.current.rawMessagesRef.current).toHaveLength(2));
    expect(result.current.storeAdapter.messages.length).toBeGreaterThan(0);
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    // 锚 = 行内推导的窗口尾（uuid-2），entry.cursorUuid 只是落盘时的对账快照——
    // 实现不读它（缓存损坏不传播），断言「行内推导优先」。
    expect(MockSocket.instances[0]!.url).toContain("since=uuid-2");
    um();
  });

  test("毒化：单行超 entry 预算 → 整窗放弃 + 墓碑持久（重挂载不再缓存，LRU 过期自愈）", async () => {
    const first = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());
    act(() => {
      // 单行超 REPLAY_WINDOW_MAX_CHARS 的真实形态 = MB 级 tool_result（本机
      // JSONL 实测 2.5MB 行存在）；这里用大 text 造同尺寸行。
      socket.emit(assistantMsg("uuid-big", "big", "x".repeat(REPLAY_WINDOW_MAX_CHARS)));
    });
    act(() => {
      socket.emit(assistantMsg("uuid-1", "a1", "first"));
    });
    // 渲染面不受毒化影响（两条都在）；unmount flush 被毒化短路 → 无可用缓存（墓碑）。
    expect(first.result.current.storeAdapter.messages).toHaveLength(2);
    first.unmount();
    await waitFor(() =>
      expect(memStore.load("claudeReplayCache:proj/sess")).resolves.toMatchObject({
        removed: true,
      }),
    );

    // 重挂载：load 读到墓碑 → 无恢复（URL 无 since）；save 同被墓碑挡——大行在 JSONL 里
    // 永久存在，重挂载 full 重放还会再遇到它，永久挡掉避免每次进入重试失败循环；LRU
    // 淘汰墓碑后自然重试（自愈）。
    const second = renderHook(() => useClaudeSession("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
    const reconnect = MockSocket.instances[1]!;
    expect(reconnect.url).not.toContain("since=");
    act(() => reconnect.open());
    act(() => {
      reconnect.emit(assistantMsg("uuid-2", "a2", "again"));
    });
    second.unmount();
    await waitFor(() =>
      expect(memStore.load("claudeReplayCache:proj/sess")).resolves.toMatchObject({
        removed: true,
      }),
    );
  });

  test("竞态：恢复窗口内切换 sessionId → 迟到恢复被双守卫拦下（不串窗口、不为旧会话开连）", async () => {
    await saveReplayCache(
      replayCacheKey("proj", "sess"),
      false,
      [assistantMsg("uuid-1", "a1", "first")].map((m) => JSON.stringify(m)),
    );
    // 慢 load 拉开恢复窗口：IIFE 挂在 await 上时切换会话。
    memStore.loadDelayMs = 50;
    const { rerender, result } = renderHook(({ id }) => useClaudeSession("proj", id), {
      initialProps: { id: "sess" },
    });
    rerender({ id: "sess2" });

    // 新会话 miss（无预写）→ 唯一 socket = sess2 首连（无 since）。
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    expect(MockSocket.instances[0]!.url).toContain("sess2");
    expect(MockSocket.instances[0]!.url).not.toContain("since=");
    // 旧 IIFE 醒来（loadDelayMs 后）双守卫 bail：无第二个 socket、旧窗口不串入新会话。
    await new Promise((r) => setTimeout(r, 80));
    expect(MockSocket.instances).toHaveLength(1);
    expect(result.current.rawMessagesRef.current).toHaveLength(0);
    // 切换点 replayFlush 被干净检查短路（本实例未采集，clean=true）→ 盘上旧窗口
    // 原样保留（有采集的切换 flush 的是内容，见「毒化」用例的墓碑路径）。
    await waitFor(() =>
      expect(memStore.load("claudeReplayCache:proj/sess")).resolves.toMatchObject({
        cursorUuid: "uuid-1",
      }),
    );
  });

  test("恢复超时降级：IDB 读挂起超 RESTORE_TIMEOUT_MS → 竞速 miss 全量（URL 无 since、连接建立）", async () => {
    await saveReplayCache(
      replayCacheKey("proj", "sess"),
      false,
      [assistantMsg("uuid-1", "a1", "first")].map((m) => JSON.stringify(m)),
    );
    // load 被人为拖过竞速上限：race 由超时臂赢 → 恢复按 miss 处理（全量回放路径），
    // 迟到的缓存结果被 race 丢弃（此后无人消费）。
    memStore.loadDelayMs = RESTORE_TIMEOUT_MS + 5_000;
    vi.useFakeTimers();
    try {
      renderHook(() => useClaudeSession("proj", "sess"));
      // 未到超时点：不建 socket（还在等 load）。
      act(() => {
        vi.advanceTimersByTime(RESTORE_TIMEOUT_MS - 1);
      });
      expect(MockSocket.instances).toHaveLength(0);

      // 超时臂 resolve → IIFE 续体经 microtask → openConnection。
      act(() => {
        vi.advanceTimersByTime(1);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(MockSocket.instances).toHaveLength(1);
      expect(MockSocket.instances[0]!.url).not.toContain("since=");
    } finally {
      vi.useRealTimers();
    }
  });
});
