import { Fragment, type CSSProperties, type ReactNode, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import { MobilePageHeader, shellSurfaceClasses } from "../shell/shell-primitives";
import { MobileFab } from "../shell/mobile-fab";
import { ShellIcon } from "../shell/icons";
import { useInstanceInfoSheet, type InfoField } from "../shell/info-sheet";
import { sessionStatusLabel } from "../../routes/console-model";
import { GlobalFilesOverview } from "../files/global-files-overview";
import { GlobalProjectsOverview } from "./global-projects-overview";
import { MobilePluginsOverview, PluginsPanel, SkillTabPreview } from "../../routes/PluginsRoute";
import {
  findTabRefLeaf,
  type WorkbenchMobileFocusTab,
  type WorkbenchMobileOverviewTab,
  type WorkbenchScope,
  inferSessionTypeFromId,
  parseFileTabId,
  parseSkillTabId,
  splitFilePath,
  useWorkbenchLayout,
  useWorkbenchNavigate,
  type SessionPanelRef,
  workbenchMobileFocusTabAtom,
  workbenchMobileGlobalFilesPathAtom,
  workbenchMobileOverviewTabAtom,
  workbenchMobileProjectFilesPathAtom,
} from "../../routes/workbench-model";

import {
  CardGridSkeleton,
  type GridItemCallbacks,
  InstanceGrid,
  instanceToGridItem,
  PanelRouter,
  useAgentDetail,
  useCloseSession,
  useCreateSession,
  useProjectInstances,
  useRenameSession,
  useScopeInstanceOrder,
  useTerminalDetail,
} from "./instance-area";
import type { AgentHistoryRange } from "@agents-remote/shared";
import { HistoryList, HistoryRangeControl } from "./history-list";
import {
  buildOverviewTabs,
  WORKBENCH_TAB_PLUGINS,
  type WorkbenchTabPluginContext,
} from "./workbench-tab-plugin";
import { FileTabPreview } from "../files/file-preview-panel";
import { MobilePrimaryNav } from "../shell/mobile-primary-nav";
import { useMeasuredBottomNav } from "../shell/shell-layout";

type MobileWorkbenchProps = {
  scope: WorkbenchScope;
  focusId?: string;
  /**
   * 左栏模式（设计 workbench-stable-refactor review 收口）：移动端 `scope=global` 下 leftMode 有意义
   *——leftMode="files"（/files 全局文件总览）→ MobileFilesOverview；leftMode="plugins"（/plugins 插件市场）
   * → MobilePluginsOverview；leftMode="auto" → MobileGlobalOverview。project scope 无视 leftMode 走
   * MobileProjectOverview。桌面端 leftMode 由 WorkbenchContent 左栏逻辑消费，移动端在此分支消费。
   */
  leftMode?: "auto" | "files" | "plugins";
};

/**
 * 移动端工作台（设计文档 §7）。Stage 5 按桌面分 stage 升级：A 聚焦态单实例化
 *（修窄屏多面板挤压）→ B header tab inspection → D 列表态二级总览
 * + 一级底部 tab → E 路由收口。
 *
 * 当前：无 focusId → 实例列表（MobileGlobalOverview/MobileProjectOverview + 创建入口，
 * Stage D 升级为二级总览）；有 focusId → 单实例聚焦（Stage A：PanelRouter 不 split；
 * Stage B：header tab 切 output/文件/Git，inspection 复用 WORKBENCH_TAB_PLUGINS）
 * + 顶部返回。
 */
export function MobileWorkbench({ focusId, leftMode, scope }: MobileWorkbenchProps) {
  // workbench 不走 ShellLayout，这里自行测量一级底部 nav 高度并注入
  // `--shell-mobile-bottom-nav-space`，让 workbench 内用 var 的滚动容器（文件列表、
  // Git diff 等）底部正确避让胶囊（参考 ShellLayout 同款 useMeasuredBottomNav）。
  // 聚焦态（focusId）无一级底部 nav（底部让位给输入区），传 null → height=0 → var=0px。
  const { height: bottomNavHeight, measured: measuredBottomNav } = useMeasuredBottomNav(
    focusId ? null : <MobilePrimaryNav />,
  );
  const mainStyle = {
    "--shell-mobile-bottom-nav-space": `${bottomNavHeight}px`,
  } as CSSProperties;

  if (!focusId) {
    return (
      <main
        className={`group relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
        style={mainStyle}
      >
        {scope.kind === "global" && leftMode === "plugins" ? (
          <MobilePluginsOverview />
        ) : scope.kind === "global" && leftMode === "files" ? (
          <MobileFilesOverview />
        ) : scope.kind === "global" ? (
          <MobileGlobalOverview />
        ) : (
          <MobileProjectOverview scope={scope} />
        )}
        {measuredBottomNav}
      </main>
    );
  }

  // file focus（focusId 形如 file_demo/src/index.ts，path=全路径含项目名前缀，设计 §6 决策 3 /
  // workbench-stable-refactor Phase 3）：移动端不实现 V3 group，用 MobileFileFocus 浮窗式预览打开
  // 该文件（复用 FileTabPreview 可编辑预览 + 顶部返回/✕ header）。全局/项目文件都走此分支（全路径
  // 自带项目名，MobileFileFocus 内部解析）。
  const filePath = parseFileTabId(focusId);
  if (filePath !== null) {
    return (
      <main
        className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
        style={mainStyle}
      >
        <MobileFileFocus path={filePath} />
      </main>
    );
  }

  // skill focus（focusId 形如 skill_tdd，name=skill 名）：移动端 skill 详情对标 file focus，
  // 用 MobileSkillFocus 浮窗式只读预览（SkillTabPreview SKILL.md markdown + 顶部返回/✕ header，
  // 复用 MobileTabHeader 同款结构）。详情只读（区别于 FileTabPreview 可编辑）。
  const skillName = parseSkillTabId(focusId);
  if (skillName !== null) {
    return (
      <main
        className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
        style={mainStyle}
      >
        <MobileSkillFocus name={skillName} />
      </main>
    );
  }

  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
      style={mainStyle}
    >
      <MobileFocusBody focusId={focusId} scope={scope} />
    </main>
  );
}

/**
 * 移动端文件聚焦浮窗（设计 §6 决策 3 / workbench-stable-refactor Phase 3）：`/file/$path` URL 在
 * 移动端用此组件打开。`path` = 全路径（含项目名前缀），单行 header（◄ 返回 + 文件名 + ✕）+
 * FileTabPreview 可编辑预览（FileTabPreview 内部 resolveRootBrowseTarget 解析项目名走 project API）。
 * 不实现 V3 group（移动端 [文件] 保持浮窗式，设计决策 12）。返回 / ✕ = navigate 回全局文件树
 *（`/files`，全局文件入口）；项目内文件 → 回 `/projects/$key`（用全路径首段派生项目名）。复用
 * MobileTabHeader 保持与 MobileFocusHeader 同款 header 结构。
 */
function MobileFileFocus({ path }: { path: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  // 全路径首段 = projectName（splitFilePath 与 resolveRootBrowseTarget 同语义，正确处理无 `/` 异常降级）。返回回项目列表态。
  const projectName = splitFilePath(path).projectName;
  const back = () => {
    void navigate({ to: "/projects/$key", params: { key: projectName } });
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <MobileTabHeader
        activeTabId="file"
        back={{ ariaLabelKey: "files.backToFiles", onClick: back }}
        onTabSelect={() => {
          /* file focus 单 tab，无切换 */
        }}
        tabs={[{ id: "file" as const, label: path.split("/").pop() ?? path }]}
        trailing={
          <div
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5"
            role="group"
          >
            <button
              aria-label={t("session.close")}
              className="flex h-7 w-7 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-error/10 hover:text-error"
              onClick={back}
              type="button"
            >
              <ShellIcon className="h-4 w-4" name="close" />
            </button>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FileTabPreview path={path} />
      </div>
    </div>
  );
}

/**
 * 移动端 skill 聚焦浮窗（对标 MobileFileFocus，设计 §6 决策 3 同款范式）：`/plugins/skill/$name`
 * URL 在移动端用此组件打开。单行 header（◄ 返回 /plugins + skill name + ✕）+ SkillTabPreview
 * 只读 SKILL.md 预览（详情只读，区别于 FileTabPreview 可编辑）。返回 / ✕ = navigate 回 `/plugins`
 * 插件管理列表（对标 MobileFileFocus 回文件树）。复用 MobileTabHeader 保持同款 header 结构。
 */
function MobileSkillFocus({ name }: { name: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const back = () => {
    void navigate({ to: "/plugins" });
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <MobileTabHeader
        activeTabId="skill"
        back={{ ariaLabelKey: "plugins.backToPlugins", onClick: back }}
        onTabSelect={() => {
          /* skill focus 单 tab，无切换 */
        }}
        tabs={[{ id: "skill" as const, label: name }]}
        trailing={
          <div
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5"
            role="group"
          >
            <button
              aria-label={t("session.close")}
              className="flex h-7 w-7 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-error/10 hover:text-error"
              onClick={back}
              type="button"
            >
              <ShellIcon className="h-4 w-4" name="close" />
            </button>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SkillTabPreview name={name} />
      </div>
    </div>
  );
}

type MobileFocusBodyProps = {
  focusId: string;
  scope: WorkbenchScope;
};

/**
 * 移动端聚焦态主体（设计文档 §7，5g 重构）。单行 header = ◄ 返回 + tab 横滚区 + ℹ✕ 胶囊
 *（MobileFocusHeader），替代旧 MobilePageHeader + 二级 tab 行两块；面板自带 header 在聚焦态
 * 隐藏（PanelRouter embeddedHeader），消除 title 重复 / Files·Git 与 tab 重复 / meta 独占行
 * 三处冗余。Stage A：单实例面板（PanelRouter），不走桌面 split —— 窄屏不 split 多面板（避免
 * 挤压）。Stage B：tab 切 output / inspection —— 实例与 inspection 共占同一区域、tab 切换；
 * inspection 复用 WORKBENCH_TAB_PLUGINS render。ℹ 触发底部 info sheet 显实例 meta（agent 显
 * model/permission/createdAt，terminal 不显这些行 —— UI=f(state) 不伪造）；✕ 触发 useCloseSession
 *（confirm → close API → navigate 回列表）。projectName：project 作用域直接 scope.key；global
 * 作用域从布局面板查 focusId 所属项目。detail 查询（useAgentDetail/useTerminalDetail）query key
 * 与 PanelRouter 一致，React Query dedupe 零额外网络。
 */
function MobileFocusBody({ focusId, scope }: MobileFocusBodyProps) {
  const { t } = useT();
  const navigateWorkbench = useWorkbenchNavigate();
  const [layout] = useWorkbenchLayout();
  const [tab, setTab] = useAtom(workbenchMobileFocusTabAtom);
  const { refs: order } = useScopeInstanceOrder(scope);
  // global scope 从布局查 focusId 所属项目（focusId 是 session id，查到的 ref 收窄到 session
  // 取 projectName；FilePanelRef 无 projectName 字段故需 kind 收窄，设计 workbench-stable-refactor Phase 3）。
  const focusRef = scope.kind === "global" ? findTabRefLeaf(layout, focusId) : null;
  const projectName =
    scope.kind === "project"
      ? scope.key
      : ((focusRef?.kind === "session" ? focusRef.projectName : undefined) ??
        order.find((r) => r.sessionId === focusId)?.projectName);
  const sessionType = inferSessionTypeFromId(focusId);
  // detail 查询（query key 与 PanelRouter 一致，React Query dedupe 零额外网络）。两个 hook 都调
  //（hooks 规则），按 sessionType 控制 enabled；projectName 未就绪时双 enabled=false 零网络开销。
  const panelRef: SessionPanelRef = {
    kind: "session",
    projectName: projectName ?? "",
    sessionId: focusId,
  };
  const projReady = !!projectName;
  const agentDetail = useAgentDetail(panelRef, projReady && sessionType === "agent");
  const terminalDetail = useTerminalDetail(panelRef, projReady && sessionType === "terminal");
  const agentSession = sessionType === "agent" ? agentDetail.data?.session : undefined;
  const terminalSession = sessionType === "terminal" ? terminalDetail.data?.session : undefined;
  const focusDisplayName = agentSession?.displayName ?? terminalSession?.displayName;
  const infoSheet = useInstanceInfoSheet();
  const { close, holder: closeHolder } = useCloseSession();
  // files tab 当前目录（localStorage 记忆，按项目 key 分组）：后台被杀/重开停留在上次目录。
  // 切项目用独立 key 隔离（替代旧 derived-state 重置，语义等价且天然不串项目）。
  const [projectFilesPaths, setProjectFilesPaths] = useAtom(workbenchMobileProjectFilesPathAtom);
  const filesPath = projectName ? (projectFilesPaths[projectName] ?? "") : "";
  const setFilesPath = (path: string) => {
    if (!projectName) return;
    setProjectFilesPaths((prev) => ({ ...prev, [projectName]: path }));
  };
  const ctx: WorkbenchTabPluginContext = {
    projectKey: projectName ?? null,
    focusId,
    sessionType,
    currentPath: filesPath,
    onPathChange: setFilesPath,
  };
  const visiblePlugins = WORKBENCH_TAB_PLUGINS.filter((plugin) => plugin.when(ctx));
  // 记忆的 tab 若在当前 ctx 不可见（如全局作用域下 project-scoped 的 files/git 隐藏，
  // 但记忆值为 files）→ 回退 output，避免内容区空白。
  const activeTab: WorkbenchMobileFocusTab =
    tab === "output" || visiblePlugins.some((p) => p.id === tab) ? tab : "output";
  const activePlugin =
    activeTab === "output" ? null : (visiblePlugins.find((p) => p.id === activeTab) ?? null);

  // ℹ sheet 字段装配（UI=f(state)：terminal 无 model/permissionMode/createdAt，不伪造占位行）。
  const openInfo = () => {
    const fields: InfoField[] = [];
    if (focusDisplayName) {
      fields.push({ label: t("session.instanceInfo.name"), value: focusDisplayName });
    }
    if (projectName) {
      fields.push({ label: t("session.instanceInfo.project"), value: projectName });
    }
    if (sessionType === "agent" && agentSession) {
      fields.push({
        label: t("session.instanceInfo.type"),
        value: providerDisplayName(agentSession.provider),
      });
      if (agentSession.model) {
        fields.push({ label: t("session.instanceInfo.model"), value: agentSession.model });
      }
      if (agentSession.permissionMode) {
        fields.push({
          label: t("session.instanceInfo.permission"),
          value: agentSession.permissionMode,
        });
      }
      if (agentSession.createdAt) {
        fields.push({
          label: t("session.instanceInfo.createdAt"),
          value: formatCreatedAt(agentSession.createdAt),
        });
      }
      fields.push({
        label: t("session.instanceInfo.status"),
        value: t(sessionStatusLabel(agentSession.status)),
      });
    } else if (sessionType === "terminal" && terminalSession) {
      fields.push({
        label: t("session.instanceInfo.type"),
        value: t("session.instanceInfo.terminal"),
      });
      fields.push({
        label: t("session.instanceInfo.status"),
        value: t(sessionStatusLabel(terminalSession.status)),
      });
    }
    infoSheet.open(t("session.instanceInfo.title"), fields);
  };

  const onClose = () => {
    if (!sessionType) return;
    void close(panelRef, sessionType, () => void navigateWorkbench(scope));
  };

  const tabs = [
    { id: "output" as const, label: t("workbench.tabOutput") },
    ...visiblePlugins.map((p) => ({ id: p.id, label: t(p.labelKey) })),
  ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <MobileFocusHeader
        activeTab={activeTab}
        onBack={() => void navigateWorkbench(scope)}
        onClose={onClose}
        onInfo={openInfo}
        onTabSelect={setTab}
        tabs={tabs}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {projectName ? (
          <div className={activePlugin ? "hidden" : "flex min-h-0 flex-1 flex-col overflow-hidden"}>
            <PanelRouter
              embeddedHeader
              key={focusId}
              panelRef={{ kind: "session", projectName, sessionId: focusId }}
            />
          </div>
        ) : null}
        {activePlugin ? (
          <Fragment key={projectName ?? "none"}>{activePlugin.render(ctx)}</Fragment>
        ) : null}
      </div>
      {infoSheet.holder}
      {closeHolder}
    </div>
  );
}

/** Agent provider 全名（claude2 → "Claude 2"；未知值原样回退，不崩溃）。品牌名中英一致，不走 i18n。 */
function providerDisplayName(provider: string | undefined): string {
  if (!provider) return "—";
  if (provider === "claude") return "Claude";
  if (provider === "codex") return "Codex";
  if (provider === "claude2") return "Claude 2";
  return provider;
}

/** createdAt ISO → 本地可读格式（toLocaleString 跟随浏览器 locale，与 navigator.language 检测一致）。 */
function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

type MobileFocusHeaderProps = {
  activeTab: WorkbenchMobileFocusTab;
  tabs: { id: WorkbenchMobileFocusTab; label: string }[];
  onBack: () => void;
  onInfo: () => void;
  onClose: () => void;
  onTabSelect: (id: WorkbenchMobileFocusTab) => void;
};

/**
 * 移动聚焦态单行 header（设计文档 §7，5g 重构）：◄ 返回 + tab 横滚区（flex-1 overflow-x-auto
 * 隐藏滚动条）+ ℹ✕ 胶囊操作区（ViewSwitcher 同款容器）。替代旧 MobilePageHeader + 二级 tab 行。
 * tab 区可横滚（tab 多时不换行挤压胶囊）；胶囊 shrink-0 永远可见。ℹ 触发底部 info sheet；
 * ✕ 触发 useCloseSession（confirm → close API → navigate 回列表）。
 */
function MobileFocusHeader({
  activeTab,
  tabs,
  onBack,
  onInfo,
  onClose,
  onTabSelect,
}: MobileFocusHeaderProps) {
  const { t } = useT();
  return (
    <MobileTabHeader
      activeTabId={activeTab}
      back={{ ariaLabelKey: "workbench.backToList", onClick: onBack }}
      onTabSelect={onTabSelect}
      tabs={tabs}
      trailing={
        <div
          className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5"
          role="group"
        >
          <button
            aria-label={t("session.instanceInfo.title")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
            onClick={onInfo}
            type="button"
          >
            <ShellIcon className="h-4 w-4" name="info" />
          </button>
          <button
            aria-label={t("session.close")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-error/10 hover:text-error"
            onClick={onClose}
            type="button"
          >
            <ShellIcon className="h-4 w-4" name="close" />
          </button>
        </div>
      }
    />
  );
}

type MobileFocusTabButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

/** 移动聚焦态 header tab 按钮（与右栏 RightPanelTabs.TabButton 同设计语言，5g 紧凑化匹配 h-12 单行 header）。 */
function MobileFocusTabButton({ active, label, onClick }: MobileFocusTabButtonProps) {
  return (
    <button
      className={`shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${active ? "bg-primary/10 text-primary" : "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

type MobileTabHeaderProps<TabId extends string> = {
  // ◄ 返回按钮：可选，不传则不渲染。二级页面（项目总览 ◄ 回项目列表、聚焦态 ◄ 回列表）
  // 传 back；一级页面（全局总览）不传，靠底部 tab 切换。
  back?: { ariaLabelKey: TranslationKey; onClick: () => void };
  tabs: { id: TabId; label: string }[];
  activeTabId: TabId;
  onTabSelect: (id: TabId) => void;
  // 右侧 slot：聚焦态填 ℹ✕ 胶囊，列表态填标题 span。
  trailing?: ReactNode;
};

/**
 * 移动单行 header 容器（设计文档 §7）：◄ 返回 + tab 横滚区（flex-1 overflow-x-auto 隐藏
 * 滚动条）+ 右侧 slot。聚焦态（MobileFocusHeader ℹ✕ 胶囊）与列表态（Project/Global Overview
 * 标题）共用此容器，避免三处逐字重复 header className / 返回按钮 SVG / tab 横滚 div。
 * 泛型 TabId 让聚焦态（WorkbenchMobileFocusTab）与列表态（WorkbenchMobileOverviewTab）
 * 复用同一容器且保持各自 tab id 的类型安全。
 */
function MobileTabHeader<TabId extends string>({
  back,
  tabs,
  activeTabId,
  onTabSelect,
  trailing,
}: MobileTabHeaderProps<TabId>) {
  const { t } = useT();
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-on-surface/5 px-3">
      {back ? (
        <button
          aria-label={t(back.ariaLabelKey)}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-soft transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
          onClick={back.onClick}
          type="button"
        >
          <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path
              d="M15 18l-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              stroke="currentColor"
            />
          </svg>
        </button>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((opt) => (
          <MobileFocusTabButton
            active={opt.id === activeTabId}
            key={opt.id}
            label={opt.label}
            onClick={() => onTabSelect(opt.id)}
          />
        ))}
      </div>
      {trailing}
    </header>
  );
}

type MobileProjectOverviewProps = {
  scope: { kind: "project"; key: string };
};

/**
 * 移动项目列表态（设计文档 §7）：单项目聚焦视图。单行 header（◄ 返回 + tab 横滚区 flex-1 +
 * 项目名右侧 shrink-0 truncate，对齐聚焦态 MobileFocusHeader 同款结构，替代旧 MobilePageHeader
 * + 二级 tab 行两块）+ 内容区 tab 切换。总览 = 移动 FAB 新建会话 + 活跃实例 grid（本组件直渲
 * InstanceGrid，单一数据管道 useProjectInstances）；历史 = HistoryList（project-scoped 历史
 * session）；文件/Git = WORKBENCH_TAB_PLUGINS render（移动响应式，单一数据管道）。tab 记忆在
 * workbenchMobileOverviewTabAtom（值域 = WorkbenchMiddleTab），不进 URL（列表态 URL 语义核心
 * 是 scope）。key={scope.key} 切项目 remount，重置 inspection 内部 state。底部消费
 * --shell-mobile-bottom-nav-space 避让一级底部胶囊（MobileWorkbench 已测量注入；桌面 lg: 无额外 pb）。
 */
function MobileProjectOverview({ scope }: MobileProjectOverviewProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useAtom(workbenchMobileOverviewTabAtom);
  // history tab 时间范围（受控，避免 tab 切换丢失；range 进 queryKey → 切档重拉）。
  const [range, setRange] = useState<AgentHistoryRange>("week");
  // files tab 当前目录（localStorage 记忆，按项目 key 分组）：后台被杀/重开/刷新后停留在上次
  // 目录，而非回根目录（A→B→C→D 重开停在 D）。切项目用独立 key 隔离，天然不串项目、无需
  // derived-state 重置。路径不存在回退由 FilesPanel 侧查 files.error 处理（见 file-browser）。
  const [projectFilesPaths, setProjectFilesPaths] = useAtom(workbenchMobileProjectFilesPathAtom);
  const filesPath = projectFilesPaths[scope.key] ?? "";
  const setFilesPath = (path: string) =>
    setProjectFilesPaths((prev) => ({ ...prev, [scope.key]: path }));
  const ctx: WorkbenchTabPluginContext = {
    projectKey: scope.key,
    focusId: undefined,
    sessionType: undefined,
    currentPath: filesPath,
    onPathChange: setFilesPath,
  };
  // tab 顺序：总览 / 历史（project-only，列表态恒 project scope 无条件）/ inspection 插件
  //（按 ctx 过滤；files/git 需 projectKey）。复用 plugin.when 单一来源。
  const tabs = useMemo(
    () => buildOverviewTabs(t, ctx, true),
    // ctx 由 scope 决定，scope/t 变才重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, t],
  );
  // 记忆 tab 若在当前 ctx 不可见 → 回退 overview，避免内容区空白。
  const activeTab: WorkbenchMobileOverviewTab = tabs.some((opt) => opt.id === tab)
    ? tab
    : "overview";
  const activePlugin =
    activeTab !== "overview" && activeTab !== "history"
      ? (WORKBENCH_TAB_PLUGINS.find((p) => p.id === activeTab) ?? null)
      : null;
  // 总览实例数据 + 回调（设计 §9/§11）：project scope 单 grid 视图（无视图切换）。创建入口
  // useCreateSession（移动端进 MobileFab 菜单，桌面进 InstanceLeftOverview CreateSessionBar），
  // 不再走 ProjectInstances 组件（避免重复 useCloseSession/useCreateSession 双 holder）。
  const { close, holder: closeHolder } = useCloseSession();
  const { rename, holder: renameHolder } = useRenameSession();
  const { instances, isLoading } = useProjectInstances(scope.key);
  const create = useCreateSession(scope.key);
  const navigateWorkbench = useWorkbenchNavigate();
  const [, setFocusTab] = useAtom(workbenchMobileFocusTabAtom);
  const focusInstance = (sessionId: string) => {
    // 从总观点实例卡片进 focus → 重置 Output（同 MobileGlobalOverview，避免继承 Files/Git 记忆
    // 落到项目文件）。
    setFocusTab("output");
    void navigateWorkbench(scope, sessionId);
  };
  const closeInstance = (sessionId: string, type: "agent" | "terminal") => {
    void close({ kind: "session", projectName: scope.key, sessionId }, type);
  };
  const renameInstance = (sessionId: string, type: "agent" | "terminal", currentName: string) => {
    void rename({ kind: "session", projectName: scope.key, sessionId }, type, currentName);
  };
  const gridCallbacks: GridItemCallbacks = {
    onClose: closeInstance,
    onRename: renameInstance,
    onSelect: focusInstance,
    t,
  };
  const gridItems = useMemo(
    () => instances.map((entry) => instanceToGridItem(entry, gridCallbacks, scope.key)),
    // gridCallbacks 闭包依赖 scope/t；instances 引用由 hook 内 dataKey fingerprint 稳定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instances, t],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobileTabHeader
        activeTabId={activeTab}
        back={{
          ariaLabelKey: "project.backToProjects",
          onClick: () => void navigate({ to: "/" }),
        }}
        onTabSelect={setTab}
        tabs={tabs}
        trailing={
          <span className="ml-auto shrink-0 max-w-[40%] truncate text-sm font-semibold text-on-surface px-2">
            {scope.key}
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" key={scope.key}>
        {activePlugin ? (
          <Fragment key={scope.key}>{activePlugin.render(ctx)}</Fragment>
        ) : activeTab === "plugins" ? (
          // plugins middle tab（项目级 skill+MCP，仅 project scope）。非 inspection tab——不进
          // WORKBENCH_TAB_PLUGINS（activePlugin 找不到），手写分支渲染 PluginsPanel（与桌面
          // project-left-panel 同构：middle tab + 消费者各自手写渲染）。
          <PluginsPanel projectName={scope.key} />
        ) : activeTab === "history" ? (
          <div className="h-full overflow-y-auto p-3 max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)] lg:pb-3">
            {/* range 控件置顶（移动整页滚动内可接受），周/半月/全部默认周。 */}
            <div className="mb-2">
              <HistoryRangeControl onChange={setRange} value={range} />
            </div>
            <HistoryList
              focusId={undefined}
              onRangeChange={setRange}
              projectName={scope.key}
              range={range}
              showLabel={false}
            />
          </div>
        ) : (
          <Fragment>
            {/* 移动 FAB（lg:hidden）：新建会话（Claude/Terminal）。桌面 CreateSessionBar 在
                InstanceLeftOverview header 保留。create.promptHolder 仍在下方统一渲染。 */}
            <MobileFab
              ariaLabel={t("workbench.createSessionAria")}
              cancelLabel={t("cancel")}
              disabled={create.isCreating}
              items={[
                {
                  label: t("workbench.createClaude2"),
                  icon: <ShellIcon name="anthropic" />,
                  onSelect: () => create.createAgent("claude2"),
                },
                {
                  label: t("workbench.createTerminal"),
                  icon: <ShellIcon name="terminal" />,
                  onSelect: create.createTerminal,
                },
              ]}
            />
            <div className="min-h-0 flex-1 overflow-y-auto max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)] lg:pb-0">
              {isLoading && gridItems.length === 0 ? (
                <div className="px-3 py-2">
                  <CardGridSkeleton plain />
                </div>
              ) : gridItems.length > 0 ? (
                <div className="px-3 py-2">
                  <InstanceGrid items={gridItems} plain />
                </div>
              ) : (
                <p className="px-3 py-6 text-center text-sm text-on-surface-muted">
                  {t("workbench.emptyInstanceHint")}
                </p>
              )}
              {/* closeHolder + promptHolder 统一渲染（原 ProjectInstances 自含 holder 已随组件删除，
                  无双 holder）。 */}
              {closeHolder}
              {renameHolder}
              {create.promptHolder}
            </div>
          </Fragment>
        )}
      </div>
    </div>
  );
}

/**
 * 移动 [项目] 总览（设计文档 §5/§7/决策 25/28）：跨项目活跃实例聚合 + 项目入口。一级页面，
 * header = MobilePageHeader 标题。单一融合视图（2026-08-05）：mergeProjectsWithCandidates +
 * listProjects 按项目分段，**含无实例空项目**（决策 33：空项目只名行，无空状态文案）；**项目名行 =
 * 名+› 整体 button 进项目**（navigate `/projects/$key`，热区 min-h-11 ≥44px），**最右 ⋯ ActionMenu
 * 删除项目**（deleteProject + useConfirm confirm，destructive）；实例区 InstanceGrid 单列连续卡片。
 * 点卡片进 `/projects/session/$focusId` 聚焦。删 inspection tab 行 + 插件分支（[项目] 总览是纯
 * 实例聚合 + 项目入口，inspection 归 [文件]/[设置] 一级导航 + 项目内 MobileProjectOverview）。
 * close 复用 useCloseSession。
 */
function MobileGlobalOverview() {
  const { t } = useT();
  const navigateWorkbench = useWorkbenchNavigate();
  const [, setFocusTab] = useAtom(workbenchMobileFocusTabAtom);
  // [项目] 总览共享主体（批 F / 决策 29）：桌面/移动同一实现。移动端只提供外壳
  //（MobilePageHeader 标题；底部胶囊避让由 GlobalProjectsOverview 消费 CSS var），
  // 实例聚焦/新建/删除全在共享组件内（批 J 折叠废弃）。
  const focusInstance = (sessionId: string) => {
    // 从总观点实例卡片进 focus → 重置 Output（不继承上次切到的 Files/Git 记忆，避免落到
    // 项目文件造成「进错地方」误会）。
    setFocusTab("output");
    void navigateWorkbench({ kind: "global" }, sessionId);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobilePageHeader title={t("workbench.global")} />
      <div className="min-h-0 flex-1">
        <GlobalProjectsOverview onFocusInstance={focusInstance} />
      </div>
    </div>
  );
}

/**
 * 移动 [文件] 全局总览（设计 workbench-stable-refactor review 收口）：`/files`（scope=global +
 * leftMode="files"，无 focus）在移动端渲染此组件——外壳 MobilePageHeader 标题（与 MobileGlobalOverview
 * 同款范式）+ 主体 GlobalFilesOverview（rootBrowse 全局文件树，与桌面左栏同源）。收口 `/files`
 * 进 workbench layout 后，移动无 focus 分支会落到 MobileGlobalOverview（项目列表），故在此按
 * `global + leftMode==="files"` 单独分流，避免行为丢失。点文件 navigate `/files/file/$`（与原
 * FilesRoute 移动 onOpenFile 一致，迁移过来）。
 */
function MobileFilesOverview() {
  const { t } = useT();
  const navigate = useNavigate();
  // 全局文件树 cwd（localStorage 记忆，路径 = `${projectName}/${relative}`，空串 = 根目录）：
  // 后台被杀/重开停留在上次目录。路径不存在回退由 FilesPanel 侧查 files.error 处理。
  const [globalFilesPath, setGlobalFilesPath] = useAtom(workbenchMobileGlobalFilesPathAtom);
  const onOpenFile = (projectName: string, path: string) => {
    void navigate({
      to: "/files/file/$",
      params: { _splat: `${projectName}/${path}` },
    });
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobilePageHeader title={t("nav.files")} />
      <div className="flex min-h-0 flex-1 flex-col">
        <GlobalFilesOverview
          currentPath={globalFilesPath}
          onPathChange={setGlobalFilesPath}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  );
}
