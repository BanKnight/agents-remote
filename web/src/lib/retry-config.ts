import type { ClaudeAutoRetryConfig } from "@agents-remote/shared";

/**
 * 自动重试配置编辑器的 UI 纯函数层（v1.6 workspace-retry-config 控件化）。边界与档位
 * 与服务端 clamp（api/src/claude-auto-retry.ts AUTO_RETRY_*_MIN/MAX）对齐——UI 先防呆，
 * 服务端仍是最终守门。
 */

/** 次数上限 stepper 边界（= 服务端 AUTO_RETRY_MAX_PER_WINDOW_MIN/MAX）。 */
export const RETRY_MAX_PER_WINDOW_MIN = 1;
export const RETRY_MAX_PER_WINDOW_MAX = 20;

/**
 * 重试间隔档位（ms，升序；全部落在服务端 5s..1h clamp 区间内）。覆盖秒级快速重试到
 * 半小时长间隔；默认值 60_000（1m）在档内。
 */
export const RETRY_DELAY_STEPS_MS: number[] = [
  30_000, 45_000, 60_000, 120_000, 300_000, 600_000, 1_800_000,
];

/** ms → 紧凑档位文案：<1m 用秒（45s），≥1m 用整分（5m），非整分保留一位小数（1.5m）。 */
export function formatRetryDelay(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = ms / 60_000;
  return Number.isInteger(minutes) ? `${minutes}m` : `${Number(minutes.toFixed(1))}m`;
}

/** stepper 步进：clamp 到 [min,max]（连续点击越过边界时停在边界，双向防呆）。 */
export function stepRetryCount(current: number, delta: number): number {
  return Math.min(RETRY_MAX_PER_WINDOW_MAX, Math.max(RETRY_MAX_PER_WINDOW_MIN, current + delta));
}

/** 现值精确命中某档才返回档位索引（配置可能来自旧值/其他端，不在档内时选择器如实显示原值、无 ✓）。 */
export function retryDelayStepIndex(delayMs: number): number {
  return RETRY_DELAY_STEPS_MS.indexOf(delayMs);
}

/** 编辑器本地演进后的完整配置类型（控件层 commit 的载荷）。 */
export type RetryConfigDraft = ClaudeAutoRetryConfig;
