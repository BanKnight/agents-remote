import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  Fragment,
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
  useComposerRuntime,
  useExternalStoreRuntime,
  useMessage,
  groupPartByType,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import ReactMarkdown, { type Components } from "react-markdown";
import { closeAgentSession, getAgentSession } from "../api/client";
import { useT, type TranslationKey } from "../i18n";
import { formatDuration, formatTokenCount } from "../lib/utils";
import { useConfirm } from "../components/shell/confirm-dialog";
import { defaultConsoleSection, consoleSections } from "./console-model";
import { IconMarker, shellSurfaceClasses } from "../components/shell/shell-primitives";
import { ShellLayout, ShellSidebar } from "../components/shell/shell-layout";
import { ProjectShellNavigation } from "../components/shell/shell-navigation";
import { ShellIcon } from "../components/shell/icons";
import { getToolRenderer } from "../components/assistant-ui/tool-ui-registry";
import { ToolHead } from "../components/assistant-ui/tool-head";
import { AttachmentBubble } from "../components/assistant-ui/attachment-bubble";
import { CollapsibleSection } from "../components/assistant-ui/collapsible-section";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createPortal } from "react-dom";
import {
  Claude2BridgeContext,
  useClaude2Session,
  deriveStatus,
  mapTurnStatusTone,
  resolveAutoPermissionMode,
  type AgentContainerStatus,
  type AgentTailStats,
  type ApiErrorAttachment,
  type PermissionUpdate,
  type RetryInfo,
  type TaskInfo,
  type TurnStats,
  type TurnStatusTone,
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

// Permission modes the server CLI advertises (parsed from
// `claude --help --permission-mode`). ExitPlanMode approval reads this to
// decide whether "auto" mode is available (else fall back to acceptEdits).
const PermissionModesContext = createContext<readonly string[]>([]);

// Latest estimated_tokens of the in-flight response's thinking phase (null when
// not thinking). AssistantChatBubble reads this to show a live "Thinking… (N
// tokens)" indicator on assistant-ui's running placeholder before the thinking
// block arrives. Thread-level derived state; the placeholder's metadata is not
// ours to set, so it flows through context.
const LiveThinkingTokensContext = createContext<number | null>(null);

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
    liveThinkingTokens,
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
          <PermissionModesContext.Provider value={availablePermissionModes}>
            <LiveThinkingTokensContext.Provider value={liveThinkingTokens}>
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
            </LiveThinkingTokensContext.Provider>
          </PermissionModesContext.Provider>
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

// Shared fullscreen reader shell for chat bubbles and the plan card. Provides a
// fixed, safe-area-aware overlay portaled to document.body (escaping the
// virtualizer's transform ancestor), a header bar with a role-specific left
// side + an always-right close button, a scrollable body, and an optional
// pinned footer (ExitPlanMode uses it for the approve/reject tail). Esc closes.
function FullscreenReader({
  header,
  onClose,
  closeLabel,
  children,
  footer,
}: {
  header: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm"
      style={{
        paddingTop: "max(env(safe-area-inset-top, 0px), 0.75rem)",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.75rem)",
        paddingLeft: "max(env(safe-area-inset-left, 0px), 0.75rem)",
        paddingRight: "max(env(safe-area-inset-right, 0px), 0.75rem)",
      }}
    >
      <div className="flex items-center gap-2 rounded-t-lg border-b border-slate-700/60 bg-slate-800/60 px-3 py-2 sm:px-5">
        {header}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto cursor-pointer rounded p-2 text-slate-400 transition hover:bg-slate-700/60 hover:text-slate-100"
          aria-label={closeLabel}
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5">{children}</div>
      {footer}
    </div>,
    document.body,
  );
}

// Expand affordance icon reused by the bubble hover action bars.
function ExpandGlyph({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-3 w-3"} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 6V3.5A1.5 1.5 0 013.5 2H6M14 6V3.5A1.5 1.5 0 0012.5 2H10M2 10v2.5A1.5 1.5 0 003.5 14H6M14 10v2.5a1.5 1.5 0 01-1.5 1.5H10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserChatBubble() {
  const message = useMessage();
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const { t } = useT();
  const [fullscreen, setFullscreen] = useState(false);

  const renderBody = () => (
    <>
      <MessagePrimitive.Parts />
      <SyntheticBodyView />
      <ApiErrorAttachments />
    </>
  );

  return (
    <MessagePrimitive.Root className="flex justify-end pl-3 pr-3 py-1.5 sm:pl-5 sm:pr-5 group relative">
      <RawDebugTooltip custom={custom} className="self-end" />
      <div
        className="max-w-[90%] rounded-2xl rounded-br-md bg-cyan-700/60 px-4 py-2.5 max-h-[55vh] overflow-y-auto cursor-zoom-in sm:cursor-default self-start"
        onDoubleClick={() => setFullscreen(true)}
      >
        {renderBody()}
      </div>
      {fullscreen ? (
        <FullscreenReader
          header={
            <>
              <svg
                className="h-4 w-4 shrink-0 text-cyan-300"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M4 20a8 8 0 0116 0"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-xs font-medium text-slate-200">
                {t("claude2.message.roleUser")}
              </span>
            </>
          }
          onClose={() => setFullscreen(false)}
          closeLabel={t("claude2.message.exitFullscreen")}
        >
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl rounded-br-md bg-cyan-700/60 px-4 py-3">{renderBody()}</div>
          </div>
        </FullscreenReader>
      ) : null}
      <ActionBarPrimitive.Root className="absolute right-1 bottom-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="cursor-pointer rounded p-1 text-slate-400 transition hover:text-slate-200"
          aria-label={t("claude2.message.expand")}
        >
          <ExpandGlyph />
        </button>
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

// Shared markdown styling. MarkdownText renders assistant message parts via
// assistant-ui context; MarkdownString renders a raw markdown string (e.g. the
// Agent tool_result). Both reuse the same class + component overrides so Agent
// results stay visually consistent with the main message stream.
const MARKDOWN_CLASS =
  "text-sm text-slate-100 leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-1 [&_pre]:relative [&_pre]:bg-slate-950/80 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:pt-7 [&_pre]:mb-2 [&_pre]:overflow-x-auto [&_code]:bg-slate-900/60 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:text-[0.75rem] [&_pre_code]:leading-relaxed [&_a]:text-cyan-400 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 [&_hr]:border-slate-700 [&_hr]:my-3";

const MARKDOWN_COMPONENTS: Components = {
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
    const codeChild = (node as { children?: Array<{ properties?: { className?: string[] } }> })
      ?.children?.[0];
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
};

function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className={MARKDOWN_CLASS}
      components={MARKDOWN_COMPONENTS}
    />
  );
}

function MarkdownString({ text }: { text: string }) {
  return (
    <div className={MARKDOWN_CLASS}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

// tone → localized status word (shown first, colored) for the turn-end footer.
const TURN_STATUS_LABEL: Record<TurnStatusTone, TranslationKey> = {
  completed: "claude2.turnStatus.completed",
  interrupted: "claude2.turnStatus.interrupted",
  maxTurns: "claude2.turnStatus.maxTurns",
  error: "claude2.turnStatus.error",
  rateLimited: "claude2.turnStatus.rateLimited",
  hookStopped: "claude2.turnStatus.hookStopped",
  toolDeferred: "claude2.turnStatus.toolDeferred",
};

// tone → status-word color. Cost/tokens/duration stay muted slate.
const TURN_STATUS_COLOR: Record<TurnStatusTone, string> = {
  completed: "text-emerald-400",
  interrupted: "text-amber-400",
  maxTurns: "text-amber-400",
  error: "text-red-400",
  rateLimited: "text-amber-400",
  hookStopped: "text-amber-400",
  toolDeferred: "text-slate-400",
};

// Compact caption under the turn's final assistant bubble summarizing what the
// turn cost: [status word] · N turns · $cost · tokens↓/↑ · duration. Sourced
// from the `result` message's turnStats (live-only — result isn't in JSONL).
function TurnStatsFooter({ stats }: { stats: TurnStats }) {
  const { t } = useT();
  const tone = mapTurnStatusTone(stats.terminalReason, stats.subtype);

  const tailParts: string[] = [];
  if (typeof stats.numTurns === "number")
    tailParts.push(t("claude2.turn.turns", { count: stats.numTurns }));
  if (typeof stats.totalCostUsd === "number") tailParts.push(`$${stats.totalCostUsd.toFixed(2)}`);
  const tokenBits: string[] = [];
  if (typeof stats.inputTokens === "number")
    tokenBits.push(`${formatTokenCount(stats.inputTokens)}↓`);
  if (typeof stats.outputTokens === "number")
    tokenBits.push(`${formatTokenCount(stats.outputTokens)}↑`);
  if (tokenBits.length > 0) tailParts.push(tokenBits.join(" "));
  if (typeof stats.durationMs === "number") tailParts.push(formatDuration(stats.durationMs));

  if (!tone && tailParts.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.6rem] text-slate-500">
      {tone ? <span className={TURN_STATUS_COLOR[tone]}>{t(TURN_STATUS_LABEL[tone])}</span> : null}
      {tailParts.map((p, i) => (
        <Fragment key={i}>
          <span aria-hidden>·</span>
          <span>{p}</span>
        </Fragment>
      ))}
    </div>
  );
}

function AssistantChatBubble() {
  const message = useMessage();
  const isEmpty =
    !message.content || (Array.isArray(message.content) && message.content.length === 0);
  const msgStatus = (message as { status?: { type?: string } }).status;
  const isStreaming = msgStatus?.type === "running";
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const turnStats = custom?.turnStats as TurnStats | undefined;
  const { t } = useT();
  const [fullscreen, setFullscreen] = useState(false);
  const liveThinkingTokens = useContext(LiveThinkingTokensContext);

  const renderBody = () => (
    <>
      <AuiIf
        condition={(s) => s.message.content.length === 0 && s.message.status?.type === "running"}
      >
        {liveThinkingTokens != null ? (
          <div className="py-1 text-amber-400/90">
            <ToolHead
              icon="thinking"
              badge={t("claude2.thinking.title")}
              badgeClassName="bg-amber-500/20 text-amber-200"
              detail={`${formatTokenCount(liveThinkingTokens)} tokens`}
              status="running"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:300ms]" />
          </div>
        )}
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
                const ToolUI = getToolRenderer(part.toolName);
                return <ToolUI {...part} />;
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
      {turnStats ? <TurnStatsFooter stats={turnStats} /> : null}
    </>
  );

  return (
    <MessagePrimitive.Root className="flex justify-start px-3 py-1.5 sm:px-5 group relative">
      <div
        className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-800/70 px-4 py-2.5 max-h-[55vh] overflow-y-auto cursor-zoom-in sm:cursor-default self-start"
        onDoubleClick={() => setFullscreen(true)}
      >
        {renderBody()}
      </div>
      {fullscreen ? (
        <FullscreenReader
          header={
            <>
              <svg
                className="h-4 w-4 shrink-0 text-cyan-300"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-xs font-medium text-slate-200">
                {t("claude2.message.roleAssistant")}
              </span>
            </>
          }
          onClose={() => setFullscreen(false)}
          closeLabel={t("claude2.message.exitFullscreen")}
        >
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl rounded-bl-md bg-slate-800/70 px-4 py-3">
              {renderBody()}
            </div>
          </div>
        </FullscreenReader>
      ) : null}
      <RawDebugTooltip custom={custom} className="self-end" />
      <ActionBarPrimitive.Root className="absolute right-1 bottom-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isEmpty && !isStreaming ? (
          <>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="cursor-pointer rounded p-1 text-slate-400 transition hover:text-slate-200"
              aria-label={t("claude2.message.expand")}
            >
              <ExpandGlyph />
            </button>
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
          </>
        ) : null}
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function ReasoningGroup({ running, children }: { running: boolean; children: React.ReactNode }) {
  const { t } = useT();
  const message = useMessage();
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const estimatedTokens =
    typeof custom?.estimatedTokens === "number" ? custom.estimatedTokens : null;

  return (
    <CollapsibleSection
      className="my-1 text-amber-400/90"
      dividerClassName="border-amber-700/20"
      header={
        <ToolHead
          icon="thinking"
          badge={t("claude2.thinking.title")}
          badgeClassName="bg-amber-500/20 text-amber-200"
          detail={estimatedTokens != null ? `${formatTokenCount(estimatedTokens)} tokens` : null}
          status={running ? "running" : null}
        />
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
        className={`rounded p-2 text-slate-500 hover:text-amber-400 transition cursor-pointer ${className ?? ""}`}
        onClick={() => setOpen(!open)}
        aria-label="View raw message"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
  const panelMaxH = Math.min(window.innerHeight * 0.8, 768);
  // Prefer right-aligning the panel's right edge to the button. When the
  // button sits near the left edge (short bubbles like brown attachment
  // notices), right-aligning would clamp to the viewport left and leave the
  // panel detached far to the right of the button — so fall back to left-
  // aligning the panel to the button in that case.
  const btnRight = Math.min(rect?.right ?? window.innerWidth, window.innerWidth - 8);
  const btnLeft = Math.max(8, rect?.left ?? 8);
  const rightAlignedLeft = btnRight - maxW;
  const left = Math.max(
    8,
    Math.min(rightAlignedLeft >= 8 ? rightAlignedLeft : btnLeft, window.innerWidth - 8 - maxW),
  );

  // Position below button when there's room; flip above when not.
  let top = rect ? rect.bottom + 4 : undefined;
  if (top != null && top + panelMaxH > window.innerHeight) {
    // Not enough space below — position above the button instead
    top = Math.max(8, (rect?.top ?? 0) - panelMaxH - 4);
  }
  // Absolute fallback when even above doesn't fit
  if (top != null && top + panelMaxH > window.innerHeight) {
    top = Math.max(8, window.innerHeight - panelMaxH - 8);
  }

  const style: React.CSSProperties = rect
    ? {
        position: "fixed",
        top,
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
  const { t } = useT();
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
    const argsText = (custom?.argsText as string) ?? "{}";
    const controlRequestId = custom?.controlRequestId as string | undefined;
    const toolProps = {
      toolName,
      argsText,
      result: custom?.result as string | undefined,
      status:
        custom?.result != null || custom?.isError === true
          ? { type: "complete" as const }
          : { type: "running" as const },
      isError: custom?.isError === true,
      isInterrupted: custom?.isInterrupted === true,
      metadata: {
        skillContent: custom?.skillContent,
        controlRequestId,
      },
    } as Record<string, unknown>;
    const ToolUI = CustomUI;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ToolUIAny = ToolUI as React.ComponentType<any>;
    const groupPos = (custom?.toolGroupPosition as string) ?? "solo";
    const indent = custom?.toolIndent !== false;
    const needsPermission = typeof controlRequestId === "string" && controlRequestId.length > 0;
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
    const baseBorder = cardBorder[groupPos] ?? cardBorder.solo;
    const amberRing = needsPermission
      ? "ring-2 ring-amber-500/40 shadow-[0_0_16px_rgba(245,158,11,0.15)]"
      : "";
    const pulseClass = needsPermission ? "animate-pulse" : "";
    const inner = (
      <div className={`${baseBorder} ${amberRing} ${pulseClass} bg-slate-800/40 overflow-hidden`}>
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
              {progress.usage.tool_uses} tools · {formatTokenCount(progress.usage.total_tokens)}{" "}
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
        <RawDebugTooltip custom={custom} className="absolute -top-1 right-0.5" />
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

  const renderBody = () => (
    <>
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
    </>
  );

  return (
    <MessagePrimitive.Root className="flex justify-start px-3 py-1.5 sm:px-5 group">
      <div
        className="max-w-[90%] rounded-2xl rounded-bl-md bg-amber-800/30 px-4 py-2.5 overflow-x-hidden overflow-y-auto max-h-[55vh] cursor-zoom-in sm:cursor-default self-start"
        onDoubleClick={() => setFullscreen(true)}
      >
        {renderBody()}
      </div>
      {fullscreen ? (
        <FullscreenReader
          header={
            <>
              <svg
                className="h-4 w-4 shrink-0 text-amber-300"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-xs font-medium text-slate-200">
                {t("claude2.message.roleSystem")}
              </span>
            </>
          }
          onClose={() => setFullscreen(false)}
          closeLabel={t("claude2.message.exitFullscreen")}
        >
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl rounded-bl-md bg-amber-800/30 px-4 py-3 overflow-hidden">
              {renderBody()}
            </div>
          </div>
        </FullscreenReader>
      ) : null}
      <RawDebugTooltip custom={custom} className="self-end" />
    </MessagePrimitive.Root>
  );
}

// file-history-snapshot: CLI's internal file-tracking checkpoint.
// trackedFileBackups maps file path → { backupFileName, version, backupTime }.
function FileHistorySnapshotView({ snapshot }: { snapshot: Claude2FileHistorySnapshot }) {
  const { t } = useT();
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
        <ToolHead
          icon="history"
          badge={t("claude2.fileSnapshot.title")}
          badgeClassName="bg-amber-600/30 text-amber-200/80"
          detail={t("claude2.fileSnapshot.files", { count: entries.length })}
          trailing={
            <span
              className={`rounded px-1.5 py-0.5 text-[0.55rem] font-semibold ${
                isUpdate ? "bg-amber-600/30 text-amber-200/80" : "bg-amber-700/30 text-amber-200/60"
              }`}
            >
              {t(isUpdate ? "claude2.fileSnapshot.incremental" : "claude2.fileSnapshot.full")}
            </span>
          }
        />
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
        <p className="text-[0.65rem] text-amber-300/40">
          {t("claude2.fileSnapshot.noTrackedFiles")}
        </p>
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

// ── Agent container (head-body-tail) ──────────────────────────────────
// An Agent tool-call whose subagent streamed child messages (parent_tool_use_id)
// renders as a fixed-height container: HEAD bar (status) + BODY (real child
// messages via MessageByIndex, tree connector line, internal scroll) + TAIL
// bar (token usage + result). Status is derived purely from tail arrival +
// socket connection — no independent container state.

type AgentContainerCustom = {
  systemMessageType: "agent-container";
  toolName?: string;
  toolCallId?: string;
  subagentType?: string;
  description?: string;
  tailResult?: string;
  tailIsError?: boolean;
  tailStats?: AgentTailStats;
  tailContent?: string;
  isInterrupted?: boolean;
  progress?: {
    subagentType?: string;
    description: string;
    lastToolName?: string;
    usage: { total_tokens: number; tool_uses: number; duration_ms: number };
  };
  bodyIndices?: number[];
  tailRawMessages?: unknown[];
};

function AgentTailBar({
  status,
  progress,
  tailResult,
  tailIsError,
  tailStats,
  tailContent,
  tailRawMessages,
}: {
  status: AgentContainerStatus;
  progress: AgentContainerCustom["progress"];
  tailResult?: string;
  tailIsError?: boolean;
  tailStats?: AgentTailStats;
  tailContent?: string;
  tailRawMessages?: unknown[];
}) {
  const [resultOpen, setResultOpen] = useState(false);
  const showTail = status === "complete" || status === "error";
  const content = tailContent ?? tailResult;
  // Prefer final stats from the tool_use_result envelope (complete state);
  // fall back to live task_progress stats while running.
  const tools = tailStats?.totalToolUseCount ?? progress?.usage.tool_uses;
  const tokens = tailStats?.totalTokens ?? progress?.usage.total_tokens;
  const durationMs = tailStats?.totalDurationMs ?? progress?.usage.duration_ms;
  const hasStats = tools != null || tokens != null || durationMs != null;
  return (
    <div className="rounded-b-lg border-t border-slate-700/50 bg-slate-800/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2 pb-1.5 sm:px-5">
        {hasStats ? (
          <div className="flex flex-wrap gap-3 text-[0.65rem] text-slate-400">
            {tools != null ? <span>{tools} tools</span> : null}
            {tokens != null ? <span>{formatTokenCount(tokens)} tokens</span> : null}
            {durationMs != null ? <span>{Math.round(durationMs / 1000)}s</span> : null}
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {showTail && content ? (
            <button
              type="button"
              onClick={() => setResultOpen(!resultOpen)}
              className="cursor-pointer text-[0.65rem] text-slate-400 hover:text-slate-300"
            >
              {resultOpen ? "▾" : "▸"} {tailIsError ? "Error details" : "Final result"}
            </button>
          ) : null}
          {status === "error" && !content ? (
            <span className="text-xs text-red-300">Agent execution failed</span>
          ) : null}
          <RawDebugTooltip custom={{ _rawMessages: tailRawMessages }} />
        </div>
      </div>
      {resultOpen && content ? (
        <div className="max-h-48 overflow-y-auto px-3 pb-2 sm:px-5">
          <MarkdownString text={content} />
        </div>
      ) : null}
    </div>
  );
}

function AgentContainer({ headIndex }: { headIndex: number }) {
  const custom = useAuiState(
    (s) => (s.thread.messages[headIndex]?.metadata?.custom ?? {}) as AgentContainerCustom,
  );
  const status = deriveStatus({
    hasTail: custom.tailResult != null,
    isError: custom.tailIsError === true,
    isInterrupted: custom.isInterrupted === true,
  });
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const bodyIndices = custom.bodyIndices ?? [];
  const subagentType = custom.subagentType ?? "Agent";

  // While running, pin body to bottom unless the user scrolled up.
  useEffect(() => {
    if (status !== "running") return;
    const el = bodyRef.current;
    if (!el) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      stickRef.current = atBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [status]);

  // New body content while running + sticky → scroll to bottom.
  useEffect(() => {
    if (status === "running" && stickRef.current && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [status, bodyIndices.length]);

  return (
    <div className="my-1 rounded-lg border border-slate-700/60 bg-slate-800/30">
      <div className="flex items-center gap-2 rounded-t-lg bg-slate-800/60 px-3 pt-1.5 pb-2 sm:px-5">
        <ToolHead
          icon="agent"
          iconClassName="text-cyan-400"
          badge={subagentType}
          badgeClassName="bg-slate-700/60 text-slate-300"
          detail={custom.description ?? (status === "running" ? "Working..." : "Agent")}
          status={status === "complete" ? null : status}
          trailing={<RawDebugTooltip custom={custom} className="-mr-1" />}
        />
      </div>
      {bodyIndices.length > 0 ? (
        <div ref={bodyRef} className="max-h-96 overflow-y-auto">
          {bodyIndices.map((i) => (
            <MessageRouter key={i} index={i} renderAbsorbed />
          ))}
        </div>
      ) : null}
      <AgentTailBar
        status={status}
        progress={custom.progress}
        tailResult={custom.tailResult}
        tailIsError={custom.tailIsError}
        tailStats={custom.tailStats}
        tailContent={custom.tailContent}
        tailRawMessages={custom.tailRawMessages}
      />
    </div>
  );
}

type ExitPlanModeCustom = {
  systemMessageType: "exit-plan-mode";
  toolCallId?: string;
  plan?: string;
  planFilePath?: string;
  controlRequestId?: string;
  result?: string;
  isError?: boolean;
  isOrphaned?: boolean;
};

// Approving a plan exit chooses the permissionMode the session resumes in.
// Wire layer is always allow/deny. Approve carries the target mode via
// `permission_updates: [{type:"setMode", mode, destination:"session"}]`
// (the CLI ignores updatedInput.permissionMode). Reject carries feedback
// via deny.message. Modes mirror the CLI's plan-exit prompt: 自动模式 (auto,
// falling back to acceptEdits) / 手动模式 (default) / 告诉AI怎么修改 (feedback).
function ExitPlanModeCard({ headIndex }: { headIndex: number }) {
  const { t } = useT();
  const bridge = useContext(Claude2BridgeContext);
  const availableModes = useContext(PermissionModesContext);
  const autoMode = resolveAutoPermissionMode(availableModes);
  const custom = useAuiState(
    (s) => (s.thread.messages[headIndex]?.metadata?.custom ?? {}) as ExitPlanModeCustom,
  );
  const controlRequestId = custom.controlRequestId;
  const isOrphaned = custom.isOrphaned === true;
  const error = custom.isError === true;
  const complete = custom.result != null && !error;
  // Awaiting only while a control_request is open and no response landed yet.
  const awaiting = !!controlRequestId && custom.result == null && !isOrphaned && !error;
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [resultOpen, setResultOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Tracks the user's own approve/reject so the tail outcome pill can
  // distinguish a user reject from a genuine server error. Lost on resume
  // (component remount), where we fall back to the error label.
  const [outcome, setOutcome] = useState<"approved" | "rejected" | null>(null);
  const [approvedModeLabel, setApprovedModeLabel] = useState<string | null>(null);

  const plan = typeof custom.plan === "string" ? custom.plan : undefined;
  const planFilePath = typeof custom.planFilePath === "string" ? custom.planFilePath : undefined;
  const result = typeof custom.result === "string" ? custom.result : undefined;

  const onApprove = (mode: string) => {
    if (!controlRequestId) return;
    setOutcome("approved");
    setApprovedModeLabel(
      mode === "default" ? t("claude2.plan.modeManualShort") : t("claude2.plan.modeAutoShort"),
    );
    const permissionUpdates: PermissionUpdate[] = [
      { type: "setMode", mode, destination: "session" },
    ];
    bridge?.respondToControlRequest(controlRequestId, {}, permissionUpdates);
  };
  const onReject = () => {
    if (!controlRequestId) return;
    setOutcome("rejected");
    const trimmed = feedback.trim();
    bridge?.cancelControlRequest(controlRequestId, trimmed || undefined);
    setFeedback("");
    setFeedbackOpen(false);
  };

  const renderTail = () => (
    <div className="rounded-b-lg border-t border-slate-700/50 bg-slate-800/40">
      {awaiting ? (
        <div className="px-3 py-2 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onApprove(autoMode)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-400/50 bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-200 shadow-sm transition hover:border-emerald-400/70 hover:bg-emerald-500/30 active:bg-emerald-500/40"
            >
              ✓ {t("claude2.plan.modeAuto")}
            </button>
            <button
              type="button"
              onClick={() => onApprove("default")}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-400/30 px-3.5 py-1.5 text-xs font-semibold text-emerald-200/90 transition hover:border-emerald-400/50 hover:bg-emerald-500/15 active:bg-emerald-500/25"
            >
              ✓ {t("claude2.plan.modeManual")}
            </button>
            <button
              type="button"
              onClick={() => setFeedbackOpen(!feedbackOpen)}
              className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-600/60 px-3.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-700/50 active:bg-slate-700/70"
            >
              ✎ {t("claude2.plan.feedback")}
            </button>
          </div>
          {feedbackOpen ? (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onReject();
                  }
                }}
                placeholder={t("claude2.plan.feedbackPlaceholder")}
                rows={2}
                className="w-full resize-none rounded-md border border-slate-600/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-400/60 focus:outline-none"
              />
              <div className="flex items-center justify-end gap-2">
                <span className="text-[0.6rem] text-slate-500">
                  {t("claude2.plan.enterToSend")}
                </span>
                <button
                  type="button"
                  onClick={onReject}
                  className="cursor-pointer rounded-md bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/35 transition"
                >
                  {t("claude2.plan.send")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : error ? (
        <div className="px-3 py-2 sm:px-5">
          {outcome === "rejected" ? (
            <span className="text-xs font-medium text-amber-300">
              ⊘ {t("claude2.plan.rejected")}
            </span>
          ) : (
            <span className="text-xs text-red-300">{result ?? t("claude2.plan.error")}</span>
          )}
          {outcome === "rejected" && result ? (
            <div className="mt-1 text-[0.65rem] text-slate-400">{result}</div>
          ) : null}
        </div>
      ) : complete && result ? (
        <div className="px-3 pt-1.5 pb-1.5 sm:px-5">
          <span className="text-xs font-medium text-emerald-300">
            ✓ {t("claude2.plan.approved")}
            {approvedModeLabel ? ` · ${approvedModeLabel}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setResultOpen(!resultOpen)}
            className="ml-2 cursor-pointer text-[0.65rem] text-slate-400 hover:text-slate-300"
          >
            {resultOpen ? "▾" : "▸"} {t("claude2.plan.result")}
          </button>
          {resultOpen ? (
            <div className="mt-1 max-h-48 overflow-y-auto">
              <MarkdownString text={result} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-3 py-1.5 text-[0.65rem] text-slate-500 sm:px-5">
          {t("claude2.plan.orphaned")}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`my-1 rounded-lg border bg-slate-800/30 overflow-hidden ${
          awaiting ? "border-amber-500/40 plan-awaiting-flow" : "border-slate-700/60"
        }`}
      >
        <div className="flex items-center gap-2 rounded-t-lg bg-slate-800/60 px-3 pt-1.5 pb-2 sm:px-5">
          <ToolHead
            icon="plan"
            iconClassName="text-amber-300"
            badge={t("claude2.plan.title")}
            badgeClassName="bg-amber-500/20 text-amber-200"
            detail={planFilePath}
          />
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="cursor-pointer rounded p-2 text-slate-500 transition hover:bg-slate-700/50 hover:text-amber-400"
            aria-label={t("claude2.plan.expand")}
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 6V3.5A1.5 1.5 0 013.5 2H6M14 6V3.5A1.5 1.5 0 0012.5 2H10M2 10v2.5A1.5 1.5 0 003.5 14H6M14 10v2.5a1.5 1.5 0 01-1.5 1.5H10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <RawDebugTooltip custom={custom} className="-mr-1" />
        </div>
        {plan ? (
          <div className="max-h-80 overflow-y-auto px-3 py-2 sm:px-5">
            <MarkdownString text={plan} />
          </div>
        ) : null}
        {renderTail()}
      </div>
      {fullscreen ? (
        <FullscreenReader
          header={
            <>
              <ToolHead
                icon="plan"
                iconClassName="text-amber-300"
                badge={t("claude2.plan.title")}
                badgeClassName="bg-amber-500/20 text-amber-200"
                detail={planFilePath}
              />
              <span className="flex-1" />
            </>
          }
          onClose={() => setFullscreen(false)}
          closeLabel={t("claude2.plan.exitFullscreen")}
          footer={renderTail()}
        >
          <div className="mx-auto max-w-4xl">
            {plan ? (
              <MarkdownString text={plan} />
            ) : (
              <p className="py-8 text-center text-xs text-slate-500">
                {t("claude2.plan.orphaned")}
              </p>
            )}
          </div>
        </FullscreenReader>
      ) : null}
    </>
  );
}

type Question = {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options?: Array<{ label: string; description?: string }>;
};

type AskUserQuestionCustom = {
  systemMessageType: "ask-user-question";
  toolCallId?: string;
  questions?: Question[];
  args?: Record<string, unknown>;
  controlRequestId?: string;
  result?: string;
  isError?: boolean;
  isOrphaned?: boolean;
};

function AskUserQuestionCard({ headIndex }: { headIndex: number }) {
  const { t } = useT();
  const bridge = useContext(Claude2BridgeContext);
  const composer = useComposerRuntime();
  const custom = useAuiState(
    (s) => (s.thread.messages[headIndex]?.metadata?.custom ?? {}) as AskUserQuestionCustom,
  );
  const controlRequestId = custom.controlRequestId;
  const isOrphaned = custom.isOrphaned === true;
  const error = custom.isError === true;
  const complete = custom.result != null && !error;
  const awaiting = !!controlRequestId && custom.result == null && !isOrphaned && !error;
  const questions = (custom.questions as Question[]) ?? [];
  // User can answer while the question is running AND no result has landed yet.
  const hasQuestionResult = !!custom.result;
  const canAnswer = !hasQuestionResult && !isOrphaned && !error;
  const [expanded, setExpanded] = useState(!hasQuestionResult);
  const [resultOpen, setResultOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Tracks the user's own answer/skip so the tail outcome pill can distinguish
  // a user skip from a genuine server error. Lost on resume (component remount).
  const [outcome, setOutcome] = useState<"answered" | "skipped" | null>(null);

  // Auto-collapse when a result arrives (answer submitted).
  useEffect(() => {
    if (hasQuestionResult) setExpanded(false);
  }, [hasQuestionResult]);

  // Track selected options and free-text answers per question index.
  const [selections, setSelections] = useState<Record<number, Set<number>>>({});
  const [freeText, setFreeText] = useState<Record<number, string>>({});

  const toggleOption = (qIdx: number, optIdx: number, multi: boolean) => {
    if (!canAnswer) return;
    setSelections((prev) => {
      const current = new Set(prev[qIdx] ?? []);
      if (multi) {
        if (current.has(optIdx)) current.delete(optIdx);
        else current.add(optIdx);
      } else {
        current.clear();
        current.add(optIdx);
      }
      return { ...prev, [qIdx]: current };
    });
  };

  const handleSubmit = () => {
    if (!canAnswer) return;
    const answers: Record<string, string> = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const hasOptions = q.options && q.options.length > 0;
      if (hasOptions) {
        const sel = selections[i];
        if (!sel || sel.size === 0) continue;
        const selectedLabels = Array.from(sel)
          .map((idx) => q.options?.[idx]?.label ?? "")
          .filter(Boolean);
        if (selectedLabels.length > 0) answers[q.question] = selectedLabels.join(", ");
      } else {
        const text = freeText[i]?.trim();
        if (text) answers[q.question] = text;
      }
    }
    if (Object.keys(answers).length === 0) return;

    const args = custom.args ?? {};
    if (controlRequestId) {
      setOutcome("answered");
      bridge?.respondToControlRequest(controlRequestId, { ...args, answers });
    } else if (custom.toolCallId) {
      setOutcome("answered");
      bridge?.sendToolResult(custom.toolCallId, JSON.stringify(answers));
    } else {
      const answersText = Object.entries(answers)
        .map(([q, a]) => `${q}: ${a}`)
        .join("\n");
      composer.setText(answersText);
    }
  };

  const handleCancel = () => {
    if (!canAnswer) return;
    setOutcome("skipped");
    if (controlRequestId) {
      bridge?.cancelControlRequest(controlRequestId);
    } else if (custom.toolCallId) {
      bridge?.sendToolResult(custom.toolCallId, "Skipped");
    }
  };

  const hasAnySelection =
    Object.values(selections).some((s) => s.size > 0) ||
    Object.values(freeText).some((txt) => txt.trim().length > 0);

  const resultStr =
    typeof custom.result === "string"
      ? custom.result
      : custom.result != null
        ? JSON.stringify(custom.result, null, 2)
        : "";

  const renderTail = () => (
    <div className="rounded-b-lg border-t border-slate-700/50 bg-slate-800/40">
      {awaiting ? (
        <div className="px-3 py-2 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            {controlRequestId ? (
              <>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-amber-400/50 bg-amber-500/20 px-3.5 py-1.5 text-xs font-semibold text-amber-200 shadow-sm transition hover:border-amber-400/70 hover:bg-amber-500/30 active:bg-amber-500/40 disabled:opacity-30 disabled:cursor-default cursor-pointer"
                  disabled={!hasAnySelection}
                  onClick={handleSubmit}
                >
                  {t("claude2.ask.submit")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-600/50 px-3.5 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200 cursor-pointer"
                  onClick={handleCancel}
                >
                  {t("claude2.ask.skip")}
                </button>
              </>
            ) : custom.toolCallId ? (
              <>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-amber-400/50 bg-amber-500/20 px-3.5 py-1.5 text-xs font-semibold text-amber-200 shadow-sm transition hover:border-amber-400/70 hover:bg-amber-500/30 active:bg-amber-500/40 disabled:opacity-30 disabled:cursor-default cursor-pointer"
                  disabled={!hasAnySelection}
                  onClick={handleSubmit}
                >
                  {t("claude2.ask.submit")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-600/50 px-3.5 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200 cursor-pointer"
                  onClick={handleCancel}
                >
                  {t("claude2.ask.skip")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={`flex-1 rounded-md px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  hasAnySelection
                    ? "border border-amber-400/50 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                    : "border border-amber-400/20 bg-amber-500/10 text-amber-400/40 cursor-default"
                }`}
                disabled={!hasAnySelection}
                onClick={handleSubmit}
              >
                {t("claude2.ask.fillComposer")}
              </button>
            )}
          </div>
          <p className="mt-1 text-[0.55rem] text-amber-400/40 text-center">
            {t("claude2.ask.waitingHint")}
          </p>
        </div>
      ) : error ? (
        <div className="px-3 py-2 sm:px-5">
          {outcome === "skipped" ? (
            <span className="text-xs font-medium text-amber-300">⊘ {t("claude2.ask.skipped")}</span>
          ) : (
            <span className="text-xs text-red-300">{resultStr || t("claude2.ask.error")}</span>
          )}
        </div>
      ) : complete && resultStr ? (
        <div className="px-3 pt-1.5 pb-1.5 sm:px-5">
          <span className="text-xs font-medium text-emerald-300">
            ✓ {t("claude2.ask.statusAnswered")}
          </span>
          <button
            type="button"
            onClick={() => setResultOpen(!resultOpen)}
            className="ml-2 cursor-pointer text-[0.65rem] text-slate-400 hover:text-slate-300"
          >
            {resultOpen ? "▾" : "▸"} {t("claude2.ask.result")}
          </button>
          {resultOpen ? (
            <div className="mt-1 max-h-32 overflow-y-auto">
              <pre className="text-[0.65rem] text-amber-200/70 whitespace-pre-wrap break-all leading-relaxed">
                {resultStr}
              </pre>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-3 py-1.5 text-[0.65rem] text-slate-500 sm:px-5">
          {t("claude2.ask.orphaned")}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`my-1 rounded-lg border bg-slate-800/30 overflow-hidden ${
          awaiting ? "border-amber-500/40 plan-awaiting-flow" : "border-slate-700/60"
        }`}
      >
        <div className="flex items-center gap-2 rounded-t-lg bg-slate-800/60 px-3 pt-1.5 pb-2 sm:px-5">
          <ToolHead
            icon="question"
            iconClassName="text-amber-300"
            badge={t("claude2.ask.title")}
            badgeClassName="bg-amber-500/20 text-amber-200"
          />
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="cursor-pointer rounded p-2 text-slate-500 transition hover:bg-slate-700/50 hover:text-amber-400"
            aria-label={t("claude2.ask.expand")}
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 6V3.5A1.5 1.5 0 013.5 2H6M14 6V3.5A1.5 1.5 0 0012.5 2H10M2 10v2.5A1.5 1.5 0 003.5 14H6M14 10v2.5a1.5 1.5 0 01-1.5 1.5H10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <RawDebugTooltip custom={custom} className="-mr-1" />
        </div>
        {expanded ? (
          <div className="max-h-72 overflow-y-auto px-3 py-2 space-y-3">
            {questions.map((q, i) => {
              const multi = q.multiSelect === true;
              const selected = selections[i] ?? new Set<number>();
              const hasOptions = q.options && q.options.length > 0;
              return (
                <div
                  key={i}
                  className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-2.5"
                >
                  {q.header ? (
                    <p className="text-[0.6rem] font-semibold text-amber-300/80 uppercase tracking-wide mb-0.5">
                      {q.header}
                    </p>
                  ) : null}
                  <p className="text-[0.7rem] text-slate-200 leading-relaxed mb-2">
                    {q.question}
                    {multi ? (
                      <span className="text-[0.55rem] text-amber-400/60 ml-1">
                        {t("claude2.ask.multiSelect")}
                      </span>
                    ) : null}
                  </p>
                  {hasOptions ? (
                    <div className="space-y-1">
                      {q.options!.map((opt, j) => {
                        const isSelected = selected.has(j);
                        return (
                          <button
                            key={j}
                            type="button"
                            className={`flex items-center gap-2 text-[0.65rem] w-full text-left rounded-lg px-2 py-1.5 transition ${
                              isSelected
                                ? "bg-amber-500/20 text-amber-100 border border-amber-500/40"
                                : "hover:bg-slate-800/50 text-slate-400 border border-transparent"
                            } ${!canAnswer ? "opacity-40 cursor-default" : "cursor-pointer"}`}
                            disabled={!canAnswer}
                            onClick={() => toggleOption(i, j, multi)}
                          >
                            <span
                              className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[0.55rem] ${
                                isSelected
                                  ? "border-amber-400 bg-amber-400/30 text-amber-200"
                                  : "border-slate-500 text-slate-500"
                              }`}
                            >
                              {isSelected ? "✓" : j + 1}
                            </span>
                            <span className="flex-1">{opt.label}</span>
                            {opt.description ? (
                              <span className="text-[0.55rem] text-slate-500 text-right max-w-[40%]">
                                {opt.description}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-500/20 bg-slate-900/60 overflow-hidden">
                      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-amber-500/10">
                        <svg
                          className="h-3 w-3 text-amber-400/60"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M1 4l5 5-5 5"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="text-[0.55rem] text-amber-400/60">
                          {t("claude2.ask.typeOpinion")}
                        </span>
                      </div>
                      <textarea
                        className="w-full bg-transparent px-2 py-1.5 text-[0.65rem] text-slate-200 placeholder-slate-600 outline-none resize-none"
                        rows={2}
                        placeholder={t("claude2.ask.inputPlaceholder")}
                        disabled={!canAnswer}
                        value={freeText[i] ?? ""}
                        onChange={(e) => setFreeText((prev) => ({ ...prev, [i]: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
        {renderTail()}
      </div>
      {fullscreen ? (
        <FullscreenReader
          header={
            <>
              <ToolHead
                icon="question"
                iconClassName="text-amber-300"
                badge={t("claude2.ask.title")}
                badgeClassName="bg-amber-500/20 text-amber-200"
              />
              <span className="flex-1" />
            </>
          }
          onClose={() => setFullscreen(false)}
          closeLabel={t("claude2.ask.exitFullscreen")}
          footer={renderTail()}
        >
          <div className="mx-auto max-w-4xl space-y-3">
            {questions.length > 0 ? (
              questions.map((q, i) => {
                const multi = q.multiSelect === true;
                const selected = selections[i] ?? new Set<number>();
                const hasOptions = q.options && q.options.length > 0;
                return (
                  <div
                    key={i}
                    className="rounded-lg bg-slate-900/50 border border-slate-700/30 p-3"
                  >
                    {q.header ? (
                      <p className="text-[0.7rem] font-semibold text-amber-300/80 uppercase tracking-wide mb-1">
                        {q.header}
                      </p>
                    ) : null}
                    <p className="text-sm text-slate-200 leading-relaxed mb-3">
                      {q.question}
                      {multi ? (
                        <span className="text-xs text-amber-400/60 ml-1">
                          {t("claude2.ask.multiSelect")}
                        </span>
                      ) : null}
                    </p>
                    {hasOptions ? (
                      <div className="space-y-1.5">
                        {q.options!.map((opt, j) => {
                          const isSelected = selected.has(j);
                          return (
                            <button
                              key={j}
                              type="button"
                              className={`flex items-center gap-2 text-xs w-full text-left rounded-lg px-3 py-2 transition ${
                                isSelected
                                  ? "bg-amber-500/20 text-amber-100 border border-amber-500/40"
                                  : "hover:bg-slate-800/50 text-slate-400 border border-transparent"
                              } ${!canAnswer ? "opacity-40 cursor-default" : "cursor-pointer"}`}
                              disabled={!canAnswer}
                              onClick={() => toggleOption(i, j, multi)}
                            >
                              <span
                                className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                                  isSelected
                                    ? "border-amber-400 bg-amber-400/30 text-amber-200"
                                    : "border-slate-500 text-slate-500"
                                }`}
                              >
                                {isSelected ? "✓" : j + 1}
                              </span>
                              <span className="flex-1">{opt.label}</span>
                              {opt.description ? (
                                <span className="text-xs text-slate-500 text-right max-w-[40%]">
                                  {opt.description}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-500/20 bg-slate-900/60 overflow-hidden">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-amber-500/10">
                          <svg
                            className="h-3.5 w-3.5 text-amber-400/60"
                            viewBox="0 0 16 16"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M1 4l5 5-5 5"
                              stroke="currentColor"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span className="text-xs text-amber-400/60">
                            {t("claude2.ask.typeOpinion")}
                          </span>
                        </div>
                        <textarea
                          className="w-full bg-transparent px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none resize-none"
                          rows={3}
                          placeholder={t("claude2.ask.inputPlaceholder")}
                          disabled={!canAnswer}
                          value={freeText[i] ?? ""}
                          onChange={(e) =>
                            setFreeText((prev) => ({ ...prev, [i]: e.target.value }))
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-xs text-slate-500">{t("claude2.ask.orphaned")}</p>
            )}
          </div>
        </FullscreenReader>
      ) : null}
    </>
  );
}

function ModeChangeGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-3 w-3 shrink-0 text-amber-300"}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 7h10l-3-3M17 17H7l3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ModeChangeCustom = {
  systemMessageType: "mode-change";
  mode: string;
};

function ModeChangeNotice({ headIndex }: { headIndex: number }) {
  const { t } = useT();
  const custom = useAuiState(
    (s) => (s.thread.messages[headIndex]?.metadata?.custom ?? {}) as ModeChangeCustom,
  );
  const label = PERMISSION_MODE_LABELS[custom.mode] ?? custom.mode;
  return (
    <div className="flex w-full items-center gap-2 px-3 sm:px-5 py-1.5">
      <div className="flex-1 border-t border-amber-700/30" />
      <ModeChangeGlyph />
      <span className="shrink-0 whitespace-nowrap text-[0.6rem] font-medium text-amber-400/70">
        {t("claude2.mode.changed", { mode: label })}
      </span>
      <div className="flex-1 border-t border-amber-700/30" />
    </div>
  );
}

// Unified message router: top-level turn rendering and Agent body rendering
// both go through this. agent-container → recursive AgentContainer. At the
// top level (renderAbsorbed=false) absorbed children return null — they are
// rendered inside their parent AgentContainer, not in the top-level stream.
// Inside a body (renderAbsorbed=true) absorbed children ARE the body's own
// items, so they render normally.
function MessageRouter({
  index,
  renderAbsorbed = false,
}: {
  index: number;
  renderAbsorbed?: boolean;
}) {
  const custom = useAuiState(
    (s) => s.thread.messages[index]?.metadata?.custom as Record<string, unknown> | undefined,
  );
  if (custom?.systemMessageType === "agent-container") return <AgentContainer headIndex={index} />;
  if (custom?.systemMessageType === "exit-plan-mode") return <ExitPlanModeCard headIndex={index} />;
  if (custom?.systemMessageType === "ask-user-question")
    return <AskUserQuestionCard headIndex={index} />;
  if (custom?.systemMessageType === "mode-change") return <ModeChangeNotice headIndex={index} />;
  if (!renderAbsorbed && custom?.absorbed === true) return null;
  return <ThreadPrimitive.MessageByIndex index={index} components={MESSAGE_COMPONENTS} />;
}

function VirtualizedThreadContent({
  loading,
  retryInfo,
}: {
  loading: boolean;
  retryInfo: RetryInfo | null;
}) {
  // ── Turn builder ──────────────────────────────────────────────────
  // Absorbed Agent body children report a non-user role so they never split
  // a turn (they belong to their parent Agent's turn, rendered inside it).
  const messageSignature = useAuiState((s) =>
    s.thread.messages
      .map((m, i) => {
        const custom = (m.metadata?.custom ?? {}) as Record<string, unknown>;
        const role = custom.absorbed === true ? "assistant" : m.role;
        return `${i}:${role}:${m.id}`;
      })
      .join("\n"),
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
                    <MessageRouter
                      key={turn.startIndex + offset}
                      index={turn.startIndex + offset}
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
