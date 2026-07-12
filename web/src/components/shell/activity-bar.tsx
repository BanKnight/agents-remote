import { useState } from "react";
import { useAtom } from "jotai";

import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import { workbenchNavAtom, type WorkbenchNav } from "../../routes/workbench-model";
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
  id: WorkbenchNav;
  icon: "project" | "file" | "settings";
  label: TranslationKey;
  onSelect: () => void;
};

/**
 * 桌面活动栏（一级导航，设计文档 activity-bar-redesign.md §3/§4.1）。
 * 竖工具条：顶部主组（项目 / 文件）切 `workbenchNavAtom`；底部 [设置] 用 `mt-auto` 置底
 * 且开 `SettingsDialog` 居中弹窗（决策 44，取代旧跳 `/settings` 路由）——不离开工作台。
 * active 由 `workbenchNavAtom` 驱动（localStorage，不进 URL）；设置按钮 active 由 `settingsOpen`。
 */
export function ActivityBar() {
  const [nav, setNav] = useAtom(workbenchNavAtom);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { t } = useT();

  const mainItems: ActivityBarItem[] = [
    { id: "projects", icon: "project", label: "nav.projects", onSelect: () => setNav("projects") },
    { id: "files", icon: "file", label: "nav.files", onSelect: () => setNav("files") },
  ];

  return (
    <>
      <nav
        aria-label={t("nav.primaryAria")}
        className="flex h-full w-12 flex-col items-center gap-1 border-r border-neutral-line/60 bg-surface py-2"
      >
        {mainItems.map((item) => {
          const active = nav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onSelect}
              aria-label={t(item.label)}
              aria-current={active ? "page" : undefined}
              className={activityBarButtonClasses(active)}
            >
              <ShellIcon className="h-5 w-5" name={item.icon} />
            </button>
          );
        })}
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
