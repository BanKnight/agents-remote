// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useAuiState,
  useComposerRuntime,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { useComposerDraft } from "./composer-draft";

// bun:test 的 afterEach 不是裸全局，RTL auto-cleanup 不注册（同 claude/pi-adapter.hook.test）。
afterEach(() => cleanup());

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.localStorage = dom.window.localStorage;
});

// 探针 hook：跑草稿持久化 + 读回 composer text 与 runtime 方法。
function useDraftProbe(storageKey: string) {
  useComposerDraft(storageKey);
  const text = useAuiState((s) => s.composer.text);
  const composer = useComposerRuntime();
  return { text, composer };
}

// 最小 external store runtime（messages 恒空——草稿持久化只触 composer 域）。
// wrapper 组件实例跨 rerender 复用 → runtime 实例稳定（key 切换场景真实语义）。
function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    const runtime = useExternalStoreRuntime({
      messages: [],
      convertMessage: (m) => m,
      onNew: () => {},
    });
    return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
  };
}

test("useComposerDraft restores persisted draft on mount and keeps it across remount", async () => {
  localStorage.setItem("composerDraft:claude:s1", "未发送的草稿");
  const first = renderHook((key: string) => useDraftProbe(key), {
    wrapper: createWrapper(),
    initialProps: "claude:s1",
  });
  await waitFor(() => expect(first.result.current.text).toBe("未发送的草稿"));
  first.unmount();

  // remount（模拟刷新 / 重开会话）：草稿仍在。
  const second = renderHook((key: string) => useDraftProbe(key), {
    wrapper: createWrapper(),
    initialProps: "claude:s1",
  });
  await waitFor(() => expect(second.result.current.text).toBe("未发送的草稿"));
});

test("useComposerDraft persists on text change and clears storage when emptied", async () => {
  localStorage.removeItem("composerDraft:claude:s1");
  const { result } = renderHook((key: string) => useDraftProbe(key), {
    wrapper: createWrapper(),
    initialProps: "claude:s1",
  });
  await waitFor(() => expect(result.current.text).toBe(""));
  expect(localStorage.getItem("composerDraft:claude:s1")).toBeNull();

  act(() => result.current.composer.setText("输入到一半"));
  await waitFor(() => expect(localStorage.getItem("composerDraft:claude:s1")).toBe("输入到一半"));

  // 发送 / 手动删空 → text="" → 落盘清档（两语义同一条数据流）。
  act(() => result.current.composer.setText(""));
  await waitFor(() => expect(localStorage.getItem("composerDraft:claude:s1")).toBeNull());
});

test("useComposerDraft does not clobber persisted draft with empty text on mount", async () => {
  localStorage.setItem("composerDraft:claude:s1", "已有草稿");
  const { result } = renderHook((key: string) => useDraftProbe(key), {
    wrapper: createWrapper(),
    initialProps: "claude:s1",
  });
  await waitFor(() => expect(result.current.text).toBe("已有草稿"));
  // mount 帧基线未建，persist 跳过；恢复后的基线 = 草稿本身——不被覆盖清档。
  expect(localStorage.getItem("composerDraft:claude:s1")).toBe("已有草稿");
});

test("useComposerDraft keeps sessions isolated when the mount slot switches key", async () => {
  localStorage.removeItem("composerDraft:claude:a");
  localStorage.removeItem("composerDraft:claude:b");
  const { result, rerender } = renderHook((key: string) => useDraftProbe(key), {
    wrapper: createWrapper(),
    initialProps: "claude:a",
  });
  await waitFor(() => expect(result.current.text).toBe(""));

  act(() => result.current.composer.setText("A 会话草稿"));
  await waitFor(() => expect(localStorage.getItem("composerDraft:claude:a")).toBe("A 会话草稿"));

  // 同一挂载槽位切到 B：A 落回 A 的档，composer 换成 B 的草稿（有则恢复），互不串。
  localStorage.setItem("composerDraft:claude:b", "B 会话草稿");
  await act(async () => rerender("claude:b"));
  await waitFor(() => expect(result.current.text).toBe("B 会话草稿"));
  expect(localStorage.getItem("composerDraft:claude:a")).toBe("A 会话草稿");
  expect(localStorage.getItem("composerDraft:claude:b")).toBe("B 会话草稿");
});
