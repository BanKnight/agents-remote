import { expect, test } from "bun:test";
import {
  canSendToSession,
  consoleSections,
  defaultConsoleSection,
  groupedCommands,
  isConnectionFresh,
  migrateCustomKeysToCommands,
  normalizeSessionTextInput,
  presetTerminalKeys,
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

  const expectedIds = ["shifttab", "escape", "interrupt", "eof", "up", "down", "left", "right"];
  expect(agentKeys.map((key) => key.id)).toEqual(expectedIds);
  expect(terminalKeys.map((key) => key.id)).toEqual(expectedIds);
  expect(agentKeys.find((key) => key.id === "shifttab")?.sequence).toBe("\x1b[Z");
  expect(terminalKeys.find((key) => key.id === "eof")?.sequence).toBe("\x04");
  expect(terminalKeys.find((key) => key.id === "up")?.sequence).toBe("\x1b[A");
  expect(terminalKeys.find((key) => key.id === "left")?.sequence).toBe("\x1b[D");
  expect(terminalKeys.find((key) => key.id === "right")?.sequence).toBe("\x1b[C");
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

test("isConnectionFresh: fresh within PONG_TIMEOUT_MS, stale beyond, never-connected is stale", () => {
  const now = 1_000_000;
  // 收到 pong 后窗口内 → 新鲜。
  expect(isConnectionFresh(now - 10_000, now)).toBe(true);
  expect(isConnectionFresh(now - 49_999, now)).toBe(true);
  // 超过窗口（half-open：readyState 仍 OPEN 但对端不回 pong）→ 不新鲜。
  expect(isConnectionFresh(now - 50_001, now)).toBe(false);
  // 从未收到 pong（连接未建立 / lastPongAt=0）→ 不新鲜。
  expect(isConnectionFresh(0, now)).toBe(false);
});

test("preset terminal keys keep stable VT/xterm control sequences", () => {
  // 目录完整性：id 唯一、label/sequence 非空、全部预置（preset- 前缀）。
  const ids = presetTerminalKeys.map((k) => k.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(presetTerminalKeys.every((k) => k.label && k.sequence)).toBe(true);

  const byId = new Map(presetTerminalKeys.map((k) => [k.id, k]));
  // Tab / 行编辑 Ctrl 系（C0 控制字符）。
  expect(byId.get("preset-tab")?.sequence).toBe("\t");
  expect(byId.get("preset-ctrl-a")?.sequence).toBe("\x01");
  expect(byId.get("preset-ctrl-e")?.sequence).toBe("\x05");
  expect(byId.get("preset-ctrl-u")?.sequence).toBe("\x15");
  expect(byId.get("preset-ctrl-k")?.sequence).toBe("\x0b");
  expect(byId.get("preset-ctrl-w")?.sequence).toBe("\x17");
  expect(byId.get("preset-ctrl-l")?.sequence).toBe("\x0c");
  expect(byId.get("preset-ctrl-r")?.sequence).toBe("\x12");
  // 导航键（xterm CSI 变体）。
  expect(byId.get("preset-pgup")?.sequence).toBe("\x1b[5~");
  expect(byId.get("preset-pgdn")?.sequence).toBe("\x1b[6~");
  expect(byId.get("preset-home")?.sequence).toBe("\x1b[H");
  expect(byId.get("preset-end")?.sequence).toBe("\x1b[F");
  // F1–F4 = SS3（\x1bO?），F5–F12 = CSI 编号变体。
  expect(byId.get("preset-f1")?.sequence).toBe("\x1bOP");
  expect(byId.get("preset-f4")?.sequence).toBe("\x1bOS");
  expect(byId.get("preset-f5")?.sequence).toBe("\x1b[15~");
  expect(byId.get("preset-f12")?.sequence).toBe("\x1b[24~");
});

test("migrateCustomKeysToCommands converts custom keys to default-group commands", () => {
  const custom = [
    { id: "custom-a", label: "deploy", sequence: "make deploy" },
    { id: "custom-b", label: "status", sequence: "git status" },
  ];
  expect(migrateCustomKeysToCommands(custom)).toEqual([
    { id: "custom-a", label: "deploy", script: "make deploy", group: "" },
    { id: "custom-b", label: "status", script: "git status", group: "" },
  ]);
  // 空输入 → 空输出（迁移 effect 的早退路径语义一致）。
  expect(migrateCustomKeysToCommands([])).toEqual([]);
});

test("groupedCommands partitions by first-seen group order and preserves item order", () => {
  const cmds = [
    { id: "1", label: "a", script: "a", group: "deploy" },
    { id: "2", label: "b", script: "b", group: "" },
    { id: "3", label: "c", script: "c", group: "deploy" },
    { id: "4", label: "d", script: "d", group: "ops" },
    { id: "5", label: "e", script: "e", group: "" },
  ];
  expect(groupedCommands(cmds)).toEqual([
    { group: "deploy", items: [cmds[0], cmds[2]] },
    { group: "", items: [cmds[1], cmds[4]] },
    { group: "ops", items: [cmds[3]] },
  ]);
  // 空输入 → 无分区。
  expect(groupedCommands([])).toEqual([]);
});
