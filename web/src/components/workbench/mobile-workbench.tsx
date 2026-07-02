import { useAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import {
  type WorkbenchMobileFocusTab,
  type WorkbenchScope,
  inferSessionTypeFromId,
  useWorkbenchLayout,
  workbenchMobileFocusTabAtom,
} from "../../routes/workbench-model";
import { WorkbenchLeftRail } from "./left-rail";
import { PanelRouter } from "./instance-area";
import { FIRST_PARTY_PLUGINS, type PluginContext } from "./right-panel-plugin";

type MobileWorkbenchProps = {
  scope: WorkbenchScope;
  focusId?: string;
};

/**
 * 移动端工作台（设计文档 §7）。Stage 5 按桌面分 stage 升级：A 聚焦态单实例化
 *（修窄屏多面板挤压）→ B header tab inspection → C ‹› 悬浮切 → D 列表态二级总览
 * + 一级底部 tab → E 路由收口。
 *
 * 当前：无 focusId → 实例列表（WorkbenchLeftRail 全屏 + 创建入口，Stage D 升级为
 * MobileProjectOverview）；有 focusId → 单实例聚焦（Stage A：PanelRouter 不 split；
 * Stage B：header tab 切 output/文件/Git/原型，inspection 复用 FIRST_PARTY_PLUGINS）
 * + 顶部返回。
 */
export function MobileWorkbench({ focusId, scope }: MobileWorkbenchProps) {
  if (!focusId) {
    return (
      <main
        className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-slate-100 ${shellSurfaceClasses.shell}`}
      >
        <WorkbenchLeftRail focusId={focusId} scope={scope} />
      </main>
    );
  }

  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-slate-100 ${shellSurfaceClasses.shell}`}
    >
      <MobileBackBar scope={scope} />
      <MobileFocusBody focusId={focusId} scope={scope} />
    </main>
  );
}

type MobileFocusBodyProps = {
  focusId: string;
  scope: WorkbenchScope;
};

/**
 * 移动端聚焦态主体。Stage A：单实例面板（PanelRouter），不走桌面 split 布局 —— 移动窄屏
 * 不 split 多面板（避免挤压），只渲染 focusId 对应实例。Stage B：header tab 切换 output /
 * 文件 / Git / 原型 —— 窄屏无法像桌面那样「实例常驻中栏 + inspection 并列右栏」，故实例与
 * inspection 共占同一区域、tab 切换；inspection 内容复用 FIRST_PARTY_PLUGINS 的 render
 *（FilesPanel/GitDiffPanel 已内置移动响应式，无需 wrapper）。projectName：project 作用域
 * 直接 scope.key；global 作用域从布局面板查 focusId 所属项目。容器 flex-col 让面板内部
 * flex-1 runtime body 撑满（与桌面 SplitPanel 同撑满契约）。
 */
function MobileFocusBody({ focusId, scope }: MobileFocusBodyProps) {
  const { t } = useT();
  const [layout] = useWorkbenchLayout(scope);
  const [tab, setTab] = useAtom(workbenchMobileFocusTabAtom);
  const projectName =
    scope.kind === "project"
      ? scope.key
      : layout.panels.find((p) => p.sessionId === focusId)?.projectName;
  const ctx: PluginContext = {
    projectKey: projectName ?? null,
    focusId,
    sessionType: inferSessionTypeFromId(focusId),
  };
  const visiblePlugins = FIRST_PARTY_PLUGINS.filter((plugin) => plugin.when(ctx));
  // 记忆的 tab 若在当前 ctx 不可见（如全局作用域下 project-scoped 的 files/git 隐藏，
  // 但记忆值为 files）→ 回退 output，避免内容区空白。
  const activeTab: WorkbenchMobileFocusTab =
    tab === "output" || visiblePlugins.some((p) => p.id === tab) ? tab : "output";
  const activePlugin =
    activeTab === "output" ? null : (visiblePlugins.find((p) => p.id === activeTab) ?? null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/5 px-1.5 py-1.5">
        <MobileFocusTabButton
          active={activeTab === "output"}
          label={t("workbench.tabOutput")}
          onClick={() => setTab("output")}
        />
        {visiblePlugins.map((plugin) => (
          <MobileFocusTabButton
            active={activeTab === plugin.id}
            key={plugin.id}
            label={t(plugin.labelKey)}
            onClick={() => setTab(plugin.id)}
          />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activePlugin ? (
          activePlugin.render(ctx)
        ) : projectName ? (
          <PanelRouter panelRef={{ projectName, sessionId: focusId }} />
        ) : null}
      </div>
    </div>
  );
}

type MobileFocusTabButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

/** 移动聚焦态 header tab 按钮（与右栏 RightPanelTabs.TabButton 同设计语言，触摸目标略大）。 */
function MobileFocusTabButton({ active, label, onClick }: MobileFocusTabButtonProps) {
  return (
    <button
      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-cyan-300/10 text-cyan-100" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function MobileBackBar({ scope }: { scope: WorkbenchScope }) {
  const { t } = useT();
  const navigate = useNavigate();
  const scopeSegment = scope.kind === "project" ? scope.key : "global";
  return (
    <div className="flex h-11 shrink-0 items-center border-b border-white/5 px-2">
      <button
        type="button"
        onClick={() => void navigate({ to: "/workbench/$scope", params: { scope: scopeSegment } })}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M10 3L5 8l5 5"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t("workbench.backToList")}
      </button>
    </div>
  );
}
