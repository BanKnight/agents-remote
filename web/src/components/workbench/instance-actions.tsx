import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { renameAgentSession, renameTerminalSession } from "../../api/client";
import { useT } from "../../i18n";
import { usePinnedSessions, usePinSession, useUnpinSession } from "../../hooks/pinned-sessions";
import type { SessionPanelRef } from "../../routes/workbench-model";
import { usePromptDialog } from "../shell/prompt-dialog";

/**
 * 改名实例统一流程（任务 E）。prompt 预填当前 displayName → 按 type 调 rename API → 失效
 * list + detail + global 顶层。promptHolder 由调用方渲染。空名 / 未改名 / 用户取消 → no-op
 *（prompt 返回 null）。原栖 instance-area 业务 hook 集合，随 useInstanceRowActions 双端单源
 * 收敛一并迁此（共享业务 hook 不寄生桌面渲染文件，WorkbenchRoute / 本文件消费）。
 */
export function useRenameSession() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { holder: promptHolder, prompt } = usePromptDialog();

  const rename = useCallback(
    async (
      ref: SessionPanelRef,
      type: "agent" | "terminal",
      currentName: string,
    ): Promise<boolean> => {
      const next = await prompt({
        cancelLabel: t("cancel"),
        confirmLabel: t("session.rename"),
        initialValue: currentName,
        placeholder: t("session.renamePrompt.placeholder"),
        title: t("session.renamePrompt.title"),
      });
      // null=取消；空名/未改动 → 不调 API（路由会 400，避免无谓请求与静默失败）。
      if (next === null || next === currentName || next.length === 0) return false;
      try {
        if (type === "agent") {
          await renameAgentSession(ref.projectName, ref.sessionId, next);
        } else {
          await renameTerminalSession(ref.projectName, ref.sessionId, next);
        }
      } catch {
        // 路由已返回错误码（404 / 400）；UI 不额外提示，失败仍失效缓存让列表自愈。
      }
      await Promise.all([
        queryClient.invalidateQueries({ exact: true, queryKey: ["projects"] }),
        queryClient.invalidateQueries({ exact: true, queryKey: ["projects", ref.projectName] }),
        queryClient.invalidateQueries({
          queryKey: ["projects", ref.projectName, `${type}-sessions`],
        }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: ["projects", ref.projectName, `${type}-sessions`, ref.sessionId],
        }),
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
      ]);
      return true;
    },
    [prompt, queryClient, t],
  );

  return { rename, holder: promptHolder };
}

/**
 * 实例行「置顶/重命名/关闭」动作装配双端单源（桌面 tabstrip ⋯ SessionTabStripActions + 移动
 * 03k info sheet .acts footer 双消费；原 mobile-workbench 内「单端收敛」——桌面
 * SessionTabStripActions 仍手写同构装配，全局同构 review 批上移至此并接入桌面）。build(
 * panelRef, sessionType) 返回单行动作的 label+run（pin 仅 agent——dot 状态语言归属 agent，
 * review P3⑦）；渲染形态/排序/icon 注入留给消费方（菜单项 vs button 行，两端原型各自定）。
 * renameHolder 由调用方渲染（useRenameSession.holder 直通，消费方各自持 hook 实例）。
 */
export function useInstanceRowActions(
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void,
) {
  const { t } = useT();
  const { pinned } = usePinnedSessions();
  const pinIt = usePinSession();
  const unpinIt = useUnpinSession();
  const renameSession = useRenameSession();
  return {
    renameHolder: renameSession.holder,
    build: (panelRef: SessionPanelRef, sessionType: "agent" | "terminal") => {
      const id = panelRef.sessionId;
      const pinnedNow = pinned.has(id);
      return {
        close: {
          label: t("workbench.pillCloseSession"),
          run: () => closeInstance(id, sessionType),
        },
        pin:
          sessionType === "agent"
            ? {
                label: pinnedNow ? t("workbench.unpin") : t("workbench.pin"),
                run: () => (pinnedNow ? unpinIt : pinIt).mutate(id),
              }
            : null,
        rename: {
          label: t("session.rename"),
          run: (displayName: string) =>
            void renameSession.rename(panelRef, sessionType, displayName),
        },
      };
    },
  };
}
