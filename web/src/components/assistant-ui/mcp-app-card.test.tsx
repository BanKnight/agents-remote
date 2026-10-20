// @vitest-environment jsdom

// McpAppCard（MCP Apps 宿主卡片）行为单测：
// - 模板回源成功 → iframe srcdoc + load 后 postMessage 喂 structuredContent
// - structuredContent 更新（load 后）→ 重发
// - 回源失败（ui 关 / 网络）→ 不可用提示而非坏卡
//
// jsdom 全局安装与 mock 模式同 settings-notifications.test.tsx 头注；RTL cleanup 手动。
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.example/" });
dom.window.matchMedia = (() => ({ matches: false })) as unknown as typeof dom.window.matchMedia;

const DOM_GLOBAL_KEYS = [
  "Event",
  "CustomEvent",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "Node",
  "Element",
  "HTMLElement",
  "HTMLIFrameElement",
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
const actualApi = await import("../../api/client");
mock.module("../../api/client", () => ({
  ...actualApi,
  getProjectMcpUiResource: resourceMock,
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
});

function renderCard(structuredContent: unknown): {
  rerender: (sc: unknown) => void;
  view: ReturnType<typeof render>;
} {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    createElement(
      I18nProvider,
      null,
      createElement(
        QueryClientProvider,
        { client },
        createElement(McpAppCard, {
          projectName: "test",
          uri: "ui://ar-hub/wiki-page",
          structuredContent,
        }),
      ),
    ),
  );
  const rerender = (sc: unknown) => {
    view.rerender(
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
          }),
        ),
      ),
    );
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
    // Simulate the frame navigating itself to another document: contentWindow
    // becomes a NEW window, srcDoc unchanged -> load refires.
    const postSpy = mock(() => {});
    Object.defineProperty(frame, "contentWindow", {
      configurable: true,
      value: { postMessage: postSpy },
    });
    fireEvent.load(frame);
    rerender({ ...SC, title: "Arch v9" });
    // Let the update effect run before asserting the negative.
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

  test("size-changed 消息驱动 iframe 高度（source 校验）", async () => {
    const { view } = renderWindowHeightCase();
    const frame = await waitForIframe(view);
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
    await waitFor(() => expect(frame.style.height).toBe("640px"));
    // 无 source（或 source 不匹配）的消息不得驱动高度。
    window.dispatchEvent(
      new MsgEvent("message", {
        data: {
          jsonrpc: "2.0",
          method: "ui/notifications/size-changed",
          params: { height: 200 },
        },
      }),
    );
    expect(frame.style.height).toBe("640px");
  });
});

function renderWindowHeightCase() {
  return renderCard(SC);
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
