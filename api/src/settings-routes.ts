import { randomUUID } from "node:crypto";
import {
  CLAUDE_MODEL_TIERS,
  EFFORT_LEVELS,
  PI_PROVIDER_APIS,
  type ClaudeModelMapping,
  type ClaudePreset,
  type ClaudeRuntimeConfig,
  type ClaudePresetResponse,
  type CreateClaudePresetRequest,
  type CreatePiPresetRequest,
  type DeleteClaudePresetResponse,
  type DeletePiPresetResponse,
  type GetSettingsResponse,
  type ListPiProvidersResponse,
  type ListProviderModelsResponse,
  type PiPreset,
  type PiPresetResponse,
  type PiProviderApi,
  type PiProviderInfo,
  type SettingsState,
  type TestClaudePresetRequest,
  type UpdateClaudePresetRequest,
  type UpdateClaudeRuntimeRequest,
  type UpdateClaudeRuntimeResponse,
  type UpdatePiPresetRequest,
  type UpdatePiRuntimeRequest,
  type UpdatePiRuntimeResponse,
} from "@agents-remote/shared";
import { jsonError } from "./http-auth";
import { getCachedPiBuiltinProviders } from "./pi-providers";
import { listProviderModels } from "./settings-models";
import { SettingsStore, toMaskedPiPreset, toMaskedPreset } from "./settings-store";

// 所有 /api/settings/* 经 index.ts 的 requireHttpAuth 统一守卫。
// GET 响应里 presets 的 apiKey 全走 toMaskedPreset；原始 key 永不出 api 进程、永不进日志。
// 写操作（POST/PUT/DELETE）只接已认证请求。
export const handleSettingsRoutes = async (
  request: Request,
  url: URL,
  store: SettingsStore,
  deps: { listPiProviders?: () => Promise<PiProviderInfo[]> } = {},
): Promise<Response | undefined> => {
  const listPiProviders = deps.listPiProviders ?? getCachedPiBuiltinProviders;

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
          // v5：pi 键恒存在；空 presets + activePresetId:"" = 未启用。
          pi: {
            presets: state.runtimes.pi.presets.map(toMaskedPiPreset),
            activePresetId: state.runtimes.pi.activePresetId,
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
      // mutator 展开合并保留 s 的其它字段（pi/skills）——applyClaudeRuntimePatch 只返回
      // claude 片段，直接作为返回值会丢 pi presets + skills（现存 bug，随本次修复）。
      updated = await store.update((s) => {
        const nextClaude = applyClaudeRuntimePatch(
          s.runtimes.claude,
          body,
          s.runtimes.claude.presets,
        );
        // 展开合并保留 presets（applyClaudeRuntimePatch 只返回三个 runtime 旋钮片段）。
        return {
          ...s,
          runtimes: { ...s.runtimes, claude: { ...s.runtimes.claude, ...nextClaude } },
        };
      });
    } catch (error) {
      if (error instanceof SettingsValidationError) {
        return jsonError(error.code, error.message, 400);
      }
      throw error;
    }
    const response: UpdateClaudeRuntimeResponse = { runtime: updated.runtimes.claude };
    return Response.json(response);
  }

  // ── pi runtime（v5 多 provider preset 体系）───────────────────────
  // GET /api/settings/runtimes/pi/providers —— 枚举 pi SDK 内置 provider（id + 显示名），
  // 供设置弹窗 provider 选择器使用。无凭证、只读 SDK 目录。枚举失败 200 降级空数组——
  // 前端手填兜底，不让设置弹窗阻塞（provider 列表是可选便利，非关键路径）。
  if (url.pathname === "/api/settings/runtimes/pi/providers" && request.method === "GET") {
    let providers: PiProviderInfo[];
    try {
      providers = await listPiProviders();
    } catch (error) {
      console.error("[pi-providers] enumerate failed", error);
      providers = [];
    }
    const response: ListPiProvidersResponse = { providers };
    return Response.json(response);
  }

  // POST /api/settings/runtimes/pi/presets —— 新建 preset。label/provider/apiKey/model 必填；
  // api 仅 baseUrl 非空时有意义（自定义兼容端点），无 baseUrl 传 api → 400。
  if (url.pathname === "/api/settings/runtimes/pi/presets" && request.method === "POST") {
    const body = await readJson<CreatePiPresetRequest>(request);
    const label = body.label?.trim();
    const provider = body.provider?.trim();
    const apiKey = body.apiKey?.trim();
    const model = body.model?.trim();
    const baseUrl = body.baseUrl?.trim();
    if (!label) return jsonError("SETTINGS_INVALID", "Preset label is required", 400);
    if (!provider) return jsonError("SETTINGS_INVALID", "Preset provider is required", 400);
    if (!apiKey) return jsonError("SETTINGS_INVALID", "Preset API key is required", 400);
    if (!model) return jsonError("SETTINGS_INVALID", "Preset model is required", 400);
    const apiError = coercePiApi(body.api, baseUrl);
    if (apiError) return jsonError("SETTINGS_INVALID", apiError, 400);
    const preset: PiPreset = {
      id: randomUUID(),
      label,
      provider,
      apiKey,
      model,
      ...(baseUrl ? { baseUrl } : {}),
      ...(baseUrl && body.api ? { api: body.api } : {}),
    };
    const updated = await store.update((s) => ({
      ...s,
      runtimes: {
        ...s.runtimes,
        pi: { ...s.runtimes.pi, presets: [...s.runtimes.pi.presets, preset] },
      },
    }));
    const created = updated.runtimes.pi.presets.find((p) => p.id === preset.id);
    if (!created) throw new Error("Created pi preset missing from store");
    const response: PiPresetResponse = { preset: toMaskedPiPreset(created) };
    return Response.json(response, { status: 201 });
  }

  const piPresetIdMatch = url.pathname.match(/^\/api\/settings\/runtimes\/pi\/presets\/([^/]+)$/);

  // PUT /api/settings/runtimes/pi/presets/:id —— 编辑 preset。label/provider/model 非空才覆盖；
  // apiKey 空/缺省 = 不改；baseUrl 显式空串 = 删除（联动删 api）；api 须配有效 baseUrl。
  if (piPresetIdMatch && request.method === "PUT") {
    const id = decodeURIComponent(piPresetIdMatch[1]);
    const body = await readJson<UpdatePiPresetRequest>(request);
    let missing = false;
    let invalid = "";
    const updated = await store.update((s) => {
      const existing = s.runtimes.pi.presets.find((p) => p.id === id);
      if (!existing) {
        missing = true;
        return s;
      }
      const effectiveBaseUrl = body.baseUrl !== undefined ? body.baseUrl.trim() : existing.baseUrl;
      const apiError = coercePiApi(body.api, effectiveBaseUrl);
      if (apiError) {
        invalid = apiError;
        return s;
      }
      const presets = s.runtimes.pi.presets.map((p) => {
        if (p.id !== id) return p;
        const next: PiPreset = { ...p };
        if (typeof body.label === "string" && body.label.trim()) next.label = body.label.trim();
        if (typeof body.provider === "string" && body.provider.trim()) {
          next.provider = body.provider.trim();
        }
        if (typeof body.model === "string" && body.model.trim()) next.model = body.model.trim();
        // apiKey: undefined/空串 = 不改；非空 = 覆盖（编辑态留空保留原 key）。
        if (typeof body.apiKey === "string" && body.apiKey.length > 0) next.apiKey = body.apiKey;
        if (body.baseUrl !== undefined) {
          if (effectiveBaseUrl) next.baseUrl = effectiveBaseUrl;
          else {
            delete next.baseUrl;
            delete next.api; // baseUrl 删除联动删 api（api 只对自定义端点有意义）
          }
        }
        if (body.api !== undefined && effectiveBaseUrl) next.api = body.api;
        return next;
      });
      return {
        ...s,
        runtimes: { ...s.runtimes, pi: { ...s.runtimes.pi, presets } },
      };
    });
    if (missing) return jsonError("PRESET_NOT_FOUND", "Preset not found", 404);
    if (invalid) return jsonError("SETTINGS_INVALID", invalid, 400);
    const preset = updated.runtimes.pi.presets.find((p) => p.id === id);
    if (!preset) throw new Error("Updated pi preset missing from store");
    const response: PiPresetResponse = { preset: toMaskedPiPreset(preset) };
    return Response.json(response);
  }

  // DELETE /api/settings/runtimes/pi/presets/:id —— 删除 preset。删除激活 preset 级联清空
  // activePresetId（pi 停用语义：新 chat 会话出 SESSION_NOT_CONFIGURED，区别于 claude 回退 env）。
  if (piPresetIdMatch && request.method === "DELETE") {
    const id = decodeURIComponent(piPresetIdMatch[1]);
    let existed = false;
    await store.update((s) => {
      const pi = s.runtimes.pi;
      existed = pi.presets.some((p) => p.id === id);
      if (!existed) return s;
      const presets = pi.presets.filter((p) => p.id !== id);
      const nextPi =
        pi.activePresetId === id ? { ...pi, presets, activePresetId: "" } : { ...pi, presets };
      return { ...s, runtimes: { ...s.runtimes, pi: nextPi } };
    });
    if (!existed) return jsonError("PRESET_NOT_FOUND", "Preset not found", 404);
    const response: DeletePiPresetResponse = { deleted: true, id };
    return Response.json(response);
  }

  // PUT /api/settings/runtimes/pi —— 语义 = activate：只更新 activePresetId（空串 = 停用 pi）。
  if (url.pathname === "/api/settings/runtimes/pi" && request.method === "PUT") {
    const body = await readJson<UpdatePiRuntimeRequest>(request);
    const trimmed = body.activePresetId?.trim() ?? "";
    if (trimmed && !(await store.read()).runtimes.pi.presets.some((p) => p.id === trimmed)) {
      return jsonError("PRESET_NOT_FOUND", "Preset not found", 400);
    }
    const updated = await store.update((s) => ({
      ...s,
      runtimes: { ...s.runtimes, pi: { ...s.runtimes.pi, activePresetId: trimmed } },
    }));
    const response: UpdatePiRuntimeResponse = {
      runtime: { activePresetId: updated.runtimes.pi.activePresetId },
    };
    return Response.json(response);
  }

  return undefined;
};

// 纯函数：pi 线协议校验。api 缺省（undefined）= 不校验（运行时按 openai-completions 处理）；
// api 给了但 baseUrl 为空 → 错误文案（api 只对自定义端点有意义）。返回 "" = 合法。
const coercePiApi = (api: PiProviderApi | undefined, baseUrl: string | undefined): string => {
  if (api === undefined) return "";
  if (!(PI_PROVIDER_APIS as readonly string[]).includes(api)) {
    return `Invalid api: ${api}`;
  }
  if (!baseUrl) return "api requires a custom baseUrl";
  return "";
};

// 纯函数：把 partial patch 合并进当前 claude runtime config，校验失败抛
// SettingsValidationError（由 route handler 转 400）。返回新 ClaudeRuntimeConfig 片段——
// 调用方 mutator 必须展开合并进完整 state（保留 pi/skills，见 route 层注释）。
// runtime 级只持 activePresetId/effort/enable1mContext（modelMapping 已下沉 preset）。
function applyClaudeRuntimePatch(
  current: ClaudeRuntimeConfig,
  body: UpdateClaudeRuntimeRequest,
  presets: ClaudePreset[],
): ClaudeRuntimeConfig {
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

  return { activePresetId, enable1mContext, effort };
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
