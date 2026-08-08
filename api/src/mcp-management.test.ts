import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type CmdResult = { exitCode: number; stdout: string; stderr: string };
type CallOpts = { timeoutMs?: number; cwd?: string; makeError: (m: string) => Error };

// mock cli-process 的 spawn 执行，断言 argv；mcp-validate 保留真值（不被 mock）。
const runCliTool = mock<(cmd: string[], opts: CallOpts) => Promise<CmdResult>>();

mock.module("./cli-process", () => ({
  runCliTool,
  DEFAULT_TIMEOUT_MS: 60_000,
}));

const {
  parseMcpServers,
  sanitizeMcpName,
  listProjectMcpServers,
  addMcpServer,
  removeMcpServer,
  handleMcpRoutes,
} = await import("./mcp-management");

let rootDir: string;

beforeEach(async () => {
  runCliTool.mockReset();
  rootDir = await mkdtemp(join(tmpdir(), "ar-mcp-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function ok(): CmdResult {
  return { exitCode: 0, stdout: "", stderr: "" };
}

function fail(stderr: string): CmdResult {
  return { exitCode: 1, stdout: "", stderr };
}

async function makeProject(name: string): Promise<string> {
  const dir = join(rootDir, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("parseMcpServers", () => {
  it("parses stdio / http / sse with full fidelity", () => {
    const servers = parseMcpServers({
      stdio1: { type: "stdio", command: "npx", args: ["-y", "srv"], env: { K: "v" } },
      http1: { type: "http", url: "https://x.io/mcp", headers: { Auth: "Bearer x" } },
      sse1: { type: "sse", url: "https://x.io/sse" },
    });
    expect(servers).toContainEqual({
      name: "stdio1",
      type: "stdio",
      command: "npx",
      args: ["-y", "srv"],
      env: { K: "v" },
    });
    expect(servers).toContainEqual({
      name: "http1",
      type: "http",
      url: "https://x.io/mcp",
      headers: { Auth: "Bearer x" },
    });
    expect(servers).toContainEqual({ name: "sse1", type: "sse", url: "https://x.io/sse" });
  });

  it("infers type for legacy entries (no type field)", () => {
    const servers = parseMcpServers({
      legacy_stdio: { command: "node", args: ["s.js"] },
      legacy_http: { url: "https://x.io/mcp" },
    });
    expect(servers).toEqual([
      { name: "legacy_stdio", type: "stdio", command: "node", args: ["s.js"] },
      { name: "legacy_http", type: "http", url: "https://x.io/mcp" },
    ]);
  });

  it("stringifies non-string env/header values and drops empty", () => {
    const servers = parseMcpServers({
      s: { type: "stdio", command: "c", env: { N: 5, S: "x", E: null as unknown as string } },
    });
    expect(servers[0].env).toEqual({ N: "5", S: "x" });
  });

  it("drops malformed entries (no command/url, non-object, unknown type)", () => {
    expect(parseMcpServers({ bad: { type: "weird" }, empty: {}, arr: [1, 2] })).toEqual([]);
  });

  it("returns empty for null/array/non-object input", () => {
    expect(parseMcpServers(null)).toEqual([]);
    expect(parseMcpServers([1])).toEqual([]);
    expect(parseMcpServers(undefined)).toEqual([]);
  });
});

describe("sanitizeMcpName", () => {
  it("accepts safe names", () => {
    expect(sanitizeMcpName("my-server.v1")).toBe("my-server.v1");
  });

  it("rejects empty / shell / path / null-byte", () => {
    for (const bad of ["", "a b", "a;b", "../x", "a\0b", "a/b"]) {
      expect(() => sanitizeMcpName(bad)).toThrow(/Invalid MCP server name/);
    }
  });
});

describe("addMcpServer", () => {
  it("builds stdio argv with name before -e and -- before command", async () => {
    runCliTool.mockResolvedValue(ok());
    await addMcpServer(
      { name: "srv", type: "stdio", command: "npx", args: ["-y", "pkg"], env: { K: "v" } },
      "user",
      {},
    );
    const [cmd, opts] = runCliTool.mock.calls[0];
    expect(cmd).toEqual([
      "claude",
      "mcp",
      "add",
      "srv",
      "-s",
      "user",
      "-e",
      "K=v",
      "--",
      "npx",
      "-y",
      "pkg",
    ]);
    expect(opts?.cwd).toBeUndefined();
  });

  it("builds stdio argv without -e when no env", async () => {
    runCliTool.mockResolvedValue(ok());
    await addMcpServer({ name: "srv", type: "stdio", command: "node" }, "user", {});
    expect(runCliTool.mock.calls[0][0]).toEqual([
      "claude",
      "mcp",
      "add",
      "srv",
      "-s",
      "user",
      "--",
      "node",
    ]);
  });

  it("builds http/sse argv with --transport", async () => {
    runCliTool.mockResolvedValue(ok());
    await addMcpServer({ name: "h", type: "http", url: "https://x.io/mcp" }, "user", {});
    expect(runCliTool.mock.calls[0][0]).toEqual([
      "claude",
      "mcp",
      "add",
      "--transport",
      "http",
      "-s",
      "user",
      "h",
      "https://x.io/mcp",
    ]);
  });

  it("passes project path as cwd for project scope", async () => {
    const dir = await makeProject("p1");
    runCliTool.mockResolvedValue(ok());
    await addMcpServer({ name: "s", type: "stdio", command: "c" }, "project", {
      projectsRoot: rootDir,
      projectName: "p1",
    });
    expect(runCliTool.mock.calls[0][1]?.cwd).toBe(dir);
  });

  it("returns the entry on success", async () => {
    runCliTool.mockResolvedValue(ok());
    const res = await addMcpServer(
      { name: "s", type: "stdio", command: "c", args: ["a"] },
      "user",
      {},
    );
    expect(res).toEqual({
      ok: true,
      server: { name: "s", type: "stdio", command: "c", args: ["a"] },
    });
  });

  it("throws MCP_ADD_FAILED on non-zero exit", async () => {
    runCliTool.mockResolvedValue(fail("already exists"));
    await expect(
      addMcpServer({ name: "s", type: "stdio", command: "c" }, "user", {}),
    ).rejects.toThrow(/claude mcp add failed/);
  });

  it("throws when stdio missing command or http missing url", async () => {
    await expect(addMcpServer({ name: "s", type: "stdio" }, "user", {})).rejects.toThrow(
      /requires a command/,
    );
    await expect(addMcpServer({ name: "s", type: "http" }, "user", {})).rejects.toThrow(
      /requires a url/,
    );
    expect(runCliTool).not.toHaveBeenCalled();
  });

  it("throws when project scope lacks project context", async () => {
    await expect(
      addMcpServer({ name: "s", type: "stdio", command: "c" }, "project", {}),
    ).rejects.toThrow(/requires a project/);
  });
});

describe("removeMcpServer", () => {
  it("builds remove argv with scope", async () => {
    runCliTool.mockResolvedValue(ok());
    const res = await removeMcpServer("srv", "user", {});
    expect(runCliTool.mock.calls[0][0]).toEqual(["claude", "mcp", "remove", "srv", "-s", "user"]);
    expect(res).toEqual({ ok: true, name: "srv" });
  });

  it("throws MCP_REMOVE_FAILED on non-zero exit", async () => {
    runCliTool.mockResolvedValue(fail("not found"));
    await expect(removeMcpServer("srv", "user", {})).rejects.toThrow(/claude mcp remove failed/);
  });
});

describe("listProjectMcpServers", () => {
  it("reads project .mcp.json mcpServers", async () => {
    await makeProject("p1");
    await writeFile(
      join(rootDir, "p1", ".mcp.json"),
      JSON.stringify({
        mcpServers: { s: { type: "stdio", command: "c" } },
      }),
    );
    const res = await listProjectMcpServers(rootDir, "p1");
    expect(res.servers).toEqual([{ name: "s", type: "stdio", command: "c" }]);
  });

  it("returns empty when project has no .mcp.json", async () => {
    await makeProject("p1");
    const res = await listProjectMcpServers(rootDir, "p1");
    expect(res.servers).toEqual([]);
  });

  it("rejects unknown project (PROJECT_NOT_FOUND)", async () => {
    await expect(listProjectMcpServers(rootDir, "missing")).rejects.toThrow(/Project not found/);
  });
});

describe("handleMcpRoutes", () => {
  function req(method: string, pathname: string, body?: unknown): Request {
    return new Request(`http://x${pathname}`, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    });
  }

  it("dispatches user list/add/remove", async () => {
    runCliTool.mockResolvedValue(ok());
    const listRes = await handleMcpRoutes(req("GET", "/api/mcp"), new URL("http://x/api/mcp"), {});
    expect(listRes?.status).toBe(200);
    const listBody = (await listRes!.json()) as { servers: unknown[] };
    expect(Array.isArray(listBody.servers)).toBe(true); // 直读真实 ~/.claude.json，仅断言结构

    const addRes = await handleMcpRoutes(
      req("POST", "/api/mcp/add", { name: "s", type: "stdio", command: "c" }),
      new URL("http://x/api/mcp/add"),
      {},
    );
    expect(addRes?.status).toBe(201);

    const rmRes = await handleMcpRoutes(
      req("POST", "/api/mcp/remove", { name: "s" }),
      new URL("http://x/api/mcp/remove"),
      {},
    );
    expect(rmRes?.status).toBe(200);
    expect(await rmRes!.json()).toEqual({ ok: true, name: "s" });
  });

  it("dispatches project scope with projectsRoot", async () => {
    await makeProject("p1");
    runCliTool.mockResolvedValue(ok());
    await writeFile(join(rootDir, "p1", ".mcp.json"), JSON.stringify({ mcpServers: {} }));

    const deps = { projectsRoot: rootDir };
    const listRes = await handleMcpRoutes(
      req("GET", "/api/projects/p1/mcp"),
      new URL("http://x/api/projects/p1/mcp"),
      deps,
    );
    expect(listRes?.status).toBe(200);

    const addRes = await handleMcpRoutes(
      req("POST", "/api/projects/p1/mcp/add", { name: "s", type: "http", url: "https://x" }),
      new URL("http://x/api/projects/p1/mcp/add"),
      deps,
    );
    expect(addRes?.status).toBe(201);
    expect(runCliTool.mock.calls[0][1]?.cwd).toBe(join(rootDir, "p1"));
  });

  it("returns undefined for unmatched path / wrong method", async () => {
    expect(
      await handleMcpRoutes(req("GET", "/api/other"), new URL("http://x/api/other"), {}),
    ).toBeUndefined();
    expect(
      await handleMcpRoutes(req("PUT", "/api/mcp"), new URL("http://x/api/mcp"), {}),
    ).toBeUndefined();
  });

  it("returns 404 for unknown project on project scope", async () => {
    const res = await handleMcpRoutes(
      req("GET", "/api/projects/missing/mcp"),
      new URL("http://x/api/projects/missing/mcp"),
      { projectsRoot: rootDir },
    );
    expect(res?.status).toBe(404);
  });

  it("returns 400 for invalid MCP name", async () => {
    const res = await handleMcpRoutes(
      req("POST", "/api/mcp/remove", { name: "bad name" }),
      new URL("http://x/api/mcp/remove"),
      {},
    );
    expect(res?.status).toBe(400);
  });
});
