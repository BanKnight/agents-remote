import { type ReactNode } from "react";

// ── Unified icon map ──────────────────────────────────────────────────
// Single source for tool + card icons. Merges the registry `Icons` from
// tool-ui-registry.tsx with the card bespoke glyphs (PlanGlyph /
// QuestionGlyph). All entries use SVG-attribute (kebab-case) format so
// they compose inside a <g dangerouslySetInnerHTML>.

export const ToolIcons: Record<string, string> = {
  // Terminal / shell: monitor with a `>_` prompt.
  terminal:
    '<rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 10l3 3-3 3M10 16h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  // Read: an open book / page.
  read: '<path d="M4 5h6a2 2 0 012 2v11H6a2 2 0 01-2-2V5zM14 5h6v11a2 2 0 01-2 2h-6V7a2 2 0 012-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 5v13" stroke="currentColor" stroke-width="1.5"/>',
  // Write / edit: document with a pencil.
  write:
    '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M18.5 2.5a2.1 2.1 0 013 3L10 17l-3.5.5.5-3.5L18.5 2.5z" fill="currentColor"/>',
  edit: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>',
  search:
    '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M20 20l-3.3-3.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  // Glob: a document with a wildcard spark.
  file: '<path d="M4 2h6l4 4v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 2v4h4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M17 6l-1.5 1.5M17 6l1.5 1.5M17 6v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  puzzle:
    '<path d="M4 8h2V6a2 2 0 012-2h1V2h2v2h1a2 2 0 012 2v2h2v2h-2v1a2 2 0 01-2 2h-1v2H9v-2H8a2 2 0 01-2-2v-1H4V8zm3 1H5v4h2v1a1 1 0 001 1h1v2h2v-2h1a1 1 0 001-1v-1h2V9h-2V8a1 1 0 00-1-1h-1V5H9v2H8a1 1 0 00-1 1v1z" fill="currentColor"/>',
  // Skill: a spark / star — clearer than a puzzle piece for an invoked capability.
  skill:
    '<path d="M12 2l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 2z" fill="currentColor"/>',
  // Web search: magnifying glass with a small globe ring.
  webSearch:
    '<circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M16 16l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M11 5a6 6 0 010 12" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>',
  // Web fetch: an arrow downloading into a tray.
  webFetch:
    '<path d="M12 4v10M7 11l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 18h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  mcp: '<circle cx="5" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="19" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  // Task: a checklist with checkboxes.
  task: '<rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 9h2M8 13h2M8 17h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M13 9h3M13 13h3M13 17h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  code: '<path d="M8 3L3 9l5 6M16 3l5 6-5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  globe:
    '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="4" ry="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" stroke="currentColor" stroke-width="1.5"/>',
  question:
    '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2.5-2.5 3.5V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="17.5" r="0.75" fill="currentColor"/>',
  // Command: a `/`-style prompt to distinguish from Bash terminal.
  command:
    '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 10l3 3-3 3M13 15h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  // plan: clipboard-with-check.
  plan: '<path d="M9 3h6l1 2h2a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h2l1-2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 13l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  agent:
    '<circle cx="6" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="17" cy="17" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 8l7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  // Notebook: a notebook with a spiral binding.
  notebook:
    '<rect x="6" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 7h14M6 11h14M6 15h14M6 19h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M4 6h1M4 10h1M4 14h1M4 18h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
};

export const DEFAULT_TOOL_ICON = "command";

export function ToolIcon({ name, className }: { name: string; className?: string }) {
  const d = ToolIcons[name] ?? ToolIcons[DEFAULT_TOOL_ICON];
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

// ── ToolHead ───────────────────────────────────────────────────────────
// Shared identity + status row used by tool cards (registry + fallback)
// AND interactive cards (ExitPlanMode / AskUserQuestion / AgentContainer).
//
// Layout: [status?] [icon] [badge] [detail] [trailing?]
//
//  status   — leftmost; colored dot (running pulses, interrupted amber,
//             error red).
//  icon     — per-tool glyph from ToolIcons.
//  badge    — colored background pill (the tool type / interaction type).
//  detail   — trailing specific info (path, command, query, description).
//  trailing — optional rightmost hint (chars count, etc.).

export type ToolHeadStatus = "running" | "interrupted" | "error";

export function ToolHead({
  icon,
  iconClassName,
  badge,
  badgeClassName = "bg-cyan-500/15 text-cyan-200",
  detail,
  status,
  trailing,
}: {
  icon: string;
  iconClassName?: string;
  badge?: string | null;
  badgeClassName?: string;
  detail?: string | null;
  status?: ToolHeadStatus | null;
  trailing?: ReactNode;
}) {
  return (
    <>
      {status === "running" ? (
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-cyan-400" />
      ) : status === "interrupted" ? (
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
      ) : status === "error" ? (
        <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" />
      ) : null}
      <ToolIcon name={icon} className={iconClassName} />
      {badge ? (
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-wide ${badgeClassName}`}
        >
          {badge}
        </span>
      ) : null}
      {detail ? (
        <span className="min-w-0 truncate text-xs font-medium text-slate-300">{detail}</span>
      ) : null}
      {trailing ? <span className="ml-auto shrink-0">{trailing}</span> : null}
    </>
  );
}
