import { type FormEvent, useId, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import {
  filterWorkbenchViews,
  mergeProjectsWithCandidates,
  type WorkbenchPanelRef,
  type WorkbenchView,
  workbenchViewAtom,
} from "../../routes/workbench-model";
import { deleteProject } from "../../api/client";
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
  InstancePagedCarousel,
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
 * 参数化仅 onFocusInstance / dragAdapter? / view+onViewChange?。
 *
 * 外壳（标题、底部 nav）由调用方提供：桌面 WorkbenchShell leftPanelTitle；
 * 移动 MobilePageHeader。
 */
export function GlobalProjectsOverview({
  onFocusInstance,
  dragAdapter,
  view: viewProp,
  onViewChange,
}: GlobalProjectsOverviewProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const inputId = useId();
  const [setupOpen, setSetupOpen] = useState(false);
  const { close, holder: closeHolder } = useCloseSession();
  const { rename, holder: renameHolder } = useRenameSession();
  const { candidates, projectNames, isLoaded } = useGlobalInstanceCandidates({ kind: "global" });
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
  const enterProject = (projectName: string) =>
    void navigate({ to: "/projects/$key", params: { key: projectName } });
  const gridCallbacks: GridItemCallbacks = {
    onClose: closeInstance,
    onRename: renameInstance,
    onSelect: onFocusInstance,
    t,
  };
  const tableCallbacks: TableRowCallbacks = {
    onClose: closeInstance,
    onEnterProject: enterProject,
    onRename: renameInstance,
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

  // empty/loading gate（决策 28/29）：grouped 以 projectNames 为准；grid/table 看 candidates。
  // projectNames 与 candidates 同源 `/api/overview`，统一用 isLoaded（success-only：data 就绪）；
  // 请求失败时 isLoaded=false → 显示骨架（与原 projects query 行为一致，不退化为空态）。
  const overviewEmpty =
    resolvedView === "grouped"
      ? isLoaded && projectNames.length === 0
      : isLoaded && candidates.length === 0;
  const overviewLoading =
    resolvedView === "grouped"
      ? !isLoaded && projectNames.length === 0
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
          className={actionButtonClasses({ compact: true, tone: "accent" })}
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
 * grouped 唯一实现（批 F / 决策 29 + 批 J / 决策 33 + 批 L / 决策 35）：mergeProjectsWithCandidates
 * 含空项目；项目名行 = [📁 项目名 text-base font-semibold + › chevron 整体 button 进项目（热区 min-h-11
 * ≥44px）][⋯ 删除 最右尽头]（名行 `pl-5 pr-7 lg:pl-2 lg:pr-2` + button `px-0 lg:px-1`，批 P / 决策 39 + 收尾 / 决策 40/41/43：移动端 carousel
 * peek 20px 把卡片右移，名行 `pl=peek=20`（决策 43 Apple full-bleed header 对齐 cell 左边缘）+ `pr=peek+8=28` 对齐 card action（决策 40 同列 section-right−28）+ button 移动去 px 让图标=card 边缘 / 桌面保 px-1 维持 marker↔icon；
 * **决策 35 marker↔icon 内容对齐在去边框（决策 38）+ 满宽（决策 42）后转 Apple full-bleed 边缘对齐**（移动 nameRow 内容=card 边缘 20 非 marker 32）；桌面 `lg:pl-2 lg:pr-2`=8px 零回归）。批 P 收尾 / 决策 40：⋯ 删除 button `flex size-9`→
 * `flex h-7 w-7 max-sm:h-10 max-sm:w-10` + 自定义 3-dot SVG→`ShellIcon ellipsis h-4 w-4`，与 InstanceCard
 * action 同尺寸同图标同源 → 图标中心均 button.cx 严格同列。实例区 = InstancePagedCarousel（每页最多 3 卡横向 swipe 翻页 + 桌面页码行，
 * 折叠废弃无小标题）。**section = `overflow-hidden lg:rounded-lg lg:border lg:border-neutral-line/40`**（批 L + 批 M + 批 O / 决策 38：移动无边框 Apple 列表范式，批 O；
 * 桌面 lg: 才加圆角边框成组——名行=header + 实例区=body 同一边框内；无 bg 透明融入 shell，border-neutral-line/40 半透明淡边——对齐同框 InstanceCard topSeparator inset 分割线，Apple hairline，批 M；实例区外层 `-mt-2`
 * 抵消首卡 InstanceCard p-3 top 收间距；根 `px-0 py-3 lg:px-3`（批 P 收尾 / 决策 42：移动去 px 让 section 贴屏幕、card 距两侧 = peek(20) 单一留白非 px-3+peek 双重叠加；桌面 lg:px-3 保持边框时代内边距；py-3 顶底不动）+ section 间 space-y-3(12px) 缩间距。空项目只名行（与有实例项目结构对称：都一行 header）。
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const groups = useMemo(
    () => mergeProjectsWithCandidates(projectNames, candidates),
    [projectNames, candidates],
  );
  const callbacks: GridItemCallbacks = { onClose, onRename, onSelect: onFocus, t };

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
    <div className="space-y-3 px-0 py-3 lg:px-3">
      {groups.map((group) => {
        const dragRefs = new Map<string, WorkbenchPanelRef>();
        for (const c of group.candidates) dragRefs.set(c.ref.sessionId, c.ref);
        return (
          <section
            className="overflow-hidden lg:rounded-lg lg:border lg:border-neutral-line/40"
            key={group.projectName}
          >
            <div className="flex items-center gap-2 pl-5 pr-7 lg:pl-2 lg:pr-2">
              <button
                className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-0 lg:px-1 text-left transition hover:bg-on-surface/5"
                onClick={() => enterProject(group.projectName)}
                title={group.projectName}
                type="button"
              >
                <ShellIcon className="size-5 shrink-0 text-on-surface-muted" name="project" />
                <span className="truncate text-base font-semibold text-on-surface">
                  {group.projectName}
                </span>
                <svg
                  aria-hidden="true"
                  className="size-5 shrink-0 text-on-surface-muted/60"
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
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface max-sm:h-10 max-sm:w-10"
                    type="button"
                  >
                    <ShellIcon className="h-4 w-4" name="ellipsis" />
                  </button>
                }
              />
            </div>
            {group.candidates.length === 0 ? null : (
              <div className="-mt-2">
                <InstancePagedCarousel
                  dragAdapter={dragAdapter}
                  dragRefs={dragRefs}
                  items={group.candidates.map((c) => candidateToGridItem(c, callbacks))}
                  plain
                  t={t}
                />
              </div>
            )}
          </section>
        );
      })}
      {confirmHolder}
    </div>
  );
}
