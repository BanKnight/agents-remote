import { expect, test } from "bun:test";
import {
  createLeaf,
  type LeafNode,
  type SplitNode,
  type WorkbenchPanelRef,
} from "../../routes/workbench-model";
import { flattenLayout, type FlatRect } from "./flatten-layout";

const ref = (projectName: string, sessionId: string): WorkbenchPanelRef => ({
  kind: "session",
  projectName,
  sessionId,
});

/** 构造 split（指定 children + sizes，id 稳定供断言）。 */
function split(
  id: string,
  direction: "horizontal" | "vertical",
  children: Array<LeafNode | SplitNode>,
  sizes?: Record<string, number>,
): SplitNode {
  return {
    children,
    direction,
    id,
    kind: "split",
    sizes: sizes ?? Object.fromEntries(children.map((c) => [c.id, 1])),
  };
}

const rect = (x: number, y: number, w: number, h: number): FlatRect => ({ h, w, x, y });

const closeTo = (actual: FlatRect, expected: FlatRect) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.w).toBeCloseTo(expected.w, 6);
  expect(actual.h).toBeCloseTo(expected.h, 6);
};

test("flattenLayout: 空树 → 三个空数组", () => {
  const r = flattenLayout(null, null);
  expect(r.groups).toEqual([]);
  expect(r.gutters).toEqual([]);
  expect(r.panels).toEqual([]);
});

test("flattenLayout: 单 leaf → 1 group + 1 panel（占满），无 gutter", () => {
  const leaf = createLeaf(ref("p", "s1"), "g1");
  const r = flattenLayout(leaf, null);
  expect(r.gutters).toEqual([]);
  expect(r.groups).toHaveLength(1);
  expect(r.groups[0]!.id).toBe("g1");
  expect(r.groups[0]!.isMaximized).toBe(false);
  closeTo(r.groups[0]!.rect, rect(0, 0, 1, 1));
  // contentRect 内缩（去掉 tab 栏 + padding）。
  expect(r.groups[0]!.contentRect.y).toBeGreaterThan(0);
  expect(r.groups[0]!.contentRect.h).toBeLessThan(1);
  expect(r.panels).toHaveLength(1);
  expect(r.panels[0]!.sessionId).toBe("s1");
  expect(r.panels[0]!.visible).toBe(true);
  expect(r.panels[0]!.groupId).toBe("g1");
});

test("flattenLayout: 横向 2 split → 两组左右各半 + 1 col gutter", () => {
  const leafA = createLeaf(ref("p", "s1"), "gA");
  const leafB = createLeaf(ref("p", "s2"), "gB");
  const root = split("sp1", "horizontal", [leafA, leafB]);
  const r = flattenLayout(root, null);
  expect(r.groups).toHaveLength(2);
  // gA 在左半，gB 在右半（扣掉 gutter gap 后约各半）。
  expect(r.groups[0]!.id).toBe("gA");
  expect(r.groups[1]!.id).toBe("gB");
  closeTo(r.groups[0]!.rect, { h: 1, w: 0.498, x: 0, y: 0 }); // (1-0.004)/2 = 0.498
  closeTo(r.groups[1]!.rect, { h: 1, w: 0.498, x: 0.502, y: 0 });
  expect(r.gutters).toHaveLength(1);
  expect(r.gutters[0]!.orientation).toBe("col");
  expect(r.gutters[0]!.splitId).toBe("sp1");
  expect(r.gutters[0]!.leftChildId).toBe("gA");
  expect(r.gutters[0]!.rightChildId).toBe("gB");
  // gutter 在两组之间。
  closeTo(r.gutters[0]!.rect, { h: 1, w: 0.004, x: 0.498, y: 0 });
  expect(r.panels).toHaveLength(2);
  expect(r.panels[0]!.sessionId).toBe("s1");
  expect(r.panels[1]!.sessionId).toBe("s2");
  expect(r.panels[0]!.visible).toBe(true);
  expect(r.panels[1]!.visible).toBe(true);
});

test("flattenLayout: 纵向 2 split → 两组上下各半 + 1 row gutter", () => {
  const leafA = createLeaf(ref("p", "s1"), "gA");
  const leafB = createLeaf(ref("p", "s2"), "gB");
  const root = split("sp1", "vertical", [leafA, leafB]);
  const r = flattenLayout(root, null);
  expect(r.gutters[0]!.orientation).toBe("row");
  closeTo(r.groups[0]!.rect, { h: 0.498, w: 1, x: 0, y: 0 });
  closeTo(r.groups[1]!.rect, { h: 0.498, w: 1, x: 0, y: 0.502 });
  closeTo(r.gutters[0]!.rect, { h: 0.004, w: 1, x: 0, y: 0.498 });
});

test("flattenLayout: sizes 不均 → 按权重分配（2:1）", () => {
  const leafA = createLeaf(ref("p", "s1"), "gA");
  const leafB = createLeaf(ref("p", "s2"), "gB");
  const root = split("sp1", "horizontal", [leafA, leafB], { gA: 2, gB: 1 });
  const r = flattenLayout(root, null);
  // available = 1 - 0.004 = 0.996；A 占 2/3 = 0.664，B 占 1/3 = 0.332。
  closeTo(r.groups[0]!.rect, { h: 1, w: 0.664, x: 0, y: 0 });
  closeTo(r.groups[1]!.rect, { h: 1, w: 0.332, x: 0.668, y: 0 });
});

test("flattenLayout: 嵌套 split（A | [B—C]）→ 3 leaf + 2 gutter，rect 连乘", () => {
  const leafA = createLeaf(ref("p", "s1"), "gA");
  const leafB = createLeaf(ref("p", "s2"), "gB");
  const leafC = createLeaf(ref("p", "s3"), "gC");
  const inner = split("spInner", "vertical", [leafB, leafC]);
  const root = split("sp1", "horizontal", [leafA, inner]);
  const r = flattenLayout(root, null);
  expect(r.groups).toHaveLength(3);
  expect(r.gutters).toHaveLength(2);
  // gA 占左半（横向），inner 占右半；gB/gC 在右半内上下各半。
  closeTo(r.groups[0]!.rect, { h: 1, w: 0.498, x: 0, y: 0 }); // gA
  // gB 右半上半：x≈0.502, y=0, w≈0.498, h≈0.498
  closeTo(r.groups[1]!.rect, { h: 0.498, w: 0.498, x: 0.502, y: 0 });
  closeTo(r.groups[2]!.rect, { h: 0.498, w: 0.498, x: 0.502, y: 0.502 });
  // 一个 col gutter（sp1，gA|inner）+ 一个 row gutter（spInner，gB|gC）。
  const colG = r.gutters.find((g) => g.splitId === "sp1")!;
  const rowG = r.gutters.find((g) => g.splitId === "spInner")!;
  expect(colG.orientation).toBe("col");
  expect(rowG.orientation).toBe("row");
  expect(r.panels).toHaveLength(3);
});

test("flattenLayout: 同 group 多 tab → 1 group + N panel，仅 active 可见", () => {
  const leaf: LeafNode = {
    activeTabId: "s2",
    id: "g1",
    kind: "leaf",
    tabs: [ref("p", "s1"), ref("p", "s2"), ref("p", "s3")],
  };
  const r = flattenLayout(leaf, null);
  expect(r.groups).toHaveLength(1);
  expect(r.panels).toHaveLength(3);
  const vis = r.panels.map((p) => p.visible);
  expect(vis).toEqual([false, true, false]);
  // 三个 panel 共享同 group 的 contentRect。
  expect(r.panels[0]!.groupId).toBe("g1");
  expect(r.panels[1]!.groupId).toBe("g1");
  expect(r.panels[2]!.groupId).toBe("g1");
  closeTo(r.panels[0]!.rect, r.panels[1]!.rect);
});

test("flattenLayout: tab 跨 group 不去重（每个 leaf.tab 一个 panel，sessionId 在树中唯一）", () => {
  // 语义上 dropIntoGroup 跨组迁移先 removeTabFromLeaf，故同 sessionId 不会出现在两个 leaf。
  // 这里测「两 group 各自的 tab 互不干扰」，panels 总数 = 总 tab 数。
  const leafA = createLeaf(ref("p", "s1"), "gA");
  const leafB = createLeaf(ref("p", "s2"), "gB");
  const root = split("sp1", "horizontal", [leafA, leafB]);
  const r = flattenLayout(root, null);
  expect(r.panels).toHaveLength(2);
  expect(r.panels.map((p) => p.sessionId).sort()).toEqual(["s1", "s2"]);
});

test("flattenLayout: maximized 指向某 leaf → 该 leaf 占满，其他 leaf hidden", () => {
  const leafA = createLeaf(ref("p", "s1"), "gA");
  const leafB = createLeaf(ref("p", "s2"), "gB");
  const root = split("sp1", "horizontal", [leafA, leafB]);
  const r = flattenLayout(root, "gA");
  // gA 占满。
  expect(r.groups.find((g) => g.id === "gA")!.isMaximized).toBe(true);
  closeTo(r.groups.find((g) => g.id === "gA")!.rect, { h: 1, w: 1, x: 0, y: 0 });
  // gB 仍存在（保实例不卸载）但 visible=false。
  const gB = r.groups.find((g) => g.id === "gB")!;
  expect(gB).toBeDefined();
  expect(gB.isMaximized).toBe(false);
  // gA 的 active tab 可见，gB 的 tab 不可见。
  const pA = r.panels.find((p) => p.sessionId === "s1")!;
  const pB = r.panels.find((p) => p.sessionId === "s2")!;
  expect(pA.visible).toBe(true);
  expect(pB.visible).toBe(false);
});

test("flattenLayout: gutters 的 id 在 children 重组后稳定（key=leftId-rightId）", () => {
  // 重组前后相邻关系不变时 gutter id 不变 → React 复用 gutter。
  const leafA = createLeaf(ref("p", "s1"), "gA");
  const leafB = createLeaf(ref("p", "s2"), "gB");
  const root1 = split("sp1", "horizontal", [leafA, leafB]);
  const root2 = split("sp1", "horizontal", [leafA, leafB]); // 同结构重组
  const r1 = flattenLayout(root1, null);
  const r2 = flattenLayout(root2, null);
  expect(r1.gutters[0]!.id).toBe(r2.gutters[0]!.id);
});
