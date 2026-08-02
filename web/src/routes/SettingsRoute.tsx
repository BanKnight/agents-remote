import { useState, type CSSProperties } from "react";
import { useT } from "../i18n";
import { MobilePageHeader, shellSurfaceClasses } from "../components/shell/shell-primitives";
import { MobilePrimaryNav } from "../components/shell/mobile-primary-nav";
import { useMeasuredBottomNav } from "../components/shell/shell-layout";
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
 *
 * 底部一级胶囊：root 态测量高度注入 `--shell-mobile-bottom-nav-space`，滚动区消费 var 避让
 * （与 MobileWorkbench / ShellLayout 同构）；detail 态无 nav → height=0 → 无额外 pb。
 */
export function SettingsRoute() {
  const { t } = useT();
  const [activeSection, setActiveSection] = useState<SettingsSection>("root");
  const isRoot = activeSection === "root";
  // detail 态隐藏一级 nav（Apple 设置沉浸），传 null → height=0 → var=0px。
  const { height: bottomNavHeight, measured: measuredBottomNav } = useMeasuredBottomNav(
    isRoot ? <MobilePrimaryNav /> : null,
  );
  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
      style={{ "--shell-mobile-bottom-nav-space": `${bottomNavHeight}px` } as CSSProperties}
    >
      <MobilePageHeader
        title={isRoot ? t("settings.title") : sectionTitle(activeSection, t)}
        back={
          isRoot
            ? undefined
            : { label: t("settings.title"), onClick: () => setActiveSection("root") }
        }
      />
      {/* 内容区底用实色 surface-raised，与桌面弹窗 SettingsDialog 内容区底(workspace 实色)一致——
          让列表 Card(bg-surface) 落在更亮的实色底上(半透明 /15 明主题叠底发灰，见 DESIGN 浮层内容背景铁律)。
          root 态滚动区 pb 消费实测胶囊高度；detail 态 var=0 无额外 pb。 */}
      <div className="flex-1 overflow-y-auto bg-surface-raised max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)]">
        <div className="mx-auto w-full max-w-2xl p-4">
          <SettingsContent activeSection={activeSection} onNavigate={setActiveSection} />
        </div>
      </div>
      {measuredBottomNav}
    </main>
  );
}
