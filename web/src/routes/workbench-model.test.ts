import { expect, test } from "bun:test";
import {
  EMPTY_WORKBENCH_LAYOUT,
  EMPTY_WORKBENCH_LAYOUT_V2,
  WORKBENCH_PANEL_DEFAULT_FLEX,
  WORKBENCH_PANEL_MIN_FLEX,
  type WorkbenchGroup,
  type WorkbenchLayout,
  type WorkbenchLayoutV2,
  activeTabRef,
  addGroup,
  addTabToGroup,
  createGroup,
  deriveGroupRows,
  deriveZone,
  dropIntoGroup,
  filterWorkbenchViews,
  findTabBySessionId,
  groupByProject,
  inferSessionTypeFromId,
  migrateLegacyLayout,
  parseWorkbenchScope,
  rankGlobalInstances,
  removeGroup,
  removeTabFromGroup,
  resizeGroups,
  resizeRows,
  setActiveTab,
  toggleGroupMaximize,
  validateWorkbenchSearch,
  workbenchPath,
} from "./workbench-model";

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

test("filterWorkbenchViews: global 三视图全开（grouped/grid/table）", () => {
  expect(filterWorkbenchViews({ kind: "global" })).toEqual(["grouped", "grid", "table"]);
});

test("filterWorkbenchViews: project 隐藏 grouped（仅 grid/table）", () => {
  expect(filterWorkbenchViews({ kind: "project", key: "p" })).toEqual(["grid", "table"]);
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

// ── group+tab 两级模型（VSCode，设计 §7.5/§7.6/§7.7）──────────────────────────

const v2 = (overrides: Partial<WorkbenchLayoutV2> = {}): WorkbenchLayoutV2 => ({
  ...EMPTY_WORKBENCH_LAYOUT_V2,
  ...overrides,
});

const grp = (id: string, sessionIds: string[], projectName = "p"): WorkbenchGroup => ({
  id,
  tabs: sessionIds.map((sid) => ref(projectName, sid)),
  activeTabId: sessionIds[0],
});

test("createGroup: 单 tab + activeTabId", () => {
  const g = createGroup(ref("p", "a"), "g1");
  expect(g.id).toBe("g1");
  expect(g.tabs).toEqual([ref("p", "a")]);
  expect(g.activeTabId).toBe("a");
});

test("deriveGroupRows: flat groups 一行", () => {
  const l = v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"]), grp("g3", ["c"])] });
  expect(deriveGroupRows(l)).toEqual([[grp("g1", ["a"]), grp("g2", ["b"]), grp("g3", ["c"])]]);
});

test("deriveGroupRows: newRowAfter 分行（标记的 group 之后换行）", () => {
  const l = v2({
    groups: [grp("g1", ["a"]), grp("g2", ["b"]), grp("g3", ["c"])],
    newRowAfter: ["g2"],
  });
  expect(deriveGroupRows(l)).toEqual([[grp("g1", ["a"]), grp("g2", ["b"])], [grp("g3", ["c"])]]);
});

test("deriveGroupRows: maximized 收敛到单 group 单行", () => {
  const l = v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])], maximized: "g2" });
  expect(deriveGroupRows(l)).toEqual([[grp("g2", ["b"])]]);
});

test("deriveGroupRows: maximized 不存在 → []", () => {
  const l = v2({ groups: [grp("g1", ["a"])], maximized: "zzz" });
  expect(deriveGroupRows(l)).toEqual([]);
});

test("addGroup: 首个 group 设 activeGroupId + 默认 flex", () => {
  const l = addGroup(EMPTY_WORKBENCH_LAYOUT_V2, grp("g1", ["a"]));
  expect(l.groups).toEqual([grp("g1", ["a"])]);
  expect(l.activeGroupId).toBe("g1");
  expect(l.sizes.g1).toBe(WORKBENCH_PANEL_DEFAULT_FLEX);
});

test("addGroup: 第二个不抢 active；afterGroupId 指定位置", () => {
  const l1 = addGroup(EMPTY_WORKBENCH_LAYOUT_V2, grp("g1", ["a"]));
  const l2 = addGroup(l1, grp("g2", ["b"]));
  expect(l2.activeGroupId).toBe("g1");
  expect(l2.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
  const l3 = addGroup(l1, grp("g3", ["c"]), { afterGroupId: "g1" });
  expect(l3.groups.map((g) => g.id)).toEqual(["g1", "g3"]);
});

test("addGroup: newRow 起新行（前一个加入 newRowAfter）", () => {
  const l1 = addGroup(EMPTY_WORKBENCH_LAYOUT_V2, grp("g1", ["a"]));
  const l2 = addGroup(l1, grp("g2", ["b"]), { newRow: true });
  expect(l2.newRowAfter).toEqual(["g1"]);
  expect(deriveGroupRows(l2).map((row) => row.map((g) => g.id))).toEqual([["g1"], ["g2"]]);
});

test("removeGroup: 删 active 回退 groups[0] + 清 sizes/newRowAfter", () => {
  const l = v2({
    groups: [grp("g1", ["a"]), grp("g2", ["b"]), grp("g3", ["c"])],
    newRowAfter: ["g2"],
    sizes: { g1: 1, g2: 2, g3: 3 },
    activeGroupId: "g2",
  });
  const r = removeGroup(l, "g2");
  expect(r.groups.map((g) => g.id)).toEqual(["g1", "g3"]);
  expect(r.activeGroupId).toBe("g1");
  expect(r.sizes).toEqual({ g1: 1, g3: 3 });
  expect(r.newRowAfter).toEqual([]);
});

test("removeGroup: 删 maximized 的 group → null", () => {
  const l = v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])], maximized: "g2" });
  expect(removeGroup(l, "g2").maximized).toBeNull();
});

test("removeGroup: 删行首 group → rowSizes 联动重算（下一行上移）", () => {
  const l = v2({
    groups: [grp("g1", ["a"]), grp("g2", ["b"]), grp("g3", ["c"])],
    newRowAfter: ["g1"], // 行 [g1],[g2,g3]
    rowSizes: { g1: 2, g2: 1 }, // g2 是第二行行首
  });
  // 删 g2（第二行行首）→ g3 上移成第二行行首；g3 之前不是行首 → rowSizes[g3] 用默认。
  const r = removeGroup(l, "g2");
  expect(deriveGroupRows(r).map((row) => row.map((g) => g.id))).toEqual([["g1"], ["g3"]]);
  expect(r.rowSizes).toEqual({ g1: 2, g3: WORKBENCH_PANEL_DEFAULT_FLEX });
});

test("addTabToGroup: 队尾加 tab + 设 active", () => {
  const l = v2({ groups: [grp("g1", ["a"])], activeGroupId: "g1" });
  const r = addTabToGroup(l, "g1", ref("p", "b"));
  expect(r.groups[0].tabs.map((t) => t.sessionId)).toEqual(["a", "b"]);
  expect(r.groups[0].activeTabId).toBe("b");
});

test("addTabToGroup: 重复 sessionId 仅激活不重复加", () => {
  const l = v2({ groups: [grp("g1", ["a", "b"])], activeGroupId: "g1" });
  const r = addTabToGroup(l, "g1", ref("p", "b"));
  expect(r.groups[0].tabs.map((t) => t.sessionId)).toEqual(["a", "b"]);
  expect(r.groups[0].activeTabId).toBe("b");
});

test("setActiveTab: 切 active + 设 activeGroupId", () => {
  const l = v2({ groups: [grp("g1", ["a", "b"])], activeGroupId: "g2" });
  const r = setActiveTab(l, "g1", "b");
  expect(r.groups[0].activeTabId).toBe("b");
  expect(r.activeGroupId).toBe("g1");
});

test("setActiveTab: 不存在的 tab → noop", () => {
  const l = v2({ groups: [grp("g1", ["a"])], activeGroupId: "g1" });
  expect(setActiveTab(l, "g1", "zzz")).toBe(l);
});

test("removeTabFromGroup: 删非 active tab 不改 active", () => {
  const l = v2({ groups: [grp("g1", ["a", "b"])], activeGroupId: "g1" });
  const r = removeTabFromGroup(l, "g1", "b");
  expect(r.groups[0].tabs.map((t) => t.sessionId)).toEqual(["a"]);
  expect(r.groups[0].activeTabId).toBe("a");
});

test("removeTabFromGroup: 删 active → 切剩余 [0]", () => {
  const l = v2({ groups: [grp("g1", ["a", "b", "c"])], activeGroupId: "g1" });
  const r = removeTabFromGroup(l, "g1", "a");
  expect(r.groups[0].tabs.map((t) => t.sessionId)).toEqual(["b", "c"]);
  expect(r.groups[0].activeTabId).toBe("b");
});

test("removeTabFromGroup: group 空 → removeGroup（active 迁移）", () => {
  const l = v2({
    groups: [grp("g1", ["a"]), grp("g2", ["b"])],
    activeGroupId: "g1",
    sizes: { g1: 1, g2: 1 },
  });
  const r = removeTabFromGroup(l, "g1", "a");
  expect(r.groups.map((g) => g.id)).toEqual(["g2"]);
  expect(r.sizes).toEqual({ g2: 1 });
  expect(r.activeGroupId).toBe("g2");
});

test("resizeGroups: 守恒（左增 = 右减）", () => {
  const l = v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])], sizes: { g1: 1, g2: 1 } });
  const r = resizeGroups(l, "g1", "g2", 0.3);
  expect(r.sizes.g1).toBeCloseTo(1.3);
  expect(r.sizes.g2).toBeCloseTo(0.7);
});

test("resizeGroups: 钳制到 MIN_FLEX（右不小于 MIN）", () => {
  const l = v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])], sizes: { g1: 1, g2: 1 } });
  const r = resizeGroups(l, "g1", "g2", 5);
  expect(r.sizes.g2).toBeCloseTo(WORKBENCH_PANEL_MIN_FLEX);
  expect(r.sizes.g1).toBeCloseTo(1 + (1 - WORKBENCH_PANEL_MIN_FLEX));
});

test("resizeRows: 纵向守恒（key=行首 groupId）", () => {
  const l = v2({
    groups: [grp("g1", ["a"]), grp("g2", ["b"])],
    newRowAfter: ["g1"],
    rowSizes: { g1: 1, g2: 1 },
  });
  const r = resizeRows(l, "g1", "g2", 0.4);
  expect(r.rowSizes.g1).toBeCloseTo(1.4);
  expect(r.rowSizes.g2).toBeCloseTo(0.6);
});

test("toggleGroupMaximize: 设 maximized + activeGroupId；再 toggle 还原", () => {
  const l = v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])], activeGroupId: "g1" });
  const r1 = toggleGroupMaximize(l, "g2");
  expect(r1.maximized).toBe("g2");
  expect(r1.activeGroupId).toBe("g2");
  expect(toggleGroupMaximize(r1, "g2").maximized).toBeNull();
});

test("findTabBySessionId: 找到 / 没找到", () => {
  const l = v2({ groups: [grp("g1", ["a", "b"]), grp("g2", ["c"])] });
  expect(findTabBySessionId(l, "b")).toEqual({ groupId: "g1", tabIndex: 1 });
  expect(findTabBySessionId(l, "zzz")).toBeNull();
});

test("activeTabRef: 活动 group 的活动 tab / 无活动 group → null", () => {
  const l = v2({ groups: [grp("g1", ["a", "b"])], activeGroupId: "g1" });
  expect(activeTabRef(l)).toEqual(ref("p", "a"));
  const l2 = v2({ groups: [grp("g1", ["a"])], activeGroupId: null });
  expect(activeTabRef(l2)).toBeNull();
});

test("dropIntoGroup: 空白区 = 首个 group（ref 不在 layout）", () => {
  const r = dropIntoGroup(EMPTY_WORKBENCH_LAYOUT_V2, ref("p", "a"), null, "center");
  expect(r.groups).toHaveLength(1);
  expect(r.groups[0].tabs).toEqual([ref("p", "a")]);
  expect(r.activeGroupId).toBe(r.groups[0].id);
});

test("dropIntoGroup: 空白区 ref 已存在 → 激活该 tab（不新 group）", () => {
  const l = v2({ groups: [grp("g1", ["a", "b"])], activeGroupId: "g1" });
  const r = dropIntoGroup(l, ref("p", "b"), null, "center");
  expect(r.groups).toHaveLength(1);
  expect(r.groups[0].activeTabId).toBe("b");
});

test("dropIntoGroup: center 在 target group 开新 tab", () => {
  const l = v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])], activeGroupId: "g1" });
  const r = dropIntoGroup(l, ref("p", "c"), "g1", "center");
  expect(r.groups[0].tabs.map((t) => t.sessionId)).toEqual(["a", "c"]);
  expect(r.groups[0].activeTabId).toBe("c");
});

test("dropIntoGroup: center ref 已在 target → 仅激活", () => {
  const l = v2({ groups: [grp("g1", ["a", "b"])], activeGroupId: "g1" });
  const r = dropIntoGroup(l, ref("p", "b"), "g1", "center");
  expect(r.groups[0].tabs.map((t) => t.sessionId)).toEqual(["a", "b"]);
  expect(r.groups[0].activeTabId).toBe("b");
});

test("dropIntoGroup: center 跨 group 迁移（原组空则删）", () => {
  const l = v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])], activeGroupId: "g1" });
  const r = dropIntoGroup(l, ref("p", "b"), "g1", "center");
  expect(r.groups).toHaveLength(1);
  expect(r.groups[0].id).toBe("g1");
  expect(r.groups[0].tabs.map((t) => t.sessionId)).toEqual(["a", "b"]);
});

test("dropIntoGroup: left 同行（新 group 插 target 之前）", () => {
  const l = v2({ groups: [grp("g1", ["a"])], activeGroupId: "g1" });
  const r = dropIntoGroup(l, ref("p", "b"), "g1", "left");
  expect(r.groups[0].tabs).toEqual([ref("p", "b")]);
  expect(r.groups[1].id).toBe("g1");
  expect(deriveGroupRows(r)).toHaveLength(1);
});

test("dropIntoGroup: right 同行（新 group 插 target 之后）", () => {
  const l = v2({ groups: [grp("g1", ["a"])], activeGroupId: "g1" });
  const r = dropIntoGroup(l, ref("p", "b"), "g1", "right");
  expect(r.groups[0].id).toBe("g1");
  expect(r.groups[1].tabs).toEqual([ref("p", "b")]);
  expect(deriveGroupRows(r)).toHaveLength(1);
});

test("dropIntoGroup: right target 是行尾 → 换行标记迁移到新 group", () => {
  const l = v2({
    groups: [grp("g1", ["a"]), grp("g2", ["b"]), grp("g3", ["c"])],
    newRowAfter: ["g2"], // 行 [g1,g2],[g3]
    activeGroupId: "g1",
  });
  const r = dropIntoGroup(l, ref("p", "d"), "g2", "right");
  expect(r.newRowAfter).not.toContain("g2");
  expect(deriveGroupRows(r).map((row) => row.map((g) => g.id))).toHaveLength(2);
});

test("dropIntoGroup: up 新 group 在 target 所在行上方独占新行", () => {
  const l = v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])], activeGroupId: "g1" });
  const r = dropIntoGroup(l, ref("p", "c"), "g2", "up");
  const gcId = r.groups.find((g) => g.tabs.some((t) => t.sessionId === "c"))!.id;
  expect(deriveGroupRows(r).map((row) => row.map((g) => g.id))).toEqual([[gcId], ["g1", "g2"]]);
});

test("dropIntoGroup: down 新 group 在 target 所在行下方独占新行", () => {
  const l = v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])], activeGroupId: "g1" });
  const r = dropIntoGroup(l, ref("p", "c"), "g1", "down");
  const gcId = r.groups.find((g) => g.tabs.some((t) => t.sessionId === "c"))!.id;
  expect(deriveGroupRows(r).map((row) => row.map((g) => g.id))).toEqual([["g1", "g2"], [gcId]]);
});

test("dropIntoGroup: down 到中间行 → 新 group 独占新行，下方行保持", () => {
  const l = v2({
    groups: [grp("g1", ["a"]), grp("g2", ["b"]), grp("g3", ["c"]), grp("g4", ["d"])],
    newRowAfter: ["g2"], // 行 [g1,g2],[g3,g4]
    activeGroupId: "g1",
  });
  const r = dropIntoGroup(l, ref("p", "e"), "g1", "down");
  const gcId = r.groups.find((g) => g.tabs.some((t) => t.sessionId === "e"))!.id;
  expect(deriveGroupRows(r).map((row) => row.map((g) => g.id))).toEqual([
    ["g1", "g2"],
    [gcId],
    ["g3", "g4"],
  ]);
});

test("migrateLegacyLayout: 每 panel → 1 group 1 tab；sizes 映射", () => {
  const legacy: WorkbenchLayout = {
    ...EMPTY_WORKBENCH_LAYOUT,
    panels: [ref("p", "a"), ref("p", "b")],
    sizes: { a: 2, b: 3 },
  };
  const m = migrateLegacyLayout(legacy);
  expect(m.groups.map((g) => g.id)).toEqual(["a", "b"]);
  expect(m.groups[0].tabs).toEqual([ref("p", "a")]);
  expect(m.activeGroupId).toBe("a");
  expect(m.sizes).toEqual({ a: 2, b: 3 });
  expect(m.newRowAfter).toEqual([]);
});

test("migrateLegacyLayout: newRows（自己起新行）→ newRowAfter（前一个之后换行）", () => {
  const legacy: WorkbenchLayout = {
    ...EMPTY_WORKBENCH_LAYOUT,
    panels: [ref("p", "a"), ref("p", "b"), ref("p", "c")],
    newRows: ["c"],
  };
  const m = migrateLegacyLayout(legacy);
  expect(m.newRowAfter).toEqual(["b"]);
  expect(deriveGroupRows(m).map((row) => row.map((g) => g.id))).toEqual([["a", "b"], ["c"]]);
});

test("migrateLegacyLayout: maximized sessionId → maximized groupId", () => {
  const legacy: WorkbenchLayout = {
    ...EMPTY_WORKBENCH_LAYOUT,
    panels: [ref("p", "a"), ref("p", "b")],
    maximized: "b",
  };
  expect(migrateLegacyLayout(legacy).maximized).toBe("b");
});
