import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as validate from "./skill-validate";
import { SettingsStore } from "./settings-store";
import type { Claude2Runtime } from "./claude2-runtime";

type CmdResult = { exitCode: number; stdout: string; stderr: string };

// mock skill-process 的 spawn 执行；校验纯函数保留真值（skill-validate 不被 mock）。
const runSkillsCommand = mock<(args: string[], opts?: unknown) => Promise<CmdResult>>();

mock.module("./skill-process", () => ({
  ...validate,
  runSkillsCommand,
  INSTALL_SKILL_TIMEOUT_MS: 300_000,
}));

const {
  searchSkillMarket,
  listInstalledSkills,
  installSkill,
  uninstallSkill,
  previewInstalledSkill,
  listSkillSources,
  addSkillSource,
  removeSkillSource,
  handleSkillRoutes,
} = await import("./skill-market");

let store: SettingsStore;
let storeDir: string;
let originalFetch: typeof globalThis.fetch;

beforeEach(async () => {
  runSkillsCommand.mockReset();
  storeDir = await mkdtemp(join(tmpdir(), "ar-store-"));
  store = new SettingsStore({ path: join(storeDir, "providers.json") });
  originalFetch = globalThis.fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await rm(storeDir, { recursive: true, force: true });
});

function setFetch(response: { ok: boolean; status: number; json: () => Promise<unknown> }): void {
  globalThis.fetch = mock(() => Promise.resolve(response)) as unknown as typeof globalThis.fetch;
}

const claudeList: CmdResult = {
  exitCode: 0,
  stdout: JSON.stringify([
    { name: "tdd", path: "/tmp/ar-skills/tdd", scope: "global", agents: ["Claude Code"] },
    { name: "codex-only", path: "/tmp/ar-skills/codex-only", scope: "global", agents: ["Codex"] },
  ]),
  stderr: "",
};

describe("searchSkillMarket", () => {
  it("returns empty for query < 2 chars without calling fetch", async () => {
    const res = await searchSkillMarket("a");
    expect(res).toEqual({ query: "a", skills: [], count: 0 });
  });

  it("parses skills.sh entries and drops malformed", async () => {
    setFetch({
      ok: true,
      status: 200,
      json: async () => ({
        skills: [
          {
            id: "mattpocock/skills/tdd",
            skillId: "tdd",
            name: "tdd",
            installs: 460,
            source: "mattpocock/skills",
          },
          { id: "x/y/z", skillId: "z", name: "z", installs: 0, source: "x/y" },
          { notName: true },
        ],
      }),
    });
    const res = await searchSkillMarket("tdd");
    expect(res.count).toBe(2);
    expect(res.skills[0]).toEqual({
      id: "mattpocock/skills/tdd",
      skillId: "tdd",
      name: "tdd",
      installs: 460,
      source: "mattpocock/skills",
    });
  });

  it("throws SKILL_MARKET_FETCH_FAILED on non-ok", async () => {
    setFetch({ ok: false, status: 500, json: async () => ({}) });
    await expect(searchSkillMarket("tdd")).rejects.toMatchObject({
      code: "SKILL_MARKET_FETCH_FAILED",
    });
  });
});

describe("listInstalledSkills", () => {
  it("filters by agent", async () => {
    runSkillsCommand.mockResolvedValue(claudeList);
    const res = await listInstalledSkills("claude-code");
    expect(res.skills.map((s) => s.name)).toEqual(["tdd"]);
  });

  it("throws SKILL_LIST_FAILED on exitCode != 0", async () => {
    runSkillsCommand.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "boom" });
    await expect(listInstalledSkills("claude-code")).rejects.toMatchObject({
      code: "SKILL_LIST_FAILED",
    });
  });
});

describe("installSkill", () => {
  it("installs, reloads alive sessions, reads back truth", async () => {
    runSkillsCommand.mockImplementation(async (args) => {
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      return claudeList;
    });
    const write = mock(() => Promise.resolve());
    const claude2Runtime = {
      listAliveRuntimeKeys: () => Promise.resolve(new Set(["s1"])),
      write,
    } as unknown as Claude2Runtime;
    const res = await installSkill(
      { source: "mattpocock/skills", skillId: "tdd", agent: "claude-code" },
      { settingsStore: store, claude2Runtime },
    );
    expect(res.ok).toBe(true);
    expect(res.skill.name).toBe("tdd");
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1]).toBe("/reload-skills\n");
  });

  it("throws SKILL_INSTALL_FAILED on add failure", async () => {
    runSkillsCommand.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "nope" });
    await expect(
      installSkill(
        { source: "a/b", skillId: "tdd", agent: "claude-code" },
        { settingsStore: store },
      ),
    ).rejects.toMatchObject({ code: "SKILL_INSTALL_FAILED" });
  });

  it("rejects invalid source before spawning", async () => {
    await expect(
      installSkill(
        { source: "../etc", skillId: "tdd", agent: "claude-code" },
        { settingsStore: store },
      ),
    ).rejects.toMatchObject({ code: "SKILL_SOURCE_INVALID" });
    expect(runSkillsCommand).not.toHaveBeenCalled();
  });
});

describe("uninstallSkill", () => {
  it("uninstalls + reloads", async () => {
    runSkillsCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const write = mock(() => Promise.resolve());
    const claude2Runtime = {
      listAliveRuntimeKeys: () => Promise.resolve(new Set()),
      write,
    } as unknown as Claude2Runtime;
    const res = await uninstallSkill(
      { name: "tdd", agent: "claude-code" },
      { settingsStore: store, claude2Runtime },
    );
    expect(res).toEqual({ ok: true });
  });

  it("throws SKILL_UNINSTALL_FAILED on failure", async () => {
    runSkillsCommand.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "x" });
    await expect(
      uninstallSkill({ name: "tdd", agent: "claude-code" }, { settingsStore: store }),
    ).rejects.toMatchObject({ code: "SKILL_UNINSTALL_FAILED" });
  });
});

describe("previewInstalledSkill", () => {
  let skillDir: string;
  beforeEach(async () => {
    skillDir = await mkdtemp(join(tmpdir(), "ar-skill-"));
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development\n---\n# TDD\nbody",
    );
  });
  afterEach(async () => {
    await rm(skillDir, { recursive: true, force: true });
  });

  it("reads local SKILL.md frontmatter + body", async () => {
    runSkillsCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify([
        { name: "tdd", path: skillDir, scope: "global", agents: ["claude-code"] },
      ]),
      stderr: "",
    });
    const res = await previewInstalledSkill("tdd", "claude-code");
    expect(res.name).toBe("tdd");
    expect(res.description).toBe("Test-driven development");
    expect(res.content).toContain("# TDD");
  });

  it("throws SKILL_PREVIEW_FAILED when not installed", async () => {
    runSkillsCommand.mockResolvedValue({ exitCode: 0, stdout: "[]", stderr: "" });
    await expect(previewInstalledSkill("nope", "claude-code")).rejects.toMatchObject({
      code: "SKILL_PREVIEW_FAILED",
    });
  });
});

describe("skill sources CRUD", () => {
  it("add → list → remove", async () => {
    const deps = { settingsStore: store };
    const { source } = await addSkillSource({ repo: "foo/bar", label: "Foo" }, deps);
    expect(source.repo).toBe("foo/bar");
    expect(source.label).toBe("Foo");
    expect(await listSkillSources(deps)).toHaveLength(1);
    const removed = await removeSkillSource(source.id, deps);
    expect(removed).toBe(true);
    expect(await listSkillSources(deps)).toHaveLength(0);
  });

  it("rejects invalid repo", async () => {
    await expect(
      addSkillSource({ repo: "../etc" }, { settingsStore: store }),
    ).rejects.toMatchObject({
      code: "SKILL_SOURCE_INVALID",
    });
  });
});

describe("handleSkillRoutes", () => {
  it("GET /api/skills/search returns 200", async () => {
    setFetch({ ok: true, status: 200, json: async () => ({ skills: [] }) });
    const url = new URL("http://x/api/skills/search?q=tdd");
    const res = await handleSkillRoutes(new Request(url), url, { settingsStore: store });
    expect(res?.status).toBe(200);
  });

  it("POST /api/skills/install invalid source → 400", async () => {
    const url = new URL("http://x/api/skills/install");
    const req = new Request(url, {
      method: "POST",
      body: JSON.stringify({ source: "../etc", skillId: "tdd", agent: "claude-code" }),
    });
    const res = await handleSkillRoutes(req, url, { settingsStore: store });
    expect(res?.status).toBe(400);
  });

  it("POST /api/skills/sources adds source → 201", async () => {
    const url = new URL("http://x/api/skills/sources");
    const req = new Request(url, {
      method: "POST",
      body: JSON.stringify({ repo: "foo/bar" }),
    });
    const res = await handleSkillRoutes(req, url, { settingsStore: store });
    expect(res?.status).toBe(201);
    const body = (await res?.json()) as { source: { repo: string } };
    expect(body.source.repo).toBe("foo/bar");
  });

  it("unmatched route → undefined", async () => {
    const url = new URL("http://x/api/skills/unknown");
    const res = await handleSkillRoutes(new Request(url), url, { settingsStore: store });
    expect(res).toBeUndefined();
  });
});
