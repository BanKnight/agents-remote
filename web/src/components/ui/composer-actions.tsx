import { useT } from "../../i18n";
import { LucideIcon } from "@/components/shell/lucide-icon";

/**
 * composer 卡片底行 Stop/Send 互斥按钮对（claude/pi/acp 三 adapter 单源；ml-auto 同槽右对齐，
 * Send 覆盖 Stop——有 Send 不显 Stop）。v1.4 04/04f .send2 单源换装：28×28 r12，Send =
 * bg-primary + Lucide arrow-up 14px；Stop = 红 tint 底 + 红 60% 边 + ::before 红方块
 * （.send2.stopstate，对齐原型，取代旧实底红）。Send 的 onMouseDown preventDefault 保焦
 *（移动端发送后键盘不收，前端经验沉淀）。
 */
export function ComposerStopSend({
  onCancel,
  send,
  sendDisabled,
  sendDisabledTitle,
  showSend,
  showStop,
}: {
  onCancel?: () => void;
  send: () => void;
  /** 附件上传中置灰（点无意义；sendComposer 内 gate 保留双保险）。ACP/Chat 无附件系统，可选。 */
  sendDisabled?: boolean;
  /** sendDisabled 时的 title 说明（不传回落默认 send 文案）。 */
  sendDisabledTitle?: string;
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
          className="send2 stopstate"
        />
      ) : null}
      {showSend ? (
        <button
          type="button"
          // preventDefault 阻止 mousedown 把焦点从 textarea 转移到按钮 → textarea 保焦 →
          // 键盘不收（发送后输入清空，用户大概率继续输入，保焦=键盘不收）。disabled 按钮
          // 不派发 mouse 事件，置灰态无副作用。
          disabled={sendDisabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={send}
          aria-label={t("claude.composer.send")}
          title={
            sendDisabled
              ? (sendDisabledTitle ?? t("claude.composer.send"))
              : t("claude.composer.send")
          }
          className="send2"
        >
          <LucideIcon name="arrow-up" />
        </button>
      ) : null}
    </>
  );
}
