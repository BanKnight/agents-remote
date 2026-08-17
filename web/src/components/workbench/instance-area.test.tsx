import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getDefaultStore } from "jotai";
import { createElement, type ReactNode } from "react";
import { JSDOM } from "jsdom";
import type {
  AgentSession,
  ListAgentSessionsResponse,
  OverviewResponse,
} from "@agents-remote/shared";

import { usePanelMeta } from "./instance-area";
import { instanceNameMemoAtom } from "../../routes/workbench-model";
import { I18nProvider } from "../../i18n";

// usePanelMeta 的 detail 查询走 api/client（getAgentSession 等）。mock.module 全量替换 module
// namespace（pinned-sessions.test.ts 同款范式）。detail queryFn 永不该被调用（测试手动 prefetch
// 列表缓存 + disabled 读取，detail 未回是预填场景的前提）——mock 实现 throw 以暴露意外请求。
const apiMock = mock(async () => {
  throw new Error("api client should not be called in these tests");
});
mock.module("../../api/client", () => ({
  getAgentSession: apiMock,
  getTerminalSession: apiMock,
  listAgentSessions: apiMock,
  listTerminalSessions: apiMock,
  fetchOverview: apiMock,
  fetchOverviewSubtitles: apiMock,
}));

// bun:test 无内置 jsdom，手动建并挂 globalThis（session-detail.test.tsx 同款：含 navigator，
// I18nProvider 的 detectLanguage 需要 navigator.language）。
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.navigator = dom.window.navigator as unknown as Navigator;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.matchMedia = dom.window.matchMedia as unknown as typeof matchMedia;
});

afterEach(() => {
  // bun:test 下 RTL auto-cleanup 静默失效（afterEach 非裸全局）→ 手动卸载防泄漏。
  cleanup();
  apiMock.mockClear();
  // jotai 默认 store 跨测试残留（atom 初值只在首读时取 localStorage）：显式重置 +
  // 清 localStorage，防 sidecar 记忆用例污染后续用例的 memo 读取。
  getDefaultStore().set(instanceNameMemoAtom, {});
  localStorage.clear();
});

// sessionId 前缀必须匹配 inferSessionTypeFromId（agent_/terminal_），否则 sessionType
// 推断 undefined → meta undefined。
const AGENT_SESSION: AgentSession = {
  id: "agent_probe-cache-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Cached Name",
  status: "idle",
  createdAt: "2026-08-17T00:00:00.000Z",
};

// 挂载一次（renderHook 不进 waitFor 回调——每次重试都挂新树且不卸载，内存泄漏源）。
// I18nProvider 包外层（usePanelMeta 内 useT 需要）；无 JSX，用 createElement。
function mountPanelMeta(panelRef: Parameters<typeof usePanelMeta>[0], qc: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(I18nProvider, null, createElement(QueryClientProvider, { client: qc }, children));
  return renderHook(() => usePanelMeta(panelRef), { wrapper });
}

describe("usePanelMeta 列表缓存预填（detail 未回时 tab 首帧即显实例名）", () => {
  it("项目列表缓存命中：detail 未回时 label/statusDot 来自缓存 displayName/status", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await qc.prefetchQuery({
      queryKey: ["projects", "proj1", "agent-sessions"],
      queryFn: async (): Promise<ListAgentSessionsResponse> => ({ sessions: [AGENT_SESSION] }),
    });
    const { result } = mountPanelMeta(
      { kind: "session", projectName: "proj1", sessionId: AGENT_SESSION.id },
      qc,
    );
    // detail query pending（queryFn mock throw、未 await），meta 已从列表缓存预填——
    // tab 首帧即实例名，不闪 sessionId。
    expect(result.current?.label).toBe("Cached Name");
    expect(result.current?.statusDot?.label).toBeTruthy();
  });

  it("overview 缓存命中（跨项目 tab）：label 来自 overview candidate displayName", async () => {
    const overview: OverviewResponse = {
      projectNames: ["proj1"],
      candidates: [
        {
          type: "agent",
          projectName: "proj1",
          sessionId: AGENT_SESSION.id,
          displayName: "Overview Name",
          status: "running",
          provider: "claude",
        },
      ],
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await qc.prefetchQuery({
      queryKey: ["overview"],
      queryFn: async (): Promise<OverviewResponse> => overview,
    });
    const { result } = mountPanelMeta(
      { kind: "session", projectName: "proj1", sessionId: AGENT_SESSION.id },
      qc,
    );
    expect(result.current?.label).toBe("Overview Name");
    expect(result.current?.statusDot?.pulse).toBe(true);
  });

  it("缓存全 miss（刷新后直进聚焦态）：meta 仍 undefined，调用方 fallback sessionId", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = mountPanelMeta(
      { kind: "session", projectName: "proj1", sessionId: AGENT_SESSION.id },
      qc,
    );
    expect(result.current).toBeUndefined();
  });

  it("sidecar 记忆兜底（缓存全 miss + localStorage 有记忆）：label/marker 来自 memo、无 statusDot", async () => {
    // 模拟刷新后冷启动：layout 恢复了 tab、列表缓存未热，但上次会话已写回名字记忆。
    localStorage.setItem(
      "instanceNameMemo",
      JSON.stringify({
        [AGENT_SESSION.id]: { name: "Memo Name", provider: "claude", type: "agent" },
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = mountPanelMeta(
      { kind: "session", projectName: "proj1", sessionId: AGENT_SESSION.id },
      qc,
    );
    expect(result.current?.label).toBe("Memo Name");
    expect(result.current?.marker).toBeTruthy();
    // memo 只存稳定身份字段，不给 statusDot（status 高频变化，存了必过期误导）。
    expect(result.current?.statusDot).toBeUndefined();
  });

  it("权威数据到达时写回 sidecar 记忆（localStorage 持久化 displayName）", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await qc.prefetchQuery({
      queryKey: ["projects", "proj1", "agent-sessions"],
      queryFn: async (): Promise<ListAgentSessionsResponse> => ({ sessions: [AGENT_SESSION] }),
    });
    mountPanelMeta({ kind: "session", projectName: "proj1", sessionId: AGENT_SESSION.id }, qc);
    await waitFor(() => {
      const stored = localStorage.getItem("instanceNameMemo");
      expect(stored).toBeTruthy();
      const memo = JSON.parse(stored!) as Record<string, { name: string; type: string }>;
      expect(memo[AGENT_SESSION.id]?.name).toBe("Cached Name");
      expect(memo[AGENT_SESSION.id]?.type).toBe("agent");
    });
  });

  it("detail 缓存命中时覆盖列表缓存预填（detail 权威优先）", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await qc.prefetchQuery({
      queryKey: ["projects", "proj1", "agent-sessions"],
      queryFn: async (): Promise<ListAgentSessionsResponse> => ({ sessions: [AGENT_SESSION] }),
    });
    await qc.prefetchQuery({
      queryKey: ["projects", "proj1", "agent-sessions", AGENT_SESSION.id],
      queryFn: async () => ({ session: { ...AGENT_SESSION, displayName: "Detail Name" } }),
    });
    const { result } = mountPanelMeta(
      { kind: "session", projectName: "proj1", sessionId: AGENT_SESSION.id },
      qc,
    );
    await waitFor(() => expect(result.current?.label).toBe("Detail Name"));
  });
});
