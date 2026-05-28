import type { ComponentProps, ReactNode } from "react";

import { Card } from "../ui/card";

type ShellLayoutVariant = "home" | "project";

const shellMainClasses: Record<ShellLayoutVariant, string> = {
  home: "min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_18%_12%,rgba(125,211,252,0.14),transparent_28rem),radial-gradient(circle_at_85%_5%,rgba(167,139,250,0.16),transparent_28rem),#080b10] px-3 pb-24 pt-3 text-slate-100 sm:px-6 sm:pt-5 lg:p-7",
  project:
    "min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(125,211,252,0.16),transparent_30rem),radial-gradient(circle_at_82%_12%,rgba(167,139,250,0.14),transparent_28rem),#080b10] px-3 pb-24 pt-3 text-slate-100 sm:px-6 sm:py-4 lg:p-7",
};

const shellGridClasses: Record<ShellLayoutVariant, string> = {
  home: "mx-auto grid min-h-[calc(100dvh-1.5rem)] w-full max-w-7xl min-w-0 gap-4 sm:min-h-[calc(100dvh-2.5rem)] lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[13.75rem_minmax(0,1fr)] lg:gap-0 lg:overflow-hidden lg:rounded-[1.75rem] lg:border lg:border-slate-700/70 lg:bg-[#0f1520]/[0.92] lg:shadow-[0_26px_80px_rgba(0,0,0,0.38)]",
  project:
    "mx-auto grid min-h-[calc(100dvh-1.5rem)] w-full max-w-7xl min-w-0 gap-4 sm:min-h-[calc(100dvh-2rem)] lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[13.125rem_minmax(0,1fr)] lg:gap-0 lg:overflow-hidden lg:rounded-[1.75rem] lg:border lg:border-slate-700/70 lg:bg-[#0f1520]/[0.92] lg:shadow-[0_26px_80px_rgba(0,0,0,0.38)]",
};

const shellHeaderClasses: Record<ShellLayoutVariant, string> = {
  home: "flex-row min-w-0 items-center justify-between gap-3 rounded-[1.75rem] border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 shadow-2xl shadow-black/25 ring-0 backdrop-blur sm:rounded-[2rem] sm:px-5 sm:py-4 lg:rounded-none lg:border-0 lg:border-b lg:border-slate-700/80 lg:bg-transparent lg:px-5 lg:py-4 lg:shadow-none lg:backdrop-blur-0",
  project:
    "min-w-0 gap-0 rounded-[1.5rem] border border-white/10 bg-slate-950/80 px-4 py-3 text-slate-100 shadow-2xl shadow-black/30 ring-0 backdrop-blur sm:px-5 sm:py-4 lg:rounded-none lg:border-0 lg:border-b lg:border-slate-700/80 lg:bg-transparent lg:px-5 lg:py-4 lg:shadow-none lg:backdrop-blur-0",
};

const shellHeaderTitleClasses: Record<ShellLayoutVariant, string> = {
  home: "mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl",
  project: "mt-1 truncate text-2xl font-semibold tracking-tight",
};

type ShellLayoutProps = {
  bottomNavigation?: ReactNode;
  children: ReactNode;
  sidebar: ReactNode;
  variant: ShellLayoutVariant;
};

export function ShellLayout({ bottomNavigation, children, sidebar, variant }: ShellLayoutProps) {
  return (
    <main className={shellMainClasses[variant]}>
      <div className={shellGridClasses[variant]}>
        {sidebar}
        <div className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:gap-0">{children}</div>
      </div>
      {bottomNavigation}
    </main>
  );
}

type ShellSidebarProps = {
  children: ReactNode;
  display?: "block" | "flex";
};

export function ShellSidebar({ children, display = "block" }: ShellSidebarProps) {
  const displayClass = display === "flex" ? "lg:flex lg:flex-col" : "lg:block";

  return (
    <aside className={`hidden min-h-0 min-w-0 overflow-hidden ${displayClass}`}>
      <Card className="h-full min-h-0 gap-0 rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-3 py-3 text-slate-100 shadow-2xl shadow-black/30 ring-0 lg:rounded-none lg:border-0 lg:border-r lg:border-slate-700/80 lg:bg-gradient-to-b lg:from-[#141b28]/[0.92] lg:to-[#0a0e16]/[0.96] lg:shadow-none">
        {children}
      </Card>
    </aside>
  );
}

type ShellPanelProps = ComponentProps<typeof Card> & {
  density?: "default" | "compact";
  docked?: boolean;
};

export function ShellPanel({
  children,
  className = "",
  density = "default",
  docked = false,
  ...props
}: ShellPanelProps) {
  const densityClass =
    density === "compact" ? "p-3 py-3 sm:p-4 sm:py-4" : "p-4 py-4 sm:p-5 sm:py-5 lg:p-6 lg:py-6";
  const dockedClass = docked
    ? "lg:flex-1 lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:ring-0 lg:overflow-y-auto"
    : "";
  const size = density === "compact" ? "sm" : "default";

  return (
    <Card
      {...props}
      className={`min-w-0 gap-0 rounded-[1.5rem] border border-white/10 bg-[#141b28]/80 text-slate-100 shadow-xl shadow-black/20 ring-0 ${densityClass} ${dockedClass} ${className}`}
      size={size}
    >
      {children}
    </Card>
  );
}

type ShellHeaderSurfaceProps = {
  actions?: ReactNode;
  eyebrow: ReactNode;
  mobileMeta?: ReactNode;
  title: ReactNode;
  variant: ShellLayoutVariant;
};

export function ShellHeaderSurface({
  actions,
  eyebrow,
  mobileMeta,
  title,
  variant,
}: ShellHeaderSurfaceProps) {
  const headerContent = (
    <>
      <div className="min-w-0">
        <p className="truncate text-xs leading-5 text-slate-400">{eyebrow}</p>
        <h1 className={shellHeaderTitleClasses[variant]}>{title}</h1>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </>
  );

  if (variant === "home") {
    return (
      <header className="min-w-0">
        <Card className={shellHeaderClasses.home}>{headerContent}</Card>
      </header>
    );
  }

  return (
    <header className="min-w-0">
      <Card className={shellHeaderClasses.project}>
        <div className="flex min-w-0 items-center justify-between gap-3">{headerContent}</div>
        {mobileMeta ? <div className="mt-2 sm:hidden">{mobileMeta}</div> : null}
      </Card>
    </header>
  );
}
