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
 * - 文件不存在(ENOENT) → null(调用方按「默认全关」处理:不注册任何能力域工具)。
 * - 存在但非法 JSON/结构 → 抛 McpError(MCP_CONFIG_INVALID)。
 * - project 不存在 → resolveProjectPath 抛 ProjectPathError 透传(hub handler 第 3 步
 *   已校验 project 存在,正常路径不会到这里)。
 *
 * hub handler 每请求调一次,拿 capabilities 决定注册哪些能力域工具。调用方应对抛出
 * 降级为空 capabilities(不因 config 问题阻塞 agent 连接)。
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
