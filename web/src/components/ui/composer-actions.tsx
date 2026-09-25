import { useT } from "../../i18n";

/**
 * composer 卡片底行 Stop/Send 互斥按钮对（claude/pi/acp 三 adapter 单源；ml-auto 同槽右对齐，
 * Send 覆盖 Stop——有 Send 不显 Stop）。Stop = bg-error 方块；Send = bg-primary 上箭头 +
 * onMouseDown preventDefault 保焦（移动端发送后键盘不收，前端经验沉淀）。
 */
export function ComposerStopSend({
  onCancel,
  send,
  showSend,
  showStop,
}: {
  onCancel?: () => void;
  send: () => void;
  showSend: boolean;
  showStop: boolean;
}) {
  const { t } = useT();
  return (
    <>
      {showStop ? (
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("session.stop")}
          title={t("session.stop")}
          className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-error text-on-error shadow-lg transition cursor-pointer"
        >
          <span className="h-2.5 w-2.5 rounded-[2px] bg-on-error/90" />
        </button>
      ) : null}
      {showSend ? (
        <button
          type="button"
          // preventDefault 阻止 mousedown 把焦点从 textarea 转移到按钮 → textarea 保焦 →
          // 键盘不收（发送后输入清空，用户大概率继续输入，保焦=键盘不收）。
          onMouseDown={(e) => e.preventDefault()}
          onClick={send}
          aria-label={t("claude.composer.send")}
          title={t("claude.composer.send")}
          className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary shadow-lg transition hover:opacity-90 cursor-pointer"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
            <path
              d="M12 19V5M5 12l7-7 7 7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              stroke="currentColor"
            />
          </svg>
        </button>
      ) : null}
    </>
  );
}
