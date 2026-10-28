import { describe, expect, test } from "bun:test";
import type { CodexStreamServerMessage } from "@agents-remote/shared";
import {
  applyCodexFrame,
  applyCodexFrames,
  codexAnchorId,
  codexFramesToThreadMessages,
  codexTokenUsageToContextUsage,
  type CodexRawItem,
} from "./codex-adapter";

// 帧构造 helper（与 shared CodexStreamServerMessage 形状对齐；params 形状取自 0.163.0
// 真机 fixtures scripts/fixtures/codex-appserver/）。
const event = (method: string, params: Record<string, unknown> = {}): CodexStreamServerMessage => ({
  type: "codex_event",
  event: { method, params },
});
const itemEvent = (method: "item/started" | "item/completed", item: Record<string, unknown>) =>
  event(method, { item, threadId: "th1", turnId: "turn1" });
const echo = (text: string, uuid: string): CodexStreamServerMessage => ({
  type: "codex_user_echo",
  text,
  uuid,
});
const ended = (): CodexStreamServerMessage => ({ type: "ended", stopReason: "completed" });
const approval = (
  controlRequestId: string,
  itemId: string,
  extra: Record<string, unknown> = {},
  toolName = "commandExecution",
): CodexStreamServerMessage => ({
  type: "codex_approval_request",
  controlRequestId,
  toolName,
  inputSummary: "summary",
  item: { itemId, threadId: "th1", turnId: "turn1", ...extra },
});

const reduce = (frames: CodexStreamServerMessage[]): CodexRawItem[] =>
  frames.reduce((raw, f) => applyCodexFrame(raw, f), [] as CodexRawItem[]);

/** tool-card 投影的 metadata.custom（role:"system" 消息，SystemChatBubble 消费键集）。 */
const toolCardCustom = (message: { metadata?: { custom?: unknown } }): Record<string, unknown> =>
  (message.metadata?.custom ?? {}) as Record<string, unknown>;

describe("applyCodexFrame", () => {
  test("echo → item/started userMessage 文本对齐 → 确认复用；completed 同 id 不双条目", () => {
    const userItem = {
      type: "userMessage",
      id: "u1",
      content: [{ type: "text", text: "hi" }],
    };
    let raw = applyCodexFrame([], echo("hi", "uuid-1"));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ kind: "echo", confirmed: false });

    raw = applyCodexFrame(raw, itemEvent("item/started", userItem));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ kind: "echo", confirmed: true, messageId: "u1" });

    raw = applyCodexFrame(raw, itemEvent("item/completed", userItem));
    expect(raw).toHaveLength(1);
    expect(codexFramesToThreadMessages(raw)).toHaveLength(1);
  });

  test("回放历史 userMessage（无 echo）→ 新建 user 消息", () => {
    const raw = reduce([
      itemEvent("item/completed", {
        type: "userMessage",
        id: "u9",
        content: [{ type: "text", text: "historic question" }],
      }),
    ]);
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ kind: "message", role: "user", messageId: "u9", final: true });
  });

  test("agentMessage delta 按 itemId 累积；completed 用权威全文覆盖并定格", () => {
    let raw = reduce([
      itemEvent("item/started", { type: "agentMessage", id: "a1", text: "" }),
      event("item/agentMessage/delta", { itemId: "a1", delta: "Hel" }),
      event("item/agentMessage/delta", { itemId: "a1", delta: "lo" }),
    ]);
    let item = raw[0] as Extract<CodexRawItem, { kind: "message" }>;
    expect(item.sections).toEqual([{ type: "text", text: "Hello" }]);
    expect(item.final).toBe(false);

    raw = applyCodexFrame(
      raw,
      itemEvent("item/completed", { type: "agentMessage", id: "a1", text: "Hello!" }),
    );
    // completed 覆盖为权威全文（delta 与 completed 的文本若漂移，以 completed 为准）。
    item = raw[0] as Extract<CodexRawItem, { kind: "message" }>;
    expect(item.sections).toEqual([{ type: "text", text: "Hello!" }]);
    expect(item.final).toBe(true);
  });

  test("reasoning：summaryTextDelta 累积 + summaryPartAdded 分段；completed 用 summary 权威覆盖", () => {
    let raw = reduce([
      event("item/reasoning/summaryTextDelta", {
        itemId: "r1",
        delta: "part one",
        summaryIndex: 0,
      }),
      event("item/reasoning/summaryPartAdded", { itemId: "r1", summaryIndex: 1 }),
      event("item/reasoning/summaryTextDelta", {
        itemId: "r1",
        delta: "part two",
        summaryIndex: 1,
      }),
    ]);
    let item = raw[0] as Extract<CodexRawItem, { kind: "message" }>;
    expect(item.sections).toEqual([{ type: "thinking", text: "part one\n\npart two" }]);

    raw = applyCodexFrame(
      raw,
      itemEvent("item/completed", {
        type: "reasoning",
        id: "r1",
        summary: ["final one", "final two"],
        content: [],
      }),
    );
    item = raw[0] as Extract<CodexRawItem, { kind: "message" }>;
    expect(item.sections).toEqual([{ type: "thinking", text: "final one\n\nfinal two" }]);
    expect(item.final).toBe(true);
  });

  test("reasoning 只渲染 summary：completed 的空 summary 不建条目（content 可能加密）", () => {
    const raw = reduce([
      itemEvent("item/completed", {
        type: "reasoning",
        id: "r2",
        summary: [],
        content: ["encrypted"],
      }),
    ]);
    expect(raw).toHaveLength(0);
  });

  test("commandExecution：started → Bash 运行卡；outputDelta 累积；completed 带 exitCode/aggs", () => {
    let raw = reduce([
      itemEvent("item/started", {
        type: "commandExecution",
        id: "c1",
        command: "/bin/bash -lc 'echo hi'",
        cwd: "/tmp/p",
        status: "inProgress",
        aggregatedOutput: null,
        exitCode: null,
      }),
      event("item/commandExecution/outputDelta", { itemId: "c1", delta: "hi\n" }),
    ]);
    let call = (raw[0] as Extract<CodexRawItem, { kind: "tool_call" }>).call;
    expect(call).toMatchObject({ toolName: "Bash", status: "in_progress", resultText: "hi\n" });
    expect(JSON.parse(call.argsText)).toEqual({
      command: "/bin/bash -lc 'echo hi'",
      cwd: "/tmp/p",
    });

    raw = applyCodexFrame(
      raw,
      itemEvent("item/completed", {
        type: "commandExecution",
        id: "c1",
        command: "/bin/bash -lc 'echo hi'",
        cwd: "/tmp/p",
        status: "completed",
        aggregatedOutput: "hi\n",
        exitCode: 0,
      }),
    );
    call = (raw[0] as Extract<CodexRawItem, { kind: "tool_call" }>).call;
    expect(call).toMatchObject({ status: "completed", resultText: "hi\n" });
  });

  test("commandExecution 非零 exitCode → failed（红卡 isError）", () => {
    const raw = reduce([
      itemEvent("item/completed", {
        type: "commandExecution",
        id: "c2",
        command: "false",
        status: "completed",
        aggregatedOutput: "",
        exitCode: 1,
      }),
    ]);
    expect(toolCardCustom(codexFramesToThreadMessages(raw)[0])).toMatchObject({
      toolName: "Bash",
      isError: true,
    });
  });

  test("fileChange：单文件 add → Write 卡（file_path + diff result）", () => {
    const raw = reduce([
      itemEvent("item/completed", {
        type: "fileChange",
        id: "f1",
        status: "completed",
        changes: [{ path: "src/a.ts", kind: { type: "add" }, diff: "+const a = 1;" }],
      }),
    ]);
    const custom = toolCardCustom(codexFramesToThreadMessages(raw)[0]);
    expect(custom.toolName).toBe("Write");
    expect(JSON.parse(custom.argsText as string)).toEqual({ file_path: "src/a.ts" });
    expect(custom.result).toBe("--- src/a.ts\n+const a = 1;");
  });

  test("mcpToolCall → mcp__server__tool + content 文本 result", () => {
    const raw = reduce([
      itemEvent("item/completed", {
        type: "mcpToolCall",
        id: "m1",
        server: "ar-hub",
        tool: "read_file",
        status: "completed",
        arguments: { path: "README.md" },
        result: { content: [{ type: "text", text: "file body" }], structuredContent: null },
        error: null,
      }),
    ]);
    const custom = toolCardCustom(codexFramesToThreadMessages(raw)[0]);
    expect(custom.toolName).toBe("mcp__ar-hub__read_file");
    expect(JSON.parse(custom.argsText as string)).toEqual({ path: "README.md" });
    expect(custom.result).toBe("file body");
  });

  test("审批帧关联 tool card（controlRequestId → 金框）；serverRequest/resolved 清除", () => {
    const raw = reduce([
      itemEvent("item/started", {
        type: "commandExecution",
        id: "c3",
        command: "rm -rf build",
        status: "inProgress",
      }),
      approval("codex:7", "c3", { command: "rm -rf build" }),
    ]);
    let custom = toolCardCustom(codexFramesToThreadMessages(raw)[0]);
    expect(custom.controlRequestId).toBe("codex:7");
    // isError/isInterrupted 都不在 → renderer 的 needsPermission 金框生效。
    expect(custom.isError).toBeUndefined();
    expect(custom.isInterrupted).toBeUndefined();

    const resolved = applyCodexFrame(
      raw,
      event("serverRequest/resolved", { threadId: "th1", requestId: 7 }),
    );
    custom = toolCardCustom(codexFramesToThreadMessages(resolved)[0]);
    expect(custom.controlRequestId).toBeUndefined();
  });

  test("ended 把未终态 tool 标 interrupted + 清残留金框；已终态不动", () => {
    const raw = reduce([
      itemEvent("item/started", {
        type: "commandExecution",
        id: "c4",
        command: "sleep 10",
        status: "inProgress",
      }),
      approval("codex:8", "c4", { command: "sleep 10" }),
      ended(),
    ]);
    const call = (raw[0] as Extract<CodexRawItem, { kind: "tool_call" }>).call;
    expect(call.interrupted).toBe(true);
    expect(call.controlRequestId).toBeUndefined();
    expect(toolCardCustom(codexFramesToThreadMessages(raw)[0])).toMatchObject({
      isInterrupted: true,
    });

    const doneRaw = reduce([
      itemEvent("item/completed", {
        type: "commandExecution",
        id: "c5",
        command: "ls",
        status: "completed",
        aggregatedOutput: "a\n",
        exitCode: 0,
      }),
      ended(),
    ]);
    expect((doneRaw[0] as Extract<CodexRawItem, { kind: "tool_call" }>).call.interrupted).toBe(
      false,
    );
  });

  test("ended 定格未终态 assistant 条目（下轮 delta 不并入上一轮气泡）", () => {
    const raw = reduce([
      event("item/agentMessage/delta", { itemId: "a9", delta: "turn one" }),
      ended(),
      event("item/agentMessage/delta", { itemId: "a10", delta: "turn two" }),
    ]);
    const assistants = raw.filter(
      (i): i is Extract<CodexRawItem, { kind: "message" }> => i.kind === "message",
    );
    expect(assistants).toHaveLength(2);
    expect(assistants[0]!.final).toBe(true);
    expect(assistants[1]!.sections[0]!.text).toBe("turn two");
  });

  test("turn 生命周期/usage/thread 通知不进消息日志；ended 空转幂等", () => {
    let raw = applyCodexFrame([], event("turn/started", { turn: { id: "t1" } }));
    raw = applyCodexFrame(
      raw,
      event("turn/completed", { turn: { id: "t1", status: "completed" } }),
    );
    raw = applyCodexFrame(raw, event("thread/tokenUsage/updated", { tokenUsage: {} }));
    raw = applyCodexFrame(raw, event("thread/status/changed", { status: { type: "idle" } }));
    raw = applyCodexFrame(raw, event("item/plan/delta", { itemId: "p1", delta: "x" }));
    raw = applyCodexFrame(raw, ended());
    expect(raw).toHaveLength(0);
  });

  test("applyCodexFrames 批量折加与逐帧 reduce 等价；全 no-op 批返回原引用（bail-out 保留）", () => {
    const frames: CodexStreamServerMessage[] = [
      echo("question", "u1"),
      itemEvent("item/started", {
        type: "userMessage",
        id: "u1",
        content: [{ type: "text", text: "question" }],
      }),
      event("item/agentMessage/delta", { itemId: "a1", delta: "He" }),
      event("item/agentMessage/delta", { itemId: "a1", delta: "llo" }),
      itemEvent("item/started", {
        type: "commandExecution",
        id: "c1",
        command: "make",
        status: "inProgress",
      }),
      event("item/commandExecution/outputDelta", { itemId: "c1", delta: "ok\n" }),
      event("turn/started", { turn: { id: "t1" } }),
      ended(),
    ];
    const perFrame = frames.reduce((raw, f) => applyCodexFrame(raw, f), [] as CodexRawItem[]);
    const batched = applyCodexFrames([], frames);
    expect(batched).toEqual(perFrame);

    // 全 no-op 批（usage/plan 等不进日志帧）→ 原引用返回，不触发多余 setState。
    const noopBatch = [event("thread/tokenUsage/updated", { tokenUsage: {} })];
    const baseline = applyCodexFrame([], echo("seed", "u0"));
    expect(applyCodexFrames(baseline, noopBatch)).toBe(baseline);
  });

  test("prev 不可变契约：单帧与批量折加都不 mutate 传入数组及其元素（deep-freeze 钉死）", () => {
    const deepFreeze = <T>(value: T): T => {
      if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
      }
      return value;
    };
    const seed = [
      echo("q", "u1"),
      itemEvent("item/started", { type: "agentMessage", id: "a1", text: "" }),
      event("item/agentMessage/delta", { itemId: "a1", delta: "x" }),
      itemEvent("item/started", {
        type: "commandExecution",
        id: "c1",
        command: "ls",
        status: "inProgress",
      }),
      event("item/commandExecution/outputDelta", { itemId: "c1", delta: "out" }),
    ].reduce((raw, f) => applyCodexFrame(raw, f), [] as CodexRawItem[]);
    const frozen = Object.freeze(
      structuredClone(seed).map((item) => deepFreeze(item)),
    ) as CodexRawItem[];

    // strict mode 下 mutate frozen 数组/元素会 TypeError——内核必须「复制后改副本」。
    expect(() =>
      applyCodexFrame(frozen, event("item/agentMessage/delta", { itemId: "a1", delta: "y" })),
    ).not.toThrow();
    expect(() => applyCodexFrames(frozen, [ended()])).not.toThrow();
    expect(frozen).toEqual(seed);
  });
});

describe("codexFramesToThreadMessages", () => {
  test("多轮流：echo / 思考 / 回答 / tool card 顺序与 role 正确", () => {
    const raw = reduce([
      echo("question", "u1"),
      itemEvent("item/started", {
        type: "userMessage",
        id: "u1",
        content: [{ type: "text", text: "question" }],
      }),
      event("item/reasoning/summaryTextDelta", {
        itemId: "r1",
        delta: "thinking...",
        summaryIndex: 0,
      }),
      itemEvent("item/completed", {
        type: "reasoning",
        id: "r1",
        summary: ["thinking..."],
        content: [],
      }),
      event("item/agentMessage/delta", { itemId: "a1", delta: "answer" }),
      itemEvent("item/completed", { type: "agentMessage", id: "a1", text: "answer" }),
    ]);
    const messages = codexFramesToThreadMessages(raw);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
    expect(messages[1]!.content).toEqual([{ type: "reasoning", text: "thinking..." }]);
    expect(messages[2]!.content).toEqual([{ type: "text", text: "answer" }]);
  });

  test("空 assistant 条目（无文本）不投影", () => {
    const raw = reduce([itemEvent("item/started", { type: "agentMessage", id: "a2", text: "" })]);
    expect(codexFramesToThreadMessages(raw)).toHaveLength(0);
  });

  test("item/started 重推重置流式累积（增量回放形态 A：delta 不双倍）", () => {
    // 断线前已收 started + delta("Hel")；重连重推 started + 全部 delta。
    let raw = reduce([
      itemEvent("item/started", { type: "agentMessage", id: "a1", text: "" }),
      event("item/agentMessage/delta", { itemId: "a1", delta: "Hel" }),
    ]);
    expect(raw[0]).toMatchObject({ sections: [{ type: "text", text: "Hel" }] });

    // 重推 started（同 id）→ 流式累积清空；重推 delta 从零累加 → "Hello" 而非 "HelHel"。
    for (const f of [
      itemEvent("item/started", { type: "agentMessage", id: "a1", text: "" }),
      event("item/agentMessage/delta", { itemId: "a1", delta: "Hel" }),
      event("item/agentMessage/delta", { itemId: "a1", delta: "lo" }),
    ]) {
      raw = applyCodexFrame(raw, f);
    }
    expect(raw[0]).toMatchObject({ sections: [{ type: "text", text: "Hello" }] });
  });

  test("item/started 重推重置 tool 流式 output（同款幂等）", () => {
    let raw = reduce([
      itemEvent("item/started", {
        type: "commandExecution",
        id: "c1",
        command: "make",
        status: "inProgress",
      }),
      event("item/commandExecution/outputDelta", { itemId: "c1", delta: "ok\n" }),
    ]);
    expect(raw[0]).toMatchObject({ call: { resultText: "ok\n" } });

    // 重推 started → resultText 清空；重推 outputDelta 从零累加。
    for (const f of [
      itemEvent("item/started", {
        type: "commandExecution",
        id: "c1",
        command: "make",
        status: "inProgress",
      }),
      event("item/commandExecution/outputDelta", { itemId: "c1", delta: "ok\n" }),
    ]) {
      raw = applyCodexFrame(raw, f);
    }
    expect(raw[0]).toMatchObject({ call: { resultText: "ok\n" } });
  });
});

// ── 增量回放锚 + 上下文占用映射（真机反馈 2026-10-28：增量回放 + 查看上下文）────────

describe("codexAnchorId", () => {
  test("只锚定格态条目：echo 任意；message 须 final；tool 须 completed|failed（流式中跳过前溯）", () => {
    // 尾 = echo → uuid（echo 无终态概念，任意可锚——其后重推由 started 重置兜底幂等）。
    expect(codexAnchorId([{ kind: "echo", text: "q", uuid: "uuid-1", confirmed: true }])).toBe(
      "uuid-1",
    );
    // 尾 = message 定格（final + messageId）→ messageId（锚行 = 已持有的 item/completed）。
    expect(
      codexAnchorId([
        { kind: "echo", text: "q", uuid: "uuid-1", confirmed: true },
        { kind: "message", role: "assistant", messageId: "a1", sections: [], final: true },
      ]),
    ).toBe("a1");
    // 尾 = message 流式中（final:false，code review P1 形态 A/B）→ 跳过前溯到 echo。
    expect(
      codexAnchorId([
        { kind: "echo", text: "q", uuid: "uuid-1", confirmed: true },
        { kind: "message", role: "assistant", messageId: "a1", sections: [], final: false },
      ]),
    ).toBe("uuid-1");
    // 尾 = message 流式中且 messageId null（delta 先于 item/started 的瞬态）→ 前溯。
    expect(
      codexAnchorId([
        { kind: "echo", text: "q", uuid: "uuid-1", confirmed: true },
        { kind: "message", role: "assistant", messageId: null, sections: [], final: false },
      ]),
    ).toBe("uuid-1");
    // 尾 = tool 终态 → toolCallId。
    expect(
      codexAnchorId([
        { kind: "echo", text: "q", uuid: "uuid-1", confirmed: true },
        {
          kind: "tool_call",
          call: {
            toolCallId: "c1",
            toolName: "commandExecution",
            title: "commandExecution",
            status: "completed",
            resultText: "ok",
          },
        },
      ]),
    ).toBe("c1");
    // 尾 = tool 流式中（in_progress）→ 跳过前溯到 echo。
    expect(
      codexAnchorId([
        { kind: "echo", text: "q", uuid: "uuid-1", confirmed: true },
        {
          kind: "tool_call",
          call: {
            toolCallId: "c1",
            toolName: "commandExecution",
            title: "commandExecution",
            status: "in_progress",
            resultText: "",
          },
        },
      ]),
    ).toBe("uuid-1");
  });

  test("空日志 / 仅流式中条目 → null = 全量回放兜底", () => {
    expect(codexAnchorId([])).toBe(null);
    expect(
      codexAnchorId([
        { kind: "message", role: "assistant", messageId: null, sections: [], final: false },
      ]),
    ).toBe(null);
    expect(
      codexAnchorId([
        {
          kind: "tool_call",
          call: {
            toolCallId: "c1",
            toolName: "commandExecution",
            title: "commandExecution",
            status: "in_progress",
            resultText: "",
          },
        },
      ]),
    ).toBe(null);
  });
});

describe("codexTokenUsageToContextUsage", () => {
  test("last 四项映射 ClaudeContextUsage；裸 input = inputTokens − cachedInputTokens", () => {
    const usage = codexTokenUsageToContextUsage({
      last: {
        totalTokens: 22791,
        inputTokens: 12236,
        cachedInputTokens: 8104,
        cacheWriteInputTokens: 0,
        outputTokens: 640,
      },
      modelContextWindow: 258400,
    });
    expect(usage).toEqual({
      contextTokens: 12236,
      inputTokens: 12236 - 8104,
      cacheReadTokens: 8104,
      cacheCreationTokens: 0,
      outputTokens: 640,
      contextWindow: 258400,
    });
    // 明细可加总 = contextTokens（展示契约）。
    expect(usage!.inputTokens + usage!.cacheReadTokens + usage!.cacheCreationTokens).toBe(
      usage!.contextTokens,
    );
  });

  test("cacheWrite ⊆ input（OpenAI 语义）→ cacheCreationTokens 恒 0（design review P1-2：单列与裸 input 双计）", () => {
    const usage = codexTokenUsageToContextUsage({
      last: {
        totalTokens: 30000,
        inputTokens: 20000,
        cachedInputTokens: 5000,
        cacheWriteInputTokens: 3000,
        outputTokens: 1000,
      },
      modelContextWindow: 258400,
    });
    expect(usage!.cacheCreationTokens).toBe(0);
    expect(usage!.cacheReadTokens).toBe(5000);
    expect(usage!.inputTokens).toBe(15000);
    // 加总恒等（cacheWrite 已含在裸 input 内，不再参与明细构成）。
    expect(usage!.inputTokens + usage!.cacheReadTokens + usage!.cacheCreationTokens).toBe(
      usage!.contextTokens,
    );
  });

  test("无数据/缺 last/窗口 ≤0 → undefined（组件侧不渲染，不伪造）", () => {
    expect(codexTokenUsageToContextUsage(undefined)).toBeUndefined();
    expect(
      codexTokenUsageToContextUsage({
        last: {
          totalTokens: 1,
          inputTokens: 1,
          cachedInputTokens: 0,
          cacheWriteInputTokens: 0,
          outputTokens: 1,
        },
        modelContextWindow: 0,
      }),
    ).toBeUndefined();
  });
});
