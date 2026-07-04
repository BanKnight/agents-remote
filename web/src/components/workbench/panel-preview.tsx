import { useSyncExternalStore } from "react";
import { getPanelPreview, subscribePanelPreview } from "./panel-preview-cache";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { useT } from "../../i18n";

/**
 * 面板缩略预览（设计 §7.2「output 末 2 行预览」）。terminal / chat 数据源统一经
 * `panel-preview-cache`（module-level 单例）写入，本组件用 `useSyncExternalStore` 订阅
 * 当前 sessionId 的末几行。纯 presentational——lines 由 cache 派生，零 query / 零 AUI 依赖。
 *
 * 数据源对称（单一数据管道延伸，不伪造数据）：
 * - terminal：SessionDetail onmessage（snapshot/output）写 cache（setPanelPreview 全量 / writePanelPreview 增量）。
 * - chat（claude2）：useClaude2Session rawMessages effect 取 lastAssistantTextLines 写 cache。
 */
export function PanelPreview({ sessionId }: { sessionId: string }) {
  const { t } = useT();
  const lines = useSyncExternalStore(
    (onChange) => subscribePanelPreview(sessionId, onChange),
    () => getPanelPreview(sessionId),
  );
  if (lines.length === 0) {
    return (
      <div
        aria-label={t("workbench.panelPreview")}
        className={`flex-1 px-2 py-1.5 font-mono text-[0.65rem] text-on-surface-muted ${shellSurfaceClasses.inset}`}
      >
        <span className="opacity-60">{t("workbench.panelPreviewEmpty")}</span>
      </div>
    );
  }
  return (
    <div
      aria-label={t("workbench.panelPreview")}
      className={`flex-1 px-2 py-1.5 font-mono text-[0.65rem] text-on-surface-muted ${shellSurfaceClasses.inset}`}
    >
      {lines.map((line, idx) => (
        <div className="truncate" key={idx}>
          {line}
        </div>
      ))}
    </div>
  );
}
