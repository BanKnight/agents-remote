import type {
  AgentSession,
  GitDiffFileSummary,
  ProjectFileEntry,
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  SessionType,
  TerminalSession,
  TransportStatus,
} from "@agents-remote/shared";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  closeAgentSession,
  closeTerminalSession,
  createTerminalSession,
  getAgentSession,
  getTerminalSession,
  listProjectFiles,
  listProjectGitDiff,
  sessionStreamUrl,
} from "../api/client";
import {
  defaultConsoleSection,
  canSendToSession,
  normalizeSessionTextInput,
  sessionQuickKeys,
  type SessionQuickKey,
} from "./console-model";
import {
  ActionButton,
  IconMarker,
  StatusPill,
  shellSurfaceClasses,
} from "../components/shell/shell-primitives";

export function AgentSessionDetailRoute() {
  const { projectName, sessionId } = useParams({
    from: "/projects/$projectName/agent-sessions/$sessionId",
  });

  return <SessionDetail projectName={projectName} sessionId={sessionId} sessionType="agent" />;
}

export function TerminalSessionDetailRoute() {
  const { projectName, sessionId } = useParams({
    from: "/projects/$projectName/terminal-sessions/$sessionId",
  });
  const { fromAgentSession } = useSearch({
    from: "/projects/$projectName/terminal-sessions/$sessionId",
  });

  return (
    <SessionDetail
      projectName={projectName}
      sessionId={sessionId}
      sessionType="terminal"
      sourceAgentSession={fromAgentSession}
    />
  );
}

type SessionDetailProps = {
  projectName: string;
  sessionId: string;
  sessionType: SessionType;
  sourceAgentSession?: string;
};

type StreamConnectionStatus = "connecting" | TransportStatus;
type DetailView = "terminal" | "files" | "git";

type SessionDetailResponse =
  | {
      session: AgentSession;
    }
  | {
      session: TerminalSession;
    };

function SessionDetail({
  projectName,
  sessionId,
  sessionType,
  sourceAgentSession,
}: SessionDetailProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<StreamConnectionStatus>("connecting");
  // Only shown for unrecoverable failures (protocol error, session ended)
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const terminalDataRef = useRef<{ type: "snapshot" | "output"; data: string } | null>(null);
  const terminalWriteRef = useRef<((type: "snapshot" | "output", data: string) => void) | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [detailView, setDetailView] = useState<DetailView>("terminal");

  const detail = useQuery<SessionDetailResponse>({
    queryKey: ["projects", projectName, `${sessionType}-sessions`, sessionId],
    queryFn: () =>
      sessionType === "agent"
        ? getAgentSession(projectName, sessionId)
        : getTerminalSession(projectName, sessionId),
  });
  const session = detail.data?.session;
  const title = session?.displayName ?? `${sessionType === "agent" ? "Agent" : "Terminal"} Session`;
  const isEnded = connectionStatus === "ended" || sessionStatus === "closed";

  const closeSession = useMutation({
    mutationFn: async () => {
      if (sessionType === "agent") {
        await closeAgentSession(projectName, sessionId);
      } else {
        await closeTerminalSession(projectName, sessionId);
      }
    },
    onSuccess: async () => {
      socketRef.current?.close();
      queryClient.removeQueries({
        exact: true,
        queryKey: ["projects", projectName, `${sessionType}-sessions`, sessionId],
      });
      await Promise.all([
        queryClient.invalidateQueries({ exact: true, queryKey: ["projects"] }),
        queryClient.invalidateQueries({ exact: true, queryKey: ["projects", projectName] }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: ["projects", projectName, "agent-sessions"],
        }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: ["projects", projectName, "terminal-sessions"],
        }),
      ]);
      if (sessionType === "terminal" && sourceAgentSession) {
        await navigate({
          to: "/projects/$projectName/agent-sessions/$sessionId",
          params: { projectName, sessionId: sourceAgentSession },
          search: { workspace: defaultConsoleSection, filesPath: "" },
        });
        return;
      }

      await navigate({
        to: "/projects/$projectName",
        params: { projectName },
        search: {
          workspace: sessionType === "terminal" ? "terminal" : defaultConsoleSection,
          filesPath: "",
        },
      });
    },
  });
  const createTerminal = useMutation({
    mutationFn: () => createTerminalSession(projectName, `Terminal for ${title}`),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        exact: true,
        queryKey: ["projects", projectName, "terminal-sessions"],
      });
      await navigate({
        to: "/projects/$projectName/terminal-sessions/$sessionId",
        params: { projectName, sessionId: result.session.id },
        search: { fromAgentSession: sessionId },
      });
    },
  });

  useEffect(() => {
    setConnectionStatus("connecting");
    setFatalError(null);
    reconnectAttemptsRef.current = 0;

    const connect = () => {
      const socket = new WebSocket(sessionStreamUrl(projectName, sessionType, sessionId));
      socketRef.current = socket;
      let closedByEffect = false;

      socket.onmessage = (event) => {
        const message = parseStreamMessage(event.data);

        if (!message) {
          setConnectionStatus("error");
          setFatalError("Received an invalid stream message.");
          return;
        }

        if (message.type === "connected") {
          reconnectAttemptsRef.current = 0;
          setConnectionStatus("connected");
          setSessionStatus(message.status);
          return;
        }

        if (message.type === "snapshot" || message.type === "output") {
          terminalDataRef.current = { type: message.type, data: message.data };
          terminalWriteRef.current?.(message.type, message.data);
          return;
        }

        if (message.type === "status") {
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

        setConnectionStatus("error");
        setFatalError(`${message.code}: ${message.message}`);
      };

      const scheduleReconnect = () => {
        if (closedByEffect) return;
        const MAX_ATTEMPTS = 8;
        const attempt = reconnectAttemptsRef.current;
        if (attempt >= MAX_ATTEMPTS) {
          setConnectionStatus("error");
          setFatalError("Connection lost. Could not reconnect after several attempts.");
          return;
        }
        reconnectAttemptsRef.current += 1;
        setConnectionStatus("connecting");
        // Exponential backoff: 1s, 2s, 4s, 8s, capped at 10s
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        reconnectTimerRef.current = setTimeout(() => {
          if (!closedByEffect) connect();
        }, delay);
      };

      socket.onerror = () => {
        // onerror is always followed by onclose; handle reconnect there
      };

      socket.onclose = () => {
        if (closedByEffect) return;
        setConnectionStatus((status) => {
          if (status === "ended" || status === "error") return status;
          return "connecting";
        });
        scheduleReconnect();
      };

      return () => {
        closedByEffect = true;
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        socket.close();
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
      };
    };

    const cleanup = connect();
    return cleanup;
  }, [projectName, reconnectKey, sessionId, sessionType]);

  const sendMessage = (message: SessionStreamClientMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      return false;
    }

    socketRef.current.send(JSON.stringify(message));
    return true;
  };

  const canSend = canSendToSession(connectionStatus, closeSession.isPending);
  const quickKeys = sessionQuickKeys(sessionType);
  const provider = session && "provider" in session ? session.provider : undefined;
  const terminalViewVisible = sessionType === "terminal" || detailView === "terminal";

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
    (cols: number, rows: number) => sendMessage({ type: "resize", cols, rows }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <main className="h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,#0f2d3a_0,#020617_34rem)] text-slate-100">
      <div
        className={`grid h-full min-h-0 w-full min-w-0 overflow-hidden sm:h-dvh lg:grid-cols-[13.125rem_minmax(0,1fr)] ${shellSurfaceClasses.shell}`}
      >
        <SessionDetailSidebar
          detailView={detailView}
          projectName={projectName}
          sessionType={sessionType}
          sourceAgentSession={sourceAgentSession}
          onViewChange={setDetailView}
        />

        <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
          <SessionDetailHeader
            connectionStatus={connectionStatus}
            createTerminalError={createTerminal.error}
            createTerminalPending={createTerminal.isPending}
            detailView={detailView}
            projectName={projectName}
            provider={provider}
            sessionId={sessionId}
            sessionType={sessionType}
            sourceAgentSession={sourceAgentSession}
            title={title}
            closePending={closeSession.isPending}
            onClose={() => {
              if (window.confirm("Close this session? The running process will be terminated.")) {
                closeSession.mutate();
              }
            }}
            onCreateTerminal={() => createTerminal.mutate()}
            onReconnect={() => setReconnectKey((value) => value + 1)}
            onViewChange={setDetailView}
          />

          <div
            className={`flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-2 sm:p-3 ${shellSurfaceClasses.runtimeBody}`}
          >
            {detail.error instanceof Error ? (
              <Notice tone="danger">{detail.error.message}</Notice>
            ) : null}
            {fatalError ? <Notice tone="danger">{fatalError}</Notice> : null}
            {isEnded ? (
              <Notice>
                Runtime ended. Return to the Project console to create another session.
              </Notice>
            ) : null}
            {closeSession.error instanceof Error ? (
              <Notice tone="danger">{closeSession.error.message}</Notice>
            ) : null}

            <DetailWorkspace
              detailView={detailView}
              projectName={projectName}
              sessionType={sessionType}
              terminalDataRef={terminalDataRef}
              terminalWriteRef={terminalWriteRef}
              title={title}
              connectionStatus={connectionStatus}
              onResize={sendTerminalResize}
              onSendInput={sendTerminalInput}
              onReturnToStream={() => setDetailView("terminal")}
            />
          </div>

          {terminalViewVisible ? (
            <SessionInputDrawer
              canSend={canSend}
              input={input}
              quickKeys={quickKeys}
              sessionType={sessionType}
              onInputChange={setInput}
              onQuickKey={sendQuickKey}
              onSubmit={handleInputSubmit}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

type SessionDetailSidebarProps = {
  detailView: DetailView;
  projectName: string;
  sessionType: SessionType;
  sourceAgentSession?: string;
  onViewChange: (view: DetailView) => void;
};

function SessionDetailSidebar({
  detailView,
  projectName,
  sessionType,
  sourceAgentSession,
  onViewChange,
}: SessionDetailSidebarProps) {
  const returnsToAgent = sessionType === "terminal" && sourceAgentSession;

  return (
    <aside
      className={`hidden min-h-0 min-w-0 overflow-hidden border-r border-slate-700/80 px-3.5 py-4 lg:flex lg:flex-col ${shellSurfaceClasses.sidebar}`}
    >
      <Link
        className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-400 hover:text-cyan-200"
        params={{ projectName }}
        search={{
          workspace: returnsToAgent
            ? "agents"
            : sessionType === "terminal"
              ? "terminal"
              : defaultConsoleSection,
          filesPath: "",
        }}
        to="/projects/$projectName"
      >
        <IconMarker size="sm" tone="muted">
          ←
        </IconMarker>
        <span>Projects</span>
      </Link>

      <div className={`mb-4 min-w-0 rounded-2xl p-3 ${shellSurfaceClasses.raised}`}>
        <h2 className="truncate text-sm font-semibold text-slate-100">{projectName}</h2>
      </div>

      <nav
        className="grid gap-2"
        aria-label={`${sessionType === "agent" ? "Agent" : "Terminal"} detail workspace`}
      >
        {detailNavigationItems(sessionType).map((item) => {
          const active = detailView === item.view;
          return (
            <button
              key={item.view}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[0.875rem] px-3 py-2.5 text-left text-sm font-semibold transition ${active ? "bg-cyan-300/10 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
              type="button"
              onClick={() => onViewChange(item.view)}
            >
              <IconMarker size="sm" tone={active ? item.tone : "muted"}>
                {item.marker}
              </IconMarker>
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

type SessionDetailHeaderProps = {
  closePending: boolean;
  connectionStatus: StreamConnectionStatus;
  createTerminalError: Error | null;
  createTerminalPending: boolean;
  detailView: DetailView;
  projectName: string;
  provider: AgentSession["provider"] | undefined;
  sessionId: string;
  sessionType: SessionType;
  sourceAgentSession?: string;
  title: string;
  onClose: () => void;
  onCreateTerminal: () => void;
  onReconnect: () => void;
  onViewChange: (view: DetailView) => void;
};

type DetailNavigationItem = {
  label: string;
  marker: string;
  tone: "accent" | "success";
  view: DetailView;
};

const agentDetailNavigationItems: DetailNavigationItem[] = [
  { view: "terminal", label: "Agent", marker: "AG", tone: "accent" },
  { view: "files", label: "Files", marker: "FL", tone: "accent" },
  { view: "git", label: "Git", marker: "GT", tone: "accent" },
];

const terminalDetailNavigationItems: DetailNavigationItem[] = [
  { view: "terminal", label: "Terminal", marker: "T", tone: "success" },
];

const detailNavigationItems = (sessionType: SessionType) =>
  sessionType === "agent" ? agentDetailNavigationItems : terminalDetailNavigationItems;

function SessionDetailHeader({
  closePending,
  connectionStatus: _connectionStatus,
  createTerminalError,
  createTerminalPending,
  detailView,
  onClose,
  onCreateTerminal,
  onReconnect: _onReconnect,
  onViewChange,
  projectName,
  provider,
  sessionId,
  sessionType,
  sourceAgentSession,
  title,
}: SessionDetailHeaderProps) {
  const returnsToAgent = sessionType === "terminal" && sourceAgentSession;
  const returnWorkspace = sessionType === "terminal" ? "terminal" : defaultConsoleSection;

  return (
    <header
      className={`relative min-w-0 px-3 py-2.5 sm:px-4 sm:py-3 ${shellSurfaceClasses.runtimeHeader}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {returnsToAgent ? (
            <Link
              className={`inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[0.8125rem] text-sm font-semibold transition ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
              aria-label="Back to Agent detail"
              params={{ projectName, sessionId: sourceAgentSession }}
              search={{ workspace: defaultConsoleSection, filesPath: "" }}
              to="/projects/$projectName/agent-sessions/$sessionId"
            >
              ←
            </Link>
          ) : (
            <Link
              className={`inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[0.8125rem] text-sm font-semibold transition ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
              aria-label="Back to Project"
              params={{ projectName }}
              search={{ workspace: returnWorkspace, filesPath: "" }}
              to="/projects/$projectName"
            >
              ←
            </Link>
          )}
          <IconMarker tone={sessionType === "agent" ? "accent" : "success"}>
            {sessionType === "agent" ? (provider ? providerMarker(provider) : "AG") : "T"}
          </IconMarker>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-100">{title}</p>
            <p className="truncate font-mono text-[0.65rem] leading-4 text-slate-500">
              {projectName} · {sessionId.slice(0, 8)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {sessionType === "agent" ? (
            <AgentDetailTools
              createTerminalPending={createTerminalPending}
              detailView={detailView}
              onCreateTerminal={onCreateTerminal}
              onViewChange={onViewChange}
            />
          ) : null}
          {_connectionStatus === "error" ? (
            <ActionButton tone="accent" onClick={_onReconnect}>
              Retry
            </ActionButton>
          ) : null}
          <ActionButton disabled={closePending} tone="danger" onClick={onClose}>
            {closePending ? "Closing..." : "Close"}
          </ActionButton>
          {createTerminalError instanceof Error ? (
            <p className="w-full text-xs leading-5 text-rose-200">{createTerminalError.message}</p>
          ) : null}
        </div>
      </div>
    </header>
  );
}

type AgentDetailToolsProps = {
  createTerminalPending: boolean;
  detailView: DetailView;
  onCreateTerminal: () => void;
  onViewChange: (view: DetailView) => void;
};

function AgentDetailTools({
  createTerminalPending,
  detailView,
  onCreateTerminal,
  onViewChange,
}: AgentDetailToolsProps) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Agent detail tools">
      <ActionButton
        tone={detailView === "files" ? "accent" : "default"}
        onClick={() => onViewChange("files")}
      >
        Files
      </ActionButton>
      <ActionButton
        tone={detailView === "git" ? "accent" : "default"}
        onClick={() => onViewChange("git")}
      >
        Git
      </ActionButton>
      <ActionButton disabled={createTerminalPending} tone="accent" onClick={onCreateTerminal}>
        {createTerminalPending ? "+T..." : "+T"}
      </ActionButton>
    </div>
  );
}

type DetailWorkspaceProps = {
  detailView: DetailView;
  projectName: string;
  sessionType: SessionType;
  title: string;
  terminalWriteRef: React.MutableRefObject<
    ((type: "snapshot" | "output", data: string) => void) | null
  >;
  terminalDataRef: React.MutableRefObject<{ type: "snapshot" | "output"; data: string } | null>;
  connectionStatus: StreamConnectionStatus;
  onSendInput: (data: string) => void;
  onResize: (cols: number, rows: number) => boolean;
  onReturnToStream: () => void;
};

function DetailWorkspace({
  connectionStatus,
  detailView,
  onReturnToStream,
  onResize,
  onSendInput,
  projectName,
  sessionType,
  terminalDataRef,
  terminalWriteRef,
  title,
}: DetailWorkspaceProps) {
  if (sessionType === "agent" && detailView === "files") {
    return <ContextualFilesPanel projectName={projectName} onReturnToStream={onReturnToStream} />;
  }

  if (sessionType === "agent" && detailView === "git") {
    return <ContextualGitPanel projectName={projectName} onReturnToStream={onReturnToStream} />;
  }

  return (
    <TerminalOutput
      connectionStatus={connectionStatus}
      sessionType={sessionType}
      terminalDataRef={terminalDataRef}
      terminalWriteRef={terminalWriteRef}
      title={title}
      onResize={onResize}
      onSendInput={onSendInput}
    />
  );
}

type TerminalOutputProps = {
  connectionStatus: StreamConnectionStatus;
  sessionType: SessionType;
  terminalWriteRef: React.MutableRefObject<
    ((type: "snapshot" | "output", data: string) => void) | null
  >;
  terminalDataRef: React.MutableRefObject<{ type: "snapshot" | "output"; data: string } | null>;
  title: string;
  onSendInput: (data: string) => void;
  onResize: (cols: number, rows: number) => boolean;
};

function TerminalOutput({
  connectionStatus,
  sessionType,
  terminalDataRef,
  terminalWriteRef,
  title,
  onSendInput,
  onResize,
}: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const initialFitFramesRef = useRef<number[]>([]);
  const initialFitTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const writeQueueRef = useRef(Promise.resolve());

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

  const overlay = terminalOverlay(connectionStatus);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      theme: {
        background: "transparent",
        foreground: "#d6e4f7",
        cursor: "#7dd3fc",
        selectionBackground: "rgba(125,211,252,0.25)",
        black: "#0f172a",
        brightBlack: "#334155",
        red: "#f87171",
        brightRed: "#fca5a5",
        green: "#4ade80",
        brightGreen: "#86efac",
        yellow: "#fbbf24",
        brightYellow: "#fde68a",
        blue: "#60a5fa",
        brightBlue: "#93c5fd",
        magenta: "#c084fc",
        brightMagenta: "#d8b4fe",
        cyan: "#22d3ee",
        brightCyan: "#67e8f9",
        white: "#cbd5e1",
        brightWhite: "#f1f5f9",
      },
      fontFamily: '"Geist Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 5000,
      convertEol: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    // Forward keyboard input to WebSocket
    term.onData((data) => {
      onSendInput(data);
    });

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

    const fitAndNotifyResize = () => {
      fit.fit();
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
    fitRef.current = fit;

    const write = (data: string) =>
      new Promise<void>((resolve) => {
        term.write(data, resolve);
      });

    const enqueueWrite = (task: () => Promise<void>) => {
      writeQueueRef.current = writeQueueRef.current.catch(() => undefined).then(task);
    };

    const writeSnapshot = (data: string) => {
      enqueueWrite(async () => {
        term.reset();
        await write(data);
      });
    };

    terminalWriteRef.current = (type, data) => {
      if (type === "snapshot") {
        writeSnapshot(data);
        return;
      }

      enqueueWrite(() => write(data));
    };

    // Replay any data that arrived before the terminal mounted
    const pending = terminalDataRef.current;
    if (pending?.type === "snapshot") {
      writeSnapshot(pending.data);
    } else if (pending) {
      enqueueWrite(() => write(pending.data));
    }

    // ResizeObserver can fire in response to xterm DOM writes, so coalesce it
    // into one animation-frame fit and only notify tmux when rows/cols change.
    const ro = new ResizeObserver(() => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }

      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        try {
          fitAndNotifyResize();
        } catch {
          // ignore during teardown
        }
      });
    });
    ro.observe(container);

    return () => {
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
      fitRef.current = null;
      lastResizeRef.current = null;
    };
    // onSendInput and onResize are stable (useCallback); terminalWriteRef/terminalDataRef are refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSendInput, onResize]);

  return (
    <section
      className={`relative grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[1.25rem] ${shellSurfaceClasses.code}`}
    >
      <div
        className={`flex min-w-0 items-center justify-between gap-3 px-3 py-2.5 ${shellSurfaceClasses.terminalTitlebar}`}
      >
        <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1 truncate text-center font-mono text-[0.72rem] text-slate-300 sm:text-xs">
          {title} · {sessionType === "agent" ? "agent runtime" : "terminal shell"}
        </div>
      </div>
      <div
        ref={containerRef}
        className="min-h-0 min-w-0 overflow-hidden p-2 [&_.xterm]:h-full [&_.xterm-viewport]:!overflow-y-auto"
      />
      {overlay ? (
        <div className="absolute inset-x-3 bottom-3 top-12 grid place-items-center rounded-[1rem] border border-slate-700/70 bg-slate-950/70 px-4 text-center backdrop-blur-sm">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
              {overlay.title}
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-300">{overlay.description}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const terminalOverlay = (status: StreamConnectionStatus) => {
  if (status === "connecting") {
    return {
      title: "Reconnecting",
      description:
        "Restoring the live terminal stream. Input resumes when the session is connected.",
    };
  }

  if (status === "error") {
    return {
      title: "Connection stopped",
      description: "Automatic reconnect stopped. Use Retry from the header or leave this session.",
    };
  }

  if (status === "ended") {
    return {
      title: "Session ended",
      description:
        "This runtime has closed. Return to the Project console to start another session.",
    };
  }

  return undefined;
};

type ContextualPanelProps = {
  projectName: string;
  onReturnToStream: () => void;
};

function ContextualFilesPanel({ projectName, onReturnToStream }: ContextualPanelProps) {
  const [currentPath, setCurrentPath] = useState("");
  const files = useQuery({
    queryKey: ["projects", projectName, "agent-context", "files", currentPath],
    queryFn: () => listProjectFiles(projectName, currentPath),
  });
  const parentPath = files.data?.parentPath ?? parentProjectPath(currentPath);
  const entries = files.data?.entries ?? [];

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col rounded-[1.25rem] p-3 sm:p-4 ${shellSurfaceClasses.workspace}`}
    >
      <ContextualPanelHeader
        eyebrow="Agent context"
        title="Files"
        description="Read-only Project files opened from this Agent detail. Resource-page polish stays in the inspection change."
        onReturnToStream={onReturnToStream}
      />
      <div
        className={`mt-3 flex min-w-0 flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 ${shellSurfaceClasses.inset}`}
      >
        <p className="min-w-0 flex-1 truncate font-mono text-sm text-slate-200">
          {currentPath.length > 0 ? currentPath : "/"}
        </p>
        <ActionButton onClick={() => setCurrentPath("")}>Root</ActionButton>
        <ActionButton
          disabled={parentPath === null}
          onClick={() => parentPath !== null && setCurrentPath(parentPath)}
        >
          Up
        </ActionButton>
        <ActionButton tone="accent" onClick={() => void files.refetch()}>
          Retry
        </ActionButton>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {files.isLoading ? <ContextualState>Loading files...</ContextualState> : null}
        {files.error instanceof Error ? (
          <ContextualState tone="danger">{files.error.message}</ContextualState>
        ) : null}
        {!files.isLoading && !files.error && entries.length === 0 ? (
          <ContextualState>This Project path has no files or folders.</ContextualState>
        ) : null}
        <div className="grid gap-1.5" aria-label="Agent contextual files">
          {entries.map((entry) => (
            <FileContextRow
              key={`${entry.type}:${entry.path}`}
              entry={entry}
              onOpenDirectory={setCurrentPath}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

type FileContextRowProps = {
  entry: ProjectFileEntry;
  onOpenDirectory: (path: string) => void;
};

function FileContextRow({ entry, onOpenDirectory }: FileContextRowProps) {
  const directory = entry.type === "directory";

  return (
    <button
      className={`min-w-0 rounded-2xl px-3 py-2.5 text-left transition enabled:hover:border-slate-600 disabled:cursor-default disabled:opacity-80 ${shellSurfaceClasses.raised}`}
      disabled={!directory}
      type="button"
      onClick={() => directory && onOpenDirectory(entry.path)}
    >
      <span className="flex min-w-0 items-center gap-3">
        <IconMarker tone={directory ? "accent" : "muted"}>{directory ? "DR" : "FL"}</IconMarker>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-100">{entry.name}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {directory ? "Open directory" : `${formatBytes(entry.size ?? 0)} · read-only`}
            {entry.hidden ? " · hidden" : ""}
          </span>
        </span>
        <StatusPill tone="muted" value={directory ? "Open" : "File"} />
      </span>
    </button>
  );
}

function ContextualGitPanel({ projectName, onReturnToStream }: ContextualPanelProps) {
  const diff = useQuery({
    queryKey: ["projects", projectName, "agent-context", "git", "diff"],
    queryFn: () => listProjectGitDiff(projectName),
  });

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col rounded-[1.25rem] p-3 sm:p-4 ${shellSurfaceClasses.workspace}`}
    >
      <ContextualPanelHeader
        eyebrow="Agent context"
        title="Git"
        description="Read-only status opened from this Agent detail. Commit, stage, checkout, and reset stay unavailable."
        onReturnToStream={onReturnToStream}
      />
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {diff.isLoading ? <ContextualState>Loading Git changes...</ContextualState> : null}
        {diff.error instanceof Error ? (
          <ContextualState tone="danger">{diff.error.message}</ContextualState>
        ) : null}
        {diff.data?.repository === false ? (
          <ContextualState>This Project directory is not a Git repository.</ContextualState>
        ) : null}
        {diff.data?.repository === true && diff.data.files.length === 0 ? (
          <ContextualState>No worktree or staged changes.</ContextualState>
        ) : null}
        {diff.data?.repository === true ? <GitContextFileList files={diff.data.files} /> : null}
      </div>
    </section>
  );
}

type GitContextFileListProps = {
  files: GitDiffFileSummary[];
};

function GitContextFileList({ files }: GitContextFileListProps) {
  return (
    <div className="grid gap-1.5" aria-label="Agent contextual Git changes">
      {files.map((file) => (
        <article
          className={`min-w-0 rounded-2xl px-3 py-2.5 ${shellSurfaceClasses.raised}`}
          key={`${file.scope}:${file.path}`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <IconMarker tone="accent">GT</IconMarker>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono font-semibold text-slate-100">
                {file.path}
              </span>
              {file.previousPath ? (
                <span className="mt-0.5 block truncate font-mono text-xs text-slate-500">
                  from {file.previousPath}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
              <StatusPill tone="accent" value={scopeLabel(file.scope)} />
              <StatusPill tone="muted" value={gitStatusLabel(file.status)} />
            </span>
          </span>
        </article>
      ))}
    </div>
  );
}

type ContextualPanelHeaderProps = {
  description: string;
  eyebrow: string;
  title: string;
  onReturnToStream: () => void;
};

function ContextualPanelHeader({
  description,
  eyebrow,
  onReturnToStream,
  title,
}: ContextualPanelHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-100">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
      </div>
      <ActionButton className="w-fit shrink-0" tone="accent" onClick={onReturnToStream}>
        Back to stream
      </ActionButton>
    </div>
  );
}

type ContextualStateProps = {
  children: string;
  tone?: "default" | "danger";
};

function ContextualState({ children, tone = "default" }: ContextualStateProps) {
  const classes = tone === "danger" ? shellSurfaceClasses.danger : shellSurfaceClasses.dashed;

  return <p className={`mb-2 rounded-3xl p-4 text-sm leading-6 ${classes}`}>{children}</p>;
}

type SessionInputDrawerProps = {
  canSend: boolean;
  input: string;
  quickKeys: SessionQuickKey[];
  sessionType: SessionType;
  onInputChange: (value: string) => void;
  onQuickKey: (quickKey: SessionQuickKey) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function SessionInputDrawer({
  canSend,
  input,
  quickKeys,
  sessionType,
  onInputChange,
  onQuickKey,
  onSubmit,
}: SessionInputDrawerProps) {
  return (
    <section
      className={`min-w-0 px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:px-4 sm:py-2.5 ${shellSurfaceClasses.runtimeComposer}`}
    >
      <form className="grid gap-1.5" onSubmit={onSubmit}>
        <QuickKeyBar canSend={canSend} quickKeys={quickKeys} onQuickKey={onQuickKey} />
        <div
          className={`flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2 ${shellSurfaceClasses.code}`}
        >
          <span className="shrink-0 font-mono text-xs text-slate-500">$</span>
          <label className="sr-only" htmlFor="session-input">
            Send input
          </label>
          <input
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSend}
            id="session-input"
            placeholder={sessionType === "agent" ? "Type a prompt..." : "Type shell input..."}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
          />
          <button
            className="shrink-0 rounded-lg px-2 py-1 font-mono text-xs font-semibold text-slate-400 transition enabled:cursor-pointer enabled:hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canSend || input.trim().length === 0}
            type="submit"
          >
            ⏎
          </button>
        </div>
      </form>
    </section>
  );
}

type QuickKeyBarProps = {
  canSend: boolean;
  quickKeys: SessionQuickKey[];
  onQuickKey: (quickKey: SessionQuickKey) => void;
};

function QuickKeyBar({ canSend, quickKeys, onQuickKey }: QuickKeyBarProps) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Session quick keys">
      {quickKeys.map((quickKey) => (
        <button
          aria-label={quickKey.ariaLabel}
          className={`shrink-0 rounded-full px-2.5 py-1.5 font-mono text-[0.62rem] font-semibold text-slate-100 transition enabled:cursor-pointer enabled:hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-2 sm:text-xs ${shellSurfaceClasses.raised}`}
          disabled={!canSend}
          key={quickKey.id}
          type="button"
          onClick={() => onQuickKey(quickKey)}
        >
          {quickKey.label}
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
      ? `${shellSurfaceClasses.danger} text-rose-100`
      : "border border-cyan-300/20 bg-cyan-300/10 text-cyan-100";

  return <p className={`rounded-2xl px-4 py-3 text-sm ${classes}`}>{children}</p>;
}

function providerMarker(provider: AgentSession["provider"] | undefined) {
  return provider === "codex" ? "CX" : "CL";
}

const parentProjectPath = (path: string) => {
  if (path.length === 0) {
    return null;
  }

  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length === 0 ? "" : parts.join("/");
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const scopeLabel = (scope: GitDiffFileSummary["scope"]) =>
  scope === "staged" ? "Staged" : "Worktree";

const gitStatusLabel = (status: GitDiffFileSummary["status"]) => {
  switch (status) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "modified":
      return "Modified";
  }
};

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
