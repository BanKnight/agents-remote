import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as skillProcess from "./skill-process";
import { skillTaskRegistry } from "./skill-tasks";

type CmdResult = { exitCode: number; stdout: string; stderr: string };
type SkillDeps = { skillsHome: string };

// mock skill-process 的 spawn 执行；skill-update 的纯逻辑 + skill-market 的 FS 直读保留真值。
const runSkillsCommand = mock<(args: string[], opts?: unknown) => Promise<CmdResult>>();

mock.module("./skill-process", () => ({
  ...skillProcess,
  runSkillsCommand,
}));

const { checkSkillUpdates, executeUpdate, handleSkillUpdateRoutes } =
  await import("./skill-update");

let home: string;
let deps: SkillDeps;
let originalFetch: typeof globalThis.fetch;

beforeEach(async () => {
  runSkillsCommand.mockReset();
  home = await mkdtemp(join(tmpdir(), "ar-skill-up-"));
  deps = { skillsHome: home }; // 顶层求值拿不到 home，必须在 beforeEach 内赋值
  originalFetch = globalThis.fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await rm(home, { recursive: true, force: true });
  skillTaskRegistry.clear();
});

/** 在临时 home 下造一个 installed skill：{home}/.claude/skills/<name>/SKILL.md */
async function makeInstalledSkill(name: string): Promise<void> {
  const dir = join(home, ".claude", "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${name}\n---\n# ${name}\n`);
}

/** 写 lock 文件：{home}/.agents/.skill-lock.json */
async function writeLock(skills: Record<string, unknown>): Promise<void> {
  const dir = join(home, ".agents");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, ".skill-lock.json"), JSON.stringify({ version: 1, skills }));
}

/** mock GitHub API：repo 端点返回 default_branch，trees 端点返回 tree 数组。 */
function setGithub({
  branch = "main",
  trees = [] as Array<{ path: string; type: string; sha: string }>,
  repoStatus = 200,
  treeStatus = 200,
}: {
  branch?: string;
  trees?: Array<{ path: string; type: string; sha: string }>;
  repoStatus?: number;
  treeStatus?: number;
} = {}): void {
  globalThis.fetch = mock((url: string | URL) => {
    const u = String(url);
    if (u.includes("/git/trees/")) {
      return Promise.resolve({
        ok: treeStatus >= 200 && treeStatus < 300,
        status: treeStatus,
        json: async () => ({ tree: trees }),
      });
    }
    return Promise.resolve({
      ok: repoStatus >= 200 && repoStatus < 300,
      status: repoStatus,
      json: async () => ({ default_branch: branch }),
    });
  }) as unknown as typeof globalThis.fetch;
}

function lockEntry(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    source: "vercel-labs/agent-skills",
    sourceType: "github",
    sourceUrl: "https://github.com/vercel-labs/agent-skills.git",
    skillPath: "skills/react-best-practices/SKILL.md",
    skillFolderHash: "abc123def456",
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("checkSkillUpdates", () => {
  it("marks hand-written skill (no lock record) as not manageable", async () => {
    await makeInstalledSkill("handmade");
    await writeLock({}); // 空 lock：无第三方
    const res = await checkSkillUpdates("claude-code", deps);
    expect(res.updates).toEqual([{ name: "handmade", hasUpdate: false, manageable: false }]);
  });

  it("marks no-update when remote tree SHA equals lock hash", async () => {
    await makeInstalledSkill("vercel-react-best-practices");
    await writeLock({
      "vercel-react-best-practices": lockEntry({ skillFolderHash: "abc123def456" }),
    });
    setGithub({
      trees: [{ path: "skills/react-best-practices", type: "tree", sha: "abc123def456" }],
    });
    const res = await checkSkillUpdates("claude-code", deps);
    expect(res.updates).toEqual([
      {
        name: "vercel-react-best-practices",
        hasUpdate: false,
        manageable: true,
        sourceType: "github",
        sourceUrl: "https://github.com/vercel-labs/agent-skills.git",
      },
    ]);
  });

  it("marks hasUpdate when remote tree SHA differs", async () => {
    await makeInstalledSkill("vercel-react-best-practices");
    await writeLock({
      "vercel-react-best-practices": lockEntry({ skillFolderHash: "oldhash111" }),
    });
    setGithub({
      trees: [{ path: "skills/react-best-practices", type: "tree", sha: "newhash222" }],
    });
    const res = await checkSkillUpdates("claude-code", deps);
    expect(res.updates[0]).toMatchObject({
      name: "vercel-react-best-practices",
      hasUpdate: true,
      manageable: true,
    });
  });

  it("safe-degrades (hasUpdate=false) when folder missing in remote tree", async () => {
    await makeInstalledSkill("moved-skill");
    await writeLock({
      "moved-skill": lockEntry({
        skillPath: "skills/old-location/SKILL.md",
        skillFolderHash: "abc",
      }),
    });
    setGithub({ trees: [] }); // 远端无该目录
    const res = await checkSkillUpdates("claude-code", deps);
    expect(res.updates[0]).toMatchObject({
      name: "moved-skill",
      hasUpdate: false,
      manageable: true,
    });
  });

  it("degrades per-repo on GitHub failure without throwing", async () => {
    await makeInstalledSkill("a");
    await writeLock({ a: lockEntry({}) });
    setGithub({ repoStatus: 403 });
    const res = await checkSkillUpdates("claude-code", deps);
    expect(res.updates[0]).toMatchObject({ name: "a", hasUpdate: false, manageable: true });
  });

  it("groups same-repo skills into one tree call (2 fetches total)", async () => {
    await makeInstalledSkill("skill-one");
    await makeInstalledSkill("skill-two");
    await writeLock({
      "skill-one": lockEntry({ skillPath: "skills/one/SKILL.md", skillFolderHash: "h1" }),
      "skill-two": lockEntry({ skillPath: "skills/two/SKILL.md", skillFolderHash: "h2" }),
    });
    setGithub({
      trees: [
        { path: "skills/one", type: "tree", sha: "h1" },
        { path: "skills/two", type: "tree", sha: "h2" },
      ],
    });
    await checkSkillUpdates("claude-code", deps);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    expect(fetchMock.mock.calls.length).toBe(2); // 1 repo + 1 tree（共享）
  });

  it("marks local / non-github source as not manageable", async () => {
    await makeInstalledSkill("local-skill");
    await writeLock({
      "local-skill": lockEntry({ sourceType: "local", sourceUrl: "", skillPath: "" }),
    });
    const res = await checkSkillUpdates("claude-code", deps);
    expect(res.updates[0]).toMatchObject({
      name: "local-skill",
      manageable: false,
      sourceType: "local",
    });
  });

  it("throws SKILL_UPDATE_CHECK_FAILED on corrupt lock JSON", async () => {
    await makeInstalledSkill("a");
    const dir = join(home, ".agents");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, ".skill-lock.json"), "{ not json");
    await expect(checkSkillUpdates("claude-code", deps)).rejects.toThrow(/not valid JSON/);
  });
});

describe("executeUpdate", () => {
  it("runs skills update with global (no --agent) and returns name", async () => {
    runSkillsCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const name = await executeUpdate({ name: "my-skill", agent: "claude-code" }, deps);
    // update 不带 --agent：skills update --help 不支持 --agent（add 独有），带会被 commander 拒绝。
    expect(runSkillsCommand.mock.calls[0][0]).toEqual(["update", "my-skill", "--global", "--yes"]);
    expect(name).toBe("my-skill");
  });

  it("throws SKILL_UPDATE_FAILED on non-zero exit", async () => {
    runSkillsCommand.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "boom" });
    await expect(executeUpdate({ name: "my-skill", agent: "claude-code" }, deps)).rejects.toThrow(
      /skills update failed/,
    );
  });

  it("rejects unsupported agent", async () => {
    await expect(
      executeUpdate({ name: "my-skill", agent: "unknown" as "claude-code" }, deps),
    ).rejects.toThrow(/Unsupported agent/);
  });
});

describe("handleSkillUpdateRoutes", () => {
  function req(method: string, pathname: string, body?: unknown): Request {
    return new Request(`http://x${pathname}`, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    });
  }

  it("dispatches GET updates", async () => {
    await makeInstalledSkill("handmade");
    setGithub();
    const res = await handleSkillUpdateRoutes(
      req("GET", "/api/skills/updates?agent=claude-code"),
      new URL("http://x/api/skills/updates?agent=claude-code"),
      deps,
    );
    expect(res?.status).toBe(200);
    const body = (await res!.json()) as { updates: unknown[] };
    expect(Array.isArray(body.updates)).toBe(true);
  });

  it("dispatches POST update → 202 + taskId；后台完成 registry 终态 done", async () => {
    runSkillsCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const res = await handleSkillUpdateRoutes(
      req("POST", "/api/skills/update", { name: "s", agent: "claude-code" }),
      new URL("http://x/api/skills/update"),
      deps,
    );
    expect(res?.status).toBe(202);
    const body = (await res!.json()) as { taskId: string; status: string };
    expect(body.status).toBe("running");
    expect(body.taskId).toBeTruthy();
    const task = skillTaskRegistry.get(body.taskId);
    expect(task).toBeDefined();
    for (let i = 0; i < 50 && task!.status === "running"; i++) {
      await new Promise<void>((r) => setTimeout(r, 10));
    }
    expect(task!.status).toBe("done");
  });

  it("POST update 失败 → 202 + taskId；后台 registry 终态 failed", async () => {
    runSkillsCommand.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "boom" });
    const res = await handleSkillUpdateRoutes(
      req("POST", "/api/skills/update", { name: "s", agent: "claude-code" }),
      new URL("http://x/api/skills/update"),
      deps,
    );
    expect(res?.status).toBe(202);
    const body = (await res!.json()) as { taskId: string };
    const task = skillTaskRegistry.get(body.taskId);
    for (let i = 0; i < 50 && task!.status === "running"; i++) {
      await new Promise<void>((r) => setTimeout(r, 10));
    }
    expect(task!.status).toBe("failed");
    expect(task!.error?.code).toBe("SKILL_UPDATE_FAILED");
  });

  it("returns undefined for unmatched path", async () => {
    const res = await handleSkillUpdateRoutes(
      req("GET", "/api/skills/installed"),
      new URL("http://x/api/skills/installed"),
      deps,
    );
    expect(res).toBeUndefined();
  });
});
