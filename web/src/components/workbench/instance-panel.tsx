import { Claude2Chat } from "../../routes/Claude2SessionDetailRoute";
import { SessionDetail } from "../../routes/SessionDetailRoute";

type PanelProps = {
  projectName: string;
  sessionId: string;
};

/**
 * claude2 实例面板（workbench 中栏，设计文档 §4）。
 *
 * 复用 Claude2Chat 的 embedded 模式：跳过 ShellLayout/sidebar，直接渲染聊天主体
 *（ChatHeader + AssistantRuntimeProvider + thread + composer），由 WorkbenchShell 提供外壳。
 * AssistantRuntimeProvider 在 Claude2Chat 内部，每面板独立 runtime，天然支持多实例（Stage 4）。
 *
 * 注：closeSession 仍 navigate 旧 /projects/$projectName（commit ④ 生命周期迁移时统一改 workbench）。
 */
export function ChatPanel({ projectName, sessionId }: PanelProps) {
  return <Claude2Chat embedded projectName={projectName} sessionId={sessionId} />;
}

/**
 * 非 claude2 agent（codex/claude）实例面板，复用 SessionDetail embedded 模式
 *（sessionType="agent"）。SessionDetail 内部按 sessionType 渲染 agent stream overlay
 *（runtime output + inspection + input drawer）；embedded 跳过其自带 ShellLayout/sidebar，
 * 由 WorkbenchShell 提供外壳。claude2 有专用 ChatPanel（assistant-ui chat 体验），其余
 * agent 走此 stream 面板。
 *
 * 注：closeSession 仍 navigate 旧路由（commit ④ 生命周期迁移时统一改 workbench）。
 */
export function AgentTerminalPanel({ projectName, sessionId }: PanelProps) {
  return (
    <SessionDetail embedded projectName={projectName} sessionId={sessionId} sessionType="agent" />
  );
}

/**
 * terminal 实例面板，复用 SessionDetail embedded 模式（sessionType="terminal"）。
 *
 * 注：closeSession 仍 navigate 旧路由（commit ④ 生命周期迁移时统一改 workbench）。
 */
export function TerminalPanel({ projectName, sessionId }: PanelProps) {
  return (
    <SessionDetail
      embedded
      projectName={projectName}
      sessionId={sessionId}
      sessionType="terminal"
    />
  );
}
