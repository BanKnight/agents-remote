// ── 子 agent 概览条（03e · v1.5 批 7 换代）──────────────────────────────
// 规格来源：design_spec.md §4.1:118（按需行「子 agent 概览条」，绿 tint，仅并行子 agent
// 存在时）+ 原型 docs/design/workspace-subagent-list.html。CSS 单源 = v2-primitives.css
// 的 .subbar / .sub / .slist / .subrow（含 .dot/.st/.tm/.ar/.done），此处只消费。
//
// 单 / 多 agent 分流：
// - 单 agent（运行中）= 单行 chip 点按直跳（保持旧 .subbar chip 形态逐字节不变——
//   probe-claude-detail-perf.mjs 断言 .subbar 在场）；单 agent 但非 running → 不渲染。
// - 多 agent（≥2，含已完成）= 计数条「n 个子 agent · m 运行中」点按展开 .slist 列表卡
//   逐行跳转；完成行置灰置底；全部完成（running 归零）→ 自动折叠回单行「n 个子 agent
//   已完成」（保留入口）；行点按 = 跳转到该子 agent 卡并展开（跳转不改概览条展开状态）。
//
// 回合边界推导（「新回合开始时清空」）：扫 thread.messages，先定位最后一条 user 消息的
// index，只保留 index > lastUserIndex 的 agent-container 消息——新 user 消息一落地，
// 上一回合的容器自动出局 = 概览条自动清空。无 user 消息时 lastUserIndex = -1（理论上
// 不发生：子 agent 必由 prompt 触发）。
//
// 跳转展开协议：行点按置 agentCardExpandSignalAtom（一次性信号），AgentContainer 消费后
// 置 null（防跨会话泄漏/重放）；滚动定位由 route 层 onJump（scrollToMessage）承担。

import { useAuiState } from "@assistant-ui/react";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n";
import { formatDuration } from "../lib/utils";

/** 一次性展开信号：概览条行点按 → AgentContainer 消费（置 null 防跨会话泄漏/重放）。 */
export const agentCardExpandSignalAtom = atom<{ index: number } | null>(null);

type SubagentOverviewStatus = "running" | "complete" | "error" | "interrupted";

export type SubagentOverviewEntry = {
  index: number;
  subagentType: string;
  description: string;
  status: SubagentOverviewStatus;
  durationMs?: number;
};

// agent-container 消息的 custom 元数据子集（route 文件的 AgentContainerCustom 为模块私有，
// 本模块不 import route 文件——防循环依赖，只声明这里消费的字段）。
type AgentContainerCustomLite = {
  systemMessageType?: string;
  subagentType?: string;
  description?: string;
  tailResult?: unknown;
  tailIsError?: boolean;
  isInterrupted?: boolean;
  tailStats?: { totalDurationMs?: number };
  progress?: { usage?: { duration_ms?: number } };
};

// 与 claude-adapter.ts deriveStatus 同语义（本地小函数，不从 route 文件 import）：
// isInterrupted → interrupted；tailResult 已到 → error/complete；否则 running。
function deriveEntryStatus(input: {
  hasTail: boolean;
  isError: boolean;
  isInterrupted: boolean;
}): SubagentOverviewStatus {
  if (input.isInterrupted) return "interrupted";
  if (input.hasTail) return input.isError ? "error" : "complete";
  return "running";
}

export function useSubagentOverview(): SubagentOverviewEntry[] {
  // useAuiState = useSyncExternalStore（Object.is 比较）：selector 只产出 JSON 签名
  // 字符串（primitive，稳定），数组由 useMemo 从签名 parse（与 route 文件
  // runningAgentsSignature 同款防重渲染纪律）。
  const signature = useAuiState((s) => {
    const messages = s.thread.messages;
    let lastUserIndex = -1;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === "user") lastUserIndex = i;
    }
    const entries: SubagentOverviewEntry[] = [];
    for (let i = lastUserIndex + 1; i < messages.length; i++) {
      const custom = (messages[i].metadata?.custom ?? {}) as AgentContainerCustomLite;
      if (custom.systemMessageType !== "agent-container") continue;
      entries.push({
        index: i,
        subagentType: custom.subagentType ?? "Agent",
        description: custom.description ?? "",
        status: deriveEntryStatus({
          hasTail: custom.tailResult != null,
          isError: custom.tailIsError === true,
          isInterrupted: custom.isInterrupted === true,
        }),
        durationMs: custom.tailStats?.totalDurationMs ?? custom.progress?.usage?.duration_ms,
      });
    }
    return JSON.stringify(entries);
  });
  return useMemo(() => JSON.parse(signature) as SubagentOverviewEntry[], [signature]);
}

export function SubagentOverviewBar({ onJump }: { onJump: (index: number) => void }) {
  const { t } = useT();
  const entries = useSubagentOverview();
  const runningCount = entries.filter((entry) => entry.status === "running").length;
  const [, setExpandSignal] = useAtom(agentCardExpandSignalAtom);
  // 全部完成（running 归零）→ 自动折叠回单行「已完成」（保留入口）。
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (runningCount === 0) setExpanded(false);
  }, [runningCount]);
  // 排序：entries 扫描时已按 index 升序产出，filter 分段即保持段内 index 升序——
  // running 段在前，非 running（完成/错误/中断）置灰置底。
  const orderedEntries = useMemo(
    () => [
      ...entries.filter((entry) => entry.status === "running"),
      ...entries.filter((entry) => entry.status !== "running"),
    ],
    [entries],
  );

  if (entries.length === 0) return null;
  // 单 agent 非 running → 概览条仅并行子 agent 存在时出现（spec §4.1:118）。
  if (entries.length === 1 && entries[0].status !== "running") return null;

  // 分支 A：单 agent（运行中）= 单行 chip 点按直跳（与旧 .subbar 渲染逐字节同款；
  // probe-claude-detail-perf.mjs 断言 .subbar 在场，类名与结构不可变）。
  if (entries.length === 1) {
    const agent = entries[0];
    return (
      <div
        aria-label={t("claude.agent.runningAriaLabel")}
        className="subbar flex shrink-0 flex-wrap items-center gap-1.5 px-3 py-1.5 sm:px-5"
      >
        <button
          type="button"
          onClick={() => onJump(agent.index)}
          className="inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] transition hover:brightness-105"
        >
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-current" />
          <span className="shrink-0 font-semibold">{agent.subagentType}</span>
          {agent.description ? (
            <span className="min-w-0 truncate opacity-70">{agent.description}</span>
          ) : null}
        </button>
      </div>
    );
  }

  // 分支 B：多 agent = 计数条头行 + 展开列表卡（workspace-subagent-list）。
  return (
    <div
      aria-label={t("claude.agent.overviewAriaLabel")}
      className="flex shrink-0 flex-col gap-1.5 px-3 py-1.5 sm:px-5"
    >
      <button
        type="button"
        className="sub cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span>
          {`${expanded ? "▾" : "▸"} ${
            runningCount > 0
              ? t("claude.agent.subagentCount", { count: entries.length, running: runningCount })
              : t("claude.agent.subagentDoneShort", { count: entries.length })
          }`}
        </span>
        <span>{expanded ? t("claude.agent.collapse") : null}</span>
      </button>
      {expanded ? (
        <div className="slist">
          {orderedEntries.map((entry) => {
            const isRunning = entry.status === "running";
            return (
              <button
                key={entry.index}
                type="button"
                className={"subrow cursor-pointer " + (isRunning ? "" : "done")}
                onClick={() => {
                  // 跳转 + 一次性展开信号；不碰 expanded = 跳转不改概览条展开状态。
                  setExpandSignal({ index: entry.index });
                  onJump(entry.index);
                }}
              >
                <span
                  aria-hidden="true"
                  className={
                    entry.status === "running"
                      ? "dot bg-success"
                      : entry.status === "error"
                        ? "dot bg-error"
                        : "dot bg-on-surface/30"
                  }
                />
                <span className="min-w-0 truncate">
                  {entry.subagentType}
                  {entry.description ? ` · ${entry.description}` : ""}
                </span>
                <span className="st">
                  {entry.status === "running"
                    ? t("status.running")
                    : entry.status === "complete"
                      ? t("claude.agent.statusComplete")
                      : entry.status === "error"
                        ? t("status.error")
                        : t("claude.agent.statusInterrupted")}
                </span>
                <span className="tm">
                  {entry.durationMs && entry.durationMs > 0
                    ? formatDuration(entry.durationMs)
                    : "—"}
                </span>
                <span aria-hidden="true" className="ar">
                  ›
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
