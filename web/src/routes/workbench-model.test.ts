import { expect, test } from "bun:test";
import {
  EMPTY_WORKBENCH_LAYOUT,
  WORKBENCH_PANEL_DEFAULT_FLEX,
  WORKBENCH_PANEL_MIN_FLEX,
  type WorkbenchLayout,
  addPanel,
  deriveRows,
  filterWorkbenchViews,
  groupByProject,
  inferSessionTypeFromId,
  parseWorkbenchScope,
  rankGlobalInstances,
  removePanel,
  resizePair,
  setPanelSize,
  setPanelState,
  initPanelStates,
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

// ── Phase 5 面板三态（setPanelState / initPanelStates / panelStates 清理 / deriveRows 过滤）──

test("setPanelState: 设 expanded 时原 expanded 自动 collapsed（单 expanded 守卫）", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
    panelStates: { a: "expanded", b: "collapsed", c: "collapsed" },
  });
  const r = setPanelState(l, "b", "expanded");
  expect(r.panelStates.b).toBe("expanded");
  expect(r.panelStates.a).toBe("collapsed"); // 原 expanded 降级
  expect(r.panelStates.c).toBe("collapsed"); // 不影响其他
});

test("setPanelState: 设 collapsed/minimized 不影响其他面板", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    panelStates: { a: "expanded", b: "collapsed" },
  });
  expect(setPanelState(l, "b", "minimized").panelStates).toEqual({
    a: "expanded",
    b: "minimized",
  });
  expect(setPanelState(l, "a", "collapsed").panelStates).toEqual({
    a: "collapsed",
    b: "collapsed",
  });
});

test("setPanelState: 无原 expanded 时设 expanded 不动其他", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    panelStates: { a: "collapsed", b: "collapsed" },
  });
  expect(setPanelState(l, "a", "expanded").panelStates).toEqual({
    a: "expanded",
    b: "collapsed",
  });
});

test("setPanelState: minimized 该面板 === maximized 时同步清 maximized（状态机死角修复）", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    panelStates: { a: "expanded", b: "collapsed" },
    maximized: "a",
  });
  const r = setPanelState(l, "a", "minimized");
  expect(r.panelStates.a).toBe("minimized");
  expect(r.maximized).toBeNull(); // minimized 面板的 maximized 清空，避免 deriveRows 死角
});

test("setPanelState: minimized 其他面板时 maximized 不动", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    panelStates: { a: "expanded", b: "collapsed" },
    maximized: "a",
  });
  expect(setPanelState(l, "b", "minimized").maximized).toBe("a");
});

test("initPanelStates: focusSessionId = expanded，其余 collapsed", () => {
  const l = layout({ panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")] });
  const r = initPanelStates(l, "b");
  expect(r.panelStates).toEqual({ a: "collapsed", b: "expanded", c: "collapsed" });
});

test("initPanelStates: 无 focusSessionId 时 panels[0] = expanded", () => {
  const l = layout({ panels: [ref("p", "a"), ref("p", "b")] });
  const r = initPanelStates(l);
  expect(r.panelStates).toEqual({ a: "expanded", b: "collapsed" });
});

test("initPanelStates: 已有 panelStates 不覆盖（持久化恢复保留用户自定义）", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
    panelStates: { a: "minimized", b: "expanded" }, // c 缺失
  });
  const r = initPanelStates(l, "c");
  expect(r.panelStates).toEqual({ a: "minimized", b: "expanded", c: "collapsed" });
});

test("initPanelStates: 空面板返回原 layout", () => {
  const l = EMPTY_WORKBENCH_LAYOUT;
  expect(initPanelStates(l, "x")).toBe(l);
});

test("addPanel: 新面板默认 collapsed", () => {
  const l = addPanel(EMPTY_WORKBENCH_LAYOUT, ref("p", "a"));
  expect(l.panelStates.a).toBe("collapsed");
  const l2 = addPanel(l, ref("p", "b"));
  expect(l2.panelStates.b).toBe("collapsed");
  expect(l2.panelStates.a).toBe("collapsed");
});

test("removePanel: 清理 panelStates", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    panelStates: { a: "expanded", b: "minimized" },
  });
  const r = removePanel(l, "b");
  expect(r.panelStates).toEqual({ a: "expanded" });
});

test("deriveRows: minimized 面板过滤出布局区（仍 in panels）", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
    panelStates: { a: "expanded", b: "minimized", c: "collapsed" },
  });
  const rows = deriveRows(l);
  expect(rows).toEqual([[ref("p", "a"), ref("p", "c")]]); // b 被过滤
});

test("deriveRows: minimized + newRows 交互（过滤后行布局正确）", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
    newRows: ["c"],
    panelStates: { a: "expanded", b: "minimized", c: "collapsed" },
  });
  // b minimized 过滤；c 起新行；剩 a + c 两行
  expect(deriveRows(l)).toEqual([[ref("p", "a")], [ref("p", "c")]]);
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

test("groupByProject: 按首次出现项目名建组（稳定，组内保聚合原序）", () => {
  const groups = groupByProject([
    candidate("p2", "a1", "running", "agent"),
    candidate("p1", "a2", "running", "agent"),
    candidate("p2", "a3", "running", "agent"),
    candidate("p1", "a4", "running", "agent"),
  ]);
  expect(groups.map((g) => g.projectName)).toEqual(["p2", "p1"]);
  expect(groups[0].candidates.map((c) => c.ref.sessionId)).toEqual(["a1", "a3"]);
  expect(groups[1].candidates.map((c) => c.ref.sessionId)).toEqual(["a2", "a4"]);
});

test("groupByProject: 空数组 → []；单项目 → 单组", () => {
  expect(groupByProject([])).toEqual([]);
  const groups = groupByProject([
    candidate("solo", "a1", "running", "agent"),
    candidate("solo", "t1", "running", "terminal"),
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0].projectName).toBe("solo");
  expect(groups[0].candidates.map((c) => c.ref.sessionId)).toEqual(["a1", "t1"]);
});

// ── filterWorkbenchViews（§5 视图矩阵：按 scope/isMobile 过滤 ViewSwitcher 可用视图）──

test("filterWorkbenchViews: 桌面 global 四视图全开", () => {
  expect(filterWorkbenchViews({ kind: "global" }, false)).toEqual([
    "split",
    "table",
    "grid",
    "grouped",
  ]);
});

test("filterWorkbenchViews: 桌面 project 隐藏 grouped", () => {
  expect(filterWorkbenchViews({ kind: "project", key: "p" }, false)).toEqual([
    "split",
    "table",
    "grid",
  ]);
});

test("filterWorkbenchViews: 移动 global 隐藏 split（grouped/grid/table 三视图可切）", () => {
  expect(filterWorkbenchViews({ kind: "global" }, true)).toEqual(["table", "grid", "grouped"]);
});

test("filterWorkbenchViews: 移动 project 隐藏 split + grouped（仅 table/grid）", () => {
  expect(filterWorkbenchViews({ kind: "project", key: "p" }, true)).toEqual(["table", "grid"]);
});
