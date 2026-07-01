import { Claude2Chat } from "../../routes/Claude2SessionDetailRoute";

type ChatPanelProps = {
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
export function ChatPanel({ projectName, sessionId }: ChatPanelProps) {
  return <Claude2Chat embedded projectName={projectName} sessionId={sessionId} />;
}
