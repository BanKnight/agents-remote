import { useT } from "../i18n";
import { shellSurfaceClasses } from "../components/shell/shell-primitives";

/**
 * 设置页（设计文档 §7）。移动端一级底部 tab「设置」的全屏页。本轮（Phase 2）仅骨架占位；
 * Phase 4 接入实际设置（主题/语言/部署信息）+ 桌面浮窗 SettingsFlyout（桌面访问 /settings
 * 届时 redirect 回当前 workbench 并触发浮窗）。
 */
export function SettingsRoute() {
  const { t } = useT();
  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-slate-100 ${shellSurfaceClasses.shell}`}
    >
      <header className="flex h-11 shrink-0 items-center border-b border-white/5 px-3">
        <h1 className="text-sm font-semibold">{t("nav.settings")}</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm text-slate-400">{t("settings.placeholder")}</p>
      </div>
    </main>
  );
}
