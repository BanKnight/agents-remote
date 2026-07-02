import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { type WorkbenchScope, useWorkbenchLayout } from "../../routes/workbench-model";
import { WorkbenchLeftRail } from "./left-rail";
import { PanelRouter } from "./instance-area";

type MobileWorkbenchProps = {
  scope: WorkbenchScope;
  focusId?: string;
};

/**
 * 移动端工作台（设计文档 §7）。Stage 5 按桌面分 stage 升级：A 聚焦态单实例化
 *（修窄屏多面板挤压）→ B header tab inspection → C ‹› 悬浮切 → D 列表态二级总览
 * + 一级底部 tab → E 路由收口。
 *
 * 当前：无 focusId → 实例列表（WorkbenchLeftRail 全屏 + 创建入口，Stage D 升级为
 * MobileProjectOverview）；有 focusId → 单实例聚焦（PanelRouter，不 split）+ 顶部返回。
 */
export function MobileWorkbench({ focusId, scope }: MobileWorkbenchProps) {
  if (!focusId) {
    return (
      <main
        className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-slate-100 ${shellSurfaceClasses.shell}`}
      >
        <WorkbenchLeftRail focusId={focusId} scope={scope} />
      </main>
    );
  }

  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-slate-100 ${shellSurfaceClasses.shell}`}
    >
      <MobileBackBar scope={scope} />
      <MobileFocusBody focusId={focusId} scope={scope} />
    </main>
  );
}

type MobileFocusBodyProps = {
  focusId: string;
  scope: WorkbenchScope;
};

/**
 * 移动端聚焦态主体（Stage 5-A）：单实例面板（PanelRouter），不走桌面 split 布局 ——
 * 移动窄屏不 split 多面板（避免挤压），只渲染 focusId 对应实例。projectName：project
 * 作用域直接 scope.key；global 作用域从布局面板查（focusId 不在布局则空，暂不渲染）。
 * 容器 flex-col 让面板内部 flex-1 runtime body 撑满（与桌面 SplitPanel 同撑满契约）。
 */
function MobileFocusBody({ focusId, scope }: MobileFocusBodyProps) {
  const [layout] = useWorkbenchLayout(scope);
  const projectName =
    scope.kind === "project"
      ? scope.key
      : layout.panels.find((p) => p.sessionId === focusId)?.projectName;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {projectName ? <PanelRouter panelRef={{ projectName, sessionId: focusId }} /> : null}
    </div>
  );
}

function MobileBackBar({ scope }: { scope: WorkbenchScope }) {
  const { t } = useT();
  const navigate = useNavigate();
  const scopeSegment = scope.kind === "project" ? scope.key : "global";
  return (
    <div className="flex h-11 shrink-0 items-center border-b border-white/5 px-2">
      <button
        type="button"
        onClick={() => void navigate({ to: "/workbench/$scope", params: { scope: scopeSegment } })}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M10 3L5 8l5 5"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t("workbench.backToList")}
      </button>
    </div>
  );
}
