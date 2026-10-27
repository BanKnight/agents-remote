import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { CODEX_PERMISSION_MODES, type CodexPermissionMode } from "@agents-remote/shared";
import { useT, type TranslationKey } from "../i18n";
import { useComposerKeyboardAvoidance } from "../lib/use-composer-keyboard-avoidance";
import { useComposerInsetDebugBadge } from "../lib/use-composer-inset-debug-badge";
import { useComposerDraft } from "../lib/composer-draft";
import {
  decideDesktopEnterAction,
  insertNewlineAtCursor,
  useComposerEnterPolicy,
} from "../lib/composer-enter";
import { OptionMenu } from "../components/ui/option-menu";
import { ComposerStopSend } from "../components/ui/composer-actions";
import { useCodexSession, type CodexConfig, type CodexConfigPatch } from "./codex-adapter";
import { VirtualizedThreadContent } from "./ClaudeSessionDetailRoute";
import { ClaudeBridgeContext, type RetryInfo } from "./claude-adapter";
import { shellSurfaceClasses } from "../components/shell/shell-primitives";

/**
 * Codex 会话 detail 主体（app-server 直连，workbench 面板 embedded 形态）。数据源
 * `/api/projects/:p/agent-sessions/:id/codex-stream`（codex_event 透传帧 → useCodexSession），
 * 渲染链复用 `VirtualizedThreadContent`；composer 以 `ComposerWithInterruptAcp` 为模板
 * （不强行参数化——ACP 与 codex 的配置语义不同：ACP 是 agent 广告的任意 configOptions，
 * codex 是固定的 model/effort/审批策略三件套）。
 *
 * 审批 UX 与 claude 同构：服务端把 requestApproval 转成 tool card 的 controlRequestId，
 * 渲染层（tool-ui-registry）自动出金框 + 允许/拒绝按钮；本组件只提供最小 ClaudeBridge
 * （respond/cancel → codex stream 的 respond 帧），其余 claude 专属成员 no-op。
 * 调用方须 `flex min-h-0 flex-1 flex-col overflow-hidden`（workbench AgentPanelRouter）。
 */
export function CodexChatPanel({
  projectName,
  sessionId,
}: {
  projectName: string;
  sessionId: string;
}) {
  const {
    runtime,
    connected,
    loading,
    config,
    configPending,
    setConfig,
    respondToControlRequest,
    cancelControlRequest,
    onCancel,
  } = useCodexSession(projectName, sessionId);

  useComposerKeyboardAvoidance();
  useComposerInsetDebugBadge();

  // tool card 渲染层（tool-ui-registry → ClaudeBridgeContext）唯一可达的会话上下文面。
  // 其余 claude 专属成员在 codex 语义下不存在：给 no-op 而非伪造（模型/权限切换走
  // composer 的 set_config 通道，不经 bridge）。
  const bridge = useMemo(
    () => ({
      projectName,
      sessionId,
      respondToControlRequest: (requestId: string) => respondToControlRequest(requestId),
      cancelControlRequest: (requestId: string) => cancelControlRequest(requestId),
      sendToolResult: () => {},
      sendMessage: () => {},
      switchModel: () => {},
      switchPermissionMode: () => {},
      switchEffort: () => {},
      onCompact: null,
    }),
    [projectName, sessionId, respondToControlRequest, cancelControlRequest],
  );

  // RetryInfo 是 claude 专属（codex 无重试 UI），传 null——RetryIndicator null 时 no-op。
  const retryInfo: RetryInfo | null = null;

  return (
    <ClaudeBridgeContext.Provider value={bridge}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${shellSurfaceClasses.runtimeBody}`}
        >
          <ThreadPrimitive.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <VirtualizedThreadContent
              loading={loading}
              retryInfo={retryInfo}
              sessionId={sessionId}
            />
            <div
              data-composer-float
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+var(--composer-gap,0.5rem))] lg:static lg:z-auto lg:px-4 lg:py-2.5 lg:pb-2.5"
            >
              <div
                className="pointer-events-auto mx-auto w-full max-w-2xl transition-transform duration-200 ease-out lg:transition-none"
                style={{ transform: "translateY(calc(-1 * var(--composer-keyboard-offset, 0px)))" }}
              >
                <ComposerPrimitive.Root>
                  <ComposerWithInterruptCodex
                    config={config}
                    configPending={configPending}
                    connected={connected}
                    onCancel={onCancel}
                    onSetConfig={setConfig}
                    sessionId={sessionId}
                  />
                </ComposerPrimitive.Root>
              </div>
            </div>
          </ThreadPrimitive.Root>
        </div>
      </AssistantRuntimeProvider>
    </ClaudeBridgeContext.Provider>
  );
}

/** 审批策略词 → i18n key（codex 权限模式四档，标签是产品词非 agent 数据）。 */
const PERMISSION_LABEL_KEYS: Record<CodexPermissionMode, TranslationKey> = {
  readonly: "workbench.codexPermission.readonly",
  default: "workbench.codexPermission.default",
  auto: "workbench.codexPermission.auto",
  full: "workbench.codexPermission.full",
};

/**
 * Codex composer：卡片结构镜像 ACP composer（Enter 策略 / Stop-Send 互斥 / 键盘避让
 * 全部复用）。底部行 = 三个配置选择器（模型 / 推理深度 / 审批策略）+ 发送/停止。
 * 配置切换是「下轮生效」（app-server 的 turn/start 覆盖语义）——configPending 期间
 * 各 trigger 挂 warning 圆点 + title（布局 cue，不撒文字标签）；turn/started 后清除。
 */
function ComposerWithInterruptCodex({
  config,
  configPending,
  connected,
  onSetConfig,
  onCancel,
  sessionId,
}: {
  config: CodexConfig | null;
  configPending: boolean;
  connected: boolean;
  onSetConfig: (patch: CodexConfigPatch) => void;
  onCancel?: () => void;
  sessionId: string;
}) {
  const { t } = useT();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isEmpty = useAuiState((s) => s.composer.isEmpty);
  const composer = useAui().composer;
  const { isMac, isMobileComposer } = useComposerEnterPolicy();

  // 草稿持久化（同 claude/ACP composer，key 按 runtime 类型 + 会话隔离）。
  useComposerDraft(`codex:${sessionId}`);

  const disconnected = !connected;
  const inputDisabled = disconnected;
  const running = isRunning;
  const hasInput = !isEmpty;
  const showSend = hasInput && !inputDisabled;
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
        {!disconnected && config ? (
          <>
            <CodexModelSelector config={config} onSelect={onSetConfig} pending={configPending} />
            <CodexEffortSelector config={config} onSelect={onSetConfig} pending={configPending} />
            <CodexPermissionSelector
              config={config}
              onSelect={onSetConfig}
              pending={configPending}
            />
          </>
        ) : null}
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
 * 单个配置选择器（trigger = `{label}·{当前项}`，布局照抄 claude ModelSelector / ACP
 * ConfigSelector 先例）。options 为空时整体不渲染（不伪造能力）。pending = 当前值
 * 尚未生效（下轮 turn 应用）：trigger 挂 warning 圆点 + title，不用文字标签。
 */
function CodexConfigSelector({
  label,
  currentLabel,
  activeValue,
  options,
  onSelect,
  pending,
}: {
  label: string;
  currentLabel: string;
  /** 当前选中项的 value（trigger 展示 label、菜单勾选按 value）。 */
  activeValue: string;
  options: { value: string; label: string; description?: string }[];
  onSelect: (value: string) => void;
  /** 配置已写、等下一轮 turn 应用（下轮生效 cue）。 */
  pending?: boolean;
}) {
  const { t } = useT();
  const nextTurnHint = t("workbench.codexConfigNextTurn");
  return (
    <OptionMenu
      accent="user"
      align="start"
      cancelLabel={t("cancel")}
      trigger={
        <button
          type="button"
          title={pending ? nextTurnHint : undefined}
          aria-label={pending ? `${label}（${nextTurnHint}）` : undefined}
          className="inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-medium text-user hover:text-user hover:bg-surface-raised/50 transition cursor-pointer"
        >
          <span className="min-w-0 truncate">
            {currentLabel ? `${label}·${currentLabel}` : label}
          </span>
          {pending ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-warning"
              aria-hidden="true"
              data-pending="true"
            />
          ) : null}
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
      items={options.map((o) => ({
        label: o.label,
        description: o.description,
        isActive: o.value === activeValue,
        onSelect: () => onSelect(o.value),
      }))}
    />
  );
}

function CodexModelSelector({
  config,
  onSelect,
  pending,
}: {
  config: CodexConfig;
  onSelect: (patch: CodexConfigPatch) => void;
  pending?: boolean;
}) {
  const { t } = useT();
  if (config.models.length === 0) return null;
  const current = config.models.find((m) => m.id === config.current.model);
  return (
    <CodexConfigSelector
      label={t("workbench.codexModelLabel")}
      currentLabel={current?.displayName ?? config.current.model}
      activeValue={config.current.model}
      options={config.models.map((m) => ({
        value: m.id,
        label: m.displayName,
        description: m.id,
      }))}
      onSelect={(model) => onSelect({ model })}
      pending={pending}
    />
  );
}

function CodexEffortSelector({
  config,
  onSelect,
  pending,
}: {
  config: CodexConfig;
  onSelect: (patch: CodexConfigPatch) => void;
  pending?: boolean;
}) {
  const { t } = useT();
  const model = config.models.find((m) => m.id === config.current.model);
  const efforts = model?.supportedReasoningEfforts ?? [];
  if (efforts.length === 0) return null;
  const current = config.current.effort ?? model?.defaultReasoningEffort ?? "";
  return (
    <CodexConfigSelector
      label={t("workbench.codexEffortLabel")}
      currentLabel={current}
      activeValue={current}
      options={efforts.map((effort) => ({ value: effort, label: effort }))}
      onSelect={(effort) => onSelect({ effort })}
      pending={pending}
    />
  );
}

function CodexPermissionSelector({
  config,
  onSelect,
  pending,
}: {
  config: CodexConfig;
  onSelect: (patch: CodexConfigPatch) => void;
  pending?: boolean;
}) {
  const { t } = useT();
  // codex_config.current.approvalPolicy 存的是权限模式词（readonly/default/auto/full，
  // 服务端 CODEX_PERMISSION_PRESETS 反查所得），直接作当前档位。
  const current = CODEX_PERMISSION_MODES.includes(
    config.current.approvalPolicy as CodexPermissionMode,
  )
    ? (config.current.approvalPolicy as CodexPermissionMode)
    : "default";
  return (
    <CodexConfigSelector
      label={t("workbench.codexPermissionLabel")}
      currentLabel={t(PERMISSION_LABEL_KEYS[current])}
      activeValue={current}
      options={CODEX_PERMISSION_MODES.map((mode) => ({
        value: mode,
        label: t(PERMISSION_LABEL_KEYS[mode]),
      }))}
      // 权限模式词是「审批策略 + sandbox」组合的 API 单值：双写保证 codex_config 快照一致。
      onSelect={(mode) => onSelect({ approvalPolicy: mode, sandbox: mode })}
      pending={pending}
    />
  );
}
