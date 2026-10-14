import { forwardRef, useContext, useEffect, useRef, useState } from "react";

import {
  EFFORT_LEVELS,
  type ClaudeContextUsage,
  type ContextUsageCategory,
  type EffortLevel,
} from "@agents-remote/shared";

import { ClaudeBridgeContext } from "../../routes/claude-adapter";
import { useT } from "../../i18n";
import type { TranslateFn, TranslationKey } from "../../i18n/types";
import {
  modelDisplayLabel,
  PERMISSION_MODE_LABELS,
  resolveCurrentModelAlias,
  resolveDisplayModelId,
} from "@/lib/model-labels";
import { LucideIcon, type LucideIconName } from "@/components/shell/lucide-icon";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { OptionMenu } from "./option-menu";

/**
 * composer 控制行三选择器（权限/模型/推理深度；v1.4 03a 单源，自 ClaudeSessionDetailRoute
 * 迁入）。trigger = 双形态：窄端彩色图标 .iicn（紫盾/蓝星/橙脑，03a 语义色）/ 宽端文字
 * pill .ipill，由 CSS @media 1024 切换显隐（与 COMPOSER_DESKTOP_MIN_WIDTH_PX 同口径，
 * 零 JS）；菜单统一 `presentation="anchored"` 原位上方弹出（03a 窄端也是原位上方，不落
 * 底部 sheet）。选项数据与 switch 管道自原 selector 原样承接（ModelSelector/
 * PermissionModeSelector/EffortSelector 的 switching spinner 语义保留）。
 */

/** 双形态触发钮：.iicn（窄）/.ipill（宽）由 CSS media 互斥显隐，任一时刻仅一个可见，
 * button 本身做 inline-flex 正常盒（几何 = 唯一可见子）。**不能用 display:contents**——
 * 无盒元素 getBoundingClientRect() 为全零，Radix popper anchor 塌到 (0,0)，菜单被
 * collision 翻转推到视口顶（探针 anchored 断言实锤）。**forwardRef + {...rest} 透传是
 * Radix `asChild` 硬契约**（frontend-notes §5）：DropdownMenuTrigger 的 toggle/
 * aria-haspopup/aria-expanded 都经 Slot merge 进 rest——组件不透传则 trigger 永不挂
 * （探针 H4/anchored 断言会归零）。label 走 rest（children 展示用）。 */
const SelectorTrigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & {
    /** .iicn/.ipill 的语义色变体（perm/model/eff/usage）。 */
    accent: "perm" | "model" | "eff" | "usage";
    /** Lucide 图标名（icon 形态必传；badge 形态省略——前部渲染环形仪表）。 */
    icon?: LucideIconName;
    /** 宽端 pill 前置图标（原型 04f：perm/eff 有图标、model 省图标——全名已长）。 */
    pillIcon?: LucideIconName;
    /** usage 形态：badge（环形仪表）渲染进 .iicn/.ipill 前部、children（百分比）进
     * .iicn 尾部——三 selector 的 icon 形态不受影响（badge 缺省走 LucideIcon）。 */
    badge?: React.ReactNode;
    /** 三档变色 class 后缀（lvl-ok/lvl-warn/lvl-danger；CSS 按档映射语义 token）。 */
    level?: "ok" | "warn" | "danger";
  }
>(function SelectorTrigger({ accent, icon, pillIcon, badge, level, ...rest }, ref) {
  const lvl = level ? ` lvl-${level}` : "";
  return (
    <button
      ref={ref}
      className="inline-flex min-w-0 cursor-pointer disabled:cursor-default disabled:opacity-40"
      type="button"
      {...rest}
    >
      <span className={`iicn ${accent}${lvl}`}>
        {badge ?? (icon ? <LucideIcon name={icon} /> : null)}
        {badge ? <span className="u-pct">{rest.children as React.ReactNode}</span> : null}
      </span>
      <span className={`ipill ${accent}${lvl}`}>
        {badge ?? (pillIcon ? <LucideIcon name={pillIcon} /> : null)}
        <span className="min-w-0 truncate">{rest.children as React.ReactNode}</span>
        <span aria-hidden="true" className="text-[9px] opacity-75">
          ▾
        </span>
      </span>
    </button>
  );
});

/** 切换中的占位（对齐原 ModelSelector/PermissionModeSelector 的 spinner 行为）。 */
function SwitchingHint({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.65rem] font-medium text-assistant">
      <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-assistant/40 border-t-assistant" />
      {label}
    </span>
  );
}

/** anchored 菜单头（03a `.mh`：mini tint 图标 .mi + 标题；`menuHeader` 组装件）。 */
function MenuHeader({
  accent,
  icon,
  label,
}: {
  accent: string;
  icon: LucideIconName;
  label: string;
}) {
  return (
    <div aria-hidden="true" className="mh">
      <span className={`mi ${accent}`}>
        <LucideIcon name={icon} />
      </span>
      {label}
    </div>
  );
}

export function ModelSelector({
  opusplanActive,
  currentModel,
  currentResolved,
  availableModels,
  availableModelResolved,
  modelSwitchVersion,
  permissionMode,
}: {
  opusplanActive: boolean | undefined;
  currentModel?: string;
  currentResolved?: string;
  availableModels: string[];
  availableModelResolved?: Record<string, string>;
  modelSwitchVersion: number;
  permissionMode?: string;
}) {
  const { t } = useT();
  const bridge = useContext(ClaudeBridgeContext);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const preSwitchResolvedRef = useRef<string | undefined>(undefined);

  // Clear the spinner when the server confirms the switch:
  //   a) currentResolved changes from its pre-switch baseline (system.init
  //      carries the resolved model name), OR
  //   b) modelSwitchVersion increments after a control_response confirms the
  //      set_model control_request succeeded (in-process switch, no restart).
  //   c) modelSwitchVersion also covers failure: the adapter increments it
  //      on error too, so the spinner clears and the model reverts.
  const preSwitchVersionRef = useRef(modelSwitchVersion);
  useEffect(() => {
    if (!switchingTo) {
      preSwitchResolvedRef.current = undefined;
      preSwitchVersionRef.current = modelSwitchVersion;
      return;
    }
    if (preSwitchResolvedRef.current === undefined) {
      // First render after the switch was requested — capture the baseline.
      preSwitchResolvedRef.current = currentResolved;
      preSwitchVersionRef.current = modelSwitchVersion;
      return;
    }
    const resolvedChanged = currentResolved !== preSwitchResolvedRef.current;
    const versionChanged = modelSwitchVersion !== preSwitchVersionRef.current;
    if (resolvedChanged || versionChanged) {
      setSwitchingTo(null);
      preSwitchResolvedRef.current = undefined;
    }
  }, [currentResolved, switchingTo, modelSwitchVersion]);

  if (availableModels.length === 0) return null;

  const current = currentModel ?? availableModels[0];
  const currentAlias = resolveCurrentModelAlias(current, availableModelResolved);
  // checkmark 停在用户选择的 alias（opusplan/sonnet/...），不随运行态移动。
  // trigger 标签显示「解析后的映射 model ID」（对齐 CLI 状态栏渲染 runtimeModel）：
  // opusplan + plan → opus 映射、opusplan + 非 plan → sonnet 映射、普通 tier → 自身映射。
  // 解析不到（无 resolved 映射 / 老数据）才 fallback 到 alias 友好名。
  const displayModelId = resolveDisplayModelId(
    currentAlias,
    permissionMode,
    availableModelResolved,
    opusplanActive,
  );
  const label = displayModelId ?? (currentAlias ? modelDisplayLabel(currentAlias) : "");

  if (switchingTo) {
    return (
      <SwitchingHint
        label={t("claude.switchingModel", { model: modelDisplayLabel(switchingTo) })}
      />
    );
  }

  return (
    <OptionMenu
      accent="user"
      align="start"
      cancelLabel={t("cancel")}
      presentation="anchored"
      menuHeader={
        <MenuHeader accent="model" icon="sparkles" label={t("claude.composer.modelLabel")} />
      }
      trigger={
        <SelectorTrigger
          accent="model"
          aria-label={t("claude.composer.modelLabel")}
          icon="sparkles"
        >
          {label}
        </SelectorTrigger>
      }
      items={availableModels.map((modelId) => ({
        label: modelDisplayLabel(modelId),
        // opusplan 无 resolved（普通/Plan 模式分别由 CLI 经 env 自选），不展示具体 ID；
        // tier alias 配对展示对应具体 ID（含 [1m]）。具体 ID（兼容老数据）无 description。
        description: availableModelResolved?.[modelId],
        isActive: modelId === currentAlias,
        onSelect: () => {
          if (bridge) {
            setSwitchingTo(modelId);
            bridge.switchModel(modelId);
          }
        },
      }))}
    />
  );
}

/** 上下文规模 → 紧凑显示串（纯函数，单测直测）。<1k 原值；<100k 一位小数 k；
 * <1M 整数 k；≥1M 一位小数 M。 */
export function formatContextTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 100_000) return `${(tokens / 1000).toFixed(1)}k`;
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

// 三档阈值（spec 4.1-3 拍板：≤70 正常 / >70 警告 / >85 危险；命名常量禁魔数）。
export const USAGE_WARN_PCT = 70;
export const USAGE_DANGER_PCT = 85;

// 分类图例映射（CLI get_context_usage categories 的稳定 name → 色点 class + i18n key）。
// 色全部走语义 token（v2-primitives.css .u-cat-* 定义 --u-dot）；CLI 终端 color 名不采。
// 未知名中性兜底（u-cat-sysprompt）。
const CONTEXT_USAGE_CATEGORY_STYLES: Record<string, { dotClass: string; i18nKey: TranslationKey }> =
  {
    "System prompt": {
      dotClass: "u-cat-sysprompt",
      i18nKey: "claude.composer.contextUsageCatSystemPrompt",
    },
    "System tools": {
      dotClass: "u-cat-systools",
      i18nKey: "claude.composer.contextUsageCatSystemTools",
    },
    "Custom agents": {
      dotClass: "u-cat-agents",
      i18nKey: "claude.composer.contextUsageCatCustomAgents",
    },
    "Memory files": {
      dotClass: "u-cat-memory",
      i18nKey: "claude.composer.contextUsageCatMemoryFiles",
    },
    Skills: { dotClass: "u-cat-skills", i18nKey: "claude.composer.contextUsageCatSkills" },
    Messages: { dotClass: "u-cat-messages", i18nKey: "claude.composer.contextUsageCatMessages" },
    "Autocompact buffer": {
      dotClass: "u-cat-buffer",
      i18nKey: "claude.composer.contextUsageCatAutocompact",
    },
    "Free space": {
      dotClass: "u-cat-free",
      i18nKey: "claude.composer.contextUsageCatFreeSpace",
    },
  };

// kind 优先于 name（buffer/free 形态固定），已知名查表，未知名中性兜底。
const categoryDotClass = (cat: ContextUsageCategory): string => {
  if (cat.kind === "buffer") return "u-cat-buffer";
  if (cat.kind === "free") return "u-cat-free";
  return CONTEXT_USAGE_CATEGORY_STYLES[cat.name]?.dotClass ?? "u-cat-sysprompt";
};

const categoryLabel = (cat: ContextUsageCategory, t: TranslateFn): string => {
  const key = CONTEXT_USAGE_CATEGORY_STYLES[cat.name]?.i18nKey;
  return key ? t(key) : cat.name;
};

/** 占用百分比 → 档位（纯函数，单测直测）。档位驱动三档变色（CSS 语义 token 映射）
 * 与浮层进度条 fill 色。 */
export function contextUsageLevel(pct: number): "ok" | "warn" | "danger" {
  if (pct > USAGE_DANGER_PCT) return "danger";
  if (pct > USAGE_WARN_PCT) return "warn";
  return "ok";
}

/** 环形仪表（spec 4.1-3）：弧 = 占用弧长（12 点起顺时针，stroke-dasharray），track =
 * 全环软色；`stroke=currentColor` 继承档位色。环心刻意不放数字/图标——SVG 需随窄端
 * 14px / 浮层 28px 双尺寸缩放，环心文字缩到不可读，百分比固定环外旁注（ZCode 同构）。 */
export function ContextUsageRing({ pct }: { pct: number }) {
  const radius = 8.25;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(pct, 100);
  return (
    <svg aria-hidden="true" className="u-ring" viewBox="0 0 22 22">
      <circle className="u-ring-track" cx="11" cy="11" r={radius} />
      {/* filled=0 不渲染弧：round linecap 对零长 dash 仍画出一个档色残点。 */}
      {filled > 0 ? (
        <circle
          className="u-ring-arc"
          cx="11"
          cy="11"
          r={radius}
          strokeDasharray={`${(filled / 100) * circumference} ${circumference}`}
          transform="rotate(-90 11 11)"
        />
      ) : null}
    </svg>
  );
}

/** 上下文占用指示（统一会话标量管道第一个标量的显示端）。环形仪表 trigger + 族A
 * 锚定浮层（进度条 + 已用/窗口上限 + 明细区）。明细区**替换式**：有 categories
 * （get_context_usage 权威分类）显示分段堆叠条 + 分类图例；无（JSONL seed 刚恢复/
 * stdout 折算帧）回退 usage 四行。无 usage 数据（未有 assistant 消息）不渲染。
 * **布局交调用方**：本组件不带 ml-auto——.send2 也是 margin-left:auto，两个
 * auto margin 会均分剩余空间把本组件推到正中；「右组」由调用方把本组件与 Stop/Send
 * 同包一个 ml-auto 容器实现（容器内无剩余空间，.send2 的 auto 归零）。 */
export function ContextUsageIndicator({ contextUsage }: { contextUsage?: ClaudeContextUsage }) {
  const { t } = useT();
  if (!contextUsage || contextUsage.contextWindow <= 0) return null;
  const pct = (contextUsage.contextTokens / contextUsage.contextWindow) * 100;
  const level = contextUsageLevel(pct);
  const pctLabel = `${Math.round(pct)}%`;
  const rows: Array<[string, number]> = [
    [t("claude.composer.contextUsageInput"), contextUsage.inputTokens],
    [t("claude.composer.contextUsageCacheRead"), contextUsage.cacheReadTokens],
    [t("claude.composer.contextUsageCacheWrite"), contextUsage.cacheCreationTokens],
    [t("claude.composer.contextUsageOutput"), contextUsage.outputTokens],
  ];
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <SelectorTrigger
            accent="usage"
            aria-label={`${t("claude.composer.contextUsageLabel")} ${pctLabel}`}
            badge={<ContextUsageRing pct={pct} />}
            level={level}
          >
            {pctLabel}
          </SelectorTrigger>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className={`u-pop u-lvl-${level}`}
          // 关闭不回焦 trigger（frontend-notes §33）：Radix 默认程序化回焦 × WebKit 对
          // tap 后脚本 focus 仍判 :focus-visible → iOS PWA 关浮层后 pill 出系统蓝环；
          // 移动端无键盘焦点诉求，结构性免疫引擎分歧。
          onCloseAutoFocus={(e) => e.preventDefault()}
          side="top"
        >
          <div className="flex items-center gap-2">
            <ContextUsageRing pct={pct} />
            <span className="text-sm font-semibold tabular-nums text-ink-1">{pctLabel}</span>
            <span className="ml-auto text-xs tabular-nums text-ink-2">
              {formatContextTokens(contextUsage.contextTokens)} /{" "}
              {formatContextTokens(contextUsage.contextWindow)}
            </span>
          </div>
          {contextUsage.categories?.length ? (
            <>
              {/* 分段堆叠条：used+buffer 各占 tokens/window 宽，free 段不渲染（track 即
                  free）；宽度取窗口而非 totalTokens——分段总览覆盖整个窗口刻度。 */}
              <div className="u-bar">
                {contextUsage.categories
                  .filter((c) => c.kind !== "free" && c.tokens > 0)
                  .map((c) => (
                    <span
                      className={`u-bar-seg ${categoryDotClass(c)}`}
                      key={c.name}
                      style={{ width: `${(c.tokens / contextUsage.contextWindow) * 100}%` }}
                    />
                  ))}
              </div>
              <div className="u-rows">
                {contextUsage.categories.map((c) => (
                  <div className="u-row u-row-cat" key={c.name}>
                    <span className="u-row-name">
                      <span aria-hidden="true" className={`u-dot ${categoryDotClass(c)}`} />
                      {categoryLabel(c, t)}
                    </span>
                    <span className="u-row-val">{formatContextTokens(c.tokens)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="u-bar">
                <div className="u-bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div className="u-rows">
                {rows.map(([label, value]) => (
                  <div className="u-row" key={label}>
                    <span>{label}</span>
                    <span className="u-row-val">{formatContextTokens(value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

export function PermissionModeSelector({
  currentMode,
  availableModes,
}: {
  currentMode?: string;
  availableModes: string[];
}) {
  const { t } = useT();
  const bridge = useContext(ClaudeBridgeContext);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const modes =
    availableModes.length > 0
      ? availableModes
      : ["default", "acceptEdits", "bypassPermissions", "plan", "auto", "dontAsk"];

  const pending = currentMode === undefined;
  const mode = currentMode ?? "__pending__";
  const label = pending ? "..." : (PERMISSION_MODE_LABELS[mode] ?? mode);

  // Clear switching animation when mode changes
  useEffect(() => {
    if (switchingTo && switchingTo === currentMode) setSwitchingTo(null);
  }, [currentMode, switchingTo]);

  if (switchingTo) {
    return <SwitchingHint label={PERMISSION_MODE_LABELS[switchingTo] ?? switchingTo} />;
  }

  return (
    <OptionMenu
      accent="permission"
      align="start"
      cancelLabel={t("cancel")}
      presentation="anchored"
      menuHeader={
        <MenuHeader accent="perm" icon="shield-check" label={t("claude.composer.permLabel")} />
      }
      trigger={
        <SelectorTrigger
          accent="perm"
          aria-label={t("claude.composer.permLabel")}
          disabled={pending}
          icon="shield-check"
          pillIcon="shield-check"
        >
          {label}
        </SelectorTrigger>
      }
      items={modes.map((pmId) => ({
        label: PERMISSION_MODE_LABELS[pmId] ?? pmId,
        isActive: pmId === mode,
        onSelect: () => {
          if (bridge) {
            setSwitchingTo(pmId);
            bridge.switchPermissionMode(pmId);
          }
        },
      }))}
    />
  );
}

// Per-session runtime effort switch. Unlike model/permission (in-process), the
// CLI has no runtime effort switch on a direct-pull host, so changing effort
// relaunches the CLI (--resume + new CLAUDE_CODE_EFFORT_LEVEL) and reconnects
// the stream. The parent owns the side-effect orchestration (switch + detail
// invalidation + running-turn confirm); this component is purely presentational.
// Level values (low/medium/high/xhigh/max) are shown verbatim — they are CLI
// identifiers passed through as CLAUDE_CODE_EFFORT_LEVEL, not localized.
export function EffortSelector({
  currentEffort,
  onSelectEffort,
}: {
  currentEffort?: EffortLevel;
  onSelectEffort: (effort: EffortLevel) => void;
}) {
  const { t } = useT();
  // Default "high" matches DEFAULT_CLAUDE_RUNTIME.effort (Opus 4.8 built-in);
  // shown while the session detail is still loading.
  const current: EffortLevel = currentEffort ?? "high";
  return (
    <OptionMenu
      accent="assistant"
      align="start"
      cancelLabel={t("cancel")}
      presentation="anchored"
      menuHeader={<MenuHeader accent="eff" icon="brain" label={t("claude.composer.effortLabel")} />}
      trigger={
        <SelectorTrigger
          accent="eff"
          aria-label={t("claude.composer.effortLabel")}
          icon="brain"
          pillIcon="brain"
        >
          {current}
        </SelectorTrigger>
      }
      items={EFFORT_LEVELS.map((effort) => ({
        label: effort,
        isActive: effort === current,
        onSelect: () => onSelectEffort(effort),
      }))}
    />
  );
}
