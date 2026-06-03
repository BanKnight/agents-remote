import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useComposerRuntime,
  useLocalRuntime,
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
import { Claude2BridgeContext, createClaude2Adapters } from "./claude2-adapter";

export function Claude2SessionDetailRoute() {
  const { projectName, sessionId } = useParams({
    from: "/projects/$projectName/agent-sessions/$sessionId/claude2",
  });

  return <Claude2Chat projectName={projectName} sessionId={sessionId} />;
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

  const { chatAdapter, historyAdapter, bridge } = useMemo(
    () => createClaude2Adapters(projectName, sessionId),
    [projectName, sessionId],
  );

  const runtime = useLocalRuntime(chatAdapter, {
    adapters: { history: historyAdapter },
  });

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
        model={session?.model}
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
              <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-3 py-4 sm:px-5">
                <ThreadViewportContent />
                <ThreadPrimitive.ScrollToBottom className="absolute bottom-20 right-5 z-10 rounded-full bg-slate-700/90 p-2 text-slate-300 shadow-lg transition hover:bg-slate-600/90">
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
              </ThreadPrimitive.Viewport>

              <div className="shrink-0 border-t border-slate-700/80 px-3 py-2.5 sm:px-4">
                <ComposerPrimitive.Root>
                  <ComposerWithInterrupt />
                </ComposerPrimitive.Root>
              </div>
            </ThreadPrimitive.Root>
          </div>
        </Claude2BridgeContext.Provider>
      </AssistantRuntimeProvider>
      {holder}
    </ShellLayout>
  );
}

type ChatHeaderProps = {
  closePending: boolean;
  model?: string;
  projectName: string;
  title: string;
  onClose: () => void;
};

function ChatHeader({ closePending, model, projectName, title, onClose }: ChatHeaderProps) {
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
          <p className="truncate font-mono text-[0.65rem] leading-4 text-slate-500">
            {projectName}
            {model ? ` · ${model}` : null}
          </p>
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

function ThreadViewportContent() {
  return (
    <>
      <ThreadPrimitive.Messages
        components={{
          UserMessage: UserChatBubble,
          AssistantMessage: AssistantChatBubble,
        }}
      />
      <ThreadPrimitive.ViewportFooter />
    </>
  );
}

function ComposerWithInterrupt() {
  const composer = useComposerRuntime();
  const isRunning = useThread((s) => s.isRunning);
  const { t } = useT();

  return (
    <div className="flex items-end gap-2">
      <ComposerPrimitive.Input
        autoFocus
        placeholder={t("claude2.inputPlaceholder")}
        className="min-h-[2.5rem] max-h-32 flex-1 resize-none rounded-xl border border-white/10 bg-[#141b28]/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-cyan-500/50 focus:bg-[#141b28]"
        rows={1}
      />
      {isRunning ? (
        <button
          type="button"
          className="shrink-0 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-rose-500"
          onClick={() => composer.cancel()}
        >
          {t("session.stop")}
        </button>
      ) : (
        <ComposerPrimitive.Send className="shrink-0 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-40">
          {t("session.sendInput")}
        </ComposerPrimitive.Send>
      )}
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
