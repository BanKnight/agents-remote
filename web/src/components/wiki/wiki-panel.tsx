import { useT } from "../../i18n";
import { WIKI_QUERY_SCOPE, useWikiPage } from "../../hooks/wiki";
import { ActionButton, ListRowSkeleton } from "../shell/shell-primitives";
import { ResourceStatePanel } from "../files/file-browser";
import { MarkdownString } from "../markdown/MarkdownString";

/**
 * Wiki 阅读详情态（第十二轮批次 3 从 WikiPanel 详情态提取为共享组件；WikiPanel 列表面板随
 * 注册表换 WikiToolPanel 退役删除，05e 行菜单已先迁移进共享 WikiToolPanel）。useWikiPage 取
 * { frontmatter, body }，头部显示 title/tags/updated，正文用 MarkdownString 渲染。
 * UI=f(state)：从 query 派生。消费方：注册表 WikiToolTab 详情态（右栏 Inspector / 移动
 * focus 态同一 render）。
 */
type WikiPageDetailProps = {
  projectName: string;
  slug: string;
  onBack: () => void;
};

export function WikiPageDetail({ projectName, slug, onBack }: WikiPageDetailProps) {
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
