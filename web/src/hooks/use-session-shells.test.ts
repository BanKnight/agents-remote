// 会话壳投影/diff/写扩散纯函数单测：subtitle 继承、元信息 diff、缓存副本同步（按
// use-approvals.test.ts 先例只测可确定性验证的逻辑）。设备可见性上报段同范式扩展：
// MockSocket 手法（FakeWebSocket）+ jsdom 双 realm 覆盖 connect/disconnect 单例的上行
// 帧行为；25s 周期 tick 属定时器集成面，不进单测（无 fake timers）。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import type { AgentSession, OverviewCandidate, SessionShell } from "@agents-remote/shared";

import { queryClient } from "../lib/query-client";
import {
  applyShellDiff,
  connectShellsStream,
  diffShells,
  disconnectShellsStream,
  projectShells,
  visibilityFrame,
} from "./use-session-shells";

const shell = (overrides: Partial<SessionShell> = {}): SessionShell => ({
  type: "agent",
  projectName: "demo",
  sessionId: "agent_1",
  displayName: "agent_1",
  status: "idle",
  ...overrides,
});

const candidate = (overrides: Partial<OverviewCandidate> = {}): OverviewCandidate => ({
  type: "agent",
  projectName: "demo",
  sessionId: "agent_1",
  displayName: "agent_1",
  status: "idle",
  ...overrides,
});

afterEach(() => {
  queryClient.clear();
});

describe("projectShells", () => {
  test("快照行从 prev 继承 subtitle（慢填充字段不入壳）", () => {
    const prev = [
      candidate({ sessionId: "agent_1", subtitle: "上一条 assistant 消息" }),
      candidate({ sessionId: "agent_2", subtitle: "git status" }),
    ];
    const next = projectShells(prev, [
      shell({ sessionId: "agent_1", status: "working" }),
      shell({ sessionId: "agent_2" }),
    ]);
    expect(next.map((c) => c.subtitle)).toEqual(["上一条 assistant 消息", "git status"]);
    expect(next[0]?.status).toBe("working");
  });

  test("prev 缺失（首帧 / overview 未加载）→ 裸快照行", () => {
    const next = projectShells(undefined, [shell({ status: "working" })]);
    expect(next).toEqual([shell({ status: "working" })]);
  });
});

describe("diffShells", () => {
  test("新增候选 → 失效列表 key（前缀连带 detail）", () => {
    const diff = diffShells(
      [candidate({ sessionId: "agent_1" })],
      [shell({ sessionId: "agent_1" }), shell({ sessionId: "agent_2" })],
    );
    expect(diff.invalidate).toEqual([["projects", "demo", "agent-sessions"]]);
    expect(diff.changed).toEqual([]);
  });

  test("移除候选 → 失效列表 key", () => {
    const diff = diffShells(
      [candidate({ sessionId: "agent_1" }), candidate({ sessionId: "agent_2" })],
      [shell({ sessionId: "agent_1" })],
    );
    expect(diff.invalidate).toEqual([["projects", "demo", "agent-sessions"]]);
  });

  test("status 变化 → 写扩散 patch（不再失效 detail）", () => {
    const diff = diffShells(
      [candidate({ sessionId: "agent_1", status: "idle" })],
      [shell({ sessionId: "agent_1", status: "working" })],
    );
    expect(diff.invalidate).toEqual([]);
    expect(diff.changed).toEqual([
      { shell: shell({ sessionId: "agent_1", status: "working" }), patch: { status: "working" } },
    ]);
  });

  test("displayName 变化 → patch；terminal 段名 terminal-sessions", () => {
    const diff = diffShells(
      [candidate({ type: "terminal", sessionId: "terminal_1" })],
      [shell({ type: "terminal", sessionId: "terminal_1", displayName: "改名" })],
    );
    expect(diff.changed[0]?.patch).toEqual({ displayName: "改名" });
  });

  test("updatedAt 变化 → patch（用户 2026-11-05 反馈的「时间不同步」核心回归）", () => {
    const diff = diffShells(
      [candidate({ sessionId: "agent_1", updatedAt: "2026-11-05T10:00:00Z" })],
      [shell({ sessionId: "agent_1", updatedAt: "2026-11-05T10:05:00Z" })],
    );
    expect(diff.changed[0]?.patch).toEqual({ updatedAt: "2026-11-05T10:05:00Z" });
  });

  test("多字段同时变化 → patch 含全部变化字段", () => {
    const diff = diffShells(
      [candidate({ sessionId: "agent_1", displayName: "旧名", status: "idle" })],
      [
        shell({
          sessionId: "agent_1",
          displayName: "新名",
          status: "done",
          updatedAt: "2026-11-05T11:00:00Z",
          provider: "codex",
        }),
      ],
    );
    expect(diff.changed[0]?.patch).toEqual({
      displayName: "新名",
      status: "done",
      updatedAt: "2026-11-05T11:00:00Z",
      provider: "codex",
    });
  });

  test("无变化 → 零 patch 零失效（同帧跳过的客户端侧兜底）", () => {
    expect(diffShells([candidate({ sessionId: "agent_1" })], [shell()])).toEqual({
      changed: [],
      invalidate: [],
    });
  });

  test("同项目多会话同变 → 各自一条 changed，无重复失效", () => {
    const diff = diffShells(
      [
        candidate({ sessionId: "agent_1", status: "idle" }),
        candidate({ sessionId: "agent_2", status: "idle" }),
      ],
      [
        shell({ sessionId: "agent_1", status: "working" }),
        shell({ sessionId: "agent_2", status: "working" }),
      ],
    );
    expect(diff.changed).toHaveLength(2);
    expect(diff.invalidate).toEqual([]);
  });
});

describe("applyShellDiff", () => {
  const listKey = ["projects", "demo", "agent-sessions"];
  const detailKey = [...listKey, "agent_1"];

  const listSession = (overrides: Partial<AgentSession> = {}): AgentSession => ({
    id: "agent_1",
    projectName: "demo",
    provider: "claude",
    displayName: "旧名",
    status: "idle",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-05T10:00:00Z",
    ...overrides,
  });

  test("列表与详情缓存副本同步合并变化字段（同会话在多展示点同值）", () => {
    queryClient.setQueryData(listKey, { sessions: [listSession()] });
    queryClient.setQueryData(detailKey, {
      session: listSession(),
      availableModels: ["opus"],
    });

    applyShellDiff(
      diffShells(
        [candidate({ sessionId: "agent_1", displayName: "旧名", status: "idle" })],
        [
          shell({
            sessionId: "agent_1",
            displayName: "新名",
            status: "working",
            updatedAt: "2026-11-05T10:05:00Z",
          }),
        ],
      ),
    );

    const list = queryClient.getQueryData<{ sessions: AgentSession[] }>(listKey);
    expect(list?.sessions[0]).toMatchObject({
      displayName: "新名",
      status: "working",
      updatedAt: "2026-11-05T10:05:00Z",
    });
    const detail = queryClient.getQueryData<{ session: AgentSession; availableModels: string[] }>(
      detailKey,
    );
    expect(detail?.session).toMatchObject({
      displayName: "新名",
      status: "working",
      updatedAt: "2026-11-05T10:05:00Z",
    });
    // detail 的其它字段保持（只合并元信息，不整条替换）。
    expect(detail?.availableModels).toEqual(["opus"]);
  });

  test("缓存不存在 → 不写入（零副作用）", () => {
    applyShellDiff(
      diffShells(
        [candidate({ sessionId: "agent_1", status: "idle" })],
        [shell({ sessionId: "agent_1", status: "working" })],
      ),
    );
    expect(queryClient.getQueryData(listKey)).toBeUndefined();
    expect(queryClient.getQueryData(detailKey)).toBeUndefined();
  });
});

// ── 设备可见性上报（push 通知根治批 B 段）────────────────────────────────
// visibilityReporting/shellsWs 是模块级单例（refCount/attached/socket 都在模块闭包里），
// 用例间必须 connect/disconnect 配平使 refCount 归零；afterEach 兜底断连，防失败用例把
// interval/监听泄漏进下一用例。jsdom 双 realm（push.test.ts / use-approvals.test.ts 先例）：
// 实现读裸 document/localStorage/WebSocket 标识符 → 全部挂 globalThis；visibilitychange
// 事件必须用同一 realm 的 Event 构造（跨 realm 构造器会被 jsdom dispatchEvent 拒绝，见
// diag-log.ts 注释）。recordDiag 开关默认关（import 时 localStorage 未挂 → loadEnabled
// catch 归 false）→ pushDiag 只剩 console 留痕，无需 stub。

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  // 默认 OPEN：用例手动触发 onopen 模拟「连接已建立」（真实 socket open 时 readyState=1）；
  // readyState 可设——CONNECTING 丢弃路径由用例显式改 0 触发。
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  addEventListener(): void {
    // 实现不消费（只用 onopen/onmessage/onclose），占位保持 WebSocket 表面完整。
  }
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const TEST_DEVICE_ID = "test-device-id";
const PUSH_DEVICE_ID_KEY = "agents-remote.pushDeviceId";

type VisibilityFrame = { type: string; deviceId: string; visible: boolean };

describe("设备可见性上报", () => {
  let realWebSocket: typeof globalThis.WebSocket;
  let realWindow: unknown;
  let realDocument: unknown;
  let realLocalStorage: unknown;
  let realLocation: unknown;
  let outstandingConnects = 0;

  const connect = (): void => {
    connectShellsStream();
    outstandingConnects += 1;
  };
  const disconnect = (): void => {
    disconnectShellsStream();
    outstandingConnects -= 1;
  };
  const setVisibility = (state: "visible" | "hidden"): void => {
    Object.defineProperty(dom.window.document, "visibilityState", {
      configurable: true,
      value: state,
    });
  };
  const dispatchVisibilityChange = (): void => {
    dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
  };
  const sentFrames = (): VisibilityFrame[] =>
    (FakeWebSocket.instances[0]?.sent ?? []).map((raw) => JSON.parse(raw) as VisibilityFrame);

  beforeEach(() => {
    realWebSocket = globalThis.WebSocket;
    realWindow = globalThis.window;
    realDocument = globalThis.document;
    realLocalStorage = globalThis.localStorage;
    realLocation = globalThis.location;
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    globalThis.document = dom.window.document as unknown as Document;
    globalThis.localStorage = dom.window.localStorage;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: dom.window.location,
    });
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    FakeWebSocket.instances = [];
    dom.window.localStorage.setItem(PUSH_DEVICE_ID_KEY, TEST_DEVICE_ID);
    setVisibility("visible");
  });

  afterEach(() => {
    while (outstandingConnects > 0) disconnect();
    outstandingConnects = 0;
    globalThis.WebSocket = realWebSocket;
    globalThis.window = realWindow as Window & typeof globalThis;
    globalThis.document = realDocument as Document;
    globalThis.localStorage = realLocalStorage as typeof localStorage;
    Object.defineProperty(globalThis, "location", { configurable: true, value: realLocation });
    dom.window.localStorage.removeItem(PUSH_DEVICE_ID_KEY);
    FakeWebSocket.instances = [];
  });

  test("visibilityFrame 帧形状：恰好 type/deviceId/visible 三字段，两态正确", () => {
    const visible = JSON.parse(visibilityFrame("dev-1", true)) as VisibilityFrame;
    const hidden = JSON.parse(visibilityFrame("dev-1", false)) as VisibilityFrame;
    expect(visible).toEqual({ type: "visibility", deviceId: "dev-1", visible: true });
    expect(hidden).toEqual({ type: "visibility", deviceId: "dev-1", visible: false });
    expect(Object.keys(visible).sort()).toEqual(["deviceId", "type", "visible"]);
  });

  test("connect 建连 + onopen 首发：deviceId 取 localStorage 预置值、visible 跟随 document", () => {
    connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0];
    expect(socket?.url).toContain("/api/sessions/stream");
    socket?.onopen?.();
    const frames = sentFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ type: "visibility", deviceId: TEST_DEVICE_ID, visible: true });
    disconnect();
  });

  test("翻面即发：hidden → visible=false，翻回 visible → true", () => {
    connect();
    FakeWebSocket.instances[0]?.onopen?.(); // 首发 visible=true
    setVisibility("hidden");
    dispatchVisibilityChange();
    setVisibility("visible");
    dispatchVisibilityChange();
    expect(sentFrames().map((frame) => frame.visible)).toEqual([true, false, true]);
    disconnect();
  });

  test("readyState 非 OPEN（CONNECTING）→ onopen 帧丢弃不排队、不抛错", () => {
    connect();
    const socket = FakeWebSocket.instances[0];
    if (socket) socket.readyState = FakeWebSocket.CONNECTING;
    expect(() => socket?.onopen?.()).not.toThrow();
    expect(sentFrames()).toHaveLength(0);
    disconnect();
  });

  test("disconnect（refCount 归零）→ close + 摘监听：后续 visibilitychange 不再发", () => {
    connect();
    const socket = FakeWebSocket.instances[0];
    socket?.onopen?.();
    disconnect();
    expect(socket?.readyState).toBe(FakeWebSocket.CLOSED);
    dispatchVisibilityChange();
    expect(sentFrames()).toHaveLength(1); // 仅 onopen 首发那一帧
  });

  test("refCount 1→2→1：socket 不重建、不关闭，上报未被错杀", () => {
    connect();
    connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0];
    socket?.onopen?.();
    disconnect();
    expect(socket?.readyState).toBe(FakeWebSocket.OPEN);
    dispatchVisibilityChange();
    expect(sentFrames().map((frame) => frame.visible)).toEqual([true, true]);
  });

  test("断线自愈（P1-1）：onclose 且 refCount>0 → 500ms 后重建 socket 并首发；双发不叠 timer", async () => {
    connect();
    const first = FakeWebSocket.instances[0];
    first?.onopen?.();
    first?.onclose?.();
    first?.onclose?.(); // 双发（网络层边界态）：防重入只排一个重连 timer
    expect(FakeWebSocket.instances).toHaveLength(1); // 不立即重建（500ms 等待内）
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(FakeWebSocket.instances).toHaveLength(2); // 重建
    const second = FakeWebSocket.instances[1];
    second?.onopen?.(); // 重连后首发帧（可见性上报随连接恢复）
    const frames = (second?.sent ?? []).map((raw) => JSON.parse(raw) as VisibilityFrame);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ deviceId: TEST_DEVICE_ID, visible: true });
    disconnect();
  });

  test("断线 pending 期间 disconnect（refCount 归零）→ 取消重连，不再重建", async () => {
    connect();
    const first = FakeWebSocket.instances[0];
    first?.onopen?.();
    first?.onclose?.();
    disconnect(); // 归零 → clearTimeout（挂起的重连 timer 必须一并清理）
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(FakeWebSocket.instances).toHaveLength(1); // 卸载后不再重建
  });
});
