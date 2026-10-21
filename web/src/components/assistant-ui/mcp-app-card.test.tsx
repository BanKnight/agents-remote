// @vitest-environment jsdom

// McpAppCard（MCP Apps 宿主卡片）行为单测：
// - 模板回源成功 → iframe srcdoc + load 后 postMessage 喂 structuredContent
// - structuredContent 更新（load 后）→ 重发
// - 回源失败（ui 关 / 网络）→ 不可用提示而非坏卡
// - 反向通道（阶段 4）：ui/initialize / ping / tools/call 白名单代理 / ui/message 确认闸
//
// jsdom 全局安装与 mock 模式同 settings-notifications.test.tsx 头注；RTL cleanup 手动。
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.example/" });
dom.window.matchMedia = (() => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as unknown as typeof dom.window.matchMedia;

const DOM_GLOBAL_KEYS = [
  "Event",
  "CustomEvent",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "Node",
  "NodeFilter",
  "Element",
  "HTMLElement",
  "HTMLIFrameElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "HTMLTextAreaElement",
  "HTMLAnchorElement",
  "HTMLSelectElement",
  "HTMLLabelElement",
  "getComputedStyle",
  "MutationObserver",
] as const;

function installDomGlobals() {
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.navigator = dom.window.navigator as unknown as Navigator;
  globalThis.localStorage = dom.window.localStorage;
  for (const key of DOM_GLOBAL_KEYS) {
    globalThis[key] = dom.window[key as keyof typeof dom.window] as never;
  }
}

installDomGlobals();

const TEMPLATE_HTML =
  '<!doctype html><html><head></head><body><div id="body"></div><script>0</script></body></html>';

const resourceMock = mock(async () => ({
  mimeType: "text/html;profile=mcp-app",
  html: TEMPLATE_HTML,
}));
const toolCallMock = mock(async () => ({
  content: [{ type: "text", text: "page" }],
  structuredContent: { kind: "wiki-page", slug: "arch", title: "Arch refreshed", markdown: "# v2" },
}));
const actualApi = await import("../../api/client");
mock.module("../../api/client", () => ({
  ...actualApi,
  getProjectMcpUiResource: resourceMock,
  callProjectMcpHubTool: toolCallMock,
}));

const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { createElement } = await import("react");
const { I18nProvider } = await import("../../i18n/context");
const { McpAppCard } = await import("./mcp-app-card");

afterEach(() => cleanup());

beforeEach(() => {
  installDomGlobals();
  localStorage.setItem("lang", "zh");
  resourceMock.mockClear();
  resourceMock.mockImplementation(async () => ({
    mimeType: "text/html;profile=mcp-app",
    html: TEMPLATE_HTML,
  }));
  toolCallMock.mockClear();
});

function renderCard(
  structuredContent: unknown,
  options?: { onSendPrompt?: (text: string) => void; fill?: boolean },
): {
  rerender: (sc: unknown) => void;
  view: ReturnType<typeof render>;
} {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const el = (sc: unknown) =>
    createElement(
      I18nProvider,
      null,
      createElement(
        QueryClientProvider,
        { client },
        createElement(McpAppCard, {
          projectName: "test",
          uri: "ui://ar-hub/wiki-page",
          structuredContent: sc,
          fillHeight: options?.fill,
          onSendPrompt: options?.onSendPrompt,
        }),
      ),
    );
  const view = render(el(structuredContent));
  const rerender = (sc: unknown) => {
    view.rerender(el(sc));
  };
  return { rerender, view };
}

const SC = { kind: "wiki-page", slug: "arch", title: "Arch", markdown: "# Arch" };

describe("McpAppCard", () => {
  test("fetch 后渲染 iframe（srcdoc = 模板 html）", async () => {
    const { view } = renderCard(SC);
    await waitFor(() => expect(view.container.querySelector("iframe")).not.toBeNull());
    const frame = view.container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc") ?? frame.srcDoc).toContain("<!doctype html>");
  });

  // NOTE: jsdom auto-fires load on srcdoc iframe mount, consuming the
  // first-feed slot (fedForRef). Subsequent feeds go through the update
  // effect, which posts to the SAME window we fed — spy the native
  // contentWindow to observe them. Each re-send is 2 messages:
  // host-context-changed (theme) + tool-result (data).
  const toolResultCalls = (postSpy: { mock: { calls: unknown[][] } }) =>
    postSpy.mock.calls.filter(
      (c) => (c[0] as { method?: string })?.method === "ui/notifications/tool-result",
    );

  test("structuredContent 更新重发（ui/notifications/tool-result 形状）", async () => {
    const { rerender, view } = renderCard(SC);
    await waitFor(() => expect(view.container.querySelector("iframe")).not.toBeNull());
    const frame = view.container.querySelector("iframe") as HTMLIFrameElement;
    const nativeWin = frame.contentWindow as Window;
    const postSpy = mock(() => {});
    Object.defineProperty(nativeWin, "postMessage", { configurable: true, value: postSpy });
    rerender({ ...SC, title: "Arch v1.1" });
    await waitFor(() => expect(toolResultCalls(postSpy).length).toBe(1));
    const payload = toolResultCalls(postSpy)[0][0] as {
      jsonrpc: string;
      method: string;
      params: { structuredContent: unknown };
    };
    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.method).toBe("ui/notifications/tool-result");
    expect(payload.params.structuredContent).toEqual({ ...SC, title: "Arch v1.1" });
    // Host context rides along (theme sync).
    const methods = postSpy.mock.calls.map((c) => (c[0] as { method?: string })?.method);
    expect(methods).toContain("ui/notifications/host-context-changed");
  });

  test("multiple structuredContent updates each re-send", async () => {
    const { rerender, view } = renderCard(SC);
    await waitFor(() => expect(view.container.querySelector("iframe")).not.toBeNull());
    const frame = view.container.querySelector("iframe") as HTMLIFrameElement;
    const nativeWin = frame.contentWindow as Window;
    const postSpy = mock(() => {});
    Object.defineProperty(nativeWin, "postMessage", { configurable: true, value: postSpy });
    rerender({ ...SC, title: "Arch v2" });
    await waitFor(() => expect(toolResultCalls(postSpy).length).toBe(1));
    rerender({ ...SC, title: "Arch v3" });
    await waitFor(() => expect(toolResultCalls(postSpy).length).toBe(2));
    const second = toolResultCalls(postSpy)[1][0] as {
      params: { structuredContent: { title: string } };
    };
    expect(second.params.structuredContent.title).toBe("Arch v3");
  });

  test("same-template reload (in-frame navigation) never receives data", async () => {
    const { rerender, view } = renderCard(SC);
    await waitFor(() => expect(view.container.querySelector("iframe")).not.toBeNull());
    const frame = view.container.querySelector("iframe") as HTMLIFrameElement;
    // WindowProxy identity is stable across navigations (contentWindow returns
    // the same proxy), so a real in-frame navigation shows up as a second load
    // with the SAME window — not as a new contentWindow object. Spy the native
    // window and refire load to simulate it.
    const nativeWin = frame.contentWindow as Window;
    const postSpy = mock(() => {});
    Object.defineProperty(nativeWin, "postMessage", { configurable: true, value: postSpy });
    fireEvent.load(frame); // same srcDoc refire = in-frame navigation
    rerender({ ...SC, title: "Arch v9" });
    // Let the update effect run before asserting the negative.
    await new Promise((r) => setTimeout(r, 30));
    expect(postSpy).toHaveBeenCalledTimes(0);
    // Reverse channel is revoked too: requests from the navigated document
    // (same WindowProxy) get no reply.
    window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        source: nativeWin,
        data: { jsonrpc: "2.0", id: 99, method: "ping" },
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(postSpy).toHaveBeenCalledTimes(0);
  });

  test("回源失败显示不可用提示（非坏卡）", async () => {
    resourceMock.mockImplementation(async () => {
      throw new Error("404");
    });
    const { view } = renderCard(SC);
    await waitFor(() => expect(view.container.textContent).toContain("应用视图不可用"));
    expect(view.container.querySelector("iframe")).toBeNull();
  });

  test("size-changed 消息驱动 iframe 高度（钳高 + source 校验）", async () => {
    const { view } = renderWindowHeightCase();
    const frame = await waitForIframe(view);
    const win = frame.contentWindow as Window;
    const MsgEvent = dom.window.MessageEvent;
    const send = (height: number, withSource = true) =>
      window.dispatchEvent(
        new MsgEvent("message", {
          ...(withSource ? { source: win } : {}),
          data: {
            jsonrpc: "2.0",
            method: "ui/notifications/size-changed",
            params: { height },
          },
        }),
      );
    // 上报超上限 → 钳到 FRAME_MAX_HEIGHT_PX（420），内容超出在 iframe 文档内滚。
    send(640.4);
    await waitFor(() => expect(frame.style.height).toBe("420px"));
    // 未触顶透传。
    send(380);
    await waitFor(() => expect(frame.style.height).toBe("380px"));
    // 无 source（或 source 不匹配）的消息不得驱动高度。
    send(200, false);
    expect(frame.style.height).toBe("380px");
  });

  test("fillHeight（全屏放大态）忽略上报高度 + 去 mt-2", async () => {
    const { view } = renderWindowHeightCase({ fill: true });
    const frame = await waitForIframe(view);
    expect(frame.className).not.toContain("mt-2");
    const win = frame.contentWindow as Window;
    const MsgEvent = dom.window.MessageEvent;
    window.dispatchEvent(
      new MsgEvent("message", {
        source: win,
        data: {
          jsonrpc: "2.0",
          method: "ui/notifications/size-changed",
          params: { height: 640.4 },
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(frame.style.height).toBe("");
  });
});

// 阶段 4 反向通道：帧内 JSON-RPC 请求（id+method）由 latest-ref dispatcher 处理，
// 应答走原生 contentWindow.postMessage。spy 原生 postMessage 后从 frame window
// 派发请求消息，断言按 id 回包的 result/error。
describe("McpAppCard reverse channel", () => {
  const postFromFrame = (frame: HTMLIFrameElement, data: unknown) => {
    window.dispatchEvent(
      new dom.window.MessageEvent("message", { source: frame.contentWindow as Window, data }),
    );
  };
  const replyFor = (
    postSpy: { mock: { calls: unknown[][] } },
    id: number,
  ): { result?: unknown; error?: { code: number; message: string } } | undefined => {
    const hits = postSpy.mock.calls
      .filter((c) => (c[0] as { id?: number })?.id === id)
      .map((c) => c[0] as { result?: unknown; error?: { code: number; message: string } });
    return hits[0];
  };

  // 已喂过数据的卡片（jsdom 自动 load 消耗首喂槽）+ 原生 postMessage spy。
  async function fedCard(options?: { onSendPrompt?: (text: string) => void }) {
    const rendered = renderCard(SC, options);
    const frame = await waitForIframe(rendered.view);
    const postSpy = mock(() => {});
    Object.defineProperty(frame.contentWindow, "postMessage", {
      configurable: true,
      value: postSpy,
    });
    return { frame, postSpy, view: rendered.view };
  }

  test("ui/initialize 应答 hostInfo + hostContext（无确认框）", async () => {
    const { frame, postSpy } = await fedCard();
    postFromFrame(frame, {
      jsonrpc: "2.0",
      id: 1,
      method: "ui/initialize",
      params: { appInfo: { name: "ar-wiki-page" }, protocolVersion: "2026-01-26" },
    });
    await waitFor(() => expect(replyFor(postSpy, 1)).toBeDefined());
    const result = replyFor(postSpy, 1)?.result as {
      protocolVersion: string;
      hostInfo: { name: string };
      hostCapabilities: { message: Record<string, never> };
      hostContext: { theme: string; locale: string };
    };
    expect(result.protocolVersion).toBe("2026-01-26");
    expect(result.hostInfo.name).toBe("agents-remote");
    expect(result.hostCapabilities).toEqual({ message: {} });
    expect(result.hostContext.theme).toBe("dark");
    // App language preference (localStorage lang=zh), not navigator.language.
    expect(result.hostContext.locale).toBe("zh");
    expect(document.body.textContent).not.toContain("发送到会话");
  });

  test("ping 应答空 result；未知方法应答 -32601", async () => {
    const { frame, postSpy } = await fedCard();
    postFromFrame(frame, { jsonrpc: "2.0", id: 2, method: "ping" });
    postFromFrame(frame, { jsonrpc: "2.0", id: 3, method: "resources/read", params: {} });
    await waitFor(() => expect(replyFor(postSpy, 3)).toBeDefined());
    expect(replyFor(postSpy, 2)?.result).toEqual({});
    expect(replyFor(postSpy, 3)?.error?.code).toBe(-32601);
  });

  test("tools/call 白名单内代理 api 并回 CallToolResult", async () => {
    const { frame, postSpy } = await fedCard();
    postFromFrame(frame, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "wiki_read_page", arguments: { slug: "arch" } },
    });
    await waitFor(() => expect(replyFor(postSpy, 4)).toBeDefined());
    expect(toolCallMock).toHaveBeenCalledWith("test", "wiki_read_page", { slug: "arch" });
    expect(replyFor(postSpy, 4)?.result).toEqual(await toolCallMock.mock.results[0]!.value);
  });

  test("tools/call 白名单外应答 -32602 且不触 api", async () => {
    const { frame, postSpy } = await fedCard();
    postFromFrame(frame, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "fs_read", arguments: {} },
    });
    await waitFor(() => expect(replyFor(postSpy, 5)).toBeDefined());
    expect(replyFor(postSpy, 5)?.error?.code).toBe(-32602);
    expect(toolCallMock).not.toHaveBeenCalled();
  });

  test("ui/message 确认后回调 onSendPrompt 并回 {}", async () => {
    const onSendPrompt = mock(() => {});
    const { frame, postSpy } = await fedCard({ onSendPrompt });
    postFromFrame(frame, {
      jsonrpc: "2.0",
      id: 6,
      method: "ui/message",
      params: { role: "user", content: { type: "text", text: "解释一下架构" } },
    });
    // 确认框出现（用户同意闸，SEP-1865 host SHOULD gate）。
    await waitFor(() => expect(document.body.textContent).toContain("发送到会话"));
    const sendButton = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "发送",
    );
    expect(sendButton).toBeDefined();
    fireEvent.click(sendButton as HTMLElement);
    await waitFor(() => expect(onSendPrompt).toHaveBeenCalledWith("解释一下架构"));
    await waitFor(() => expect(replyFor(postSpy, 6)?.result).toEqual({}));
  });

  test("ui/message 取消应答 -32600 且不发送", async () => {
    const onSendPrompt = mock(() => {});
    const { frame, postSpy } = await fedCard({ onSendPrompt });
    postFromFrame(frame, {
      jsonrpc: "2.0",
      id: 7,
      method: "ui/message",
      params: { role: "user", content: { type: "text", text: "取消我" } },
    });
    await waitFor(() => expect(document.body.textContent).toContain("发送到会话"));
    const cancelButton = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "取消",
    );
    fireEvent.click(cancelButton as HTMLElement);
    await waitFor(() => expect(replyFor(postSpy, 7)?.error?.code).toBe(-32600));
    expect(onSendPrompt).not.toHaveBeenCalled();
  });

  test("无 onSendPrompt 时 ui/message 应答 -32600（无确认框）", async () => {
    const { frame, postSpy } = await fedCard();
    postFromFrame(frame, {
      jsonrpc: "2.0",
      id: 8,
      method: "ui/message",
      params: { role: "user", content: { type: "text", text: "无处可发" } },
    });
    await waitFor(() => expect(replyFor(postSpy, 8)?.error?.code).toBe(-32600));
    expect(document.body.textContent).not.toContain("发送到会话");
  });
});

function renderWindowHeightCase(options?: { fill?: boolean }) {
  return renderCard(SC, options);
}

async function waitForIframe(view: ReturnType<typeof render>) {
  await waitFor(() => expect(view.container.querySelector("iframe")).not.toBeNull());
  return view.container.querySelector("iframe") as HTMLIFrameElement;
}

// Integration: tool-card metadata.custom -> renderer props -> HubWikiPageToolUI.
// Guards the cross-layer seam where structuredContent was silently dropped
// (2026-10-20 code-review P0: card path was unreachable in production).
const { buildToolCardToolProps, getToolRenderer } = await import("./tool-ui-registry");
const { ClaudeBridgeContext } = await import("../../routes/claude-adapter");

const WIKI_TOOL = "mcp__ar-hub__wiki_read_page";
const WIKI_CUSTOM = {
  argsText: JSON.stringify({ slug: "arch" }),
  result: "ok",
  structuredContent: SC,
};

describe("MCP Apps tool-card integration", () => {
  test("buildToolCardToolProps forwards structuredContent into metadata", () => {
    const props = buildToolCardToolProps(WIKI_CUSTOM, WIKI_TOOL);
    const metadata = props.metadata as Record<string, unknown>;
    expect(metadata.structuredContent).toEqual(SC);

    const plain = buildToolCardToolProps({ result: "x" }, "Bash");
    expect((plain.metadata as Record<string, unknown>).structuredContent).toBeUndefined();
  });

  test("HubWikiPageToolUI renders sandboxed iframe from built props", async () => {
    const HubRenderer = getToolRenderer(WIKI_TOOL);
    const props = buildToolCardToolProps(WIKI_CUSTOM, WIKI_TOOL);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      createElement(
        I18nProvider,
        null,
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            ClaudeBridgeContext.Provider,
            { value: { projectName: "test" } },
            createElement(HubRenderer as never, props as never),
          ),
        ),
      ),
    );
    await waitFor(() => expect(view.container.querySelector("iframe")).not.toBeNull());
    const frame = view.container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc") ?? "").toContain("<!doctype html>");
  });
});
