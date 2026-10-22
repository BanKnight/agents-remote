import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { callProjectMcpHubTool, getProjectMcpUiResource } from "../../api/client";
import { useT } from "../../i18n";
import { useConfirm } from "../shell/confirm-dialog";

export const WIKI_PAGE_APP_URI = "ui://ar-hub/wiki-page";
export const GIT_STATUS_APP_URI = "ui://ar-hub/git-status";
export const GIT_LOG_APP_URI = "ui://ar-hub/git-log";
export const SESSION_OVERVIEW_APP_URI = "ui://ar-hub/session-overview";
export const SETTINGS_PREVIEW_APP_URI = "ui://ar-hub/settings-preview";
export const FILE_PREVIEW_APP_URI = "ui://ar-hub/file-preview";
export const CANVAS_APP_URI = "ui://ar-hub/canvas";

/**
 * 流内卡片高度上限：模板上报的内容高钳到此后，iframe 文档视口小于内容 →
 * iframe 文档级出滚动条（模板 html/body 无 overflow 声明，UA 默认滚动机制接管）。
 * 与默认 fallback 类名 "h-[420px]" 同档；类名不可从此常量派生（Tailwind 静态扫描），
 * 两处需手工同步。
 */
const FRAME_MAX_HEIGHT_PX = 420;

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

// 契约与 api 侧 gitStatusStructuredContent/gitLogStructuredContent（mcp-hub-server.ts）
// 对齐;守卫只验 kind + 关键字段（卡片对恶意/漂移数据的最小信任面）。
export type GitStatusStructuredContent = {
  kind: "git-status";
  branch?: string;
  clean: boolean;
  files: {
    path: string;
    status: string;
    scope: string;
    addedLines: number | null;
    removedLines: number | null;
  }[];
};

export function isGitStatusStructuredContent(value: unknown): value is GitStatusStructuredContent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "git-status" && typeof record.clean === "boolean" && Array.isArray(record.files)
  );
}

export type GitLogStructuredContent = {
  kind: "git-log";
  branch: string;
  total: number;
  commits: {
    hash: string;
    message: string;
    author: string;
    relativeTime: string;
  }[];
};

export function isGitLogStructuredContent(value: unknown): value is GitLogStructuredContent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "git-log" && typeof record.total === "number" && Array.isArray(record.commits)
  );
}

export type SessionOverviewStructuredContent = {
  kind: "session-overview";
  projectName: string;
  counts: Record<string, number>;
  sessions: {
    displayName: string;
    type: string;
    status: string;
    updatedAt?: string;
  }[];
};

export function isSessionOverviewStructuredContent(
  value: unknown,
): value is SessionOverviewStructuredContent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "session-overview" &&
    typeof record.projectName === "string" &&
    typeof record.counts === "object" &&
    record.counts !== null &&
    Array.isArray(record.sessions)
  );
}

export type SettingsPreviewStructuredContent = {
  kind: "settings-preview";
  projectName: string;
  capabilities: Record<string, boolean>;
  mcpServers: {
    name: string;
    type: string;
  }[];
};

export function isSettingsPreviewStructuredContent(
  value: unknown,
): value is SettingsPreviewStructuredContent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "settings-preview" &&
    typeof record.projectName === "string" &&
    typeof record.capabilities === "object" &&
    record.capabilities !== null &&
    Array.isArray(record.mcpServers)
  );
}

export type FilePreviewStructuredContent = {
  kind: "file-preview";
  path: string;
  name: string;
  size: number;
  content: string;
};

export function isFilePreviewStructuredContent(
  value: unknown,
): value is FilePreviewStructuredContent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "file-preview" &&
    typeof record.path === "string" &&
    typeof record.content === "string"
  );
}

// 画布卡（M2.2,契约 = api canvasSceneStructuredContent）：全量面带 elements;
// 超 48KiB 降摘要面（truncated + 摘要元素）由模板走 read_scene 拉全量。
export type CanvasDocStructuredContent = {
  kind: "canvas-doc";
  id: string;
  title: string;
  revision: number;
  elementCount: number;
  elements?: unknown[];
  truncated?: boolean;
};

export function isCanvasDocStructuredContent(value: unknown): value is CanvasDocStructuredContent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "canvas-doc" &&
    typeof record.id === "string" &&
    typeof record.revision === "number" &&
    typeof record.elementCount === "number"
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
  fillHeight = false,
  onSendPrompt,
  allowedToolName = "wiki_read_page",
  allowedToolNames,
  autoFocusFrame = false,
}: {
  projectName: string;
  uri: string;
  structuredContent: unknown;
  heightClassName?: string;
  /**
   * 全屏放大态：忽略 size-changed 上报（不写 inline height，撑满由调用方
   * heightClassName 决定），内容在 iframe 文档内滚。两处必须一起关——
   * listener 跳过 setFrameHeight + inline style 抑制，否则首份上报会压掉 h-full。
   */
  fillHeight?: boolean;
  /** ui/message 确认后的发送出口（renderer 注入 bridge.sendMessage）。 */
  onSendPrompt?: (text: string) => void;
  /**
   * tools/call 反向通道允许的 tool 名（host 侧 allowlist,与 api 侧 HUB_APP_TOOLS
   * 白名单双层防御）。卡片刷新钮调用的就是自己的 tool（git 卡刷 git_status）,
   * 故每卡对应一个名字;缺省 wiki_read_page 保持既有调用方零改动。
   */
  allowedToolName?: string;
  /**
   * tools/call 白名单多名形态（画布卡：read_scene 刷新 + commit_scene 回存）。
   * 提供时覆盖 allowedToolName；缺省回落单名,既有调用方零改动。
   */
  allowedToolNames?: string[];
  /**
   * onLoad 后宿主预聚焦 iframe（M2.0 实验实锤：首次点击 iframe 获焦的 win:focus
   * 会清掉 excalidraw 按下态,第一次拖画/框选必然无效;预聚焦后首画可用）。
   * 仅画布卡开启——聚焦抢夺对其它卡是纯回归。
   */
  autoFocusFrame?: boolean;
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
  // tools/call 白名单（多名形态覆盖单名缺省;host 侧防御层,api HUB_APP_TOOLS 是另一层）。
  const allowedNames = allowedToolNames ?? [allowedToolName];
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
    if (data.method === "tools/call" && typeof data.params?.name === "string") {
      // App-callable allowlist (defense in depth; api enforces its own table).
      const name = data.params.name;
      if (!allowedNames.includes(name)) {
        replyError(-32602, `unknown app tool: ${name}`);
        return;
      }
      const args = data.params.arguments ?? {};
      try {
        const result = await callProjectMcpHubTool(projectName, name, args);
        reply(result);
      } catch (error) {
        // fetchJson 的 message 是本地化文案+status,结构化错误码在 ApiClientError.code
        // （如 PROJECT_CANVAS_REVISION_CONFLICT）。前置成 [CODE] 前缀进 message,
        // 模板侧按子串分流（画布卡 REVISION_CONFLICT → 过期重载）才有的认。
        const code = (error as { code?: unknown } | null)?.code;
        const msg = error instanceof Error ? error.message : String(error);
        replyError(-32000, typeof code === "string" && code ? `[${code}] ${msg}` : msg);
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
      // fillHeight（全屏放大态）：高度交给调用方，上报不消费（inline style 同步抑制）。
      if (fillHeight) return;
      const h = data.params?.height;
      if (typeof h === "number" && Number.isFinite(h)) {
        setFrameHeight(Math.min(FRAME_MAX_HEIGHT_PX, Math.max(120, Math.round(h))));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fillHeight]);
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
        className={`${fillHeight ? "" : "mt-2 "}w-full overflow-hidden rounded-lg border border-neutral-line/40 bg-canvas ${heightClassName}`}
        data-testid="mcp-app-frame"
        // Template-reported content height overrides the fallback height class
        // (clamped to FRAME_MAX_HEIGHT_PX in flow; suppressed when fillHeight).
        style={!fillHeight && frameHeight != null ? { height: frameHeight } : undefined}
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
          // M2.0 实锤的 excalidraw 首画失效修复：宿主预聚焦抢在用户首次点击
          // 之前,win:focus 的按下态清除不再发生在首画路径上（preventScroll
          // 避免宿主页面滚动跳位）。
          if (autoFocusFrame) frame.focus({ preventScroll: true });
        }}
        sandbox="allow-scripts"
        srcDoc={resource.data.html}
        title={t("claude.mcpApp.frameTitle")}
      />
      {holder}
    </>
  );
}

// wiki_read_page display tool renderer lives in tool-ui-registry.tsx
// (HubWikiPageToolUI) — keeping it there avoids an import cycle: this module
// must not import tool-ui-registry, which registers the renderer and consumes
// McpAppCard from here.
