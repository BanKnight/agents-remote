import { Link, useLocation } from "@tanstack/react-router";
import type { Ref } from "react";

import { useT } from "../../i18n";
import { ShellIcon } from "./icons";
import { ShellMobileBottomNavigation, ShellMobileNavItemContent } from "./shell-navigation";

/**
 * 移动端一级底部导航（redesign-v2.md D21 v2 4 Tab：项目 / 工作台 / 文件 / 插件；设置 =
 * 项目页 ⚙ push（M7），自底 nav 移除）。`ShellMobileBottomNavigation` 自带 `lg:hidden`，
 * 桌面端不可见，故无需视口 JS 检测——同一组件树两端渲染，桌面被 CSS 隐藏。绝对定位
 * `bottom-0`，父容器需 `relative`。
 *
 * active 跟随当前 URL pathname：[项目] = `/projects` 精确（L1 列表页）；[工作台] = `/`（D4
 * 跳板，实际落上次项目）+ project scope `/projects/$key` 系 + global 会话聚焦；[文件] =
 * `/files` 系；[插件] = `/plugins` 系。聚焦态（`/projects/$key/session/$id`）不渲染本组件
 *（§7：单实例聚焦时一级 tab 让位给输入区）——由调用方按 focusId 决定。
 *
 * `ref` 透传给底层 `<nav>`，供 `ShellLayout`/`MobileWorkbench` 的 `useMeasuredBottomNav`
 * 测量实际高度并注入 `--shell-mobile-bottom-nav-space`（移动滚动容器底部避让胶囊）。
 */
export function MobilePrimaryNav({ ref }: { ref?: Ref<HTMLElement> }) {
  const { t } = useT();
  const { pathname } = useLocation();
  // v2 4 Tab（redesign-v2.md D21：项目/工作台/文件/插件；设置 = 项目页 ⚙ push，M7）。
  // 项目 = `/projects` 精确（L1 列表页）；工作台 = `/`（D4 跳板，实际落上次项目）+ project
  // scope + global 会话聚焦（看实例 = 工作台语义）；文件/插件各自前缀。设置自底 nav 移除，
  // `/settings` 路由保留（深度链接不破）。图标按 tokens.json icon.mapping（folder/terminal/
  // doc.text/square.grid.2x2）。
  const projectsActive = pathname === "/projects";
  const workbenchActive =
    pathname === "/" ||
    pathname.startsWith("/projects/session/") ||
    /^\/projects\/[^/]+(\/|$)/.test(pathname);
  const filesActive = pathname.startsWith("/files");
  const pluginsActive = pathname.startsWith("/plugins");

  return (
    <ShellMobileBottomNavigation ariaLabel={t("nav.primaryMobileAria")} columns={4} ref={ref}>
      <Link className="min-w-0 cursor-pointer" to="/projects">
        <ShellMobileNavItemContent
          active={projectsActive}
          interactive
          label={t("nav.projects")}
          marker={<ShellIcon className="h-3.5 w-3.5" name="project" />}
        />
      </Link>
      <Link className="min-w-0 cursor-pointer" to="/">
        <ShellMobileNavItemContent
          active={workbenchActive}
          interactive
          label={t("nav.workbench")}
          marker={<ShellIcon className="h-3.5 w-3.5" name="terminal" />}
        />
      </Link>
      <Link className="min-w-0 cursor-pointer" to="/files">
        <ShellMobileNavItemContent
          active={filesActive}
          interactive
          label={t("nav.files")}
          marker={<ShellIcon className="h-3.5 w-3.5" name="file" />}
        />
      </Link>
      <Link className="min-w-0 cursor-pointer" to="/plugins">
        <ShellMobileNavItemContent
          active={pluginsActive}
          interactive
          label={t("nav.plugins")}
          marker={<ShellIcon className="h-3.5 w-3.5" name="pages-nav" />}
        />
      </Link>
    </ShellMobileBottomNavigation>
  );
}
