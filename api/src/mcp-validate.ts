import type { ApiErrorCode, McpCapability, McpProjectConfig } from "@agents-remote/shared";

/**
 * MCP hub 相关错误码子集。
 */
export type McpErrorCode = Extract<
  ApiErrorCode,
  "MCP_HUB_START_FAILED" | "MCP_INJECT_UNSUPPORTED" | "MCP_CONFIG_INVALID"
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
 * 能力域名（McpCapability）校验：基座阶段 McpCapability = string 占位，
 * 但仍需防注入/路径穿越——只允许 `[a-zA-Z0-9._-]`，拒绝空、null byte、`..` 段。
 * wiki 阶段收敛为枚举后此校验仍适用（枚举值都匹配此 pattern）。
 */
const CAPABILITY_RE = /^[a-zA-Z0-9._-]+$/;

export function sanitizeCapability(input: unknown): McpCapability {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
    throw new McpError("MCP_CONFIG_INVALID", "Invalid MCP capability name");
  }
  const value = input.trim();
  if (!CAPABILITY_RE.test(value)) {
    throw new McpError("MCP_CONFIG_INVALID", `Invalid MCP capability name: ${value}`);
  }
  return value;
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
