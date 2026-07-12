import { useT } from "../i18n";
import { MobilePageHeader, shellSurfaceClasses } from "../components/shell/shell-primitives";
import { MobilePrimaryNav } from "../components/shell/mobile-primary-nav";
import { SettingsContent } from "../components/shell/settings-dialog";

/**
 * 设置页（移动端全屏路由，决策 44）。桌面端不走此路由——`ActivityBar` 设置按钮开
 * `SettingsDialog` 居中弹窗（`shell/settings-dialog.tsx`）。移动端入口 `MobilePrimaryNav`
 * 的 `<Link to="/settings">`。内容复用 `SettingsContent`（与桌面弹窗共享）。
 */
export function SettingsRoute() {
  const { t } = useT();
  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
    >
      <MobilePageHeader title={t("settings.title")} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-4 pb-24 lg:pb-8">
          <SettingsContent />
        </div>
      </div>
      <MobilePrimaryNav />
    </main>
  );
}
