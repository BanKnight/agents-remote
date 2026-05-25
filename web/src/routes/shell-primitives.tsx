import type { ButtonHTMLAttributes, ReactNode } from "react";

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
  default: "border-slate-700 text-slate-200 hover:border-slate-500",
  accent: "border-cyan-300/40 text-cyan-100 hover:border-cyan-200/70",
  success: "border-emerald-300/40 text-emerald-100 hover:border-emerald-200/70",
  warning: "border-amber-300/40 text-amber-100 hover:border-amber-200/70",
  danger: "border-rose-300/40 text-rose-100 hover:border-rose-200/70",
  muted: "border-slate-800 text-slate-400 hover:border-slate-600",
};

type IconMarkerProps = {
  children: ReactNode;
  tone?: VisualTone;
};

export function IconMarker({ children, tone = "default" }: IconMarkerProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border text-xs font-semibold uppercase ${markerToneClasses[tone]}`}
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
};

export function NavItemContent({
  active = false,
  description,
  label,
  marker,
  meta,
}: NavItemContentProps) {
  return (
    <span
      className={`flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
        active
          ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-50"
          : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-600 hover:text-slate-100"
      }`}
    >
      {marker}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
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
    <span
      className={`inline-flex max-w-full flex-col rounded-2xl border px-3 py-2 ${pillToneClasses[tone]}`}
    >
      {label ? (
        <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">{label}</span>
      ) : null}
      <span className="truncate text-xs font-semibold capitalize sm:text-sm">{value}</span>
    </span>
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
    <button
      {...props}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonToneClasses[tone]} ${className}`}
      type={type}
    >
      {children}
    </button>
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
    <button
      {...props}
      className={`min-w-0 rounded-2xl border px-3 py-2.5 text-left transition ${
        selected
          ? "border-cyan-300/60 bg-cyan-300/10"
          : "border-slate-800 bg-slate-950/70 hover:border-slate-600"
      } ${className}`}
      type={type}
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
    </button>
  );
}
