import { afterEach, expect, test } from "bun:test";
import { buildFirecrawlTools } from "./pi-firecrawl-tools";

const originalFetch = globalThis.fetch;
const originalEnv = process.env.FIRECRAWL_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnv === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = originalEnv;
});

const mockFetch = (
  handler: (url: string, init: RequestInit, signal?: AbortSignal) => Promise<Response>,
) => {
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
    signal?: AbortSignal,
  ) => {
    return handler(String(input), init ?? {}, signal);
  }) as typeof fetch;
};

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

test("buildFirecrawlTools: apiKey 空 → 仍注册两工具（匿名限额模式，不阻塞）", () => {
  const tools = buildFirecrawlTools(undefined);
  expect(tools).toHaveLength(2);
  expect(tools.map((t) => t.name)).toEqual(["firecrawl_search", "firecrawl_scrape"]);
  const tools2 = buildFirecrawlTools("");
  expect(tools2).toHaveLength(2);
});

test("buildFirecrawlTools: 有 key → 两个工具，name/parameters 形状正确", () => {
  const tools = buildFirecrawlTools("test-key");
  expect(tools).toHaveLength(2);
  const names = tools.map((t) => t.name);
  expect(names).toEqual(["firecrawl_search", "firecrawl_scrape"]);

  const search = tools[0];
  expect(search.label).toBe("Firecrawl Search");
  expect(search.description).toContain("web");
  // typebox schema：query 必填 string，limit 可选 number
  const searchSchema = search.parameters as {
    type: string;
    required?: string[];
    properties: Record<string, unknown>;
  };
  expect(searchSchema.type).toBe("object");
  expect(searchSchema.required).toEqual(["query"]);
  expect(searchSchema.properties.query).toMatchObject({ type: "string" });
  expect(searchSchema.properties.limit).toMatchObject({ type: "number" });

  const scrape = tools[1];
  expect(scrape.label).toBe("Firecrawl Scrape");
  const scrapeSchema = scrape.parameters as {
    type: string;
    required?: string[];
    properties: Record<string, unknown>;
  };
  expect(scrapeSchema.required).toEqual(["url"]);
  expect(scrapeSchema.properties.url).toMatchObject({ type: "string" });
});

test("firecrawl_search execute: 无 key → 匿名模式，请求不带 Authorization 头", async () => {
  const tools = buildFirecrawlTools(undefined);
  const search = tools[0];
  mockFetch((url, init) => {
    expect(url).toBe("https://api.firecrawl.dev/v2/search");
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(String(init.body))).toEqual({ query: "hello", limit: 5 });
    return okJson({ data: [{ markdown: "## Anonymous result" }] });
  });
  const result = await search.execute(
    "call-1",
    { query: "hello" },
    undefined,
    undefined,
    {} as never,
  );
  expect(result.content[0]).toEqual({ type: "text", text: "## Anonymous result" });
});

test("firecrawl_search execute: 成功 → markdown 拼接 text content", async () => {
  const tools = buildFirecrawlTools("test-key");
  const search = tools[0];
  mockFetch((url, init) => {
    expect(url).toBe("https://api.firecrawl.dev/v2/search");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(String(init.body))).toEqual({ query: "hello", limit: 5 });
    return okJson({
      data: [
        { markdown: "## Result A\ncontent a" },
        { content: "result b without markdown" },
        { description: "result c" },
        { title: "no text" },
      ],
    });
  });
  const result = await search.execute(
    "call-1",
    { query: "hello" },
    undefined,
    undefined,
    {} as never,
  );
  expect(result.content).toEqual([
    {
      type: "text",
      text: "## Result A\ncontent a\n\n---\n\nresult b without markdown\n\n---\n\nresult c",
    },
  ]);
  expect(result.details).toEqual({ query: "hello" });
});

test("firecrawl_search execute: v2 真实形状 data.web（title/description/url，无 markdown）", async () => {
  const tools = buildFirecrawlTools("test-key");
  const search = tools[0];
  mockFetch(() =>
    okJson({
      success: true,
      data: {
        web: [
          { url: "https://a.example", title: "Result A", description: "desc a" },
          { url: "https://b.example", title: "Result B" },
        ],
      },
    }),
  );
  const result = await search.execute(
    "call-1",
    { query: "hello" },
    undefined,
    undefined,
    {} as never,
  );
  expect(result.content).toEqual([{ type: "text", text: "desc a" }]);
});

test("firecrawl_search execute: limit 透传", async () => {
  const tools = buildFirecrawlTools("test-key");
  const search = tools[0];
  mockFetch((_url, init) => {
    expect(JSON.parse(String(init.body))).toEqual({ query: "q", limit: 3 });
    return okJson({ data: [] });
  });
  const result = await search.execute(
    "call-1",
    { query: "q", limit: 3 },
    undefined,
    undefined,
    {} as never,
  );
  expect(result.content).toEqual([{ type: "text", text: "firecrawl search 无结果" }]);
});

test("firecrawl_search execute: HTTP 失败 → error content（显式传播）", async () => {
  const tools = buildFirecrawlTools("test-key");
  const search = tools[0];
  mockFetch(() => new Response("rate limited", { status: 429 }));
  const result = await search.execute("call-1", { query: "q" }, undefined, undefined, {} as never);
  expect(result.content[0]).toMatchObject({ type: "text" });
  expect((result.content[0] as { text: string }).text).toContain("firecrawl search 失败");
  expect((result.content[0] as { text: string }).text).toContain("429");
  // error 不落 details（schema 推断 {query} 形状），显式错误在 content text。
  expect(result.details).toEqual({ query: "q" });
});

test("firecrawl_search execute: 网络错误 → error content", async () => {
  const tools = buildFirecrawlTools("test-key");
  const search = tools[0];
  mockFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  const result = await search.execute("call-1", { query: "q" }, undefined, undefined, {} as never);
  expect((result.content[0] as { text: string }).text).toContain("ECONNREFUSED");
});

test("firecrawl_search execute: 超时 → error content", async () => {
  const tools = buildFirecrawlTools("test-key");
  const search = tools[0];
  // 永不 resolve 的 fetch（30s 超时由 AbortController 触发，测试用外部 signal 提前 abort 验证路径）
  mockFetch((_url, init) => {
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  });
  const controller = new AbortController();
  const resultPromise = search.execute(
    "call-1",
    { query: "q" },
    controller.signal,
    undefined,
    {} as never,
  );
  controller.abort();
  const result = await resultPromise;
  expect((result.content[0] as { text: string }).text).toContain("firecrawl search 失败");
});

test("firecrawl_scrape execute: 成功 → markdown text content", async () => {
  const tools = buildFirecrawlTools("test-key");
  const scrape = tools[1];
  mockFetch((url, init) => {
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(JSON.parse(String(init.body))).toEqual({
      url: "https://example.com",
      formats: ["markdown"],
    });
    return okJson({ data: { markdown: "# Example\npage body" } });
  });
  const result = await scrape.execute(
    "call-2",
    { url: "https://example.com" },
    undefined,
    undefined,
    {} as never,
  );
  expect(result.content).toEqual([{ type: "text", text: "# Example\npage body" }]);
  expect(result.details).toEqual({ url: "https://example.com" });
});

test("firecrawl_scrape execute: 失败 → error content", async () => {
  const tools = buildFirecrawlTools("test-key");
  const scrape = tools[1];
  mockFetch(() => new Response("not found", { status: 404 }));
  const result = await scrape.execute(
    "call-2",
    { url: "https://example.com" },
    undefined,
    undefined,
    {} as never,
  );
  expect((result.content[0] as { text: string }).text).toContain("firecrawl scrape 失败");
  expect((result.content[0] as { text: string }).text).toContain("404");
});
