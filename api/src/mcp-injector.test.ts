import { describe, expect, it } from "bun:test";
import { ClaudeMcpInjector, CodexMcpInjector, buildMcpInjectorForProvider } from "./mcp-injector";
import { getAgentProviderProfile } from "./agent-provider-profiles";

describe("ClaudeMcpInjector", () => {
  const injector = new ClaudeMcpInjector();

  it("buildMcpConfig produces --mcp-config inline JSON with type http and loopback url", () => {
    const config = injector.buildMcpConfig({ project: "demo", mcpPort: 43013 });
    expect(config).not.toBeNull();
    expect(config!.args).toEqual(["--mcp-config", expect.any(String)]);
    expect(config!.args[0]).toBe("--mcp-config");

    const parsed = JSON.parse(config!.args[1]) as {
      mcpServers: { "ar-hub": { type: string; url: string } };
    };
    expect(parsed.mcpServers["ar-hub"].type).toBe("http");
    expect(parsed.mcpServers["ar-hub"].url).toBe("http://127.0.0.1:43013/mcp/demo");
  });

  it("encodes project name in the hub url", () => {
    const config = injector.buildMcpConfig({ project: "my proj", mcpPort: 43013 });
    const parsed = JSON.parse(config!.args[1]) as {
      mcpServers: { "ar-hub": { url: string } };
    };
    expect(parsed.mcpServers["ar-hub"].url).toBe("http://127.0.0.1:43013/mcp/my%20proj");
  });

  it("inlines toolTimeoutMs and appends ?origin only when sessionId is provided", () => {
    const config = injector.buildMcpConfig({
      project: "demo",
      mcpPort: 43013,
      sessionId: "agent_x1",
    });
    const parsed = JSON.parse(config!.args[1]) as {
      mcpServers: { "ar-hub": { url: string; toolTimeoutMs: number } };
    };
    expect(parsed.mcpServers["ar-hub"].toolTimeoutMs).toBe(180_000);
    expect(parsed.mcpServers["ar-hub"].url).toBe("http://127.0.0.1:43013/mcp/demo?origin=agent_x1");
    const withoutOrigin = injector.buildMcpConfig({ project: "demo", mcpPort: 43013 });
    const parsedPlain = JSON.parse(withoutOrigin!.args[1]) as {
      mcpServers: { "ar-hub": { url: string } };
    };
    expect(parsedPlain.mcpServers["ar-hub"].url).toBe("http://127.0.0.1:43013/mcp/demo");
  });

  it("does not include --strict-mcp-config (avoid disrupting existing runtime MCP config)", () => {
    const config = injector.buildMcpConfig({ project: "demo", mcpPort: 43013 });
    expect(config!.args).not.toContain("--strict-mcp-config");
  });
});

describe("CodexMcpInjector", () => {
  const injector = new CodexMcpInjector();

  it("buildMcpConfig produces -c TOML overrides with quoted loopback url + tool timeout (0.163 probe shape)", () => {
    const config = injector.buildMcpConfig({ project: "demo", mcpPort: 43013 });
    expect(config).not.toBeNull();
    expect(config!.args).toEqual([
      "-c",
      'mcp_servers.ar-hub.url="http://127.0.0.1:43013/mcp/demo"',
      "-c",
      "mcp_servers.ar-hub.tool_timeout_sec=180",
    ]);
  });

  it("encodes project name in the hub url", () => {
    const config = injector.buildMcpConfig({ project: "my proj", mcpPort: 43013 });
    expect(config!.args[1]).toBe('mcp_servers.ar-hub.url="http://127.0.0.1:43013/mcp/my%20proj"');
  });

  it("appends ?origin=<sessionId> to the hub url only when sessionId is provided", () => {
    const withOrigin = injector.buildMcpConfig({
      project: "demo",
      mcpPort: 43013,
      sessionId: "agent_x1",
    });
    expect(withOrigin!.args[1]).toBe(
      'mcp_servers.ar-hub.url="http://127.0.0.1:43013/mcp/demo?origin=agent_x1"',
    );
    const withoutOrigin = injector.buildMcpConfig({ project: "demo", mcpPort: 43013 });
    expect(withoutOrigin!.args[1]).toBe('mcp_servers.ar-hub.url="http://127.0.0.1:43013/mcp/demo"');
  });
});

describe("buildMcpInjectorForProvider", () => {
  it("returns ClaudeMcpInjector for claude", () => {
    const injector = buildMcpInjectorForProvider(getAgentProviderProfile("claude")!);
    expect(injector).toBeInstanceOf(ClaudeMcpInjector);
  });

  it("returns CodexMcpInjector for codex", () => {
    const injector = buildMcpInjectorForProvider(getAgentProviderProfile("codex")!);
    expect(injector).toBeInstanceOf(CodexMcpInjector);
  });

  it("returns null for omp (ACP transport has no spawn argv injection channel)", () => {
    const injector = buildMcpInjectorForProvider(getAgentProviderProfile("omp")!);
    expect(injector).toBeNull();
  });

  it("能力声明是门禁单源：mcpInject=unsupported 的 profile 即使 transport 有适配器也不注入", () => {
    const claude = getAgentProviderProfile("claude")!;
    const unsupported = {
      ...claude,
      capabilities: { ...claude.capabilities, mcpInject: "unsupported" as const },
    };
    expect(buildMcpInjectorForProvider(unsupported)).toBeNull();
  });
});
