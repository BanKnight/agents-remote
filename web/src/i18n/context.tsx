import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { I18nContextValue, LanguagePref, TranslateFn } from "./types";
import {
  LANG_STORAGE_KEY,
  resolveLang,
  resolveLangPref,
  resolveLanguage,
  resolveTranslation,
} from "./translate";

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * i18n provider。偏好三态（07 设置「语言」）：system（跟随系统） / zh / en。
 * setLang 写 localStorage（system 删 key：与「无存储 = system」的读取语义对齐，
 * 避免存 "system" 与存量 zh/en 判定分叉）；system 态下监听 `languagechange`，
 * 系统语言变更时实时重解析（不刷新即切换）。
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<LanguagePref>(resolveLangPref);
  const [systemLang, setSystemLang] = useState(resolveLang);

  const setLang = useCallback((next: LanguagePref) => {
    setPref(next);
    setSystemLang(resolveLanguage(next));
    try {
      if (next === "system") localStorage.removeItem(LANG_STORAGE_KEY);
      else localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    // system 偏好时跟随系统语言变更（浏览器语言设置 / OS 语言切换）。
    const handler = () => setSystemLang(resolveLanguage("system"));
    window.addEventListener("languagechange", handler);
    return () => window.removeEventListener("languagechange", handler);
  }, []);

  useEffect(() => {
    // 跨窗口同步：显式语言（zh/en）互写；清 key（登出/回 system）也同步。
    // 回 system 时一并刷新 systemLang——本窗口的 systemLang 只在挂载时取一次，
    // 而另一窗口切回 system 未必伴随本窗口的 languagechange（code review P3）。
    const handler = (e: StorageEvent) => {
      if (e.key !== LANG_STORAGE_KEY) return;
      if (e.newValue === "en" || e.newValue === "zh") setPref(e.newValue);
      else if (e.newValue === null) {
        setSystemLang(resolveLanguage("system"));
        setPref("system");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const lang = pref === "system" ? systemLang : pref;

  const t: TranslateFn = useCallback(
    (key, params) => resolveTranslation(key, params, lang),
    [lang],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ lang, pref, setLang, t }),
    [lang, pref, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}
