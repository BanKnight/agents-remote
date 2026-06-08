import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Claude2SessionRelay } from "./session-relay";
import { claudeJsonlPath } from "./session-routes";

const cleanupDirs = new Set<string>();

afterEach(async () => {
  await Promise.all([...cleanupDirs].map((dir) => rm(dir, { recursive: true, force: true })));
  cleanupDirs.clear();
});

test("Claude2SessionRelay suppresses stdout echo after injected user live echo", async () => {
  const relay = new Claude2SessionRelay();
  await relay.activate("", undefined);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const userLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "hello live" }] },
  });

  relay.injectLine(userLine);
  await relay.handleStdoutLine(userLine);

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(messages.some((msg) => msg.type === "replay_start")).toBe(false);
  expect(messages.some((msg) => msg.type === "replay_end")).toBe(false);
  expect(messages.filter((msg) => msg.type === "user")).toHaveLength(1);
  relay.destroy();
});

test("Claude2SessionRelay replays the current raw buffer for a new session", async () => {
  const relay = new Claude2SessionRelay();
  await relay.activate("", undefined);

  const systemLine = JSON.stringify({
    type: "system",
    subtype: "init",
    session_id: "new-session",
  });
  const assistantLine = JSON.stringify({
    type: "assistant",
    uuid: "uuid-assistant-1",
    message: { id: "msg_1", role: "assistant", content: [{ type: "text", text: "done" }] },
  });

  await relay.handleStdoutLine(systemLine);
  await relay.handleStdoutLine(assistantLine);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const replayStart = messages.findIndex((msg) => msg.type === "replay_start");
  const replayEnd = messages.findIndex((msg) => msg.type === "replay_end");
  const replayMessages = messages.slice(replayStart + 1, replayEnd);

  expect(replayStart).toBe(0);
  expect(replayEnd).toBe(3);
  expect(replayMessages).toEqual([JSON.parse(systemLine), JSON.parse(assistantLine)]);
  relay.destroy();
});

test("Claude2SessionRelay replays resume relay before current raw buffer", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-resume-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });

  const diskLine = JSON.stringify({
    type: "user",
    uuid: "uuid-user-1",
    session_id: claudeSessionId,
    message: { role: "user", content: [{ type: "text", text: "from disk" }] },
  });
  await writeFile(jsonlPath, `${diskLine}\n`);

  const bufferLine = JSON.stringify({
    type: "assistant",
    uuid: "uuid-assistant-2",
    message: {
      id: "msg_2",
      role: "assistant",
      content: [{ type: "text", text: "from live buffer" }],
    },
  });

  const relay = new Claude2SessionRelay();
  await relay.activate(projectPath, claudeSessionId);
  await relay.handleStdoutLine(bufferLine);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const replayStart = messages.findIndex((msg) => msg.type === "replay_start");
  const replayEnd = messages.findIndex((msg) => msg.type === "replay_end");
  const replayMessages = messages.slice(replayStart + 1, replayEnd);

  expect(replayMessages).toEqual([JSON.parse(diskLine), JSON.parse(bufferLine)]);
  relay.destroy();
});

test("Claude2SessionRelay does not persist optimistic echo into later snapshots", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-optimistic-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });

  const diskLine = JSON.stringify({
    type: "user",
    uuid: "uuid-user-1",
    session_id: claudeSessionId,
    message: { role: "user", content: [{ type: "text", text: "persisted prompt" }] },
  });
  await writeFile(jsonlPath, `${diskLine}\n`);

  const optimisticLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "optimistic only" }] },
  });

  const relay = new Claude2SessionRelay();
  await relay.activate(projectPath, claudeSessionId);
  relay.injectLine(optimisticLine);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const replayStart = messages.findIndex((msg) => msg.type === "replay_start");
  const replayEnd = messages.findIndex((msg) => msg.type === "replay_end");
  const replayMessages = messages.slice(replayStart + 1, replayEnd);

  expect(replayMessages).toEqual([JSON.parse(diskLine)]);
  relay.destroy();
});

test("Claude2SessionRelay keeps meta skill user separate from plain user with same text", async () => {
  const relay = new Claude2SessionRelay();
  await relay.activate("", undefined);

  const skillText = "Base directory for this skill: /tmp/skill";
  const plainUserLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: skillText }] },
  });
  const metaSkillLine = JSON.stringify({
    type: "user",
    isMeta: true,
    sourceToolUseID: "tu-skill",
    message: { role: "user", content: [{ type: "text", text: skillText }] },
  });

  await relay.handleStdoutLine(plainUserLine);
  await relay.handleStdoutLine(metaSkillLine);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const replayStart = messages.findIndex((msg) => msg.type === "replay_start");
  const replayEnd = messages.findIndex((msg) => msg.type === "replay_end");
  const replayMessages = messages.slice(replayStart + 1, replayEnd);

  expect(replayMessages).toEqual([JSON.parse(plainUserLine), JSON.parse(metaSkillLine)]);
  relay.destroy();
});
