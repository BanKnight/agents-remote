import { expect, test } from "bun:test";
import {
  EMPTY_WORKBENCH_LAYOUT,
  WORKBENCH_PANEL_DEFAULT_FLEX,
  WORKBENCH_PANEL_MIN_FLEX,
  type DropZone,
  type WorkbenchLayout,
  addPanel,
  deriveRows,
  deriveZone,
  dropPanel,
  filterWorkbenchViews,
  groupByProject,
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

// ── filterWorkbenchViews（§5 视图矩阵：按 scope 过滤 ViewSwitcher 可用视图）──

test("filterWorkbenchViews: global 三视图全开（table/grid/grouped）", () => {
  expect(filterWorkbenchViews({ kind: "global" })).toEqual(["table", "grid", "grouped"]);
});

test("filterWorkbenchViews: project 隐藏 grouped（仅 table/grid）", () => {
  expect(filterWorkbenchViews({ kind: "project", key: "p" })).toEqual(["table", "grid"]);
});

// ── deriveZone（§7.2 5 zone：边缘 15% + 中心 70%，上下优先于左右）──────────────

const rect = (width: number, height: number, left = 0, top = 0) => ({ width, height, left, top });

test("deriveZone: 中心 70% → center", () => {
  expect(deriveZone(rect(100, 100), 50, 50)).toBe("center");
  expect(deriveZone(rect(100, 100), 20, 20)).toBe("center"); // 20% > 15%
  expect(deriveZone(rect(100, 100), 80, 80)).toBe("center");
});

test("deriveZone: 上边缘 < 15% → up", () => {
  expect(deriveZone(rect(100, 100), 50, 5)).toBe("up");
  expect(deriveZone(rect(100, 100), 50, 14)).toBe("up");
});

test("deriveZone: 下边缘 > 85% → down", () => {
  expect(deriveZone(rect(100, 100), 50, 95)).toBe("down");
  expect(deriveZone(rect(100, 100), 50, 86)).toBe("down");
});

test("deriveZone: 左边缘 < 15% → left（中段高度）", () => {
  expect(deriveZone(rect(100, 100), 5, 50)).toBe("left");
  expect(deriveZone(rect(100, 100), 14, 50)).toBe("left");
});

test("deriveZone: 右边缘 > 85% → right（中段高度）", () => {
  expect(deriveZone(rect(100, 100), 95, 50)).toBe("right");
  expect(deriveZone(rect(100, 100), 86, 50)).toBe("right");
});

test("deriveZone: 上下优先于左右（角落归上/下）", () => {
  // 左上角（relX<0.15, relY<0.15）→ up（先判 up/down）
  expect(deriveZone(rect(100, 100), 5, 5)).toBe("up");
  // 右下角（relX>0.85, relY>0.85）→ down
  expect(deriveZone(rect(100, 100), 95, 95)).toBe("down");
  // 左下角（relX<0.15, relY>0.85）→ down
  expect(deriveZone(rect(100, 100), 5, 95)).toBe("down");
});

test("deriveZone: 指针在 rect 外 → null", () => {
  expect(deriveZone(rect(100, 100), -1, 50)).toBeNull();
  expect(deriveZone(rect(100, 100), 101, 50)).toBeNull();
  expect(deriveZone(rect(100, 100), 50, -1)).toBeNull();
  expect(deriveZone(rect(100, 100), 50, 101)).toBeNull();
});

test("deriveZone: zero-size rect → null（防御）", () => {
  expect(deriveZone(rect(0, 100), 0, 0)).toBeNull();
  expect(deriveZone(rect(100, 0), 0, 0)).toBeNull();
});

test("deriveZone: 偏移 rect 用绝对坐标算相对位置", () => {
  expect(deriveZone(rect(100, 100, 200, 300), 250, 305)).toBe("up"); // 中心 x，relY=5%
});

// ── dropPanel（§7.4 拖放分屏主路径）──────────────────────────────────────────

test("dropPanel: 空白区 drop = addPanel 末尾（首个 group）", () => {
  const r = dropPanel(EMPTY_WORKBENCH_LAYOUT, ref("p", "a"), null, "center");
  expect(r.panels).toEqual([ref("p", "a")]);
  expect(r.newRows).toEqual([]);
  expect(r.sizes.a).toBe(WORKBENCH_PANEL_DEFAULT_FLEX);
});

test("dropPanel: 空白区 drop 已存在的 ref → noop 返回原引用", () => {
  const l = layout({ panels: [ref("p", "a")] });
  const r = dropPanel(l, ref("p", "a"), null, "center");
  expect(r).toBe(l);
});

test("dropPanel: 自身 drop（ref===target）所有 zone noop 返回原引用", () => {
  const l = layout({ panels: [ref("p", "a")] });
  for (const zone of ["up", "down", "left", "right", "center"] as DropZone[]) {
    expect(dropPanel(l, ref("p", "a"), "a", zone)).toBe(l);
  }
});

test("dropPanel: target 不在 panels → 返回原引用（防御）", () => {
  const l = layout({ panels: [ref("p", "a")] });
  expect(dropPanel(l, ref("p", "b"), "zzz", "up")).toBe(l);
});

test("dropPanel: up 给 target 加 newRows（ref 留旧行在上方）", () => {
  const l = layout({ panels: [ref("p", "a")] });
  const r = dropPanel(l, ref("p", "b"), "a", "up");
  expect(r.panels).toEqual([ref("p", "b"), ref("p", "a")]);
  expect(r.newRows).toEqual(["a"]);
  expect(deriveRows(r)).toEqual([[ref("p", "b")], [ref("p", "a")]]);
});

test("dropPanel: down 给 ref 加 newRows（ref 起新行在 target 下方）", () => {
  const l = layout({ panels: [ref("p", "a")] });
  const r = dropPanel(l, ref("p", "b"), "a", "down");
  expect(r.panels).toEqual([ref("p", "a"), ref("p", "b")]);
  expect(r.newRows).toEqual(["b"]);
  expect(deriveRows(r)).toEqual([[ref("p", "a")], [ref("p", "b")]]);
});

test("dropPanel: left 同行插 target 之前（ref 在左）", () => {
  const l = layout({ panels: [ref("p", "a")] });
  const r = dropPanel(l, ref("p", "b"), "a", "left");
  expect(r.panels).toEqual([ref("p", "b"), ref("p", "a")]);
  expect(r.newRows).toEqual([]);
  expect(deriveRows(r)).toEqual([[ref("p", "b"), ref("p", "a")]]);
});

test("dropPanel: right 同行插 target 之后（ref 在右）", () => {
  const l = layout({ panels: [ref("p", "a")] });
  const r = dropPanel(l, ref("p", "b"), "a", "right");
  expect(r.panels).toEqual([ref("p", "a"), ref("p", "b")]);
  expect(r.newRows).toEqual([]);
  expect(deriveRows(r)).toEqual([[ref("p", "a"), ref("p", "b")]]);
});

test("dropPanel: center 替换 target 位置 + 继承 size", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    sizes: { a: 2, b: 1 },
    newRows: ["b"],
  });
  const r = dropPanel(l, ref("p", "c"), "a", "center");
  expect(r.panels).toEqual([ref("p", "c"), ref("p", "b")]);
  expect(r.sizes.c).toBe(2); // 继承 target 的 size
  expect(r.sizes.a).toBeUndefined(); // target size 已删
  expect(r.sizes.b).toBe(1);
});

test("dropPanel: center 替换行首时 newRows 里 target 换成 ref（ref 接管行首）", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    newRows: ["b"],
  });
  const r = dropPanel(l, ref("p", "c"), "b", "center");
  expect(r.panels).toEqual([ref("p", "a"), ref("p", "c")]);
  expect(r.newRows).toEqual(["c"]);
  expect(deriveRows(r)).toEqual([[ref("p", "a")], [ref("p", "c")]]);
});

test("dropPanel: center 替换非行首 → newRows 不变", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    newRows: ["b"],
  });
  const r = dropPanel(l, ref("p", "c"), "a", "center");
  expect(r.panels).toEqual([ref("p", "c"), ref("p", "b")]);
  expect(r.newRows).toEqual(["b"]);
});

test("dropPanel: center 替换 maximized 的 target → 清空 maximized（防空态死锁）", () => {
  // panels=[A,B,C]、A 全屏（maximized）。从左总览拖 B 到全屏 A 中央 = 用 B 替换 A。
  // 若不清 maximized：A 从 panels 消失但 maximized 仍指向 A → deriveRows 返 [] → 空态。
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
    maximized: "a",
  });
  const r = dropPanel(l, ref("p", "b"), "a", "center");
  expect(r.panels).toEqual([ref("p", "b"), ref("p", "c")]);
  expect(r.maximized).toBeNull();
  // deriveRows 应回到正常网格（非空、含 B/C）。
  expect(deriveRows(r)).toEqual([[ref("p", "b"), ref("p", "c")]]);
});

test("dropPanel: center 替换非 maximized 的 target → maximized 不变", () => {
  // A 全屏，B 在 panels 但不可见；从左总览拖 C 到 B 中央替换 B → A 仍全屏。
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    maximized: "a",
  });
  const r = dropPanel(l, ref("p", "c"), "b", "center");
  expect(r.panels).toEqual([ref("p", "a"), ref("p", "c")]);
  expect(r.maximized).toBe("a");
  expect(deriveRows(r)).toEqual([[ref("p", "a")]]);
});

test("dropPanel: ref 已在 layout（重排现有 group）→ removePanel 再插入不重复", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b")],
    sizes: { a: 1, b: 1 },
  });
  // 把 a 拖到 b 的右侧（同行重排，ref a 已在 layout）
  const r = dropPanel(l, ref("p", "a"), "b", "right");
  expect(r.panels).toEqual([ref("p", "b"), ref("p", "a")]);
  expect(r.sizes).toEqual({ a: 1, b: 1 });
  expect(r.newRows).toEqual([]);
});

test("dropPanel: ref 已在 layout + up 跨行重排，ref 的旧 newRows 标记被清", () => {
  const l = layout({
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
    newRows: ["c"],
    sizes: { a: 1, b: 1, c: 1 },
  });
  // 把 c 拖到 a 上方（up）：c 先被 removePanel（清掉 c 的 newRows 标记 + size），
  // 再插在 a 之前 + 给 a 加 newRows。最终 c 在第一行，a 在第二行（a 起新行），b 跟 a。
  const r = dropPanel(l, ref("p", "c"), "a", "up");
  expect(r.panels).toEqual([ref("p", "c"), ref("p", "a"), ref("p", "b")]);
  expect(r.newRows).toEqual(["a"]);
  expect(r.sizes).toEqual({ a: 1, b: 1, c: 1 });
  expect(deriveRows(r)).toEqual([[ref("p", "c")], [ref("p", "a"), ref("p", "b")]]);
});
