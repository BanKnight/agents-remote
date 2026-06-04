import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useComposerRuntime,
  useExternalStoreRuntime,
  useMessage,
  useMessagePartReasoning,
  useThread,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { closeAgentSession, getAgentSession } from "../api/client";
import { useT } from "../i18n";
import { useConfirm } from "../components/shell/confirm-dialog";
import { defaultConsoleSection, consoleSections } from "./console-model";
import { IconMarker, shellSurfaceClasses } from "../components/shell/shell-primitives";
import { ShellLayout, ShellSidebar } from "../components/shell/shell-layout";
import { ProjectShellNavigation } from "../components/shell/shell-navigation";
import { ShellIcon } from "../components/shell/icons";
import { ToolFallback } from "../components/assistant-ui/tool-fallback";
import { getToolRenderer } from "../components/assistant-ui/tool-ui-registry";
import { Claude2BridgeContext, useClaude2Session } from "./claude2-adapter";

type CompactStatus = "idle" | "compacting" | "compacted" | "interrupted" | "error";

type CompactState = {
  status: CompactStatus;
  setCompacting: () => void;
  setCompacted: () => void;
  setInterrupted: () => void;
  setCompactError: () => void;
};

const Claude2CompactContext = createContext<CompactState | null>(null);

export function Claude2SessionDetailRoute() {
  const { projectName, sessionId } = useParams({
    from: "/projects/$projectName/agent-sessions/$sessionId/claude2",
  });

  return <Claude2Chat projectName={projectName} sessionId={sessionId} />;
}

function modelDisplayLabel(modelId: string, resolvedName?: string): string {
  if (resolvedName) return resolvedName;
  // Fall back to capitalized alias — Claude CLI uses tier names (Sonnet/Opus/Haiku)
  return modelId.charAt(0).toUpperCase() + modelId.slice(1);
}

function Claude2Chat({ projectName, sessionId }: { projectName: string; sessionId: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, holder } = useConfirm();

  const detail = useQuery({
    queryKey: ["projects", projectName, "agent-sessions", sessionId],
    queryFn: () => getAgentSession(projectName, sessionId),
  });

  const session = detail.data?.session;
  const availableModels = detail.data?.availableModels ?? [];
  const title = session?.displayName ?? `${t("section.agents")} Session`;

  const closeSession = useMutation({
    mutationFn: () => closeAgentSession(projectName, sessionId),
    onSuccess: async () => {
      queryClient.removeQueries({
        exact: true,
        queryKey: ["projects", projectName, "agent-sessions", sessionId],
      });
      await Promise.all([
        queryClient.invalidateQueries({ exact: true, queryKey: ["projects"] }),
        queryClient.invalidateQueries({ exact: true, queryKey: ["projects", projectName] }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: ["projects", projectName, "agent-sessions"],
        }),
      ]);
      await navigate({
        to: "/projects/$projectName",
        params: { projectName },
        search: { workspace: defaultConsoleSection, filesPath: "" },
      });
    },
  });

  const { storeAdapter, bridge, hasOlder, loadOlder, resolvedModel, permissionMode } =
    useClaude2Session(projectName, sessionId);

  const [compactStatus, setCompactStatus] = useState<CompactStatus>("idle");

  const compactState: CompactState = useMemo(
    () => ({
      status: compactStatus,
      setCompacting: () => setCompactStatus("compacting"),
      setCompacted: () => setCompactStatus("compacted"),
      setInterrupted: () => setCompactStatus("interrupted"),
      setCompactError: () => setCompactStatus("error"),
    }),
    [compactStatus],
  );

  // Auto-dismiss compacted/interrupted/error status after 4 seconds
  useEffect(() => {
    if (
      compactStatus === "compacted" ||
      compactStatus === "interrupted" ||
      compactStatus === "error"
    ) {
      const timer = setTimeout(() => setCompactStatus("idle"), 4000);
      return () => clearTimeout(timer);
    }
  }, [compactStatus]);

  // Wire bridge.onCompact after hook returns.
  // status:"compacting" or auto compact_boundary → { phase: "start" }
  // compact_result or result after compact → { phase: "end", error? }
  bridge.onCompact = (event) => {
    if (event.phase === "start") {
      console.log("[claude2-chat] compact started");
      setCompactStatus("compacting");
    } else if (event.error) {
      console.log("[claude2-chat] compact failed:", event.error);
      setCompactStatus(event.error === "interrupted" ? "interrupted" : "error");
    } else {
      console.log("[claude2-chat] compact completed");
      setCompactStatus("compacted");
    }
  };

  const runtime = useExternalStoreRuntime(storeAdapter);

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
            activeItemId="agents"
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
      <ChatHeader
        closePending={closeSession.isPending}
        projectName={projectName}
        title={title}
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
      />

      <AssistantRuntimeProvider runtime={runtime}>
        <Claude2BridgeContext.Provider value={bridge}>
          <Claude2CompactContext.Provider value={compactState}>
            <div
              className={`flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden ${shellSurfaceClasses.runtimeBody}`}
            >
              {detail.error instanceof Error ? (
                <div className="shrink-0 px-3 py-2">
                  <p className="rounded-xl bg-red-900/30 px-3 py-2 text-xs text-red-300">
                    {detail.error.message}
                  </p>
                </div>
              ) : null}
              {closeSession.error instanceof Error ? (
                <div className="shrink-0 px-3 py-2">
                  <p className="rounded-xl bg-red-900/30 px-3 py-2 text-xs text-red-300">
                    {closeSession.error.message}
                  </p>
                </div>
              ) : null}

              <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 scroll-smooth">
                  <ThreadViewportContent hasOlder={hasOlder} loadOlder={loadOlder} />
                </ThreadPrimitive.Viewport>
                <div className="relative h-0 w-full pointer-events-none">
                  <ThreadPrimitive.ScrollToBottom
                    behavior="smooth"
                    className="pointer-events-auto absolute -top-12 right-3 z-10 rounded-full bg-slate-700/90 p-2 text-slate-300 shadow-lg transition-all duration-300 ease-out hover:bg-slate-600/90 hover:scale-110 disabled:opacity-0 disabled:scale-50 cursor-pointer"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M4 6l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </ThreadPrimitive.ScrollToBottom>
                </div>

                <CompactIndicator />
                <div className="shrink-0 border-t border-slate-700/80 px-3 py-2.5 sm:px-4">
                  <ComposerPrimitive.Root>
                    <ComposerWithInterrupt
                      currentModel={undefined}
                      currentResolved={resolvedModel ?? session?.model}
                      availableModels={availableModels}
                      permissionMode={permissionMode}
                    />
                  </ComposerPrimitive.Root>
                </div>
              </ThreadPrimitive.Root>
            </div>
          </Claude2CompactContext.Provider>
        </Claude2BridgeContext.Provider>
      </AssistantRuntimeProvider>
      {holder}
    </ShellLayout>
  );
}

type ChatHeaderProps = {
  closePending: boolean;
  projectName: string;
  title: string;
  onClose: () => void;
};

function ChatHeader({ closePending, projectName, title, onClose }: ChatHeaderProps) {
  const { t } = useT();

  return (
    <header
      className={`relative min-w-0 px-3 py-2.5 sm:px-4 sm:py-3 ${shellSurfaceClasses.runtimeHeader}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Link
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
          aria-label={t("session.backToProject")}
          params={{ projectName }}
          search={{ workspace: defaultConsoleSection, filesPath: "" }}
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
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-xs font-semibold text-slate-100">{title}</p>
          <p className="truncate text-[0.65rem] leading-4 text-slate-500">{projectName}</p>
        </div>
        <button
          type="button"
          disabled={closePending}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-red-300 disabled:opacity-40"
          onClick={onClose}
          aria-label={t("session.close")}
        >
          <ShellIcon name="close" />
          <span className="hidden sm:inline">
            {closePending ? t("session.closing") : t("session.close")}
          </span>
        </button>
      </div>
    </header>
  );
}

function UserChatBubble() {
  return (
    <MessagePrimitive.Root className="flex justify-end px-3 py-1.5 sm:px-5 group">
      <div className="max-w-[90%] rounded-2xl rounded-br-md bg-cyan-700/60 px-4 py-2.5">
        <MessagePrimitive.Parts />
      </div>
      <ActionBarPrimitive.Root className="flex items-center gap-0.5 self-end opacity-0 group-hover:opacity-100 transition-opacity px-1">
        <ActionBarPrimitive.Copy className="rounded p-1 text-slate-400 hover:text-slate-200 transition">
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect
              x="5"
              y="2"
              width="9"
              height="12"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M2 5v9a1 1 0 001 1h7"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </ActionBarPrimitive.Copy>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="text-sm text-slate-100 leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-1 [&_pre]:relative [&_pre]:bg-slate-950/80 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:pt-7 [&_pre]:mb-2 [&_pre]:overflow-x-auto [&_code]:bg-slate-900/60 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:text-[0.75rem] [&_pre_code]:leading-relaxed [&_a]:text-cyan-400 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 [&_table]:w-full [&_table]:border-collapse [&_table]:mb-2 [&_th]:border [&_th]:border-slate-600 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-slate-600 [&_td]:px-2 [&_td]:py-1 [&_hr]:border-slate-700 [&_hr]:my-3"
      components={{
        pre: ({ children, node }) => {
          const className = "relative bg-slate-950/80 rounded-lg p-3 pt-7 mb-2 overflow-x-auto";
          // Extract language from code block
          const codeChild = (
            node as { children?: Array<{ properties?: { className?: string[] } }> }
          )?.children?.[0];
          const langClass = codeChild?.properties?.className
            ?.find((c: string) => c.startsWith("language-"))
            ?.replace("language-", "");
          return (
            <div className="relative my-3 group/code">
              {langClass ? (
                <div className="absolute top-0 left-0 right-0 flex items-center px-3 py-1.5 z-10 pointer-events-none">
                  <span className="text-[0.55rem] font-medium uppercase tracking-wider text-slate-500">
                    {langClass}
                  </span>
                </div>
              ) : null}
              <pre className={className}>{children}</pre>
            </div>
          );
        },
      }}
    />
  );
}

function AssistantChatBubble() {
  const message = useMessage();
  const isRunning = useThread((s) => s.isRunning);
  const isEmpty =
    !message.content || (Array.isArray(message.content) && message.content.length === 0);

  // Only show reasoning in the currently streaming message, never in history.
  const msgStatus = (message as { status?: { type?: string } }).status;
  const showReasoning = msgStatus?.type === "running";

  return (
    <MessagePrimitive.Root className="flex justify-start px-3 py-1.5 sm:px-5 group">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-800/70 px-4 py-2.5">
        {isEmpty ? (
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:300ms]" />
          </div>
        ) : (
          <>
            <MessagePrimitive.Parts>
              {({ part }) => {
                if (part.type === "text") return <MarkdownText />;
                if (part.type === "tool-call") {
                  const CustomUI = getToolRenderer(part.toolName);
                  return CustomUI ? <CustomUI {...part} /> : <ToolFallback {...part} />;
                }
                if (part.type === "reasoning") return showReasoning ? <ReasoningDisplay /> : null;
                return null;
              }}
            </MessagePrimitive.Parts>
            {isRunning ? (
              <div className="mt-2 flex items-center gap-1.5 py-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400/60 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400/60 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400/60 [animation-delay:300ms]" />
              </div>
            ) : null}
          </>
        )}
      </div>
      {!isEmpty && !isRunning ? (
        <ActionBarPrimitive.Root className="flex items-center gap-0.5 self-end opacity-0 group-hover:opacity-100 transition-opacity px-1">
          <ActionBarPrimitive.Copy className="rounded p-1 text-slate-400 hover:text-slate-200 transition">
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect
                x="5"
                y="2"
                width="9"
                height="12"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M2 5v9a1 1 0 001 1h7"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </ActionBarPrimitive.Copy>
        </ActionBarPrimitive.Root>
      ) : null}
    </MessagePrimitive.Root>
  );
}

function SystemNotification() {
  return (
    <MessagePrimitive.Root className="flex items-center gap-3 px-3 py-2 sm:px-5">
      <span className="h-px flex-1 bg-slate-700" />
      <span className="text-xs text-slate-500 shrink-0">
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === "text") return <>{part.text}</>;
            return null;
          }}
        </MessagePrimitive.Parts>
      </span>
      <span className="h-px flex-1 bg-slate-700" />
    </MessagePrimitive.Root>
  );
}

function ThreadViewportContent({
  hasOlder,
  loadOlder,
}: {
  hasOlder: boolean;
  loadOlder: () => Promise<void>;
}) {
  const isLoading = useThread((s) => s.isLoading);

  return (
    <>
      {isLoading ? <ChatSkeleton /> : <LoadOlderButton hasOlder={hasOlder} loadOlder={loadOlder} />}
      <ThreadPrimitive.Messages>
        {({ message }) => {
          if (message.role === "user") return <UserChatBubble />;
          if (message.role === "system") return <SystemNotification />;
          return <AssistantChatBubble />;
        }}
      </ThreadPrimitive.Messages>
      <ThreadPrimitive.ViewportFooter />
    </>
  );
}

function ChatSkeleton() {
  const rows = [
    { align: "end", width: "w-2/3", height: "h-10", bg: "bg-cyan-700/30" },
    { align: "start", width: "w-3/4", height: "h-12", bg: "bg-slate-800/40" },
    { align: "end", width: "w-1/2", height: "h-9", bg: "bg-cyan-700/30" },
    { align: "start", width: "w-5/6", height: "h-14", bg: "bg-slate-800/40" },
  ];
  return (
    <div className="space-y-3 px-3 py-2 animate-pulse" aria-hidden="true">
      {rows.map((row, i) => (
        <div key={i} className={`flex ${row.align === "end" ? "justify-end" : "justify-start"}`}>
          <div className={`${row.height} ${row.width} rounded-2xl ${row.bg} px-4 py-3`}>
            <div className="h-2.5 w-24 rounded bg-slate-600/40" />
            <div className="mt-1.5 h-2.5 w-16 rounded bg-slate-600/25" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadOlderButton({
  hasOlder,
  loadOlder,
}: {
  hasOlder: boolean;
  loadOlder: () => Promise<void>;
}) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);

  if (!hasOlder) return null;

  const handleLoad = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await loadOlder();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center py-1 px-3">
      <button
        type="button"
        disabled={loading}
        onClick={handleLoad}
        className="rounded-lg bg-slate-800/60 px-3 py-1.5 text-[0.65rem] text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition cursor-pointer disabled:opacity-50"
      >
        {loading ? t("claude2.loadingOlder") : t("claude2.loadOlder")}
      </button>
    </div>
  );
}

function ModelSelector({
  currentModel,
  currentResolved,
  availableModels,
}: {
  currentModel?: string;
  currentResolved?: string;
  availableModels: string[];
}) {
  const { t } = useT();
  const bridge = useContext(Claude2BridgeContext);
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Clear switching animation when resolved model updates
  useEffect(() => {
    if (switchingTo) setSwitchingTo(null);
  }, [currentResolved]);

  if (availableModels.length === 0) return null;

  const current = currentModel ?? availableModels[0];
  const label =
    currentResolved && (currentModel === current || !currentModel)
      ? currentResolved
      : modelDisplayLabel(current);

  if (switchingTo) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.65rem] font-medium text-amber-400/80">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-400/40 border-t-amber-400" />
        {t("claude2.switchingModel", { model: modelDisplayLabel(switchingTo) })}
      </div>
    );
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-medium text-cyan-400/80 hover:text-cyan-300 hover:bg-slate-800/50 transition cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        {label}
        <svg className="h-3 w-3 opacity-60" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 z-50 min-w-[7rem] rounded-lg border border-slate-600/50 bg-slate-800 shadow-xl py-1">
            {availableModels.map((modelId) => {
              const isActive = modelId === current;
              return (
                <button
                  key={modelId}
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                    isActive
                      ? "text-cyan-400 bg-cyan-500/10 cursor-default"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 cursor-pointer"
                  }`}
                  disabled={isActive}
                  onClick={() => {
                    setOpen(false);
                    if (!isActive && bridge) {
                      setSwitchingTo(modelId);
                      bridge.switchModel(modelId);
                      // Auto-clear after reasonable startup time
                      setTimeout(() => setSwitchingTo(null), 8000);
                    }
                  }}
                >
                  {isActive ? (
                    <svg
                      className="h-3 w-3 shrink-0 text-cyan-400"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 8l3.5 3.5L13 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  {modelDisplayLabel(modelId)}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

const PERMISSION_MODES = [
  { id: "default", label: "Default" },
  { id: "acceptEdits", label: "Accept Edits" },
  { id: "bypassPermissions", label: "Bypass" },
  { id: "plan", label: "Plan Only" },
  { id: "auto", label: "Auto" },
] as const;

function PermissionModeSelector({ currentMode }: { currentMode?: string }) {
  const bridge = useContext(Claude2BridgeContext);
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const mode = currentMode ?? "default";
  const label = PERMISSION_MODES.find((m) => m.id === mode)?.label ?? mode;

  // Clear switching animation when mode changes
  useEffect(() => {
    if (switchingTo && switchingTo === currentMode) setSwitchingTo(null);
  }, [currentMode, switchingTo]);

  if (switchingTo) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.65rem] font-medium text-amber-400/80">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-400/40 border-t-amber-400" />
        {PERMISSION_MODES.find((m) => m.id === switchingTo)?.label ?? switchingTo}
      </div>
    );
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-medium text-violet-400/80 hover:text-violet-300 hover:bg-slate-800/50 transition cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        {label}
        <svg className="h-3 w-3 opacity-60" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 z-50 min-w-[7rem] rounded-lg border border-slate-600/50 bg-slate-800 shadow-xl py-1">
            {PERMISSION_MODES.map((pm) => {
              const isActive = pm.id === mode;
              return (
                <button
                  key={pm.id}
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                    isActive
                      ? "text-violet-400 bg-violet-500/10 cursor-default"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 cursor-pointer"
                  }`}
                  disabled={isActive}
                  onClick={() => {
                    setOpen(false);
                    if (!isActive && bridge) {
                      setSwitchingTo(pm.id);
                      bridge.switchPermissionMode(pm.id);
                    }
                  }}
                >
                  {isActive ? (
                    <svg
                      className="h-3 w-3 shrink-0 text-violet-400"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 8l3.5 3.5L13 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  {pm.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ComposerWithInterrupt({
  currentModel,
  currentResolved,
  availableModels,
  permissionMode,
}: {
  currentModel?: string;
  currentResolved?: string;
  availableModels: string[];
  permissionMode?: string;
}) {
  const composer = useComposerRuntime();
  const isRunning = useThread((s) => s.isRunning);
  const { t } = useT();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (!isRunning) composer.send();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <ComposerPrimitive.Input
          placeholder={t("claude2.inputPlaceholder")}
          className="min-h-[2.5rem] max-h-32 sm:min-h-[4.5rem] w-full resize-none rounded-xl border border-white/10 bg-[#141b28]/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-cyan-500/50 focus:bg-[#141b28]"
          rows={1}
          enterKeyHint="send"
          onKeyDown={handleKeyDown}
        />
        {isRunning ? (
          <div className="absolute inset-0 rounded-xl bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center">
            <button
              type="button"
              className="rounded-xl bg-slate-600 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-500 shadow-lg cursor-pointer"
              onClick={() => composer.cancel()}
            >
              {t("session.stop")}
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <ModelSelector
          currentModel={currentModel}
          currentResolved={currentResolved}
          availableModels={availableModels}
        />
        <PermissionModeSelector currentMode={permissionMode} />
      </div>
    </div>
  );
}

function CompactIndicator() {
  const compact = useContext(Claude2CompactContext);
  const { t } = useT();
  const status = compact?.status ?? "idle";

  if (status === "idle") return null;

  return (
    <div className="shrink-0 px-3 pb-1">
      <div
        className={`rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-2 ${
          status === "compacting"
            ? "bg-amber-500/10 text-amber-400/90"
            : status === "compacted"
              ? "bg-emerald-500/10 text-emerald-400/90"
              : status === "interrupted"
                ? "bg-slate-500/10 text-slate-400/90"
                : "bg-red-500/10 text-red-400/90"
        }`}
      >
        {status === "compacting" ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400/40 border-t-amber-400 shrink-0" />
            {t("claude2.compacting")}
          </>
        ) : status === "compacted" ? (
          <>
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 8l3.5 3.5L13 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("claude2.compacted")}
          </>
        ) : status === "interrupted" ? (
          <>
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="3"
                y="3"
                width="10"
                height="10"
                rx="1"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            {t("claude2.compactInterrupted")}
          </>
        ) : (
          <>
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path d="M8 5v4M8 11h0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t("claude2.compactError")}
          </>
        )}
      </div>
    </div>
  );
}

function ReasoningDisplay() {
  const { text } = useMessagePartReasoning();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-amber-500/10 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-amber-400/70 text-[0.6rem] shrink-0">{expanded ? "▾" : "▸"}</span>
        <span className="text-[0.7rem] font-medium text-amber-400/90">Thinking</span>
      </button>
      {expanded ? (
        <div className="border-t border-amber-500/20 px-3 py-2">
          <p className="text-xs text-amber-300/70 whitespace-pre-wrap leading-relaxed">{text}</p>
        </div>
      ) : null}
    </div>
  );
}
