import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AuiIf,
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  unstable_useSlashCommandAdapter,
  type Unstable_SlashCommand,
  useAuiState,
  useExternalStoreRuntime,
  useMessage,
  groupPartByType,
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
import { AttachmentBubble } from "../components/assistant-ui/attachment-bubble";
import { CollapsibleSection } from "../components/assistant-ui/collapsible-section";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createPortal } from "react-dom";
import {
  Claude2BridgeContext,
  useClaude2Session,
  type ApiErrorAttachment,
  type RetryInfo,
  type TaskInfo,
} from "./claude2-adapter";
import type { Claude2FileHistorySnapshot } from "@agents-remote/shared";

// ── Compact UI: TWO surfaces, NON-OVERLAPPING jobs ──────────────────
//
// A compaction shows up in the UI through two completely separate
// components. They were repeatedly confused during development, so the
// split is spelled out here once and referenced from both:
//
//   1. CompactIndicator — TRANSIENT banner above the composer. Shows ONLY
//      ephemeral states: "compacting" (spinner) / "interrupted" / "error".
//      Auto-dismisses. It has NO success state by design.
//
//   2. CompactDivider — PERMANENT inline divider in the message stream.
//      The single source of truth that "a compaction happened". Driven by
//      the compact_boundary record via normalizeChatStream/renderChatStream,
//      so it appears identically in BOTH live streaming and history load
//      (one path — the single-source-pipeline rule).
//
// Why the split: a successful compaction is a permanent fact about the
// conversation, so it lives in the durable message stream (the divider).
// The banner only communicates ephemeral state ("working on it" / "it
// failed"), which has no place in history. That is why there is NO
// "compacted" success status below — on success the banner clears to
// "idle" and the divider carries the record.
type CompactStatus = "idle" | "compacting" | "interrupted" | "error";

type CompactState = {
  status: CompactStatus;
  setCompacting: () => void;
  setInterrupted: () => void;
  setCompactError: () => void;
  // Success path: clear the banner. The divider records the success.
  reset: () => void;
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

function TaskPanel({
  collapsed,
  t,
  tasks,
  onToggle,
}: {
  collapsed: boolean;
  t: ReturnType<typeof useT>["t"];
  tasks: TaskInfo[];
  onToggle: () => void;
}) {
  // Sort: non-completed first, completed last; within the same group, by numeric task id ascending.
  const numericId = (id: string): number => {
    const n = Number(id);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const sorted = [...tasks].sort((a, b) => {
    const aDone = a.status === "completed" ? 1 : 0;
    const bDone = b.status === "completed" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return numericId(a.id) - numericId(b.id);
  });

  const runningTasks = sorted.filter((t) => t.status !== "completed");
  const doneCount = sorted.length - runningTasks.length;
  const visible = collapsed ? runningTasks : sorted;
  const totalHeight = Math.min(visible.length, collapsed ? 3 : 4) * 1.75;

  const renderRow = (task: TaskInfo) => {
    const title =
      task.subject ||
      task.description ||
      task.summary ||
      task.agentType ||
      task.workflowName ||
      t("claude2.taskFallback", { id: task.id.slice(0, 6) });
    const hasTooltip = !!task.description && task.subject;
    const meta = [task.agentType, task.workflowName].filter(Boolean);
    return (
      <div
        key={task.id}
        className="flex items-start gap-2 text-xs"
        title={hasTooltip ? task.description : undefined}
      >
        <span className="mt-0.5 shrink-0">
          {task.status === "running" ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-400/40 border-t-amber-400" />
          ) : task.status === "completed" ? (
            <svg
              className="h-3 w-3 text-emerald-400"
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
          ) : task.status === "error" ? (
            <svg
              className="h-3 w-3 text-red-400"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <span className="inline-block h-3 w-3 rounded-full border border-slate-500" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <span
            className={`block truncate ${task.status === "completed" ? "text-slate-400" : task.status === "error" ? "text-red-300" : "text-slate-200"}`}
          >
            <span className="text-slate-500">#{task.id}</span> {title}
          </span>
          {(task.text || meta.length > 0) && (
            <span className="block truncate text-[0.65rem] text-slate-500">
              {task.text}
              {task.text && meta.length > 0 ? " · " : ""}
              {meta.join(" · ")}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="shrink-0 border-t border-slate-700/80 px-3 py-2">
      <button
        className="mb-1 flex w-full items-center gap-1.5 text-left"
        onClick={onToggle}
        type="button"
      >
        <svg
          className={`h-3 w-3 shrink-0 text-slate-500 transition ${collapsed ? "" : "rotate-90"}`}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-xs font-medium text-slate-400">{t("claude2.tasks")}</span>
        <span className="text-[0.65rem] text-slate-600">
          {collapsed ? `${runningTasks.length}/${doneCount}` : tasks.length}
        </span>
      </button>
      <div
        className="flex flex-col gap-1 overflow-y-auto"
        style={{ maxHeight: `${totalHeight}rem` }}
      >
        {visible.map(renderRow)}
      </div>
    </div>
  );
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
  const availablePermissionModes = detail.data?.availablePermissionModes ?? [];
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

  const {
    storeAdapter,
    bridge,
    currentModel,
    resolvedModel,
    modelSwitchVersion,
    permissionMode,
    aiTitle,
    agentName,
    loading,
    tasks,
    slashCommands,
    skills,
    retryInfo,
  } = useClaude2Session(
    projectName,
    sessionId,
    detail.data?.session.model,
    detail.data?.session.permissionMode,
  );

  const [compactStatus, setCompactStatus] = useState<CompactStatus>("idle");
  const [tasksExpanded, setTasksExpanded] = useState(true);

  const compactState: CompactState = useMemo(
    () => ({
      status: compactStatus,
      setCompacting: () => setCompactStatus("compacting"),
      setInterrupted: () => setCompactStatus("interrupted"),
      setCompactError: () => setCompactStatus("error"),
      reset: () => setCompactStatus("idle"),
    }),
    [compactStatus],
  );

  // Auto-dismiss the transient banner. "interrupted"/"error" linger 4s so
  // the user can read them, then clear. ("compacted" is intentionally not a
  // status — success is shown by the permanent CompactDivider, not here.)
  useEffect(() => {
    if (compactStatus === "interrupted" || compactStatus === "error") {
      const timer = setTimeout(() => setCompactStatus("idle"), 4000);
      return () => clearTimeout(timer);
    }
  }, [compactStatus]);

  // Bridge from the WebSocket compact lifecycle to the TRANSIENT banner only.
  //   phase:"start"        → spinner ("compacting")
  //   phase:"end" + error  → "interrupted" / "error" (lingers, then clears)
  //   phase:"end" success  → clear the banner; the CompactDivider (driven by
  //                          the compact_boundary record in the message
  //                          stream) is what records the successful compaction.
  bridge.onCompact = (event) => {
    if (event.phase === "start") {
      setCompactStatus("compacting");
    } else if (event.error) {
      setCompactStatus(event.error === "interrupted" ? "interrupted" : "error");
    } else {
      setCompactStatus("idle");
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
                <VirtualizedThreadContent loading={loading} retryInfo={retryInfo} />

                <CompactIndicator />
                {tasks.length > 0 && (
                  <TaskPanel
                    collapsed={!tasksExpanded}
                    t={t}
                    tasks={tasks}
                    onToggle={() => setTasksExpanded((v) => !v)}
                  />
                )}
                <div className="shrink-0 border-t border-slate-700/80 px-3 py-2.5 sm:px-4">
                  <ComposerPrimitive.Unstable_TriggerPopoverRoot>
                    <ComposerPrimitive.Root>
                      <ComposerWithInterrupt
                        currentModel={currentModel}
                        currentResolved={resolvedModel ?? session?.model}
                        availableModels={availableModels}
                        modelSwitchVersion={modelSwitchVersion}
                        permissionMode={permissionMode}
                        availablePermissionModes={availablePermissionModes}
                        slashCommands={slashCommands}
                        skills={skills}
                        projectName={projectName}
                        sessionId={sessionId}
                        aiTitle={aiTitle}
                        agentName={agentName}
                      />
                    </ComposerPrimitive.Root>
                  </ComposerPrimitive.Unstable_TriggerPopoverRoot>
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
  const message = useMessage();
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <MessagePrimitive.Root className="flex justify-end pl-3 pr-3 py-1.5 sm:pl-5 sm:pr-5 group relative">
      <div className="flex items-end gap-0.5 self-end">
        <RawDebugTooltip custom={custom} />
      </div>
      <div
        className="max-w-[90%] rounded-2xl rounded-br-md bg-cyan-700/60 px-4 py-2.5 max-h-[55vh] overflow-y-auto cursor-zoom-in sm:cursor-default"
        onDoubleClick={() => setFullscreen(true)}
      >
        <MessagePrimitive.Parts />
        <SyntheticBodyView />
        <ApiErrorAttachments />
      </div>
      {fullscreen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex flex-col bg-slate-950"
              style={{
                paddingTop: "max(env(safe-area-inset-top, 0px), 1rem)",
                paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)",
                paddingLeft: "max(env(safe-area-inset-left, 0px), 1rem)",
                paddingRight: "max(env(safe-area-inset-right, 0px), 1rem)",
              }}
              onClick={() => setFullscreen(false)}
            >
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-[90%] rounded-2xl rounded-br-md bg-cyan-700/60 px-4 py-2.5 mx-auto">
                  <MessagePrimitive.Parts />
                  <SyntheticBodyView />
                  <ApiErrorAttachments />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <ActionBarPrimitive.Root className="absolute right-1 bottom-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
      className="text-sm text-slate-100 leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-1 [&_pre]:relative [&_pre]:bg-slate-950/80 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:pt-7 [&_pre]:mb-2 [&_pre]:overflow-x-auto [&_code]:bg-slate-900/60 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:text-[0.75rem] [&_pre_code]:leading-relaxed [&_a]:text-cyan-400 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 [&_hr]:border-slate-700 [&_hr]:my-3"
      components={{
        table: ({ children }) => (
          <div className="overflow-x-auto my-2 rounded-lg border border-slate-700/50">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-slate-600 px-2 py-1 text-left font-medium text-slate-300 bg-slate-800/50">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-slate-600 px-2 py-1 text-slate-300">{children}</td>
        ),
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
  const isEmpty =
    !message.content || (Array.isArray(message.content) && message.content.length === 0);
  const msgStatus = (message as { status?: { type?: string } }).status;
  const isStreaming = msgStatus?.type === "running";
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <MessagePrimitive.Root className="flex justify-start px-3 py-1.5 sm:px-5 group relative">
      <div
        className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-800/70 px-4 py-2.5 max-h-[55vh] overflow-y-auto cursor-zoom-in sm:cursor-default"
        onDoubleClick={() => setFullscreen(true)}
      >
        <AuiIf
          condition={(s) => s.message.content.length === 0 && s.message.status?.type === "running"}
        >
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:300ms]" />
          </div>
        </AuiIf>
        <AuiIf condition={(s) => s.message.content.length > 0}>
          <MessagePrimitive.GroupedParts
            groupBy={groupPartByType({ reasoning: ["group-reasoning"] })}
          >
            {({ part, children }) => {
              switch (part.type) {
                case "group-reasoning": {
                  return (
                    <ReasoningGroup running={part.status.type === "running"}>
                      {children}
                    </ReasoningGroup>
                  );
                }
                case "reasoning":
                  return <span className="whitespace-pre-wrap">{part.text}</span>;
                case "text":
                  return <MarkdownText />;
                case "tool-call": {
                  const CustomUI = getToolRenderer(part.toolName);
                  return CustomUI ? <CustomUI {...part} /> : <ToolFallback {...part} />;
                }
                default:
                  return null;
              }
            }}
          </MessagePrimitive.GroupedParts>
          {isStreaming ? (
            <div className="mt-2 flex items-center gap-1.5 py-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400/60 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400/60 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400/60 [animation-delay:300ms]" />
            </div>
          ) : null}
        </AuiIf>
        <SyntheticBodyView />
        <ApiErrorAttachments />
      </div>
      {fullscreen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex flex-col bg-slate-950"
              style={{
                paddingTop: "max(env(safe-area-inset-top, 0px), 1rem)",
                paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)",
                paddingLeft: "max(env(safe-area-inset-left, 0px), 1rem)",
                paddingRight: "max(env(safe-area-inset-right, 0px), 1rem)",
              }}
              onClick={() => setFullscreen(false)}
            >
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-800/70 px-4 py-2.5 mx-auto">
                  <AuiIf
                    condition={(s) =>
                      s.message.content.length === 0 && s.message.status?.type === "running"
                    }
                  >
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:300ms]" />
                    </div>
                  </AuiIf>
                  <AuiIf condition={(s) => s.message.content.length > 0}>
                    <MessagePrimitive.GroupedParts
                      groupBy={groupPartByType({ reasoning: ["group-reasoning"] })}
                    >
                      {({ part, children }) => {
                        switch (part.type) {
                          case "group-reasoning":
                            return (
                              <ReasoningGroup running={part.status.type === "running"}>
                                {children}
                              </ReasoningGroup>
                            );
                          case "reasoning":
                            return <span className="whitespace-pre-wrap">{part.text}</span>;
                          case "text":
                            return <MarkdownText />;
                          case "tool-call": {
                            const CustomUI = getToolRenderer(part.toolName);
                            return CustomUI ? <CustomUI {...part} /> : <ToolFallback {...part} />;
                          }
                          default:
                            return null;
                        }
                      }}
                    </MessagePrimitive.GroupedParts>
                    {isStreaming ? (
                      <div className="mt-2 flex items-center gap-1.5 py-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400/60 [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400/60 [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400/60 [animation-delay:300ms]" />
                      </div>
                    ) : null}
                  </AuiIf>
                  <SyntheticBodyView />
                  <ApiErrorAttachments />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <div className="flex items-end gap-0.5 self-end">
        <RawDebugTooltip custom={custom} />
      </div>
      <ActionBarPrimitive.Root className="absolute right-1 bottom-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isEmpty && !isStreaming ? (
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
        ) : null}
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function ReasoningGroup({ running, children }: { running: boolean; children: React.ReactNode }) {
  const message = useMessage();
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const estimatedTokens =
    typeof custom?.estimatedTokens === "number" ? custom.estimatedTokens : null;

  let label = "Thinking";
  if (running) {
    label = estimatedTokens != null ? `Thinking… (${estimatedTokens} tokens)` : "Thinking…";
  } else {
    label = estimatedTokens != null ? `Thinking (${estimatedTokens} tokens)` : "Thinking";
  }

  return (
    <CollapsibleSection
      className="my-1 text-amber-400/90"
      dividerClassName="border-amber-700/20"
      header={
        <>
          <svg
            className="h-3 w-3 shrink-0 text-amber-300/80"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 2a6 6 0 00-3.8 10.6c.5.4.8 1 .8 1.7v.7h6v-.7c0-.7.3-1.3.8-1.7A6 6 0 0012 2z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M9 18h6M10 21h4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          {running ? (
            <span className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-2 border-amber-400/40 border-t-amber-400" />
          ) : null}
          <span className="text-[0.7rem] font-medium">{label}</span>
        </>
      }
    >
      <div className="text-xs text-amber-300/70 whitespace-pre-wrap leading-relaxed">
        {children}
      </div>
    </CollapsibleSection>
  );
}

// ── Synthetic Body: rendered inside parent bubble when a child message has isSynthetic: true ──

function SyntheticBodyView() {
  const message = useMessage();
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const syntheticBody = custom?.syntheticBody as string | undefined;
  if (!syntheticBody) return null;

  return (
    <>
      <div className="border-t border-dashed border-slate-500/20 my-1.5" />
      <SyntheticBodyRow body={syntheticBody} />
    </>
  );
}

function SyntheticBodyRow({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = body.slice(0, 120).replace(/\n/g, " ");

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-1 py-0.5 text-left hover:bg-slate-500/5 rounded transition cursor-pointer min-w-0"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-slate-500 text-[0.55rem] shrink-0 leading-none">
          {expanded ? "▾" : "▸"}
        </span>
        <svg
          className="h-3 w-3 shrink-0 text-slate-400/70"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 9h8M8 13h8M8 17h5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[0.65rem] text-slate-400/80 truncate min-w-0">{preview}</span>
        <span className="text-[0.6rem] text-slate-400/50 ml-auto shrink-0 whitespace-nowrap">
          {!expanded ? " ▸" : null}
        </span>
      </button>
      {expanded && (
        <div className="ml-7 pl-2 border-l-2 border-slate-700/30">
          <pre className="text-[0.6rem] whitespace-pre-wrap break-all leading-relaxed text-slate-300/50 max-h-60 overflow-y-auto">
            {body}
          </pre>
        </div>
      )}
    </div>
  );
}

function ApiErrorAttachments() {
  const message = useMessage();
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const apiErrors = custom?.apiErrors as ApiErrorAttachment[] | undefined;
  if (!apiErrors || apiErrors.length === 0) return null;

  return (
    <>
      <div className="border-t border-dashed border-red-500/20 my-1.5" />
      {apiErrors.map((err, i) => (
        <ApiErrorRow key={i} attachment={err} />
      ))}
    </>
  );
}

function ApiErrorRow({ attachment }: { attachment: ApiErrorAttachment }) {
  const [expanded, setExpanded] = useState(false);
  const label = attachment.error ?? "error";
  const detail = attachment.text;
  const retry = extractRetryInfo(attachment);

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-1 py-0.5 text-left hover:bg-red-500/5 rounded transition cursor-pointer min-w-0"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-slate-500 text-[0.55rem] shrink-0 leading-none">
          {expanded ? "▾" : "▸"}
        </span>
        <svg
          className="h-3 w-3 shrink-0 text-red-400/70"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M12 8v4M12 16h.01"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[0.65rem] text-red-400/80 truncate min-w-0">{label}</span>
        <span className="text-[0.6rem] text-red-400/50 ml-auto shrink-0 whitespace-nowrap">
          {retry ? retry : null}
          {!expanded ? " ▸" : null}
        </span>
      </button>
      {expanded && (
        <div className="ml-7 pl-2 border-l-2 border-red-800/20">
          <pre className="text-[0.6rem] whitespace-pre-wrap break-all leading-relaxed text-red-300/50">
            {detail}
          </pre>
        </div>
      )}
    </div>
  );
}

function extractRetryInfo(err: ApiErrorAttachment): string | null {
  const raw = err.raw as Record<string, unknown> | undefined;
  if (!raw) return null;
  const attempt = raw.retryAttempt as number | undefined;
  const maxRetries = raw.maxRetries as number | undefined;
  const inMs = raw.retryInMs as number | undefined;
  if (attempt == null || maxRetries == null) return null;
  let s = `重试 ${attempt}/${maxRetries}`;
  if (inMs != null) s += `，${(inMs / 1000).toFixed(1)}s 后`;
  return s;
}

function RawDebugTooltip({
  custom,
  className,
}: {
  custom?: Record<string, unknown>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // _rawMessages is populated from normalizeChatStream's _rawSnapshots.
  // _raw is for legacy call sites (attachments, enrichBubbleMetadata).
  const rawMessages = custom?._rawMessages as unknown[] | undefined;
  const rawSingle = custom?._raw as unknown;
  const displayData =
    rawMessages && rawMessages.length > 0 ? rawMessages : rawSingle ? rawSingle : null;
  if (!displayData) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`rounded p-1.5 text-slate-500 hover:text-amber-400 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center ${className ?? ""}`}
        onClick={() => setOpen(!open)}
        aria-label="View raw message"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 5v0M8 7v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <RawDebugPopover
          text={JSON.stringify(displayData, null, 2)}
          anchor={btnRef.current}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function RawDebugPopover({
  text,
  anchor,
  onClose,
}: {
  text: string;
  anchor: HTMLButtonElement | null;
  onClose: () => void;
}) {
  const rect = anchor?.getBoundingClientRect();
  const maxW = Math.min(window.innerWidth * 0.9, 28 * 16);
  // Right-align to button, but clamp so panel stays in viewport
  const rightEdge = rect ? window.innerWidth - rect.right : 8;
  const left = Math.max(8, window.innerWidth - rightEdge - maxW);
  const style: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: Math.min(rect.bottom + 4, window.innerHeight - 520),
        left,
        zIndex: 50,
        maxWidth: maxW,
      }
    : { position: "fixed", bottom: 8, right: 8, zIndex: 50, maxWidth: maxW };

  // Portal to document.body because this popover renders inside a virtualizer
  // turn item that has transform:translateY(...). Per CSS spec, position:fixed
  // inside a transform ancestor positions relative to that ancestor, not the
  // viewport — so getBoundingClientRect() (viewport coords) and position:fixed
  // (transform-relative coords) would mismatch by thousands of pixels.
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={style}
        className="max-h-[min(80vh,48rem)] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-600/50 bg-slate-900 p-3 shadow-xl"
      >
        <pre className="text-[0.6rem] leading-relaxed text-slate-300 whitespace-pre-wrap break-all">
          {text}
        </pre>
      </div>
    </>,
    document.body,
  );
}

// ── SystemChatBubble: renders role:"system" messages (other types) ────
// Distinct from assistant (slate) and user (cyan) — uses amber tint.
// Detects known system-level types (file-history-snapshot) and renders a
// structured view; falls back to raw text for observation.
function SystemChatBubble() {
  const message = useMessage();
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const systemMessageType = custom?.systemMessageType as string | undefined;

  // Tool-card: standalone tool message rendered outside of assistant bubbles.
  // Metadata carries all tool-call props; we reconstruct ToolCallMessagePartProps.
  if (systemMessageType === "tool-card") {
    const toolName = (custom?.toolName as string) ?? "?";
    const CustomUI = getToolRenderer(toolName);
    const progress = custom?.progress as
      | {
          subagentType?: string;
          description: string;
          lastToolName?: string;
          usage: { total_tokens: number; tool_uses: number; duration_ms: number };
        }
      | undefined;
    const toolProps = {
      toolName,
      argsText: (custom?.argsText as string) ?? "{}",
      result: custom?.result as string | undefined,
      status: { type: "complete" as const },
      isError: custom?.isError === true,
      isOrphaned: custom?.isOrphaned === true,
      metadata: { skillContent: custom?.skillContent },
    } as Record<string, unknown>;
    const ToolUI = CustomUI ?? ToolFallback;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ToolUIAny = ToolUI as React.ComponentType<any>;
    const groupPos = (custom?.toolGroupPosition as string) ?? "solo";
    const indent = custom?.toolIndent !== false;
    const cardBorder: Record<string, string> = {
      solo: "rounded-lg border border-slate-700/60",
      first: "rounded-t-lg border-l border-r border-t border-slate-700/60",
      middle: "border-l border-r border-slate-700/60 border-t border-slate-700/50",
      last: "rounded-b-lg border-l border-r border-b border-slate-700/60 border-t border-slate-700/50",
    };
    const rootPy: Record<string, string> = {
      solo: "py-1.5",
      first: "pt-1.5 pb-0",
      middle: "py-0",
      last: "pt-0 pb-1.5",
    };
    const inner = (
      <div className={`${cardBorder[groupPos] ?? cardBorder.solo} bg-slate-800/40 overflow-hidden`}>
        <div className="px-3 py-2">
          <ToolUIAny {...toolProps} />
        </div>
        {progress ? (
          <div className="px-3 pb-2 flex items-center gap-2 text-xs border-t border-slate-700/50 pt-2 mx-3">
            {progress.subagentType ? (
              <span className="shrink-0 rounded bg-amber-600/30 px-1.5 py-0.5 text-[0.65rem] font-medium text-amber-300">
                {progress.subagentType}
              </span>
            ) : null}
            <span className="truncate text-slate-300">{progress.description}</span>
            <span className="shrink-0 text-slate-500 ml-auto tabular-nums">
              {progress.usage.tool_uses} tools ·{" "}
              {progress.usage.total_tokens >= 1000
                ? `${Math.round(progress.usage.total_tokens / 1000)}K`
                : progress.usage.total_tokens}{" "}
              tokens ·{" "}
              {progress.usage.duration_ms >= 10000
                ? `${Math.round(progress.usage.duration_ms / 1000)}s`
                : `${progress.usage.duration_ms}ms`}
            </span>
          </div>
        ) : null}
      </div>
    );
    return (
      <MessagePrimitive.Root
        className={`flex justify-start px-3 sm:px-5 group relative ${rootPy[groupPos] ?? rootPy.solo}`}
      >
        {indent ? (
          <div className="w-full border-l-2 border-slate-700/50 pl-3">{inner}</div>
        ) : (
          <div className="w-full">{inner}</div>
        )}
        <RawDebugTooltip custom={custom} className="absolute top-0 right-0" />
      </MessagePrimitive.Root>
    );
  }

  // Batch boundary divider: thin horizontal line, no bubble, no debug tooltip.
  if (systemMessageType === "batch-boundary") {
    return (
      <MessagePrimitive.Root className="flex w-full px-3 sm:px-5 py-1.5">
        <div className="w-full border-t border-slate-700/50" />
      </MessagePrimitive.Root>
    );
  }

  // Compact boundary divider: thin line + label showing compaction trigger & token count.
  if (systemMessageType === "compact-boundary") {
    const compactText = (custom?.compactText as string) ?? "";
    return (
      <MessagePrimitive.Root className="flex w-full items-center gap-2 px-3 sm:px-5 py-1.5">
        <div className="flex-1 border-t border-amber-700/30" />
        {compactText ? (
          <span className="shrink-0 text-[0.6rem] text-amber-400/60 font-medium">
            {compactText}
          </span>
        ) : null}
        <div className="flex-1 border-t border-amber-700/30" />
      </MessagePrimitive.Root>
    );
  }

  const attachmentType = custom?.attachmentType as string | undefined;
  const rawData = custom?._raw as Record<string, unknown> | undefined;
  const fileSnapshot =
    rawData && (rawData as { type?: string }).type === "file-history-snapshot"
      ? (rawData as Claude2FileHistorySnapshot)
      : null;
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <MessagePrimitive.Root className="flex justify-start px-3 py-1.5 sm:px-5 group">
      <div
        className="max-w-[90%] rounded-2xl rounded-bl-md bg-amber-800/30 px-4 py-2.5 overflow-hidden max-h-[55vh] overflow-y-auto cursor-zoom-in sm:cursor-default"
        onDoubleClick={() => setFullscreen(true)}
      >
        {attachmentType && rawData ? (
          <AttachmentBubble subtype={attachmentType} raw={rawData} />
        ) : fileSnapshot ? (
          <FileHistorySnapshotView snapshot={fileSnapshot} />
        ) : (
          <div className="text-xs text-amber-200/80 font-mono whitespace-pre-wrap break-all overflow-wrap-anywhere">
            <MessagePrimitive.Parts />
          </div>
        )}
        <SyntheticBodyView />
        <ApiErrorAttachments />
      </div>
      {fullscreen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex flex-col bg-slate-950"
              style={{
                paddingTop: "max(env(safe-area-inset-top, 0px), 1rem)",
                paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)",
                paddingLeft: "max(env(safe-area-inset-left, 0px), 1rem)",
                paddingRight: "max(env(safe-area-inset-right, 0px), 1rem)",
              }}
              onClick={() => setFullscreen(false)}
            >
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-amber-800/30 px-4 py-2.5 mx-auto overflow-hidden">
                  {attachmentType && rawData ? (
                    <AttachmentBubble subtype={attachmentType} raw={rawData} />
                  ) : fileSnapshot ? (
                    <FileHistorySnapshotView snapshot={fileSnapshot} />
                  ) : (
                    <div className="text-xs text-amber-200/80 font-mono whitespace-pre-wrap break-all overflow-wrap-anywhere">
                      <MessagePrimitive.Parts />
                    </div>
                  )}
                  <SyntheticBodyView />
                  <ApiErrorAttachments />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <div className="flex items-end gap-0.5 self-end">
        <RawDebugTooltip custom={custom} />
      </div>
    </MessagePrimitive.Root>
  );
}

// file-history-snapshot: CLI's internal file-tracking checkpoint.
// trackedFileBackups maps file path → { backupFileName, version, backupTime }.
function FileHistorySnapshotView({ snapshot }: { snapshot: Claude2FileHistorySnapshot }) {
  const backups = snapshot.snapshot?.trackedFileBackups ?? {};
  const entries = Object.entries(backups);
  const isUpdate = snapshot.isSnapshotUpdate === true;
  const ts = snapshot.snapshot?.timestamp;
  const timeStr = ts ? formatSnapshotTime(ts) : null;

  return (
    <CollapsibleSection
      className="min-w-[14rem] text-amber-200/90"
      dividerClassName="border-amber-700/20"
      header={
        <>
          <svg
            className="h-3 w-3 shrink-0 text-amber-300/80"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M12 7v5l3 2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[0.7rem] font-medium">文件历史快照</span>
          <span className="text-[0.6rem] text-amber-300/50">{entries.length} 个文件</span>
          <span
            className={`ml-auto rounded px-1.5 py-0.5 text-[0.55rem] font-semibold ${
              isUpdate ? "bg-amber-600/30 text-amber-200/80" : "bg-amber-700/30 text-amber-200/60"
            }`}
          >
            {isUpdate ? "增量" : "完整"}
          </span>
        </>
      }
    >
      {entries.length > 0 ? (
        <div className="max-h-40 space-y-0.5 overflow-y-auto">
          {entries.map(([path, info]) => {
            const version = typeof info?.version === "number" ? info.version : null;
            return (
              <div key={path} className="flex items-center gap-2 text-[0.65rem]">
                <span className="truncate text-amber-200/70 break-all" title={path}>
                  {path}
                </span>
                {version !== null ? (
                  <span className="ml-auto shrink-0 rounded bg-amber-700/30 px-1 py-0.5 text-[0.55rem] font-semibold text-amber-200/80">
                    v{version}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[0.65rem] text-amber-300/40">无追踪文件</p>
      )}
      {timeStr ? <p className="mt-1 text-[0.55rem] text-amber-300/40">{timeStr}</p> : null}
    </CollapsibleSection>
  );
}

function formatSnapshotTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Virtualization: turn builder ──────────────────────────────────
// Turn = a user message + all following non-user messages up to the
// next user message. Virtualizer operates on turns, not messages.

type Turn = { startIndex: number; endIndex: number; key: string };

function buildTurns(signature: string): Turn[] {
  const lines = signature.split("\n").filter(Boolean);
  if (lines.length === 0) return [];
  const turns: Turn[] = [];
  let currentTurnStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const role = lines[i].split(":")[1];
    if (role === "user" && i !== currentTurnStart) {
      turns.push({ startIndex: currentTurnStart, endIndex: i, key: `turn-${currentTurnStart}` });
      currentTurnStart = i;
    }
  }
  turns.push({
    startIndex: currentTurnStart,
    endIndex: lines.length,
    key: `turn-${currentTurnStart}`,
  });
  return turns;
}

// Module-level constant: stable reference for ThreadPrimitive.MessageByIndex memo.
const MESSAGE_COMPONENTS = {
  UserMessage: UserChatBubble,
  AssistantMessage: AssistantChatBubble,
  SystemMessage: SystemChatBubble,
} as const;

function VirtualizedThreadContent({
  loading,
  retryInfo,
}: {
  loading: boolean;
  retryInfo: RetryInfo | null;
}) {
  // ── Turn builder ──────────────────────────────────────────────────
  const messageSignature = useAuiState((s) =>
    s.thread.messages.map((m, i) => `${i}:${m.role}:${m.id}`).join("\n"),
  );
  const turns = useMemo(() => buildTurns(messageSignature), [messageSignature]);

  // ── Scroll container ──────────────────────────────────────────────
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Sticky-to-bottom ──────────────────────────────────────────────
  const stickyRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!el) return;
      const atBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) <= 1;
      stickyRef.current = atBottom;
      setShowScrollButton(!atBottom);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stickyRef.current = false;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Pin to bottom while sticky and content resizes.
  useEffect(() => {
    const wrapper = contentRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => {
      if (stickyRef.current && scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  // ── Virtualizer ───────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: turns.length,
    estimateSize: () => 200,
    getItemKey: (index: number) => turns[index]?.key ?? `turn-${index}`,
    getScrollElement: () => scrollerRef.current,
    overscan: 4,
    scrollToFn: (offset) => {
      if (!stickyRef.current) {
        scrollerRef.current?.scrollTo({ top: offset, behavior: "auto" });
      }
    },
  });

  // Initial jump to bottom.
  const didInitialJumpRef = useRef(false);
  useLayoutEffect(() => {
    if (didInitialJumpRef.current || turns.length === 0) return;
    didInitialJumpRef.current = true;
    stickyRef.current = true;
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "instant" as ScrollBehavior,
    });
  }, [turns.length]);

  // Jump to bottom when streaming starts.
  const prevIsRunningRef = useRef(false);
  useLayoutEffect(() => {
    if (isRunning && !prevIsRunningRef.current) {
      stickyRef.current = true;
      requestAnimationFrame(() => {
        scrollerRef.current?.scrollTo({
          top: scrollerRef.current.scrollHeight,
          behavior: "smooth" as ScrollBehavior,
        });
      });
    }
    prevIsRunningRef.current = isRunning;
  }, [isRunning]);

  const jumpToBottom = useCallback(() => {
    stickyRef.current = true;
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth" as ScrollBehavior,
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────
  const items = virtualizer.getVirtualItems();

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <div ref={scrollerRef} className="h-full overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-5">
        {loading ? <ChatSkeleton /> : null}
        <div ref={contentRef}>
          <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
            {items.map((virtualItem) => {
              const turn = turns[virtualItem.index];
              if (!turn) return null;
              return (
                <div
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  data-turn-message-ids={`${turn.startIndex}-${turn.endIndex - 1}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {Array.from({ length: turn.endIndex - turn.startIndex }, (_, offset) => (
                    <ThreadPrimitive.MessageByIndex
                      key={turn.startIndex + offset}
                      index={turn.startIndex + offset}
                      components={MESSAGE_COMPONENTS}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <RetryIndicator retryInfo={retryInfo} />
        <div className="h-4" />
      </div>
      {showScrollButton && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="Scroll to bottom"
          className="pointer-events-auto absolute bottom-4 right-3 z-10 rounded-full bg-slate-700/90 p-2 text-slate-300 shadow-lg transition-all duration-300 ease-out hover:bg-slate-600/90 hover:scale-110 cursor-pointer"
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
        </button>
      )}
    </div>
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

function ModelSelector({
  currentModel,
  currentResolved,
  availableModels,
  modelSwitchVersion,
}: {
  currentModel?: string;
  currentResolved?: string;
  availableModels: string[];
  modelSwitchVersion: number;
}) {
  const { t } = useT();
  const bridge = useContext(Claude2BridgeContext);
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const preSwitchResolvedRef = useRef<string | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);

  // Clear the spinner when the server confirms the switch:
  //   a) currentResolved changes from its pre-switch baseline (system.init
  //      from the new CLI process carries the resolved model name), OR
  //   b) modelSwitchVersion increments (switch_model_result {success:true}
  //      from backend — explicit confirmation that the new process started).
  //   c) modelSwitchVersion also covers failure: the adapter increments it
  //      on error too, so the spinner clears and the model reverts.
  const preSwitchVersionRef = useRef(modelSwitchVersion);
  useEffect(() => {
    if (!switchingTo) {
      preSwitchResolvedRef.current = undefined;
      preSwitchVersionRef.current = modelSwitchVersion;
      return;
    }
    if (preSwitchResolvedRef.current === undefined) {
      // First render after the switch was requested — capture the baseline.
      preSwitchResolvedRef.current = currentResolved;
      preSwitchVersionRef.current = modelSwitchVersion;
      return;
    }
    const resolvedChanged = currentResolved !== preSwitchResolvedRef.current;
    const versionChanged = modelSwitchVersion !== preSwitchVersionRef.current;
    if (resolvedChanged || versionChanged) {
      setSwitchingTo(null);
      preSwitchResolvedRef.current = undefined;
    }
  }, [currentResolved, switchingTo, modelSwitchVersion]);

  if (availableModels.length === 0) return null;

  const current = currentModel ?? availableModels[0];
  // Only show the resolved model name when it actually matches the current
  // tier. After a model switch, currentModel updates immediately but
  // currentResolved stays stale until the new CLI process emits system.init.
  // Without this check, the collapsed button shows the OLD model name while
  // the expanded dropdown checkmark tracks currentModel — two data sources,
  // two different answers.
  const resolvedMatchesTier = Boolean(
    currentResolved && currentModel && currentResolved.includes(currentModel),
  );
  const label = resolvedMatchesTier ? currentResolved : modelDisplayLabel(current);

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

const PERMISSION_MODE_LABELS: Record<string, string> = {
  default: "Default",
  acceptEdits: "Accept Edits",
  bypassPermissions: "Bypass",
  plan: "Plan Only",
  auto: "Auto",
  dontAsk: "Don't Ask",
};

function PermissionModeSelector({
  currentMode,
  availableModes,
}: {
  currentMode?: string;
  availableModes: string[];
}) {
  const bridge = useContext(Claude2BridgeContext);
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const modes =
    availableModes.length > 0
      ? availableModes
      : ["default", "acceptEdits", "bypassPermissions", "plan", "auto", "dontAsk"];

  const pending = currentMode === undefined;
  const mode = currentMode ?? "__pending__";
  const label = pending ? "..." : (PERMISSION_MODE_LABELS[mode] ?? mode);

  // Clear switching animation when mode changes
  useEffect(() => {
    if (switchingTo && switchingTo === currentMode) setSwitchingTo(null);
  }, [currentMode, switchingTo]);

  if (switchingTo) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.65rem] font-medium text-amber-400/80">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-400/40 border-t-amber-400" />
        {PERMISSION_MODE_LABELS[switchingTo] ?? switchingTo}
      </div>
    );
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-medium transition ${
          pending
            ? "text-slate-500 cursor-default"
            : "text-violet-400/80 hover:text-violet-300 hover:bg-slate-800/50 cursor-pointer"
        }`}
        disabled={pending}
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
            {modes.map((pmId) => {
              const isActive = pmId === mode;
              return (
                <button
                  key={pmId}
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
                      setSwitchingTo(pmId);
                      bridge.switchPermissionMode(pmId);
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
                  {PERMISSION_MODE_LABELS[pmId] ?? pmId}
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
  modelSwitchVersion,
  permissionMode,
  availablePermissionModes,
  slashCommands,
  skills,
  projectName,
  sessionId,
  aiTitle,
  agentName,
}: {
  currentModel?: string;
  currentResolved?: string;
  availableModels: string[];
  modelSwitchVersion: number;
  permissionMode?: string;
  availablePermissionModes: string[];
  slashCommands: string[];
  skills: string[];
  projectName: string;
  sessionId: string;
  aiTitle?: string | null;
  agentName?: string | null;
}) {
  const { t } = useT();

  const descQuery = useQuery({
    queryKey: ["projects", projectName, "agent-sessions", sessionId, "slash-command-descriptions"],
    queryFn: async () => {
      const { getSlashCommandDescriptions } = await import("../api/client");
      return getSlashCommandDescriptions(projectName, sessionId, slashCommands, skills);
    },
    enabled: slashCommands.length > 0 || skills.length > 0,
    staleTime: Infinity,
  });

  const kindById = useMemo(() => {
    const map = new Map<string, "command" | "skill">();
    for (const cmd of slashCommands) map.set(cmd.replace(/^\/+/, ""), "command");
    for (const skill of skills) map.set(skill.replace(/^\/+/, ""), "skill");
    return map;
  }, [slashCommands, skills]);

  const descMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const info of descQuery.data?.commands ?? []) {
      if (info.description) map.set(info.name, info.description);
    }
    return map;
  }, [descQuery.data]);

  const slashItems = useMemo<readonly Unstable_SlashCommand[]>(() => {
    const items: Unstable_SlashCommand[] = [];
    for (const cmd of slashCommands) {
      const id = cmd.replace(/^\/+/, "");
      items.push({ id, description: descMap.get(id) ?? "", execute: () => undefined });
    }
    for (const skill of skills) {
      const id = skill.replace(/^\/+/, "");
      items.push({ id, description: descMap.get(id) ?? "Skill", execute: () => undefined });
    }
    return items;
  }, [slashCommands, skills, descMap]);
  const slash = unstable_useSlashCommandAdapter({ commands: slashItems });

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <ComposerPrimitive.Input
          placeholder={t("claude2.inputPlaceholder")}
          className="min-h-[2.5rem] max-h-32 sm:min-h-[4.5rem] w-full resize-none rounded-xl border border-white/10 bg-[#141b28]/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-cyan-500/50 focus:bg-[#141b28]"
          rows={1}
          enterKeyHint="send"
        />
        <AuiIf condition={(s) => s.thread.isRunning}>
          <div className="absolute inset-0 rounded-xl bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center">
            <ComposerPrimitive.Cancel className="rounded-xl bg-slate-600 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-500 shadow-lg cursor-pointer">
              {t("session.stop")}
            </ComposerPrimitive.Cancel>
          </div>
        </AuiIf>
        {slashItems.length > 0 ? (
          <ComposerPrimitive.Unstable_TriggerPopover
            char="/"
            adapter={slash.adapter}
            className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-56 overflow-auto rounded-xl border border-white/10 bg-slate-950/95 p-1 shadow-2xl backdrop-blur"
          >
            <ComposerPrimitive.Unstable_TriggerPopover.Action {...slash.action} />
            <ComposerPrimitive.Unstable_TriggerPopoverItems>
              {(items) =>
                items.map((item, index) => {
                  const kind = kindById.get(item.id);
                  return (
                    <ComposerPrimitive.Unstable_TriggerPopoverItem
                      key={item.id}
                      item={item}
                      index={index}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-300 transition-colors duration-150 hover:bg-slate-800/80 hover:text-slate-100 data-[highlighted]:bg-slate-800/80 data-[highlighted]:text-slate-100"
                    >
                      {kind === "skill" ? (
                        <svg
                          className="h-3.5 w-3.5 shrink-0 text-amber-400/70"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path d="M9 1L3 9h4l-1 6 6-8H8l1-6z" fill="currentColor" />
                        </svg>
                      ) : (
                        <svg
                          className="h-3.5 w-3.5 shrink-0 text-cyan-400/70"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M5 3l6 5-6 5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      <span className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="shrink-0 font-medium">{item.label}</span>
                        {item.description ? (
                          <span className="truncate text-xs text-slate-500">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </ComposerPrimitive.Unstable_TriggerPopoverItem>
                  );
                })
              }
            </ComposerPrimitive.Unstable_TriggerPopoverItems>
          </ComposerPrimitive.Unstable_TriggerPopover>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <ModelSelector
          currentModel={currentModel}
          currentResolved={currentResolved}
          availableModels={availableModels}
          modelSwitchVersion={modelSwitchVersion}
        />
        <PermissionModeSelector
          currentMode={permissionMode}
          availableModes={availablePermissionModes}
        />
        {aiTitle ? (
          <span
            className="ml-auto max-w-[50%] select-none truncate rounded-md bg-amber-900/40 px-2 py-0.5 text-[0.65rem] text-amber-300/80 whitespace-nowrap"
            title={aiTitle}
          >
            {agentName ? (
              <span className="mr-1.5 text-[0.55rem] font-semibold text-amber-400/60">
                {agentName}
              </span>
            ) : null}
            {aiTitle}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RetryIndicator({ retryInfo }: { retryInfo: RetryInfo | null }) {
  const [countdown, setCountdown] = useState<number>(0);

  useEffect(() => {
    if (!retryInfo) {
      setCountdown(0);
      return;
    }
    const endTime = retryInfo.startTime + retryInfo.retryDelayMs;
    const tick = () => {
      const remaining = Math.max(0, endTime - Date.now());
      setCountdown(Math.ceil(remaining / 1000));
      if (remaining <= 0) setCountdown(0);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [retryInfo]);

  if (!retryInfo || countdown <= 0) return null;

  const errorText =
    retryInfo.error ?? (retryInfo.errorStatus ? `HTTP ${retryInfo.errorStatus}` : "error");
  return (
    <div className="shrink-0 flex justify-center px-3 py-1">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-[0.65rem] text-amber-400/70">
        <span className="h-2 w-2 shrink-0 animate-spin rounded-full border border-amber-400/40 border-t-amber-400" />
        {retryInfo.maxRetries > 1
          ? `Retry ${retryInfo.attempt}/${retryInfo.maxRetries}: ${errorText}, ${countdown}s`
          : `${errorText}, ${countdown}s`}
      </span>
    </div>
  );
}

// successful compaction is recorded permanently by CompactDivider in the
// message stream, not by this banner.
function CompactIndicator() {
  const compact = useContext(Claude2CompactContext);
  const { t } = useT();
  const status = compact?.status ?? "idle";

  // idle = nothing in progress; success also lands here (banner hidden, the
  // divider in the stream carries the record).
  if (status === "idle") return null;

  return (
    <div className="shrink-0 px-3 pb-1">
      <div
        className={`rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-2 ${
          status === "compacting"
            ? "bg-amber-500/10 text-amber-400/90"
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
