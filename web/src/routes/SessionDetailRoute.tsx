import type {
  AgentSession,
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  SessionType,
  TerminalSession,
  TransportStatus,
} from "@agents-remote/shared";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Terminal, type ITheme } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { getAgentSession, getTerminalSession, sessionStreamUrl } from "../api/client";
import { useHScroll } from "@/hooks/use-h-scroll";
import { useT } from "../i18n";
import type { TranslationKey } from "../i18n/types";
import { useTheme, type ResolvedTheme } from "../theme";
import { HEARTBEAT_INTERVAL_MS, PONG_TIMEOUT_MS } from "../lib/ws-heartbeat";
import {
  canSendToSession,
  inputDrawerCollapsedAtom,
  isConnectionFresh,
  normalizeSessionTextInput,
  sessionQuickKeys,
  type SessionQuickKey,
} from "./console-model";
import { shellSurfaceClasses } from "../components/shell/shell-primitives";
import { ShellIcon } from "../components/shell/icons";
import { workbenchReconnectRequestAtom } from "./workbench-model";

type SessionDetailProps = {
  projectName: string;
  sessionId: string;
  sessionType: SessionType;
};

type StreamConnectionStatus = "connecting" | TransportStatus;

type SessionDetailResponse =
  | {
      session: AgentSession;
    }
  | {
      session: TerminalSession;
    };

export function SessionDetail({ projectName, sessionId, sessionType }: SessionDetailProps) {
  const { t } = useT();
  const socketRef = useRef<WebSocket | null>(null);
  // 最近一次收到 pong 的时刻（onopen 初始化）。心跳 tick 与发送瞬间用它判定 half-open：
  // readyState 仍 OPEN 但 Date.now()-lastPong 超过 PONG_TIMEOUT_MS 即对端不回 pong、连接
  // 静默断开（iOS Safari/中间层掐断不发 close 帧）。心跳 tick 主动 close 自愈，发送瞬间兜底。
  const lastPongRef = useRef(0);
  const [reconnectKey, setReconnectKey] = useState(0);
  const reconnectAttemptsRef = useRef(0);
  const [connectionStatus, setConnectionStatus] = useState<StreamConnectionStatus>("connecting");
  // ⌘R（重连，断线时）请求信号（use-workbench-shortcuts）：仅 error 态消费——bump
  // reconnectKey 重连后「消费即清零」；非 error 态的信号同样清零（连接正常时按的 ⌘R
  // 已无意义），防信号残留到之后自然 error 误触发「用户未按键」的自动重连。
  const reconnectRequest = useAtomValue(workbenchReconnectRequestAtom)[sessionId];
  const setReconnectRequest = useSetAtom(workbenchReconnectRequestAtom);
  useEffect(() => {
    if (!reconnectRequest) return;
    if (connectionStatus !== "error") {
      setReconnectRequest((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      return;
    }
    terminalDataRef.current = null;
    setReconnectKey((value) => value + 1);
    setReconnectRequest((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, [reconnectRequest, connectionStatus, sessionId, setReconnectRequest]);
  // Only shown for unrecoverable failures (protocol error, session ended)
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const terminalDataRef = useRef<string | null>(null);
  const terminalWriteRef = useRef<((data: string) => void) | null>(null);
  // 最新 fit 出的容器尺寸：sendTerminalResize 写入，connect() 构造 WS URL 时读出，
  // 让后端 attach() 以容器 cols/rows 作 PTY 初始尺寸（首帧即匹配容器，减少窄→宽跳变）。
  const terminalSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const [input, setInput] = useState("");
  const [inputDrawerCollapsed, setInputDrawerCollapsed] = useAtom(
    inputDrawerCollapsedAtom(sessionType),
  );
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia?.("(min-width: 640px)").matches ?? true,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 640px)");
    if (!media) return;
    const handler = () => setIsDesktop(media.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const detail = useQuery<SessionDetailResponse>({
    queryKey: ["projects", projectName, `${sessionType}-sessions`, sessionId],
    queryFn: () =>
      sessionType === "agent"
        ? getAgentSession(projectName, sessionId)
        : getTerminalSession(projectName, sessionId),
  });
  const isEnded = connectionStatus === "ended" || sessionStatus === "closed";

  // Seed initial sessionStatus from the detail query; subsequent updates come
  // from WebSocket status messages.
  useEffect(() => {
    if (detail.data?.session.status) {
      setSessionStatus((prev) => prev ?? detail.data.session.status);
    }
  }, [detail.data?.session.status]);

  // Each mount (or reconnect) bumps this so stale-socket events are ignored.
  const connGeneration = useRef(0);

  useEffect(() => {
    const generation = ++connGeneration.current;

    setConnectionStatus("connecting");
    setFatalError(null);
    reconnectAttemptsRef.current = 0;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const socketIsCurrent = () => connGeneration.current === generation;

    const connect = () => {
      if (!socketIsCurrent()) return;

      socket = new WebSocket(
        sessionStreamUrl(
          projectName,
          sessionType,
          sessionId,
          terminalSizeRef.current?.cols,
          terminalSizeRef.current?.rows,
        ),
      );
      socketRef.current = socket;

      socket.onopen = () => {
        if (!socketIsCurrent()) return;
        reconnectAttemptsRef.current = 0;
        lastPongRef.current = Date.now();
        setConnectionStatus("connected");
        // 应用层心跳:每 HEARTBEAT_INTERVAL_MS 发 ping,重置 cloudflare/NAT/Bun 三层
        // idle 超时,防前台空闲被中间层静默断开(浏览器无法发协议层 ping,只能 JSON)。
        heartbeatTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
            // half-open 检测:ping 已发但若距上次 pong 超时,说明对端不回 pong(连接静默断,
            // readyState 仍 OPEN 但数据进黑洞)。主动 close → onclose → scheduleReconnect 自愈。
            if (Date.now() - lastPongRef.current > PONG_TIMEOUT_MS) {
              console.log("[session-detail] pong timeout — closing half-open socket");
              socket.close();
            }
          }
        }, HEARTBEAT_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        if (!socketIsCurrent()) return;
        const message = parseStreamMessage(event.data);

        if (!message) {
          setConnectionStatus("error");
          setFatalError(t("session.fatalProtocol"));
          return;
        }

        if (message.type === "output") {
          terminalDataRef.current = message.data;
          terminalWriteRef.current?.(message.data);
          return;
        }

        if (message.type === "status") {
          // 心跳 ping 的响应是 status:connected（session-stream 服务端对 {type:"ping"}
          // 回此，非独立 pong）。它既是初始连接信号也是周期存活信号——更新 lastPong，
          // 供心跳 tick 与发送瞬间的 half-open 兜底（isConnectionFresh）。
          if (message.status === "connected") {
            lastPongRef.current = Date.now();
          }
          if (isTransportStatus(message.status)) {
            setConnectionStatus(message.status);
          } else {
            setSessionStatus(message.status);
          }
          return;
        }

        if (message.type === "ended") {
          setConnectionStatus("ended");
          setSessionStatus("closed");
          return;
        }

        if (message.type === "error") {
          setConnectionStatus("error");
          setFatalError(`${message.code}: ${message.message}`);
          return;
        }
      };

      const scheduleReconnect = () => {
        if (!socketIsCurrent()) return;
        const MAX_ATTEMPTS = 8;
        const attempt = reconnectAttemptsRef.current;
        if (attempt >= MAX_ATTEMPTS) {
          setConnectionStatus("error");
          setFatalError(t("session.reconnectStopped"));
          return;
        }
        reconnectAttemptsRef.current += 1;
        setConnectionStatus("connecting");
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, delay);
      };

      socket.onerror = () => {
        if (!socketIsCurrent()) return;
      };

      socket.onclose = (_e: CloseEvent) => {
        if (!socketIsCurrent()) return;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        setConnectionStatus((status) => {
          if (status === "ended" || status === "error") return status;
          return "connecting";
        });
        scheduleReconnect();
      };
    };

    // 同步发起 WS：子组件 XtermOutput 的 useEffect 先于父 effect 执行，
    // 但 xterm term.open/WebGL/fit 同步初始化阻塞的是 WS onopen 回调（而非 connect 本身）。
    // connect() 同步执行让 TCP handshake 尽早开始，减少整体等待时间。
    connect();

    return () => {
      connGeneration.current += 1;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (socket) {
        socket.close();
        socket = null;
        socketRef.current = null;
      }
    };
  }, [projectName, reconnectKey, sessionId, sessionType]);

  // 回前台立即重连:移动端切后台一段时间后 WS 被中间层超时断开,回前台时若仍走
  // 指数退避要等 1-10s。监听 visibilitychange,回前台且连接已断(或 half-open:readyState
  // 仍 OPEN 但 pong 早过期,iOS 后台未立即释放 WS 的场景)时立即 bump reconnectKey(触发主
  // effect 重跑:重置 attempt + setTimeout(connect,0)),跳过退避。half-open 判定用 lastPong
  // (readyState 骗人时的兜底,非 UI 猜测);重连本身没错,iOS 后台挂起会释放 WS → 短后台也
  // 重连,代价由 overlay 降级(轻量提示,不挡已渲染内容)承接。诊断日志供真机核对真实因果。
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const readyState = socketRef.current?.readyState;
      const pongAge = Date.now() - lastPongRef.current;
      const shouldReconnect =
        readyState !== WebSocket.OPEN || !isConnectionFresh(lastPongRef.current);
      console.log(
        `[session-detail] visibility visible: readyState=${readyState} pongAge=${pongAge}ms reconnect=${shouldReconnect}`,
      );
      if (shouldReconnect) {
        setReconnectKey((value) => value + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const sendMessage = (message: SessionStreamClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    // half-open 兜底：readyState 仍 OPEN 但距上次存活信号超时 → 中间层静默掐断未发
    // close 帧，send 会进黑洞。主动 close → onclose → scheduleReconnect 自愈，返回失败
    // 让调用方（handleInputSubmit 已被 canSend 门控；此处兜底边界情况）。
    if (!isConnectionFresh(lastPongRef.current)) {
      console.log("[session-detail] send blocked: half-open detected, closing to reconnect");
      socket.close();
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  };

  const canSend = canSendToSession(connectionStatus);
  const quickKeys = sessionQuickKeys(sessionType);

  // Stable callback for xterm to send raw input bytes over WebSocket
  const sendTerminalInput = useCallback(
    (data: string) => {
      sendMessage({ type: "input", data });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [socketRef],
  );

  // Stable callback for xterm to notify server of terminal resize
  const sendTerminalResize = useCallback(
    (cols: number, rows: number) => {
      // 顺便记录最新容器尺寸，供下次 connect() 构造 WS URL（后端 open() reflow 用）。
      terminalSizeRef.current = { cols, rows };
      return sendMessage({ type: "resize", cols, rows });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [socketRef],
  );

  const handleInputSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const command = normalizeSessionTextInput(input);

    if (!command || !canSend) {
      return;
    }

    if (sendMessage({ type: "input", data: command })) {
      setInput("");
    }
  };

  const sendQuickKey = (quickKey: SessionQuickKey) => {
    if (!canSend) {
      return;
    }

    sendMessage({ type: "input", data: quickKey.sequence });
  };

  return (
    <>
      <div
        className={`flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden gap-0 p-0 ${shellSurfaceClasses.runtimeBody}`}
      >
        {detail.error || fatalError || isEnded || connectionStatus === "error" ? (
          <div className="flex shrink-0 flex-col gap-2 p-2 sm:p-3">
            {connectionStatus === "error" ? (
              <>
                <Notice tone="danger">{t("session.connectionError")}</Notice>
                <button
                  className="inline-flex shrink-0 items-center self-start gap-1.5 rounded-lg border border-error/30 bg-error/10 px-3 py-1.5 text-xs font-semibold text-error transition hover:bg-error/20"
                  onClick={() => {
                    terminalDataRef.current = null;
                    setReconnectKey((value) => value + 1);
                  }}
                  type="button"
                >
                  <ShellIcon className="h-3.5 w-3.5" name="refresh" />
                  {t("session.retry")}
                </button>
              </>
            ) : null}
            {detail.error instanceof Error ? (
              <Notice tone="danger">{detail.error.message}</Notice>
            ) : null}
            {fatalError ? <Notice tone="danger">{fatalError}</Notice> : null}
            {isEnded ? <Notice>{t("session.runtimeEnded")}</Notice> : null}
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1 flex flex-col">
          <TerminalOutput
            connectionStatus={connectionStatus}
            terminalDataRef={terminalDataRef}
            terminalWriteRef={terminalWriteRef}
            onResize={sendTerminalResize}
            onSendInput={sendTerminalInput}
          />
        </div>
      </div>

      <SessionInputDrawer
        canSend={canSend}
        collapsed={inputDrawerCollapsed}
        connectionStatus={connectionStatus}
        input={input}
        isDesktop={isDesktop}
        quickKeys={quickKeys}
        sessionType={sessionType}
        onCollapsedChange={setInputDrawerCollapsed}
        onInputChange={setInput}
        onQuickKey={sendQuickKey}
        onSubmit={handleInputSubmit}
      />
    </>
  );
}

type TerminalCoreProps = {
  connectionStatus: StreamConnectionStatus;
  terminalWriteRef: React.MutableRefObject<((data: string) => void) | null>;
  terminalDataRef: React.MutableRefObject<string | null>;
  onSendInput: (data: string) => void;
  onResize: (cols: number, rows: number) => boolean;
};

/** hex #rrggbb → rgba() 字符串（selectionBackground = --primary @ 25%）。非 #rrggbb 输入原样兜底。 */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(${hex}, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 从 CSS 变量读取 xterm theme（设计包 tokens.json「terminal」缺口，实现侧补充）。显式按
 * resolved 临时落 `<html data-theme>` + `.dark` 读 token 再恢复原态——不依赖调用方落盘时序
 * （ThemeSync 兄弟 effect 先于本组件，但防御起见不赌），同 resolved 恒返回同套值：
 * foreground ← --ink-1、cursor/selection ← --c-primary（selection @25%）、
 * ANSI 16 色 ← --terminal-*、background ← --bg-codeblock（双主题同档，v2 无分主题取层）。
 * 注意不能用 "transparent"——xterm 的 css.toColor 只支持 #hex / rgb() /
 * rgba()，canvas 解析路径要求 alpha=0xFF，否则 parseColor fallback 成
 * DEFAULT_BACKGROUND 纯黑 #000，背景永不随主题。
 */
export function readTerminalTheme(resolved: ResolvedTheme): ITheme {
  const el = document.documentElement;
  const themeBefore = el.dataset.theme; // 缺省态为 undefined（:root 即 dark 基准，无需属性）
  const darkBefore = el.classList.contains("dark");
  el.dataset.theme = resolved;
  el.classList.toggle("dark", resolved === "dark");
  try {
    const cs = getComputedStyle(el);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    const primary = v("--c-primary");
    return {
      background: v("--bg-codeblock"),
      foreground: v("--ink-1"),
      cursor: primary,
      selectionBackground: hexToRgba(primary, 0.25),
      black: v("--terminal-black"),
      brightBlack: v("--terminal-bright-black"),
      red: v("--terminal-red"),
      brightRed: v("--terminal-bright-red"),
      green: v("--terminal-green"),
      brightGreen: v("--terminal-bright-green"),
      yellow: v("--terminal-yellow"),
      brightYellow: v("--terminal-bright-yellow"),
      blue: v("--terminal-blue"),
      brightBlue: v("--terminal-bright-blue"),
      magenta: v("--terminal-magenta"),
      brightMagenta: v("--terminal-bright-magenta"),
      cyan: v("--terminal-cyan"),
      brightCyan: v("--terminal-bright-cyan"),
      white: v("--terminal-white"),
      brightWhite: v("--terminal-bright-white"),
      // 仅亮色挂 256 色精准映射（claude 不达标前景 9 色，见 LIGHT_EXTENDED_ANSI）；暗色
      // undefined → xterm 走默认调色板（浅色在深底高对比，零变化）。
      ...(resolved === "light" ? { extendedAnsi: LIGHT_EXTENDED_ANSI } : {}),
    };
  } finally {
    // 还原：dataset 赋值会把 undefined 落成字符串 "undefined"（反使 :root 基准失效），单列处理。
    if (themeBefore === undefined) delete el.dataset.theme;
    else el.dataset.theme = themeBefore;
    el.classList.toggle("dark", darkBefore);
  }
}

/**
 * 亮色 256 色精准映射（续十一单色 → 续十二扩为 9 色）。pty 抓 claude 启动+对话 raw ANSI，
 * 列出 `#f6f6f8` 底（--bg-codeblock，luminance ≈0.94，与 v1 #f6f8fb 同亮度带）对比度 < 4.5（WCAG AA 不达标）的 claude
 * 前景 256 色，逐色映射到达标深色。稀疏数组：目标位填映射色、其余空串 → parseColor 空串
 * fallback DEFAULT_ANSI_COLORS 保留原色（ThemeService._setTheme L129-134），故只动这 9 色、
 * 其余 256 色不动。暗色不挂（浅色在深底高对比，零变化）。
 *
 * idx  用途(出现次数)        原色(cube)  对比度  映射               映射后对比度
 * 153  蓝(×2)                #afd7ff    1.41    #1d4ed8 blue-700   6.30
 * 220  金(×14)               #ffd700    1.32    #a16207 yellow-700 4.63
 * 174  边框线(×84,主用)      #d78787    2.56    #be123c rose-700   5.91
 * 216  浅橙(×20)             #ffaf87    1.68    #b45309 amber-700  4.72
 * 114  浅绿(×1)              #87d787    1.63    #15803d green-700  4.71
 * 246  次要灰(×63)           #949494    2.85    #6b7280 gray-500   4.54
 * 244  灰(×20)               #808080    3.71    #4b5563 gray-600   7.10（保留比 246 更深层次）
 * 248  浅灰(×1)              #a8a8a8    2.23    #6b7280 gray-500   4.54
 * 247  浅灰(×1)              #9e9e9e    2.52    #6b7280 gray-500   4.54
 *
 * 231 白字(×2) #ffffff 不映射：SGM 上下文确认主用是反色块前景（配 48;5;237 深灰底白字，
 * 本就清晰），extendedAnsi 全局替换无法只改浅底那次（浅底仅 1 次 spinner 瞬态）——映射会让
 * 深底白字变深字反而不可见，顾此失彼。
 *
 * 另：ANSI 16 色 token 在 #f6f8fb 底也大面积不达标（green 3.10/yellow 2.76/cyan 3.46 等），
 * 但那是 ls/git 等所有程序用的颜色（改影响面大）且 claude CLI 抓包确认只用 256 色不用 ANSI 16，
 * 故本轮聚焦 claude 256 色，ANSI 16 色留待单独立项。
 */
const LIGHT_EXTENDED_ANSI: string[] = (() => {
  // 256 → 稀疏映射：key=调色板索引(16..255)，value=达标色。length 取最大索引+1。
  const mapping: Record<number, string> = {
    153: "#1d4ed8", // token-ok（terminal 256 色调色板映射：数据非 UI 样式）
    220: "#a16207", // token-ok
    174: "#be123c", // token-ok
    216: "#b45309", // token-ok
    114: "#15803d", // token-ok
    246: "#6b7280", // token-ok
    244: "#4b5563", // token-ok
    248: "#6b7280", // token-ok
    247: "#6b7280", // token-ok
  };
  const maxIdx = Math.max(...Object.keys(mapping).map(Number));
  const arr = Array.from({ length: maxIdx - 16 + 1 }, () => "");
  for (const [idx, color] of Object.entries(mapping)) arr[Number(idx) - 16] = color;
  return arr;
})();

/**
 * minimumContrastRatio 实测有害已关掉（续九）。xterm 的 reduceLuminance 是朴素算法
 * （各通道均减 10%），把 claude 鲜艳 256 色（`#87D7FF`/`#ffd700`）推成暗沉灰蓝（`#467086`）
 * /暗橄榄（`#867000`），失色相变灰蒙——这是用户「整体字迹不清楚」真根因之一（续六续七都暗
 * 故区别不大）。亮暗都给 1（=xterm 默认=关闭）让原色鲜艳呈现，字芯清晰反而更可读；不达标
 * 前景交由 LIGHT_EXTENDED_ANSI 精准映射逐色解决（续十二），而非全局兜底钝化全部颜色。
 */
const MINIMUM_CONTRAST_RATIO_LIGHT = 1;
function minimumContrastRatioFor(resolved: ResolvedTheme): number {
  return resolved === "dark" ? 1 : MINIMUM_CONTRAST_RATIO_LIGHT;
}

/**
 * 主题切换时把新 theme 写到已创建的 xterm 实例（options.theme setter 赋值即重绘，含 WebGL）；
 * 同步切 minimumContrastRatio（亮暗都关闭，续九）。
 */
export function useTerminalTheme(termRef: RefObject<Terminal | null>, resolved: ResolvedTheme) {
  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.theme = readTerminalTheme(resolved);
    termRef.current.options.minimumContrastRatio = minimumContrastRatioFor(resolved);
  }, [resolved, termRef]);
}

function TerminalOutput(props: TerminalCoreProps) {
  return <XtermOutput {...props} />;
}

function XtermOutput({
  connectionStatus,
  terminalDataRef,
  terminalWriteRef,
  onSendInput,
  onResize,
}: TerminalCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const fittingRef = useRef(false);
  const initialFitFramesRef = useRef<number[]>([]);
  const initialFitTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const writeQueueRef = useRef(Promise.resolve());
  const _isComposingRef = useRef(false);
  const { resolved } = useTheme();
  // resolved 用 ref 给下方创建 effect 闭包读（主题切换由 useTerminalTheme 单独 effect 处理，
  // 创建 effect 不因主题重跑重建 xterm）；主题切换经 term.options.theme 动态更新。
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  useTerminalTheme(termRef, resolved);

  useEffect(() => {
    if (connectionStatus !== "connected") {
      return;
    }

    const pending = pendingResizeRef.current;

    if (!pending) {
      return;
    }

    if (onResize(pending.cols, pending.rows)) {
      lastResizeRef.current = pending;
      pendingResizeRef.current = null;
    }
  }, [connectionStatus, onResize]);

  const { t } = useT();
  // 重连 overlay 降级只降遮罩维:connecting 时若终端已有内容(非首次加载),不铺全屏
  // 遮罩挡已渲染内容,但 spinner + 文案的结构与首连一致(居中同构,见 DESIGN.md
  // Terminal 连接 overlay 契约)。terminalDataRef 是 ref,但本处随 connectionStatus
  // 重渲染时读取实时正确。
  const baseOverlay = terminalOverlay(connectionStatus, t);
  const overlay =
    baseOverlay?.animated && terminalDataRef.current !== null
      ? { ...baseOverlay, scrim: false }
      : baseOverlay;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      theme: readTerminalTheme(resolvedRef.current),
      minimumContrastRatio: minimumContrastRatioFor(resolvedRef.current),
      fontFamily: 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace',
      fontSize: 12,
      // 字重用 xterm 默认 normal(400)（续十一）：续九曾加 500 缓解 WebGL 模糊下笔画偏细，但续十
      // 把桌面端切到 DOM 渲染器（原生字体抗锯齿）、移动端 WebGL 整数 DPR 本就不模糊——两种渲染器
      // 都不模糊，500 失去存在理由，回默认。字重是全局选项不分桌面/移动。
      lineHeight: 1.35,
      cursorBlink: true,
      cursorInactiveStyle: "outline",
      allowTransparency: true,
      scrollback: 5000,
      scrollOnUserInput: false,
      smoothScrollDuration: 0,
      convertEol: true,
      customGlyphs: true,
      rescaleOverlappingGlyphs: true,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      logLevel: "warn",
    });

    // WebGL 渲染器在非整数 DPR（桌面 1.5 缩放常见）下纹理采样模糊（续十）；整数 DPR
    // （移动端 2/3）清晰且性能好，故仅整数 DPR 加载 WebGL，非整数 DPR 回退 xterm 内置
    // DOM 渲染器（浏览器原生字体渲染，任意 DPR 清晰，零新依赖）。判据用 DPR 整数性而非
    // isDesktop——iPad 横屏宽屏 DPR=2 仍享 WebGL。
    if (Number.isInteger(window.devicePixelRatio)) {
      try {
        term.loadAddon(new WebglAddon());
      } catch {
        // WebGL 不可用，DOM 渲染器兜底（xterm 默认）
      }
    }

    term.open(container);

    // Suppress predictive text, autocorrect, and composition wrapping on
    // mobile keyboards without using type="password" (which breaks input on
    // iOS Safari and triggers unwanted password-manager prompts).
    if (term.textarea) {
      term.textarea.setAttribute("autocomplete", "off");
      term.textarea.setAttribute("autocorrect", "off");
      term.textarea.setAttribute("autocapitalize", "none");
      term.textarea.setAttribute("spellcheck", "false");
    }

    // xterm 6.0.0 bug (xtermjs/xterm.js#5887): _inputEvent gates insertText on
    // (!ev.composed || !_keyDownSeen). Third-party IMEs on iOS (Gboard, Sogou…)
    // report keyCode=229 for every keystroke, keeping _keyDownSeen=true, so
    // composed input events are silently dropped after the first character.
    //
    // Fix: patch _core._inputEvent to emit when composed+_keyDownSeen but not
    // in a real CJK composition. Also patch _compositionHelper._handleAnyTextareaChanges
    // to suppress the duplicate send that CompositionHelper.keydown schedules via
    // setTimeout for the same keyCode=229 path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const core = (term as any)._core;
    if (core?._inputEvent) {
      const origInputEvent = core._inputEvent.bind(core);
      core._inputEvent = function (ev: InputEvent) {
        if (
          ev.data &&
          ev.inputType === "insertText" &&
          ev.composed &&
          core._keyDownSeen &&
          !core._compositionHelper?._isComposing &&
          !core._compositionHelper?._isSendingComposition
        ) {
          if (!core._keyPressHandled) {
            core._unprocessedDeadKey = false;
            core.coreService.triggerDataEvent(ev.data, true);
            core.cancel(ev);
            return true;
          }
          return false;
        }
        return origInputEvent(ev);
      };
    }

    // Suppress the duplicate send from CompositionHelper._handleAnyTextareaChanges.
    // That method is called by CompositionHelper.keydown for keyCode=229 and uses
    // setTimeout(0) to diff the textarea value — but our _inputEvent patch already
    // sent the character, so we skip _handleAnyTextareaChanges when not composing.
    const helper = core?._compositionHelper;
    if (helper?._handleAnyTextareaChanges) {
      const origHandleChanges = helper._handleAnyTextareaChanges.bind(helper);
      helper._handleAnyTextareaChanges = function () {
        if (!helper._isComposing && !helper._isSendingComposition) {
          return;
        }
        return origHandleChanges();
      };
    }

    // Forward keyboard input to WebSocket
    term.onData((data) => {
      onSendInput(data);
    });

    // ===== 移动端触摸滚动：手动发 SGR 鼠标滚轮序列，走 tmux copy-mode（与桌面滚轮同路径）=====
    // 桌面滚轮 = tmux copy-mode（mouse on + WheelUpPane → copy-mode -e 滚 server scrollback，含 attach
    //   前历史）；移动 touch 是 dead path（xterm Gesture preventDefault），故手动发同款 SGR 序列走同路径。
    //   滚到底 tmux 自动退出 copy-mode 回 live——无超时、无 UI、无 netUp bug。
    // 完整机制 + 5 条已验证错路（滚本地 buffer / M-Up / capture-pane / 编造服务端区分）详见
    //   frontend-notes.md §6「移动端触摸滚动 = tmux copy-mode」。改这里前务必先读 §6，勿凭印象重写。
    const LINE_HEIGHT_PX = 16.2; // fontSize 12 × lineHeight 1.35
    // tmux copy-mode 一次 WheelUp/Down 滚 5 行；PIXELS_PER_WHEEL = 5 行高 → 手指每滑 ~81px 发 1 序列
    // = 滚 5 行视觉，与原 scrollLines 版同为 ~16px 手指/行视觉，手感一致（只是现在滚的是 server scrollback）。
    const PIXELS_PER_WHEEL = LINE_HEIGHT_PX * 5;
    // SGR 鼠标滚轮序列（mode 1006）：button 64=WheelUp / 65=WheelDown，M 结尾=按下事件。col/row 固定 1;1。
    const SGR_WHEEL_UP = "\x1b[<64;1;1M";
    const SGR_WHEEL_DOWN = "\x1b[<65;1;1M";
    // 单帧 applyScroll 发送序列数上限：防极端惯性一次刷上百帧突发流量（滚到顶/底 tmux 自然停）。
    const MAX_WHEELS_PER_FRAME = 50;

    let touchStartY = 0;
    let touchStartX = 0;
    let touchScrollAccum = 0;
    let touchIsScroll = false;
    let touchVelocities: number[] = [];
    let touchLastY = 0;
    let touchLastT = 0;
    let inertiaFrame: number | null = null;

    const stopInertia = () => {
      if (inertiaFrame !== null) {
        cancelAnimationFrame(inertiaFrame);
        inertiaFrame = null;
      }
    };

    // px → 序列数 → 发 SGR 鼠标滚轮序列，走和桌面滚轮同一条 WheelUpPane → copy-mode -e 路径
    // （滚 server scrollback，tmux 原生 sticky-bottom）。每 ~81px 发 1 序列，一次序列滚 5 行。
    const applyScroll = (px: number) => {
      touchScrollAccum += px;
      const wheels = Math.trunc(touchScrollAccum / PIXELS_PER_WHEEL);
      if (wheels === 0) return;
      touchScrollAccum -= wheels * PIXELS_PER_WHEEL;
      // wheels>0 = 手指下滑 = 看更新 = WheelDown；wheels<0 = 手指上滑 = 看更早 = WheelUp。
      // 单帧累出过多序列时截断（防极端惯性突发流量；滚到顶/底 tmux 自然停）。
      const seq = wheels > 0 ? SGR_WHEEL_DOWN : SGR_WHEEL_UP;
      const n = Math.min(Math.abs(wheels), MAX_WHEELS_PER_FRAME);
      for (let i = 0; i < n; i++) onSendInput(seq);
    };

    const startInertia = (velocityPxMs: number) => {
      stopInertia();
      const FRICTION = 0.004; // px/ms² deceleration
      let speed = Math.abs(velocityPxMs);
      if (speed < 0.05) return;
      const sign = velocityPxMs > 0 ? 1 : -1;
      let lastT = performance.now();

      const tick = () => {
        const now = performance.now();
        const dt = now - lastT;
        lastT = now;
        speed -= FRICTION * dt;
        if (speed <= 0) {
          inertiaFrame = null;
          return;
        }
        applyScroll(sign * speed * dt);
        inertiaFrame = requestAnimationFrame(tick);
      };
      inertiaFrame = requestAnimationFrame(tick);
    };

    const onTouchStart = (e: TouchEvent) => {
      stopInertia();
      touchStartY = e.touches[0]?.clientY ?? 0;
      touchStartX = e.touches[0]?.clientX ?? 0;
      touchScrollAccum = 0;
      touchIsScroll = false;
      touchVelocities = [];
      touchLastY = touchStartY;
      touchLastT = performance.now();
    };

    const onTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0]?.clientY ?? 0;
      const currentX = e.touches[0]?.clientX ?? 0;
      const now = performance.now();
      const deltaX = Math.abs(currentX - touchStartX);
      const dy = currentY - touchLastY; // positive = finger moved down
      const dt = now - touchLastT;
      if (!touchIsScroll && (Math.abs(dy) > 6 || deltaX > 6)) {
        touchIsScroll = true;
      }
      if (touchIsScroll) {
        applyScroll(dy);
        if (dt > 0) {
          touchVelocities.push(dy / dt);
          if (touchVelocities.length > 5) touchVelocities.shift();
        }
        e.preventDefault();
        e.stopPropagation();
      }
      touchLastY = currentY;
      touchLastT = now;
    };

    const onTouchEnd = (_e: TouchEvent) => {
      if (touchIsScroll) {
        term.blur();
        if (touchVelocities.length > 0) {
          const avgV = touchVelocities.reduce((a, b) => a + b, 0) / touchVelocities.length;
          startInertia(avgV);
        }
      }
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    const notifyResize = () => {
      const size = { cols: term.cols, rows: term.rows };
      const previous = lastResizeRef.current;

      if (previous?.cols === size.cols && previous.rows === size.rows) {
        return;
      }

      if (onResize(size.cols, size.rows)) {
        lastResizeRef.current = size;
        pendingResizeRef.current = null;
      } else {
        pendingResizeRef.current = size;
      }
    };

    // addon-fit 的 proposeDimensions 在 scrollback>0 时会预留 14px 给 scrollbar
    // (`overviewRuler?.width || 14`)，但 xterm viewport scrollbar 是 overlay —— 实测
    // .xterm-viewport 宽度 === container 宽度，不占布局空间。这 14px 预留会让 canvas
    // 比 container 窄 ~2 cols，terminal 右侧永久留白（桌面 workbench 单 group 单
    // terminal 右侧露白同根因；container 越宽绝对留白越大，2 group 更窄时不明显）。
    // 这里复制 fit 的尺寸算法但不减 scrollbar 宽度，让 canvas 顶到 container 右边。
    const customFit = () => {
      if (!term.element || !term.element.parentElement) return;
      // GroupCell 多 tab：非活动 tab 用 display:none 保留 xterm 不卸载（claude relay 不重读
      // JSONL，避免丢早消息）。display:none / 未挂载的容器不参与布局，computed height/width 解析为
      // "auto" → parseInt 得 NaN → term.resize 触发 xterm "only accepts integers"。offsetParent
      // === null 涵盖 display:none 与脱离布局；这些场景跳过本次 fit，等 tab 切回可见（ResizeObserver
      // 因 size 0→非0 触发补 fit）或布局稳定后再算。
      if (term.element.parentElement.offsetParent === null) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fitCore = (term as any)._core;
      const dims = fitCore?._renderService?.dimensions;
      if (!dims || dims.css.cell.width === 0 || dims.css.cell.height === 0) return;
      const parentStyle = window.getComputedStyle(term.element.parentElement);
      const elementStyle = window.getComputedStyle(term.element);
      const height =
        parseInt(parentStyle.height) -
        (parseInt(elementStyle.paddingTop) + parseInt(elementStyle.paddingBottom));
      const width =
        parseInt(parentStyle.width) -
        (parseInt(elementStyle.paddingLeft) + parseInt(elementStyle.paddingRight));
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      const cols = Math.max(2, Math.floor(width / dims.css.cell.width));
      const rows = Math.max(1, Math.floor(height / dims.css.cell.height));
      if (term.cols !== cols || term.rows !== rows) {
        fitCore?._renderService?.clear?.();
        term.resize(cols, rows);
      }
    };

    const fitAndNotifyResize = () => {
      customFit();
      notifyResize();
    };

    const scheduleInitialFit = () => {
      const fitAfterFrame = () => {
        initialFitFramesRef.current.push(
          requestAnimationFrame(() => {
            try {
              fitAndNotifyResize();
            } catch {
              // ignore during teardown
            }
          }),
        );
      };

      fitAfterFrame();
      initialFitTimersRef.current.push(setTimeout(fitAfterFrame, 50));
      initialFitTimersRef.current.push(setTimeout(fitAfterFrame, 150));
      initialFitTimersRef.current.push(setTimeout(fitAfterFrame, 300));
    };

    fitAndNotifyResize();
    scheduleInitialFit();

    termRef.current = term;

    const write = (data: string) =>
      new Promise<void>((resolve) => {
        term.write(data, resolve);
      });

    const enqueueWrite = (task: () => Promise<void>) => {
      writeQueueRef.current = writeQueueRef.current.catch(() => undefined).then(task);
    };

    terminalWriteRef.current = (data) => {
      enqueueWrite(() => write(data));
    };

    // Replay any data that arrived before the terminal mounted
    const pending = terminalDataRef.current;
    if (pending) {
      enqueueWrite(() => write(pending));
    }

    // ResizeObserver can fire in response to xterm DOM writes, so coalesce it
    // into one animation-frame fit that only runs after the resize transition
    // ends. Ignore RO callbacks triggered by fit() itself to avoid multi-frame
    // loops where each fit triggers a new RO callback.
    const ro = new ResizeObserver(() => {
      if (fittingRef.current) {
        return;
      }

      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }

      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        fittingRef.current = true;
        try {
          fitAndNotifyResize();
        } catch {
          // ignore during teardown
        } finally {
          requestAnimationFrame(() => {
            fittingRef.current = false;
          });
        }
      });
    });
    ro.observe(container);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      stopInertia();
      ro.disconnect();
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      for (const frame of initialFitFramesRef.current) {
        cancelAnimationFrame(frame);
      }
      for (const timer of initialFitTimersRef.current) {
        clearTimeout(timer);
      }
      initialFitFramesRef.current = [];
      initialFitTimersRef.current = [];
      terminalWriteRef.current = null;
      term.dispose();
      termRef.current = null;
      lastResizeRef.current = null;
    };
    // onSendInput and onResize are stable (useCallback); terminalWriteRef/terminalDataRef are refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSendInput, onResize]);

  return (
    // nav 避让单点在 SessionInputDrawer 的 pb（static 流内在本区之下）——本区不重复让位，
    // 否则 xterm 底部夹出一条 nav 高的空带（终端与输入框间隙，第十一轮复验）。
    <section className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full min-h-0 min-w-0 overflow-hidden [&_.xterm]:h-full"
      />
      {overlay ? <TerminalStatusOverlay overlay={overlay} /> : null}
    </section>
  );
}

type TerminalOverlayState = {
  animated?: boolean;
  /** animated 分支的遮罩维：true（首连，终端无内容）铺全屏遮罩；false（重连降级）仅贴身轻背景，spinner 结构不变。 */
  scrim?: boolean;
  tone: "accent" | "danger" | "muted";
  title: string;
};

function TerminalStatusOverlay({ overlay }: { overlay: TerminalOverlayState }) {
  const pillToneClasses = {
    accent: "border-primary/25 bg-primary/10 text-primary shadow-primary/20",
    danger: "border-error/30 bg-error/10 text-error shadow-error/20",
    muted: "border-neutral-line/40 bg-surface-inset/60 text-on-surface-soft shadow-black/20",
  } satisfies Record<TerminalOverlayState["tone"], string>;

  // connecting = transient 态：居中 spinner + 文案（重连降级仅去全屏遮罩，结构不变，
  // 见 DESIGN.md Terminal 连接 overlay 契约）；error/ended = 终态：顶部 pill。
  if (overlay.animated) {
    const content = (
      <>
        <TerminalStatusSpinner size="lg" />
        <span className="text-xs font-semibold tracking-wide text-primary">{overlay.title}</span>
      </>
    );
    if (overlay.scrim === false) {
      return (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-surface-inset/70 px-6 py-5 backdrop-blur-sm">
            {content}
          </div>
        </div>
      );
    }
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-inset/70 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-3 top-14 z-10 flex justify-center">
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md ${pillToneClasses[overlay.tone]}`}
      >
        <span>{overlay.title}</span>
      </div>
    </div>
  );
}

function TerminalStatusSpinner({ size = "sm" }: { size?: "sm" | "lg" }) {
  const sizeClass = size === "lg" ? "h-8 w-8" : "h-2.5 w-2.5";
  const dotClass = size === "lg" ? "h-8 w-8" : "h-2.5 w-2.5";
  return (
    <span className={`relative flex ${sizeClass}`} aria-hidden="true">
      <span
        className={`absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60`}
      />
      <span className={`relative inline-flex ${dotClass} rounded-full bg-primary`} />
    </span>
  );
}

const terminalOverlay = (
  status: StreamConnectionStatus,
  t: (key: TranslationKey) => string,
): TerminalOverlayState | undefined => {
  if (status === "connecting") {
    return { animated: true, title: t("status.reconnecting"), tone: "accent" };
  }

  if (status === "error") {
    return { title: t("status.error"), tone: "danger" };
  }

  if (status === "ended") {
    return { title: t("status.closed"), tone: "muted" };
  }

  return undefined;
};

type SessionInputDrawerProps = {
  canSend: boolean;
  collapsed: boolean;
  connectionStatus: StreamConnectionStatus;
  input: string;
  isDesktop: boolean;
  quickKeys: SessionQuickKey[];
  sessionType: SessionType;
  onCollapsedChange: (collapsed: boolean) => void;
  onInputChange: (value: string) => void;
  onQuickKey: (quickKey: SessionQuickKey) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/**
 * 会话输入抽屉（v1.5 批 7，spec §4.7:182）：collapse 按 session type 分族（terminal 默认
 * 收起 / agent 默认展开，spec 只约束终端——终端以输出为主，输入框不占常驻高度）。快捷键条
 * 常驻贴底（收起态也在，点按即注入；展开时上移不消失），右端展开钮唤出/收回双行 composer
 * （⇧回车发送；无权限模型深度三图标——终端执行配置在服务器侧）。
 */
function SessionInputDrawer({
  canSend,
  collapsed,
  connectionStatus,
  input,
  isDesktop,
  quickKeys,
  sessionType,
  onCollapsedChange,
  onInputChange,
  onQuickKey,
  onSubmit,
}: SessionInputDrawerProps) {
  const { t } = useT();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isDesktop) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) form.requestSubmit();
    }
  };

  return (
    <section
      className={`min-w-0 px-3 py-2 sm:px-4 sm:py-2.5 max-lg:pb-[calc(0.5rem+max(env(safe-area-inset-bottom,0px),var(--shell-mobile-bottom-nav-space,0px)))] ${shellSurfaceClasses.runtimeComposer}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <QuickKeyBar canSend={canSend} quickKeys={quickKeys} onQuickKey={onQuickKey} />
        </div>
        <button
          className="xbtn cursor-pointer"
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("session.expandInput") : t("session.collapseInput")}
          title={collapsed ? t("session.expandInput") : t("session.collapseInput")}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <ShellIcon className="h-4 w-4" name={collapsed ? "expand" : "shrink"} />
        </button>
      </div>
      {!collapsed ? (
        <form className="mt-2" onSubmit={onSubmit}>
          <div
            className={`flex min-w-0 flex-col rounded-2xl px-3 py-2 ${shellSurfaceClasses.code}`}
          >
            <div className="flex min-w-0 items-start gap-2">
              <span className="shrink-0 font-mono text-xs leading-[1.35] text-on-surface-muted pt-px">
                $
              </span>
              <label className="sr-only" htmlFor="session-input">
                {t("session.sendInput")}
              </label>
              {/* 对齐 agent composer（assistant-ui 同款）：react-textarea-autosize 随内容
                  自动增高（折行也增长，批 12 反馈③——旧实现按显式换行计 rows 不折行），
                  宽端 min-h 保 spec「默认 ≥3 行」（与 agent 家族 sm:min-h-[4.5rem] 同款），
                  max-h-32 封顶（128px，CSS max/min-height 胜 inline height）后内容滚动。 */}
              <TextareaAutosize
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                cacheMeasurements
                className="max-h-32 sm:min-h-[4.5rem] min-w-0 flex-1 resize-none bg-transparent font-mono text-sm leading-[1.35] text-on-surface outline-none placeholder:text-on-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSend}
                id="session-input"
                minRows={1}
                placeholder={
                  connectionStatus === "connected"
                    ? sessionType === "agent"
                      ? t("session.typePrompt")
                      : t("session.typeShell")
                    : t("session.disconnected")
                }
                spellCheck={false}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="mt-1 flex justify-end">
              <button
                className="shrink-0 rounded-lg px-2 py-1 font-mono text-xs font-semibold text-on-surface-muted transition enabled:cursor-pointer enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canSend || input.trim().length === 0}
                type="submit"
              >
                ⏎
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </section>
  );
}

type QuickKeyBarProps = {
  canSend: boolean;
  quickKeys: SessionQuickKey[];
  onQuickKey: (quickKey: SessionQuickKey) => void;
};

function QuickKeyBar({ canSend, quickKeys, onQuickKey }: QuickKeyBarProps) {
  const { t } = useT();
  // §7.2（批 8）：窄屏键条溢出时滚轮横滚 + 边缘 12px 渐隐；键数恒定无需内容 effect 重算。
  const hs = useHScroll();
  return (
    <div
      className="hfade flex min-w-0 flex-nowrap gap-1.5 overflow-x-auto"
      aria-label={t("session.quickKeys")}
      ref={hs.ref}
      {...hs.fadeProps}
    >
      {quickKeys.map((quickKey) => (
        <button
          aria-label={t(quickKey.ariaLabelKey)}
          className="qkey cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canSend}
          key={quickKey.id}
          type="button"
          onClick={() => onQuickKey(quickKey)}
        >
          {t(quickKey.labelKey)}
        </button>
      ))}
    </div>
  );
}

type NoticeProps = {
  children: string;
  tone?: "default" | "danger";
};

function Notice({ children, tone = "default" }: NoticeProps) {
  const classes =
    tone === "danger"
      ? `${shellSurfaceClasses.danger} text-error`
      : "border border-primary/20 bg-primary/10 text-primary";

  return <p className={`rounded-2xl px-4 py-3 text-sm ${classes}`}>{children}</p>;
}

function parseStreamMessage(data: unknown) {
  if (typeof data !== "string") {
    return undefined;
  }

  try {
    return JSON.parse(data) as SessionStreamServerMessage;
  } catch {
    return undefined;
  }
}

function isTransportStatus(status: string): status is TransportStatus {
  return (
    status === "connected" || status === "disconnected" || status === "ended" || status === "error"
  );
}
