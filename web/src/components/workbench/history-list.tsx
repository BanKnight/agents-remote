import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { AgentHistoryEntry, AgentHistoryRange } from "@agents-remote/shared";
import { createAgentSession, listAgentHistory } from "../../api/client";
import { useT } from "../../i18n";
import type { TranslateFn } from "../../i18n/types";
import { formatBytes } from "@/lib/format";
import { ListGroup, ListRow, ListRowSkeleton, sessionMarker } from "../shell/shell-primitives";
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

/** 折叠窗口初始条数（2026-09-29 真机反馈②用户拍板：「展示最近的几个会话」，默认 5）。 */
const HISTORY_RECENT_COUNT = 5;

/** 「展开更早」每次步进条数（用户拍板「更久的再依次展开」）。 */
const HISTORY_EXPAND_STEP = 5;

/**
 * 「最近 N + 依次展开」客户端折叠窗口（行为单份，多端同构）：桌面 05c 历史态与移动 03n
 * sheet 共用同一窗口常量与展开/重置行为，两端只容器不同（2026-09-30 真机反馈：iPhone
 * 也要依次加载更多）。`resetKey` 变化即重置窗口（render 期 adjust，React 官方模式，无
 * effect 时序）——切过滤自动重置、无需调用方手动配对；移动 sheet 传 `open ? filter :
 * "gate:closed"`，关闭即重置、重开全新窗口（sheet 常驻挂载不卸载，防残留大窗口跨开合）。
 */
export function useHistoryRecentWindow(resetKey?: string) {
  const [state, setState] = useState({ key: resetKey, count: HISTORY_RECENT_COUNT });
  if (resetKey !== undefined && resetKey !== state.key) {
    setState({ key: resetKey, count: HISTORY_RECENT_COUNT });
  }
  return {
    visibleCount: state.count,
    expandWindow: () => setState((s) => ({ ...s, count: s.count + HISTORY_EXPAND_STEP })),
  };
}

/**
 * 历史条目的 provider 归一（缺省 claude，兼容存量响应）。条目归属由 provider 决定：
 * 同一类型（历史 session）的渲染/恢复只有这一条管道，provider 只作为条目自身属性参与分流。
 */
function entryProvider(entry: AgentHistoryEntry): "claude" | "omp" {
  return entry.provider ?? "claude";
}

/** 条目在其 provider 下的原生 session id（React key / 无标题时的兜底显示名）。 */
function entryNativeId(entry: AgentHistoryEntry): string {
  return (entryProvider(entry) === "omp" ? entry.acpSessionId : entry.claudeSessionId) ?? "";
}

/**
 * 历史 session 加载骨架（复用 ListRowSkeleton，与真实 ListRow 行高对齐，plain divide-y 连续行）。
 * 首次拉取 pending 时占位，避免 entries=[] 直接 return null 的空白。行级骨架与卡片网格
 *（CardGridSkeleton）形态不同：历史是紧凑连续行，卡片是高卡。
 */
function HistoryListSkeleton() {
  return <ListRowSkeleton count={HISTORY_SKELETON_ROW_COUNT} />;
}

/** resume「这条会话」的语义单元（provider + 原生 session id + 可选显示名）。 */
export type ResumeAgentSessionInput = {
  provider?: "claude" | "omp";
  claudeSessionId?: string;
  acpSessionId?: string;
  displayName?: string;
};

/**
 * 恢复会话为活跃实例（单一管道，桌面 history tab 与移动 03n 会话历史 sheet 共用）：
 * claude → claudeSessionId（--resume）；omp → acpSessionId（session/load 全量回放）。成功后
 * navigate 聚焦新实例（detail route 用 sessionId 直查，不依赖列表）+ invalidate
 * sessions/history/overview。navigate 固定 `/projects/$key/...`，故仅适用于 project scope。
 */
export function useResumeAgentSession(projectName: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const resumeSession = useMutation({
    mutationFn: (input: ResumeAgentSessionInput) =>
      createAgentSession(projectName, input.provider ?? "claude", {
        claudeSessionId: input.claudeSessionId,
        acpSessionId: input.acpSessionId,
        displayName: input.displayName,
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
  return { isResuming: resumeSession.isPending, resume: resumeSession.mutate };
}

/**
 * 项目历史 session 数据管道（单一来源，设计文档 §3/§4）。桌面 + 移动中栏 history tab 消费
 * 历史都走此 hook：`listAgentHistory` 查询 + resume mutation（见 `useResumeAgentSession`）。
 * history 是 project-scoped 数据，global 不可见。
 */
export function useHistorySessions(
  projectName: string,
  // 默认 "all"（2026-09-30）：服务端 range 是 mtime 窗口滤除，"week" 只回近 7 天——
  // iPhone 历史数量远少于桌面的历史根因（dd49a01 修复的默认值陷阱，勿回退）。
  range: AgentHistoryRange = "all",
  /** false 时不发查询（常驻挂载的浮层消费方传「打开才拉」，如 03n 移动 sheet）。 */
  enabled = true,
) {
  const history = useQuery({
    enabled,
    queryKey: ["projects", projectName, "agent-history", range],
    queryFn: () => listAgentHistory(projectName, range),
    staleTime: 5_000,
    // keepPreviousData（§6.12o 批次 4）：range 切档（week↔all）时保持上一份列表显示，
    // 后台换数据不闪骨架；首载无缓存 isPending 仍显 HistoryListSkeleton。
    placeholderData: keepPreviousData,
  });
  const { isResuming, resume } = useResumeAgentSession(projectName);
  // 管道出口统一 lastActivityAt 倒序（design review P2-9：服务端顺序不构成契约，排序口径
  // 两端单份——桌面 slice 即「最近 N」与移动 rows 派生消费同一份有序数据）。
  const entries = useMemo(
    () =>
      (history.data?.entries ?? [])
        .slice()
        .sort((a, b) =>
          (b.lastActivityAt ?? b.startedAt ?? "").localeCompare(
            a.lastActivityAt ?? a.startedAt ?? "",
          ),
        ),
    [history.data],
  );
  return {
    entries,
    // isLoading 含 placeholder 期（isPending || isPlaceholderData）：keepPreviousData 下上一份
    // 缓存是 [] 时切档，v5 会把 [] 当 placeholder → isPending/isLoading 均 false，消费方的
    // 「entries 空 && !isLoading → 空态」分支会显空白/伪空态——placeholder 期必须仍按加载中走
    // 骨架门（review 修复：空→空切换回归）。
    isLoading: history.isPending || history.isPlaceholderData,
    isResuming,
    resume: (entry: AgentHistoryEntry, displayName: string) =>
      resume({
        acpSessionId: entry.acpSessionId,
        claudeSessionId: entry.claudeSessionId,
        displayName: displayName || undefined,
        provider: entry.provider ?? "claude",
      }),
  };
}

type HistoryListProps = {
  projectName: string;
  focusId?: string;
};

/**
 * 历史 session 列表（2026-09-29 真机反馈②改版为 05c 原型做法）：一次拉全量（range 固定
 * "all"——周/半月/全部旧方案退役），状态过滤 chips（全部/已结束，05c :42-45）+「最近
 * N 条 + 展开更早（每次 +N）」客户端折叠（用户拍板补充设计，原型无此控件）。单一数据管道
 *（useHistorySessions）+ 单一渲染（ListGroup/ListRow plain 连续行 + sessionMarker sm，
 * 与总览 grid 卡片同款 marker）。entries 为空时返回 null（左栏段落自然空态，不伪造占位）。
 */
export function HistoryList({ focusId, projectName }: HistoryListProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const { holder: promptHolder, prompt } = usePromptDialog();
  // range 固定 "all"：折叠在客户端做，服务端 range 过滤失去意义（hook 的 range 参数保留——
  // mobile-sheets 03n sheet 同窗 "all"，多端同构同一数据口径）。服务端顺序不构成契约，
  // 管道出口统一按 lastActivityAt 倒序归一（design review P2-9：两端排序口径单份）。
  const { entries, isLoading, isResuming, resume } = useHistorySessions(projectName, "all");
  // 状态过滤 + 折叠窗口：均视图态不持久化（§6.10 口径）；折叠窗口的 resetKey = filter，
  // 切过滤自动重置、防残留大窗口跨过滤（hook 内 render 期 adjust，无需 onClick 配对）。
  const [filter, setFilter] = useState<"all" | "ended">("all");
  const { visibleCount, expandWindow } = useHistoryRecentWindow(filter);

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
        resume(entry, name);
      }
    });
  };

  // 已结束 = !hasActiveSession（活跃中的历史 = 已 resume 为活跃实例，ActiveDot 同语义）。
  const filtered = filter === "all" ? entries : entries.filter((e) => !e.hasActiveSession);
  const visible = filtered.slice(0, visibleCount);
  const hiddenCount = filtered.length - visible.length;

  // 05c 过滤 chips 行（原型 :42 下 8，左右 14 = .side 10 + px-1，与 seg4 基类 14 同口径；
  // chip = 11.5px r12 p 3px 12px，on = 600 ink-1 bg-elevated3，ghost = ink-2 border
  // sep-strong。on 态透明 border 防切换 1px 跳动。骨架期也渲染（与列表同根 flex 容器，
  // 数据到达时无 CLS 跳动——design review）。窗口 resetKey = filter 已在 hook 调用处
  // 绑定，onClick 只切过滤。
  const chipsRow = (
    <div className="flex shrink-0 gap-1.5 px-1 pb-2 pt-2" role="group">
      <button
        aria-pressed={filter === "all"}
        className={`cursor-pointer rounded-xl border px-3 py-[3px] text-chip leading-[var(--line-height-ui)] ${
          filter === "all"
            ? "border-transparent bg-elevated3 font-semibold text-ink-1"
            : "border-sep-strong text-ink-2"
        }`}
        onClick={() => setFilter("all")}
        type="button"
      >
        {t("workbench.historyFilterAll")}
      </button>
      <button
        aria-pressed={filter === "ended"}
        className={`cursor-pointer rounded-xl border px-3 py-[3px] text-chip leading-[var(--line-height-ui)] ${
          filter === "ended"
            ? "border-transparent bg-elevated3 font-semibold text-ink-1"
            : "border-sep-strong text-ink-2"
        }`}
        onClick={() => setFilter("ended")}
        type="button"
      >
        {t("workbench.historyFilterClosed")}
      </button>
    </div>
  );

  // 加载中（首次拉取，entries 仍空）→ 骨架行占位，避免空白；真空态（!isLoading 且空）→ null
  // （左栏段落自然空态，不伪造占位）。isLoading 区分二者，消除"加载中 = 空态"的误导。
  // 骨架分支与正文同根 flex 容器 + chips 在场（chipsRow 提前于早退分支，防 CLS）。
  if (entries.length === 0) {
    if (!isLoading) return null;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {chipsRow}
        <div className="px-3">
          <HistoryListSkeleton />
        </div>
      </div>
    );
  }
  return (
    /* 根 flex-1（原 h-full）：作为左栏历史态 wrapper 的 flex item 占满剩余高，且允许
       wrapper 内的兄弟节点（尾注）按内容占位——h-full 会把兄弟推出可视区。 */
    <div className="flex min-h-0 flex-1 flex-col">
      {chipsRow}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-caption text-ink-2">
            {t("workbench.historyEndedEmpty")}
          </div>
        ) : (
          <>
            <ListGroup ariaLabel={t("workbench.historySection")} className="animate-stagger-rows">
              {visible.map((entry) => (
                <HistorySessionNode
                  active={entry.hasActiveSession && entry.activeSessionId === focusId}
                  entry={entry}
                  isResuming={isResuming}
                  // id 缺失（损坏数据）退 title/firstMessage 兜底，防双空串 key 冲突
                  //（code review P2-6）。
                  key={entryNativeId(entry) || entry.title || entry.firstMessage || ""}
                  onClick={() => handleClick(entry)}
                />
              ))}
            </ListGroup>
            {/* 「展开更早」（用户拍板「更久的再依次展开」，原型无此控件——形态与 chips
                ghost 胶囊同族）。排序已在管道出口归一倒序，slice 即「最近 N」。 */}
            {hiddenCount > 0 ? (
              <div className="flex justify-center py-2">
                <button
                  className="cursor-pointer rounded-xl border border-sep-strong px-3 py-[3px] text-chip leading-[var(--line-height-ui)] text-ink-2"
                  onClick={expandWindow}
                  type="button"
                >
                  {t("workbench.historyShowEarlier")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {promptHolder}
    </div>
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
  const displayTitle = entry.title ?? entry.firstMessage ?? entryNativeId(entry).slice(0, 8);
  const time = relativeTime(entry.lastActivityAt ?? entry.startedAt ?? "", t);
  const description = isResuming
    ? t("project.historyResuming")
    : [time, entry.fileSize > 0 ? formatBytes(entry.fileSize) : null].filter(Boolean).join(" · ");
  return (
    <ListRow
      marker={sessionMarker("agent", entryProvider(entry), "sm")}
      meta={entry.hasActiveSession ? ActiveDot : undefined}
      onClick={() => {
        if (!isResuming) onClick();
      }}
      /* sm = 侧栏行档（.srow2.inst 13px / meta 10.5px，05c 历史行规格）——默认档 16px
         在左栏与 srow2 inst 实例试点行（13px 单源类）同栏对比明显偏大（真机反馈）。 */
      selected={active}
      size="sm"
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
