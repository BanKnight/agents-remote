// 会话壳投影/diff 纯函数单测：subtitle 继承与 invalidate 推导（WS 订阅/帧写入属集成层，
// 探针覆盖，此处只测纯逻辑，同 use-approvals.test.ts 先例）。
import { describe, expect, test } from "bun:test";
import type { OverviewCandidate, SessionShell } from "@agents-remote/shared";

import { projectShells, shellInvalidations } from "./use-session-shells";

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

describe("shellInvalidations", () => {
  test("新增候选 → 失效列表 key（前缀连带 detail）", () => {
    const keys = shellInvalidations(
      [candidate({ sessionId: "agent_1" })],
      [shell({ sessionId: "agent_1" }), shell({ sessionId: "agent_2" })],
    );
    expect(keys).toEqual([["projects", "demo", "agent-sessions"]]);
  });

  test("移除候选 → 失效列表 key", () => {
    const keys = shellInvalidations(
      [candidate({ sessionId: "agent_1" }), candidate({ sessionId: "agent_2" })],
      [shell({ sessionId: "agent_1" })],
    );
    expect(keys).toEqual([["projects", "demo", "agent-sessions"]]);
  });

  test("status 变化 → 失效单个 detail key", () => {
    const keys = shellInvalidations(
      [candidate({ sessionId: "agent_1", status: "idle" })],
      [shell({ sessionId: "agent_1", status: "working" })],
    );
    expect(keys).toEqual([["projects", "demo", "agent-sessions", "agent_1"]]);
  });

  test("displayName 变化 → 失效 detail key；terminal 段名 terminal-sessions", () => {
    const keys = shellInvalidations(
      [candidate({ type: "terminal", sessionId: "terminal_1" })],
      [shell({ type: "terminal", sessionId: "terminal_1", displayName: "改名" })],
    );
    expect(keys).toEqual([["projects", "demo", "terminal-sessions", "terminal_1"]]);
  });

  test("无变化 → 零失效（同帧跳过的客户端侧兜底）", () => {
    const rows = [candidate({ sessionId: "agent_1" })];
    expect(shellInvalidations(rows, [shell()])).toEqual([]);
  });

  test("同项目多会话 status 同变 → 去重为零条重复 key", () => {
    const keys = shellInvalidations(
      [
        candidate({ sessionId: "agent_1", status: "idle" }),
        candidate({ sessionId: "agent_2", status: "idle" }),
      ],
      [
        shell({ sessionId: "agent_1", status: "working" }),
        shell({ sessionId: "agent_2", status: "working" }),
      ],
    );
    expect(keys).toEqual([
      ["projects", "demo", "agent-sessions", "agent_1"],
      ["projects", "demo", "agent-sessions", "agent_2"],
    ]);
  });
});
