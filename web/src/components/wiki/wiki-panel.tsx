import { useState } from "react";

import { useT } from "../../i18n";
import { WIKI_QUERY_SCOPE, useWikiIndex, useWikiPage } from "../../hooks/wiki";
import {
  ActionButton,
  IconMarker,
  ListGroup,
  ListRow,
  ListRowSkeleton,
} from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import { ResourceStatePanel } from "../files/file-browser";
import { MarkdownString } from "../markdown/MarkdownString";

type WikiPanelProps = {
  projectName: string;
};

/**
 * wiki 知识库面板（middle tab [wiki]，与 files/git/pages 同构 inspection，只读 consumer）。
 * 列表态：useWikiIndex 取页面摘要，行点击切到详情态（selectedSlug）。
 * 详情态：useWikiPage 取 { frontmatter, body }，头部显示 title/tags/updated，正文用 MarkdownString 渲染。
 * 写入由 agent 经 MCP wiki_* 工具完成，本面板只读浏览。UI=f(state)：列表与详情都从 query 派生。
 */
export function WikiPanel({ projectName }: WikiPanelProps) {
  const { t } = useT();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const index = useWikiIndex(projectName, WIKI_QUERY_SCOPE);

  if (selectedSlug !== null) {
    return (
      <WikiPageDetail
        projectName={projectName}
        slug={selectedSlug}
        onBack={() => setSelectedSlug(null)}
      />
    );
  }

  if (index.isLoading) {
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

  if (index.error) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start p-4 pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel
            message={index.error.message}
            tone="danger"
            title={t("wiki.loadFailed")}
          />
        </div>
      </div>
    );
  }

  const pages = index.data?.pages ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
        {pages.length === 0 ? (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-2 lg:justify-center lg:pt-0">
            <div className="w-full lg:w-auto">
              <ResourceStatePanel message={t("wiki.emptyDesc")} title={t("wiki.emptyTitle")} />
            </div>
          </div>
        ) : (
          <ListGroup ariaLabel={t("wiki.panelAria")}>
            {pages.map((page) => (
              <ListRow
                key={page.slug}
                marker={
                  <IconMarker size="sm" tone="muted">
                    <ShellIcon className="h-4 w-4" name="pages-nav" />
                  </IconMarker>
                }
                meta={<span className="text-[0.68rem] text-on-surface-muted">{page.updated}</span>}
                onClick={() => setSelectedSlug(page.slug)}
                subtitle={
                  page.tags.length > 0 ? (
                    <span className="font-mono text-[0.72rem] text-on-surface-muted">
                      {page.tags.join(", ")}
                    </span>
                  ) : undefined
                }
                title={<span className="text-[0.82rem]">{page.title}</span>}
              />
            ))}
          </ListGroup>
        )}
      </div>
    </div>
  );
}

type WikiPageDetailProps = {
  projectName: string;
  slug: string;
  onBack: () => void;
};

function WikiPageDetail({ projectName, slug, onBack }: WikiPageDetailProps) {
  const { t } = useT();
  const page = useWikiPage(projectName, slug, WIKI_QUERY_SCOPE);

  if (page.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
          <ListRowSkeleton count={2} />
        </div>
      </div>
    );
  }

  if (page.error || !page.data) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start p-4 pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel
            message={page.error?.message ?? t("wiki.pageMissing")}
            tone="danger"
            title={t("wiki.loadFailed")}
          />
          <div className="mt-3 flex justify-center">
            <ActionButton onClick={onBack}>{t("wiki.backToList")}</ActionButton>
          </div>
        </div>
      </div>
    );
  }

  const { frontmatter, body } = page.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-line/40 px-3 py-2.5">
        <ActionButton compact onClick={onBack}>
          {t("wiki.backToList")}
        </ActionButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-on-surface">{frontmatter.title}</p>
          <p className="truncate text-[0.68rem] text-on-surface-muted">
            {frontmatter.updated}
            {frontmatter.tags.length > 0 ? ` · ${frontmatter.tags.join(", ")}` : ""}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3">
        <MarkdownString text={body} />
      </div>
    </div>
  );
}
