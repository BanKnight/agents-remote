import { atomFamily, atomWithStorage } from "jotai/utils";
import type {
  AgentSession,
  Project,
  SessionType,
  TerminalSession,
  TransportStatus,
} from "@agents-remote/shared";
import type { TranslationKey } from "../i18n/types";
import { PONG_TIMEOUT_MS } from "../lib/ws-heartbeat";

export type ConsoleSection = "agents" | "git" | "files";

// v1.5 批 7 按 session type 分族（terminal 默认收起 / agent 默认展开；spec §4.7:182 只约束
// 终端——终端以输出为主，输入框不占常驻高度）。旧 key "inputDrawerCollapsed"（全局布尔，
// 默认 false）不做迁移——用户重设一次即落新 key。
export const inputDrawerCollapsedAtom = atomFamily((sessionType: SessionType) =>
  atomWithStorage(`inputDrawerCollapsed:${sessionType}`, sessionType === "terminal"),
);
// TaskPanel expand state, persisted across session enter/leave. Defaults to
// collapsed — the header shows the first in-progress task, the panel body stays
// hidden until the user expands it.
export const tasksExpandedAtom = atomWithStorage("tasksExpanded", false);

export type ConsoleSectionDefinition = {
  id: ConsoleSection;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  statusKey: TranslationKey;
};

/** 内置键（系统控制序列，i18n 文案；可显隐/排序，不可删改——序列有系统语义）。 */
export type BuiltinQuickKey = {
  id: string;
  labelKey: TranslationKey;
  ariaLabelKey: TranslationKey;
  sequence: string;
};

/** 自定义键（2026-10-11 第三轮反馈④「增删改」；两域分离后仅作迁移源——存量键自动
 * 迁移为快捷命令见 migrateCustomKeysToCommands，键位面板/快捷键条不再消费）。 */
export type CustomQuickKey = {
  id: string;
  label: string;
  sequence: string;
};

/** 预置键语义分组（2026-10-12 反馈② Apple 分组惯例：可用按键区按语义分卡片呈现——
 * 24 项平铺不可扫读）。editing = shell readline 行编辑（含 Tab 补全），nav = TUI 翻页/
 * 跳转，fn = F 功能键。 */
export type PresetKeyGroup = "editing" | "nav" | "fn";

/** 预置终端键（Termius extended keyboard 对标，2026-10-11 拍板「预置序列清单」）：
 * 键帽名是跨语言通用术语，裸文本不进 i18n；序列有系统语义，不可改名/改序列。
 * group = 语义分组（可用按键区分卡片），descKey = 行副文本（readline 语义说明；
 * F 键行为随宿主程序无通用语义，不配）。 */
export type PresetTerminalKey = {
  descKey?: TranslationKey;
  group: PresetKeyGroup;
  id: string;
  label: string;
  sequence: string;
};

export type SessionQuickKey = BuiltinQuickKey | PresetTerminalKey;

/** 快捷命令（Termius snippets 对标，2026-10-11 拍板两域分离）：保存的命令文本面向
 * shell 执行，与「按键」（控制序列，面向 TUI 程序交互）分域管理、分域呈现——
 * 命令不占快捷键条，从 ⚙ 面板命令 tab 执行。group = 自由分组标签（空 = 默认组）。 */
export type QuickCommand = {
  id: string;
  label: string;
  script: string;
  group: string;
};

/** 预置终端键目录（「可用按键」分区勾选启用，全部默认停用）：行编辑 Ctrl 系 = shell
 * readline 行首/行尾/清行高频，PgUp/PgDn/Home/End 与 F 键 = TUI 程序（less/htop/mc）高频。 */
export const presetTerminalKeys: PresetTerminalKey[] = [
  {
    descKey: "session.presetDescTab",
    group: "editing",
    id: "preset-tab",
    label: "Tab",
    sequence: "\t",
  },
  {
    descKey: "session.presetDescCtrlA",
    group: "editing",
    id: "preset-ctrl-a",
    label: "Ctrl+A",
    sequence: "\x01",
  },
  {
    descKey: "session.presetDescCtrlE",
    group: "editing",
    id: "preset-ctrl-e",
    label: "Ctrl+E",
    sequence: "\x05",
  },
  {
    descKey: "session.presetDescCtrlU",
    group: "editing",
    id: "preset-ctrl-u",
    label: "Ctrl+U",
    sequence: "\x15",
  },
  {
    descKey: "session.presetDescCtrlK",
    group: "editing",
    id: "preset-ctrl-k",
    label: "Ctrl+K",
    sequence: "\x0b",
  },
  {
    descKey: "session.presetDescCtrlW",
    group: "editing",
    id: "preset-ctrl-w",
    label: "Ctrl+W",
    sequence: "\x17",
  },
  {
    descKey: "session.presetDescCtrlL",
    group: "editing",
    id: "preset-ctrl-l",
    label: "Ctrl+L",
    sequence: "\x0c",
  },
  {
    descKey: "session.presetDescCtrlR",
    group: "editing",
    id: "preset-ctrl-r",
    label: "Ctrl+R",
    sequence: "\x12",
  },
  {
    descKey: "session.presetDescPgUp",
    group: "nav",
    id: "preset-pgup",
    label: "PgUp",
    sequence: "\x1b[5~",
  },
  {
    descKey: "session.presetDescPgDn",
    group: "nav",
    id: "preset-pgdn",
    label: "PgDn",
    sequence: "\x1b[6~",
  },
  {
    descKey: "session.presetDescHome",
    group: "nav",
    id: "preset-home",
    label: "Home",
    sequence: "\x1b[H",
  },
  {
    descKey: "session.presetDescEnd",
    group: "nav",
    id: "preset-end",
    label: "End",
    sequence: "\x1b[F",
  },
  { group: "fn", id: "preset-f1", label: "F1", sequence: "\x1bOP" },
  { group: "fn", id: "preset-f2", label: "F2", sequence: "\x1bOQ" },
  { group: "fn", id: "preset-f3", label: "F3", sequence: "\x1bOR" },
  { group: "fn", id: "preset-f4", label: "F4", sequence: "\x1bOS" },
  { group: "fn", id: "preset-f5", label: "F5", sequence: "\x1b[15~" },
  { group: "fn", id: "preset-f6", label: "F6", sequence: "\x1b[17~" },
  { group: "fn", id: "preset-f7", label: "F7", sequence: "\x1b[18~" },
  { group: "fn", id: "preset-f8", label: "F8", sequence: "\x1b[19~" },
  { group: "fn", id: "preset-f9", label: "F9", sequence: "\x1b[20~" },
  { group: "fn", id: "preset-f10", label: "F10", sequence: "\x1b[21~" },
  { group: "fn", id: "preset-f11", label: "F11", sequence: "\x1b[23~" },
  { group: "fn", id: "preset-f12", label: "F12", sequence: "\x1b[24~" },
];

/** 命令 id（持久化身份，order 引用同 id 无命令排序——命令按分组分区呈现）：
 * randomUUID 优先，非 secure context 兜底（同 CustomQuickKey 时代口径）。 */
export function newCommandId(): string {
  return typeof crypto.randomUUID === "function"
    ? `cmd-${crypto.randomUUID()}`
    : `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 存量自定义键 → 快捷命令（两域分离一次性迁移）：id 复用（持久化身份延续）、
 * sequence → script、group 置空（默认组）。 */
export function migrateCustomKeysToCommands(custom: CustomQuickKey[]): QuickCommand[] {
  return custom.map((k) => ({ id: k.id, label: k.label, script: k.sequence, group: "" }));
}

/** 命令按 group 分区（分组标签首现序，items 保持原相对序）。空 group 原值保留，
 * 「默认」标题由渲染层映射。 */
export function groupedCommands(
  commands: QuickCommand[],
): { group: string; items: QuickCommand[] }[] {
  const groups: { group: string; items: QuickCommand[] }[] = [];
  const index = new Map<string, { group: string; items: QuickCommand[] }>();
  for (const cmd of commands) {
    const g = index.get(cmd.group);
    if (g) {
      g.items.push(cmd);
    } else {
      const fresh = { group: cmd.group, items: [cmd] };
      index.set(cmd.group, fresh);
      groups.push(fresh);
    }
  }
  return groups;
}

/** 键显示文案单源（快捷键条 + 编辑面板共用）：内置 = i18n，预置键 = 裸键帽名。 */
export function quickKeyLabel(key: SessionQuickKey, t: (k: TranslationKey) => string): string {
  return "labelKey" in key ? t(key.labelKey) : key.label;
}

/** 键 aria 文案单源：内置 = ariaLabelKey，预置键 = 与显示文案同文。 */
export function quickKeyAria(key: SessionQuickKey, t: (k: TranslationKey) => string): string {
  return "ariaLabelKey" in key ? t(key.ariaLabelKey) : key.label;
}

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
  { id: "left", labelKey: "quickKey.left", ariaLabelKey: "quickKey.leftAria", sequence: "\x1b[D" },
  {
    id: "right",
    labelKey: "quickKey.right",
    ariaLabelKey: "quickKey.rightAria",
    sequence: "\x1b[C",
  },
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

/**
 * 距上次 pong 是否仍在窗口内（连接存活判定，half-open 兜底）。
 *
 * readyState === OPEN 不等于连接活着——iOS Safari / 中间层（cloudflare/NAT）静默掐断
 * 时不发 close 帧，readyState 仍 OPEN 但 send 进黑洞。lastPongAt 是唯一可靠信号：
 * 心跳 25s 发 ping、服务端回 pong，超过 PONG_TIMEOUT_MS（2 倍周期）无 pong 即判死。
 * lastPongAt = 0 表示从未收到 pong（连接未建立），不新鲜。
 */
export function isConnectionFresh(lastPongAt: number, now = Date.now()) {
  return lastPongAt > 0 && now - lastPongAt <= PONG_TIMEOUT_MS;
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
  if (status === "working") {
    return "status.running";
  }

  if (status === "blocked") {
    return "status.blocked";
  }

  if (status === "done") {
    return "status.done";
  }

  if (status === "idle") {
    return "status.idle";
  }

  if (status === "running") {
    // terminal 专属（进程存活语义，不走 turn 状态机）。
    return "status.running";
  }

  if (status === "closed") {
    return "status.closed";
  }

  return "status.error";
}
