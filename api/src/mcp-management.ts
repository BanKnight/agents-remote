import {
  type AddMcpServerRequest,
  type AddMcpServerResponse,
  type ListMcpServersResponse,
  type McpScope,
  type McpServerEntry,
  type McpServerType,
  type RemoveMcpServerResponse,
  type UpdateMcpServerRequest,
  type UpdateMcpServerResponse,
} from "@agents-remote/shared";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { runCliTool, type CliToolResult } from "./cli-process.js";
import { resolveProjectPath, ProjectPathError } from "./project-paths.js";
import { jsonError } from "./http-auth.js";
import { McpError, type McpErrorCode } from "./mcp-validate.js";

/**
 * 外部 MCP server 管理（wrap `claude mcp` + 自读结构化存储），与 skill-market 同构。
 *
 * 读：直读 `~/.claude.json`（user scope）/ 项目根 `.mcp.json`（project scope）的 `mcpServers`——
 * 不解析 `claude mcp list` 文本（无 json、4s+ health-check，见蓝图实测）。
 * 写：wrap `claude mcp add/remove -s <scope>`（argv 数组、非 TTY，只信 exit code + 事后回读文件）。
 *
 * 两套配置勿混：本文件管「外部第三方 server」（CLI 原生读写、agent 实例原生合并生效）；
 * `.agents-remote/mcp.json`（mcp-config.ts）是内部 ar-hub 能力开关，本文件不碰。
 */

const CLAUDE_BIN = "claude";
const USER_CONFIG_FILE = ".claude.json";
const PROJECT_MCP_FILE = ".mcp.json";
/** `claude mcp` 非交互 spawn 一次的兜底超时（add/remove 不应长时间挂起）。 */
const MCP_CLI_TIMEOUT_MS = 30_000;

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const isNotFoundError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const MCP_NAME_RE = /^[a-zA-Z0-9._-]+$/;

/** MCP server 名称校验：只许安全字符集，拒空/空字节/特殊字符（防 argv 注入与配置污染）。 */
export function sanitizeMcpName(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.includes("\0") ||
    !MCP_NAME_RE.test(input)
  ) {
    throw new McpError("MCP_CONFIG_INVALID", `Invalid MCP server name: ${input}`);
  }
  return input;
}

function trimResult(r: CliToolResult): string {
  return (r.stderr.trim() || r.stdout.trim() || `exit code ${r.exitCode}`).slice(0, 500);
}

// ── 读：直读结构化存储 ──

/**
 * 把 `~/.claude.json` / `.mcp.json` 的 `mcpServers` 对象归一为 `McpServerEntry[]`（纯函数，
 * 直接单测）。容忍：`type` 缺失（按 command/url 推断）、env/headers 非字符串值 stringify、
 * 缺关键字段的条目跳过。未知 type 且无 command/url → 跳过（不静默当 stdio）。
 */
export function parseMcpServers(raw: unknown): McpServerEntry[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: McpServerEntry[] = [];
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const e = value as Record<string, unknown>;
    let type: McpServerType | undefined;
    if (e.type === "stdio" || e.type === "sse" || e.type === "http") type = e.type;
    // type 缺失（legacy/手写）：有 command → stdio，否则有 url → http。
    if (!type)
      type =
        typeof e.command === "string" ? "stdio" : typeof e.url === "string" ? "http" : undefined;
    if (!type) continue;
    const entry: McpServerEntry = { name, type };
    if (typeof e.command === "string") entry.command = e.command;
    if (Array.isArray(e.args))
      entry.args = e.args.filter((a): a is string => typeof a === "string");
    const env = stringifyRecord(e.env);
    if (env) entry.env = env;
    if (typeof e.url === "string") entry.url = e.url;
    const headers = stringifyRecord(e.headers);
    if (headers) entry.headers = headers;
    out.push(entry);
  }
  return out;
}

function stringifyRecord(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (v !== undefined && v !== null) out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

/** 读单个配置文件的 `mcpServers`。文件不存在（ENOENT）→ 空（user 未配 / 项目无 .mcp.json）。 */
async function readMcpServersFile(filePath: string): Promise<McpServerEntry[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw new McpError("MCP_LIST_FAILED", `Unable to read ${filePath}: ${errMsg(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new McpError("MCP_CONFIG_INVALID", `${filePath} is not valid JSON: ${errMsg(error)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  return parseMcpServers((parsed as { mcpServers?: unknown }).mcpServers);
}

export async function listUserMcpServers(): Promise<ListMcpServersResponse> {
  return { servers: await readMcpServersFile(join(homedir(), USER_CONFIG_FILE)) };
}

export async function listProjectMcpServers(
  projectsRoot: string,
  projectName: string,
): Promise<ListMcpServersResponse> {
  const project = await resolveProjectPath(projectsRoot, projectName);
  return { servers: await readMcpServersFile(join(project.path, PROJECT_MCP_FILE)) };
}

// ── 写：wrap `claude mcp add/remove` ──

/**
 * stdio argv 形如 `[name, "-s", scope, ...("-e K=V"), "--", command, ...args]`：
 * name 必须在 variadic `-e` 之前、`--` 终止 option 解析后再接 command，否则 `-e` 会贪婪吞掉
 * name（commander 的 `<env...>` 变长参数）。http/sse 无此坑（无 variadic）。
 */
function buildAddArgs(name: string, req: AddMcpServerRequest, scope: McpScope): string[] {
  if (req.type === "stdio") {
    if (typeof req.command !== "string" || req.command.length === 0) {
      throw new McpError("MCP_ADD_FAILED", "stdio MCP server requires a command");
    }
    const args: string[] = [name, "-s", scope];
    if (req.env) {
      for (const [k, v] of Object.entries(req.env)) {
        if (k.length === 0) continue;
        args.push("-e", `${k}=${v}`);
      }
    }
    args.push("--", req.command, ...(req.args ?? []));
    return args;
  }
  if (typeof req.url !== "string" || req.url.length === 0) {
    throw new McpError("MCP_ADD_FAILED", `${req.type} MCP server requires a url`);
  }
  return ["--transport", req.type, "-s", scope, name, req.url];
}

function entryFromRequest(name: string, req: AddMcpServerRequest): McpServerEntry {
  const entry: McpServerEntry = { name, type: req.type };
  if (typeof req.command === "string") entry.command = req.command;
  if (req.args && req.args.length) entry.args = req.args;
  if (req.env && Object.keys(req.env).length) entry.env = req.env;
  if (typeof req.url === "string") entry.url = req.url;
  return entry;
}

async function resolveProjectCwd(
  scope: McpScope,
  context: { projectsRoot?: string; projectName?: string },
): Promise<string | undefined> {
  if (scope !== "project") return undefined;
  if (!context.projectsRoot || !context.projectName) {
    throw new McpError("MCP_CONFIG_INVALID", "Project scope requires a project");
  }
  // project scope add/remove 由 CLI 写 cwd/.mcp.json，故必须 cwd=projectRoot。
  const project = await resolveProjectPath(context.projectsRoot, context.projectName);
  return project.path;
}

export async function addMcpServer(
  req: AddMcpServerRequest,
  scope: McpScope,
  context: { projectsRoot?: string; projectName?: string },
): Promise<AddMcpServerResponse> {
  const name = sanitizeMcpName(req.name);
  const cwd = await resolveProjectCwd(scope, context);
  const tail = buildAddArgs(name, req, scope);
  const result = await runCliTool([CLAUDE_BIN, "mcp", "add", ...tail], {
    cwd,
    timeoutMs: MCP_CLI_TIMEOUT_MS,
    makeError: (m) => new McpError("MCP_ADD_FAILED", m),
  });
  if (result.exitCode !== 0) {
    throw new McpError("MCP_ADD_FAILED", `claude mcp add failed: ${trimResult(result)}`);
  }
  return { ok: true, server: entryFromRequest(name, req) };
}

export async function removeMcpServer(
  rawName: string,
  scope: McpScope,
  context: { projectsRoot?: string; projectName?: string },
): Promise<RemoveMcpServerResponse> {
  const name = sanitizeMcpName(rawName);
  const cwd = await resolveProjectCwd(scope, context);
  const result = await runCliTool([CLAUDE_BIN, "mcp", "remove", name, "-s", scope], {
    cwd,
    timeoutMs: MCP_CLI_TIMEOUT_MS,
    makeError: (m) => new McpError("MCP_REMOVE_FAILED", m),
  });
  if (result.exitCode !== 0) {
    throw new McpError("MCP_REMOVE_FAILED", `claude mcp remove failed: ${trimResult(result)}`);
  }
  return { ok: true, name };
}

/**
 * 读当前 scope 的 server 列表（回滚查旧配置用）。user scope 直读 ~/.claude.json；
 * project scope 直读 cwd（已 resolve）下的 .mcp.json。复用 readMcpServersFile。
 */
async function readScopeServers(
  scope: McpScope,
  cwd: string | undefined,
): Promise<McpServerEntry[]> {
  const filePath =
    scope === "user" ? join(homedir(), USER_CONFIG_FILE) : join(cwd ?? "", PROJECT_MCP_FILE);
  return readMcpServersFile(filePath);
}

/** McpServerEntry → AddMcpServerRequest（回滚 add 复用 buildAddArgs，字段透传）。 */
function entryToAddRequest(entry: McpServerEntry): AddMcpServerRequest {
  const req: AddMcpServerRequest = { name: entry.name, type: entry.type };
  if (entry.command) req.command = entry.command;
  if (entry.args) req.args = entry.args;
  if (entry.env) req.env = entry.env;
  if (entry.url) req.url = entry.url;
  return req;
}

/**
 * 改 MCP server 配置（name 不变，换 type/command/args/env/url）。`claude mcp` 无 update 子命令，
 * 实现 = remove(name) + add(name, 新配置)。原子性：add 失败时回滚（把旧配置 add 回去），best-effort
 * ——回滚失败不掩盖原 add 错误（抛 MCP_UPDATE_FAILED 带 add 阶段信息，前端 invalidate list 后反映
 * 真实状态：server 已被 remove 删除）。remove 阶段失败直接抛（未动 add，配置未变）。
 */
export async function updateMcpServer(
  req: UpdateMcpServerRequest,
  scope: McpScope,
  context: { projectsRoot?: string; projectName?: string },
): Promise<UpdateMcpServerResponse> {
  const name = sanitizeMcpName(req.name);
  const cwd = await resolveProjectCwd(scope, context);
  // 1. 先读旧配置（回滚用）——在 remove 之前读，remove 后文件已无此条目。
  const oldList = await readScopeServers(scope, cwd);
  const oldEntry = oldList.find((s) => s.name === name);
  // 2. remove 阶段。
  const rmResult = await runCliTool([CLAUDE_BIN, "mcp", "remove", name, "-s", scope], {
    cwd,
    timeoutMs: MCP_CLI_TIMEOUT_MS,
    makeError: (m) => new McpError("MCP_UPDATE_FAILED", m),
  });
  if (rmResult.exitCode !== 0) {
    throw new McpError("MCP_UPDATE_FAILED", `remove phase: ${trimResult(rmResult)}`);
  }
  // 3. add 阶段（同名新配置）。
  const addResult = await runCliTool(
    [CLAUDE_BIN, "mcp", "add", ...buildAddArgs(name, req, scope)],
    {
      cwd,
      timeoutMs: MCP_CLI_TIMEOUT_MS,
      makeError: (m) => new McpError("MCP_UPDATE_FAILED", m),
    },
  );
  if (addResult.exitCode !== 0) {
    // 回滚：把旧配置加回去（best-effort）。回滚失败不掩盖 add 错误——原 MCP_UPDATE_FAILED 仍抛出。
    if (oldEntry) {
      try {
        await runCliTool(
          [CLAUDE_BIN, "mcp", "add", ...buildAddArgs(name, entryToAddRequest(oldEntry), scope)],
          {
            cwd,
            timeoutMs: MCP_CLI_TIMEOUT_MS,
            makeError: (m) => new McpError("MCP_UPDATE_FAILED", m),
          },
        );
      } catch {
        /* 回滚失败：server 已被 remove 删除且未能恢复，不掩盖 add 阶段错误 */
      }
    }
    throw new McpError("MCP_UPDATE_FAILED", `add phase: ${trimResult(addResult)}`);
  }
  return { ok: true, server: entryFromRequest(name, req) };
}

// ── 路由：/api/mcp/*（user scope）+ /api/projects/{name}/mcp/*（project scope） ──

export type McpManagementDeps = {
  /** project scope 解析与 add/remove cwd 需要；缺失则 project scope 路由不处理（交 404）。 */
  projectsRoot?: string;
};

function matchProjectMcpPath(
  pathname: string,
): { projectName: string; action: "list" | "add" | "remove" | "update" } | undefined {
  const prefix = "/api/projects/";
  if (!pathname.startsWith(prefix)) return undefined;
  const rest = pathname.slice(prefix.length);
  const infix = "/mcp";
  const idx = rest.indexOf(infix);
  if (idx === -1) return undefined;
  const encodedName = rest.slice(0, idx);
  // encodedName 是单个 path 段（无 `/`）——与 index.ts decodeProjectName/matchProjectWikiPath 同口径。
  if (encodedName.length === 0 || encodedName.includes("/")) return undefined;
  let projectName: string;
  try {
    projectName = decodeURIComponent(encodedName);
  } catch {
    return undefined;
  }
  const tail = rest.slice(idx + infix.length);
  if (tail === "") return { projectName, action: "list" };
  if (tail === "/add") return { projectName, action: "add" };
  if (tail === "/remove") return { projectName, action: "remove" };
  if (tail === "/update") return { projectName, action: "update" };
  return undefined;
}

function mcpErrorStatus(code: McpErrorCode): number {
  switch (code) {
    case "MCP_CONFIG_INVALID":
      return 400;
    default:
      return 500;
  }
}

function projectPathErrorStatus(error: ProjectPathError): number {
  return error.code === "PROJECT_NOT_FOUND" ? 404 : 400;
}

async function runMcpHandler<T>(fn: () => Promise<T>, okStatus = 200): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data, { status: okStatus });
  } catch (error) {
    if (error instanceof McpError) {
      return jsonError(error.code, error.message, mcpErrorStatus(error.code));
    }
    if (error instanceof ProjectPathError) {
      return jsonError(error.code, error.message, projectPathErrorStatus(error));
    }
    throw error;
  }
}

const readJson = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
};

export async function handleMcpRoutes(
  request: Request,
  url: URL,
  deps: McpManagementDeps,
): Promise<Response | undefined> {
  const isGet = request.method === "GET";
  const isPost = request.method === "POST";

  // ── user scope ──
  if (url.pathname === "/api/mcp") {
    if (isGet) return runMcpHandler(() => listUserMcpServers());
  }
  if (url.pathname === "/api/mcp/add" && isPost) {
    const body = await readJson<AddMcpServerRequest>(request);
    return runMcpHandler(() => addMcpServer(body, "user", {}), 201);
  }
  if (url.pathname === "/api/mcp/remove" && isPost) {
    const body = await readJson<{ name: string }>(request);
    return runMcpHandler(() => removeMcpServer(body.name, "user", {}));
  }
  if (url.pathname === "/api/mcp/update" && isPost) {
    const body = await readJson<UpdateMcpServerRequest>(request);
    return runMcpHandler(() => updateMcpServer(body, "user", {}));
  }

  // ── project scope ──
  const match = matchProjectMcpPath(url.pathname);
  if (match) {
    if (!deps.projectsRoot) return undefined;
    const projectsRoot = deps.projectsRoot;
    if (match.action === "list" && isGet) {
      return runMcpHandler(() => listProjectMcpServers(projectsRoot, match.projectName));
    }
    if (match.action === "add" && isPost) {
      const body = await readJson<AddMcpServerRequest>(request);
      return runMcpHandler(
        () => addMcpServer(body, "project", { projectsRoot, projectName: match.projectName }),
        201,
      );
    }
    if (match.action === "remove" && isPost) {
      const body = await readJson<{ name: string }>(request);
      return runMcpHandler(() =>
        removeMcpServer(body.name, "project", { projectsRoot, projectName: match.projectName }),
      );
    }
    if (match.action === "update" && isPost) {
      const body = await readJson<UpdateMcpServerRequest>(request);
      return runMcpHandler(() =>
        updateMcpServer(body, "project", { projectsRoot, projectName: match.projectName }),
      );
    }
  }

  return undefined;
}
