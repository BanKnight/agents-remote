import { describe, expect, it } from "bun:test";
import { Claude2McpInjector, buildMcpInjectorForProvider } from "./mcp-injector";
import { getAgentProviderProfile } from "./agent-provider-profiles";

describe("Claude2McpInjector", () => {
  const injector = new Claude2McpInjector();

  it("canInject returns true only for claude2 profile", () => {
    const claude2 = getAgentProviderProfile("claude2")!;
    expect(injector.canInject(claude2)).toBe(true);

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

describe("buildMcpInjectorForProvider", () => {
  it("returns Claude2McpInjector for claude2", () => {
    const injector = buildMcpInjectorForProvider(getAgentProviderProfile("claude2")!);
    expect(injector).toBeInstanceOf(Claude2McpInjector);
  });

  it("returns null for codex (unsupported in base phase)", () => {
    const injector = buildMcpInjectorForProvider(getAgentProviderProfile("codex")!);
    expect(injector).toBeNull();
  });
});
