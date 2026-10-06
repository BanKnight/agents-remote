import { useEffect, useRef, type MouseEvent, type UIEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type {
  AgentHistoryEntry,
  AgentHistoryFilter,
  AgentHistoryGroupKey,
} from "@agents-remote/shared";
import { createAgentSession } from "../../api/client";
import { useT } from "../../i18n";
import type { TranslateFn, TranslationKey } from "../../i18n/types";
import { formatBytes } from "@/lib/format";
import { ListGroup, ListRow, ListRowSkeleton, sessionMarker } from "../shell/shell-primitives";
import { useConfirm } from "../shell/confirm-dialog";
import { usePromptDialog } from "../shell/prompt-dialog";
import {
  ActionMenu,
  useLongPressActions,
  useRowContextMenu,
  type ActionMenuItem,
} from "../ui/action-menu";
import { ShellIcon } from "../shell/icons";
import { useHistoryQuery } from "./use-history-query";

/**
 * 历史 session「活跃中」脉动点。hasActiveSession 的历史（已 resume 为活跃实例）共用
 * left-rail 活跃实例的同一语义——marker tone 颜色变化太微妙，正向脉动点作主要活跃标志。
 */
const ActiveDot = (
  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success" />
);

/** 历史 session 加载骨架行数（与左栏 InstanceSkeleton/CardGridSkeleton 同款 UI 常量）。 */
const HISTORY_SKELETON_ROW_COUNT = 3;

/** 滚动到底自动取下页的提前量（距底 ≤48px 触发 fetchNextPage，§4.2 游标分页）。 */
const HISTORY_LOAD_MORE_LEAD_PX = 48;

/**
 * 历史 session 加载骨架（复用 ListRowSkeleton，与真实 ListRow 行高对齐，plain divide-y 连续行）。
 * 首次拉取 pending 时占位，避免 entries=[] 直接 return null 的空白。行级骨架与卡片网格
 *（CardGridSkeleton）形态不同：历史是紧凑连续行，卡片是高卡。
 */
function HistoryListSkeleton() {
  return <ListRowSkeleton count={HISTORY_SKELETON_ROW_COUNT} />;
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

/** 行主标题（title → firstMessage → 原生 id 前 8 位兜底，防全空）。 */
function displayTitleOf(entry: AgentHistoryEntry): string {
  return entry.title ?? entry.firstMessage ?? entryNativeId(entry).slice(0, 8);
}

/** 行 React key / 右键菜单定位 key（id 缺失退 title/firstMessage 兜底，防双空串冲突）。 */
function rowKey(entry: AgentHistoryEntry): string {
  return entryNativeId(entry) || entry.title || entry.firstMessage || "";
}

/** resume「这条会话」的语义单元（provider + 原生 session id + 可选显示名 + 归属项目）。 */
export type ResumeAgentSessionInput = {
  provider?: "claude" | "omp";
  claudeSessionId?: string;
  acpSessionId?: string;
  displayName?: string;
  /** 全局作用域行自带归属项目（04g「全部」段服务端恒填）；缺省回退 hook 级 projectName。 */
  projectName?: string;
};

/**
 * 恢复会话为活跃实例（单一管道，桌面 05c 历史、iPad 04g「全部」段与移动 03n sheet 共用）：
 * claude → claudeSessionId（--resume）；omp → acpSessionId（session/load 全量回放）。成功后
 * navigate 聚焦新实例（detail route 用 sessionId 直查，不依赖列表）+ invalidate
 * sessions/history/overview。navigate 固定 `/projects/$key/...`，key 取「行归属项目优先」
 *（全局行跨项目恢复落其归属项目）。
 */
export function useResumeAgentSession(projectName: string | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const resumeSession = useMutation({
    mutationFn: (input: ResumeAgentSessionInput) =>
      createAgentSession(input.projectName ?? projectName ?? "", input.provider ?? "claude", {
        claudeSessionId: input.claudeSessionId,
        acpSessionId: input.acpSessionId,
        displayName: input.displayName,
      }),
    onSuccess: async (data, input) => {
      const key = input.projectName ?? projectName;
      // key 空 = 不可恢复语境（全局行必带 projectName；契约破坏时防 navigate 到坏 URL）。
      if (!key) return;
      // navigate 优先：detail route 用 sessionId 直查 per-session detail query，不依赖列表。
      // invalidate 后台 fire-and-forget 刷新左栏 InstanceLeftOverview + history 列表。
      await navigate({
        to: "/projects/$key/session/$id",
        params: { key, id: data.session.id },
        // resume 后聚焦新实例，切回 overview tab 看活动组 output（否则停在历史列表）。
        // 函数式 search 保留 view/rightTab 等其他维度（设计 §13 正交）。
        search: (prev) => ({ ...prev, tab: "overview" }),
      });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", key, "agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", key, "agent-history"] }),
        // overview 同步刷新：桌面 prune effect 用 globalRefs（= overview）判定 tab stale，
        // 不刷则新 session 不在 globalRefs、tab 被误删（与 invalidateSessions helper 同源）。
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
      ]);
    },
  });
  return { isResuming: resumeSession.isPending, resume: resumeSession.mutate };
}

/** 三段筛选段（值序 = shared AgentHistoryFilter；切段 = 服务端 filter 切片，spec §4.2）。 */
const HISTORY_FILTERS: readonly { key: AgentHistoryFilter; labelKey: TranslationKey }[] = [
  { key: "all", labelKey: "workbench.historyFilterAll" },
  { key: "active", labelKey: "workbench.historyFilterRunning" },
  { key: "ended", labelKey: "workbench.historyFilterClosed" },
];

/** 五档分组组头文案键（渲染序 = hook groups 的 AGENT_HISTORY_GROUP_ORDER，spec §4.2）。 */
const HISTORY_GROUP_LABEL_KEYS: Record<AgentHistoryGroupKey, TranslationKey> = {
  today: "workbench.historyGroupToday",
  yesterday: "workbench.historyGroupYesterday",
  week: "workbench.historyGroupWeek",
  month: "workbench.historyGroupMonth",
  earlier: "workbench.historyGroupEarlier",
};

type HistoryListProps = {
  focusId?: string;
  /** 项目名；null = 全局作用域（04g「全部」段，行 subtitle 带项目限定符）。 */
  projectName: string | null;
};

/**
 * 历史 session 列表（v1.5 批5 规模化，05c/04g 对齐）：数据管道单源 = useHistoryQuery
 *（服务端三段计数筛选 + 按名搜索 + 五档分组 + 游标分页 20+20）。列表底部三态（§4.2）=
 * 骨架（HistoryListSkeleton）/「加载失败 · 点按重试」（refetch）/「没有更多」，滚动到底自动
 * fetchNextPage。行右键（Mac 05c）/长按（iPad 04g pin⑤）= 恢复/删除… 菜单（02c 单一容器
 * 模式；删除二次确认连历史删除，活跃行不提供——服务端 409）。`projectName=null` 渲染全局
 * 作用域（同一管道同构，仅行 subtitle 多项目限定符）。纯净空态（无筛选无搜索无数据）返回
 * null（左栏段落自然空态，不伪造占位）。
 */
export function HistoryList({ focusId, projectName }: HistoryListProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const { holder: promptHolder, prompt } = usePromptDialog();
  const { confirm, holder: confirmHolder } = useConfirm();
  const {
    filter,
    setFilter,
    search,
    setSearch,
    entries,
    counts,
    groups,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    deleteEntry,
  } = useHistoryQuery({ projectName, enabled: true });
  const { isResuming, resume } = useResumeAgentSession(projectName);
  // 行右键（Mac）/长按（iPad）菜单 state + 触屏长按绑定（单一容器挂载，见 JSX 尾部）。
  const ctx = useRowContextMenu();
  const lp = useLongPressActions(ctx.openAt);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 聚焦活跃实例（中栏开窗格，设计 §4：history 点会话切 overview）。
  const focus = (projectKey: string, sessionId: string) => {
    void navigate({
      to: "/projects/$key/session/$id",
      params: { key: projectKey, id: sessionId },
      search: (prev) => ({ ...prev, tab: "overview" }),
    });
  };

  // 行激活核心（点击/菜单「恢复」共用）：活跃 → 直接聚焦（只是切过去看）；已结束 → 弹命名框
  //（预填历史标题，可选）→ resume 新建。命名可选（留空 = 默认 displayName），取消 = 不新建。
  const activateEntry = (entry: AgentHistoryEntry) => {
    if (entry.hasActiveSession && entry.activeSessionId) {
      const key = entry.projectName ?? projectName;
      if (key) focus(key, entry.activeSessionId);
      return;
    }
    void prompt({
      cancelLabel: t("cancel"),
      confirmLabel: t("session.namePrompt.confirm"),
      initialValue: displayTitleOf(entry),
      placeholder: t("session.namePrompt.placeholder"),
      title: t("session.namePrompt.resumeTitle"),
    }).then((name) => {
      if (name !== null) {
        resume({
          acpSessionId: entry.acpSessionId,
          claudeSessionId: entry.claudeSessionId,
          displayName: name || undefined,
          projectName: entry.projectName ?? projectName ?? undefined,
          provider: entry.provider ?? "claude",
        });
      }
    });
  };

  // 行点击 = 长按守卫（guardClick 抑制长按后紧随的合成 click，05c pin④ 长按 = 菜单）先行。
  const handleRowClick = (entry: AgentHistoryEntry) => {
    if (lp.guardClick()) return;
    activateEntry(entry);
  };

  // 删除（05c pin④：二次确认连历史删除，与 09c/05e 右键同族）。活跃行无此入口（服务端 409）。
  const confirmDelete = (entry: AgentHistoryEntry) => {
    void confirm({
      cancelLabel: t("cancel"),
      confirmLabel: t("workbench.historyDeleteConfirmCta"),
      message: t("workbench.historyDeleteConfirmBody", { name: displayTitleOf(entry) }),
      title: t("workbench.historyDeleteConfirmTitle"),
      tone: "danger",
    }).then((confirmed) => {
      if (confirmed) deleteEntry(entry);
    });
  };

  const menuItems = (entry: AgentHistoryEntry): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [
      {
        icon: <ShellIcon name="rotate" />,
        label: t("workbench.historyMenuResume"),
        onSelect: () => activateEntry(entry),
      },
    ];
    if (!entry.hasActiveSession) {
      items.push({
        icon: <ShellIcon name="trash" />,
        label: t("workbench.historyMenuDelete"),
        onSelect: () => void confirmDelete(entry),
        variant: "destructive",
      });
    }
    return items;
  };

  // 滚动到底自动 +20（§4.2：首屏 20 · 滚动到底自动加载）。
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasNextPage || isFetchingNextPage || isError) return;
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > HISTORY_LOAD_MORE_LEAD_PX) return;
    void fetchNextPage();
  };

  // 首页不足一屏（行数少 × 大屏容器高）时 scroll 事件不会到来，entries 落定后补一次
  // 「已到底」探测，防分页滞留（hasNextPage/isFetchingNextPage 守卫幂等）。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isLoading || isError || isFetchingNextPage || !hasNextPage) return;
    if (el.scrollHeight <= el.clientHeight) void fetchNextPage();
  }, [entries, isLoading, isError, isFetchingNextPage, hasNextPage, fetchNextPage]);

  // 纯净空态（无筛选无搜索无数据无错误）→ null：左栏段落自然空态，不伪造占位（既有契约）。
  // 有筛选/搜索时必须保住筛选段与搜索框在场，否则搜索无结果时用户无法清词。
  if (entries.length === 0 && !isLoading && !isError && search === "" && filter === "all") {
    return null;
  }

  // 列表底部三态（§4.2）：失败重试 / 取下页骨架 / 没有更多；还有下一页 = 静默等滚动触发。
  const footer = isError ? (
    <div className="flex justify-center py-2">
      <button
        className="cursor-pointer text-micro text-ink-2 hover:text-ink-1"
        onClick={() => void refetch()}
        type="button"
      >
        {t("workbench.historyLoadFailed")}
      </button>
    </div>
  ) : isFetchingNextPage ? (
    <div className="px-3 pb-2">
      <HistoryListSkeleton />
    </div>
  ) : !hasNextPage ? (
    <div className="px-3 py-2 text-micro text-ink-3">{t("workbench.historyEndOfList")}</div>
  ) : null;

  // 当前打开右键/长按菜单的行（02c 单一容器模式：find(pointFor) 命中才挂，行外挂 →
  // scrim 冒泡不经行；frontend-notes §4 同源考量）。
  const menuEntry = entries.find((entry) => ctx.pointFor(rowKey(entry)) !== null) ?? null;

  return (
    /* 根 flex-1：作为左栏历史态 wrapper 的 flex item 占满剩余高（workbench-side 挂载点）。 */
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 05c .hlist：筛选段 + 搜索 + 分组列表 + 底部三态同入滚动区（原型结构）。 */}
      <div className="min-h-0 flex-1 overflow-y-auto" onScroll={handleScroll} ref={scrollRef}>
        {/* 三段计数筛选（05c :59 / 04g :59 seg4 mini fseg 规格 + 段内嵌 em.n 计数；counts
            服务端聚合，切段不重拉不闪）。桌面分段 = .seg4 单源（r10，与 scope 段同 rail 同形）；
            移动 03n 用 .segc（r8）——两端容器各自原型形态。 */}
        <div className="seg4 mini mx-2 mb-1 mt-3.5" role="tablist">
          {HISTORY_FILTERS.map((f) => (
            <span
              aria-selected={filter === f.key}
              className={`cursor-pointer${filter === f.key ? " on" : ""}`}
              key={f.key}
              onClick={() => setFilter(f.key)}
              role="tab"
            >
              {t(f.labelKey)}
              <em className="n">{counts[f.key]}</em>
            </span>
          ))}
        </div>
        {/* 搜索（05c :60 search mini 30px 变体；受控 input，防抖在管道层 use-history-query）。 */}
        <div className="mx-2 mb-1.5 flex h-7.5 items-center gap-1.5 rounded-md bg-elevated2 px-2.5">
          <ShellIcon aria-hidden className="size-3 flex-none text-ink-3" name="magnifyingglass" />
          <input
            aria-label={t("workbench.historySearchPlaceholder")}
            className="w-full bg-transparent text-caption text-ink-1 outline-none placeholder:text-ink-3"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("workbench.historySearchPlaceholder")}
            type="search"
            value={search}
          />
        </div>
        {isLoading ? (
          <div className="px-3">
            <HistoryListSkeleton />
          </div>
        ) : entries.length === 0 ? (
          isError ? (
            footer
          ) : (
            <div className="px-3 py-2 text-caption text-ink-2">
              {filter === "ended" && search === ""
                ? t("workbench.historyEndedEmpty")
                : t("workbench.historyEmpty")}
            </div>
          )
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.key}>
                {/* 五档组头（05c :63 microlabel margin 6px 6px 2px 页私值）。 */}
                <div className="microlabel mx-1.5 mb-0.5 mt-1.5">
                  {t(HISTORY_GROUP_LABEL_KEYS[group.key])}
                </div>
                <ListGroup>
                  {group.entries.map((entry) => (
                    <HistorySessionNode
                      active={entry.hasActiveSession && entry.activeSessionId === focusId}
                      entry={entry}
                      isResuming={isResuming}
                      key={rowKey(entry)}
                      longPress={lp.bind(rowKey(entry))}
                      onActivate={() => handleRowClick(entry)}
                      onContextMenu={(event) => ctx.openAt(rowKey(entry), event)}
                    />
                  ))}
                </ListGroup>
              </div>
            ))}
            {/* 不挂 animate-stagger-rows（frontend-notes §17）：lastActivityAt 动态排序 +
                WS/分页追加 = insertBefore 移动 keyed DOM → CSS animation 从头重播闪烁。
                stagger 只保留排序稳定列表（instance-area createdAt / file-browser 名字序）。 */}
            {footer}
          </>
        )}
      </div>
      {menuEntry ? (
        <ActionMenu
          contextMenuPoint={ctx.pointFor(rowKey(menuEntry))}
          items={menuItems(menuEntry)}
          onContextMenuClose={ctx.close}
          trigger={<span className="hidden" />}
        />
      ) : null}
      {promptHolder}
      {confirmHolder}
    </div>
  );
}

/** 触屏长按绑定包（useLongPressActions().bind(key) 的返回形态）。 */
type HistoryLongPressBindings = ReturnType<ReturnType<typeof useLongPressActions>["bind"]>;

type HistorySessionNodeProps = {
  active: boolean;
  entry: AgentHistoryEntry;
  isResuming: boolean;
  longPress: HistoryLongPressBindings;
  onActivate: () => void;
  onContextMenu: (event: MouseEvent) => void;
};

function HistorySessionNode({
  active,
  entry,
  isResuming,
  longPress,
  onActivate,
  onContextMenu,
}: HistorySessionNodeProps) {
  const { t } = useT();
  const time = relativeTime(entry.lastActivityAt ?? entry.startedAt ?? "", t);
  // 全局作用域行带项目限定符（04g pin②「全部 = 跨项目列表，行带项目限定符」）：
  // subtitle 前缀归属项目；项目作用域响应无 projectName 字段，自然退化为原形态。
  const description = isResuming
    ? t("project.historyResuming")
    : [entry.projectName, time, entry.fileSize > 0 ? formatBytes(entry.fileSize) : null]
        .filter(Boolean)
        .join(" · ");
  return (
    <ListRow
      marker={sessionMarker("agent", "sm")}
      meta={entry.hasActiveSession ? ActiveDot : undefined}
      onClick={() => {
        if (!isResuming) onActivate();
      }}
      onContextMenu={onContextMenu}
      {...longPress}
      /* sm = 侧栏行档（.srow2.inst 13px / meta 10.5px，05c 历史行规格）——默认档 16px
         在左栏与 srow2 inst 实例试点行（13px 单源类）同栏对比明显偏大（真机反馈）。 */
      selected={active}
      size="sm"
      subtitle={description || undefined}
      title={displayTitleOf(entry)}
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
