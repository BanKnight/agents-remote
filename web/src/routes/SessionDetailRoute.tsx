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
  const [connectionStatus, setConnectionStatus] = useState<StreamConnectionStatus>("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [input, setInput] = useState("");
  const [inputPanelOpen, setInputPanelOpen] = useState(true);
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
        search: { workspace: sessionType === "terminal" ? "terminal" : defaultConsoleSection, filesPath: "" },
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
            className={`flex min-h-0 min-w-0 flex-col gap-3 p-3 sm:p-4 ${shellSurfaceClasses.runtimeBody}`}
          >
            {detail.error instanceof Error ? (
              <Notice tone="danger">{detail.error.message}</Notice>
            ) : null}
            {streamError ? <Notice tone="danger">{streamError}</Notice> : null}
            {connectionStatus === "connecting" ? (
              <Notice>Recovering session stream...</Notice>
            ) : null}
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
              output={output}
              projectName={projectName}
              sessionType={sessionType}
              title={title}
              onReturnToStream={() => setDetailView("terminal")}
            />
          </div>

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

      {sessionType === "agent" ? (
        <nav className="grid gap-2" aria-label="Agent detail workspace">
          {(["terminal", "files", "git"] as const).map((view) => {
            const labels: Record<typeof view, string> = {
              terminal: "Agent",
              files: "Files",
              git: "Git",
            };
            const markers: Record<typeof view, string> = {
              terminal: "AG",
              files: "FL",
              git: "GT",
            };
            const active = detailView === view;
            return (
              <button
                key={view}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[0.875rem] px-3 py-2.5 text-left text-sm font-semibold transition ${active ? "bg-cyan-300/10 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
                type="button"
                onClick={() => onViewChange(view)}
              >
                <IconMarker size="sm" tone={active ? "accent" : "muted"}>
                  {markers[view]}
                </IconMarker>
                {labels[view]}
              </button>
            );
          })}
        </nav>
      ) : null}
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
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
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
            <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {projectName} · {sessionType === "agent" ? "Agent detail" : "Terminal detail"}
            </p>
            <h1 className="mt-1 truncate text-sm font-semibold tracking-tight sm:text-2xl">
              {title}
            </h1>
            <p className="mt-1 break-all font-mono text-[0.65rem] leading-4 text-slate-500 sm:text-xs sm:leading-5">
              {sessionId}
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
    <section
      className={`grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[1.25rem] ${shellSurfaceClasses.code}`}
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
        <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-cyan-100">
          Scrollback
        </span>
      </div>
      <pre className="min-h-0 min-w-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[0.72rem] leading-[1.58] text-[#d6e4f7] [scrollbar-color:rgba(125,211,252,0.5)_transparent] sm:p-4 sm:text-sm sm:leading-[1.65]">
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
    <section
      className={`min-w-0 px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] sm:px-4 sm:py-3 ${shellSurfaceClasses.runtimeComposer}`}
    >
      <button
        className="flex w-full cursor-pointer items-center justify-between gap-3 py-1 text-left"
        type="button"
        onClick={onToggle}
      >
        <span className="text-xs font-semibold text-slate-400">
          {isOpen
            ? `${sessionType === "agent" ? "Agent" : "Terminal"} input drawer expanded`
            : `${sessionType === "agent" ? "Agent" : "Terminal"} input drawer collapsed`}
        </span>
        <span className="shrink-0 rounded-full border border-slate-700/50 bg-slate-950/50 px-2.5 py-0.5 text-[0.65rem] font-semibold text-slate-400">
          {isOpen ? "tap to collapse" : "tap to expand"}
        </span>
      </button>

      <form className="mt-2 grid gap-2 sm:mt-2.5 sm:gap-2.5" onSubmit={onSubmit}>
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
              className={`max-h-28 min-h-14 rounded-2xl px-3 py-2 font-mono text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60 sm:max-h-40 sm:min-h-20 sm:py-2.5 ${shellSurfaceClasses.code}`}
              disabled={!canSend}
              id="session-input"
              placeholder={sessionType === "agent" ? "Type a prompt..." : "Type shell input..."}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                disabled={!canSend || input.trim().length === 0}
                tone="accent"
                type="submit"
              >
                Send
              </ActionButton>
              <span className="text-xs text-slate-500">
                {canSend ? "Connected" : "Input disabled until the stream is connected."}
              </span>
            </div>
          </>
        ) : (
          <p
            className={`rounded-2xl px-3 py-2 text-xs text-slate-500 ${shellSurfaceClasses.inset}`}
          >
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
