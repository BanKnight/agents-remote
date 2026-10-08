import { useAtom } from "jotai";
import {
  type PanelTab,
  ensurePanelTabOpen,
  workbenchPanelActiveAtom,
  workbenchPanelTabsAtom,
  BASE_PANEL_TABS,
  withBasePanelTabs,
} from "../../routes/workbench-model";

/**
 * 检视面板标签注册表（per-projectKey atom 的双端单源 hook，全局同构 review 批收敛）：读侧
 * withBasePanelTabs 归一 + ensure/activate/newTab/close 四操作。此前桌面 RightPanelTabs 与
 * 移动 MobileProjectWorkbench 各写一份（ensure/activate/newTab/close 逐字同构、注释互引对方
 * 副本），closePanelTab 的 projectKey 守卫两端不一致——本 hook 统一带守卫（null 语境写
 * `[projectKey as string]` 会落 "undefined" 键而读恒 ""，值静默丢失，code-review 批 11）。
 *
 * 容器差异留调用方：桌面投影过滤（file/wikiread 标签不渲染、激活项指向隐藏标签回退 files）、
 * 移动关标签清编辑态单例（editingFileTabId）由各自组件在 hook 之上包装。幂等引用守卫（值
 * 未变返回旧引用）对齐既有 perf 纪律——点已激活标签 / URL 深链重复映射不再产生多余的全组件
 * 重渲染 + localStorage 同步写。
 */
export function usePanelTabRegistry(projectKey: string | null) {
  const [panelTabsMap, setPanelTabsMap] = useAtom(workbenchPanelTabsAtom);
  const [panelActiveMap, setPanelActiveMap] = useAtom(workbenchPanelActiveAtom);
  const panelTabs = withBasePanelTabs(
    (projectKey ? panelTabsMap[projectKey] : undefined) ?? BASE_PANEL_TABS,
  );
  const activePanelTabId = (projectKey ? panelActiveMap[projectKey] : undefined) ?? "files";
  const activatePanelTab = (id: string) =>
    setPanelActiveMap((prev) => {
      if (!projectKey) return prev;
      return prev[projectKey] === id ? prev : { ...prev, [projectKey]: id };
    });
  // ensure 新增标签（基础标签由 ＋ 菜单/深链映射调用；存在即幂等 no-op）。
  const ensureTab = (tab: PanelTab) => {
    if (!projectKey) return;
    setPanelTabsMap((prev) => {
      const list = prev[projectKey] ?? BASE_PANEL_TABS;
      const next = ensurePanelTabOpen(list, tab);
      if (next === list) return prev;
      return { ...prev, [projectKey]: next };
    });
  };
  // ＋ 新建标签（03ob2 菜单）：同目标已开 = 激活幂等（03ob 编号①）。
  const newPanelTab = (kind: "files" | "git" | "wiki") => {
    ensureTab({ id: kind, kind } as PanelTab);
    activatePanelTab(kind);
  };
  // ✕ 关标签：三基础标签「不可关」由 PanelTabBar 内部 gate（✕ 不渲染），本操作只管存储
  //（file/wikiread 标签移除）；关激活标签回文件树首标签。目标不存在时幂等 no-op
  //（filter 恒返回新数组，引用比较无效——按长度判定，与 ensure/activate 守卫对称）。
  const closePanelTab = (id: string) => {
    setPanelTabsMap((prev) => {
      if (!projectKey) return prev;
      const list = prev[projectKey] ?? [];
      const next = list.filter((t0) => t0.id !== id);
      if (next.length === list.length) return prev;
      return { ...prev, [projectKey]: next };
    });
    if (id === activePanelTabId) activatePanelTab("files");
  };
  return { panelTabs, activePanelTabId, activatePanelTab, ensureTab, newPanelTab, closePanelTab };
}
