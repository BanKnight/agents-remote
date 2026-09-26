import { ClaudeChat } from "../../routes/ClaudeSessionDetailRoute";
import { AcpChatPanel } from "../../routes/AcpSessionDetailRoute";
import { SessionDetail } from "../../routes/SessionDetailRoute";

type PanelProps = {
  projectName: string;
  sessionId: string;
};

/**
 * claude 实例面板（workbench 中栏，设计文档 §4）。
 *
 * 复用 ClaudeChat 面板主体（AssistantRuntimeProvider + thread + composer），
 * 由 WorkbenchShell 提供外壳。AssistantRuntimeProvider 在 ClaudeChat 内部，每面板独立
 * runtime，天然支持多实例（Stage 4）。
 *
 * 注：检视入口由注册表承载，close 由 tab ✕ 承担（SessionDetail 自带 header/操作区已删，
 * 2026-09-26 拍板；ClaudeChat 同款 header/壳分支同日删除）。
 */
export function ChatPanel({ projectName, sessionId }: PanelProps) {
  return <ClaudeChat projectName={projectName} sessionId={sessionId} />;
}

/**
 * 非 claude agent（codex/claude）实例面板，复用 SessionDetail 面板主体
 *（sessionType="agent"）。SessionDetail 内部按 sessionType 渲染 agent stream overlay
 *（runtime output + inspection + input drawer），由 WorkbenchShell 提供外壳。claude 有专用
 * ChatPanel（assistant-ui chat 体验），其余 agent 走此 stream 面板。
 *
 * 注：closeSession.onSuccess 已统一导航到 /projects/$key[/session/$id]（Phase 4 URL 统一）。
 * SessionDetail 自带 header/操作区已删（2026-09-25 用户拍板 A：检视入口由注册表承载，
 * close/开终端由 tab ✕ / 左总览 CreateSessionBar 承担）。
 */
export function AgentTerminalPanel({ projectName, sessionId }: PanelProps) {
  return <SessionDetail projectName={projectName} sessionId={sessionId} sessionType="agent" />;
}

/**
 * ACP（Agent Client Protocol）实例面板（Phase 1 PoC）：embedded 聊天形态（pi 同构——
 * 无 header，tab chip 提供名字），thread 复用 VirtualizedThreadContent，composer 无附件。
 */
export function AcpPanel({ projectName, sessionId }: PanelProps) {
  return <AcpChatPanel projectName={projectName} sessionId={sessionId} />;
}

/**
 * terminal 实例面板，复用 SessionDetail 面板主体（sessionType="terminal"）。
 *
 * 注：closeSession.onSuccess 已统一导航到 /projects/$key[/session/$id]（Phase 4 URL 统一）。
 */
export function TerminalPanel({ projectName, sessionId }: PanelProps) {
  return <SessionDetail projectName={projectName} sessionId={sessionId} sessionType="terminal" />;
}
