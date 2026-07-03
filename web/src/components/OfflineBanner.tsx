import { useSyncExternalStore } from "react";
import { useT } from "../i18n";

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

export function OfflineBanner() {
  const { t } = useT();
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className="fixed top-0 left-0 right-0 bg-warning text-on-primary text-center py-2 text-sm font-medium z-50">
      {t("offline.message")}
    </div>
  );
}
