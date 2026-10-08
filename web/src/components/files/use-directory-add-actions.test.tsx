// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { JSDOM } from "jsdom";

// 内置 sibling query 的 queryFn（重名校验数据源）——mock 计数以断言启用时机。
// mock.module 全量替换 module namespace，必须 spread 原导出（new-item-sheet 等仍消费其它
// api 函数）；先取 actual 再 mock，最后动态 import 被测 hook。
const listProjectFilesMock = mock(async () => ({
  entries: [{ name: "a.ts" }, { name: "b.ts" }],
}));
const actualApi = await import("../../api/client");
mock.module("../../api/client", () => ({ ...actualApi, listProjectFiles: listProjectFilesMock }));

const { useDirectoryAddActions } = await import("./use-directory-add-actions");

afterEach(() => cleanup());

let dom: JSDOM;
beforeEach(() => {
  listProjectFilesMock.mockClear();
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.navigator = dom.window.navigator as unknown as Navigator;
  globalThis.localStorage = dom.window.localStorage;
});

function renderAdd(dir: string, enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useDirectoryAddActions({ dir, enabled, projectName: "proj" }), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

describe("useDirectoryAddActions", () => {
  test("初始态：sheet 关闭（null）、sibling query 未启用（零常态网络）", () => {
    const { result } = renderAdd("");
    expect(result.current.newItemSheet).toBeNull();
    expect(listProjectFilesMock).not.toHaveBeenCalled();
  });

  test("onNew 开启 sheet：siblingNames = 真实 files query 结果（重名校验恢复）", async () => {
    const { result } = renderAdd("");
    act(() => result.current.addProps.onNew());
    expect(result.current.newItemSheet).not.toBeNull();
    await waitFor(() => {
      const sheet = result.current.newItemSheet as { props: { siblingNames: string[] } };
      expect(sheet.props.siblingNames).toEqual(["a.ts", "b.ts"]);
    });
    expect(listProjectFilesMock).toHaveBeenCalledTimes(1);
  });

  test("enabled=false（服务器根不可写）：onNew 不开启 sheet、不发起 query", () => {
    const { result } = renderAdd("", false);
    act(() => result.current.addProps.onNew());
    act(() => result.current.addProps.onUpload());
    expect(result.current.newItemSheet).toBeNull();
    expect(listProjectFilesMock).not.toHaveBeenCalled();
  });

  test("关闭 sheet（onOpenChange(false)）后 siblingNames 归空、状态复位", async () => {
    const { result } = renderAdd("src");
    act(() => result.current.addProps.onNew());
    await waitFor(() => expect(result.current.newItemSheet).not.toBeNull());
    const sheet = result.current.newItemSheet as {
      props: { onOpenChange: (next: boolean) => void; parentPath: string };
    };
    expect(sheet.props.parentPath).toBe("src");
    act(() => sheet.props.onOpenChange(false));
    expect(result.current.newItemSheet).toBeNull();
  });

  test("uploadInput 恒挂载（hidden input，供 onUpload 触发）", () => {
    const { result } = renderAdd("");
    expect(result.current.uploadInput).not.toBeNull();
  });
});
