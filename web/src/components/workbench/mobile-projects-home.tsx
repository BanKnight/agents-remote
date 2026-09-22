import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";

import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";
import { statusDotToneBg, statusToTone } from "../shell/shell-primitives";
import { useCreateProjectDialog } from "../shell/project-setup";
import { relativeTime } from "./history-list";
import { useGlobalInstanceCandidates } from "./instance-area";
import { usePinnedSessions } from "../../hooks/pinned-sessions";
import { useApprovals } from "../../hooks/use-approvals";
import { MobileApprovalSheet } from "./mobile-sheets";
import {
  rankGlobalInstances,
  workbenchMobileFocusTabAtom,
  type GlobalInstanceCandidate,
} from "../../routes/workbench-model";

/** 全局活动卡默认展示的活动行数（see-all 展开余量）。 */
const ACTIVITY_PREVIEW_COUNT = 3;

type ActivityRow = {
  candidate: GlobalInstanceCandidate;
  pinned: boolean;
};

/**
 * 移动端 [项目] Tab 主页（redesign-v2.md M3，对标 `02-tab-projects.html`）。
 *
 * 结构（原型自上而下）：Large title 行（`项目` 30px/800 + ➕ 新建 + ⚙ 设置——D21：设置自底
 * nav 移到项目页 ⚙ push）→ 搜索框（客户端过滤项目名与实例名）→ 全局活动卡（审批行 [M5 接
 * D8 服务端聚合，pending=0 隐藏] + 活动行 [D14：副行用现有 subtitle] + see-all 展开）→
 * 项目行列表（folder 徽章 + 实例数/最近活动副行 + ● N 进行中 tchip）。
 *
 * v2 起本页无 Agent/Chat mode tabs（v1 一级「会话」页语义消亡）：chat 归 `default` 项目实例
 * 体系（D6），`/chat` 深度链接保留。数据与全局总览同源（`["overview"]` query，React Query
 * dedupe），点活动行/项目行 → 进 project scope 工作台。
 */
export function MobileProjectsHome() {
  const { t } = useT();
  const navigate = useNavigate();
  const [, setFocusTab] = useAtom(workbenchMobileFocusTabAtom);
  const { openCreate, dialog: createProjectDialog } = useCreateProjectDialog();
  const { candidates, projectNames, isLoaded } = useGlobalInstanceCandidates({
    kind: "global",
  });
  const { pinned } = usePinnedSessions();
  const [query, setQuery] = useState("");
  const [showAllActivity, setShowAllActivity] = useState(false);
  // M5-b 审批中心：ap-row 入口（原型 02 .ap-row，pending=0 隐藏）+ 11 sheet。?approvals=1
  //（tray 标题入口②）→ 挂载即开；关闭时清参避免返回键死循环。
  const { approvals } = useApprovals(true);
  const search = useSearch({ strict: false });
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  useEffect(() => {
    if (search.approvals === true) setApprovalsOpen(true);
  }, [search.approvals]);
  const closeApprovals = () => {
    setApprovalsOpen(false);
    if (search.approvals === true) {
      // 函数式只清 approvals 参数，保留 search schema 其他维度（reviewer P3）。
      void navigate({
        to: "/projects",
        search: (prev) => ({ ...prev, approvals: undefined }),
      });
    }
  };
  const openApprovals = () => setApprovalsOpen(true);

  // 相对时间 ticker：「N 分钟前」要随时间流逝重算——time 字段已移出 useMemo（渲染时实时算），
  // ticker 只负责触发重渲染。数据源新鲜度由 overview query 的 10s refetchInterval 补（M10 用户反馈②）。
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((v) => v + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // 活动行 = 全局候选按 needs-interaction > running > terminal 排序（与全局面板同序），置顶恒排
  // 最前，搜索时按实例名/副行过滤。时间戳（fallback updatedAt → createdAt）不进 memo，渲染时实时算。
  const activityRows = useMemo<ActivityRow[]>(() => {
    const q = query.trim().toLowerCase();
    const ranked = rankGlobalInstances(candidates)
      .map((ref) => candidates.find((c) => c.ref.sessionId === ref.sessionId))
      .filter((c): c is GlobalInstanceCandidate => !!c)
      .filter((c) => {
        if (!q) return true;
        return (
          c.displayName.toLowerCase().includes(q) ||
          (c.subtitle ?? "").toLowerCase().includes(q) ||
          c.ref.projectName.toLowerCase().includes(q)
        );
      })
      .map((candidate) => ({
        candidate,
        pinned: pinned.has(candidate.ref.sessionId),
      }));
    // 置顶行恒排最前（M10 用户反馈①「真正置顶」）：紫标之外补排序语义；sort 稳定（ES2019+），
    // 置顶组内保持 rank 序。
    return ranked.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [candidates, pinned, query]);

  const runningCount = useMemo(
    () => candidates.filter((c) => c.status === "running").length,
    [candidates],
  );

  // 项目行 = 项目名搜索过滤 + 每项目聚合（活跃实例数 + 最近实例 + 时间）。
  const projectRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projectNames
      .filter((name) => !q || name.toLowerCase().includes(q))
      .map((name) => {
        const instances = candidates.filter((c) => c.ref.projectName === name);
        const latest = instances.reduce<GlobalInstanceCandidate | null>((acc, cur) => {
          const curAt = cur.updatedAt ?? cur.createdAt ?? "";
          const accAt = acc?.updatedAt ?? acc?.createdAt ?? "";
          return curAt > accAt ? cur : acc;
        }, null);
        const running = instances.filter((c) => c.status === "running").length;
        return { name, instances, latest, running };
      });
  }, [candidates, projectNames, query]);

  const focusInstance = (candidate: GlobalInstanceCandidate) => {
    // 与旧 MobileGlobalOverview 同语义：进项目 scope 工作台并聚焦该实例；重置 Output
    //（不继承上次切到的 Files/Git 记忆）。
    setFocusTab("output");
    void navigate({
      to: "/projects/$key/session/$id",
      params: { key: candidate.ref.projectName, id: candidate.ref.sessionId },
    });
  };

  const visibleActivity = showAllActivity
    ? activityRows
    : activityRows.slice(0, ACTIVITY_PREVIEW_COUNT);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Large title 行（原型 .h-row：h1 30px/800 ink-title + 右侧 ➕/⚙ 22px 图标组 gap 14） */}
      <div className="flex items-end justify-between px-4 pt-1">
        <h1 className="text-large-title font-extrabold leading-tight text-ink-title">
          {t("nav.projects")}
        </h1>
        <div className="flex items-center gap-3.5 pb-2">
          <button
            aria-label={t("home.createProjectAria")}
            className="-mx-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-1 transition hover:bg-ink-1/5 active:bg-ink-1/10 touch:h-10 touch:w-10"
            onClick={openCreate}
            type="button"
          >
            <ShellIcon className="size-[22px]" name="plus" />
          </button>
          <button
            aria-label={t("nav.settings")}
            className="-mx-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-1 transition hover:bg-ink-1/5 active:bg-ink-1/10 touch:h-10 touch:w-10"
            onClick={() => void navigate({ to: "/settings" })}
            type="button"
          >
            <ShellIcon className="size-[22px]" name="settings" />
          </button>
        </div>
      </div>

      {/* 搜索框（原型 .search：h 38 / r 12 / bg fill-search / 15px placeholder） */}
      <div className="mx-4 mt-2 flex h-[38px] flex-none items-center gap-2 rounded-[12px] bg-fill-search px-3">
        <ShellIcon className="size-4 flex-none text-ink-2" name="magnifyingglass" />
        <input
          aria-label={t("home.searchPlaceholder")}
          className="w-full bg-transparent text-callout text-ink-1 outline-none placeholder:text-ink-2"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("home.searchPlaceholder")}
          type="search"
          value={query}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        {isLoaded && projectNames.length === 0 ? (
          <p className="p-6 text-center text-subhead text-ink-2">
            {t("workbench.globalOverviewEmpty")}
          </p>
        ) : null}

        {/* 全局活动段（原型 .sec「全局活动」+「● N 进行中」+ .gcard） */}
        {projectNames.length > 0 ? (
          <>
            <div className="mx-4 mb-1.5 mt-[18px] flex items-center justify-between">
              <span className="text-footnote font-semibold text-ink-2">
                {t("home.globalActivity")}
              </span>
              {runningCount > 0 ? (
                <span className="text-footnote font-semibold text-success-text">
                  ● {t("home.nRunning", { count: runningCount })}
                </span>
              ) : null}
            </div>
            <div className="mx-4 rounded-xl border border-sep bg-elevated px-3 py-1">
              {/* 审批行（原型 02 .ap-row tint-orange，pending=0 隐藏）：入口①（§6.4）。 */}
              {approvals.length > 0 ? (
                <button
                  className="ap-row w-full cursor-pointer"
                  onClick={openApprovals}
                  type="button"
                >
                  <ShellIcon className="h-[15px] w-[14px] flex-none" name="warning-triangle" />
                  <span className="tx">{t("approvals.rowLabel", { count: approvals.length })}</span>
                </button>
              ) : null}
              {activityRows.length === 0 ? (
                <p className="py-3 text-center text-footnote text-ink-2">{t("home.noActivity")}</p>
              ) : (
                visibleActivity.map((row, index) => (
                  <div key={row.candidate.ref.sessionId}>
                    {index > 0 ? <div className="mx-3 border-t border-sep-row" /> : null}
                    <button
                      className="flex w-full cursor-pointer flex-col items-stretch gap-0 text-left"
                      onClick={() => focusInstance(row.candidate)}
                      type="button"
                    >
                      <span className="flex items-center gap-2 py-2">
                        <span
                          className={`h-[7px] w-[7px] flex-none rounded-full ${
                            statusDotToneBg[statusToTone(row.candidate.status)]
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate text-subhead font-semibold text-ink-1">
                          {row.candidate.displayName}
                        </span>
                        {row.pinned ? (
                          <span className="flex-none rounded-[9px] bg-tint-purple px-2 py-0.5 text-micro font-semibold text-pin">
                            {t("workbench.pin")}
                          </span>
                        ) : null}
                        <span className="flex-none text-caption text-ink-2">
                          {relativeTime(
                            row.candidate.updatedAt ?? row.candidate.createdAt ?? "",
                            t,
                          )}
                        </span>
                      </span>
                      {/* 副行（D14：现有 subtitle=lastCommand/lastAssistantMessage + 项目 chip；
                          原型 .act-row 下方 11.5px 行，缩进 25px 对齐 dot 后文字） */}
                      {row.candidate.subtitle ? (
                        <span className="mb-2 -mt-1 flex items-center gap-1.5 pl-[25px] pr-1 text-caption text-ink-2">
                          <span className="min-w-0 flex-1 truncate">{row.candidate.subtitle}</span>
                          <span className="flex-none rounded-[9px] bg-elevated2 px-2 py-0.5 text-micro font-semibold text-ink-2">
                            {row.candidate.ref.projectName}
                          </span>
                        </span>
                      ) : null}
                    </button>
                  </div>
                ))
              )}
              {activityRows.length > ACTIVITY_PREVIEW_COUNT ? (
                <button
                  className="w-full cursor-pointer py-2.5 text-center text-footnote text-primary"
                  onClick={() => setShowAllActivity((prev) => !prev)}
                  type="button"
                >
                  {showAllActivity ? t("home.collapseActivity") : `${t("home.seeAllActivity")} ›`}
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {/* 项目段（原型 .sec「项目 · N」+ .pj-row 列表） */}
        {projectNames.length > 0 ? (
          <>
            <div className="mx-4 mb-1.5 mt-[18px]">
              <span className="text-footnote font-semibold text-ink-2">
                {t("home.projectsTitle", { count: projectRows.length })}
              </span>
            </div>
            <div className="mx-4 rounded-xl border border-sep bg-elevated px-3 py-0.5">
              {projectRows.map((row, index) => (
                <div key={row.name}>
                  {index > 0 ? <div className="border-t border-sep-row" /> : null}
                  <button
                    className="flex w-full cursor-pointer items-center gap-2.5 py-2.5 text-left"
                    onClick={() =>
                      void navigate({ to: "/projects/$key", params: { key: row.name } })
                    }
                    type="button"
                  >
                    <span
                      className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-sm ${
                        row.instances.length > 0 ? "bg-tint-blue" : "bg-fill-search"
                      }`}
                    >
                      <ShellIcon
                        className={`size-[17px] ${
                          row.instances.length > 0 ? "text-primary" : "text-ink-2"
                        }`}
                        name="project"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold text-ink-1">
                        {row.name}
                      </span>
                      <span className="mt-0.5 block truncate pr-2 text-caption text-ink-2">
                        {row.instances.length > 0
                          ? t("home.instanceRecent", {
                              count: row.instances.length,
                              name: row.latest?.displayName ?? "",
                              time: relativeTime(
                                row.latest?.updatedAt ?? row.latest?.createdAt ?? "",
                                t,
                              ),
                            })
                          : t("home.idle")}
                      </span>
                    </span>
                    {row.running > 0 ? (
                      <span className="ml-auto flex-none rounded-[9px] bg-tint-green px-2 py-0.5 text-micro font-semibold text-success-text">
                        ● {row.running}
                      </span>
                    ) : (
                      <span className="ml-auto flex-none rounded-[9px] bg-fill-search px-2 py-0.5 text-micro font-semibold text-ink-2">
                        —
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
      {createProjectDialog}
      <MobileApprovalSheet
        approvals={approvals}
        onOpenChange={(next) => {
          if (!next) closeApprovals();
        }}
        onOpenSession={(projectName, sessionId) => {
          void navigate({
            from: "/projects",
            params: { key: projectName, id: sessionId },
            to: "/projects/$key/session/$id",
          });
        }}
        open={approvalsOpen}
      />
    </div>
  );
}
