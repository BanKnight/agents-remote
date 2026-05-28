import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "../ui/button";
import { IconMarker, NavItemContent } from "./shell-primitives";

type ShellNavigationListProps = {
  ariaLabel: string;
  children: ReactNode;
};

export function ShellNavigationList({ ariaLabel, children }: ShellNavigationListProps) {
  return (
    <nav className="grid gap-2" aria-label={ariaLabel}>
      {children}
    </nav>
  );
}

type ShellNavigationButtonProps = {
  active?: boolean;
  description?: ReactNode;
  label: ReactNode;
  marker: ReactNode;
  meta?: ReactNode;
  onClick: () => void;
};

export function ShellNavigationButton({
  active = false,
  description,
  label,
  marker,
  meta,
  onClick,
}: ShellNavigationButtonProps) {
  return (
    <Button className="h-auto min-w-0 justify-start bg-transparent p-0" type="button" variant="ghost" onClick={onClick}>
      <NavItemContent
        active={active}
        description={description}
        label={label}
        marker={marker}
        meta={meta}
      />
    </Button>
  );
}

type ShellNavigationStaticItemProps = {
  active?: boolean;
  description?: ReactNode;
  label: ReactNode;
  marker: ReactNode;
  meta?: ReactNode;
};

export function ShellNavigationStaticItem({
  active = false,
  description,
  label,
  marker,
  meta,
}: ShellNavigationStaticItemProps) {
  return (
    <div className="min-w-0">
      <NavItemContent
        active={active}
        description={description}
        label={label}
        marker={marker}
        meta={meta}
      />
    </div>
  );
}

type ShellMobileBottomNavigationProps = {
  ariaLabel: string;
  children: ReactNode;
  columns: 4 | 5;
};

export function ShellMobileBottomNavigation({
  ariaLabel,
  children,
  columns,
}: ShellMobileBottomNavigationProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-2xl shadow-black/40 backdrop-blur lg:hidden"
      aria-label={ariaLabel}
    >
      <div className={`mx-auto grid max-w-md gap-1 ${columns === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
        {children}
      </div>
    </nav>
  );
}

type ShellMobileNavItemContentProps = {
  active?: boolean;
  label: ReactNode;
  marker: ReactNode;
};

export function ShellMobileNavItemContent({
  active = false,
  label,
  marker,
}: ShellMobileNavItemContentProps) {
  return <NavItemContent active={active} label={label} marker={marker} orientation="vertical" />;
}

export type ShellNavigationItem = {
  id: string;
  label: ReactNode;
  marker: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  mobileLabel?: ReactNode;
};

type PrimaryShellNavigationProps = {
  activeItemId: string;
  brand: ReactNode;
  items: ShellNavigationItem[];
};

export function PrimaryShellNavigation({ activeItemId, brand, items }: PrimaryShellNavigationProps) {
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-100">
        {brand}
      </div>
      <ShellNavigationList ariaLabel="Primary navigation">
        {items.map((item) => (
          <ShellNavigationStaticItem
            key={item.id}
            active={item.id === activeItemId}
            description={item.description}
            label={item.label}
            marker={item.marker}
            meta={item.meta}
          />
        ))}
      </ShellNavigationList>
    </>
  );
}

type PrimaryShellBottomNavigationProps = {
  activeItemId: string;
  items: ShellNavigationItem[];
};

export function PrimaryShellBottomNavigation({
  activeItemId,
  items,
}: PrimaryShellBottomNavigationProps) {
  return (
    <ShellMobileBottomNavigation ariaLabel="Primary mobile navigation" columns={4}>
      {items.map((item) => (
        <div key={item.id} className="min-w-0">
          <ShellMobileNavItemContent
            active={item.id === activeItemId}
            label={item.mobileLabel ?? item.label}
            marker={item.marker}
          />
        </div>
      ))}
    </ShellMobileBottomNavigation>
  );
}

type ProjectShellNavigationItem = ShellNavigationItem & {
  id: "agents" | "files" | "git" | "terminal";
};

type ProjectShellNavigationProps = {
  activeItemId: ProjectShellNavigationItem["id"];
  items: ProjectShellNavigationItem[];
  projectPath: string;
  projectTitle: ReactNode;
  onSelectItem: (itemId: ProjectShellNavigationItem["id"]) => void;
};

export function ProjectShellNavigation({
  activeItemId,
  items,
  onSelectItem,
  projectPath,
  projectTitle,
}: ProjectShellNavigationProps) {
  return (
    <>
      <Link
        className="mb-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 hover:text-cyan-200"
        to="/"
      >
        <IconMarker size="sm" tone="muted">←</IconMarker>
        <span>Projects</span>
      </Link>
      <div className="mb-4 min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
        <h2 className="truncate text-sm font-semibold text-slate-100">{projectTitle}</h2>
        <p className="mt-1 truncate font-mono text-xs text-slate-500">{projectPath}</p>
      </div>
      <ShellNavigationList ariaLabel="Project workspace navigation">
        {items.map((item) => (
          <ShellNavigationButton
            key={item.id}
            active={activeItemId === item.id}
            description={item.description}
            label={item.label}
            marker={item.marker}
            meta={item.meta}
            onClick={() => onSelectItem(item.id)}
          />
        ))}
      </ShellNavigationList>
    </>
  );
}

type ProjectShellBottomNavigationProps = {
  activeItemId: ProjectShellNavigationItem["id"];
  items: ProjectShellNavigationItem[];
  onSelectItem: (itemId: ProjectShellNavigationItem["id"]) => void;
};

export function ProjectShellBottomNavigation({
  activeItemId,
  items,
  onSelectItem,
}: ProjectShellBottomNavigationProps) {
  return (
    <ShellMobileBottomNavigation ariaLabel="Project mobile workspace navigation" columns={5}>
      <Link className="min-w-0" to="/">
        <ShellMobileNavItemContent
          label="Back"
          marker={<IconMarker size="sm" tone="muted">←</IconMarker>}
        />
      </Link>
      {items.map((item) => (
        <Button
          key={item.id}
          className="h-auto min-w-0 bg-transparent p-0"
          type="button"
          variant="ghost"
          onClick={() => onSelectItem(item.id)}
        >
          <ShellMobileNavItemContent
            active={activeItemId === item.id}
            label={item.mobileLabel ?? item.label}
            marker={item.marker}
          />
        </Button>
      ))}
    </ShellMobileBottomNavigation>
  );
}
