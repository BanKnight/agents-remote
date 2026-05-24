import { expect, test } from "bun:test";
import {
  consoleSections,
  defaultConsoleSection,
  projectConsolePath,
  runtimeInputEnabled,
  sectionForId,
  sessionDetailPath,
  sessionStatusLabel,
} from "./console-model";

test("Project console path encodes URL-sensitive names", () => {
  expect(projectConsolePath("hello world 中文")).toBe(
    "/projects/hello%20world%20%E4%B8%AD%E6%96%87",
  );
});

test("Agent Sessions are the default console focus", () => {
  expect(defaultConsoleSection).toBe("agents");
  expect(consoleSections[0]?.id).toBe("agents");
  expect(sectionForId("agents").label).toBe("Agent Sessions");
});

test("deferred sections keep Git and Files as placeholders while Terminal is runtime-ready", () => {
  const terminal = sectionForId("terminal");
  const deferredSections = consoleSections.filter(
    (section) => section.id === "git" || section.id === "files",
  );

  expect(terminal.status).toBe("Runtime ready");
  expect(deferredSections.map((section) => section.id)).toEqual(["git", "files"]);
  expect(deferredSections.every((section) => section.status === "Coming soon")).toBe(true);
});

test("runtime input is enabled once session runtime exists", () => {
  expect(runtimeInputEnabled).toBe(true);
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
