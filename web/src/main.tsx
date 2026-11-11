import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { getDefaultStore, Provider as JotaiProvider } from "jotai";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DiagFab } from "./components/shell/diag-fab";
import { I18nProvider } from "./i18n";
import { queryClient } from "./lib/query-client";
import { installPushDiagRelay } from "./lib/push-diag";
import { useKeyboardInsetGlobal } from "./lib/use-keyboard-inset";
import { usePushReconcile } from "./lib/use-push-reconcile";
import { restoreLastPath, saveCurrentPath } from "./navigation-persistence";
import { router } from "./routes/router";
import { ThemeSync } from "./theme";
import "./styles/index.css";
import { registerSW } from "virtual:pwa-register";

restoreLastPath();

// SW→页面 push 诊断中继（2026-11-11 根治批）：SW 侧异常经 postMessage 落悬浮球缓冲。
installPushDiagRelay();

router.subscribe("onResolved", () => {
  saveCurrentPath(window.location.pathname, window.location.search);
});

/** 键盘 inset 全局同步（批 17）：visualViewport → :root 的 --kb-offset/--kb-active。 */
function KeyboardInsetSync() {
  useKeyboardInsetGlobal();
  return null;
}

/** Web Push 订阅死亡静默对账（2026-11-03 排障批）：冷启动 + 回前台时自愈重订阅。 */
function PushReconcileSync() {
  usePushReconcile();
  return null;
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        {/* 显式挂 default store：无 prop 的 Provider 会私建 store，与模块级 imperative API
            （upload-queue 的 getDefaultStore 写入）读写分裂——队列卡永远读不到入队（探针实测）。
            挂 default store 后 hook 读写与 imperative 写入同源。 */}
        <JotaiProvider store={getDefaultStore()}>
          <ThemeSync />
          <KeyboardInsetSync />
          <PushReconcileSync />
          <DiagFab />
          <RouterProvider router={router} />
        </JotaiProvider>
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);

registerSW({
  // autoUpdate 模式下 registerSW 的默认行为 = 新 SW activated(isUpdate) → 整页
  // location.reload()——会抹掉一切进行中状态（预览层/会话输入草稿/终端）。2026-11-10
  // 真机报障：桌面 PWA 测试 pages 预览层时撞上后台 SW 更新激活，页面被自动刷回工作台
  // （main.tsx 每 30 分钟 + 每次 focus 主动 update()，连续发版期必撞）。传空 onNeedReload
  // 拦截（1.3.0 register.js：有该回调则跳过 reload）。语义改为「发版静默生效」：新 SW
  // 照常 skipWaiting+clientsClaim activate（precache 已更新），页面继续跑已加载代码，
  // 用户下次刷新/重开自然用上新版——刷新走 precached index.html + 同版 chunk，原子性
  // 不受影响（vite.config.ts「autoUpdate reloads once」注释的论证仍成立，只是 reload
  // 时机交还给用户）。发版提示条（prompt 模式 UI）按需再加。
  onNeedReload() {},
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(
      () => {
        registration.update();
      },
      30 * 60 * 1000,
    );
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update();
    });
  },
});
