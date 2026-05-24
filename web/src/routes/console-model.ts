import type { Project } from "@agents-remote/shared";

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
    description: "Claude and Codex work will appear here once runtime is connected.",
    status: "Default focus",
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Project-scoped shell sessions are planned for the next runtime slice.",
    status: "Coming soon",
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

export function sectionForId(sectionId: ConsoleSection) {
  return consoleSections.find((section) => section.id === sectionId) ?? consoleSections[0];
}

export function projectSummary(project: Project) {
  return {
    agentCount: project.agentSessionCount,
    terminalCount: project.terminalSessionCount,
    gitBranch: project.gitBranch ?? "Not available in this slice",
    runtimeStatus: "Pending",
  };
}

export const runtimeInputEnabled = false;
