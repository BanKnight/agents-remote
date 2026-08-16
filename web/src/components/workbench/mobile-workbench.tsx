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
import { MobilePluginsOverview, SkillTabPreview } from "../../routes/PluginsRoute";
import {
  findTabRefLeaf,
  type WorkbenchLayoutV3,
  type WorkbenchMobileFocusTab,
  type WorkbenchScope,
  inferSessionTypeFromId,
  parseFileTabId,
  parseSkillTabId,
  projectTabStrip,
  splitFilePath,
  useWorkbenchLayout,
  useWorkbenchNavigate,
  type SessionPanelRef,
  workbenchMobileFocusTabAtom,
  workbenchMobileGlobalFilesPathAtom,
  workbenchMobileProjectFilesPathAtom,
} from "../../routes/workbench-model";

import {
  CardGridSkeleton,
  type CreateSessionApi,
  type GridItemCallbacks,
  InstanceGrid,
  instanceToGridItem,
  PanelRouter,
  useAgentDetail,
  useCloseSession,
  useGlobalInstanceCandidates,
  useProjectInstances,
  useScopeInstanceOrder,
  useTerminalDetail,
} from "./instance-area";
import { WORKBENCH_TAB_PLUGINS, type WorkbenchTabPluginContext } from "./workbench-tab-plugin";
import { MobileProjectDrawer } from "./mobile-project-drawer";
import { MobileTabStrip } from "./mobile-tab-strip";
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
   * MobileProjectWorkbench（drawer + tab 带）。桌面端 leftMode 由 WorkbenchContent 左栏逻辑消费，移动端在此分支消费。
   */
  leftMode?: "auto" | "files" | "plugins";
  /** 布局（workbenchLayoutV4，桌面/移动共享打开集合）。project scope tab 带投影数据源。 */
  layout: WorkbenchLayoutV3;
  /** tab 点选 = setActiveTabInLeaf + navigate focus（WorkbenchContent 注入）。 */
  onSelectTab: (leafId: string, tabId: string) => void;
  /** tab ✕ = 最小化（removeTabFromLeaf + focus 回退，WorkbenchContent 注入）。 */
  onCloseTab: (leafId: string, tabId: string) => void;
  /** 左栏/抽屉文件树点文件 → 开 file tab + focus（WorkbenchContent 注入）。 */
  onOpenFile: (projectName: string, path: string) => void;
  /** git 变更点文件 → 开 git diff tab + focus（WorkbenchContent 注入）。 */
  onOpenGitFile: (projectName: string, scope: "worktree" | "staged", path: string) => void;
  /** 分支 compare 点文件 → 开 git compare tab + focus（WorkbenchContent 注入）。 */
  onOpenGitCompareFile: (projectName: string, base: string, compare: string, path: string) => void;
  /** 关闭实例（confirm → close API → 删 tab，WorkbenchContent 注入）。 */
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
  /** 改名实例（prompt → rename API，WorkbenchContent 注入）。 */
  renameInstance: (
    sessionId: string,
    type: "agent" | "terminal",
    currentName: string,
    projectName: string,
  ) => void;
  /** 创建会话（useCreateSession，WorkbenchContent 注入；promptHolder 同源）。 */
  create: CreateSessionApi;
  /** create promptHolder（useCreateSession 同源，统一渲染）。 */
  createPromptHolder: ReactNode;
  /** close/rename confirm-prompt holders（WorkbenchContent 注入统一渲染）。 */
  closeHolder: ReactNode;
  renameHolder: ReactNode;
};

/**
 * 移动端工作台（设计文档 §7 / §7.7，2026-08-16 重设计）。project scope = 侧边栏 drawer
 *（左栏投影）+ header 内容 tab 带（中栏投影，`MobileProjectWorkbench`）；global scope 保持
 * 「列表态 → 全屏聚焦态」线性模型（MobileGlobalOverview / MobileFilesOverview /
 * MobilePluginsOverview / MobileFocusBody / MobileFileFocus / MobileSkillFocus）。
 */
export function MobileWorkbench({
  closeHolder,
  closeInstance,
  create,
  createPromptHolder,
  focusId,
  layout,
  leftMode,
  onCloseTab,
  onOpenFile,
  onOpenGitCompareFile,
  onOpenGitFile,
  onSelectTab,
  renameHolder,
  renameInstance,
  scope,
}: MobileWorkbenchProps) {
  // workbench 不走 ShellLayout，这里自行测量一级底部 nav 高度并注入
  // `--shell-mobile-bottom-nav-space`，让 workbench 内用 var 的滚动容器（文件列表、
  // Git diff 等）底部正确避让胶囊（参考 ShellLayout 同款 useMeasuredBottomNav）。
  // 底部 nav 只在全局一级页（设计 §7.7 决策 ⑥）：project scope（二级页）与聚焦态
  //（focusId，底部让位给输入区）都传 null → height=0 → var=0px。
  const showPrimaryNav = scope.kind !== "project" && !focusId;
  const { height: bottomNavHeight, measured: measuredBottomNav } = useMeasuredBottomNav(
    showPrimaryNav ? <MobilePrimaryNav /> : null,
  );
  const mainStyle = {
    "--shell-mobile-bottom-nav-space": `${bottomNavHeight}px`,
  } as CSSProperties;

  // project scope（含聚焦态）统一走 drawer + tab 带工作台。
  if (scope.kind === "project") {
    return (
      <main
        className={`group relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
        style={mainStyle}
      >
        <MobileProjectWorkbench
          closeHolder={closeHolder}
          closeInstance={closeInstance}
          create={create}
          createPromptHolder={createPromptHolder}
          focusId={focusId}
          layout={layout}
          onCloseTab={onCloseTab}
          onOpenFile={onOpenFile}
          onOpenGitCompareFile={onOpenGitCompareFile}
          onOpenGitFile={onOpenGitFile}
          onSelectTab={onSelectTab}
          renameHolder={renameHolder}
          renameInstance={renameInstance}
          scope={scope}
        />
      </main>
    );
  }

  if (!focusId) {
    return (
      <main
        className={`group relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
        style={mainStyle}
      >
        {leftMode === "plugins" ? (
          <MobilePluginsOverview />
        ) : leftMode === "files" ? (
          <MobileFilesOverview />
        ) : (
          <MobileGlobalOverview />
        )}
        {measuredBottomNav}
      </main>
    );
  }

  // file focus（focusId 形如 file_demo/src/index.ts，path=全路径含项目名前缀，设计 §6 决策 3 /
  // workbench-stable-refactor Phase 3）：global scope 文件 tab 用 MobileFileFocus 浮窗式预览
  //（复用 FileTabPreview 可编辑预览 + 顶部返回/✕ header）；project scope 文件走 tab 带已在上分支。
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

  // skill focus（focusId 形如 skill_tdd，name=skill 名）：global scope（/plugins/skill/$）用
  // MobileSkillFocus 浮窗式只读预览；project scope skill 走 tab 带（上方 project 分支）。
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

type MobileProjectWorkbenchProps = {
  scope: { kind: "project"; key: string };
  focusId?: string;
  layout: WorkbenchLayoutV3;
  onSelectTab: (leafId: string, tabId: string) => void;
  onCloseTab: (leafId: string, tabId: string) => void;
  onOpenFile: (projectName: string, path: string) => void;
  onOpenGitFile: (projectName: string, scope: "worktree" | "staged", path: string) => void;
  onOpenGitCompareFile: (projectName: string, base: string, compare: string, path: string) => void;
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
  renameInstance: (
    sessionId: string,
    type: "agent" | "terminal",
    currentName: string,
    projectName: string,
  ) => void;
  create: CreateSessionApi;
  /** create promptHolder（useCreateSession 同源 holder，统一渲染）。 */
  createPromptHolder: ReactNode;
  closeHolder: ReactNode;
  renameHolder: ReactNode;
};

/**
 * 移动项目工作台（设计 workbench-views §7.7，2026-08-16 重设计）＝桌面三栏的前两栏在窄屏的
 * 投影：侧边栏 drawer（左栏投影，`MobileProjectDrawer`）+ header 内容 tab 带（中栏投影，
 * `MobileTabStrip` 消费 `projectTabStrip(layout, key)`）。
 *
 * - **无 focusId（浏览态）**：tab 带 + InstanceGrid 浏览 + MobileFab 新建。
 * - **有 focusId（聚焦态）**：tab 带 + `<PanelRouter embeddedHeader>`——与桌面中栏主体同一
 *   渲染源（session 含底部输入；file/git/skill 只读预览），聚焦瞬态（focus effect 同步前 tab
 *   尚未入 layout）渲染骨架不闪浏览态。
 * - **进入项目默认展开 drawer（总览段）**；drawer 开合 state 在本组件（`key={scope.key}` 切
 *   项目重挂 → 默认展开），浏览↔聚焦切换不重置。
 * - tab 带只显示当前项目 tab（skill 全局包含）；active = `focusId === tabId`。
 */
function MobileProjectWorkbench({
  closeHolder,
  closeInstance,
  create,
  createPromptHolder,
  focusId,
  layout,
  onCloseTab,
  onOpenFile,
  onOpenGitCompareFile,
  onOpenGitFile,
  onSelectTab,
  renameHolder,
  renameInstance,
  scope,
}: MobileProjectWorkbenchProps) {
  const { t } = useT();
  const navigateWorkbench = useWorkbenchNavigate();
  // 进入项目 drawer 默认态：浏览态（无 focusId）= 展开总览段（设计决策 ①「进入项目默认展开侧边栏」，
  // 会话列表即入口）；聚焦态（带 focusId，如从 global 总览点会话卡进入）= 收起——用户已明确要看
  // 会话，drawer 总览段是多余遮挡（2026-08-16 迭代）。key={scope.key} 切项目重挂才重新评估；
  // 同项目内浏览↔聚焦切换保留 state（Material 保留 drawer 状态，设计 §7.7）。
  const [drawerOpen, setDrawerOpen] = useState(() => focusId == null);
  const [, setFocusTab] = useAtom(workbenchMobileFocusTabAtom);
  const { instances, isLoading } = useProjectInstances(scope.key);

  const focusInstance = (sessionId: string) => {
    // 从 drawer/浏览态点实例卡片进 focus → 重置 Output（同 MobileGlobalOverview，避免继承
    // Files/Git 记忆落到项目文件）。
    setFocusTab("output");
    void navigateWorkbench(scope, sessionId);
  };

  // tab 带（中栏投影）：projectTabStrip 过滤当前项目 tab（skill 全局包含）。label/marker 由
  // MobileTabChip 内 usePanelMeta 派生（与桌面 TabChip 同一渲染源）。
  const stripItems = useMemo(() => projectTabStrip(layout, scope.key), [layout, scope.key]);

  // 聚焦态主体：findTabRefLeaf 命中 → PanelRouter（与桌面中栏同源）；未命中（focus effect
  // 同步前瞬态 / 已最小化但 URL 未清）→ 骨架。
  const focusRef = focusId ? findTabRefLeaf(layout, focusId) : null;
  const isSessionFocus = focusId ? inferSessionTypeFromId(focusId) !== null : false;

  const gridCallbacks: GridItemCallbacks = {
    onClose: closeInstance,
    onRename: (sessionId, type, currentName) => {
      renameInstance(sessionId, type, currentName, scope.key);
    },
    onSelect: (sessionId) => {
      setDrawerOpen(false);
      focusInstance(sessionId);
    },
    t,
  };
  const gridItems = useMemo(
    () => instances.map((entry) => instanceToGridItem(entry, gridCallbacks, scope.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instances, scope.key, t],
  );

  return (
    <div className="flex h-full min-h-0 flex-col" key={scope.key}>
      <MobileTabStrip
        activeTabId={focusId}
        onClose={onCloseTab}
        onSelect={onSelectTab}
        onToggleSidebar={() => setDrawerOpen(true)}
        tabs={stripItems}
        trailing={
          focusId && isSessionFocus && focusRef?.kind === "session" ? (
            <MobileFocusActions
              focusId={focusId}
              onClose={() =>
                closeInstance(focusRef.sessionId, inferSessionTypeFromId(focusId) ?? "terminal")
              }
              projectName={scope.key}
            />
          ) : undefined
        }
      />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {focusId && focusRef ? (
          focusRef.kind === "session" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <PanelRouter embeddedHeader key={focusId} panelRef={focusRef} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <PanelRouter embeddedHeader key={focusId} panelRef={focusRef} />
            </div>
          )
        ) : focusId ? (
          // 聚焦瞬态：focus effect 同步前 tab 尚未入 layout——骨架承接（effect 立即补齐）。
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-3 py-2">
              <CardGridSkeleton plain />
            </div>
          </div>
        ) : (
          <Fragment>
            {/* 浏览态（无 focus）：实例 grid + MobileFab 新建。FAB z-30 < drawer scrim z-50
                （drawer 打开时被 scrim 盖住，天然不可误触）。 */}
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
            <div className="min-h-0 flex-1 overflow-y-auto">
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
              {closeHolder}
              {renameHolder}
              {createPromptHolder}
            </div>
          </Fragment>
        )}
      </div>
      <MobileProjectDrawer
        onFocusInstance={focusInstance}
        onOpenChange={setDrawerOpen}
        onOpenFile={onOpenFile}
        onOpenGitCompareFile={onOpenGitCompareFile}
        onOpenGitFile={onOpenGitFile}
        open={drawerOpen}
        scope={scope}
      />
    </div>
  );
}

/** 项目聚焦态 tab 带 trailing：ℹ✕ 胶囊（复用 MobileFocusHeader 同款；ℹ = info sheet、✕ = 关实例）。
 * info 字段装配与 MobileFocusBody 同源（detail query key 一致，React Query dedupe 零额外网络）。 */
function MobileFocusActions({
  onClose,
  focusId,
  projectName,
}: {
  onClose: () => void;
  focusId: string;
  projectName: string;
}) {
  const infoSheet = useInstanceInfoSheet();
  const { t } = useT();
  const sessionType = inferSessionTypeFromId(focusId);
  const panelRef: SessionPanelRef = { kind: "session", projectName, sessionId: focusId };
  const agentDetail = useAgentDetail(panelRef, sessionType === "agent");
  const terminalDetail = useTerminalDetail(panelRef, sessionType === "terminal");
  const agentSession = sessionType === "agent" ? agentDetail.data?.session : undefined;
  const terminalSession = sessionType === "terminal" ? terminalDetail.data?.session : undefined;
  const openInfo = () => {
    const fields: InfoField[] = [];
    if (agentSession?.displayName ?? terminalSession?.displayName) {
      fields.push({
        label: t("session.instanceInfo.name"),
        value: (agentSession ?? terminalSession)!.displayName,
      });
    }
    fields.push({ label: t("session.instanceInfo.project"), value: projectName });
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
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5"
      role="group"
    >
      <button
        aria-label={t("session.instanceInfo.title")}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-on-surface-soft transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
        onClick={openInfo}
        type="button"
      >
        <ShellIcon className="h-4 w-4" name="info" />
      </button>
      <button
        aria-label={t("session.close")}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-on-surface-soft transition hover:bg-error/10 hover:text-error"
        onClick={onClose}
        type="button"
      >
        <ShellIcon className="h-4 w-4" name="close" />
      </button>
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
  // global 点会话卡 → 进该会话所属项目的 project scope 工作台（drawer + tab 带，2026-08-16
  // 迭代）：旧实现硬编码 `navigateWorkbench({ kind: "global" }, sessionId)` → global focus URL
  // `/projects/session/$id` → 旧 MobileFocusBody 全屏聚焦态（无 tab 无 drawer）。candidates 由
  // useGlobalInstanceCandidates 提供（与 GlobalProjectsOverview 同 queryKey ["overview"]，React
  // Query dedupe 无额外请求），resolve sessionId → projectName。
  const { candidates } = useGlobalInstanceCandidates({ kind: "global" });
  const focusInstance = (sessionId: string) => {
    // 从总观点实例卡片进 focus → 重置 Output（不继承上次切到的 Files/Git 记忆，避免落到
    // 项目文件造成「进错地方」误会）。
    setFocusTab("output");
    const projectName = candidates.find((c) => c.ref.sessionId === sessionId)?.ref.projectName;
    if (!projectName) return;
    void navigateWorkbench({ kind: "project", key: projectName }, sessionId);
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
