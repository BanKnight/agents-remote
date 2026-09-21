import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { getDefaultStore, Provider as JotaiProvider } from "jotai";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n";
import { queryClient } from "./lib/query-client";
import { restoreLastPath, saveCurrentPath } from "./navigation-persistence";
import { router } from "./routes/router";
import { ThemeSync } from "./theme";
import "./styles/index.css";
import { registerSW } from "virtual:pwa-register";

restoreLastPath();

router.subscribe("onResolved", () => {
  saveCurrentPath(window.location.pathname, window.location.search);
});

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
          <RouterProvider router={router} />
        </JotaiProvider>
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);

registerSW({
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
