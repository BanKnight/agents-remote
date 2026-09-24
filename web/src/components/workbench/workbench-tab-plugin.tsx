import type { GitDiffScope, SessionType } from "@agents-remote/shared";
import { type ReactNode, useState } from "react";

import { FilesPanel } from "../files/file-browser";
import { PagesPanel } from "../pages/pages-panel";
import { WikiPageDetail } from "../wiki/wiki-panel";
import { useT } from "../../i18n";
import type { TranslateFn, TranslationKey } from "../../i18n/types";
import type { WorkbenchInspectionTab, WorkbenchMiddleTab } from "../../routes/workbench-model";
import { ActionButton } from "../shell/shell-primitives";
import { MobileL3FilePreview, MobileL3GitDiff } from "./mobile-l3";
import { FilesToolPanel, GitToolPanel, WikiToolPanel } from "./project-tool-panels";

/** Files inspection 的 query-key 隔离段（仅全局根目录浏览语境保留 FilesPanel；项目作用域
 * FilesToolPanel 走全局 files path key，见 project-tool-panels）。 */
const WORKBENCH_FILES_QUERY_SCOPE = "workbench-files";

/**
 * 工作台 tab 插件渲染上下文（设计文档 §6）。当前作用域 + 聚焦实例决定 tab 可见性与
 * 内容作用域。projectKey 为 null（全局作用域）时 Git 隐藏；Files 全局可见（根目录
 * = PROJECTS_ROOT 只读浏览，进入项目子目录后切项目作用域可写，见 FilesPanel rootBrowse）。
 */
export type WorkbenchTabPluginContext = {
  projectKey: string | null;
  focusId?: string;
  sessionType?: SessionType;
  /**
   * 受控当前路径（可选，仅 files plugin 消费）。透传 FilesToolPanel currentPath，让移动端
   * 父级（MobileFocusBody）持有 cwd 跨 tab 切换保活——切输出/git 再切回文件不再回根目录。
   * 右栏语境不传 = 组件内部 state（§13 回退语义见 FilesToolPanel）。
   */
  currentPath?: string;
  onPathChange?: (path: string) => void;
};

/**
 * 工作台 inspection tab 插件契约（设计文档 §6）。V1 仅编译期第一方注册（Files/Git），
 * 不实装外部插件 / marketplace。`when` 集中表达可见性（Git 全局隐、Files 全局显）；
 * render 由 RightPanelTabs / 中栏 visibleTabs / 移动 MobileFocusBody 在 active tab 时调用。
 */
export type WorkbenchTabPlugin = {
  id: WorkbenchInspectionTab;
  labelKey: TranslationKey;
  when: (ctx: WorkbenchTabPluginContext) => boolean;
  render: (ctx: WorkbenchTabPluginContext) => ReactNode;
};

/**
 * 栏内详情态返回条（详情态顶部返回控件）。WikiPageDetail 自带返回不消费。
 */
function DetailBackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="shrink-0 border-b border-neutral-line/40 px-3 py-2">
      <ActionButton compact onClick={onBack}>
        {label}
      </ActionButton>
    </div>
  );
}

/** 栏内 diff 详情目标（03r 详情形态：meta 行 + DiffContent）。 */
type DiffTarget = { path: string; scope: GitDiffScope };

/**
 * files tab 主体（第十二轮批次 3 双端装配：右栏 Inspector 与移动 focus 态同一 render）。
 * 列表态 = FilesToolPanel（双端共享三件套，03o 形态）；点文件 → 栏内预览（MobileL3FilePreview
 * 复用）、「查看 diff ›」/行菜单「在 Git 查看 diff」→ 栏内 diff（MobileL3GitDiff 复用）——
 * 04 insfoot「点文件 → 本栏预览 / diff」。局部 state 不进 URL，返回逐级（列表 → 预览 → diff）。
 */
function FilesToolTab({
  currentPath,
  onPathChange,
  projectKey,
}: {
  currentPath?: string;
  onPathChange?: (path: string) => void;
  projectKey: string;
}) {
  const { t } = useT();
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<DiffTarget | null>(null);

  if (diffTarget) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <DetailBackBar label={t("git.backToFiles")} onBack={() => setDiffTarget(null)} />
        <MobileL3GitDiff path={diffTarget.path} projectName={projectKey} scope={diffTarget.scope} />
      </div>
    );
  }
  if (previewPath !== null) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <DetailBackBar label={t("files.backToFiles")} onBack={() => setPreviewPath(null)} />
        <MobileL3FilePreview
          onViewDiff={() => setDiffTarget({ path: previewPath, scope: "worktree" })}
          path={previewPath}
          projectName={projectKey}
        />
      </div>
    );
  }
  return (
    <FilesToolPanel
      currentPath={currentPath}
      onOpenFile={(_projectName, path) => setPreviewPath(path)}
      onOpenGitFile={(f) => setDiffTarget({ path: f.path, scope: f.scope })}
      onPathChange={onPathChange}
      projectName={projectKey}
    />
  );
}

/**
 * git tab 主体（双端装配同 FilesToolTab）：列表态 = GitToolPanel（githead 态势行 + 工作区
 * 改动，03m 形态；右栏语境不传 onOpenCommit/onOpenHistory/onOpenBranches → 最近提交/links
 * 段不装配——无 commit/分支列表页承载，不伪造入口）；点改动行 → 栏内 diff 详情态。
 */
function GitToolTab({ projectKey }: { projectKey: string }) {
  const { t } = useT();
  const [target, setTarget] = useState<DiffTarget | null>(null);

  if (target) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <DetailBackBar label={t("git.backToFiles")} onBack={() => setTarget(null)} />
        <MobileL3GitDiff path={target.path} projectName={projectKey} scope={target.scope} />
      </div>
    );
  }
  return (
    <GitToolPanel
      onOpenGitFile={(f) => setTarget({ path: f.path, scope: f.scope })}
      projectName={projectKey}
    />
  );
}

/**
 * wiki tab 主体（双端装配同 FilesToolTab）：分组树列表态 = WikiToolPanel（03p 形态）；
 * 点页面行 → 栏内阅读态（WikiPageDetail，自带返回）。
 */
function WikiToolTab({ projectKey }: { projectKey: string }) {
  const [slug, setSlug] = useState<string | null>(null);

  if (slug !== null) {
    return <WikiPageDetail onBack={() => setSlug(null)} projectName={projectKey} slug={slug} />;
  }
  return <WikiToolPanel onOpenPage={setSlug} projectName={projectKey} />;
}

/**
 * 第一方工作台 tab 插件注册表（设计文档 §5、§6）。files/git/wiki 换双端共享三件套
 * （2026-09-24 第十二轮复验批次 3，多端同构：桌面右栏 RightPanelTabs、移动 MobileFocusBody、
 * 中栏 visibleTabs 同一 render；详情态组件 MobileL3FilePreview/MobileL3GitDiff/WikiPageDetail
 * 与移动 L3 详情页同一份，容器差异由装配层表达）。Files 全局可见（项目作用域 = FilesToolTab；
 * 全局根目录只读浏览保留 FilesPanel rootBrowse 语境——与 SessionDetailRoute agent-context、
 * 全局 /files 页同记档「后续评估合并」）；Git/pages/wiki 仅项目作用域（when）。
 */
export const WORKBENCH_TAB_PLUGINS: WorkbenchTabPlugin[] = [
  {
    id: "files",
    labelKey: "workbench.tabFiles",
    render: (ctx) =>
      ctx.projectKey ? (
        <FilesToolTab
          currentPath={ctx.currentPath}
          onPathChange={ctx.onPathChange}
          projectKey={ctx.projectKey}
        />
      ) : (
        <FilesPanel initialPath="" queryScope={WORKBENCH_FILES_QUERY_SCOPE} rootBrowse />
      ),
    when: () => true,
  },
  {
    id: "git",
    labelKey: "workbench.tabGit",
    render: (ctx) => (ctx.projectKey ? <GitToolTab projectKey={ctx.projectKey} /> : null),
    when: (ctx) => ctx.projectKey !== null,
  },
  {
    id: "pages",
    labelKey: "workbench.tabPages",
    render: (ctx) => (ctx.projectKey ? <PagesPanel projectName={ctx.projectKey} /> : null),
    when: (ctx) => ctx.projectKey !== null,
  },
  {
    id: "wiki",
    labelKey: "workbench.tabWiki",
    render: (ctx) => (ctx.projectKey ? <WikiToolTab projectKey={ctx.projectKey} /> : null),
    when: (ctx) => ctx.projectKey !== null,
  },
];

/**
 * 构建中栏 / 移动列表态的 overview tab 列表（设计文档 §4）：overview 常驻 + history
 * （includeHistory=true 时；列表态 project scope 恒传 true、global scope 传 false）+
 * 第一方 inspection 插件按 ctx 过滤。桌面 instance-area visibleTabs 与移动
 * MobileProjectOverview / MobileGlobalOverview tabs 共用此构建逻辑，plugin visibility
 * 收敛为单一来源（plugin.when），避免三处循环 + push 重复。返回类型对齐
 * WorkbenchMiddleTab（= WorkbenchMobileOverviewTab，见 workbench-model 别名）。
 */
export function buildOverviewTabs(
  t: TranslateFn,
  ctx: WorkbenchTabPluginContext,
  includeHistory: boolean,
): { id: WorkbenchMiddleTab; label: string }[] {
  const options: { id: WorkbenchMiddleTab; label: string }[] = [
    { id: "overview", label: t("workbench.tabOverview") },
  ];
  if (includeHistory) {
    options.push({ id: "history", label: t("workbench.tabHistory") });
  }
  for (const plugin of WORKBENCH_TAB_PLUGINS) {
    if (plugin.when(ctx)) options.push({ id: plugin.id, label: t(plugin.labelKey) });
  }
  // plugins middle tab（项目级 skill+MCP，仅 project scope）。非 inspection tab——不进
  // WORKBENCH_TAB_PLUGINS（那是右栏 inspection 注册表，被 right-panel-tabs / focus tab 消费），
  // 单独 push 到 middle tab 列表；主体 render 由 project-left-panel / MobileProjectOverview 手写
  // PluginsPanel 分支（与 pages/wiki 同构：middle tab + 消费者各自手写渲染）。
  if (ctx.projectKey !== null) {
    options.push({ id: "plugins", label: t("workbench.tabPlugins") });
  }
  return options;
}
