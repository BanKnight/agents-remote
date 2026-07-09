import { useAtom } from "jotai";

import { useT } from "../../i18n";
import { workbenchSettingsFlyoutOpenAtom } from "../../routes/workbench-model";
import { Dialog, DialogContent } from "../ui/dialog";
import { shellSurfaceClasses } from "../shell/shell-primitives";

/**
 * 桌面设置浮窗（设计文档 §7：桌面左栏浮窗，移动走 /settings 全屏页）。由
 * workbenchSettingsFlyoutOpenAtom 控制开关（左栏底部入口 toggle），非持久化、不进 URL。
 * 居中 modal（Radix Dialog）：scrim 点击 / ✕ / Esc 关闭 + focus trap（统一 modal 语义，
 * 见 frontend-notes §4）。本轮（Phase 4）骨架占位；实际设置项（主题/语言/部署信息）是后续 follow-up。
 */
export function SettingsFlyout() {
  const { t } = useT();
  const [open, setOpen] = useAtom(workbenchSettingsFlyoutOpenAtom);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex items-center justify-center p-4">
        <div className={`w-full max-w-md rounded-2xl p-5 ${shellSurfaceClasses.raised}`}>
          <header className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-on-surface">{t("nav.settings")}</h2>
            <button
              aria-label={t("session.close")}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
              onClick={() => setOpen(false)}
              type="button"
            >
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth={1.5}
                />
              </svg>
            </button>
          </header>
          <p className="mt-4 text-sm text-on-surface-muted">{t("settings.placeholder")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
