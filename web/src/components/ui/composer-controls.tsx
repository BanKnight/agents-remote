import { forwardRef, useContext, useEffect, useRef, useState } from "react";

import { EFFORT_LEVELS, type EffortLevel } from "@agents-remote/shared";

import { ClaudeBridgeContext } from "../../routes/claude-adapter";
import { useT } from "../../i18n";
import {
  modelDisplayLabel,
  PERMISSION_MODE_LABELS,
  resolveCurrentModelAlias,
  resolveDisplayModelId,
} from "@/lib/model-labels";
import { LucideIcon, type LucideIconName } from "@/components/shell/lucide-icon";
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
    /** .iicn/.ipill 的语义色变体（perm/model/eff）。 */
    accent: "perm" | "model" | "eff";
    icon: LucideIconName;
    /** 宽端 pill 前置图标（原型 04f：perm/eff 有图标、model 省图标——全名已长）。 */
    pillIcon?: LucideIconName;
  }
>(function SelectorTrigger({ accent, icon, pillIcon, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className="inline-flex min-w-0 cursor-pointer disabled:cursor-default disabled:opacity-40"
      type="button"
      {...rest}
    >
      <span className={`iicn ${accent}`}>
        <LucideIcon name={icon} />
      </span>
      <span className={`ipill ${accent}`}>
        {pillIcon ? <LucideIcon name={pillIcon} /> : null}
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
