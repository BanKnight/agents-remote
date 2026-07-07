import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { AgentHistoryEntry } from "@agents-remote/shared";
import { createAgentSession, listAgentHistory } from "../../api/client";
import { useT } from "../../i18n";
import type { TranslateFn } from "../../i18n/types";
import { IconMarker, NavItemSkeleton, ShellSectionLabel } from "../shell/shell-primitives";
import { ShellNavigationButton } from "../shell/shell-navigation";
import { ShellIcon } from "../shell/icons";

/**
 * 历史 session「活跃中」脉动点。hasActiveSession 的历史（已 resume 为活跃实例）共用
 * left-rail 活跃实例的同一语义——marker tone 颜色变化太微妙，正向脉动点作主要活跃标志。
 */
const ActiveDot = (
  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success" />
);

/** 历史 session 加载骨架行数（与左栏 InstanceSkeleton/CardGridSkeleton 同款 UI 常量）。 */
const HISTORY_SKELETON_ROW_COUNT = 3;

/**
 * 历史 session 加载骨架（行级，复用 NavItemSkeleton，与 ShellNavigationButton 行高对齐）。
 * 首次拉取 pending 时占位，避免 entries=[] 直接 return null 的空白。行级骨架与卡片网格
 *（CardGridSkeleton）形态不同：历史是紧凑导航行，卡片是高卡。
 */
function HistoryListSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      <NavItemSkeleton count={HISTORY_SKELETON_ROW_COUNT} />
    </div>
  );
}

/**
 * 项目历史 session 数据管道（单一来源，设计文档 §3/§4）。从中栏 history tab + 左栏项目段
 * 任意位置消费历史都走此 hook：`listAgentHistory` 查询 + resume mutation（claudeSessionId
 * → 新活跃实例 + invalidate agent-sessions/agent-history + navigate 聚焦）。resume onSuccess
 * 的 navigate 固定到 `/projects/$key/...`，故本 hook 仅适用于 project scope（history 是
 * project-scoped 数据，global 不可见）。
 */
export function useHistorySessions(projectName: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const history = useQuery({
    queryKey: ["projects", projectName, "agent-history"],
    queryFn: () => listAgentHistory(projectName),
    staleTime: 5_000,
  });
  const resumeSession = useMutation({
    mutationFn: (claudeSessionId: string) =>
      createAgentSession(projectName, "claude2", { claudeSessionId }),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", projectName, "agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", projectName, "agent-history"] }),
      ]);
      await navigate({
        to: "/projects/$key/session/$id",
        params: { key: projectName, id: data.session.id },
        // resume 后聚焦新实例，切回 overview tab 看活动组 output（否则停在 history 全宽列表）。
        // 函数式 search 保留 view/rightTab 等其他维度（设计 §13 正交）。
        search: (prev) => ({ ...prev, tab: "overview" }),
      });
    },
  });
  return {
    entries: history.data?.entries ?? [],
    isLoading: history.isLoading,
    isResuming: resumeSession.isPending,
    resume: resumeSession.mutate,
  };
}

type HistoryListProps = {
  projectName: string;
  focusId?: string;
  /**
   * 是否渲染「历史会话」段落标题。左栏项目段需要它区分活跃实例段与历史段（默认 true）；
   * 中栏 history tab 顶部 tab bar 已标识「历史」，省略标题避免冗余。
   */
  showLabel?: boolean;
};

/**
 * 历史 session 列表（设计文档 §3/§4）。从原 left-rail ProjectInstances 提取，供左栏项目段
 * + 中栏 history tab 共用——单一数据管道（useHistorySessions）+ 单一渲染，消除两处历史
 * 维护分支。entries 为空时返回 null（左栏段落、中栏 tab 都自然空态，不伪造占位）。
 */
export function HistoryList({ focusId, projectName, showLabel = true }: HistoryListProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const { entries, isLoading, isResuming, resume } = useHistorySessions(projectName);

  const focus = (sessionId: string) => {
    void navigate({
      to: "/projects/$key/session/$id",
      params: { key: projectName, id: sessionId },
      // 聚焦活跃实例，切回 overview tab 看活动组 output（设计 §4：history 点会话切 overview）。
      search: (prev) => ({ ...prev, tab: "overview" }),
    });
  };

  const handleClick = (entry: AgentHistoryEntry) => {
    if (entry.hasActiveSession && entry.activeSessionId) {
      focus(entry.activeSessionId);
    } else {
      resume(entry.claudeSessionId);
    }
  };

  // 加载中（首次拉取，entries 仍空）→ 骨架行占位，避免空白；真空态（!isLoading 且空）→ null
  // （左栏段落、中栏 tab 自然空态，不伪造占位）。isLoading 区分二者，消除"加载中 = 空态"的误导。
  if (entries.length === 0) {
    if (!isLoading) return null;
    return showLabel ? (
      <>
        <ShellSectionLabel className="px-3 pb-1 pt-2">
          {t("workbench.historySection")}
        </ShellSectionLabel>
        <div className="px-3">
          <HistoryListSkeleton />
        </div>
      </>
    ) : (
      <HistoryListSkeleton />
    );
  }
  return (
    <>
      {showLabel ? (
        <ShellSectionLabel className="px-3 pb-1 pt-2">
          {t("workbench.historySection")}
        </ShellSectionLabel>
      ) : null}
      {entries.map((entry) => (
        <HistorySessionNode
          active={entry.hasActiveSession && entry.activeSessionId === focusId}
          entry={entry}
          isResuming={isResuming}
          key={entry.claudeSessionId}
          onClick={() => handleClick(entry)}
        />
      ))}
    </>
  );
}

type HistorySessionNodeProps = {
  active: boolean;
  entry: AgentHistoryEntry;
  isResuming: boolean;
  onClick: () => void;
};

function HistorySessionNode({ active, entry, isResuming, onClick }: HistorySessionNodeProps) {
  const { t } = useT();
  const displayTitle = entry.title ?? entry.firstMessage ?? entry.claudeSessionId.slice(0, 8);
  const time = relativeTime(entry.lastActivityAt ?? entry.startedAt ?? "", t);
  const description = isResuming
    ? t("project.historyResuming")
    : [
        time,
        entry.messageCount > 0 ? t("project.historyTurns", { count: entry.messageCount }) : null,
      ]
        .filter(Boolean)
        .join(" · ");
  return (
    <ShellNavigationButton
      active={active}
      description={description || undefined}
      label={displayTitle}
      marker={
        <IconMarker tone={entry.hasActiveSession ? "success" : "accent"}>
          <ShellIcon className="h-3.5 w-3.5" name="anthropic" />
        </IconMarker>
      }
      meta={entry.hasActiveSession ? ActiveDot : undefined}
      onClick={() => {
        if (!isResuming) onClick();
      }}
    />
  );
}

export function relativeTime(iso: string, t: TranslateFn): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.daysAgo", { count: days });
  return date.toLocaleDateString();
}
