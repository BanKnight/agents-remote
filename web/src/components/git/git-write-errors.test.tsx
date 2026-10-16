// @vitest-environment jsdom

// git 写路径「无变更 ≠ 错误」分流单测（P3 清理批①）：commit/discard 命中语义码
// PROJECT_GIT_FILE_NOT_CHANGED / PROJECT_GIT_NOTHING_TO_COMMIT → 中性「没有变更」
//（role=status、非红字），非语义码错误保留 role=alert 红字。
//
// ⚠️ JSDOM 全局必须在「任何 DOM 依赖模块 import 之前」建好，两道模块加载时判定：
// ① @radix-ui/react-use-layout-effect 判 globalThis?.document 决定真 useLayoutEffect /
//    no-op（晚建 = Portal 恒 null 空 DOM）；
// ② react-dom 模块 init 算 canUseDOM（晚建 = false，见 typeIntoTextarea 的退化路径）。
// 故除 bun:test / jsdom 外一律动态 import（静态 import 会被提升到全局 setup 之前）。
// bun test 全进程共享模块缓存，react-dom 若被更早的测试文件在无 window 环境求值过，
// canUseDOM=false 即定格——本文件的全局 setup 只能保证单文件跑，全量跑靠
// typeIntoTextarea 双路径兜底。
// mock.module 全量替换 module namespace，必须 spread 原导出（组件还消费 isApiErrorCode
// 等真实实现）；先取 actual 再 mock，最后动态 import 被测组件。
// bun:test RTL cleanup 非自动：afterEach 手动 cleanup（防组件跨测试泄漏）。
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";

import type { GitDiffFileSummary } from "@agents-remote/shared";
import type { ReactNode } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document as unknown as Document;
globalThis.navigator = dom.window.navigator as unknown as Navigator;
globalThis.localStorage = dom.window.localStorage;
// Radix 生态（Portal/Presence/FocusScope/DismissableLayer + tabbable）直接引用
// globalThis 上的 DOM 构造器（new Event、instanceof HTMLInputElement、NodeFilter……）
// 且 dispatchEvent 只认自家 Event 实例——jsdom 只挂在 window 上，必须整组搬到
// globalThis，否则 ReferenceError / "parameter 1 is not of type 'Event'"。
for (const key of [
  "Event",
  "CustomEvent",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "InputEvent",
  "Node",
  "NodeFilter",
  "Element",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLTextAreaElement",
  "HTMLAnchorElement",
  "HTMLButtonElement",
  "HTMLIFrameElement",
  "HTMLAudioElement",
  "HTMLVideoElement",
  "HTMLTableElement",
  "DocumentFragment",
  "ShadowRoot",
  "Selection",
  "Range",
  "getComputedStyle",
  "MutationObserver",
] as const) {
  globalThis[key] = dom.window[key as keyof typeof dom.window] as never;
}

const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { createElement } = await import("react");

const commitProjectGitMock = mock(async () => {
  throw new Error("not configured");
});
const discardProjectGitMock = mock(async () => {
  throw new Error("not configured");
});
const actualApi = await import("../../api/client");
mock.module("../../api/client", () => ({
  ...actualApi,
  commitProjectGit: commitProjectGitMock,
  discardProjectGit: discardProjectGitMock,
}));

const { CommitSheet } = await import("./commit-sheet");
const { DiscardDialog } = await import("./discard-dialog");
const { I18nProvider } = await import("../../i18n");
const { ApiClientError } = actualApi;

afterEach(() => cleanup());

beforeEach(() => {
  commitProjectGitMock.mockClear();
  discardProjectGitMock.mockClear();
});

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(I18nProvider, null, createElement(QueryClientProvider, { client }, ui)),
  );
}

const changedFile: GitDiffFileSummary = {
  path: "src/a.ts",
  status: "modified",
  scope: "worktree",
  addedLines: 3,
  removedLines: 1,
};

type View = ReturnType<typeof render>;

function renderCommitSheet(): View {
  return renderWithProviders(
    createElement(CommitSheet, {
      open: true,
      onOpenChange: () => {},
      projectName: "proj",
      branch: "main",
      files: [changedFile],
    }),
  );
}

function renderDiscardDialog(): View {
  return renderWithProviders(
    createElement(DiscardDialog, {
      open: true,
      onOpenChange: () => {},
      projectName: "proj",
      branch: "main",
      file: changedFile,
    }),
  );
}

/**
 * 受控 textarea 输入，双路径自适应（跨文件模块缓存陷阱兜底）：
 * - 正常路径（react-dom 求值时 window 已在，canUseDOM=true）：input 事件驱动 onChange，
 *   后三行全是无害 no-op（focusin 在正常路径不登记、keyup 不触发 change）。
 * - 退化路径（react-dom 被更早的测试文件在无 window 环境求值，isInputEventSupported=
 *   false 永久定格）：onChange 只剩 IE polyfill——focusin 登记 activeElement
 *  （attachEvent jsdom 没有，stub 防在 React 监听器内抛 TypeError）→ prototype setter
 *   改值（绕开 React 的 value tracker 去重）→ keyup 触发 updateValueIfChanged → onChange；
 *   此时第一行才是 no-op（polyfill 不认 input 事件）。
 */
function typeIntoTextarea(ta: HTMLTextAreaElement, value: string) {
  fireEvent.input(ta, { target: { value } });
  const ieEvents = ta as unknown as { attachEvent: () => void; detachEvent: () => void };
  // detachEvent 也要 stub：下个测试的 focusin 会先对上一个测试的旧 textarea 调
  // stopWatchingForValueChange → detachEvent（jsdom 没有，不 stub 会 TypeError 被
  // 吞掉、activeElement 停在旧 fiber 上，keyup 永远判不到本测试的 textarea）。
  ieEvents.detachEvent = () => {};
  ieEvents.attachEvent = () => {};
  ta.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(ta, value);
  fireEvent.keyUp(ta);
}

/** 提交流程走到 mutation 失败落定（勾选默认 on、填必填信息、点提交钮）。 */
async function submitCommitAndFail(view: View) {
  typeIntoTextarea(view.getByLabelText("Commit message"), "msg");
  fireEvent.click(view.getByRole("button", { name: "Commit (1 files)" }));
  await waitFor(() => expect(commitProjectGitMock).toHaveBeenCalled());
}

describe("CommitSheet 无变更分流", () => {
  test("NOT_CHANGED 语义码 → 中性「没有变更」（role=status，无红字 alert）", async () => {
    commitProjectGitMock.mockImplementation(async () => {
      throw new ApiClientError("Git 提交失败: 400", "PROJECT_GIT_FILE_NOT_CHANGED");
    });
    const view = renderCommitSheet();
    await submitCommitAndFail(view);
    await waitFor(() => expect(view.getByRole("status")).toBeTruthy());
    expect(view.getByRole("status").textContent).toBe("No changes");
    expect(view.getByRole("status").className).not.toContain("text-error");
    expect(view.queryByRole("alert")).toBeNull();
  });

  test("NOTHING_TO_COMMIT 同语义族 → 同款中性文案", async () => {
    commitProjectGitMock.mockImplementation(async () => {
      throw new ApiClientError("Git 提交失败: 400", "PROJECT_GIT_NOTHING_TO_COMMIT");
    });
    const view = renderCommitSheet();
    await submitCommitAndFail(view);
    await waitFor(() => expect(view.getByRole("status")).toBeTruthy());
    expect(view.getByRole("status").textContent).toBe("No changes");
    expect(view.queryByRole("alert")).toBeNull();
  });

  test("非语义码错误 → 保留 role=alert 红字原样", async () => {
    commitProjectGitMock.mockImplementation(async () => {
      throw new ApiClientError("Git 提交失败: 500");
    });
    const view = renderCommitSheet();
    await submitCommitAndFail(view);
    await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
    expect(view.getByRole("alert").textContent).toBe("Git 提交失败: 500");
    expect(view.queryByRole("status")).toBeNull();
  });
});

describe("DiscardDialog 无变更分流", () => {
  test("NOT_CHANGED 语义码 → 中性「没有变更」（role=status，无红字 alert）", async () => {
    discardProjectGitMock.mockImplementation(async () => {
      throw new ApiClientError("Git 放弃更改失败: 400", "PROJECT_GIT_FILE_NOT_CHANGED");
    });
    const view = renderDiscardDialog();
    fireEvent.click(view.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(discardProjectGitMock).toHaveBeenCalled());
    await waitFor(() => expect(view.getByRole("status")).toBeTruthy());
    expect(view.getByRole("status").textContent).toBe("No changes");
    expect(view.queryByRole("alert")).toBeNull();
  });

  test("非语义码错误 → 保留 role=alert 红字原样", async () => {
    discardProjectGitMock.mockImplementation(async () => {
      throw new ApiClientError("Git 放弃更改失败: 500");
    });
    const view = renderDiscardDialog();
    fireEvent.click(view.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(discardProjectGitMock).toHaveBeenCalled());
    await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
    expect(view.queryByRole("status")).toBeNull();
  });
});
