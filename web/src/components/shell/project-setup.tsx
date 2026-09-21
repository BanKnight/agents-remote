import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProject } from "../../api/client";
import { useT } from "../../i18n";
import { useIsMobile } from "@/lib/use-is-mobile";
import { IconMarker, ShellInput } from "./shell-primitives";
import { ShellPanel } from "./shell-layout";
import { Dialog, DialogContent } from "../ui/dialog";
import { MobileSheet } from "./mobile-sheet";

/**
 * createProject mutation + 提交后导航（设计文档 §3）。HomeRoute 桌面 ShellHeaderSurface
 * 入口与左栏「+ 新建项目」入口共用此 hook：单一创建逻辑，避免两处复制 mutation/invalidate/
 * navigate。成功后 invalidate `["projects"]`（左栏/Home 列表）+ `["overview"]`（global 总览
 * grouped 视图含新空项目），并 navigate 到新项目。
 */
export function useCreateProject() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [projectPath, setProjectPath] = useState("");
  const create = useMutation({
    mutationFn: createProject,
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
      ]);
      await navigate({
        to: "/projects/$key",
        params: { key: response.project.name },
      });
    },
  });
  return { create, projectPath, setProjectPath };
}

/**
 * create 入口单源（设计文档 §3）。GlobalProjectsOverview 桌面「+ 新建项目」header 按钮与
 * 移动 MobileProjectsHome「+」/ 03l 切换 sheet newp 行共用此 hook：收敛 useCreateProject +
 * open 态 + ProjectSetupPanel，调用方只拿 { openCreate, dialog }。形态按端分流（M5-a 08
 * sheet 化）：桌面 = 居中 Dialog 卡片；移动 = 底部 MobileSheet（scrim/grab 关闭即取消）。
 * 成功后 invalidate ["projects"] + ["overview"] 并 navigate 到新项目（useCreateProject 内）。
 */
export function useCreateProjectDialog(): { openCreate: () => void; dialog: ReactNode } {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const { t } = useT();
  const { create, projectPath, setProjectPath } = useCreateProject();
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPath = projectPath.trim();
    if (trimmedPath.length === 0 || create.isPending) return;
    create.mutate(trimmedPath);
  };
  // setupVisible：open 或 pending 或 error 都保持 dialog 打开（error 时用户能看到错误信息）。
  const setupVisible = open || create.isPending || create.error instanceof Error;
  const panel = (
    <ProjectSetupPanel
      compact={isMobile}
      createError={create.error instanceof Error ? create.error : null}
      inputId={inputId}
      isPending={create.isPending}
      onProjectPathChange={setProjectPath}
      onSubmit={handleSubmit}
      projectPath={projectPath}
    />
  );
  const dialog = isMobile ? (
    <MobileSheet
      onOpenChange={(next) => !next && setOpen(false)}
      open={setupVisible}
      title={t("home.setupTitle")}
    >
      {panel}
    </MobileSheet>
  ) : (
    <Dialog open={setupVisible} onOpenChange={(next) => !next && setOpen(false)}>
      <DialogContent className="overflow-y-auto p-0">{panel}</DialogContent>
    </Dialog>
  );
  return { openCreate: () => setOpen(true), dialog };
}

type ProjectSetupPanelProps = {
  /** 移动 sheet 形态（08）：隐藏标题区（.shd 承载标题）+ 去 Card 壳 + 单列表单。 */
  compact?: boolean;
  createError: Error | null;
  inputId: string;
  isPending: boolean;
  projectPath: string;
  onProjectPathChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/**
 * 创建/采用项目表单（设计文档 §3）。从 HomeRoute 抽出，桌面 Dialog 与移动 MobileSheet
 * （08）共用。表单 = 标题 + 说明 + folder input + 创建按钮 + hint + 错误；compact（移动
 * sheet 形态）隐藏标题区（sheet 的 .shd 承载标题）并去 Card 壳（避免与 .msheet 双层底/圆角）。
 */
export function ProjectSetupPanel({
  compact,
  createError,
  inputId,
  isPending,
  onProjectPathChange,
  onSubmit,
  projectPath,
}: ProjectSetupPanelProps) {
  const { t } = useT();
  return (
    <ShellPanel
      className={compact ? "rounded-none border-0 bg-transparent p-0 shadow-none ring-0" : ""}
      density="default"
    >
      {compact ? null : (
        <div className="flex min-w-0 items-start gap-3">
          <IconMarker size="sm" tone="muted">
            +
          </IconMarker>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">{t("home.setupTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-on-surface-soft">{t("home.setupDesc")}</p>
          </div>
        </div>
      )}

      <form
        className={
          compact ? "grid gap-3" : "mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        }
        onSubmit={onSubmit}
      >
        <label className="min-w-0 text-sm font-medium text-on-surface-soft" htmlFor={inputId}>
          {t("home.folderLabel")}
          <ShellInput
            className="mt-2"
            id={inputId}
            placeholder={t("home.folderPlaceholder")}
            value={projectPath}
            onChange={(event) => onProjectPathChange(event.target.value)}
          />
        </label>
        <button
          className="cursor-pointer rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-neutral-line disabled:text-on-surface-muted"
          disabled={projectPath.trim().length === 0 || isPending}
          type="submit"
        >
          {isPending ? t("home.creating") : t("home.createAndEnter")}
        </button>
      </form>
      <p className="mt-3 text-xs leading-5 text-on-surface-soft">{t("home.setupHint")}</p>
      {createError ? (
        <p className="mt-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {createError.message}
        </p>
      ) : null}
    </ShellPanel>
  );
}
