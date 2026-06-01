import type { en } from "./en";

export type Language = "en" | "zh";

export type TranslationKey = keyof typeof en;

export type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

export type I18nContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TranslateFn;
};
