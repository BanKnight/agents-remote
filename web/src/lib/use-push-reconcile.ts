import { useEffect } from "react";
import { reconcilePushSubscription } from "./push";

// 订阅死亡静默对账挂载点（机制背景见 reconcilePushSubscription 注释）：PWA 冷启动
// 一次 + 每次回到前台一次——订阅死在后台期间的场景由后者覆盖，死在 PWA 关闭期间的
// 场景由前者覆盖。settings-dialog 的入口行读 getPushSubscription，对账完成后用户进
// 设置页自然看到开启态，无需额外联动。
export function usePushReconcile(): void {
  useEffect(() => {
    void reconcilePushSubscription();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reconcilePushSubscription();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}
