import { MODEL_1M_SUFFIX } from "../routes/claude-adapter";

/**
 * Claude 模型/权限模式显示层单源（自 ClaudeSessionDetailRoute 迁出，v1.4 批1 composer
 * 控制行换代时 composer-controls 与 ℹ 运行配置面共用，消 route ↔ 控制行循环依赖）。
 */

/** 权限模式枚举标签（会话页 selector 与 ℹ RuntimeConfigDialog 共用）。 */
export const PERMISSION_MODE_LABELS: Record<string, string> = {
  default: "Default",
  acceptEdits: "Accept Edits",
  bypassPermissions: "Bypass",
  plan: "Plan Only",
  auto: "Auto",
  dontAsk: "Don't Ask",
};

export function modelDisplayLabel(modelId: string): string {
  // CLI 原生 alias [1m] 后缀机制：剥离 [1m] 得到基础 alias，给友好名后再标回 [1m]。
  const has1m = modelId.endsWith(MODEL_1M_SUFFIX);
  const base = has1m ? modelId.slice(0, -MODEL_1M_SUFFIX.length) : modelId;
  const suffix = has1m ? ` ${MODEL_1M_SUFFIX}` : "";

  if (base === "opusplan") return `Opus Plan${suffix}`;
  // 具体 ID（含 "-"，兼容老数据 / system.init 回传具体值）原样。
  if (base.includes("-")) return modelId;
  // tier alias（opus/sonnet/haiku）→ capitalize
  return base.charAt(0).toUpperCase() + base.slice(1) + suffix;
}

// 解析「当前选择的 model alias + plan 状态」→ trigger 显示用的映射 model ID。
// 对齐 CLI getRuntimeMainLoopModel：opusplan 在 plan 模式取 opus 映射、否则取 sonnet 映射；
// 普通 tier 取自身映射。返回的是用户在 settings 里填的映射 ID（如 claude-opus-4-8[1m]），
// 而非 CLI 响应里的实际 model（可能被 baseUrl 网关改写成 glm-5.2 等）——显示层用「配置的映射」，
// 不跟随运行态。这样 plan 进/出时 trigger 随 permissionMode 即时在 opus/sonnet 映射间切换，
// 不等 assistant 消息（对齐 TUI 状态栏 onChangeAppState 即时重渲染）。
export function resolveDisplayModelId(
  alias: string | undefined,
  permissionMode: string | undefined,
  resolved: Record<string, string> | undefined,
  opusplanActive: boolean | undefined,
): string | undefined {
  if (!alias) return undefined;
  const has1m = alias.endsWith(MODEL_1M_SUFFIX);
  const base = has1m ? alias.slice(0, -MODEL_1M_SUFFIX.length) : alias;
  // Only gate on opusplanActive when the alias base is opusplan — if the
  // override isn't truly engaged the alias is a plain string and should be
  // resolved as-is (no mode-tier switching).
  const tierKey =
    opusplanActive && base === "opusplan"
      ? `${permissionMode === "plan" ? "opus" : "sonnet"}${has1m ? MODEL_1M_SUFFIX : ""}`
      : alias;
  return resolved?.[tierKey];
}

// currentModel → 菜单项 alias 的归一（ModelSelector 与 ℹ 浮层运行配置选择面共用）：
// currentModel 来源混杂——switchModel 乐观更新给 alias，system.init/seed_init 回填具体 ID
//（CLI 内部把 alias 解析成具体 ID 后上报）。菜单项是 alias，需统一成 alias 才能命中选中态。
// 具体 ID 反查 resolved 映射的 value 得 alias；找不到（老数据/未知）原样保留。
export function resolveCurrentModelAlias(
  current: string | undefined,
  resolved: Record<string, string> | undefined,
): string | undefined {
  if (!current) return current;
  // 显示层脏值兜底（2026-10-02 第十三批③⑤）：服务端已全链路 sanitize（metadata 读写边界 +
  // CLI 传参），但 relay 内存缓冲 / 历史 JSONL 里可能仍有存量脏帧。含反引号的 code span
  // 显示串剥出 base 后，base 命中 resolved key（alias 自身，如 opus[1m]）或 value（具体 ID）
  // 才接受；不含反引号的 current 同样过 token 形状闸（(id) 类帮助占位 / 文案尾巴按 undefined
  // 处理触发 fallback 链）——不让显示串进 UI。
  let s = current.trim();
  if (s.length >= 2 && s.startsWith("`") && s.endsWith("`")) s = s.slice(1, -1).trim();
  const paren = s.indexOf(" (");
  const base = paren > 0 ? s.slice(0, paren).trim() : s;
  if (resolved?.[base]) return base;
  const entry = Object.entries(resolved ?? {}).find(([, v]) => v === base);
  if (entry) return entry[0];
  // 未命中映射：形状合法的 token 原样保留（未知具体 ID / 老数据兜底语义不变）；显示串形状
  // （空白/括号/不合法字符）一律丢弃。
  return /^[A-Za-z0-9._-]+(?:\[1m\])?$/.test(base) ? base : undefined;
}
