import { useState, type ReactNode } from "react";

// Standard collapsible section for content nested inside a chat bubble.
//
// Borderless by design — the parent bubble provides the visual boundary, and
// padding comes from the parent bubble. This component only adds a toggle
// header and a thin divider above the expanded content, so inline sections
// (thinking, file-history-snapshot, tool_use, etc.) share one consistent density.
//
// `header` may be a node or a function of `expanded` (use the function when
// collapsed-state hints depend on expansion, e.g. tool result-size preview).
// The expanded block is skipped when `children` is null, so no stray divider.
//
// Theming: the toggle arrow inherits `currentColor` at reduced opacity, so set
// the section's text color via `className`. Pass `dividerClassName` to match.
export function CollapsibleSection({
  header,
  children,
  defaultExpanded = false,
  className = "",
  dividerClassName = "border-neutral-line/20",
}: {
  header: ReactNode | ((expanded: boolean) => ReactNode);
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
        {typeof header === "function" ? header(expanded) : header}
      </button>
      {expanded && children ? (
        <div className={`mt-1.5 border-t pt-1.5 ${dividerClassName}`}>{children}</div>
      ) : null}
    </div>
  );
}
