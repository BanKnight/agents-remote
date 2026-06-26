import { useT } from "../../i18n";
import { CollapsibleSection } from "./collapsible-section";
import { ToolHead, type ToolHeadStatus } from "./tool-head";

// HookCard — one hook_started + hook_response pair (matched by hook_id in
// normalizeChatStream) rendered as a single default-collapsed card. Mirrors
// compact-block's density: a ToolHead header carries the hook identity and
// status (brightness scheme), the collapsed body hides the hook's JSON output,
// which is usually internal state (often `suppressOutput`).
//
// Status is derived inline (not via the routes-layer deriveStatus) so this
// component stays self-contained: outcome pending → running, "success" →
// completed, anything else → error.
function formatHookOutput(output: string | undefined): string | null {
  if (output == null || output === "") return null;
  try {
    return JSON.stringify(JSON.parse(output), null, 2);
  } catch {
    return output;
  }
}

export function HookCard({ custom }: { custom?: Record<string, unknown> }) {
  const { t } = useT();

  const hookName = (custom?.hookName as string | undefined) ?? "hook";
  const outcome = custom?.outcome as string | undefined;
  const output = formatHookOutput(custom?.output as string | undefined);
  const stderr = (custom?.stderr as string | undefined) || null;

  const status: ToolHeadStatus =
    outcome == null ? "running" : outcome === "success" ? "completed" : "error";

  const header = (
    <div className="flex items-center gap-1.5 text-xs min-w-0">
      <ToolHead
        icon="hook"
        status={status}
        badge={t("claude2.hook.title")}
        badgeClassName="bg-amber-500/15 text-amber-200"
        detail={hookName}
        detailClassName="font-mono text-[0.65rem] font-normal text-slate-400"
      />
    </div>
  );

  const body =
    output || stderr ? (
      <div className="space-y-2">
        {output ? (
          <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-300">
            {output}
          </pre>
        ) : null}
        {stderr ? (
          <pre className="max-h-32 overflow-x-auto whitespace-pre-wrap break-all text-xs text-red-300/80">
            {stderr}
          </pre>
        ) : null}
      </div>
    ) : null;

  // No body while running (hook_started only, no output yet) → render the
  // header plain, without a collapsible toggle that would expand to nothing.
  return (
    <div className="w-full rounded-lg border border-amber-800/30 bg-amber-950/10 px-3 py-2">
      {body ? (
        <CollapsibleSection defaultExpanded={false} header={header}>
          {body}
        </CollapsibleSection>
      ) : (
        header
      )}
    </div>
  );
}
