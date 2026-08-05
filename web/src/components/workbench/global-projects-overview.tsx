import { type FormEvent, useId, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useT } from "../../i18n";
import {
  mergeProjectsWithCandidates,
  type WorkbenchPanelRef,
  workbenchProjectGroupsCollapsedAtom,
} from "../../routes/workbench-model";
import { deleteProject } from "../../api/client";
import { useConfirm } from "../shell/confirm-dialog";
import { actionButtonClasses } from "../shell/shell-primitives";
import { ProjectSetupPanel, useCreateProject } from "../shell/project-setup";
import { Dialog, DialogContent } from "../ui/dialog";
import { ActionMenu, useRowContextMenu } from "../ui/action-menu";
import { ShellIcon } from "../shell/icons";
import { MobileFab } from "../shell/mobile-fab";
import {
  candidateToGridItem,
  CardGridSkeleton,
  type DragSourceAdapter,
  type GridItemCallbacks,
  InstanceGrid,
  useCloseSession,
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
 * 项目标题行（2026-08-06 手风琴化 = ▾/▸ 折叠 toggle + 📁 项目名 + › 进项目 + ⋯ 删除）作
 * section header 分割，组内 InstanceGrid plain 连续单列卡片（无圆角 section 边框/bg、无
 * carousel 分页），含空项目只显标题行。ViewSwitcher 下线。
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

  // empty/loading gate：融合视图以 projectNames 为准（含空项目标题行，无项目才算空）。
  // projectNames 与 candidates 同源 `/api/overview`，统一用 isLoaded（success-only：data 就绪）；
  // 请求失败时 isLoaded=false → 显示骨架（与原 projects query 行为一致，不退化为空态）。
  const overviewEmpty = isLoaded && projectNames.length === 0;
  const overviewLoading = !isLoaded && projectNames.length === 0;

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

type GroupedProjectsListProps = {
  candidates: ReturnType<typeof useGlobalInstanceCandidates>["candidates"];
  projectNames: string[];
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
 * topSeparator 画 inset 分割线，两端统一 left-15=60px 跳过 marker 列）。根 `px-3 py-2` + section 间
 * space-y-2(8px)。
 */
function GroupedProjectsList({
  candidates,
  projectNames,
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
  const ctx = useRowContextMenu();
  const [collapsed, setCollapsed] = useAtom(workbenchProjectGroupsCollapsedAtom);
  const toggleProject = (name: string) =>
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));

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
      {groups.map((group) => {
        const dragRefs = new Map<string, WorkbenchPanelRef>();
        for (const c of group.candidates) dragRefs.set(c.ref.sessionId, c.ref);
        const hasCards = group.candidates.length > 0;
        const isCollapsed = hasCards && !!collapsed[group.projectName];
        return (
          <section key={group.projectName}>
            <div
              className="flex items-center gap-2 pl-3 pr-2"
              onContextMenu={(e) => ctx.openAt(group.projectName, e)}
            >
              {hasCards ? (
                // 折叠 toggle：▾/▸ + 📁 项目名，tap 折叠/展开（热区 min-h-11 ≥44px）。
                <button
                  aria-expanded={!isCollapsed}
                  className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-0 text-left transition hover:bg-on-surface/5"
                  onClick={() => toggleProject(group.projectName)}
                  title={group.projectName}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="size-4 shrink-0 text-on-surface-muted/60"
                    fill="none"
                    viewBox="0 0 16 16"
                  >
                    <path
                      d={isCollapsed ? "M6 4l4 4-4 4" : "M4 6l4 4 4-4"}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    />
                  </svg>
                  <ShellIcon className="size-5 shrink-0 text-on-surface-muted" name="project" />
                  <span className="truncate text-base font-semibold text-on-surface">
                    {group.projectName}
                  </span>
                </button>
              ) : (
                // 空项目：无可折叠内容，主区非按钮；▾ 位 size-4 占位保持 📁 图标与有实例行对齐。
                <div className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 px-0">
                  <span aria-hidden="true" className="size-4 shrink-0" />
                  <ShellIcon className="size-5 shrink-0 text-on-surface-muted" name="project" />
                  <span className="truncate text-base font-semibold text-on-surface">
                    {group.projectName}
                  </span>
                </div>
              )}
              {/* 独立 › 进项目按钮（镜像 ⋯ 尺寸/样式；touch 放大 44px）。 */}
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
              <ActionMenu
                align="end"
                cancelLabel={t("cancel")}
                contextMenuPoint={ctx.pointFor(group.projectName)}
                items={[
                  {
                    label: t("project.deleteProject"),
                    icon: <ShellIcon name="trash" />,
                    onSelect: () => void requestDelete(group.projectName),
                    variant: "destructive",
                    disabled: deleteMutation.isPending,
                  },
                ]}
                onContextMenuClose={ctx.close}
                trigger={
                  <button
                    aria-label={t("session.actions")}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface touch:h-10 touch:w-10"
                    type="button"
                  >
                    <ShellIcon className="h-4 w-4" name="ellipsis" />
                  </button>
                }
              />
            </div>
            {hasCards && !isCollapsed ? (
              <div>
                <InstanceGrid
                  dragAdapter={dragAdapter}
                  dragRefs={dragRefs}
                  items={group.candidates.map((c) => candidateToGridItem(c, callbacks))}
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
