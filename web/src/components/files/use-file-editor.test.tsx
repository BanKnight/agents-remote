// useFileEditor 的 renderMode 契约（2026-09-30「预览优先」收口）：renderMode 是 per-file
// 视图态——md/html 默认 render、其余 source，**换文件随 hook 重置**。此前重置由桌面
// FilesPanel 调用方 effect 补丁承担、MobileL3FilePreview 漏配，单实例复用换文件时残留
//（a.md 切源码 → b.md 直接以源码态打开）；下沉 hook 后本组测试守契约。
//
// mock preview/save：hook 内 useQuery 会按 path 发起 preview 请求，测试环境无 server——
// 挂 pending Promise 让 query 恒 pending（断言只关心 renderMode，不碰数据）。
import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";

mock.module("../../api/client", () => ({
  previewProjectFile: () => new Promise(() => {}),
  saveFileContent: () => new Promise(() => {}),
}));

import { useFileEditor } from "./use-file-editor";

afterEach(() => cleanup());

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderEditor(initialPath: string | null) {
  return renderHook(
    ({ path }: { path: string | null }) =>
      useFileEditor({ editable: false, path, projectName: "proj", queryScope: "test" }),
    { initialProps: { path: initialPath }, wrapper: makeWrapper() },
  );
}

describe("useFileEditor renderMode 随 path 重置", () => {
  test("md 初挂即渲染态；切 ts → source；切回 md → render（单实例复用防残留）", () => {
    const { result, rerender } = renderEditor("docs/a.md");
    expect(result.current.renderMode).toBe("render");

    rerender({ path: "src/app.ts" });
    expect(result.current.renderMode).toBe("source");

    rerender({ path: "docs/b.md" });
    expect(result.current.renderMode).toBe("render");
  });

  test("同 path 内手动切源码不被 effect 覆盖（数据到达重渲染不重置）", () => {
    const { result, rerender } = renderEditor("docs/a.md");
    act(() => result.current.onRenderModeChange("source"));

    // 同 path 重渲染（preview 数据到达 / 父级驱动）：renderMode 是用户手动视图态，保持。
    rerender({ path: "docs/a.md" });
    expect(result.current.renderMode).toBe("source");
  });

  test("关预览（null）→ source 兜底；重开 md 回渲染态", () => {
    const { result, rerender } = renderEditor("docs/a.md");
    act(() => result.current.onRenderModeChange("source"));

    rerender({ path: null });
    expect(result.current.renderMode).toBe("source");

    rerender({ path: "docs/a.md" });
    expect(result.current.renderMode).toBe("render");
  });
});
