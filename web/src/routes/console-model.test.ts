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
  expect(consoleSections.map((section) => section.id)).toEqual(["agents", "files", "git"]);
  expect(sectionForId("agents").labelKey).toBe("section.agents");
});

test("Git and Files are read-only project inspection sections", () => {
  const git = sectionForId("git");
  const files = sectionForId("files");

  expect(git.statusKey).toBe("section.gitStatus");
  expect(files.statusKey).toBe("section.filesStatus");
});

test("session detail path uses project and internal session id", () => {
  expect(sessionDetailPath("hello world 中文", "terminal", "terminal_123")).toBe(
    "/projects/hello%20world%20%E4%B8%AD%E6%96%87/terminal-sessions/terminal_123",
  );
});

test("session status labels distinguish waiting input", () => {
  expect(sessionStatusLabel("idle")).toBe("status.waitingForInput");
  expect(sessionStatusLabel("running")).toBe("status.running");
  expect(sessionStatusLabel("closed")).toBe("status.closed");
  expect(sessionStatusLabel("error")).toBe("status.error");
});

test("session quick keys are unified across session types and keep stable control sequences", () => {
  const agentKeys = sessionQuickKeys("agent");
  const terminalKeys = sessionQuickKeys("terminal");

  const expectedIds = ["shifttab", "escape", "interrupt", "eof", "up", "down"];
  expect(agentKeys.map((key) => key.id)).toEqual(expectedIds);
  expect(terminalKeys.map((key) => key.id)).toEqual(expectedIds);
  expect(agentKeys.find((key) => key.id === "shifttab")?.sequence).toBe("\x1b[Z");
  expect(terminalKeys.find((key) => key.id === "eof")?.sequence).toBe("\x04");
  expect(terminalKeys.find((key) => key.id === "up")?.sequence).toBe("\x1b[A");
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
