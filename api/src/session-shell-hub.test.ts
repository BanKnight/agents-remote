import { expect, test } from "bun:test";

import { SESSIONS_STREAM_PATH, SessionShellHub } from "./session-shell-hub";
import type { SessionShell } from "@agents-remote/shared";

// 最小 registry stub：hub 只读 listAllShells（广播环禁有副作用的候选枚举，见
// session-registry.listAllShells 注释）。
function makeHub(shells: SessionShell[]) {
  const calls: string[] = [];
  const hub = new SessionShellHub({
    listAllShells: async () => {
      calls.push("listAllShells");
      return shells;
    },
  } as never);
  return { hub, calls };
}

function makeSocket() {
  const sent: string[] = [];
  return {
    sent,
    send(message: string) {
      sent.push(message);
    },
    close() {},
  };
}

const shell = (overrides: Partial<SessionShell> = {}): SessionShell => ({
  type: "agent",
  projectName: "demo",
  sessionId: "agent_1",
  displayName: "agent_1",
  status: "idle",
  ...overrides,
});

const authOk = { verify: (token: string) => token === "good" } as never;

const upgradeRequest = () =>
  new Request(`http://localhost${SESSIONS_STREAM_PATH}`, {
    headers: { cookie: "agents_remote_token=good" },
  });

// ── upgrade 路由 ──

test("handleUpgrade: 非本频道路径返回未匹配", () => {
  const { hub } = makeHub([]);
  const result = hub.handleUpgrade(new Request("http://localhost/api/other"), authOk, {
    upgrade: () => true,
  });
  expect(result.matched).toBe(false);
});

test("handleUpgrade: 鉴权失败回 401（canUpgradeWebSocket 同 approvals-stream）", () => {
  const { hub } = makeHub([]);
  const authBad = { verify: () => false } as never;
  const result = hub.handleUpgrade(upgradeRequest(), authBad, { upgrade: () => true });
  expect(result.matched).toBe(true);
  expect(result.response?.status).toBe(401);
});

test("handleUpgrade: 鉴权通过执行 server.upgrade（data.kind = sessions-stream）", () => {
  const { hub } = makeHub([]);
  let upgradedData: unknown;
  const result = hub.handleUpgrade(upgradeRequest(), authOk, {
    upgrade: (_request, options) => {
      upgradedData = (options as { data?: unknown } | undefined)?.data;
      return true;
    },
  });
  expect(result.matched).toBe(true);
  expect(result.response).toBeUndefined();
  expect(upgradedData).toEqual({ kind: "sessions-stream" });
});

// ── open / 快照 ──

test("open: 订阅即推全量快照（客户端无需先 REST 再订阅）", async () => {
  const { hub } = makeHub([shell()]);
  const socket = makeSocket();
  hub.open(socket);
  await Promise.resolve();
  expect(socket.sent).toEqual([JSON.stringify({ type: "sessions", sessions: [shell()] })]);
});

// ── 广播语义 ──

test("scheduleBroadcast: 无订阅者直接返回（不取快照）", () => {
  const { hub, calls } = makeHub([]);
  hub.scheduleBroadcast();
  expect(calls).toEqual([]);
});

test("runBroadcast: 变更合并（broadcasting 期间新变更只补跑一次）+ 同帧跳过", async () => {
  // 回调源含非壳可见变更（recordActivity 等）：同帧跳过是防无效广播的闸门。
  const { hub, calls } = makeHub([shell({ status: "working" })]);
  const socket = makeSocket();
  hub.open(socket);
  await Promise.resolve();
  const baseline = socket.sent.length;

  hub.scheduleBroadcast(); // 第一次：触发 runBroadcast
  hub.scheduleBroadcast(); // broadcasting 期间并发变更 → dirty=true
  await Promise.resolve();
  await Promise.resolve();

  // 两帧内容相同 → 快照跑了但 send 跳过。
  expect(calls.length).toBeGreaterThanOrEqual(3);
  expect(socket.sent).toHaveLength(baseline);
});

test("runBroadcast: 壳内容变化才 send（全量快照推给全部订阅者）", async () => {
  const mutable = { shell: shell({ status: "idle" }) };
  const hub = new SessionShellHub({
    listAllShells: async () => [mutable.shell],
  } as never);
  const a = makeSocket();
  const b = makeSocket();
  hub.open(a);
  hub.open(b);
  await Promise.resolve();
  expect(a.sent).toHaveLength(1);

  mutable.shell = shell({ status: "working" });
  hub.scheduleBroadcast();
  await Promise.resolve();
  await Promise.resolve();

  const frame = JSON.stringify({ type: "sessions", sessions: [mutable.shell] });
  expect(a.sent).toEqual([
    JSON.stringify({ type: "sessions", sessions: [shell({ status: "idle" })] }),
    frame,
  ]);
  expect(b.sent).toEqual([
    JSON.stringify({ type: "sessions", sessions: [shell({ status: "idle" })] }),
    frame,
  ]);
});

test("close: 注销 socket 后不再收到广播", async () => {
  const mutable = { status: "idle" as const };
  const hub = new SessionShellHub({
    listAllShells: async () => [shell({ status: mutable.status })],
  } as never);
  const socket = makeSocket();
  hub.open(socket);
  await Promise.resolve();
  hub.close(socket);

  mutable.status = "working";
  hub.scheduleBroadcast();
  await Promise.resolve();
  await Promise.resolve();

  expect(socket.sent).toHaveLength(1);
});
