import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  CLAUDE_MODEL_TIERS,
  EFFORT_LEVELS,
  type ClaudeModelMapping,
  type ClaudeModelTier,
  type ClaudePreset,
  type ClaudePresetMasked,
  type ClaudeRuntimeConfig,
  type EffortLevel,
  type SettingsState,
  type SkillSource,
} from "@agents-remote/shared";

// settings.yaml 与 config.yaml 同目录（~/.agents-remote/），统一 YAML 格式。settings-store
// 存用户设置（runtimes.claude + skills），是可选的——首启无文件时走默认，不抛错
//（区别于 config.yaml 的 CONFIG_REQUIRED）。
//
// schemaVersion：v1 = 旧 providers.json「providers[] + runtime.{providerId,modelMapping}」；
// v2 = 现「runtimes.claude.{presets[], activePresetId, ...}」。旧 providers.json 由
// migrateLegacyUserFiles 一次性迁移到 settings.yaml（先写 settings.yaml 权威，再改名 .bak）；
// read() 保留 v1 分流作兜底（迁移崩溃中断的极端残留）。
const SCHEMA_VERSION = 2;
const defaultSettingsPath = () => join(homedir(), ".agents-remote", "settings.yaml");
const defaultSettingsDir = () => join(homedir(), ".agents-remote");

// 默认 modelMapping = tier alias 字符串本身：不改设置时行为 = 现状（CLI 接受 tier
// alias 作 --model）；CLAUDE2_MODELS env 仍作 fallback。effort=high 是 Opus 4.8
// 内置默认（见 docs/research/claude-cli-runtime-config.md）。
//
// modelMapping 不再属于 runtime（v2 下沉到每个 preset 与端点绑定）；这里仅作
// preset 默认值 + 迁移基线。runtime 只持 activePresetId + 与端点无关的 effort/1m。
const DEFAULT_MODEL_MAPPING: ClaudeModelMapping = {
  default: "sonnet",
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
};

export const DEFAULT_CLAUDE_RUNTIME: ClaudeRuntimeConfig = {
  activePresetId: "",
  enable1mContext: false,
  effort: "high",
};

export type SettingsStoreOptions = { path?: string };

export class SettingsStore {
  private readonly path: string;

  constructor(options: SettingsStoreOptions = {}) {
    this.path = options.path ?? defaultSettingsPath();
  }

  getPath(): string {
    return this.path;
  }

  // 文件不存在 → 返回默认（不抛错）；存在 → 按 schemaVersion 分流：
  // v1 → migrateV1ToV2 合成 v2（纯内存，不落盘）；v2/缺省 → normalizeSettings。
  // apiKey 永不由此处打印；read 只返回结构化 state 给调用方。
  async read(): Promise<SettingsState> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = parseYaml(raw);
      if (readSchemaVersion(parsed) === 1) return migrateV1ToV2(parsed);
      return normalizeSettings(parsed);
    } catch (error) {
      if (isNotFoundError(error)) {
        return cloneDefaultSettings();
      }
      throw error;
    }
  }

  // read-modify-write：mutator 接收当前 state 返回新 state，原子写回。
  async update(mutator: (current: SettingsState) => SettingsState): Promise<SettingsState> {
    const next = mutator(await this.read());
    await this.write(next);
    return next;
  }

  async write(state: SettingsState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const tempPath = `${this.path}.${process.pid}.tmp`;
    const payload = stringifyYaml({ schemaVersion: SCHEMA_VERSION, ...state });
    await writeFile(tempPath, payload, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.path);
  }
}

// 旧 providers.json → settings.yaml 一次性迁移（幂等）。settings.yaml 存在即跳过；
// providers.json 存在 → 按 schemaVersion 分流合成 v2 state（JSON 是 YAML 子集，统一用
// yaml 解析）→ 先写 settings.yaml（权威，崩溃重启后 settings.yaml 在即跳过）再改名
// providers.json → .bak。两者都缺 → 首启走默认，不迁移。
export async function migrateLegacyUserFiles(dir = defaultSettingsDir()): Promise<void> {
  const settingsPath = join(dir, "settings.yaml");
  const providersPath = join(dir, "providers.json");

  try {
    await stat(settingsPath);
    return;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  let raw: string;
  try {
    raw = await readFile(providersPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }

  const parsed = parseYaml(raw);
  const state = readSchemaVersion(parsed) === 1 ? migrateV1ToV2(parsed) : normalizeSettings(parsed);
  await new SettingsStore({ path: settingsPath }).write(state);
  await rename(providersPath, `${providersPath}.bak`);
}

const readSchemaVersion = (parsed: unknown): number | undefined => {
  if (!parsed || typeof parsed !== "object" || !("schemaVersion" in parsed)) return undefined;
  const v = (parsed as { schemaVersion?: unknown }).schemaVersion;
  return typeof v === "number" ? v : undefined;
};

// 纯函数：判断 model 串是否具体 ID（如 "claude-opus-4-8"）而非 tier alias（"opus"/"sonnet"/...）。
// 契约：具体 ID 含 "-"，tier alias 不含。resolveModelId / resolveSpawnModel 据此决定是否拼 [1m]
// 后缀。依赖 CLAUDE_MODEL_TIERS 全不含 "-"；若未来出现含 "-" 的 alias 或不含 "-" 的具体 ID 需重新审视。
export function isConcreteModelId(model: string): boolean {
  return model.includes("-");
}

// resolveModelId/buildAvailableModels 所需的视图：某 preset 的 modelMapping + runtime 的 1m 开关。
// v2 起 modelMapping 下沉到 preset、不再属于 runtime，故这两个纯函数入参改为结构视图，
// 由 activePresetView() 从 runtime + presets 派生（claude2-runtime/session-routes 复用）。
export type ModelMappingView = {
  modelMapping: ClaudeModelMapping;
  enable1mContext: boolean;
};

// 纯函数：tier → 最终 model ID（spawn 时传给 CLI 的 --model 值）。
// modelMapping[tier] 可以是 tier alias（"opus"，CLI 直接接受）或具体 ID
//（"claude-opus-4-8"）。enable1mContext 只对具体 ID 拼 [1m] 后缀；alias 不拼
//（CLI 不接受 alias[1m]，研究文档 L49/L53）。
export function resolveModelId(config: ModelMappingView, tier: ClaudeModelTier): string {
  const modelId = config.modelMapping[tier] || config.modelMapping.default || "sonnet";
  const isConcreteId = isConcreteModelId(modelId);
  return config.enable1mContext && isConcreteId ? `${modelId}[1m]` : modelId;
}

// 纯函数：从 modelMapping 派生会话内可选的 model 列表（ModelSelector 菜单数据源）。
// 遍历每个 tier（跳过 default）的 modelMapping 值：具体 ID 且开启 1m 时，[1m] 变体在前、
// base 紧随（当前启用 1m 时 [1m] 是常用项）；tier alias（默认配置）或未开 1m 时只列原值
//（CLI 不接受 alias[1m]，见 resolveModelId 注释）。多 tier 映射同值时去重。
// 顺序遵循 CLAUDE_MODEL_TIERS（opus/sonnet/haiku）。
export function buildAvailableModels(config: ModelMappingView): string[] {
  const models: string[] = [];
  for (const tier of CLAUDE_MODEL_TIERS) {
    if (tier === "default") continue;
    const id = config.modelMapping[tier] || config.modelMapping.default;
    if (!id) continue;
    const with1m = isConcreteModelId(id) && config.enable1mContext ? `${id}[1m]` : null;
    if (with1m && !models.includes(with1m)) models.push(with1m);
    if (!models.includes(id)) models.push(id);
  }
  return models;
}

// 纯函数：从 modelMapping 派生 model alias 列表 + alias→resolved 具体 ID 映射。
// 对齐 CLI 原生 alias [1m] 后缀机制：env 注裸 ID（ANTHROPIC_DEFAULT_*_MODEL 不带 [1m]），
// 菜单独立 alias + alias[1m] 项，切换发 alias[1m] 时 CLI 在 env 裸 ID 上拼 [1m]。
// resolved[tier] = 裸 ID（env 注入用）；resolved[tier[1m]] = ID[1m]（菜单描述展示用）。
// 顺序：每个 tier 的 [1m] 变体在前、基础 alias 紧随（常用项优先）；遵循 CLAUDE_MODEL_TIERS。
// opusplan 不在此派生（session-routes 装配点单独追加 opusplan + opusplan[1m]）。
export function buildAvailableAliases(config: ModelMappingView): {
  aliases: string[];
  resolved: Record<string, string>;
} {
  const aliases: string[] = [];
  const resolved: Record<string, string> = {};
  for (const tier of CLAUDE_MODEL_TIERS) {
    if (tier === "default") continue;
    const id = config.modelMapping[tier] || config.modelMapping.default;
    if (!id) continue;
    if (config.enable1mContext) {
      const alias1m = `${tier}[1m]`;
      aliases.push(alias1m);
      resolved[alias1m] = isConcreteModelId(id) ? `${id}[1m]` : id;
    }
    aliases.push(tier);
    resolved[tier] = id;
  }
  return { aliases, resolved };
}

// 纯函数：runtime + presets → resolveModelId/buildAvailableModels 视图。
// 激活预设命中 → {preset.modelMapping, rt.enable1mContext}；无激活预设/未命中 → undefined。
// spawn/ModelSelector 消费端三处复用，避免散落组装逻辑。
export function activePresetView(
  rt: { activePresetId: string; enable1mContext: boolean } | undefined,
  presets: ClaudePreset[] | undefined,
): ModelMappingView | undefined {
  if (!rt?.activePresetId || !presets) return undefined;
  const preset = presets.find((p) => p.id === rt.activePresetId);
  if (!preset) return undefined;
  return { modelMapping: preset.modelMapping, enable1mContext: rt.enable1mContext };
}

// 纯函数：apiKey 掩码（前 7 + 末 4，中间 ...）。保留可识别指纹供前端判断已配置/未改。
export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 11) return `${key.slice(0, 2)}...${key.slice(-2)}`;
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

export function toMaskedPreset(preset: ClaudePreset): ClaudePresetMasked {
  return {
    id: preset.id,
    label: preset.label,
    ...(preset.baseUrl === undefined ? {} : { baseUrl: preset.baseUrl }),
    modelMapping: preset.modelMapping,
    apiKeyMasked: maskApiKey(preset.apiKey),
    hasApiKey: Boolean(preset.apiKey),
  };
}

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const isEffortLevel = (value: unknown): value is EffortLevel =>
  typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value);

// modelMapping 兜底：各 tier 缺/空 → DEFAULT_MODEL_MAPPING。migrate 与 normalize 共用。
// 入参放宽为 unknown 值的 tier 记录：v1 providers.json 与 v2 settings.json 都从此处解析，
// 原始值来自 JSON（unknown），由 nonEmptyString 收窄为 string。
const normalizeModelMapping = (
  parsed: Partial<Record<ClaudeModelTier, unknown>> | undefined,
): ClaudeModelMapping => ({
  default: nonEmptyString(parsed?.default) ?? DEFAULT_MODEL_MAPPING.default,
  opus: nonEmptyString(parsed?.opus) ?? DEFAULT_MODEL_MAPPING.opus,
  sonnet: nonEmptyString(parsed?.sonnet) ?? DEFAULT_MODEL_MAPPING.sonnet,
  haiku: nonEmptyString(parsed?.haiku) ?? DEFAULT_MODEL_MAPPING.haiku,
});

// v1 结构（仅供 migrateV1ToV2 解析旧 providers.json；shared 已不再导出 ProviderConfig）。
type V1Provider = {
  id: string;
  label: string;
  apiKey: string;
  baseUrl?: string;
  protocol?: string;
};
type V1ClaudeRuntime = {
  providerId?: unknown;
  modelMapping?: Partial<Record<ClaudeModelTier, unknown>>;
  enable1mContext?: unknown;
  effort?: unknown;
};
type V1Settings = {
  providers?: unknown;
  runtimes?: { claude?: V1ClaudeRuntime };
};

// v1 → v2 迁移（纯内存合成，不落盘）。每个旧 provider → 一个 preset（继承 id/label/apiKey/baseUrl），
// 所有 preset 继承旧 runtime 全局 modelMapping；activePresetId = 旧 runtime.providerId（若指向
// 不存在的 provider 则回退 ""，等价 v1 删除级联语义）。effort/enable1mContext 直接搬。
//
// 正确性保证：旧 runtime.providerId 必指向 anthropic provider（v1 applyClaudeRuntimePatch protocol
// 守卫保证），迁移后 activePresetId 指向的预设端点必为 anthropic，spawn 行为不变。protocol 字段
// 丢弃（claude 预设恒 anthropic）；旧 openai-compatible provider 仍合成 preset 保凭证不丢，但
// activePresetId 不会指向它（旧守卫只允许 anthropic 激活）。
// 导出供 settings-store.test.ts 密集单测覆盖（v1 被 v2 覆盖后不可逆，是最高风险防线）。
export function migrateV1ToV2(parsed: unknown): SettingsState {
  const root = (parsed && typeof parsed === "object" ? parsed : {}) as V1Settings;
  const rawProviders = Array.isArray(root.providers) ? root.providers : [];
  const oldRuntime = root.runtimes?.claude ?? {};
  const baseMapping = normalizeModelMapping(oldRuntime.modelMapping);
  const presets: ClaudePreset[] = rawProviders
    .filter(
      (p): p is V1Provider =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as V1Provider).id === "string" &&
        typeof (p as V1Provider).label === "string" &&
        typeof (p as V1Provider).apiKey === "string",
    )
    .map((p) => {
      const preset: ClaudePreset = {
        id: p.id,
        label: p.label,
        apiKey: p.apiKey,
        modelMapping: { ...baseMapping },
      };
      if (typeof p.baseUrl === "string") preset.baseUrl = p.baseUrl;
      return preset;
    });
  const oldProviderId = typeof oldRuntime.providerId === "string" ? oldRuntime.providerId : "";
  const activePresetId = presets.some((p) => p.id === oldProviderId) ? oldProviderId : "";
  return {
    runtimes: {
      claude: {
        presets,
        activePresetId,
        enable1mContext:
          typeof oldRuntime.enable1mContext === "boolean" ? oldRuntime.enable1mContext : false,
        effort: isEffortLevel(oldRuntime.effort) ? oldRuntime.effort : "high",
      },
    },
    skills: { sources: [] },
    ui: { pinnedSessions: [] },
  };
}

// normalize（v2）：宽松补缺字段，旧/部分文件不抛错。schemaVersion 由 read() 分流处理，
// 此处只负责把已是 v2 结构（或缺省）的 parsed 补全为合法 SettingsState。
function normalizeSettings(parsed: unknown): SettingsState {
  if (!parsed || typeof parsed !== "object") {
    return cloneDefaultSettings();
  }

  const root = parsed as Partial<SettingsState>;
  const claude = root.runtimes?.claude;
  const presets: ClaudePreset[] =
    claude && Array.isArray(claude.presets)
      ? claude.presets.filter(isClaudePreset).map(normalizeClaudePreset)
      : [];

  return {
    runtimes: {
      claude: {
        presets,
        activePresetId: typeof claude?.activePresetId === "string" ? claude.activePresetId : "",
        enable1mContext:
          typeof claude?.enable1mContext === "boolean"
            ? claude.enable1mContext
            : DEFAULT_CLAUDE_RUNTIME.enable1mContext,
        effort: isEffortLevel(claude?.effort) ? claude.effort : DEFAULT_CLAUDE_RUNTIME.effort,
      },
    },
    skills: { sources: normalizeSkillSources(root.skills?.sources) },
    ui: { pinnedSessions: normalizePinnedSessions(root.ui?.pinnedSessions) },
  };
}

const isClaudePreset = (value: unknown): value is ClaudePreset =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ClaudePreset).id === "string" &&
  typeof (value as ClaudePreset).label === "string" &&
  typeof (value as ClaudePreset).apiKey === "string";

const normalizeClaudePreset = (parsed: ClaudePreset): ClaudePreset => {
  const preset: ClaudePreset = {
    id: parsed.id,
    label: parsed.label,
    apiKey: parsed.apiKey,
    modelMapping: normalizeModelMapping(parsed.modelMapping),
  };
  if (typeof parsed.baseUrl === "string") {
    preset.baseUrl = parsed.baseUrl;
  }
  return preset;
};

function cloneDefaultSettings(): SettingsState {
  return {
    runtimes: {
      claude: {
        presets: [],
        activePresetId: DEFAULT_CLAUDE_RUNTIME.activePresetId,
        enable1mContext: DEFAULT_CLAUDE_RUNTIME.enable1mContext,
        effort: DEFAULT_CLAUDE_RUNTIME.effort,
      },
    },
    skills: { sources: [] },
    ui: { pinnedSessions: [] },
  };
}

// skill 源列表宽松规整：非法项丢弃（id/repo 必须为 string），branch/label 可选非空才保留。
function normalizeSkillSources(input: unknown): SkillSource[] {
  if (!Array.isArray(input)) return [];
  const out: SkillSource[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== "string" || typeof s.repo !== "string") continue;
    const source: SkillSource = { id: s.id, repo: s.repo };
    if (typeof s.branch === "string" && s.branch) source.branch = s.branch;
    if (typeof s.label === "string" && s.label) source.label = s.label;
    out.push(source);
  }
  return out;
}

// 全局总览置顶 sessionId 列表宽松规整：非空 string 保留 + 去重，非法兜底 []。
// session 关闭/消失后残留 id 无候选匹配即不渲染（前端 candidates.filter 取交集），无需后端清理。
function normalizePinnedSessions(input: unknown): string[] {
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
