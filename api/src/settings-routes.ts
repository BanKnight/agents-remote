import { randomUUID } from "node:crypto";
import {
  CLAUDE_MODEL_TIERS,
  EFFORT_LEVELS,
  PROVIDER_PROTOCOLS,
  type ClaudeRuntimeConfig,
  type CreateProviderRequest,
  type DeleteProviderResponse,
  type GetSettingsResponse,
  type ListProviderModelsResponse,
  type ProviderConfig,
  type ProviderProtocol,
  type ProviderResponse,
  type SettingsState,
  type UpdateClaudeRuntimeRequest,
  type UpdateClaudeRuntimeResponse,
  type UpdateProviderRequest,
} from "@agents-remote/shared";
import { jsonError } from "./http-auth";
import { listProviderModels } from "./settings-models";
import { SettingsStore, toMaskedProvider } from "./settings-store";

// 所有 /api/settings/* 经 index.ts 的 requireHttpAuth 统一守卫（L102-110）。
// GET 响应里 providers 的 apiKey 全走 toMaskedProvider；原始 key 永不出 api 进程、
// 永不进日志。写操作（POST/PUT/DELETE）只接已认证请求。
export const handleSettingsRoutes = async (
  request: Request,
  url: URL,
  store: SettingsStore,
): Promise<Response | undefined> => {
  if (url.pathname === "/api/settings" && request.method === "GET") {
    const state = await store.read();
    const response: GetSettingsResponse = {
      settings: {
        providers: state.providers.map(toMaskedProvider),
        runtimes: state.runtimes,
      },
    };
    return Response.json(response);
  }

  if (url.pathname === "/api/settings/providers" && request.method === "POST") {
    const body = await readJson<CreateProviderRequest>(request);
    const label = body.label?.trim();
    const apiKey = body.apiKey?.trim();
    if (!label) return jsonError("SETTINGS_INVALID", "Provider label is required", 400);
    if (!apiKey) return jsonError("SETTINGS_INVALID", "Provider API key is required", 400);
    const baseUrl = body.baseUrl?.trim();
    const provider: ProviderConfig = {
      id: randomUUID(),
      label,
      apiKey,
      protocol: resolveProtocol(body.protocol),
      ...(baseUrl ? { baseUrl } : {}),
    };
    const updated = await store.update((s) => ({ ...s, providers: [...s.providers, provider] }));
    const created = updated.providers.find((p) => p.id === provider.id);
    if (!created) throw new Error("Created provider missing from store");
    const response: ProviderResponse = { provider: toMaskedProvider(created) };
    return Response.json(response, { status: 201 });
  }

  // POST /api/settings/providers/:id/models —— 用 provider 凭证发现可用模型列表。
  // 独立正则（带 /models$），与下方 PUT/DELETE 的单段正则不冲突。上游失败不抛——
  // 走 {ok:false, error} 让前端展示测试结果；仅 provider 不存在返回 404。
  const modelsMatch = url.pathname.match(/^\/api\/settings\/providers\/([^/]+)\/models$/);
  if (modelsMatch && request.method === "POST") {
    const id = decodeURIComponent(modelsMatch[1]);
    const state = await store.read();
    const provider = state.providers.find((p) => p.id === id);
    if (!provider) return jsonError("PROVIDER_NOT_FOUND", "Provider not found", 404);
    const result = await listProviderModels(provider);
    const response: ListProviderModelsResponse = {
      ok: result.ok,
      models: result.ok ? result.models : [],
      ...(result.ok ? {} : { error: result.error }),
    };
    return Response.json(response);
  }

  const providerIdMatch = url.pathname.match(/^\/api\/settings\/providers\/([^/]+)$/);

  if (providerIdMatch && request.method === "PUT") {
    const id = decodeURIComponent(providerIdMatch[1]);
    const body = await readJson<UpdateProviderRequest>(request);
    let missing = false;
    const updated = await store.update((s) => {
      if (!s.providers.some((p) => p.id === id)) {
        missing = true;
        return s;
      }
      const providers = s.providers.map((p) => {
        if (p.id !== id) return p;
        const next: ProviderConfig = { ...p };
        if (typeof body.label === "string" && body.label.trim()) next.label = body.label.trim();
        // apiKey: undefined/空串 = 不改；非空 = 覆盖（前端编辑时留空保留原 key）。
        if (typeof body.apiKey === "string" && body.apiKey.length > 0) next.apiKey = body.apiKey;
        if (body.protocol !== undefined) next.protocol = resolveProtocol(body.protocol);
        if (body.baseUrl !== undefined) {
          const trimmed = body.baseUrl.trim();
          if (trimmed) next.baseUrl = trimmed;
          else delete next.baseUrl;
        }
        return next;
      });
      return { ...s, providers };
    });
    if (missing) return jsonError("PROVIDER_NOT_FOUND", "Provider not found", 404);
    const provider = updated.providers.find((p) => p.id === id);
    if (!provider) throw new Error("Updated provider missing from store");
    const response: ProviderResponse = { provider: toMaskedProvider(provider) };
    return Response.json(response);
  }

  if (providerIdMatch && request.method === "DELETE") {
    const id = decodeURIComponent(providerIdMatch[1]);
    let existed = false;
    await store.update((s) => {
      existed = s.providers.some((p) => p.id === id);
      if (!existed) return s;
      const providers = s.providers.filter((p) => p.id !== id);
      // 删除被 claude runtime 引用的 provider 时清空 providerId（fallback 继承父进程 env）。
      const claude =
        s.runtimes.claude.providerId === id
          ? { ...s.runtimes.claude, providerId: "" }
          : s.runtimes.claude;
      return { ...s, providers, runtimes: { ...s.runtimes, claude } };
    });
    if (!existed) return jsonError("PROVIDER_NOT_FOUND", "Provider not found", 404);
    const response: DeleteProviderResponse = { deleted: true, id };
    return Response.json(response);
  }

  if (url.pathname === "/api/settings/runtimes/claude" && request.method === "PUT") {
    const body = await readJson<UpdateClaudeRuntimeRequest>(request);
    let updated: SettingsState;
    try {
      updated = await store.update((s) =>
        applyClaudeRuntimePatch(s.runtimes.claude, body, s.providers),
      );
    } catch (error) {
      if (error instanceof SettingsValidationError) {
        return jsonError(error.code, error.message, 400);
      }
      throw error;
    }
    const response: UpdateClaudeRuntimeResponse = { runtime: updated.runtimes.claude };
    return Response.json(response);
  }

  return undefined;
};

// 纯函数：把 partial patch 浅合并进当前 claude runtime config，校验失败抛
// SettingsValidationError（由 route handler 转 400）。返回完整新 SettingsState。
function applyClaudeRuntimePatch(
  current: ClaudeRuntimeConfig,
  body: UpdateClaudeRuntimeRequest,
  providers: ProviderConfig[],
): SettingsState {
  const next: ClaudeRuntimeConfig = { ...current, modelMapping: { ...current.modelMapping } };

  if (body.providerId !== undefined) {
    const providerId = body.providerId.trim();
    if (providerId) {
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) {
        throw new SettingsValidationError("PROVIDER_NOT_FOUND", "Provider not found");
      }
      // Claude runtime 只消费 anthropic provider（决策 47）：UI 过滤可被绕过时，
      // 后端挡住绑定 openai-compatible provider，给用户即时 400 而非 spawn 时用错 key。
      if ((provider.protocol ?? "anthropic") !== "anthropic") {
        throw new SettingsValidationError(
          "SETTINGS_INVALID",
          "Claude runtime requires an Anthropic-protocol provider",
        );
      }
    }
    next.providerId = providerId;
  }

  if (body.effort !== undefined) {
    if (!(EFFORT_LEVELS as readonly string[]).includes(body.effort)) {
      throw new SettingsValidationError("SETTINGS_INVALID", `Invalid effort: ${body.effort}`);
    }
    next.effort = body.effort;
  }

  if (body.enable1mContext !== undefined) {
    next.enable1mContext = body.enable1mContext;
  }

  if (body.modelMapping) {
    for (const tier of CLAUDE_MODEL_TIERS) {
      const value = body.modelMapping[tier];
      if (value !== undefined) {
        const trimmed = value.trim();
        if (!trimmed) {
          throw new SettingsValidationError(
            "SETTINGS_INVALID",
            `modelMapping.${tier} must not be empty`,
          );
        }
        next.modelMapping[tier] = trimmed;
      }
    }
  }

  return {
    providers,
    runtimes: { claude: next },
  };
}

class SettingsValidationError extends Error {
  constructor(
    readonly code: "PROVIDER_NOT_FOUND" | "SETTINGS_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

const readJson = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
};

// protocol 校验：合法值透传，缺省/非法值兜底 "anthropic"（与 store normalizeProvider 一致）。
const resolveProtocol = (value: unknown): ProviderProtocol =>
  typeof value === "string" && (PROVIDER_PROTOCOLS as readonly string[]).includes(value)
    ? (value as ProviderProtocol)
    : "anthropic";
