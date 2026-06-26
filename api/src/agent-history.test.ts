import { expect, test, beforeEach } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { listAgentHistory, projectToSlug } from "./agent-history";

const TEST_DIR = join(homedir(), ".claude", "projects", "_test-agent-history-unit");
const TEST_PROJECT = "/test/project";

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
});

const writeJsonl = async (name: string, lines: Record<string, unknown>[]) => {
  const content = lines.map((l) => JSON.stringify(l)).join("\n");
  await writeFile(join(TEST_DIR, `${name}.jsonl`), content);
};

test("projectToSlug converts ASCII path to slug", () => {
  expect(projectToSlug("/home/deploy/workspace/agents-remote")).toBe(
    "-home-deploy-workspace-agents-remote",
  );
});

test("projectToSlug replaces spaces with dashes", () => {
  expect(projectToSlug("/home/deploy/projects/novel ai writing")).toBe(
    "-home-deploy-projects-novel-ai-writing",
  );
});

test("projectToSlug replaces CJK characters with dashes", () => {
  expect(projectToSlug("/home/deploy/projects/番茄都市轻悬疑日常")).toBe(
    "-home-deploy-projects----------",
  );
});

test("projectToSlug handles mixed ASCII and CJK with spaces", () => {
  expect(projectToSlug("/home/deploy/projects/鲁班 skill")).toBe("-home-deploy-projects----skill");
});

test("projectToSlug replaces consecutive non-alphanumeric characters", () => {
  expect(projectToSlug("/foo//bar baz!")).toBe("-foo--bar-baz-");
});

test("returns empty for nonexistent directory", async () => {
  const entries = await listAgentHistory("/nonexistent/path", new Map());
  expect(entries).toEqual([]);
});

test("extracts ai-title as session title", async () => {
  await writeJsonl("aaa-111", [
    { type: "system", subtype: "init", session_id: "aaa-111" },
    { type: "ai-title", aiTitle: "My Session Title", sessionId: "aaa-111" },
    {
      type: "user",
      message: { content: [{ type: "text", text: "hello" }] },
      timestamp: "2026-06-01T00:00:00Z",
    },
  ]);

  // Test with the real function by writing to the slug-derived directory
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  await writeFile(
    join(realDir, "aaa-111.jsonl"),
    [
      JSON.stringify({ type: "ai-title", aiTitle: "My Session Title" }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "hello" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map());
  expect(entries.length).toBe(1);
  expect(entries[0]!.title).toBe("My Session Title");
  expect(entries[0]!.firstMessage).toBe("hello");
  expect(entries[0]!.messageCount).toBe(1);
  expect(entries[0]!.startedAt).toBe("2026-06-01T00:00:00Z");

  await rm(realDir, { recursive: true, force: true });
});

test("uses last ai-title when multiple exist", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  await writeFile(
    join(realDir, "bbb-222.jsonl"),
    [
      JSON.stringify({ type: "ai-title", aiTitle: "Old Title" }),
      JSON.stringify({ type: "ai-title", aiTitle: "Updated Title" }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map());
  expect(entries[0]!.title).toBe("Updated Title");

  await rm(realDir, { recursive: true, force: true });
});

test("falls back to firstMessage when no ai-title", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  await writeFile(
    join(realDir, "ccc-333.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "This is the first message" }] },
        timestamp: "2026-06-02T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map());
  expect(entries[0]!.title).toBeNull();
  expect(entries[0]!.firstMessage).toBe("This is the first message");

  await rm(realDir, { recursive: true, force: true });
});

test("marks active sessions from the map", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  await writeFile(
    join(realDir, "ddd-444.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "hi" }] },
        timestamp: "2026-06-03T00:00:00Z",
      }),
    ].join("\n"),
  );

  const activeMap = new Map([["ddd-444", "agent_abc123"]]);
  const entries = await listAgentHistory(TEST_PROJECT, activeMap);
  expect(entries[0]!.hasActiveSession).toBe(true);
  expect(entries[0]!.activeSessionId).toBe("agent_abc123");

  await rm(realDir, { recursive: true, force: true });
});

test("sorts by lastActivityAt descending", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });

  // Create two files with different timestamps
  await writeFile(
    join(realDir, "old-session.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "old" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  // Ensure different mtime by touching the second file slightly later
  await new Promise((r) => setTimeout(r, 50));
  await writeFile(
    join(realDir, "new-session.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "new" }] },
        timestamp: "2026-06-02T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map());
  expect(entries.length).toBe(2);
  expect(entries[0]!.claudeSessionId).toBe("new-session");
  expect(entries[1]!.claudeSessionId).toBe("old-session");

  await rm(realDir, { recursive: true, force: true });
});
