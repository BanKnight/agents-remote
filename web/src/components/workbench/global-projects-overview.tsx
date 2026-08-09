import { type FormEvent, useId, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useT } from "../../i18n";
import {
  mergeProjectsWithCandidates,
  type GlobalInstanceCandidate,
  type WorkbenchPanelRef,
  workbenchProjectGroupsCollapsedAtom,
} from "../../routes/workbench-model";
import { deleteProject } from "../../api/client";
import { usePinnedSessions, usePinSession, useUnpinSession } from "../../hooks/pinned-sessions";
import { useConfirm } from "../shell/confirm-dialog";
import { actionButtonClasses } from "../shell/shell-primitives";
import { ProjectSetupPanel, useCreateProject } from "../shell/project-setup";
import { Dialog, DialogContent } from "../ui/dialog";
import { ShellIcon } from "../shell/icons";
import { MobileFab } from "../shell/mobile-fab";
import {
  candidateToGridItem,
  CardGridSkeleton,
  type DragSourceAdapter,
  type GridItemCallbacks,
  InstanceGrid,
  useCloseSession,
  useCreateSession,
  useGlobalInstanceCandidates,
  useRenameSession,
} from "./instance-area";

type GlobalProjectsOverviewProps = {
  /** 单击实例 → 进聚焦态（桌面 WorkbenchContent focusInstance；移动 navigateWorkbench）。 */
  onFocusInstance: (sessionId: string) => void;
  /** 桌面拖放源；移动不传。 */
  dragAdapter?: DragSourceAdapter;
};

/**
 * global [项目] 总览共享主体（批 F / 决策 29）。桌面左栏 + 移动 [项目] 胶囊共用，
 * 结束「两端各自改各自」双写。自持 candidates/projects/create/delete/close/rename；
 * 参数化仅 onFocusInstance / dragAdapter?。
 *
 * 单一融合视图（2026-08-05）：原 grid/grouped 双视图合并为「按项目分段的单列网格」——
 * 项目标题行（2026-08-06 手风琴化，2026-08-10 重设计 = ▾ 折叠独立按钮 + 📁 项目名点击进入 +
 * 行内新建 Claude/Terminal/删除按钮 + › 进项目）作 section header 分割，组内 InstanceGrid
 * plain 连续单列卡片（无圆角 section 边框/bg、无 carousel 分页），含空项目只显标题行。ViewSwitcher 下线。
 *
 * 外壳（标题、底部 nav）由调用方提供：桌面 WorkbenchShell leftPanelTitle；
 * 移动 MobilePageHeader。
 */
export function GlobalProjectsOverview({
  onFocusInstance,
  dragAdapter,
}: GlobalProjectsOverviewProps) {
  const { t } = useT();
  const inputId = useId();
  const [setupOpen, setSetupOpen] = useState(false);
  const { close, holder: closeHolder } = useCloseSession();
  const { rename, holder: renameHolder } = useRenameSession();
  const { candidates, projectNames, isLoaded } = useGlobalInstanceCandidates({ kind: "global" });
  // pinned 与 candidates 同级并发触发（不再在 GroupedProjectsList 内才发），并参与下方 gate：
  // 两 query 都首次结算（settled）才渲染列表，避免 pinned 后到导致置顶组从顶部插入跳变。
  const { pinned, isLoaded: pinnedLoaded } = usePinnedSessions();
  const { create: createProject, projectPath, setProjectPath } = useCreateProject();

  const closeInstance = (sessionId: string, type: "agent" | "terminal") => {
    const ref = candidates.find((c) => c.ref.sessionId === sessionId)?.ref;
    if (ref) void close(ref, type);
  };
  const renameInstance = (
    sessionId: string,
    type: "agent" | "terminal",
    currentName: string,
    _projectName: string,
  ) => {
    const ref = candidates.find((c) => c.ref.sessionId === sessionId)?.ref;
    if (ref) void rename(ref, type, currentName);
  };

  // empty/loading gate：candidates 与 pinned 都首次结算（settled）才渲染列表——置顶是整组卡片
  // 插入（结构性），必须与项目组同一次 commit 出现，否则 pinned 后到 → 置顶组从顶部插入跳变。
  // candidates 用 isLoaded（success-only：data 就绪，失败则骨架）；pinned 用 pinnedLoaded
  //（settled：失败按无置顶不阻塞列表）。切回页面两 query 命中缓存即 settled，秒回不骨架。
  const settled = isLoaded && pinnedLoaded;
  const overviewEmpty = settled && projectNames.length === 0;
  const overviewLoading = !settled;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPath = projectPath.trim();
    if (trimmedPath.length === 0 || createProject.isPending) return;
    createProject.mutate(trimmedPath);
  };
  const setupVisible = setupOpen || createProject.isPending || createProject.error instanceof Error;

  const body = overviewLoading ? (
    <div className="px-3 py-2">
      <CardGridSkeleton plain />
    </div>
  ) : overviewEmpty ? (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <p className="text-sm text-on-surface-muted">{t("workbench.globalOverviewEmpty")}</p>
    </div>
  ) : (
    <GroupedProjectsList
      candidates={candidates}
      dragAdapter={dragAdapter}
      onClose={closeInstance}
      onFocus={onFocusInstance}
      onRename={renameInstance}
      pinned={pinned}
      projectNames={projectNames}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 桌面专用 header（移动端无 header 行，零残留空条零分割线；FAB 作兄弟节点 fixed 出流仍可见）。 */}
      <div className="hidden shrink-0 items-center gap-1 border-b border-on-surface/5 px-2 py-1.5 lg:flex">
        <button
          aria-label={t("home.createProjectAria")}
          className={actionButtonClasses({
            compact: true,
            tone: "accent",
            className: "hidden lg:inline-flex",
          })}
          onClick={() => setSetupOpen(true)}
          type="button"
        >
          {t("workbench.createMenu")}
        </button>
      </div>
      {/* 移动 FAB（lg:hidden，fixed bottom 出流）：直开 ProjectSetupPanel Dialog。 */}
      <MobileFab ariaLabel={t("home.createProjectAria")} onClick={() => setSetupOpen(true)} />
      <div className="min-h-0 flex-1 overflow-y-auto max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)] lg:pb-0">
        {body}
      </div>
      {closeHolder}
      {renameHolder}
      <Dialog open={setupVisible} onOpenChange={(open) => !open && setSetupOpen(false)}>
        <DialogContent className="overflow-y-auto p-0">
          <ProjectSetupPanel
            createError={createProject.error instanceof Error ? createProject.error : null}
            inputId={inputId}
            isPending={createProject.isPending}
            onProjectPathChange={setProjectPath}
            onSubmit={handleSubmit}
            projectPath={projectPath}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ProjectRowActionsProps = {
  /** 删除 mutation pending（deleteMutation.isPending，禁用删除项）。 */
  deletePending: boolean;
  onDelete: () => void;
  projectName: string;
};

/**
 * 项目标题行行内操作按钮组（2026-08-10 由 ⋯ ProjectRowActionMenu 展开）：原 ⋯ 菜单项（新建
 * Claude + 新建 Terminal + 删除）改为 3 个行内 icon 独立按钮，⋯ 触发器与桌面右键随之下线（行内
 * 已暴露全部操作）。`useCreateSession(projectName)` 是 per-project hook（`groups.map` 内联调
 * hook 会破坏 hooks 规则），本子组件保持「每项目行一个实例」；promptHolder（创建前 name prompt
 * Dialog）在此渲染。空项目行同样渲染（最需要直接建第一个实例）。置顶分组标题行无操作按钮，不经过本组件。
 */
function ProjectRowActions({ deletePending, onDelete, projectName }: ProjectRowActionsProps) {
  const { t } = useT();
  const { createAgent, createTerminal, isCreating, promptHolder } = useCreateSession(projectName);
  return (
    <>
      <button
        aria-label={t("workbench.createClaude2")}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50 touch:h-10 touch:w-10"
        disabled={isCreating}
        onClick={() => createAgent("claude2")}
        title={t("workbench.createClaude2")}
        type="button"
      >
        <ShellIcon className="h-4 w-4" name="anthropic" />
      </button>
      <button
        aria-label={t("workbench.createTerminal")}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50 touch:h-10 touch:w-10"
        disabled={isCreating}
        onClick={createTerminal}
        title={t("workbench.createTerminal")}
        type="button"
      >
        <ShellIcon className="h-4 w-4" name="terminal" />
      </button>
      {/* 删除 destructive：静息 muted，hover 转 error（对齐 mobileSheetItemClasses destructive 语义）。 */}
      <button
        aria-label={t("project.deleteProject")}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-error/10 hover:text-error disabled:cursor-not-allowed disabled:opacity-50 touch:h-10 touch:w-10"
        disabled={deletePending}
        onClick={onDelete}
        title={t("project.deleteProject")}
        type="button"
      >
        <ShellIcon className="h-4 w-4" name="trash" />
      </button>
      {/* 行级 name prompt（useCreateSession 内建，创建会话前弹可选名称）。 */}
      {promptHolder}
    </>
  );
}

type GroupedProjectsListProps = {
  candidates: ReturnType<typeof useGlobalInstanceCandidates>["candidates"];
  projectNames: string[];
  /** 置顶 sessionId 集合（由 GlobalProjectsOverview 顶层 usePinnedSessions 提供，与 candidates 同级 gate）。 */
  pinned: Set<string>;
  onClose: (sessionId: string, type: "agent" | "terminal") => void;
  onFocus: (sessionId: string) => void;
  onRename: (
    sessionId: string,
    type: "agent" | "terminal",
    currentName: string,
    projectName: string,
  ) => void;
  dragAdapter?: DragSourceAdapter;
};

/** 置顶分组在 workbenchProjectGroupsCollapsedAtom 中的保留哨兵 key（非真实项目名，防冲突）。 */
const PINNED_GROUP_KEY = "__pinned__";

/**
 * 按项目分段的单列网格（2026-08-05 融合视图 + 2026-08-06 手风琴化）：mergeProjectsWithCandidates
 * 含空项目。项目标题行（2026-08-06 手风琴）= [▾/▸ 折叠 chevron size-4 + 📁 项目名 text-base font-semibold
 * 整体 button 折叠/展开（`aria-expanded`，热区 min-h-11 ≥44px；折叠态收纳组内实例区，状态
 * `workbenchProjectGroupsCollapsedAtom` localStorage 按项目记忆，刷新/重开保留）][› 进项目独立按钮
 * （`aria-label=workbench.enterProject`，touch:h-10 touch:w-10 44px）][⋯ 删除 最右尽头]。名行两端统一
 * `pl-3 pr-2` + 折叠 toggle button `px-0`：图标 = pl-3(12)+px-0 = 12 ≡ marker（InstanceCard p-3=12），
 * ⋯ = pr-2(8) ≡ 满宽 action（absolute right-2=8），两端图标≡marker、⋯≡action 严格对齐。空项目无可折叠
 * 内容——主区非按钮（▾ 位 `size-4` 占位保持 📁 图标对齐），仍保留 › 进项目 + ⋯ 删除。实例区 =
 * InstanceGrid plain 连续单列卡片（无圆角 section 边框/bg、无 carousel 分页；组内非首卡由 InstanceCard
 * topSeparator 画 inset 分割线，两端统一 left-15=60px 跳过 marker 列）。最前另渲染「置顶」特殊分组
 *（📌，pin 状态存服务端 state.yaml overview 模块跨设备共享，无置顶卡片整段不渲染；卡片同时在置顶分组与原项目
 * 分组出现双显示；标题行只折叠 toggle 无 › / ⋯）。根 `px-3 py-2` + section 间 space-y-2(8px)。
 */
function GroupedProjectsList({
  candidates,
  projectNames,
  pinned,
  onClose,
  onFocus,
  onRename,
  dragAdapter,
}: GroupedProjectsListProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, holder: confirmHolder } = useConfirm();
  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    // 与 useCloseSession/useRenameSession 一致：await invalidate，确保 mutation 完成时缓存已刷新。
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const groups = useMemo(
    () => mergeProjectsWithCandidates(projectNames, candidates),
    [projectNames, candidates],
  );
  const callbacks: GridItemCallbacks = { onClose, onRename, onSelect: onFocus, t };
  const [collapsed, setCollapsed] = useAtom(workbenchProjectGroupsCollapsedAtom);
  const toggleProject = (name: string) =>
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));
  // 置顶：特殊分组 key = "__pinned__" 保留哨兵（workbenchProjectGroupsCollapsedAtom 按 key 记忆折叠态）。
  // pinned Set 由 prop 传入（GlobalProjectsOverview 顶层 usePinnedSessions，与 candidates 同级 gate）；
  // togglePin 按当前态调 pin/unpin mutation（乐观更新 cache → 父级 usePinnedSessions 重渲染 → 新 prop 传下）。
  const pinMutation = usePinSession();
  const unpinMutation = useUnpinSession();
  const togglePin = (sessionId: string) =>
    pinned.has(sessionId) ? unpinMutation.mutate(sessionId) : pinMutation.mutate(sessionId);
  // 卡片网格项：candidateToGridItem + 置顶 props（项目组 + 置顶组两处复用，双显示）。
  const toGridItem = (c: GlobalInstanceCandidate) => ({
    ...candidateToGridItem(c, callbacks),
    pinned: pinned.has(c.ref.sessionId),
    onTogglePin: () => togglePin(c.ref.sessionId),
    pinLabel: t(pinned.has(c.ref.sessionId) ? "workbench.unpin" : "workbench.pin"),
  });
  const pinnedCandidates = candidates.filter((c) => pinned.has(c.ref.sessionId));
  const pinnedCollapsed = !!collapsed[PINNED_GROUP_KEY];

  const requestDelete = async (projectName: string) => {
    const ok = await confirm({
      cancelLabel: t("cancel"),
      confirmLabel: t("project.deleteProject"),
      message: t("project.deleteProjectConfirm"),
      title: t("project.deleteProject"),
      tone: "danger",
    });
    if (ok) deleteMutation.mutate(projectName);
  };
  const enterProject = (name: string) =>
    void navigate({ to: "/projects/$key", params: { key: name } });

  return (
    <div className="space-y-2 px-3 py-2">
      {/* 置顶分组：最前（项目 groups.map 前），无置顶卡片时整段不渲染（空隐藏）。标题行只折叠
          toggle（▾/▸ + 📌 pin + 置顶），无 › 进项目、无 ⋯ 删除（非项目）。 */}
      {pinnedCandidates.length > 0 ? (
        <section key={PINNED_GROUP_KEY}>
          <div className="flex items-center gap-2 rounded-lg bg-surface-raised/30 pl-3 pr-2">
            <button
              aria-expanded={!pinnedCollapsed}
              className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-0 text-left transition hover:bg-on-surface/5"
              onClick={() => toggleProject(PINNED_GROUP_KEY)}
              title={t("workbench.pinnedGroup")}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="size-4 shrink-0 text-on-surface-muted/60"
                fill="none"
                viewBox="0 0 16 16"
              >
                <path
                  d={pinnedCollapsed ? "M6 4l4 4-4 4" : "M4 6l4 4 4-4"}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                />
              </svg>
              <ShellIcon className="size-5 shrink-0 text-primary" name="pin" />
              <span className="truncate text-base font-semibold text-on-surface">
                {t("workbench.pinnedGroup")}
              </span>
            </button>
          </div>
          {!pinnedCollapsed ? (
            <div>
              <InstanceGrid
                dragAdapter={dragAdapter}
                dragRefs={new Map(pinnedCandidates.map((c) => [c.ref.sessionId, c.ref]))}
                items={pinnedCandidates.map(toGridItem)}
                plain
              />
            </div>
          ) : null}
        </section>
      ) : null}
      {groups.map((group) => {
        const dragRefs = new Map<string, WorkbenchPanelRef>();
        for (const c of group.candidates) dragRefs.set(c.ref.sessionId, c.ref);
        const hasCards = group.candidates.length > 0;
        const isCollapsed = hasCards && !!collapsed[group.projectName];
        return (
          <section key={group.projectName}>
            <div className="flex items-center gap-2 rounded-lg bg-surface-raised/30 pl-3 pr-2">
              {hasCards ? (
                // 折叠独立按钮：▾/▸，折叠/展开唯一入口（2026-08-10 由整行 toggle 拆出）——点行
                // 主体不再折叠、改进入项目；chevron ▾ 下 / ▸ 右，touch:h-10 w-10 ≥40px。
                <button
                  aria-expanded={!isCollapsed}
                  aria-label={t(
                    isCollapsed ? "workbench.expandProjectGroup" : "workbench.collapseProjectGroup",
                  )}
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface touch:h-10 touch:w-10"
                  onClick={() => toggleProject(group.projectName)}
                  title={t(
                    isCollapsed ? "workbench.expandProjectGroup" : "workbench.collapseProjectGroup",
                  )}
                  type="button"
                >
                  <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
                    <path
                      d={isCollapsed ? "M6 4l4 4-4 4" : "M4 6l4 4 4-4"}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    />
                  </svg>
                </button>
              ) : (
                // 空项目：无折叠内容，▾ 位 h-7 w-7 占位（touch:h-10 w-10 随按钮）保持 📁 图标与有实例行对齐。
                <span aria-hidden="true" className="h-7 w-7 shrink-0 touch:h-10 touch:w-10" />
              )}
              {/* 名 button：行主体，点击进入项目（flex-1 撑满中间空白 = 整行进入；行 div 无 onClick，
                  避 createPortal fiber 冒泡）。热区 min-h-11 ≥44px。 */}
              <button
                className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-0 text-left transition hover:bg-on-surface/5"
                onClick={() => enterProject(group.projectName)}
                title={group.projectName}
                type="button"
              >
                <ShellIcon className="size-5 shrink-0 text-on-surface-muted" name="project" />
                <span className="truncate text-base font-semibold text-on-surface">
                  {group.projectName}
                </span>
              </button>
              <ProjectRowActions
                deletePending={deleteMutation.isPending}
                onDelete={() => void requestDelete(group.projectName)}
                projectName={group.projectName}
              />
              {/* 独立 › 进项目按钮（与名 button 同为进入入口，最右视觉锚；touch 放大 ≥40px）。 */}
              <button
                aria-label={t("workbench.enterProject")}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface touch:h-10 touch:w-10"
                onClick={() => enterProject(group.projectName)}
                type="button"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
                  <path
                    d="M6 4l4 4-4 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  />
                </svg>
              </button>
            </div>
            {hasCards && !isCollapsed ? (
              <div>
                <InstanceGrid
                  dragAdapter={dragAdapter}
                  dragRefs={dragRefs}
                  items={group.candidates.map(toGridItem)}
                  plain
                />
              </div>
            ) : null}
          </section>
        );
      })}
      {confirmHolder}
    </div>
  );
}
