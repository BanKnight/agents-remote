import type { ProviderConfig, ProviderProtocol } from "@agents-remote/shared";

// Anthropic /v1/models 要求的协议版本 header（OpenAI 兼容不需要）。
const ANTHROPIC_VERSION = "2023-06-01";
const FETCH_TIMEOUT_MS = 10_000;

// 永不抛的发现模型结果。ok=false 时 models 为空、error 给可读英文原因
// （前端作为 testConnectionFailed 的 {error} 参数直显）。status 仅在上游返回
// 非 2xx 时填充，便于排查。
export type ListModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string; status?: number };

const DEFAULT_BASE_URL: Record<ProviderProtocol, string> = {
  anthropic: "https://api.anthropic.com",
  "openai-compatible": "https://api.openai.com",
};

// 纯函数：归一化 baseUrl + 拼 /v1/models。去尾 /；已含 /v1 后缀则只拼 /models
// （部分网关 baseUrl 形如 https://gw.example.com/v1）。rawBaseUrl 空 → 按 protocol
// 取默认 base。导出供测试。
export function buildModelsUrl(rawBaseUrl: string | undefined, protocol: ProviderProtocol): string {
  const base = (rawBaseUrl?.trim() || DEFAULT_BASE_URL[protocol]).replace(/\/+$/, "");
  return base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
}

// 纯函数：从 {data:[{id},...]} 抽 id[]。Anthropic 与 OpenAI 响应共用此结构。
// 防御性解析：data 非 array、item 无 id、id 非字符串 全部过滤。不去重（调用方负责）。
export function parseModelIds(json: unknown): string[] {
  if (typeof json !== "object" || json === null) return [];
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (typeof item === "object" && item !== null && "id" in item) {
      const id = (item as { id?: unknown }).id;
      return typeof id === "string" && id.length > 0 ? [id] : [];
    }
    return [];
  });
}

// 纯函数：按 provider.protocol 构造 /v1/models 请求 header。
// anthropic → x-api-key + anthropic-version；openai-compatible → Authorization: Bearer。
// protocol 缺省（未 normalize 的对象）按 anthropic 处理。
export function buildModelsHeaders(provider: ProviderConfig): Record<string, string> {
  if (provider.protocol === "openai-compatible") {
    return { authorization: `Bearer ${provider.apiKey}` };
  }
  return { "x-api-key": provider.apiKey, "anthropic-version": ANTHROPIC_VERSION };
}

// 主入口：用 provider 凭证请求 /v1/models，返回可用模型列表（去重 + 排序）。
// 永不抛：上游 401/404/网络错误/解析失败 都返回 {ok:false, error}，让前端展示测试
// 结果而非报错 toast。apiKey 空则不发请求。
export async function listProviderModels(provider: ProviderConfig): Promise<ListModelsResult> {
  if (!provider.apiKey) {
    return { ok: false, error: "API key not configured" };
  }
  const protocol: ProviderProtocol = provider.protocol ?? "anthropic";
  const url = buildModelsUrl(provider.baseUrl, protocol);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: buildModelsHeaders(provider),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: humanizeStatus(res.status) };
    }
    const models = dedupeSorted(parseModelIds(await res.json()));
    if (models.length === 0) {
      return { ok: false, error: "Upstream returned no models" };
    }
    return { ok: true, models };
  } catch (error) {
    return { ok: false, error: humanizeError(error) };
  }
}

const humanizeStatus = (status: number): string => {
  if (status === 401 || status === 403) return "Invalid credentials or access denied";
  if (status === 404) return "Endpoint not found (check if baseUrl points to /v1)";
  return `Upstream returned ${status}`;
};

const humanizeError = (error: unknown): string => {
  const name = error instanceof Error ? error.name : "";
  if (/abort|timeout/i.test(name)) {
    return "Network error or timeout (check baseUrl reachability)";
  }
  return error instanceof Error ? error.message : String(error);
};

const dedupeSorted = (models: string[]): string[] =>
  Array.from(new Set(models)).sort((a, b) => a.localeCompare(b));
