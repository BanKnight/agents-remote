import { expect, test } from "bun:test";
import {
  EMPTY_WORKBENCH_LAYOUT,
  WORKBENCH_PANEL_DEFAULT_FLEX,
  WORKBENCH_PANEL_MIN_FLEX,
  type WorkbenchLayout,
  addPanel,
  deriveRows,
  inferSessionTypeFromId,
  parseWorkbenchScope,
  rankGlobalInstances,
  removePanel,
  resizePair,
  setPanelSize,
  toggleMaximize,
  validateWorkbenchSearch,
  workbenchPath,
} from "./workbench-model";

const layout = (overrides: Partial<WorkbenchLayout> = {}): WorkbenchLayout => ({
  ...EMPTY_WORKBENCH_LAYOUT,
  ...overrides,
});

const ref = (projectName: string, sessionId: string) => ({ projectName, sessionId });

test("parseWorkbenchScope: global literal vs project key", () => {
  expect(parseWorkbenchScope("global")).toEqual({ kind: "global" });
  expect(parseWorkbenchScope("my-proj")).toEqual({ kind: "project", key: "my-proj" });
});

test("workbenchPath encodes scope + optional focusId", () => {
  expect(workbenchPath({ kind: "global" })).toBe("/global");
  expect(workbenchPath({ kind: "project", key: "my proj" })).toBe("/projects/my%20proj");
  expect(workbenchPath({ kind: "project", key: "my proj" }, "agent_1")).toBe(
    "/projects/my%20proj/session/agent_1",
  );
});

test("inferSessionTypeFromId reads agent_/terminal_ prefix", () => {
  expect(inferSessionTypeFromId("agent_abc")).toBe("agent");
  expect(inferSessionTypeFromId("terminal_abc")).toBe("terminal");
  expect(inferSessionTypeFromId("unknown_abc")).toBeUndefined();
});

test("validateWorkbenchSearch whitelists rightTab, omits key otherwise", () => {
  expect(validateWorkbenchSearch({ rightTab: "files" })).toEqual({ rightTab: "files" });
  expect(validateWorkbenchSearch({ rightTab: "git" })).toEqual({ rightTab: "git" });
  expect(validateWorkbenchSearch({ rightTab: "nope" })).toEqual({});
  expect(validateWorkbenchSearch({})).toEqual({});
});

test("deriveRows: flat panels form one row", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
  });
  expect(deriveRows(l)).toEqual([[ref("p", "a"), ref("p", "b"), ref("p", "c")]]);
});

test("deriveRows: newRows marker splits into multiple rows", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
    newRows: ["c"],
  });
  expect(deriveRows(l)).toEqual([[ref("p", "a"), ref("p", "b")], [ref("p", "c")]]);
});

test("deriveRows: newRows on first panel is ignored", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    newRows: ["a"],
  });
  expect(deriveRows(l)).toEqual([[ref("p", "a"), ref("p", "b")]]);
});

test("deriveRows: maximized collapses to single panel single row", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
    maximized: "b",
  });
  expect(deriveRows(l)).toEqual([[ref("p", "b")]]);
});

test("deriveRows: maximized id absent from panels yields empty", () => {
  const l = layout({ panels: [ref("p", "a")], maximized: "zzz" });
  expect(deriveRows(l)).toEqual([]);
});

test("addPanel: appends with default flex; idempotent on duplicate sessionId", () => {
  const l = addPanel(EMPTY_WORKBENCH_LAYOUT, ref("p", "a"));
  expect(l.panels).toEqual([ref("p", "a")]);
  expect(l.sizes.a).toBe(WORKBENCH_PANEL_DEFAULT_FLEX);
  const l2 = addPanel(l, ref("p", "a"));
  expect(l2.panels).toEqual([ref("p", "a")]);
});

test("addPanel: afterSessionId inserts after target; newRow marks new row", () => {
  const l = addPanel(EMPTY_WORKBENCH_LAYOUT, ref("p", "a"));
  const l2 = addPanel(l, ref("p", "b"), { afterSessionId: "a" });
  expect(l2.panels).toEqual([ref("p", "a"), ref("p", "b")]);
  expect(l2.newRows).toEqual([]);
  const l3 = addPanel(l2, ref("p", "c"), { afterSessionId: "b", newRow: true });
  expect(l3.panels).toEqual([ref("p", "a"), ref("p", "b"), ref("p", "c")]);
  expect(l3.newRows).toEqual(["c"]);
});

test("addPanel: newRow without afterSessionId appends to same row (no marker)", () => {
  const l = addPanel(EMPTY_WORKBENCH_LAYOUT, ref("p", "a"));
  const l2 = addPanel(l, ref("p", "b"), { newRow: true });
  expect(l2.panels).toEqual([ref("p", "a"), ref("p", "b")]);
  expect(l2.newRows).toEqual([]);
});

test("removePanel: drops panel + cleans newRows/sizes/maximized", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
    newRows: ["c"],
    sizes: { a: 1, b: 2, c: 3 },
    maximized: "b",
  });
  const r = removePanel(l, "b");
  expect(r.panels).toEqual([ref("p", "a"), ref("p", "c")]);
  expect(r.newRows).toEqual(["c"]);
  expect(r.sizes).toEqual({ a: 1, c: 3 });
  expect(r.maximized).toBeNull();
});

test("removePanel: non-maximized panel leaves maximized untouched", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    sizes: { a: 1, b: 1 },
    maximized: "a",
  });
  const r = removePanel(l, "b");
  expect(r.maximized).toBe("a");
});

test("toggleMaximize: flips scalar on/off", () => {
  const l = layout({ panels: [ref("p", "a")] });
  expect(toggleMaximize(l, "a").maximized).toBe("a");
  expect(toggleMaximize({ ...l, maximized: "a" }, "a").maximized).toBeNull();
});

test("setPanelSize: clamps to WORKBENCH_PANEL_MIN_FLEX", () => {
  const l = layout({ panels: [ref("p", "a")], sizes: { a: 1 } });
  expect(setPanelSize(l, "a", 3).sizes.a).toBe(3);
  expect(setPanelSize(l, "a", 0).sizes.a).toBe(WORKBENCH_PANEL_MIN_FLEX);
});

test("resizePair: 左增右减守恒", () => {
  const l = layout({ panels: [ref("p", "a"), ref("p", "b")], sizes: { a: 1, b: 1 } });
  const r = resizePair(l, "a", "b", 0.5);
  expect(r.sizes.a).toBe(1.5);
  expect(r.sizes.b).toBe(0.5);
});

test("resizePair: 左侧钳到 MIN_FLEX（不能把左拖到 0）", () => {
  const l = layout({ panels: [ref("p", "a"), ref("p", "b")], sizes: { a: 1, b: 1 } });
  const r = resizePair(l, "a", "b", -1); // 想让 a = 0
  expect(r.sizes.a).toBeCloseTo(WORKBENCH_PANEL_MIN_FLEX); // 浮点累加：1+(-0.8)≈0.2
  expect(r.sizes.b).toBeCloseTo(1 + (1 - WORKBENCH_PANEL_MIN_FLEX)); // 守恒：右吸收左的减量
});

test("resizePair: 右侧钳到 MIN_FLEX（不能把右拖到 0）", () => {
  const l = layout({ panels: [ref("p", "a"), ref("p", "b")], sizes: { a: 1, b: 1 } });
  const r = resizePair(l, "a", "b", 1); // 想让 b = 0
  expect(r.sizes.b).toBeCloseTo(WORKBENCH_PANEL_MIN_FLEX);
  expect(r.sizes.a).toBeCloseTo(1 + (1 - WORKBENCH_PANEL_MIN_FLEX)); // 守恒
});

const candidate = (
  project: string,
  sessionId: string,
  status: string,
  type: "agent" | "terminal",
) => ({ ref: ref(project, sessionId), status, type });

test("rankGlobalInstances: needs-interaction > running agent > terminal", () => {
  const ranked = rankGlobalInstances([
    candidate("p", "term1", "running", "terminal"),
    candidate("p", "agent-run", "running", "agent"),
    candidate("p", "agent-idle", "idle", "agent"),
  ]);
  expect(ranked.map((r) => r.sessionId)).toEqual(["agent-idle", "agent-run", "term1"]);
});

test("rankGlobalInstances: 同 rank 保持聚合原序（稳定）", () => {
  const ranked = rankGlobalInstances([
    candidate("p1", "a1", "running", "agent"),
    candidate("p2", "a2", "running", "agent"),
    candidate("p1", "a3", "running", "agent"),
  ]);
  expect(ranked.map((r) => r.sessionId)).toEqual(["a1", "a2", "a3"]);
});
