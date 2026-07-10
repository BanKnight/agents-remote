import { useAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";

import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import { workbenchNavAtom, type WorkbenchNav } from "../../routes/workbench-model";
import { ShellIcon } from "./icons";

/**
 * 活动栏按钮 className（设计文档 DESIGN.md activity-bar-button）。
 * active = VSCode 式左边线 marker（`border-l-2 border-primary`）+ `text-primary`；
 * 非 active = `border-transparent`（占位防布局抖动）+ `on-surface-muted` + hover 升 `on-surface`。
 * icon-only `h-10 w-10`，icon `h-5 w-5`。导出供单测断言（同 `optionActiveClasses` 模式）。
 */
export function activityBarButtonClasses(active: boolean): string {
  return [
    "flex h-10 w-10 items-center justify-center rounded-md border-l-2 transition",
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
 * 竖工具条 3 项：项目 / 文件 / 设置。active 由 `workbenchNavAtom` 驱动（localStorage，不进 URL）。
 * [项目]/[文件] 切 nav state（Phase 2 接左栏内容）；[设置] 特例跳 `SettingsRoute`（决策点④）。
 * Phase 0 仅 primitive，未挂载到 `WorkbenchShell`（Phase 1 接进四栏）。
 */
export function ActivityBar() {
  const [nav, setNav] = useAtom(workbenchNavAtom);
  const navigate = useNavigate();
  const { t } = useT();

  const items: ActivityBarItem[] = [
    { id: "projects", icon: "project", label: "nav.projects", onSelect: () => setNav("projects") },
    { id: "files", icon: "file", label: "nav.files", onSelect: () => setNav("files") },
    {
      id: "settings",
      icon: "settings",
      label: "nav.settings",
      onSelect: () => navigate({ to: "/settings" }),
    },
  ];

  return (
    <nav
      aria-label={t("nav.primaryAria")}
      className="flex w-12 flex-col items-center gap-1 border-r border-neutral-line/60 bg-surface py-2"
    >
      {items.map((item) => {
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
    </nav>
  );
}
