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
import { sessionStatusLabel } from "./console-model";

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
      return;
    }

    socketRef.current.send(JSON.stringify(message));
    setStreamError(null);
  };

  const handleInputSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const command = input.length > 0 && !input.endsWith("\n") ? `${input}\n` : input;

    if (command.length === 0) {
      return;
    }

    sendMessage({ type: "input", data: command });
    setInput("");
  };

  const title = session?.displayName ?? `${sessionType === "agent" ? "Agent" : "Terminal"} Session`;
  const statusLabel = sessionStatus ?? (session ? sessionStatusLabel(session.status) : "Loading");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#123140_0,#020617_34rem)] px-4 py-4 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <header className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20 sm:p-6">
          <Link className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300" to="/">
            Agents Remote
          </Link>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                {projectName} · {sessionType === "agent" ? "Agent Session" : "Terminal Session"}
              </p>
              <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 break-all font-mono text-xs text-slate-500">{sessionId}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill label="Runtime" value={statusLabel} />
              <StatusPill label="Stream" value={connectionStatus} />
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-4 shadow-xl shadow-black/20 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Runtime stream</h2>
                <p className="mt-1 text-sm text-slate-400">
                  WebSocket reconnects attach to the same Project-scoped runtime until the session
                  is closed.
                </p>
              </div>
              <button
                className="rounded-full border border-cyan-300/40 px-3 py-1.5 text-xs font-semibold text-cyan-100"
                type="button"
                onClick={() => setReconnectKey((value) => value + 1)}
              >
                Reconnect
              </button>
            </div>

            {detail.error instanceof Error ? (
              <Notice tone="danger">{detail.error.message}</Notice>
            ) : null}
            {streamError ? <Notice tone="danger">{streamError}</Notice> : null}
            {connectionStatus === "ended" ? (
              <Notice>
                Runtime ended. Return to the Project console to create another session.
              </Notice>
            ) : null}

            <pre className="mt-5 min-h-[24rem] overflow-auto rounded-3xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-200 shadow-inner shadow-black/30">
              {output || "Waiting for session output..."}
            </pre>

            <form className="mt-4 grid gap-3" onSubmit={handleInputSubmit}>
              <label className="text-sm font-medium text-slate-200" htmlFor="session-input">
                Send input
              </label>
              <textarea
                className="min-h-24 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                id="session-input"
                placeholder={sessionType === "agent" ? "Type a prompt..." : "pwd"}
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  disabled={connectionStatus !== "connected" || input.length === 0}
                  type="submit"
                >
                  Send
                </button>
                <button
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={connectionStatus !== "connected"}
                  type="button"
                  onClick={() => sendMessage({ type: "resize", cols: 120, rows: 40 })}
                >
                  Resize 120×40
                </button>
              </div>
            </form>
          </div>

          <aside className="grid content-start gap-4">
            <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
              <h2 className="text-lg font-semibold">Session controls</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <InfoRow label="Project" value={projectName} />
                <InfoRow label="Type" value={sessionType} />
                {session && "provider" in session ? (
                  <InfoRow label="Provider" value={session.provider} />
                ) : null}
                <InfoRow label="Session id" value={sessionId} />
              </dl>
              <div className="mt-5 grid gap-2">
                <Link
                  className="rounded-2xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-200"
                  params={{ projectName }}
                  to="/projects/$projectName"
                >
                  Back to Project console
                </Link>
                <button
                  className="rounded-2xl border border-rose-300/40 px-4 py-3 text-sm font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={closeSession.isPending}
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm("Close this session? The running process will be terminated.")
                    ) {
                      closeSession.mutate();
                    }
                  }}
                >
                  {closeSession.isPending ? "Closing..." : "Close session"}
                </button>
              </div>
              {closeSession.error instanceof Error ? (
                <Notice tone="danger">{closeSession.error.message}</Notice>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
              <h2 className="text-lg font-semibold">Connection semantics</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Closing this browser tab only disconnects the stream. Use Close session to terminate
                the server runtime.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

type StatusPillProps = {
  label: string;
  value: string;
};

function StatusPill({ label, value }: StatusPillProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-slate-100">{value}</p>
    </div>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 break-all text-slate-200">{value}</dd>
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

  return <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${classes}`}>{children}</p>;
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
