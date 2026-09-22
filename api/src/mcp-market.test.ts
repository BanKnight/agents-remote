import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mcpMarketEntryToInstallRequest } from "@agents-remote/shared";
import type { McpMarketEntry } from "@agents-remote/shared";

const { normalizeMcpMarketEntries, searchMcpMarket, handleMcpMarketRoutes } =
  await import("./mcp-market");

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function setFetch(response: { ok: boolean; status: number; json: () => Promise<unknown> }): void {
  globalThis.fetch = mock(() => Promise.resolve(response)) as unknown as typeof globalThis.fetch;
}

/** registry 响应项构造器（外层 { server: ... } 包装）。 */
function entry(server: unknown): unknown {
  return { server };
}

describe("normalizeMcpMarketEntries", () => {
  it("取 reverse-domain 末段为安装名并规整 remote/package", () => {
    const entries = normalizeMcpMarketEntries([
      entry({
        name: "io.github.user/github-mcp-server",
        description: "GitHub official MCP server",
        version: "1.2.0",
        repository: { source: "github" },
        packages: [
          {
            registryType: "npm",
            identifier: "@modelcontextprotocol/server-github",
            version: "0.9.0",
            environmentVariables: [
              { name: "GITHUB_TOKEN", required: true, isSecret: true },
              { name: "OPTIONAL_VAR", required: false },
            ],
          },
          { registryType: "pypi", identifier: "some-pkg" },
        ],
      }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      registryName: "io.github.user/github-mcp-server",
      name: "github-mcp-server",
      description: "GitHub official MCP server",
      version: "1.2.0",
      repositorySource: "github",
      remote: null,
      package: {
        registryType: "npm",
        identifier: "@modelcontextprotocol/server-github",
        version: "0.9.0",
        requiredEnv: [{ name: "GITHUB_TOKEN", isSecret: true }],
      },
    });
  });

  it("streamable-http 归一为 http，必填 headers 提取", () => {
    const entries = normalizeMcpMarketEntries([
      entry({
        name: "acme/remote-server",
        remotes: [
          {
            type: "streamable-http",
            url: "https://mcp.acme.io/sse",
            headers: [
              { name: "Authorization", isRequired: true, isSecret: true },
              { name: "X-Optional", isRequired: false },
            ],
          },
        ],
      }),
    ]);
    expect(entries[0]?.remote).toEqual({
      transport: "http",
      url: "https://mcp.acme.io/sse",
      requiredHeaders: [{ name: "Authorization", isSecret: true }],
    });
    expect(entries[0]?.package).toBeNull();
  });

  it("安装名不合法（含非法字符）整条跳过", () => {
    const entries = normalizeMcpMarketEntries([
      entry({ name: "acme/bad name!" }),
      entry({ name: "acme/ok-name" }),
      { noServer: true },
    ]);
    expect(entries.map((e) => e.name)).toEqual(["ok-name"]);
  });

  it("非数组输入返回空", () => {
    expect(normalizeMcpMarketEntries(undefined)).toEqual([]);
    expect(normalizeMcpMarketEntries({ servers: [] })).toEqual([]);
  });
});

describe("searchMcpMarket", () => {
  it("query < 2 字符不发 fetch 直接短路", async () => {
    const res = await searchMcpMarket("a");
    expect(res).toEqual({ query: "a", servers: [], count: 0 });
  });

  it("正常路径：URL 带 search/limit/version=latest，规整结果", async () => {
    const fetchMock = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          servers: [entry({ name: "io.github.x/context7", description: "docs" })],
        }),
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const res = await searchMcpMarket("ctx");
    expect(res.count).toBe(1);
    expect(res.servers[0]?.name).toBe("context7");
    const url = (fetchMock.mock.calls[0]?.[0] as string) ?? "";
    expect(url).toContain("https://registry.modelcontextprotocol.io/v0/servers?");
    expect(url).toContain("search=ctx");
    expect(url).toContain("limit=20");
    expect(url).toContain("version=latest");
  });

  it("registry 非 200 / 坏 JSON / 网络错误 → MCP_MARKET_FETCH_FAILED", async () => {
    setFetch({ ok: false, status: 500, json: async () => ({}) });
    await expect(searchMcpMarket("xyz")).rejects.toMatchObject({
      code: "MCP_MARKET_FETCH_FAILED",
    });
    setFetch({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error("bad json")),
    });
    await expect(searchMcpMarket("xyz")).rejects.toMatchObject({
      code: "MCP_MARKET_FETCH_FAILED",
    });
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("net down")),
    ) as unknown as typeof globalThis.fetch;
    await expect(searchMcpMarket("xyz")).rejects.toMatchObject({
      code: "MCP_MARKET_FETCH_FAILED",
    });
  });
});

describe("handleMcpMarketRoutes", () => {
  it("仅匹配 GET /api/mcp/search；fetch 失败映射 502", async () => {
    expect(
      await handleMcpMarketRoutes(
        new Request("https://x/api/mcp/search?q=a"),
        new URL("https://x/api/mcp/search?q=a"),
      ),
    ).toEqual(Response.json({ query: "a", servers: [], count: 0 }));

    expect(
      await handleMcpMarketRoutes(
        new Request("https://x/api/mcp", { method: "POST" }),
        new URL("https://x/api/mcp"),
      ),
    ).toBeUndefined();

    setFetch({ ok: false, status: 503, json: async () => ({}) });
    const res = await handleMcpMarketRoutes(
      new Request("https://x/api/mcp/search?q=xyz"),
      new URL("https://x/api/mcp/search?q=xyz"),
    );
    expect(res?.status).toBe(502);
    const body = (await res?.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MCP_MARKET_FETCH_FAILED");
  });
});

describe("mcpMarketEntryToInstallRequest", () => {
  const base = {
    registryName: "io.github.user/pkg",
    name: "pkg",
    remote: null,
    package: null,
  } satisfies McpMarketEntry;

  it("remote 优先 → http/sse 直连 + headers", () => {
    const req = mcpMarketEntryToInstallRequest(
      {
        ...base,
        remote: {
          transport: "http",
          url: "https://mcp.x.io",
          requiredHeaders: [{ name: "Authorization", isSecret: true }],
        },
        package: { registryType: "npm", identifier: "ignored" },
      },
      { headers: { Authorization: "Bearer t" } },
    );
    expect(req).toEqual({
      name: "pkg",
      type: "http",
      url: "https://mcp.x.io",
      headers: { Authorization: "Bearer t" },
    });
  });

  it("无 remote → npm 包翻译为 npx stdio + env", () => {
    const req = mcpMarketEntryToInstallRequest(
      {
        ...base,
        package: {
          registryType: "npm",
          identifier: "@scope/srv",
          requiredEnv: [{ name: "API_KEY" }],
        },
      },
      { env: { API_KEY: "v" } },
    );
    expect(req).toEqual({
      name: "pkg",
      type: "stdio",
      command: "npx",
      args: ["-y", "@scope/srv"],
      env: { API_KEY: "v" },
    });
  });

  it("两者皆无 → null（不可一键安装）；空 values 不并入", () => {
    expect(mcpMarketEntryToInstallRequest(base, {})).toBeNull();
    const req = mcpMarketEntryToInstallRequest(
      { ...base, remote: { transport: "sse", url: "https://s.io", requiredHeaders: [] } },
      {},
    );
    expect(req).toEqual({ name: "pkg", type: "sse", url: "https://s.io" });
  });
});
