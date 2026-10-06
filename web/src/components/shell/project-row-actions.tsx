import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteProject, getProject, renameProject } from "@/api/client";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useT } from "../../i18n";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ShellIcon } from "./icons";
import { MobileSheet } from "./mobile-sheet";
import { shellSurfaceClasses } from "./shell-primitives";

/**
 * v1.5 §3.2 项目行操作单源（移动长按 / 桌面右键同构，容器不同）。
 *
 * - `ProjectRowMenu`：族A 锚定浮卡（12c/mac-project-row-menu），两端都锚定触发点下方、
 *   点外部收起、点按型无压暗。宽度两端异（移动 250px / 桌面 176px）是唯一的容器差。
 * - `ProjectRenameImpactDialog`：有活跃实例的重命名影响提醒（居中 Alert，两端同款）——
 *   「继续」后由 `useProjectRowFlow` 打开 RenameDialog（03w2 单源，预填项目名）。
 * - `ProjectDeleteDialog`：删除二次确认。内容层单源（三行影响 + ☐ 磁盘文件 + 主按钮随
 *   勾选升级），容器分流 = 移动贴底 sheet（project-delete 原型，✕ = 放弃并保留一切）/
 *   桌面居中 Alert（mac-project-row-menu 原型，宽端空间足）。
 * - `useProjectRowActions`：rename/delete mutation + invalidate 单源，两端调用方复用。
 * - `useProjectRowFlow`：重命名（影响提醒 → 预填输入）与删除（补拉路径 → 确认）的编排
 *   state 机单源，两端只留容器 JSX 与 scope 导航差异（回调）。
 */

/** 菜单项图标契约尺寸（原型 .ctx .row icon 17px / --ink-1；§15 svg 必须显式定尺寸）。 */
const ROW_ICON_CLASS = "size-[17px] shrink-0";

/** 菜单浮卡圆角（tokens radius/menu = 14px；PopoverContent 默认 16 覆写）。 */
const ROW_MENU_RADIUS_CLASS = "rounded-[14px]";

/** 菜单 open 期间触发行的高亮（原型 .ring：1.8px dashed --c-primary 圈住触发行；spec §5.0
 * 族A「长按型加 dim + 触发件高亮」——两原型此页无 dim，ring 即可）。两端行按钮共用。 */
export const PROJECT_ROW_TRIGGER_RING =
  "[outline:1.8px_dashed_var(--color-primary)] [outline-offset:-4px]";

function rowMenuButtonClasses(danger: boolean, divided: boolean): string {
  return [
    "flex h-[45px] w-full items-center gap-3 px-[18px] text-sm outline-none transition-colors",
    "active:bg-on-surface/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
    // 族A 标准档：行间 1px --sep 分隔（spec §5.0；--sep-row 暗色与菜单底同值会隐身）。
    divided ? "border-t border-neutral-line" : "",
    danger ? "font-semibold text-error" : "text-on-surface",
  ]
    .filter(Boolean)
    .join(" ");
}

export function ProjectRowMenu({
  anchor,
  onClose,
  onDelete,
  onOpen,
  onRename,
}: {
  /** 触发点视口坐标（长按/右键）；null = 关闭。 */
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  onDelete: () => void;
  /** 「打开」= 点行等效语义，调用方导航。 */
  onOpen: () => void;
  onRename: () => void;
}) {
  const { t } = useT();
  return (
    <>
      {anchor ? (
        <Popover open onOpenChange={(open) => !open && onClose()}>
          {/* 坐标锚定（ActionMenu contextMenuPoint 同法）：fixed size-0 零尺寸触发器 +
              sideOffset 6 = 原型「触发行下方 6px」。 */}
          <PopoverTrigger asChild>
            <div aria-hidden className="fixed size-0" style={{ left: anchor.x, top: anchor.y }} />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className={`w-[176px] overflow-hidden p-0 max-sm:w-[250px] ${ROW_MENU_RADIUS_CLASS}`}
            role="menu"
            side="bottom"
            sideOffset={6}
          >
            <button
              className={rowMenuButtonClasses(false, false)}
              role="menuitem"
              type="button"
              onClick={() => {
                onClose();
                onOpen();
              }}
            >
              <ShellIcon className={ROW_ICON_CLASS} name="project" />
              {t("projects.menuOpen")}
            </button>
            <button
              className={rowMenuButtonClasses(false, true)}
              role="menuitem"
              type="button"
              onClick={() => {
                onClose();
                onRename();
              }}
            >
              <ShellIcon className={ROW_ICON_CLASS} name="edit" />
              {t("projects.menuRename")}
            </button>
            <button
              className={rowMenuButtonClasses(true, true)}
              role="menuitem"
              type="button"
              onClick={() => {
                onClose();
                onDelete();
              }}
            >
              <ShellIcon className={ROW_ICON_CLASS} name="trash" />
              {t("projects.menuDelete")}
            </button>
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  );
}

/**
 * 重命名影响提醒（有活跃实例时先弹；「继续」→ flow 打开 RenameDialog 预填输入）。
 * 字号刻意与既有 RenameDialog 同档漂移（原型 .am 12.5/.af 16 vs text-xs/sm）——设计 review
 * P3 记档：两端一起改才不破单源，随 RenameDialog 收口统一。
 */
export function ProjectRenameImpactDialog({
  instanceCount,
  onContinue,
  onOpenChange,
  open,
  projectName,
  runningCount,
}: {
  instanceCount: number;
  onContinue: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** 标题携带项目名（原型 pin①；与删除侧 deleteTitle 对称）。 */
  projectName: string;
  runningCount: number;
}) {
  const { t } = useT();
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {/* 本仓 DialogContent 无表面（Content 即卡片视觉全靠内层）：内层拼 workspace surface
          （同 rename-dialog/confirm-dialog 族），否则透明卡浅深两态都不成立。 */}
      <DialogContent className="max-w-xs sm:max-w-xs">
        <div
          className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <DialogTitle className="text-base font-bold text-on-surface">
            {t("projects.renameTitle", { name: projectName })}
          </DialogTitle>
          <div className="mt-1.5 space-y-2 text-xs leading-relaxed text-on-surface-muted">
            <p>
              {t("projects.renameImpactClose", {
                running: runningCount,
                total: instanceCount,
              })}
            </p>
            <p>{t("projects.renameImpactKeep")}</p>
          </div>
          <div className="mt-3 flex border-t border-neutral-line">
            {/* 原型 project-rename：两键皆 --c-primary、.safe 仅取消加粗 700。 */}
            <button
              className="min-h-[44px] flex-1 text-sm font-bold text-primary transition active:bg-on-surface/5"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              {t("cancel")}
            </button>
            <button
              className="min-h-[44px] flex-1 border-l border-neutral-line text-sm text-primary transition active:bg-on-surface/5"
              onClick={() => {
                onOpenChange(false);
                onContinue();
              }}
              type="button"
            >
              {t("projects.renameContinue")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 删除确认内容层（双容器单源）：三行影响 + ☐ 磁盘文件（勾选后主按钮红色强警示）。
 * onCancel→onConfirm 语义修正（review）：携带 deleteFiles 的都是「确认执行」，放弃 = 纯关闭。
 */
function ProjectDeleteContent({
  instanceCount,
  onConfirm,
  projectPath,
  runningCount,
}: {
  instanceCount: number;
  onConfirm: (deleteFiles: boolean) => void;
  projectPath: string;
  runningCount: number;
}) {
  const { t } = useT();
  // 默认不勾 = 磁盘保留（移出管理）；勾选 = 显式销毁（主按钮文案/颜色升级）。
  const [deleteFiles, setDeleteFiles] = useState(false);
  return (
    <div className="flex flex-col gap-3 text-left">
      <div className="space-y-2 text-[13px] leading-relaxed text-on-surface">
        <p>{t("projects.deleteImpactClose", { running: runningCount, total: instanceCount })}</p>
        <p>{t("projects.deleteImpactHistory")}</p>
        <p>{t("projects.deleteImpactUnpin")}</p>
      </div>
      {/* 整行点按切换（原型 .ckrow .lb 整行热区 + py 6px；触屏点击区标准 ≥40px 高）。 */}
      <button
        aria-checked={deleteFiles}
        className="flex w-full items-start gap-2.5 py-2.5 text-left"
        role="checkbox"
        type="button"
        onClick={() => setDeleteFiles((v) => !v)}
      >
        <span
          aria-hidden
          className={`mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded border-[1.8px] ${
            deleteFiles ? "border-primary bg-primary" : "border-on-surface-muted"
          }`}
        >
          {deleteFiles ? <ShellIcon className="size-3 text-on-accent" name="check" /> : null}
        </span>
        <span className="text-[13px] font-semibold text-on-surface">
          {t("projects.deleteFilesLabel")}
        </span>
      </button>
      <p className="pl-[29px] font-mono text-[11px] leading-snug text-on-surface-muted">
        {projectPath}
      </p>
      <button
        className={`min-h-[44px] w-full rounded-lg text-[15px] font-semibold text-on-accent transition-[scale,background-color] active:scale-[0.98] ${
          deleteFiles ? "bg-error" : "bg-primary"
        }`}
        type="button"
        onClick={() => onConfirm(deleteFiles)}
      >
        {deleteFiles ? t("projects.deleteDestroy") : t("projects.deleteKeepFiles")}
      </button>
    </div>
  );
}

export function ProjectDeleteDialog({
  instanceCount,
  onConfirm,
  open,
  projectName,
  projectPath,
  runningCount,
}: {
  instanceCount: number;
  /** onConfirm(deleteFiles?)——布尔 = 确认执行；undefined = 放弃保留一切（✕/scrim/Esc 同）。 */
  onConfirm: (deleteFiles?: boolean) => void;
  open: boolean;
  projectName: string;
  projectPath: string;
  runningCount: number;
}) {
  const { t } = useT();
  const isMobile = useIsMobile();
  const closeButton = (
    <button
      aria-label={t("projects.deleteCloseAria")}
      className="text-on-surface-muted transition hover:text-on-surface"
      type="button"
      onClick={() => onConfirm(undefined)}
    >
      <ShellIcon className="size-4" name="close" />
    </button>
  );
  if (isMobile) {
    return (
      <MobileSheet
        ariaLabel={t("projects.deleteTitle", { name: projectName })}
        headerExtra={closeButton}
        onOpenChange={(o) => !o && onConfirm(undefined)}
        open={open}
        title={t("projects.deleteTitle", { name: projectName })}
      >
        {/* 不加内层水平 padding：.msheet 自带 20px 侧距（原型 .sheet padding 0 20px）。 */}
        <div className="pb-2">
          <ProjectDeleteContent
            instanceCount={instanceCount}
            onConfirm={onConfirm}
            projectPath={projectPath}
            runningCount={runningCount}
          />
        </div>
      </MobileSheet>
    );
  }
  return (
    <Dialog onOpenChange={(o) => !o && onConfirm(undefined)} open={open}>
      <DialogContent className="max-w-sm sm:max-w-sm">
        <div
          className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-on-surface">
              {t("projects.deleteTitle", { name: projectName })}
            </DialogTitle>
            {closeButton}
          </div>
          <ProjectDeleteContent
            instanceCount={instanceCount}
            onConfirm={onConfirm}
            projectPath={projectPath}
            runningCount={runningCount}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** rename/delete mutation 单源：成功失败都失效重拉（onSettled）——部分成功（服务端已生效
 * 但报错）时 UI 也反映真实磁盘态；错误经 mutation.error 由调用方呈现。 */
export function useProjectRowActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
  };
  const renameMutation = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => renameProject(from, to),
    onSettled: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: ({ deleteFiles, name }: { deleteFiles: boolean; name: string }) =>
      deleteProject(name, { deleteFiles }),
    onSettled: invalidate,
  });
  return { deleteMutation, renameMutation };
}

/** overview 聚合行（instance-area buildProjectRows 投影）的本 hook 消费面——结构子集，
 * 避免 shell → workbench 模块反向依赖。 */
type ProjectRowSummary = {
  instances: readonly unknown[];
  name: string;
  running: number;
};

/**
 * 项目行操作流转单源（v1.5 §3.2）：重命名（running>0 先影响提醒 → RenameDialog 预填）与
 * 删除（getProject 按需补磁盘路径 → ProjectDeleteDialog）的编排 state 机 + mutation。
 * 两端容器只渲染 dialog JSX；scope 导航兜底等容器差经 options 回调注入。
 *
 * 时序契约：「继续」= ProjectRenameImpactDialog 先 onOpenChange(false) 再 onContinue() 同步
 * 触发——closeImpact(false) 不清行（「继续」要靠行预填 RenameDialog），行统一在 RenameDialog
 * 关闭/提交后清；直接关提醒（Esc/scrim/取消）残留的行无任何呈现，下次 start 覆盖。
 */
export function useProjectRowFlow(
  options: {
    /** 重命名成功后回调（桌面：被改名项目是当前 scope 时导航新名）。 */
    onRenamed?: (from: string, to: string) => void;
    /** 删除成功后回调（桌面：被删项目是当前 scope 时退回 global）。 */
    onDeleted?: (name: string) => void;
  } = {},
) {
  const { deleteMutation, renameMutation } = useProjectRowActions();
  const [renameRow, setRenameRow] = useState<ProjectRowSummary | null>(null);
  const [renameImpactOpen, setRenameImpactOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  // 删除目标：overview 聚合行无磁盘路径，选中后 getProject 按需补拉（失败 = 空路径提示行，
  // 不阻断删除）。函数式更新 + name 比对：拉取期间关闭/换目标不复活旧态。
  const [deleteRow, setDeleteRow] = useState<(ProjectRowSummary & { path: string }) | null>(null);

  const startRename = (row: ProjectRowSummary) => {
    renameMutation.reset();
    deleteMutation.reset();
    setRenameRow(row);
    if (row.running > 0) setRenameImpactOpen(true);
    else setRenameDialogOpen(true);
  };
  const startDelete = (row: ProjectRowSummary) => {
    renameMutation.reset();
    deleteMutation.reset();
    setDeleteRow({ ...row, path: "" });
    getProject(row.name)
      .then((detail) => {
        setDeleteRow((current) =>
          current !== null && current.name === row.name
            ? { ...current, path: detail.project.path }
            : current,
        );
      })
      .catch(() => {});
  };
  const closeImpact = (continues: boolean) => {
    setRenameImpactOpen(false);
    if (continues) setRenameDialogOpen(true);
  };
  const closeRenameDialog = () => {
    setRenameDialogOpen(false);
    setRenameRow(null);
  };
  const submitRename = (newName: string) => {
    if (renameRow === null) return;
    const from = renameRow.name;
    renameMutation.mutate(
      { from, to: newName },
      { onSuccess: () => options.onRenamed?.(from, newName) },
    );
    closeRenameDialog();
  };
  const handleDeleteDialog = (deleteFiles?: boolean) => {
    if (deleteFiles === undefined) {
      setDeleteRow(null);
      return;
    }
    if (deleteRow === null) return;
    const name = deleteRow.name;
    deleteMutation.mutate({ deleteFiles, name }, { onSuccess: () => options.onDeleted?.(name) });
    setDeleteRow(null);
  };

  return {
    closeImpact,
    closeRenameDialog,
    deleteMutation,
    deleteRow,
    handleDeleteDialog,
    renameDialogOpen,
    renameImpactOpen,
    renameMutation,
    renameRow,
    startDelete,
    startRename,
    submitRename,
  };
}
