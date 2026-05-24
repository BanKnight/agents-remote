import { expect, test } from "bun:test";
import { AgentRuntime } from "./agent-runtime";
import type { SessionMetadata } from "./session-registry";
import { TmuxRuntimeError } from "./tmux-runtime";

const metadata: SessionMetadata = {
  schemaVersion: 1,
  id: "agent_test123456",
  projectName: "demo",
  projectPath: "/projects/demo",
  type: "agent",
  provider: "claude",
  displayName: "Claude Agent test12",
  status: "running",
  tmuxSessionName: "ar-agent-claude-demo-agent_test12",
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z",
};

test("AgentRuntime starts provider sessions with resolved profile command", async () => {
  const started: string[] = [];
  const runtime = new AgentRuntime({
    async exists() {
      return true;
    },
    async close() {},
    async startCommand(sessionMetadata, command) {
      started.push(`${sessionMetadata.id}:${command}`);
    },
  });

  await runtime.startAgent(metadata);
  await runtime.startAgent({ ...metadata, provider: "codex" });

  expect(started).toEqual(["agent_test123456:claude", "agent_test123456:codex"]);
});

test("AgentRuntime maps missing profile to provider unavailable", async () => {
  const runtime = new AgentRuntime({
    async exists() {
      return true;
    },
    async close() {},
    async startCommand() {},
  });

  await expect(runtime.startAgent({ ...metadata, provider: undefined })).rejects.toMatchObject({
    code: "SESSION_PROVIDER_UNAVAILABLE",
    message: "Agent provider is unavailable",
  });
});

test("AgentRuntime maps tmux startup failures to provider unavailable", async () => {
  const runtime = new AgentRuntime({
    async exists() {
      return true;
    },
    async close() {},
    async startCommand() {
      throw new TmuxRuntimeError("Unable to start terminal session", "not found");
    },
  });

  await expect(runtime.startAgent(metadata)).rejects.toMatchObject({
    code: "SESSION_PROVIDER_UNAVAILABLE",
    message: "Agent provider is unavailable",
  });
});

test("AgentRuntime delegates lifecycle checks to command runtime", async () => {
  const closed: string[] = [];
  const runtime = new AgentRuntime({
    async exists(tmuxSessionName) {
      return tmuxSessionName === metadata.tmuxSessionName;
    },
    async close(tmuxSessionName) {
      closed.push(tmuxSessionName);
    },
    async startCommand() {},
  });

  expect(await runtime.exists(metadata.tmuxSessionName)).toBe(true);
  await runtime.close(metadata.tmuxSessionName);
  expect(closed).toEqual([metadata.tmuxSessionName]);
});
