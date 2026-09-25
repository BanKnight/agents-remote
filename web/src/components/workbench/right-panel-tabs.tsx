import { useAtom } from "jotai";
import { useT } from "../../i18n";
import { type WorkbenchInspectionTab, workbenchRightTabAtom } from "../../routes/workbench-model";
import { WORKBENCH_TAB_PLUGINS, type WorkbenchTabPluginContext } from "./workbench-tab-plugin";

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
  // 检视分段（第十一轮复验用户拍板：右栏无「历史」，与 iPhone focus 工具同构——多端同构
  // 只是容器不同，代码不重复写；历史能力由侧栏时钟态（05c）与中栏/移动 L3 承载，注册表外
  // 局部追加 history 段是重复承载 + 重复代码，删除）。pages 仍不进右栏（per-project middle
  // tab 语义，05 原型 inspector 无 pages 段）。注册表 = 移动 MobileFocusBody / 桌面右栏的
  // 单一可见性来源（plugin.when）。
  const visiblePlugins = WORKBENCH_TAB_PLUGINS.filter(
    (plugin) => plugin.id !== "pages" && plugin.when(ctx),
  );
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
    /* flex-1 = 横向 grow（shell 右栏 body 是 row flex，子无 grow 会收缩到 max-content——
       旧 FilesPanel 根 flex-1 承担，批次 3 换三件套后 grow 上移到本根，§6.12l 记档）。
       min-w-0 = row-flex item 收缩约束（automatic min size 默认 = min-content，详情态长行
       pre/diff 的 min-content 会把本根撑到数千 px，seg4 span flex:1 均分后被裁成
       「只剩文件」——用户复验实测 13850px，§6.12l 条 11）。 */
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* 检视标头 + seg4 分段（§6.12j 对齐 05:99 原型：glabel2「检视 · 只读」+ 标准 .seg4，
          替代旧胶囊 TabButton）。只读语义固定——检视面板全部是只读视图；原型折叠 »（clps）
          未实现，不设假入口。span 键盘可达（Enter/Space），与左栏作用域 seg4 先例同构。 */}
      <div className="glabel2 shrink-0">{t("workbench.inspectorTitle")}</div>
      {/* 水平缩进由 .seg4 自带 margin:10px 14px 0 承担（不另加 px——双重 14px = 28px 错位，
          §6.12k design review P2⑥）。 */}
      <div className="shrink-0 pb-2">
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
 * 胶囊 tab 钮（右栏 Inspector 已迁 seg4，§6.12j 不再内部使用）。存量消费方仅
 * mobile-workbench（移动工具态 tab），迁移完成后随之删除。
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
