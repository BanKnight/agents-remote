import { type FormEvent, useId, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import {
  filterWorkbenchViews,
  isGroupedProjectCollapsed,
  mergeProjectsWithCandidates,
  type WorkbenchPanelRef,
  type WorkbenchView,
  workbenchGroupedCollapsedAtom,
  workbenchViewAtom,
} from "../../routes/workbench-model";
import { deleteProject, listProjects } from "../../api/client";
import { useConfirm } from "../shell/confirm-dialog";
import { actionButtonClasses, ViewSwitcher } from "../shell/shell-primitives";
import { ProjectSetupPanel, useCreateProject } from "../shell/project-setup";
import { Dialog, DialogContent } from "../ui/dialog";
import { ActionMenu } from "../ui/action-menu";
import { ShellIcon } from "../shell/icons";
import {
  candidateToGridItem,
  candidateToTableRow,
  CardGridSkeleton,
  GroupedProjectsSkeleton,
  type DragSourceAdapter,
  type GridItemCallbacks,
  InstanceGrid,
  type TableRowCallbacks,
  useCloseSession,
  useGlobalInstanceCandidates,
  useRenameSession,
  VIEW_LABEL_KEY,
} from "./instance-area";
import { SessionTable, type TableColumn } from "./workbench-table";

type GlobalProjectsOverviewProps = {
  /** 单击实例 → 进聚焦态（桌面 WorkbenchContent focusInstance；移动 navigateWorkbench）。 */
  onFocusInstance: (sessionId: string) => void;
  /** 桌面拖放源；移动不传。 */
  dragAdapter?: DragSourceAdapter;
  /** 滚动区额外 class（移动 `pb-24 lg:pb-0` 避让底部胶囊）。 */
  contentClassName?: string;
  /**
   * 总览视图。桌面传 URL/atom 解析值 + onViewChange（写 URL+atom）；
   * 移动不传 → 组件内读/写 workbenchViewAtom。
   */
  view?: WorkbenchView;
  onViewChange?: (next: WorkbenchView) => void;
};

/**
 * global [项目] 总览共享主体（批 F / 决策 29）。桌面左栏 + 移动 [项目] 胶囊共用，
 * 结束「两端各自改各自」双写。自持 candidates/projects/create/delete/close/rename/view；
 * 参数化仅 onFocusInstance / dragAdapter? / contentClassName? / view+onViewChange?。
 *
 * 外壳（标题、底部 nav）由调用方提供：桌面 WorkbenchShell leftPanelTitle；
 * 移动 MobilePageHeader。
 */
export function GlobalProjectsOverview({
  onFocusInstance,
  dragAdapter,
  contentClassName,
  view: viewProp,
  onViewChange,
}: GlobalProjectsOverviewProps) {
  const { t } = useT();
  const inputId = useId();
  const [setupOpen, setSetupOpen] = useState(false);
  const { close, holder: closeHolder } = useCloseSession();
  const { rename, holder: renameHolder } = useRenameSession();
  const { candidates, isLoaded } = useGlobalInstanceCandidates({ kind: "global" });
  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const projectNames = projects.data?.projects.map((p) => p.name) ?? [];
  const { create: createProject, projectPath, setProjectPath } = useCreateProject();
  const [atomView, setAtomView] = useAtom(workbenchViewAtom);

  const viewOptions = useMemo(
    () =>
      filterWorkbenchViews({ kind: "global" }).map((v) => ({
        id: v,
        label: t(VIEW_LABEL_KEY[v]),
      })),
    [t],
  );
  // 有 prop 用 prop（桌面 URL 维）；否则 atom（移动）。不在 options 内 → 回退 grid。
  const rawView = viewProp ?? atomView;
  const resolvedView: WorkbenchView = viewOptions.some((opt) => opt.id === rawView)
    ? rawView
    : "grid";
  const handleViewChange = (next: WorkbenchView) => {
    if (onViewChange) onViewChange(next);
    else setAtomView(next);
  };

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
  const gridCallbacks: GridItemCallbacks = {
    onClose: closeInstance,
    onRename: renameInstance,
    onSelect: onFocusInstance,
    t,
  };
  const tableCallbacks: TableRowCallbacks = {
    onClose: closeInstance,
    onSelect: onFocusInstance,
    t,
  };
  const gridItems = useMemo(
    () => candidates.map((c) => candidateToGridItem(c, gridCallbacks)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, t],
  );
  const tableRows = useMemo(
    () => candidates.map((c) => candidateToTableRow(c, tableCallbacks)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, t],
  );
  const gridDragRefs = useMemo(() => {
    const m = new Map<string, WorkbenchPanelRef>();
    for (const c of candidates) m.set(c.ref.sessionId, c.ref);
    return m;
  }, [candidates]);
  const tableColumns: TableColumn[] = ["name", "project", "activity", "actions"];

  // empty/loading gate（决策 28/29）：grouped 以 projects 列表为准；grid/table 看 candidates。
  const projectsLoaded = projects.data !== undefined && !projects.isLoading;
  const overviewEmpty =
    resolvedView === "grouped"
      ? projectsLoaded && projectNames.length === 0
      : isLoaded && candidates.length === 0;
  const overviewLoading =
    resolvedView === "grouped"
      ? !projectsLoaded && projectNames.length === 0
      : !isLoaded && candidates.length === 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPath = projectPath.trim();
    if (trimmedPath.length === 0 || createProject.isPending) return;
    createProject.mutate(trimmedPath);
  };
  const setupVisible = setupOpen || createProject.isPending || createProject.error instanceof Error;

  const body = overviewLoading ? (
    resolvedView === "grouped" ? (
      <GroupedProjectsSkeleton />
    ) : (
      <div className="px-3 py-2">
        <CardGridSkeleton plain={resolvedView === "grid"} />
      </div>
    )
  ) : overviewEmpty ? (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <p className="text-sm text-on-surface-muted">{t("workbench.globalOverviewEmpty")}</p>
    </div>
  ) : resolvedView === "grouped" ? (
    <GroupedProjectsList
      candidates={candidates}
      dragAdapter={dragAdapter}
      onClose={closeInstance}
      onFocus={onFocusInstance}
      onRename={renameInstance}
      projectNames={projectNames}
    />
  ) : resolvedView === "table" ? (
    <SessionTable columns={tableColumns} rows={tableRows} t={t} />
  ) : (
    <div className="px-3 py-2">
      <InstanceGrid dragAdapter={dragAdapter} dragRefs={gridDragRefs} items={gridItems} plain />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-on-surface/5 px-2 py-1.5">
        <button
          aria-label={t("home.createProjectAria")}
          className={actionButtonClasses({ tone: "accent" })}
          onClick={() => setSetupOpen(true)}
          type="button"
        >
          {t("workbench.createMenu")}
        </button>
        <div className="ml-auto">
          <ViewSwitcher
            ariaLabel={t("workbench.viewSwitcher")}
            onChange={handleViewChange}
            view={resolvedView}
            views={viewOptions}
          />
        </div>
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto ${contentClassName ?? ""}`}>{body}</div>
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
 * grouped 唯一实现（批 F / 决策 29 + 批 H / 决策 31）：mergeProjectsWithCandidates 含空项目；
 * 项目名行 = [项目名单击进项目][⋯ 删除]（单一主操作进入）；实例区小标题 = ▼/▶ N 实例（点折叠/展开，
 * 仅 N>0）；空项目无小标题无折叠。单 collapsed 名单（默认展开），空项目永不折叠。
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
  const [collapsed, setCollapsed] = useAtom(workbenchGroupedCollapsedAtom);
  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
  const groups = useMemo(
    () => mergeProjectsWithCandidates(projectNames, candidates),
    [projectNames, candidates],
  );
  const callbacks: GridItemCallbacks = { onClose, onRename, onSelect: onFocus, t };

  const toggleGroup = (name: string) => {
    setCollapsed((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
  };
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
    <div className="h-full">
      {groups.map((group) => {
        const isEmpty = group.candidates.length === 0;
        const collapsedNow = isGroupedProjectCollapsed(group.projectName, collapsed);
        const dragRefs = new Map<string, WorkbenchPanelRef>();
        for (const c of group.candidates) dragRefs.set(c.ref.sessionId, c.ref);
        return (
          <section key={group.projectName}>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <button
                className="flex min-w-0 flex-1 cursor-pointer items-center truncate rounded-md px-1 py-0.5 text-left text-xs font-semibold text-on-surface transition hover:bg-on-surface/5"
                onClick={() => enterProject(group.projectName)}
                title={group.projectName}
                type="button"
              >
                {group.projectName}
              </button>
              <ActionMenu
                align="end"
                cancelLabel={t("cancel")}
                items={[
                  {
                    label: t("project.deleteProject"),
                    icon: <ShellIcon name="trash" />,
                    onSelect: () => void requestDelete(group.projectName),
                    variant: "destructive",
                    disabled: deleteMutation.isPending,
                  },
                ]}
                trigger={
                  <button
                    aria-label={t("session.actions")}
                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
                    type="button"
                  >
                    <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 16 16">
                      <circle cx="4" cy="8" r="1" fill="currentColor" />
                      <circle cx="8" cy="8" r="1" fill="currentColor" />
                      <circle cx="12" cy="8" r="1" fill="currentColor" />
                    </svg>
                  </button>
                }
              />
            </div>
            {isEmpty ? (
              <div className="px-4 py-2 text-xs text-on-surface-muted">
                {t("workbench.groupedProjectEmpty")}
              </div>
            ) : (
              <>
                <button
                  aria-expanded={!collapsedNow}
                  aria-label={t("workbench.toggleGroup")}
                  className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
                  onClick={() => toggleGroup(group.projectName)}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className={`size-3 shrink-0 transition-transform ${collapsedNow ? "" : "rotate-90"}`}
                    fill="none"
                    viewBox="0 0 16 16"
                  >
                    <path
                      d="M6 4l4 4-4 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    />
                  </svg>
                  <span>
                    {t("workbench.groupedInstanceCount", { count: group.candidates.length })}
                  </span>
                </button>
                {!collapsedNow ? (
                  <InstanceGrid
                    dragAdapter={dragAdapter}
                    dragRefs={dragRefs}
                    gap={false}
                    items={group.candidates.map((c) => candidateToGridItem(c, callbacks))}
                    plain
                  />
                ) : null}
              </>
            )}
          </section>
        );
      })}
      {confirmHolder}
    </div>
  );
}
