import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import type { ITheme, Terminal } from "@xterm/xterm";
import { JSDOM } from "jsdom";
import type { RefObject } from "react";
import { readTerminalTheme, useTerminalTheme } from "./SessionDetailRoute";

// bun:test 无内置 jsdom 环境（@vitest-environment 指令不被识别），手动建 JSDOM 并挂到
// globalThis（use-mobile-exit-close.test.ts 同款范式）。每个 test 一个新干净 DOM。
beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.navigator = dom.window.navigator as unknown as Navigator;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(
    dom.window,
  ) as unknown as typeof getComputedStyle;
});

afterEach(() => {
  // bun-test-rtl-cleanup-not-automatic：bun:test 下 RTL auto-cleanup 静默失效，手动清理。
  cleanup();
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { document?: unknown }).document;
  delete (globalThis as unknown as { getComputedStyle?: unknown }).getComputedStyle;
});

/** jsdom 不加载 index.css，token 值由 inline style 注入（映射逻辑照测；真实值交浏览器探针）。 */
function setTokens(values: Record<string, string>) {
  const el = document.documentElement;
  for (const [k, v] of Object.entries(values)) el.style.setProperty(k, v);
}

/** 与 index.css :root（light）一致的设计值。 */
const LIGHT: Record<string, string> = {
  "--code-text": "#1e293b",
  "--primary": "#0284c7",
  "--surface": "#f6f8fb",
  "--terminal-black": "#1e293b",
  "--terminal-bright-black": "#64748b",
  "--terminal-red": "#dc2626",
  "--terminal-bright-red": "#ef4444",
  "--terminal-green": "#16a34a",
  "--terminal-bright-green": "#22c55e",
  "--terminal-yellow": "#ca8a04",
  "--terminal-bright-yellow": "#eab308",
  "--terminal-blue": "#2563eb",
  "--terminal-bright-blue": "#1d4ed8",
  "--terminal-magenta": "#9333ea",
  "--terminal-bright-magenta": "#a855f7",
  "--terminal-cyan": "#0891b2",
  "--terminal-bright-cyan": "#06b6d4",
  "--terminal-white": "#64748b",
  "--terminal-bright-white": "#0f1520",
};

/** 与 index.css .dark 一致的设计值（原 xterm 硬编码暗色调色板）。 */
const DARK: Record<string, string> = {
  "--code-text": "#d6e4f7",
  "--primary": "#7dd3fc",
  "--surface-inset": "#05080d",
  "--terminal-black": "#0f172a",
  "--terminal-bright-black": "#334155",
  "--terminal-red": "#f87171",
  "--terminal-bright-red": "#fca5a5",
  "--terminal-green": "#4ade80",
  "--terminal-bright-green": "#86efac",
  "--terminal-yellow": "#fbbf24",
  "--terminal-bright-yellow": "#fde68a",
  "--terminal-blue": "#60a5fa",
  "--terminal-bright-blue": "#93c5fd",
  "--terminal-magenta": "#c084fc",
  "--terminal-bright-magenta": "#d8b4fe",
  "--terminal-cyan": "#22d3ee",
  "--terminal-bright-cyan": "#67e8f9",
  "--terminal-white": "#cbd5e1",
  "--terminal-bright-white": "#f1f5f9",
};

describe("readTerminalTheme", () => {
  test("light：CSS 变量 → ITheme 映射 + selectionBackground=primary@25% + background=surface 实色", () => {
    setTokens(LIGHT);
    const theme = readTerminalTheme("light");
    // xterm 的 css.toColor 不支持 "transparent"（canvas 解析要求 alpha=0xFF），必须给不透明实色，
    // 否则 parseColor fallback 成 DEFAULT_BACKGROUND 纯黑。亮色 background ← --surface（浅蓝灰，
    // 比 surface-inset 灰底干净）；bright-blue 亮色 blue-700（浅底亮蓝对比不足改深一档）。
    expect(theme.background).toBe("#f6f8fb");
    expect(theme.brightBlue).toBe("#1d4ed8");
    expect(theme.foreground).toBe("#1e293b");
    expect(theme.cursor).toBe("#0284c7");
    expect(theme.selectionBackground).toBe("rgba(2, 132, 199, 0.25)");
    expect(theme.black).toBe("#1e293b");
    expect(theme.brightBlack).toBe("#64748b");
    expect(theme.red).toBe("#dc2626");
    expect(theme.green).toBe("#16a34a");
    expect(theme.brightYellow).toBe("#eab308");
    expect(theme.cyan).toBe("#0891b2");
    expect(theme.white).toBe("#64748b");
    expect(theme.brightWhite).toBe("#0f1520");
  });

  test("dark：映射 dark 值 + 读后恢复调用前 .dark class", () => {
    setTokens(DARK);
    document.documentElement.classList.add("dark");
    const theme = readTerminalTheme("dark");
    expect(theme.background).toBe("#05080d");
    expect(theme.foreground).toBe("#d6e4f7");
    expect(theme.cursor).toBe("#7dd3fc");
    expect(theme.selectionBackground).toBe("rgba(125, 211, 252, 0.25)");
    expect(theme.black).toBe("#0f172a");
    expect(theme.green).toBe("#4ade80");
    expect(theme.brightWhite).toBe("#f1f5f9");
    // finally 恢复调用前的 .dark class（不残留）
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("调用前无 .dark 时读 dark 不残留 class", () => {
    setTokens(DARK);
    readTerminalTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("selectionBackground：非 #rrggbb primary 原样兜底", () => {
    setTokens({ ...LIGHT, "--primary": "oklch(0.7 0.1 220)" });
    const theme = readTerminalTheme("light");
    expect(theme.selectionBackground).toBe("rgba(oklch(0.7 0.1 220), 0.25)");
  });
});

describe("useTerminalTheme", () => {
  const termRef = (): RefObject<Terminal | null> =>
    ({ current: { options: {} as ITheme } }) as unknown as RefObject<Terminal | null>;

  test("resolved 变化 → term.options.theme 更新（foreground 翻转）", () => {
    setTokens(LIGHT);
    const ref = termRef();
    const { rerender } = renderHook(
      ({ resolved }: { resolved: "light" | "dark" }) => useTerminalTheme(ref, resolved),
      { initialProps: { resolved: "light" } },
    );
    expect(ref.current?.options.theme?.foreground).toBe("#1e293b");
    setTokens(DARK);
    rerender({ resolved: "dark" });
    expect(ref.current?.options.theme?.foreground).toBe("#d6e4f7");
  });

  test("termRef.current 为 null 时安全不抛", () => {
    renderHook(() => useTerminalTheme({ current: null } as RefObject<Terminal | null>, "light"));
  });
});
