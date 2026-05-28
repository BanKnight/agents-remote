import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type VisualTone = "default" | "accent" | "success" | "warning" | "danger" | "muted";

const markerToneClasses: Record<VisualTone, string> = {
  default: "border-slate-700 bg-slate-900 text-slate-200",
  accent: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  success: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  warning: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  danger: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  muted: "border-slate-800 bg-slate-950/80 text-slate-400",
};

const pillToneClasses: Record<VisualTone, string> = {
  default: "border-slate-800 bg-slate-950/80 text-slate-100",
  accent: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
  success: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  warning: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  danger: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  muted: "border-slate-800 bg-slate-950/70 text-slate-300",
};

const buttonToneClasses: Record<VisualTone, string> = {
  default: "border-slate-700 bg-slate-900/50 text-slate-200 hover:border-slate-500 hover:bg-slate-900/80",
  accent:
    "border-transparent bg-gradient-to-br from-cyan-300 to-violet-400 text-slate-950 shadow-lg shadow-cyan-950/25 hover:from-cyan-200 hover:to-violet-300",
  success: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100 hover:border-emerald-200/70 hover:bg-emerald-300/15",
  warning: "border-amber-300/40 bg-amber-300/10 text-amber-100 hover:border-amber-200/70 hover:bg-amber-300/15",
  danger: "border-rose-300/40 bg-rose-300/10 text-rose-100 hover:border-rose-200/70 hover:bg-rose-300/15",
  muted: "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:bg-slate-900/70",
};

type IconMarkerProps = {
  children: ReactNode;
  size?: "sm" | "md";
  tone?: VisualTone;
};

const markerSizeClasses: Record<NonNullable<IconMarkerProps["size"]>, string> = {
  sm: "h-7 w-7 rounded-lg text-[0.65rem]",
  md: "h-9 w-9 rounded-xl text-xs",
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
  label: ReactNode;
  marker: ReactNode;
  meta?: ReactNode;
  orientation?: "horizontal" | "vertical";
};

export function NavItemContent({
  active = false,
  description,
  label,
  marker,
  meta,
  orientation = "horizontal",
}: NavItemContentProps) {
  const layoutClass =
    orientation === "vertical"
      ? "grid justify-items-center gap-1 px-1.5 py-1.5 text-center"
      : "flex items-center gap-3 px-3 py-2.5 text-left";

  return (
    <span
      className={`min-w-0 rounded-xl border transition ${layoutClass} ${
        active
          ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-50"
          : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-600 hover:text-slate-100"
      }`}
    >
      {marker}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold sm:text-sm">{label}</span>
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
  tone?: VisualTone;
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
  tone?: VisualTone;
};

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
      className={`h-auto rounded-xl border px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonToneClasses[tone]} ${className}`}
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
  marker?: ReactNode;
  meta?: ReactNode;
  selected?: boolean;
  subtitle?: ReactNode;
  title: ReactNode;
};

export function ListRow({
  className = "",
  marker,
  meta,
  selected = false,
  subtitle,
  title,
  type = "button",
  ...props
}: ListRowProps) {
  return (
    <Button
      {...props}
      className={`h-auto min-w-0 justify-start rounded-xl border px-3 py-2.5 text-left transition hover:bg-slate-950/80 ${
        selected
          ? "border-cyan-300/60 bg-cyan-300/10"
          : "border-slate-800 bg-slate-950/70 hover:border-slate-600"
      } ${className}`}
      type={type}
      variant="ghost"
    >
      <span className="flex min-w-0 items-center justify-between gap-2">
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
      </span>
    </Button>
  );
}
