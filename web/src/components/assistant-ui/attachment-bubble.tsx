import { type ReactNode } from "react";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import { CollapsibleSection } from "./collapsible-section";

// ── Inline icon SVGs (same convention as tool-ui-registry Icons map) ───

const Icons: Record<string, string> = {
  file: '<path d="M4 2h6l4 4v10a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2zm6 1.4V6h2.6L10 3.4zM3 4v12a1 1 0 001 1h8a1 1 0 001-1V7h-4V3H4a1 1 0 00-1 1z" fill="currentColor"/>',
  edit: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>',
  plan: '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 9h18M9 3v18" stroke="currentColor" stroke-width="1.5"/><circle cx="6.5" cy="6.5" r="1" fill="currentColor"/><circle cx="15.5" cy="13.5" r="1" fill="currentColor"/><path d="M9 15h10" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><path d="M3 18h6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>',
  task: '<circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 21c0-4 3.1-7 7-7s7 3 7 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  skill:
    '<path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" fill="currentColor"/><path d="M5 15l1 3.5L9.5 19.5 6.5 21 5 24l-1.5-3L0 19.5 3.5 18 5 15z" fill="currentColor" opacity="0.5"/>',
  mcp: '<circle cx="5" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="19" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  command:
    '<path d="M7 7l4 5-4 5M13 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  globe:
    '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="4" ry="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" stroke="currentColor" stroke-width="1.5"/>',
  search:
    '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M20 20l-3.3-3.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  hook: '<path d="M6 2v20M6 2l4 4M6 2L2 6M18 22V2m0 20l4-4m-4 4l-4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  goal: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  auto: '<path d="M12 2l3 7 7 1-5 5 2 7-7-4-7 4 2-7-5-5 7-1 3-7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 10h18M8 2v4M16 2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  queue:
    '<path d="M5 3h14l-3 6 3 6H5m9-12v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
};

function AttachmentIcon({ name, className }: { name: string; className?: string }) {
  const d = Icons[name] ?? Icons.task;
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 ${className ?? ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <g dangerouslySetInnerHTML={{ __html: d }} />
    </svg>
  );
}

// ── Config map ──────────────────────────────────────────────────────────
//
// Each subtype maps to an icon + i18n label key, with optional
// badge (inline text next to label) and body (expandable content).
// When body is null, the bubble renders as a single non-collapsible line.
// accent overrides the default amber text color.

export type AttachmentBubbleConfig = {
  icon: string;
  labelKey: TranslationKey;
  badge?: (raw: Record<string, unknown>) => string | null;
  body?: (raw: Record<string, unknown>) => ReactNode | null;
  accent?: string;
};

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
        <div className="text-[0.6rem] text-amber-200/50 font-mono">{numLines} lines</div>
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
        <pre className="text-xs whitespace-pre-wrap break-all overflow-x-auto max-h-32 text-red-300/80">
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
              <div className="text-[0.6rem] text-amber-200/50 font-mono truncate">{filePath}</div>
            )}
            {file.diagnostics!.map((d, di) => (
              <div
                key={`${d.severity ?? "diag"}-${d.message?.slice(0, 30) ?? di}`}
                className="text-xs pl-1"
              >
                {d.severity && (
                  <span
                    className={d.severity === "Error" ? "text-red-300/80" : "text-amber-200/60"}
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
    accent: "text-red-300/80",
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
    badge: (raw) =>
      ((raw.attachment as Record<string, unknown>)?.prompt as string)?.slice(0, 60) ?? null,
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
      <div className="text-xs text-amber-200/80 font-mono whitespace-pre-wrap break-all">
        Attachment: {subtype}
      </div>
    );
  }

  const badgeText = config.badge?.(raw) ?? null;
  const bodyContent = config.body?.(raw) ?? null;
  const accent = config.accent ?? "text-amber-200/80";

  const header = (
    <div className={`flex items-center gap-1.5 text-xs min-w-0 ${accent}`}>
      <AttachmentIcon name={config.icon} className="h-3 w-3 opacity-60" />
      <span>{t(config.labelKey)}</span>
      {badgeText && (
        <span className="truncate opacity-70 font-mono text-[0.65rem]">{badgeText}</span>
      )}
    </div>
  );

  if (!bodyContent) {
    return <div className="flex items-center gap-1.5">{header}</div>;
  }

  return (
    <CollapsibleSection className="min-w-0" dividerClassName="border-amber-700/20" header={header}>
      {bodyContent}
    </CollapsibleSection>
  );
}
