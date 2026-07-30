import { useState } from "react";

import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";
import type { PagesRoot, PagesRootAuth } from "@agents-remote/shared";

import { useT } from "../../i18n";
import { Dialog, DialogContent } from "../ui/dialog";
import { ActionButton, SegmentedControl, shellSurfaceClasses } from "../shell/shell-primitives";

type PagesRootDialogProps = {
  /** 编辑模式预填根；undefined = 新增。 */
  initial?: PagesRoot;
  submitting?: boolean;
  /** 服务端校验失败等错误信息（fetchJson 抛出的 Error.message）；undefined 不显错误条。 */
  error?: string;
  onSubmit: (root: PagesRoot) => void;
  onClose: () => void;
};

const inputClassName =
  "mt-1.5 w-full rounded-lg border border-neutral-line bg-surface-inset px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-muted/60 focus:border-primary focus:outline-none";
const labelClassName = "block text-xs font-semibold text-on-surface-muted";
const helpClassName = "mt-1 text-xs leading-5 text-on-surface-muted/80";

/**
 * pages 单个根的新增/编辑表单（Dialog）。desktop 居中卡片 / mobile 底部 sheet（与 prompt-dialog
 * 同设计语言）。urlPath/fsDir 文本输入 + auth 二选一 SegmentedControl。提交前本地非空校验，
 * 服务端校验（urlPath 冲突等）失败由 error 透传显示，dialog 保持打开。
 */
export function PagesRootDialog({
  initial,
  submitting = false,
  error,
  onSubmit,
  onClose,
}: PagesRootDialogProps) {
  const { t } = useT();
  const isMobile = useIsMobile();
  const [urlPath, setUrlPath] = useState(initial?.urlPath ?? "/");
  const [fsDir, setFsDir] = useState(initial?.fsDir ?? "");
  const [auth, setAuth] = useState<PagesRootAuth>(initial?.auth ?? "public");

  const title = initial ? t("pages.dialogTitleEdit") : t("pages.dialogTitleAdd");

  const submit = () => {
    if (urlPath.trim().length === 0 || fsDir.trim().length === 0 || submitting) return;
    onSubmit({ urlPath: urlPath.trim(), fsDir: fsDir.trim(), auth });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const authOptions = [
    { value: "public" as const, label: t("pages.authPublic") },
    { value: "token" as const, label: t("pages.authToken") },
  ];

  // 字段块（urlPath/fsDir 输入 + auth 分段 + 帮助文本 + 错误条）—— desktop/mobile 共用。
  const formBody = (
    <div className="flex flex-col gap-3">
      <div>
        <label className={labelClassName} htmlFor="pages-root-urlPath">
          {t("pages.urlPath")}
        </label>
        <input
          autoFocus
          className={inputClassName}
          id="pages-root-urlPath"
          onKeyDown={onKeyDown}
          onChange={(e) => setUrlPath(e.target.value)}
          placeholder={t("pages.urlPathPlaceholder")}
          type="text"
          value={urlPath}
        />
        <p className={helpClassName}>{t("pages.urlPathHelp")}</p>
      </div>
      <div>
        <label className={labelClassName} htmlFor="pages-root-fsDir">
          {t("pages.fsDir")}
        </label>
        <input
          className={inputClassName}
          id="pages-root-fsDir"
          onKeyDown={onKeyDown}
          onChange={(e) => setFsDir(e.target.value)}
          placeholder={t("pages.fsDirPlaceholder")}
          type="text"
          value={fsDir}
        />
        <p className={helpClassName}>{t("pages.fsDirHelp")}</p>
      </div>
      <div>
        <span className={labelClassName}>{t("pages.auth")}</span>
        <div className="mt-1.5">
          <SegmentedControl
            ariaLabel={t("pages.auth")}
            onChange={setAuth}
            options={authOptions}
            value={auth}
          />
        </div>
      </div>
      {error ? <p className="text-xs leading-5 text-error">{error}</p> : null}
    </div>
  );

  const saveLabel = submitting ? t("pages.saving") : t("pages.save");
  const saveButton = (variant: "desktop" | "mobile") => {
    if (variant === "mobile") {
      return (
        <button
          className={`flex min-h-[48px] w-full items-center justify-center rounded-xl text-sm font-semibold text-primary transition active:bg-on-surface/5 ${shellSurfaceClasses.workspace} disabled:opacity-50`}
          disabled={submitting}
          onClick={submit}
          type="button"
        >
          {saveLabel}
        </button>
      );
    }
    return (
      <ActionButton disabled={submitting} onClick={submit} tone="accent">
        {saveLabel}
      </ActionButton>
    );
  };

  if (isMobile) {
    return (
      <Dialog defaultOpen onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className={cn(
            "fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-x-0 translate-y-0 rounded-t-xl border-t border-neutral-line bg-surface-raised px-2 pt-2",
            "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
            "shadow-2xl shadow-black/40",
            "slide-in-from-bottom duration-200 ease-out",
          )}
        >
          <div className="flex flex-col gap-2">
            <div className={`rounded-xl px-4 py-3 ${shellSurfaceClasses.workspace}`}>
              <h2 className="mb-1 text-base font-semibold text-on-surface">{title}</h2>
              {formBody}
            </div>
            {saveButton("mobile")}
            <button
              className={`flex min-h-[48px] w-full items-center justify-center rounded-xl text-sm font-semibold text-on-surface-muted transition active:bg-on-surface/5 ${shellSurfaceClasses.workspace}`}
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              {t("cancel")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog defaultOpen onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div
          className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <h2 className="text-base font-semibold text-on-surface">{title}</h2>
          <div className="mt-3">{formBody}</div>
          <div className="mt-5 flex justify-end gap-3">
            <ActionButton disabled={submitting} onClick={onClose} tone="muted">
              {t("cancel")}
            </ActionButton>
            {saveButton("desktop")}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
