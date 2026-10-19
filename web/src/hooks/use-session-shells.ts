// 会话壳统一推送 hook（壳/内容分离，2026-10-19）：/api/sessions/stream 全量快照投影进
// 既有 ["overview"] query 缓存（单一数据管道——WS 帧只是让缓存保鲜的来源，不建第二份
// state）。REST 初值 + 10s 轮询兜底断流自愈，与 use-approvals 同范式。
import { useEffect } from "react";

import type { OverviewCandidate, OverviewResponse, SessionShell } from "@agents-remote/shared";

import { sessionsStreamUrl } from "../api/client";
import { queryClient } from "../lib/query-client";

/** 列表/detail query key 段（client.ts 同惯例）：invalidate 通道用。 */
function sessionListSegment(type: SessionShell["type"]): string {
  return type === "agent" ? "agent-sessions" : "terminal-sessions";
}

/** 候选身份键：projectName + type + sessionId 三元组（与 tab refs 同口径）。 */
function shellKey(shell: Pick<OverviewCandidate, "projectName" | "type" | "sessionId">): string {
  return `${shell.projectName}/${shell.type}/${shell.sessionId}`;
}

/**
 * 快照 → overview candidates 投影（纯函数，单测锚点）：壳快照无 subtitle（慢填充字段
 * 不入壳），从 prev candidates 按 shellKey 继承——直写裸快照会打掉已渲染的第二行。
 */
export function projectShells(
  prev: OverviewCandidate[] | undefined,
  shells: SessionShell[],
): OverviewCandidate[] {
  const subtitleByKey = new Map<string, string | undefined>();
  for (const candidate of prev ?? []) subtitleByKey.set(shellKey(candidate), candidate.subtitle);
  return shells.map((shell) => {
    const subtitle = subtitleByKey.get(shellKey(shell));
    return subtitle === undefined ? shell : { ...shell, subtitle };
  });
}

/**
 * 壳快照 diff → 需失效的 query key 集（纯函数，单测锚点）：新增/移除候选失效列表 key
 *（前缀连带 detail）；status/displayName 变化失效单个 detail key——detail query 的 60s
 * staleTime 保鲜通道（替代原 session_status 帧的实时性）。
 */
export function shellInvalidations(
  prev: OverviewCandidate[] | undefined,
  shells: SessionShell[],
): string[][] {
  const prevByKey = new Map((prev ?? []).map((c) => [shellKey(c), c]));
  const nextKeys = new Set(shells.map(shellKey));
  const seen = new Set<string>();
  const invalidations: string[][] = [];
  const push = (key: string[]) => {
    const serialized = JSON.stringify(key);
    if (seen.has(serialized)) return;
    seen.add(serialized);
    invalidations.push(key);
  };
  for (const shell of shells) {
    const before = prevByKey.get(shellKey(shell));
    if (!before) {
      push(["projects", shell.projectName, sessionListSegment(shell.type)]);
      continue;
    }
    if (before.status !== shell.status || before.displayName !== shell.displayName) {
      push(["projects", shell.projectName, sessionListSegment(shell.type), shell.sessionId]);
    }
  }
  for (const candidate of prev ?? []) {
    if (!nextKeys.has(shellKey(candidate))) {
      push(["projects", candidate.projectName, sessionListSegment(candidate.type)]);
    }
  }
  return invalidations;
}

// sessions-stream WS 单订阅（模块级引用计数，同 use-approvals）：Workbench 根常开一个
// 实例即全应用生效；断线无重连（REST 轮询兜底），onclose 清引用防二次 close。
let shellsWsRefCount = 0;
let shellsWsSocket: WebSocket | null = null;

function applyShellsFrame(frame: unknown): void {
  let shells: SessionShell[];
  try {
    const parsed = frame as { type?: string; sessions?: SessionShell[] };
    if (parsed.type !== "sessions" || !Array.isArray(parsed.sessions)) return;
    shells = parsed.sessions;
  } catch {
    return; // 非 JSON/异常帧忽略（与 use-approvals 同纪律）
  }
  const current = queryClient.getQueryData<OverviewResponse>(["overview"]);
  const prev = current?.candidates;
  queryClient.setQueryData(["overview"], {
    projectNames: current?.projectNames ?? [],
    candidates: projectShells(prev, shells),
  });
  for (const key of shellInvalidations(prev, shells)) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

function connectShellsStream(): void {
  shellsWsRefCount += 1;
  if (shellsWsSocket) return;
  const socket = new WebSocket(sessionsStreamUrl());
  shellsWsSocket = socket;
  socket.onmessage = (event) => {
    try {
      applyShellsFrame(JSON.parse(String(event.data)));
    } catch {
      // 非 JSON 帧忽略（与 use-approvals 同纪律）
    }
  };
  socket.onclose = () => {
    if (shellsWsSocket === socket) shellsWsSocket = null;
  };
}

function disconnectShellsStream(): void {
  shellsWsRefCount -= 1;
  if (shellsWsRefCount === 0 && shellsWsSocket) {
    shellsWsSocket.close();
    shellsWsSocket = null;
  }
}

/**
 * 会话壳推送订阅（Workbench 根常开）：连接即收全量快照，之后任何壳变更（状态机/
 * mode/rename/close，任意采集源）推全量 → 投影写 ["overview"] 缓存 + 按需 invalidate
 * 列表/detail。WS 断线由 overview 的 10s refetchInterval 兜底（self-healing）。
 */
export function useSessionShells(): void {
  useEffect(() => {
    connectShellsStream();
    return () => disconnectShellsStream();
  }, []);
}
