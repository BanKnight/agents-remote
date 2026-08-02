import { useState } from "react";
import type { PagesRoot } from "@agents-remote/shared";

import { useT } from "../../i18n";
import { pagesServeUrl } from "../../api/client";
import { PAGES_QUERY_SCOPE, usePagesConfig, useUpdatePagesConfig } from "../../hooks/pages";
import {
  ActionButton,
  IconMarker,
  ListGroup,
  ListRow,
  ListRowSkeleton,
} from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import { MobileFab } from "../shell/mobile-fab";
import { ResourceStatePanel } from "../files/file-browser";
import { useConfirm } from "../shell/confirm-dialog";
import { PagesRootDialog } from "./pages-root-dialog";

type PagesPanelProps = {
  projectName: string;
};

type EditingRoot = { mode: "add" } | { mode: "edit"; root: PagesRoot };

/**
 * pages 静态根配置面板（middle tab [pages]，与 files/git 同构 inspection）。自带 getPagesConfig
 * query（PAGES_QUERY_SCOPE 隔离缓存），列出当前项目的静态根：每行 urlPath → fsDir + 访问权限
 * 徽标，行点击直达 serve URL（新标签），actions 编辑/删除。header [添加根] 开 PagesRootDialog
 *（整体 PUT 覆盖）。删除走共享 useConfirm。UI=f(state)：roots 从 query 派生，写经 mutation
 * invalidate 回 query，单一数据管道。
 */
export function PagesPanel({ projectName }: PagesPanelProps) {
  const { t } = useT();
  const config = usePagesConfig(projectName, PAGES_QUERY_SCOPE);
  const update = useUpdatePagesConfig(projectName, PAGES_QUERY_SCOPE);
  const { confirm, holder: confirmHolder } = useConfirm();
  const [editing, setEditing] = useState<EditingRoot | null>(null);

  const roots: PagesRoot[] = config.data?.config.roots ?? [];

  const openPreview = (root: PagesRoot) => {
    window.open(pagesServeUrl(projectName, root.urlPath), "_blank", "noopener,noreferrer");
  };

  const beginEdit = (next: EditingRoot) => {
    update.reset();
    setEditing(next);
  };

  // 提交单根：add → 追加；edit → 替换同 urlPath 根。整体 PUT 覆盖；成功关 dialog。
  const submitRoot = (root: PagesRoot) => {
    if (editing?.mode !== "add" && editing?.mode !== "edit") return;
    const next =
      editing.mode === "add"
        ? [...roots, root]
        : roots.map((r) => (r.urlPath === editing.root.urlPath ? root : r));
    update.mutate(next, { onSuccess: () => setEditing(null) });
  };

  const deleteRoot = async (root: PagesRoot) => {
    const ok = await confirm({
      title: t("pages.deleteConfirmTitle"),
      message: t("pages.deleteConfirmMessage", { urlPath: root.urlPath }),
      cancelLabel: t("cancel"),
      confirmLabel: t("pages.delete"),
      tone: "danger",
    });
    if (!ok) return;
    update.mutate(roots.filter((r) => r.urlPath !== root.urlPath));
  };

  if (config.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center justify-start border-b border-neutral-line/40 px-3.5 py-2.5"
        >
          <span className="skeleton-shimmer h-8 w-24 rounded-lg" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
          <ListRowSkeleton count={3} />
        </div>
      </div>
    );
  }

  if (config.error) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start p-4 pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel
            message={config.error.message}
            tone="danger"
            title={t("pages.loadFailed")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hidden shrink-0 items-center justify-start border-b border-neutral-line/40 px-3.5 py-2.5 lg:flex">
        <ActionButton
          className="hidden lg:inline-flex"
          compact
          onClick={() => beginEdit({ mode: "add" })}
          tone="accent"
        >
          <span className="inline-flex items-center gap-1">
            <ShellIcon className="h-3.5 w-3.5" name="plus" />
            {t("pages.addRoot")}
          </span>
        </ActionButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
        {roots.length === 0 ? (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-2 lg:justify-center lg:pt-0">
            <div className="w-full lg:w-auto">
              <ResourceStatePanel message={t("pages.emptyDesc")} title={t("pages.emptyTitle")} />
            </div>
          </div>
        ) : (
          <ListGroup ariaLabel={t("pages.panelAria")}>
            {roots.map((root) => (
              <ListRow
                actions={
                  <>
                    <button
                      aria-label={t("pages.edit")}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-primary/10 hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginEdit({ mode: "edit", root });
                      }}
                      type="button"
                    >
                      <ShellIcon className="h-4 w-4" name="edit" />
                    </button>
                    <button
                      aria-label={t("pages.delete")}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-error/10 hover:text-error"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteRoot(root);
                      }}
                      type="button"
                    >
                      <ShellIcon className="h-4 w-4" name="trash" />
                    </button>
                  </>
                }
                key={root.urlPath}
                marker={
                  <IconMarker size="sm" tone="muted">
                    <ShellIcon className="h-4 w-4" name="pages-nav" />
                  </IconMarker>
                }
                meta={
                  <span
                    className={`rounded-full bg-on-surface/5 px-2 py-0.5 text-[0.68rem] font-semibold ${root.auth === "token" ? "text-warning" : "text-on-surface-muted"}`}
                  >
                    {root.auth === "token" ? t("pages.authToken") : t("pages.authPublic")}
                  </span>
                }
                onClick={() => openPreview(root)}
                subtitle={<span className="font-mono text-[0.72rem]">→ {root.fsDir}</span>}
                title={<span className="font-mono text-[0.82rem]">{root.urlPath}</span>}
              />
            ))}
          </ListGroup>
        )}
      </div>
      {editing ? (
        <PagesRootDialog
          error={update.error?.message}
          initial={editing.mode === "edit" ? editing.root : undefined}
          onClose={() => {
            if (!update.isPending) setEditing(null);
          }}
          onSubmit={submitRoot}
          submitting={update.isPending}
        />
      ) : null}
      {confirmHolder}
      <MobileFab ariaLabel={t("pages.createAria")} onClick={() => beginEdit({ mode: "add" })} />
    </div>
  );
}
