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
import { ChevronDown, ChevronUp, MoreVertical } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
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
  const [inputDrawerCollapsed, setInputDrawerCollapsed] = useState(false);

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

  // Each mount (or reconnect) bumps this so stale-socket events are ignored.
  const connGeneration = useRef(0);

  useEffect(() => {
    const generation = ++connGeneration.current;

    setConnectionStatus("connecting");
    setFatalError(null);
    reconnectAttemptsRef.current = 0;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let initialTimer: ReturnType<typeof setTimeout> | null = null;

    const socketIsCurrent = () => connGeneration.current === generation;

    const connect = () => {
      if (!socketIsCurrent()) return;

      socket = new WebSocket(sessionStreamUrl(projectName, sessionType, sessionId));
      socketRef.current = socket;

      socket.onopen = () => {
        if (!socketIsCurrent()) return;
      };

      socket.onmessage = (event) => {
        if (!socketIsCurrent()) return;
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
        if (!socketIsCurrent()) return;
        const MAX_ATTEMPTS = 8;
        const attempt = reconnectAttemptsRef.current;
        if (attempt >= MAX_ATTEMPTS) {
          setConnectionStatus("error");
          setFatalError("Reconnect stopped.");
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
        setConnectionStatus((status) => {
          if (status === "ended" || status === "error") return status;
          return "connecting";
        });
        scheduleReconnect();
      };
    };

    // Defer by 0 so StrictMode's synchronous mount→unmount→remount only
    // creates one WebSocket instead of two rapid-fire connections that mobile
    // browsers / tunnels may reject.
    initialTimer = setTimeout(connect, 0);

    return () => {
      connGeneration.current += 1;
      if (initialTimer) {
        clearTimeout(initialTimer);
        initialTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        socket.close();
        socket = null;
        socketRef.current = null;
      }
    };
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
        className={`grid h-dvh min-h-0 w-full min-w-0 overflow-hidden pt-[var(--shell-safe-area-top)] lg:grid-cols-[13.125rem_minmax(0,1fr)] lg:pt-0 ${shellSurfaceClasses.shell}`}
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
            className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${terminalViewVisible ? "gap-0 p-0" : "gap-2 p-2 sm:p-3"} ${shellSurfaceClasses.runtimeBody}`}
          >
            {detail.error instanceof Error ? (
              <Notice tone="danger">{detail.error.message}</Notice>
            ) : null}
            {fatalError ? <Notice tone="danger">{fatalError}</Notice> : null}
            {isEnded ? <Notice>Runtime ended.</Notice> : null}
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
              collapsed={inputDrawerCollapsed}
              input={input}
              quickKeys={quickKeys}
              sessionType={sessionType}
              onCollapsedChange={setInputDrawerCollapsed}
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

        <SessionDetailActionsMenu
          closePending={closePending}
          connectionStatus={_connectionStatus}
          createTerminalError={createTerminalError}
          createTerminalPending={createTerminalPending}
          detailView={detailView}
          sessionType={sessionType}
          onClose={onClose}
          onCreateTerminal={onCreateTerminal}
          onReconnect={_onReconnect}
          onViewChange={onViewChange}
        />
      </div>
    </header>
  );
}

type SessionDetailActionsMenuProps = {
  closePending: boolean;
  connectionStatus: StreamConnectionStatus;
  createTerminalError: Error | null;
  createTerminalPending: boolean;
  detailView: DetailView;
  sessionType: SessionType;
  onClose: () => void;
  onCreateTerminal: () => void;
  onReconnect: () => void;
  onViewChange: (view: DetailView) => void;
};

function SessionDetailActionsMenu({
  closePending,
  connectionStatus,
  createTerminalError,
  createTerminalPending,
  detailView,
  onClose,
  onCreateTerminal,
  onReconnect,
  onViewChange,
  sessionType,
}: SessionDetailActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const selectView = (view: DetailView) => {
    onViewChange(view);
    setOpen(false);
  };

  const createTerminal = () => {
    onCreateTerminal();
    setOpen(false);
  };

  const close = () => {
    onClose();
    setOpen(false);
  };

  const reconnect = () => {
    onReconnect();
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        className={`inline-flex h-9 items-center gap-2 rounded-xl border px-2.5 text-xs font-bold transition ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Session actions"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Actions</span>
      </button>
      {open ? (
        <div
          className={`absolute right-0 top-11 z-20 grid w-48 gap-1 rounded-2xl p-2 shadow-2xl shadow-black/40 ${shellSurfaceClasses.header}`}
          role="menu"
        >
          {sessionType === "agent" ? (
            <>
              <ActionMenuItem
                active={detailView === "files"}
                marker="FL"
                onClick={() => selectView("files")}
              >
                Files
              </ActionMenuItem>
              <ActionMenuItem
                active={detailView === "git"}
                marker="GT"
                onClick={() => selectView("git")}
              >
                Git
              </ActionMenuItem>
              <ActionMenuItem disabled={createTerminalPending} marker="T" onClick={createTerminal}>
                {createTerminalPending ? "Creating Terminal..." : "Terminal"}
              </ActionMenuItem>
            </>
          ) : null}
          {connectionStatus === "error" ? (
            <ActionMenuItem marker="↺" onClick={reconnect}>
              Retry
            </ActionMenuItem>
          ) : null}
          <ActionMenuItem danger marker="✕" disabled={closePending} onClick={close}>
            {closePending ? "Closing..." : "Close"}
          </ActionMenuItem>
          {createTerminalError instanceof Error ? (
            <p className="px-2 py-1 text-xs leading-5 text-rose-200">
              {createTerminalError.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ActionMenuItemProps = {
  active?: boolean;
  children: string;
  danger?: boolean;
  disabled?: boolean;
  marker?: string;
  onClick: () => void;
};

function ActionMenuItem({
  active = false,
  children,
  danger = false,
  disabled = false,
  marker,
  onClick,
}: ActionMenuItemProps) {
  const toneClass = danger
    ? "text-rose-100 hover:bg-rose-300/10"
    : active
      ? "bg-cyan-300/10 text-cyan-100"
      : "text-slate-200 hover:bg-slate-800/70";

  const markerTone = danger ? "danger" : active ? "accent" : "default";

  return (
    <button
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
      disabled={disabled}
      type="button"
      role="menuitem"
      onClick={onClick}
    >
      {marker && (
        <IconMarker size="sm" tone={markerTone}>
          {marker}
        </IconMarker>
      )}
      {children}
    </button>
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
  title: _title,
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
      terminalDataRef={terminalDataRef}
      terminalWriteRef={terminalWriteRef}
      onResize={onResize}
      onSendInput={onSendInput}
    />
  );
}

type TerminalCoreProps = {
  connectionStatus: StreamConnectionStatus;
  terminalWriteRef: React.MutableRefObject<
    ((type: "snapshot" | "output", data: string) => void) | null
  >;
  terminalDataRef: React.MutableRefObject<{ type: "snapshot" | "output"; data: string } | null>;
  onSendInput: (data: string) => void;
  onResize: (cols: number, rows: number) => boolean;
};

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
  const fitRef = useRef<FitAddon | null>(null);
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const fittingRef = useRef(false);
  const initialFitFramesRef = useRef<number[]>([]);
  const initialFitTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const writeQueueRef = useRef(Promise.resolve());
  const _isComposingRef = useRef(false);

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
      fontSize: 12,
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

    const fit = new FitAddon();
    term.loadAddon(fit);

    // Use WebGL renderer for smoother scrolling on mobile. Falls back to the
    // DOM renderer if WebGL is unavailable.
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available, DOM renderer is fine
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

    // Prevent soft keyboard from popping up after touch scroll
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const deltaY = Math.abs((e.changedTouches[0]?.clientY ?? 0) - touchStartY);
      if (deltaY > 8) {
        term.blur();
      }
    };
    container.addEventListener("touchstart", onTouchStart, { passive: true });
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
        // \x1b[3J clears scrollback, \x1b[H homes cursor, \x1b[2J clears screen.
        await write("\x1b[3J\x1b[H\x1b[2J" + data);
        term.scrollToBottom();
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
      container.removeEventListener("touchend", onTouchEnd);
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
    <section className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full min-h-0 min-w-0 overflow-hidden [&_.xterm]:h-full [&_.xterm-viewport]:!overflow-y-auto [&_.xterm-viewport]:[-webkit-overflow-scrolling:touch] [&_.xterm-viewport]:overscroll-behavior-y-contain [&_.xterm-viewport]:touch-pan-y"
      />
      {overlay ? <TerminalStatusOverlay overlay={overlay} /> : null}
    </section>
  );
}

type TerminalOverlayState = {
  animated?: boolean;
  tone: "accent" | "danger" | "muted";
  title: string;
};

function TerminalStatusOverlay({ overlay }: { overlay: TerminalOverlayState }) {
  const pillToneClasses = {
    accent: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100 shadow-cyan-950/20",
    danger: "border-rose-300/30 bg-rose-400/10 text-rose-100 shadow-rose-950/20",
    muted: "border-slate-600/40 bg-slate-950/60 text-slate-300 shadow-black/20",
  } satisfies Record<TerminalOverlayState["tone"], string>;

  if (overlay.animated) {
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/70 backdrop-blur-sm">
        <TerminalStatusSpinner size="lg" />
        <span className="text-xs font-semibold tracking-wide text-cyan-200">{overlay.title}</span>
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
        className={`absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60`}
      />
      <span className={`relative inline-flex ${dotClass} rounded-full bg-cyan-200`} />
    </span>
  );
}

const terminalOverlay = (status: StreamConnectionStatus): TerminalOverlayState | undefined => {
  if (status === "connecting") {
    return { animated: true, title: "Reconnecting", tone: "accent" };
  }

  if (status === "error") {
    return { title: "Stopped", tone: "danger" };
  }

  if (status === "ended") {
    return { title: "Ended", tone: "muted" };
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
  collapsed: boolean;
  input: string;
  quickKeys: SessionQuickKey[];
  sessionType: SessionType;
  onCollapsedChange: (collapsed: boolean) => void;
  onInputChange: (value: string) => void;
  onQuickKey: (quickKey: SessionQuickKey) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function SessionInputDrawer({
  canSend,
  collapsed,
  input,
  quickKeys,
  sessionType,
  onCollapsedChange,
  onInputChange,
  onQuickKey,
  onSubmit,
}: SessionInputDrawerProps) {
  return (
    <section
      className={`min-w-0 px-3 py-2 sm:px-4 sm:py-2.5 ${shellSurfaceClasses.runtimeComposer}`}
    >
      <form className="grid gap-1.5" onSubmit={onSubmit}>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <QuickKeyBar canSend={canSend} quickKeys={quickKeys} onQuickKey={onQuickKey} />
          </div>
          <button
            className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand input drawer" : "Collapse input drawer"}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {!collapsed ? (
          <div
            className={`flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2 ${shellSurfaceClasses.code}`}
          >
            <span className="shrink-0 font-mono text-xs text-slate-500">$</span>
            <label className="sr-only" htmlFor="session-input">
              Send input
            </label>
            <textarea
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className="min-w-0 flex-1 resize-none bg-transparent font-mono text-sm leading-[1.35] text-slate-100 outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canSend}
              id="session-input"
              placeholder={sessionType === "agent" ? "Type a prompt..." : "Type shell input..."}
              rows={3}
              spellCheck={false}
              style={{ maxHeight: "calc(3 * 1.35em)" }}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              className="shrink-0 rounded-lg px-2 py-1 font-mono text-xs font-semibold text-slate-400 transition enabled:cursor-pointer enabled:hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canSend || input.trim().length === 0}
              type="submit"
            >
              ⏎
            </button>
          </div>
        ) : null}
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
