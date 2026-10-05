import { Link, useLocation } from "@tanstack/react-router";
import type { Ref } from "react";

import { useT } from "../../i18n";
import { ShellIcon } from "./icons";
import { ShellMobileBottomNavigation, ShellMobileNavItemContent } from "./shell-navigation";

/**
 * 移动端一级底部导航（v1.5 三 Tab，spec 铁律 4/§3.3：项目 / 文件 / 插件——「工作台」不再
 * 是导航目的地，它是项目的工作现场，入口 = 项目 Tab；设置 = 项目页 ⚙ push，M7）。
 * `ShellMobileBottomNavigation` 自带 `lg:hidden`，桌面端不可见，故无需视口 JS 检测——同一
 * 组件树两端渲染，桌面被 CSS 隐藏。绝对定位 `bottom-0`，父容器需 `relative`。
 *
 * active 跟随当前 URL pathname：[项目] = `/projects` 系全部（L1 列表页 + project scope 现场
 * + global 会话聚焦——项目 Tab = 会话的家）；[文件] = `/files` 系；[插件] = `/plugins` 系。
 * `/` 为纯跳板（beforeLoad 立即 redirect，瞬态无渲染）。**本组件是否挂载由调用方决定**——
 * project scope 会话现场（spec §3.3「全屏 push 层，无 tab bar」）不渲染，见 MobileWorkbench。
 *
 * `ref` 透传给底层 `<nav>`，供 `ShellLayout`/`MobileWorkbench` 的 `useMeasuredBottomNav`
 * 测量实际高度并注入 `--shell-mobile-bottom-nav-space`（移动滚动容器底部避让胶囊）。
 */
export function MobilePrimaryNav({ ref }: { ref?: Ref<HTMLElement> }) {
  const { t } = useT();
  const { pathname } = useLocation();
  // v1.5 三 Tab（spec 铁律 4：项目/文件/插件；设置 = 项目页 ⚙ push，M7；`/settings` 路由
  // 保留深度链接不破）。项目 = `/projects` 系全部（L1 列表页 + project scope 现场 + global
  // 会话聚焦）；文件/插件各自前缀。图标按 tokens.json icon.mapping（folder/doc.text/
  // square.grid.2x2；插件图标 puzzlepiece 换代随批 7）。
  const projectsActive =
    pathname === "/projects" ||
    pathname.startsWith("/projects/session/") ||
    /^\/projects\/[^/]+(\/|$)/.test(pathname);
  const filesActive = pathname.startsWith("/files");
  const pluginsActive = pathname.startsWith("/plugins");

  return (
    <ShellMobileBottomNavigation ariaLabel={t("nav.primaryMobileAria")} columns={3} ref={ref}>
      <Link className="min-w-0 cursor-pointer" to="/projects">
        <ShellMobileNavItemContent
          active={projectsActive}
          interactive
          label={t("nav.projects")}
          marker={<ShellIcon className="h-6 w-6" name="project" />}
        />
      </Link>
      <Link className="min-w-0 cursor-pointer" to="/files">
        <ShellMobileNavItemContent
          active={filesActive}
          interactive
          label={t("nav.files")}
          marker={<ShellIcon className="h-6 w-6" name="file" />}
        />
      </Link>
      <Link className="min-w-0 cursor-pointer" to="/plugins">
        <ShellMobileNavItemContent
          active={pluginsActive}
          interactive
          label={t("nav.plugins")}
          marker={<ShellIcon className="h-6 w-6" name="pages-nav" />}
        />
      </Link>
    </ShellMobileBottomNavigation>
  );
}
