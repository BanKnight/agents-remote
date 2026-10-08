// M5-a 浮层族 sheet 页（§6.4 摊牌：03l 切换 / 03n 会话历史 / 03j 新建实例）。原语消费
// v2-primitives M5 段（grp/sess/fc/hrow…）；容器 = `MobileSheet`（Radix modal + .msheet）。
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ApprovalSummary } from "@agents-remote/shared";

import {
  HISTORY_FILTERS,
  HISTORY_GROUP_LABEL_KEYS,
  buildResumeInput,
  displayTitleOf,
  relativeTime,
  rowKey,
  useResumeAgentSession,
} from "./history-list";
import { ApprovalAllowAll } from "./approval-popover";
import { useConfirm } from "../shell/confirm-dialog";
import { usePromptDialog } from "../shell/prompt-dialog";
import { isHotTool, useApprovalCenter } from "../../hooks/use-approvals";
import { useT } from "../../i18n";
import { MobileSheet } from "../shell/mobile-sheet";
import { ShellIcon } from "../shell/icons";
import { useGlobalInstanceCandidates } from "./instance-area";
import type { CreateSessionApi } from "./instance-area";
import { ListRowSkeleton, statusToV2DotClass } from "../shell/shell-primitives";
import { useHistoryQuery } from "./use-history-query";

/** 会话状态 → dot 变体（run 绿实心 / err 红实心 / idle 空心描边；03l d2 与 11 acard 共用）。 */
function sessDotClass(status: string): string {
  if (status === "running") return "run";
  if (status === "error") return "err";
  return "idle";
}

/**
 * 03l 项目切换 sheet（nav 标题 ▾ 入口）：按项目分组的活跃会话一步切换（原 2 跳变 1 跳）。
 * 点会话 = 切项目并激活该会话；点分组头 = 只切项目；空组 gempty 引导点分组头进项目；
 * newp 行 = 调用方 openCreate（08 新建/采用项目）。搜索同 match 项目名 + 会话名（编号③）。
 *
 * `projectOnly`（插件页 ▾ 复用，真机反馈 2026-09-28）：插件语境无会话上下文——语义是
 * 「切换项目」而非「切换会话」，隐藏会话行与空组引导（sessions 只供组头 ● 计数）、
 * 搜索只按项目名、标题切「切换作用域」。
 */
export function MobileProjectSwitchSheet({
  currentSessionId,
  onCreateProject,
  onOpenChange,
  onSwitchProject,
  onSwitchSession,
  open,
  projectOnly = false,
}: {
  /** 当前聚焦会话（.sess.on 高亮；L3/工具态为 undefined 无高亮）。 */
  currentSessionId?: string;
  onCreateProject: () => void;
  onOpenChange: (open: boolean) => void;
  onSwitchProject: (projectName: string) => void;
  /** projectOnly 时不传（无会话行不可点）。 */
  onSwitchSession?: (projectName: string, sessionId: string) => void;
  open: boolean;
  projectOnly?: boolean;
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const { candidates, projectNames } = useGlobalInstanceCandidates({ kind: "global" });
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projectNames
      .map((name) => ({
        name,
        sessions: candidates.filter(
          (c) =>
            c.ref.projectName === name &&
            (!q ||
              name.toLowerCase().includes(q) ||
              (!projectOnly && c.displayName.toLowerCase().includes(q))),
        ),
      }))
      .filter(
        (g) => !q || g.name.toLowerCase().includes(q) || (!projectOnly && g.sessions.length > 0),
      );
  }, [candidates, projectNames, query, projectOnly]);
  return (
    <MobileSheet
      onOpenChange={onOpenChange}
      open={open}
      title={projectOnly ? t("plugins.scopeSwitchTitle") : t("workbench.switchTitle")}
    >
      {/* 搜索框（原型 36px elevated2 r10 + 14px + 放大镜） */}
      <div className="mt-2.5 flex h-9 items-center gap-2 rounded-md bg-elevated2 px-3">
        <ShellIcon className="size-[15px] flex-none text-ink-2" name="magnifyingglass" />
        <input
          aria-label={t("workbench.switchSearch")}
          className="w-full bg-transparent text-[14px] text-ink-1 outline-none placeholder:text-ink-2"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("workbench.switchSearch")}
          value={query}
        />
      </div>
      {groups.map((group) => (
        <div key={group.name}>
          <button
            className="grp w-full cursor-pointer text-left"
            onClick={() => {
              onOpenChange(false);
              onSwitchProject(group.name);
            }}
            type="button"
          >
            {group.name}
            <span className={`c ${group.sessions.length > 0 ? "text-success-text" : "text-ink-2"}`}>
              {group.sessions.length > 0 ? `● ${group.sessions.length}` : "—"}
            </span>
          </button>
          {!projectOnly && group.sessions.length === 0 ? (
            <p className="gempty">{t("workbench.switchEmptyGroup")}</p>
          ) : !projectOnly ? (
            group.sessions.map((candidate) => (
              <button
                className={`sess w-full cursor-pointer text-left${
                  candidate.ref.sessionId === currentSessionId ? " on" : ""
                }${candidate.status === "running" || candidate.status === "error" ? "" : " off"}`}
                key={candidate.ref.sessionId}
                onClick={() => {
                  onOpenChange(false);
                  onSwitchSession?.(group.name, candidate.ref.sessionId);
                }}
                type="button"
              >
                <span className={`sd ${sessDotClass(candidate.status)}`} />
                {candidate.displayName}
              </button>
            ))
          ) : null}
        </div>
      ))}
      <button
        className="newp w-full cursor-pointer"
        onClick={() => {
          onOpenChange(false);
          onCreateProject();
        }}
        type="button"
      >
        <svg fill="none" stroke="currentColor" viewBox="-10 -10 20 20">
          <circle r="9" />
          <path d="M0,-4.5 V4.5 M-4.5,0 H4.5" />
        </svg>
        {t("workbench.switchNewProject")}
      </button>
    </MobileSheet>
  );
}

/** 左滑露出的删除钮宽（03n 原型 .del 64px；v2-primitives `.hrow.swipe .del` 同源）。 */
const SWIPE_REVEAL_WIDTH_PX = 64;
/** 手势轴向判定阈值：|dx|、|dy| 都越过才判向（tap slop 内不接管，保行体 click 合成）。 */
const SWIPE_AXIS_PX = 8;
/** 松手吸附判定：滑过露出宽一半 = 常开，否则收回。 */
const SWIPE_OPEN_RATIO = 0.5;

/**
 * 03n 左滑删除行（v1.5 批5）：行体 .hbody 跟手左滑露出垫底 .del 删除钮，松手过半吸附常开；
 * 删除必经调用方二次确认（requestDelete → useConfirm），行体点按仍走原 resume 链。
 * 轴向判定 + 指针捕获（frontend-notes §14 pointer 驱动；§23 失联清理：capture 前 pending
 * 指针离界即放弃）；`touch-pan-y` 把竖滚交还浏览器（横滑才进手势，替代 touchmove prevent），
 * 拖拽期摘 transition 跟手（§18 同族）。hasActiveSession 行不消费本组件（服务端删除 409，
 * 入口不提供）。开态点行体 = 仅收起（iOS 惯例，激活走纯 tap）。
 */
function HistorySwipeRow({
  actionLabel,
  children,
  onActivate,
  onDelete,
  onOpenChange,
  open,
}: {
  /** 删除钮文案（workbench.historyDelete）。 */
  actionLabel: string;
  children: ReactNode;
  /** 行体纯 tap（未成滑动手势）= 原 resume 链。 */
  onActivate: () => void;
  onDelete: () => void;
  /** 吸附后开态上报（父层 swipedId 单源，同时至多一行开）。 */
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  // DOM 就绪信号走 state ref callback（§14：portal 子树挂载晚于宿主 effect）。
  const [bodyNode, setBodyNode] = useState<HTMLButtonElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  type Gesture =
    | { phase: "idle" }
    | { phase: "pending"; x0: number; y0: number; pointerId: number }
    | { phase: "dragging"; x0: number; y0: number; base: number; x: number };
  const gesture = useRef<Gesture>({ phase: "idle" });
  // 滑动手势松手后的 click 合成抑制（capture 目标 = 行体，pointerup 必跟 click）。
  const draggedRef = useRef(false);

  // open 受控同步（父层 swipedId 驱动：开另一行 / 关 sheet / 删除后重置）。
  useEffect(() => {
    const el = bodyNode;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = `translateX(${open ? -SWIPE_REVEAL_WIDTH_PX : 0}px)`;
  }, [open, bodyNode]);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    // 不进 sheet 下拉手势（其 pending 会捕获竖向漂移 >6px 的横滑并拖走整个 sheet）。
    e.stopPropagation();
    gesture.current = { phase: "pending", x0: e.clientX, y0: e.clientY, pointerId: e.pointerId };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (g.phase === "idle") return;
    if (g.phase === "pending") {
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (Math.abs(dx) > SWIPE_AXIS_PX && Math.abs(dx) > Math.abs(dy)) {
        // 横向接管：capture 后续指针（移出行体仍跟手）；位移基点 = 当前开合偏移。
        e.currentTarget.setPointerCapture(g.pointerId);
        draggedRef.current = true;
        const base = openRef.current ? -SWIPE_REVEAL_WIDTH_PX : 0;
        gesture.current = { phase: "dragging", x0: g.x0, y0: g.y0, base, x: base };
      } else if (Math.abs(dy) > SWIPE_AXIS_PX) {
        gesture.current = { phase: "idle" }; // 纵向 = 列表滚动意图，放弃（pan-y 交浏览器）。
      }
      return;
    }
    const x = Math.min(0, Math.max(-SWIPE_REVEAL_WIDTH_PX, g.base + (e.clientX - g.x0)));
    gesture.current = { ...g, x };
    // 拖拽摘 transition 跟手。
    e.currentTarget.style.transition = "none";
    e.currentTarget.style.transform = `translateX(${x}px)`;
  };

  const settle = (el: HTMLButtonElement) => {
    const g = gesture.current;
    gesture.current = { phase: "idle" };
    if (g.phase !== "dragging") return;
    const next = g.x < -SWIPE_REVEAL_WIDTH_PX * SWIPE_OPEN_RATIO;
    // 吸附恢复类上过渡（.hbody transition = --duration-exit）。
    el.style.transition = "";
    el.style.transform = `translateX(${next ? -SWIPE_REVEAL_WIDTH_PX : 0}px)`;
    onOpenChange(next);
  };

  return (
    <div className="hrow swipe end">
      <button
        className="hbody cursor-pointer select-none touch-pan-y"
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false; // 滑动手势松手的 click 合成，非点按。
            return;
          }
          if (openRef.current) {
            onOpenChange(false); // 开态点行体 = 仅收起。
            return;
          }
          onActivate();
        }}
        onPointerCancel={(e) => settle(e.currentTarget)}
        onPointerDown={onPointerDown}
        onPointerLeave={() => {
          // capture 前 pending 指针离界 = 手势失联，放弃（§23）。
          if (gesture.current.phase === "pending") gesture.current = { phase: "idle" };
        }}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => settle(e.currentTarget)}
        ref={setBodyNode}
        type="button"
      >
        {children}
      </button>
      <button className="del cursor-pointer" onClick={onDelete} type="button">
        {actionLabel}
      </button>
    </div>
  );
}

/**
 * 03n 会话历史 sheet（nav ⋯ →「会话历史」入口，编号①）：v1.5 批5 规模化查询模型（spec §4.2
 * 会话历史查询）——三段计数筛选（.segc + 段内服务端聚合计数）+ 按名搜索 + 五档分组组头
 *（.gh 随数据出现）+ 游标分页三态尾（滚动到底自动 +20 / 没有更多 / 失败重试）+ 左滑删除
 *（closed 行，二次确认）。数据走 useHistoryQuery 单源管道（与桌面 05c / iPad 04g 同构消费），
 * 旧「客户端全量 + 折叠窗口」（useHistorySessions + useHistoryRecentWindow）退役。
 * hasActiveSession 行点击 = 聚焦既有实例（activeSessionId，不新建，无删除入口）；closed 行
 * 点按 = prompt 命名 → resume 复用同 id。end 行 d2 轮次/费用原型数据无来源不画（诚实呈现）。
 */
export function MobileSessionHistorySheet({
  onFocusExisting,
  onOpenChange,
  open,
  projectName,
}: {
  /** 活跃态行点击：关闭 sheet 聚焦既有实例（不新建）。 */
  onFocusExisting: (sessionId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectName: string;
}) {
  const { t } = useT();
  // open gate：sheet 常驻挂载（open 只控显隐），不打开不发查询；filter/search UI 态由 hook
  // 代管（§6.10 视图态不持久化）。v1.5 批5 规模化：服务端查询（三段筛选计数 + 搜索 + 游标
  // 分页）+ 五档分组派生，取代客户端全量拉取 + 折叠窗口。
  const {
    counts,
    deleteEntry,
    entries,
    fetchNextPage,
    filter,
    groups,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading,
    refetch,
    search,
    setFilter,
    setSearch,
  } = useHistoryQuery({ projectName, enabled: open });
  const { resume } = useResumeAgentSession(projectName);
  const renameDialog = usePromptDialog();
  const confirmDialog = useConfirm();
  // 左滑开态行 id（同时至多一行开）；关 sheet 重置，重开不残留开行。
  const [swipedId, setSwipedId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) setSwipedId(null);
  }, [open]);

  // 滚动到底自动 +20（03n 编号④）：哨兵 IntersectionObserver——.msheet 裁剪后哨兵可见
  // 即与视口相交，root 缺省（视口）即可；isFetchingNextPage 期不重复触发。
  const [tailNode, setTailNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!tailNode || !open || !hasNextPage || isFetchingNextPage) return;
    const io = new IntersectionObserver(
      (obs) => {
        if (obs.some((o) => o.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: "80px" },
    );
    io.observe(tailNode);
    return () => io.disconnect();
  }, [tailNode, open, hasNextPage, isFetchingNextPage, fetchNextPage]);

  /** 行 key：id 缺失退 title/firstMessage/startedAt 兜底，防双空串 key 冲突（code review P2-6 同族）。 */
  const entryKey = rowKey;

  const openClosedEntry = (entry: (typeof entries)[number]) => {
    void renameDialog
      .prompt({
        title: t("session.namePrompt.resumeTitle"),
        placeholder: t("session.namePrompt.placeholder"),
        // 预填标题 = displayTitleOf 单源(此前 inline 无 nativeId 兜底,两端漂移)。
        initialValue: displayTitleOf(entry),
        confirmLabel: t("session.namePrompt.confirm"),
        cancelLabel: t("cancel"),
        tone: "default",
      })
      .then((displayName) => {
        if (displayName === null) return;
        // resume 输入装配 = buildResumeInput 单源(provider + 原生 session id + 项目归属)。
        resume({
          ...buildResumeInput(entry, projectName),
          displayName: displayName.trim() || undefined,
        });
      });
  };

  /** 左滑删除（spec §4.2：二次确认——Alert 族；服务端 hasActiveSession 409 兜底）。 */
  const requestDelete = async (entry: (typeof entries)[number]) => {
    setSwipedId(null);
    const confirmed = await confirmDialog.confirm({
      cancelLabel: t("cancel"),
      confirmLabel: t("workbench.historyDeleteConfirmCta"),
      message: t("workbench.historyDeleteConfirmBody", {
        name: displayTitleOf(entry),
      }),
      title: t("workbench.historyDeleteConfirmTitle"),
      tone: "danger",
    });
    if (confirmed) deleteEntry(entry);
  };

  /** 失败重试态（03n 列表底部三态之一；首屏失败 = 列表位、追加分页失败 = 列表尾）。 */
  const retryPill = (
    <div className="flex justify-center pb-2 pt-1">
      <button className="fc ghost cursor-pointer" onClick={() => void refetch()} type="button">
        {t("workbench.historyLoadFailed")}
      </button>
    </div>
  );
  return (
    <>
      <MobileSheet
        aside={projectName}
        onOpenChange={onOpenChange}
        open={open}
        title={t("workbench.historyTitle")}
      >
        {/* 三段计数筛选（03n 编号②：.segc 单源 + 段内嵌服务端聚合计数；margin 走 utility
            14/16——旧 mx-0 mt-2.5 曾被 unlayered .segc margin 压制从未生效，实际视觉一直是
            14/16，utility 对齐实际视觉，批13 margin 语境化）。 */}
        <div className="segc mx-4 mt-3.5" role="group">
          {HISTORY_FILTERS.map((f) => (
            <button
              aria-pressed={filter === f.key}
              className={`cursor-pointer${filter === f.key ? " on" : ""}`}
              key={f.key}
              onClick={() => setFilter(f.key)}
              type="button"
            >
              {t(f.labelKey)}
              <em className="n">{counts[f.key]}</em>
            </button>
          ))}
        </div>
        {/* 搜索（03n 编号③：服务端按会话名过滤；行原语 = 03l 切换 sheet 同款紧凑搜索）。 */}
        <div className="mt-2 flex h-9 items-center gap-2 rounded-md bg-elevated2 px-3">
          <ShellIcon className="size-[15px] flex-none text-ink-2" name="magnifyingglass" />
          <input
            aria-label={t("workbench.historySearchPlaceholder")}
            className="w-full bg-transparent text-[14px] text-ink-1 outline-none placeholder:text-ink-2"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("workbench.historySearchPlaceholder")}
            value={search}
          />
        </div>
        <div className="mt-1.5">
          {isLoading ? (
            // 加载态（M10 第三轮用户反馈「缺少加载态提示」）：isLoading 区分加载与空态，避免
            // 打开即闪「暂无会话」误导。§6.12o 收敛：手写 animate-pulse 灰条 → ListRowSkeleton
            // 单源（shimmer 单源；.hrow 无 marker/行尾方块 → marker=false + action="none"），
            // role="status" aria-label 语义保留在外壳。
            <div aria-label={t("workbench.historyLoading")} role="status">
              <ListRowSkeleton action="none" count={2} marker={false} />
            </div>
          ) : entries.length === 0 ? (
            isError ? (
              retryPill
            ) : (
              <p className="py-3 text-center text-footnote text-ink-2">
                {t("workbench.historyEmpty")}
              </p>
            )
          ) : (
            <>
              {/* 五档分组组头（03n 编号④：gh 随数据出现；组内序 = 服务端倒序入桶保序）。 */}
              {groups.map((group) => (
                <div key={group.key}>
                  <div className="gh">{t(HISTORY_GROUP_LABEL_KEYS[group.key])}</div>
                  {group.entries.map((entry) => {
                    const running = entry.hasActiveSession;
                    const time = relativeTime(entry.lastActivityAt ?? entry.startedAt ?? "", t);
                    const key = entryKey(entry);
                    const r1 = (
                      <span className="r1">
                        {/* 已结束行无 dot（原型 03n end 行只有文字，reviewer P2-6）。 */}
                        {running ? <span className={statusToV2DotClass("running")} /> : null}
                        <span className="min-w-0 flex-1 truncate">
                          {entry.title ?? entry.firstMessage ?? time}
                        </span>
                        <span className={`st${running ? " run" : ""}`}>
                          {running
                            ? t("workbench.historyRunning", { time })
                            : t("workbench.historyClosed", { time })}
                        </span>
                      </span>
                    );
                    return running ? (
                      <button
                        className="hrow block w-full cursor-pointer text-left"
                        key={key}
                        onClick={() => {
                          onOpenChange(false);
                          if (entry.activeSessionId) onFocusExisting(entry.activeSessionId);
                        }}
                        type="button"
                      >
                        {r1}
                      </button>
                    ) : (
                      <HistorySwipeRow
                        actionLabel={t("workbench.historyDelete")}
                        key={key}
                        onActivate={() => {
                          onOpenChange(false);
                          openClosedEntry(entry);
                        }}
                        onDelete={() => void requestDelete(entry)}
                        onOpenChange={(next) => setSwipedId(next ? key : null)}
                        open={swipedId === key}
                      >
                        {r1}
                      </HistorySwipeRow>
                    );
                  })}
                </div>
              ))}
              {/* 游标三态尾（03n 编号④）：失败重试 > 哨兵（滚动到底自动 +20，拉取中提示）>
                  已加载完 = 「没有更多」。 */}
              {isError ? (
                retryPill
              ) : hasNextPage ? (
                <div className="flex justify-center py-2" ref={setTailNode} data-history-tail>
                  {isFetchingNextPage ? (
                    <span aria-label={t("workbench.historyLoading")} className="hend" role="status">
                      {t("workbench.historyLoading")}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="hend py-2 text-center">{t("workbench.historyEndOfList")}</p>
              )}
            </>
          )}
        </div>
        <p className="hfoot">{t("workbench.historyFoot")}</p>
      </MobileSheet>
      {/* holders 必须在 sheet 子树外：closed 行点击关 sheet 后，Radix exit 动画播完即卸载
          Content 子树，嵌套其中的 prompt/confirm（Portal→body）会被连带卸载——input 消失、
          resolve 悬空（探针实锤）。与 03j 新建实例 sheet「prompt 由顶层 holder 承载」同因同解：
          Fragment 兄弟位落在本组件调用方（workbench 层）而非 sheet Content 内。 */}
      {renameDialog.holder}
      {confirmDialog.holder}
    </>
  );
}

/**
 * 03j 新建实例 sheet（row2 ＋ 与 03h 空态卡 CTA 共用入口，编号②）：srow/tile 富行取代
 * ActionMenu 菜单形态。按现状能力诚实呈现 3 行（Claude/OMP/终端）——原型 Codex/Chat（Pi）
 * 行无接入能力不画（M3 同拍板）。行点击 = onOpenChange(false) + create（命名 prompt 弹窗
 * 由 workbench 顶层 holder 承载，sheet 卸载后可见）。
 */
export function MobileCreateInstanceSheet({
  create,
  onOpenChange,
  open,
  projectName,
}: {
  create: CreateSessionApi;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectName: string;
}) {
  const { t } = useT();
  const dismiss = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  return (
    <MobileSheet
      aside={projectName}
      onOpenChange={onOpenChange}
      open={open}
      title={t("workbench.createTitle")}
    >
      <div className="slabel">{t("workbench.createGroupAgent")}</div>
      <button
        className="srow w-full cursor-pointer text-left"
        disabled={create.isCreating}
        onClick={() => dismiss(() => create.createAgent("claude"))}
        type="button"
      >
        <span className="tile bg-tint-blue text-pin">
          <ShellIcon className="size-[19px]" name="sparkles" />
        </span>
        <span className="tx">
          <span className="n">＋ {t("workbench.createClaude")}</span>
          <span className="d">{t("workbench.createClaudeDesc")}</span>
        </span>
        <span className="ar">›</span>
      </button>
      <button
        className="srow w-full cursor-pointer text-left"
        disabled={create.isCreating}
        onClick={() => dismiss(() => create.createAgent("omp"))}
        type="button"
      >
        <span className="tile bg-tint-orange text-warning">
          <ShellIcon className="size-[19px]" name="bolt" />
        </span>
        <span className="tx">
          <span className="n">＋ {t("workbench.createOmp")}</span>
          <span className="d">{t("workbench.createOmpDesc")}</span>
        </span>
        <span className="ar">›</span>
      </button>
      <div className="slabel">{t("workbench.createGroupTerminal")}</div>
      <button
        className="srow w-full cursor-pointer text-left"
        disabled={create.isCreating}
        onClick={() => dismiss(create.createTerminal)}
        type="button"
      >
        <span className="tile bg-tint-green text-success">
          <ShellIcon className="size-[19px]" name="terminal" />
        </span>
        <span className="tx">
          <span className="n">{t("workbench.createTerminalFull")}</span>
          <span className="d">{t("workbench.createTerminalDesc")}</span>
        </span>
        <span className="ar">›</span>
      </button>
    </MobileSheet>
  );
}

/**
 * M5-b 审批中心 sheet（11 原型）：shd = 标题 + .cnt 计数 + .all 全部允许（二次确认）；
 * acard = dot + 会话名 + pj 项目 chip + cmd mono 摘要 + 拒绝/允许；sfoot 操作说明。
 * runtimeAlive=false 卡置灰禁响应（断线冻结，spec 验收）；点卡跳会话由 onOpenSession 装配。
 */
export function MobileApprovalSheet({
  approvals,
  onOpenChange,
  onOpenSession,
  open,
}: {
  /** 待审批快照（调用方 useApprovals 单订阅，页面与 sheet 共用一份数据）。 */
  approvals: ApprovalSummary[];
  onOpenChange: (open: boolean) => void;
  /** 点卡跳会话（断线冻结卡不可点）。 */
  onOpenSession: (projectName: string, sessionId: string) => void;
  open: boolean;
}) {
  const { t } = useT();
  const center = useApprovalCenter(approvals);
  const { pendingCount, respond, resetConfirmAll } = center;

  return (
    <MobileSheet
      headerExtra={<ApprovalAllowAll center={center} />}
      onOpenChange={(next) => {
        if (!next) resetConfirmAll();
        onOpenChange(next);
      }}
      open={open}
      title={t("approvals.title")}
    >
      {pendingCount === 0 ? (
        <p className="hfoot">{t("approvals.empty")}</p>
      ) : (
        approvals.map((item) => (
          <div className={`acard${item.runtimeAlive ? "" : " off"}`} key={item.controlRequestId}>
            <div className="r1">
              <span className={`dot ${item.runtimeAlive ? "run" : "ring"}`} />
              <button
                className="min-w-0 cursor-pointer truncate bg-transparent text-left font-inherit"
                disabled={!item.runtimeAlive}
                onClick={() => {
                  onOpenChange(false);
                  onOpenSession(item.projectName, item.sessionId);
                }}
                title={item.sessionName}
                type="button"
              >
                {item.sessionName}
              </button>
              <span className="pj">{item.projectName}</span>
            </div>
            <div className={`cmd${isHotTool(item) ? " hot" : ""}`}>{item.inputSummary}</div>
            <div className="r3">
              <button
                className="btn ghost cursor-pointer"
                disabled={!item.runtimeAlive || respond.isPending}
                onClick={() =>
                  respond.mutate({
                    controlRequestId: item.controlRequestId,
                    decision: "deny",
                    projectName: item.projectName,
                    sessionId: item.sessionId,
                  })
                }
                type="button"
              >
                {t("claude.permission.deny")}
              </button>
              <button
                className="btn ok cursor-pointer"
                disabled={!item.runtimeAlive || respond.isPending}
                onClick={() =>
                  respond.mutate({
                    controlRequestId: item.controlRequestId,
                    decision: "allow",
                    projectName: item.projectName,
                    sessionId: item.sessionId,
                  })
                }
                type="button"
              >
                {t("claude.permission.allow")}
              </button>
            </div>
          </div>
        ))
      )}
      {/* 应答失败行内提示（mutation isError；再点任意按钮自动重置——SessionDetailRoute 先例）。 */}
      {respond.isError ? (
        <p className="hfoot text-error">{t("api.approvalsRespondFailed")}</p>
      ) : null}
      <div className="sfoot">{t("approvals.foot")}</div>
    </MobileSheet>
  );
}
