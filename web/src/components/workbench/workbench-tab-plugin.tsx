import type { GitDiffScope } from "@agents-remote/shared";
import { type ReactNode, useState } from "react";

import { FilesPanel } from "../files/file-browser";
import { PagesPanel } from "../pages/pages-panel";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import type { WorkbenchInspectionTab } from "../../routes/workbench-model";
import { ActionButton } from "../shell/shell-primitives";
import {
  L3GitBranches,
  L3GitCommit,
  L3GitHistory,
  L3WikiReader,
  MobileL3FilePreview,
  MobileL3GitDiff,
} from "./mobile-l3";
import { FilesToolPanel, GitToolPanel, WikiToolPanel } from "./project-tool-panels";

/** Files inspection 的 query-key 隔离段（仅全局根目录浏览语境保留 FilesPanel；项目作用域
 * FilesToolPanel 走全局 files path key，见 project-tool-panels）。 */
const WORKBENCH_FILES_QUERY_SCOPE = "workbench-files";

/**
 * 工作台 tab 插件渲染上下文（设计文档 §6）。当前作用域 + 聚焦实例决定 tab 可见性与
 * 内容作用域。projectKey 为 null（全局作用域）时 Git 隐藏；Files 全局可见（根目录
 * = PROJECTS_ROOT 只读浏览，进入项目子目录后切项目作用域可写，见 FilesPanel）。
 */
export type WorkbenchTabPluginContext = {
  projectKey: string | null;
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
 * render 由 RightPanelTabs / 移动 MobileFocusBody 在 active tab 时调用（中栏 middle tab
 * 已随 §6.12k 批次 2 三列化退役，buildOverviewTabs 随之删除）。
 */
export type WorkbenchTabPlugin = {
  id: WorkbenchInspectionTab;
  labelKey: TranslationKey;
  when: (ctx: WorkbenchTabPluginContext) => boolean;
  render: (ctx: WorkbenchTabPluginContext) => ReactNode;
};

/** 栏内详情态返回条（详情态顶部返回控件，files/git/wiki 三 tab 详情态共用）。 */
function DetailBackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="shrink-0 border-b border-neutral-line/40 px-3 py-2">
      {/* 非 compact = 移动端自动撑到 min-h-11 触摸目标、桌面保持行内紧凑（§7 渐进增强）。 */}
      <ActionButton onClick={onBack}>{label}</ActionButton>
    </div>
  );
}

/** 栏内 diff 详情目标（03r 详情形态：meta 行 + DiffContent）。from = 进入来源——
 * files 预览内「查看 diff ›」进 diff 时返回去向是预览态（非列表），返回标签随之。 */
type DiffTarget = { path: string; scope: GitDiffScope; from?: "preview" };

/** 栏内 diff 详情态（FilesToolTab 预览链路复用：返回条 + MobileL3GitDiff；GitToolTab 详情
 * 已升级为含历史/commit/分支的详情栈，见 GitDetailState）。 */
function TabDiffDetail({
  target,
  backLabel,
  onBack,
  projectKey,
}: {
  target: DiffTarget;
  backLabel: string;
  onBack: () => void;
  projectKey: string;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <DetailBackBar label={backLabel} onBack={onBack} />
      <MobileL3GitDiff path={target.path} projectName={projectKey} scope={target.scope} />
    </div>
  );
}

/**
 * files tab 主体（第十二轮批次 3 双端装配：右栏 Inspector 与移动 focus 态同一 render）。
 * 列表态 = FilesToolPanel（双端共享三件套，03o 形态）；点文件 → 栏内预览（MobileL3FilePreview
 * 复用）、「查看 diff ›」/行菜单「在 Git 查看 diff」→ 栏内 diff（MobileL3GitDiff 复用）——
 * 04 insfoot「点文件 → 本栏预览 / diff」。局部 state 不进 URL，返回逐级（列表 → 预览 → diff）。
 */
export function FilesToolTab({
  currentPath,
  onPathChange,
  projectKey,
}: {
  /** cwd 受控对——两 prop 必须成对传（只传 currentPath 会冻结目录导航）；右栏语境成对
   * 不传 = Tab 层自持（同 FilesToolPanel 受控模式的既有边界）。 */
  currentPath?: string;
  onPathChange?: (path: string) => void;
  projectKey: string;
}) {
  const { t } = useT();
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<DiffTarget | null>(null);
  // cwd：移动语境由父级（MobileFocusBody）受控传入跨 tab 保活；右栏语境 Tab 层持有——
  // 详情态会卸载列表组件，若靠 FilesToolPanel 内部 state，预览返回后 cwd 会丢回根目录
  //（design-review 批次 4 修复）。
  const [tabPath, setTabPath] = useState("");
  const path = currentPath ?? tabPath;
  const changePath = onPathChange ?? setTabPath;

  if (diffTarget) {
    return (
      <TabDiffDetail
        backLabel={diffTarget.from === "preview" ? t("files.backToPreview") : t("git.backToFiles")}
        onBack={() => setDiffTarget(null)}
        projectKey={projectKey}
        target={diffTarget}
      />
    );
  }
  if (previewPath !== null) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <DetailBackBar label={t("files.backToFiles")} onBack={() => setPreviewPath(null)} />
        <MobileL3FilePreview
          onViewDiff={() =>
            setDiffTarget({ path: previewPath, scope: "worktree", from: "preview" })
          }
          path={previewPath}
          projectName={projectKey}
        />
      </div>
    );
  }
  return (
    <FilesToolPanel
      currentPath={path}
      onOpenFile={(_projectName, p) => setPreviewPath(p)}
      onOpenGitFile={(f) => setDiffTarget({ path: f.path, scope: f.scope })}
      onPathChange={changePath}
      projectName={projectKey}
    />
  );
}

/** git 栏内详情栈项：改动 diff / 全部历史（分支页跳转带 branch）/ commit 详情 / 分支列表。 */
type GitDetailState =
  | { kind: "diff"; path: string; scope: GitDiffScope }
  | { kind: "history"; branch?: string }
  | { kind: "commit"; hash: string }
  | { kind: "branches" };

/**
 * git tab 主体（双端装配同 FilesToolTab）：列表态 = GitToolPanel 03m 全段（githead 态势行 +
 * 工作区改动 + 最近提交 + 全部历史/分支 links——2026-09-24 用户复验拍板：右栏与移动端同构
 * 承载三段，装配回调补齐）；点改动行/提交行/links → 栏内详情栈（与移动 L3 同组件：
 * L3GitHistory/L3GitCommit/L3GitBranches，返回逐级弹栈）。
 */
export function GitToolTab({ projectKey }: { projectKey: string }) {
  const { t } = useT();
  const [stack, setStack] = useState<GitDetailState[]>([]);

  if (stack.length === 0) {
    return (
      <GitToolPanel
        onOpenBranches={() => setStack((s) => [...s, { kind: "branches" }])}
        onOpenCommit={(hash) => setStack((s) => [...s, { kind: "commit", hash }])}
        onOpenGitFile={(f) =>
          setStack((s) => [...s, { kind: "diff", path: f.path, scope: f.scope }])
        }
        onOpenHistory={() => setStack((s) => [...s, { kind: "history" }])}
        projectName={projectKey}
      />
    );
  }
  const top = stack[stack.length - 1]!;
  const pop = () => setStack((s) => s.slice(0, -1));
  // 返回标签按去向：栈底回变更列表；栈上层 history →「返回历史」、branches →「返回分支」。
  const parent = stack.length > 1 ? stack[stack.length - 2] : undefined;
  const backLabel =
    stack.length === 1
      ? t("git.backToFiles")
      : parent?.kind === "branches"
        ? t("git.backToBranches")
        : t("git.backToHistory");
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <DetailBackBar label={backLabel} onBack={pop} />
      {top.kind === "diff" ? (
        <MobileL3GitDiff path={top.path} projectName={projectKey} scope={top.scope} />
      ) : top.kind === "history" ? (
        <L3GitHistory
          branch={top.branch}
          onOpenCommit={(hash) => setStack((s) => [...s, { kind: "commit", hash }])}
          projectName={projectKey}
        />
      ) : top.kind === "commit" ? (
        <L3GitCommit hash={top.hash} projectName={projectKey} />
      ) : (
        <L3GitBranches
          onOpenHistory={(branch) => setStack((s) => [...s, { kind: "history", branch }])}
          projectName={projectKey}
        />
      )}
    </div>
  );
}

/**
 * wiki tab 主体（双端装配同 Files/GitToolTab）：分组树列表态 = WikiToolPanel（03p 形态）；
 * 点页面行 → 栏内阅读态（L3WikiReader，与移动 L3 同一份——批次 4 归一，WikiPageDetail
 * 退役）。返回条 = DetailBackBar（与 files/git 详情态同构）。
 */
function WikiToolTab({ projectKey }: { projectKey: string }) {
  const { t } = useT();
  const [slug, setSlug] = useState<string | null>(null);

  if (slug !== null) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <DetailBackBar label={t("wiki.backToList")} onBack={() => setSlug(null)} />
        <L3WikiReader onOpenPage={setSlug} projectName={projectKey} slug={slug} />
      </div>
    );
  }
  return <WikiToolPanel onOpenPage={setSlug} projectName={projectKey} />;
}

/**
 * 第一方工作台 tab 插件注册表（设计文档 §5、§6）。files/git/wiki 换双端共享三件套
 * （2026-09-24 第十二轮复验批次 3，多端同构：桌面右栏 RightPanelTabs、移动
 * MobileFocusBody / MobileProjectHeader 工具 chip 同一 render 消费；详情态组件
 * MobileL3FilePreview/MobileL3GitDiff/L3WikiReader
 * 与移动 L3 详情页同一份，容器差异由装配层表达）。
 * Files 全局可见（项目作用域 = FilesToolTab；
 * 全局根目录只读浏览保留 FilesPanel 语境——与全局 /files 页同记档「后续评估
 * 合并」，rootBrowse 下沉单独立项）；Git/pages/wiki 仅项目作用域（when）。
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
        <FilesPanel initialPath="" queryScope={WORKBENCH_FILES_QUERY_SCOPE} />
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
