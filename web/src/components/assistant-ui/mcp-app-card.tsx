import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProjectMcpUiResource } from "../../api/client";
import { useT } from "../../i18n";

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
}: {
  projectName: string;
  uri: string;
  structuredContent: unknown;
  heightClassName?: string;
}) {
  const { t } = useT();
  // Template is static per deployment; avoid refetching on every card mount.
  const resource = useQuery({
    queryKey: ["projects", projectName, "mcp-ui-resource", uri],
    queryFn: () => getProjectMcpUiResource(projectName, uri),
    staleTime: Infinity,
  });

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const loadedRef = useRef(false);
  const postToolResult = () => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
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
  // Re-send when structuredContent updates after load. Before load the effect
  // skips (document not ready); onLoad posts the latest value.
  useEffect(() => {
    if (loadedRef.current) postToolResult();
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
    <iframe
      ref={frameRef}
      className={`mt-2 w-full overflow-hidden rounded-lg border border-neutral-line/40 bg-white ${heightClassName}`}
      onLoad={() => {
        loadedRef.current = true;
        postToolResult();
      }}
      sandbox="allow-scripts"
      srcDoc={resource.data.html}
      title="MCP app"
    />
  );
}

// wiki_read_page display tool renderer lives in tool-ui-registry.tsx
// (HubWikiPageToolUI) — keeping it there avoids an import cycle: this module
// must not import tool-ui-registry, which registers the renderer and consumes
// McpAppCard from here.
