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

test("Claude2SessionRelay sends history and output batches for a new session", async () => {
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
    (error) => { throw error; },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);

  // No history for new session
  expect(messages.some((msg) => msg.type === "history_start")).toBe(false);
  expect(messages.some((msg) => msg.type === "history_end")).toBe(false);

  // Output batch with both lines
  const outputStart = messages.findIndex((msg) => msg.type === "output_start");
  const outputEnd = messages.findIndex((msg) => msg.type === "output_end");

  expect(outputStart).toBeGreaterThanOrEqual(0);
  expect(outputEnd).toBeGreaterThan(outputStart);
  expect(messages[outputStart - 1]).toBeUndefined(); // nothing before output_start

  const outputMessages = messages.slice(outputStart + 1, outputEnd);
  expect(outputMessages).toHaveLength(2);
  expect(outputMessages[0]).toEqual(JSON.parse(systemLine));
  expect(outputMessages[1]).toEqual(JSON.parse(assistantLine));

  relay.destroy();
});

test("Claude2SessionRelay sends history batch before output batch for resume", async () => {
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
      content: [{ type: "text", text: "from live output" }],
    },
  });

  const relay = new Claude2SessionRelay();
  await relay.activate(projectPath, claudeSessionId);
  await relay.handleStdoutLine(bufferLine);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => { throw error; },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);

  // History batch comes first
  const historyStart = messages.findIndex((msg) => msg.type === "history_start");
  const historyEnd = messages.findIndex((msg) => msg.type === "history_end");

  expect(historyStart).toBe(0); // first message
  expect(historyEnd).toBeGreaterThan(historyStart);

  const historyMessages = messages.slice(historyStart + 1, historyEnd);
  expect(historyMessages).toEqual([JSON.parse(diskLine)]);

  // Output batch comes after history
  const outputStart = messages.findIndex((msg) => msg.type === "output_start");
  const outputEnd = messages.findIndex((msg) => msg.type === "output_end");

  expect(outputStart).toBeGreaterThan(historyEnd); // after history
  expect(outputEnd).toBeGreaterThan(outputStart);

  const outputMessages = messages.slice(outputStart + 1, outputEnd);
  expect(outputMessages).toEqual([JSON.parse(bufferLine)]);

  relay.destroy();
});

test("Claude2SessionRelay handles empty history for new session", async () => {
  const relay = new Claude2SessionRelay();
  await relay.activate("", undefined);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => { throw error; },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(messages.some((msg) => msg.type === "history_start")).toBe(false);
  expect(messages.some((msg) => msg.type === "output_start")).toBe(false);
  expect(messages).toHaveLength(0);

  relay.destroy();
});

test("Claude2SessionRelay handles empty history file for resume", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-empty-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });
  await writeFile(jsonlPath, "");

  const relay = new Claude2SessionRelay();
  await relay.activate(projectPath, claudeSessionId);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => { throw error; },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(messages.some((msg) => msg.type === "history_start")).toBe(false);
  expect(messages).toHaveLength(0);

  relay.destroy();
});

test("Claude2SessionRelay broadcasts live output after batch", async () => {
  const relay = new Claude2SessionRelay();
  await relay.activate("", undefined);

  const live1 = JSON.stringify({
    type: "assistant",
    uuid: "uuid-1",
    message: { id: "m1", role: "assistant", content: [{ type: "text", text: "live" }] },
  });

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => { throw error; },
  );

  // After subscriber joins, handle more stdout lines
  await relay.handleStdoutLine(live1);

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);

  // output_start + batch message + output_end + live message
  const outputEnd = messages.findIndex((msg) => msg.type === "output_end");
  const liveMessages = messages.slice(outputEnd + 1);

  expect(liveMessages).toHaveLength(1);
  expect(liveMessages[0]).toEqual(JSON.parse(live1));

  relay.destroy();
});

test("Claude2SessionRelay injectLine broadcasts but does not enter output", async () => {
  const relay = new Claude2SessionRelay();
  await relay.activate("", undefined);

  const injectedLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "optimistic" }] },
  });

  // Add subscriber first so it receives the injectLine broadcast
  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => { throw error; },
  );

  relay.injectLine(injectedLine);

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);

  // injectLine is broadcast live, not via output batch
  const outputStart = messages.findIndex((msg) => msg.type === "output_start");
  expect(outputStart).toBe(-1); // no output batch for empty session

  // The injected line is received as a live broadcast
  expect(messages.some((msg) => msg.type === "user")).toBe(true);

  relay.destroy();
});
