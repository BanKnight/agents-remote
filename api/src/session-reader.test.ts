import { describe, expect, it } from "bun:test";
import {
  readSessionTailMessages,
  toClaudeMessage,
  toCodexMessage,
  toOmpMessage,
} from "./session-reader";
import type { SessionMetadata } from "./session-registry";

// SessionMetadata fixture 工厂：分发只消费 type/provider/runtimeKey/claudeSessionId，
// 其余字段补全满足类型面（id/displayName 等对投影断言无影响）。
const metadata = (overrides: Partial<SessionMetadata> = {}): SessionMetadata =>
  ({
    schemaVersion: 1,
    id: "agent_x1",
    projectName: "test",
    projectPath: "/tmp/ar-test",
    type: "agent",
    provider: "claude",
    displayName: "S1",
    status: "idle",
    runtimeKey: "ar-agent-claude-key",
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    ...overrides,
  }) as SessionMetadata;

describe("toClaudeMessage", () => {
  it("user string content extracts directly with timestamp", () => {
    const line = JSON.stringify({
      type: "user",
      message: { role: "user", content: "hello" },
      timestamp: "2026-10-31T01:00:00.000Z",
    });
    expect(toClaudeMessage(line)).toEqual({
      role: "user",
      text: "hello",
      ts: "2026-10-31T01:00:00.000Z",
    });
  });

  it("skips isMeta / isSidechain lines", () => {
    expect(
      toClaudeMessage(
        JSON.stringify({ type: "user", isMeta: true, message: { role: "user", content: "x" } }),
      ),
    ).toBeNull();
    expect(
      toClaudeMessage(
        JSON.stringify({
          type: "assistant",
          isSidechain: true,
          message: { role: "assistant", content: [{ type: "text", text: "y" }] },
        }),
      ),
    ).toBeNull();
  });

  it("assistant keeps text blocks only; thinking/tool_use-only lines yield null", () => {
    const mixed = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "hm" },
          { type: "text", text: "answer" },
        ],
      },
    });
    expect(toClaudeMessage(mixed)?.text).toBe("answer");
    const toolsOnly = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }],
      },
    });
    expect(toClaudeMessage(toolsOnly)).toBeNull();
  });

  it("non user/assistant types and unparsable lines are skipped", () => {
    expect(toClaudeMessage(JSON.stringify({ type: "summary", summary: "s" }))).toBeNull();
    expect(toClaudeMessage("not json")).toBeNull();
  });
});

describe("toCodexMessage", () => {
  const rolloutLine = (payload: Record<string, unknown>, type = "response_item") =>
    JSON.stringify({ timestamp: "2026-10-31T02:00:00.000Z", type, payload });

  it("user input_text and assistant output_text extract", () => {
    expect(
      toCodexMessage(
        rolloutLine({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "hi" }],
        }),
      ),
    ).toEqual({ role: "user", text: "hi", ts: "2026-10-31T02:00:00.000Z" });
    expect(
      toCodexMessage(
        rolloutLine({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "yo" }],
        }),
      )?.role,
    ).toBe("assistant");
  });

  it("user text starting with < is environment injection → skipped", () => {
    expect(
      toCodexMessage(
        rolloutLine({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "<environment_context>" }],
        }),
      ),
    ).toBeNull();
  });

  it("developer role and non-response_item lines are skipped", () => {
    expect(
      toCodexMessage(
        rolloutLine({
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "sys" }],
        }),
      ),
    ).toBeNull();
    expect(
      toCodexMessage(JSON.stringify({ timestamp: "t", type: "event_msg", payload: {} })),
    ).toBeNull();
  });
});

describe("toOmpMessage", () => {
  it("message user/assistant with string or block-array content", () => {
    expect(
      toOmpMessage(JSON.stringify({ type: "message", message: { role: "user", content: "q" } }))
        ?.text,
    ).toBe("q");
    expect(
      toOmpMessage(
        JSON.stringify({
          type: "message",
          message: { role: "assistant", content: [{ type: "text", text: "a" }] },
        }),
      )?.role,
    ).toBe("assistant");
  });

  it("developer / toolResult roles and non-message lines are skipped", () => {
    expect(
      toOmpMessage(
        JSON.stringify({ type: "message", message: { role: "developer", content: "d" } }),
      ),
    ).toBeNull();
    expect(
      toOmpMessage(
        JSON.stringify({ type: "message", message: { role: "toolResult", content: "r" } }),
      ),
    ).toBeNull();
    expect(toOmpMessage(JSON.stringify({ type: "state", state: {} }))).toBeNull();
  });
});

describe("readSessionTailMessages dispatch", () => {
  it("terminal without capture → note, empty messages", async () => {
    const result = await readSessionTailMessages(
      { metadata: metadata({ type: "terminal", provider: undefined }) },
      10,
    );
    expect(result.messages).toEqual([]);
    expect(result.note).toBe("terminal snapshot unavailable");
  });

  it("terminal with capture strips ANSI into a single terminal message", async () => {
    const result = await readSessionTailMessages(
      {
        metadata: metadata({ type: "terminal", provider: undefined }),
        capture: async () => "\x1b[32m$ ls\x1b[0m\nfile.txt",
      },
      10,
    );
    expect(result.note).toBeUndefined();
    expect(result.messages).toEqual([{ role: "terminal", text: "$ ls\nfile.txt" }]);
  });

  it("claude without claudeSessionId → note", async () => {
    const result = await readSessionTailMessages({ metadata: metadata() }, 10);
    expect(result.messages).toEqual([]);
    expect(result.note).toBe("no claude session id recorded");
  });

  it("unknown provider → not readable note", async () => {
    const result = await readSessionTailMessages(
      { metadata: metadata({ provider: undefined }) },
      10,
    );
    expect(result.messages).toEqual([]);
    expect(result.note).toContain("not readable");
  });
});
