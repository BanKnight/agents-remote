import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { AgentProvider, AgentSession, TerminalSession } from "@agents-remote/shared";
import {
  createAgentSession,
  createTerminalSession,
  listAgentSessions,
  listTerminalSessions,
} from "../../api/client";
import { useT } from "../../i18n";
import { sessionStatusLabel } from "../../routes/console-model";
import { ActionButton, IconMarker } from "../shell/shell-primitives";
import { ShellNavigationButton } from "../shell/shell-navigation";
import { ShellIcon } from "../shell/icons";
import { usePromptDialog } from "../shell/prompt-dialog";
import type { WorkbenchScope } from "../../routes/workbench-model";

/** 左栏实例列表加载骨架的占位行数。 */
const INSTANCE_SKELETON_ROW_COUNT = 3;

type LeftRailProps = {
  scope: WorkbenchScope;
  focusId?: string;
};

/**
 * 工作台左栏（设计文档 §2、§4）。Stage 1 简化版：project scope 渲染当前项目的
 * agent + terminal 实例列表 + 创建入口，点实例切中栏聚焦；global scope 暂空
 *（Stage 4 跨项目实例区）。Stage 2 升级为完整树（项目层 + 历史 session + 设置浮窗）。
 */
export function WorkbenchLeftRail({ scope, focusId }: LeftRailProps) {
  if (scope.kind !== "project") {
    return null;
  }
  return <ProjectLeftRail focusId={focusId} projectName={scope.key} />;
}

type ProjectLeftRailProps = {
  focusId?: string;
  projectName: string;
};

function ProjectLeftRail({ focusId, projectName }: ProjectLeftRailProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { prompt } = usePromptDialog();
  const agents = useQuery({
    queryKey: ["projects", projectName, "agent-sessions"],
    queryFn: () => listAgentSessions(projectName),
    staleTime: 5_000,
  });
  const terminals = useQuery({
    queryKey: ["projects", projectName, "terminal-sessions"],
    queryFn: () => listTerminalSessions(projectName),
    staleTime: 5_000,
  });

  const agentSessions = agents.data?.sessions ?? [];
  const terminalSessions = terminals.data?.sessions ?? [];
  const loading = agents.isLoading && terminals.isLoading;
  const empty = agentSessions.length === 0 && terminalSessions.length === 0;

  const invalidateSessions = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects", projectName, "agent-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["projects", projectName, "terminal-sessions"] }),
    ]);
  };

  const createAgent = useMutation({
    mutationFn: ({ displayName, provider }: { displayName: string; provider: AgentProvider }) =>
      createAgentSession(projectName, provider, { displayName: displayName || undefined }),
    onSuccess: async (data) => {
      await invalidateSessions();
      await navigate({
        to: "/workbench/$scope/$focusId",
        params: { scope: projectName, focusId: data.session.id },
      });
    },
  });
  const createTerminal = useMutation({
    mutationFn: (displayName: string) =>
      createTerminalSession(projectName, displayName || undefined),
    onSuccess: async (data) => {
      await invalidateSessions();
      await navigate({
        to: "/workbench/$scope/$focusId",
        params: { scope: projectName, focusId: data.session.id },
      });
    },
  });

  const handleCreateAgent = (provider: AgentProvider) => {
    void prompt({
      title: t("session.namePrompt.createAgent"),
      placeholder: t("session.namePrompt.placeholder"),
      confirmLabel: t("session.namePrompt.confirm"),
      cancelLabel: t("cancel"),
    }).then((name) => {
      if (name !== null) createAgent.mutate({ displayName: name, provider });
    });
  };

  const handleCreateTerminal = () => {
    void prompt({
      title: t("session.namePrompt.createTerminal"),
      placeholder: t("session.namePrompt.placeholder"),
      confirmLabel: t("session.namePrompt.confirm"),
      cancelLabel: t("cancel"),
    }).then((name) => {
      if (name !== null) createTerminal.mutate(name);
    });
  };

  const focus = (sessionId: string) => {
    void navigate({
      to: "/workbench/$scope/$focusId",
      params: { scope: projectName, focusId: sessionId },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LeftRailCreateBar
        isCreatingClaude={createAgent.isPending}
        isCreatingTerminal={createTerminal.isPending}
        onCreateClaude={() => handleCreateAgent("claude2")}
        onCreateTerminal={handleCreateTerminal}
      />
      <nav aria-label={t("workbench.instancesAria")} className="flex-1 overflow-y-auto">
        {loading && empty ? <LeftRailSkeleton /> : null}
        {agentSessions.map((session) => (
          <AgentNavItem
            key={session.id}
            active={session.id === focusId}
            session={session}
            onSelect={focus}
          />
        ))}
        {terminalSessions.map((session) => (
          <TerminalNavItem
            key={session.id}
            active={session.id === focusId}
            session={session}
            onSelect={focus}
          />
        ))}
        {!loading && empty ? (
          <p className="px-3 py-4 text-xs text-slate-500">{t("workbench.noInstances")}</p>
        ) : null}
      </nav>
    </div>
  );
}

type LeftRailCreateBarProps = {
  isCreatingClaude: boolean;
  isCreatingTerminal: boolean;
  onCreateClaude: () => void;
  onCreateTerminal: () => void;
};

function LeftRailCreateBar({
  isCreatingClaude,
  isCreatingTerminal,
  onCreateClaude,
  onCreateTerminal,
}: LeftRailCreateBarProps) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-2 gap-1.5 border-b border-white/5 p-2">
      <ActionButton
        className="justify-center"
        disabled={isCreatingClaude}
        tone="accent"
        onClick={onCreateClaude}
      >
        <ShellIcon name="anthropic" className="h-3 w-3" />
        {isCreatingClaude ? t("project.creating") : t("workbench.createClaude2")}
      </ActionButton>
      <ActionButton
        className="justify-center"
        disabled={isCreatingTerminal}
        onClick={onCreateTerminal}
      >
        <ShellIcon name="terminal" className="h-3 w-3" />
        {isCreatingTerminal ? t("project.creating") : t("workbench.createTerminal")}
      </ActionButton>
    </div>
  );
}

type AgentNavItemProps = {
  active: boolean;
  session: AgentSession;
  onSelect: (sessionId: string) => void;
};

function AgentNavItem({ active, onSelect, session }: AgentNavItemProps) {
  const { t } = useT();
  const tone = session.provider === "codex" ? "success" : "accent";
  const iconName = session.provider === "codex" ? "openai" : "anthropic";
  // running 是常态，列表层仅在异常状态（idle/error/...）提示；复用 AgentInstanceRow 的约定。
  const isRunning = session.status === "running";
  return (
    <ShellNavigationButton
      active={active}
      description={isRunning ? undefined : t(sessionStatusLabel(session.status))}
      label={session.displayName}
      marker={
        <IconMarker tone={tone}>
          <ShellIcon name={iconName} className="h-3.5 w-3.5" />
        </IconMarker>
      }
      onClick={() => onSelect(session.id)}
    />
  );
}

type TerminalNavItemProps = {
  active: boolean;
  session: TerminalSession;
  onSelect: (sessionId: string) => void;
};

function TerminalNavItem({ active, onSelect, session }: TerminalNavItemProps) {
  const { t } = useT();
  const isRunning = session.status === "running";
  return (
    <ShellNavigationButton
      active={active}
      description={isRunning ? undefined : t(sessionStatusLabel(session.status))}
      label={session.displayName}
      marker={
        <IconMarker tone="success">
          <ShellIcon name="terminal" className="h-3.5 w-3.5" />
        </IconMarker>
      }
      onClick={() => onSelect(session.id)}
    />
  );
}

function LeftRailSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-2">
      {Array.from({ length: INSTANCE_SKELETON_ROW_COUNT }, (_, index) => (
        <div key={index} className="h-8 animate-pulse rounded-lg bg-white/5" />
      ))}
    </div>
  );
}
