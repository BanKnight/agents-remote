import { expect, test } from "bun:test";
import {
  canSendToSession,
  consoleSections,
  defaultConsoleSection,
  normalizeSessionTextInput,
  projectConsolePath,
  sectionForId,
  sessionDetailPath,
  sessionQuickKeys,
  sessionStatusLabel,
} from "./console-model";

test("Project console path encodes URL-sensitive names", () => {
  expect(projectConsolePath("hello world 中文")).toBe(
    "/projects/hello%20world%20%E4%B8%AD%E6%96%87",
  );
});

test("Agent leads the Project secondary workspace navigation", () => {
  expect(defaultConsoleSection).toBe("agents");
  expect(consoleSections.map((section) => section.id)).toEqual([
    "agents",
    "files",
    "git",
    "terminal",
  ]);
  expect(sectionForId("agents").label).toBe("Agent");
});

test("Git and Files are read-only project inspection sections", () => {
  const git = sectionForId("git");
  const files = sectionForId("files");

  expect(git.status).toBe("Read-only");
  expect(files.status).toBe("Read-only");
});

test("session detail path uses project and internal session id", () => {
  expect(sessionDetailPath("hello world 中文", "terminal", "terminal_123")).toBe(
    "/projects/hello%20world%20%E4%B8%AD%E6%96%87/terminal-sessions/terminal_123",
  );
});

test("session status labels distinguish waiting input", () => {
  expect(sessionStatusLabel("idle")).toBe("Waiting for input");
  expect(sessionStatusLabel("running")).toBe("Running");
  expect(sessionStatusLabel("closed")).toBe("Closed");
  expect(sessionStatusLabel("error")).toBe("Error");
});

test("session quick keys differ by session type and keep stable control sequences", () => {
  const agentKeys = sessionQuickKeys("agent");
  const terminalKeys = sessionQuickKeys("terminal");

  expect(agentKeys.map((key) => key.id)).toEqual([
    "interrupt",
    "up",
    "down",
    "enter",
    "escape",
    "tab",
  ]);
  expect(terminalKeys.map((key) => key.id)).toEqual([
    "interrupt",
    "eof",
    "escape",
    "tab",
    "up",
    "down",
    "left",
    "right",
  ]);
  expect(agentKeys.find((key) => key.id === "interrupt")?.sequence).toBe("");
  expect(terminalKeys.find((key) => key.id === "eof")?.sequence).toBe("");
  expect(terminalKeys.find((key) => key.id === "up")?.sequence).toBe("[A");
});

test("normalizeSessionTextInput preserves non-empty content and suppresses blank sends", () => {
  expect(normalizeSessionTextInput("pwd")).toBe("pwd\n");
  expect(normalizeSessionTextInput("first\nsecond\n")).toBe("first\nsecond\n");
  expect(normalizeSessionTextInput("   \n\t  ")).toBeUndefined();
});

test("canSendToSession only allows connected non-closing streams", () => {
  expect(canSendToSession("connected")).toBe(true);
  expect(canSendToSession("connected", true)).toBe(false);
  expect(canSendToSession("connecting")).toBe(false);
  expect(canSendToSession("disconnected")).toBe(false);
  expect(canSendToSession("ended")).toBe(false);
  expect(canSendToSession("error")).toBe(false);
});
