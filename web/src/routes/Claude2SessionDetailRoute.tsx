import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
} from "@assistant-ui/react";
import { closeAgentSession, getAgentSession } from "../api/client";
import { useT } from "../i18n";
import { useConfirm } from "../components/shell/confirm-dialog";
import { defaultConsoleSection, consoleSections } from "./console-model";
import { IconMarker, shellSurfaceClasses } from "../components/shell/shell-primitives";
import { ShellLayout, ShellSidebar } from "../components/shell/shell-layout";
import { ProjectShellNavigation } from "../components/shell/shell-navigation";
import { ShellIcon } from "../components/shell/icons";
import { createClaude2Adapter } from "./claude2-adapter";

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

  const adapter = useMemo(
    () => createClaude2Adapter(projectName, sessionId),
    [projectName, sessionId],
  );

  const runtime = useLocalRuntime(adapter);

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
        sessionId={sessionId}
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
              <ThreadPrimitive.Messages
                components={{
                  UserMessage: UserChatBubble,
                  AssistantMessage: AssistantChatBubble,
                }}
              />
              <ThreadPrimitive.ViewportFooter />
            </ThreadPrimitive.Viewport>

            <div className="shrink-0 border-t border-slate-700/80 px-3 py-2.5 sm:px-4">
              <ComposerPrimitive.Root className="flex items-end gap-2">
                <ComposerPrimitive.Input
                  autoFocus
                  placeholder={t("claude2.inputPlaceholder")}
                  className="min-h-[2.5rem] max-h-32 flex-1 resize-none rounded-xl border border-white/10 bg-[#141b28]/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-cyan-500/50 focus:bg-[#141b28]"
                  rows={1}
                />
                <ComposerPrimitive.Send className="shrink-0 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-40">
                  {t("session.sendInput")}
                </ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
            </div>
          </ThreadPrimitive.Root>
        </div>
      </AssistantRuntimeProvider>
      {holder}
    </ShellLayout>
  );
}

type ChatHeaderProps = {
  closePending: boolean;
  projectName: string;
  sessionId: string;
  title: string;
  onClose: () => void;
};

function ChatHeader({ closePending, projectName, sessionId, title, onClose }: ChatHeaderProps) {
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
            {projectName} · {sessionId.slice(0, 8)}
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
    <MessagePrimitive.Root className="flex justify-end px-3 py-1.5 sm:px-5">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-cyan-700/60 px-4 py-2.5">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantChatBubble() {
  return (
    <MessagePrimitive.Root className="flex justify-start px-3 py-1.5 sm:px-5">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-800/70 px-4 py-2.5 text-sm text-slate-100 leading-relaxed">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}
