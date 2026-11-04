import { useEffect, useState } from "react";
import { uploadDiagLog } from "../../api/client";
import {
  clearDiagLog,
  DIAG_ENABLED_EVENT,
  DIAG_EVENT,
  isDiagEnabled,
  readDiagEntries,
  readDiagLines,
} from "../../lib/diag-log";

/**
 * 全局诊断横幅（项目级通用诊断基建的查看面）：诊断开关开启时常驻屏顶胶囊，
 * 点开看诊断环形缓冲全文 + copy all / 上传 / 清空。任何功能的 recordDiag(scope, ...)
 * 输出都汇到这里——不限会话页，挂 App shell（main.tsx，RouterProvider 同级）。
 * 开关关闭即整条消失；诊断件不进 i18n（英文短字段，对齐 ReplayDebugBanner 先例）。
 * 胶囊收窄居中（真机反馈 2026-11-05：宽胶囊挡住左上返回钮与右上设置 ⚙）——
 * max-w 60vw/320px，两侧各留 ≥ 角钮带（移动 390px 时 78px > 52px 钮带），
 * 摘要长则 truncate（全文在面板）。
 */
export function DiagBanner() {
  const [enabled, setEnabled] = useState(isDiagEnabled);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [uploadError, setUploadError] = useState("");
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => {
      setEnabled(isDiagEnabled());
      setLines(readDiagLines());
    };
    refresh();
    window.addEventListener(DIAG_EVENT, refresh);
    window.addEventListener(DIAG_ENABLED_EVENT, refresh);
    return () => {
      window.removeEventListener(DIAG_EVENT, refresh);
      window.removeEventListener(DIAG_ENABLED_EVENT, refresh);
    };
  }, []);
  if (!enabled) return null;

  const lastLine = lines.at(-1) ?? "";
  const summary = lastLine.replace(/^\d\d:\d\d:\d\d /, "");

  const handleCopy = () => {
    void navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // 剪贴板失败（非 https/权限）：静默，用户仍可拍屏
      });
  };

  const handleUpload = () => {
    setUploadState("busy");
    setUploadError("");
    void uploadDiagLog({ entries: readDiagEntries() })
      .then(() => {
        setUploadState("done");
        window.setTimeout(() => setUploadState("idle"), 1500);
      })
      .catch((e: unknown) => {
        setUploadState("failed");
        setUploadError(e instanceof Error ? e.message : String(e));
      });
  };

  const handleClear = () => {
    clearDiagLog();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-1 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]">
      <button
        className="pointer-events-auto max-w-[min(60vw,320px)] cursor-pointer truncate rounded-full border border-sep bg-elevated px-3 py-1.5 text-caption text-on-surface-muted shadow-sm"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {lines.length > 0 ? summary : "diag on · waiting"}
      </button>
      {open ? (
        <div className="pointer-events-auto flex w-[min(92vw,480px)] flex-col rounded-2xl border border-sep bg-elevated p-3 shadow-lg">
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all text-caption text-on-surface-muted">
            {lines.length > 0 ? lines.join("\n") : "(empty)"}
          </pre>
          <div className="mt-2 flex items-center gap-2">
            <button
              className="cursor-pointer rounded-lg border border-sep bg-surface px-2.5 py-1 text-caption text-on-surface-muted transition hover:bg-elevated2"
              onClick={handleCopy}
              type="button"
            >
              {copied ? "copied ✓" : "copy all"}
            </button>
            <button
              className="cursor-pointer rounded-lg border border-sep bg-surface px-2.5 py-1 text-caption text-on-surface-muted transition hover:bg-elevated2"
              disabled={uploadState === "busy" || lines.length === 0}
              onClick={handleUpload}
              type="button"
            >
              {uploadState === "busy"
                ? "uploading…"
                : uploadState === "done"
                  ? "uploaded ✓"
                  : "upload"}
            </button>
            <button
              className="cursor-pointer rounded-lg border border-sep bg-surface px-2.5 py-1 text-caption text-error transition hover:bg-error/10"
              onClick={handleClear}
              type="button"
            >
              clear
            </button>
            <button
              aria-label="close diag panel"
              className="ml-auto inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-2 transition hover:bg-ink-1/5"
              onClick={() => setOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          {uploadState === "failed" ? (
            <p className="mt-1 break-all text-caption text-error">{uploadError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
