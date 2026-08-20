import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";

// firecrawl REST 包装（pi customTools，决策：不走 MCP 体系）。凭证 = settings.runtimes.pi
// .firecrawlApiKey（pi-runtime ensureRunning 传入），缺失 → 不注册工具（pi 仍可用只读内置
// 工具），绝不阻塞 pi 启动。
const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v2";
const FIRECRAWL_TIMEOUT_MS = 30_000;

type FirecrawlSearchParams = { query: string; limit?: number };
type FirecrawlScrapeParams = { url: string };

/** firecrawl REST 请求：可选 Bearer 认证（无 key = 匿名限额模式）+ 30s 超时。非 2xx / 网络错误 → throw（execute 转 error content）。 */
async function firecrawlFetch(
  apiKey: string | undefined,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIRECRAWL_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(`${FIRECRAWL_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`firecrawl HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** search 结果 → 文本 content。v2 /search 真实形状为 `data: { web: [...] }`（项含
 *  title/description/url，无 markdown）；兼容历史 `data: [...]` 数组。文本源 markdown
 *  → content → description 依次回退。 */
function searchResultsToText(data: unknown): string {
  const items = Array.isArray(data) ? data : (data as { web?: unknown })?.web;
  if (!Array.isArray(items)) return "";
  return items
    .map((item: Record<string, unknown>) => {
      const md = item.markdown ?? item.content ?? item.description;
      return typeof md === "string" ? md : "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/**
 * 构建 firecrawl 工具集（pi customTools）。apiKey 可选：有 → Bearer 认证；无 → 匿名限额
 * 模式（firecrawl 无 key 也能触发，只是限流更低）。工具恒注册，不阻塞 pi 启动。
 * 两个工具：firecrawl_search（web 搜索）+ firecrawl_scrape（单页抓取）。失败 key 返回
 * Error content（对齐「adapter 层显式错误传播」规范，不静默 fallback）。
 */
export function buildFirecrawlTools(apiKey: string | undefined): ToolDefinition[] {
  const search = defineTool({
    name: "firecrawl_search",
    label: "Firecrawl Search",
    description:
      "Search the web using Firecrawl. Returns markdown content of top results. Use when the user asks about current events, external websites, or information not in the local workspace.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      limit: Type.Optional(Type.Number({ description: "Max results (default 5)" })),
    }),
    execute: async (_toolCallId, params: FirecrawlSearchParams, signal) => {
      try {
        const json = await firecrawlFetch(
          apiKey,
          "/search",
          { query: params.query, limit: params.limit ?? 5 },
          signal,
        );
        const text = searchResultsToText((json as { data?: unknown })?.data);
        if (!text) {
          return {
            content: [{ type: "text", text: "firecrawl search 无结果" }],
            details: { query: params.query },
          };
        }
        return { content: [{ type: "text", text }], details: { query: params.query } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `firecrawl search 失败: ${message}` }],
          details: { query: params.query },
        };
      }
    },
  });

  const scrape = defineTool({
    name: "firecrawl_scrape",
    label: "Firecrawl Scrape",
    description:
      "Scrape a single web page using Firecrawl and return its markdown content. Use when the user provides a URL and wants the page content.",
    parameters: Type.Object({
      url: Type.String({ description: "URL to scrape" }),
    }),
    execute: async (_toolCallId, params: FirecrawlScrapeParams, signal) => {
      try {
        const json = await firecrawlFetch(
          apiKey,
          "/scrape",
          { url: params.url, formats: ["markdown"] },
          signal,
        );
        const markdown = (json as { data?: { markdown?: string } })?.data?.markdown;
        if (!markdown) {
          return {
            content: [{ type: "text", text: "firecrawl scrape 无内容" }],
            details: { url: params.url },
          };
        }
        return { content: [{ type: "text", text: markdown }], details: { url: params.url } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `firecrawl scrape 失败: ${message}` }],
          details: { url: params.url },
        };
      }
    },
  });

  return [search, scrape];
}
