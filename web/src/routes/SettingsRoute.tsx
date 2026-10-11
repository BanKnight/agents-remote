import { useState, type CSSProperties } from "react";
import { useT } from "../i18n";
import { LargeTitleRow, shellSurfaceClasses } from "../components/shell/shell-primitives";
import { MobilePrimaryNav } from "../components/shell/mobile-primary-nav";
import { useMeasuredBottomNav } from "../components/shell/shell-layout";
import {
  SettingsContent,
  sectionTitle,
  type SettingsSection,
} from "../components/shell/settings-dialog";

/**
 * 设置页（移动端全屏路由，决策 44 + 48；v2 M7 对标 07-settings.html）。两层结构（Apple
 * 设置范式）：root = 五组分入口，detail = 该项具体配置。`activeSection` 组件内 state
 *（不进 URL），header 据 state 渲染 back。切走 unmount 自然回 root。桌面端不走此路由——
 * `Sidebar` footnav 设置按钮开 `SettingsDialog` 居中弹窗（07m 视觉对齐归 M9）。
 *
 * header 双形态（边距统筹 2026-10-11）：root = `LargeTitleRow` 一级 tab 大标题（与项目/
 * 插件/全局文件三 tab 同构单源，原「‹ 项目」back 退役——tab 根页跨 tab back 与底部一级
 * nav 双轨冗余）；detail = 原型 `.nav` 导航条（back + 居中标题，Apple 二级页惯例）。
 *
 * 底部一级胶囊：root 态测量高度注入 `--shell-mobile-bottom-nav-space`，滚动区消费 var 避让
 *（与 MobileWorkbench / ShellLayout 同构）；detail 态无 nav → height=0 → 无额外 pb。
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
      {/* root 态 = 一级 tab 大标题（LargeTitleRow 单源，与项目/插件/全局文件同构；边距统筹
          2026-10-11：「‹ 项目」back 退役——root 是 tab 根，tab 间切换走底部一级 nav，跨 tab
          back 与 nav 双轨冗余）；detail 态保留 .nav 导航条（Apple 二级页惯例：back + 居中标题）。 */}
      {isRoot ? (
        <LargeTitleRow title={t("settings.title")} />
      ) : (
        <header className="nav">
          <button
            className="back cursor-pointer touch:px-2 touch:py-2"
            onClick={() => setActiveSection("root")}
            type="button"
          >
            {t("settings.title")}
          </button>
          <h1 className="nv-t">{sectionTitle(activeSection, t)}</h1>
          {/* 右侧占位与 .back 等宽（原型 07 用固定 52px 对齐居中标题） */}
          <span aria-hidden="true" className="w-[52px]" />
        </header>
      )}
      {/* 内容区底 = `--bg-base`（07 原型舞台底：深 #000 / 浅 #F2F2F7），让 root 态 `.sgroup`
          卡片(`--bg-elevated`)浮在其上——底若同用 elevated 档，组块会与底同色「隐形」只剩描边
          （design review P1-1 硬数据：两者同色）。detail 态 Card 同样落在 base 上。
          root 态滚动区 pb 消费实测胶囊高度；detail 态 var=0 无额外 pb。 */}
      <div className="flex-1 overflow-y-auto bg-surface-base max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)]">
        {/* root/detail 态内容都自带 16px 边距（.sect/.sgroup margin，对齐 07 原型；
            v2 二级换代：detail 段同用分组语言，不再补 px）。root 态 -mt-1 补偿首组
            .sect margin-top 14px → 内容顶 = 标题底 + 10px，对齐项目/插件页 mt-2.5 节奏
            （边距统筹 2026-10-11）。 */}
        <div className={`mx-auto w-full max-w-2xl pb-4 ${isRoot ? "-mt-1" : "pt-3"}`}>
          <SettingsContent activeSection={activeSection} onNavigate={setActiveSection} />
        </div>
      </div>
      {measuredBottomNav}
    </main>
  );
}
