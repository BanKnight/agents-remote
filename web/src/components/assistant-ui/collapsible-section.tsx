import { useState, type ReactNode } from "react";

// Standard collapsible section for content nested inside a chat bubble.
//
// Borderless by design — the parent bubble provides the visual boundary, and
// padding comes from the parent bubble. This component only adds a toggle
// header and a thin divider above the expanded content, so inline sections
// (thinking, file-history-snapshot, etc.) share one consistent density.
//
// Theming: the toggle arrow inherits `currentColor` at reduced opacity, so set
// the section's text color via `className`. Pass `dividerClassName` to match.
export function CollapsibleSection({
  header,
  children,
  defaultExpanded = false,
  className = "",
  dividerClassName = "border-slate-700/20",
}: {
  header: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
  dividerClassName?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className={className}>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-left hover:opacity-80 transition cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-[0.6rem] shrink-0 opacity-70">{expanded ? "▾" : "▸"}</span>
        {header}
      </button>
      {expanded ? (
        <div className={`mt-1.5 border-t pt-1.5 ${dividerClassName}`}>{children}</div>
      ) : null}
    </div>
  );
}
