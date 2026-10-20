import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { callProjectMcpHubTool, getProjectMcpUiResource } from "../../api/client";
import { useT } from "../../i18n";
import { useConfirm } from "../shell/confirm-dialog";

export const WIKI_PAGE_APP_URI = "ui://ar-hub/wiki-page";

export type WikiPageStructuredContent = {
  kind: "wiki-page";
  slug: string;
  title: string;
  tags?: string[];
  markdown: string;
};

export function isWikiPageStructuredContent(value: unknown): value is WikiPageStructuredContent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "wiki-page" &&
    typeof record.slug === "string" &&
    typeof record.markdown === "string"
  );
}

/**
 * MCP Apps (SEP-1865) web host card. Data channel: CLI passes hub tool result
 * `structuredContent` verbatim via the user-frame `tool_use_result` envelope
 * (S1 field test: text content gets textualized; this field is the only
 * channel) -> normalizeChatStream attaches structuredResult on the tool-call
 * part -> renderChatStream projects it as card metadata.structuredContent.
 * HTML supply: HUB_UI_RESOURCES single-source table via
 * `/api/projects/{name}/mcp-ui-resource` (hub is loopback-only).
 *
 * Sandbox: `allow-scripts` without allow-same-origin = opaque origin; the
 * frame cannot touch parent DOM/storage/cookie. Host feeds data one-way via
 * postMessage. SEP-1865's double-iframe hardening targets third-party server
 * assets; our template is our own system asset, so a single sandboxed frame
 * is the MVP stance.
 */

// Sandbox iframe rendering: fetch template HTML -> srcdoc -> postMessage
// structuredContent on load (the template listens for ui/notifications/tool-result).
export function McpAppCard({
  projectName,
  uri,
  structuredContent,
  heightClassName = "h-[420px]",
  onSendPrompt,
}: {
  projectName: string;
  uri: string;
  structuredContent: unknown;
  heightClassName?: string;
  /** ui/message 确认后的发送出口（renderer 注入 bridge.sendMessage）。 */
  onSendPrompt?: (text: string) => void;
}) {
  const { t, lang } = useT();
  // ui/message user-consent gate (SEP MAY-require; ZCode sendFollowUpMessage 同款).
  const { confirm, holder } = useConfirm();
  // Template is static per deployment; avoid refetching on every card mount.
  const resource = useQuery({
    queryKey: ["projects", projectName, "mcp-ui-resource", uri],
    queryFn: () => getProjectMcpUiResource(projectName, uri),
    staleTime: Infinity,
  });

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // Feed-once guard. Only the FIRST load of a given template gets the initial
  // postMessage; fedWinRef doubles as the "load fired" signal for re-sends
  // (structuredContent updates skip until then) and is nulled on navigation.
  // A later onLoad on the same srcDoc means script inside the frame navigated
  // the frame itself (reachable only via a future escaping bug) — a navigated
  // document must never receive data. (security-review 2026-10-20: postMessage
  // "*" x onLoad refire chain cut; P2-1: WindowProxy identity can't detect
  // navigation — see revokedRef)
  const fedForRef = useRef<string | null>(null);
  const fedWinRef = useRef<Window | null>(null);
  // In-frame navigation detection (security-review 2026-10-20 P2-1): iframe
  // contentWindow is a stable WindowProxy — identity comparison can NOT detect
  // a navigated document. A second onLoad with the same srcDoc IS the
  // navigation signal; from then on no data flows in either direction.
  const revokedRef = useRef(false);
  // Content-driven height reported by the template (ZCode visualize 参考:
  // frame follows content instead of a fixed card height).
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  // Host theme follows the app's data-theme (":root" = dark, light override).
  const hostTheme = (): "light" | "dark" =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const sendHostContext = () => {
    const frame = frameRef.current;
    const win = frame?.contentWindow;
    if (!frame || !win || win !== fedWinRef.current) return;
    win.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: { theme: hostTheme() },
      },
      "*",
    );
  };
  const postToolResult = () => {
    const frame = frameRef.current;
    const win = frame?.contentWindow;
    if (!frame || !win || win !== fedWinRef.current) return;
    sendHostContext();
    win.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: { structuredContent },
      },
      // srcdoc + allow-scripts (no allow-same-origin) = opaque origin; a
      // specific targetOrigin cannot match. Payload is user-visible wiki
      // content anyway, and the sandbox has no callback surface.
      "*",
    );
  };
  // Reverse-channel request dispatcher (SEP-1865 阶段 4). Reads of
  // confirm/t/onSendPrompt must see latest render values -> latest-ref pattern,
  // the long-lived message listener forwards requests here.
  const requestDispatcherRef = useRef<(event: MessageEvent) => Promise<void>>(() =>
    Promise.resolve(),
  );
  requestDispatcherRef.current = async (event) => {
    const frame = frameRef.current;
    const win = frame?.contentWindow;
    if (!frame || !win || event.source !== win) return;
    const data = event.data as {
      id: number;
      method: string;
      params?: {
        name?: unknown;
        arguments?: Record<string, unknown>;
        role?: unknown;
        content?: { type?: unknown; text?: unknown };
      };
    } | null;
    if (!data || typeof data.id !== "number" || typeof data.method !== "string") return;

    const reply = (result: unknown) => {
      // Requests can arrive before onLoad fires the first feed (handshake runs
      // during document parse) — do NOT gate replies on fedWinRef, only on the
      // navigation revocation. event.source was already verified above.
      if (revokedRef.current) return;
      win.postMessage({ jsonrpc: "2.0", id: data.id, result }, "*");
    };
    const replyError = (code: number, message: string) => {
      if (revokedRef.current) return;
      win.postMessage({ jsonrpc: "2.0", id: data.id, error: { code, message } }, "*");
    };

    if (data.method === "ui/initialize") {
      reply({
        protocolVersion: "2026-01-26",
        hostInfo: { name: "agents-remote", version: "0.0.0" },
        // Declare what we actually answer (code-review 2026-10-20: an empty
        // capabilities object contradicts our live ui/message support).
        hostCapabilities: { message: {} },
        // App language preference (resolved "zh"/"en"), not navigator.language
        // — the browser locale can diverge from the in-app language setting.
        hostContext: { theme: hostTheme(), locale: lang },
      });
      return;
    }
    if (data.method === "ping") {
      reply({});
      return;
    }
    if (data.method === "tools/call") {
      // App-callable allowlist (defense in depth; api enforces its own table).
      const name = typeof data.params?.name === "string" ? data.params.name : "";
      if (name !== "wiki_read_page") {
        replyError(-32602, `unknown app tool: ${name}`);
        return;
      }
      const args = data.params?.arguments ?? {};
      try {
        const result = await callProjectMcpHubTool(projectName, "wiki_read_page", args);
        reply(result);
      } catch (error) {
        replyError(-32000, error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (data.method === "ui/message") {
      const text = data.params?.content?.text;
      if (typeof text !== "string" || text.length === 0) {
        replyError(-32602, "ui/message requires content.text");
        return;
      }
      if (!onSendPrompt) {
        replyError(-32600, "sending is not available here");
        return;
      }
      const ok = await confirm({
        title: t("claude.mcpApp.followUpTitle"),
        message: text,
        confirmLabel: t("claude.composer.send"),
        cancelLabel: t("cancel"),
        tone: "default",
      });
      if (!ok) {
        replyError(-32600, "rejected by the user");
        return;
      }
      onSendPrompt(text);
      reply({});
      return;
    }
    replyError(-32601, `method not found: ${data.method}`);
  };
  // Template reports its content height; clamp to sane bounds.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as {
        method?: string;
        params?: { height?: unknown };
        id?: number;
      } | null;
      // Requests (id+method) forward to the latest-ref dispatcher.
      if (typeof data?.id === "number" && typeof data.method === "string") {
        void requestDispatcherRef.current(event);
        return;
      }
      if (data?.method !== "ui/notifications/size-changed") return;
      const h = data.params?.height;
      if (typeof h === "number" && Number.isFinite(h)) {
        setFrameHeight(Math.min(10000, Math.max(120, Math.round(h))));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  // Re-sync the frame when the user switches the app theme.
  useEffect(() => {
    const observer = new MutationObserver(() => sendHostContext());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Re-send when structuredContent updates after load. Before load the effect
  // skips (window not fed yet); onLoad posts the latest value.
  useEffect(() => {
    postToolResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuredContent]);

  if (resource.isPending) {
    return <div className={heightClassName} aria-busy="true" />;
  }
  if (resource.isError) {
    // Old replay after the ui capability was switched off / network failure:
    // lightweight inline note instead of a broken card.
    return (
      <div className="px-1 py-2 text-xs text-on-surface-muted">
        {t("claude.mcpApp.unavailable")}
      </div>
    );
  }

  return (
    <>
      <iframe
        ref={frameRef}
        className={`mt-2 w-full overflow-hidden rounded-lg border border-neutral-line/40 bg-white ${heightClassName}`}
        // Template-reported content height overrides the fallback height class.
        style={frameHeight != null ? { height: frameHeight } : undefined}
        onLoad={() => {
          const frame = frameRef.current;
          const html = resource.data?.html;
          if (!frame || html == null) return;
          if (fedForRef.current === html) {
            // same-template refire = in-frame navigation: revoke all data flow
            // (WindowProxy is stable, so this is the only reliable signal).
            revokedRef.current = true;
            fedWinRef.current = null;
            return;
          }
          fedForRef.current = html;
          fedWinRef.current = frame.contentWindow;
          postToolResult();
        }}
        sandbox="allow-scripts"
        srcDoc={resource.data.html}
        title="MCP app"
      />
      {holder}
    </>
  );
}

// wiki_read_page display tool renderer lives in tool-ui-registry.tsx
// (HubWikiPageToolUI) — keeping it there avoids an import cycle: this module
// must not import tool-ui-registry, which registers the renderer and consumes
// McpAppCard from here.
