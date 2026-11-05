// 会话壳统一推送 hook（壳/内容分离，2026-10-19）：/api/sessions/stream 全量快照投影进
// 既有 ["overview"] query 缓存（单一数据管道——WS 帧只是让缓存保鲜的来源，不建第二份
// state）。REST 初值 + 10s 轮询兜底断流自愈，与 use-approvals 同范式。
import { useEffect } from "react";

import type {
  AgentSession,
  OverviewCandidate,
  OverviewResponse,
  SessionShell,
  TerminalSession,
} from "@agents-remote/shared";

import { sessionsStreamUrl } from "../api/client";
import { queryClient } from "../lib/query-client";

/** 列表/detail query key 段（client.ts 同惯例）：写扩散与 invalidate 通道共用。 */
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
 * 会话元信息字段集（壳 = 会话可同步标量）单源：壳帧 diff 与缓存写扩散都以此为准。
 * type / sessionId / projectName 是身份键，不参与 diff/patch；subtitle 是慢填充字段，
 * 不在壳快照里（由 projectShells 继承），也不参与。
 */
const SHELL_META_FIELDS = [
  "displayName",
  "status",
  "updatedAt",
  "provider",
  "mode",
  "createdAt",
] as const;

type ShellMetaField = (typeof SHELL_META_FIELDS)[number];
type ShellMetaPatch = Partial<Pick<SessionShell, ShellMetaField>>;

export type ShellDiff = {
  /** 元信息变化的会话 → 写扩散字段子集（仅变化字段，不覆盖未变字段）。 */
  changed: Array<{ shell: SessionShell; patch: ShellMetaPatch }>;
  /** 新增/移除候选 → 需失效的列表 key（前缀连带 detail，让会话出现/消失）。 */
  invalidate: string[][];
};

/**
 * 壳快照 diff（纯函数，单测锚点）：会话元信息变化 → 待写扩散的字段子集；新增/移除 →
 * 失效列表 key。元信息不再走「失效 detail」通道——detail/列表缓存由 applyShellDiff 原地
 * 合并，零请求且即时（用户 2026-11-05 真机反馈：同一会话在左栏项目段/全部组/项目页
 * 显示不同状态、名字、时间）。
 */
export function diffShells(
  prev: OverviewCandidate[] | undefined,
  shells: SessionShell[],
): ShellDiff {
  const prevByKey = new Map((prev ?? []).map((c) => [shellKey(c), c]));
  const nextKeys = new Set(shells.map(shellKey));
  const seen = new Set<string>();
  const invalidate: string[][] = [];
  const push = (key: string[]) => {
    const serialized = JSON.stringify(key);
    if (seen.has(serialized)) return;
    seen.add(serialized);
    invalidate.push(key);
  };
  const changed: ShellDiff["changed"] = [];
  for (const shell of shells) {
    const before = prevByKey.get(shellKey(shell));
    if (!before) {
      push(["projects", shell.projectName, sessionListSegment(shell.type)]);
      continue;
    }
    const patch: ShellMetaPatch = {};
    let touched = false;
    for (const field of SHELL_META_FIELDS) {
      if (before[field] === shell[field]) continue;
      (patch as Record<string, unknown>)[field] = shell[field];
      touched = true;
    }
    if (touched) changed.push({ shell, patch });
  }
  for (const candidate of prev ?? []) {
    if (!nextKeys.has(shellKey(candidate))) {
      push(["projects", candidate.projectName, sessionListSegment(candidate.type)]);
    }
  }
  return { changed, invalidate };
}

type SessionListItem = AgentSession | TerminalSession;
type SessionListCache = { sessions: SessionListItem[] };
type SessionDetailCache = { session: SessionListItem; [key: string]: unknown };

/**
 * 壳元信息写扩散：把变化字段合并进**已存在**的列表/详情缓存副本（零请求）。
 * overview 是唯一权威（WS 直写 + 10s 轮询），列表/详情只是它的投影——壳一变就同步，
 * 同一会话在任何展示点（桌面左栏项目段/全部组、移动首页、▾ 菜单、Tab chip、实例信息）
 * 都读到同一份值。缓存不存在时返回原值，TanStack Query 不通知、零副作用。
 * 导出仅供单测锚点（生产消费方只有 applyShellsFrame / 订阅）。
 */
export function applyShellDiff(diff: ShellDiff): void {
  for (const { shell, patch } of diff.changed) {
    const listKey = ["projects", shell.projectName, sessionListSegment(shell.type)];
    queryClient.setQueryData<SessionListCache>(listKey, (old) => {
      if (!old) return old;
      let hit = false;
      const sessions = old.sessions.map((session) => {
        if (session.id !== shell.sessionId) return session;
        hit = true;
        return { ...session, ...patch } as SessionListItem;
      });
      return hit ? { ...old, sessions } : old;
    });
    queryClient.setQueryData<SessionDetailCache>([...listKey, shell.sessionId], (old) =>
      old?.session?.id === shell.sessionId
        ? { ...old, session: { ...old.session, ...patch } as SessionListItem }
        : old,
    );
  }
  for (const key of diff.invalidate) void queryClient.invalidateQueries({ queryKey: key });
}

/**
 * 已写扩散的 overview 快照（去重基准）：WS 帧与 REST 轮询两条入口共用同一套 diff/patch，
 * 且订阅回调看到同一引用即跳过——不会互相重复应用。
 */
let syncedCandidates: OverviewCandidate[] | undefined;

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
  const next = projectShells(prev, shells);
  // 先落同步基准再写缓存：订阅回调看到同一引用即跳过，避免同一帧 patch 两次。
  syncedCandidates = next;
  queryClient.setQueryData(["overview"], {
    projectNames: current?.projectNames ?? [],
    candidates: next,
  });
  applyShellDiff(diffShells(prev, next));
}

/**
 * overview 数据变化 → 写扩散订阅：WS 断线不重连（靠 overview 10s 轮询兜底），轮询只更新
 * overview；列表/详情副本若不跟着同步会永久陈旧。把同一条 diff/patch 通道接到 REST 来源，
 * WS 与轮询两条入口行为一致。
 */
function subscribeOverviewSync(): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const { query } = event;
    if (query.queryKey.length !== 1 || query.queryKey[0] !== "overview") return;
    const candidates = (query.state.data as OverviewResponse | undefined)?.candidates;
    if (!candidates || candidates === syncedCandidates) return;
    const prev = syncedCandidates;
    syncedCandidates = candidates;
    applyShellDiff(diffShells(prev, candidates));
  });
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
 * mode/rename/close，任意采集源）推全量 → 投影写 ["overview"] 缓存（唯一权威）+
 * 元信息写扩散到列表/详情缓存副本（同一会话在任何展示点同值）。WS 断线由 overview 的
 * 10s refetchInterval 兜底（self-healing，订阅同一同步通道）。
 */
export function useSessionShells(): void {
  useEffect(() => {
    // 挂载基准 = 当前 overview（各缓存此刻来自同一批数据，无需补写扩散）。
    syncedCandidates = queryClient.getQueryData<OverviewResponse>(["overview"])?.candidates;
    const unsubscribe = subscribeOverviewSync();
    connectShellsStream();
    return () => {
      unsubscribe();
      disconnectShellsStream();
    };
  }, []);
}
