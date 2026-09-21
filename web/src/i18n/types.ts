import type { en } from "./en";

export type Language = "en" | "zh";

/**
 * 语言偏好（07 设置「语言」三态，spec §3.6）：system = 跟随系统（无存储 / 显式选回），
 * zh/en = 用户显式选择。`lang` 恒为 resolve 后的实际语言，UI 只消费它。
 */
export type LanguagePref = "system" | Language;

export type TranslationKey = keyof typeof en;

export type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

export type I18nContextValue = {
  lang: Language;
  pref: LanguagePref;
  setLang: (pref: LanguagePref) => void;
  t: TranslateFn;
};
