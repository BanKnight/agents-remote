import { useContext, type ReactNode } from "react";
import { type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Claude2BridgeContext } from "../../routes/claude2-adapter";
import { useT, type TranslationKey } from "../../i18n";
import { CollapsibleSection } from "./collapsible-section";
import { ToolHead, type ToolHeadStatus } from "./tool-head";

function makeToolRenderer(config: {
  icon: string;
  typeLabel?: string; // i18n key for the badge (tool type). Falls back to toolName.
  detail?: (args: Record<string, unknown>, toolName: string) => string | null;
  badge?: (args: Record<string, unknown>, toolName: string) => string | null;
  body?: (args: Record<string, unknown>) => ReactNode | null;
  footer?: (result: string, args: Record<string, unknown>, isError: boolean) => ReactNode;
}): ToolCallMessagePartComponent {
  const { icon, typeLabel, detail, badge, body, footer } = config;
  return ({ toolName, argsText, result, status, ...rest }) => {
    const { t } = useT();
    const isRunning = status.type === "running";
    const isError = (rest as Record<string, unknown>).isError === true;
    const isInterrupted = (rest as Record<string, unknown>).isInterrupted === true;
    const resultStr =
      typeof result === "string" ? result : result != null ? JSON.stringify(result, null, 2) : "";
    const hasResult = resultStr.length > 0 && !isRunning;
    const bridge = useContext(Claude2BridgeContext);
    const metadata = (rest as Record<string, unknown>).metadata as
      | Record<string, unknown>
      | undefined;
    const controlRequestId = (metadata?.controlRequestId as string) ?? "";
    const needsPermission = controlRequestId !== "" && isRunning && !isInterrupted;
    const args = safeParseArgs(argsText);
    const detailText = detail ? detail(args, toolName) : null;
    const badgeText = badge
      ? badge(args, toolName)
      : typeLabel
        ? t(typeLabel as TranslationKey)
        : toolName;
    const hasArgs = argsText.length > 0 && argsText !== "{}";
    const skillContent =
      typeof metadata?.skillContent === "string" ? (metadata.skillContent as string) : "";

    const toolStatus: ToolHeadStatus | null = isRunning
      ? "running"
      : isInterrupted
        ? "interrupted"
        : isError
          ? "error"
          : null;
    const badgeBg = needsPermission
      ? "bg-amber-500/15 text-amber-200"
      : "bg-cyan-500/15 text-cyan-200";

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
    const hasContent = hasPrimary || Boolean(skillContent) || hasResult || isInterrupted;
    const sectionDivider = `mt-2 border-t pt-2 ${accentDivider}`;

    return (
      <>
        <CollapsibleSection
          className={`my-1 ${accentColor}`}
          dividerClassName={accentDivider}
          header={(expanded) => (
            <ToolHead
              icon={icon}
              badge={badgeText}
              badgeClassName={badgeBg}
              detail={detailText}
              status={toolStatus}
              trailing={
                !expanded && hasResult ? (
                  <span className="truncate text-[0.6rem] text-slate-500">
                    {resultStr.length > 1024
                      ? `${(resultStr.length / 1024).toFixed(1)}k`
                      : `${resultStr.length} chars`}
                  </span>
                ) : null
              }
            />
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
              {isInterrupted ? (
                <div className={`${hasPrimary || skillContent ? sectionDivider : ""}`}>
                  <span className="text-[0.6rem] text-amber-400">
                    {t("claude2.toolInterruptedHint")}
                  </span>
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
  typeLabel: "claude2.tool.bash",
  detail: (args) => {
    const desc = typeof args.description === "string" ? args.description.trim() : "";
    if (desc) return desc.slice(0, 80);
    const cmd = typeof args.command === "string" ? args.command : "";
    return cmd ? `$ ${cmd.slice(0, 80)}` : null;
  },
});

export const ReadToolUI = makeToolRenderer({
  icon: "read",
  typeLabel: "claude2.tool.read",
  detail: (args) => {
    const path = typeof args.file_path === "string" ? args.file_path : "";
    return path ? (path.split("/").pop() ?? path) : null;
  },
});

export const WriteToolUI = makeToolRenderer({
  icon: "write",
  typeLabel: "claude2.tool.write",
  detail: (args) => {
    const path = typeof args.file_path === "string" ? args.file_path : "";
    return path ? (path.split("/").pop() ?? path) : null;
  },
});

export const EditToolUI = makeToolRenderer({
  icon: "edit",
  typeLabel: "claude2.tool.edit",
  detail: (args) => {
    const path = typeof args.file_path === "string" ? args.file_path : "";
    return path ? (path.split("/").pop() ?? path) : null;
  },
  body: editDiffBody,
});

export const SkillToolUI = makeToolRenderer({
  icon: "skill",
  typeLabel: "claude2.tool.skill",
  detail: (args) => {
    const name = typeof args.skill === "string" ? args.skill : "";
    return name || null;
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
  typeLabel: "claude2.tool.task",
  detail: (_args, toolName) => toolName,
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
  detail: (args) => {
    const desc = typeof args.description === "string" ? args.description.trim() : "";
    return desc ? desc.slice(0, 80) : null;
  },
  badge: (args) => {
    const type = typeof args.subagent_type === "string" ? args.subagent_type.trim() : "";
    return type || null;
  },
  footer: agentFooter,
});

export const WebSearchToolUI = makeToolRenderer({
  icon: "webSearch",
  typeLabel: "claude2.tool.webSearch",
  detail: (args) => {
    const query = typeof args.query === "string" ? args.query : "";
    return query ? query.slice(0, 60) : null;
  },
});

export const WebFetchToolUI = makeToolRenderer({
  icon: "webFetch",
  typeLabel: "claude2.tool.webFetch",
  detail: (args) => {
    const url = typeof args.url === "string" ? args.url : "";
    try {
      const host = url ? new URL(url).hostname : "";
      return host || (url ? url.slice(0, 60) : null);
    } catch {
      return url ? url.slice(0, 60) : null;
    }
  },
});

export const MCPToolRenderer = makeToolRenderer({
  icon: "mcp",
  typeLabel: "claude2.tool.mcp",
  detail: (_args, toolName) => {
    const cleaned = toolName.replace(/^mcp__/, "").replace(/__/g, "/");
    return cleaned;
  },
});

export const GlobToolUI = makeToolRenderer({
  icon: "file",
  typeLabel: "claude2.tool.glob",
  detail: (args) => {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    return pattern || null;
  },
});

export const GrepToolUI = makeToolRenderer({
  icon: "search",
  typeLabel: "claude2.tool.grep",
  detail: (args) => {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    return pattern ? pattern.slice(0, 60) : null;
  },
});

export const NotebookEditToolUI = makeToolRenderer({
  icon: "notebook",
  typeLabel: "claude2.tool.notebook",
  detail: () => null,
});

// ── Slash command output (non-compact) ────────────────────────────

const CommandOutputUI = makeToolRenderer({
  icon: "command",
  detail: (_args, toolName) => toolName,
});

const EnterPlanModeToolUI = makeToolRenderer({
  icon: "plan",
  typeLabel: "claude2.tool.planMode",
  detail: () => null,
});

const GenericToolUI = makeToolRenderer({
  icon: "command",
  typeLabel: "claude2.tool.generic",
  detail: (_args, toolName) => toolName,
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
toolRegistry.set("EnterPlanMode", EnterPlanModeToolUI);
toolRegistry.set("slash-command", CommandOutputUI);
// Codex equivalents (lowercase)
toolRegistry.set("bash", BashToolUI);
toolRegistry.set("agent", AgentToolUI);

export function getToolRenderer(toolName: string): ToolRenderer {
  const exact = toolRegistry.get(toolName);
  if (exact) return exact;
  if (toolName.startsWith("mcp__")) return MCPToolRenderer;
  return GenericToolUI;
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
