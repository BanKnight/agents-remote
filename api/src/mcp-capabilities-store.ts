import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { McpCapability } from "@agents-remote/shared";
import { readProjectMcpConfig } from "./mcp-config.js";

// per-project 能力域开关的 ar-hub 内部状态（渐进式披露批）：真相源从项目
// `.agents-remote/mcp.json` 迁到 `~/.agents-remote/mcp-capabilities.json`（与
// settings.yaml / push-subscriptions.json 同目录，0o600 原子写）。存量 mcp.json 经
// 惰性导入一次性迁入（imported 标记后文件不再参与判定）。
//
// 门控模式分层读同一份状态：wiki 域运行时门控（工具恒注册、关闭态调用返回引导错误），
// 其余域仍是注册面门控（开关决定工具是否注册）。
export type ProjectCapabilityState = {
  capabilities: Partial<Record<McpCapability, boolean>>;
  /** 已从存量 .agents-remote/mcp.json 惰性导入（此后 mcp.json 不再参与判定）。 */
  imported?: boolean;
};

type CapabilitiesFile = { projects: Record<string, ProjectCapabilityState> };

const MCP_CAPABILITIES: readonly McpCapability[] = ["wiki", "ui", "skills", "gen-ui", "admin"];

const isCapability = (value: unknown): value is McpCapability =>
  typeof value === "string" && (MCP_CAPABILITIES as readonly string[]).includes(value);

const normalizeState = (value: unknown): ProjectCapabilityState => {
  const record = (value ?? {}) as Record<string, unknown>;
  const capabilities: Partial<Record<McpCapability, boolean>> = {};
  const raw = record.capabilities;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, enabled] of Object.entries(raw)) {
      if (isCapability(key) && typeof enabled === "boolean") capabilities[key] = enabled;
    }
  }
  return { capabilities, ...(record.imported === true ? { imported: true } : {}) };
};

const normalizeFile = (parsed: unknown): CapabilitiesFile => {
  const root = (parsed ?? {}) as Record<string, unknown>;
  const projects: Record<string, ProjectCapabilityState> = {};
  const raw = root.projects;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [name, state] of Object.entries(raw as Record<string, unknown>)) {
      projects[name] = normalizeState(state);
    }
  }
  return { projects };
};

export const defaultCapabilitiesPath = () =>
  join(homedir(), ".agents-remote", "mcp-capabilities.json");

export class McpCapabilitiesStore {
  private readonly path: string;
  private readonly projectsRoot: string;

  constructor(options: { path?: string; projectsRoot: string }) {
    this.path = options.path ?? defaultCapabilitiesPath();
    this.projectsRoot = options.projectsRoot;
  }

  /**
   * 某项目的能力开关。
   * - 已有记录 → 直接返回（mcp.json 不再参与）。
   * - 无记录 → 惰性导入存量 `.agents-remote/mcp.json`（不存在/非法 → 全关），落盘
   *   imported 标记后返回；此后不再读文件。
   */
  async get(projectName: string): Promise<Partial<Record<McpCapability, boolean>>> {
    const file = await this.read();
    const state = file.projects[projectName];
    if (state) return state.capabilities;
    return (await this.importFromLegacy(projectName)).capabilities;
  }

  /** 设置单域开关，返回该项目最新全量状态。 */
  async set(
    projectName: string,
    capability: McpCapability,
    enabled: boolean,
  ): Promise<Partial<Record<McpCapability, boolean>>> {
    // 先确保存量已导入：否则本次写入会把「导入前的初始状态」覆盖成只剩这一个键。
    await this.get(projectName);
    const file = await this.read();
    const state = file.projects[projectName] ?? { capabilities: {} };
    const next: ProjectCapabilityState = {
      ...state,
      capabilities: { ...state.capabilities, [capability]: enabled },
    };
    await this.persist({ ...file, projects: { ...file.projects, [projectName]: next } });
    return next.capabilities;
  }

  /** 项目删除级联：清理该项目的能力状态。 */
  async removeProject(projectName: string): Promise<void> {
    const file = await this.read();
    if (!(projectName in file.projects)) return;
    const projects = { ...file.projects };
    delete projects[projectName];
    await this.persist({ ...file, projects });
  }

  /**
   * 项目重命名级联：状态跟随项目名迁移（key = 目录名）。
   * 新名残留记录（如曾经的 detached 同名项目）被覆盖——重命名后的项目才是当前真相。
   */
  async renameProject(from: string, to: string): Promise<void> {
    if (from === to) return;
    const file = await this.read();
    const state = file.projects[from];
    if (!state) return;
    const projects = { ...file.projects };
    delete projects[from];
    projects[to] = state;
    await this.persist({ ...file, projects });
  }

  private async importFromLegacy(projectName: string): Promise<ProjectCapabilityState> {
    let capabilities: Partial<Record<McpCapability, boolean>> = {};
    try {
      const config = await readProjectMcpConfig(this.projectsRoot, projectName);
      capabilities = config?.capabilities ?? {};
    } catch {
      // mcp.json 非法/不可读：按全关导入并落盘（用户可经 capability_set 重设）——
      // 不让一次坏文件导致每次请求都重试报错。
    }
    const state: ProjectCapabilityState = { capabilities: { ...capabilities }, imported: true };
    const file = await this.read();
    await this.persist({ ...file, projects: { ...file.projects, [projectName]: state } });
    return state;
  }

  /** 文件不存在或 JSON 损坏 → 空表（损坏视为无配置，安全方向：全关）。 */
  private async read(): Promise<CapabilitiesFile> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, "utf8"));
      return normalizeFile(parsed);
    } catch {
      return { projects: {} };
    }
  }

  private async persist(file: CapabilitiesFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const tempPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.path);
  }
}
