import { useState } from "react";
import { useT } from "../i18n";
import { MobilePageHeader, shellSurfaceClasses } from "../components/shell/shell-primitives";
import { MobilePrimaryNav } from "../components/shell/mobile-primary-nav";
import {
  SettingsContent,
  sectionTitle,
  type SettingsSection,
} from "../components/shell/settings-dialog";

/**
 * 设置页（移动端全屏路由，决策 44 + 48）。两层结构（Apple 设置范式）：root = 3 个入口
 * 胶囊，detail = 该项具体配置。`activeSection` 组件内 state（不进 URL），MobilePageHeader
 * 据 state 渲染 back（detail 态）/ 无 back（root 态）。切走 unmount 自然回 root。
 * 桌面端不走此路由——`ActivityBar` 设置按钮开 `SettingsDialog` 居中弹窗。
 */
export function SettingsRoute() {
  const { t } = useT();
  const [activeSection, setActiveSection] = useState<SettingsSection>("root");
  const isRoot = activeSection === "root";
  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
    >
      <MobilePageHeader
        title={isRoot ? t("settings.title") : sectionTitle(activeSection, t)}
        back={
          isRoot
            ? undefined
            : { label: t("settings.title"), onClick: () => setActiveSection("root") }
        }
      />
      <div className="flex-1 overflow-y-auto">
        {/* root 态留底部 nav 高度的 padding（pb-24）；detail 态 nav 隐藏，改 pb-8 收紧底部。 */}
        <div className={`mx-auto w-full max-w-2xl p-4 ${isRoot ? "pb-24 lg:pb-8" : "pb-8"}`}>
          <SettingsContent activeSection={activeSection} onNavigate={setActiveSection} />
        </div>
      </div>
      {/* root 态显示底部一级导航；detail 态隐藏——对齐 Apple 设置 detail 全屏沉浸
          （detail 有 header 返回，底部 tab 不该占）。 */}
      {isRoot && <MobilePrimaryNav />}
    </main>
  );
}
