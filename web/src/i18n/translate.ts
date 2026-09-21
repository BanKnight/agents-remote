import type { Language, LanguagePref, TranslationKey } from "./types";
import { en } from "./en";
import { zh } from "./zh";

// zh values are plain string, not readonly literals — safe cast since both objects
// share the same keys by construction (zh.ts is typed Record<TranslationKey, string>).
const translations: Record<Language, typeof en> = { en, zh: zh as typeof en };

/** 语言偏好 localStorage 键（context 写/删、本文件读——单一来源防两处漂移）。 */
export const LANG_STORAGE_KEY = "lang";

/** 系统语言 → 支持的语言（zh* → zh，其余 → en）。 */
export function systemLanguage(): Language {
  const nav = typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  return nav.startsWith("zh") ? "zh" : "en";
}

/**
 * 读语言偏好（07 设置三态）：无存储 = "system"（跟随系统）；存量 zh/en 存储 = 显式选择
 *（v1 起写入的显式选择无缝迁移为第三态，不丢用户选择）。localStorage 不可用时同回 "system"。
 */
export function resolveLangPref(): LanguagePref {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch {
    // localStorage unavailable
  }
  return "system";
}

/** 偏好 → 实际语言（system 时向 navigator 取；非浏览器环境回退 en）。 */
export function resolveLanguage(pref: LanguagePref): Language {
  return pref === "system" ? systemLanguage() : pref;
}

export function resolveLang(): Language {
  return resolveLanguage(resolveLangPref());
}

export function resolveTranslation(
  key: TranslationKey,
  params?: Record<string, string | number>,
  lang?: Language,
): string {
  const locale = lang ?? resolveLang();
  const template = translations[locale][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, param) => String(params[param] ?? ""));
}
