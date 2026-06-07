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

  const userMessages = received
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((msg) => msg.type === "user");

  expect(userMessages).toHaveLength(1);
  relay.destroy();
});

test("Claude2SessionRelay skips flushed pending lines even when earlier pending lines are not in disk", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-non-prefix-flush-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });
  await writeFile(jsonlPath, "");

  const systemLine = JSON.stringify({
    type: "system",
    subtype: "init",
    session_id: claudeSessionId,
  });
  const assistantLine = JSON.stringify({
    type: "assistant",
    message: { id: "msg_1", role: "assistant", content: [{ type: "text", text: "done" }] },
  });

  const relay = new Claude2SessionRelay();
  await relay.activate(projectPath, claudeSessionId);
  await relay.handleStdoutLine(systemLine);
  await relay.handleStdoutLine(assistantLine);
  await writeFile(jsonlPath, `${assistantLine}\n`);

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

  expect(replayMessages.filter((msg) => msg.type === "assistant")).toHaveLength(1);
  expect(replayMessages.filter((msg) => msg.type === "system")).toHaveLength(1);
  relay.destroy();
});

test("Claude2SessionRelay keeps same-content pending user when disk only has activation baseline", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-baseline-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });

  const diskLine = JSON.stringify({
    type: "user",
    session_id: claudeSessionId,
    message: { role: "user", content: [{ text: "repeat prompt", type: "text" }] },
  });
  await writeFile(jsonlPath, `${diskLine}\n`);

  const pendingLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "repeat prompt" }] },
  });

  const relay = new Claude2SessionRelay();
  await relay.activate(projectPath, claudeSessionId);
  relay.injectLine(pendingLine);

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
  const userMessages = replayMessages.filter((msg) => msg.type === "user");

  expect(userMessages).toHaveLength(2);
  expect(userMessages[0]).toEqual(JSON.parse(diskLine));
  expect(userMessages[1]).toEqual(JSON.parse(pendingLine));
  relay.destroy();
});

test("Claude2SessionRelay skips pending prefix already flushed to disk after activation", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-flushed-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });

  const baselineLine = JSON.stringify({
    type: "user",
    session_id: claudeSessionId,
    message: { role: "user", content: [{ text: "repeat prompt", type: "text" }] },
  });
  await writeFile(jsonlPath, `${baselineLine}\n`);

  const flushedLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "repeat prompt" }] },
  });

  const relay = new Claude2SessionRelay();
  await relay.activate(projectPath, claudeSessionId);
  relay.injectLine(flushedLine);
  await writeFile(jsonlPath, `${baselineLine}\n${flushedLine}\n`);

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
  const userMessages = replayMessages.filter((msg) => msg.type === "user");

  expect(userMessages).toHaveLength(2);
  expect(userMessages[0]).toEqual(JSON.parse(baselineLine));
  expect(userMessages[1]).toEqual(JSON.parse(flushedLine));
  relay.destroy();
});
