import { Claude2Chat } from "../../routes/Claude2SessionDetailRoute";
import { SessionDetail } from "../../routes/SessionDetailRoute";

type PanelProps = {
  projectName: string;
  sessionId: string;
  /** 省略面板自带 header（桌面右工作区 + 移动端聚焦态用）；透传给 Claude2Chat/SessionDetail。默认 false。 */
  embeddedHeader?: boolean;
};

/**
 * claude2 实例面板（workbench 中栏，设计文档 §4）。
 *
 * 复用 Claude2Chat 的 embedded 模式：跳过 ShellLayout/sidebar，直接渲染聊天主体
 *（ChatHeader + AssistantRuntimeProvider + thread + composer），由 WorkbenchShell 提供外壳。
 * AssistantRuntimeProvider 在 Claude2Chat 内部，每面板独立 runtime，天然支持多实例（Stage 4）。
 *
 * 注：closeSession.onSuccess 已统一导航到 /projects/$key（Phase 4 URL 统一）。embedded 模式下
 * ChatHeader 隐藏自带 close，close 由 SplitPanel 工具条承载。
 */
export function ChatPanel({ projectName, sessionId, embeddedHeader }: PanelProps) {
  return (
    <Claude2Chat
      embedded
      embeddedHeader={embeddedHeader}
      projectName={projectName}
      sessionId={sessionId}
    />
  );
}

/**
 * 非 claude2 agent（codex/claude）实例面板，复用 SessionDetail embedded 模式
 *（sessionType="agent"）。SessionDetail 内部按 sessionType 渲染 agent stream overlay
 *（runtime output + inspection + input drawer）；embedded 跳过其自带 ShellLayout/sidebar，
 * 由 WorkbenchShell 提供外壳。claude2 有专用 ChatPanel（assistant-ui chat 体验），其余
 * agent 走此 stream 面板。
 *
 * 注：closeSession.onSuccess 已统一导航到 /projects/$key[/session/$id]（Phase 4 URL 统一）。
 * embedded 模式下 header 自带 close 按钮隐藏（close 由 SplitPanel 工具条承载），但移动端 ⋯ 菜单
 * 的 Close 仍触发 closeSession，导航回项目作用域。
 */
export function AgentTerminalPanel({ projectName, sessionId, embeddedHeader }: PanelProps) {
  return (
    <SessionDetail
      embedded
      embeddedHeader={embeddedHeader}
      projectName={projectName}
      sessionId={sessionId}
      sessionType="agent"
    />
  );
}

/**
 * terminal 实例面板，复用 SessionDetail embedded 模式（sessionType="terminal"）。
 *
 * 注：closeSession.onSuccess 已统一导航到 /projects/$key[/session/$id]（Phase 4 URL 统一）。
 */
export function TerminalPanel({ projectName, sessionId, embeddedHeader }: PanelProps) {
  return (
    <SessionDetail
      embedded
      embeddedHeader={embeddedHeader}
      projectName={projectName}
      sessionId={sessionId}
      sessionType="terminal"
    />
  );
}
