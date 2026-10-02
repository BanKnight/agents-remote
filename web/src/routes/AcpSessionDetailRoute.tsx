import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useAuiState,
  useComposerRuntime,
} from "@assistant-ui/react";
import { useT } from "../i18n";
import { useComposerKeyboardAvoidance } from "../lib/use-composer-keyboard-avoidance";
import { useComposerDraft } from "../lib/composer-draft";
import {
  decideDesktopEnterAction,
  insertNewlineAtCursor,
  useComposerEnterPolicy,
} from "../lib/composer-enter";
import { OptionMenu } from "../components/ui/option-menu";
import { ComposerStopSend } from "../components/ui/composer-actions";
import { useAcpSession, type AcpConfigOption } from "./acp-adapter";
import { VirtualizedThreadContent } from "./ClaudeSessionDetailRoute";
import type { RetryInfo } from "./claude-adapter";
import { shellSurfaceClasses } from "../components/shell/shell-primitives";

/**
 * ACP 会话 detail 主体（Phase 1 ACP PoC，workbench 面板 embedded 形态）。数据源
 * `/api/projects/:p/agent-sessions/:id/acp-stream`（acp_event 透传帧 → useAcpSession），
 * 渲染链复用 `VirtualizedThreadContent`；composer 镜像 pi 的 `ComposerWithInterruptPi`
 * 卡片结构砍附件（Phase 1 prompt 文本 only）与 selectors（ACP 深控制是 Phase 3）。
 * Stop/Send 互斥、桌面/移动 Enter 决策、iOS 键盘避让复用 claude/pi 同款逻辑。
 * 调用方须 `flex min-h-0 flex-1 flex-col overflow-hidden`（workbench AgentPanelRouter）。
 */
export function AcpChatPanel({
  projectName,
  sessionId,
}: {
  projectName: string;
  sessionId: string;
}) {
  const { runtime, connected, loading, configOptions, setConfig, onCancel } = useAcpSession(
    projectName,
    sessionId,
  );

  useComposerKeyboardAvoidance();

  // RetryInfo 是 claude 专属（ACP 无重试 UI），传 null——RetryIndicator null 时 no-op。
  const retryInfo: RetryInfo | null = null;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${shellSurfaceClasses.runtimeBody}`}
      >
        <ThreadPrimitive.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <VirtualizedThreadContent loading={loading} retryInfo={retryInfo} sessionId={sessionId} />
          <div
            data-composer-float
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+var(--composer-gap,0.5rem))] lg:static lg:z-auto lg:px-4 lg:py-2.5 lg:pb-2.5"
          >
            <div
              className="pointer-events-auto mx-auto w-full max-w-2xl transition-transform duration-200 ease-out lg:transition-none"
              style={{ transform: "translateY(calc(-1 * var(--composer-keyboard-offset, 0px)))" }}
            >
              <ComposerPrimitive.Root>
                <ComposerWithInterruptAcp
                  connected={connected}
                  configOptions={configOptions}
                  onSetConfig={setConfig}
                  onCancel={onCancel}
                  sessionId={sessionId}
                />
              </ComposerPrimitive.Root>
            </div>
          </div>
        </ThreadPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
}

/**
 * ACP composer：镜像 `ComposerWithInterruptPi` 卡片结构，砍附件按钮（Phase 1 文本 only）。
 * 底部行首渲染 agent 广告的会话配置选择器（model/mode/thinking…，OptionMenu 桌面
 * popover / 移动 sheet 自适应，trigger 布局照抄 claude ModelSelector 先例）。Stop/Send
 * 互斥、桌面/移动 Enter 决策复用同款逻辑。
 */
function ComposerWithInterruptAcp({
  connected,
  configOptions,
  onSetConfig,
  onCancel,
  sessionId,
}: {
  connected: boolean;
  configOptions: AcpConfigOption[];
  onSetConfig: (configId: string, value: string) => void;
  onCancel?: () => void;
  sessionId: string;
}) {
  const { t } = useT();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isEmpty = useAuiState((s) => s.composer.isEmpty);
  const composer = useComposerRuntime();
  const { isMac, isMobileComposer } = useComposerEnterPolicy();

  // 草稿持久化（同 Claude composer，key 按 runtime 类型 + 会话隔离）。
  useComposerDraft(`acp:${sessionId}`);

  const disconnected = !connected;
  const inputDisabled = disconnected;
  const running = isRunning;
  const hasInput = !isEmpty;
  const showSend = hasInput && isMobileComposer && !inputDisabled;
  const showStop = running && !disconnected && !showSend && !!onCancel;

  return (
    <div className="relative flex flex-col rounded-xl border border-on-surface/10 bg-surface-raised/60 shadow-2xl shadow-black/40 backdrop-blur-xl backdrop-saturate-150 transition focus-within:border-user/50 focus-within:bg-surface-raised/80 lg:bg-surface-raised/80 lg:backdrop-blur-none lg:shadow-none">
      <ComposerPrimitive.Input
        placeholder={disconnected ? t("claude.disconnected") : t("claude.inputPlaceholder")}
        disabled={inputDisabled}
        unstable_insertNewlineOnTouchEnter
        className="block min-h-[2.5rem] max-h-32 sm:min-h-[4.5rem] w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 text-sm text-on-surface placeholder:text-on-surface-muted outline-none"
        rows={1}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (e.nativeEvent.isComposing) return;
          if (inputDisabled) return;
          if (isMobileComposer) return;
          if (
            decideDesktopEnterAction({ shiftKey: e.shiftKey, metaKey: e.metaKey, isMac }) ===
            "newline"
          ) {
            if (e.shiftKey) return;
            e.preventDefault();
            insertNewlineAtCursor(e.currentTarget, (text) => composer.setText(text));
            return;
          }
          e.preventDefault();
          void composer.send();
        }}
      />
      <div className="flex h-9 items-center gap-2 px-2.5 pb-2 pt-0.5">
        {!disconnected &&
          configOptions.map((option) => (
            <AcpConfigSelector
              key={option.id}
              option={option}
              onSelect={(value) => onSetConfig(option.id, value)}
            />
          ))}
        <ComposerStopSend
          onCancel={onCancel}
          send={() => composer.send()}
          showSend={showSend}
          showStop={showStop}
        />
      </div>
    </div>
  );
}

/**
 * 单个会话配置选择器（agent 广告的一个 config option → OptionMenu）。label/描述全是
 * agent 数据（不 i18n）；trigger = `{option.name}·{当前项 name}`——ACP config 语义
 * （mode/thinking 等）无 claude 那样的产品内建认知，前缀提供上下文；currentValue 不在
 * options 里时只显示 option.name（不猜测当前项）。trigger 布局照抄 claude ModelSelector。
 */
function AcpConfigSelector({
  option,
  onSelect,
}: {
  option: AcpConfigOption;
  onSelect: (value: string) => void;
}) {
  const { t } = useT();
  const current = option.options.find((o) => o.value === option.currentValue);
  return (
    <OptionMenu
      accent="user"
      align="start"
      cancelLabel={t("cancel")}
      trigger={
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-medium text-user hover:text-user hover:bg-surface-raised/50 transition cursor-pointer"
        >
          <span className="min-w-0 truncate">
            {current ? `${option.name}·${current.name}` : option.name}
          </span>
          <svg
            className="h-3 w-3 shrink-0 opacity-60"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      }
      items={option.options.map((o) => ({
        label: o.name,
        description: o.description,
        isActive: o.value === option.currentValue,
        onSelect: () => onSelect(o.value),
      }))}
    />
  );
}
