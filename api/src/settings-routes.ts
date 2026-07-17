import { randomUUID } from "node:crypto";
import {
  CLAUDE_MODEL_TIERS,
  EFFORT_LEVELS,
  type ClaudeModelMapping,
  type ClaudePreset,
  type ClaudeRuntimeConfig,
  type ClaudePresetResponse,
  type CreateClaudePresetRequest,
  type DeleteClaudePresetResponse,
  type GetSettingsResponse,
  type ListProviderModelsResponse,
  type SettingsState,
  type TestClaudePresetRequest,
  type UpdateClaudePresetRequest,
  type UpdateClaudeRuntimeRequest,
  type UpdateClaudeRuntimeResponse,
} from "@agents-remote/shared";
import { jsonError } from "./http-auth";
import { listProviderModels } from "./settings-models";
import { SettingsStore, toMaskedPreset } from "./settings-store";

// 所有 /api/settings/* 经 index.ts 的 requireHttpAuth 统一守卫。
// GET 响应里 presets 的 apiKey 全走 toMaskedPreset；原始 key 永不出 api 进程、永不进日志。
// 写操作（POST/PUT/DELETE）只接已认证请求。
export const handleSettingsRoutes = async (
  request: Request,
  url: URL,
  store: SettingsStore,
): Promise<Response | undefined> => {
  if (url.pathname === "/api/settings" && request.method === "GET") {
    const state = await store.read();
    const claude = state.runtimes.claude;
    const response: GetSettingsResponse = {
      settings: {
        runtimes: {
          claude: {
            presets: claude.presets.map(toMaskedPreset),
            activePresetId: claude.activePresetId,
            enable1mContext: claude.enable1mContext,
            effort: claude.effort,
          },
        },
        skills: { sources: state.skills?.sources ?? [] },
      },
    };
    return Response.json(response);
  }

  // POST /api/settings/runtimes/claude/presets/test-models —— 用表单内联凭证测试连接（不落盘）。
  // 精确匹配（无 id 段），放在 :id/models 正则之前。新建态无 id；编辑态传 id 用于
  // 回退内联缺失字段（apiKey 留空 = "不改" → 用已保存原 key，原 key 永不出 api 进程）。
  // preset 恒 anthropic，固定 anthropic 请求头。上游失败走 {ok:false, error}。
  if (
    url.pathname === "/api/settings/runtimes/claude/presets/test-models" &&
    request.method === "POST"
  ) {
    const body = await readJson<TestClaudePresetRequest>(request);
    const baseUrl = body.baseUrl?.trim();
    const saved = body.id
      ? (await store.read()).runtimes.claude.presets.find((p) => p.id === body.id)
      : undefined;
    const apiKey = body.apiKey?.trim() || saved?.apiKey || "";
    const creds = {
      apiKey,
      ...(baseUrl ? { baseUrl } : saved?.baseUrl ? { baseUrl: saved.baseUrl } : {}),
    };
    const result = await listProviderModels(creds);
    const response: ListProviderModelsResponse = {
      ok: result.ok,
      models: result.ok ? result.models : [],
      ...(result.ok ? {} : { error: result.error }),
    };
    return Response.json(response);
  }

  // POST /api/settings/runtimes/claude/presets/:id/models —— 用该 preset 凭证发现可用模型。
  // 独立正则（带 /models$），与 PUT/DELETE 的单段正则不冲突。上游失败不抛——
  // 走 {ok:false, error} 让前端展示测试结果；仅 preset 不存在返回 404。
  const modelsMatch = url.pathname.match(
    /^\/api\/settings\/runtimes\/claude\/presets\/([^/]+)\/models$/,
  );
  if (modelsMatch && request.method === "POST") {
    const id = decodeURIComponent(modelsMatch[1]);
    const preset = (await store.read()).runtimes.claude.presets.find((p) => p.id === id);
    if (!preset) return jsonError("PRESET_NOT_FOUND", "Preset not found", 404);
    const result = await listProviderModels(preset);
    const response: ListProviderModelsResponse = {
      ok: result.ok,
      models: result.ok ? result.models : [],
      ...(result.ok ? {} : { error: result.error }),
    };
    return Response.json(response);
  }

  if (url.pathname === "/api/settings/runtimes/claude/presets" && request.method === "POST") {
    const body = await readJson<CreateClaudePresetRequest>(request);
    const label = body.label?.trim();
    const apiKey = body.apiKey?.trim();
    const baseUrl = body.baseUrl?.trim();
    if (!label) return jsonError("SETTINGS_INVALID", "Preset label is required", 400);
    if (!apiKey) return jsonError("SETTINGS_INVALID", "Preset API key is required", 400);
    if (!baseUrl) return jsonError("SETTINGS_INVALID", "Preset baseUrl is required", 400);
    const modelMappingResult = coerceModelMapping(body.modelMapping);
    if (typeof modelMappingResult === "string") {
      return jsonError("SETTINGS_INVALID", modelMappingResult, 400);
    }
    const preset: ClaudePreset = {
      id: randomUUID(),
      label,
      apiKey,
      baseUrl,
      modelMapping: modelMappingResult,
    };
    const updated = await store.update((s) => ({
      ...s,
      runtimes: {
        ...s.runtimes,
        claude: { ...s.runtimes.claude, presets: [...s.runtimes.claude.presets, preset] },
      },
    }));
    const created = updated.runtimes.claude.presets.find((p) => p.id === preset.id);
    if (!created) throw new Error("Created preset missing from store");
    const response: ClaudePresetResponse = { preset: toMaskedPreset(created) };
    return Response.json(response, { status: 201 });
  }

  const presetIdMatch = url.pathname.match(/^\/api\/settings\/runtimes\/claude\/presets\/([^/]+)$/);

  if (presetIdMatch && request.method === "PUT") {
    const id = decodeURIComponent(presetIdMatch[1]);
    const body = await readJson<UpdateClaudePresetRequest>(request);
    let missing = false;
    const updated = await store.update((s) => {
      if (!s.runtimes.claude.presets.some((p) => p.id === id)) {
        missing = true;
        return s;
      }
      const presets = s.runtimes.claude.presets.map((p) => {
        if (p.id !== id) return p;
        const next: ClaudePreset = { ...p, modelMapping: { ...p.modelMapping } };
        if (typeof body.label === "string" && body.label.trim()) next.label = body.label.trim();
        // apiKey: undefined/空串 = 不改；非空 = 覆盖（前端编辑时留空保留原 key）。
        if (typeof body.apiKey === "string" && body.apiKey.length > 0) next.apiKey = body.apiKey;
        if (body.baseUrl !== undefined) {
          const trimmed = body.baseUrl.trim();
          if (trimmed) next.baseUrl = trimmed;
          else delete next.baseUrl;
        }
        if (body.modelMapping) {
          for (const tier of CLAUDE_MODEL_TIERS) {
            const value = body.modelMapping[tier];
            // 各 tier 可选更新：非空 string 才覆盖；空串/缺省 = 不改。
            if (typeof value === "string" && value.trim()) {
              next.modelMapping[tier] = value.trim();
            }
          }
        }
        return next;
      });
      return {
        ...s,
        runtimes: { ...s.runtimes, claude: { ...s.runtimes.claude, presets } },
      };
    });
    if (missing) return jsonError("PRESET_NOT_FOUND", "Preset not found", 404);
    const preset = updated.runtimes.claude.presets.find((p) => p.id === id);
    if (!preset) throw new Error("Updated preset missing from store");
    const response: ClaudePresetResponse = { preset: toMaskedPreset(preset) };
    return Response.json(response);
  }

  if (presetIdMatch && request.method === "DELETE") {
    const id = decodeURIComponent(presetIdMatch[1]);
    let existed = false;
    await store.update((s) => {
      const claude = s.runtimes.claude;
      existed = claude.presets.some((p) => p.id === id);
      if (!existed) return s;
      const presets = claude.presets.filter((p) => p.id !== id);
      // 删除被激活的 preset 时清空 activePresetId（spawn 回退父进程 env）。
      const nextClaude =
        claude.activePresetId === id
          ? { ...claude, presets, activePresetId: "" }
          : { ...claude, presets };
      return { ...s, runtimes: { ...s.runtimes, claude: nextClaude } };
    });
    if (!existed) return jsonError("PRESET_NOT_FOUND", "Preset not found", 404);
    const response: DeleteClaudePresetResponse = { deleted: true, id };
    return Response.json(response);
  }

  if (url.pathname === "/api/settings/runtimes/claude" && request.method === "PUT") {
    const body = await readJson<UpdateClaudeRuntimeRequest>(request);
    let updated: SettingsState;
    try {
      updated = await store.update((s) =>
        applyClaudeRuntimePatch(s.runtimes.claude, body, s.runtimes.claude.presets),
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

// 纯函数：把 partial patch 合并进当前 claude runtime config，校验失败抛
// SettingsValidationError（由 route handler 转 400）。返回完整新 SettingsState。
// runtime 级只持 activePresetId/effort/enable1mContext（modelMapping 已下沉 preset）。
function applyClaudeRuntimePatch(
  current: ClaudeRuntimeConfig,
  body: UpdateClaudeRuntimeRequest,
  presets: ClaudePreset[],
): SettingsState {
  let activePresetId = current.activePresetId;
  let effort = current.effort;
  let enable1mContext = current.enable1mContext;

  if (body.activePresetId !== undefined) {
    const trimmed = body.activePresetId.trim();
    if (trimmed) {
      // 激活的预设必须存在（preset 恒 anthropic，无需 protocol 守卫）。
      if (!presets.some((p) => p.id === trimmed)) {
        throw new SettingsValidationError("PRESET_NOT_FOUND", "Preset not found");
      }
    }
    activePresetId = trimmed;
  }

  if (body.effort !== undefined) {
    if (!(EFFORT_LEVELS as readonly string[]).includes(body.effort)) {
      throw new SettingsValidationError("SETTINGS_INVALID", `Invalid effort: ${body.effort}`);
    }
    effort = body.effort;
  }

  if (body.enable1mContext !== undefined) {
    enable1mContext = body.enable1mContext;
  }

  return {
    runtimes: { claude: { presets, activePresetId, enable1mContext, effort } },
  };
}

class SettingsValidationError extends Error {
  constructor(
    readonly code: "PRESET_NOT_FOUND" | "SETTINGS_INVALID",
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

// 创建 preset 时校验 + 规整 modelMapping：各 tier 必须是非空 string。返回规整后的
// ClaudeModelMapping，或错误文案（由 route handler 转 400 SETTINGS_INVALID）。
const coerceModelMapping = (mapping: unknown): ClaudeModelMapping | string => {
  if (!mapping || typeof mapping !== "object") return "modelMapping is required";
  const m = mapping as Record<string, unknown>;
  const out = {} as Partial<ClaudeModelMapping>;
  for (const tier of CLAUDE_MODEL_TIERS) {
    const value = m[tier];
    if (typeof value !== "string") return `modelMapping.${tier} must be a non-empty string`;
    const trimmed = value.trim();
    if (!trimmed) return `modelMapping.${tier} must not be empty`;
    out[tier] = trimmed;
  }
  return out as ClaudeModelMapping;
};
