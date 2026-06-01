import type { Language, TranslationKey } from "./types";
import { en } from "./en";
import { zh } from "./zh";

// zh values are plain string, not readonly literals — safe cast since both objects
// share the same keys by construction (zh.ts is typed Record<TranslationKey, string>).
const translations: Record<Language, typeof en> = { en, zh: zh as typeof en };

const STORAGE_KEY = "lang";

export function resolveLang(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch {
    // localStorage unavailable
  }
  return "en";
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
