import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Provider as JotaiProvider } from "jotai";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n";
import { queryClient } from "./lib/query-client";
import { restoreLastPath, saveCurrentPath } from "./navigation-persistence";
import { router } from "./routes/router";
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
        <JotaiProvider>
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
