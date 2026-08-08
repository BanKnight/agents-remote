import type { ApiErrorCode, McpCapability, McpProjectConfig } from "@agents-remote/shared";

/**
 * MCP 相关错误码子集（hub 能力开关 + 外部 server 管理）。
 */
export type McpErrorCode = Extract<
  ApiErrorCode,
  | "MCP_HUB_START_FAILED"
  | "MCP_INJECT_UNSUPPORTED"
  | "MCP_CONFIG_INVALID"
  | "MCP_LIST_FAILED"
  | "MCP_ADD_FAILED"
  | "MCP_REMOVE_FAILED"
>;

/** MCP hub 操作统一错误类型，携带 ApiErrorCode 供 HTTP 层翻译。 */
export class McpError extends Error {
  constructor(
    readonly code: McpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "McpError";
  }
}

/**
 * 能力域名（McpCapability）校验：收敛为枚举后，只接受已知能力域（首期 "wiki"）。
 * 拒绝空、null byte、未知值——防注入/路径穿越，也防配置拼写错误静默失效。
 */
const ALLOWED_CAPABILITIES: ReadonlySet<McpCapability> = new Set(["wiki"]);

export function sanitizeCapability(input: unknown): McpCapability {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
    throw new McpError("MCP_CONFIG_INVALID", "Invalid MCP capability name");
  }
  const value = input.trim();
  if (!ALLOWED_CAPABILITIES.has(value as McpCapability)) {
    throw new McpError("MCP_CONFIG_INVALID", `Unknown MCP capability: ${value}`);
  }
  return value as McpCapability;
}

/**
 * 解析 per-project `.agents-remote/mcp.json`。文件不存在 → null（调用方按默认处理）。
 * 存在但格式非法 → MCP_CONFIG_INVALID。capabilities 缺失 → 视为空 map（全未开）。
 */
export function parseMcpProjectConfig(raw: string): McpProjectConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new McpError("MCP_CONFIG_INVALID", "mcp.json is not valid JSON");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new McpError("MCP_CONFIG_INVALID", "mcp.json must be an object");
  }

  const capabilities = (parsed as { capabilities?: unknown }).capabilities;
  if (capabilities === undefined) {
    return { capabilities: {} };
  }
  if (capabilities === null || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    throw new McpError("MCP_CONFIG_INVALID", "mcp.json capabilities must be an object");
  }

  const cleaned: Partial<Record<McpCapability, boolean>> = {};
  for (const [key, value] of Object.entries(capabilities as Record<string, unknown>)) {
    const cap = sanitizeCapability(key);
    if (typeof value !== "boolean") {
      throw new McpError("MCP_CONFIG_INVALID", `capability '${cap}' must be boolean`);
    }
    cleaned[cap] = value;
  }
  return { capabilities: cleaned };
}
