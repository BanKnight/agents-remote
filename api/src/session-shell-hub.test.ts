import { describe, expect, test } from "bun:test";

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

// ── 设备可见性记账（push 通知根治批 B 段）──

describe("设备可见性记账（push 通知根治批 B 段）", () => {
  const visibilityFrame = (deviceId: string, visible: boolean) =>
    JSON.stringify({ type: "visibility", deviceId, visible });

  test("visible:true 帧记账 → visibleDeviceIds 收录该 deviceId", () => {
    const { hub } = makeHub([]);
    hub.message(makeSocket(), visibilityFrame("device-1", true));
    expect(hub.visibleDeviceIds()).toEqual(new Set(["device-1"]));
  });

  test("visible:false 帧不收录", () => {
    const { hub } = makeHub([]);
    hub.message(makeSocket(), visibilityFrame("device-1", false));
    expect(hub.visibleDeviceIds().size).toBe(0);
  });

  test("同 socket 新帧覆盖旧帧：true→false 移出集合，false→true 移回", () => {
    const { hub } = makeHub([]);
    const socket = makeSocket();
    hub.message(socket, visibilityFrame("device-1", true));
    hub.message(socket, visibilityFrame("device-1", false));
    expect(hub.visibleDeviceIds().size).toBe(0);
    hub.message(socket, visibilityFrame("device-1", true));
    expect(hub.visibleDeviceIds()).toEqual(new Set(["device-1"]));
  });

  test("两个 socket 同 deviceId 各发 true → 并集只含一个该 deviceId（Set 归并）", () => {
    const { hub } = makeHub([]);
    hub.message(makeSocket(), visibilityFrame("device-1", true));
    hub.message(makeSocket(), visibilityFrame("device-1", true));
    const visible = hub.visibleDeviceIds();
    expect(visible.size).toBe(1);
    expect(visible.has("device-1")).toBe(true);
  });

  test("坏帧全部忽略（非 JSON / 缺 type / type 不对 / 空串 / 超限 / visible 非布尔）", () => {
    const { hub } = makeHub([]);
    const socket = makeSocket();
    const longId = "d".repeat(129);
    const badFrames = [
      "not-json{{{", // 非 JSON 字符串
      JSON.stringify({ deviceId: "device-1", visible: true }), // 缺 type
      JSON.stringify({ type: "sessions", sessions: [] }), // type 不对（服务端下行帧方向）
      JSON.stringify({ type: "visibility", deviceId: "", visible: true }), // deviceId 空串
      JSON.stringify({ type: "visibility", deviceId: longId, visible: true }), // 超 128 字符
      JSON.stringify({ type: "visibility", deviceId: "device-1", visible: "yes" }), // visible 非布尔
    ];
    for (const raw of badFrames) hub.message(socket, raw);
    expect(hub.visibleDeviceIds().size).toBe(0);
  });

  test("坏帧忽略 = 不动既有记账（good 帧后接坏帧，条目仍在）", () => {
    const { hub } = makeHub([]);
    const socket = makeSocket();
    hub.message(socket, visibilityFrame("device-1", true));
    hub.message(socket, "not-json{{{");
    expect(hub.visibleDeviceIds()).toEqual(new Set(["device-1"]));
  });

  test("deviceId 限长边界：129 字符拒绝、128 字符通过", () => {
    const { hub } = makeHub([]);
    const socket = makeSocket();
    hub.message(socket, visibilityFrame("d".repeat(129), true));
    expect(hub.visibleDeviceIds().size).toBe(0);
    hub.message(socket, visibilityFrame("d".repeat(128), true));
    expect(hub.visibleDeviceIds()).toEqual(new Set(["d".repeat(128)]));
  });

  test("尺寸闸（P3-1）：形状合法但总体积超 4096 的帧 parse 前丢弃（守卫本会放行，空集 = 闸生效实锤）", () => {
    const { hub } = makeHub([]);
    const socket = makeSocket();
    // 多余字段不进守卫检查——若尺寸闸失效，此帧会被记账成功。
    const oversized = JSON.stringify({
      type: "visibility",
      deviceId: "device-1",
      visible: true,
      pad: "x".repeat(5000),
    });
    expect(oversized.length).toBeGreaterThan(4096);
    hub.message(socket, oversized);
    expect(hub.visibleDeviceIds().size).toBe(0);
  });

  test("close 清记账：发 true 后 close，集合为空", () => {
    const { hub } = makeHub([]);
    const socket = makeSocket();
    hub.message(socket, visibilityFrame("device-1", true));
    expect(hub.visibleDeviceIds().size).toBe(1);
    hub.close(socket);
    expect(hub.visibleDeviceIds().size).toBe(0);
  });

  test("无帧老客户端（订阅但从未上行 visibility）不进集合", async () => {
    const { hub } = makeHub([shell()]);
    const socket = makeSocket();
    hub.open(socket);
    await Promise.resolve();
    expect(socket.sent).toHaveLength(1); // 收到快照，从未上行帧
    expect(hub.visibleDeviceIds().size).toBe(0);
  });
});
