import {
  WORKBENCH_PANEL_DEFAULT_FLEX,
  type LeafNode,
  type TreeNode,
  type WorkbenchPanelRef,
  tabIdOf,
} from "../../routes/workbench-model";

/**
 * 扁平布局投影（设计 §7.8，UI = f(state)）。把 §7.5 的 n 叉树 state 投影成三个并列扁平数组，
 * 表现层各自 `.map` 渲染——group / tab 不再嵌在递归布局树里，拥有位置不随布局变化而变化的
 * 稳定身份（`key=leaf.id` / `key=sessionId`），React 按相同 key 复用 → split / 合入塌缩 /
 * tab 跨 group 移动 / 加 tab / 切 active 全不重建（DOM 不卸载 → WebSocket 不断、xterm 不 dispose、
 * relay 不重放）。
 *
 * rect 用归一化比例（0~1），表现层用百分比 style 定位到共享的 `relative` 根容器（整棵扁平层
 * 的共同祖先）。嵌套 split 的 leaf rect = 它在每层祖先 split 里占比的连乘，递归分配自然得到。
 *
 * maximized 非空时只投影该 leaf 进布局（其他 leaf 仍进 groups/panels 数组以保实例不卸载，
 * 但 visible 全 false = hidden，复用 §7.4「其他 leaf hidden 不 unmount」不变式）。
 */

/** 归一化矩形（相对共享根容器，0~1）。 */
export type FlatRect = {
  /** 左上角横坐标 / 纵坐标 / 宽 / 高（均为 0~1 归一化）。 */
  x: number;
  y: number;
  w: number;
  h: number;
};

/** group 壳：边框 + tab 栏 + data-drop-group 落点，不含 PanelRouter。 */
export type FlatGroup = {
  id: string;
  tabs: WorkbenchPanelRef[];
  activeTabId: string;
  /** group 整体 rect（含 tab 栏）。 */
  rect: FlatRect;
  /** tab 栏下方的内容区 rect（PanelRouter 的落点）。 */
  contentRect: FlatRect;
  /** 是否独占（maximized 指向此 leaf）。独占 leaf 占满根容器。 */
  isMaximized: boolean;
};

/** 分隔条：相邻两个 children 之间的间距条。 */
export type FlatGutter = {
  id: string;
  rect: FlatRect;
  orientation: "col" | "row";
  /** 所属 split 的 id（resize 时改该 split 的 sizes）。 */
  splitId: string;
  /** 该 gutter 调整的两个相邻 children id（左/上 child 与右/下 child）。 */
  leftChildId: string;
  rightChildId: string;
  /** 所属 split 的 rect（SplitGutter 算 ratio = delta / splitRect 主轴尺寸用）。 */
  splitRect: FlatRect;
  /** 所属 split 的 children flex 总和（onResizeSplit 的 deltaFlex = ratio × totalFlex）。 */
  totalFlex: number;
};

/** PanelRouter 落点：一个面板（session 或 file）的渲染槽位。 */
export type FlatPanel = {
  /** 派生 tab id（= React key / sizes key 概念）：session=sessionId，file=`file_${path}`。 */
  tabId: string;
  /** 完整面板引用；消费点直接用，无需从 sessionId+projectName 重构。 */
  ref: WorkbenchPanelRef;
  /** 落点 rect = 所属 group 的 contentRect。 */
  rect: FlatRect;
  /** 是否可见（tabId === 所属 group activeTabId 且该 group 未被 maximized 隐藏）。 */
  visible: boolean;
  /** 所属 group id（tab 跨 group 移动时此字段变，rect 跟着变，key=tabId 不变 → React 复用）。 */
  groupId: string;
};

/** flattenLayout 输出：三个并列扁平数组。 */
export type FlatLayout = {
  groups: FlatGroup[];
  gutters: FlatGutter[];
  panels: FlatPanel[];
};

/** tab 栏高度占根容器的比例（桌面实测 ~32px / 容器高，归一化）。 */
const TAB_BAR_HEIGHT_RATIO = 0.04;
/** group 边框圆角等内边距占根容器的比例（contentRect 相对 rect 的内缩）。 */
const GROUP_PADDING_RATIO = 0.005;

/**
 * 把 n 叉树布局投影成扁平数组（设计 §7.8）。纯函数，无副作用，可独立单测。
 *
 * @param root 布局树根（null → 三个空数组）
 * @param maximized 独占 leaf id（null = 无独占）
 */
export function flattenLayout(root: TreeNode | null, maximized: string | null): FlatLayout {
  if (root === null) {
    return { groups: [], gutters: [], panels: [] };
  }
  const groups: FlatGroup[] = [];
  const gutters: FlatGutter[] = [];
  const panels: FlatPanel[] = [];

  // 递归分配 rect。root 占满 [0,0,1,1]。每个 split 按 direction 把自己的 rect 分给 children
  //（按 sizes 权重，gap 让给 gutter）。leaf 收集 group + 其每个 tab 的 panel。
  function walk(node: TreeNode, rect: FlatRect): void {
    if (node.kind === "leaf") {
      emitLeaf(node, rect);
      return;
    }
    // split：按 sizes 把 rect 的主轴分给 children，children 之间留 gutter 占位。
    const isHorizontal = node.direction === "horizontal";
    const totalFlex = node.children.reduce(
      (sum, c) => sum + (node.sizes[c.id] ?? WORKBENCH_PANEL_DEFAULT_FLEX),
      0,
    );
    // gutter 总占主轴比例（每个 gutter 占 GAP_RATIO）。
    const gutterCount = node.children.length - 1;
    const gutterTotal = gutterCount * SPLIT_GAP_RATIO;
    const available = (isHorizontal ? rect.w : rect.h) - gutterTotal;
    let cursor = isHorizontal ? rect.x : rect.y;
    node.children.forEach((child, i) => {
      const weight = node.sizes[child.id] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
      const span = (weight / totalFlex) * available;
      const childRect: FlatRect = isHorizontal
        ? { x: cursor, y: rect.y, w: span, h: rect.h }
        : { x: rect.x, y: cursor, w: rect.w, h: span };
      walk(child, childRect);
      cursor += span;
      // 相邻 children 之间的 gutter。
      if (i < node.children.length - 1) {
        const next = node.children[i + 1];
        const gutterRect: FlatRect = isHorizontal
          ? { x: cursor, y: rect.y, w: SPLIT_GAP_RATIO, h: rect.h }
          : { x: rect.x, y: cursor, w: rect.w, h: SPLIT_GAP_RATIO };
        gutters.push({
          id: `gutter-${child.id}-${next.id}`,
          leftChildId: child.id,
          orientation: isHorizontal ? "col" : "row",
          rect: gutterRect,
          rightChildId: next.id,
          splitId: node.id,
          splitRect: rect,
          totalFlex,
        });
        cursor += SPLIT_GAP_RATIO;
      }
    });
  }

  function emitLeaf(leaf: LeafNode, rect: FlatRect): void {
    const isMax = maximized === leaf.id;
    // maximized 时该 leaf 占满根容器（其他 leaf 仍走 walk 但 visible=false 见下）。
    const groupRect = isMax ? { x: 0, y: 0, w: 1, h: 1 } : rect;
    const pad = GROUP_PADDING_RATIO;
    const tabBar = TAB_BAR_HEIGHT_RATIO;
    const contentRect: FlatRect = {
      x: groupRect.x + pad,
      y: groupRect.y + tabBar,
      w: groupRect.w - 2 * pad,
      h: groupRect.h - tabBar - pad,
    };
    groups.push({
      activeTabId: leaf.activeTabId,
      contentRect,
      id: leaf.id,
      isMaximized: isMax,
      rect: groupRect,
      tabs: leaf.tabs,
    });
    // 每个 tab 一个 panel（同 group 多 tab 共享 contentRect，靠 visible 区分）。
    for (const tab of leaf.tabs) {
      panels.push({
        groupId: leaf.id,
        rect: contentRect,
        ref: tab,
        tabId: tabIdOf(tab),
        // maximized 指向其他 leaf 时，本 leaf 全 hidden；指向本 leaf 时只 active tab 可见。
        visible:
          maximized === null
            ? tabIdOf(tab) === leaf.activeTabId
            : isMax && tabIdOf(tab) === leaf.activeTabId,
      });
    }
  }

  walk(root, { h: 1, w: 1, x: 0, y: 0 });
  return { groups, gutters, panels };
}

/** split 内 children 之间的 gap（归一化，约 4px / 容器宽）。 */
const SPLIT_GAP_RATIO = 0.004;
