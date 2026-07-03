import { useT } from "../../i18n";
import { formatDuration, formatTokenCount } from "../../lib/utils";
import { AttachmentBubble } from "./attachment-bubble";
import { CollapsibleSection } from "./collapsible-section";
import { ToolHead } from "./tool-head";

// CompactBlock — one context-compaction rendered as a single default-collapsed
// block. Merges (by position, in normalizeChatStream) a compact/microcompact
// boundary, its isCompactSummary user message, and the in-window attachments.
//
// The header is a ToolHead row (compact glyph + emerald badge + a `·`-joined
// detail of trigger / token delta / duration / messages summarized / restored
// context). The collapsed state is the whole point — compaction summaries are
// rarely re-read, so only the header shows by default. Expanded body surfaces
// the summary text and the absorbed attachment rows.
export function CompactBlock({ custom }: { custom?: Record<string, unknown> }) {
  const { t } = useT();

  const trigger = (custom?.trigger ?? "auto") as "manual" | "auto" | "micro";
  const preTokens = custom?.preTokens as number | undefined;
  const postTokens = custom?.postTokens as number | undefined;
  const durationMs = custom?.durationMs as number | undefined;
  const messagesSummarized = custom?.messagesSummarized as number | undefined;
  const summaryText = custom?.summaryText as string | undefined;
  const attachments = Array.isArray(custom?.attachments)
    ? (custom.attachments as Array<{ subtype: string; raw: Record<string, unknown> }>)
    : [];

  const triggerLabel =
    trigger === "manual"
      ? t("claude2.compact.triggerManual")
      : trigger === "micro"
        ? t("claude2.compact.triggerMicro")
        : t("claude2.compact.triggerAuto");

  const detailParts: string[] = [triggerLabel];
  if (preTokens != null || postTokens != null) {
    detailParts.push(
      `${preTokens != null ? formatTokenCount(preTokens) : "?"}→${postTokens != null ? formatTokenCount(postTokens) : "?"}`,
    );
  }
  if (durationMs != null) detailParts.push(formatDuration(durationMs));
  if (messagesSummarized != null)
    detailParts.push(t("claude2.compact.summarized", { count: messagesSummarized }));
  if (attachments.length > 0)
    detailParts.push(t("claude2.compact.restored", { count: attachments.length }));

  const header = (
    <div className="flex items-center gap-1.5 text-xs min-w-0">
      <ToolHead
        icon="compact"
        status="completed"
        badge={t("claude2.compact.title")}
        badgeClassName="bg-success/15 text-success"
        detail={detailParts.join(" · ")}
        detailClassName="font-mono text-[0.65rem] font-normal text-on-surface-muted"
      />
    </div>
  );

  const hasBody = !!summaryText || attachments.length > 0;
  const body = hasBody ? (
    <div className="space-y-2">
      {summaryText ? (
        <div>
          <div className="mb-1 text-[0.6rem] text-success/50">
            {t("claude2.compact.summaryLabel")}
          </div>
          <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap break-all text-xs text-on-surface-soft">
            {summaryText}
          </pre>
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <div className="space-y-1">
          {attachments.map((a, i) => (
            <AttachmentBubble key={`${a.subtype}-${i}`} subtype={a.subtype} raw={a.raw} />
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="w-full rounded-lg border border-success/30 bg-success/10 px-3 py-2">
      <CollapsibleSection
        defaultExpanded={false}
        dividerClassName="border-success/20"
        header={header}
      >
        {body}
      </CollapsibleSection>
    </div>
  );
}
