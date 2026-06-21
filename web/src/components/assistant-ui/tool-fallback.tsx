import { useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { useT } from "../../i18n";
import { deriveToolState } from "./tool-state";

export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
  ...rest
}) => {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const isRunning = status.type === "running";
  const isError = (rest as Record<string, unknown>).isError === true;
  const isInterrupted = (rest as Record<string, unknown>).isInterrupted === true;
  const _toolState = deriveToolState({ result, isRunning, isError, isInterrupted });
  const hasArgs = argsText.length > 0 && argsText !== "{}";
  const resultStr =
    typeof result === "string" ? result : result != null ? JSON.stringify(result, null, 2) : "";
  const hasResult = resultStr.length > 0 && !isRunning;

  const accentColor = isError ? "text-red-400" : "text-cyan-400";
  const accentBorder = isError ? "border-red-500/40" : "border-slate-600/50";
  const accentBg = isError ? "bg-red-500/5" : "bg-slate-900/60";
  const accentDivider = isError ? "border-red-500/20" : "border-slate-700/50";

  return (
    <div className={`my-2 rounded-lg border ${accentBorder} ${accentBg} overflow-hidden`}>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/50 transition cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-slate-500 text-[0.6rem] shrink-0">{expanded ? "▾" : "▸"}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 ${isError ? "text-red-400" : "text-cyan-400"}`}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 3.5h3l1.5 2h7v7H2v-9z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
        <span className={`text-xs font-medium truncate ${accentColor}`}>{toolName}</span>
        {isRunning && !isInterrupted ? (
          <span
            className={`ml-auto h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-2 ${isError ? "border-red-400/40 border-t-red-400" : "border-cyan-400/40 border-t-cyan-400"}`}
          />
        ) : null}
        {isInterrupted && !expanded ? (
          <span className="text-[0.6rem] text-amber-400 ml-auto shrink-0">
            {t("claude2.interrupted")}
          </span>
        ) : isError && !expanded ? (
          <span className="text-[0.6rem] text-red-400/70 ml-auto shrink-0">错误</span>
        ) : hasResult && !expanded ? (
          <span className="text-[0.6rem] text-slate-500 truncate ml-auto">
            {resultStr.length > 1024
              ? `${(resultStr.length / 1024).toFixed(1)}k`
              : `${resultStr.length} chars`}
          </span>
        ) : null}
      </button>
      {expanded && (
        <>
          {hasArgs ? (
            <div className={`border-t ${accentDivider} px-3 py-2`}>
              <pre className="text-[0.6rem] text-slate-400 whitespace-pre-wrap break-all leading-relaxed">
                {argsText}
              </pre>
            </div>
          ) : null}
          {isInterrupted ? (
            <div className={`border-t ${accentDivider} px-3 py-2`}>
              <span className="text-[0.6rem] text-amber-400">
                {t("claude2.toolInterruptedHint")}
              </span>
            </div>
          ) : hasResult ? (
            <div className={`border-t ${accentDivider} px-3 py-2 max-h-48 overflow-y-auto`}>
              <pre
                className={`text-[0.6rem] whitespace-pre-wrap break-all leading-relaxed ${isError ? "text-red-300" : "text-slate-300"}`}
              >
                {resultStr}
              </pre>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
