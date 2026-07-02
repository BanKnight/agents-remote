import { Fragment } from "react";
import { useAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import { IconMarker, shellSurfaceClasses } from "../shell/shell-primitives";
import { ShellNavigationButton } from "../shell/shell-navigation";
import { ShellIcon } from "../shell/icons";
import { sessionStatusLabel } from "../../routes/console-model";
import {
  addPanel,
  type GlobalInstanceCandidate,
  type WorkbenchMobileFocusTab,
  type WorkbenchMobileOverviewTab,
  type WorkbenchScope,
  inferSessionTypeFromId,
  useWorkbenchLayout,
  useWorkbenchNavigate,
  workbenchMobileFocusTabAtom,
  workbenchMobileOverviewTabAtom,
} from "../../routes/workbench-model";
import { ProjectInstances } from "./left-rail";
import { PanelRouter, useGlobalInstanceCandidates, useScopeInstanceOrder } from "./instance-area";
import { FIRST_PARTY_PLUGINS, type PluginContext } from "./right-panel-plugin";
import { MobilePrimaryNav } from "../shell/mobile-primary-nav";

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
        className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
      >
        {scope.kind === "global" ? (
          <MobileGlobalOverview />
        ) : (
          <MobileProjectOverview scope={scope} />
        )}
        <MobilePrimaryNav />
      </main>
    );
  }

  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
    >
      <MobileFocusBody focusId={focusId} scope={scope} />
    </main>
  );
}

type MobileFocusBodyProps = {
  focusId: string;
  scope: WorkbenchScope;
};

/**
 * 移动端聚焦态主体（设计文档 §7）。统一 header = ◄ 返回列表 + 项目名 + 二级 tab 行
 *（输出/文件/Git/原型），与列表态 MobileProjectOverview header 同设计语言。Stage A：单实例
 * 面板（PanelRouter），不走桌面 split —— 窄屏不 split 多面板（避免挤压），只渲染 focusId
 * 对应实例。Stage B：header tab 切 output / inspection —— 窄屏无法像桌面「实例常驻中栏 +
 * inspection 并列右栏」，故实例与 inspection 共占同一区域、tab 切换；inspection 复用
 * FIRST_PARTY_PLUGINS render（FilesPanel/GitDiffPanel 已内置移动响应式）。projectName：
 * project 作用域直接 scope.key；global 作用域从布局面板查 focusId 所属项目，缺失回退
 *「全局」。header 标题暂用 projectName（项目上下文）；实例 displayName 精确化是 follow-up。
 * ‹› 浮动切实例 overlay 在 header 之上方内容区，z-30 不遮挡 header。
 */
function MobileFocusBody({ focusId, scope }: MobileFocusBodyProps) {
  const { t } = useT();
  const navigateWorkbench = useWorkbenchNavigate();
  const [layout, updateLayout] = useWorkbenchLayout(scope);
  const [tab, setTab] = useAtom(workbenchMobileFocusTabAtom);
  const order = useScopeInstanceOrder(scope);
  const currentIndex = order.findIndex((o) => o.sessionId === focusId);
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

  // ‹› 浮动切实例（设计文档 §7）：范围 = 当前 scope 活跃实例（useScopeInstanceOrder），
  // 循环切换；tab 不重置（维度正交，workbenchMobileFocusTabAtom 跨切换保持）。global 作用域
  // 聚焦态 projectName 从 layout.panels 查，切到不在布局的实例需先 addPanel 再导航。
  const switchInstance = (delta: number) => {
    if (order.length < 2 || currentIndex < 0) return;
    const next = order[(currentIndex + delta + order.length) % order.length];
    if (scope.kind === "global") {
      updateLayout((prev) => addPanel(prev, next));
    }
    void navigateWorkbench(scope, next.sessionId);
  };
  const showSwitcher = order.length > 1 && currentIndex >= 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {showSwitcher ? (
        <MobileInstanceSwitcher
          nextLabel={t("workbench.switchNext")}
          onNext={() => switchInstance(1)}
          onPrev={() => switchInstance(-1)}
          prevLabel={t("workbench.switchPrev")}
        />
      ) : null}
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-on-surface/5 px-2">
        <button
          aria-label={t("workbench.backToList")}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
          onClick={() => void navigateWorkbench(scope)}
          type="button"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </svg>
        </button>
        <span className="truncate text-sm font-semibold text-on-surface">
          {projectName ?? t("workbench.global")}
        </span>
      </header>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-on-surface/5 px-1.5 py-1.5">
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
        {projectName ? (
          <div className={activePlugin ? "hidden" : "flex min-h-0 flex-1 flex-col overflow-hidden"}>
            <PanelRouter key={focusId} panelRef={{ projectName, sessionId: focusId }} />
          </div>
        ) : null}
        {activePlugin ? (
          <Fragment key={projectName ?? "none"}>{activePlugin.render(ctx)}</Fragment>
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
      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-primary/10 text-primary" : "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

type MobileInstanceSwitcherProps = {
  nextLabel: string;
  onNext: () => void;
  onPrev: () => void;
  prevLabel: string;
};

/**
 * ‹› 浮动切实例（设计文档 §7）：absolute overlay 贴内容区左右边缘中点，不占布局；
 * 半透明 backdrop-blur 降低对实例输出的遮挡。仅当前 scope 活跃实例 > 1 时由 MobileFocusBody 渲染。
 */
function MobileInstanceSwitcher({
  nextLabel,
  onNext,
  onPrev,
  prevLabel,
}: MobileInstanceSwitcherProps) {
  return (
    <>
      <button
        aria-label={prevLabel}
        className="absolute left-1 top-1/2 z-30 flex h-10 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-surface-raised/60 text-on-surface-soft backdrop-blur transition hover:bg-surface-raised/80 hover:text-on-surface"
        onClick={onPrev}
        type="button"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
          <path
            d="M10 3L5 8l5 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            stroke="currentColor"
          />
        </svg>
      </button>
      <button
        aria-label={nextLabel}
        className="absolute right-1 top-1/2 z-30 flex h-10 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-surface-raised/60 text-on-surface-soft backdrop-blur transition hover:bg-surface-raised/80 hover:text-on-surface"
        onClick={onNext}
        type="button"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
          <path
            d="M6 3l5 5-5 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            stroke="currentColor"
          />
        </svg>
      </button>
    </>
  );
}

type MobileProjectOverviewProps = {
  scope: { kind: "project"; key: string };
};

/**
 * 移动项目列表态（设计文档 §7）：替代旧列表态复用的 WorkbenchLeftRail（跨项目树），改为
 * 单项目聚焦视图。header（◄ 返回项目列表 + 项目名 + 二级 tab：总览/文件/Git/原型）+ 内容区
 * tab 切换。总览 = ProjectInstances（活跃实例 + 历史 session + 创建入口，复用左栏同款）；
 * 文件/Git/原型 = FIRST_PARTY_PLUGINS render（FilesPanel/GitDiffPanel 已内置移动响应式，
 * 单一数据管道）。tab 记忆在 workbenchMobileOverviewTabAtom，不进 URL（列表态 URL 语义核心
 * 是 scope）。key={scope.key} 切项目 remount，重置 ProjectInstances/inspection 内部 state。
 * 底部 pb-24 lg:pb-0 避让一级底部胶囊（桌面 lg:pb-0 抵消）。
 */
function MobileProjectOverview({ scope }: MobileProjectOverviewProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useAtom(workbenchMobileOverviewTabAtom);
  const ctx: PluginContext = { projectKey: scope.key, focusId: undefined, sessionType: undefined };
  const visiblePlugins = FIRST_PARTY_PLUGINS.filter((plugin) => plugin.when(ctx));
  // 记忆 tab 若在当前 ctx 不可见（理论上 project scope 列表态 files/git/prototype 均可见，
  // 除非未来加 when 约束）→ 回退 overview，避免内容区空白。
  const activeTab: WorkbenchMobileOverviewTab =
    tab === "overview" || visiblePlugins.some((p) => p.id === tab) ? tab : "overview";
  const activePlugin =
    activeTab === "overview" ? null : (visiblePlugins.find((p) => p.id === activeTab) ?? null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-on-surface/5 px-2">
        <button
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
          onClick={() => void navigate({ to: "/" })}
          type="button"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </svg>
        </button>
        <span className="truncate text-sm font-semibold text-on-surface">{scope.key}</span>
      </header>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-on-surface/5 px-1.5 py-1.5">
        <MobileFocusTabButton
          active={activeTab === "overview"}
          label={t("workbench.tabOverview")}
          onClick={() => setTab("overview")}
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" key={scope.key}>
        {activePlugin ? (
          <Fragment key={scope.key}>{activePlugin.render(ctx)}</Fragment>
        ) : (
          <div className="flex-1 overflow-y-auto pb-24 lg:pb-0">
            <ProjectInstances projectName={scope.key} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 移动全局列表态（设计文档 §7）：跨项目活跃实例聚合，只读监控（不可创建，创建需先进项目
 * 指定作用域）。按项目分组（稳定：聚合顺序 = 项目次序 → agent(createdAt) → terminal(createdAt)），
 * 点实例进 `/global/session/$focusId` 单实例聚焦。空状态提示。复用 ShellNavigationButton
 * 与左栏实例行同设计语言。
 */
function MobileGlobalOverview() {
  const { t } = useT();
  const navigateWorkbench = useWorkbenchNavigate();
  const candidates = useGlobalInstanceCandidates({ kind: "global" });
  const grouped = new Map<string, GlobalInstanceCandidate[]>();
  for (const candidate of candidates) {
    const arr = grouped.get(candidate.ref.projectName) ?? [];
    arr.push(candidate);
    grouped.set(candidate.ref.projectName, arr);
  }
  const focusInstance = (sessionId: string) => {
    void navigateWorkbench({ kind: "global" }, sessionId);
  };
  if (candidates.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-sm text-on-surface-muted">{t("workbench.globalOverviewEmpty")}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="shrink-0 border-b border-on-surface/5 px-3 py-2 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-on-surface-muted">
        {t("workbench.globalOverviewTitle")}
      </h2>
      <nav
        aria-label={t("workbench.globalOverviewTitle")}
        className="flex-1 overflow-y-auto pb-24 lg:pb-0"
      >
        {Array.from(grouped.entries()).map(([projectName, items]) => (
          <div key={projectName}>
            <p className="px-3 pb-1 pt-2 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-on-surface-muted">
              {projectName}
            </p>
            {items.map((candidate) => (
              <GlobalInstanceRow
                candidate={candidate}
                key={candidate.ref.sessionId}
                onSelect={focusInstance}
              />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

type GlobalInstanceRowProps = {
  candidate: GlobalInstanceCandidate;
  onSelect: (sessionId: string) => void;
};

/** 全局实例行：复用左栏 AgentNavItem/TerminalNavItem 渲染（marker + 状态描述）。 */
function GlobalInstanceRow({ candidate, onSelect }: GlobalInstanceRowProps) {
  const { t } = useT();
  const isAgent = candidate.type === "agent";
  const isRunning = candidate.status === "running";
  const marker = isAgent ? (
    <IconMarker tone={candidate.provider === "codex" ? "success" : "accent"}>
      <ShellIcon
        className="h-3.5 w-3.5"
        name={candidate.provider === "codex" ? "openai" : "anthropic"}
      />
    </IconMarker>
  ) : (
    <IconMarker tone="muted">
      <ShellIcon className="h-3.5 w-3.5" name="terminal" />
    </IconMarker>
  );
  return (
    <ShellNavigationButton
      description={isRunning ? undefined : t(sessionStatusLabel(candidate.status))}
      label={candidate.displayName}
      marker={marker}
      onClick={() => onSelect(candidate.ref.sessionId)}
    />
  );
}
