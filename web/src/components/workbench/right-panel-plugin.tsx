import type { ReactNode } from "react";
import type { SessionType } from "@agents-remote/shared";
import type { TranslateFn, TranslationKey } from "../../i18n/types";
import type { WorkbenchMiddleTab, WorkbenchRightTab } from "../../routes/workbench-model";
import { FilesPanel } from "../files/file-browser";
import { GitDiffPanel } from "../git/git-diff-viewer";

/** Files inspection 的 query-key 隔离段（与 ProjectConsole section 缓存分离）。 */
const WORKBENCH_FILES_QUERY_SCOPE = "workbench-files";
/** Git inspection 的 query-key 隔离段。 */
const WORKBENCH_GIT_QUERY_SCOPE = "workbench-git";

/**
 * 右栏插件渲染上下文（设计文档 §6）。当前作用域 + 聚焦实例决定 tab 可见性与
 * 内容作用域。projectKey 为 null（全局作用域）时 Git 隐藏；Files 全局可见（根目录
 * = PROJECTS_ROOT 只读浏览，进入项目子目录后切项目作用域可写，见 FilesPanel rootBrowse）。
 */
export type PluginContext = {
  projectKey: string | null;
  focusId?: string;
  sessionType?: SessionType;
};

/**
 * 右栏 inspection 插件契约（设计文档 §6）。V1 仅编译期第一方注册（Files/Git），
 * 不实装外部插件 / marketplace。`when` 集中表达可见性（Git 全局隐、Files 全局显）；
 * render 由 RightPanelTabs / 中栏 visibleTabs 在 active tab 时调用。Files/Git
 * 用 queryScope 隔离与 ProjectConsole section 的缓存（命中单数据管道 / 禁并行过滤分支）。
 */
export type RightPanelPlugin = {
  id: WorkbenchRightTab;
  labelKey: TranslationKey;
  when: (ctx: PluginContext) => boolean;
  render: (ctx: PluginContext) => ReactNode;
};

/**
 * 第一方右栏插件注册表（设计文档 §5、§6）。Stage 3 commit ② 由 RightPanelTabs
 * 与中栏 visibleTabs 消费。Files 全局可见（项目作用域可写 + 全局根目录只读）；
 * Git 仅项目作用域（when: ctx.projectKey !== null）。
 */
export const FIRST_PARTY_PLUGINS: RightPanelPlugin[] = [
  {
    id: "files",
    labelKey: "workbench.tabFiles",
    render: (ctx) => (
      <FilesPanel
        initialPath=""
        queryScope={WORKBENCH_FILES_QUERY_SCOPE}
        {...(ctx.projectKey ? { projectName: ctx.projectKey } : { rootBrowse: true })}
      />
    ),
    when: () => true,
  },
  {
    id: "git",
    labelKey: "workbench.tabGit",
    render: (ctx) =>
      ctx.projectKey ? (
        <GitDiffPanel projectName={ctx.projectKey} queryScope={WORKBENCH_GIT_QUERY_SCOPE} />
      ) : null,
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
  ctx: PluginContext,
  includeHistory: boolean,
): { id: WorkbenchMiddleTab; label: string }[] {
  const options: { id: WorkbenchMiddleTab; label: string }[] = [
    { id: "overview", label: t("workbench.tabOverview") },
  ];
  if (includeHistory) {
    options.push({ id: "history", label: t("workbench.tabHistory") });
  }
  for (const plugin of FIRST_PARTY_PLUGINS) {
    if (plugin.when(ctx)) options.push({ id: plugin.id, label: t(plugin.labelKey) });
  }
  return options;
}
