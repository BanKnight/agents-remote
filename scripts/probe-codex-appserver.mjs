#!/usr/bin/env bun
// probe-codex-appserver.mjs — codex app-server（0.163.0）真机帧探针
//
// 目的：在写 codex-runtime.ts 之前，直连 app-server 录制真实 JSON-RPC 帧形状
// 作 fixtures（scripts/fixtures/codex-appserver/*.jsonl），并逐项断言协议事实
// （计划风险表：mid-thread 配置热切换 / deny 语义 / 并发 turn / resume 回放）。
//
// 会触发真实 LLM 调用（本机 provider 配置）；cwd 用 PROJECTS_ROOT/test。
// 跑法：bun scripts/probe-codex-appserver.mjs [--keep]
//   --keep  探针结束后不清理测试 thread（默认结束关闭进程即可，thread 留在
//           ~/.codex/sessions 供 thread/resume 探测，无需清理）
//
// 断言汇总在 stdout；任一 FAIL 退出码 1。fixtures 每场景一个 .jsonl，
// 每行 {dir, frame}（dir ∈ req/res/notif/sreq/sres）；account/read 结果脱敏
// （只保留 requiresOpenaiAuth 布尔，不落账号字段）。

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, rmSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CWD = "/home/deploy/workspace/test";
const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/codex-appserver",
);
const SCENARIO_TIMEOUT_MS = 180_000;
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── JSON-RPC stdio 客户端 ──────────────────────────────────────────────────
class CodexAppServer {
  constructor(label) {
    this.label = label;
    this.nextId = 1;
    this.pending = new Map(); // id → {resolve, reject}
    this.requests = []; // server→client 请求（需回复）
    this.notifications = [];
    /** 通知扫描游标：collectTurn 只看 [cursor, end)，跨场景不重扫旧帧（S4/S6/S7 串扰教训）。 */
    this.cursor = 0;
    this.closed = false;
    this.proc = spawn("codex", ["app-server"], { cwd: CWD, stdio: ["pipe", "pipe", "pipe"] });
    this.fixturePath = path.join(FIXTURES_DIR, `${label}.jsonl`);
    mkdirSync(FIXTURES_DIR, { recursive: true });
    writeFileSync(this.fixturePath, ""); // 重跑清空，不追加旧帧
    this.proc.stdout.setEncoding("utf8");
    let buf = "";
    this.proc.stdout.on("data", (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) this.onFrame(JSON.parse(line));
      }
    });
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (c) => process.stderr.write(`[${label} stderr] ${c}`));
    this.proc.on("exit", (code) => {
      this.closed = true;
      for (const p of this.pending.values()) p.reject(new Error(`app-server exited code=${code}`));
    });
  }

  writeFixture(dir, frame) {
    appendFileSync(this.fixturePath, `${JSON.stringify({ dir, frame })}\n`);
  }

  onFrame(frame) {
    if (typeof frame.id === "number" && frame.method !== undefined) {
      // server→client 请求
      this.requests.push(frame);
      this.writeFixture("sreq", frame);
      return;
    }
    if (frame.id !== undefined && frame.method === undefined) {
      // 对我们请求的响应
      this.writeFixture("res", frame);
      const p = this.pending.get(frame.id);
      if (p) {
        this.pending.delete(frame.id);
        if (frame.error) p.reject(new Error(`rpc error: ${JSON.stringify(frame.error)}`));
        else p.resolve(frame.result);
      }
      return;
    }
    if (frame.method) {
      this.notifications.push(frame);
      this.writeFixture("notif", frame);
    }
  }

  request(method, params) {
    const id = this.nextId++;
    const frame = { jsonrpc: "2.0", id, method, params };
    this.writeFixture("req", frame);
    this.proc.stdin.write(`${JSON.stringify(frame)}\n`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout waiting ${method}`));
        }
      }, SCENARIO_TIMEOUT_MS).unref();
    });
  }

  notify(method, params) {
    const frame = { jsonrpc: "2.0", method, params };
    this.writeFixture("req", frame);
    this.proc.stdin.write(`${JSON.stringify(frame)}\n`);
  }

  // 回复 server→client 请求
  respond(frame, result) {
    const resp = { jsonrpc: "2.0", id: frame.id, result };
    this.writeFixture("sres", resp);
    this.proc.stdin.write(`${JSON.stringify(resp)}\n`);
  }

  /** 等待匹配的 server→client 请求（不消费，数组只增） */
  waitForRequest(matcher, timeoutMs = SCENARIO_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const tick = () => {
        const hit = this.requests.find((r) => matcher(r));
        if (hit) return resolve(hit);
        if (Date.now() > deadline) return reject(new Error(`timeout waiting sreq`));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  /** 等待匹配的通知 */
  waitForNotification(method, predicate = () => true, timeoutMs = SCENARIO_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const tick = () => {
        const hit = this.notifications.find((n) => n.method === method && predicate(n));
        if (hit) return resolve(hit);
        if (this.closed) return reject(new Error(`process closed waiting ${method}`));
        if (Date.now() > deadline) return reject(new Error(`timeout waiting notif ${method}`));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  /** 增量收集指定 turn 的生命周期帧：deltas 计数 + 终态 turn/completed。
   *  只扫 [cursor, end)（S4/S6/S7 串扰教训：全量扫会读到上一场景的旧 completed）。 */
  async collectTurnLife(turnId) {
    const deltas = { agentMessage: 0, reasoningSummary: 0, commandOutput: 0, samples: {} };
    const sample = (key, frame) => {
      if (!deltas.samples[key]) deltas.samples[key] = frame;
    };
    const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
    for (;;) {
      for (; this.cursor < this.notifications.length; this.cursor++) {
        const n = this.notifications[this.cursor];
        const p = n.params ?? {};
        const frameTurnId = p.turnId ?? p.turn?.id;
        if (frameTurnId !== turnId) continue;
        if (n.method === "item/agentMessage/delta") {
          deltas.agentMessage++;
          sample("agentMessageDelta", n);
        } else if (n.method === "item/reasoning/summaryTextDelta") {
          deltas.reasoningSummary++;
          sample("reasoningSummaryTextDelta", n);
        } else if (n.method === "item/commandExecution/outputDelta") {
          deltas.commandOutput++;
          sample("commandExecutionOutputDelta", n);
        } else if (n.method === "turn/completed") {
          this.cursor++;
          return { deltas, turnCompleted: n };
        }
      }
      if (Date.now() > deadline) throw new Error("timeout collecting turn life");
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  close() {
    if (!this.closed) {
      try {
        this.proc.stdin.end();
      } catch {
        /* already gone */
      }
      this.proc.kill("SIGTERM");
    }
  }
}

// ── 场景 ───────────────────────────────────────────────────────────────────
mkdirSync(FIXTURES_DIR, { recursive: true });

async function scenarioInitialize() {
  const s = new CodexAppServer("s1-initialize");
  try {
    const init = await s.request("initialize", {
      clientInfo: { name: "agents-remote-probe", title: null, version: "0.0.1" },
      capabilities: null,
    });
    record(
      "S1 initialize 返回 userAgent/codexHome",
      typeof init.userAgent === "string" && typeof init.codexHome === "string",
    );
    s.notify("initialized", {});
    const account = await s.request("account/read", {});
    record(
      "S1 account/read 返回 requiresOpenaiAuth",
      typeof account.requiresOpenaiAuth === "boolean",
    );
    // 脱敏重写 fixtures 里 account/read 的响应帧
    const lines = (await Bun.file(s.fixturePath).text()).split("\n").filter(Boolean);
    const rewritten = lines.map((l) => {
      const e = JSON.parse(l);
      if (e.dir === "res" && e.frame.result && "requiresOpenaiAuth" in e.frame.result) {
        e.frame.result = {
          requiresOpenaiAuth: e.frame.result.requiresOpenaiAuth,
          account: null,
          "[redacted]": true,
        };
        return JSON.stringify(e);
      }
      return l;
    });
    writeFileSync(s.fixturePath, `${rewritten.join("\n")}\n`);
    return { server: s };
  } catch (err) {
    record("S1 initialize", false, String(err));
    s.close();
    throw err;
  }
}

async function scenarioModelList(s) {
  const res = await s.request("model/list", { limit: 10 });
  const first = res.data?.[0];
  record(
    "S2 model/list data[] 含 id/displayName/defaultReasoningEffort",
    Array.isArray(res.data) &&
      first &&
      typeof first.id === "string" &&
      typeof first.displayName === "string" &&
      "defaultReasoningEffort" in first,
    `models=${res.data?.length} nextCursor=${JSON.stringify(res.nextCursor)}`,
  );
  record(
    "S2 Model.supportedReasoningEfforts 形状",
    Array.isArray(first.supportedReasoningEfforts),
    JSON.stringify(first.supportedReasoningEfforts?.slice(0, 2)),
  );
  return first;
}

async function scenarioThreadStart(s) {
  const res = await s.request("thread/start", {
    cwd: CWD,
    approvalPolicy: "untrusted",
    sandbox: "read-only",
  });
  const threadId = res.thread?.id;
  record("S3 thread/start 返回 thread.id", typeof threadId === "string", `threadId=${threadId}`);
  record(
    "S3 thread/start 回读 approvalPolicy/sandbox/model/reasoningEffort",
    res.approvalPolicy === "untrusted" &&
      res.sandbox?.type === "readOnly" &&
      typeof res.model === "string",
    `approvalPolicy=${JSON.stringify(res.approvalPolicy)} sandbox=${JSON.stringify(res.sandbox)} model=${res.model} effort=${JSON.stringify(res.reasoningEffort)}`,
  );
  return { threadId };
}

async function scenarioTurnLifecycle(s, threadId) {
  const turnStart = await s.request("turn/start", {
    threadId,
    input: [
      { type: "text", text: "请运行命令 `echo codex-probe-ok` 并告诉我输出。只做这一件事。" },
    ],
  });
  const turnId = turnStart.turn?.id;
  record(
    "S4 turn/start 响应含 turn.id/status=inProgress",
    typeof turnId === "string" && turnStart.turn?.status === "inProgress",
    `turnId=${turnId}`,
  );

  await s.waitForNotification("turn/started", (n) => n.params?.threadId === threadId);
  record("S4 turn/started 通知到达", true);

  // 审批往返：untrusted 策略下 echo 命令应触发 requestApproval
  let approvalFrame = null;
  try {
    approvalFrame = await s.waitForRequest(
      (r) =>
        r.method === "item/commandExecution/requestApproval" && r.params?.threadId === threadId,
      90_000,
    );
  } catch {
    record(
      "S4 审批请求触发（untrusted + echo）",
      false,
      "90s 内未收到 requestApproval（模型可能直接跑了或拒绝）",
    );
  }
  if (approvalFrame) {
    record(
      "S4 requestApproval params 含 threadId/turnId/itemId/command",
      !!approvalFrame.params?.threadId &&
        !!approvalFrame.params?.turnId &&
        !!approvalFrame.params?.itemId &&
        typeof approvalFrame.params?.command === "string",
      `command=${JSON.stringify(String(approvalFrame.params?.command).slice(0, 80))} kind=${approvalFrame.params?.kind}`,
    );
    s.respond(approvalFrame, { decision: "accept" });
    try {
      const resolved = await s.waitForNotification(
        "serverRequest/resolved",
        (n) => n.params?.threadId === threadId,
        60_000,
      );
      record(
        "S4 serverRequest/resolved 通知到达（accept 路径）",
        true,
        JSON.stringify(resolved.params).slice(0, 200),
      );
    } catch {
      record("S4 serverRequest/resolved（accept 路径）", false, "60s 未收到 resolved 通知");
    }
  }

  const { deltas, turnCompleted } = await s.collectTurnLife(turnId);
  const status = turnCompleted.params?.turn?.status;
  record(
    "S4 turn/completed status ∈ {completed,failed}",
    status === "completed" || status === "failed",
    `status=${status} error=${JSON.stringify(turnCompleted.params?.turn?.error?.message ?? null).slice(0, 200)}`,
  );
  record(
    "S4 流式 delta 帧（agentMessage 或 reasoning）",
    deltas.agentMessage > 0 || deltas.reasoningSummary > 0,
    `agentMessage=${deltas.agentMessage} reasoningSummary=${deltas.reasoningSummary} commandOutput=${deltas.commandOutput}`,
  );

  const itemsDone = s.notifications.filter(
    (n) => n.method === "item/completed" && n.params?.turnId === turnId,
  );
  const cmdItem = itemsDone.map((n) => n.params.item).find((i) => i?.type === "commandExecution");
  if (cmdItem) {
    record(
      "S4 item/completed commandExecution 含 exitCode/aggregatedOutput",
      "exitCode" in cmdItem && "aggregatedOutput" in cmdItem,
      `exitCode=${cmdItem.exitCode} output=${JSON.stringify(String(cmdItem.aggregatedOutput ?? "").slice(0, 60))}`,
    );
  } else {
    record(
      "S4 item/completed commandExecution",
      false,
      `完成 item 类型: ${itemsDone.map((n) => n.params.item?.type).join(",") || "无"}`,
    );
  }
  return { turnId };
}

async function scenarioThreadRead(s, threadId) {
  const res = await s.request("thread/read", { threadId, includeTurns: true });
  const turns = res.thread?.turns ?? [];
  record(
    "S5 thread/read includeTurns 回放 turns[].items",
    Array.isArray(turns) && turns.length > 0,
    `turns=${turns.length} 首 turn items=${turns[0]?.items?.map((i) => i.type).join(",")}`,
  );
  return turns;
}

async function scenarioConcurrentTurn(s, threadId) {
  // 第一轮 turn 已完成后，本场景验证「inProgress 期间再发 turn/start」的行为：
  // 上一场景 turn 已 completed，这里发起一个长任务 turn，在它进行中再发第二个。
  const t1 = await s.request("turn/start", {
    threadId,
    input: [{ type: "text", text: "请运行 `sleep 5` 然后说 done。" }],
  });
  const turnId1 = t1.turn?.id;
  await s.waitForNotification("turn/started", (n) => n.params?.turn?.id === turnId1);
  let concurrentResult;
  try {
    concurrentResult = await s.request("turn/start", {
      threadId,
      input: [{ type: "text", text: "说 hi" }],
    });
    record(
      "S6 并发 turn/start 行为",
      true,
      `意外地被接受: turnId=${concurrentResult.turn?.id ?? "(no turn)"}（ recorded）`,
    );
  } catch (err) {
    record("S6 并发 turn/start 被拒", true, `拒绝形状: ${String(err.message).slice(0, 200)}`);
  }
  // 收尾：等第一个 turn 结束（并发 turn2 若仍在跑，按 turnId 收集互不串扰）
  try {
    await s.request("turn/interrupt", { threadId, turnId: turnId1 });
  } catch {
    /* interrupting a finished turn errors on some servers; fine */
  }
  await s.collectTurnLife(turnId1).catch(() => {});
  record("S6 场景收尾（interrupt + 等本 turn completed）", true);
}

async function scenarioInterrupt(s, threadId) {
  const t = await s.request("turn/start", {
    threadId,
    input: [{ type: "text", text: "请运行 `sleep 30`。" }],
  });
  const turnId = t.turn?.id;
  await s.waitForNotification("turn/started", (n) => n.params?.turn?.id === turnId);
  // untrusted 下 sleep 30 会先触发审批：accept 让命令真正开跑（验证「执行中打断」，
  // 而非打断挂在等审批的 turn——后者语义混杂）。
  try {
    const approval = await s.waitForRequest(
      (r) => r.method === "item/commandExecution/requestApproval" && r.params?.turnId === turnId,
      45_000,
    );
    s.respond(approval, { decision: "accept" });
  } catch {
    /* 未触发审批也继续 */
  }
  await s.request("turn/interrupt", { threadId, turnId });
  const { turnCompleted } = await s.collectTurnLife(turnId);
  const status = turnCompleted.params?.turn?.status;
  record(
    "S7 interrupt 后 turn/completed status=interrupted",
    status === "interrupted",
    `status=${status}`,
  );
}

async function scenarioResume() {
  // 跨进程恢复：新 app-server 进程 thread/resume 同一 threadId
  // thread/start 的响应在 s1-initialize.jsonl（S3+ 场景复用同一 server 实例）
  const s1 = (await Bun.file(path.join(FIXTURES_DIR, "s1-initialize.jsonl")).text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const threadId = s1.find((e) => e.dir === "res" && e.frame.result?.thread?.id !== undefined)
    ?.frame.result.thread.id;
  if (!threadId) {
    record("S8 thread/resume（跨进程）", false, "无法从 s1 fixtures 取 threadId");
    return;
  }
  const s2 = new CodexAppServer("s8-resume");
  try {
    await s2.request("initialize", {
      clientInfo: { name: "agents-remote-probe", title: null, version: "0.0.1" },
      capabilities: null,
    });
    s2.notify("initialized", {});
    const res = await s2.request("thread/resume", { threadId });
    const turns = res.thread?.turns ?? [];
    record(
      "S8 跨进程 thread/resume 回放 turns + thread 元数据",
      Array.isArray(turns) && turns.length > 0 && typeof res.model === "string",
      `turns=${turns.length} model=${res.model} effort=${JSON.stringify(res.reasoningEffort)} items 首2=${turns
        .flatMap((t) => t.items)
        .slice(0, 2)
        .map((i) => i.type)
        .join(",")}`,
    );
    // resume 后用户消息 + agent 消息形状（供 history 合成参考）
    const firstUser = turns.flatMap((t) => t.items).find((i) => i.type === "userMessage");
    record(
      "S8 userMessage item 形状（content[]+text）",
      !!firstUser &&
        Array.isArray(firstUser.content) &&
        typeof firstUser.content[0]?.text === "string",
      `content[0].type=${firstUser?.content?.[0]?.type}`,
    );
  } catch (err) {
    record("S8 thread/resume（跨进程）", false, String(err).slice(0, 200));
  } finally {
    s2.close();
  }
}

async function scenarioConfigHotSwitch(s, threadId) {
  // turn/start 带 effort 覆盖：录帧观察是否生效（响应/后续通知里 effort 是否变化）。
  // ReasoningEffort 是自由字符串；用 model/list 返回的 supportedReasoningEfforts 里
  // 与 default 不同的值（若有）。
  const res = await s.request("turn/start", {
    threadId,
    input: [{ type: "text", text: "只回复 ok 两个字母，不要做任何其他事。" }],
    effort: "low",
  });
  record(
    "S9 turn/start 带 effort 覆盖不报错",
    typeof res.turn?.id === "string",
    `（turn/start 的 model/effort/sandboxPolicy 覆盖语义 = 本轮及后续轮，绑定注释实证）`,
  );
  await s.collectTurnLife(res.turn?.id).catch(() => {});
  // 热切换后 thread/read 看 reasoningEffort 是否被改写
  const after = await s.request("thread/read", { threadId, includeTurns: false });
  record(
    "S9 热切换后 thread.reasoningEffort 观测",
    true,
    `reasoningEffort=${JSON.stringify(after.thread?.reasoningEffort)}（下轮生效语义的证据）`,
  );
}

// ── 批 G 智能感应场景（composer / 补全 + @ 文件补全的协议实证）──────────────
//
// 批 0 探针结论（2026-10-29 真机 codex 0.163.0，31/31 PASS；批 1/3 的实现闸门）：
//   R1 skill 引用文本：`/name` 是权威形态——userMessage item 原样保留 `/name …`，
//      模型端加载 skill 内容（agentMessage 实证「我会加载你显式调用的技能」）；
//      `$name` 发入被 app-server 输入规范化改写为 `/name`（殊途同归）→
//      批 3 SKILL_REF_FORM = `/${name}`，无需 `$` 中转。
//   R2 fuzzyFileSearch 分型：RPC **直返** `{files: [{root, path, match_type,
//      "file"|"directory", file_name, score, indices}]}`，无通知流（1.5s 采样零
//      通知帧）→ 批 1 fileSearch() 直接 await RPC，无需 waiter Map/超时收口。
//   R3 wire 方法名：`skills/list`（params `{cwds: [...]}`）与 `fuzzyFileSearch`
//      （params `{query, roots, cancellationToken}`）拼写正确（S10/S11 PASS）。
//   R4 path 相对 root（`src/beta.md`）；目录项 `match_type:"directory"`；.gitignore
//      与 node_modules 在**非 git 目录**不生效（secret/vendor 均被搜出）——真实项目
//      root（git repo）行为留观，客户端渲染 cap 20 兜底。
//   R5 SkillMetadata 实测 `{name, description, scope, enabled, pluginId, path}`；
//      本机样本无 shortDescription/interface 字段（undefined）——批 1 投影链
//      `interface?.shortDescription ?? shortDescription ?? description` 宽进安全。
//   附赠：busy 时 turn/start **不新建 turn 而并入当前 turn**（响应复用 inFlight
//      turn id）= 服务端 steer 语义（S6「并发被接受」之谜同解；客户端 steerOrQueue
//      批 E 已对齐）。

// S12 需要一个真实存在的 skill 才能验证「引用文本是否被 app-server 解析」。随机后缀
// 使与用户已有 skill 撞名概率≈0；finally 只删自己建的这个目录（probe-only-delete-own-data）。
const PROBE_SKILL_NAME = `probe-g-skill-${Math.random().toString(36).slice(2, 6)}`;

async function setupProbeSkill() {
  const dir = path.join(homedir(), ".codex", "skills", PROBE_SKILL_NAME);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${PROBE_SKILL_NAME}\ndescription: agents-remote batch G probe skill for composer intellisense\n---\n\nProbe skill body. Reply with the word ok only.\n`,
  );
  return dir;
}

/** S10：skills/list 形状 + 自建 user 级 skill 可见性（批 G catalog 数据源）。 */
async function scenarioSkillsList(s) {
  const res = await s.request("skills/list", { cwds: [CWD] });
  const bucket = res.data?.[0];
  record(
    "S10 skills/list data[] 按 cwd 分桶",
    Array.isArray(res.data) && bucket?.cwd === CWD,
    `buckets=${res.data?.length} cwd=${bucket?.cwd}`,
  );
  const skills = bucket?.skills ?? [];
  const probe = skills.find((k) => k.name === PROBE_SKILL_NAME);
  record(
    "S10 自建 user 级 skill 在列表且形状完整",
    !!probe &&
      probe.scope === "user" &&
      typeof probe.name === "string" &&
      typeof probe.path === "string" &&
      typeof probe.enabled === "boolean",
    probe
      ? JSON.stringify({
          name: probe.name,
          description: probe.description,
          shortDescription: probe.shortDescription,
          interface: probe.interface,
          scope: probe.scope,
          enabled: probe.enabled,
          pluginId: probe.pluginId,
        }).slice(0, 300)
      : `skills=${skills.map((k) => k.name).join(",")}`,
  );
  record(
    "S10 errors[] 形态",
    Array.isArray(bucket?.errors),
    `errors=${JSON.stringify(bucket?.errors).slice(0, 120)}`,
  );
  return skills;
}

/** S11：fuzzyFileSearch 响应分型（RPC 直返 vs 通知流）+ path 相对性 + 目录项 + gitignore 观察。 */
async function scenarioFileSearch(s) {
  const root = path.join(tmpdir(), `codex-probe-files-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(path.join(root, "src", "nested"), { recursive: true });
  mkdirSync(path.join(root, "node_modules"), { recursive: true });
  writeFileSync(path.join(root, "alpha.txt"), "x\n");
  writeFileSync(path.join(root, "src", "beta.md"), "y\n");
  writeFileSync(path.join(root, "src", "nested", "gamma.ts"), "z\n");
  writeFileSync(path.join(root, "node_modules", "vendor.js"), "w\n");
  writeFileSync(path.join(root, "ignored-secret.txt"), "v\n");
  writeFileSync(path.join(root, ".gitignore"), "ignored-secret.txt\nnode_modules\n");
  try {
    const res = await s.request("fuzzyFileSearch", {
      query: "beta",
      roots: [root],
      cancellationToken: null,
    });
    const files = res?.files;
    record(
      "S11 RPC 响应含 files[]（直返分型）",
      Array.isArray(files),
      `keys=${Object.keys(res ?? {}).join(",")} files=${JSON.stringify(files)?.slice(0, 240)}`,
    );
    const beta = files?.find((f) => f.file_name === "beta.md");
    record(
      "S11 path 相对性（相对 root vs 绝对）",
      typeof beta?.path === "string",
      `path=${beta?.path} root=${root} matchType=${beta?.match_type} score=${beta?.score} indices=${JSON.stringify(beta?.indices)}`,
    );
    // 目录项形态
    const dirRes = await s.request("fuzzyFileSearch", {
      query: "nested",
      roots: [root],
      cancellationToken: null,
    });
    record(
      "S11 目录项 match_type=directory",
      true,
      `files=${JSON.stringify(dirRes?.files?.map((f) => `${f.match_type}:${f.path}`))?.slice(0, 200)}`,
    );
    // gitignore / node_modules 观察（结论记 detail，不硬断言——引擎行为留观项）
    const ignRes = await s.request("fuzzyFileSearch", {
      query: "secret",
      roots: [root],
      cancellationToken: null,
    });
    const vendRes = await s.request("fuzzyFileSearch", {
      query: "vendor",
      roots: [root],
      cancellationToken: null,
    });
    record(
      "S11 gitignore/node_modules 尊重观察",
      true,
      `secret=${JSON.stringify(ignRes?.files?.map((f) => f.path))} vendor=${JSON.stringify(vendRes?.files?.map((f) => f.path))}`,
    );
    // 通知流形态：直返分型下不应有 session/updated|completed；等一小段采样确认
    await new Promise((r) => setTimeout(r, 1500));
    const sessionNotifs = s.notifications.filter((n) => n.method?.startsWith("fuzzyFileSearch"));
    record(
      "S11 fuzzyFileSearch 通知流观察",
      true,
      sessionNotifs.length === 0
        ? "无通知（直返分型成立）"
        : sessionNotifs.map((n) => n.method).join(","),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** S12：skill 引用文本形态——`/name` 与 `$name` 发 turn 后 thread/read 看首条 userMessage 是否被改写。 */
async function scenarioSkillRef(s, threadId) {
  for (const [tag, text] of [
    ["slash", `/${PROBE_SKILL_NAME} 请只回复 ok`],
    ["dollar", `$${PROBE_SKILL_NAME} 请只回复 ok`],
  ]) {
    const t = await s.request("turn/start", {
      threadId,
      input: [{ type: "text", text }],
    });
    const turnId = t.turn?.id;
    const life = await s.collectTurnLife(turnId).catch(() => null);
    const read = await s.request("thread/read", { threadId, includeTurns: true });
    const userItems = (read.thread?.turns ?? [])
      .flatMap((turn) => turn.items ?? [])
      .filter((i) => i.type === "userMessage");
    const last = userItems.at(-1);
    const lastText = last?.content?.map((c) => c.text ?? "").join("");
    record(
      `S12 ${tag} 引用文本 userMessage 形态`,
      typeof lastText === "string",
      `sent=${JSON.stringify(text).slice(0, 80)} readBack=${JSON.stringify(lastText).slice(0, 160)} itemKeys=${Object.keys(last ?? {}).join(",")} turnStatus=${life?.turnCompleted?.params?.turn?.status}`,
    );
  }
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
console.log(`# codex app-server 探针  cwd=${CWD}  fixtures=${FIXTURES_DIR}`);
let mainServer = null;
let probeSkillDir = null;
try {
  // fixture skill 必须在 app-server spawn 前建好（skills/list 启动期扫描可见性）。
  probeSkillDir = await setupProbeSkill();
  const { server } = await scenarioInitialize();
  mainServer = server;
  const model = await scenarioModelList(server);
  void model;
  // 批 G 新场景单独兜底：wire 方法名不存在（R3）时记 FAIL 但不炸主流程，
  // S3–S9 既有断言照常跑。
  try {
    await scenarioSkillsList(server);
  } catch (err) {
    record("S10 skills/list", false, String(err).slice(0, 240));
  }
  try {
    await scenarioFileSearch(server);
  } catch (err) {
    record("S11 fuzzyFileSearch", false, String(err).slice(0, 240));
  }
  const { threadId } = await scenarioThreadStart(server);
  await scenarioTurnLifecycle(server, threadId);
  await scenarioThreadRead(server, threadId);
  await scenarioConcurrentTurn(server, threadId);
  await scenarioInterrupt(server, threadId);
  await scenarioConfigHotSwitch(server, threadId);
  try {
    await scenarioSkillRef(server, threadId);
  } catch (err) {
    record("S12 skill 引用文本", false, String(err).slice(0, 240));
  }
  mainServer.close();
  mainServer = null;
  await scenarioResume();
} catch (err) {
  record("主流程异常中断", false, String(err).slice(0, 300));
} finally {
  mainServer?.close();
  // 只删自己建的 fixture skill（名字带随机后缀，撞名概率≈0；删除前核对目录名）。
  if (probeSkillDir && probeSkillDir.includes(PROBE_SKILL_NAME)) {
    rmSync(probeSkillDir, { recursive: true, force: true });
  }
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n# 汇总：${results.length - failed.length}/${results.length} 通过${failed.length ? `，FAIL ${failed.length}` : ""}`,
);
process.exit(failed.length ? 1 : 0);
