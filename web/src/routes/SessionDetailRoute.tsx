import type {
  AgentSession,
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  SessionType,
  TerminalSession,
  TransportStatus,
} from "@agents-remote/shared";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  closeAgentSession,
  closeTerminalSession,
  getAgentSession,
  getTerminalSession,
  sessionStreamUrl,
} from "../api/client";
import {
  canSendToSession,
  normalizeSessionTextInput,
  sessionQuickKeys,
  sessionStatusLabel,
  type SessionQuickKey,
} from "./console-model";

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

  return <SessionDetail projectName={projectName} sessionId={sessionId} sessionType="terminal" />;
}

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

function SessionDetail({ projectName, sessionId, sessionType }: SessionDetailProps) {
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

  const detail = useQuery<SessionDetailResponse>({
    queryKey: ["projects", projectName, `${sessionType}-sessions`, sessionId],
    queryFn: () =>
      sessionType === "agent"
        ? getAgentSession(projectName, sessionId)
        : getTerminalSession(projectName, sessionId),
  });
  const session = detail.data?.session;
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
      await navigate({ to: "/projects/$projectName", params: { projectName } });
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
      setConnectionStatus("error");
      setStreamError("Session stream connection failed.");
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

  const title = session?.displayName ?? `${sessionType === "agent" ? "Agent" : "Terminal"} Session`;
  const statusLabel = sessionStatus ?? (session ? sessionStatusLabel(session.status) : "Loading");
  const isEnded = connectionStatus === "ended" || sessionStatus === "closed";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#123140_0,#020617_34rem)] px-3 pb-32 pt-3 text-slate-100 sm:px-6 sm:pb-36 lg:px-8 lg:py-6">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col gap-3 lg:min-h-[calc(100vh-3rem)] lg:gap-4">
        <header className="rounded-[1.5rem] border border-white/10 bg-slate-900/85 p-4 shadow-xl shadow-black/20 backdrop-blur sm:rounded-[2rem] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300"
              params={{ projectName }}
              to="/projects/$projectName"
            >
              Back to Project
            </Link>
            <div className="flex flex-wrap gap-2">
              <StatusPill label="Runtime" value={statusLabel} />
              <StatusPill label="Stream" value={connectionStatus} />
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {projectName} · {sessionType === "agent" ? "Agent Session" : "Terminal Session"}
              </p>
              <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 break-all font-mono text-[0.7rem] leading-5 text-slate-500 sm:text-xs">
                {sessionId}
              </p>
            </div>
            <SessionControls
              closePending={closeSession.isPending}
              onClose={() => {
                if (window.confirm("Close this session? The running process will be terminated.")) {
                  closeSession.mutate();
                }
              }}
              onReconnect={() => setReconnectKey((value) => value + 1)}
              onResize={() => sendMessage({ type: "resize", cols: 120, rows: 40 })}
              resizeDisabled={!canSend}
            />
          </div>
          {session && "provider" in session ? (
            <p className="mt-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              Provider · {session.provider}
            </p>
          ) : null}
        </header>

        {detail.error instanceof Error ? (
          <Notice tone="danger">{detail.error.message}</Notice>
        ) : null}
        {streamError ? <Notice tone="danger">{streamError}</Notice> : null}
        {isEnded ? (
          <Notice>Runtime ended. Return to the Project console to create another session.</Notice>
        ) : null}
        {closeSession.error instanceof Error ? (
          <Notice tone="danger">{closeSession.error.message}</Notice>
        ) : null}

        <TerminalOutput output={output} />
      </div>

      <MobileInputPanel
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
    </main>
  );
}

type StatusPillProps = {
  label: string;
  value: string;
};

function StatusPill({ label, value }: StatusPillProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-3 py-2 sm:px-4 sm:py-3">
      <p className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-slate-100">{value}</p>
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
    <div className="flex flex-wrap gap-2 lg:justify-end">
      <button
        className="rounded-full border border-cyan-300/40 px-3 py-2 text-xs font-semibold text-cyan-100"
        type="button"
        onClick={onReconnect}
      >
        Reconnect
      </button>
      <button
        className="rounded-full border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={resizeDisabled}
        type="button"
        onClick={onResize}
      >
        Resize 120×40
      </button>
      <button
        className="rounded-full border border-rose-300/40 px-3 py-2 text-xs font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={closePending}
        type="button"
        onClick={onClose}
      >
        {closePending ? "Closing..." : "Close"}
      </button>
    </div>
  );
}

type TerminalOutputProps = {
  output: string;
};

function TerminalOutput({ output }: TerminalOutputProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[1.5rem] border border-white/10 bg-slate-900/85 p-3 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-4">
      <div className="flex items-center justify-between gap-3 px-1 pb-3">
        <div>
          <h2 className="text-lg font-semibold">Runtime stream</h2>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Browser reconnects attach to the same Project-scoped runtime until the session is
            closed.
          </p>
        </div>
      </div>
      <pre className="min-h-[45vh] flex-1 overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-3 font-mono text-[0.82rem] leading-6 text-slate-200 shadow-inner shadow-black/30 sm:min-h-[32rem] sm:p-4 sm:text-sm">
        {output || "Waiting for session output..."}
      </pre>
    </section>
  );
}

type MobileInputPanelProps = {
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

function MobileInputPanel({
  canSend,
  input,
  isOpen,
  quickKeys,
  sessionType,
  onInputChange,
  onQuickKey,
  onSubmit,
  onToggle,
}: MobileInputPanelProps) {
  return (
    <aside className="fixed inset-x-3 bottom-3 z-20 mx-auto max-w-4xl rounded-[1.75rem] border border-cyan-300/20 bg-slate-950/95 p-3 shadow-2xl shadow-black/50 backdrop-blur sm:bottom-4 sm:p-4">
      <button
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-left"
        type="button"
        onClick={onToggle}
      >
        <span>
          <span className="block text-sm font-semibold text-slate-100">
            {sessionType === "agent" ? "Agent input" : "Terminal input"}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {isOpen
              ? "Enter adds a newline. Use Send or quick keys to write to the stream."
              : "Show input and quick keys."}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>

      {isOpen ? (
        <form className="mt-3 grid gap-3" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="session-input">
            Send input
          </label>
          <textarea
            className="max-h-48 min-h-24 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-base leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
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
          <QuickKeyBar canSend={canSend} quickKeys={quickKeys} onQuickKey={onQuickKey} />
        </form>
      ) : null}
    </aside>
  );
}

type QuickKeyBarProps = {
  canSend: boolean;
  quickKeys: SessionQuickKey[];
  onQuickKey: (quickKey: SessionQuickKey) => void;
};

function QuickKeyBar({ canSend, quickKeys, onQuickKey }: QuickKeyBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Session quick keys">
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
