import { describe, expect, it } from "bun:test";
import { ClaudeMcpInjector, CodexMcpInjector, buildMcpInjectorForProvider } from "./mcp-injector";
import { getAgentProviderProfile } from "./agent-provider-profiles";

describe("ClaudeMcpInjector", () => {
  const injector = new ClaudeMcpInjector();

  it("canInject returns true only for claude profile", () => {
    const claude = getAgentProviderProfile("claude")!;
    expect(injector.canInject(claude)).toBe(true);

    const codex = getAgentProviderProfile("codex")!;
    expect(injector.canInject(codex)).toBe(false);
  });

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

  it("does not include --strict-mcp-config (avoid disrupting existing runtime MCP config)", () => {
    const config = injector.buildMcpConfig({ project: "demo", mcpPort: 43013 });
    expect(config!.args).not.toContain("--strict-mcp-config");
  });
});

describe("CodexMcpInjector", () => {
  const injector = new CodexMcpInjector();

  it("canInject returns true only for codex profile", () => {
    const codex = getAgentProviderProfile("codex")!;
    expect(injector.canInject(codex)).toBe(true);

    const claude = getAgentProviderProfile("claude")!;
    expect(injector.canInject(claude)).toBe(false);
  });

  it("buildMcpConfig produces -c TOML override with quoted loopback url (0.163 probe shape)", () => {
    const config = injector.buildMcpConfig({ project: "demo", mcpPort: 43013 });
    expect(config).not.toBeNull();
    expect(config!.args).toEqual([
      "-c",
      'mcp_servers.ar-hub.url="http://127.0.0.1:43013/mcp/demo"',
    ]);
  });

  it("encodes project name in the hub url", () => {
    const config = injector.buildMcpConfig({ project: "my proj", mcpPort: 43013 });
    expect(config!.args[1]).toBe('mcp_servers.ar-hub.url="http://127.0.0.1:43013/mcp/my%20proj"');
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
});
