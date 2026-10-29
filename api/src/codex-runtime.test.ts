import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ClaudeAutoRetryConfig, CodexCredentials } from "@agents-remote/shared";
import {
  CodexRuntime,
  codexSpawnEnv,
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
import { readFileSync } from "node:fs";
const pending = new Map();
const serverPending = new Map();
let nextServerId = 0;
let nextTurnId = 1;
let failNextCompact = false;
// 账号额度形态（批 E）：进程级开关（--account-allowed argv）——allowed 回 ChatGPT 登录
// 形状的额度；缺省 denied（apiKey/网关登录，真实 app-server 报 authentication required）。
const accountAllowed = process.argv.includes("--account-allowed");
// skills 目录（批 G）：--no-skills 回空数组（能力信号缺失用例）；calls 计数进 description
// 供 debounce 重拉断言（第二帧 description 带 calls=2）。
const noSkills = process.argv.includes("--no-skills");
let skillsListCalls = 0;
// 额度 read 慢应答（单飞竞态用例）：--slow-account 让 account/rateLimits/read 延迟
// 500ms 才回 denied error——模拟「启动期 refreshAccount 在飞」窗口，验证在飞期间到达
// 的通知快照不被丢弃（收口后补一帧 config）。
const slowAccount = process.argv.includes("--slow-account");
const SLOW_ACCOUNT_MS = 500;
const interrupted = new Map();
const send = (msg) => console.log(JSON.stringify(msg));
const notify = (method, params) => send({ method, params });

// 压缩（批 E）：以 turn 形态跑（turn/started → item/started|completed contextCompaction →
// turn/completed）；@compactfail 置位后下一次压缩 turn 以 failed 收口（自动重试豁免用例）。
async function handleCompactStart(msg) {
  const turnId = "turn-compact-" + nextTurnId++;
  send({ id: msg.id, result: {} });
  notify("turn/started", { threadId: "th-fake-1", turn: { id: turnId, status: "inProgress" } });
  notify("item/started", { threadId: "th-fake-1", turnId,
    item: { type: "contextCompaction", id: "cp_" + turnId } });
  notify("item/completed", { threadId: "th-fake-1", turnId,
    item: { type: "contextCompaction", id: "cp_" + turnId } });
  const status = failNextCompact ? "failed" : "completed";
  failNextCompact = false;
  notify("turn/completed", { threadId: "th-fake-1", turn: { id: turnId, status } });
}

async function handleTurnStart(msg) {
  const turnId = "turn-" + nextTurnId++;
  // input 是 UserInput 联合数组：图片项（type:"image"）在前、文本项殿后 → 不能按下标取文本。
  const text = msg.params.input.find((p) => p.type === "text")?.text ?? "";
  const imgs = msg.params.input.filter((p) => p.type === "image");
  send({ id: msg.id, result: { turn: { id: turnId, status: "inProgress" } } });
  notify("turn/started", { threadId: "th-fake-1", turn: { id: turnId, status: "inProgress" } });
  if (text === "@compactfail") failNextCompact = true;
  if (text === "@notifylimits") {
    // 额度窗口推送：params 自带完整 RateLimitSnapshot（perf P2-2：客户端侧直取，不再
    // 多打一趟 account/rateLimits/read）。
    notify("account/rateLimits/updated", { rateLimits: { planType: "plus",
      primary: { usedPercent: 77, windowDurationMins: 300 } } });
  }
  if (text === "@skillschanged") {
    // skills 失效信号（批 G）：客户端通知流 skills/changed → 500ms debounce 重拉。
    notify("skills/changed", {});
  }
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
  } else if (text.startsWith("@fail")) {
    // failed 终态（上游错误形态）：只回 turn/completed failed，无 agentMessage——
    // 自动重试 watch 的信号源（notifyError）。
    notify("turn/completed", { threadId: "th-fake-1", turn: { id: turnId, status: "failed" } });
    return;
  } else if (text.startsWith("@slow")) {
    const ms = parseInt(text.split(" ")[1], 10) || 8000;
    const start = Date.now();
    while (!interrupted.get(turnId) && Date.now() - start < ms) await Bun.sleep(20);
  }
  // 凭据通道回显：settings → 专属 CODEX_HOME（auth.json 0600）+ -c openai_base_url argv；
  // env OPENAI_* 恒 "-"（codex 运行期不读，2026-10-28 调研结论）。
  let authCov = "-";
  if (process.env.CODEX_HOME) {
    try {
      const auth = JSON.parse(readFileSync(process.env.CODEX_HOME + "/auth.json", "utf8"));
      authCov = (auth.auth_mode ?? "-") + "@" + (auth.OPENAI_API_KEY ?? "-");
    } catch (e) {
      authCov = "ERR";
    }
  }
  const cov = " model=" + (msg.params.model ?? "-") + " effort=" + (msg.params.effort ?? "-")
    + " approval=" + (msg.params.approvalPolicy ?? "-")
    + " sandbox=" + (msg.params.sandboxPolicy?.type ?? "-")
    + " imgs=" + imgs.map((i) => i.url).join("|")
    + " env=" + (process.env.OPENAI_API_KEY ?? "-") + "@" + (process.env.OPENAI_BASE_URL ?? "-")
    + " home=" + (process.env.CODEX_HOME ?? "-")
    + " auth=" + authCov
    + " argv=" + process.argv.slice(2).join(" ");
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
    case "turn/steer":
      // steer（批 E）：回执同一 turnId（探针实证）；@steerfail 前缀回 error（回退排队
      // 用例）；成功时以 delta 回显 steer 文本（服务端并入在飞轮的直接证据）。
      {
        const text = msg.params.input.find((p) => p.type === "text")?.text ?? "";
        if (text.startsWith("@steerfail")) {
          send({ id: msg.id, error: { code: -32001, message: "no such turn" } });
        } else {
          notify("item/agentMessage/delta", {
            threadId: "th-fake-1", turnId: msg.params.expectedTurnId, delta: "steered:" + text,
          });
          send({ id: msg.id, result: { turn: { id: msg.params.expectedTurnId } } });
        }
      }
      break;
    case "thread/compact/start":
      void handleCompactStart(msg);
      break;
    case "account/rateLimits/read":
      if (slowAccount) {
        // 慢应答不阻塞主读循环（真实 app-server 的 RPC 也并发处理）：延迟后回 denied。
        void (async () => {
          await Bun.sleep(SLOW_ACCOUNT_MS);
          send({ id: msg.id, error: { code: -32000, message: "chatgpt authentication required" } });
        })();
      } else if (!accountAllowed) {
        send({ id: msg.id, error: { code: -32000, message: "chatgpt authentication required" } });
      } else {
        send({ id: msg.id, result: { rateLimits: { planType: "pro",
          primary: { usedPercent: 42.6, windowDurationMins: 300, resetsAt: "2026-10-29T12:00:00Z" },
          secondary: { usedPercent: 3.2, windowDurationMins: 10080 } } } });
      }
      break;
    case "account/usage/read":
      if (!accountAllowed) {
        send({ id: msg.id, error: { code: -32000, message: "chatgpt authentication required" } });
      } else {
        send({ id: msg.id, result: { summary: { lifetimeTokens: 1234567 } } });
      }
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
    case "skills/list":
      {
        skillsListCalls++;
        if (noSkills) {
          send({ id: msg.id, result: { data: [{ cwd: msg.params.cwds[0], skills: [], errors: [] }] } });
          break;
        }
        const call = "#call" + skillsListCalls;
        const interfaceSkill = { name: "refresh-workflow", interface: { shortDescription: "short-wins" + call }, shortDescription: "mid-wins", description: "long-desc", scope: "repo", enabled: true };
        send({ id: msg.id, result: { data: [{ cwd: msg.params.cwds[0], skills: [
          { name: "commit-helper", description: "fallback-desc" + call, scope: "user", enabled: true },
          interfaceSkill,
          { name: "disabled-skill", description: "x", scope: "user", enabled: false },
          { name: "plugin-skill", description: "plugin desc", scope: "user", pluginId: "plg_1", enabled: true },
        ], errors: [] }] } });
      }
      break;
    case "fuzzyFileSearch":
      {
        if (msg.params.query === "@cap") {
          const many = [];
          for (let i = 0; i < 25; i++) {
            many.push({ root: "/p", path: "f" + i + ".ts", match_type: "file", file_name: "f" + i + ".ts", score: 100 - i, indices: [] });
          }
          send({ id: msg.id, result: { files: many } });
        } else {
          send({ id: msg.id, result: { files: [
            { root: "/p", path: "src/beta.md", match_type: "file", file_name: "beta.md", score: 109, indices: [4,5,6,7] },
            { root: "/p", path: "src/nested", match_type: "directory", file_name: "nested", score: 90, indices: [] },
            { root: "/p", path: "gamma.ts", match_type: "file", file_name: "gamma.ts", score: 70 },
          ] } });
        }
      }
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

const makeRuntime = (
  resolveCredentials?: () => Promise<CodexCredentials | undefined>,
  autoRetryConfig?: ClaudeAutoRetryConfig,
  mcpPort?: number,
  fakeArgs?: string[],
) => {
  const runtime = new CodexRuntime(
    runDir,
    [...fakeCodexCommand(), ...(fakeArgs ?? [])],
    resolveCredentials,
    mcpPort,
  );
  if (autoRetryConfig) {
    runtime.setAutoRetryConfigProvider(async () => autoRetryConfig);
  }
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

  test("write 带图片：turn/start input = image 项在前（data URL）+ text 项殿后", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({
      id: "s7",
      projectName: "p1",
      runtimeKey: "k7",
      projectPath,
    });
    const lines = collectStream(runtime, "k7");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");

    // 客户端恒带 uuid（echo 帧只在其存在时注入——echo 必须对应已入队的消息）。
    runtime.write("k7", "看图", "u-img", [{ data: "QUJD", mimeType: "image/png" }]);
    await waitFor(() => parse(lines).some((m) => m.type === "ended"), "image turn ended");

    // fake 回显 turn/start 收到的 input（UserInput 绑定形状）：image 项 url 必须是
    // data URL，且文本项仍在（不能因图片项占位而丢文本）。
    const echo = parse(lines).find(
      (m) =>
        m.type === "codex_event" &&
        (m.event as Record<string, unknown>).method === "item/completed" &&
        JSON.stringify(m).includes("echo: 看图"),
    );
    expect(echo).toBeDefined();
    expect(JSON.stringify(echo)).toContain("imgs=data:image/png;base64,QUJD");
    // 用户回显帧同样带 images（多端同形：另一端看到同一组缩略图）。
    const userEcho = parse(lines).find((m) => m.type === "codex_user_echo") as
      | { images?: { data: string; mimeType: string }[] }
      | undefined;
    expect(userEcho?.images).toEqual([{ data: "QUJD", mimeType: "image/png" }]);
    await runtime.close("k7");
  });

  test("凭据注入：resolveCredentials → 专属 CODEX_HOME + auth.json + `-c openai_base_url`（fake 回读）", async () => {
    // 纯函数：OPENAI_* 恒不进 spawn env（codex 0.163 运行期不读，且不继承父 env 泄漏）；
    // CODEX_HOME 只在 prepared 有值时注入（未配置 apiKey → 不重定向）。
    const savedKey = process.env.OPENAI_API_KEY;
    const savedHome = process.env.CODEX_HOME;
    process.env.OPENAI_API_KEY = "parent-leak";
    delete process.env.CODEX_HOME;
    try {
      expect(codexSpawnEnv(undefined).OPENAI_API_KEY).toBeUndefined();
      expect(codexSpawnEnv({ codexHome: null, configOverrides: [] }).CODEX_HOME).toBeUndefined();
      expect(
        codexSpawnEnv({ codexHome: "/tmp/codex-home-x", configOverrides: [] }).CODEX_HOME,
      ).toBe("/tmp/codex-home-x");
    } finally {
      if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedKey;
      if (savedHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = savedHome;
    }

    // 集成：resolveCredentials 切片 → spawn 前准备专属 home，进程真实收到 CODEX_HOME +
    // argv 覆盖。fake 回读 auth.json 与 argv（唯一可靠证据链：文件内容 + 命令行）。
    const { runtime } = makeRuntime(async () => ({
      apiKey: "sk-inject-test",
      baseUrl: "https://gw.test/v1",
    }));
    await runtime.startAgent({
      id: "s8",
      projectName: "p1",
      runtimeKey: "k8",
      projectPath,
    });
    const lines = collectStream(runtime, "k8");
    runtime.write("k8", "check env", "u-env");
    await waitFor(() => parse(lines).some((m) => m.type === "ended"), "credential turn ended");
    const completed = parse(lines).find(
      (m) =>
        m.type === "codex_event" &&
        (m.event as Record<string, unknown>).method === "item/completed",
    );
    const cov = JSON.stringify(completed);
    expect(cov).toContain(`home=${join(runDir, "codex-home")}`);
    expect(cov).toContain("auth=apikey@sk-inject-test");
    expect(cov).toContain("argv=-c openai_base_url=https://gw.test/v1");
    // 父 env 的 OPENAI_API_KEY 未被继承（白名单封闭）。
    expect(cov).not.toContain("parent-leak");
    await runtime.close("k8");
  });

  test("未配置凭据：不重定向 CODEX_HOME（回退用户自身凭证链），无 -c 覆盖", async () => {
    const { runtime } = makeRuntime(async () => undefined);
    await runtime.startAgent({
      id: "s9",
      projectName: "p1",
      runtimeKey: "k9",
      projectPath,
    });
    const lines = collectStream(runtime, "k9");
    runtime.write("k9", "no creds", "u-nocreds");
    await waitFor(() => parse(lines).some((m) => m.type === "ended"), "no-creds turn ended");
    const completed = JSON.stringify(
      parse(lines).find(
        (m) =>
          m.type === "codex_event" &&
          (m.event as Record<string, unknown>).method === "item/completed",
      ),
    );
    expect(completed).toContain("home=-");
    expect(completed).toContain("auth=-");
    expect(completed).toContain("argv=");
    expect(completed).not.toContain("openai_base_url");
    await runtime.close("k9");
  });

  // ── 自动重试（agent-auto-retry 泛化后的 codex 信号源）──────────────────────

  test("自动重试：turn/completed failed → 延迟注入下一轮（write 全链路 + 状态机迁移）", async () => {
    const { runtime, statuses } = makeRuntime(undefined, {
      enabled: true,
      message: "请继续",
      delayMs: 50,
      maxPerWindow: 3,
      windowMs: 60_000,
    });
    await runtime.startAgent({
      id: "s10",
      projectName: "p1",
      runtimeKey: "k10",
      projectPath,
    });
    const lines = collectStream(runtime, "k10");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");

    runtime.write("k10", "@fail 第一轮", "u-fail");
    await waitFor(
      () =>
        parse(lines).some(
          (m) =>
            m.type === "codex_event" &&
            (m.event as Record<string, unknown>).method === "turn/completed" &&
            JSON.stringify(m).includes('"failed"'),
        ),
      "failed turn completed",
    );

    // 注入 = 自动替用户发一条消息（走 write）：echo 帧 + 第二轮 turn/start 真跑了。
    await waitFor(
      () =>
        parse(lines).some(
          (m) => m.type === "codex_user_echo" && (m as { text?: string }).text === "请继续",
        ),
      "auto-retry injected echo",
    );
    const injectedEcho = parse(lines).find(
      (m) => m.type === "codex_user_echo" && (m as { text?: string }).text === "请继续",
    ) as { uuid?: string };
    expect(injectedEcho.uuid).toMatch(/^injected-/);
    await waitFor(
      () => parse(lines).some((m) => JSON.stringify(m).includes("echo: 请继续")),
      "injected turn ran",
    );
    // 与用户手输同状态路径（user_input → working）。
    expect(statuses.some((s) => s.status === "working")).toBe(true);
    await runtime.close("k10");
  });

  test("自动重试：滚动窗口上限——注入轮也 failed 时，达到 maxPerWindow 后停止注入", async () => {
    // 注入文案本身也 @fail：注入的 turn 同样失败 → 每轮消耗一个名额，直到窗口满。
    const { runtime } = makeRuntime(undefined, {
      enabled: true,
      message: "@fail 继续",
      delayMs: 50,
      maxPerWindow: 2,
      windowMs: 60_000,
    });
    await runtime.startAgent({
      id: "s12",
      projectName: "p1",
      runtimeKey: "k12",
      projectPath,
    });
    const lines = collectStream(runtime, "k12");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");

    runtime.write("k12", "@fail 第一轮", "u-fail");
    const injectedCount = () =>
      parse(lines).filter(
        (m) => m.type === "codex_user_echo" && (m as { text?: string }).text === "@fail 继续",
      ).length;
    await waitFor(() => injectedCount() === 2, "two injections");
    // 窗口满后不再调度：等几个 delay 周期仍停在 2 次。
    await Bun.sleep(400);
    expect(injectedCount()).toBe(2);
    await runtime.close("k12");
  });

  test("自动重试：failed 后用户手动介入（write）取消待发注入", async () => {
    const { runtime } = makeRuntime(undefined, {
      enabled: true,
      message: "请继续",
      delayMs: 200,
      maxPerWindow: 3,
      windowMs: 60_000,
    });
    await runtime.startAgent({
      id: "s11",
      projectName: "p1",
      runtimeKey: "k11",
      projectPath,
    });
    const lines = collectStream(runtime, "k11");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");

    runtime.write("k11", "@fail 第一轮", "u-fail");
    await waitFor(
      () =>
        parse(lines).some(
          (m) =>
            m.type === "codex_event" &&
            (m.event as Record<string, unknown>).method === "turn/completed",
        ),
      "failed turn completed",
    );
    // 用户在定时器到点前手动发消息 → cancelPending，不再注入。
    runtime.write("k11", "我来了", "u-manual");
    await Bun.sleep(400);
    expect(
      parse(lines).some(
        (m) => m.type === "codex_user_echo" && (m as { text?: string }).text === "请继续",
      ),
    ).toBe(false);
    await runtime.close("k11");
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

  test("delta 订阅也收 config 快照（锚命中 → live 截断，config 由快照直发补上）", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({ id: "s7", projectName: "p1", runtimeKey: "k7", projectPath });
    const lines = collectStream(runtime, "k7");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");
    runtime.write("k7", "produce rows", "u-1");
    await waitFor(
      () => parse(lines).some((m) => m.type === "ended" && m.stopReason === "completed"),
      "turn ended",
    );

    // 锚 = 已收行里最后 item/completed 的 item.id（命中 live 缓冲）。
    const anchor = [...parse(lines)].reverse().find((m) => {
      const ev = m as { type: string; event?: { method?: string } };
      return ev.type === "codex_event" && ev.event?.method === "item/completed";
    }) as unknown as { event: { params: { item: { id: string } } } } | undefined;
    expect(typeof anchor?.event.params.item.id).toBe("string");

    // delta 订阅：session_init 带 replay="delta"，config 由快照直发补上（live 缓冲的
    // config 行在锚前被截掉——无快照机制时本用例 config 断言 fail，A/B 区分度）。
    const deltaLines: string[] = [];
    runtime.stream(
      "k7",
      (l) => deltaLines.push(l),
      () => {},
      anchor!.event.params.item.id,
    );
    await waitFor(() => parse(deltaLines).some((m) => m.type === "codex_config"), "snap config");
    const init = parse(deltaLines).find((m) => m.type === "session_init") as {
      replay?: string;
    };
    expect(init.replay).toBe("delta");
    const snap = parse(deltaLines).find((m) => m.type === "codex_config") as {
      current: { model: string };
    };
    expect(typeof snap.current.model).toBe("string");

    await runtime.close("k7");
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

describe("CodexRuntime 批 E（compact / steer / MCP 注入 / 账号额度）", () => {
  test("compact：在飞轮时 busy 拒绝；压缩 turn failed 豁免自动重试（不注入「请继续」）", async () => {
    const { runtime } = makeRuntime(undefined, {
      enabled: true,
      message: "请继续",
      delayMs: 50,
      maxPerWindow: 3,
      windowMs: 60_000,
    });
    await runtime.startAgent({
      id: "s-e1",
      projectName: "p1",
      runtimeKey: "k-e1",
      projectPath,
    });
    const lines = collectStream(runtime, "k-e1");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");

    // 在飞轮：compact 必 busy（压缩以 turn 跑，与进行中轮并发未验证先拒）。
    // 在飞信号 = turn/started 透传帧（@slow 的 delta 在挂起循环之后才发，不能当在飞信号）。
    runtime.write("k-e1", "@slow 8000", "u-e1");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_event"), "slow turn in flight");
    expect(await runtime.compact("k-e1")).toBe("busy");
    await runtime.interrupt("k-e1");
    await waitFor(() => parse(lines).some((m) => m.type === "ended"), "first ended");

    // @compactfail echo 轮置位 → 压缩 RPC ok、压缩 turn 以 failed 收口。
    runtime.write("k-e1", "@compactfail", "u-e1b");
    await waitFor(() => parse(lines).filter((m) => m.type === "ended").length >= 2, "second ended");
    expect(await runtime.compact("k-e1")).toBe("ok");
    await waitFor(
      () => parse(lines).filter((m) => m.type === "ended").length >= 3,
      "compact ended",
    );
    // 豁免断言：等几个 delay 周期仍无注入轮（压缩失败 ≠ agent 轮失败）。
    await Bun.sleep(300);
    expect(
      parse(lines).some(
        (m) => m.type === "codex_user_echo" && (m as { text?: string }).text === "请继续",
      ),
    ).toBe(false);
    await runtime.close("k-e1");
  });

  test("steer：在飞轮时 write 走 turn/steer 并入当前轮（不开新轮）", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({
      id: "s-e2",
      projectName: "p1",
      runtimeKey: "k-e2",
      projectPath,
    });
    const lines = collectStream(runtime, "k-e2");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");

    runtime.write("k-e2", "@slow 6000", "u-e2a");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_event"), "in flight");
    runtime.write("k-e2", "steer-me", "u-e2b");
    // steer 文本以 delta 回显（fake 仅在 turn/steer 成功路径发）= 并入当前轮的直接证据。
    await waitFor(
      () => parse(lines).some((m) => JSON.stringify(m).includes('"steered:steer-me"')),
      "steered delta",
    );
    await runtime.interrupt("k-e2");
    await waitFor(() => parse(lines).some((m) => m.type === "ended"), "ended");
    // 不开新轮：无 "echo: steer-me"（steer 文本不走 turn/start 的 echo 轮）。
    expect(parse(lines).some((m) => JSON.stringify(m).includes("echo: steer-me"))).toBe(false);
    await runtime.close("k-e2");
  });

  test("steer 失败：RPC error → 回退排队，turn 收口后 flushQueue 开新轮", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({
      id: "s-e3",
      projectName: "p1",
      runtimeKey: "k-e3",
      projectPath,
    });
    const lines = collectStream(runtime, "k-e3");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");

    runtime.write("k-e3", "@slow 1200", "u-e3a");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_event"), "in flight");
    runtime.write("k-e3", "@steerfail-more", "u-e3b");
    // @slow 自然收口后队列 flush 开新轮 → 排队文本经 turn/start 跑掉。
    await waitFor(
      () => parse(lines).some((m) => JSON.stringify(m).includes("echo: @steerfail-more")),
      "queued message ran after turn end",
    );
    // 未走 steer 路径（fake 仅 steer 成功才回显 steered）。
    expect(parse(lines).some((m) => JSON.stringify(m).includes('"steered:'))).toBe(false);
    await runtime.close("k-e3");
  });

  test("MCP 注入：spawn argv 带 -c mcp_servers.ar-hub.url=（chat 形态）", async () => {
    const { runtime } = makeRuntime(undefined, undefined, 43011);
    await runtime.startAgent({
      id: "s-e4",
      projectName: "p1",
      runtimeKey: "k-e4",
      projectPath,
    });
    const lines = collectStream(runtime, "k-e4");
    runtime.write("k-e4", "hi", "u-e4");
    await waitFor(
      () =>
        parse(lines).some(
          (m) =>
            m.type === "codex_event" &&
            (m.event as Record<string, unknown>).method === "item/completed",
        ),
      "turn completed",
    );
    const completed = parse(lines).find(
      (m) =>
        m.type === "codex_event" &&
        (m.event as Record<string, unknown>).method === "item/completed",
    ) as { event: { params: { item: { text?: string } } } };
    // fake 回显 process.argv：注入串（TOML 值带引号，探针 E1 实证形状）必须在。
    expect(completed.event.params.item.text).toContain(
      '-c mcp_servers.ar-hub.url="http://127.0.0.1:43011/mcp/p1"',
    );
    await runtime.close("k-e4");
  });

  test("账号额度：apiKey 形态（denied）config 帧无 account；ChatGPT 形态带 account", async () => {
    // denied（默认，真实 app-server 报 authentication required → catch 成 null）：
    // codexAccountFromResponses 全缺 → 无 account 字段。
    const denied = makeRuntime();
    await denied.runtime.startAgent({
      id: "s-e5a",
      projectName: "p1",
      runtimeKey: "k-e5a",
      projectPath,
    });
    const deniedLines = collectStream(denied.runtime, "k-e5a");
    denied.runtime.write("k-e5a", "hi", "u-e5a");
    await waitFor(() => parse(deniedLines).some((m) => m.type === "ended"), "denied ended");
    for (const m of parse(deniedLines)) {
      if (m.type === "codex_config") expect(m.account).toBeUndefined();
    }
    await denied.runtime.close("k-e5a");

    // allowed（fake --account-allowed）：额度快照随 config 帧透传（宽进提取后形状）。
    const allowed = makeRuntime(undefined, undefined, undefined, ["--account-allowed"]);
    await allowed.runtime.startAgent({
      id: "s-e5b",
      projectName: "p1",
      runtimeKey: "k-e5b",
      projectPath,
    });
    const allowedLines = collectStream(allowed.runtime, "k-e5b");
    await waitFor(
      () => parse(allowedLines).some((m) => m.type === "codex_config" && m.account),
      "config with account",
    );
    const cfg = parse(allowedLines).find((m) => m.type === "codex_config" && m.account) as {
      account: Record<string, unknown>;
    };
    expect(cfg.account).toEqual({
      planType: "pro",
      primary: {
        usedPercent: 42.6,
        windowDurationMins: 300,
        resetsAt: "2026-10-29T12:00:00Z",
      },
      secondary: { usedPercent: 3.2, windowDurationMins: 10080 },
      lifetimeTokens: 1234567,
    });
    await allowed.runtime.close("k-e5b");
  });

  // per-test timeout 20s：全量跑（commit 门禁）负载下 fake turn 链路 >5s 偶发 flaky
  //（单文件跑恒绿），test 级与 waitFor 级一起放宽。
  test("额度通知直取快照（denied 环境下也不打 read RPC）：params.rateLimits → 新 config 帧", async () => {
    // perf P2-2：account/rateLimits/updated 的 params 自带完整快照——denied（read 报
    // authentication required）时仍能从通知拿到额度，证明未依赖 read RPC。
    const { runtime } = makeRuntime();
    await runtime.startAgent({
      id: "s-e6a",
      projectName: "p1",
      runtimeKey: "k-e6a",
      projectPath,
    });
    const lines = collectStream(runtime, "k-e6a");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");

    runtime.write("k-e6a", "@notifylimits", "u-e6a");
    await waitFor(
      () => parse(lines).some((m) => m.type === "codex_config" && m.account?.planType === "plus"),
      "config with carried account",
      // 原 15s flaky 的真根因（2026-10-29）：启动期 refreshAccount（void 不 await）在飞
      // 时，本通知被单飞闸「在飞即丢弃」→ 快照永久丢失。已改为 pending 收口补发（见
      // 「单飞在飞期间…」用例）——此超时现只防进程调度抖动，不再兜竞态。
      15_000,
    );
    const cfg = parse(lines).find(
      (m) => m.type === "codex_config" && m.account?.planType === "plus",
    ) as { account: Record<string, unknown> };
    expect(cfg.account).toEqual({
      planType: "plus",
      primary: { usedPercent: 77, windowDurationMins: 300 },
    });
    await runtime.close("k-e6a");
  }, 20_000);

  test("单飞在飞期间到达的额度通知不丢：read 慢应答时快照记 pending、收口后补一帧 config", async () => {
    // --slow-account：启动期 account/rateLimits/read 延迟 500ms 才回 denied。启动后立即
    // 写 @notifylimits，通知在 read 在飞期间到达 → 单飞闸命中。修复前该通知被直接丢弃
    //（本轮 read 结果是 denied 空快照），第二个 config 永不来；修复后记 pending、
    // 收口补一轮 → 通知携带的 plus 快照落地。
    const { runtime } = makeRuntime(undefined, undefined, undefined, ["--slow-account"]);
    await runtime.startAgent({
      id: "s-e6b",
      projectName: "p1",
      runtimeKey: "k-e6b",
      projectPath,
    });
    const lines = collectStream(runtime, "k-e6b");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_config"), "initial config");
    runtime.write("k-e6b", "@notifylimits", "u-e6b");
    await waitFor(
      () => parse(lines).some((m) => m.type === "codex_config" && m.account?.planType === "plus"),
      "pending notification applied after inflight read",
      5_000,
    );
    await runtime.close("k-e6b");
  });
});

describe("CodexRuntime 批 G（skills 目录 / @ 文件补全）", () => {
  test("skills 帧注入：启动期 skills/list → codex_skills（enabled 滤 / interface 优先 / pluginId 透传）", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({
      id: "s-g1",
      projectName: "p1",
      runtimeKey: "k-g1",
      projectPath,
    });
    const lines = collectStream(runtime, "k-g1");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_skills"), "skills frame");

    const ms = parse(lines);
    const skillsFrame = ms.find((m) => m.type === "codex_skills") as {
      skills: { name: string; description: string; scope: string; pluginId?: string }[];
    };
    // 精确锁全量：disabled-skill 被滤（恰好 3 条）、投影链 interface.shortDescription 优先、
    // pluginId 仅在有值时透传（toEqual 同时断无多余字段）。#call1 由 fake 注入供 debounce
    // 重拉断言区分帧次。
    expect(skillsFrame.skills).toEqual([
      { name: "commit-helper", description: "fallback-desc#call1", scope: "user" },
      { name: "refresh-workflow", description: "short-wins#call1", scope: "repo" },
      { name: "plugin-skill", description: "plugin desc", scope: "user", pluginId: "plg_1" },
    ]);
    // 帧序：skills 在 config 之后（doEnsureRunning 注入顺序 config → skills）。
    const configIdx = ms.findIndex((m) => m.type === "codex_config");
    const skillsIdx = ms.findIndex((m) => m.type === "codex_skills");
    expect(configIdx).toBeGreaterThanOrEqual(0);
    expect(skillsIdx).toBeGreaterThan(configIdx);

    await runtime.close("k-g1");
  });

  test("--no-skills：skills/list 回空数组 → 无 codex_skills 帧（空目录不发帧 = 能力信号）", async () => {
    const { runtime } = makeRuntime(undefined, undefined, undefined, ["--no-skills"]);
    await runtime.startAgent({
      id: "s-g2",
      projectName: "p1",
      runtimeKey: "k-g2",
      projectPath,
    });
    const lines = collectStream(runtime, "k-g2");
    runtime.write("k-g2", "hello", "u1");
    await waitFor(
      () => parse(lines).some((m) => m.type === "ended" && m.stopReason === "completed"),
      "ended frame",
    );
    await Bun.sleep(30); // refreshSkills 是 void promise：给竞态余量再断言
    expect(parse(lines).some((m) => m.type === "codex_skills")).toBe(false);

    await runtime.close("k-g2");
  });

  test("skills/changed 通知 → 500ms debounce 重拉 → 第二帧（fake #call2 计数证重拉）", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({
      id: "s-g3",
      projectName: "p1",
      runtimeKey: "k-g3",
      projectPath,
    });
    const lines = collectStream(runtime, "k-g3");
    await waitFor(() => parse(lines).some((m) => m.type === "codex_skills"), "first skills frame");
    expect(parse(lines).filter((m) => m.type === "codex_skills")).toHaveLength(1);

    runtime.write("k-g3", "@skillschanged", "u1");
    await waitFor(
      () => parse(lines).filter((m) => m.type === "codex_skills").length >= 2,
      "second skills frame (debounce + re-fetch)",
    );
    const frames = parse(lines).filter((m) => m.type === "codex_skills") as {
      skills: { name: string; description: string }[];
    }[];
    // fake 的 description 带 #call<N> 计数：第二帧 = 重拉后的新数据（非旧帧回放）。
    expect(frames[1]?.skills.find((s) => s.name === "refresh-workflow")?.description).toBe(
      "short-wins#call2",
    );

    await runtime.close("k-g3");
  });

  test("fileSearch：投影（directory 分型）+ cap 20 + 未启动 key 空数组", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({
      id: "s-g4",
      projectName: "p1",
      runtimeKey: "k-g4",
      projectPath,
    });

    // fake 小样本：file / directory / file 三条，投影 match_type → matchType 驼峰。
    await expect(runtime.fileSearch("k-g4", "beta")).resolves.toEqual([
      { path: "src/beta.md", matchType: "file", fileName: "beta.md" },
      { path: "src/nested", matchType: "directory", fileName: "nested" },
      { path: "gamma.ts", matchType: "file", fileName: "gamma.ts" },
    ]);
    // fake 回 25 条 → 服务端 FILE_SEARCH_RESULT_CAP 截到 20。
    const capped = await runtime.fileSearch("k-g4", "@cap");
    expect(capped).toHaveLength(20);
    expect(capped[0]).toEqual({ path: "f0.ts", matchType: "file", fileName: "f0.ts" });
    // 会话未启动（entry 不在）→ 空数组不抛错。
    await expect(runtime.fileSearch("k-none", "beta")).resolves.toEqual([]);

    await runtime.close("k-g4");
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
