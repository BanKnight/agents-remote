#!/usr/bin/env bun
// probe-admin-approval.mjs — ar-hub admin 管理面审批全链探针（批次 3 验收）
//
// 目的：真实 CLI + 真实 hub + 真实审批中心的全链验证：
//   Part 1  claude 会话调 project_create → 审批卡出现（provider=mcp-admin 且
//           卡 sessionId = 发起会话 id，origin 穿线实证）→ allow → 工具真执行
//           （项目目录真创建）→ 卡消失；
//   Part 2  同链 deny → 工具不执行（目录不存在）→ 卡消失；
//   Part 3  codex CLI 收下批次 2 注入的两个 -c（url + tool_timeout_sec=180）
//           不报 unrecognized config key 且正常握手退出。
//
// 跑法：bun scripts/probe-admin-approval.mjs（dev api 43011 / hub 43013 需在跑）
// 断言汇总在 stdout；任一 FAIL 退出码 1。探针只删自己创建的数据（displayName
// 前缀识别会话、唯一 ts 后缀目录、内部状态文件备份恢复）。

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { readAppPassword } from "./lib/deploy-config.mjs";

const API_BASE = "http://127.0.0.1:43011";
const HUB_PORT = 43013;
const TEST_PROJECT = "test";
// 能力开关真相源 = ar-hub 内部状态（渐进式披露批；项目 mcp.json 已退役为惰性导入源，
// store 有记录后不再读文件——所以本探针必须直接改这份状态，改 mcp.json 不再生效）。
const CAPABILITIES_PATH = join(homedir(), ".agents-remote", "mcp-capabilities.json");
const PROJECTS_ROOT = "/home/deploy/workspace";

const SESSION_READY_TIMEOUT_MS = 90_000;
const APPROVAL_WAIT_TIMEOUT_MS = 100_000;
const APPROVAL_SETTLE_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 2_000;
const CODEX_HANDSHAKE_TIMEOUT_MS = 60_000;

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── REST 客户端（login 拿 token → Bearer）────────────────────────────────────
let authToken = "";

async function login() {
  const password = await readAppPassword();
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  authToken = ((await res.json()) ?? {}).token ?? "";
  if (!authToken) throw new Error("login returned empty token");
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// 轮询直到 fn 返回真值（或超时 throw）。fn 返回真值即作为 pollUntil 的返回值。
async function pollUntil(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`timeout after ${timeoutMs}ms: ${label}`);
}

// ── 审批卡快照 helpers ────────────────────────────────────────────────────────
// 管理卡判定：provider === "mcp-admin" 且 toolName 匹配。探针只认自己发起会话的卡。
const findAdminCard = (approvals, toolName, originSessionId) =>
  approvals.find(
    (a) => a.provider === "mcp-admin" && a.toolName === toolName && a.sessionId === originSessionId,
  ) ?? null;

const approvalsSnapshot = async () => {
  const { body } = await api("/api/approvals");
  return body?.approvals ?? [];
};

// ── claude 会话生命周期 helpers ───────────────────────────────────────────────
// 创建 claude 会话并等 CLI 就绪（claudeSessionId 非空）。displayName 带唯一前缀
//（admin-probe-allow/deny-<ts>）供清理识别。返回 { id, displayName }。
async function createClaudeSession(displayName) {
  const { status, body } = await api(`/api/projects/${TEST_PROJECT}/agent-sessions`, {
    method: "POST",
    body: JSON.stringify({ provider: "claude", displayName }),
  });
  if (status !== 201 && status !== 200) {
    throw new Error(`create session failed: ${status} ${JSON.stringify(body)}`);
  }
  const session = body?.session;
  if (!session?.id) throw new Error(`no session id in response: ${JSON.stringify(body)}`);
  await pollUntil(
    async () => {
      const { status: st, body: b } = await api(
        `/api/projects/${TEST_PROJECT}/agent-sessions/${session.id}`,
      );
      if (st !== 200) return null;
      return b?.session?.claudeSessionId ? b.session : null;
    },
    SESSION_READY_TIMEOUT_MS,
    `claude CLI ready (${displayName})`,
  );
  return { id: session.id, displayName };
}

// 清理：关会话（best-effort，已关会报 404 忽略）+ 删探针自建项目（deleteFiles=true 销毁
// 自建目录）。探针只删自己创建的数据：会话按 id、项目按唯一 ts 名。
async function cleanupSession(sessionId) {
  await api(`/api/projects/${TEST_PROJECT}/agent-sessions/${sessionId}/close`, { method: "POST" });
}

async function cleanupProject(projectName) {
  await api(`/api/projects/${projectName}?deleteFiles=true`, { method: "DELETE" });
}

// ── 内部状态 admin 开关（备份原文 → 写 admin:true → finally 恢复/删除）────────
// 保留 test 项目既有其它域开关；imported:true 防 store 惰性导入覆盖本次写入。
async function enableAdminCapability() {
  const backup = await readFile(CAPABILITIES_PATH, "utf8").catch(() => null);
  let file = { projects: {} };
  try {
    file = JSON.parse(backup ?? "null") ?? { projects: {} };
  } catch {
    // 损坏按空表处理（与 store 读容错同语义：安全方向 = 全关后再显式开启）
  }
  const projects = { ...file.projects };
  const state = projects[TEST_PROJECT] ?? { capabilities: {} };
  projects[TEST_PROJECT] = {
    ...state,
    imported: true,
    capabilities: { ...state.capabilities, admin: true },
  };
  await mkdir(dirname(CAPABILITIES_PATH), { recursive: true, mode: 0o700 });
  await writeFile(CAPABILITIES_PATH, `${JSON.stringify({ projects }, null, 2)}\n`, {
    mode: 0o600,
  });
  return backup;
}

async function restoreCapabilities(backup) {
  if (backup === null) {
    await rm(CAPABILITIES_PATH, { force: true });
    return;
  }
  await writeFile(CAPABILITIES_PATH, backup, { mode: 0o600 });
}

// ── Part 1: claude 全链 allow（核心）──────────────────────────────────────────
// prompt 指示 CLI 调 ar-hub project_create；卡出现即审批中心链路通；sessionId
// 匹配即 origin 穿线；allow 后目录真创建即工具执行段通。
async function part1Allow(ts) {
  const targetDir = `${PROJECTS_ROOT}/ar-admin-probe-allow-${ts}`;
  const { id: sessionId } = await createClaudeSession(`admin-probe-allow-${ts}`);
  await api(`/api/projects/${TEST_PROJECT}/sessions/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({
      text:
        `调用 ar-hub 的 project_create 工具创建项目 ${targetDir}。` +
        "只做这一件事，工具返回后直接结束，不要追问，不要做其它操作。",
    }),
  });

  const card = await pollUntil(
    async () => {
      const approvals = await approvalsSnapshot();
      return findAdminCard(approvals, "project_create", sessionId);
    },
    APPROVAL_WAIT_TIMEOUT_MS,
    "project_create approval card",
  );
  record(
    "P1 card appears with origin session id",
    card.sessionId === sessionId,
    `toolName=${card.toolName} sessionId=${card.sessionId} expect=${sessionId}`,
  );
  record(
    "P1 card fields",
    Boolean(card.controlRequestId) && card.projectName === TEST_PROJECT,
    `projectName=${card.projectName} controlRequestId=${card.controlRequestId}`,
  );

  const respond = await api("/api/approvals/respond", {
    method: "POST",
    body: JSON.stringify({
      projectName: card.projectName,
      sessionId: card.sessionId,
      controlRequestId: card.controlRequestId,
      decision: "allow",
    }),
  });
  record(
    "P1 respond allow delivered",
    respond.body?.delivered === true,
    JSON.stringify(respond.body),
  );

  await pollUntil(
    async () => {
      const approvals = await approvalsSnapshot();
      return findAdminCard(approvals, "project_create", sessionId) ? null : true;
    },
    APPROVAL_SETTLE_TIMEOUT_MS,
    "approval card removed",
  );
  record("P1 card removed after allow", true);

  await pollUntil(
    async () => (existsSync(targetDir) ? true : null),
    APPROVAL_SETTLE_TIMEOUT_MS,
    `project dir created (${targetDir})`,
  );
  record("P1 project dir really created", true, targetDir);

  await cleanupSession(sessionId);
  await cleanupProject("ar-admin-probe-allow-" + ts);
}

// ── Part 2: claude 全链 deny ─────────────────────────────────────────────────
// 同 Part 1 链路，respond deny → 卡消失 + 目录不存在（工具未执行）。
async function part2Deny(ts) {
  const targetDir = `${PROJECTS_ROOT}/ar-admin-probe-deny-${ts}`;
  const { id: sessionId } = await createClaudeSession(`admin-probe-deny-${ts}`);
  await api(`/api/projects/${TEST_PROJECT}/sessions/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({
      text:
        `调用 ar-hub 的 project_create 工具创建项目 ${targetDir}。` +
        "只做这一件事，工具返回后直接结束，不要追问，不要做其它操作。",
    }),
  });

  const card = await pollUntil(
    async () => {
      const approvals = await approvalsSnapshot();
      return findAdminCard(approvals, "project_create", sessionId);
    },
    APPROVAL_WAIT_TIMEOUT_MS,
    "project_create approval card (deny round)",
  );
  record(
    "P2 card appears with origin session id",
    card.sessionId === sessionId,
    `sessionId=${card.sessionId} expect=${sessionId}`,
  );

  const respond = await api("/api/approvals/respond", {
    method: "POST",
    body: JSON.stringify({
      projectName: card.projectName,
      sessionId: card.sessionId,
      controlRequestId: card.controlRequestId,
      decision: "deny",
    }),
  });
  record(
    "P2 respond deny delivered",
    respond.body?.delivered === true,
    JSON.stringify(respond.body),
  );
  record("P2 project dir NOT created (tool not executed)", !existsSync(targetDir), targetDir);

  await pollUntil(
    async () => {
      const approvals = await approvalsSnapshot();
      return findAdminCard(approvals, "project_create", sessionId) ? null : true;
    },
    APPROVAL_SETTLE_TIMEOUT_MS,
    "approval card removed (deny round)",
  );
  record("P2 card removed after deny", true);

  await cleanupSession(sessionId);
}

// ── Part 3: codex 收下批次 2 注入的两个 -c（url + tool_timeout_sec）────────────
// codex app-server spawn 带同款 argv → initialize 握手成功 + stderr 无
// "unrecognized config key" = config 被接受。
function part3CodexConfig() {
  const codexArgs = [
    "app-server",
    "-c",
    `mcp_servers.ar-hub.url="http://127.0.0.1:${HUB_PORT}/mcp/${TEST_PROJECT}"`,
    "-c",
    "mcp_servers.ar-hub.tool_timeout_sec=180",
  ];

  let stderrText = "";
  return new Promise((resolve) => {
    const proc = spawn("codex", codexArgs, {
      cwd: `${PROJECTS_ROOT}/test`,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let exited = false;
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (c) => {
      stderrText += c;
    });
    proc.on("exit", (code) => {
      exited = true;
      resolve({ ok: false, detail: `codex exited early code=${code} stderr=${stderrText}` });
    });
    proc.stdout.setEncoding("utf8");
    let stdoutBuf = "";
    proc.stdout.on("data", (chunk) => {
      stdoutBuf += chunk;
      let idx;
      while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        try {
          const frame = JSON.parse(line);
          if (frame.id === 1) {
            resolve({
              ok: true,
              detail: `initialize replied (stderr ${stderrText.length}B)`,
            });
            proc.kill();
          }
        } catch {
          // 非 JSON 行忽略
        }
      }
    });
    proc.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`,
    );
    setTimeout(() => {
      if (!exited) {
        proc.kill();
        resolve({ ok: false, detail: `initialize timeout stderr=${stderrText}` });
      }
    }, CODEX_HANDSHAKE_TIMEOUT_MS);
  }).then(({ ok, detail }) => {
    record(
      "P3 codex accepts tool_timeout_sec config",
      ok && !stderrText.includes("unrecognized config key"),
      detail,
    );
  });
}

// ── main：备份内部状态 → 三部分 → finally 恢复 → 汇总 ────────────────────────
async function main() {
  const ts = Date.now().toString(36);
  const backup = await enableAdminCapability();
  try {
    await login();
    await part1Allow(ts);
    await part2Deny(ts);
    await part3CodexConfig();
  } finally {
    await restoreCapabilities(backup);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length > 0
        ? `；FAIL 明细：\n${failed.map((f) => `- ${f.name}: ${f.detail}`).join("\n")}`
        : ""),
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`probe crashed: ${error?.stack ?? error}`);
  process.exit(1);
});
