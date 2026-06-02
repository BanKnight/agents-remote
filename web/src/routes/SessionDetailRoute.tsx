import type {
  AgentSession,
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  SessionType,
  TerminalSession,
  TransportStatus,
} from "@agents-remote/shared";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, MoreVertical } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
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
  sessionStreamUrl,
} from "../api/client";
import { useT } from "../i18n";
import type { TranslationKey } from "../i18n/types";
import {
  defaultConsoleSection,
  canSendToSession,
  inputDrawerCollapsedAtom,
  normalizeSessionTextInput,
  sessionQuickKeys,
  consoleSections,
  type SessionQuickKey,
} from "./console-model";
import { IconMarker, shellSurfaceClasses } from "../components/shell/shell-primitives";
import { ShellLayout, ShellSidebar } from "../components/shell/shell-layout";
import { ProjectShellNavigation } from "../components/shell/shell-navigation";
import { FilesPanel } from "../components/files/file-browser";
import { GitDiffPanel } from "../components/git/git-diff-viewer";
import { ShellIcon } from "../components/shell/icons";
import { useConfirm } from "../components/shell/confirm-dialog";

export function AgentSessionDetailRoute() {
  const { projectName, sessionId } = useParams({
    from: "/projects/$projectName/agent-sessions/$sessionId",
  });
  const navigate = useNavigate();

  const detail = useQuery({
    queryKey: ["projects", projectName, "agent-sessions", sessionId],
    queryFn: () => getAgentSession(projectName, sessionId),
    staleTime: 60_000,
  });

  // Redirect claude2 sessions to the chat UI
  useEffect(() => {
    if (detail.data?.session.provider === "claude2") {
      void navigate({
        to: "/projects/$projectName/agent-sessions/$sessionId/claude2",
        params: { projectName, sessionId },
        replace: true,
      });
    }
  }, [detail.data, navigate, projectName, sessionId]);

  if (detail.data?.session.provider === "claude2") {
    return null;
  }

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
  const { t } = useT();
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
  const [inputDrawerCollapsed, setInputDrawerCollapsed] = useAtom(inputDrawerCollapsedAtom);
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
  const session = detail.data?.session;
  const title =
    session?.displayName ??
    (sessionType === "agent"
      ? `${t("section.agents")} Session`
      : `${t("section.terminal")} Session`);
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
  const { confirm, holder } = useConfirm();
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
          setFatalError(t("session.fatalProtocol"));
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

  const projectNavItems = consoleSections.map((section) => ({
    id: section.id,
    label: t(section.labelKey),
    marker: (
      <IconMarker size="sm" tone="accent">
        {section.id === "agents" ? (
          <ShellIcon name="agent-nav" />
        ) : section.id === "files" ? (
          <ShellIcon name="files-nav" />
        ) : section.id === "git" ? (
          <ShellIcon name="git-nav" />
        ) : (
          <ShellIcon name="terminal" />
        )}
      </IconMarker>
    ),
  }));

  return (
    <ShellLayout
      sidebar={
        <ShellSidebar display="flex">
          <ProjectShellNavigation
            activeItemId={sessionType === "agent" ? "agents" : "terminal"}
            items={projectNavItems}
            projectPath={projectName}
            projectTitle={projectName}
            onSelectItem={(section) => {
              void navigate({
                to: "/projects/$projectName",
                params: { projectName },
                search: { workspace: section, filesPath: "" },
              });
            }}
          />
        </ShellSidebar>
      }
      variant="project"
    >
      <SessionDetailHeader
        connectionStatus={connectionStatus}
        createTerminalError={createTerminal.error}
        createTerminalPending={createTerminal.isPending}
        detailView={detailView}
        projectName={projectName}
        sessionId={sessionId}
        sessionType={sessionType}
        sourceAgentSession={sourceAgentSession}
        title={title}
        closePending={closeSession.isPending}
        onClose={async () => {
          const ok = await confirm({
            cancelLabel: t("cancel"),
            confirmLabel: t("session.close"),
            message: t("session.closeConfirm"),
            title: t("session.close"),
            tone: "danger",
          });
          if (ok) closeSession.mutate();
        }}
        onCreateTerminal={() => createTerminal.mutate()}
        onReconnect={() => setReconnectKey((value) => value + 1)}
        onViewChange={setDetailView}
      />

      <div
        className={`flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden gap-0 p-0 ${shellSurfaceClasses.runtimeBody}`}
      >
        {detail.error || fatalError || isEnded || closeSession.error ? (
          <div className="flex shrink-0 flex-col gap-2 p-2 sm:p-3">
            {detail.error instanceof Error ? (
              <Notice tone="danger">{detail.error.message}</Notice>
            ) : null}
            {fatalError ? <Notice tone="danger">{fatalError}</Notice> : null}
            {isEnded ? <Notice>{t("session.runtimeEnded")}</Notice> : null}
            {closeSession.error instanceof Error ? (
              <Notice tone="danger">{closeSession.error.message}</Notice>
            ) : null}
          </div>
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
          isDesktop={isDesktop}
          quickKeys={quickKeys}
          sessionType={sessionType}
          onCollapsedChange={setInputDrawerCollapsed}
          onInputChange={setInput}
          onQuickKey={sendQuickKey}
          onSubmit={handleInputSubmit}
        />
      ) : null}
      {holder}
    </ShellLayout>
  );
}

type SessionDetailHeaderProps = {
  closePending: boolean;
  connectionStatus: StreamConnectionStatus;
  createTerminalError: Error | null;
  createTerminalPending: boolean;
  detailView: DetailView;
  projectName: string;
  sessionId: string;
  sessionType: SessionType;
  sourceAgentSession?: string;
  title: string;
  onClose: () => void;
  onCreateTerminal: () => void;
  onReconnect: () => void;
  onViewChange: (view: DetailView) => void;
};

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
  sessionId,
  sessionType,
  sourceAgentSession,
  title,
}: SessionDetailHeaderProps) {
  const { t } = useT();
  const returnsToAgent = sessionType === "terminal" && sourceAgentSession;
  const returnWorkspace = sessionType === "terminal" ? "terminal" : defaultConsoleSection;

  return (
    <header
      className={`relative min-w-0 px-3 py-2.5 sm:px-4 sm:py-3 ${shellSurfaceClasses.runtimeHeader}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {returnsToAgent ? (
          <Link
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
            aria-label={t("session.backToAgent")}
            params={{ projectName, sessionId: sourceAgentSession }}
            search={{ workspace: defaultConsoleSection, filesPath: "" }}
            to="/projects/$projectName/agent-sessions/$sessionId"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 3L5 8l5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("nav.back")}
          </Link>
        ) : (
          <Link
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
            aria-label={t("session.backToProject")}
            params={{ projectName }}
            search={{ workspace: returnWorkspace, filesPath: "" }}
            to="/projects/$projectName"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 3L5 8l5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("nav.back")}
          </Link>
        )}
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-xs font-semibold text-slate-100">{title}</p>
          <p className="truncate font-mono text-[0.65rem] leading-4 text-slate-500">
            {projectName} · {sessionId.slice(0, 8)}
          </p>
        </div>
        <SessionDetailActions
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

function SessionDetailActions({
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
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
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

  const buttonClass = `inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`;
  const iconBtn = `inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`;

  return (
    <>
      {/* Desktop: inline icon buttons */}
      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {sessionType === "agent" ? (
          <>
            <button
              className={iconBtn}
              title={t("session.files")}
              type="button"
              onClick={() => onViewChange("files")}
            >
              <ShellIcon name="files-nav" className="h-4 w-4" />
            </button>
            <button
              className={iconBtn}
              title={t("session.git")}
              type="button"
              onClick={() => onViewChange("git")}
            >
              <ShellIcon name="git-nav" className="h-4 w-4" />
            </button>
            <button
              className={iconBtn}
              disabled={createTerminalPending}
              title={createTerminalPending ? t("session.creating") : t("session.createTerminal")}
              type="button"
              onClick={onCreateTerminal}
            >
              <ShellIcon name="terminal" className="h-4 w-4" />
            </button>
          </>
        ) : null}
        {connectionStatus === "error" ? (
          <button
            className={iconBtn}
            title={t("session.retry")}
            type="button"
            onClick={onReconnect}
          >
            <ShellIcon name="refresh" className="h-4 w-4" />
          </button>
        ) : null}
        <button
          className={`${iconBtn} border-rose-300/30 text-rose-200 hover:border-rose-300/60 hover:bg-rose-300/10`}
          disabled={closePending}
          title={closePending ? t("session.closing") : t("session.close")}
          type="button"
          onClick={onClose}
        >
          <ShellIcon name="close" className="h-4 w-4" />
        </button>
        {createTerminalError instanceof Error ? (
          <p className="text-xs text-rose-200">{createTerminalError.message}</p>
        ) : null}
      </div>

      {/* Mobile: dropdown menu */}
      <div ref={menuRef} className="relative shrink-0 sm:hidden">
        <button
          className={buttonClass}
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t("session.actionsAria")}
          onClick={() => setOpen((value) => !value)}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        {open ? (
          <div
            className="absolute right-0 top-10 z-20 grid w-48 gap-1 rounded-2xl border border-white/10 bg-slate-950/90 p-2 shadow-2xl shadow-black/40"
            role="menu"
          >
            {sessionType === "agent" ? (
              <>
                <ActionMenuItem
                  active={detailView === "files"}
                  marker={<ShellIcon name="files-nav" className="h-4 w-4" />}
                  onClick={() => selectView("files")}
                >
                  {t("session.files")}
                </ActionMenuItem>
                <ActionMenuItem
                  active={detailView === "git"}
                  marker={<ShellIcon name="git-nav" className="h-4 w-4" />}
                  onClick={() => selectView("git")}
                >
                  {t("session.git")}
                </ActionMenuItem>
                <ActionMenuItem
                  disabled={createTerminalPending}
                  marker={<ShellIcon name="terminal" className="h-4 w-4" />}
                  onClick={createTerminal}
                >
                  {createTerminalPending ? t("session.creating") : t("session.terminal")}
                </ActionMenuItem>
              </>
            ) : null}
            {connectionStatus === "error" ? (
              <ActionMenuItem
                marker={<ShellIcon name="refresh" className="h-4 w-4" />}
                onClick={reconnect}
              >
                {t("session.retry")}
              </ActionMenuItem>
            ) : null}
            <ActionMenuItem
              danger
              marker={<ShellIcon name="close" className="h-4 w-4" />}
              disabled={closePending}
              onClick={close}
            >
              {closePending ? t("session.closing") : t("session.close")}
            </ActionMenuItem>
            {createTerminalError instanceof Error ? (
              <p className="px-2 py-1 text-xs leading-5 text-rose-200">
                {createTerminalError.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

type ActionMenuItemProps = {
  active?: boolean;
  children: string;
  danger?: boolean;
  disabled?: boolean;
  marker?: ReactNode;
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
  const { t } = useT();
  const showFiles = sessionType === "agent" && detailView === "files";
  const showGit = sessionType === "agent" && detailView === "git";

  return (
    <div className="relative min-h-0 flex-1 flex flex-col">
      <TerminalOutput
        connectionStatus={connectionStatus}
        terminalDataRef={terminalDataRef}
        terminalWriteRef={terminalWriteRef}
        onResize={onResize}
        onSendInput={onSendInput}
      />
      {showFiles ? (
        <div
          className="absolute inset-0 z-20 flex flex-col"
          style={{ background: "radial-gradient(circle at top, #0f2d3a 0, #020617 34rem)" }}
        >
          <div className="flex shrink-0 items-center border-b border-slate-700/40 bg-[#0a0e16]/60 px-3.5 py-2.5">
            <button
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-300"
              type="button"
              onClick={onReturnToStream}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M10 3L5 8l5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t("session.backToStream")}
            </button>
          </div>
          <div className="min-h-0 flex-1 flex flex-col">
            <FilesPanel initialPath="" projectName={projectName} queryScope="agent-context" />
          </div>
        </div>
      ) : null}
      {showGit ? (
        <div
          className="absolute inset-0 z-20 flex flex-col"
          style={{ background: "radial-gradient(circle at top, #0f2d3a 0, #020617 34rem)" }}
        >
          <div className="flex shrink-0 items-center border-b border-slate-700/40 bg-[#0a0e16]/60 px-3.5 py-2.5">
            <button
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-300"
              type="button"
              onClick={onReturnToStream}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M10 3L5 8l5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t("session.backToStream")}
            </button>
          </div>
          <div className="min-h-0 flex-1 flex flex-col">
            <GitDiffPanel projectName={projectName} queryScope="agent-context" />
          </div>
        </div>
      ) : null}
    </div>
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

  const { t } = useT();
  const overlay = terminalOverlay(connectionStatus, t);

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

    // xterm.js 6.x Gesture class calls preventDefault() on touch events at
    // the document level, which blocks native browser scroll. The custom
    // scrollbar (SmoothScrollableElement) only handles mouse wheel events,
    // not touch gesture events — so touch scroll is a dead path in v6.
    // Workaround: track touch deltas and drive term.scrollLines() manually,
    // with inertia after release. Scrolling follows the traditional direction:
    // swipe up → scroll up (older content), swipe down → scroll down (newer).
    const LINE_HEIGHT_PX = 16.2; // fontSize 12 × lineHeight 1.35
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

    const applyScroll = (px: number) => {
      touchScrollAccum += px;
      const lines = Math.trunc(touchScrollAccum / LINE_HEIGHT_PX);
      if (lines !== 0) {
        term.scrollLines(lines);
        touchScrollAccum -= lines * LINE_HEIGHT_PX;
      }
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
        const px = sign * speed * dt;
        applyScroll(px);
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
        className="h-full min-h-0 min-w-0 overflow-hidden [&_.xterm]:h-full"
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
  input: string;
  isDesktop: boolean;
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
  isDesktop,
  quickKeys,
  sessionType,
  onCollapsedChange,
  onInputChange,
  onQuickKey,
  onSubmit,
}: SessionInputDrawerProps) {
  const { t } = useT();
  // Auto-grow from 1 to 3 rows based on explicit newline count (mobile only).
  const newlines = (input.match(/\n/g) || []).length;
  const mobileRows = Math.min(newlines + 1, 3);
  const rows = isDesktop ? 3 : mobileRows;

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
            className={`flex min-w-0 items-start gap-2 rounded-2xl px-3 py-2 ${shellSurfaceClasses.code}`}
          >
            <span className="shrink-0 font-mono text-xs leading-[1.35] text-slate-500 pt-px">
              $
            </span>
            <label className="sr-only" htmlFor="session-input">
              {t("session.sendInput")}
            </label>
            <textarea
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className="min-w-0 flex-1 resize-none bg-transparent font-mono text-sm leading-[1.35] text-slate-100 outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canSend}
              id="session-input"
              placeholder={
                sessionType === "agent" ? t("session.typePrompt") : t("session.typeShell")
              }
              rows={rows}
              spellCheck={false}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
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
  const { t } = useT();
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5" aria-label={t("session.quickKeys")}>
      {quickKeys.map((quickKey) => (
        <button
          aria-label={t(quickKey.ariaLabelKey)}
          className={`shrink-0 rounded-full px-2.5 py-1.5 font-mono text-[0.62rem] font-semibold text-slate-100 transition enabled:cursor-pointer enabled:hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-2 sm:text-xs ${shellSurfaceClasses.raised}`}
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
      ? `${shellSurfaceClasses.danger} text-rose-100`
      : "border border-cyan-300/20 bg-cyan-300/10 text-cyan-100";

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
