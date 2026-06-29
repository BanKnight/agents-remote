import { atomWithStorage } from "jotai/utils";
import type {
  AgentSession,
  Project,
  SessionType,
  TerminalSession,
  TransportStatus,
} from "@agents-remote/shared";
import type { TranslationKey } from "../i18n/types";

export type ConsoleSection = "agents" | "git" | "files";

export const inputDrawerCollapsedAtom = atomWithStorage("inputDrawerCollapsed", false);

export type ConsoleSectionDefinition = {
  id: ConsoleSection;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  statusKey: TranslationKey;
};

export type SessionQuickKey = {
  id: string;
  labelKey: TranslationKey;
  ariaLabelKey: TranslationKey;
  sequence: string;
};

export type SessionSendStatus = "connecting" | TransportStatus;

export const consoleSections: ConsoleSectionDefinition[] = [
  {
    id: "agents",
    labelKey: "section.agents",
    descriptionKey: "section.agentsDesc",
    statusKey: "section.agentsStatus",
  },
  {
    id: "files",
    labelKey: "section.files",
    descriptionKey: "section.filesDesc",
    statusKey: "section.filesStatus",
  },
  {
    id: "git",
    labelKey: "section.git",
    descriptionKey: "section.gitDesc",
    statusKey: "section.gitStatus",
  },
];

export const defaultConsoleSection: ConsoleSection = "agents";

export function consoleSectionFromSearch(value: unknown): ConsoleSection {
  return consoleSections.some((section) => section.id === value)
    ? (value as ConsoleSection)
    : defaultConsoleSection;
}

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

export const sessionQuickKeys = (_sessionType: SessionType): SessionQuickKey[] => [
  {
    id: "shifttab",
    labelKey: "quickKey.shiftTab",
    ariaLabelKey: "quickKey.shiftTabAria",
    sequence: "\x1b[Z",
  },
  {
    id: "escape",
    labelKey: "quickKey.escape",
    ariaLabelKey: "quickKey.escapeAria",
    sequence: "\x1b",
  },
  {
    id: "interrupt",
    labelKey: "quickKey.interrupt",
    ariaLabelKey: "quickKey.interruptAria",
    sequence: "\x03",
  },
  { id: "eof", labelKey: "quickKey.eof", ariaLabelKey: "quickKey.eofAria", sequence: "\x04" },
  { id: "up", labelKey: "quickKey.up", ariaLabelKey: "quickKey.upAria", sequence: "\x1b[A" },
  { id: "down", labelKey: "quickKey.down", ariaLabelKey: "quickKey.downAria", sequence: "\x1b[B" },
];

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
    gitBranch: project.gitBranch,
    runtimeStatus:
      runtimeTotal > 0
        ? ("status.connected" as TranslationKey)
        : ("status.ready" as TranslationKey),
  };
}

export function sessionStatusLabel(
  status: AgentSession["status"] | TerminalSession["status"],
): TranslationKey {
  if (status === "idle") {
    return "status.waitingForInput";
  }

  if (status === "running") {
    return "status.running";
  }

  if (status === "closed") {
    return "status.closed";
  }

  return "status.error";
}
