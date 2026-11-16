import type { McpProjectConfig } from "@agents-remote/shared";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveProjectPath } from "./project-paths.js";
import { McpError, parseMcpProjectConfig } from "./mcp-validate.js";

// per-project MCP 配置相对项目根的位置(与 pages.json 同目录)。
const MCP_CONFIG_RELATIVE = ".agents-remote/mcp.json";

const isNotFoundError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

/**
 * 读 per-project `.agents-remote/mcp.json`。
 *
 * ⚠️ 能力开关真相源已迁 `~/.agents-remote/mcp-capabilities.json`
 * (mcp-capabilities-store.ts,渐进式披露批):本文件降级为「存量迁移的惰性导入源」,
 * 仅 McpCapabilitiesStore.importFromLegacy 调用;此后 mcp.json 不再参与判定。
 *
 * - 文件不存在(ENOENT) → null(导入方按「默认全关」处理)。
 * - 存在但非法 JSON/结构 → 抛 McpError(MCP_CONFIG_INVALID)(导入方捕获后按全关落盘)。
 * - project 不存在 → resolveProjectPath 抛 ProjectPathError 透传。
 */
export async function readProjectMcpConfig(
  projectsRoot: string,
  projectName: string,
): Promise<McpProjectConfig | null> {
  const project = await resolveProjectPath(projectsRoot, projectName);
  let raw: string;
  try {
    raw = await readFile(join(project.path, MCP_CONFIG_RELATIVE), "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw new McpError("MCP_CONFIG_INVALID", "Unable to read mcp.json");
  }
  return parseMcpProjectConfig(raw);
}
