import { useAtom } from "jotai";
import { useT } from "../../i18n";
import { workbenchRightTabAtom } from "../../routes/workbench-model";
import { FIRST_PARTY_PLUGINS, type PluginContext } from "./right-panel-plugin";

type RightPanelTabsProps = {
  ctx: PluginContext;
};

/**
 * 右栏 inspection tab 容器（设计文档 §5）。消费 FIRST_PARTY_PLUGINS 注册表，
 * 按 ctx 过滤可见 tab，active tab 渲染对应插件面板。active tab 来自
 * workbenchRightTabAtom（记忆上次 tab）；若记忆 tab 不可见则回退首个可见 tab。
 * Stage 3 commit ③ 把 active tab 提升到 URL rightTab（语义核心、刷新可分享），
 * atom 仍作首次进入 / URL 未指定时的回退。
 */
export function RightPanelTabs({ ctx }: RightPanelTabsProps) {
  const { t } = useT();
  const [activeTab, setActiveTab] = useAtom(workbenchRightTabAtom);
  const visiblePlugins = FIRST_PARTY_PLUGINS.filter((plugin) => plugin.when(ctx));
  const current = visiblePlugins.find((plugin) => plugin.id === activeTab) ?? visiblePlugins[0];

  if (!current) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-500">
        {t("workbench.rightPanelEmpty")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/5 px-1.5 py-1.5">
        {visiblePlugins.map((plugin) => (
          <TabButton
            active={plugin.id === current.id}
            key={plugin.id}
            label={t(plugin.labelKey)}
            onClick={() => setActiveTab(plugin.id)}
          />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{current.render(ctx)}</div>
    </div>
  );
}

type TabButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

function TabButton({ active, label, onClick }: TabButtonProps) {
  return (
    <button
      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${active ? "bg-cyan-300/10 text-cyan-100" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
