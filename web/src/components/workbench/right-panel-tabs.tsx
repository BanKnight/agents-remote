import { useAtom } from "jotai";
import { useT } from "../../i18n";
import { type WorkbenchRightTab, workbenchRightTabAtom } from "../../routes/workbench-model";
import { FIRST_PARTY_PLUGINS, type PluginContext } from "./right-panel-plugin";

type RightPanelTabsProps = {
  activeTab?: WorkbenchRightTab;
  ctx: PluginContext;
  onTabChange: (tab: WorkbenchRightTab) => void;
};

/**
 * 右栏 inspection tab 容器（设计文档 §5）。消费 FIRST_PARTY_PLUGINS 注册表，
 * 按 ctx 过滤可见 tab，active tab 渲染对应插件面板。Stage 3 commit ③ 把
 * active tab 提升到 URL rightTab（语义核心、刷新可分享），URL 未指定时回退
 * workbenchRightTabAtom 记忆；若所得 tab 不可见则回退首个可见 tab。
 */
export function RightPanelTabs({ activeTab, ctx, onTabChange }: RightPanelTabsProps) {
  const { t } = useT();
  const [rememberedTab, setRememberedTab] = useAtom(workbenchRightTabAtom);
  const visiblePlugins = FIRST_PARTY_PLUGINS.filter((plugin) => plugin.when(ctx));
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
      <div className="flex shrink-0 items-center gap-1 border-b border-on-surface/5 px-1.5 py-1.5">
        {visiblePlugins.map((plugin) => (
          <TabButton
            active={plugin.id === current.id}
            key={plugin.id}
            label={t(plugin.labelKey)}
            onClick={() => {
              setRememberedTab(plugin.id);
              onTabChange(plugin.id);
            }}
          />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" key={ctx.projectKey ?? "none"}>
        {current.render(ctx)}
      </div>
    </div>
  );
}

type TabButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

export function TabButton({ active, label, onClick }: TabButtonProps) {
  return (
    <button
      className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition ${active ? "bg-primary/10 text-primary" : "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
