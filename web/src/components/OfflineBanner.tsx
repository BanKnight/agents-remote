import { useSyncExternalStore } from "react";

import { useT } from "../i18n";
import { ShellIcon } from "./shell/icons";

function useOnlineStatus() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
  );
}

/**
 * 全局断网横幅（v2 M3-c，对标 03i-workspace-offline.html .offbanner 原语形态：tint-orange
 * 底 + 警示三角 + 12.5px/600 warning-text 文案）。数据源保持浏览器 navigator.onLine——会话
 * WS 层的断线重连呈现已在各 session 面板内（claude-adapter half-open 检测 + 退避重连 +
 * 「重连中」提示，流内形态归 M3-d 对齐）。onLine 恢复自动消失（= 原型「重连成功自动消失」）；
 * 原型「立即重试」按钮无页面可发起的真实能力（浏览器断网），不画（能力边界约定）。
 */
export function OfflineBanner() {
  const { t } = useT();
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className="fixed top-[env(safe-area-inset-top)] right-0 left-0 z-50 flex items-center gap-2 bg-tint-orange px-4 py-[9px]">
      <ShellIcon className="h-[13px] w-[14px] shrink-0 text-warning-text" name="warning-triangle" />
      <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-warning-text">
        {t("offline.message")}
      </span>
    </div>
  );
}
