import type { AgentProvider } from "@agents-remote/shared";
import type { AgentProviderProfile } from "./agent-provider-profiles.js";

/**
 * MCP 注入器 —— per-runtime 适配器,把 hub 连接信息翻译成 agent CLI spawn 的 argv/env。
 *
 * 注入能力是 runtime 级维度(各 runtime 的 spawn 方式 / MCP 配置支持不同),
 * 与能力开关(project 级,per-project mcp.json)是正交两维度。
 *
 * 基座阶段只有 ClaudeMcpInjector(直拉 spawn,argv 可扩展,支持 --mcp-config HTTP)。
 * Codex 当前走 tmux 非直拉,无 argv 注入抽象 → canInject false,等 Codex 直拉 runtime
 * 落地后加 CodexMcpInjector(TOML -c mcp_servers.<name>... 形式)。
 *
 * 不加 --strict-mcp-config:避免干扰 agent 已有的 user/project/enterprise MCP 配置
 * (用户可能已有个人 MCP server,strict 会强制忽略;enterprise 场景还会拒跑)。
 * hub 与 agent 现有 MCP 配置并存,工具列表是合集。strict 留待后续按需再开。
 */

/** 注入器构造的 spawn 输入(args 追加进 argv,env 合并进 spawn env)。 */
export type McpSpawnConfig = {
  args: string[];
  env?: Record<string, string>;
};

/** 注入器构造参数。 */
export type BuildMcpConfigOptions = {
  /** project 名(一级目录名,用于 hub URL 路径段)。 */
  project: string;
  /** hub server 端口(绑 127.0.0.1)。 */
  mcpPort: number;
};

export interface McpInjector {
  /** 该 runtime 是否支持 MCP 注入(不支持则 spawn 不带 --mcp-config,agent 仍能跑)。 */
  canInject(profile: AgentProviderProfile): boolean;
  /** 构造 spawn 输入;返回 null 表示不注入(等价于 canInject false 时的显式 null)。 */
  buildMcpConfig(options: BuildMcpConfigOptions): McpSpawnConfig | null;
}

/** Claude Code `--mcp-config` 接受的内联 JSON 形状(协议格式要求 mcpServers 复数,我们只填一个 ar-hub)。 */
type ClaudeMcpConfigJson = {
  mcpServers: {
    "ar-hub": {
      type: "http";
      url: string;
      headers?: Record<string, string>;
    };
  };
};

/** Claude(Claude Code CLI)注入器:--mcp-config inline JSON,type:"http"。 */
export class ClaudeMcpInjector implements McpInjector {
  canInject(profile: AgentProviderProfile): boolean {
    return profile.provider === "claude";
  }

  buildMcpConfig({ project, mcpPort }: BuildMcpConfigOptions): McpSpawnConfig | null {
    const config: ClaudeMcpConfigJson = {
      mcpServers: {
        "ar-hub": {
          type: "http",
          url: `http://127.0.0.1:${mcpPort}/mcp/${encodeURIComponent(project)}`,
        },
      },
    };
    return {
      // inline JSON 字符串(Claude Code 接受 --mcp-config '<json>' 或文件路径;inline 免临时文件)。
      args: ["--mcp-config", JSON.stringify(config)],
    };
  }
}

const injectors: Partial<Record<AgentProvider, McpInjector>> = {
  claude: new ClaudeMcpInjector(),
};

/** 按 provider 取注入器;无适配器返回 null(runtime 不支持 MCP 注入,spawn 不带 --mcp-config)。 */
export const buildMcpInjectorForProvider = (profile: AgentProviderProfile): McpInjector | null => {
  return injectors[profile.provider] ?? null;
};
