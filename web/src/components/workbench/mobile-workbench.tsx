import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { type WorkbenchScope } from "../../routes/workbench-model";
import { WorkbenchLeftRail } from "./left-rail";
import { InstanceArea } from "./instance-area";

type MobileWorkbenchProps = {
  scope: WorkbenchScope;
  focusId?: string;
};

/**
 * 移动端工作台退化呈现（设计文档 §7，Stage 1 最小可用）。Stage 5 升级为正式
 * 两层导航（一级底部 tab + 二级 header tab + 单实例聚焦 + ‹› 悬浮切）。
 *
 * 线性流：无 focusId → 实例列表（WorkbenchLeftRail 全屏 + 创建入口）；
 * 有 focusId → 单实例面板（InstanceArea）+ 顶部返回列表。
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
      <div className="min-h-0 flex-1 overflow-hidden">
        <InstanceArea focusId={focusId} scope={scope} />
      </div>
    </main>
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
