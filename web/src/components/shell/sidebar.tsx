import { useNavigate } from "@tanstack/react-router";

import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import { stickyWorkbenchSearch, useWorkbenchRouteContext } from "../../routes/workbench-model";
import { ShellIcon, type ShellIconName } from "./icons";
import { useCreateProjectDialog } from "./project-setup";

type SidebarItem = {
  id: "projects" | "workbench" | "files" | "plugins";
  icon: ShellIconName;
  label: TranslationKey;
  onSelect: () => void;
  active: boolean;
};

/**
 * 桌面 Sidebar（redesign-v2.md M2 IA 骨架：ActivityBar → Sidebar 换代）。
 *
 * 一级导航 = 与移动 4 Tab 一一对应的 4 个目的地（D21：项目 / 工作台 / 文件 / 插件）+
 * footnav 设置（07m：并入 mainPage 体系，footnav 设置项 .on 激活）。竖排列表行 + 图标 + 文字标签，替代 v1 的
 * 48px 图标条——两端同构命名，便于用户建立心智映射。
 *
 * **本组件只承载导航，不承载内容**：项目列表属 M3（主页对齐，02-tab-projects 的 Large title
 * + 搜索 + 活动卡），Mac 窗口态把项目/实例树收进 Sidebar 是 M9（三栏 + Inspector）；
 * 当前 4 列结构中左栏已有项目列表，此处重复放置会与之冲突。
 *
 * active 跟随 URL（与 MobilePrimaryNav 同一套判定，两端一致）：[项目] = `/projects` 精确
 *（L1 列表页）；[工作台] = `/`（D4 跳板）+ project scope 系 + global 会话聚焦；[文件]/
 * [插件] = 各自前缀；设置 = mainPage 态（global + leftMode=settings）。
 */
export function Sidebar() {
  const { t } = useT();
  const navigate = useNavigate();
  const { scope, focusId, leftMode, rightTab, tab, mode } = useWorkbenchRouteContext();
  const { openCreate } = useCreateProjectDialog();

  // active 判定同 MobilePrimaryNav（pathname 前缀），但这里从 workbench route context 派生
  //（桌面无 pathname 依赖，context 已是 URL 的单一投影）：global + leftMode 决定文件/插件，
  // project scope 与 global 会话聚焦均属工作台。
  const projectsActive = scope.kind === "global" && leftMode === "auto" && !focusId;
  const filesActive = scope.kind === "global" && leftMode === "files";
  const pluginsActive = scope.kind === "global" && leftMode === "plugins";
  const workbenchActive = scope.kind === "project" || focusId !== undefined;
  const settingsActive = scope.kind === "global" && leftMode === "settings";

  // 07m：设置 = main 整页（mainPage 体系）。navigate /projects 带全 sticky search
  //（leftMode=settings + 工作台态 rightTab/tab/mode 透传），URL 即真相——刷新/深链回设置页
  // 时工作台态保留。注意 `/` 是纯跳板（beforeLoad redirect 丢 search），不能作导航目标。
  const onOpenSettings = () => {
    void navigate({
      to: "/projects",
      search: stickyWorkbenchSearch({ leftMode: "settings", rightTab, tab, mode }),
    });
  };

  const items: SidebarItem[] = [
    {
      id: "projects",
      icon: "project",
      label: "nav.projects",
      onSelect: () => void navigate({ to: "/projects" }),
      active: projectsActive,
    },
    {
      id: "workbench",
      icon: "terminal",
      label: "nav.workbench",
      onSelect: () => void navigate({ to: "/" }),
      active: workbenchActive,
    },
    {
      id: "files",
      icon: "file",
      label: "nav.files",
      onSelect: () => void navigate({ to: "/files" }),
      active: filesActive,
    },
    {
      id: "plugins",
      icon: "pages-nav",
      label: "nav.plugins",
      onSelect: () => void navigate({ to: "/plugins" }),
      active: pluginsActive,
    },
  ];

  return (
    <>
      <nav aria-label={t("nav.primaryAria")} className="side sidewin flex h-full w-full flex-col">
        <div className="ghead">
          <span className="tt">{t("nav.projects")}</span>
          <button
            type="button"
            aria-label={t("home.createProjectAria")}
            className="plus cursor-pointer"
            onClick={openCreate}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onSelect}
              aria-label={t(item.label)}
              aria-current={item.active ? "page" : undefined}
              className={`srow2 w-full cursor-pointer text-left ${item.active ? "selrow" : ""}`}
            >
              <span className="dicon">
                <ShellIcon className="h-3.5 w-3.5" name={item.icon} />
              </span>
              {t(item.label)}
            </button>
          ))}
        </div>
        <div className="dsep" />
        <div className="footnav flex-none">
          <button
            type="button"
            onClick={onOpenSettings}
            className={`cursor-pointer ${settingsActive ? "on" : ""}`}
          >
            <span className="dicon">
              <ShellIcon className="h-3.5 w-3.5" name="settings" />
            </span>
            {t("nav.settings")}
          </button>
        </div>
      </nav>
    </>
  );
}
