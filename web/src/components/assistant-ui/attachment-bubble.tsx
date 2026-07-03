import { type ReactNode } from "react";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import { CollapsibleSection } from "./collapsible-section";
import { ToolHead } from "./tool-head";

// ── Config map ──────────────────────────────────────────────────────────
//
// Each subtype maps to an icon + i18n label key, with optional
// badge (inline text next to label) and body (expandable content).
// When body is null, the bubble renders as a single non-collapsible line.
// accent signals an error subtype (badge renders red instead of cyan).

export type AttachmentBubbleConfig = {
  icon: string;
  labelKey: TranslationKey;
  badge?: (raw: Record<string, unknown>) => string | null;
  body?: (raw: Record<string, unknown>) => ReactNode | null;
  accent?: string;
};

// queued_command.prompt (and potentially other attachment text fields) can arrive
// as either a plain string or a Claude content-block array. Coerce to a single
// string before rendering badges / snippets.
function attachmentTextValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const parts: string[] = [];
  for (const block of value as Array<Record<string, unknown>>) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    } else if (typeof block.content === "string") {
      parts.push(block.content);
    } else if (typeof block.content === "object" && block.content !== null) {
      const nested = attachmentTextValue(block.content);
      if (nested) parts.push(nested);
    }
  }
  return parts.length ? parts.join(" ") : null;
}

function fileBody(raw: Record<string, unknown>): ReactNode | null {
  const content = raw.attachment as Record<string, unknown> | undefined;
  const inner = content?.content as Record<string, unknown> | undefined;
  const fileData = inner?.file as Record<string, unknown> | undefined;
  const text = fileData?.content as string | undefined;
  if (!text) return null;
  const numLines = (fileData?.numLines as number) ?? (fileData?.totalLines as number);
  return (
    <div className="space-y-1">
      {numLines != null && (
        <div className="text-[0.6rem] text-assistant-soft/50 font-mono">{numLines} lines</div>
      )}
      <pre className="text-xs whitespace-pre-wrap break-all overflow-x-auto max-h-48">{text}</pre>
    </div>
  );
}

function editedTextBody(raw: Record<string, unknown>): ReactNode | null {
  const content = raw.attachment as Record<string, unknown> | undefined;
  const snippet = content?.snippet as string | undefined;
  if (!snippet) return null;
  return (
    <pre className="text-xs whitespace-pre-wrap break-all overflow-x-auto max-h-48">{snippet}</pre>
  );
}

function planFileBody(raw: Record<string, unknown>): ReactNode | null {
  const content = raw.attachment as Record<string, unknown> | undefined;
  const planContent = content?.planContent as string | undefined;
  if (!planContent) return null;
  return (
    <pre className="text-xs whitespace-pre-wrap break-all overflow-x-auto max-h-48">
      {planContent}
    </pre>
  );
}

function hookStdioBody(raw: Record<string, unknown>): ReactNode | null {
  const content = raw.attachment as Record<string, unknown> | undefined;
  const stdout = (content?.stdout as string) ?? "";
  const stderr = (content?.stderr as string) ?? "";
  if (!stdout && !stderr) return null;
  return (
    <div className="space-y-1">
      {stdout && (
        <pre className="text-xs whitespace-pre-wrap break-all overflow-x-auto max-h-32">
          {stdout}
        </pre>
      )}
      {stderr && (
        <pre className="text-xs whitespace-pre-wrap break-all overflow-x-auto max-h-32 text-error/80">
          {stderr}
        </pre>
      )}
    </div>
  );
}

function hookContextBody(raw: Record<string, unknown>): ReactNode | null {
  const content = raw.attachment as Record<string, unknown> | undefined;
  const items = content?.content as string[] | undefined;
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <pre
          key={`${item.slice(0, 40)}-${i}`}
          className="text-xs whitespace-pre-wrap break-all overflow-x-auto max-h-32"
        >
          {item}
        </pre>
      ))}
    </div>
  );
}

function diagnosticsBody(raw: Record<string, unknown>): ReactNode | null {
  const content = raw.attachment as Record<string, unknown> | undefined;
  const files = content?.files as
    | Array<{
        uri?: string;
        diagnostics?: Array<{
          message?: string;
          severity?: string;
          range?: {
            start?: { line?: number; character?: number };
            end?: { line?: number; character?: number };
          };
          source?: string;
          code?: string;
        }>;
      }>
    | undefined;
  if (!files || files.length === 0) return null;
  const withDiagnostics = files.filter((f) => f.diagnostics && f.diagnostics.length > 0);
  if (withDiagnostics.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {withDiagnostics.map((file, fi) => {
        const fileKey = file.uri ?? `unknown-${fi}`;
        const filePath = file.uri?.replace(/^file:\/\//, "") ?? null;
        return (
          <div key={fileKey} className="space-y-0.5">
            {filePath && (
              <div className="text-[0.6rem] text-assistant-soft/50 font-mono truncate">
                {filePath}
              </div>
            )}
            {file.diagnostics!.map((d, di) => (
              <div
                key={`${d.severity ?? "diag"}-${d.message?.slice(0, 30) ?? di}`}
                className="text-xs pl-1"
              >
                {d.severity && (
                  <span
                    className={d.severity === "Error" ? "text-error/80" : "text-assistant-soft/60"}
                  >
                    [{d.severity}]
                  </span>
                )}{" "}
                {d.range?.start?.line != null && (
                  <span className="opacity-50">
                    L{d.range.start.line}
                    {d.range.start.character != null ? `:${d.range.start.character}` : ""}:
                  </span>
                )}{" "}
                {d.message}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function selectedLinesBody(raw: Record<string, unknown>): ReactNode | null {
  const content = raw.attachment as Record<string, unknown> | undefined;
  const lines = content?.content as string | undefined;
  if (!lines) return null;
  return (
    <pre className="text-xs whitespace-pre-wrap break-all overflow-x-auto max-h-48">{lines}</pre>
  );
}

// ── Config entries for all 23 subtypes ──────────────────────────────────

const ATTACHMENT_CONFIG: Record<string, AttachmentBubbleConfig> = {
  // Mode transitions — simple system bubble, no body
  plan_mode: { icon: "plan", labelKey: "claude2.attachment.plan_mode" },
  plan_mode_exit: { icon: "plan", labelKey: "claude2.attachment.plan_mode_exit" },
  plan_mode_reentry: { icon: "plan", labelKey: "claude2.attachment.plan_mode_reentry" },
  auto_mode: { icon: "auto", labelKey: "claude2.attachment.auto_mode" },
  auto_mode_exit: { icon: "auto", labelKey: "claude2.attachment.auto_mode_exit" },

  // Files — collapsible bubbles
  file: {
    icon: "file",
    labelKey: "claude2.attachment.file",
    badge: (raw) => {
      const a = raw.attachment as Record<string, unknown>;
      return ((a?.displayPath as string) || (a?.filename as string)) ?? null;
    },
    body: fileBody,
  },
  edited_text_file: {
    icon: "edit",
    labelKey: "claude2.attachment.edited_text_file",
    badge: (raw) => ((raw.attachment as Record<string, unknown>)?.filename as string) ?? null,
    body: editedTextBody,
  },
  compact_file_reference: {
    icon: "file",
    labelKey: "claude2.attachment.compact_file_reference",
    badge: (raw) => {
      const a = raw.attachment as Record<string, unknown>;
      return ((a?.displayPath as string) || (a?.filename as string)) ?? null;
    },
  },
  plan_file_reference: {
    icon: "plan",
    labelKey: "claude2.attachment.plan_file_reference",
    badge: (raw) => ((raw.attachment as Record<string, unknown>)?.planFilePath as string) ?? null,
    body: planFileBody,
  },

  // Hooks — collapsible bubbles
  hook_success: {
    icon: "hook",
    labelKey: "claude2.attachment.hook_success",
    badge: (raw) => {
      const a = raw.attachment as Record<string, unknown>;
      const name = (a?.hookName as string) ?? "";
      const exit = a?.exitCode != null ? `exit ${a.exitCode}` : "";
      const dur = a?.durationMs != null ? `${a.durationMs}ms` : "";
      return [name, exit, dur].filter(Boolean).join(" ") || null;
    },
    body: hookStdioBody,
  },
  hook_non_blocking_error: {
    icon: "hook",
    labelKey: "claude2.attachment.hook_non_blocking_error",
    accent: "text-error/80",
    badge: (raw) => {
      const a = raw.attachment as Record<string, unknown>;
      const name = (a?.hookName as string) ?? "";
      const exit = a?.exitCode != null ? `exit ${a.exitCode}` : "";
      return [name, exit].filter(Boolean).join(" ") || null;
    },
    body: hookStdioBody,
  },
  hook_additional_context: {
    icon: "hook",
    labelKey: "claude2.attachment.hook_additional_context",
    badge: (raw) => ((raw.attachment as Record<string, unknown>)?.hookName as string) ?? null,
    body: hookContextBody,
  },

  // Environment — single-line or collapsible
  date_change: {
    icon: "calendar",
    labelKey: "claude2.attachment.date_change",
    badge: (raw) => ((raw.attachment as Record<string, unknown>)?.newDate as string) ?? null,
  },
  queued_command: {
    icon: "queue",
    labelKey: "claude2.attachment.queued_command",
    badge: (raw) => {
      const prompt = (raw.attachment as Record<string, unknown>)?.prompt;
      const text = attachmentTextValue(prompt);
      return text ? text.slice(0, 60) : null;
    },
  },
  opened_file_in_ide: {
    icon: "file",
    labelKey: "claude2.attachment.opened_file_in_ide",
    badge: (raw) => ((raw.attachment as Record<string, unknown>)?.filename as string) ?? null,
  },
  selected_lines_in_ide: {
    icon: "edit",
    labelKey: "claude2.attachment.selected_lines_in_ide",
    badge: (raw) => {
      const a = raw.attachment as Record<string, unknown>;
      const start = a?.lineStart;
      const end = a?.lineEnd;
      return start != null ? (end != null ? `L${start}-L${end}` : `L${start}`) : null;
    },
    body: selectedLinesBody,
  },
  diagnostics: {
    icon: "search",
    labelKey: "claude2.attachment.diagnostics",
    badge: (raw) => {
      const a = raw.attachment as Record<string, unknown>;
      const files = a?.files as Array<unknown> | undefined;
      return files ? `${files.length} files` : null;
    },
    body: diagnosticsBody,
  },
  goal_status: {
    icon: "goal",
    labelKey: "claude2.attachment.goal_status",
    badge: (raw) => {
      const a = raw.attachment as Record<string, unknown>;
      const met = a?.met;
      const condition = a?.condition as string | undefined;
      if (met === false) {
        return condition ? `incomplete: ${condition}` : "incomplete";
      }
      return condition ? `condition: ${condition}` : null;
    },
  },
};

// ── Component ───────────────────────────────────────────────────────────

export function AttachmentBubble({
  subtype,
  raw,
}: {
  subtype: string;
  raw: Record<string, unknown>;
}) {
  const { t } = useT();
  const config = ATTACHMENT_CONFIG[subtype];
  if (!config) {
    return (
      <div className="flex items-center gap-1.5">
        <ToolHead
          icon="task"
          badge={subtype}
          badgeClassName="bg-user/15 text-user-soft"
          status={null}
        />
      </div>
    );
  }

  const badgeText = config.badge?.(raw) ?? null;
  const bodyContent = config.body?.(raw) ?? null;
  // accent now only signals an error subtype → badge renders red instead of cyan.
  const isError = config.accent?.includes("red") ?? false;
  const badgeClassName = isError ? "bg-error/15 text-error" : "bg-user/15 text-user-soft";

  const header = (
    <div className="flex items-center gap-1.5 text-xs min-w-0">
      <ToolHead
        icon={config.icon}
        badge={t(config.labelKey)}
        badgeClassName={badgeClassName}
        detail={badgeText}
        detailClassName="font-mono text-[0.65rem] font-normal text-on-surface-muted"
        status={null}
      />
    </div>
  );

  if (!bodyContent) {
    return <div className="flex items-center gap-1.5">{header}</div>;
  }

  return (
    <CollapsibleSection className="min-w-0" dividerClassName="border-user-deep/20" header={header}>
      {bodyContent}
    </CollapsibleSection>
  );
}
