import { useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  CODEX_PERMISSION_MODES,
  type ClaudeContextUsage,
  type CodexAccountUsage,
  type CodexPermissionMode,
} from "@agents-remote/shared";
import { useT, type TranslationKey } from "../i18n";
import { useComposerKeyboardAvoidance } from "../lib/use-composer-keyboard-avoidance";
import { useComposerInsetDebugBadge } from "../lib/use-composer-inset-debug-badge";
import { useComposerDraft } from "../lib/composer-draft";
import {
  decideDesktopEnterAction,
  insertNewlineAtCursor,
  useComposerEnterPolicy,
} from "../lib/composer-enter";
import { OptionMenu, type OptionMenuAccent } from "../components/ui/option-menu";
import { ComposerStopSend } from "../components/ui/composer-actions";
import {
  AttachmentChipRow,
  ComposerAttachMenu,
  useComposerAttachments,
} from "../components/ui/composer-attach";
import {
  ContextUsageIndicator,
  MenuHeader,
  SelectorTrigger,
} from "../components/ui/composer-controls";
import type { LucideIconName } from "../components/shell/lucide-icon";
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
  // 附件管线（claude 同款单源）：chips 状态 + takeSnapshot/clear 经 useCodexSession
  // options 注入 onNew——发送瞬间取快照组帧、成功后清 chips。
  const composerAttachments = useComposerAttachments({ projectName });
  const queryClient = useQueryClient();
  const {
    runtime,
    connected,
    loading,
    config,
    configPending,
    contextUsage,
    setConfig,
    compact,
    respondToControlRequest,
    cancelControlRequest,
    onCancel,
  } = useCodexSession(projectName, sessionId, {
    takePendingAttachments: composerAttachments.takeSnapshot,
    clearPendingAttachments: composerAttachments.clear,
    // 双模式多端跟随(claude useClaudeSession 同款):会话被其它端切成 terminal → 失效
    // detail,AgentPanelRouter 重读 mode 换渲染终端面板(本端 CodexPanel 随之分流撤下)。
    onModeConflict: () => {
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: ["projects", projectName, "agent-sessions", sessionId],
      });
    },
  });

  useComposerKeyboardAvoidance();
  useComposerInsetDebugBadge();

  // 本次挂载后曾连上过（VirtualizedThreadContent 离线条的防伪状态门）：区分首连（turns=0
  // 显骨架）与断线重连/切换会话恢复窗口（显「离线中」条）——真机反馈 2026-10-28：切换
  // 会话时 codex 面板缺「离线中…」提示，恢复的内容看起来像死机。镜像 claude 同名 ref。
  const everConnectedRef = useRef(false);
  if (connected) everConnectedRef.current = true;

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
              autoRetryEnabled
              loading={loading}
              projectName={projectName}
              retryInfo={retryInfo}
              sessionId={sessionId}
              offlineCap={!connected}
              everConnected={everConnectedRef.current}
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
                    contextUsage={contextUsage}
                    account={config?.account}
                    onCompact={compact}
                    onCancel={onCancel}
                    onSetConfig={setConfig}
                    sessionId={sessionId}
                    attachments={composerAttachments}
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
 * Codex composer：卡片结构镜像 claude composer（Enter 策略 / Stop-Send 互斥 / 键盘避让
 * / 附件 chips 全部复用）。底部行 = 附件加号 + 三个配置选择器（模型 / 推理深度 / 审批
 * 策略，SelectorTrigger 双形态——真机反馈 2026-10-28 收敛到 claude 同款 03a 单源）+
 * 右组（上下文占用环 + 发送/停止，claude 4.1-3 同款 ml-auto 容器）。配置切换是「下轮
 * 生效」（app-server 的 turn/start 覆盖语义）——configPending 期间各 trigger 挂 warning
 * 圆点 + title（布局 cue，不撒文字标签）；turn/started 后清除。
 */
function ComposerWithInterruptCodex({
  config,
  configPending,
  connected,
  contextUsage,
  account,
  onCompact,
  onSetConfig,
  onCancel,
  sessionId,
  attachments,
}: {
  config: CodexConfig | null;
  configPending: boolean;
  connected: boolean;
  contextUsage?: ClaudeContextUsage;
  /** 账号额度（批 E parity）：透传给上下文浮层额度段；非 ChatGPT 登录恒 undefined。 */
  account?: CodexAccountUsage;
  /** 压缩动作（批 E parity）：透传给上下文浮层动作行。 */
  onCompact: () => void;
  onSetConfig: (patch: CodexConfigPatch) => void;
  onCancel?: () => void;
  sessionId: string;
  /** 附件管线（claude 同款单源，发图批镜像）。 */
  attachments: ReturnType<typeof useComposerAttachments>;
}) {
  const { t } = useT();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isEmpty = useAuiState((s) => s.composer.isEmpty);
  const aui = useAui();
  const composer = aui.composer;
  const { isMac, isMobileComposer } = useComposerEnterPolicy();

  // 草稿持久化（同 claude/ACP composer，key 按 runtime 类型 + 会话隔离）。
  useComposerDraft(`codex:${sessionId}`);

  const disconnected = !connected;
  const inputDisabled = disconnected;
  const running = isRunning;
  const hasInput = !isEmpty;
  // 上传中暂缓发送（claude sendComposer 同款门）。
  const hasUploadingAttachment = attachments.attachments.some((a) => a.status === "uploading");
  const attachmentCount = attachments.attachments.length;
  // showSend 不 gate 上传中（design review L2 对齐 claude 口径）：上传只是暂缓「点击发送
  // 的实际出帧」（sendComposer 内 gate），形态保持发送键不抖动；running+uploading 同场景
  // claude 显示发送键 = 插话排队语义。
  const showSend = hasInput && !inputDisabled;
  const showStop = running && !disconnected && !showSend && !!onCancel;

  // 纯图片（无文本）发送：composer.isEmpty 时 composer.send() 不触发，走 api.thread.append
  // 直驱 onNew（claude sendComposer 同款三口径：附件快照在 adapter onNew 取）。
  const sendComposer = () => {
    if (inputDisabled || hasUploadingAttachment) return;
    if (attachmentCount > 0 && isEmpty) {
      aui.thread.append(" ");
    } else {
      composer.send();
    }
  };

  return (
    <div className="relative flex flex-col rounded-xl border border-on-surface/10 bg-surface-raised/60 shadow-2xl shadow-black/40 backdrop-blur-xl backdrop-saturate-150 transition focus-within:border-user/50 focus-within:bg-surface-raised/80 lg:bg-surface-raised/80 lg:backdrop-blur-none lg:shadow-none">
      {/* 附件 chip 行（claude 同款）：图片缩略图 / 文件名+路径，× 移除；任一上传中暂缓发送。 */}
      {attachmentCount > 0 ? (
        <AttachmentChipRow
          attachments={attachments.attachments}
          onRemove={attachments.remove}
          onRetry={attachments.retry}
          overflowCount={attachments.overflowCount}
        />
      ) : null}
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
          sendComposer();
        }}
        onPaste={(e) => {
          // 粘贴图片直进附件（claude composer 同款）：只拦含图片文件的 paste。
          const items = e.clipboardData?.items;
          if (!items) return;
          const files: File[] = [];
          for (const item of items) {
            if (item.kind !== "file") continue;
            const file = item.getAsFile();
            if (file && file.type.startsWith("image/")) files.push(file);
          }
          if (files.length > 0) {
            e.preventDefault();
            attachments.pick(files);
          }
        }}
      />
      <div className="flex h-9 items-center gap-2 px-2.5 pb-2 pt-0.5">
        {/* 顺序对齐 claude/03a 口径：附件加号 → 权限 → 模型 → 深度 → send2。 */}
        <ComposerAttachMenu onFiles={attachments.pick} />
        {!disconnected && config ? (
          <>
            <CodexPermissionSelector
              config={config}
              onSelect={onSetConfig}
              pending={configPending}
            />
            <CodexModelSelector config={config} onSelect={onSetConfig} pending={configPending} />
            <CodexEffortSelector config={config} onSelect={onSetConfig} pending={configPending} />
          </>
        ) : null}
        {/* 右组同包 ml-auto 容器（claude composer 同款）：.send2 自身也是 margin-left:auto，
            两个 auto margin 会均分剩余空间把 Stop/Send 推到正中；容器内无剩余空间，.send2
            的 auto 归零。 */}
        <div className="ml-auto flex items-center gap-2">
          <ContextUsageIndicator
            account={account}
            compactDisabled={running || disconnected}
            contextUsage={contextUsage}
            onCompact={onCompact}
          />
          <ComposerStopSend
            onCancel={onCancel}
            send={sendComposer}
            showSend={showSend}
            showStop={showStop}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 单个配置选择器（SelectorTrigger 双形态 + anchored 菜单，03a 单源——claude/codex 同一
 * composer 设计语言；pill 文本 = 当前项裸值，语义由 accent 色 + 图标承载）。options 为
 * 空时整体不渲染（不伪造能力）。pending = 当前值尚未生效（下轮 turn 应用）：trigger 挂
 * warning 圆点（trailing 插槽，形态无关尾缀）+ title，不用文字标签。
 */
function CodexConfigSelector({
  label,
  accent,
  icon,
  pillIcon,
  currentLabel,
  activeValue,
  options,
  onSelect,
  pending,
}: {
  label: string;
  /** 03a 语义色（.iicn/.ipill/.mh 三处共用）。 */
  accent: "model" | "eff" | "perm";
  icon: LucideIconName;
  /** 宽端 pill 前置图标（原型 04f 口径：model 全名已长省图标——claude 同款）。 */
  pillIcon?: LucideIconName;
  currentLabel: string;
  /** 当前选中项的 value（菜单勾选按 value）。 */
  activeValue: string;
  options: { value: string; label: string; description?: string }[];
  onSelect: (value: string) => void;
  /** 配置已写、等下一轮 turn 应用（下轮生效 cue）。 */
  pending?: boolean;
}) {
  const { t } = useT();
  const nextTurnHint = t("workbench.codexConfigNextTurn");
  // 菜单高亮色按语义分流（claude 同款三色：模型 cyan / 深度琥珀 / 权限紫）——MenuHeader
  // 用设计语义键（model/eff/perm），OptionMenu accent 用三值角色色（design review L1）。
  const menuAccent: OptionMenuAccent =
    accent === "model" ? "user" : accent === "eff" ? "assistant" : "permission";
  return (
    <OptionMenu
      accent={menuAccent}
      align="start"
      cancelLabel={t("cancel")}
      presentation="anchored"
      menuHeader={<MenuHeader accent={accent} icon={icon} label={label} />}
      trigger={
        <SelectorTrigger
          accent={accent}
          // pending 提示由 title + 圆点承载（design review L3：aria-label 恒为 label，
          // 不拼全角括号——en 环境产出混合全角括号）。
          aria-label={label}
          icon={icon}
          pillIcon={pillIcon}
          title={pending ? nextTurnHint : undefined}
          trailing={
            pending ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-warning"
                aria-hidden="true"
                data-pending="true"
              />
            ) : null
          }
        >
          {currentLabel || label}
        </SelectorTrigger>
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
      accent="model"
      icon="sparkles"
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
  // 当前 thread 回读的模型可能不在 model/list 目录（旧 thread 的账号默认模型，如
  // gpt-5.4 不在 0.163 目录——真机反馈 2026-10-28「缺推理深度设置」根因），此时不能
  // 整个卸载选择器：efforts 档位词表跨模型通用（low/medium/high…，model/list fixtures
  // 实证），取目录首个非空词表兜底渲染。
  const efforts = model?.supportedReasoningEfforts.length
    ? model.supportedReasoningEfforts
    : (config.models.find((m) => m.supportedReasoningEfforts.length > 0)
        ?.supportedReasoningEfforts ?? []);
  if (efforts.length === 0) return null;
  const current = config.current.effort ?? model?.defaultReasoningEffort ?? "";
  return (
    <CodexConfigSelector
      accent="eff"
      icon="brain"
      pillIcon="brain"
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
      accent="perm"
      icon="shield-check"
      pillIcon="shield-check"
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
