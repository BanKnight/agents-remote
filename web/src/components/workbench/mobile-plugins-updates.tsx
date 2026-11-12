import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useT } from "../../i18n";
import { useWorkbenchBack } from "../../routes/workbench-model";
import { DEFAULT_SKILL_AGENT } from "../../routes/plugins-shared";
import { useAutoCheckSkillUpdates, useUpdateSkill } from "../../hooks/skills";
import { PluginNav } from "./mobile-plugins-market";

/**
 * 可用更新清单深度页（2026-11-12 用户反馈：组头黄色「n 个更新 ›」点击原行为是再检测一遍，
 * 不符合提示语义——箭头应「带你去更新」）。逐项更新（卡内「更新」钮，POST → SSE 终态）+
 * 全部更新（组头钮，顺序逐个执行——服务端无批量端点，每个技能是独立 `skills update <name>`
 * 任务；不并发，避免同时 spawn 多个 git clone）。成功项由 useUpdateSkill 乐观置 false 自动
 * 出列；失败项保留 + 卡下 error 行可重试。
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
  const updateOne = (name: string) => {
    update.reset();
    setActiveName(name);
    clearItemError(name);
    void update
      .mutateAsync({ name, agent: DEFAULT_SKILL_AGENT })
      .catch((error: unknown) => recordItemError(name, error));
  };
  const pendingItems = (updates.data?.updates ?? []).filter((u) => u.hasUpdate);
  // 顺序 await 快照清单（不并发——同时 spawn 多个 git clone 无益；各项成功后由 hook 乐观置
  // false 逐个出列）。单项失败记录到 itemErrors 后继续下一项（该项保留可重试）。
  const updateAll = async () => {
    for (const item of pendingItems) {
      update.reset();
      setActiveName(item.name);
      clearItemError(item.name);
      try {
        await update.mutateAsync({ name: item.name, agent: DEFAULT_SKILL_AGENT });
      } catch (error: unknown) {
        recordItemError(item.name, error);
        // 继续下一项。
      }
    }
    setActiveName(null);
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
          <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("skills.checking")}</p>
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
        ) : pendingItems.length === 0 ? (
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
            {pendingItems.map((item) => (
              <div className="pcard" key={item.name}>
                <div className="r1">
                  <span className="min-w-0 truncate">{item.name}</span>
                  <button
                    className="upd shrink-0 cursor-pointer disabled:opacity-60"
                    disabled={update.isPending}
                    onClick={() => updateOne(item.name)}
                    type="button"
                  >
                    {update.isPending && activeName === item.name
                      ? t("skills.updating")
                      : t("skills.update")}
                  </button>
                </div>
                {item.sourceUrl ? <div className="d2">{item.sourceUrl}</div> : null}
                {itemErrors[item.name] ? (
                  <p className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
                    {itemErrors[item.name]}
                  </p>
                ) : null}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
