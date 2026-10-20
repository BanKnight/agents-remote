import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { startMcpHubServer, type McpHubServer } from "./mcp-hub-server";
import { ProjectWikiService } from "./project-wiki";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

const initBody = (id: number) =>
  JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  });

const listToolsBody = (id: number) =>
  JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list", params: {} });

const callToolBody = (id: number, name: string, args: Record<string, unknown>) =>
  JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

// MCP 响应是 SSE(event: message\ndata: <json>),created 等值被嵌套在 content[].text 的
// JSON 字符串里多层转义。解析首条 data 取 JSON-RPC result,断言语义而非文本匹配。
type McpSseResult = {
  result?: {
    content?: { text?: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    capabilities?: {
      extensions?: Record<string, unknown>;
      tools?: unknown;
      resources?: unknown;
    };
  };
};
const parseSseResult = async (res: Response): Promise<McpSseResult> => {
  const text = await res.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error(`SSE response has no data line: ${text}`);
  return JSON.parse(dataLine.slice("data: ".length)) as McpSseResult;
};

describe("MCP hub server (stateless, loopback)", () => {
  let projectsRoot: string;
  let home: string;
  let hub: McpHubServer;
  let baseUrl: string;

  beforeEach(async () => {
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-"));
    await mkdir(join(projectsRoot, "test"), { recursive: true });
    // skills 全局 scope 的假 home(测试注入,不碰真实 ~/.claude/skills)。
    home = await mkdtemp(join(tmpdir(), "ar-mcp-home-"));
    // port 0:OS 分配空闲端口,避免与 dev 服务撞端口。
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      home,
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
  });

  afterEach(async () => {
    hub.stop();
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  it("initialize returns 200 and no Mcp-Session-Id (stateless)", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(1),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const text = await res.text();
    expect(text).toContain("protocolVersion");
    expect(text).toContain('"id":1');
  });

  it("tools/list returns a response (empty shell: no tools capability)", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(2),
    });
    expect(res.status).toBe(200);
    // 空壳 McpServer 未声明 tools capability → SDK 返回 method not found(-32601)。
    // 这是基座空壳的预期行为;wiki 阶段注册工具后变为 {tools: [...]}。
    const text = await res.text();
    expect(text).toContain('"id":2');
  });

  it("rejects non-existent project with 404", async () => {
    const res = await fetch(`${baseUrl}/mcp/nonexistent`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(3),
    });
    expect(res.status).toBe(404);
  });

  it("rejects path traversal in project segment with 404", async () => {
    const res = await fetch(`${baseUrl}/mcp/..%2F..%2Fetc`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(4),
    });
    expect(res.status).toBe(404);
  });

  it("rejects non-loopback Host header with 403", async () => {
    // Host header 改成非 127.0.0.1/localhost → 模拟 DNS rebinding / tunnel 暴露。
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Host: "evil.example.com" },
      body: initBody(5),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-mcp paths", async () => {
    const res = await fetch(`${baseUrl}/something`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(6),
    });
    expect(res.status).toBe(404);
  });

  // ── wiki 能力域开关(按 per-project mcp.json capabilities 注册工具)──────────

  const writeMcpConfig = async (project: string, capabilities: Record<string, boolean>) => {
    await mkdir(join(projectsRoot, project, ".agents-remote"), { recursive: true });
    await writeFile(
      join(projectsRoot, project, ".agents-remote", "mcp.json"),
      JSON.stringify({ capabilities }),
    );
  };

  it("exposes wiki tools when capabilities.wiki=true", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(10),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("wiki_list_pages");
    expect(text).toContain("wiki_read_page");
    expect(text).toContain("wiki_write_page");
  });

  it("hides wiki tools when no mcp.json (capabilities default off)", async () => {
    // 无 .agents-remote/mcp.json → readProjectMcpConfig 返回 null → wiki 全关(空壳)。
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(11),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("wiki_");
  });

  it("hides wiki tools when capabilities.wiki=false", async () => {
    await writeMcpConfig("test", { wiki: false });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(12),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("wiki_");
  });

  it("wiki_write_page then wiki_read_page round-trips and lands on disk", async () => {
    await writeMcpConfig("test", { wiki: true });

    const writeRes = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(20, "wiki_write_page", {
        slug: "round-trip",
        title: "Round Trip",
        content: "hello wiki",
        tags: ["t"],
      }),
    });
    expect(writeRes.status).toBe(200);
    const writeTool = JSON.parse(
      (await parseSseResult(writeRes)).result?.content?.[0]?.text ?? "{}",
    );
    expect(writeTool.created).toBe(true);

    const readRes = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(21, "wiki_read_page", { slug: "round-trip" }),
    });
    expect(readRes.status).toBe(200);
    const readPage = JSON.parse((await parseSseResult(readRes)).result?.content?.[0]?.text ?? "{}");
    expect(readPage.frontmatter.title).toBe("Round Trip");
    expect(readPage.body).toContain("hello wiki");

    // 落盘验证:frontmatter 注入正确(由 wikiService.writePage 序列化)。
    const raw = await readFile(join(projectsRoot, "test", "wiki", "round-trip.md"), "utf8");
    expect(raw).toContain("title: Round Trip");
    expect(raw).toContain("hello wiki");
  });

  it("wiki_read_page on missing page returns isError (MCP tool error, not HTTP 500)", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(30, "wiki_read_page", { slug: "no-such-page" }),
    });
    expect(res.status).toBe(200); // MCP 工具错误是正常 200 返回,isError=true + message
    const text = await res.text();
    expect(text).toContain('"isError":true');
    expect(text).toContain("not found");
  });

  // ── ui 能力域(SEP-1865 MCP Apps:扩展声明 + ui:// 资源 + wiki_read_page display tool)──

  const readResourceBody = (id: number, uri: string) =>
    JSON.stringify({ jsonrpc: "2.0", id, method: "resources/read", params: { uri } });

  it("ui=true declares MCP Apps extension + resources capability in initialize result", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(40),
    });
    const capabilities = (await parseSseResult(res)).result?.capabilities;
    expect(capabilities?.extensions?.["io.modelcontextprotocol/ui"]).toEqual({
      mimeTypes: ["text/html;profile=mcp-app"],
    });
    expect(capabilities?.resources).toBeDefined();
  });

  it("ui=false (wiki only) declares no extensions and read tool has no _meta (regression)", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(41),
    });
    const capabilities = (await parseSseResult(res)).result?.capabilities;
    expect(capabilities?.extensions).toBeUndefined();

    const toolsRes = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(42),
    });
    const text = await toolsRes.text();
    expect(text).toContain("wiki_read_page");
    expect(text).not.toContain('"_meta"');
  });

  it("ui=true attaches _meta.ui.resourceUri on wiki_read_page tool definition", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(43),
    });
    const { result } = await parseSseResult(res);
    const tools = (result as unknown as { tools?: { name: string; _meta?: unknown }[] }).tools;
    const read = tools?.find((t) => t.name === "wiki_read_page");
    expect(read?._meta).toEqual({
      ui: { resourceUri: "ui://ar-hub/wiki-page", visibility: ["model", "app"] },
    });
  });

  it("ui=true wiki_read_page returns structuredContent for the web host", async () => {
    // 双开:ui 单开时 wiki_write_page 不注册(见上用例),准备数据用 write 需 wiki 同开。
    await writeMcpConfig("test", { wiki: true, ui: true });
    // 准备一页 wiki。
    await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(44, "wiki_write_page", {
        slug: "ui-card",
        title: "UI Card",
        content: "# Head\n\n- item1\n- item2",
        tags: ["demo"],
      }),
    });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(45, "wiki_read_page", { slug: "ui-card" }),
    });
    const sc = (await parseSseResult(res)).result?.structuredContent as Record<string, unknown>;
    expect(sc.kind).toBe("wiki-page");
    expect(sc.slug).toBe("ui-card");
    expect(sc.title).toBe("UI Card");
    expect(sc.tags).toEqual(["demo"]);
    expect(sc.markdown).toContain("item1");
  });

  it("ui=true serves ui://ar-hub/wiki-page HTML via resources/read", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(46, "ui://ar-hub/wiki-page"),
    });
    const { result } = await parseSseResult(res);
    const contents = (
      result as unknown as {
        contents?: { uri: string; mimeType: string; text: string }[];
      }
    ).contents;
    expect(contents?.[0]?.uri).toBe("ui://ar-hub/wiki-page");
    expect(contents?.[0]?.mimeType).toBe("text/html;profile=mcp-app");
    expect(contents?.[0]?.text).toContain("<!doctype html>");
    expect(contents?.[0]?.text).toContain("ui/notifications/tool-result");
  });

  it("ui 单开(wiki 关)只注册 wiki_read_page(list/write 不泄露)", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(47),
    });
    const text = await res.text();
    expect(text).toContain("wiki_read_page");
    expect(text).not.toContain("wiki_list_pages");
    expect(text).not.toContain("wiki_write_page");
  });

  it("resources/read on unknown ui:// uri returns protocol error", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(48, "ui://ar-hub/no-such"),
    });
    const text = await res.text();
    expect(text).toContain('"code":-32602'); // invalid params:resource not found
  });

  // ── skills 能力域(SEP-2640:扩展声明 + skills/list-get + skill:// 资源读取)──

  const skillsListBody = (id: number, cursor?: string) =>
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "skills/list",
      params: cursor ? { cursor } : {},
    });

  const skillsGetBody = (id: number, uri: string) =>
    JSON.stringify({ jsonrpc: "2.0", id, method: "skills/get", params: { uri } });

  /** 在指定 scope 写一个 skill fixture(SKILL.md + 可选 supporting files)。 */
  const writeSkillFixture = async (
    scope: "project" | "global",
    dirName: string,
    frontmatter: string,
    extraFiles?: Record<string, string>,
  ) => {
    const dir =
      scope === "project"
        ? join(projectsRoot, "test", ".claude", "skills", dirName)
        : join(home, ".claude", "skills", dirName);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\n# Body\n\nskill body ok\n`);
    for (const [rel, content] of Object.entries(extraFiles ?? {})) {
      const abs = join(dir, ...rel.split("/"));
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
    }
  };

  it("skills=true declares SEP-2640 extension + resources capability", async () => {
    await writeMcpConfig("test", { skills: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(50),
    });
    const capabilities = (await parseSseResult(res)).result?.capabilities;
    expect(capabilities?.extensions?.["io.modelcontextprotocol/skills"]).toEqual({});
    expect(capabilities?.resources).toBeDefined();
  });

  it("skills/list returns full SEP entry (uri/frontmatter/resources with digest+size)", async () => {
    await writeMcpConfig("test", { skills: true });
    await writeSkillFixture(
      "project",
      "demo-skill",
      "name: demo-skill\ndescription: Demo skill for hub tests",
      { "scripts/helper.md": "helper content" },
    );
    // 无 frontmatter name → 目录名兜底(URI 末段=frontmatter.name 自洽)。
    await writeSkillFixture("project", "fallback-skill", "description: no name here");

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(51),
    });
    const { result } = await parseSseResult(res);
    const list = result as unknown as {
      resultType?: string;
      ttlMs?: number;
      cacheScope?: string;
      nextCursor?: string;
      skills?: {
        uri: string;
        frontmatter: Record<string, string>;
        resources: { uri: string; digest: string; size: number }[];
      }[];
    };
    expect(list.resultType).toBe("complete");
    expect(list.ttlMs).toBe(300_000);
    expect(list.cacheScope).toBe("private");
    expect(list.nextCursor).toBeUndefined(); // 单页全量(≤50 条)。

    const demo = list.skills?.find((s) => s.uri === "skill://demo-skill/SKILL.md");
    expect(demo?.frontmatter).toEqual({
      name: "demo-skill",
      description: "Demo skill for hub tests",
    });
    expect(demo?.resources).toHaveLength(2);
    const manifest = demo?.resources.find((r) => r.uri === "skill://demo-skill/SKILL.md");
    expect(manifest?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest?.size).toBeGreaterThan(0);
    const helper = demo?.resources.find((r) => r.uri === "skill://demo-skill/scripts/helper.md");
    expect(helper?.size).toBe("helper content".length);
    expect(helper?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    // name 缺失 → 目录名兜底。
    const fallback = list.skills?.find((s) => s.uri === "skill://fallback-skill/SKILL.md");
    expect(fallback?.frontmatter.name).toBe("fallback-skill");
    expect(fallback?.frontmatter.description).toBe("no name here");
  });

  it("skills off → skills/list is method not found (-32601)", async () => {
    await writeMcpConfig("test", {});
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(52),
    });
    const text = await res.text();
    expect(text).toContain('"code":-32601');
  });

  it("skills/get returns the entry for a listed skill; unknown uri → -32602", async () => {
    await writeMcpConfig("test", { skills: true });
    await writeSkillFixture("project", "demo-skill", "name: demo-skill\ndescription: D");

    const ok = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsGetBody(53, "skill://demo-skill/SKILL.md"),
    });
    const { result } = await parseSseResult(ok);
    const skill = (result as unknown as { skill?: { uri: string; resultType?: string } }).skill;
    expect(skill?.uri).toBe("skill://demo-skill/SKILL.md");
    expect((result as unknown as { resultType: string }).resultType).toBe("complete");
    expect((result as unknown as { cacheScope: string }).cacheScope).toBe("private");

    const missing = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsGetBody(54, "skill://no-such/SKILL.md"),
    });
    expect(await missing.text()).toContain('"code":-32602');
  });

  it("resources/read serves SKILL.md and nested supporting file; manifest-外 → -32602", async () => {
    await writeMcpConfig("test", { skills: true });
    await writeSkillFixture("project", "demo-skill", "name: demo-skill\ndescription: D", {
      "scripts/helper.md": "helper content",
    });

    const manifest = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(55, "skill://demo-skill/SKILL.md"),
    });
    const { result } = await parseSseResult(manifest);
    const contents = (
      result as unknown as { contents?: { uri: string; mimeType: string; text: string }[] }
    ).contents;
    expect(contents?.[0]?.uri).toBe("skill://demo-skill/SKILL.md");
    expect(contents?.[0]?.mimeType).toBe("text/markdown");
    expect(contents?.[0]?.text).toContain("skill body ok");

    const helper = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(56, "skill://demo-skill/scripts/helper.md"),
    });
    const helperResult = await parseSseResult(helper);
    const helperText = (helperResult.result as unknown as { contents?: { text: string }[] })
      ?.contents?.[0]?.text;
    expect(helperText).toBe("helper content");

    // 清单外(遍历形状)→ -32602:只 serve 扫描时列出的文件。
    const traversal = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(57, "skill://demo-skill/../../etc/passwd"),
    });
    expect(await traversal.text()).toContain('"code":-32602');
  });

  it("global scope merges; same-name skill: project scope wins", async () => {
    await writeMcpConfig("test", { skills: true });
    // 全局 only 的 skill。
    await writeSkillFixture("global", "global-only", "name: global-only\ndescription: from global");
    // 同名双 scope:项目版 description 不同 → 断言项目版胜出。
    await writeSkillFixture("project", "shared", "name: shared\ndescription: project version");
    await writeSkillFixture("global", "shared", "name: shared\ndescription: global version");

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(58),
    });
    const { result } = await parseSseResult(res);
    const skills = (
      result as unknown as { skills?: { uri: string; frontmatter: Record<string, string> }[] }
    ).skills;
    expect(skills?.map((s) => s.uri)).toContain("skill://global-only/SKILL.md");
    const shared = skills?.filter((s) => s.uri === "skill://shared/SKILL.md");
    expect(shared).toHaveLength(1);
    expect(shared?.[0]?.frontmatter.description).toBe("project version");
  });

  it("resources/read returns non-ASCII / space / dotdot-named listed files (uri→path map)", async () => {
    await writeMcpConfig("test", { skills: true });
    await writeSkillFixture("project", "demo-skill", "name: demo-skill\ndescription: D", {
      "中文笔记.md": "chinese content",
      "space name.md": "spaced content",
      "a..b.md": "dotdot content",
    });

    // 清单「列出即承诺」:三个文件 uri 都在 resources 里。
    const list = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(59),
    });
    const { result } = await parseSseResult(list);
    const uris = (
      result as unknown as { skills?: { resources: { uri: string }[] }[] }
    ).skills?.flatMap((s) => s.resources.map((r) => r.uri));
    const cases: [string, string][] = [
      ["中文笔记.md", "chinese content"],
      ["space name.md", "spaced content"],
      ["a..b.md", "dotdot content"],
    ];
    for (const [rel, expected] of cases) {
      const uri = `skill://demo-skill/${encodeURIComponent(rel)}`;
      expect(uris).toContain(uri);
      const res = await fetch(`${baseUrl}/mcp/test`, {
        method: "POST",
        headers: MCP_HEADERS,
        body: readResourceBody(60 + cases.findIndex(([r]) => r === rel), uri),
      });
      const { result: readResult } = await parseSseResult(res);
      expect(
        (readResult as unknown as { contents?: { text: string }[] })?.contents?.[0]?.text,
      ).toBe(expected);
    }
  });

  it("skill exceeding SEP limits (512 files) is skipped entirely", async () => {
    await writeMcpConfig("test", { skills: true });
    const dir = join(projectsRoot, "test", ".claude", "skills", "oversized");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), "---\nname: oversized\n---\n\nbody\n");
    for (let i = 0; i < 513; i++) await writeFile(join(dir, `f${i}.txt`), "x");
    await writeSkillFixture("project", "demo-skill", "name: demo-skill\ndescription: D");

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(70),
    });
    const { result } = await parseSseResult(res);
    const uris = (result as unknown as { skills?: { uri: string }[] }).skills?.map((s) => s.uri);
    expect(uris).not.toContain("skill://oversized/SKILL.md"); // 超上限整体跳过,不出非法截断 entry。
    expect(uris).toContain("skill://demo-skill/SKILL.md"); // 正常 skill 不受影响。
  });

  it("skill dir symlink pointing outside the skills root is not served", async () => {
    await writeMcpConfig("test", { skills: true });
    // 外部目录(在 projectsRoot 下但不在任何 skills 根之下)。
    const outside = join(projectsRoot, "outside-skill-source");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "SKILL.md"), "---\nname: evil-skill\n---\n\noutside\n");
    const link = join(projectsRoot, "test", ".claude", "skills", "alias");
    await mkdir(dirname(link), { recursive: true });
    await symlink(outside, link);
    await writeSkillFixture("project", "demo-skill", "name: demo-skill\ndescription: D");

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(71),
    });
    const { result } = await parseSseResult(res);
    const uris = (result as unknown as { skills?: { uri: string }[] }).skills?.map((s) => s.uri);
    expect(uris).not.toContain("skill://evil-skill/SKILL.md"); // 根级 symlink → 外部,不分发。
    expect(uris).toContain("skill://demo-skill/SKILL.md"); // 正常 skill 不受影响。
  });
});
