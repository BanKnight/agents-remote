import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { type AppModules } from "@agents-remote/shared";
import { summarizeYamlError } from "./yaml-error";

// 业务状态柱（state.yaml）：存运行态业务数据（如 overview.pinnedSessions），与用户配置
//（settings.yaml）分离。文件缺失 → 各模块返回默认，不抛错（区别于 config.yaml 的 CONFIG_REQUIRED）。
// schemaVersion 恒 1：顶层结构 = AppModules 模块注册表本身，模块增加是可见的 shared 类型改动。
const SCHEMA_VERSION = 1;
const defaultStatePath = () => join(homedir(), ".agents-remote", "state.yaml");

export type StateStoreOptions = { path?: string };

// 磁盘顶层结构：schemaVersion + 各模块。模块可缺（首次/部分写入），归一化后才是满模块
// AppState（readModule/updateModule 返回层）。写文件也只写存在的模块。
type RawState = { schemaVersion: number } & Partial<AppModules>;

// 模块化 store：只暴露 readModule/updateModule，物理上无法往顶层塞字段（无 read/write/update
// 整文件 API）。新增顶层域 = shared AppModules 声明 + 下方 normalizeModule 加分支，两处都
// 是可见、类型检查的改动，而非在路由里悄悄塞。
export class StateStore {
  private readonly path: string;

  constructor(options: StateStoreOptions = {}) {
    this.path = options.path ?? defaultStatePath();
  }

  getPath(): string {
    return this.path;
  }

  // 模块化读：文件缺失/模块缺失 → 返回该模块默认值（normalizeModule 兜底）。
  async readModule<K extends keyof AppModules>(module: K): Promise<AppModules[K]> {
    return normalizeModule(await this.readRaw(), module);
  }

  // 模块化 read-modify-write：mutator 只拿当前模块，写回也只 merge 该模块，其余模块原样保留。
  async updateModule<K extends keyof AppModules>(
    module: K,
    mutator: (current: AppModules[K]) => AppModules[K],
  ): Promise<AppModules[K]> {
    const raw = await this.readRaw();
    const current = normalizeModule(raw, module);
    const next = mutator(current);
    await this.writeRaw({ ...raw, [module]: next });
    return next;
  }

  // 读整文件（含 schemaVersion）。文件缺失/非法 → 默认空模块表。
  private async readRaw(): Promise<RawState> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = parseYaml(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as RawState;
      }
      return { schemaVersion: SCHEMA_VERSION };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { schemaVersion: SCHEMA_VERSION };
      }
      // 与 settings-store 同源：yaml 错误 message 附带源码 snippet，统一包装成只含行列位置
      // 的摘要错误（state.yaml 当前非机密，收口防未来模块加机密时遗漏）。
      throw new Error(`Failed to parse ${this.path}: ${summarizeYamlError(error)}`, {
        cause: error,
      });
    }
  }

  private async writeRaw(state: RawState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const tempPath = `${this.path}.${process.pid}.tmp`;
    const payload = stringifyYaml({ ...state, schemaVersion: SCHEMA_VERSION });
    await writeFile(tempPath, payload, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.path);
  }
}

// 模块默认值 + 宽松规整（缺/非法 → 默认）。新增模块在此加分支。
function normalizeModule<K extends keyof AppModules>(state: RawState, module: K): AppModules[K] {
  if (module === "overview") {
    return {
      pinnedSessions: normalizePinnedSessions(state.overview?.pinnedSessions),
    } as AppModules[K];
  }
  // exhaustive：shared AppModules 新增键后，TS 会在此报类型错误，提示补 normalize 分支。
  const exhaustive: never = module;
  return exhaustive;
}

// 全局总览置顶 sessionId 列表宽松规整：非空 string 保留 + 去重，非法兜底 []。
// session 关闭/消失后残留 id 无候选匹配即不渲染（前端 candidates.filter 取交集），无需后端清理。
// 导出供 migrate-legacy-config（providers.json ui.pinnedSessions 提取）复用。
export function normalizePinnedSessions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string" || item.length === 0) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
