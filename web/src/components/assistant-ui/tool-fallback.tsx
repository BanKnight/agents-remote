import { useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = status.type === "running";
  const hasArgs = argsText.length > 0 && argsText !== "{}";
  const resultStr =
    typeof result === "string" ? result : result != null ? JSON.stringify(result, null, 2) : "";
  const hasResult = resultStr.length > 0 && !isRunning;

  return (
    <div className="my-2 rounded-lg border border-slate-600/50 bg-slate-900/60 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/50 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-slate-500 text-[0.6rem] shrink-0">{expanded ? "▾" : "▸"}</span>
        <svg
          className="h-3.5 w-3.5 shrink-0 text-cyan-400"
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
        <span className="text-xs font-medium text-cyan-400 truncate">{toolName}</span>
        {isRunning ? (
          <span className="ml-auto h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-2 border-cyan-400/40 border-t-cyan-400" />
        ) : null}
        {hasResult && !expanded ? (
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
            <div className="border-t border-slate-700/50 px-3 py-2">
              <pre className="text-[0.6rem] text-slate-400 whitespace-pre-wrap break-all leading-relaxed">
                {argsText}
              </pre>
            </div>
          ) : null}
          {hasResult ? (
            <div className="border-t border-slate-700/50 px-3 py-2 max-h-48 overflow-y-auto">
              <pre className="text-[0.6rem] text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                {resultStr}
              </pre>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
