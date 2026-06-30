import { cloneElement, isValidElement, useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps, CSSProperties, ReactElement, ReactNode, Ref } from "react";

import { cn } from "../../lib/utils";
import { Card } from "../ui/card";
import { shellSurfaceClasses } from "./shell-primitives";

type ShellLayoutVariant = "home" | "project";

const shellMainClasses: Record<ShellLayoutVariant, string> = {
  home: "relative h-screen overflow-hidden text-slate-100",
  project: "relative h-screen overflow-hidden text-slate-100",
};

const shellGridClasses: Record<ShellLayoutVariant, string> = {
  home: "grid h-full min-h-0 w-full min-w-0 overflow-hidden pt-[var(--shell-safe-area-top)] lg:grid-cols-[13.75rem_minmax(0,1fr)] lg:p-0",
  project:
    "grid h-full min-h-0 w-full min-w-0 overflow-hidden pt-[var(--shell-safe-area-top)] lg:grid-cols-[13.125rem_minmax(0,1fr)] lg:p-0",
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
  sidebar?: ReactNode;
  variant: ShellLayoutVariant;
};

type BottomNavigationElement = ReactElement<{ ref?: Ref<HTMLElement> }>;

export function ShellLayout({ bottomNavigation, children, sidebar, variant }: ShellLayoutProps) {
  const bottomNavigationRef = useRef<HTMLElement>(null);
  const [bottomNavigationHeight, setBottomNavigationHeight] = useState(0);

  useLayoutEffect(() => {
    const element = bottomNavigationRef.current;

    if (!element) {
      setBottomNavigationHeight(0);
      return;
    }

    const updateHeight = () => setBottomNavigationHeight(element.getBoundingClientRect().height);

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element, { box: "border-box" });

    return () => observer.disconnect();
  }, [bottomNavigation]);

  const measuredBottomNavigation = isValidElement(bottomNavigation)
    ? cloneElement(bottomNavigation as BottomNavigationElement, { ref: bottomNavigationRef })
    : bottomNavigation;

  return (
    <main
      className={shellMainClasses[variant]}
      style={{ "--shell-mobile-bottom-nav-space": `${bottomNavigationHeight}px` } as CSSProperties}
    >
      <div
        className={cn(
          shellGridClasses[variant],
          !sidebar && "lg:!grid-cols-1",
          shellSurfaceClasses.shell,
        )}
      >
        {sidebar}
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden">{children}</div>
      </div>
      {measuredBottomNavigation}
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
      <Card
        className={`h-full min-h-0 gap-0 rounded-[1.75rem] !bg-transparent p-3 py-3 text-slate-100 shadow-2xl shadow-black/30 ring-0 lg:rounded-none lg:border-0 lg:border-r lg:border-slate-700/80 lg:shadow-none ${shellSurfaceClasses.sidebar}`}
      >
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
    density === "compact"
      ? docked
        ? "px-3 pt-3 sm:px-4 sm:pt-4"
        : "p-3 py-3 sm:p-4 sm:py-4"
      : docked
        ? "px-4 pt-4 sm:px-5 sm:pt-5 lg:px-6 lg:pt-6"
        : "p-4 py-4 sm:p-5 sm:py-5 lg:p-6 lg:py-6";
  const dockedClass = docked
    ? "min-h-0 flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 overflow-y-auto max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)] lg:pb-0"
    : "";
  const size = density === "compact" ? "sm" : "default";

  return (
    <Card
      {...props}
      className={cn(
        `min-w-0 gap-0 rounded-[1.5rem] !bg-transparent text-slate-100 shadow-xl shadow-black/20 ring-0 ${shellSurfaceClasses.workspace}`,
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
        <Card className={`!bg-transparent ${shellHeaderClasses.home}`}>{headerContent}</Card>
      </header>
    );
  }

  return (
    <header className="min-w-0">
      <Card
        className={`!bg-transparent ${shellHeaderClasses.project} ${shellSurfaceClasses.floatingHeader}`}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">{headerContent}</div>
        {mobileMeta ? <div className="mt-2 sm:hidden">{mobileMeta}</div> : null}
      </Card>
    </header>
  );
}
