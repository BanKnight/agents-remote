import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  CodexRuntime,
  policyPairToPermissionMode,
  summarizeCodexApproval,
  synthesizeHistoryLines,
} from "./codex-runtime";

// ── fake codex app-server（模拟最小协议面，stdio NDJSON，帧不带 jsonrpc 字段）──────
//
// 经 CodexRuntime 构造注入 command（[bun, fake-codex.ts]）替换真实 `codex app-server`。
// 帧判别与真实 app-server 一致（探针 fixtures 实证）：请求 {id, method, params}、
// 响应 {id, result}、通知 {method, params}——三方共用无 jsonrpc 的裸 JSONL。
// 支持：
// - initialize / model/list（固定一个模型）/ thread/start（固定 th-fake-1）
// - thread/resume：回放 1 个 turn 的 2 个 items（userMessage + agentMessage）
// - turn/start：立即回 turn 对象；echo 文本走 delta + item/completed + turn/completed
//   通知序列；echo 前缀带 fake 收到的覆盖参数（model/effort 断言 set_config 生效链）
// - `@perm` 前缀反发 item/commandExecution/requestApproval（server id 空间从 0 起），
//   等 response 拿 decision，再 item/completed(commandExecution) 收口
// - `@slow` 挂起至 turn/interrupt（回 status:"interrupted"）或超时自然 completed
const FAKE_CODEX_SCRIPT = `
const pending = new Map();
const serverPending = new Map();
let nextServerId = 0;
let nextTurnId = 1;
const interrupted = new Map();
const send = (msg) => console.log(JSON.stringify(msg));
const notify = (method, params) => send({ method, params });

async function handleTurnStart(msg) {
  const turnId = "turn-" + nextTurnId++;
  const text = msg.params.input[0].text;
  send({ id: msg.id, result: { turn: { id: turnId, status: "inProgress" } } });
  notify("turn/started", { threadId: "th-fake-1", turn: { id: turnId, status: "inProgress" } });
  if (text.startsWith("@perm")) {
    const reqId = nextServerId++;
    // server 请求帧：带 server 空间的 id（CodexConn 判「有 id 有 method」进审批路径）。
    send({ id: reqId, method: "item/commandExecution/requestApproval", params: {
      kind: "command", threadId: "th-fake-1", turnId, itemId: "call_" + turnId,
      command: "/bin/bash -c 'echo hi'", cwd: "/tmp", commandActions: [],
    } });
    const decided = await new Promise((resolve) => serverPending.set(reqId, resolve));
    notify("item/completed", { threadId: "th-fake-1", turnId,
      item: { type: "commandExecution", id: "call_" + turnId, exitCode: 0, status: decided.decision } });
  } else if (text.startsWith("@slow")) {
    const ms = parseInt(text.split(" ")[1], 10) || 8000;
    const start = Date.now();
    while (!interrupted.get(turnId) && Date.now() - start < ms) await Bun.sleep(20);
  }
  const cov = " model=" + (msg.params.model ?? "-") + " effort=" + (msg.params.effort ?? "-")
    + " approval=" + (msg.params.approvalPolicy ?? "-")
    + " sandbox=" + (msg.params.sandboxPolicy?.type ?? "-");
  notify("item/agentMessage/delta", { threadId: "th-fake-1", turnId, delta: "echo: " + text });
  notify("item/completed", { threadId: "th-fake-1", turnId,
    item: { type: "agentMessage", id: "msg_" + turnId, text: "echo: " + text + cov } });
  const status = interrupted.get(turnId) ? "interrupted" : "completed";
  notify("turn/completed", { threadId: "th-fake-1", turn: { id: turnId, status } });
}

function handleLine(line) {
  const msg = JSON.parse(line);
  if (msg.id !== undefined && msg.method === undefined) {
    if (serverPending.has(msg.id)) {
      serverPending.get(msg.id)(msg.result);
      serverPending.delete(msg.id);
      return;
    }
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
    return;
  }
  // 有 id 有 method = 客户端请求（fake 是 server，要应答）；无 id 有 method = 通知。
  if (msg.method === undefined) return;
  switch (msg.method) {
    case "initialize":
      send({ id: msg.id, result: {} });
      break;
    case "thread/start":
      // model/reasoningEffort 在响应顶层（ThreadStartResponse 绑定：thread 对象只带 id 等）。
      // sandbox 是策略对象形状（真实 app-server 回读实证，fixtures s1——字符串形是
      // request params 的 SandboxMode；fake 曾用字符串掩盖了回读的对象分支）。
      send({ id: msg.id, result: { thread: { id: "th-fake-1" }, model: "gpt-5.1-codex", approvalPolicy: "untrusted", sandbox: { type: "workspaceWrite", networkAccess: false }, reasoningEffort: "medium" } });
      break;
    case "thread/resume":
      // 覆盖参数回显（model/approvalPolicy 透传断言）；sandbox 回策略对象形状
      //（SandboxMode 字符串 → SandboxPolicy.type 驼峰，同真实 server 回读）。
      const rMode = msg.params.approvalPolicy ?? "untrusted";
      const rSandboxType = msg.params.sandbox === "workspace-write" ? "workspaceWrite"
        : msg.params.sandbox === "danger-full-access" ? "dangerFullAccess" : "readOnly";
      send({ id: msg.id, result: { thread: { id: msg.params.threadId, turns: [
        { id: "turn-r1", items: [
          { type: "userMessage", id: "u1", text: "hello history" },
          { type: "agentMessage", id: "a1", text: "hi replayed" },
        ] },
      ] }, model: msg.params.model ?? "gpt-5.1-codex", approvalPolicy: rMode, sandbox: { type: rSandboxType, networkAccess: false }, reasoningEffort: "high" } });
      break;
    case "turn/start":
      void handleTurnStart(msg);
      break;
    case "turn/interrupt":
      interrupted.set(msg.params.turnId, true);
      send({ id: msg.id, result: {} });
      break;
    case "model/list":
      send({ id: msg.id, result: { data: [
        { id: "gpt-5.1-codex", displayName: "GPT-5.1 Codex", hidden: false,
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: null },
            { reasoningEffort: "medium", description: null },
            { reasoningEffort: "high", description: null },
          ], defaultReasoningEffort: "medium" },
      ] } });
      break;
  }
}

const decoder = new TextDecoder();
let buf = "";
(async () => {
  for await (const chunk of Bun.stdin.stream()) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) handleLine(line);
    }
  }
})();
`;

// ── harness ────────────────────────────────────────────────────────────────────

let fixtureDir: string;
let runDir: string;
let projectPath: string;

beforeAll(async () => {
  fixtureDir = await mkdtemp(join(sep, "tmp", "codex-runtime-fixture-"));
  runDir = await mkdtemp(join(sep, "tmp", "codex-runtime-run-"));
  projectPath = await mkdtemp(join(sep, "tmp", "codex-runtime-project-"));
  // pumpStderr 写 runDir/codex-stderr/<key>.log，目录需存在（生产由 runtime-dir 保证）。
  await mkdir(join(runDir, "codex-stderr"));
  await writeFile(join(fixtureDir, "fake-codex.ts"), FAKE_CODEX_SCRIPT);
});

afterAll(async () => {
  await Promise.all([
    rm(fixtureDir, { recursive: true, force: true }),
    rm(runDir, { recursive: true, force: true }),
    rm(projectPath, { recursive: true, force: true }),
  ]);
});

const fakeCodexCommand = () => [process.execPath, join(fixtureDir, "fake-codex.ts")];

const makeRuntime = () => {
  const runtime = new CodexRuntime(runDir, fakeCodexCommand());
  const threadIds: { sessionId: string; threadId: string }[] = [];
  const activities: string[] = [];
  const statuses: { sessionId: string; status: string }[] = [];
  const configPersists: {
    sessionId: string;
    config: { model?: string; effort?: string; approvalPolicy?: string; sandbox?: string };
  }[] = [];
  const approvalRequests: Record<string, unknown>[] = [];
  runtime.setOnCodexThreadId((sessionId, threadId) => threadIds.push({ sessionId, threadId }));
  runtime.setOnActivity((sessionId) => activities.push(sessionId));
  runtime.setOnStatusChange((sessionId, status) => statuses.push({ sessionId, status }));
  runtime.setOnConfigPersist((sessionId, config) => configPersists.push({ sessionId, config }));
  runtime.setOnApprovalRequest((info) => approvalRequests.push({ ...info }));
  return { runtime, threadIds, activities, statuses, configPersists, approvalRequests };
};

/** 订阅 relay 并收集行（异步到达——轮询断言）。 */
const collectStream = (runtime: CodexRuntime, runtimeKey: string) => {
  const lines: string[] = [];
  runtime.stream(
    runtimeKey,
    (line) => lines.push(line),
    (err) => lines.push(JSON.stringify({ type: "error", message: err.message })),
  );
  return lines;
};

const parse = (lines: string[]) => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

const waitFor = async (cond: () => boolean, label: string, ms = 5000): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`waitFor timeout: ${label}`);
    await Bun.sleep(10);
  }
};

// ── 测试 ───────────────────────────────────────────────────────────────────────

describe("CodexRuntime（fake app-server 集成）", () => {
  test("startAgent 全链路：initialize → thread/start → onCodexThreadId；write → echo delta/completed/ended(completed)", async () => {
    const { runtime, threadIds, statuses, activities } = makeRuntime();
    await runtime.startAgent({
      id: "s1",
      projectName: "p1",
      runtimeKey: "k1",
      projectPath,
    });

    expect(threadIds).toEqual([{ sessionId: "s1", threadId: "th-fake-1" }]);
    await expect(runtime.exists("k1")).resolves.toBe(true);

    const lines = collectStream(runtime, "k1");
    runtime.write("k1", "hello", "u1");

    const messages = () => parse(lines);
    await waitFor(
      () => messages().some((m) => m.type === "ended" && m.stopReason === "completed"),
      "ended frame",
    );
    const ms = messages();
    // 回放开场：session_init(resume=false) + 空 history 段。
    expect(ms[0]).toMatchObject({ type: "session_init", resume: false });
    expect(ms[1]).toMatchObject({ type: "history_start", count: 0 });
    expect(ms[2]).toMatchObject({ type: "history_end" });
    // user echo 注入 + codex_event 透传（delta 与 item/completed）。
    expect(
      ms.some((m) => m.type === "codex_user_echo" && m.text === "hello" && m.uuid === "u1"),
    ).toBe(true);
    expect(
      ms.some(
        (m) =>
          m.type === "codex_event" &&
          (m.event as Record<string, unknown>).method === "item/agentMessage/delta",
      ),
    ).toBe(true);
    const completed = ms.find(
      (m) =>
        m.type === "codex_event" &&
        (m.event as Record<string, unknown>).method === "item/completed",
    ) as { event: { params: { item: { text?: string } } } } | undefined;
    expect(completed?.event.params.item.text).toContain("echo: hello");
    // 帧序（code review P2-10/P2-9）：echo 先于 delta（入队成功才注入）；ended 边界帧
    // 在 turn/completed 透传之后（客户端投影先见终态事件、再见 ended 定格）。
    const echoIdx = ms.findIndex((m) => m.type === "codex_user_echo");
    const deltaIdx = ms.findIndex((m) => m.type === "codex_event");
    const turnCompletedIdx = ms.findIndex(
      (m) =>
        m.type === "codex_event" &&
        (m.event as Record<string, unknown>).method === "turn/completed",
    );
    const endedIdx = ms.findIndex((m) => m.type === "ended");
    expect(echoIdx).toBeGreaterThanOrEqual(0);
    expect(deltaIdx).toBeGreaterThan(echoIdx);
    expect(endedIdx).toBeGreaterThan(turnCompletedIdx);
    // 状态机：working → done。
    expect(statuses).toEqual([
      { sessionId: "s1", status: "working" },
      { sessionId: "s1", status: "done" },
    ]);
    expect(activities).toContain("s1");
    // model/list → codex_config 帧在 live 段。
    const configFrame = ms.find((m) => m.type === "codex_config") as
      | {
          models: Array<Record<string, unknown>>;
          current: Record<string, unknown>;
        }
      | undefined;
    expect(configFrame).toBeDefined();
    expect(configFrame?.models[0]).toMatchObject({ id: "gpt-5.1-codex" });
    // 回读统一权限模式词域（security review P1-2）：thread/start 响应的
    // untrusted + {type:"workspaceWrite"}（对象）反向映射回 "default"。
    expect(configFrame?.current).toMatchObject({
      model: "gpt-5.1-codex",
      approvalPolicy: "default",
      sandbox: "workspace-write",
    });

    await runtime.close("k1");
  });

  test("API 重启恢复：codexThreadId → thread/resume 全量回放进 history 段（resume:true）", async () => {
    const { runtime } = makeRuntime();
    await runtime.ensureRunning({
      sessionId: "s2",
      projectName: "p1",
      runtimeKey: "k2",
      projectPath,
      codexThreadId: "th-existing",
    });

    const lines = collectStream(runtime, "k2");
    const ms = parse(lines);
    expect(ms[0]).toMatchObject({ type: "session_init", resume: true });
    expect(ms[1]).toMatchObject({ type: "history_start", count: 2 });
    // 回放行 = item/completed 合成帧（前端与实时同管道投影）。
    const replayed = ms
      .slice(2, 4)
      .map(
        (m) =>
          (m as { event: { method: string; params: { item: { text?: string } } } }).event.params
            .item.text,
      );
    expect(replayed).toEqual(["hello history", "hi replayed"]);
    expect(ms[4]).toMatchObject({ type: "history_end" });
    const liveIdx = ms.findIndex((m) => m.type === "live_start");
    const configIdx = ms.findIndex((m) => m.type === "codex_config");
    expect(liveIdx).toBeGreaterThan(4);
    expect(configIdx).toBeGreaterThan(liveIdx);
    // resume 响应的 reasoningEffort 回读进 config 帧（current.effort = "high"）。
    const configFrame = ms.find((m) => m.type === "codex_config") as
      | { current: { effort?: string } }
      | undefined;
    expect(configFrame?.current.effort).toBe("high");

    await runtime.close("k2");
  });

  test("resume 覆盖参数透传：permissionMode/model → thread/resume params，回读反向映射进 config 帧", async () => {
    const { runtime } = makeRuntime();
    await runtime.ensureRunning({
      sessionId: "s2r",
      projectName: "p1",
      runtimeKey: "k2r",
      projectPath,
      codexThreadId: "th-existing",
      permissionMode: "auto",
      model: "gpt-5.1-codex",
    });

    const lines = collectStream(runtime, "k2r");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "config frame");
    const configFrame = parse(lines).find((m) => m.type === "codex_config") as
      | { current: { approvalPolicy: string; sandbox: string; model: string } }
      | undefined;
    // 透传（code review P2-11）：auto → (on-request, workspace-write) 下发，fake 回显
    // 生效值（approvalPolicy "on-request" + sandbox 策略对象）→ 回读反向映射回 "auto"。
    expect(configFrame?.current).toMatchObject({
      model: "gpt-5.1-codex",
      approvalPolicy: "auto",
      sandbox: "workspace-write",
    });

    await runtime.close("k2r");
  });

  test("审批：@perm → codex_approval_request（controlRequestId codex:0）+ respondApproval → decision 回传 + blocked→working", async () => {
    const { runtime, statuses, approvalRequests } = makeRuntime();
    await runtime.startAgent({
      id: "s3",
      projectName: "p1",
      runtimeKey: "k3",
      projectPath,
    });

    const lines = collectStream(runtime, "k3");
    runtime.write("k3", "@perm run command");

    const messages = () => parse(lines);
    // runtime 层只把审批抛给上层（onApprovalRequest）；应答由上层（ApprovalCenter）调
    // respondApproval——测试里手动扮演该角色。
    await waitFor(() => approvalRequests.length === 1, "approval request");
    runtime.respondApproval("k3", 0, "accept");
    await waitFor(
      () => messages().some((m) => m.type === "ended" && m.stopReason === "completed"),
      "approval turn ended",
    );
    // broadcastOnly 审批帧：controlRequestId 带 codex: 前缀 + toolName/inputSummary。
    const approvalFrame = messages().find((m) => m.type === "codex_approval_request") as
      | { controlRequestId: string; toolName: string; inputSummary: string }
      | undefined;
    expect(approvalFrame?.controlRequestId).toBe("codex:0");
    expect(approvalFrame?.toolName).toBe("commandExecution");
    expect(approvalFrame?.inputSummary).toContain("echo hi");
    // 回调面（index.ts 装配 ApprovalRecord 消费）。
    expect(approvalRequests).toHaveLength(1);
    expect(approvalRequests[0]).toMatchObject({
      runtimeKey: "k3",
      sessionId: "s3",
      rpcId: 0,
      toolName: "commandExecution",
    });
    // 状态机：working → blocked → working → done。
    expect(statuses.map((s) => s.status)).toEqual(["working", "blocked", "working", "done"]);

    // 第二轮验证 decline 的 decision 真的回传（fake 把它写进 item.completed.status）。
    const lines2 = collectStream(runtime, "k3");
    runtime.write("k3", "@perm second");
    await waitFor(() => approvalRequests.length === 2, "second approval request");
    runtime.respondApproval("k3", 1, "decline");
    await waitFor(
      () => parse(lines2).some((m) => m.type === "ended" && m.stopReason === "completed"),
      "second approval ended",
    );
    const declined = parse(lines2).find(
      (m) => m.type === "codex_event" && JSON.stringify(m).includes('"decline"'),
    );
    expect(declined).toBeDefined();

    await runtime.close("k3");
  });

  test("interrupt：@slow 挂起中 interrupt → ended(stopReason:interrupted)", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({
      id: "s4",
      projectName: "p1",
      runtimeKey: "k4",
      projectPath,
    });

    const lines = collectStream(runtime, "k4");
    runtime.write("k4", "@slow long turn");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_event"), "turn started");
    await runtime.interrupt("k4");

    await waitFor(
      () => parse(lines).some((m) => m.type === "ended" && m.stopReason === "interrupted"),
      "interrupted ended",
    );

    await runtime.close("k4");
  });

  test("单飞排队：在飞时第二条 write 排队，第一条 ended 后 flush 完成", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({
      id: "s5",
      projectName: "p1",
      runtimeKey: "k5",
      projectPath,
    });

    const lines = collectStream(runtime, "k5");
    runtime.write("k5", "@slow 300 first");
    runtime.write("k5", "second");

    await waitFor(
      () => parse(lines).filter((m) => m.type === "ended").length >= 2,
      "two ended frames",
    );
    expect(
      parse(lines).some(
        (m) => m.type === "codex_event" && JSON.stringify(m).includes("echo: second"),
      ),
    ).toBe(true);
    // 严格串行（code review P1-4）：第二条的 delta 必须在第一条 turn/completed 之后
    // ——若在飞闸失效（只查 inFlightTurnId 漏掉 RPC 往返窗口），fake 会并发跑两个
    // turn，第二条 delta 落在第一条 completed 之前。
    const seq = parse(lines);
    const firstCompletedIdx = seq.findIndex(
      (m) =>
        m.type === "codex_event" &&
        (m.event as Record<string, unknown>).method === "turn/completed",
    );
    const secondDeltaIdx = seq.findIndex(
      (m) =>
        m.type === "codex_event" &&
        (m.event as Record<string, unknown>).method === "item/agentMessage/delta" &&
        JSON.stringify(m).includes("second"),
    );
    expect(secondDeltaIdx).toBeGreaterThan(firstCompletedIdx);

    await runtime.close("k5");
  });

  test("setThreadConfig：config 帧重注入 + onConfigPersist 回调；下一个 turn/start 带覆盖参数", async () => {
    const { runtime, configPersists } = makeRuntime();
    await runtime.startAgent({
      id: "s6",
      projectName: "p1",
      runtimeKey: "k6",
      projectPath,
    });

    const lines = collectStream(runtime, "k6");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");
    runtime.setThreadConfig("k6", { model: "gpt-5.1-codex", effort: "high" });

    await waitFor(
      () => parse(lines).filter((m) => m.type === "codex_config").length >= 2,
      "switch config frame",
    );
    const configFrames = parse(lines).filter((m) => m.type === "codex_config") as Array<{
      current: { model: string; effort?: string };
    }>;
    expect(configFrames[configFrames.length - 1]?.current).toMatchObject({
      model: "gpt-5.1-codex",
      effort: "high",
    });
    expect(configPersists).toEqual([
      { sessionId: "s6", config: { model: "gpt-5.1-codex", effort: "high" } },
    ]);

    // 下一轮 turn/start 的覆盖参数回显进 item/completed 文本（fake echo 尾段）。
    runtime.write("k6", "check overrides");
    await waitFor(
      () =>
        parse(lines).some((m) => m.type === "ended" && m.stopReason === "completed") &&
        parse(lines).length > configFrames.length,
      "override turn ended",
    );
    const completed = parse(lines).find(
      (m) =>
        m.type === "codex_event" &&
        (m.event as Record<string, unknown>).method === "item/completed" &&
        JSON.stringify(m).includes("check overrides"),
    ) as { event: { params: { item: { text?: string } } } } | undefined;
    expect(completed?.event.params.item.text).toContain("model=gpt-5.1-codex effort=high");

    await runtime.close("k6");
  });

  test("setThreadConfig 权限切换：模式词 → turn/start 下发翻译（approval=never sandbox=readOnly）", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({
      id: "s6p",
      projectName: "p1",
      runtimeKey: "k6p",
      projectPath,
    });

    const lines = collectStream(runtime, "k6p");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");
    runtime.setThreadConfig("k6p", { approvalPolicy: "readonly" });
    runtime.write("k6p", "check perm");
    const completed = () =>
      parse(lines).find(
        (m) =>
          m.type === "codex_event" &&
          (m.event as Record<string, unknown>).method === "item/completed" &&
          JSON.stringify(m).includes("check perm"),
      ) as { event: { params: { item: { text?: string } } } } | undefined;
    await waitFor(() => completed() !== undefined, "perm turn completed");
    // 下发翻译（security review P1-2）：readonly → (never, read-only)；fake echo 的
    // sandboxPolicy.type 是驼峰（readOnly）。
    expect(completed()?.event.params.item.text).toContain("approval=never sandbox=readOnly");

    await runtime.close("k6p");
  });

  test("进程退出：error 帧 + 状态 error + approvalRuntimeSettled 触发", async () => {
    const { runtime, statuses } = makeRuntime();
    let settledKey: string | null = null;
    runtime.approvalRuntimeSettled = (runtimeKey) => {
      settledKey = runtimeKey;
    };
    await runtime.startAgent({
      id: "s7",
      projectName: "p1",
      runtimeKey: "k7",
      projectPath,
    });

    const lines = collectStream(runtime, "k7");
    // 杀 fake 进程（Bun.spawn 子进程）——用 kill 命令模拟崩溃。
    const proc = Bun.spawnSync(["kill", "-9", await pidOfFake(runtime, "k7")]);
    expect(proc.exitCode).toBe(0);

    await waitFor(() => parse(lines).some((m) => m.type === "error"), "error frame after exit");
    await waitFor(() => statuses.some((s) => s.status === "error"), "error status");
    expect(settledKey).toBe("k7");
    await expect(runtime.exists("k7")).resolves.toBe(false);
  });

  test("write 未运行 thread → throw；close 后 exists=false 且 listAliveRuntimeKeys 为空", async () => {
    const { runtime } = makeRuntime();
    expect(() => runtime.write("nope", "hi")).toThrow("codex session not running");

    await runtime.startAgent({
      id: "s8",
      projectName: "p1",
      runtimeKey: "k8",
      projectPath,
    });
    await runtime.close("k8");
    await expect(runtime.exists("k8")).resolves.toBe(false);
    await expect(runtime.listAliveRuntimeKeys()).resolves.toEqual(new Set());
  });
});

/** 找 fake codex 子进程 pid（kill 崩溃模拟用；仅测试内使用）。 */
const pidOfFake = async (runtime: CodexRuntime, runtimeKey: string): Promise<string> => {
  // CodexRuntime 不暴露 proc；通过 pgrep 匹配 fake-codex.ts 参数找到子进程。
  const proc = Bun.spawnSync(["pgrep", "-f", "fake-codex.ts"]);
  const out = new TextDecoder().decode(proc.stdout).trim();
  const pids = out.split("\n").filter(Boolean);
  if (pids.length === 0) throw new Error(`fake codex pid not found for ${runtimeKey}`);
  // 多个 fake 并存时取任一（测试串行，通常唯一；多开时 kill 全部等价——后续断言只看本 key）。
  return pids[pids.length - 1] as string;
};

// ── 纯函数 ─────────────────────────────────────────────────────────────────────

describe("policyPairToPermissionMode", () => {
  test("(approvalPolicy, sandbox) 回读对 → 权限模式词；对象/字符串 sandbox 两分支；未命中 undefined", () => {
    // 四模式：sandbox 对象形状（真实 app-server 回读）与字符串形状（宽进）都映射。
    expect(policyPairToPermissionMode("untrusted", { type: "workspaceWrite" })).toBe("default");
    expect(policyPairToPermissionMode("never", "read-only")).toBe("readonly");
    expect(policyPairToPermissionMode("on-request", { type: "workspaceWrite" })).toBe("auto");
    expect(policyPairToPermissionMode("never", { type: "dangerFullAccess" })).toBe("full");
    // 未命中（服务端自配组合）→ undefined：config 保留 spawn 意图值，不伪造回读。
    expect(policyPairToPermissionMode("on-request", { type: "readOnly" })).toBeUndefined();
    expect(policyPairToPermissionMode("untrusted", { type: "nope" })).toBeUndefined();
    expect(policyPairToPermissionMode("untrusted", null)).toBeUndefined();
  });
});

describe("synthesizeHistoryLines", () => {
  test("turns[].items → item/completed 合成帧（turnId 缺省省略；非数组 turns → 空）", () => {
    const lines = synthesizeHistoryLines(
      [
        {
          id: "t1",
          items: [
            { type: "userMessage", id: "u1", text: "q" },
            { type: "agentMessage", id: "a1", text: "r" },
          ],
        },
        { id: "t2", items: [{ type: "reasoning", id: "r1" }] },
      ],
      "th-1",
    );
    expect(lines).toHaveLength(3);
    const first = JSON.parse(lines[0] ?? "{}") as {
      type: string;
      event: {
        method: string;
        params: { item: Record<string, unknown>; threadId: string; turnId?: string };
      };
    };
    expect(first.type).toBe("codex_event");
    expect(first.event.method).toBe("item/completed");
    expect(first.event.params).toMatchObject({ threadId: "th-1", turnId: "t1" });
    expect(first.event.params.item).toMatchObject({ type: "userMessage" });
    // undefined turns → 空数组（resume 响应缺 turns 字段的宽进防御）。
    expect(synthesizeHistoryLines(undefined, "th-1")).toEqual([]);
  });
});

describe("summarizeCodexApproval", () => {
  test("command 族取 command 字段（空白归一）；fileChange 族取 changes[].path", () => {
    expect(
      summarizeCodexApproval("item/commandExecution/requestApproval", {
        command: "/bin/bash   -c 'echo   hi'",
      }),
    ).toBe("commandExecution: /bin/bash -c 'echo hi'");
    expect(
      summarizeCodexApproval("item/fileChange/requestApproval", {
        changes: [{ path: "/a.ts" }, { path: "/b.ts" }],
      }),
    ).toBe("fileChange: /a.ts, /b.ts");
    // 无 command/changes → reason 兜底 → 最终回落 kind 本身。
    expect(summarizeCodexApproval("item/commandExecution/requestApproval", {})).toBe(
      "commandExecution",
    );
    expect(
      summarizeCodexApproval("item/commandExecution/requestApproval", { reason: "needs net" }),
    ).toBe("commandExecution: needs net");
  });
});
