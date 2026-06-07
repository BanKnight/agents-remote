import { expect, test, describe } from "bun:test";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import {
  loadMessagesFromRaw,
  deriveTasksFromReplayBatch,
  applyTaskSystemMessage,
} from "./claude2-adapter";

// ── Helpers ────────────────────────────────────────────────────────────

const assistant = (
  id: string,
  blocks: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string; signature: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >,
): SessionStreamServerMessage =>
  ({
    type: "assistant",
    message: { id, role: "assistant", content: blocks },
  }) as unknown as SessionStreamServerMessage;

const user = (
  blocks: Array<
    | { type: "text"; text: string }
    | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  >,
): SessionStreamServerMessage =>
  ({
    type: "user",
    message: {
      role: "user",
      content: blocks.map((b) => {
        if (b.type === "text") return b;
        return {
          type: "tool_result",
          tool_use_id: b.tool_use_id,
          is_error: (b as { is_error?: boolean }).is_error,
          content: typeof b.content === "string" ? b.content : b.content,
        };
      }),
    },
  }) as unknown as SessionStreamServerMessage;

const result = (
  subtype: "success" | "interrupted" | "error",
  durationMs?: number,
): SessionStreamServerMessage =>
  ({
    type: "result",
    subtype,
    ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
  }) as unknown as SessionStreamServerMessage;

const thinkingTokens = (estimatedTokens: number): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "thinking_tokens",
    estimated_tokens: estimatedTokens,
  }) as unknown as SessionStreamServerMessage;

const systemInit = (): SessionStreamServerMessage =>
  ({ type: "system", subtype: "init" }) as unknown as SessionStreamServerMessage;

const taskStarted = (
  task_id: string,
  fields: Partial<{ agentType: string; workflowName: string; prompt: string }> = {},
): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "task_started",
    task_id,
    ...fields,
  }) as unknown as SessionStreamServerMessage;

const taskUpdated = (
  task_id: string,
  fields: Partial<{ isBackgrounded: boolean; error: string }> = {},
): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "task_updated",
    task_id,
    ...fields,
  }) as unknown as SessionStreamServerMessage;

const taskNotification = (
  task_id: string,
  fields: Partial<{ text: string }> = {},
): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "task_notification",
    task_id,
    ...fields,
  }) as unknown as SessionStreamServerMessage;

// ── loadMessagesFromRaw tests ──────────────────────────────────────────

describe("loadMessagesFromRaw", () => {
  test("empty raw messages returns empty array", () => {
    expect(loadMessagesFromRaw([])).toEqual([]);
  });

  test("system messages are skipped", () => {
    const msgs: SessionStreamServerMessage[] = [systemInit()];
    expect(loadMessagesFromRaw(msgs)).toEqual([]);
  });

  test("simple user text + assistant text produces two messages", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "Hello" }]),
      assistant("msg-1", [{ type: "text", text: "Hi there!" }]),
    ];

    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(2);
    expect(result_msgs[0]).toEqual({ role: "user", content: "Hello" });
    expect(result_msgs[1].role).toBe("assistant");
    expect(Array.isArray(result_msgs[1].content)).toBe(true);
    const content = result_msgs[1].content as Array<{ type: string; text: string }>;
    expect(content[0]).toEqual({ type: "text", text: "Hi there!" });
  });

  test("multiple assistant messages with same id are grouped into one bubble", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "what is 2+2" }]),
      assistant("msg-1", [{ type: "text", text: "Let me think" }]),
      assistant("msg-1", [{ type: "text", text: "The answer is 4" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(2);
    const content = result_msgs[1].content as Array<{ type: string; text: string }>;
    expect(content.length).toBe(2);
    expect(content[0].text).toBe("Let me think");
    expect(content[1].text).toBe("The answer is 4");
  });

  test("different assistant message ids produce separate bubbles", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "msg1" }]),
      assistant("msg-1", [{ type: "text", text: "reply 1" }]),
      result("success"),
      user([{ type: "text", text: "msg2" }]),
      assistant("msg-2", [{ type: "text", text: "reply 2" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(4);
  });

  test("tool_use followed by matching tool_result applies result to tool-call", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "read the file" }]),
      assistant("msg-1", [
        { type: "text", text: "Let me read it." },
        { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/x" } },
      ]),
      user([{ type: "tool_result", tool_use_id: "tu-1", content: "file contents" }]),
      assistant("msg-2", [{ type: "text", text: "The file says: hello" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);

    expect(result_msgs.length).toBe(3);

    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      text?: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(assistantContent.length).toBe(2);
    expect(assistantContent[0].type).toBe("text");
    expect(assistantContent[1].type).toBe("tool-call");
    expect(assistantContent[1].toolCallId).toBe("tu-1");
    expect(assistantContent[1].result).toBe("file contents");
  });

  test("tool_use + intervening user text + tool_result still matches (the 'Continue' bug)", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "ask me a question" }]),
      assistant("msg-1", [
        {
          type: "tool_use",
          id: "tu-ask",
          name: "AskUserQuestion",
          input: { questions: [{ question: "What color?", options: ["Red", "Blue"] }] },
        },
      ]),
      user([{ type: "text", text: "Continue from where you left off." }]),
      user([{ type: "tool_result", tool_use_id: "tu-ask", content: "Red" }]),
      assistant("msg-2", [{ type: "text", text: "Thanks for the answer!" }]),
      result("success"),
    ];

    const result_msgs = loadMessagesFromRaw(msgs);

    expect(result_msgs.length).toBe(4);
    expect(result_msgs[0].role).toBe("user");
    expect(result_msgs[1].role).toBe("user");
    expect(result_msgs[2].role).toBe("assistant");
    expect(result_msgs[3].role).toBe("assistant");

    const firstAssistant = result_msgs[2].content as Array<{
      type: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(firstAssistant.length).toBe(1);
    const toolCall = firstAssistant[0];
    expect(toolCall.type).toBe("tool-call");
    expect(toolCall.toolCallId).toBe("tu-ask");
    expect(toolCall.result).toBe("Red");
  });

  test("is_error tool_result sets isError flag and shows error content", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "hello" }]),
      assistant("msg-1", [
        {
          type: "tool_use",
          id: "tu-ask",
          name: "AskUserQuestion",
          input: { questions: [{ question: "X?", options: ["A", "B"] }] },
        },
      ]),
      user([
        {
          type: "tool_result",
          tool_use_id: "tu-ask",
          content: "Something went wrong",
          is_error: true,
        },
      ]),
      result("success"),
    ];

    const result_msgs = loadMessagesFromRaw(msgs);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      result?: string;
      isError?: boolean;
    }>;
    const toolCall = assistantContent[0];
    expect(toolCall.type).toBe("tool-call");
    expect(toolCall.result).toBe("Something went wrong");
    expect(toolCall.isError).toBe(true);
  });

  test("user message with only tool_result (no text) does not create a user bubble", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "read file" }]),
      assistant("msg-1", [
        { type: "tool_use", id: "tu-read", name: "Read", input: { file_path: "/f" } },
      ]),
      user([{ type: "tool_result", tool_use_id: "tu-read", content: "hello world" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);

    expect(result_msgs.length).toBe(2);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(assistantContent.length).toBe(1);
    expect(assistantContent[0].toolCallId).toBe("tu-read");
    expect(assistantContent[0].result).toBe("hello world");
  });

  test("user message with both text and tool_result creates user bubble and applies result", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "read file" }]),
      assistant("msg-1", [
        { type: "tool_use", id: "tu-read", name: "Read", input: { file_path: "/f" } },
      ]),
      user([
        { type: "text", text: "Continue from where you left off." },
        { type: "tool_result", tool_use_id: "tu-read", content: "file content here" },
      ]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);

    expect(result_msgs.length).toBe(3);
    expect(result_msgs[0].role).toBe("user");

    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(assistantContent.length).toBe(1);
    expect(assistantContent[0].toolCallId).toBe("tu-read");
    expect(assistantContent[0].result).toBe("file content here");

    expect(result_msgs[2].role).toBe("user");
  });

  test("result message flushes and resets assistant grouping", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "hello" }]),
      assistant("msg-1", [{ type: "text", text: "hi" }]),
      result("success"),
      user([{ type: "text", text: "bye" }]),
      assistant("msg-2", [{ type: "text", text: "goodbye" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(4);
  });

  test("interrupted result does not break subsequent messages", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "hello" }]),
      assistant("msg-1", [{ type: "text", text: "hi" }]),
      result("interrupted"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(2);
  });

  test("empty user text (whitespace only) does not create a user message", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "   " }]),
      assistant("msg-1", [{ type: "text", text: "empty" }]),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(1);
    expect(result_msgs[0].role).toBe("assistant");
  });

  test("multiple tool_use blocks in one assistant message all get results matched", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "use multiple tools" }]),
      assistant("msg-1", [
        { type: "tool_use", id: "tu-a", name: "ToolA", input: {} },
        { type: "tool_use", id: "tu-b", name: "ToolB", input: {} },
      ]),
      user([
        { type: "tool_result", tool_use_id: "tu-a", content: "result A" },
        { type: "tool_result", tool_use_id: "tu-b", content: "result B" },
      ]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(assistantContent.length).toBe(2);
    expect(assistantContent[0].result).toBe("result A");
    expect(assistantContent[1].result).toBe("result B");
  });

  test("skill isMeta content attaches to Skill tool-call instead of creating a user bubble", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "search with skill" }]),
      assistant("msg-skill", [
        {
          type: "tool_use",
          id: "tu-skill",
          name: "Skill",
          input: { skill: "tavily-search", args: "deepseek provider" },
        },
      ]),
      user([
        { type: "tool_result", tool_use_id: "tu-skill", content: "Launching skill: tavily-search" },
      ]),
      {
        type: "user",
        isMeta: true,
        sourceToolUseID: "tu-skill",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "Base directory for this skill: /tmp/skill\n\n# tavily search\n...",
            },
          ],
        },
      } as unknown as SessionStreamServerMessage,
      assistant("msg-next", [{ type: "text", text: "done" }]),
      result("success"),
    ];

    const result_msgs = loadMessagesFromRaw(msgs);

    expect(result_msgs.length).toBe(3);
    expect(result_msgs[0]).toEqual({ role: "user", content: "search with skill" });
    expect(result_msgs[1].role).toBe("assistant");
    expect(result_msgs[2].role).toBe("assistant");

    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      toolName?: string;
      result?: string;
      metadata?: { skillContent?: string };
    }>;
    expect(assistantContent.length).toBe(1);
    expect(assistantContent[0].type).toBe("tool-call");
    expect(assistantContent[0].toolCallId).toBe("tu-skill");
    expect(assistantContent[0].toolName).toBe("Skill");
    expect(assistantContent[0].result).toBe("Launching skill: tavily-search");
    expect(assistantContent[0].metadata?.skillContent).toContain("Base directory for this skill:");
  });

  test("permission_denied final effect persists through is_error tool_result in history", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "run bash" }]),
      assistant("msg-perm", [
        {
          type: "tool_use",
          id: "tu-bash",
          name: "Bash",
          input: { command: "curl https://cli.tavily.com/install.sh | bash" },
        },
      ]),
      user([
        {
          type: "tool_result",
          tool_use_id: "tu-bash",
          content: "Permission for this action was denied by the Claude Code auto mode classifier.",
          is_error: true,
        },
      ]),
      assistant("msg-next", [
        { type: "text", text: "I should stop and explain why I need permission." },
      ]),
      result("success"),
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs.length).toBe(3);

    const assistantContent = resultMsgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      toolName?: string;
      result?: string;
      isError?: boolean;
    }>;
    expect(assistantContent.length).toBe(1);
    expect(assistantContent[0].type).toBe("tool-call");
    expect(assistantContent[0].toolCallId).toBe("tu-bash");
    expect(assistantContent[0].toolName).toBe("Bash");
    expect(assistantContent[0].result).toContain("Permission for this action was denied");
    expect(assistantContent[0].isError).toBe(true);
  });

  test("AskUserQuestion history keeps structured answers from camelCase toolUseResult", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "help me choose" }]),
      assistant("msg-ask", [
        {
          type: "tool_use",
          id: "tu-ask",
          name: "AskUserQuestion",
          input: {
            questions: [
              {
                question: "Which task?",
                header: "Task",
                options: [
                  { label: "Bug fix", description: "Fix a bug" },
                  { label: "Code review", description: "Review code" },
                ],
              },
            ],
          },
        },
      ]),
      {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-ask",
              content:
                'Your questions have been answered: "Which task?"="Code review". You can now continue with these answers in mind.',
            },
          ],
        },
        toolUseResult: {
          questions: [
            {
              question: "Which task?",
              header: "Task",
              options: [
                { label: "Bug fix", description: "Fix a bug" },
                { label: "Code review", description: "Review code" },
              ],
            },
          ],
          answers: { "Which task?": "Code review" },
        },
      } as unknown as SessionStreamServerMessage,
      result("success"),
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs.length).toBe(2);

    const assistantContent = resultMsgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      toolName?: string;
      result?: string;
      structuredResult?: {
        questions?: Array<{ question: string }>;
        answers?: Record<string, string>;
      };
    }>;
    expect(assistantContent.length).toBe(1);
    expect(assistantContent[0].type).toBe("tool-call");
    expect(assistantContent[0].toolCallId).toBe("tu-ask");
    expect(assistantContent[0].toolName).toBe("AskUserQuestion");
    expect(assistantContent[0].result).toContain('"Which task?"="Code review"');
    expect(assistantContent[0].structuredResult?.answers).toEqual({ "Which task?": "Code review" });
    expect(assistantContent[0].structuredResult?.questions?.[0]?.question).toBe("Which task?");
  });

  test("api_retry becomes inline system error message", () => {
    const msgs: SessionStreamServerMessage[] = [
      {
        type: "system",
        subtype: "api_retry",
        attempt: 2,
        max_retries: 3,
        retry_delay_ms: 2000,
        error: "Overloaded",
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(1);
    expect(resultMsgs[0].role).toBe("system");
    const content = resultMsgs[0].content as Array<{ type: string; text: string }>;
    expect(content[0]).toEqual({
      type: "text",
      text: "API 请求失败2/3：Overloaded，2s 后重试",
    });
  });

  test("compact_boundary renders as system divider message", () => {
    const msgs: SessionStreamServerMessage[] = [
      {
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "manual", preTokens: 123456 },
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(1);
    expect(resultMsgs[0].role).toBe("system");
    const content = resultMsgs[0].content as Array<{ type: string; text: string }>;
    expect(content[0]).toEqual({ type: "text", text: "上下文已压缩 (~123k tokens)" });
  });

  test("local-command stdout Compacted is skipped because compact_boundary is authoritative", () => {
    const msgs: SessionStreamServerMessage[] = [
      {
        type: "user",
        message: {
          role: "user",
          content: "<local-command-stdout>Compacted</local-command-stdout>",
        },
      } as unknown as SessionStreamServerMessage,
    ];

    expect(loadMessagesFromRaw(msgs)).toEqual([]);
  });

  test("non-compact local-command stdout renders as slash-command tool result", () => {
    const msgs: SessionStreamServerMessage[] = [
      {
        type: "user",
        message: {
          role: "user",
          content: "<local-command-stdout>patched 3 files</local-command-stdout>",
        },
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(1);
    expect(resultMsgs[0].role).toBe("assistant");
    const content = resultMsgs[0].content as Array<{
      type: string;
      toolName?: string;
      result?: string;
    }>;
    expect(content[0]).toMatchObject({
      type: "tool-call",
      toolName: "slash-command",
      result: "patched 3 files",
    });
  });

  test("synthetic assistant messages are skipped", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "hello" }]),
      {
        type: "assistant",
        message: {
          id: "msg-synth",
          role: "assistant",
          model: "<synthetic>",
          content: [{ type: "text", text: "internal notice" }],
        },
      } as unknown as SessionStreamServerMessage,
      assistant("msg-real", [{ type: "text", text: "real reply" }]),
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(2);
    expect(resultMsgs[0]).toEqual({ role: "user", content: "hello" });
    const content = resultMsgs[1].content as Array<{ type: string; text: string }>;
    expect(content).toEqual([{ type: "text", text: "real reply" }]);
  });

  test("thinking blocks are mapped to reasoning parts", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "think about this" }]),
      assistant("msg-1", [
        {
          type: "thinking",
          thinking: "Let me reason about this carefully.",
          signature: "sig-abc",
        },
        { type: "text", text: "Here is my conclusion." },
      ]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      text?: string;
    }>;
    expect(assistantContent.length).toBe(2);
    expect(assistantContent[0]).toMatchObject({
      type: "reasoning",
      text: "Let me reason about this carefully.",
    });
    expect(assistantContent[1]).toEqual({ type: "text", text: "Here is my conclusion." });
  });

  test("thinking_tokens collapse into reasoning part (last one wins per turn)", () => {
    const msgs: SessionStreamServerMessage[] = [
      thinkingTokens(1),
      thinkingTokens(5),
      user([{ type: "text", text: "hi" }]),
      thinkingTokens(10),
      assistant("msg-1", [
        { type: "thinking", thinking: "Reasoning...", signature: "sig" },
        { type: "text", text: "Answer." },
      ]),
      thinkingTokens(25),
      thinkingTokens(39),
      result("success", 3500),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      text?: string;
      estimatedTokens?: { value: number };
      durationMs?: { value: number | null };
    }>;
    expect(assistantContent.length).toBe(2);
    expect(assistantContent[0].type).toBe("reasoning");
    expect(assistantContent[0].estimatedTokens?.value).toBe(39);
    expect(assistantContent[0].durationMs?.value).toBe(3500);
  });

  test("reasoning parts in the same turn share the same token ref", () => {
    const msgs: SessionStreamServerMessage[] = [
      thinkingTokens(5),
      assistant("msg-1", [
        { type: "thinking", thinking: "Step 1", signature: "sig1" },
        { type: "text", text: "Intermediate." },
      ]),
      assistant("msg-2", [
        { type: "thinking", thinking: "Step 2", signature: "sig2" },
        { type: "text", text: "Final." },
      ]),
      thinkingTokens(42),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    const content1 = result_msgs[0].content as Array<{ estimatedTokens?: { value: number } }>;
    // Both reasoning parts should share the same token ref and see the final value
    expect(content1[0].estimatedTokens?.value).toBe(42);
    const content2 = result_msgs[1].content as Array<{ estimatedTokens?: { value: number } }>;
    expect(content2[0].estimatedTokens?.value).toBe(42);
  });
});

describe("task system state", () => {
  test("deriveTasksFromReplayBatch rebuilds task chips only from task_* messages", () => {
    const batch: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "create task" }]),
      assistant("msg-task", [
        {
          type: "tool_use",
          id: "tu-task",
          name: "TaskCreate",
          input: { subject: "Research bug", description: "Investigate issue" },
        },
      ]),
      {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tu-task", content: "Task #49 created" }],
        },
        toolUseResult: {
          task: { id: "49", subject: "Research bug" },
        },
      } as unknown as SessionStreamServerMessage,
      taskStarted("task-1", { prompt: "Run search", agentType: "general-purpose" }),
      taskUpdated("task-1", { isBackgrounded: true }),
      taskNotification("task-1", { text: "done" }),
    ];

    const tasks = deriveTasksFromReplayBatch(batch);
    expect(tasks).toEqual([
      {
        id: "task-1",
        agentType: "general-purpose",
        workflowName: undefined,
        description: "Run search",
        status: "completed",
        text: "done",
      },
    ]);
  });

  test("applyTaskSystemMessage updates task status across running backgrounded error completed", () => {
    let tasks = applyTaskSystemMessage(
      [],
      taskStarted("task-2", { prompt: "Inspect logs" }) as never,
    );
    expect(tasks[0]).toMatchObject({
      id: "task-2",
      description: "Inspect logs",
      status: "running",
    });

    tasks = applyTaskSystemMessage(tasks, taskUpdated("task-2", { isBackgrounded: true }) as never);
    expect(tasks[0]).toMatchObject({ id: "task-2", status: "backgrounded" });

    tasks = applyTaskSystemMessage(tasks, taskUpdated("task-2", { error: "failed" }) as never);
    expect(tasks[0]).toMatchObject({ id: "task-2", status: "error", error: "failed" });

    tasks = applyTaskSystemMessage(
      tasks,
      taskNotification("task-2", { text: "finished" }) as never,
    );
    expect(tasks[0]).toMatchObject({ id: "task-2", status: "completed", text: "finished" });
  });
});
