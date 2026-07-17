import { Link, useLocation } from "@tanstack/react-router";
import type { Ref } from "react";

import { useT } from "../../i18n";
import { ShellIcon } from "./icons";
import { ShellMobileBottomNavigation, ShellMobileNavItemContent } from "./shell-navigation";

/**
 * 移动端一级底部胶囊导航（设计文档 §5/§6 决策 22-24）。4 项：项目 / 文件 / 技能 / 设置
 *（= 桌面活动栏，两端信息架构一一对应）。`ShellMobileBottomNavigation` 自带 `lg:hidden`，
 * 桌面端不可见，故无需视口 JS 检测——同一组件树两端渲染，桌面被 CSS 隐藏。绝对定位
 * `bottom-0`，父容器需 `relative`。
 *
 * active 跟随当前 URL pathname：[项目] = `/` 或 `/projects`（含 global scope index 与
 * project scope `/projects/$key`，同属项目导航语义）；[文件] = `/files`（rootBrowse 根目录
 * 浏览，决策 24）；[技能] = `/skills`（全局 skill 市场页）；[设置] = `/settings`。聚焦态（`/projects/$key/session/$id`、
 * `/projects/session/$id`）不渲染本组件（§7：单实例聚焦时一级 tab 让位给输入区）——
 * 由调用方按 focusId 决定。
 *
 * `ref` 透传给底层 `<nav>`，供 `ShellLayout`/`MobileWorkbench` 的 `useMeasuredBottomNav`
 * 测量实际高度并注入 `--shell-mobile-bottom-nav-space`（移动滚动容器底部避让胶囊）。
 */
export function MobilePrimaryNav({ ref }: { ref?: Ref<HTMLElement> }) {
  const { t } = useT();
  const { pathname } = useLocation();
  const projectsActive = pathname === "/" || pathname.startsWith("/projects");
  const filesActive = pathname === "/files";
  const skillsActive = pathname === "/skills";
  const settingsActive = pathname === "/settings";

  return (
    <ShellMobileBottomNavigation ariaLabel={t("nav.primaryMobileAria")} columns={4} ref={ref}>
      <Link className="min-w-0 cursor-pointer" to="/">
        <ShellMobileNavItemContent
          active={projectsActive}
          interactive
          label={t("nav.projects")}
          marker={<ShellIcon className="h-3.5 w-3.5" name="project" />}
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
      <Link className="min-w-0 cursor-pointer" to="/skills">
        <ShellMobileNavItemContent
          active={skillsActive}
          interactive
          label={t("nav.skills")}
          marker={<ShellIcon className="h-3.5 w-3.5" name="skills-nav" />}
        />
      </Link>
      <Link className="min-w-0 cursor-pointer" to="/settings">
        <ShellMobileNavItemContent
          active={settingsActive}
          interactive
          label={t("nav.settings")}
          marker={<ShellIcon className="h-3.5 w-3.5" name="settings" />}
        />
      </Link>
    </ShellMobileBottomNavigation>
  );
}
