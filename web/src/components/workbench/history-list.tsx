import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { AgentHistoryEntry, AgentHistoryRange } from "@agents-remote/shared";
import { createAgentSession, listAgentHistory } from "../../api/client";
import { useT } from "../../i18n";
import type { TranslateFn } from "../../i18n/types";
import { formatBytes } from "../files/file-browser";
import {
  ListGroup,
  ListRow,
  ListRowSkeleton,
  SegmentedControl,
  sessionMarker,
  ShellSectionLabel,
} from "../shell/shell-primitives";
import { usePromptDialog } from "../shell/prompt-dialog";

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
 * 历史 session 加载骨架（复用 ListRowSkeleton，与真实 ListRow 行高对齐，plain divide-y 连续行）。
 * 首次拉取 pending 时占位，避免 entries=[] 直接 return null 的空白。行级骨架与卡片网格
 *（CardGridSkeleton）形态不同：历史是紧凑连续行，卡片是高卡。
 */
function HistoryListSkeleton() {
  return <ListRowSkeleton count={HISTORY_SKELETON_ROW_COUNT} />;
}

/**
 * 项目历史 session 数据管道（单一来源，设计文档 §3/§4）。桌面 + 移动中栏 history tab 消费
 * 历史都走此 hook：`listAgentHistory` 查询 + resume mutation（claudeSessionId
 * → 新活跃实例 + invalidate agent-sessions/agent-history + navigate 聚焦）。resume onSuccess
 * 的 navigate 固定到 `/projects/$key/...`，故本 hook 仅适用于 project scope（history 是
 * project-scoped 数据，global 不可见）。
 */
export function useHistorySessions(projectName: string, range: AgentHistoryRange = "week") {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const history = useQuery({
    queryKey: ["projects", projectName, "agent-history", range],
    queryFn: () => listAgentHistory(projectName, range),
    staleTime: 5_000,
  });
  const resumeSession = useMutation({
    mutationFn: ({
      claudeSessionId,
      displayName,
    }: {
      claudeSessionId: string;
      displayName: string;
    }) =>
      createAgentSession(projectName, "claude2", {
        claudeSessionId,
        displayName: displayName || undefined,
      }),
    onSuccess: async (data) => {
      // navigate 优先：detail route 用 sessionId 直查 per-session detail query，不依赖列表。
      // invalidate 后台 fire-and-forget 刷新左栏 InstanceLeftOverview + history tab 列表。
      await navigate({
        to: "/projects/$key/session/$id",
        params: { key: projectName, id: data.session.id },
        // resume 后聚焦新实例，切回 overview tab 看活动组 output（否则停在 history 全宽列表）。
        // 函数式 search 保留 view/rightTab 等其他维度（设计 §13 正交）。
        search: (prev) => ({ ...prev, tab: "overview" }),
      });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", projectName, "agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", projectName, "agent-history"] }),
        // overview 同步刷新：桌面 prune effect 用 globalRefs（= overview）判定 tab stale，
        // 不刷则新 session 不在 globalRefs、tab 被误删（与 invalidateSessions helper 同源）。
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
      ]);
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
  /** 时间范围过滤器（受控；由父级持有避免 tab 切换丢失）。默认 "week"。 */
  range?: AgentHistoryRange;
  onRangeChange?: (next: AgentHistoryRange) => void;
};

/**
 * 历史 session 列表（设计文档 §3/§4）。供桌面 + 移动中栏 history tab 共用——单一数据管道
 *（useHistorySessions）+ 单一渲染（ListGroup/ListRow plain 连续行 + sessionMarker sm，
 * 与总览 table 行同款 marker）。entries 为空时返回 null（中栏 tab 自然空态，不伪造占位）。
 */
export function HistoryList({
  focusId,
  projectName,
  showLabel = true,
  range = "week",
}: HistoryListProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const { holder: promptHolder, prompt } = usePromptDialog();
  const { entries, isLoading, isResuming, resume } = useHistorySessions(projectName, range);

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
      // 已有活跃实例 → 直接聚焦，不命名（只是切过去看）。
      focus(entry.activeSessionId);
      return;
    }
    // 无活跃实例 → 弹命名框（预填历史标题，可选）→ resume 新建。与新建会话同一 prompt 模式
    //（useCreateSession），命名可选（留空 = 默认 displayName），取消 = 不新建。
    void prompt({
      cancelLabel: t("cancel"),
      confirmLabel: t("session.namePrompt.confirm"),
      initialValue: entry.title ?? entry.firstMessage ?? "",
      placeholder: t("session.namePrompt.placeholder"),
      title: t("session.namePrompt.resumeTitle"),
    }).then((name) => {
      if (name !== null) {
        resume({ claudeSessionId: entry.claudeSessionId, displayName: name });
      }
    });
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
      <ListGroup ariaLabel={t("workbench.historySection")}>
        {entries.map((entry) => (
          <HistorySessionNode
            active={entry.hasActiveSession && entry.activeSessionId === focusId}
            entry={entry}
            isResuming={isResuming}
            key={entry.claudeSessionId}
            onClick={() => handleClick(entry)}
          />
        ))}
      </ListGroup>
      {promptHolder}
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
    : [time, entry.fileSize > 0 ? formatBytes(entry.fileSize) : null].filter(Boolean).join(" · ");
  return (
    <ListRow
      marker={sessionMarker("agent", "claude", "sm")}
      meta={entry.hasActiveSession ? ActiveDot : undefined}
      onClick={() => {
        if (!isResuming) onClick();
      }}
      selected={active}
      subtitle={description || undefined}
      title={displayTitle}
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

/**
 * 历史时间范围分段选择器（周/半月/全部，默认周）。桌面 history tab 顶部 sticky header +
 * 移动 history tab 容器顶部共用——range state 由父级持有（受控），避免 tab 切换丢失；
 * range 进 queryKey → 切档自动重拉（week 默认仅近 7 天，all 首拉全量后走缓存）。
 */
export function HistoryRangeControl({
  value,
  onChange,
}: {
  value: AgentHistoryRange;
  onChange: (next: AgentHistoryRange) => void;
}) {
  const { t } = useT();
  return (
    <SegmentedControl
      ariaLabel={t("project.historyRangeAria")}
      onChange={onChange}
      options={[
        { value: "week", label: t("project.historyRangeWeek") },
        { value: "biweekly", label: t("project.historyRangeBiweekly") },
        { value: "all", label: t("project.historyRangeAll") },
      ]}
      value={value}
    />
  );
}
