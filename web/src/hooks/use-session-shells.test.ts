// 会话壳投影/diff/写扩散纯函数单测：subtitle 继承、元信息 diff、缓存副本同步（WS 订阅/
// 帧写入属集成层，探针覆盖；此处按 use-approvals.test.ts 先例只测可确定性验证的逻辑）。
import { afterEach, describe, expect, test } from "bun:test";
import type { AgentSession, OverviewCandidate, SessionShell } from "@agents-remote/shared";

import { queryClient } from "../lib/query-client";
import { applyShellDiff, diffShells, projectShells } from "./use-session-shells";

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
