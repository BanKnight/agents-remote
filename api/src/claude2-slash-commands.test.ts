import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveSkillSlashCatalog } from "./claude2-slash-commands";

const cleanupDirs = new Set<string>();
const rmDir = (d: string) => rm(d, { recursive: true, force: true });

afterEach(async () => {
  await Promise.all([...cleanupDirs].map(rmDir));
  cleanupDirs.clear();
});

const skillMd = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# body\n`;
const commandMd = (description: string) => `---\ndescription: ${description}\n---\n\nbody\n`;

const NOEXIST = "/nonexistent-agents-remote-catalog";

test("resolveSkillSlashCatalog reads real skill descriptions from SKILL.md", async () => {
  const userSkills = resolve(`/tmp/agents-remote-catalog-skills-${Date.now()}`);
  cleanupDirs.add(userSkills);
  await mkdir(resolve(userSkills, "context7-mcp"), { recursive: true });
  await writeFile(
    resolve(userSkills, "context7-mcp", "SKILL.md"),
    skillMd("context7-mcp", "Fetch current library docs"),
  );

  const result = await resolveSkillSlashCatalog(NOEXIST, { skills: userSkills, commands: NOEXIST });
  const skill = result.find((c) => c.kind === "skill" && c.name === "context7-mcp");
  expect(skill?.description).toBe("Fetch current library docs");
});

test("resolveSkillSlashCatalog falls back to dir name when SKILL.md omits frontmatter name", async () => {
  const userSkills = resolve(`/tmp/agents-remote-catalog-skills-${Date.now()}`);
  cleanupDirs.add(userSkills);
  await mkdir(resolve(userSkills, "my-skill"), { recursive: true });
  await writeFile(
    resolve(userSkills, "my-skill", "SKILL.md"),
    `---\ndescription: dir-name fallback\n---\n`,
  );

  const result = await resolveSkillSlashCatalog(NOEXIST, { skills: userSkills, commands: NOEXIST });
  const skill = result.find((c) => c.kind === "skill" && c.name === "my-skill");
  expect(skill?.description).toBe("dir-name fallback");
});

test("resolveSkillSlashCatalog merges project > user > builtin commands", async () => {
  const projectRoot = resolve(`/tmp/agents-remote-catalog-project-${Date.now()}`);
  const userCmds = resolve(`/tmp/agents-remote-catalog-cmds-${Date.now()}`);
  cleanupDirs.add(projectRoot);
  cleanupDirs.add(userCmds);
  await mkdir(resolve(projectRoot, ".claude", "commands"), { recursive: true });
  await writeFile(
    resolve(projectRoot, ".claude", "commands", "deploy.md"),
    commandMd("project deploy"),
  );
  await mkdir(userCmds, { recursive: true });
  await writeFile(resolve(userCmds, "lint.md"), commandMd("user lint"));

  const result = await resolveSkillSlashCatalog(projectRoot, {
    commands: userCmds,
    skills: NOEXIST,
  });
  const cmds = new Map(
    result.filter((c) => c.kind === "command").map((c) => [c.name, c.description]),
  );
  expect(cmds.get("deploy")).toBe("project deploy"); // project command
  expect(cmds.get("lint")).toBe("user lint"); // user command
  expect(cmds.get("compact")).toBe("Compact conversation context"); // builtin still present
});

test("resolveSkillSlashCatalog lets a project command override a builtin name", async () => {
  const projectRoot = resolve(`/tmp/agents-remote-catalog-override-${Date.now()}`);
  cleanupDirs.add(projectRoot);
  await mkdir(resolve(projectRoot, ".claude", "commands"), { recursive: true });
  await writeFile(
    resolve(projectRoot, ".claude", "commands", "review.md"),
    commandMd("project-specific review"),
  );

  const result = await resolveSkillSlashCatalog(projectRoot, {
    commands: NOEXIST,
    skills: NOEXIST,
  });
  const reviews = result.filter((c) => c.name === "review");
  expect(reviews).toHaveLength(1);
  expect(reviews[0].description).toBe("project-specific review");
});
