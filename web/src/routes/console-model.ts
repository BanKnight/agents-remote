import type {
  AgentSession,
  Project,
  SessionType,
  TerminalSession,
  TransportStatus,
} from "@agents-remote/shared";

export type ConsoleSection = "agents" | "terminal" | "git" | "files";

export type ConsoleSectionDefinition = {
  id: ConsoleSection;
  label: string;
  description: string;
  status: string;
};

export type SessionQuickKey = {
  id: string;
  label: string;
  ariaLabel: string;
  sequence: string;
};

export type SessionSendStatus = "connecting" | TransportStatus;

export const consoleSections: ConsoleSectionDefinition[] = [
  {
    id: "files",
    label: "Files",
    description: "Read-only project browsing and file preview.",
    status: "Read-only",
  },
  {
    id: "git",
    label: "Git",
    description: "Read-only worktree and staged diff viewer.",
    status: "Read-only",
  },
  {
    id: "agents",
    label: "Agent Sessions",
    description: "Claude and Codex work sessions scoped to this Project.",
    status: "Default focus",
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Project-scoped shell sessions backed by the session runtime.",
    status: "Runtime ready",
  },
];

export const defaultConsoleSection: ConsoleSection = "agents";

export function projectConsolePath(projectName: string) {
  return `/projects/${encodeURIComponent(projectName)}`;
}

export function sessionDetailPath(
  projectName: string,
  sessionType: "agent" | "terminal",
  sessionId: string,
) {
  return `/projects/${encodeURIComponent(projectName)}/${sessionType}-sessions/${encodeURIComponent(sessionId)}`;
}

export function sectionForId(sectionId: ConsoleSection) {
  return consoleSections.find((section) => section.id === sectionId) ?? consoleSections[0];
}

export const sessionQuickKeys = (sessionType: SessionType): SessionQuickKey[] => {
  if (sessionType === "agent") {
    return [
      { id: "interrupt", label: "Ctrl+C", ariaLabel: "Send interrupt", sequence: "" },
      { id: "up", label: "↑", ariaLabel: "Send arrow up", sequence: "[A" },
      { id: "down", label: "↓", ariaLabel: "Send arrow down", sequence: "[B" },
      { id: "enter", label: "Enter", ariaLabel: "Send enter", sequence: "\n" },
      { id: "escape", label: "Esc", ariaLabel: "Send escape", sequence: "" },
      { id: "tab", label: "Tab", ariaLabel: "Send tab", sequence: "\t" },
    ];
  }

  return [
    { id: "interrupt", label: "Ctrl+C", ariaLabel: "Send interrupt", sequence: "" },
    { id: "eof", label: "Ctrl+D", ariaLabel: "Send end of file", sequence: "" },
    { id: "escape", label: "Esc", ariaLabel: "Send escape", sequence: "" },
    { id: "tab", label: "Tab", ariaLabel: "Send tab", sequence: "\t" },
    { id: "up", label: "↑", ariaLabel: "Send arrow up", sequence: "[A" },
    { id: "down", label: "↓", ariaLabel: "Send arrow down", sequence: "[B" },
    { id: "left", label: "←", ariaLabel: "Send arrow left", sequence: "[D" },
    { id: "right", label: "→", ariaLabel: "Send arrow right", sequence: "[C" },
  ];
};

export function normalizeSessionTextInput(input: string) {
  if (input.trim().length === 0) {
    return undefined;
  }

  return input.endsWith("\n") ? input : `${input}\n`;
}

export function canSendToSession(status: SessionSendStatus, isClosing = false) {
  return status === "connected" && !isClosing;
}

export function projectSummary(project: Project) {
  const runtimeTotal = project.agentSessionCount + project.terminalSessionCount;

  return {
    agentCount: project.agentSessionCount,
    terminalCount: project.terminalSessionCount,
    gitBranch: project.gitBranch ?? "Not available in this slice",
    runtimeStatus: runtimeTotal > 0 ? "Connected" : "Ready",
  };
}

export function sessionStatusLabel(status: AgentSession["status"] | TerminalSession["status"]) {
  if (status === "idle") {
    return "Waiting for input";
  }

  if (status === "running") {
    return "Running";
  }

  if (status === "closed") {
    return "Closed";
  }

  return "Error";
}
