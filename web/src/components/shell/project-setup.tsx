import type { FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createProject } from "../../api/client";
import { useT } from "../../i18n";
import { IconMarker, ShellInput } from "./shell-primitives";
import { ShellPanel } from "./shell-layout";

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

type ProjectSetupPanelProps = {
  createError: Error | null;
  inputId: string;
  isPending: boolean;
  projectPath: string;
  onProjectPathChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/**
 * 创建/采用项目表单（设计文档 §3）。从 HomeRoute 抽出，HomeRoute 桌面 overlay 与左栏
 * 「+ 新建项目」overlay 共用。表单 = 标题 + 说明 + folder input + 创建按钮 + hint + 错误。
 */
export function ProjectSetupPanel({
  createError,
  inputId,
  isPending,
  onProjectPathChange,
  onSubmit,
  projectPath,
}: ProjectSetupPanelProps) {
  const { t } = useT();
  return (
    <ShellPanel density="default">
      <div className="flex min-w-0 items-start gap-3">
        <IconMarker size="sm" tone="muted">
          +
        </IconMarker>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-on-surface">{t("home.setupTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-on-surface-muted">{t("home.setupDesc")}</p>
        </div>
      </div>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
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
      <p className="mt-3 text-xs leading-5 text-on-surface-muted">{t("home.setupHint")}</p>
      {createError ? (
        <p className="mt-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {createError.message}
        </p>
      ) : null}
    </ShellPanel>
  );
}
