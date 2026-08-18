import { join } from "node:path";
import { homedir } from "node:os";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { PiProviderInfo } from "@agents-remote/shared";

// 与 pi-runtime.ts 的 CreateModelRuntimeFn 同形（本地声明，避免跨模块依赖私有类型）。
type CreateModelRuntimeFn = (options: {
  authPath: string;
  modelsPath: string;
  refreshOnCreate: boolean;
  allowModelNetwork: boolean;
}) => Promise<ModelRuntime>;

const defaultCreateModelRuntime: CreateModelRuntimeFn = (options) => ModelRuntime.create(options);

/**
 * 枚举 pi SDK 内置 provider（id + 显示名），供设置弹窗 provider 选择器使用。
 * 与 pi-runtime 决策 9 同一隔离目录语义（~/.agents-remote/pi-agent），只读、不联网、
 * 不写盘（refreshOnCreate:false / allowModelNetwork:false）。SDK 升级时列表自动跟随，
 * 前端不做硬编码。
 */
export async function listPiBuiltinProviders(
  createModelRuntime: CreateModelRuntimeFn = defaultCreateModelRuntime,
): Promise<PiProviderInfo[]> {
  const agentDir = join(homedir(), ".agents-remote", "pi-agent");
  const modelRuntime = await createModelRuntime({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  return modelRuntime
    .getProviders()
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// 内置 provider 列表随 SDK 安装固定，api 进程生命周期内不变 → 模块级 memo。
// 失败必须清缓存：rejected promise 永久缓存会让一次瞬时失败钉死空列表。
let cachedProviders: Promise<PiProviderInfo[]> | undefined;

export async function getCachedPiBuiltinProviders(): Promise<PiProviderInfo[]> {
  if (!cachedProviders) {
    cachedProviders = listPiBuiltinProviders().catch((error) => {
      cachedProviders = undefined;
      throw error;
    });
  }
  return cachedProviders;
}
