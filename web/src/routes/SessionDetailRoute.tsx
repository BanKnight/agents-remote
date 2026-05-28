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
import { type FormEvent, useEffect, useRef, useState } from "react";
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
  sessionStatusLabel,
  type SessionQuickKey,
} from "./console-model";
import { ActionButton, IconMarker, StatusPill } from "../components/shell/shell-primitives";

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
  const [connectionStatus, setConnectionStatus] = useState<StreamConnectionStatus>("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [input, setInput] = useState("");
  const [inputPanelOpen, setInputPanelOpen] = useState(true);
  const [detailView, setDetailView] = useState<DetailView>("terminal");
  const [metaOpen, setMetaOpen] = useState(false);

  const detail = useQuery<SessionDetailResponse>({
    queryKey: ["projects", projectName, `${sessionType}-sessions`, sessionId],
    queryFn: () =>
      sessionType === "agent"
        ? getAgentSession(projectName, sessionId)
        : getTerminalSession(projectName, sessionId),
  });
  const session = detail.data?.session;
  const title = session?.displayName ?? `${sessionType === "agent" ? "Agent" : "Terminal"} Session`;
  const statusLabel = sessionStatus ?? (session ? sessionStatusLabel(session.status) : "Loading");
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
          search: { workspace: defaultConsoleSection },
        });
        return;
      }

      await navigate({
        to: "/projects/$projectName",
        params: { projectName },
        search: { workspace: sessionType === "terminal" ? "terminal" : defaultConsoleSection },
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
    setStreamError(null);
    const socket = new WebSocket(sessionStreamUrl(projectName, sessionType, sessionId));
    socketRef.current = socket;
    let closedByEffect = false;

    socket.onmessage = (event) => {
      const message = parseStreamMessage(event.data);

      if (!message) {
        setConnectionStatus("error");
        setStreamError("Received an invalid stream message.");
        return;
      }

      if (message.type === "connected") {
        setConnectionStatus("connected");
        setSessionStatus(message.status);
        return;
      }

      if (message.type === "snapshot" || message.type === "output") {
        setOutput(message.data);
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
      setStreamError(`${message.code}: ${message.message}`);
    };

    socket.onerror = () => {
      setConnectionStatus("disconnected");
      setStreamError("Stream disconnected before recovery completed. Use Reconnect to try again.");
    };

    socket.onclose = () => {
      if (!closedByEffect) {
        setConnectionStatus((status) =>
          status === "ended" || status === "error" ? status : "disconnected",
        );
      }
    };

    return () => {
      closedByEffect = true;
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [projectName, reconnectKey, sessionId, sessionType]);

  const sendMessage = (message: SessionStreamClientMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setStreamError("Session stream is not connected.");
      return false;
    }

    socketRef.current.send(JSON.stringify(message));
    setStreamError(null);
    return true;
  };

  const canSend = canSendToSession(connectionStatus, closeSession.isPending);
  const quickKeys = sessionQuickKeys(sessionType);
  const provider = session && "provider" in session ? session.provider : undefined;
  const terminalViewVisible = sessionType === "terminal" || detailView === "terminal";

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
    <main className="min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#123140_0,#020617_34rem)] px-3 py-3 text-slate-100 sm:px-6 sm:py-4 lg:px-8">
      <div className="mx-auto flex h-[calc(100dvh-1.5rem)] w-full max-w-6xl min-w-0 flex-col gap-3 sm:h-[calc(100dvh-2rem)] lg:gap-4">
        <SessionDetailHeader
          connectionStatus={connectionStatus}
          createTerminalError={createTerminal.error}
          createTerminalPending={createTerminal.isPending}
          detailView={detailView}
          metaOpen={metaOpen}
          projectName={projectName}
          provider={provider}
          sessionId={sessionId}
          sessionType={sessionType}
          sourceAgentSession={sourceAgentSession}
          statusLabel={statusLabel}
          title={title}
          closePending={closeSession.isPending}
          resizeDisabled={!canSend}
          onClose={() => {
            if (window.confirm("Close this session? The running process will be terminated.")) {
              closeSession.mutate();
            }
          }}
          onCreateTerminal={() => createTerminal.mutate()}
          onReconnect={() => setReconnectKey((value) => value + 1)}
          onResize={() => sendMessage({ type: "resize", cols: 120, rows: 40 })}
          onToggleMeta={() => setMetaOpen((value) => !value)}
          onViewChange={setDetailView}
        />

        {detail.error instanceof Error ? (
          <Notice tone="danger">{detail.error.message}</Notice>
        ) : null}
        {streamError ? <Notice tone="danger">{streamError}</Notice> : null}
        {connectionStatus === "connecting" ? <Notice>Recovering session stream...</Notice> : null}
        {isEnded ? (
          <Notice>Runtime ended. Return to the Project console to create another session.</Notice>
        ) : null}
        {closeSession.error instanceof Error ? (
          <Notice tone="danger">{closeSession.error.message}</Notice>
        ) : null}

        <DetailWorkspace
          detailView={detailView}
          output={output}
          projectName={projectName}
          sessionType={sessionType}
          title={title}
          onReturnToStream={() => setDetailView("terminal")}
        />

        {terminalViewVisible ? (
          <SessionInputDrawer
            canSend={canSend}
            input={input}
            isOpen={inputPanelOpen}
            quickKeys={quickKeys}
            sessionType={sessionType}
            onInputChange={setInput}
            onQuickKey={sendQuickKey}
            onSubmit={handleInputSubmit}
            onToggle={() => setInputPanelOpen((value) => !value)}
          />
        ) : null}
      </div>
    </main>
  );
}

type SessionDetailHeaderProps = {
  closePending: boolean;
  connectionStatus: StreamConnectionStatus;
  createTerminalError: Error | null;
  createTerminalPending: boolean;
  detailView: DetailView;
  metaOpen: boolean;
  projectName: string;
  provider: AgentSession["provider"] | undefined;
  resizeDisabled: boolean;
  sessionId: string;
  sessionType: SessionType;
  sourceAgentSession?: string;
  statusLabel: string;
  title: string;
  onClose: () => void;
  onCreateTerminal: () => void;
  onReconnect: () => void;
  onResize: () => void;
  onToggleMeta: () => void;
  onViewChange: (view: DetailView) => void;
};

function SessionDetailHeader({
  closePending,
  connectionStatus,
  createTerminalError,
  createTerminalPending,
  detailView,
  metaOpen,
  onClose,
  onCreateTerminal,
  onReconnect,
  onResize,
  onToggleMeta,
  onViewChange,
  projectName,
  provider,
  resizeDisabled,
  sessionId,
  sessionType,
  sourceAgentSession,
  statusLabel,
  title,
}: SessionDetailHeaderProps) {
  const returnsToAgent = sessionType === "terminal" && sourceAgentSession;
  const returnWorkspace = sessionType === "terminal" ? "terminal" : defaultConsoleSection;

  return (
    <header className="relative min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-900/85 p-3 shadow-xl shadow-black/20 backdrop-blur sm:rounded-[2rem] sm:p-4">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {returnsToAgent ? (
            <Link
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/80 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/50 hover:text-cyan-100"
              aria-label="Back to Agent detail"
              params={{ projectName, sessionId: sourceAgentSession }}
              search={{ workspace: defaultConsoleSection }}
              to="/projects/$projectName/agent-sessions/$sessionId"
            >
              ←
            </Link>
          ) : (
            <Link
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/80 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/50 hover:text-cyan-100"
              aria-label="Back to Project"
              params={{ projectName }}
              search={{ workspace: returnWorkspace }}
              to="/projects/$projectName"
            >
              ←
            </Link>
          )}
          <IconMarker tone={sessionType === "agent" ? "accent" : "success"}>
            {sessionType === "agent" ? providerMarker(provider) : "TR"}
          </IconMarker>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {projectName} · {sessionType === "agent" ? "Agent detail" : "Terminal detail"}
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {title}
            </h1>
            <p className="mt-1 break-all font-mono text-[0.7rem] leading-5 text-slate-500 sm:text-xs">
              {sessionId}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 lg:items-end">
          <div className="flex min-w-0 flex-wrap gap-1.5 lg:justify-end">
            <StatusPill label="Runtime" tone={statusTone(statusLabel)} value={statusLabel} />
            <StatusPill
              label="Stream"
              tone={transportTone(connectionStatus)}
              value={connectionStatus}
            />
            {provider ? (
              <StatusPill label="Provider" tone="accent" value={providerLabel(provider)} />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end">
            {sessionType === "agent" ? (
              <AgentDetailTools
                createTerminalPending={createTerminalPending}
                detailView={detailView}
                metaOpen={metaOpen}
                onCreateTerminal={onCreateTerminal}
                onToggleMeta={onToggleMeta}
                onViewChange={onViewChange}
              />
            ) : null}
            <SessionControls
              closePending={closePending}
              resizeDisabled={resizeDisabled}
              onClose={onClose}
              onReconnect={onReconnect}
              onResize={onResize}
            />
          </div>
          {createTerminalError instanceof Error ? (
            <p className="max-w-md text-xs leading-5 text-rose-200">
              {createTerminalError.message}
            </p>
          ) : null}
        </div>
      </div>

      {metaOpen ? (
        <SessionMetaPopover
          connectionStatus={connectionStatus}
          projectName={projectName}
          provider={provider}
          sessionId={sessionId}
          sessionType={sessionType}
          statusLabel={statusLabel}
          title={title}
          onClose={onToggleMeta}
        />
      ) : null}
    </header>
  );
}

type AgentDetailToolsProps = {
  createTerminalPending: boolean;
  detailView: DetailView;
  metaOpen: boolean;
  onCreateTerminal: () => void;
  onToggleMeta: () => void;
  onViewChange: (view: DetailView) => void;
};

function AgentDetailTools({
  createTerminalPending,
  detailView,
  metaOpen,
  onCreateTerminal,
  onToggleMeta,
  onViewChange,
}: AgentDetailToolsProps) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2" aria-label="Agent detail tools">
      <ActionButton
        tone={detailView === "terminal" ? "accent" : "default"}
        onClick={() => onViewChange("terminal")}
      >
        Stream
      </ActionButton>
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
        {createTerminalPending ? "+Terminal..." : "+Terminal"}
      </ActionButton>
      <ActionButton tone={metaOpen ? "accent" : "default"} onClick={onToggleMeta}>
        Meta
      </ActionButton>
    </div>
  );
}

type SessionControlsProps = {
  closePending: boolean;
  onClose: () => void;
  onReconnect: () => void;
  onResize: () => void;
  resizeDisabled: boolean;
};

function SessionControls({
  closePending,
  onClose,
  onReconnect,
  onResize,
  resizeDisabled,
}: SessionControlsProps) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end" aria-label="Session controls">
      <ActionButton tone="accent" onClick={onReconnect}>
        Reconnect
      </ActionButton>
      <ActionButton disabled={resizeDisabled} onClick={onResize}>
        Resize 120×40
      </ActionButton>
      <ActionButton disabled={closePending} tone="danger" onClick={onClose}>
        {closePending ? "Closing..." : "Close"}
      </ActionButton>
    </div>
  );
}

type SessionMetaPopoverProps = {
  connectionStatus: StreamConnectionStatus;
  projectName: string;
  provider: AgentSession["provider"] | undefined;
  sessionId: string;
  sessionType: SessionType;
  statusLabel: string;
  title: string;
  onClose: () => void;
};

function SessionMetaPopover({
  connectionStatus,
  onClose,
  projectName,
  provider,
  sessionId,
  sessionType,
  statusLabel,
  title,
}: SessionMetaPopoverProps) {
  return (
    <aside
      className="absolute right-3 top-[calc(100%-0.75rem)] z-20 w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl shadow-black/50 backdrop-blur"
      aria-label="Session meta"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">Session meta</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Real session and stream fields only.
          </p>
        </div>
        <button
          className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <dl className="mt-3 grid gap-2 text-xs">
        <MetaRow label="Project" value={projectName} />
        <MetaRow label="Session" value={title} />
        <MetaRow label="Type" value={sessionType === "agent" ? "Agent" : "Terminal"} />
        {provider ? <MetaRow label="Provider" value={providerLabel(provider)} /> : null}
        <MetaRow label="Runtime" value={statusLabel} />
        <MetaRow label="Stream" value={connectionStatus} />
        <MetaRow label="Internal id" value={sessionId} />
      </dl>
    </aside>
  );
}

type MetaRowProps = {
  label: string;
  value: string;
};

function MetaRow({ label, value }: MetaRowProps) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b border-slate-800/80 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-slate-200">{value}</dd>
    </div>
  );
}

type DetailWorkspaceProps = {
  detailView: DetailView;
  output: string;
  projectName: string;
  sessionType: SessionType;
  title: string;
  onReturnToStream: () => void;
};

function DetailWorkspace({
  detailView,
  onReturnToStream,
  output,
  projectName,
  sessionType,
  title,
}: DetailWorkspaceProps) {
  if (sessionType === "agent" && detailView === "files") {
    return <ContextualFilesPanel projectName={projectName} onReturnToStream={onReturnToStream} />;
  }

  if (sessionType === "agent" && detailView === "git") {
    return <ContextualGitPanel projectName={projectName} onReturnToStream={onReturnToStream} />;
  }

  return <TerminalOutput output={output} title={title} sessionType={sessionType} />;
}

type TerminalOutputProps = {
  output: string;
  sessionType: SessionType;
  title: string;
};

function TerminalOutput({ output, sessionType, title }: TerminalOutputProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[1.5rem] border border-white/10 bg-slate-900/85 p-3 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-4">
      <div className="flex min-w-0 items-center justify-between gap-3 px-1 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold sm:text-lg">
            {sessionType === "agent" ? "Agent terminal stream" : "Terminal shell stream"}
          </h2>
          <p className="mt-1 truncate text-xs text-slate-500 sm:text-sm">
            {title} · terminal-first workspace
          </p>
        </div>
        <StatusPill tone="muted" value="Scrollback" />
      </div>
      <pre className="min-h-48 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950 p-3 font-mono text-[0.82rem] leading-6 text-slate-200 shadow-inner shadow-black/30 sm:min-h-64 sm:p-4 sm:text-sm">
        {output || "Waiting for session output..."}
      </pre>
    </section>
  );
}

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
    <section className="flex min-h-0 flex-1 flex-col rounded-[1.5rem] border border-white/10 bg-slate-900/85 p-3 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-4">
      <ContextualPanelHeader
        eyebrow="Agent context"
        title="Files"
        description="Read-only Project files opened from this Agent detail. Resource-page polish stays in the inspection change."
        onReturnToStream={onReturnToStream}
      />
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5">
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
      className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-left transition enabled:hover:border-slate-600 disabled:cursor-default disabled:opacity-80"
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
    <section className="flex min-h-0 flex-1 flex-col rounded-[1.5rem] border border-white/10 bg-slate-900/85 p-3 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-4">
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
          className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5"
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
  const classes =
    tone === "danger"
      ? "border-rose-300/20 bg-rose-950/20 text-rose-100"
      : "border-slate-800 bg-slate-950/70 text-slate-400";

  return <p className={`mb-2 rounded-3xl border p-4 text-sm leading-6 ${classes}`}>{children}</p>;
}

type SessionInputDrawerProps = {
  canSend: boolean;
  input: string;
  isOpen: boolean;
  quickKeys: SessionQuickKey[];
  sessionType: SessionType;
  onInputChange: (value: string) => void;
  onQuickKey: (quickKey: SessionQuickKey) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: () => void;
};

function SessionInputDrawer({
  canSend,
  input,
  isOpen,
  quickKeys,
  sessionType,
  onInputChange,
  onQuickKey,
  onSubmit,
  onToggle,
}: SessionInputDrawerProps) {
  return (
    <section className="min-w-0 rounded-[1.5rem] border border-cyan-300/20 bg-slate-950/95 p-3 shadow-xl shadow-black/40 sm:rounded-[1.75rem] sm:p-4">
      <button
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-left"
        type="button"
        onClick={onToggle}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-100">
            {sessionType === "agent" ? "Agent input drawer" : "Terminal input drawer"}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {isOpen
              ? "Quick keys send immediately. Enter in the text box adds a newline."
              : "Collapsed. Quick keys remain available and typed input is preserved."}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>

      <form className="mt-3 grid gap-3" onSubmit={onSubmit}>
        <QuickKeyBar
          canSend={canSend}
          quickKeys={isOpen ? quickKeys : quickKeys.slice(0, 5)}
          onQuickKey={onQuickKey}
        />
        {isOpen ? (
          <>
            <label className="sr-only" htmlFor="session-input">
              Send input
            </label>
            <textarea
              className="max-h-40 min-h-20 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-base leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
              disabled={!canSend}
              id="session-input"
              placeholder={sessionType === "agent" ? "Type a prompt..." : "Type shell input..."}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                disabled={!canSend || input.trim().length === 0}
                type="submit"
              >
                Send
              </button>
              <span className="text-xs text-slate-500">
                {canSend ? "Connected" : "Input disabled until the stream is connected."}
              </span>
            </div>
          </>
        ) : (
          <p className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-500">
            Drawer collapsed. Tap Show to restore the text input without reconnecting the stream.
          </p>
        )}
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
    <div
      className="grid grid-cols-3 gap-2 overflow-x-auto pb-1 sm:flex"
      aria-label="Session quick keys"
    >
      {quickKeys.map((quickKey) => (
        <button
          aria-label={quickKey.ariaLabel}
          className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
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
      ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
      : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";

  return <p className={`rounded-2xl border px-4 py-3 text-sm ${classes}`}>{children}</p>;
}

function providerMarker(provider: AgentSession["provider"] | undefined) {
  return provider === "codex" ? "CX" : "CL";
}

function providerLabel(provider: AgentSession["provider"]) {
  return provider === "codex" ? "Codex" : "Claude";
}

function transportTone(status: StreamConnectionStatus) {
  if (status === "connected") {
    return "success";
  }

  if (status === "connecting" || status === "disconnected") {
    return "warning";
  }

  return "danger";
}

function statusTone(status: string) {
  if (status === "Running") {
    return "success";
  }

  if (status === "Waiting for input") {
    return "warning";
  }

  if (status === "Error" || status === "Closed") {
    return "danger";
  }

  return "muted";
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
