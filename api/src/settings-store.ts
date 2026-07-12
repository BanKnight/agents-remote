import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import {
  EFFORT_LEVELS,
  type ClaudeModelTier,
  type ClaudeRuntimeConfig,
  type EffortLevel,
  type ProviderConfig,
  type ProviderConfigMasked,
  type SettingsState,
} from "@agents-remote/shared";

// providers.json 与 config.toml 同目录（~/.agents-remote/），但用 JSON 而非 TOML：
// 现有 settings.ts 的 TOML 解析器只支持扁平 key=string|number，无法表达
// providers[] + modelMapping{} 这类嵌套结构。providers.json 是可选增强——
// 首启无文件时走默认，不抛 CONFIG_REQUIRED（区别于 config.toml）。
const SCHEMA_VERSION = 1;
const defaultProvidersPath = () => join(homedir(), ".agents-remote", "providers.json");

// 默认 modelMapping = tier alias 字符串本身：不改设置时行为 = 现状（CLI 接受 tier
// alias 作 --model）；CLAUDE2_MODELS env 仍作 fallback。effort=high 是 Opus 4.8
// 内置默认（见 docs/research/claude-cli-runtime-config.md）。
export const DEFAULT_CLAUDE_RUNTIME: ClaudeRuntimeConfig = {
  providerId: "",
  modelMapping: { default: "sonnet", opus: "opus", sonnet: "sonnet", haiku: "haiku" },
  enable1mContext: false,
  effort: "high",
};

export type SettingsStoreOptions = { path?: string };

export class SettingsStore {
  private readonly path: string;

  constructor(options: SettingsStoreOptions = {}) {
    this.path = options.path ?? defaultProvidersPath();
  }

  getPath(): string {
    return this.path;
  }

  // 文件不存在 → 返回默认（不抛错）；存在 → 解析 + normalize 缺字段。
  // apiKey 永不由此处打印；read 只返回结构化 state 给调用方。
  async read(): Promise<SettingsState> {
    try {
      const raw = await readFile(this.path, "utf8");
      return normalizeSettings(JSON.parse(raw));
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
    const payload = `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...state }, null, 2)}\n`;
    await writeFile(tempPath, payload, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.path);
  }
}

// 纯函数：tier → 最终 model ID（spawn 时传给 CLI 的 --model 值）。
// modelMapping[tier] 可以是 tier alias（"opus"，CLI 直接接受）或具体 ID
//（"claude-opus-4-8"）。enable1mContext 只对具体 ID 拼 [1m] 后缀；alias 不拼
//（CLI 不接受 alias[1m]，研究文档 L49/L53）。
export function resolveModelId(config: ClaudeRuntimeConfig, tier: ClaudeModelTier): string {
  const modelId = config.modelMapping[tier] || config.modelMapping.default || "sonnet";
  const isConcreteId = modelId.includes("-");
  return config.enable1mContext && isConcreteId ? `${modelId}[1m]` : modelId;
}

// 纯函数：apiKey 掩码（前 7 + 末 4，中间 ...）。保留可识别指纹供前端判断已配置/未改。
export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 11) return `${key.slice(0, 2)}...${key.slice(-2)}`;
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

export function toMaskedProvider(provider: ProviderConfig): ProviderConfigMasked {
  return {
    id: provider.id,
    label: provider.label,
    ...(provider.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
    apiKeyMasked: maskApiKey(provider.apiKey),
    hasApiKey: Boolean(provider.apiKey),
  };
}

// normalize：宽松补缺字段，旧/部分文件不抛错。本轮只 v1；schemaVersion 仅持久化、
// 不做版本校验（未来 v2 迁移钩子预留）。
function normalizeSettings(parsed: unknown): SettingsState {
  if (!parsed || typeof parsed !== "object") {
    return cloneDefaultSettings();
  }

  const root = parsed as Partial<SettingsState>;
  const providers = Array.isArray(root.providers)
    ? root.providers.filter(isProviderConfig).map(normalizeProvider)
    : [];

  return {
    providers,
    runtimes: { claude: normalizeClaudeRuntime(root.runtimes?.claude) },
  };
}

const isProviderConfig = (value: unknown): value is ProviderConfig =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ProviderConfig).id === "string" &&
  typeof (value as ProviderConfig).label === "string" &&
  typeof (value as ProviderConfig).apiKey === "string";

const normalizeProvider = (parsed: ProviderConfig): ProviderConfig => {
  const provider: ProviderConfig = {
    id: parsed.id,
    label: parsed.label,
    apiKey: parsed.apiKey,
  };
  if (typeof parsed.baseUrl === "string") {
    provider.baseUrl = parsed.baseUrl;
  }
  return provider;
};

function normalizeClaudeRuntime(
  parsed: Partial<ClaudeRuntimeConfig> | undefined,
): ClaudeRuntimeConfig {
  const mapping = parsed?.modelMapping;
  return {
    providerId: typeof parsed?.providerId === "string" ? parsed.providerId : "",
    modelMapping: {
      default: nonEmptyString(mapping?.default) ?? DEFAULT_CLAUDE_RUNTIME.modelMapping.default,
      opus: nonEmptyString(mapping?.opus) ?? DEFAULT_CLAUDE_RUNTIME.modelMapping.opus,
      sonnet: nonEmptyString(mapping?.sonnet) ?? DEFAULT_CLAUDE_RUNTIME.modelMapping.sonnet,
      haiku: nonEmptyString(mapping?.haiku) ?? DEFAULT_CLAUDE_RUNTIME.modelMapping.haiku,
    },
    enable1mContext:
      typeof parsed?.enable1mContext === "boolean"
        ? parsed.enable1mContext
        : DEFAULT_CLAUDE_RUNTIME.enable1mContext,
    effort: isEffortLevel(parsed?.effort) ? parsed.effort : DEFAULT_CLAUDE_RUNTIME.effort,
  };
}

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const isEffortLevel = (value: unknown): value is EffortLevel =>
  typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value);

function cloneDefaultSettings(): SettingsState {
  return {
    providers: [],
    runtimes: {
      claude: {
        providerId: DEFAULT_CLAUDE_RUNTIME.providerId,
        modelMapping: { ...DEFAULT_CLAUDE_RUNTIME.modelMapping },
        enable1mContext: DEFAULT_CLAUDE_RUNTIME.enable1mContext,
        effort: DEFAULT_CLAUDE_RUNTIME.effort,
      },
    },
  };
}

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
