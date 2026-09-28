import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { lstat, mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as validate from "./skill-validate";
import { SettingsStore } from "./settings-store";

type CmdResult = { exitCode: number; stdout: string; stderr: string };

// mock skill-process 的 spawn 执行（同 skill-market.test 模式；校验纯函数保留真值）。
const runSkillsCommand = mock<(args: string[], opts?: unknown) => Promise<CmdResult>>();

mock.module("./skill-process", () => ({
  ...validate,
  runSkillsCommand,
  INSTALL_SKILL_TIMEOUT_MS: 300_000,
}));

const { disableSkill, enableSkill } = await import("./skill-disable");
const { listInstalledSkills } = await import("./skill-market");

let store: SettingsStore;
let storeDir: string;
let home: string;

beforeEach(async () => {
  storeDir = await mkdtemp(join(tmpdir(), "ar-store-"));
  store = new SettingsStore({ path: join(storeDir, "settings.yaml") });
  home = await mkdtemp(join(tmpdir(), "ar-skills-home-"));
});

afterEach(async () => {
  await rm(storeDir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

/** 造全局 skill 目录（写 SKILL.md frontmatter）。 */
async function writeSkill(agentHome: string, name: string): Promise<string> {
  const dir = join(home, agentHome, "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\nbody`,
  );
  return dir;
}

function deps() {
  return { settingsStore: store, skillsHome: home };
}

describe("disableSkill/enableSkill（全局 symlink rename 语义）", () => {
  it("disables by renaming the symlink entry into the per-agent disabled dir", async () => {
    const real = await writeSkill(".agents-store", "shared");
    const linkParent = join(home, ".claude", "skills");
    await mkdir(linkParent, { recursive: true });
    const link = join(linkParent, "shared");
    await symlink(real, link);

    await disableSkill({ name: "shared", agent: "claude-code" }, deps());

    // symlink 整体 rename 到 ~/.agents/disabled-skills/<agent>/ 下，canonical 保留
    const disabledEntry = join(home, ".agents", "disabled-skills", "claude-code", "shared");
    const linkStats = await lstat(disabledEntry);
    expect(linkStats.isSymbolicLink()).toBe(true);
    expect(await realpath(disabledEntry)).toBe(real);
  });

  it("rejects disabling a skill that is not installed", async () => {
    await expect(
      disableSkill({ name: "ghost", agent: "claude-code" }, deps()),
    ).rejects.toMatchObject({ code: "SKILL_DISABLE_FAILED" });
  });

  it("enable renames back to the active dir", async () => {
    await writeSkill(".claude", "tdd");
    await disableSkill({ name: "tdd", agent: "claude-code" }, deps());
    await enableSkill({ name: "tdd", agent: "claude-code" }, deps());
    const active = join(home, ".claude", "skills", "tdd");
    expect(await stat(active)).toBeTruthy();
    const disabled = join(home, ".agents", "disabled-skills", "claude-code", "tdd");
    expect(await stat(disabled).catch(() => null)).toBeNull();
  });

  it("enable rejects when the skill is not disabled", async () => {
    await writeSkill(".claude", "tdd");
    await expect(enableSkill({ name: "tdd", agent: "claude-code" }, deps())).rejects.toMatchObject({
      code: "SKILL_DISABLE_FAILED",
    });
  });

  it("lists disabled entries with disabled:true and no manageable flag", async () => {
    await writeSkill(".claude", "active");
    await writeSkill(".claude", "gone");
    await disableSkill({ name: "gone", agent: "claude-code" }, deps());
    const res = await listInstalledSkills("claude-code", deps());
    const names = res.skills.map((s) => s.name).sort();
    expect(names).toEqual(["active", "gone"]);
    const gone = res.skills.find((s) => s.name === "gone");
    expect(gone?.disabled).toBe(true);
    expect(gone?.manageable).toBeUndefined();
    const active = res.skills.find((s) => s.name === "active");
    expect(active?.disabled).toBeUndefined();
  });

  describe("project scope", () => {
    let projectsRoot: string;
    let projectRoot: string;

    beforeEach(async () => {
      projectsRoot = await mkdtemp(join(tmpdir(), "ar-projects-"));
      projectRoot = join(projectsRoot, "proj-a");
      await mkdir(projectRoot, { recursive: true });
    });
    afterEach(async () => {
      await rm(projectsRoot, { recursive: true, force: true });
    });

    function projectDeps() {
      return { settingsStore: store, skillsHome: home, projectsRoot };
    }

    it("disables a project skill into <root>/.claude/skills.disabled/", async () => {
      const skillDir = join(projectRoot, ".claude", "skills", "pskill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: pskill\n---\nbody");
      const ctx = { projectsRoot, projectKey: "proj-a" };
      await disableSkill({ name: "pskill", agent: "claude-code" }, projectDeps(), ctx);
      await stat(join(projectRoot, ".claude", "skills.disabled", "pskill"));
      await expect(stat(join(projectRoot, ".claude", "skills", "pskill"))).rejects.toThrow();
    });

    it("scans project disabled entries into the installed list", async () => {
      const skillDir = join(projectRoot, ".claude", "skills", "pskill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: pskill\n---\nbody");
      const ctx = { projectsRoot, projectKey: "proj-a" };
      await disableSkill({ name: "pskill", agent: "claude-code" }, projectDeps(), ctx);
      const res = await listInstalledSkills("claude-code", projectDeps(), projectRoot);
      expect(res.skills.map((s) => s.name)).toEqual(["pskill"]);
      expect(res.skills[0].disabled).toBe(true);
    });
  });
});
