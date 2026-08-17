import { type ReactNode, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useT } from "../../i18n";
import { cn } from "../../lib/utils";
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
import { useCreateProjectDialog } from "../shell/project-setup";
import { ActionMenu } from "../ui/action-menu";
import { ShellIcon } from "../shell/icons";
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
  /** 桌面 header 新建按钮 + dialog 渲染开关（默认 true）。移动端传 false：新建入口/dialog
   *  单一归属外壳 MobilePageHeader.actions（useCreateProjectDialog），避免双 dialog 挂载。 */
  renderCreateEntry?: boolean;
};

/**
 * global [项目] 总览共享主体（批 F / 决策 29）。桌面左栏 + 移动 [项目] 胶囊共用，
 * 结束「两端各自改各自」双写。自持 candidates/projects/create/delete/close/rename；
 * 参数化仅 onFocusInstance / dragAdapter?。
 *
 * 单一融合视图（2026-08-05）：原 grid/grouped 双视图合并为「按项目分段的单列网格」——
 * 项目标题行（2026-08-06 手风琴化，2026-08-10 重设计 = ▾ 折叠 + 📁 项目名点击进入 + ➕ 新建
 * 二级菜单 + 🗑 删除）作 section header 分割，组内 InstanceGrid plain 连续单列卡片（无圆角
 * section 边框/bg、无 carousel 分页），含空项目只显标题行。ViewSwitcher 下线。
 *
 * 外壳（标题、底部 nav）由调用方提供：桌面 WorkbenchShell leftPanelTitle；
 * 移动 MobilePageHeader。
 */
export function GlobalProjectsOverview({
  onFocusInstance,
  dragAdapter,
  renderCreateEntry = true,
}: GlobalProjectsOverviewProps) {
  const { t } = useT();
  const { close, holder: closeHolder } = useCloseSession();
  const { rename, holder: renameHolder } = useRenameSession();
  const { candidates, projectNames, isLoaded } = useGlobalInstanceCandidates({ kind: "global" });
  // pinned 与 candidates 同级并发触发（不再在 GroupedProjectsList 内才发），并参与下方 gate：
  // 两 query 都首次结算（settled）才渲染列表，避免 pinned 后到导致置顶组从顶部插入跳变。
  const { pinned, isLoaded: pinnedLoaded } = usePinnedSessions();
  const { openCreate, dialog } = useCreateProjectDialog();

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
      {/* 桌面专用 header（移动端无 header 行，零残留空条零分割线；移动新建入口在外壳
          MobilePageHeader.actions，dialog 由外壳 useCreateProjectDialog 提供——2026-08-17
          review：移动端 renderCreateEntry=false 时双 dialog 挂载隐患，这里整体不渲染）。
          renderCreateEntry=false 时 openCreate/dialog 闲置（hooks 规则保持无条件调用）。 */}
      {renderCreateEntry ? (
        <>
          <div className="hidden shrink-0 items-center gap-1 border-b border-on-surface/5 px-2 py-1.5 lg:flex">
            <button
              aria-label={t("home.createProjectAria")}
              className={actionButtonClasses({
                compact: true,
                tone: "accent",
                className: "hidden lg:inline-flex",
              })}
              onClick={openCreate}
              type="button"
            >
              {t("workbench.createMenu")}
            </button>
          </div>
          {dialog}
        </>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)] lg:pb-0">
        {body}
      </div>
      {closeHolder}
      {renameHolder}
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
 * 项目标题行操作按钮组（2026-08-10）：新建合并为 ➕ 二级菜单（ActionMenu trigger=plus icon，
 * items=[Claude/Terminal]，对齐项目内 CreateSessionBar；桌面 popover / 移动 sheet）+ 🗑 删除
 * 独立按钮。`useCreateSession(projectName)` 是 per-project hook（`groups.map` 内联调 hook 会
 * 破坏 hooks 规则），本子组件保持「每项目行一个实例」；promptHolder（创建前 name prompt Dialog）
 * 在此渲染。空项目行同样渲染（最需要直接建第一个实例）。置顶分组标题行无操作按钮，不经过本组件。
 */
function ProjectRowActions({ deletePending, onDelete, projectName }: ProjectRowActionsProps) {
  const { t } = useT();
  const { createAgent, createTerminal, isCreating, promptHolder } = useCreateSession(projectName);
  // flex（无 gap）：➕ 新建与 🗑 删除紧贴成「项目操作组」。移动端按钮 touch:h-10 w-10（40px 触摸目标）
  // 但 icon 居中，按钮内 icon padding 已占主导——gap>0 时两 icon 视觉间距 = padding×2 + gap，gap 即便 4px
  // 也让 icon 间距明显大于桌面端（桌面 28px 按钮+16px icon=16px 间距不嫌远；移动 40px 按钮+16px icon=28px
  // 间距嫌远）。故移动端 gap 0 + icon 放大到 touch:h-6（24px），icon 间距回到 16px=桌面端。与左组
  // （▾+📁 gap-1.5 子容器）对偶——header 由「左组 / 操作组」两个 flex 子容器构成。
  return (
    <div className="flex items-center">
      {/* 新建合并为 ➕ 二级菜单（2026-08-10 迭代）：+Claude/+Terminal 收进 ActionMenu，对齐
          项目内 CreateSessionBar 同款菜单（桌面 popover / 移动 sheet）。trigger=plus icon，
          aria-label=workbench.createSessionAria；isCreating 禁用。 */}
      <ActionMenu
        align="end"
        cancelLabel={t("cancel")}
        items={[
          {
            icon: <ShellIcon className="size-4" name="anthropic" />,
            label: t("workbench.createClaude"),
            onSelect: () => createAgent("claude"),
          },
          {
            icon: <ShellIcon className="size-4" name="terminal" />,
            label: t("workbench.createTerminal"),
            onSelect: createTerminal,
          },
        ]}
        trigger={
          <button
            aria-label={t("workbench.createSessionAria")}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50 touch:h-10 touch:w-10"
            disabled={isCreating}
            title={t("workbench.createSessionAria")}
            type="button"
          >
            <ShellIcon className="h-4 w-4 touch:h-6 touch:w-6" name="plus" />
          </button>
        }
      />
      {/* 删除 destructive：静息 muted，hover 转 error（对齐 mobileSheetItemClasses destructive 语义）。 */}
      <button
        aria-label={t("project.deleteProject")}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-error/10 hover:text-error disabled:cursor-not-allowed disabled:opacity-50 touch:h-10 touch:w-10"
        disabled={deletePending}
        onClick={onDelete}
        title={t("project.deleteProject")}
        type="button"
      >
        <ShellIcon className="h-4 w-4 touch:h-6 touch:w-6" name="trash" />
      </button>
      {/* 行级 name prompt（useCreateSession 内建，创建会话前弹可选名称）。 */}
      {promptHolder}
    </div>
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
 * 按项目分段的单列网格（2026-08-05 融合视图 + 2026-08-06 手风琴化 + 2026-08-10 重设计）：mergeProjectsWithCandidates
 * 含空项目。项目标题行 = `[左组：▾ 折叠 chevron size-4 + 📁 项目名 flex-1 button 点击进入][➕ 新建二级菜单][🗑 删除]`。
 * 左组（`flex min-h-11 flex-1 items-center gap-1.5`）复刻置顶分组紧凑结构——▾ size-4 紧贴 pl-3=12 左缘
 *（对齐置顶 ▾ 同 x 位；touch:h-10 只放大高度不放大宽度，纠正 touch:size-10 撑大致偏右）+ 紧挨 📁（gap-1.5=6）；▾ 折叠 / 📁名 进入拆两个 button（左组 div 无 onClick，避
 * portal fiber 冒泡）。名 button flex-1 撑满 ▾ 外空间 = 点行主体进入项目（navigate `/projects/$key`；2026-08-10
 * 去 › 进入按钮，整行进入已够）。折叠/展开只由 ▾ 独立按钮触发（`aria-expanded` + `aria-label` 按态切换
 * collapse/expandProjectGroup，状态 `workbenchProjectGroupsCollapsedAtom` localStorage 按项目记忆）。
 * 新建合并为 ➕ 二级菜单（ActionMenu，对齐项目内 CreateSessionBar）+ 🗑 删除独立。section 容器
 * `bg-surface-raised` + Apple 动态圆角（2026-08-10 inset grouped）：连续折叠标题行组圆角条带段（首尾圆角 /
 * 中间方角 + 分割线），展开分组脱离成独立圆角块（标题行顶圆 + 卡片底圆一体 `rounded-lg`），展开块与
 * 折叠段间 `mt-2` 间距断开（分割线不穿过展开块）。`surface-raised` 凸起语义（苹果 inset-grouped「分组
 * 永远比底亮」）——明 `#ffffff` 纯白 / 暗 `#141b28` 亮灰，两主题都比底色（shell `bg-surface/20`）亮 →
 * 凸起方向统一；弃用 `on-surface/10`（文字色叠加，明主题凹陷 / 暗主题凸起，方向翻转）。标题行
 * div（`pl-3 pr-2`）去 bg（移到 section）。空项目无折叠内容——▾ 位 size-4 占位
 * span 保持 📁 与有实例行对齐，仍保留 ➕/🗑。实例区 = InstanceGrid plain 连续单列卡片（无圆角 section
 * 边框/bg、无 carousel 分页；组内非首卡由 InstanceCard topSeparator 画 inset 分割线，两端统一 left-15=60px
 * 跳过 marker 列）。最前另渲染「置顶」特殊分组（📌，pin 状态存服务端 state.yaml overview 模块跨设备共享，
 * 无置顶卡片整段不渲染；卡片同时在置顶分组与原项目分组出现双显示；标题行只折叠 toggle 无 ➕/🗑）。根
 * `px-3 py-2`（去 `divide-y`；分割线改每个 section 条件 `border-t border-on-surface/5`——段内紧贴、
 * 触及展开块则 `mt-2` 间距，去 `space-y-2` 空隙）。
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

  // 统一 sections 列表（置顶 + 项目 groups），每个 section 按自身展开态 + 上下邻居态算
  // Apple 动态圆角 + 上边界（inset grouped 范式，2026-08-10）：
  //   - collapsed 顶圆当 !prev || prev.expanded、底圆当 !next || next.expanded、中段方角；
  //     expanded 恒四角圆（标题行顶圆 + 卡片底圆共享 section bg 一体成独立圆角块）。
  //   - 上边界：prev.collapsed && self.collapsed → border-t 分割线（段内紧贴）；否则（触及展开块）
  //     → mt-2 间距断开（分割线不穿过展开块）；首 section 无上边界。
  const sections: Array<{
    key: string;
    expanded: boolean;
    header: ReactNode;
    cards: ReactNode | null;
  }> = [];
  // 置顶分组：最前（无置顶卡片时整段不渲染，空隐藏）。标题行只折叠 toggle（▾/▸ + 📌 pin + 置顶），
  // 无 › 进项目、无 ⋯ 删除（非项目）。
  if (pinnedCandidates.length > 0) {
    sections.push({
      key: PINNED_GROUP_KEY,
      expanded: !pinnedCollapsed,
      header: (
        <div className="flex items-center gap-2 pl-3 pr-2">
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
      ),
      cards: (
        <div>
          <InstanceGrid
            dragAdapter={dragAdapter}
            dragRefs={new Map(pinnedCandidates.map((c) => [c.ref.sessionId, c.ref]))}
            items={pinnedCandidates.map(toGridItem)}
            plain
          />
        </div>
      ),
    });
  }
  // 项目分组：[左组：▾ 折叠 + 📁 项目名 flex-1 进入][➕ 新建二级菜单][🗑 删除]。左组（flex min-h-11
  // flex-1 items-center gap-1.5）复刻置顶紧凑结构——▾ size-4 紧贴 pl-3=12 + 紧挨 📁（gap-1.5=6），
  // 拆两个 button：▾ 折叠 / 📁名 进入（左组 div 无 onClick，避 portal fiber 冒泡）。空项目无折叠内容，
  // ▾ 位 size-4 占位 span 保持 📁 与有实例行对齐，仍保留 ➕/🗑。
  for (const group of groups) {
    const dragRefs = new Map<string, WorkbenchPanelRef>();
    for (const c of group.candidates) dragRefs.set(c.ref.sessionId, c.ref);
    const hasCards = group.candidates.length > 0;
    const isCollapsed = hasCards && !!collapsed[group.projectName];
    sections.push({
      key: group.projectName,
      expanded: hasCards && !isCollapsed,
      header: (
        <div className="flex items-center gap-2 pl-3 pr-2">
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5">
            {hasCards ? (
              <button
                aria-expanded={!isCollapsed}
                aria-label={t(
                  isCollapsed ? "workbench.expandProjectGroup" : "workbench.collapseProjectGroup",
                )}
                className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface touch:h-10"
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
              // 空项目：无折叠内容，▾ 位 size-4 占位（touch:h-10 随名 button 热区）保持 📁 与有实例行对齐。
              <span aria-hidden="true" className="size-4 shrink-0 touch:h-10" />
            )}
            {/* 名 button：左组内 flex-1 撑满 ▾ 外空间 = 点行主体进入项目；热区 min-h-11 ≥44px。 */}
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
          </div>
          <ProjectRowActions
            deletePending={deleteMutation.isPending}
            onDelete={() => void requestDelete(group.projectName)}
            projectName={group.projectName}
          />
        </div>
      ),
      cards: hasCards ? (
        <div>
          <InstanceGrid
            dragAdapter={dragAdapter}
            dragRefs={dragRefs}
            items={group.candidates.map(toGridItem)}
            plain
          />
        </div>
      ) : null,
    });
  }

  return (
    <div className="px-3 py-2">
      {sections.map((sec, i) => {
        const prev = sections[i - 1];
        const next = sections[i + 1];
        const topRound = sec.expanded || !prev || prev.expanded;
        const bottomRound = sec.expanded || !next || next.expanded;
        const upperDivider = !!prev && !prev.expanded && !sec.expanded;
        const upperGap = !!prev && !upperDivider;
        return (
          <section
            key={sec.key}
            className={cn(
              "flex flex-col bg-surface-raised",
              sec.expanded
                ? "rounded-lg"
                : cn(topRound && "rounded-t-lg", bottomRound && "rounded-b-lg"),
              upperDivider && "border-t border-on-surface/5",
              upperGap && "mt-2",
            )}
          >
            {sec.header}
            {sec.expanded ? sec.cards : null}
          </section>
        );
      })}
      {confirmHolder}
    </div>
  );
}
