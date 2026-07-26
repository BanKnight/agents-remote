import { expect, test } from "bun:test";
import { decideDesktopEnterAction, isMobileComposerMode } from "./composer-enter";

test("mobile composer mode requires BOTH touch and a narrow viewport", () => {
  // 真手机：触屏 + 窄屏 → 移动模式（Enter 换行 + Send）。
  expect(isMobileComposerMode({ coarse: true, wide: false })).toBe(true);
  // 误报触屏的宽屏台式机（用户环境）：coarse 即便 true，宽屏 → 桌面模式（Enter 发送）。
  expect(isMobileComposerMode({ coarse: true, wide: true })).toBe(false);
  // 普通桌面（非触屏）：恒桌面模式。
  expect(isMobileComposerMode({ coarse: false, wide: true })).toBe(false);
  expect(isMobileComposerMode({ coarse: false, wide: false })).toBe(false);
});

test("plain Enter sends on all desktop platforms", () => {
  expect(decideDesktopEnterAction({ shiftKey: false, metaKey: false, isMac: false })).toBe("send");
  expect(decideDesktopEnterAction({ shiftKey: false, metaKey: false, isMac: true })).toBe("send");
});

test("Shift+Enter inserts a newline on all desktop platforms", () => {
  expect(decideDesktopEnterAction({ shiftKey: true, metaKey: false, isMac: false })).toBe(
    "newline",
  );
  expect(decideDesktopEnterAction({ shiftKey: true, metaKey: false, isMac: true })).toBe("newline");
});

test("Cmd+Enter inserts a newline only on Mac", () => {
  expect(decideDesktopEnterAction({ shiftKey: false, metaKey: true, isMac: true })).toBe("newline");
  // 非 Mac：Meta 不是换行修饰键 → 仍发送
  expect(decideDesktopEnterAction({ shiftKey: false, metaKey: true, isMac: false })).toBe("send");
});
