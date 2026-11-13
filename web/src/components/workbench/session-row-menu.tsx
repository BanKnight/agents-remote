import { useT } from "../../i18n";
import { usePinnedSessions } from "../../hooks/pinned-sessions";
import type { SessionPanelRef } from "../../routes/workbench-model";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ShellIcon } from "../shell/icons";
import { PROJECT_ROW_TRIGGER_RING, rowMenuButtonClasses } from "../shell/project-row-actions";
import { useInstanceRowActions } from "./instance-actions";

/** 菜单项图标契约尺寸（原型 .ctx .row icon 17px；同 ProjectRowMenu / ⋯ 菜单档）。 */
const ROW_ICON_CLASS = "size-[17px] shrink-0";

export { PROJECT_ROW_TRIGGER_RING };

/**
 * 左栏会话行右键 / 长按菜单（§4.8 桌面会话行交互，2026-11-02 用户拍板平板触屏对齐项目区）：
 * 族A 锚定浮卡（同 `ProjectRowMenu` 形态：fixed size-0 坐标锚 + sideOffset 6 + 176px），
 * 动作集 = ⋯ 菜单动作单源 `useInstanceRowActions`：置顶 ✓（keepOpen 即点即改）/ 重命名…
 * （预填当前名）/ 关闭会话（红）。触发行 dashed ring 高亮由调用方挂行 class
 * （PROJECT_ROW_TRIGGER_RING 同常量）。调用方**单实例**渲染本组件（锚定行元数据作 props），
 * renameHolder 恒渲染——重命名对话框在菜单关闭后才打开，不能随菜单卸载。
 */
export function SessionRowMenu({
  anchor,
  onClose,
  closeInstance,
  panelRef,
  sessionType,
  displayName,
  settled = false,
}: {
  /** 触发点视口坐标（长按/右键）；null = 关闭（仅 renameHolder 继续挂着）。 */
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
  panelRef: SessionPanelRef;
  sessionType: "agent" | "terminal";
  displayName: string;
  /** 已了结（settledAt 成立）→ 动作行显示「恢复关注」。 */
  settled?: boolean;
}) {
  const { t } = useT();
  const { pinned: pinnedSet } = usePinnedSessions();
  const { renameHolder, build } = useInstanceRowActions(closeInstance);
  const a = build(panelRef, sessionType, settled);
  const pinnedNow = pinnedSet.has(panelRef.sessionId);
  return (
    <>
      {anchor ? (
        <Popover open onOpenChange={(open) => !open && onClose()}>
          {/* 坐标锚定（ProjectRowMenu 同法）：fixed size-0 零尺寸触发器 + sideOffset 6。 */}
          <PopoverTrigger asChild>
            <div aria-hidden className="fixed size-0" style={{ left: anchor.x, top: anchor.y }} />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[176px] overflow-hidden rounded-[14px] p-0"
            role="menu"
            side="bottom"
            sideOffset={6}
          >
            {/* 置顶 = 动作区首（同 ⋯ 菜单语义：恒「置顶」文案 + ✓ 态标注，keepOpen 即点即改）。 */}
            <button
              className={rowMenuButtonClasses(false, false)}
              role="menuitem"
              type="button"
              onClick={a.pin.run}
            >
              <ShellIcon className={ROW_ICON_CLASS} name="pin" />
              {t("workbench.pin")}
              {pinnedNow ? <span className="text-[13px] font-bold text-primary">✓</span> : null}
            </button>
            {/* 了结（settle，2026-11-13）：与置顶相邻；已了结 → 「恢复关注」。 */}
            <button
              className={rowMenuButtonClasses(false, false)}
              role="menuitem"
              type="button"
              onClick={() => {
                onClose();
                a.settle.run();
              }}
            >
              <ShellIcon className={ROW_ICON_CLASS} name={settled ? "refresh" : "archive"} />
              {a.settle.label}
            </button>
            <button
              className={rowMenuButtonClasses(false, true)}
              role="menuitem"
              type="button"
              onClick={() => {
                onClose();
                a.rename.run(displayName);
              }}
            >
              <ShellIcon className={ROW_ICON_CLASS} name="edit" />
              {a.rename.label}
            </button>
            <button
              className={rowMenuButtonClasses(true, true)}
              role="menuitem"
              type="button"
              onClick={() => {
                onClose();
                a.close.run();
              }}
            >
              <ShellIcon className={ROW_ICON_CLASS} name="close" />
              {a.close.label}
            </button>
          </PopoverContent>
        </Popover>
      ) : null}
      {renameHolder}
    </>
  );
}
