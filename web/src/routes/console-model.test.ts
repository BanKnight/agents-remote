import { expect, test } from "bun:test";
import type { Project } from "@agents-remote/shared";
import {
  consoleSections,
  defaultConsoleSection,
  projectConsolePath,
  projectSummary,
  runtimeInputEnabled,
  sectionForId,
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

test("deferred sections are explicit placeholders", () => {
  const deferredSections = consoleSections.filter((section) => section.id !== "agents");

  expect(deferredSections.map((section) => section.id)).toEqual(["terminal", "git", "files"]);
  expect(deferredSections.every((section) => section.status === "Coming soon")).toBe(true);
});

test("runtime input remains disabled before session runtime exists", () => {
  expect(runtimeInputEnabled).toBe(false);
});

test("Project summary keeps runtime pending without fake sessions", () => {
  const project: Project = {
    name: "demo",
    path: "/projects/demo",
    agentSessionCount: 0,
    terminalSessionCount: 0,
  };

  expect(projectSummary(project)).toEqual({
    agentCount: 0,
    terminalCount: 0,
    gitBranch: "Not available in this slice",
    runtimeStatus: "Pending",
  });
});
