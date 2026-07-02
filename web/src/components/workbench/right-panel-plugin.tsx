import type { ReactNode } from "react";
import type { SessionType } from "@agents-remote/shared";
import type { TranslationKey } from "../../i18n/types";
import type { WorkbenchRightTab } from "../../routes/workbench-model";
import { FilesPanel } from "../files/file-browser";
import { GitDiffPanel } from "../git/git-diff-viewer";

/** Files inspection 的 query-key 隔离段（与 ProjectConsole section 缓存分离）。 */
const WORKBENCH_FILES_QUERY_SCOPE = "workbench-files";
/** Git inspection 的 query-key 隔离段。 */
const WORKBENCH_GIT_QUERY_SCOPE = "workbench-git";

/**
 * 右栏插件渲染上下文（设计文档 §6）。当前作用域 + 聚焦实例决定 tab 可见性与
 * 内容作用域。projectKey 为 null（全局作用域）时 project-scoped tab（Files/Git）隐藏。
 */
export type PluginContext = {
  projectKey: string | null;
  focusId?: string;
  sessionType?: SessionType;
};

/**
 * 右栏 inspection 插件契约（设计文档 §6）。V1 仅编译期第一方注册（Files/Git/原型），
 * 不实装外部插件 / marketplace。`when` 集中表达可见性（全局隐 project-scoped tab）；
 * render 由 RightPanelTabs 在 active tab 时调用。Files/Git
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
 * 消费。原型 tab V1 占位（不伪造数据），后续实装原型预览。
 */
export const FIRST_PARTY_PLUGINS: RightPanelPlugin[] = [
  {
    id: "files",
    labelKey: "workbench.tabFiles",
    render: (ctx) =>
      ctx.projectKey ? (
        <FilesPanel
          initialPath=""
          projectName={ctx.projectKey}
          queryScope={WORKBENCH_FILES_QUERY_SCOPE}
        />
      ) : null,
    when: (ctx) => ctx.projectKey !== null,
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
  {
    id: "prototype",
    labelKey: "workbench.tabPrototype",
    render: () => <PrototypePlaceholder />,
    when: () => true,
  },
];

function PrototypePlaceholder(): ReactNode {
  // 原型 tab V1 占位（设计文档 §5）。不伪造数据，后续实装原型预览。
  return null;
}
