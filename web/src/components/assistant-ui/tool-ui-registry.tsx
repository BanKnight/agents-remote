import { useState, useContext, useEffect, type ReactNode } from "react";
import { useComposerRuntime, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Claude2BridgeContext } from "../../routes/claude2-adapter";
import { CollapsibleSection } from "./collapsible-section";

// Icon paths are inline SVG strings for simplicitly
const Icons = {
  terminal: '<path d="M4 17L2 15V5l2-2h1l-2 2v10l2 2H4zM8 17h8v-1H8v1z" fill="currentColor"/>',
  file: '<path d="M4 2h6l4 4v10a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2zm6 1.4V6h2.6L10 3.4zM3 4v12a1 1 0 001 1h8a1 1 0 001-1V7h-4V3H4a1 1 0 00-1 1z" fill="currentColor"/>',
  edit: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>',
  search:
    '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M20 20l-3.3-3.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  puzzle:
    '<path d="M4 8h2V6a2 2 0 012-2h1V2h2v2h1a2 2 0 012 2v2h2v2h-2v1a2 2 0 01-2 2h-1v2H9v-2H8a2 2 0 01-2-2v-1H4V8zm3 1H5v4h2v1a1 1 0 001 1h1v2h2v-2h1a1 1 0 001-1v-1h2V9h-2V8a1 1 0 00-1-1h-1V5H9v2H8a1 1 0 00-1 1v1z" fill="currentColor"/>',
  skill:
    '<path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" fill="currentColor"/><path d="M5 15l1 3.5L9.5 19.5 6.5 21 5 24l-1.5-3L0 19.5 3.5 18 5 15z" fill="currentColor" opacity="0.5"/>',
  webSearch:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 12h17M12 3.5a15 15 0 010 17M12 3.5a15 15 0 000 17" stroke="currentColor" stroke-width="1.5"/>',
  webFetch:
    '<circle cx="12" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 13l3 4 3-4M12 8v9M4 20h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  mcp: '<circle cx="5" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="19" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  task: '<rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 8h4M8 12h6M8 16h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  code: '<path d="M8 3L3 9l5 6M16 3l5 6-5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  globe:
    '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="4" ry="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" stroke="currentColor" stroke-width="1.5"/>',
  read: '<path d="M2 3h6a3 3 0 013 3v12a3 3 0 00-3-3H2V3zm14 0h-6a3 3 0 00-3 3v12a3 3 0 013-3h6V3z" fill="currentColor"/>',
  write:
    '<path d="M16 2l4 4-11 11H5v-4L16 2zm0 1.4L7.4 12H6v1.4L14.6 4.8 16 3.4zM3 17v3h3L17.4 8.6 14 5.2 3 17z" fill="currentColor"/>',
  question:
    '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2.5-2.5 3.5V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="17.5" r="0.75" fill="currentColor"/>',
  command:
    '<path d="M7 7l4 5-4 5M13 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  plan: '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 9h18M9 3v18" stroke="currentColor" stroke-width="1.5"/><circle cx="6.5" cy="6.5" r="1" fill="currentColor"/><circle cx="15.5" cy="13.5" r="1" fill="currentColor"/><path d="M9 15h10" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><path d="M3 18h6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>',
  agent:
    '<circle cx="6" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="17" cy="17" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 8l7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
};

function ToolIcon({ name, className }: { name: string; className?: string }) {
  const d = Icons[name as keyof typeof Icons] ?? Icons.task;
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 ${className ?? "text-cyan-400"}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <g dangerouslySetInnerHTML={{ __html: d }} />
    </svg>
  );
}

function makeToolRenderer(config: {
  icon: string;
  label?: (args: Record<string, unknown>, toolName: string) => string;
  badge?: (args: Record<string, unknown>, toolName: string) => string | null;
  body?: (args: Record<string, unknown>) => ReactNode | null;
  footer?: (result: string, args: Record<string, unknown>, isError: boolean) => ReactNode;
}): ToolCallMessagePartComponent {
  const { icon, label, badge, body, footer } = config;
  return ({ toolName, argsText, result, status, ...rest }) => {
    const isRunning = status.type === "running";
    const isError = (rest as Record<string, unknown>).isError === true;
    const isOrphaned = (rest as Record<string, unknown>).isOrphaned === true;
    const resultStr =
      typeof result === "string" ? result : result != null ? JSON.stringify(result, null, 2) : "";
    const hasResult = resultStr.length > 0 && !isRunning;
    const bridge = useContext(Claude2BridgeContext);
    const metadata = (rest as Record<string, unknown>).metadata as
      | Record<string, unknown>
      | undefined;
    const controlRequestId = (metadata?.controlRequestId as string) ?? "";
    const needsPermission = controlRequestId !== "" && isRunning && !isOrphaned;
    const args = safeParseArgs(argsText);
    const displayLabel = label ? label(args, toolName) : toolName;
    const badgeText = badge ? badge(args, toolName) : null;
    const hasArgs = argsText.length > 0 && argsText !== "{}";
    const skillContent =
      typeof metadata?.skillContent === "string" ? (metadata.skillContent as string) : "";

    const accentColor = isError
      ? "text-red-400"
      : needsPermission
        ? "text-amber-400"
        : "text-cyan-400";
    const accentDivider = isError
      ? "border-red-500/20"
      : needsPermission
        ? "border-amber-500/20"
        : "border-slate-700/50";

    const bodyNode = body ? body(args) : null;
    const primaryNode = bodyNode ? (
      <div>{bodyNode}</div>
    ) : hasArgs ? (
      <div>
        {Object.keys(args).length > 0 ? (
          <div className="space-y-1.5">
            {Object.entries(args).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-xs">
                <span className="shrink-0 font-medium text-slate-400">{key}:</span>
                <span className="text-slate-300 break-all">{formatArg(value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <pre className="text-[0.6rem] text-slate-400 whitespace-pre-wrap break-all leading-relaxed">
            {argsText}
          </pre>
        )}
      </div>
    ) : null;
    const hasPrimary = primaryNode !== null;
    const hasContent = hasPrimary || Boolean(skillContent) || hasResult || isOrphaned;
    const sectionDivider = `mt-2 border-t pt-2 ${accentDivider}`;

    return (
      <>
        <CollapsibleSection
          className={`my-1 ${accentColor}`}
          dividerClassName={accentDivider}
          header={(expanded) => (
            <>
              <ToolIcon name={icon} className={isError ? "text-red-400" : undefined} />
              {badgeText ? (
                <span className="shrink-0 rounded bg-slate-700/60 px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-wide text-slate-300">
                  {badgeText}
                </span>
              ) : null}
              <span className="text-xs font-medium truncate">{displayLabel}</span>
              {isRunning && !isOrphaned ? (
                <span
                  className={`ml-auto h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-2 ${isError ? "border-red-400/40 border-t-red-400" : "border-cyan-400/40 border-t-cyan-400"}`}
                />
              ) : !expanded && isOrphaned ? (
                <span className="ml-auto shrink-0 text-[0.6rem] text-slate-500">中断</span>
              ) : !expanded && isError ? (
                <span className="ml-auto shrink-0 text-[0.6rem] text-red-400/70">错误</span>
              ) : !expanded && hasResult ? (
                <span className="ml-auto shrink-0 truncate text-[0.6rem] text-slate-500">
                  {resultStr.length > 1024
                    ? `${(resultStr.length / 1024).toFixed(1)}k`
                    : `${resultStr.length} chars`}
                </span>
              ) : null}
            </>
          )}
        >
          {hasContent ? (
            <>
              {primaryNode}
              {skillContent ? (
                <div className={hasPrimary ? sectionDivider : ""}>
                  <span className="text-[0.55rem] font-semibold uppercase tracking-wide text-purple-400/70">
                    Skill
                  </span>
                  <pre className="mt-1 text-[0.6rem] whitespace-pre-wrap break-all leading-relaxed text-purple-200/80">
                    {skillContent}
                  </pre>
                </div>
              ) : null}
              {isOrphaned ? (
                <div className={`${hasPrimary || skillContent ? sectionDivider : ""}`}>
                  <span className="text-[0.6rem] text-slate-500">进程已退出，工具未返回结果</span>
                </div>
              ) : footer ? (
                <div className={hasPrimary || skillContent ? sectionDivider : ""}>
                  {footer(resultStr, args, isError)}
                </div>
              ) : hasResult ? (
                <div
                  className={`max-h-48 overflow-y-auto ${hasPrimary || skillContent ? sectionDivider : ""}`}
                >
                  <pre
                    className={`whitespace-pre-wrap break-all text-[0.6rem] leading-relaxed ${isError ? "text-red-300" : "text-slate-300"}`}
                  >
                    {resultStr}
                  </pre>
                </div>
              ) : null}
            </>
          ) : null}
        </CollapsibleSection>
        {needsPermission ? (
          <div className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/25 px-3 py-2 mt-1">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-medium text-amber-300 flex-1">等待确认</span>
            <button
              type="button"
              className="rounded-md bg-amber-500/25 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/40 active:bg-amber-500/50 transition"
              onClick={() => bridge?.respondToControlRequest(controlRequestId, args)}
            >
              允许
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-700/50 px-3 py-1 text-xs font-medium text-slate-400 hover:bg-slate-600/50 hover:text-slate-300 transition"
              onClick={() => bridge?.cancelControlRequest(controlRequestId)}
            >
              拒绝
            </button>
          </div>
        ) : null}
      </>
    );
  };
}

// ── Edit diff view ───────────────────────────────────────────────────

export type DiffLine = { type: "same" | "add" | "del"; text: string };

// Line-level LCS diff. O(m*n) is fine — Edit blocks are small.
export function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const a = oldStr.length ? oldStr.split("\n") : [];
  const b = newStr.length ? newStr.split("\n") : [];
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i++;
    } else {
      out.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: "del", text: a[i++] });
  while (j < n) out.push({ type: "add", text: b[j++] });
  return out;
}

function EditDiffView({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const lines = lineDiff(oldStr, newStr);
  return (
    <div className="rounded border border-slate-700/60 bg-slate-950/60 overflow-x-auto font-mono text-[0.6rem] leading-relaxed">
      {lines.map((line, idx) => {
        const cls =
          line.type === "add"
            ? "bg-emerald-500/10 text-emerald-200"
            : line.type === "del"
              ? "bg-red-500/10 text-red-200"
              : "text-slate-500";
        const sign = line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
        return (
          <div key={idx} className={`flex px-2 whitespace-pre ${cls}`}>
            <span className="shrink-0 select-none opacity-60">{sign} </span>
            <span className="break-all">{line.text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

// Renders the diff body for Edit (single old/new) and MultiEdit (edits[]).
function editDiffBody(args: Record<string, unknown>): ReactNode {
  const edits = Array.isArray(args.edits)
    ? (args.edits as Array<Record<string, unknown>>)
    : [{ old_string: args.old_string, new_string: args.new_string }];
  const pairs = edits
    .map((e) => ({
      oldStr: typeof e.old_string === "string" ? e.old_string : "",
      newStr: typeof e.new_string === "string" ? e.new_string : "",
    }))
    .filter((p) => p.oldStr || p.newStr);
  if (pairs.length === 0) return null;
  return (
    <div className="space-y-2">
      {pairs.map((p, idx) => (
        <EditDiffView key={idx} oldStr={p.oldStr} newStr={p.newStr} />
      ))}
    </div>
  );
}

// Footer for Agent tool: renders prompt collapsed + sub-agent response nested.
function agentFooter(result: string, args: Record<string, unknown>, isError: boolean): ReactNode {
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  return (
    <div className="space-y-2">
      {prompt ? (
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer">Prompt</summary>
          <pre className="mt-1 text-[0.6rem] text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
            {prompt}
          </pre>
        </details>
      ) : null}
      <div className="rounded bg-slate-800/50 p-2">
        <div className="mb-1 text-[0.55rem] font-semibold uppercase tracking-wide text-cyan-400/70">
          子 Agent 输出
        </div>
        <pre
          className={`whitespace-pre-wrap break-all text-[0.65rem] leading-relaxed ${isError ? "text-red-300" : "text-slate-200"}`}
        >
          {result}
        </pre>
      </div>
    </div>
  );
}

// ── Tool-specific renderers ──────────────────────────────────────────

export const BashToolUI = makeToolRenderer({
  icon: "terminal",
  label: (args) => {
    const desc = typeof args.description === "string" ? args.description.trim() : "";
    if (desc) return desc.slice(0, 80);
    const cmd = typeof args.command === "string" ? args.command : "";
    return cmd ? `$ ${cmd.slice(0, 80)}` : "Bash";
  },
});

export const ReadToolUI = makeToolRenderer({
  icon: "read",
  label: (args) => {
    const path = typeof args.file_path === "string" ? args.file_path : "";
    return path ? `Read ${path.split("/").pop() ?? path}` : "Read";
  },
});

export const WriteToolUI = makeToolRenderer({
  icon: "write",
  label: (args) => {
    const path = typeof args.file_path === "string" ? args.file_path : "";
    return path ? `Write ${path.split("/").pop() ?? path}` : "Write";
  },
});

export const EditToolUI = makeToolRenderer({
  icon: "edit",
  label: (args) => {
    const path = typeof args.file_path === "string" ? args.file_path : "";
    return path ? `Edit ${path.split("/").pop() ?? path}` : "Edit";
  },
  body: editDiffBody,
});

export const SkillToolUI = makeToolRenderer({
  icon: "skill",
  label: (args) => {
    const name = typeof args.skill === "string" ? args.skill : "";
    return name ? `Skill: ${name}` : "Skill";
  },
});

function TaskBody({ args }: { args: Record<string, unknown> }) {
  const desc =
    typeof args.description === "string"
      ? args.description
      : typeof args.prompt === "string"
        ? args.prompt
        : typeof args.subject === "string"
          ? args.subject
          : "";
  const subagent = typeof args.subagent_type === "string" ? args.subagent_type : undefined;
  const taskId = typeof args.task_id === "string" ? args.task_id : undefined;
  const status =
    typeof args.status === "string"
      ? args.status
      : typeof args.isCompleted === "boolean"
        ? args.isCompleted
          ? "completed"
          : "running"
        : undefined;
  return (
    <div className="space-y-1.5">
      {subagent || taskId || status ? (
        <div className="flex items-center gap-2 flex-wrap">
          {subagent ? (
            <span className="shrink-0 rounded bg-amber-600/30 px-1.5 py-0.5 text-[0.65rem] font-medium text-amber-300">
              {subagent}
            </span>
          ) : null}
          {taskId ? <span className="text-[0.65rem] text-slate-500">#{taskId}</span> : null}
          {status ? (
            <span
              className={`text-[0.65rem] ${status === "completed" ? "text-emerald-400" : status === "error" ? "text-red-400" : "text-amber-400"}`}
            >
              {status}
            </span>
          ) : null}
        </div>
      ) : null}
      {desc ? (
        <div className="text-xs text-slate-300 leading-relaxed break-words">{desc}</div>
      ) : null}
    </div>
  );
}

export const TaskToolUI = makeToolRenderer({
  icon: "task",
  label: (args, toolName) => toolName,
  badge: (args) => {
    const subagent = typeof args.subagent_type === "string" ? args.subagent_type : undefined;
    return subagent ?? null;
  },
  body: (args) => {
    const hasContent =
      typeof args.description === "string" ||
      typeof args.prompt === "string" ||
      typeof args.subject === "string" ||
      typeof args.subagent_type === "string" ||
      typeof args.task_id === "string";
    return hasContent ? <TaskBody args={args} /> : null;
  },
});

export const AgentToolUI = makeToolRenderer({
  icon: "agent",
  badge: (args) => {
    const type = typeof args.subagent_type === "string" ? args.subagent_type.trim() : "";
    return type || null;
  },
  label: (args) => {
    const desc = typeof args.description === "string" ? args.description.trim() : "";
    return desc ? desc.slice(0, 80) : "Agent";
  },
  footer: agentFooter,
});

export const WebSearchToolUI = makeToolRenderer({
  icon: "webSearch",
  label: (args) => {
    const query = typeof args.query === "string" ? args.query : "";
    return query ? `Search: ${query.slice(0, 60)}` : "WebSearch";
  },
});

export const WebFetchToolUI = makeToolRenderer({
  icon: "webFetch",
  label: (args) => {
    const url = typeof args.url === "string" ? args.url : "";
    try {
      const host = url ? new URL(url).hostname : "";
      return host ? `Fetch: ${host}` : "WebFetch";
    } catch {
      return url ? `Fetch: ${url.slice(0, 60)}` : "WebFetch";
    }
  },
});

export const MCPToolRenderer = makeToolRenderer({
  icon: "mcp",
  label: (_args, toolName) => {
    // Strip mcp__server__ prefix for display: "mcp__context7__query-docs" → "context7/query-docs"
    const cleaned = toolName.replace(/^mcp__/, "").replace(/__/g, "/");
    return cleaned;
  },
});

export const GlobToolUI = makeToolRenderer({
  icon: "search",
  label: (args) => {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    return pattern ? `Glob: ${pattern}` : "Glob";
  },
});

export const GrepToolUI = makeToolRenderer({
  icon: "search",
  label: (args) => {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    return pattern ? `Grep: ${pattern.slice(0, 60)}` : "Grep";
  },
});

export const NotebookEditToolUI = makeToolRenderer({
  icon: "edit",
  label: () => "Notebook Edit",
});

type Question = {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options?: Array<{ label: string; description?: string }>;
};

export const AskUserQuestionToolUI: ToolCallMessagePartComponent = ({
  toolName: _toolName,
  argsText,
  result,
  status,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...rest
}) => {
  const bridge = useContext(Claude2BridgeContext);
  const composer = useComposerRuntime();
  const isRunning = status.type === "running";
  const toolCallId = (rest as Record<string, unknown>).toolCallId as string | undefined;
  const args = safeParseArgs(argsText);
  const questions = (args.questions as Question[]) ?? [];
  const metadata = (rest as Record<string, unknown>).metadata as
    | Record<string, unknown>
    | undefined;
  const controlRequestId = (metadata?.controlRequestId as string) ?? "";
  const structuredResult = (rest as Record<string, unknown>).structuredResult as
    | { answers?: Record<string, string> }
    | undefined;
  const structuredAnswers =
    structuredResult?.answers && typeof structuredResult.answers === "object"
      ? structuredResult.answers
      : undefined;
  const resultStr =
    typeof result === "string" ? result : result != null ? JSON.stringify(result, null, 2) : "";
  const answerText = structuredAnswers
    ? Object.entries(structuredAnswers)
        .map(([question, answer]) => `${question}: ${answer}`)
        .join("\n")
    : resultStr;
  const hasResult = resultStr.length > 0;
  // Default expanded when waiting for answer, collapsed when already answered
  const [expanded, setExpanded] = useState(!hasResult);
  // Auto-collapse once answered
  useEffect(() => {
    if (hasResult) setExpanded(false);
  }, [hasResult]);

  // Server-driven state: no optimistic setLocalAnswer.
  //
  // Card toolCallId = tool_use.id (from the assistant message). When Claude
  // echoes the user's answer as a user message with tool_result, the echoed
  // tool_use_id matches tool_use.id → tool_result auto-matches → result prop
  // is set → card shows "已回答".
  //
  // request_id (controlRequestId) is a transient RPC key:
  //   - Present: live stream, user can submit via bridge.respondToControlRequest
  //   - Absent (""): history view, or edge case where control_request didn't fire.
  //     User can type into the composer.

  // User can answer while the tool is running AND no tool_result has arrived.
  const canAnswer = isRunning && !hasResult;

  // Track selected option indices and free-text answers per question
  const [selections, setSelections] = useState<Record<number, Set<number>>>({});
  const [freeText, setFreeText] = useState<Record<number, string>>({});

  const toggleOption = (qIdx: number, optIdx: number, multi: boolean) => {
    if (!canAnswer) return;
    setSelections((prev) => {
      const current = new Set(prev[qIdx] ?? []);
      if (multi) {
        if (current.has(optIdx)) current.delete(optIdx);
        else current.add(optIdx);
      } else {
        current.clear();
        current.add(optIdx);
      }
      return { ...prev, [qIdx]: current };
    });
  };

  const handleSubmit = () => {
    if (!canAnswer) return;

    // Claude SDK expects answers as Record<questionText, answerString>.
    // Multi-select answers are comma-separated strings per Claude CLI.
    const answers: Record<string, string> = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const hasOptions = q.options && q.options.length > 0;

      if (hasOptions) {
        const sel = selections[i];
        if (!sel || sel.size === 0) continue;
        const selectedLabels = Array.from(sel)
          .map((idx) => q.options?.[idx]?.label ?? "")
          .filter(Boolean);
        if (selectedLabels.length > 0) {
          answers[q.question] = selectedLabels.join(", ");
        }
      } else {
        const text = freeText[i]?.trim();
        if (text) answers[q.question] = text;
      }
    }

    if (Object.keys(answers).length === 0) return;

    // controlRequestId present: live stream with --permission-prompt-tool stdio.
    // Send control_response to unblock Claude. The tool_result echo will
    // match toolCallId (= tool_use.id) and set result → card shows "已回答".
    //
    // No controlRequestId but toolCallId present: live stream without
    // permission-prompt-tool, or non-permission tool. Send tool_result via stdin.
    //
    // Neither present: history view. Drop answer text into composer.
    if (controlRequestId) {
      bridge?.respondToControlRequest(controlRequestId, { ...args, answers });
    } else if (toolCallId) {
      bridge?.sendToolResult(toolCallId, JSON.stringify(answers));
    } else {
      const answersText = Object.entries(answers)
        .map(([q, a]) => `${q}: ${a}`)
        .join("\n");
      composer.setText(answersText);
    }
  };

  const handleCancel = () => {
    if (!canAnswer) return;
    if (controlRequestId) {
      bridge?.cancelControlRequest(controlRequestId);
    } else if (toolCallId) {
      bridge?.sendToolResult(toolCallId, "Skipped");
    }
  };

  const hasAnySelection =
    Object.values(selections).some((s) => s.size > 0) ||
    Object.values(freeText).some((t) => t.trim().length > 0);

  return (
    <div className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-amber-500/10 transition cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-amber-400/70 text-[0.6rem] shrink-0">{expanded ? "▾" : "▸"}</span>
        <svg className="h-3.5 w-3.5 shrink-0 text-amber-400" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2.5-2.5 3.5V14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="12" cy="17.5" r="0.75" fill="currentColor" />
        </svg>
        <span className="text-xs font-medium text-amber-400 truncate">
          {hasResult ? "已回答" : isRunning ? "等待回答…" : "未回答"}
        </span>
        {isRunning && !hasResult ? (
          <span className="ml-auto h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-400/60" />
        ) : null}
      </button>
      {expanded && (
        <div className="border-t border-amber-500/20">
          <div className="px-3 py-2 space-y-3 max-h-72 overflow-y-auto">
            {questions.map((q, i) => {
              const multi = q.multiSelect === true;
              const selected = selections[i] ?? new Set<number>();
              const hasOptions = q.options && q.options.length > 0;
              return (
                <div
                  key={i}
                  className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-2.5"
                >
                  {q.header ? (
                    <p className="text-[0.6rem] font-semibold text-amber-300/80 uppercase tracking-wide mb-0.5">
                      {q.header}
                    </p>
                  ) : null}
                  <p className="text-[0.7rem] text-slate-200 leading-relaxed mb-2">
                    {q.question}
                    {multi ? (
                      <span className="text-[0.55rem] text-amber-400/60 ml-1">(多选)</span>
                    ) : null}
                  </p>
                  {hasOptions ? (
                    <div className="space-y-1">
                      {q.options!.map((opt, j) => {
                        const isSelected = selected.has(j);
                        return (
                          <button
                            key={j}
                            type="button"
                            className={`flex items-center gap-2 text-[0.65rem] w-full text-left rounded-lg px-2 py-1.5 transition ${
                              isSelected
                                ? "bg-amber-500/20 text-amber-100 border border-amber-500/40"
                                : "hover:bg-slate-800/50 text-slate-400 border border-transparent"
                            } ${!canAnswer ? "opacity-40 cursor-default" : ""}`}
                            disabled={!canAnswer}
                            onClick={() => toggleOption(i, j, multi)}
                          >
                            <span
                              className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[0.55rem] ${
                                isSelected
                                  ? "border-amber-400 bg-amber-400/30 text-amber-200"
                                  : "border-slate-500 text-slate-500"
                              }`}
                            >
                              {isSelected ? "✓" : j + 1}
                            </span>
                            <span className="flex-1">{opt.label}</span>
                            {opt.description ? (
                              <span className="text-[0.55rem] text-slate-500 text-right max-w-[40%]">
                                {opt.description}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-500/20 bg-slate-900/60 overflow-hidden">
                      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-amber-500/10">
                        <svg
                          className="h-3 w-3 text-amber-400/60"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M1 4l5 5-5 5"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="text-[0.55rem] text-amber-400/60">输入你的意见</span>
                      </div>
                      <textarea
                        className="w-full bg-transparent px-2 py-1.5 text-[0.65rem] text-slate-200 placeholder-slate-600 outline-none resize-none"
                        rows={2}
                        placeholder="在此输入…"
                        disabled={!canAnswer}
                        value={freeText[i] ?? ""}
                        onChange={(e) => setFreeText((prev) => ({ ...prev, [i]: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {canAnswer ? (
            <div className="border-t border-amber-500/20 px-3 py-2 flex items-center gap-2">
              {controlRequestId ? (
                <>
                  <button
                    type="button"
                    className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition bg-amber-500/30 text-amber-200 hover:bg-amber-500/40 disabled:opacity-30 disabled:cursor-default"
                    disabled={!hasAnySelection}
                    onClick={handleSubmit}
                  >
                    提交回答
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-xs font-semibold transition border border-slate-500/30 text-slate-400 hover:text-slate-200 hover:border-slate-400/50"
                    onClick={handleCancel}
                  >
                    跳过
                  </button>
                </>
              ) : toolCallId ? (
                <>
                  <button
                    type="button"
                    className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition bg-amber-500/30 text-amber-200 hover:bg-amber-500/40 disabled:opacity-30 disabled:cursor-default"
                    disabled={!hasAnySelection}
                    onClick={handleSubmit}
                  >
                    提交回答
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-xs font-semibold transition border border-slate-500/30 text-slate-400 hover:text-slate-200 hover:border-slate-400/50"
                    onClick={handleCancel}
                  >
                    跳过
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    hasAnySelection
                      ? "bg-amber-500/30 text-amber-200 hover:bg-amber-500/40"
                      : "bg-amber-500/10 text-amber-400/40 cursor-default"
                  }`}
                  disabled={!hasAnySelection}
                  onClick={handleSubmit}
                >
                  填入输入框发送
                </button>
              )}
            </div>
          ) : null}
          {isRunning && !hasResult ? (
            <div className="border-t border-amber-500/20 px-3 py-1.5">
              <p className="text-[0.55rem] text-amber-400/40 text-center">
                Claude 正在等待你的回答…
              </p>
            </div>
          ) : null}
          {hasResult ? (
            <div className="border-t border-amber-500/20 px-3 py-2">
              <p className="text-[0.6rem] text-amber-400/60 mb-1">回答</p>
              <pre className="text-[0.65rem] text-amber-200/70 whitespace-pre-wrap break-all leading-relaxed">
                {answerText}
              </pre>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

// ── Slash command output (non-compact) ────────────────────────────

const CommandOutputUI = makeToolRenderer({
  icon: "command",
  label: (_args, toolName) => toolName,
});

const EnterPlanModeToolUI = makeToolRenderer({
  icon: "plan",
  label: () => "Enter Plan Mode",
});

// ── Registry ─────────────────────────────────────────────────────────

type ToolRenderer = ToolCallMessagePartComponent;

const toolRegistry = new Map<string, ToolRenderer>();

// Register known tools
toolRegistry.set("Bash", BashToolUI);
toolRegistry.set("Read", ReadToolUI);
toolRegistry.set("Write", WriteToolUI);
toolRegistry.set("Edit", EditToolUI);
toolRegistry.set("MultiEdit", EditToolUI);
toolRegistry.set("Skill", SkillToolUI);
toolRegistry.set("Task", TaskToolUI);
toolRegistry.set("TaskCreate", TaskToolUI);
toolRegistry.set("TaskUpdate", TaskToolUI);
toolRegistry.set("Agent", AgentToolUI);
toolRegistry.set("WebSearch", WebSearchToolUI);
toolRegistry.set("WebFetch", WebFetchToolUI);
toolRegistry.set("Glob", GlobToolUI);
toolRegistry.set("Grep", GrepToolUI);
toolRegistry.set("NotebookEdit", NotebookEditToolUI);
toolRegistry.set("AskUserQuestion", AskUserQuestionToolUI);
toolRegistry.set("EnterPlanMode", EnterPlanModeToolUI);
toolRegistry.set("slash-command", CommandOutputUI);
// Codex equivalents (lowercase)
toolRegistry.set("bash", BashToolUI);
toolRegistry.set("agent", AgentToolUI);

export function getToolRenderer(toolName: string): ToolRenderer | undefined {
  // Exact match first
  const exact = toolRegistry.get(toolName);
  if (exact) return exact;
  // MCP tools match with prefix — use shared MCP renderer with connector icon
  if (toolName.startsWith("mcp__")) return MCPToolRenderer;
  return undefined;
}

function safeParseArgs(argsText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argsText);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function formatArg(value: unknown): string {
  if (typeof value === "string") return value.length > 120 ? value.slice(0, 120) + "…" : value;
  return JSON.stringify(value).slice(0, 120);
}
