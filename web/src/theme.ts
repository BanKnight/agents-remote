import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect } from "react";

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "theme";
const DARK_THEME_COLOR = "#020617";
const LIGHT_THEME_COLOR = "#eef2f7";

/** 主题偏好（用户选择）。`system` = 跟随系统 prefers-color-scheme。持久化到 localStorage，
 * 与 `index.html` FOUC inline script 读同一 key（首帧前注入 `<html>.dark` class 避免 FOUC）。*/
export const themeAtom = atomWithStorage<Theme>(THEME_STORAGE_KEY, "system");

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 把用户偏好解析成实际生效的明/暗。`system` 经 matchMedia 解析。*/
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

function applyResolvedTheme(resolved: ResolvedTheme) {
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  // 清除 index.html FOUC script 设的 inline backgroundColor，让 index.css
  // `html { background-color: var(--bg-base) }` 接管（否则 inline style 会阻碍切换）。
  el.style.backgroundColor = "";
  // 同步 theme-color meta（Android 地址栏 / PWA 状态栏底色）。
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  }
}

/** 读 theme atom + setTheme + resolved。可在多处调用（纯读 + 写，无副作用）。*/
export function useTheme() {
  const [theme, setTheme] = useAtom(themeAtom);
  return { theme, setTheme, resolved: resolveTheme(theme) };
}

/** 根 effect：theme 变化 / system 模式下系统偏好变化时，把 resolved 落到 `<html>.dark`
 * class + theme-color meta。只在根挂一次（main.tsx 的 `<ThemeSync />`）。跨 tab 同步由
 * atomWithStorage 内置的 storage 事件订阅承担（一处 setTheme → 其他 tab atom 更新 → 本 effect 重跑）。*/
export function useThemeSync() {
  const [theme] = useAtom(themeAtom);
  const resolved = resolveTheme(theme);

  // theme / resolved 变化时落 class + meta。
  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  // system 模式下用户改 OS 主题时实时跟随（class 即时切换；JS 消费者下次 render 取新 resolved）。
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyResolvedTheme(mql.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);
}

/** 无渲染组件：仅在根挂 useThemeSync。平级 RouterProvider 放在 JotaiProvider 内。*/
export function ThemeSync() {
  useThemeSync();
  return null;
}
