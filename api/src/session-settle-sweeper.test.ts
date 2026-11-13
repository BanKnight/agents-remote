import { expect, test } from "bun:test";
import type { SessionMetadata } from "./session-registry";
import { shouldAutoSettle, startSessionSettleSweeper } from "./session-settle-sweeper";

const DAY_MS = 24 * 60 * 60_000;
const NOW = new Date("2026-11-13T12:00:00.000Z");

const metadata = (overrides: Partial<SessionMetadata>): SessionMetadata => ({
  schemaVersion: 1,
  id: "agent_x",
  projectName: "demo",
  projectPath: "/projects/demo",
  type: "agent",
  provider: "claude",
  displayName: "Agent x",
  status: "done",
  runtimeKey: "ar-agent-claude-demo-agentx",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: new Date(NOW.getTime() - 8 * DAY_MS).toISOString(),
  ...overrides,
});

test("shouldAutoSettle：done/error 且超 7 天不活跃才为真", () => {
  expect(shouldAutoSettle(metadata({}), NOW)).toBe(true);
  expect(shouldAutoSettle(metadata({ status: "error" }), NOW)).toBe(true);
  // 未超阈值 / 刚好等于阈值（严格大于）→ 不动。
  expect(
    shouldAutoSettle(
      metadata({ updatedAt: new Date(NOW.getTime() - 6 * DAY_MS).toISOString() }),
      NOW,
    ),
  ).toBe(false);
  expect(
    shouldAutoSettle(
      metadata({ updatedAt: new Date(NOW.getTime() - 7 * DAY_MS).toISOString() }),
      NOW,
    ),
  ).toBe(false);
  // working / blocked / idle 一律不自动 settle。
  expect(shouldAutoSettle(metadata({ status: "working" }), NOW)).toBe(false);
  expect(shouldAutoSettle(metadata({ status: "blocked" }), NOW)).toBe(false);
  expect(shouldAutoSettle(metadata({ status: "idle" }), NOW)).toBe(false);
  // 已 settle 幂等跳过。
  expect(shouldAutoSettle(metadata({ settledAt: NOW.toISOString() }), NOW)).toBe(false);
});

test("startSessionSettleSweeper 按类型分派 settle，只碰命中判据的会话", async () => {
  // stub 记一次即止（模拟真实幂等），避免短间隔扫描重复刷日志。
  const calls: string[] = [];
  const record = (call: string) => {
    if (!calls.includes(call)) calls.push(call);
  };
  const stop = startSessionSettleSweeper({
    registry: {
      listAllMetadata: async () => [
        metadata({ id: "agent_done", type: "agent" }),
        metadata({ id: "terminal_err", type: "terminal", status: "error" }),
        metadata({ id: "agent_working", type: "agent", status: "working" }),
      ],
      settleAgentSession: async (_project, sessionId, settled) => {
        record(`agent:${sessionId}:${settled}`);
        return undefined;
      },
      settleTerminalSession: async (_project, sessionId, settled) => {
        record(`terminal:${sessionId}:${settled}`);
        return undefined;
      },
    },
    intervalMs: 100,
    now: () => NOW,
  });

  await new Promise((resolve) => setTimeout(resolve, 150));
  stop();

  expect(calls).toContain("agent:agent_done:true");
  expect(calls).toContain("terminal:terminal_err:true");
  expect(calls.some((call) => call.includes("agent_working"))).toBe(false);
});
