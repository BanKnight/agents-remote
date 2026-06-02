import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export type ShellTone = "default" | "accent" | "success" | "warning" | "danger" | "muted";

const markerToneClasses: Record<ShellTone, string> = {
  default: "border-slate-700 bg-slate-900 text-slate-200",
  accent: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  success: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  warning: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  danger: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  muted: "border-slate-800 bg-slate-950/80 text-slate-400",
};

const pillToneClasses: Record<ShellTone, string> = {
  default: "border-slate-800 bg-slate-950/80 text-slate-100",
  accent: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
  success: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  warning: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  danger: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  muted: "border-slate-800 bg-slate-950/70 text-slate-300",
};

const buttonToneClasses: Record<ShellTone, string> = {
  default:
    "border-slate-700 bg-slate-900/50 text-slate-200 hover:border-slate-500 hover:bg-slate-900/80",
  accent:
    "border-transparent bg-gradient-to-br from-cyan-300 to-violet-400 text-slate-950 shadow-lg shadow-cyan-950/25 hover:from-cyan-200 hover:to-violet-300",
  success:
    "border-emerald-300/40 bg-emerald-300/10 text-emerald-100 hover:border-emerald-200/70 hover:bg-emerald-300/15",
  warning:
    "border-amber-300/40 bg-amber-300/10 text-amber-100 hover:border-amber-200/70 hover:bg-amber-300/15",
  danger:
    "border-rose-300/40 bg-rose-300/10 text-rose-100 hover:border-rose-200/70 hover:bg-rose-300/15",
  muted:
    "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:bg-slate-900/70",
};

export const shellSurfaceClasses = {
  shell: "bg-[#0f1520]/[0.20]",
  sidebar: "bg-gradient-to-b from-[#141b28]/[0.25] to-[#0a0e16]/[0.30]",
  workspace: "border border-white/10 bg-[#141b28]/15",
  header: "border border-white/10 bg-slate-950/20",
  floatingHeader: "sm:border sm:border-white/10 sm:bg-slate-950/20",
  bottomNav: "border-t border-slate-700/80",
  runtimeHeader: "border-b border-slate-700/80",
  runtimeBody: "bg-[#05080d]/15",
  runtimeComposer: "border-t border-slate-700/80",
  terminalTitlebar: "border-b border-slate-700/45 bg-[#141b28]/25",
  raised: "border border-slate-700/40 bg-[#141b28]/25",
  raisedHover: "hover:border-cyan-300/60 hover:bg-[#141b28]/40",
  dashed: "border border-dashed border-slate-700/70 bg-[#141b28]/20",
  inset: "border border-slate-700/35 bg-[#05080d]/10",
  code: "border border-slate-700/45",
  danger: "border border-rose-300/25 bg-rose-950/10",
  warning: "border border-amber-300/25 bg-amber-950/10",
};

type IconMarkerProps = {
  children: ReactNode;
  size?: "sm" | "md";
  tone?: ShellTone;
};

const markerSizeClasses: Record<NonNullable<IconMarkerProps["size"]>, string> = {
  sm: "h-7 w-7 rounded-[0.625rem] text-[0.65rem]",
  md: "h-10 w-10 rounded-[0.9375rem] text-xs",
};

export function IconMarker({ children, size = "md", tone = "default" }: IconMarkerProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center border font-semibold uppercase ${markerSizeClasses[size]} ${markerToneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

type NavItemContentProps = {
  active?: boolean;
  description?: ReactNode;
  interactive?: boolean;
  label: ReactNode;
  marker: ReactNode;
  meta?: ReactNode;
  orientation?: "horizontal" | "vertical";
};

export function NavItemContent({
  active = false,
  description,
  interactive = false,
  label,
  marker,
  meta,
  orientation = "horizontal",
}: NavItemContentProps) {
  const layoutClass =
    orientation === "vertical"
      ? "grid justify-items-center gap-1 text-center"
      : "flex items-center gap-2.5 px-3 py-2.5 text-left";
  const stateClass =
    orientation === "vertical"
      ? active
        ? "text-cyan-300"
        : interactive
          ? "text-slate-400 hover:text-slate-100"
          : "text-slate-500"
      : active
        ? "bg-cyan-300/10 text-slate-100"
        : interactive
          ? "text-slate-400 hover:bg-slate-800/45 hover:text-slate-100"
          : "text-slate-500";
  const shapeClass = orientation === "vertical" ? "" : "rounded-[0.875rem]";
  const interactionClass = interactive ? "cursor-pointer" : "";

  return (
    <span
      className={`w-full min-w-0 transition ${layoutClass} ${stateClass} ${shapeClass} ${interactionClass}`}
    >
      {marker}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.68rem] font-bold sm:text-sm">{label}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs text-slate-500">{description}</span>
        ) : null}
      </span>
      {meta}
    </span>
  );
}

type StatusPillProps = {
  label?: string;
  tone?: ShellTone;
  value: ReactNode;
};

export function StatusPill({ label, tone = "default", value }: StatusPillProps) {
  return (
    <Badge
      className={`h-auto max-w-full flex-col rounded-full px-2.5 py-1.5 ${pillToneClasses[tone]}`}
      variant="outline"
    >
      {label ? (
        <span className="text-[0.6rem] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      ) : null}
      <span className="truncate text-xs font-semibold capitalize">{value}</span>
    </Badge>
  );
}

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ShellTone;
};

type ActionButtonClassOptions = {
  className?: string;
  tone?: ShellTone;
};

export function actionButtonClasses({
  className = "",
  tone = "default",
}: ActionButtonClassOptions = {}) {
  return `inline-flex h-auto cursor-pointer items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-bold transition ${buttonToneClasses[tone]} ${className}`;
}

export function ActionButton({
  children,
  className = "",
  tone = "default",
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <Button
      {...props}
      className={actionButtonClasses({
        tone,
        className: `disabled:cursor-not-allowed disabled:opacity-50 ${className}`,
      })}
      size="sm"
      type={type}
      variant="ghost"
    >
      {children}
    </Button>
  );
}

type ShellInputProps = ComponentProps<typeof Input>;

export function ShellInput({ className = "", ...props }: ShellInputProps) {
  return (
    <Input
      {...props}
      className={`h-auto rounded-2xl border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus-visible:border-cyan-300 focus-visible:ring-cyan-300/20 ${className}`}
    />
  );
}

type ListRowProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  actions?: ReactNode;
  marker?: ReactNode;
  meta?: ReactNode;
  selected?: boolean;
  subtitle?: ReactNode;
  title: ReactNode;
};

export function ListRow({
  actions,
  className = "",
  marker,
  meta,
  selected = false,
  subtitle,
  title,
  ...props
}: ListRowProps) {
  return (
    <div
      {...(props as React.HTMLAttributes<HTMLDivElement>)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (e.currentTarget as HTMLDivElement).click();
        }
      }}
      className={`flex h-auto w-full min-w-0 cursor-pointer items-center justify-start rounded-xl px-3 py-2.5 text-left transition ${
        selected
          ? "border border-cyan-300/60 bg-cyan-300/10"
          : `${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`
      } ${className}`}
    >
      <span className="flex min-w-0 grow items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-3">
          {marker}
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-100" data-list-row-title>
              {title}
            </span>
            {subtitle ? (
              <span className="mt-0.5 block truncate text-xs text-slate-500">{subtitle}</span>
            ) : null}
          </span>
        </span>
        {meta ? <span className="flex shrink-0 items-center gap-1.5">{meta}</span> : null}
        {actions ? <span className="flex shrink-0 items-center">{actions}</span> : null}
      </span>
    </div>
  );
}
