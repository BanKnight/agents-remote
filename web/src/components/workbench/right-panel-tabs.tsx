import { useAtom } from "jotai";
import { useT } from "../../i18n";
import { type WorkbenchInspectionTab, workbenchRightTabAtom } from "../../routes/workbench-model";
import { HistoryList } from "./history-list";
import {
  WORKBENCH_TAB_PLUGINS,
  type WorkbenchTabPluginContext,
  type WorkbenchTabPlugin,
} from "./workbench-tab-plugin";

type RightPanelTabsProps = {
  activeTab?: WorkbenchInspectionTab;
  ctx: WorkbenchTabPluginContext;
  onTabChange: (tab: WorkbenchInspectionTab) => void;
};

/**
 * 右栏 inspection tab 容器（设计文档 §5）。消费 WORKBENCH_TAB_PLUGINS 注册表，
 * 按 ctx 过滤可见 tab，active tab 渲染对应插件面板。Stage 3 commit ③ 把
 * active tab 提升到 URL rightTab（语义核心、刷新可分享），URL 未指定时回退
 * workbenchRightTabAtom 记忆；若所得 tab 不可见则回退首个可见 tab。
 */
export function RightPanelTabs({ activeTab, ctx, onTabChange }: RightPanelTabsProps) {
  const { t } = useT();
  const [rememberedTab, setRememberedTab] = useAtom(workbenchRightTabAtom);
  // §6.10-6 Inspector 四段（05 原型 seg4）：文件 / Git / Wiki / 历史。pages 不进右栏
  //（per-project middle tab 语义，05 原型 inspector 无 pages 段）；history 不进
  // WORKBENCH_TAB_PLUGINS 注册表（buildOverviewTabs 已单独 push history middle tab，进注册表
  // 会在中栏 tab 列表重复）——在此局部追加。注册表仍是移动 MobileFocusBody / 左栏
  // buildOverviewTabs 的单一可见性来源（plugin.when）。
  const visiblePlugins: WorkbenchTabPlugin[] = [
    ...WORKBENCH_TAB_PLUGINS.filter((plugin) => plugin.id !== "pages" && plugin.when(ctx)),
    {
      id: "history",
      labelKey: "workbench.tabHistory",
      render: (pluginCtx) =>
        pluginCtx.projectKey ? (
          <HistoryList
            focusId={pluginCtx.focusId}
            projectName={pluginCtx.projectKey}
            showLabel={false}
          />
        ) : null,
      when: (pluginCtx) => pluginCtx.projectKey !== null,
    },
  ];
  const preferred = activeTab ?? rememberedTab;
  const current = visiblePlugins.find((plugin) => plugin.id === preferred) ?? visiblePlugins[0];

  if (!current) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-on-surface-muted">
        {t("workbench.rightPanelEmpty")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 检视标头 + seg4 分段（§6.12j 对齐 05:99 原型：glabel2「检视 · 只读」+ 标准 .seg4，
          替代旧胶囊 TabButton）。只读语义固定——检视面板全部是只读视图；原型折叠 »（clps）
          未实现，不设假入口。span 键盘可达（Enter/Space），与左栏作用域 seg4 先例同构。 */}
      <div className="glabel2 shrink-0">{t("workbench.inspectorTitle")}</div>
      <div className="shrink-0 px-3.5 pb-2">
        <div aria-label={t("workbench.inspectorAria")} className="seg4" role="tablist">
          {visiblePlugins.map((plugin) => (
            <span
              aria-controls="inspector-tab-panel"
              aria-selected={plugin.id === current.id}
              className={`cursor-pointer ${plugin.id === current.id ? "on" : ""}`}
              key={plugin.id}
              onClick={() => {
                setRememberedTab(plugin.id);
                onTabChange(plugin.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setRememberedTab(plugin.id);
                  onTabChange(plugin.id);
                }
              }}
              role="tab"
              tabIndex={0}
            >
              {t(plugin.labelKey)}
            </span>
          ))}
        </div>
      </div>
      {/* §8 高度链：body 自身必须是 flex container（检视内容 FilesPanel 等是 flex-1 子）。 */}
      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        id="inspector-tab-panel"
        key={ctx.projectKey ?? "none"}
        role="tabpanel"
      >
        {current.render(ctx)}
      </div>
    </div>
  );
}

/**
 * 胶囊 tab 钮（右栏 Inspector 已迁 seg4，§6.12j 不再内部使用）。存量消费方：
 * project-left-panel middle tabs（批次 3 收敛对象）与 PluginsRoute 子 tab（批次 4 重排对象），
 * 迁移完成后随之删除。
 */
export function TabButton({ active, label, onClick }: TabButtonProps) {
  return (
    <button
      className={`shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition ${active ? "bg-primary/10 text-primary" : "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

type TabButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};
