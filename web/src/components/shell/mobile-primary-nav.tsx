import { Link, useLocation } from "@tanstack/react-router";

import { useT } from "../../i18n";
import { ShellIcon } from "./icons";
import { ShellMobileBottomNavigation, ShellMobileNavItemContent } from "./shell-navigation";

/**
 * 移动端一级底部胶囊导航（设计文档 §7）。3 项：项目 / 全局 / 设置。
 * `ShellMobileBottomNavigation` 自带 `lg:hidden`，桌面端不可见，故无需视口 JS 检测——
 * 同一组件树两端渲染，桌面被 CSS 隐藏。绝对定位 `bottom-0`，父容器需 `relative`。
 *
 * active 跟随当前 URL pathname：项目维度 = `/` 或 `/projects/*`，全局 = `/global*`，
 * 设置 = `/settings`。聚焦态（`/projects/$key/session/$id`、`/global/session/$id`）
 * 不渲染本组件（§7：单实例聚焦时一级 tab 让位给输入区）——由调用方按 focusId 决定。
 */
export function MobilePrimaryNav() {
  const { t } = useT();
  const { pathname } = useLocation();
  const projectsActive = pathname === "/" || pathname.startsWith("/projects/");
  const globalActive = pathname.startsWith("/global");
  const settingsActive = pathname === "/settings";

  return (
    <ShellMobileBottomNavigation ariaLabel={t("nav.primaryMobileAria")} columns={3}>
      <Link className="min-w-0 cursor-pointer" to="/">
        <ShellMobileNavItemContent
          active={projectsActive}
          interactive
          label={t("nav.projects")}
          marker={<ShellIcon className="h-3.5 w-3.5" name="project" />}
        />
      </Link>
      <Link className="min-w-0 cursor-pointer" to="/global">
        <ShellMobileNavItemContent
          active={globalActive}
          interactive
          label={t("workbench.global")}
          marker={<GlobalGlyph />}
        />
      </Link>
      <Link className="min-w-0 cursor-pointer" to="/settings">
        <ShellMobileNavItemContent
          active={settingsActive}
          interactive
          label={t("nav.settings")}
          marker={<SettingsGlyph />}
        />
      </Link>
    </ShellMobileBottomNavigation>
  );
}

/** 全局 globe 图标（与左栏 GlobalNavNode 同款，无独立 svg 资源故 inline）。 */
function GlobalGlyph() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth={1.5} />
      <path
        d="M2 8h12M8 2c1.8 2 1.8 10 0 12M8 2c-1.8 2-1.8 10 0 12"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    </svg>
  );
}

/** 设置 gear 图标（无独立 svg 资源故 inline）。 */
function SettingsGlyph() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth={1.5} />
      <path
        d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}
