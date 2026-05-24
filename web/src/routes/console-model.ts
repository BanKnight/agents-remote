import type { AgentSession, Project, TerminalSession } from "@agents-remote/shared";

export type ConsoleSection = "agents" | "terminal" | "git" | "files";

export type ConsoleSectionDefinition = {
  id: ConsoleSection;
  label: string;
  description: string;
  status: string;
};

export const consoleSections: ConsoleSectionDefinition[] = [
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
  {
    id: "git",
    label: "Git",
    description: "Read-only diff and branch context land after the console shell.",
    status: "Coming soon",
  },
  {
    id: "files",
    label: "Files",
    description: "Read-only project browsing and preview will reuse this entry point.",
    status: "Coming soon",
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

export const runtimeInputEnabled = true;
