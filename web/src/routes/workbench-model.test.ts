import { expect, test } from "bun:test";
import {
  EMPTY_WORKBENCH_LAYOUT,
  EMPTY_WORKBENCH_LAYOUT_V2,
  EMPTY_WORKBENCH_LAYOUT_V3,
  WORKBENCH_PANEL_DEFAULT_FLEX,
  WORKBENCH_PANEL_MIN_FLEX,
  type LeafNode,
  type SplitDirection,
  type SplitNode,
  type TreeNode,
  type WorkbenchGroup,
  type WorkbenchLayout,
  type WorkbenchLayoutV2,
  type WorkbenchLayoutV3,
  activeTabRefLeaf,
  addTabToLeaf,
  createLeaf,
  deriveGroupRows,
  deriveWorkbenchRouteContext,
  deriveZone,
  dropIntoLeaf,
  ensureTabOpenLeaf,
  filterWorkbenchViews,
  findLeafBySessionId,
  findTabRefLeaf,
  groupByProject,
  inferSessionTypeFromId,
  migrateLegacyLayout,
  migrateV2ToV3,
  parseWorkbenchScope,
  rankGlobalInstances,
  removeLeaf,
  removeTabFromLeaf,
  resizeSplitChildren,
  setActiveTabInLeaf,
  splitFilePath,
  tabIdOf,
  toggleLeafMaximize,
  validateLayoutV3,
  validateWorkbenchSearch,
  workbenchPath,
} from "./workbench-model";

const ref = (projectName: string, sessionId: string) => ({
  kind: "session" as const,
  projectName,
  sessionId,
});

test("parseWorkbenchScope: global literal vs project key", () => {
  expect(parseWorkbenchScope("global")).toEqual({ kind: "global" });
  expect(parseWorkbenchScope("my-proj")).toEqual({ kind: "project", key: "my-proj" });
});

test("workbenchPath encodes scope + optional focusId", () => {
  // global scope URL = /projects（决策 22 重命名，项目总览语义）；project scope = /projects/$key。
  expect(workbenchPath({ kind: "global" })).toBe("/projects");
  expect(workbenchPath({ kind: "global" }, "agent_1")).toBe("/projects/session/agent_1");
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

// deriveWorkbenchRouteContext 只读 leaf match 的 fullPath/params/search，故测试用最小化 stub。
const routeLeaf = (
  fullPath: string,
  params: Record<string, string | undefined>,
  search: object = {},
) => ({ fullPath, params, search }) as unknown as Parameters<typeof deriveWorkbenchRouteContext>[0];

test("deriveWorkbenchRouteContext: global 路由（/ 和 /projects）→ scope global 无 focus", () => {
  expect(deriveWorkbenchRouteContext(routeLeaf("/", {}))).toEqual({
    scope: { kind: "global" },
    focusId: undefined,
  });
  expect(deriveWorkbenchRouteContext(routeLeaf("/projects", {}))).toEqual({
    scope: { kind: "global" },
    focusId: undefined,
  });
});

test("deriveWorkbenchRouteContext: global focus /projects/session/$id → focusId=id", () => {
  expect(
    deriveWorkbenchRouteContext(routeLeaf("/projects/session/$id", { id: "agent_abc" })),
  ).toEqual({
    scope: { kind: "global" },
    focusId: "agent_abc",
  });
});

test("deriveWorkbenchRouteContext: project scope /projects/$key → scope project", () => {
  expect(deriveWorkbenchRouteContext(routeLeaf("/projects/$key", { key: "myproj" }))).toEqual({
    scope: { kind: "project", key: "myproj" },
    focusId: undefined,
  });
});

test("deriveWorkbenchRouteContext: project focus /projects/$key/session/$id", () => {
  expect(
    deriveWorkbenchRouteContext(
      routeLeaf("/projects/$key/session/$id", { key: "p1", id: "agent_x" }),
    ),
  ).toEqual({ scope: { kind: "project", key: "p1" }, focusId: "agent_x" });
});

test("deriveWorkbenchRouteContext: project file focus 编码 file_${全路径}（key/splat 拼项目名前缀）", () => {
  expect(
    deriveWorkbenchRouteContext(
      routeLeaf("/projects/$key/file/$", { key: "p1", _splat: "src/index.ts" }),
    ),
  ).toEqual({ scope: { kind: "project", key: "p1" }, focusId: "file_p1/src/index.ts" });
  // encoded %20 还原为空格
  expect(
    deriveWorkbenchRouteContext(
      routeLeaf("/projects/$key/file/$", { key: "p1", _splat: "a%20b.ts" }),
    ),
  ).toEqual({ scope: { kind: "project", key: "p1" }, focusId: "file_p1/a b.ts" });
  // 空 splat → 无 focus
  expect(
    deriveWorkbenchRouteContext(routeLeaf("/projects/$key/file/$", { key: "p1", _splat: "" })),
  ).toEqual({ scope: { kind: "project", key: "p1" }, focusId: undefined });
});

test("deriveWorkbenchRouteContext: global file focus /files/file/$ → scope global + leftMode files + 全路径 focusId", () => {
  // _splat = 全路径（含项目名前缀），focusId = file_${fullPath}，与 /projects/$key/file/$ 同一文件去重。
  expect(
    deriveWorkbenchRouteContext(routeLeaf("/files/file/$", { _splat: "p1/src/index.ts" })),
  ).toEqual({ scope: { kind: "global" }, focusId: "file_p1/src/index.ts", leftMode: "files" });
  // 空 splat → 无 focus（仍 leftMode files）
  expect(deriveWorkbenchRouteContext(routeLeaf("/files/file/$", { _splat: "" }))).toEqual({
    scope: { kind: "global" },
    focusId: undefined,
    leftMode: "files",
  });
});

test("deriveWorkbenchRouteContext: /files 全局文件总览 → scope global + leftMode files + 无 focus（review 收口）", () => {
  // /files（无 focus）= 全局文件树整页（review 收口后进 layout）；scope=global + leftMode="files"
  // 区分于 /projects（项目总览，leftMode 默认 auto）。移动端 MobileWorkbench 据此分流 MobileFilesOverview。
  expect(deriveWorkbenchRouteContext(routeLeaf("/files", {}))).toEqual({
    scope: { kind: "global" },
    focusId: undefined,
    leftMode: "files",
  });
});

test("splitFilePath: 全路径拆 projectName + 项目相对路径", () => {
  expect(splitFilePath("p1/src/index.ts")).toEqual({ projectName: "p1", path: "src/index.ts" });
  expect(splitFilePath("demo/README.md")).toEqual({ projectName: "demo", path: "README.md" });
  // 无 /（异常降级）：projectName=全串，path 空
  expect(splitFilePath("demo")).toEqual({ projectName: "demo", path: "" });
});

test("deriveWorkbenchRouteContext: git focus 编码 git_${scope}/${path}，gitScope 默认 worktree", () => {
  expect(
    deriveWorkbenchRouteContext(routeLeaf("/projects/$key/git/$", { key: "p1", _splat: "a.ts" })),
  ).toEqual({ scope: { kind: "project", key: "p1" }, focusId: "git_worktree/a.ts" });
  expect(
    deriveWorkbenchRouteContext(
      routeLeaf("/projects/$key/git/$", { key: "p1", _splat: "a.ts" }, { gitScope: "staged" }),
    ),
  ).toEqual({
    scope: { kind: "project", key: "p1" },
    focusId: "git_staged/a.ts",
    gitScope: "staged",
  });
});

test("deriveWorkbenchRouteContext: search 透传 rightTab/view/tab/gitScope", () => {
  expect(
    deriveWorkbenchRouteContext(
      routeLeaf(
        "/projects/$key",
        { key: "p1" },
        { rightTab: "files", view: "grid", tab: "history" },
      ),
    ),
  ).toEqual({
    scope: { kind: "project", key: "p1" },
    focusId: undefined,
    rightTab: "files",
    view: "grid",
    tab: "history",
  });
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

// ── V3 n 叉树模型（VSCode 同构，设计 §7.5/§7.6/§7.7）──────────────────────────

const leaf = (id: string, sessionIds: string[], projectName = "p"): LeafNode => ({
  kind: "leaf",
  id,
  tabs: sessionIds.map((sid) => ref(projectName, sid)),
  activeTabId: sessionIds[0],
});

const split = (
  id: string,
  direction: SplitDirection,
  children: TreeNode[],
  sizes?: Record<string, number>,
): SplitNode => ({
  kind: "split",
  id,
  direction,
  children,
  sizes: sizes ?? Object.fromEntries(children.map((c) => [c.id, WORKBENCH_PANEL_DEFAULT_FLEX])),
});

const v3 = (overrides: Partial<WorkbenchLayoutV3> = {}): WorkbenchLayoutV3 => ({
  ...EMPTY_WORKBENCH_LAYOUT_V3,
  ...overrides,
});

/** 结构摘要：leaf=(sid|sid)，split=h[...]或v[...]。newLeaf id 随机，故用 sessionId 摘要断言树形。 */
const shape = (node: TreeNode | null): string => {
  if (!node) return "null";
  if (node.kind === "leaf") return `(${node.tabs.map((t) => tabIdOf(t)).join("|")})`;
  return `${node.direction === "horizontal" ? "h" : "v"}[${node.children.map(shape).join(",")}]`;
};

/** 不变式校验：合法布局应返回 []。 */
const valid = (l: WorkbenchLayoutV3) => expect(validateLayoutV3(l)).toEqual([]);

test("createLeaf: 单 tab + activeTabId + kind=leaf", () => {
  const lf = createLeaf(ref("p", "a"), "L1");
  expect(lf.kind).toBe("leaf");
  expect(lf.id).toBe("L1");
  expect(lf.tabs).toEqual([ref("p", "a")]);
  expect(lf.activeTabId).toBe("a");
});

// ── migrateV2ToV3 ─────────────────────────────────────────────────────────────

test("migrateV2ToV3: 空 V2 → root null", () => {
  const m = migrateV2ToV3(EMPTY_WORKBENCH_LAYOUT_V2);
  expect(m.root).toBeNull();
  expect(m.activeGroupId).toBeNull();
  expect(m.maximized).toBeNull();
});

test("migrateV2ToV3: 单 group → 单 leaf root", () => {
  const m = migrateV2ToV3(v2({ groups: [grp("g1", ["a"])], activeGroupId: "g1" }));
  expect(shape(m.root)).toBe("(a)");
  expect(m.activeGroupId).toBe("g1");
});

test("migrateV2ToV3: 多 group 单行 → horizontal split", () => {
  const m = migrateV2ToV3(v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])] }));
  expect(shape(m.root)).toBe("h[(a),(b)]");
  valid(m);
});

test("migrateV2ToV3: 多行单 group → vertical split of leaves", () => {
  const m = migrateV2ToV3(
    v2({ groups: [grp("g1", ["a"]), grp("g2", ["b"])], newRowAfter: ["g1"] }),
  );
  expect(shape(m.root)).toBe("v[(a),(b)]");
  valid(m);
});

test("migrateV2ToV3: 多行多 group → vertical(horizontal, horizontal)", () => {
  const m = migrateV2ToV3(
    v2({
      groups: [grp("g1", ["a"]), grp("g2", ["b"]), grp("g3", ["c"]), grp("g4", ["d"])],
      newRowAfter: ["g2"], // [g1,g2],[g3,g4]
    }),
  );
  expect(shape(m.root)).toBe("v[h[(a),(b)],h[(c),(d)]]");
  valid(m);
});

test("migrateV2ToV3: sizes 映射 + active/maximized 直传", () => {
  const m = migrateV2ToV3(
    v2({
      groups: [grp("g1", ["a"]), grp("g2", ["b"])],
      sizes: { g1: 2, g2: 3 },
      activeGroupId: "g2",
      maximized: "g1",
    }),
  );
  expect(m.activeGroupId).toBe("g2");
  expect(m.maximized).toBe("g1");
  const root = m.root as SplitNode;
  expect(root.sizes).toEqual({ g1: 2, g2: 3 });
});

// ── validateLayoutV3 ──────────────────────────────────────────────────────────

test("validateLayoutV3: 合法布局 → []", () => {
  valid(
    v3({
      root: split("s", "horizontal", [leaf("g1", ["a"]), leaf("g2", ["b"])], { g1: 1, g2: 1 }),
      activeGroupId: "g1",
    }),
  );
});

test("validateLayoutV3: root null + active 设置 → 违规", () => {
  expect(validateLayoutV3(v3({ root: null, activeGroupId: "x" }))).toContain(
    "root null but activeGroupId set",
  );
});

test("validateLayoutV3: split < 2 children → 违规", () => {
  const l = v3({ root: split("s", "horizontal", [leaf("g1", ["a"])]) });
  expect(validateLayoutV3(l)).toContain("split s has 1 children (< 2)");
});

test("validateLayoutV3: 同方向嵌套 → 违规", () => {
  const inner = split("s2", "horizontal", [leaf("g2", ["b"]), leaf("g3", ["c"])]);
  const l = v3({ root: split("s1", "horizontal", [leaf("g1", ["a"]), inner]) });
  expect(validateLayoutV3(l)).toContain("split s1 nests same-direction split s2");
});

test("validateLayoutV3: sizes key 与 children 不匹配 → 违规", () => {
  const l = v3({
    root: split("s", "horizontal", [leaf("g1", ["a"]), leaf("g2", ["b"])], { g1: 1 }),
  });
  expect(validateLayoutV3(l)).toContain("split s missing size for child g2");
});

// ── addTabToLeaf / setActiveTabInLeaf ─────────────────────────────────────────

test("addTabToLeaf: 加 tab + 设 active", () => {
  const r = addTabToLeaf(v3({ root: leaf("g1", ["a"]) }), "g1", ref("p", "b"));
  const root = r.root as LeafNode;
  expect(root.tabs.map((t) => tabIdOf(t))).toEqual(["a", "b"]);
  expect(root.activeTabId).toBe("b");
  expect(r.activeGroupId).toBe("g1");
});

test("addTabToLeaf: 重复 sessionId 转激活", () => {
  const r = addTabToLeaf(v3({ root: leaf("g1", ["a", "b"]) }), "g1", ref("p", "b"));
  const root = r.root as LeafNode;
  expect(root.tabs).toHaveLength(2);
  expect(root.activeTabId).toBe("b");
});

test("setActiveTabInLeaf: leaf 不存在 → noop", () => {
  const l = v3({ root: leaf("g1", ["a"]) });
  expect(setActiveTabInLeaf(l, "zzz", "a")).toBe(l);
});

// ── removeTabFromLeaf ─────────────────────────────────────────────────────────

test("removeTabFromLeaf: 删非 active tab", () => {
  const r = removeTabFromLeaf(v3({ root: leaf("g1", ["a", "b"]) }), "g1", "b");
  expect((r.root as LeafNode).tabs.map((t) => tabIdOf(t))).toEqual(["a"]);
});

test("removeTabFromLeaf: 删 active → 切 [0]", () => {
  const r = removeTabFromLeaf(v3({ root: leaf("g1", ["a", "b", "c"]) }), "g1", "a");
  const root = r.root as LeafNode;
  expect(root.tabs.map((t) => tabIdOf(t))).toEqual(["b", "c"]);
  expect(root.activeTabId).toBe("b");
});

test("removeTabFromLeaf: leaf 清空 → split 退化子树提升", () => {
  const r = removeTabFromLeaf(
    v3({
      root: split("s", "horizontal", [leaf("g1", ["a"]), leaf("g2", ["b"])]),
      activeGroupId: "g1",
    }),
    "g1",
    "a",
  );
  expect(shape(r.root)).toBe("(b)");
  expect(r.activeGroupId).toBe("g2");
});

// ── removeLeaf ────────────────────────────────────────────────────────────────

test("removeLeaf: 中间 leaf 删除 → 子树提升 + active/maximized 回退", () => {
  const r = removeLeaf(
    v3({
      root: split("s", "vertical", [leaf("g1", ["a"]), leaf("g2", ["b"]), leaf("g3", ["c"])]),
      activeGroupId: "g2",
      maximized: "g2",
    }),
    "g2",
  );
  expect(shape(r.root)).toBe("v[(a),(c)]");
  expect(r.activeGroupId).toBe("g1");
  expect(r.maximized).toBeNull();
  valid(r);
});

test("removeLeaf: 单 leaf 树 → root null + active/maximized 清", () => {
  const r = removeLeaf(v3({ root: leaf("g1", ["a"]), activeGroupId: "g1" }), "g1");
  expect(r.root).toBeNull();
  expect(r.activeGroupId).toBeNull();
});

test("removeLeaf: 嵌套树删 leaf → 逐级提升不产生同方向嵌套", () => {
  // v[a, h(b,c)] 删 b → h 退化提升 c → v[a, c]（无嵌套）
  const r = removeLeaf(
    v3({
      root: split("s", "vertical", [
        leaf("g1", ["a"]),
        split("s2", "horizontal", [leaf("g2", ["b"]), leaf("g3", ["c"])]),
      ]),
    }),
    "g2",
  );
  expect(shape(r.root)).toBe("v[(a),(c)]");
  valid(r);
});

// ── dropIntoLeaf ──────────────────────────────────────────────────────────────

test("dropIntoLeaf: target=null 空 → 单 leaf root", () => {
  const r = dropIntoLeaf(EMPTY_WORKBENCH_LAYOUT_V3, ref("p", "a"), null, "center");
  expect(shape(r.root)).toBe("(a)");
  expect(r.activeGroupId).not.toBeNull();
  valid(r);
});

test("dropIntoLeaf: target=null ref 已存在 → 激活", () => {
  const l = v3({ root: leaf("g1", ["a", "b"]), activeGroupId: "g1" });
  const r = dropIntoLeaf(l, ref("p", "b"), null, "center");
  expect(shape(r.root)).toBe("(a|b)");
  expect((r.root as LeafNode).activeTabId).toBe("b");
});

test("dropIntoLeaf: center 开新 tab", () => {
  const r = dropIntoLeaf(v3({ root: leaf("g1", ["a"]) }), ref("p", "b"), "g1", "center");
  expect(shape(r.root)).toBe("(a|b)");
});

test("dropIntoLeaf: center ref 已在 target → 仅激活", () => {
  const l = v3({ root: leaf("g1", ["a", "b"]) });
  const r = dropIntoLeaf(l, ref("p", "b"), "g1", "center");
  expect((r.root as LeafNode).activeTabId).toBe("b");
  expect((r.root as LeafNode).tabs).toHaveLength(2);
});

test("dropIntoLeaf: center 跨 leaf 迁移（原 leaf 空则删）", () => {
  const l = v3({ root: split("s", "horizontal", [leaf("g1", ["a"]), leaf("g2", ["b"])]) });
  const r = dropIntoLeaf(l, ref("p", "b"), "g1", "center");
  expect(shape(r.root)).toBe("(a|b)");
});

test("dropIntoLeaf: down 到左 leaf → 左半上下分屏，右半不变（bug 修复核心）", () => {
  const l = v3({ root: split("s", "horizontal", [leaf("L", ["a"]), leaf("R", ["b"])]) });
  const r = dropIntoLeaf(l, ref("p", "c"), "L", "down");
  expect(shape(r.root)).toBe("h[v[(a),(c)],(b)]");
  expect(r.maximized).toBeNull();
  valid(r);
});

test("dropIntoLeaf: down 到右 leaf → 右半上下分屏，左半不变", () => {
  const l = v3({ root: split("s", "horizontal", [leaf("L", ["a"]), leaf("R", ["b"])]) });
  const r = dropIntoLeaf(l, ref("p", "c"), "R", "down");
  expect(shape(r.root)).toBe("h[(a),v[(b),(c)]]");
});

test("dropIntoLeaf: right 到单 leaf root → horizontal 包裹", () => {
  const r = dropIntoLeaf(v3({ root: leaf("g1", ["a"]) }), ref("p", "b"), "g1", "right");
  expect(shape(r.root)).toBe("h[(a),(b)]");
});

test("dropIntoLeaf: right 同方向追加（root 已 horizontal）→ 不嵌套", () => {
  const l = v3({ root: split("s", "horizontal", [leaf("g1", ["a"]), leaf("g2", ["b"])]) });
  const r = dropIntoLeaf(l, ref("p", "c"), "g2", "right");
  expect(shape(r.root)).toBe("h[(a),(b),(c)]");
  valid(r);
});

test("dropIntoLeaf: 连续 right 三 leaf 不嵌套（单 split 3 children）", () => {
  let l = dropIntoLeaf(EMPTY_WORKBENCH_LAYOUT_V3, ref("p", "a"), null, "center");
  const aLeaf = findLeafBySessionId(l, "a")!;
  l = dropIntoLeaf(l, ref("p", "b"), aLeaf.leafId, "right");
  const bLeaf = findLeafBySessionId(l, "b")!;
  l = dropIntoLeaf(l, ref("p", "c"), bLeaf.leafId, "right");
  const root = l.root as SplitNode;
  expect(root.kind).toBe("split");
  expect(root.direction).toBe("horizontal");
  expect(root.children).toHaveLength(3);
  valid(l);
});

test("dropIntoLeaf: down 到 vertical 内 leaf → 同方向追加", () => {
  const l = v3({ root: split("s", "vertical", [leaf("g1", ["a"]), leaf("g2", ["b"])]) });
  const r = dropIntoLeaf(l, ref("p", "c"), "g2", "down");
  expect(shape(r.root)).toBe("v[(a),(b),(c)]");
});

test("dropIntoLeaf: left 到 vertical 内 leaf → 不同方向 wrap（horizontal 包裹该 leaf）", () => {
  const l = v3({ root: split("s", "vertical", [leaf("g1", ["a"]), leaf("g2", ["b"])]) });
  const r = dropIntoLeaf(l, ref("p", "c"), "g2", "left");
  expect(shape(r.root)).toBe("v[(a),h[(c),(b)]]");
  valid(r);
});

test("dropIntoLeaf: up → 新 leaf 在上（前）", () => {
  const r = dropIntoLeaf(v3({ root: leaf("g1", ["a"]) }), ref("p", "b"), "g1", "up");
  expect(shape(r.root)).toBe("v[(b),(a)]");
});

test("dropIntoLeaf: drop 后 activeGroupId = 新 leaf", () => {
  const r = dropIntoLeaf(v3({ root: leaf("g1", ["a"]) }), ref("p", "b"), "g1", "right");
  const found = findLeafBySessionId(r, "b");
  expect(r.activeGroupId).toBe(found?.leafId);
});

test("dropIntoLeaf: drop 到 maximized leaf → 清 maximized", () => {
  const l = v3({ root: leaf("g1", ["a"]), maximized: "g1" });
  const r = dropIntoLeaf(l, ref("p", "b"), "g1", "right");
  expect(r.maximized).toBeNull();
});

// 拖 tab 到自身所在 leaf 的边缘 = no-op（布局不变，设计 §7.2 drop to self）。
// 旧实现会把自身 leaf split 成两半，用户视为"局部布局被无意义改动"。
test("dropIntoLeaf: 源在 target leaf，拖到自身 down → 布局不变", () => {
  const l = v3({ root: split("s", "vertical", [leaf("top", ["f"]), leaf("bot", ["a", "b"])]) });
  const r = dropIntoLeaf(l, ref("p", "f"), "top", "down");
  expect(r).toBe(l);
});

test("dropIntoLeaf: 源在 target leaf，拖到自身 right → 布局不变", () => {
  const l = v3({ root: split("s", "horizontal", [leaf("L", ["f"]), leaf("R", ["a", "b"])]) });
  const r = dropIntoLeaf(l, ref("p", "f"), "L", "right");
  expect(r).toBe(l);
});

test("dropIntoLeaf: 单 leaf 多 tab，拖到自身 left → 布局不变（不再 split 同 group）", () => {
  const l = v3({ root: leaf("g", ["a", "b", "f"]) });
  const r = dropIntoLeaf(l, ref("p", "f"), "g", "left");
  expect(r).toBe(l);
});

// ── resizeSplitChildren ───────────────────────────────────────────────────────

test("resizeSplitChildren: 守恒（左增 = 右减）", () => {
  const l = v3({
    root: split("s", "horizontal", [leaf("g1", ["a"]), leaf("g2", ["b"])], { g1: 1, g2: 1 }),
  });
  const r = resizeSplitChildren(l, "s", "g1", "g2", 0.3);
  const root = r.root as SplitNode;
  expect(root.sizes.g1).toBeCloseTo(1.3);
  expect(root.sizes.g2).toBeCloseTo(0.7);
});

test("resizeSplitChildren: 钳制到 MIN_FLEX", () => {
  const l = v3({
    root: split("s", "horizontal", [leaf("g1", ["a"]), leaf("g2", ["b"])], { g1: 1, g2: 1 }),
  });
  const r = resizeSplitChildren(l, "s", "g1", "g2", 5);
  const root = r.root as SplitNode;
  expect(root.sizes.g2).toBeCloseTo(WORKBENCH_PANEL_MIN_FLEX);
});

test("resizeSplitChildren: 非相邻 / 不存在 → noop", () => {
  const l = v3({
    root: split("s", "horizontal", [leaf("g1", ["a"]), leaf("g2", ["b"]), leaf("g3", ["c"])]),
  });
  expect(resizeSplitChildren(l, "s", "g1", "g3", 0.5)).toBe(l);
});

// ── toggleLeafMaximize ────────────────────────────────────────────────────────

test("toggleLeafMaximize: 设 / 再 toggle 还原", () => {
  const l = v3({ root: leaf("g1", ["a"]) });
  const r1 = toggleLeafMaximize(l, "g1");
  expect(r1.maximized).toBe("g1");
  expect(r1.activeGroupId).toBe("g1");
  expect(toggleLeafMaximize(r1, "g1").maximized).toBeNull();
});

// ── 查询 ──────────────────────────────────────────────────────────────────────

test("findLeafBySessionId / findTabRefLeaf: 找到 / 没找到", () => {
  const l = v3({
    root: split("s", "horizontal", [leaf("g1", ["a", "b"]), leaf("g2", ["c"])]),
  });
  expect(findLeafBySessionId(l, "b")).toEqual({ leafId: "g1", tabIndex: 1 });
  expect(findTabRefLeaf(l, "c")).toEqual(ref("p", "c"));
  expect(findLeafBySessionId(l, "zzz")).toBeNull();
  expect(findTabRefLeaf(l, "zzz")).toBeNull();
});

test("activeTabRefLeaf: 活动 leaf 活动 tab / null", () => {
  const l = v3({ root: leaf("g1", ["a", "b"]), activeGroupId: "g1" });
  expect(activeTabRefLeaf(l)).toEqual(ref("p", "a"));
  const l2 = v3({ root: leaf("g1", ["a"]), activeGroupId: null });
  expect(activeTabRefLeaf(l2)).toBeNull();
});

test("ensureTabOpenLeaf: ref 已在 → 激活", () => {
  const l = v3({ root: leaf("g1", ["a", "b"]), activeGroupId: "g1" });
  const r = ensureTabOpenLeaf(l, ref("p", "b"));
  expect((r.root as LeafNode).activeTabId).toBe("b");
});

test("ensureTabOpenLeaf: ref 不在 → 加到活动 leaf 开新 tab", () => {
  const l = v3({ root: leaf("g1", ["a"]), activeGroupId: "g1" });
  const r = ensureTabOpenLeaf(l, ref("p", "b"));
  expect((r.root as LeafNode).tabs.map((t) => tabIdOf(t))).toEqual(["a", "b"]);
});

test("ensureTabOpenLeaf: 空树 → 新建首个 leaf", () => {
  const r = ensureTabOpenLeaf(EMPTY_WORKBENCH_LAYOUT_V3, ref("p", "a"));
  expect(shape(r.root)).toBe("(a)");
  expect(r.activeGroupId).not.toBeNull();
});
