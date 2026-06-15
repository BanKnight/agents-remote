import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionRegistry, type RuntimeResources } from "./session-registry";
import { handleSessionStreamUpgrade, SessionStreamController } from "./session-stream";

const createProject = async () => {
  const root = await mkdtemp(join(tmpdir(), "agents-remote-stream-projects-"));
  const runDir = await mkdtemp(join(tmpdir(), "agents-remote-stream-run-"));
  await mkdir(join(root, "demo"));

  return {
    root,
    runDir,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
      await rm(runDir, { recursive: true, force: true });
    },
  };
};

test("handleSessionStreamUpgrade attaches session metadata to websocket upgrades", async () => {
  const fixture = await createProject();

  try {
    const registry = new SessionRegistry({
      runDir: fixture.runDir,
      createId: () => "terminal_stream123456",
    });
    await registry.createTerminalSession({
      project: { name: "demo", path: join(fixture.root, "demo") },
    });
    let upgradeData: unknown;
    const result = await handleSessionStreamUpgrade(
      new Request(
        "http://localhost/api/projects/demo/terminal-sessions/terminal_stream123456/stream",
      ),
      new URL("http://localhost/api/projects/demo/terminal-sessions/terminal_stream123456/stream"),
      fixture.root,
      registry,
      {
        upgrade(_request, options) {
          upgradeData = options?.data;
          return true;
        },
      },
    );

    expect(result).toEqual({ matched: true });
    expect(upgradeData).toMatchObject({
      kind: "session-stream",
      sessionType: "terminal",
      projectName: "demo",
      sessionId: "terminal_stream123456",
      status: "running",
    });
  } finally {
    await fixture.cleanup();
  }
});

test("handleSessionStreamUpgrade returns not found for missing sessions", async () => {
  const fixture = await createProject();

  try {
    const registry = new SessionRegistry({ runDir: fixture.runDir });
    const result = await handleSessionStreamUpgrade(
      new Request("http://localhost/api/projects/demo/terminal-sessions/missing/stream"),
      new URL("http://localhost/api/projects/demo/terminal-sessions/missing/stream"),
      fixture.root,
      registry,
      { upgrade: () => true },
    );
    const body = await result.response?.json();

    expect(result.matched).toBe(true);
    expect(result.response?.status).toBe(404);
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  } finally {
    await fixture.cleanup();
  }
});

test("SessionStreamController sends snapshots and handles input resize ping", async () => {
  const writes: string[] = [];
  const resizes: Array<[number, number]> = [];
  let snapshot = "ready";
  let streamOutput: ((data: string) => void) | undefined;
  const runtime: RuntimeResources = {
    async exists() {
      return true;
    },
    async close() {},
    async capture() {
      return snapshot;
    },
    async write(_tmuxSessionName, data) {
      writes.push(data);
      snapshot = `ready\n${data}`;
      streamOutput?.(`\n${data}`);
    },
    async resize(_tmuxSessionName, cols, rows) {
      resizes.push([cols, rows]);
    },
    async stream(_tmuxSessionName, onData) {
      streamOutput = onData;
      return {
        close() {
          streamOutput = undefined;
        },
      };
    },
  };
  const messages: unknown[] = [];
  const controller = new SessionStreamController(runtime);
  const socket = {
    data: {
      kind: "session-stream" as const,
      sessionType: "terminal" as const,
      projectName: "demo",
      sessionId: "terminal_stream123456",
      tmuxSessionName: "ar-terminal-demo-terminal_stream",
      status: "running" as const,
    },
    send(message: string) {
      messages.push(JSON.parse(message));
    },
  };

  await controller.open(socket);
  await controller.message(socket, JSON.stringify({ type: "input", data: "pwd\n" }));
  await controller.message(socket, JSON.stringify({ type: "resize", cols: 120, rows: 40 }));
  await controller.message(socket, JSON.stringify({ type: "ping" }));
  controller.close(socket);

  expect(messages).toContainEqual({ type: "snapshot", data: "ready" });
  expect(messages).toContainEqual({ type: "output", data: "\npwd\n" });
  expect(messages).toContainEqual({ type: "snapshot", data: "ready\npwd\n" });
  expect(messages).toContainEqual({ type: "status", status: "connected" });
  expect(writes).toEqual(["pwd\n"]);
  expect(resizes).toEqual([[120, 40]]);
});

test("SessionStreamController reports ended when runtime disappears", async () => {
  const runtime: RuntimeResources = {
    async exists() {
      return false;
    },
    async close() {},
    async capture() {
      return "";
    },
  };
  const messages: unknown[] = [];
  const controller = new SessionStreamController(runtime);
  const socket = {
    data: {
      kind: "session-stream" as const,
      sessionType: "terminal" as const,
      projectName: "demo",
      sessionId: "terminal_stream123456",
      tmuxSessionName: "ar-terminal-demo-terminal_stream",
      status: "running" as const,
    },
    send(message: string) {
      messages.push(JSON.parse(message));
    },
  };

  await controller.open(socket);
  controller.close(socket);

  expect(messages).toContainEqual({ type: "ended" });
});
