import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Provider as JotaiProvider } from "jotai";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n";
import { restoreLastPath, saveCurrentPath } from "./navigation-persistence";
import { router } from "./routes/router";
import "./styles/index.css";

restoreLastPath();

router.subscribe("onResolved", () => {
  saveCurrentPath(window.location.pathname, window.location.search);
});

const queryClient = new QueryClient();
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

const splash = document.getElementById("splash");
if (splash) {
  requestAnimationFrame(() => {
    splash.setAttribute("hidden", "");
    splash.addEventListener("transitionend", () => splash.remove(), { once: true });
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const registrationPromise = navigator.serviceWorker.register?.("/service-worker.js", {
      updateViaCache: "none",
    });

    if (!registrationPromise) {
      return;
    }

    void registrationPromise
      .then((registration) => {
        let refreshing = false;

        navigator.serviceWorker.addEventListener?.("controllerchange", () => {
          if (!refreshing && registration.active) {
            refreshing = true;
            window.location.reload();
          }
        });

        void registration?.update?.();
      })
      .catch(() => undefined);
  });
}
