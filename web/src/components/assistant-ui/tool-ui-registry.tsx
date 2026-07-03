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
    // A dynamic badge (when defined) wins, but a null result must not erase the
    // pill — fall back to the i18n type label, then the raw tool name, so every
    // tool always shows a background badge.
    const dynamicBadge = badge ? badge(args, toolName) : null;
    const badgeText = dynamicBadge ?? (typeLabel ? t(typeLabel as TranslationKey) : toolName);
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
      ? "bg-assistant/15 text-assistant-soft"
      : "bg-user/15 text-user-soft";

    const accentColor = isError ? "text-error" : needsPermission ? "text-assistant" : "text-user";
    const accentDivider = isError
      ? "border-error/20"
      : needsPermission
        ? "border-assistant/20"
        : "border-neutral-line/50";

    const bodyNode = body ? body(args) : null;
    const primaryNode = bodyNode ? (
      <div>{bodyNode}</div>
    ) : hasArgs ? (
      <div>
        {Object.keys(args).length > 0 ? (
          <div className="space-y-1.5">
            {Object.entries(args).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-xs">
                <span className="shrink-0 font-medium text-on-surface-muted">{key}:</span>
                <span className="text-on-surface-soft break-all">{formatArg(value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <pre className="text-[0.6rem] text-on-surface-muted whitespace-pre-wrap break-all leading-relaxed">
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
                  <span className="truncate text-[0.6rem] text-on-surface-muted">
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
                  <span className="text-[0.55rem] font-semibold uppercase tracking-wide text-permission/70">
                    Skill
                  </span>
                  <pre className="mt-1 text-[0.6rem] whitespace-pre-wrap break-all leading-relaxed text-permission-soft/80">
                    {skillContent}
                  </pre>
                </div>
              ) : null}
              {isInterrupted ? (
                <div className={`${hasPrimary || skillContent ? sectionDivider : ""}`}>
                  <span className="text-[0.6rem] text-assistant">
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
                    className={`whitespace-pre-wrap break-all text-[0.6rem] leading-relaxed ${isError ? "text-error" : "text-on-surface-soft"}`}
                  >
                    {resultStr}
                  </pre>
                </div>
              ) : null}
            </>
          ) : null}
        </CollapsibleSection>
        {needsPermission ? (
          <div className="flex items-center gap-2 rounded-md bg-assistant/10 border border-assistant/25 px-3 py-2 mt-1">
            <span className="h-2 w-2 shrink-0 rounded-full bg-assistant animate-pulse" />
            <span className="text-xs font-medium text-assistant-soft flex-1">等待确认</span>
            <button
              type="button"
              className="rounded-md bg-assistant/25 px-3 py-1 text-xs font-semibold text-assistant-soft hover:bg-assistant/40 active:bg-assistant/50 transition"
              onClick={() => bridge?.respondToControlRequest(controlRequestId, args)}
            >
              允许
            </button>
            <button
              type="button"
              className="rounded-md bg-surface-raised/50 px-3 py-1 text-xs font-medium text-on-surface-muted hover:bg-surface-raised/50 hover:text-on-surface-soft transition"
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
    <div className="rounded border border-neutral-line/60 bg-surface-inset/60 overflow-x-auto font-mono text-[0.6rem] leading-relaxed">
      {lines.map((line, idx) => {
        const cls =
          line.type === "add"
            ? "bg-success/10 text-success"
            : line.type === "del"
              ? "bg-error/10 text-error"
              : "text-on-surface-muted";
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
        <details className="text-xs text-on-surface-muted">
          <summary className="cursor-pointer">Prompt</summary>
          <pre className="mt-1 text-[0.6rem] text-on-surface-soft whitespace-pre-wrap break-all leading-relaxed">
            {prompt}
          </pre>
        </details>
      ) : null}
      <div className="rounded bg-surface/50 p-2">
        <div className="mb-1 text-[0.55rem] font-semibold uppercase tracking-wide text-user/70">
          子 Agent 输出
        </div>
        <pre
          className={`whitespace-pre-wrap break-all text-[0.65rem] leading-relaxed ${isError ? "text-error" : "text-on-surface-soft"}`}
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

// Shared body for the task tools — the explanatory description / prompt text.
// The header carries the type badge + identity (subject / #id); the body only
// elaborates, so a plain text line is enough (no nested ToolHead).
function TaskBody({ args }: { args: Record<string, unknown> }) {
  const desc =
    typeof args.description === "string"
      ? args.description
      : typeof args.prompt === "string"
        ? args.prompt
        : "";
  if (!desc) return null;
  return <div className="text-xs text-on-surface-soft leading-relaxed break-words">{desc}</div>;
}

// Subagent Task tool — spawns a child agent. The subagent type is the
// meaningful "kind", shown as the badge; falls back to the generic Task label
// via makeToolRenderer's badge-null fallback when absent.
export const TaskToolUI = makeToolRenderer({
  icon: "task",
  typeLabel: "claude2.tool.task",
  badge: (args) => {
    const subagent = typeof args.subagent_type === "string" ? args.subagent_type : undefined;
    return subagent ?? null;
  },
  detail: (args) => {
    const desc = typeof args.description === "string" ? args.description.trim() : "";
    return desc ? desc.slice(0, 80) : null;
  },
  body: (args) => {
    const hasContent = typeof args.description === "string" || typeof args.prompt === "string";
    return hasContent ? <TaskBody args={args} /> : null;
  },
});

// TaskCreate — adds a row to the todo list. Header shows the new task's
// subject; the body carries the longer description.
export const TaskCreateToolUI = makeToolRenderer({
  icon: "task",
  typeLabel: "claude2.tool.taskCreate",
  detail: (args) => {
    const subject = typeof args.subject === "string" ? args.subject.trim() : "";
    return subject ? subject.slice(0, 80) : null;
  },
  body: (args) => (typeof args.description === "string" ? <TaskBody args={args} /> : null),
});

// TaskUpdate — mutates a todo row's status. Header shows the target task id.
export const TaskUpdateToolUI = makeToolRenderer({
  icon: "task",
  typeLabel: "claude2.tool.taskUpdate",
  detail: (args) => {
    const taskId =
      (typeof args.taskId === "string" && args.taskId) ||
      (typeof args.task_id === "string" && args.task_id) ||
      (typeof args.id === "string" && args.id);
    return taskId ? `#${taskId}` : null;
  },
  body: (args) => (typeof args.description === "string" ? <TaskBody args={args} /> : null),
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
toolRegistry.set("TaskCreate", TaskCreateToolUI);
toolRegistry.set("TaskUpdate", TaskUpdateToolUI);
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
