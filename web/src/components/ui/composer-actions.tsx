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
          className="send2 stopstate"
        />
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
          className="send2"
        >
          <LucideIcon name="arrow-up" />
        </button>
      ) : null}
    </>
  );
}
