import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Card } from "../ui/card";
import { shellSurfaceClasses } from "./shell-primitives";

type ShellLayoutVariant = "home" | "project";

const shellMainClasses: Record<ShellLayoutVariant, string> = {
  home: "h-dvh overflow-hidden bg-[radial-gradient(circle_at_18%_12%,rgba(125,211,252,0.14),transparent_28rem),radial-gradient(circle_at_85%_5%,rgba(167,139,250,0.16),transparent_28rem),#080b10] text-slate-100 sm:h-auto sm:min-h-dvh sm:px-6 sm:pb-24 sm:pt-5 lg:p-7",
  project:
    "h-dvh overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(125,211,252,0.16),transparent_30rem),radial-gradient(circle_at_82%_12%,rgba(167,139,250,0.14),transparent_28rem),#080b10] text-slate-100 sm:h-auto sm:min-h-dvh sm:px-6 sm:py-4 lg:p-7",
};

const shellGridClasses: Record<ShellLayoutVariant, string> = {
  home: "mx-auto grid h-[calc(100dvh-4.25rem-env(safe-area-inset-bottom))] w-full max-w-7xl min-w-0 overflow-hidden shadow-[0_26px_80px_rgba(0,0,0,0.38)] sm:h-auto sm:min-h-[calc(100dvh-8rem)] sm:rounded-[1.75rem] sm:border sm:border-slate-700/70 lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[13.75rem_minmax(0,1fr)]",
  project:
    "mx-auto grid h-[calc(100dvh-4.25rem-env(safe-area-inset-bottom))] w-full max-w-7xl min-w-0 overflow-hidden shadow-[0_26px_80px_rgba(0,0,0,0.38)] sm:h-auto sm:min-h-[calc(100dvh-7.5rem)] sm:rounded-[1.75rem] sm:border sm:border-slate-700/70 lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[13.125rem_minmax(0,1fr)]",
};

const shellHeaderClasses: Record<ShellLayoutVariant, string> = {
  home: "flex-row min-w-0 items-center justify-between gap-3 border-0 bg-transparent p-0 text-slate-100 shadow-none ring-0",
  project:
    "min-w-0 gap-0 rounded-none border-0 border-b border-slate-700/80 bg-transparent px-4 py-3 text-slate-100 shadow-none ring-0 sm:rounded-[1.5rem] sm:px-5 sm:py-4 sm:shadow-2xl sm:shadow-black/30 sm:backdrop-blur lg:rounded-none lg:border-0 lg:border-b lg:border-slate-700/80 lg:bg-transparent lg:px-5 lg:py-4 lg:shadow-none lg:backdrop-blur-0",
};

const shellHeaderTitleClasses: Record<ShellLayoutVariant, string> = {
  home: "mt-1 truncate text-xl font-semibold tracking-tight sm:text-3xl",
  project: "mt-0 truncate text-base font-semibold tracking-tight sm:mt-1 sm:text-2xl",
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
      <div className={`${shellGridClasses[variant]} ${shellSurfaceClasses.shell}`}>
        {sidebar}
        <div className="flex min-w-0 flex-col gap-0 lg:min-h-0">{children}</div>
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
      <Card className={`h-full min-h-0 gap-0 rounded-[1.75rem] p-3 py-3 text-slate-100 shadow-2xl shadow-black/30 ring-0 lg:rounded-none lg:border-0 lg:border-r lg:border-slate-700/80 lg:shadow-none ${shellSurfaceClasses.header} ${shellSurfaceClasses.sidebar}`}>
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
    ? "flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 overflow-y-auto"
    : "";
  const size = density === "compact" ? "sm" : "default";

  return (
    <Card
      {...props}
      className={cn(
        `min-w-0 gap-0 rounded-[1.5rem] text-slate-100 shadow-xl shadow-black/20 ring-0 ${shellSurfaceClasses.workspace}`,
        densityClass,
        dockedClass,
        className,
      )}
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
      <div className={variant === "project" ? "flex min-w-0 flex-col-reverse sm:block" : "min-w-0"}>
        <p className="truncate text-xs leading-5 text-slate-400">{eyebrow}</p>
        <h1 className={shellHeaderTitleClasses[variant]}>{title}</h1>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </>
  );

  if (variant === "home") {
    return (
      <header className="min-w-0 px-4 pb-3 pt-4 sm:px-5 sm:pt-5 lg:px-5 lg:pb-4 lg:pt-5">
        <Card className={shellHeaderClasses.home}>{headerContent}</Card>
      </header>
    );
  }

  return (
    <header className="min-w-0">
      <Card className={`${shellHeaderClasses.project} ${shellSurfaceClasses.floatingHeader}`}>
        <div className="flex min-w-0 items-center justify-between gap-3">{headerContent}</div>
        {mobileMeta ? <div className="mt-2 sm:hidden">{mobileMeta}</div> : null}
      </Card>
    </header>
  );
}
