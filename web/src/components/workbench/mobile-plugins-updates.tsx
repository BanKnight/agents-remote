import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useT } from "../../i18n";
import { useWorkbenchBack } from "../../routes/workbench-model";
import { DEFAULT_SKILL_AGENT } from "../../routes/plugins-shared";
import { useAutoCheckSkillUpdates, useUpdateSkill } from "../../hooks/skills";
import { PluginNav } from "./mobile-plugins-market";

/** 完成出列两段时长（redesign-v2 §6.18③）：tint+✓ 持留观察窗 / 塌缩时长。
 *  后者与 index.css `--duration-exit`（150ms）同值——改一须改二（JS 定时器删节点与
 *  CSS transition 播完需对齐，否则要么截断动画要么空持留）。 */
const DONE_HOLD_MS = 400;
const DONE_EXIT_MS = 150;

/**
 * 可用更新清单深度页（2026-11-12 用户反馈：组头黄色「n 个更新 ›」点击原行为是再检测一遍，
 * 不符合提示语义——箭头应「带你去更新」）。逐项更新（卡内「更新」钮，POST → SSE 终态）+
 * 全部更新（组头钮，顺序逐个执行——服务端无批量端点，每个技能是独立 `skills update <name>`
 * 任务；不并发，避免同时 spawn 多个 git clone）。成功项由 useUpdateSkill 乐观置 false 自动
 * 出列；失败项保留 + 卡下 error 行可重试。
 *
 * 更新反馈对齐 App Store 范式（2026-11-13，用户拍板四项全做，redesign-v2 §6.18）：
 * ①行内按钮尺寸锁定、内容 grid 叠放（sizer 定宽）——「更新」↔ 进度环就地替换零跳版；
 * ②批量进行中非当前项 =「排队中…」弱化态（batchMode 区分单项更新与队列编排）；
 * ③成功行绿 tint + ✓ 持留 DONE_HOLD_MS 后塌缩滑出（donePhase/exitPhase 两相位续命渲染）；
 * ④「检查中…」带 spinner。
 *
 * 自动检测与技能详情页同语义同纪律（hook 单源 useAutoCheckSkillUpdates）：缓存空或
 * staleTime 60s 窗口外自发 refetch 一次；全局 queryKey 与列表「检查更新」/详情页共享结果
 * （限速纪律不变）。两端同构：移动 pluginView 分流与桌面 mainPage 复用本单源（对齐
 * MobileSkillDetail 先例）。
 */
export function SkillUpdatesView() {
  const { t } = useT();
  const navigate = useNavigate();
  const updates = useAutoCheckSkillUpdates(DEFAULT_SKILL_AGENT);
  const update = useUpdateSkill();
  // back pop 优先（与 MobileSkillDetail 同式）；深链直达无来路时 push /plugins 兜底。
  const backNav = useWorkbenchBack();
  const back = () => backNav(() => void navigate({ to: "/plugins" }));

  // 单 mutation 实例驱动列表多项：activeName = 正在更新的项（「更新中」指示）；
  // itemErrors = per-item 失败记录（reviewer P2：共享 update.error + activeName 前移会把
  // 中间失败项的提示吞掉——A 失败、B/C 成功时终态 error=null 且 activeName=C，A 残留无任何
  // 失败说明）。失败 set、该卡重试开始时 delete（error 行换成「更新中」）。
  const [activeName, setActiveName] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  // §6.18②：批量模式标记——单项更新与「全部更新」共用 activeName，靠本标记区分「其余项
  // 是排队（批）还是纯禁用（单项更新）」。
  const [batchMode, setBatchMode] = useState(false);
  // §6.18③：完成行两相位（tint 持留 → 塌缩）。乐观更新把 hasUpdate 置 false 后行会从
  // pendingItems 消失——两集合在持留窗口内续命渲染（数据本体仍在 updates 数组，sourceUrl
  // 无损，无需额外快照）。
  const [donePhase, setDonePhase] = useState<ReadonlySet<string>>(() => new Set());
  const [exitPhase, setExitPhase] = useState<ReadonlySet<string>>(() => new Set());
  // per-name 两段定时器（hold → exit），卸载时全部清理防泄漏。
  const timersRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers.values()) clearTimeout(id);
    };
  }, []);

  const clearItemError = (name: string) => {
    setItemErrors((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _dropped, ...rest } = prev;
      return rest;
    });
  };
  const recordItemError = (name: string, error: unknown) => {
    setItemErrors((prev) => ({
      ...prev,
      [name]: error instanceof Error ? error.message : String(error),
    }));
  };
  /** §6.18③：成功后行进「tint 持留 → 塌缩出列」两段相位（phase 集合驱动续命渲染）。 */
  const markDone = (name: string) => {
    setDonePhase((prev) => new Set(prev).add(name));
    const holdTimer = window.setTimeout(() => {
      setDonePhase((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      setExitPhase((prev) => new Set(prev).add(name));
      const exitTimer = window.setTimeout(() => {
        setExitPhase((prev) => {
          const next = new Set(prev);
          next.delete(name);
          return next;
        });
        timersRef.current.delete(name);
      }, DONE_EXIT_MS);
      timersRef.current.set(name, exitTimer);
    }, DONE_HOLD_MS);
    timersRef.current.set(name, holdTimer);
  };
  const updateOne = (name: string) => {
    update.reset();
    setActiveName(name);
    clearItemError(name);
    void update
      .mutateAsync({ name, agent: DEFAULT_SKILL_AGENT })
      .then(() => markDone(name))
      .catch((error: unknown) => recordItemError(name, error));
  };
  const allUpdates = updates.data?.updates ?? [];
  const pendingItems = allUpdates.filter((u) => u.hasUpdate);
  // §6.18③：渲染清单 = 待更行 + 完成过渡行（乐观置 false 后靠相位续命）——三支各对应
  // 一种在场来源：还在队列 / tint 持留 / 塌缩中。
  // 持留窗口依赖本 query enabled:false + 60s staleTime（hooks/skills.ts 注释在案）——
  // 未来加 refetchOnMount/refetchInterval 会重拉数据、撕掉续命行（见 redesign-v2 §6.18-3）。
  const renderItems = allUpdates.filter(
    (u) => u.hasUpdate || donePhase.has(u.name) || exitPhase.has(u.name),
  );
  // 顺序 await 快照清单（不并发——同时 spawn 多个 git clone 无益；各项成功后由 hook 乐观置
  // false 逐个出列）。单项失败记录到 itemErrors 后继续下一项（该项保留可重试）。
  const updateAll = async () => {
    setBatchMode(true);
    try {
      for (const item of pendingItems) {
        update.reset();
        setActiveName(item.name);
        clearItemError(item.name);
        try {
          await update.mutateAsync({ name: item.name, agent: DEFAULT_SKILL_AGENT });
          markDone(item.name);
        } catch (error: unknown) {
          recordItemError(item.name, error);
          // 继续下一项。
        }
      }
    } finally {
      setActiveName(null);
      setBatchMode(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PluginNav backLabel={t("plugins.title")} onBack={back} title={t("plugins.updatesTitle")} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        {/* 后台重检失败但已有数据时不清空清单（对齐详情页「只换结论行、内容保留」）——
            整页错误仅在无数据可显时接管（reviewer P3）。 */}
        {updates.error && updates.data ? (
          <p className="mx-4 mt-2 break-all rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {updates.error.message}
          </p>
        ) : null}
        {updates.isFetching && !updates.data ? (
          <p className="flex items-center gap-1.5 px-4 py-2 text-[11.5px] text-ink-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current"
            />
            {t("skills.checking")}
          </p>
        ) : updates.error && !updates.data ? (
          <>
            <p className="mx-4 break-all rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
              {updates.error.message}
            </p>
            <div className="psect">
              <button
                className="r cursor-pointer"
                onClick={() => void updates.refetch()}
                type="button"
              >
                {t("skills.checkUpdates")}
              </button>
            </div>
          </>
        ) : renderItems.length === 0 ? (
          <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("plugins.updatesEmpty")}</p>
        ) : (
          <>
            <div className="psect">
              <span>{t("plugins.updatesChip", { n: pendingItems.length })}</span>
              <button
                className="r cursor-pointer disabled:opacity-60"
                disabled={update.isPending}
                onClick={() => void updateAll()}
                type="button"
              >
                {update.isPending ? t("skills.updating") : t("plugins.updateAll")}
              </button>
            </div>
            {renderItems.map((item) => {
              const isDone = donePhase.has(item.name) || exitPhase.has(item.name);
              const isUpdating = !isDone && update.isPending && activeName === item.name;
              // §6.18④：排队态必须排除失败项——批量中已失败项已不在队列里，显「排队中…」
              // 是谎言态（会一直挂到批量结束）；该项显「更新」灰禁、批量结束后可重试。
              const queued = !isDone && !isUpdating && batchMode && !(item.name in itemErrors);
              return (
                <div
                  className="updrow"
                  data-exit={exitPhase.has(item.name) ? "" : undefined}
                  key={item.name}
                >
                  <div className="updrow-in">
                    <div className={isDone ? "pcard done" : "pcard"}>
                      <div className="r1">
                        <span className="min-w-0 truncate">{item.name}</span>
                        <button
                          aria-label={
                            isUpdating
                              ? t("skills.updating")
                              : isDone
                                ? t("skills.updatedDone")
                                : undefined
                          }
                          // done 相位 aria-live（design-review P3）：SR 用户对「更新成功」
                          // 的唯一播报通道（视觉有 tint+✓+塌缩三重，行随即卸载）。
                          aria-live={isDone ? "polite" : undefined}
                          className={`upd shrink-0 cursor-pointer disabled:opacity-60${queued ? " queued" : ""}${isUpdating ? " updating" : ""}`}
                          disabled={update.isPending || isDone}
                          onClick={() => updateOne(item.name)}
                          type="button"
                        >
                          {/* sizer：恒渲染「更新中…」隐藏文本定宽（v2-primitives .upd-s）——
                              四态（更新/环/✓/排队）同位同宽，点击前后零跳版。 */}
                          <span aria-hidden="true" className="upd-s">
                            {t("skills.updating")}
                          </span>
                          {isUpdating ? (
                            <span
                              aria-hidden="true"
                              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary/40 border-t-primary"
                            />
                          ) : isDone ? (
                            <span aria-hidden="true">✓</span>
                          ) : queued ? (
                            <span>{t("plugins.updateQueued")}</span>
                          ) : (
                            <span>{t("skills.update")}</span>
                          )}
                        </button>
                      </div>
                      {item.sourceUrl ? <div className="d2">{item.sourceUrl}</div> : null}
                      {itemErrors[item.name] ? (
                        <p className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
                          {itemErrors[item.name]}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
