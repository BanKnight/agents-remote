import { useEffect, useState } from "react";

import { useT } from "../../i18n";
import { useIsMobile } from "@/lib/use-is-mobile";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

/**
 * 03w2 重命名对话框单源（v1.4 批4）。iOS 居中 Alert 形制：两端同款居中（03w2 pin④
 * 「iPad/Mac = 同款居中 Alert」），不分流 MobileSheet——与 03y/03w3 的容器分流不同。
 * 预填全选 + 回车确认；重名即时行内提示（红字禁用 / 合法且已改名显示 ✓ 可用，pin③）。
 * mutation 留调用方（onSubmit(newName)——renameMutation + invalidate 在调用方已有）。
 */
export function RenameDialog({
  open,
  onOpenChange,
  initialName,
  siblings,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  siblings: string[];
  onSubmit: (newName: string) => void;
}) {
  const { t } = useT();
  // 双端同款居中 Alert（不分流 MobileSheet）——键盘推挤只在移动端存在，isMobile 条件拦
  // initial focus（桌面保持聚焦输入框的表单惯例）。
  const isMobile = useIsMobile();
  const [value, setValue] = useState(initialName);
  // 打开时重置为当前名（同一挂载实例二次打开不残留上次输入）。
  useEffect(() => {
    if (open) setValue(initialName);
  }, [open, initialName]);

  const trimmed = value.trim();
  // 确认可用 = 已改名 + 不重名；未改名禁用（无语义操作，形制保持）。
  const canSubmit = trimmed.length > 0 && trimmed !== initialName && !siblings.includes(trimmed);
  const conflict = siblings.includes(trimmed);

  const submit = () => {
    if (!canSubmit) return;
    onOpenChange(false);
    onSubmit(trimmed);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-w-xs sm:max-w-xs"
        onOpenAutoFocus={(e) => {
          if (isMobile) e.preventDefault();
        }}
      >
        <div
          className={`rounded-2xl p-5 text-center shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <DialogTitle className="text-base font-bold text-on-surface">
            {t("files.rename")}
          </DialogTitle>
          <p className="mt-1 text-xs leading-5 text-on-surface-muted">{t("files.renameDesc")}</p>
          <div className="kfield mono mt-3 text-left">
            <input
              aria-label={t("files.rename")}
              autoComplete="off"
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              type="text"
              value={value}
            />
          </div>
          <div className="mt-1 min-h-4 text-left text-[11px]">
            {conflict ? (
              <span className="text-error">{t("files.nameExists")}</span>
            ) : canSubmit ? (
              <span className="text-success">{t("files.nameOk")}</span>
            ) : null}
          </div>
          <div className="mt-3 flex border-t border-neutral-line">
            <button
              className="min-h-[44px] flex-1 text-sm text-on-surface-soft transition active:bg-on-surface/5"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              {t("cancel")}
            </button>
            <button
              className="min-h-[44px] flex-1 border-l border-neutral-line text-sm font-semibold text-primary transition active:bg-on-surface/5"
              disabled={!canSubmit}
              onClick={submit}
              type="button"
            >
              {t("files.rename")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
