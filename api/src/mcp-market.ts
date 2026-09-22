import { type McpMarketSearchResponse } from "@agents-remote/shared";
import { jsonError } from "./http-auth.js";
import { sanitizeMcpName } from "./mcp-management.js";
import { McpError } from "./mcp-validate.js";

/**
 * MCP 官方市场（registry.modelcontextprotocol.io）发现层 —— 与 skill-market 同构：
 * server 代理避 CORS、无缓存每请求现 fetch、规整为 shared McpMarketEntry。
 * registry 只发元数据不分发：安装 = shared mcpMarketEntryToInstallRequest 翻译后
 * 走既有 /api/mcp/add（mcp-management.ts wrap `claude mcp add`）。
 */

const MCP_REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0/servers";
/** 与 skills.sh 搜索同口径：最少 2 字符、单页 20 条。 */
const SEARCH_MIN_QUERY = 2;
const SEARCH_LIMIT = 20;

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** registry server 条目原始形状（仅取我们消费的字段；schema = server.schema.json 2025-12-11）。 */
type RegistryServer = {
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  repository?: { source?: string } | null;
  packages?: {
    registryType?: string;
    identifier?: string;
    version?: string;
    environmentVariables?: { name?: string; required?: boolean; isSecret?: boolean }[];
  }[];
  remotes?: {
    type?: string;
    url?: string;
    headers?: { name?: string; isRequired?: boolean; isSecret?: boolean }[];
  }[];
};

/**
 * registry 响应 → McpMarketEntry 列表。翻译规则（与 shared mcpMarketEntryToInstallRequest
 * 的 JSDoc 同一份裁定）：name 取 reverse-domain 末段且须过 sanitizeMcpName 口径（不过整条
 * 跳过）；remotes[0] 优先（streamable-http→http）；package 只保留首个 npm 包；
 * requiredEnv/requiredHeaders 只收必填项（安装时需用户填写）。
 */
export function normalizeMcpMarketEntries(raw: unknown): McpMarketEntryShape[] {
  if (!Array.isArray(raw)) return [];
  const entries: McpMarketEntryShape[] = [];
  for (const item of raw) {
    const server = (item as { server?: RegistryServer } | null)?.server;
    if (!server || typeof server.name !== "string") continue;
    let name: string;
    try {
      name = sanitizeMcpName(server.name.split("/").pop() ?? "");
    } catch {
      continue; // 安装名不合法（claude mcp add 拒绝），整条不进列表
    }

    const remotes = Array.isArray(server.remotes) ? server.remotes : [];
    const remoteRaw = remotes[0];
    const remote =
      remoteRaw &&
      (remoteRaw.type === "streamable-http" || remoteRaw.type === "sse") &&
      typeof remoteRaw.url === "string" &&
      remoteRaw.url.length > 0
        ? {
            transport: remoteRaw.type === "streamable-http" ? ("http" as const) : ("sse" as const),
            url: remoteRaw.url,
            requiredHeaders: (remoteRaw.headers ?? [])
              .filter(
                (h) => h?.isRequired === true && typeof h.name === "string" && h.name.length > 0,
              )
              .map((h) => ({
                name: h.name as string,
                ...(h.isSecret ? { isSecret: true } : {}),
              })),
          }
        : null;

    const packages = Array.isArray(server.packages) ? server.packages : [];
    const pkgRaw = packages.find((p) => p?.registryType === "npm");
    const pkgIdentifier = pkgRaw?.identifier;
    const pkg =
      pkgRaw && typeof pkgIdentifier === "string" && pkgIdentifier.length > 0
        ? {
            registryType: "npm",
            identifier: pkgIdentifier,
            ...(typeof pkgRaw.version === "string" && pkgRaw.version.length > 0
              ? { version: pkgRaw.version }
              : {}),
            requiredEnv: (pkgRaw.environmentVariables ?? [])
              .filter(
                (v) => v?.required === true && typeof v.name === "string" && v.name.length > 0,
              )
              .map((v) => ({
                name: v.name as string,
                ...(v.isSecret ? { isSecret: true } : {}),
              })),
          }
        : null;

    entries.push({
      registryName: server.name,
      name,
      ...(typeof server.title === "string" && server.title.length > 0
        ? { title: server.title }
        : {}),
      ...(typeof server.description === "string" && server.description.length > 0
        ? { description: server.description }
        : {}),
      ...(typeof server.version === "string" && server.version.length > 0
        ? { version: server.version }
        : {}),
      ...(typeof server.repository?.source === "string" && server.repository.source.length > 0
        ? { repositorySource: server.repository.source }
        : {}),
      remote,
      package: pkg,
    });
  }
  return entries;
}

/** normalize 层返回形状 = shared McpMarketEntry（结构化展开展开符无法直接标注，别名引用）。 */
type McpMarketEntryShape = McpMarketSearchResponse["servers"][number];

export async function searchMcpMarket(query: string): Promise<McpMarketSearchResponse> {
  const q = (query ?? "").trim();
  if (q.length < SEARCH_MIN_QUERY) {
    return { query: q, servers: [], count: 0 };
  }
  // version=latest：每 server 只回最新版本条目（非历史版本列表）。
  const url = `${MCP_REGISTRY_URL}?search=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}&version=latest`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (error) {
    throw new McpError("MCP_MARKET_FETCH_FAILED", `Failed to reach MCP registry: ${errMsg(error)}`);
  }
  if (!res.ok) {
    throw new McpError("MCP_MARKET_FETCH_FAILED", `MCP registry search returned ${res.status}`);
  }
  let parsed: { servers?: unknown };
  try {
    parsed = (await res.json()) as { servers?: unknown };
  } catch (error) {
    throw new McpError(
      "MCP_MARKET_FETCH_FAILED",
      `Invalid JSON from MCP registry: ${errMsg(error)}`,
    );
  }
  const servers = normalizeMcpMarketEntries(parsed.servers);
  return { query: q, servers, count: servers.length };
}

/**
 * GET /api/mcp/search?q=（唯一路由，零 deps；/api/mcp 精确匹配是 list，无碰撞）。
 * registry 不可达/坏响应 → MCP_MARKET_FETCH_FAILED / 502（上游失败语义）。
 */
export async function handleMcpMarketRoutes(
  request: Request,
  url: URL,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/mcp/search" || request.method !== "GET") return undefined;
  try {
    return Response.json(await searchMcpMarket(url.searchParams.get("q") ?? ""));
  } catch (error) {
    if (error instanceof McpError) {
      return jsonError(error.code, error.message, 502);
    }
    throw error;
  }
}
