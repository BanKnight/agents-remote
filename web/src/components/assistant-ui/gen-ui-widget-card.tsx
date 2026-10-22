import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProjectGenUiFile, getProjectGenUiState, putProjectGenUiState } from "../../api/client";
import { ClaudeBridgeContext } from "../../routes/claude-adapter";
import type { GenUiSessionState, GenUiWidgetState } from "@agents-remote/shared";
import { useT } from "../../i18n";
import { useConfirm } from "../shell/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { ShellIcon } from "../shell/icons";
import { ToolHead, ToolIcon } from "./tool-head";

/**
 * Gen UI（生成式界面）宿主卡片。与 McpAppCard（SEP-1865 JSON-RPC 握手）不同：
 * agent 生成的单文件 HTML 落在项目 `.agents-remote/gen-ui/`，assistant 文本以
 * `::gen-ui{...}` 标记引用（claude-adapter 投影为 gen-ui-widget item）；本卡片经
 * gen-ui-file 端点回源 HTML，拼装 meta CSP + 迷你 `window.zcode` 桥后 srcdoc 进
 * 沙箱 iframe。桥四能力（契约照 ZCode Gen UI，docs/research/mcp-apps-hosting.md
 * §11）：widgetState 读（初始状态内联进 boot，页面脚本同步可用）、setWidgetState
 * 双槽写回（宿主防抖 PUT gen-ui-state）、sendFollowUpMessage（宿主确认闸 →
 * bridge.sendMessage）、zcode:set_globals 主题事件。安全模型同 McpAppCard：
 * sandbox="allow-scripts" opaque origin + CSP `default-src 'none'`（srcdoc 继承
 * 宿主 CSP，HTTP 响应头对 srcdoc 无效——meta 注入是唯一有效层，api 响应头作纵深）。
 */

/** 流内钳高（与 McpAppCard 同款防线）。 */
const FRAME_MAX_HEIGHT_PX = 420;
const FRAME_MIN_HEIGHT_PX = 120;
/** setWidgetState 防抖窗口（滑块拖动类高频调用合并成一次 PUT）。 */
const GEN_UI_STATE_PUT_DEBOUNCE_MS = 800;
/** 会话 state 活页上限（与 api GEN_UI_MAX_WIDGETS 硬闸对齐）。 */
const GEN_UI_MAX_WIDGETS = 32;

/**
 * srcdoc 文档的策略（唯一生效层——srcdoc 继承宿主 CSP，HTTP 响应头无效）。meta CSP
 * 忽略 frame-ancestors（规范），故无此项；sandbox 属性承担框架隔离。
 */
export const GEN_UI_HTML_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** 注入生成页的初始 boot（桥同步可读；定格一次，运行期 setWidgetState 不重建文档）。 */
type GenUiBoot = {
  widgetState: { modelContent?: string; privateContent?: string };
  theme: "light" | "dark";
  locale: string;
};

// 迷你桥（静态字符串，随 srcdoc 注入页面最前）。职责：暴露 window.zcode 四能力、
// 转发主题事件、上报内容高度（生成页零接入成本——桥自带 ResizeObserver）。
const BRIDGE_SCRIPT = `<script>
(function () {
  var boot = window.__GEN_UI_BOOT__ || {};
  // 槽值类型适配:页面作者传 JSON 值(对象/数组)最自然,字符串只在宿主存储层存在
  // ——写侧自动序列化,读侧自动反序列化(非 JSON 文本原样),页面两侧拿到的都是原形。
  var normSlot = function (v) {
    if (v === undefined || v === null) return undefined;
    return typeof v === "string" ? v : JSON.stringify(v);
  };
  var parseSlot = function (v) {
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch (e) { return v; }
  };
  var bootState = boot.widgetState || {};
  var zcode = {
    version: 1,
    theme: boot.theme,
    locale: boot.locale,
    widgetState: {
      modelContent: parseSlot(bootState.modelContent),
      privateContent: parseSlot(bootState.privateContent)
    },
    setWidgetState: function (state) {
      parent.postMessage({ source: "gen-ui", type: "set-state",
        modelContent: normSlot(state && state.modelContent),
        privateContent: normSlot(state && state.privateContent)
      }, "*");
    },
    sendFollowUpMessage: function (text) {
      parent.postMessage({ source: "gen-ui", type: "follow-up", text: String(text) }, "*");
    }
  };
  window.zcode = zcode;
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.source !== "gen-ui-host") return;
    if (d.type === "theme" && (d.theme === "light" || d.theme === "dark")) {
      zcode.theme = d.theme;
      try {
        window.dispatchEvent(new CustomEvent("zcode:set_globals", { detail: { theme: d.theme } }));
      } catch (err) {}
    }
  });
  var lastHeight = 0;
  var report = function () {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (h > 0 && h !== lastHeight) {
      lastHeight = h;
      parent.postMessage({ source: "gen-ui", type: "size", height: h }, "*");
    }
  };
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(report).observe(document.documentElement);
  }
  window.addEventListener("load", report);
  report();
})();
</script>`;

/** boot JSON → 可安全内联进 <script> 的字面量（`<` 转义防 `</script>` 提前闭合）。 */
const safeScriptJson = (value: unknown): string =>
  JSON.stringify(value ?? null).replace(/</g, "\\u003c");

/**
 * 拼装 iframe srcdoc：原 HTML 是完整文档——把 meta CSP + 桥脚本注入 doctype 之后
 * （无 doctype 则前置，浏览器解析器把游离 meta/script 归入隐式 head，仍先于页面
 * 内容执行）。页面自带 meta CSP 时与本策略取交集，只会更严，不削弱防线。
 */
export const assembleGenUiDoc = (html: string, boot: GenUiBoot): string => {
  const injection =
    `<meta http-equiv="Content-Security-Policy" content="${GEN_UI_HTML_CSP}">` +
    `<script>window.__GEN_UI_BOOT__ = ${safeScriptJson(boot)};</script>` +
    BRIDGE_SCRIPT;
  const doctype = /^\s*<!doctype\s+html[^>]*>/i.exec(html);
  if (!doctype) return injection + html;
  const at = doctype[0].length;
  return `${html.slice(0, at)}${injection}${html.slice(at)}`;
};

/** hostTheme：宿主 data-theme 快照（":root" 默认 dark，light 显式覆盖）。 */
const hostTheme = (): "light" | "dark" =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

/**
 * setWidgetState → 会话 state 合并（纯函数，单测覆盖）。undefined 槽位保留原值
 * （页面只写一个槽时另一槽不丢）；同 path 后写覆盖；条目移到尾部。
 */
export const mergeWidgetState = (
  state: GenUiSessionState,
  path: string,
  title: string | undefined,
  slots: { modelContent?: string; privateContent?: string },
): GenUiSessionState => {
  const existing = state.widgets.find((widget) => widget.path === path);
  const resolveSlot = (next: string | undefined, prev: string | undefined) =>
    next !== undefined ? next : prev;
  const widget: GenUiWidgetState = {
    path,
    ...(title ? { title } : existing?.title ? { title: existing.title } : {}),
    ...(resolveSlot(slots.modelContent, existing?.modelContent)
      ? { modelContent: resolveSlot(slots.modelContent, existing?.modelContent) }
      : {}),
    ...(resolveSlot(slots.privateContent, existing?.privateContent)
      ? { privateContent: resolveSlot(slots.privateContent, existing?.privateContent) }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  const merged = [...state.widgets.filter((w) => w.path !== path), widget];
  // 上限 32 与 api 硬闸对齐:超限 PUT 恒 400,该会话全部状态持久化会静默失效。
  // 淘汰最旧(updatedAt 是 ISO 串,字典序 = 时间序),新写条目必然保留。
  if (merged.length > GEN_UI_MAX_WIDGETS) {
    merged.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0));
    merged.splice(0, merged.length - GEN_UI_MAX_WIDGETS);
  }
  return { schemaVersion: 1, widgets: merged };
};

// ── 卡片本体（iframe + 桥宿主侧）──────────────────────────────────────────

export function GenUiWidgetCard({
  projectName,
  sessionId,
  path,
  title,
  heightClassName = "h-[420px]",
  fillHeight = false,
  onSendPrompt,
}: {
  projectName: string;
  sessionId: string;
  path: string;
  title?: string;
  heightClassName?: string;
  /**
   * 全屏放大态：忽略 size 上报（不写 inline height，撑满由调用方 heightClassName
   * 决定），内容在 iframe 文档内滚。与 McpAppCard 同款双关（listener + inline style）。
   */
  fillHeight?: boolean;
  /** sendFollowUpMessage 确认后的发送出口（renderer 注入 bridge.sendMessage）。 */
  onSendPrompt?: (text: string) => void;
}) {
  const { t, lang } = useT();
  const queryClient = useQueryClient();
  const { confirm, holder } = useConfirm();

  // 生成页是部署后静态文件（agent 落盘后不再变）；staleTime Infinity 避免重挂载回源。
  const file = useQuery({
    queryKey: ["projects", projectName, "gen-ui-file", path],
    queryFn: () => getProjectGenUiFile(projectName, path),
    staleTime: Infinity,
  });
  const stateKey = ["projects", projectName, "gen-ui-state", sessionId] as const;
  const sessionState = useQuery({
    queryKey: stateKey,
    queryFn: () => getProjectGenUiState(projectName, sessionId),
    staleTime: Infinity,
  });

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // 桥上报的内容高（钳到 [120, 420]）；null = 未上报，用 heightClassName 兜底。
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  // 同 srcdoc 二次 onLoad = 页面在框内自我导航（WindowProxy 身份不变，检测不到）；
  // 从此双向数据流全部撤销（同 McpAppCard revokedRef）。
  const revokedRef = useRef(false);
  const fedRef = useRef(false);
  // boot 定格：state 到达后拼一次 srcdoc；之后 setWidgetState 只更新缓存 + PUT，
  // 不重建文档（重建 = 页面重载 = 滑块位置全丢）。
  const bootRef = useRef<GenUiBoot | null>(null);
  const [bootReady, setBootReady] = useState(false);
  useEffect(() => {
    const html = file.data?.html;
    if (!html || sessionState.data == null || bootRef.current) return;
    const widget = sessionState.data.widgets.find((w) => w.path === path);
    bootRef.current = {
      widgetState: widget
        ? { modelContent: widget.modelContent, privateContent: widget.privateContent }
        : {},
      theme: hostTheme(),
      locale: lang,
    };
    setBootReady(true);
  }, [file.data, sessionState.data, path, lang]);

  const srcDoc = useMemo(() => {
    const html = file.data?.html;
    return html && bootReady && bootRef.current ? assembleGenUiDoc(html, bootRef.current) : null;
  }, [file.data, bootReady]);

  // setWidgetState → 防抖 PUT（卸载 flush，防抖窗口内关卡片不丢最后一次写）。
  const putTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // PUT 失败轻提示（用户写入的状态没落盘,不能静默吞）。
  const [saveFailed, setSaveFailed] = useState(false);
  const flushPut = async () => {
    const hadPending = putTimerRef.current != null;
    if (putTimerRef.current) {
      clearTimeout(putTimerRef.current);
      putTimerRef.current = null;
    }
    if (!hadPending) return;
    // 读 queryClient 当前值而非 set-state 时刻的快照:同会话有多个写者(inline + 全屏
    // 第二实例、多张卡)时,旧快照可能落后于其后合并的结果,旧快照落盘会永久丢新更新。
    const latest = queryClient.getQueryData<GenUiSessionState>(stateKey);
    if (!latest) return;
    try {
      await putProjectGenUiState(projectName, sessionId, latest);
      setSaveFailed(false);
    } catch (error) {
      setSaveFailed(true);
      console.error("[gen-ui-widget] state save failed", error);
    }
  };
  useEffect(
    () => () => {
      void flushPut();
    },
    // projectName/sessionId 在卡片生命周期内不变，首帧闭包安全。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 主题推送（boot 内联初值；运行期变化走 zcode:set_globals）。
  const postTheme = () => {
    const win = frameRef.current?.contentWindow;
    if (!win || revokedRef.current || !fedRef.current) return;
    win.postMessage({ source: "gen-ui-host", type: "theme", theme: hostTheme() }, "*");
  };

  // 页 → 宿主消息（窄协议非 JSON-RPC；latest-ref 读最新 confirm/t/缓存）。
  const dispatcherRef = useRef<(event: MessageEvent) => void>(() => {});
  dispatcherRef.current = (event) => {
    const frame = frameRef.current;
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data as {
      source?: string;
      type?: string;
      height?: unknown;
      text?: unknown;
      modelContent?: unknown;
      privateContent?: unknown;
    } | null;
    if (!data || data.source !== "gen-ui" || revokedRef.current) return;

    if (data.type === "size") {
      if (fillHeight) return;
      if (typeof data.height === "number" && Number.isFinite(data.height)) {
        setFrameHeight(
          Math.min(FRAME_MAX_HEIGHT_PX, Math.max(FRAME_MIN_HEIGHT_PX, Math.round(data.height))),
        );
      }
      return;
    }
    if (data.type === "set-state") {
      const current = queryClient.getQueryData<GenUiSessionState>(stateKey);
      if (!current) return;
      const slots = {
        modelContent: typeof data.modelContent === "string" ? data.modelContent : undefined,
        privateContent: typeof data.privateContent === "string" ? data.privateContent : undefined,
      };
      if (slots.modelContent === undefined && slots.privateContent === undefined) return;
      const next = mergeWidgetState(current, path, title, slots);
      queryClient.setQueryData(stateKey, next);
      if (putTimerRef.current) clearTimeout(putTimerRef.current);
      putTimerRef.current = setTimeout(() => void flushPut(), GEN_UI_STATE_PUT_DEBOUNCE_MS);
      return;
    }
    if (data.type === "follow-up") {
      const text = typeof data.text === "string" ? data.text : "";
      if (text.length === 0 || !onSendPrompt) return;
      void (async () => {
        const ok = await confirm({
          title: t("claude.mcpApp.followUpTitle"),
          message: text,
          confirmLabel: t("claude.composer.send"),
          cancelLabel: t("cancel"),
          tone: "default",
        });
        if (ok) onSendPrompt(text);
      })();
    }
  };
  useEffect(() => {
    const onMessage = (event: MessageEvent) => dispatcherRef.current(event);
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // 宿主主题切换 → 推送进页面。
  useEffect(() => {
    const observer = new MutationObserver(() => postTheme());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (file.isPending || (sessionState.isPending && !sessionState.isError)) {
    return <div className={heightClassName} aria-busy="true" />;
  }
  if (file.isError || sessionState.isError || !srcDoc) {
    // 能力关掉后的旧回放 / 网络失败：轻量内联提示，不出破卡。
    return (
      <div className="px-1 py-2 text-xs text-on-surface-muted">{t("claude.genUi.unavailable")}</div>
    );
  }

  return (
    <>
      <iframe
        ref={frameRef}
        className={`${fillHeight ? "" : "mt-2 "}w-full overflow-hidden rounded-lg border border-neutral-line/40 bg-canvas ${heightClassName}`}
        // 桥上报的内容高覆盖 fallback 高度类（钳到 [120, 420]；fillHeight 抑制）。
        style={!fillHeight && frameHeight != null ? { height: frameHeight } : undefined}
        onLoad={() => {
          if (fedRef.current) {
            revokedRef.current = true;
            return;
          }
          fedRef.current = true;
          postTheme();
        }}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        title={title ?? t("claude.genUi.widget")}
      />
      {saveFailed ? (
        <div className="mt-1 px-1 text-xs text-on-surface-muted">
          {t("claude.genUi.stateFailed")}
        </div>
      ) : null}
      {holder}
    </>
  );
}

// ── 流内消息壳（SystemChatBubble gen-ui-widget 分支消费）────────────────────

/**
 * gen-ui-widget system message 的卡片壳：ToolHead 行（sparkles + 「生成界面」badge +
 * title detail + 放大钮）+ GenUiWidgetCard + 全屏 Dialog 第二实例（照
 * makeMcpAppCardToolUI 的 Dialog 模式）。bridge 缺失（无会话上下文）→ 不可用提示。
 */
export function GenUiWidgetMessage({ custom }: { custom: Record<string, unknown> | undefined }) {
  const { t } = useT();
  const bridge = useContext(ClaudeBridgeContext);
  const path = typeof custom?.genUiPath === "string" ? custom.genUiPath : "";
  const title =
    typeof custom?.genUiTitle === "string" && custom.genUiTitle.length > 0
      ? custom.genUiTitle
      : undefined;
  const [fullscreen, setFullscreen] = useState(false);
  const projectName = bridge?.projectName ?? "";
  const sessionId = bridge?.sessionId ?? "";
  const detailText = title ?? path;
  const card =
    projectName && sessionId
      ? (fillHeight: boolean, heightClassName: string) => (
          <GenUiWidgetCard
            projectName={projectName}
            sessionId={sessionId}
            path={path}
            title={title}
            heightClassName={heightClassName}
            fillHeight={fillHeight}
            onSendPrompt={(text) => bridge?.sendMessage(text)}
          />
        )
      : null;

  if (!card) {
    return (
      <div className="my-1 px-1 py-2 text-xs text-on-surface-muted">
        {t("claude.genUi.unavailable")}
      </div>
    );
  }

  return (
    <div className="my-1">
      <div className="flex items-center gap-1.5 text-xs min-w-0">
        <ToolHead
          icon="sparkles"
          badge={t("claude.genUi.widget")}
          badgeClassName="bg-user/15 text-user-soft"
          detail={detailText}
          status="completed"
        />
        <button
          type="button"
          aria-label={t("claude.mcpApp.expand")}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-on-surface-muted transition hover:bg-on-surface/5 touch:h-10 touch:w-10"
          onClick={() => setFullscreen(true)}
        >
          <ShellIcon name="maximize" className="h-3.5 w-3.5" />
        </button>
      </div>
      {card(false, "h-[420px]")}
      <Dialog open={fullscreen} onOpenChange={(open) => !open && setFullscreen(false)}>
        <DialogContent
          // 全屏三件套照 makeMcpAppCardToolUI（inset-0/twMerge/safe-area）；不设
          // z-[100]：确认闸（ConfirmDialog/MobileSheet z-50）必须经 portal DOM 序压上。
          className="fixed inset-0 max-w-none sm:max-w-none w-full translate-x-0 translate-y-0 flex flex-col border-0 bg-surface-inset/95 backdrop-blur-sm"
          style={{
            paddingTop: "max(env(safe-area-inset-top, 0px), 0.75rem)",
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.75rem)",
            paddingLeft: "max(env(safe-area-inset-left, 0px), 0.75rem)",
            paddingRight: "max(env(safe-area-inset-right, 0px), 0.75rem)",
          }}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{t("claude.genUi.widget")}</DialogTitle>
          <div className="flex items-center gap-2 rounded-t-lg border-b border-neutral-line/60 bg-surface-raised/60 px-3 py-2 sm:px-5">
            <ToolIcon name="sparkles" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate text-xs font-medium text-on-surface-soft">
              {t("claude.genUi.widget")}
            </span>
            {detailText ? (
              <span className="min-w-0 truncate text-xs text-on-surface-muted">{detailText}</span>
            ) : null}
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="ml-auto cursor-pointer rounded p-2 text-on-surface-muted transition hover:bg-neutral-line/60 hover:text-on-surface"
              aria-label={t("session.close")}
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {/* 第二实例（iframe 不跨容器移动，frontend-notes §3）：同 queryKey，HTML 走缓存。 */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-3">{card(true, "block h-full")}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
