import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import { ShellIcon } from "./icons";
import { SettingsDialog } from "./settings-dialog";

/**
 * 活动栏按钮 className（设计文档 DESIGN.md activity-bar-button）。
 * active = VSCode 式左边线 marker（`border-l-2 border-primary`）+ `text-primary`；
 * 非 active = `border-transparent`（占位防布局抖动）+ `on-surface-muted` + hover 升 `on-surface`。
 * icon-only `h-10 w-10`，icon `h-5 w-5`。`cursor-pointer` 修正原生 button UA 默认箭头（决策 44）。
 * 导出供单测断言（同 `optionActiveClasses` 模式）。
 */
export function activityBarButtonClasses(active: boolean): string {
  return [
    "flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border-l-2 transition",
    active
      ? "border-primary text-primary"
      : "border-transparent text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface",
  ].join(" ");
}

type ActivityBarItem = {
  id: "projects" | "files";
  icon: "project" | "file";
  label: TranslationKey;
  onSelect: () => void;
  active: boolean;
};

/**
 * 桌面活动栏（一级导航，设计文档 activity-bar-redesign.md §3/§4.1）。
 * 竖工具条：顶部主组 [项目]/[文件] 各自 `navigate` 到独立路由——[文件] 跳 `/files`（全局文件
 * rootBrowse，独立 scope 入口，设计 workbench-stable-refactor Phase 2）；[项目] 跳 `/projects`
 *（全局项目总览）。两端入口语义与移动 `MobilePrimaryNav` 一一对应（`Link to="/files"`/`to="/"`）。
 * active 跟随 URL pathname（不再走 `workbenchNavAtom`）：[项目] = `/` 或 `/projects` 前缀（含
 * project scope `/projects/$key`）；[文件] = `/files`。底部 [设置] 用 `mt-auto` 置底且开
 * `SettingsDialog` 居中弹窗（决策 44，取代旧跳 `/settings` 路由），active 由 `settingsOpen`。
 */
export function ActivityBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { t } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const projectsActive = pathname === "/" || pathname.startsWith("/projects");
  const filesActive = pathname === "/files";

  const mainItems: ActivityBarItem[] = [
    {
      id: "projects",
      icon: "project",
      label: "nav.projects",
      onSelect: () => void navigate({ to: "/projects" }),
      active: projectsActive,
    },
    {
      id: "files",
      icon: "file",
      label: "nav.files",
      onSelect: () => void navigate({ to: "/files" }),
      active: filesActive,
    },
  ];

  return (
    <>
      <nav
        aria-label={t("nav.primaryAria")}
        className="flex h-full w-12 flex-col items-center gap-1 border-r border-neutral-line/60 bg-surface py-2"
      >
        {mainItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onSelect}
            aria-label={t(item.label)}
            aria-current={item.active ? "page" : undefined}
            className={activityBarButtonClasses(item.active)}
          >
            <ShellIcon className="h-5 w-5" name={item.icon} />
          </button>
        ))}
        {/* mt-auto 把设置推到活动栏底部（VSCode 式主组 + 底部分离，决策 44）。 */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label={t("nav.settings")}
          aria-current={settingsOpen ? "page" : undefined}
          className={`${activityBarButtonClasses(settingsOpen)} mt-auto`}
        >
          <ShellIcon className="h-5 w-5" name="settings" />
        </button>
      </nav>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
