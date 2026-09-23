import type { ReactNode, Ref } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { useT } from "../../i18n";
import { Button } from "../ui/button";
import { IconMarker, NavItemContent, shellSurfaceClasses } from "./shell-primitives";

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
    <Button
      className="h-auto w-full min-w-0 cursor-pointer justify-start bg-transparent p-0"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      <NavItemContent
        active={active}
        description={description}
        interactive
        label={label}
        marker={marker}
        meta={meta}
      />
    </Button>
  );
}

type ShellNavigationLinkProps = {
  active?: boolean;
  description?: ReactNode;
  label: ReactNode;
  marker: ReactNode;
  meta?: ReactNode;
  to: LinkProps["to"];
};

export function ShellNavigationLink({
  active = false,
  description,
  label,
  marker,
  meta,
  to,
}: ShellNavigationLinkProps) {
  return (
    <Link className="block w-full min-w-0 cursor-pointer" to={to}>
      <NavItemContent
        active={active}
        description={description}
        interactive
        label={label}
        marker={marker}
        meta={meta}
      />
    </Link>
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
    <div className="w-full min-w-0">
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
  columns: 3 | 4 | 5;
  ref?: Ref<HTMLElement>;
};

export function ShellMobileBottomNavigation({
  ariaLabel,
  children,
  columns,
  ref,
}: ShellMobileBottomNavigationProps) {
  const colsClass = columns === 5 ? "grid-cols-5" : columns === 4 ? "grid-cols-4" : "grid-cols-3";
  // 通栏形态（第十轮对齐原型 .tabbar，components.css 单源；v2-primitives.css .tabbar 同值）：
  // bg-elevated + border-top sep，grid 均分 = space-around；底部 8px 内容间隙 + safe-area
  // 单点消费 home indicator（frontend-notes §1，原型静态稿 24px 为 mock 假设值）。
  return (
    <nav
      ref={ref}
      className="absolute inset-x-0 bottom-0 z-20 border-t border-sep bg-elevated lg:hidden"
      aria-label={ariaLabel}
    >
      <div
        className={`mx-auto grid w-full px-1 pt-2.5 pb-[calc(8px+var(--shell-safe-area-bottom,0px))] ${colsClass}`}
      >
        {children}
      </div>
    </nav>
  );
}

type ShellMobileNavItemContentProps = {
  active?: boolean;
  interactive?: boolean;
  label: ReactNode;
  marker: ReactNode;
};

export function ShellMobileNavItemContent({
  active = false,
  interactive = false,
  label,
  marker,
}: ShellMobileNavItemContentProps) {
  return (
    <NavItemContent
      active={active}
      interactive={interactive}
      label={label}
      marker={marker}
      orientation="vertical"
    />
  );
}

export type ShellNavigationItem = {
  id: string;
  label: ReactNode;
  marker: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  mobileLabel?: ReactNode;
  to?: LinkProps["to"];
};

type PrimaryShellNavigationProps = {
  activeItemId: string;
  brand: ReactNode;
  items: ShellNavigationItem[];
};

export function PrimaryShellNavigation({
  activeItemId,
  brand,
  items,
}: PrimaryShellNavigationProps) {
  const { t } = useT();
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-on-surface">
        {brand}
      </div>
      <ShellNavigationList ariaLabel={t("nav.primaryAria")}>
        {items.map((item) =>
          item.to ? (
            <ShellNavigationLink
              key={item.id}
              active={item.id === activeItemId}
              description={item.description}
              label={item.label}
              marker={item.marker}
              meta={item.meta}
              to={item.to}
            />
          ) : (
            <ShellNavigationStaticItem
              key={item.id}
              active={item.id === activeItemId}
              description={item.description}
              label={item.label}
              marker={item.marker}
              meta={item.meta}
            />
          ),
        )}
      </ShellNavigationList>
    </>
  );
}

type ProjectShellNavigationItem = ShellNavigationItem & {
  id: "agents" | "files" | "git";
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
  const { t } = useT();
  return (
    <>
      <Link
        className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-on-surface-muted transition hover:text-primary active:bg-on-surface/10"
        to="/"
      >
        <IconMarker size="sm" tone="muted">
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconMarker>
        <span>{t("nav.projects")}</span>
      </Link>
      <div className={`mb-4 min-w-0 rounded-2xl p-3 ${shellSurfaceClasses.raised}`}>
        <h2 className="truncate text-sm font-semibold text-on-surface">{projectTitle}</h2>
        <p className="mt-1 truncate font-mono text-xs text-on-surface-muted">{projectPath}</p>
      </div>
      <ShellNavigationList ariaLabel={t("nav.projectWorkspaceAria")}>
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
