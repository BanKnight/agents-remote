import { Link, useNavigate } from "@tanstack/react-router";
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
  unstable_useTriggerPopoverRootContextOptional,
  unstable_useTriggerPopoverScopeContext,
  type Unstable_DirectiveFormatter,
  type Unstable_SlashCommand,
  type Unstable_TriggerItem,
  useAui,
  useAuiState,
  useComposerRuntime,
  useExternalStoreRuntime,
  useMessage,
  groupPartByType,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { MarkdownString } from "../components/markdown/MarkdownString";
import { MarkdownText } from "../components/markdown/MarkdownText";
import { closeAgentSession, getAgentSession } from "../api/client";
import { useT, type TranslationKey } from "../i18n";
import { formatDuration, formatTokenCount } from "../lib/utils";
import { isDebugButtonEnabled, isPerfTraceEnabled } from "../lib/debug-flags";
import { useComposerKeyboardAvoidance } from "../lib/use-composer-keyboard-avoidance";
import { measureFrom, timed } from "../lib/perf-trace";
import { useAtom } from "jotai";
import { useConfirm } from "../components/shell/confirm-dialog";
import { consoleSections, tasksExpandedAtom } from "./console-model";
import { IconMarker, shellSurfaceClasses } from "../components/shell/shell-primitives";
import { ShellLayout, ShellSidebar } from "../components/shell/shell-layout";
import { ProjectShellNavigation } from "../components/shell/shell-navigation";
import { ShellIcon } from "../components/shell/icons";
import { getToolRenderer } from "../components/assistant-ui/tool-ui-registry";
import { ToolHead, ToolIcon } from "../components/assistant-ui/tool-head";
import { AttachmentBubble } from "../components/assistant-ui/attachment-bubble";
import { CompactBlock } from "../components/assistant-ui/compact-block";
import { HookCard } from "../components/assistant-ui/hook-card";
import { CollapsibleSection } from "../components/assistant-ui/collapsible-section";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createPortal } from "react-dom";
import {
  Claude2BridgeContext,
  useClaude2Session,
  deriveStatus,
  mapTurnStatusTone,
  resolveAutoPermissionMode,
  sortTasks,
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
// A compaction shows up in the UI through three separate components. They
// were repeatedly confused during development, so the split is spelled out
// here once and referenced from all:
//
//   1. CompactProgress — INLINE transient card at the stream's tail while a
//      compaction is in flight (status "compacting"). Spinner + current hook
//      stage (running → summarizing). Driven by onCompact via bridgeRef
//      (status:compacting / hook_response / compact_boundary). Live-only:
//      history has no "compacting" state, so it never appears on replay.
//
//   2. CompactIndicator — TRANSIENT banner above the composer. Now shows ONLY
//      failure states ("interrupted" / "error"), auto-dismissing. The
//      "compacting" state moved to the inline CompactProgress card.
//
//   3. CompactBlock — PERMANENT inline block in the message stream. The
//      single source of truth that "a compaction happened". Driven by the
//      compact_boundary record via normalizeChatStream/renderChatStream, so it
//      appears identically in BOTH live streaming and history load (one path
//      — the single-source-pipeline rule).
//
// Why the split: a successful compaction is a permanent fact about the
// conversation, so it lives in the durable message stream (the block). The
// progress card and banner only communicate ephemeral state ("working on
// it" / "it failed"), which has no place in history. That is why there is NO
// "compacted" success status below — on success the banner clears to "idle"
// and the block carries the record.
type CompactStatus = "idle" | "compacting" | "interrupted" | "error";

type CompactState = {
  status: CompactStatus;
  // Hook-driven progress stage while status === "compacting".
  stage: "running" | "summarizing" | null;
  // Reason the last compaction was aborted, captured live from the compact
  // lifecycle (compact_result:failed + interrupt flag). Null on replay (JSONL
  // records no reason). Read by CompactAbortBanner to label the abort.
  lastAbortReason: "manual" | "system" | null;
  setCompacting: () => void;
  setInterrupted: () => void;
  setCompactError: () => void;
  // Success path: clear the banner. The block records the success.
  reset: () => void;
};

const Claude2CompactContext = createContext<CompactState | null>(null);

// Synthetic tail message rendered as the inline CompactProgress card while a
// compaction is in flight. Appended to storeAdapter.messages only while
// compactStatus === "compacting"; removed once the compact_boundary lands.
const COMPACT_PROGRESS_MESSAGE = {
  role: "system",
  content: [{ type: "text", text: "" }],
  metadata: { custom: { systemMessageType: "compact-progress" } },
} as ThreadMessageLike;

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
  // Sort: non-completed first, completed last; within the same group, by numeric
  // task id ascending. Shared with the collapsed-header first-in-progress pick.
  const sorted = sortTasks(tasks);

  const runningTasks = sorted.filter((t) => t.status !== "completed");
  const doneCount = sorted.length - runningTasks.length;
  // First in-progress task, shown under the collapsed title bar. Undefined when
  // nothing is in_progress → the row is omitted. Same sort order as the list.
  const firstInProgress = sorted.find((t) => t.status === "in_progress");
  // Collapsed: body hidden, only the title bar (+ optional first in-progress)
  // shows. Expanded: full list, capped at 3 visible rows — the rest scrolls.
  // Row height is ~1.5rem (text-xs line + icon); 3 rows = 4.5rem. The earlier
  // 1.75rem/row estimate let a 4th row fit inside the maxHeight, defeating the cap.
  const TASK_ROW_REM = 1.5;
  const TASK_MAX_VISIBLE = 3;
  const visible = collapsed ? [] : sorted;
  const totalHeight = Math.min(visible.length, TASK_MAX_VISIBLE) * TASK_ROW_REM;

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
          {task.status === "in_progress" ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-assistant/40 border-t-assistant" />
          ) : task.status === "completed" ? (
            <svg
              className="h-3 w-3 text-success"
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
            <svg className="h-3 w-3 text-error" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ) : task.status === "pending" ? (
            <span className="inline-block h-3 w-3 rounded-full border border-dashed border-neutral-line" />
          ) : (
            <span className="inline-block h-3 w-3 rounded-full border border-neutral-line" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <span
            className={`block truncate ${task.status === "completed" ? "text-on-surface-muted" : task.status === "error" ? "text-error" : task.status === "pending" ? "text-on-surface-muted" : "text-on-surface-soft"}`}
          >
            <span className="text-on-surface-muted">#{task.id}</span> {title}
          </span>
          {(task.text || meta.length > 0) && (
            <span className="block truncate text-[0.65rem] text-on-surface-muted">
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
    <div className="mb-1.5 shrink-0 rounded-xl border border-on-surface/10 bg-surface-raised/60 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-xl backdrop-saturate-150 lg:bg-surface-raised/80 lg:shadow-none lg:backdrop-blur-none">
      <button
        className={`flex w-full cursor-pointer items-center gap-1.5 text-left ${collapsed ? "" : "mb-1"}`}
        onClick={onToggle}
        type="button"
      >
        <svg
          className={`h-3 w-3 shrink-0 text-on-surface-muted transition ${collapsed ? "" : "rotate-90"}`}
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
        <span className="text-xs font-medium text-on-surface-muted">{t("claude2.tasks")}</span>
        <span className="text-[0.65rem] text-on-surface-muted">
          {collapsed ? `${doneCount}/${sorted.length}` : sorted.length}
        </span>
        {collapsed && firstInProgress && (
          <>
            <span className="text-on-surface-muted">·</span>
            <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-assistant/40 border-t-assistant" />
            <span className="min-w-0 truncate text-xs text-on-surface-soft">
              <span className="text-on-surface-muted">#{firstInProgress.id}</span>{" "}
              {firstInProgress.subject ||
                firstInProgress.description ||
                firstInProgress.summary ||
                firstInProgress.agentType ||
                firstInProgress.workflowName ||
                t("claude2.taskFallback", { id: firstInProgress.id.slice(0, 6) })}
            </span>
          </>
        )}
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

export function Claude2Chat({
  projectName,
  sessionId,
  embedded = false,
  embeddedHeader = false,
}: {
  projectName: string;
  sessionId: string;
  /**
   * 嵌入模式（workbench 中栏用）：跳过 ShellLayout/sidebar，直接渲染面板主体，
   * 由 WorkbenchShell 提供外壳。默认 false（旧路由 Claude2SessionDetailRoute 用 ShellLayout）。
   */
  embedded?: boolean;
  /**
   * 省略面板自带 header（ChatHeader 整个不渲染）。桌面右工作区与移动端聚焦态都用：
   * header 由 GroupHeader（tab 栏 + ▢）/ MobileFocusHeader 承担，避免 title/projectName 双显
   * 冗余（设计 §11 对齐）。claude2 的 Files/Git 走中栏 tab，+Terminal 走左总览 CreateSessionBar，
   * Retry 走内容区 RetryIndicator，Close 由 tab ✕。默认 false（旧路由用）。
   */
  embeddedHeader?: boolean;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, holder } = useConfirm();

  useComposerKeyboardAvoidance();

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
        to: "/projects/$key",
        params: { key: projectName },
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
    retryInfo,
    pendingInteraction,
  } = useClaude2Session(
    projectName,
    sessionId,
    detail.data?.session.model,
    detail.data?.session.permissionMode,
  );

  const [compactStatus, setCompactStatus] = useState<CompactStatus>("idle");
  const [compactStage, setCompactStage] = useState<"running" | "summarizing" | null>(null);
  const [lastCompactAbortReason, setLastCompactAbortReason] = useState<"manual" | "system" | null>(
    null,
  );
  const [tasksExpanded, setTasksExpanded] = useAtom(tasksExpandedAtom);

  const compactState: CompactState = useMemo(
    () => ({
      status: compactStatus,
      stage: compactStage,
      lastAbortReason: lastCompactAbortReason,
      setCompacting: () => setCompactStatus("compacting"),
      setInterrupted: () => setCompactStatus("interrupted"),
      setCompactError: () => setCompactStatus("error"),
      reset: () => setCompactStatus("idle"),
    }),
    [compactStatus, compactStage, lastCompactAbortReason],
  );

  // Auto-dismiss the transient banner. "interrupted"/"error" linger 4s so
  // the user can read them, then clear. ("compacted" is intentionally not a
  // status — success is shown by the permanent CompactBlock, not here.)
  useEffect(() => {
    if (compactStatus === "interrupted" || compactStatus === "error") {
      const timer = setTimeout(() => setCompactStatus("idle"), 4000);
      return () => clearTimeout(timer);
    }
  }, [compactStatus]);

  // Bridge from the WebSocket compact lifecycle to the route's compact state.
  //   phase:"start"        → "compacting" + stage "running" → inline CompactProgress
  //                          card at the stream's tail (drives the progress UI).
  //   phase:"progress"     → stage "summarizing" (SessionStart:compact hook done).
  //   phase:"end" + error  → "interrupted"/"error" → CompactIndicator banner (4s).
  //   phase:"end" success  → reset; CompactBlock (compact_boundary) records it.
  bridge.onCompact = (event) => {
    if (event.phase === "start") {
      setCompactStatus("compacting");
      setCompactStage("running");
    } else if (event.phase === "progress") {
      setCompactStage("summarizing");
    } else if (event.error) {
      setCompactStatus(event.error === "interrupted" ? "interrupted" : "error");
      setLastCompactAbortReason(event.error === "interrupted" ? "manual" : "system");
      setCompactStage(null);
    } else {
      setCompactStatus("idle");
      setCompactStage(null);
    }
  };

  // While a compaction is in flight, append a synthetic tail message so the
  // CompactProgress card renders inline at the stream's end — same virtualizer
  // / auto-scroll pipeline as every other message (single-source pipeline).
  const storeAdapterWithCompact = useMemo(
    () =>
      compactStatus === "compacting"
        ? {
            ...storeAdapter,
            messages: [...(storeAdapter.messages ?? []), COMPACT_PROGRESS_MESSAGE],
          }
        : storeAdapter,
    [storeAdapter, compactStatus],
  );

  const runtime = useExternalStoreRuntime(storeAdapterWithCompact);

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

  const content = (
    <>
      {!embeddedHeader ? (
        <ChatHeader
          closePending={closeSession.isPending}
          embedded={embedded}
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
      ) : null}

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
                      <p className="rounded-xl bg-error/30 px-3 py-2 text-xs text-error">
                        {detail.error.message}
                      </p>
                    </div>
                  ) : null}
                  {closeSession.error instanceof Error ? (
                    <div className="shrink-0 px-3 py-2">
                      <p className="rounded-xl bg-error/30 px-3 py-2 text-xs text-error">
                        {closeSession.error.message}
                      </p>
                    </div>
                  ) : null}

                  <ThreadPrimitive.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    <VirtualizedThreadContent loading={loading} retryInfo={retryInfo} />

                    <CompactIndicator />
                    <div
                      data-composer-float
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+var(--composer-gap,0.5rem))] lg:static lg:z-auto lg:px-4 lg:py-2.5 lg:pb-2.5"
                    >
                      <div
                        className="pointer-events-auto mx-auto w-full max-w-2xl transition-transform duration-200 ease-out lg:transition-none"
                        style={{
                          transform: "translateY(calc(-1 * var(--composer-keyboard-offset, 0px)))",
                        }}
                      >
                        {tasks.length > 0 && (
                          <TaskPanel
                            collapsed={!tasksExpanded}
                            t={t}
                            tasks={tasks}
                            onToggle={() => setTasksExpanded((v) => !v)}
                          />
                        )}
                        <ComposerPrimitive.Unstable_TriggerPopoverRoot>
                          <ComposerPrimitive.Root>
                            <ComposerWithInterrupt
                              currentModel={currentModel}
                              currentResolved={resolvedModel ?? session?.model}
                              availableModels={availableModels}
                              modelSwitchVersion={modelSwitchVersion}
                              permissionMode={permissionMode}
                              availablePermissionModes={availablePermissionModes}
                              projectName={projectName}
                              sessionId={sessionId}
                              aiTitle={aiTitle}
                              agentName={agentName}
                              compactStatus={compactStatus}
                              pendingInteraction={pendingInteraction}
                              onCancel={storeAdapter.onCancel}
                            />
                          </ComposerPrimitive.Root>
                        </ComposerPrimitive.Unstable_TriggerPopoverRoot>
                      </div>
                    </div>
                  </ThreadPrimitive.Root>
                </div>
              </Claude2CompactContext.Provider>
            </LiveThinkingTokensContext.Provider>
          </PermissionModesContext.Provider>
        </Claude2BridgeContext.Provider>
      </AssistantRuntimeProvider>
      {holder}
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <ShellLayout
      sidebar={
        <ShellSidebar display="flex">
          <ProjectShellNavigation
            activeItemId="agents"
            items={projectNavItems}
            projectPath={projectName}
            projectTitle={projectName}
            onSelectItem={() => {
              void navigate({
                to: "/projects/$key",
                params: { key: projectName },
              });
            }}
          />
        </ShellSidebar>
      }
      variant="project"
    >
      {content}
    </ShellLayout>
  );
}

type ChatHeaderProps = {
  closePending: boolean;
  projectName: string;
  title: string;
  onClose: () => void;
  /**
   * 嵌入模式（workbench split 中栏）：隐藏自带 back 链接 + close 按钮 ——
   * split 内无「返回」语义（工作台常驻），close 由 SplitPanel 工具条承载（Stage 4 ②），
   * 避免双 close。默认 false（旧路由独立渲染时保留 back + close）。
   */
  embedded?: boolean;
};

function ChatHeader({
  closePending,
  projectName,
  title,
  onClose,
  embedded = false,
}: ChatHeaderProps) {
  const { t } = useT();

  return (
    <header
      className={`relative min-w-0 px-3 py-2.5 sm:px-4 sm:py-3 ${shellSurfaceClasses.runtimeHeader}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {!embedded && (
          <Link
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-on-surface-muted transition hover:text-on-surface-soft"
            aria-label={t("session.backToProject")}
            params={{ key: projectName }}
            to="/projects/$key"
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
        <div className={`min-w-0 flex-1 text-center ${embedded ? "text-left" : ""}`}>
          <p className="truncate text-xs font-semibold text-on-surface">{title}</p>
          <p className="truncate text-[0.65rem] leading-4 text-on-surface-muted">{projectName}</p>
        </div>
        {!embedded && (
          <button
            type="button"
            disabled={closePending}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-on-surface-muted transition hover:text-error disabled:opacity-40"
            onClick={onClose}
            aria-label={t("session.close")}
          >
            <ShellIcon name="close" className="h-4 w-4" />
            <span className="hidden sm:inline">
              {closePending ? t("session.closing") : t("session.close")}
            </span>
          </button>
        )}
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
      className="fixed inset-0 z-[100] flex flex-col bg-surface-inset/95 backdrop-blur-sm"
      style={{
        paddingTop: "max(env(safe-area-inset-top, 0px), 0.75rem)",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.75rem)",
        paddingLeft: "max(env(safe-area-inset-left, 0px), 0.75rem)",
        paddingRight: "max(env(safe-area-inset-right, 0px), 0.75rem)",
      }}
    >
      <div className="flex items-center gap-2 rounded-t-lg border-b border-neutral-line/60 bg-surface-raised/60 px-3 py-2 sm:px-5">
        {header}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto cursor-pointer rounded p-2 text-on-surface-muted transition hover:bg-neutral-line/60 hover:text-on-surface"
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
        className="max-w-[90%] rounded-2xl rounded-br-md bg-user-deep/60 px-4 py-2.5 max-h-[55vh] overflow-y-auto cursor-zoom-in sm:cursor-default self-start"
        onDoubleClick={() => setFullscreen(true)}
      >
        {renderBody()}
      </div>
      {fullscreen ? (
        <FullscreenReader
          header={
            <>
              <svg
                className="h-4 w-4 shrink-0 text-user-soft"
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
              <span className="text-xs font-medium text-on-surface-soft">
                {t("claude2.message.roleUser")}
              </span>
            </>
          }
          onClose={() => setFullscreen(false)}
          closeLabel={t("claude2.message.exitFullscreen")}
        >
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl rounded-br-md bg-user-deep/60 px-4 py-3">
              {renderBody()}
            </div>
          </div>
        </FullscreenReader>
      ) : null}
      <ActionBarPrimitive.Root className="absolute right-1 bottom-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="cursor-pointer rounded p-1 text-on-surface-muted transition hover:text-on-surface-soft"
          aria-label={t("claude2.message.expand")}
        >
          <ExpandGlyph />
        </button>
        <ActionBarPrimitive.Copy className="rounded p-1 text-on-surface-muted hover:text-on-surface-soft transition">
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

// Renders a selected AskUserQuestion option's `preview` markdown (often a code
// block or table) inline beneath the option, accordion-style. max-h + overflow
// keep long previews from blowing up the card. The caller passes indentation /
// padding / max-h via className (inline card vs fullscreen reader).
function OptionPreview({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-neutral-line/40 bg-surface-inset/40 overflow-y-auto ${className ?? ""}`}
    >
      <MarkdownString text={text} />
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
  completed: "text-success",
  interrupted: "text-warning",
  maxTurns: "text-warning",
  error: "text-error",
  rateLimited: "text-warning",
  hookStopped: "text-warning",
  toolDeferred: "text-on-surface-muted",
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
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.6rem] text-on-surface-muted">
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
          <div className="flex items-center gap-2 py-1 text-assistant/90">
            <ToolHead
              icon="thinking"
              badge={t("claude2.thinking.title")}
              badgeClassName="bg-assistant/20 text-assistant-soft"
              detail={`${formatTokenCount(liveThinkingTokens)} tokens`}
              status="running"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-user [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-user [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-user [animation-delay:300ms]" />
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
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-user/60 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-user/60 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-user/60 [animation-delay:300ms]" />
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
        className="max-w-[90%] rounded-2xl rounded-bl-md bg-surface-raised/70 px-4 py-2.5 max-h-[55vh] overflow-y-auto cursor-zoom-in sm:cursor-default self-start"
        onDoubleClick={() => setFullscreen(true)}
      >
        {renderBody()}
      </div>
      {fullscreen ? (
        <FullscreenReader
          header={
            <>
              <svg
                className="h-4 w-4 shrink-0 text-user-soft"
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
              <span className="text-xs font-medium text-on-surface-soft">
                {t("claude2.message.roleAssistant")}
              </span>
            </>
          }
          onClose={() => setFullscreen(false)}
          closeLabel={t("claude2.message.exitFullscreen")}
        >
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl rounded-bl-md bg-surface-raised/70 px-4 py-3">
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
              className="cursor-pointer rounded p-1 text-on-surface-muted transition hover:text-on-surface-soft"
              aria-label={t("claude2.message.expand")}
            >
              <ExpandGlyph />
            </button>
            <ActionBarPrimitive.Copy className="rounded p-1 text-on-surface-muted hover:text-on-surface-soft transition">
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
      className="my-1 text-assistant/90"
      dividerClassName="border-assistant-deep/20"
      header={
        <ToolHead
          icon="thinking"
          badge={t("claude2.thinking.title")}
          badgeClassName="bg-assistant/20 text-assistant-soft"
          detail={estimatedTokens != null ? `${formatTokenCount(estimatedTokens)} tokens` : null}
          status={running ? "running" : null}
        />
      }
    >
      <div className="text-xs text-assistant-soft/70 whitespace-pre-wrap leading-relaxed">
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
      <div className="border-t border-dashed border-neutral-line/20 my-1.5" />
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
        className="flex w-full items-center gap-1.5 px-1 py-0.5 text-left hover:bg-neutral-line/5 rounded transition cursor-pointer min-w-0"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-on-surface-muted text-[0.55rem] shrink-0 leading-none">
          {expanded ? "▾" : "▸"}
        </span>
        <svg
          className="h-3 w-3 shrink-0 text-on-surface-muted/70"
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
        <span className="text-[0.65rem] text-on-surface-muted/80 truncate min-w-0">{preview}</span>
        <span className="text-[0.6rem] text-on-surface-muted/50 ml-auto shrink-0 whitespace-nowrap">
          {!expanded ? " ▸" : null}
        </span>
      </button>
      {expanded && (
        <div className="ml-7 pl-2 border-l-2 border-neutral-line/30">
          <pre className="text-[0.6rem] whitespace-pre-wrap break-all leading-relaxed text-on-surface-soft/50 max-h-60 overflow-y-auto">
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
      <div className="border-t border-dashed border-error/20 my-1.5" />
      {apiErrors.map((err, i) => (
        <ApiErrorRow key={i} attachment={err} />
      ))}
    </>
  );
}

function ApiErrorRow({ attachment }: { attachment: ApiErrorAttachment }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const label = attachment.error ?? "error";
  const detail = attachment.text;
  const retry = extractRetryInfo(attachment);

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-1 py-0.5 text-left hover:bg-error/5 rounded transition cursor-pointer min-w-0"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-on-surface-muted text-[0.55rem] shrink-0 leading-none">
          {expanded ? "▾" : "▸"}
        </span>
        <svg
          className="h-3 w-3 shrink-0 text-error/70"
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
        <span className="text-[0.65rem] text-error/80 truncate min-w-0">{label}</span>
        <span className="text-[0.6rem] text-error/50 ml-auto shrink-0 whitespace-nowrap">
          {retry
            ? retry.seconds
              ? t("claude2.retry.attemptSeconds", {
                  attempt: retry.attempt,
                  max: retry.max,
                  seconds: retry.seconds,
                })
              : t("claude2.retry.attempt", { attempt: retry.attempt, max: retry.max })
            : null}
          {!expanded ? " ▸" : null}
        </span>
      </button>
      {expanded && (
        <div className="ml-7 pl-2 border-l-2 border-error/20">
          <pre className="text-[0.6rem] whitespace-pre-wrap break-all leading-relaxed text-error/50">
            {detail}
          </pre>
        </div>
      )}
    </div>
  );
}

function extractRetryInfo(
  err: ApiErrorAttachment,
): { attempt: number; max: number; seconds?: string } | null {
  const raw = err.raw as Record<string, unknown> | undefined;
  if (!raw) return null;
  const attempt = raw.retryAttempt as number | undefined;
  const maxRetries = raw.maxRetries as number | undefined;
  const inMs = raw.retryInMs as number | undefined;
  if (attempt == null || maxRetries == null) return null;
  return {
    attempt,
    max: maxRetries,
    seconds: inMs != null ? (inMs / 1000).toFixed(1) : undefined,
  };
}

function RawDebugTooltip({
  custom,
  className,
  compact = false,
}: {
  custom?: Record<string, unknown>;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // The (i) raw-message tooltip is gated behind a runtime switch (default ON).
  // Flip via __arDebug.debugButton(false) in the console, then reload.
  if (!isDebugButtonEnabled()) return null;
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
        className={`rounded ${compact ? "p-0.5" : "p-2"} text-on-surface-muted hover:text-assistant transition cursor-pointer ${className ?? ""}`}
        onClick={() => setOpen(!open)}
        aria-label="View raw message"
      >
        <svg
          className={compact ? "h-3 w-3" : "h-4 w-4"}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
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
        className="max-h-[min(80vh,48rem)] overflow-y-auto overflow-x-hidden rounded-lg border border-neutral-line/50 bg-surface-inset p-3 shadow-xl"
      >
        <pre className="text-[0.6rem] leading-relaxed text-on-surface-soft whitespace-pre-wrap break-all">
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
  const [fullscreen, setFullscreen] = useState(false);
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
      solo: "rounded-lg border border-neutral-line/60",
      first: "rounded-t-lg border-l border-r border-t border-neutral-line/60",
      middle: "border-l border-r border-neutral-line/60 border-t border-neutral-line/50",
      last: "rounded-b-lg border-l border-r border-b border-neutral-line/60 border-t border-neutral-line/50",
    };
    const rootPy: Record<string, string> = {
      solo: "py-1.5",
      first: "pt-1.5 pb-0",
      middle: "py-0",
      last: "pt-0 pb-1.5",
    };
    const baseBorder = cardBorder[groupPos] ?? cardBorder.solo;
    const amberRing = needsPermission
      ? "ring-2 ring-assistant/40 shadow-[0_0_16px_rgba(251,191,36,0.15)]"
      : "";
    const pulseClass = needsPermission ? "animate-pulse" : "";
    const inner = (
      <div
        className={`${baseBorder} ${amberRing} ${pulseClass} bg-surface-raised/40 overflow-hidden`}
      >
        <div className="px-3 py-2">
          <ToolUIAny {...toolProps} />
        </div>
        {progress ? (
          <div className="px-3 pb-2 flex items-center gap-2 text-xs border-t border-neutral-line/50 pt-2 mx-3">
            {progress.subagentType ? (
              <span className="shrink-0 rounded bg-assistant-deep/30 px-1.5 py-0.5 text-[0.65rem] font-medium text-assistant-soft">
                {progress.subagentType}
              </span>
            ) : null}
            <span className="truncate text-on-surface-soft">{progress.description}</span>
            <span className="shrink-0 text-on-surface-muted ml-auto tabular-nums">
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
          <div className="w-full border-l-2 border-neutral-line/50 pl-3">{inner}</div>
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
        <div className="w-full border-t border-neutral-line/50" />
      </MessagePrimitive.Root>
    );
  }

  // Compact block: merged compaction boundary + summary + in-window attachments,
  // rendered as one default-collapsed ToolHead-styled block.
  if (systemMessageType === "compact-block") {
    return (
      <MessagePrimitive.Root className="flex justify-start px-3 py-1.5 sm:px-5 group relative">
        <CompactBlock custom={custom} />
        <RawDebugTooltip custom={custom} className="absolute -top-1 right-0.5" />
      </MessagePrimitive.Root>
    );
  }

  // Hook card: hook_started + hook_response pair shown as a single
  // default-collapsed ToolHead-styled card, consistent with compact-block.
  if (systemMessageType === "hook-card") {
    return (
      <MessagePrimitive.Root className="flex justify-start px-3 py-1.5 sm:px-5 group relative">
        <HookCard custom={custom} />
        <RawDebugTooltip custom={custom} className="absolute -top-1 right-0.5" />
      </MessagePrimitive.Root>
    );
  }

  const attachmentType = custom?.attachmentType as string | undefined;
  const rawData = custom?._raw as Record<string, unknown> | undefined;
  const fileSnapshot =
    rawData && (rawData as { type?: string }).type === "file-history-snapshot"
      ? (rawData as Claude2FileHistorySnapshot)
      : null;

  const renderBody = () => (
    <>
      {attachmentType && rawData ? (
        <AttachmentBubble subtype={attachmentType} raw={rawData} />
      ) : fileSnapshot ? (
        <FileHistorySnapshotView snapshot={fileSnapshot} />
      ) : (
        <div className="text-xs text-assistant-soft/80 font-mono whitespace-pre-wrap break-all overflow-wrap-anywhere">
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
        className="max-w-[90%] rounded-2xl rounded-bl-md bg-assistant-deep/30 px-4 py-2.5 overflow-x-hidden overflow-y-auto max-h-[55vh] cursor-zoom-in sm:cursor-default self-start"
        onDoubleClick={() => setFullscreen(true)}
      >
        {renderBody()}
      </div>
      {fullscreen ? (
        <FullscreenReader
          header={
            <>
              <svg
                className="h-4 w-4 shrink-0 text-assistant-soft"
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
              <span className="text-xs font-medium text-on-surface-soft">
                {t("claude2.message.roleSystem")}
              </span>
            </>
          }
          onClose={() => setFullscreen(false)}
          closeLabel={t("claude2.message.exitFullscreen")}
        >
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl rounded-bl-md bg-assistant-deep/30 px-4 py-3 overflow-hidden">
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
      className="min-w-[14rem] text-assistant-soft/90"
      dividerClassName="border-assistant-deep/20"
      header={
        <ToolHead
          icon="history"
          badge={t("claude2.fileSnapshot.title")}
          badgeClassName="bg-assistant-deep/30 text-assistant-soft/80"
          detail={t("claude2.fileSnapshot.files", { count: entries.length })}
          trailing={
            <span
              className={`rounded px-1.5 py-0.5 text-[0.55rem] font-semibold ${
                isUpdate
                  ? "bg-assistant-deep/30 text-assistant-soft/80"
                  : "bg-assistant-deep/30 text-assistant-soft/60"
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
                <span className="truncate text-assistant-soft/70 break-all" title={path}>
                  {path}
                </span>
                {version !== null ? (
                  <span className="ml-auto shrink-0 rounded bg-assistant-deep/30 px-1 py-0.5 text-[0.55rem] font-semibold text-assistant-soft/80">
                    v{version}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[0.65rem] text-assistant-soft/40">
          {t("claude2.fileSnapshot.noTrackedFiles")}
        </p>
      )}
      {timeStr ? <p className="mt-1 text-[0.55rem] text-assistant-soft/40">{timeStr}</p> : null}
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
    <div className="rounded-b-lg border-t border-neutral-line/50 bg-surface-raised/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2 pb-1.5 sm:px-5">
        {hasStats ? (
          <div className="flex flex-wrap gap-3 text-[0.65rem] text-on-surface-muted">
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
              className="cursor-pointer text-[0.65rem] text-on-surface-muted hover:text-on-surface-soft"
            >
              {resultOpen ? "▾" : "▸"} {tailIsError ? "Error details" : "Final result"}
            </button>
          ) : null}
          {status === "error" && !content ? (
            <span className="text-xs text-error">Agent execution failed</span>
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
  const prevScrollTopRef = useRef(0);
  const bodyIndices = custom.bodyIndices ?? [];
  const subagentType = custom.subagentType ?? "Agent";

  // Sticky-to-bottom, same scheme as VirtualizedThreadContent. Our
  // programmatic auto-scrolls only increase scrollTop (toward bottom), so
  // unpinning purely on a scrollTop DECREASE makes our own scrolls incapable
  // of unpinning — no race with content growth during streaming.
  const stickToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = bodyRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!el) return;
      if (prevScrollTopRef.current - el.scrollTop > CHAT_SCROLL_UP_EPS) {
        stickRef.current = false;
      }
      if (el.scrollHeight - el.scrollTop - el.clientHeight < CHAT_BOTTOM_THRESHOLD) {
        stickRef.current = true;
      }
      prevScrollTopRef.current = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    prevScrollTopRef.current = el.scrollTop;
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Follow body content growth while sticky. MutationObserver (not
  // ResizeObserver) so NO extra wrapper div is needed — body cards keep their
  // original parent and spacing. Covers new messages (childList) and in-place
  // streaming growth of the last message (characterData in subtree).
  // RAF-coalesced so a burst of streaming deltas scrolls at most once/frame.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    let raf = 0;
    const onMutate = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (stickRef.current) stickToBottom("auto");
      });
    };
    const mo = new MutationObserver(onMutate);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [stickToBottom]);

  // Pin to bottom on mount and as body messages arrive while sticky.
  // MutationObserver has no observe-time callback, so the initial pin lives
  // here; this also scrolls before paint for new messages (no flicker).
  useLayoutEffect(() => {
    if (stickRef.current) stickToBottom("auto");
  }, [bodyIndices.length, stickToBottom]);

  return (
    <div className="my-1 rounded-lg border border-neutral-line/60 bg-surface-raised/30">
      <div className="flex items-center gap-2 rounded-t-lg bg-surface-raised/60 px-3 pt-1.5 pb-2 sm:px-5">
        <ToolHead
          icon="agent"
          iconClassName="text-user"
          badge={subagentType}
          badgeClassName="bg-neutral-line/60 text-on-surface-soft"
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
    <div className="rounded-b-lg border-t border-neutral-line/50 bg-surface-raised/40">
      {awaiting ? (
        <div className="px-3 py-2 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onApprove(autoMode)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-success/50 bg-success/20 px-3.5 py-1.5 text-xs font-semibold text-success shadow-sm transition hover:border-success/70 hover:bg-success/30 active:bg-success/40"
            >
              ✓ {t("claude2.plan.modeAuto")}
            </button>
            <button
              type="button"
              onClick={() => onApprove("default")}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-success/30 px-3.5 py-1.5 text-xs font-semibold text-success/90 transition hover:border-success/50 hover:bg-success/15 active:bg-success/25"
            >
              ✓ {t("claude2.plan.modeManual")}
            </button>
            <button
              type="button"
              onClick={() => setFeedbackOpen(!feedbackOpen)}
              className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-line/60 px-3.5 py-1.5 text-xs font-medium text-on-surface-soft transition hover:border-neutral-line hover:bg-neutral-line/50 active:bg-neutral-line/70"
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
                className="w-full resize-none rounded-md border border-neutral-line/60 bg-surface-inset/50 px-2 py-1.5 text-xs text-on-surface-soft placeholder:text-on-surface-muted focus:border-assistant/60 focus:outline-none"
              />
              <div className="flex items-center justify-end gap-2">
                <span className="text-[0.6rem] text-on-surface-muted">
                  {t("claude2.plan.enterToSend")}
                </span>
                <button
                  type="button"
                  onClick={onReject}
                  className="cursor-pointer rounded-md bg-error/20 px-3 py-1 text-xs font-semibold text-error hover:bg-error/35 transition"
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
            <span className="text-xs font-medium text-assistant-soft">
              ⊘ {t("claude2.plan.rejected")}
            </span>
          ) : (
            <span className="text-xs text-error">{result ?? t("claude2.plan.error")}</span>
          )}
          {outcome === "rejected" && result ? (
            <div className="mt-1 text-[0.65rem] text-on-surface-muted">{result}</div>
          ) : null}
        </div>
      ) : complete && result ? (
        <div className="px-3 pt-1.5 pb-1.5 sm:px-5">
          <span className="text-xs font-medium text-success">
            ✓ {t("claude2.plan.approved")}
            {approvedModeLabel ? ` · ${approvedModeLabel}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setResultOpen(!resultOpen)}
            className="ml-2 cursor-pointer text-[0.65rem] text-on-surface-muted hover:text-on-surface-soft"
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
        <div className="px-3 py-1.5 text-[0.65rem] text-on-surface-muted sm:px-5">
          {t("claude2.plan.orphaned")}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`my-1 rounded-lg border bg-surface-raised/30 overflow-hidden ${
          awaiting ? "border-assistant/40 plan-awaiting-flow" : "border-neutral-line/60"
        }`}
      >
        <div className="flex items-center gap-2 rounded-t-lg bg-surface-raised/60 px-3 pt-1.5 pb-2 sm:px-5">
          <ToolHead
            icon="plan"
            iconClassName="text-assistant-soft"
            badge={t("claude2.plan.title")}
            badgeClassName="bg-assistant/20 text-assistant-soft"
            detail={planFilePath}
          />
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="cursor-pointer rounded p-2 text-on-surface-muted transition hover:bg-neutral-line/50 hover:text-assistant"
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
                iconClassName="text-assistant-soft"
                badge={t("claude2.plan.title")}
                badgeClassName="bg-assistant/20 text-assistant-soft"
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
              <p className="py-8 text-center text-xs text-on-surface-muted">
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
  options?: Array<{ label: string; description?: string; preview?: string }>;
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
  // Per question: is the auto-appended "Other" pseudo-option active (showing a
  // free-text textarea)? Single-select treats Other as mutually exclusive with
  // the option list; multi-select lets it coexist (custom text appended).
  const [otherMode, setOtherMode] = useState<Record<number, boolean>>({});

  const toggleOption = (qIdx: number, optIdx: number, multi: boolean) => {
    if (!canAnswer) return;
    // Single-select: picking an option closes the Other textarea (Other is
    // mutually exclusive with options when active).
    if (!multi) setOtherMode((prev) => ({ ...prev, [qIdx]: false }));
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

  const toggleOther = (qIdx: number, multi: boolean) => {
    if (!canAnswer) return;
    setOtherMode((prev) => ({ ...prev, [qIdx]: !prev[qIdx] }));
    // Single-select: activating Other clears option selection (mutual exclusion).
    if (!multi) setSelections((prev) => ({ ...prev, [qIdx]: new Set<number>() }));
  };

  const handleSubmit = () => {
    if (!canAnswer) return;
    const answers: Record<string, string> = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const hasOptions = q.options && q.options.length > 0;
      if (!hasOptions) {
        const text = freeText[i]?.trim();
        if (text) answers[q.question] = text;
        continue;
      }
      // Selected option labels (multi-select may carry several). Single-select
      // Other clears them via mutual exclusion; multi-select Other appends text.
      const parts: string[] = [];
      const sel = selections[i];
      if (sel?.size) {
        parts.push(
          ...Array.from(sel)
            .map((idx) => q.options?.[idx]?.label ?? "")
            .filter(Boolean),
        );
      }
      const otherText = otherMode[i] ? freeText[i]?.trim() : "";
      if (otherText) parts.push(otherText);
      if (parts.length > 0) answers[q.question] = parts.join(", ");
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

  // Gate: every question must be answered (an option picked, or non-empty
  // Other text) before submit unlocks. Single-select Other is exclusive
  // (selections empty, so Other text alone counts); multi-select Other coexists
  // (either the option set or Other text counts).
  const answeredCount = questions.reduce((n, q, i) => {
    const hasOpt = !!q.options?.length;
    const answered = hasOpt
      ? (selections[i]?.size ?? 0) > 0 || (!!otherMode[i] && !!freeText[i]?.trim())
      : !!freeText[i]?.trim();
    return n + (answered ? 1 : 0);
  }, 0);
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  const resultStr =
    typeof custom.result === "string"
      ? custom.result
      : custom.result != null
        ? JSON.stringify(custom.result, null, 2)
        : "";

  const renderTail = () => (
    <div className="rounded-b-lg border-t border-neutral-line/50 bg-surface-raised/40">
      {awaiting ? (
        <div className="px-3 py-2 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            {controlRequestId ? (
              <>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-assistant/50 bg-assistant/20 px-3.5 py-1.5 text-xs font-semibold text-assistant-soft shadow-sm transition hover:border-assistant/70 hover:bg-assistant/30 active:bg-assistant/40 disabled:opacity-30 disabled:cursor-default cursor-pointer"
                  disabled={!allAnswered}
                  onClick={handleSubmit}
                >
                  {questions.length > 1
                    ? `${t("claude2.ask.submit")} ${answeredCount}/${questions.length}`
                    : t("claude2.ask.submit")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-neutral-line/50 px-3.5 py-1.5 text-xs font-medium text-on-surface-muted transition hover:border-neutral-line hover:text-on-surface-soft cursor-pointer"
                  onClick={handleCancel}
                >
                  {t("claude2.ask.skip")}
                </button>
              </>
            ) : custom.toolCallId ? (
              <>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-assistant/50 bg-assistant/20 px-3.5 py-1.5 text-xs font-semibold text-assistant-soft shadow-sm transition hover:border-assistant/70 hover:bg-assistant/30 active:bg-assistant/40 disabled:opacity-30 disabled:cursor-default cursor-pointer"
                  disabled={!allAnswered}
                  onClick={handleSubmit}
                >
                  {questions.length > 1
                    ? `${t("claude2.ask.submit")} ${answeredCount}/${questions.length}`
                    : t("claude2.ask.submit")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-neutral-line/50 px-3.5 py-1.5 text-xs font-medium text-on-surface-muted transition hover:border-neutral-line hover:text-on-surface-soft cursor-pointer"
                  onClick={handleCancel}
                >
                  {t("claude2.ask.skip")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={`flex-1 rounded-md px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  allAnswered
                    ? "border border-assistant/50 bg-assistant/20 text-assistant-soft hover:bg-assistant/30"
                    : "border border-assistant/20 bg-assistant/10 text-assistant/40 cursor-default"
                }`}
                disabled={!allAnswered}
                onClick={handleSubmit}
              >
                {t("claude2.ask.fillComposer")}
              </button>
            )}
          </div>
          <p className="mt-1 text-[0.55rem] text-assistant/40 text-center">
            {t("claude2.ask.waitingHint")}
          </p>
        </div>
      ) : error ? (
        <div className="px-3 py-2 sm:px-5">
          {outcome === "skipped" ? (
            <span className="text-xs font-medium text-assistant-soft">
              ⊘ {t("claude2.ask.skipped")}
            </span>
          ) : (
            <span className="text-xs text-error">{resultStr || t("claude2.ask.error")}</span>
          )}
        </div>
      ) : complete && resultStr ? (
        <div className="px-3 pt-1.5 pb-1.5 sm:px-5">
          <span className="text-xs font-medium text-success">
            ✓ {t("claude2.ask.statusAnswered")}
          </span>
          <button
            type="button"
            onClick={() => setResultOpen(!resultOpen)}
            className="ml-2 cursor-pointer text-[0.65rem] text-on-surface-muted hover:text-on-surface-soft"
          >
            {resultOpen ? "▾" : "▸"} {t("claude2.ask.result")}
          </button>
          {resultOpen ? (
            <div className="mt-1 max-h-32 overflow-y-auto">
              <pre className="text-[0.65rem] text-assistant-soft/70 whitespace-pre-wrap break-all leading-relaxed">
                {resultStr}
              </pre>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-3 py-1.5 text-[0.65rem] text-on-surface-muted sm:px-5">
          {t("claude2.ask.orphaned")}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`my-1 rounded-lg border bg-surface-raised/30 overflow-hidden ${
          awaiting ? "border-assistant/40 plan-awaiting-flow" : "border-neutral-line/60"
        }`}
      >
        <div className="flex items-center gap-2 rounded-t-lg bg-surface-raised/60 px-3 pt-1.5 pb-2 sm:px-5">
          <ToolHead
            icon="question"
            iconClassName="text-assistant-soft"
            badge={t("claude2.ask.title")}
            badgeClassName="bg-assistant/20 text-assistant-soft"
          />
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="cursor-pointer rounded p-2 text-on-surface-muted transition hover:bg-neutral-line/50 hover:text-assistant"
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
              const otherActive = !!otherMode[i];
              return (
                <div
                  key={i}
                  className="rounded-lg bg-surface-inset/40 border border-neutral-line/30 p-2.5"
                >
                  {q.header ? (
                    <p className="text-[0.6rem] font-semibold text-assistant-soft/80 uppercase tracking-wide mb-0.5">
                      {q.header}
                    </p>
                  ) : null}
                  <p className="text-[0.7rem] text-on-surface-soft leading-relaxed mb-2">
                    {q.question}
                    {multi ? (
                      <span className="text-[0.55rem] text-assistant/60 ml-1">
                        {t("claude2.ask.multiSelect")}
                      </span>
                    ) : null}
                  </p>
                  {hasOptions ? (
                    <div className="space-y-1">
                      {q.options!.map((opt, j) => {
                        const isSelected = selected.has(j);
                        return (
                          <Fragment key={j}>
                            <button
                              type="button"
                              className={`flex items-center gap-2 text-[0.65rem] w-full text-left rounded-lg px-2 py-1.5 transition ${
                                isSelected
                                  ? "bg-assistant/20 text-assistant-soft border border-assistant/40"
                                  : "hover:bg-surface-raised/50 text-on-surface-muted border border-transparent"
                              } ${!canAnswer ? "opacity-40 cursor-default" : "cursor-pointer"}`}
                              disabled={!canAnswer}
                              onClick={() => toggleOption(i, j, multi)}
                            >
                              <span
                                className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[0.55rem] ${
                                  isSelected
                                    ? "border-assistant bg-assistant/30 text-assistant-soft"
                                    : "border-neutral-line text-on-surface-muted"
                                }`}
                              >
                                {isSelected ? "✓" : j + 1}
                              </span>
                              <span className="flex-1">{opt.label}</span>
                              {opt.description ? (
                                <span className="text-[0.55rem] text-on-surface-muted text-right max-w-[40%]">
                                  {opt.description}
                                </span>
                              ) : null}
                            </button>
                            {isSelected && opt.preview ? (
                              <OptionPreview
                                text={opt.preview}
                                className="ml-6 mt-1 max-h-44 p-2"
                              />
                            ) : null}
                          </Fragment>
                        );
                      })}
                      <div className="my-1 border-t border-neutral-line/40" />
                      <button
                        type="button"
                        className={`flex items-center gap-2 text-[0.65rem] w-full text-left rounded-lg px-2 py-1.5 transition ${
                          otherActive
                            ? "bg-assistant/20 text-assistant-soft border border-assistant/40"
                            : "hover:bg-surface-raised/50 text-on-surface-muted border border-transparent"
                        } ${!canAnswer ? "opacity-40 cursor-default" : "cursor-pointer"}`}
                        disabled={!canAnswer}
                        onClick={() => toggleOther(i, multi)}
                      >
                        <span
                          className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[0.55rem] ${
                            otherActive
                              ? "border-assistant bg-assistant/30 text-assistant-soft"
                              : "border-neutral-line text-on-surface-muted"
                          }`}
                        >
                          ✎
                        </span>
                        <span className="flex-1">{t("claude2.ask.other")}</span>
                      </button>
                      {otherActive ? (
                        <textarea
                          className="w-full rounded-lg bg-surface-inset/60 border border-assistant/20 px-2 py-1.5 text-[0.65rem] text-on-surface-soft placeholder:text-on-surface-muted outline-none resize-none"
                          rows={2}
                          placeholder={t("claude2.ask.inputPlaceholder")}
                          disabled={!canAnswer}
                          value={freeText[i] ?? ""}
                          onChange={(e) =>
                            setFreeText((prev) => ({ ...prev, [i]: e.target.value }))
                          }
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-assistant/20 bg-surface-inset/60 overflow-hidden">
                      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-assistant/10">
                        <svg
                          className="h-3 w-3 text-assistant/60"
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
                        <span className="text-[0.55rem] text-assistant/60">
                          {t("claude2.ask.typeOpinion")}
                        </span>
                      </div>
                      <textarea
                        className="w-full bg-transparent px-2 py-1.5 text-[0.65rem] text-on-surface-soft placeholder:text-on-surface-muted outline-none resize-none"
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
                iconClassName="text-assistant-soft"
                badge={t("claude2.ask.title")}
                badgeClassName="bg-assistant/20 text-assistant-soft"
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
                const otherActive = !!otherMode[i];
                return (
                  <div
                    key={i}
                    className="rounded-lg bg-surface-inset/50 border border-neutral-line/30 p-3"
                  >
                    {q.header ? (
                      <p className="text-[0.7rem] font-semibold text-assistant-soft/80 uppercase tracking-wide mb-1">
                        {q.header}
                      </p>
                    ) : null}
                    <p className="text-sm text-on-surface-soft leading-relaxed mb-3">
                      {q.question}
                      {multi ? (
                        <span className="text-xs text-assistant/60 ml-1">
                          {t("claude2.ask.multiSelect")}
                        </span>
                      ) : null}
                    </p>
                    {hasOptions ? (
                      <div className="space-y-1.5">
                        {q.options!.map((opt, j) => {
                          const isSelected = selected.has(j);
                          return (
                            <Fragment key={j}>
                              <button
                                type="button"
                                className={`flex items-center gap-2 text-xs w-full text-left rounded-lg px-3 py-2 transition ${
                                  isSelected
                                    ? "bg-assistant/20 text-assistant-soft border border-assistant/40"
                                    : "hover:bg-surface-raised/50 text-on-surface-muted border border-transparent"
                                } ${!canAnswer ? "opacity-40 cursor-default" : "cursor-pointer"}`}
                                disabled={!canAnswer}
                                onClick={() => toggleOption(i, j, multi)}
                              >
                                <span
                                  className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                                    isSelected
                                      ? "border-assistant bg-assistant/30 text-assistant-soft"
                                      : "border-neutral-line text-on-surface-muted"
                                  }`}
                                >
                                  {isSelected ? "✓" : j + 1}
                                </span>
                                <span className="flex-1">{opt.label}</span>
                                {opt.description ? (
                                  <span className="text-xs text-on-surface-muted text-right max-w-[40%]">
                                    {opt.description}
                                  </span>
                                ) : null}
                              </button>
                              {isSelected && opt.preview ? (
                                <OptionPreview
                                  text={opt.preview}
                                  className="ml-7 mt-1.5 max-h-64 p-3"
                                />
                              ) : null}
                            </Fragment>
                          );
                        })}
                        <div className="my-1 border-t border-neutral-line/40" />
                        <button
                          type="button"
                          className={`flex items-center gap-2 text-xs w-full text-left rounded-lg px-3 py-2 transition ${
                            otherActive
                              ? "bg-assistant/20 text-assistant-soft border border-assistant/40"
                              : "hover:bg-surface-raised/50 text-on-surface-muted border border-transparent"
                          } ${!canAnswer ? "opacity-40 cursor-default" : "cursor-pointer"}`}
                          disabled={!canAnswer}
                          onClick={() => toggleOther(i, multi)}
                        >
                          <span
                            className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                              otherActive
                                ? "border-assistant bg-assistant/30 text-assistant-soft"
                                : "border-neutral-line text-on-surface-muted"
                            }`}
                          >
                            ✎
                          </span>
                          <span className="flex-1">{t("claude2.ask.other")}</span>
                        </button>
                        {otherActive ? (
                          <textarea
                            className="w-full rounded-lg bg-surface-inset/60 border border-assistant/20 px-3 py-2 text-xs text-on-surface-soft placeholder:text-on-surface-muted outline-none resize-none"
                            rows={3}
                            placeholder={t("claude2.ask.inputPlaceholder")}
                            disabled={!canAnswer}
                            value={freeText[i] ?? ""}
                            onChange={(e) =>
                              setFreeText((prev) => ({ ...prev, [i]: e.target.value }))
                            }
                          />
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-assistant/20 bg-surface-inset/60 overflow-hidden">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-assistant/10">
                          <svg
                            className="h-3.5 w-3.5 text-assistant/60"
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
                          <span className="text-xs text-assistant/60">
                            {t("claude2.ask.typeOpinion")}
                          </span>
                        </div>
                        <textarea
                          className="w-full bg-transparent px-3 py-2 text-xs text-on-surface-soft placeholder:text-on-surface-muted outline-none resize-none"
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
              <p className="py-8 text-center text-xs text-on-surface-muted">
                {t("claude2.ask.orphaned")}
              </p>
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
      className={className ?? "h-3 w-3 shrink-0 text-assistant-soft"}
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
      <div className="flex-1 border-t border-assistant-deep/30" />
      <ModeChangeGlyph />
      <span className="shrink-0 whitespace-nowrap text-[0.6rem] font-medium text-assistant/70">
        {t("claude2.mode.changed", { mode: label })}
      </span>
      <div className="flex-1 border-t border-assistant-deep/30" />
    </div>
  );
}

type CommandOutputCustom = {
  systemMessageType: "command-output";
  commandName?: string;
  args?: string;
  stdout?: string;
  stderr?: string;
  input?: string;
  sourceType: "local-command" | "bash";
};

// Command-output card reuses the shared ToolHead row (icon + badge + detail +
// trailing debug button) so it matches the existing tool-card / CompactBlock
// design language. Body shows parsed stdout/stderr/args/input inline (no
// Dialog popup); long output scrolls within a max-height.
function CommandOutputCard({ headIndex }: { headIndex: number }) {
  const { t } = useT();
  const custom = useAuiState(
    (s) => (s.thread.messages[headIndex]?.metadata?.custom ?? {}) as CommandOutputCustom,
  );
  const isBash = custom.sourceType === "bash";
  const title = isBash
    ? custom.input
      ? `! ${custom.input}`
      : t("claude2.command.title")
    : custom.commandName
      ? `/${custom.commandName}`
      : t("claude2.command.title");
  const sections: Array<{ label: string; value: string; tone: "default" | "error" }> = [];
  if (custom.args)
    sections.push({ label: t("claude2.command.args"), value: custom.args, tone: "default" });
  if (custom.input && !isBash)
    sections.push({ label: t("claude2.command.input"), value: custom.input, tone: "default" });
  if (custom.stdout)
    sections.push({ label: t("claude2.command.stdout"), value: custom.stdout, tone: "default" });
  if (custom.stderr)
    sections.push({ label: t("claude2.command.stderr"), value: custom.stderr, tone: "error" });

  return (
    <div className="px-3 py-1 sm:px-5">
      <div className="rounded-lg border border-neutral-line/60 bg-surface-raised/30 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <ToolHead
            icon={isBash ? "terminal" : "command"}
            badge={isBash ? "BASH" : "COMMAND"}
            detail={title}
            status="completed"
            trailing={<RawDebugTooltip custom={custom} className="-mr-1" />}
          />
        </div>
        {sections.length === 0 ? (
          <p className="mt-1 text-xs text-on-surface-muted">{t("claude2.command.empty")}</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2 border-t border-neutral-line/30 pt-2">
            {sections.map((s, i) => (
              <div key={i}>
                <div className="mb-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-on-surface-muted">
                  {s.label}
                </div>
                <pre
                  className={
                    s.tone === "error"
                      ? "max-h-60 overflow-auto rounded-md bg-error/20 p-2 text-xs text-error"
                      : "max-h-60 overflow-auto rounded-md bg-surface-inset/40 p-2 text-xs text-on-surface-soft"
                  }
                >
                  {s.value}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Unified message router: top-level turn rendering and Agent body rendering
// both go through this. agent-container → recursive AgentContainer. At the
// top level (renderAbsorbed=false) absorbed children return null — they are
// rendered inside their parent AgentContainer, not in the top-level stream.
// Inside a body (renderAbsorbed=true) absorbed children ARE the body's own
// items, so they render normally.
// Inline progress card at the stream's tail while a compaction is in flight
// (compactStatus === "compacting"). Appended as a synthetic compact-progress
// message so it rides the same virtualizer / auto-scroll pipeline. Replaced by
// the permanent CompactBlock once the compact_boundary lands. Stage (running →
// summarizing) comes from the compact context, driven by onCompact via bridgeRef.
function CompactProgress() {
  const compact = useContext(Claude2CompactContext);
  const { t } = useT();
  const stage = compact?.stage ?? "running";
  return (
    <div className="flex justify-start px-3 py-1 sm:px-5">
      <div className="inline-flex items-center gap-1.5 rounded-lg bg-assistant/10 px-2.5 py-1">
        <ToolHead
          icon="compact"
          status="running"
          iconClassName="text-assistant"
          badge={t("claude2.compact.progressBadge")}
          badgeClassName="bg-assistant/15 text-assistant-soft"
          detail={
            stage === "summarizing"
              ? t("claude2.compact.progressSummarizing")
              : t("claude2.compact.progressRunning")
          }
        />
      </div>
    </div>
  );
}

// Persistent inline banner rendered at the /compact command's position when a
// compaction was aborted. Mirrors CompactProgress's ToolHead + inline-pill
// shape (width follows content) so the in-flight card and the abort result
// read as one consistent element, only swapped to the red error tone. Live
// carries the reason from the compact lifecycle; replay (local_command stderr)
// records no reason in JSONL, so it is labeled "reason not recorded". Replaces
// the transient CompactIndicator banner for aborts so the abort stays visible.
function CompactAbortBanner({
  source,
  custom,
}: {
  source: "live" | "replay";
  custom?: Record<string, unknown>;
}) {
  const compact = useContext(Claude2CompactContext);
  const { t } = useT();
  const reason = source === "live" ? compact?.lastAbortReason : null;
  const detail =
    source === "replay"
      ? t("claude2.compact.abortUnknown")
      : reason === "system"
        ? t("claude2.compact.abortSystem")
        : t("claude2.compact.abortManual");
  return (
    <div className="flex justify-start px-3 py-1 sm:px-5">
      <div className="inline-flex items-center gap-1.5 rounded-lg bg-error/10 px-2.5 py-1">
        <ToolHead
          icon="compact"
          status="error"
          badge={t("claude2.compact.abortedBadge")}
          badgeClassName="bg-error/15 text-error"
          detail={detail}
          trailing={<RawDebugTooltip custom={custom} className="-mr-1" compact />}
        />
      </div>
    </div>
  );
}

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
  if (custom?.systemMessageType === "command-output")
    return <CommandOutputCard headIndex={index} />;
  if (custom?.systemMessageType === "compact-progress") return <CompactProgress />;
  if (custom?.systemMessageType === "compact-abort")
    return (
      <CompactAbortBanner source={(custom.source as "live" | "replay") ?? "live"} custom={custom} />
    );
  // Absorb the SessionStart:compact hook card — its semantics are carried by
  // CompactProgress (in flight) + CompactBlock (result), so it never renders as
  // a standalone HookCard, in both live streaming and history replay.
  if (
    custom?.systemMessageType === "hook-card" &&
    (custom?.hookName as string | undefined)?.startsWith("SessionStart:compact")
  ) {
    return null;
  }
  if (!renderAbsorbed && custom?.absorbed === true) return null;
  return <ThreadPrimitive.MessageByIndex index={index} components={MESSAGE_COMPONENTS} />;
}

// Auto-scroll thresholds for the chat scroller (px).
// Only a scrollTop DECREASE larger than this unpins (filters sub-pixel jitter);
// our programmatic auto-scrolls only increase scrollTop, so they can never unpin.
const CHAT_SCROLL_UP_EPS = 2;
// Within this distance of the bottom counts as "pinned" → repin is stable
// even when content keeps growing mid-stream.
const CHAT_BOTTOM_THRESHOLD = 32;

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
  const messageSignature = useAuiState((s) => {
    const compute = () =>
      s.thread.messages
        .map((m, i) => {
          const custom = (m.metadata?.custom ?? {}) as Record<string, unknown>;
          const role = custom.absorbed === true ? "assistant" : m.role;
          return `${i}:${role}:${m.id}`;
        })
        .join("\n");
    return isPerfTraceEnabled()
      ? timed("messageSignature", compute, s.thread.messages.length)
      : compute();
  });
  const turns = useMemo(
    () =>
      isPerfTraceEnabled()
        ? timed("buildTurns", () => buildTurns(messageSignature))
        : buildTurns(messageSignature),
    [messageSignature],
  );

  // C proxy: time from this render to its commit (virtualizer + mounted
  // messages). The mark is written during render (gated, ref-only — no state);
  // the layout effect fires after commit, before paint. Off-path is one read.
  const commitMarkRef = useRef(0);
  if (isPerfTraceEnabled()) commitMarkRef.current = performance.now();
  useLayoutEffect(() => {
    if (commitMarkRef.current !== 0) measureFrom("commit", commitMarkRef.current);
  });

  // ── Scroll container ──────────────────────────────────────────────
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Sticky-to-bottom ──────────────────────────────────────────────
  // stickyRef = "auto-follow new content". Our programmatic auto-scrolls
  // only ever increase scrollTop (toward bottom), so unpinning purely on a
  // scrollTop DECREASE makes our own scrolls incapable of unpinning — no
  // race with content growth during streaming.
  const stickyRef = useRef(true);
  const prevScrollTopRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  const stickToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollerRef.current;
    if (!el) return;
    stickyRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!el) return;
      // User scrolled up (wheel/touch/keyboard) → stop following.
      if (prevScrollTopRef.current - el.scrollTop > CHAT_SCROLL_UP_EPS) {
        if (stickyRef.current) {
          stickyRef.current = false;
          setShowScrollButton(true);
        }
      }
      // Back near the bottom → resume following.
      if (el.scrollHeight - el.scrollTop - el.clientHeight < CHAT_BOTTOM_THRESHOLD) {
        if (!stickyRef.current) {
          stickyRef.current = true;
          setShowScrollButton(false);
        }
      }
      prevScrollTopRef.current = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    prevScrollTopRef.current = el.scrollTop;
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Follow content growth while sticky (covers streaming, virtualizer
  // measurement settling, and loading→ready height changes).
  useEffect(() => {
    const wrapper = contentRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => {
      if (stickyRef.current) stickToBottom("auto");
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [stickToBottom]);

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

  // Pin to bottom as turns mount/stream in while sticky. Replaces the old
  // one-shot initial jump that raced with virtualizer measurement.
  useLayoutEffect(() => {
    if (turns.length > 0 && stickyRef.current) stickToBottom("auto");
  }, [turns.length, stickToBottom]);

  // Smooth follow when a run starts.
  const prevIsRunningRef = useRef(false);
  useLayoutEffect(() => {
    if (isRunning && !prevIsRunningRef.current) stickToBottom("smooth");
    prevIsRunningRef.current = isRunning;
  }, [isRunning, stickToBottom]);

  const jumpToBottom = useCallback(() => {
    stickToBottom("smooth");
    setShowScrollButton(false);
  }, [stickToBottom]);

  // ── Render ────────────────────────────────────────────────────────
  const items = virtualizer.getVirtualItems();

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <div ref={scrollerRef} className="h-full overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-5">
        {/* Skeleton shows while turns===0 (nothing painted yet). loading is
            flipped false by a deferred effect on the render after live_end, so
            it stays true through the one-frame window where assistant-ui hasn't
            pushed storeAdapter→thread.messages yet — keeping the skeleton
            mounted exactly until real content is painted, no blank gap. */}
        {turns.length === 0 && loading ? <ChatSkeleton /> : null}
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
        <div aria-hidden style={{ height: "var(--composer-float-inset, 1rem)" }} />
      </div>
      {showScrollButton && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="Scroll to bottom"
          className="pointer-events-auto absolute bottom-[calc(var(--composer-float-inset,1rem)+0.375rem)] right-3 z-10 rounded-full bg-neutral-line/90 p-2 text-on-surface-soft shadow-lg transition-all duration-300 ease-out hover:bg-neutral-line/90 hover:scale-110 lg:bottom-4 cursor-pointer"
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
  // Each row mirrors a real bubble: a MessagePrimitive-shaped wrapper
  // (px-3 sm:px-5 py-1.5) around a bubble div (rounded-2xl + single-corner
  // variant, px-4 py-2.5) so padding/width/corners line up with live bubbles.
  const rows = [
    { align: "end", width: "w-3/5", bg: "bg-user-deep/50", corner: "rounded-br-md" },
    { align: "start", width: "w-4/5", bg: "bg-surface-raised/60", corner: "rounded-bl-md" },
    { align: "end", width: "w-[45%]", bg: "bg-user-deep/50", corner: "rounded-br-md" },
    { align: "start", width: "w-[85%]", bg: "bg-surface-raised/60", corner: "rounded-bl-md" },
  ];
  return (
    <div className="px-3 sm:px-5" aria-hidden="true">
      {rows.map((row, i) => (
        <div
          key={i}
          className={`flex py-1.5 ${row.align === "end" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`${row.width} rounded-2xl ${row.corner} ${row.bg} skeleton-shimmer px-4 py-2.5`}
          >
            <div className="h-2.5 w-24 rounded bg-neutral-line/40" />
            <div className="mt-1.5 h-2.5 w-16 rounded bg-neutral-line/25" />
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
  //      carries the resolved model name), OR
  //   b) modelSwitchVersion increments after a control_response confirms the
  //      set_model control_request succeeded (in-process switch, no restart).
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
      <div className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.65rem] font-medium text-assistant/80">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-assistant/40 border-t-assistant" />
        {t("claude2.switchingModel", { model: modelDisplayLabel(switchingTo) })}
      </div>
    );
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-medium text-user/80 hover:text-user-soft hover:bg-surface-raised/50 transition cursor-pointer"
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
          <div className="absolute bottom-full left-0 mb-1 z-50 min-w-[7rem] rounded-lg border border-neutral-line/50 bg-surface-raised shadow-xl py-1">
            {availableModels.map((modelId) => {
              const isActive = modelId === current;
              return (
                <button
                  key={modelId}
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                    isActive
                      ? "text-user bg-user/10 cursor-default"
                      : "text-on-surface-muted hover:text-on-surface-soft hover:bg-neutral-line/50 cursor-pointer"
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
                      className="h-3 w-3 shrink-0 text-user"
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
      <div className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.65rem] font-medium text-assistant/80">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-assistant/40 border-t-assistant" />
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
            ? "text-on-surface-muted cursor-default"
            : "text-permission/80 hover:text-permission-soft hover:bg-surface-raised/50 cursor-pointer"
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
          <div className="absolute bottom-full left-0 mb-1 z-50 min-w-[7rem] rounded-lg border border-neutral-line/50 bg-surface-raised shadow-xl py-1">
            {modes.map((pmId) => {
              const isActive = pmId === mode;
              return (
                <button
                  key={pmId}
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                    isActive
                      ? "text-permission bg-permission/10 cursor-default"
                      : "text-on-surface-muted hover:text-on-surface-soft hover:bg-neutral-line/50 cursor-pointer"
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
                      className="h-3 w-3 shrink-0 text-permission"
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

// assistant-ui's default directive formatter writes `:command[/x]{name=x}` into the
// composer, which is meant for an LLM runtime to parse back into a tool call. Our
// composer text is piped straight to the Claude CLI stdin, which only understands a
// plain `/x`. Serialize every slash item (builtin command / plugin command / skill) to
// its CLI slash form instead — see primitives/references/mentions.md (custom formatter).
const cliSlashFormatter: Unstable_DirectiveFormatter = {
  serialize: (item) => item.label ?? `/${item.id}`,
  parse: (text) => [{ kind: "text", text }],
};

// VS Code-style: keep the keyboard-highlighted slash item scrolled into view.
// assistant-ui's trigger popover has no scrollIntoView, so we read
// highlightedIndex from the scope context and scroll the active item with
// block:"nearest" (only scrolls when out of view, no jitter).
function SlashCommandPopoverItem({
  item,
  index,
  kind,
}: {
  item: Unstable_TriggerItem;
  index: number;
  kind?: "command" | "skill";
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const scope = unstable_useTriggerPopoverScopeContext();
  const isHighlighted = scope.highlightedIndex === index;
  useEffect(() => {
    if (!isHighlighted || !ref.current) return;
    const listbox = ref.current.closest('[role="listbox"]');
    if (!(listbox instanceof HTMLElement)) return;
    const item = ref.current;
    const paddingTop = Number.parseFloat(getComputedStyle(listbox).paddingTop);
    const itemTop = item.offsetTop - paddingTop;
    const itemBottom = itemTop + item.clientHeight;
    const listTop = listbox.scrollTop;
    const listBottom =
      listTop +
      listbox.clientHeight -
      paddingTop -
      Number.parseFloat(getComputedStyle(listbox).paddingBottom);
    if (itemTop < listTop) {
      listbox.scrollTop = itemTop;
    } else if (itemBottom > listBottom) {
      listbox.scrollTop =
        itemBottom -
        (listbox.clientHeight -
          paddingTop -
          Number.parseFloat(getComputedStyle(listbox).paddingBottom));
    }
  }, [isHighlighted]);
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverItem
      ref={ref}
      item={item}
      index={index}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-on-surface-soft transition-colors duration-150 hover:bg-surface-raised/80 hover:text-on-surface data-[highlighted]:bg-surface-raised/80 data-[highlighted]:text-on-surface"
    >
      <ToolIcon
        name={kind === "skill" ? "skill" : "command"}
        className={kind === "skill" ? "text-assistant/70" : "text-user/70"}
      />
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0">
        <span className="min-w-0 break-all text-xs font-medium text-on-surface-soft">
          {item.label}
        </span>
        {item.description ? (
          <span className="min-w-0 break-words text-xs text-on-surface-muted">
            {item.description}
          </span>
        ) : null}
      </span>
    </ComposerPrimitive.Unstable_TriggerPopoverItem>
  );
}

function ComposerWithInterrupt({
  currentModel,
  currentResolved,
  availableModels,
  modelSwitchVersion,
  permissionMode,
  availablePermissionModes,
  projectName,
  sessionId,
  aiTitle,
  agentName,
  compactStatus,
  pendingInteraction,
  onCancel,
}: {
  currentModel?: string;
  currentResolved?: string;
  availableModels: string[];
  modelSwitchVersion: number;
  permissionMode?: string;
  availablePermissionModes: string[];
  projectName: string;
  sessionId: string;
  aiTitle?: string | null;
  agentName?: string | null;
  compactStatus: CompactStatus;
  pendingInteraction: boolean;
  onCancel?: () => void;
}) {
  const { t } = useT();
  // thread.isRunning drives the stop overlay for assistant turns; compactStatus
  // extends it to compactions (which don't produce an assistant turn).
  const isRunning = useAuiState((s) => s.thread.isRunning);

  // Full skill+slash catalog is the sole source for the slash menu (project +
  // user + plugin + builtin). Always fetched on open — it does not depend on the
  // session's availability list, so the menu is identical on first load and on
  // reconnect (windowing may drop system.init from the replayed tail).
  const descQuery = useQuery({
    queryKey: ["projects", projectName, "agent-sessions", sessionId, "skill-slash-catalog"],
    queryFn: async () => {
      const { getSkillSlashCatalog } = await import("../api/client");
      return getSkillSlashCatalog(projectName, sessionId);
    },
    staleTime: Infinity,
  });

  // Catalog is the single source for descriptions, kinds, and the item list.
  // Plugin entries are namespaced (`plugin:entry`); same-named command + skill
  // carry independent descriptions (no Map clobber), keyed apart by kind.
  const slashItems = useMemo<readonly Unstable_SlashCommand[]>(
    () =>
      (descQuery.data?.commands ?? []).map((info) => ({
        id: info.name,
        description: info.description,
        execute: () => undefined,
      })),
    [descQuery.data],
  );
  const kindById = useMemo(() => {
    const map = new Map<string, "command" | "skill">();
    for (const info of descQuery.data?.commands ?? []) map.set(info.name, info.kind);
    return map;
  }, [descQuery.data]);
  // Enter on a highlighted slash item sends it immediately (IDE-style: Tab completes,
  // Enter submits). append() drives the message through onNew → sendToSocket without
  // depending on composer text state, so it races cleanly against insertDirective.
  const api = useAui();
  const composer = useComposerRuntime();
  const lastKeyRef = useRef<string>("");
  const slash = unstable_useSlashCommandAdapter({ commands: slashItems });

  // When a trigger popover (the slash menu) is active, Enter must reach the
  // popover to submit the highlighted command — not the composer.
  const triggerCtx = unstable_useTriggerPopoverRootContextOptional();
  const slashOpenRef = useRef(false);
  useEffect(() => {
    if (!triggerCtx) {
      slashOpenRef.current = false;
      return;
    }
    const update = () => {
      slashOpenRef.current = triggerCtx.getActiveAria() !== null;
    };
    update();
    return triggerCtx.subscribeAria(update);
  }, [triggerCtx]);

  // Three composer states, mutually exclusive: blocked (awaiting user action)
  // takes priority over running, which takes priority over idle.
  const blocked = pendingInteraction;
  const running = isRunning || compactStatus === "compacting";
  const showStop = running && !!onCancel && !blocked;

  return (
    <div className="relative flex flex-col rounded-xl border border-on-surface/10 bg-surface-raised/60 shadow-2xl shadow-black/40 backdrop-blur-xl backdrop-saturate-150 transition focus-within:border-user/50 focus-within:bg-surface-raised/80 lg:bg-surface-raised/80 lg:backdrop-blur-none lg:shadow-none">
      {aiTitle ? (
        <span className="pointer-events-none absolute right-3 top-2 z-10 max-w-[45%] select-none truncate rounded-md bg-assistant-deep/40 px-2 py-0.5 text-[0.6rem] text-assistant-soft/80 whitespace-nowrap">
          {agentName ? (
            <span className="mr-1.5 text-[0.55rem] font-semibold text-assistant/60">
              {agentName}
            </span>
          ) : null}
          {aiTitle}
        </span>
      ) : null}
      <ComposerPrimitive.Input
        placeholder={blocked ? t("claude2.blockedByPendingAction") : t("claude2.inputPlaceholder")}
        disabled={blocked}
        enterKeyHint="send"
        className={`block min-h-[2.5rem] max-h-32 sm:min-h-[4.5rem] w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 text-sm text-on-surface placeholder:text-on-surface-muted outline-none ${
          aiTitle ? "pr-24" : ""
        }`}
        rows={1}
        onKeyDown={(e) => {
          // Record key for slash command's Enter-submit (see Action.onExecute).
          lastKeyRef.current = e.key;
          if (e.key !== "Enter") return;
          // Hand Enter off to these paths first (let them newline/handle it):
          if (e.nativeEvent.isComposing) return; // mid-IME composition → newline
          if (e.shiftKey) return; // Shift+Enter → newline (desktop; mobile has no Shift)
          if (slashOpenRef.current) return; // slash menu open → popover handles it
          if (blocked) return; // awaiting user action → disabled anyway
          // Enter → send on both desktop and mobile. preventDefault short-circuits
          // the library's handleKeyPress, which would otherwise no-op on isRunning
          // (its queue capability is false in external-store mode) and drop Enter to
          // a newline. composer.send() bypasses that guard — it only checks canSend.
          e.preventDefault();
          composer.send();
        }}
      />
      <div className="flex items-center gap-2 px-2.5 pb-2 pt-0.5">
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
        {showStop ? (
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-assistant-deep/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:bg-assistant cursor-pointer"
          >
            <span className="h-2 w-2 rounded-[2px] bg-white/90" />
            {t("session.stop")}
          </button>
        ) : null}
      </div>
      {slashItems.length > 0 ? (
        <ComposerPrimitive.Unstable_TriggerPopover
          char="/"
          adapter={slash.adapter}
          className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-56 overflow-auto rounded-xl border border-on-surface/10 bg-surface-inset/95 p-1 shadow-2xl backdrop-blur"
        >
          <ComposerPrimitive.Unstable_TriggerPopover.Action
            formatter={cliSlashFormatter}
            onExecute={(item) => {
              slash.action.onExecute?.(item);
              if (lastKeyRef.current === "Enter") {
                api.thread().append(`/${item.id}`);
                composer.setText("");
              }
              lastKeyRef.current = "";
            }}
          />
          <ComposerPrimitive.Unstable_TriggerPopoverItems>
            {(items) =>
              items.map((item, index) => (
                <SlashCommandPopoverItem
                  key={item.id}
                  item={item}
                  index={index}
                  kind={kindById.get(item.id)}
                />
              ))
            }
          </ComposerPrimitive.Unstable_TriggerPopoverItems>
        </ComposerPrimitive.Unstable_TriggerPopover>
      ) : null}
    </div>
  );
}

function RetryIndicator({ retryInfo }: { retryInfo: RetryInfo | null }) {
  const { t } = useT();
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-assistant/10 px-3 py-1 text-[0.65rem] text-assistant/70">
        <span className="h-2 w-2 shrink-0 animate-spin rounded-full border border-assistant/40 border-t-assistant" />
        {retryInfo.maxRetries > 1
          ? t("claude2.retry.bannerMulti", {
              attempt: retryInfo.attempt,
              max: retryInfo.maxRetries,
              error: errorText,
              seconds: countdown,
            })
          : t("claude2.retry.bannerSingle", { error: errorText, seconds: countdown })}
      </span>
    </div>
  );
}

// successful compaction is recorded permanently by CompactBlock in the message
// stream; this banner now surfaces only compact failures.
function CompactIndicator() {
  // All compact feedback now renders inline in the message stream:
  // CompactProgress (in flight) and CompactAbortBanner (aborted, persistent).
  // This composer-anchored banner is intentionally a no-op; abort feedback lives
  // in the stream so it persists across reconnect/replay identically.
  return null;
}
