import { type FormEvent, type ReactNode, useId, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProject, listProjects, listRootFiles } from "../../api/client";
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
  const queryClient = useQueryClient();
  const { t } = useT();
  const { create, projectPath, setProjectPath } = useCreateProject();
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPath = projectPath.trim();
    if (trimmedPath.length === 0 || create.isPending) return;
    create.mutate(trimmedPath);
  };
  // 08 pin②「采用 = 扫描已有目录（列出候选，勾选纳管）」：候选 = PROJECTS_ROOT 一级目录 −
  // 已纳管项目（客户端差集；/api/root/files 与 /api/projects 均为既有端点）。
  const sources = useQuery({
    enabled: open,
    queryFn: () => Promise.all([listRootFiles(), listProjects()]),
    queryKey: ["adoptable-sources", open],
  });
  const adoptables = useMemo(() => {
    const root = sources.data?.[0];
    const projects = sources.data?.[1];
    if (!root || !projects) return null;
    const managed = new Set(projects.projects.map((project) => project.name));
    return root.entries
      .filter((entry) => entry.type === "directory" && !managed.has(entry.name))
      .map((entry) => entry.name);
  }, [sources.data]);
  const adopt = useMutation({
    mutationFn: async (names: string[]) => {
      for (const name of names) {
        await createProject(name);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
      ]);
      setOpen(false);
    },
  });
  // setupVisible：open 或 pending 或 error 都保持 dialog 打开（error 时用户能看到错误信息）。
  const setupVisible = open || create.isPending || create.error instanceof Error;
  const panel = (
    <ProjectSetupPanel
      adoptables={adoptables}
      adoptError={adopt.error instanceof Error ? adopt.error : null}
      adoptPending={adopt.isPending}
      compact={isMobile}
      createError={create.error instanceof Error ? create.error : null}
      inputId={inputId}
      isPending={create.isPending}
      onAdopt={(names) => adopt.mutate(names)}
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
  /** 08 pin② 采用候选（PROJECTS_ROOT 一级 − 已纳管差集）；null = 数据未就绪。 */
  adoptables: string[] | null;
  adoptError: Error | null;
  adoptPending: boolean;
  /** 移动 sheet 形态（08）：隐藏标题区（.shd 承载标题）+ 去 Card 壳 + 单列表单。 */
  compact?: boolean;
  createError: Error | null;
  inputId: string;
  isPending: boolean;
  projectPath: string;
  onAdopt: (names: string[]) => void;
  onProjectPathChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/**
 * 创建/采用项目表单（设计文档 §3）。从 HomeRoute 抽出，桌面 Dialog 与移动 MobileSheet
 * （08）共用。表单 = 标题 + 说明 + folder input + 创建按钮 + hint + 错误；compact（移动
 * sheet 形态）隐藏标题区（sheet 的 .shd 承载标题）并去 Card 壳（避免与 .msheet 双层底/圆角）。
 */
export function ProjectSetupPanel({
  adoptables,
  adoptError,
  adoptPending,
  compact,
  createError,
  inputId,
  isPending,
  onAdopt,
  onProjectPathChange,
  onSubmit,
  projectPath,
}: ProjectSetupPanelProps) {
  const { t } = useT();
  // 08 pin② 二选一：新建 = 建目录并纳管；采用 = 扫描已有目录勾选纳管。
  const [mode, setMode] = useState<"create" | "adopt">("create");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
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

      <div className="segc" role="tablist">
        <button
          aria-selected={mode === "create"}
          className={mode === "create" ? "on" : ""}
          onClick={() => setMode("create")}
          role="tab"
          type="button"
        >
          {t("home.modeCreate")}
        </button>
        <button
          aria-selected={mode === "adopt"}
          className={mode === "adopt" ? "on" : ""}
          onClick={() => setMode("adopt")}
          role="tab"
          type="button"
        >
          {t("home.modeAdopt")}
        </button>
      </div>

      {mode === "create" ? (
        <>
          <form
            className={
              compact
                ? "mt-3 grid gap-3"
                : "mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
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
        </>
      ) : (
        <>
          <div className="mt-3 min-h-0 overflow-y-auto">
            {adoptables === null ? (
              <p className="py-2 text-sm text-on-surface-soft">{t("home.adoptLoading")}</p>
            ) : adoptables.length === 0 ? (
              <p className="py-2 text-sm text-on-surface-soft">{t("home.adoptEmpty")}</p>
            ) : (
              <div className="grid gap-1">
                {adoptables.map((name) => (
                  <label
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-on-surface hover:bg-neutral-line/40"
                    key={name}
                  >
                    <input
                      checked={selected.has(name)}
                      className="accent-primary"
                      onChange={() => toggle(name)}
                      type="checkbox"
                    />
                    {name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            className="mt-3 cursor-pointer rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-neutral-line disabled:text-on-surface-muted"
            disabled={selected.size === 0 || adoptPending}
            onClick={() => onAdopt([...selected])}
            type="button"
          >
            {adoptPending ? t("home.adopting") : t("home.adoptAction", { count: selected.size })}
          </button>
          {adoptError ? (
            <p className="mt-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              {adoptError.message}
            </p>
          ) : null}
        </>
      )}
    </ShellPanel>
  );
}
