import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { atom, useSetAtom } from "jotai";
import type { AgentSessionMode } from "@agents-remote/shared";
import {
  ApiClientError,
  renameAgentSession,
  renameTerminalSession,
  switchAgentSessionMode,
} from "../../api/client";
import { useT } from "../../i18n";
import { usePinnedSessions, usePinSession, useUnpinSession } from "../../hooks/pinned-sessions";
import type { SessionPanelRef } from "../../routes/workbench-model";
import { useConfirm } from "../shell/confirm-dialog";
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
 * 双模式切换进行中标记（按 sessionId 集合），AgentPanelRouter 消费：pending 时在面板顶部
 * 渲染 spinner 细条——POST /mode 同步等 1-3s（杀 headless + tmux spawn + CLI 启动），菜单
 * 点击即关（不 keepOpen）后这个细条就是唯一的进行中反馈。集合而非单值：多 tab / 分屏同时
 * 各有一会话在切换时互不互踩（review P3-6）。
 */
export const sessionModeSwitchPendingAtom = atom<ReadonlySet<string>>(new Set<string>());

/**
 * 双模式切换（chat ↔ terminal，2026-10-15）：POST mode → 失效详情 + 列表 + 全局顶层。
 * detail 必须失效重取——渲染分流（AgentPanelRouter 的 mode 分支）读的就是 detail.mode。
 * 失败走 confirm 弹窗提示 + 手动重试（切回对话失败 = pane 已杀、headless 未起，服务端
 * 不自动回滚——重试即重走 switchMode，一般即恢复）；409（严格 idle-only 拒绝）用「执行中」
 * 文案而非通用失败。双端 ⋯ 菜单共用（桌面 SessionTabStripActions / 移动 moreMenu），
 * holder 由调用方渲染（confirm.holder 同 rename/close 惯例）。
 */
export function useSessionModeSwitch() {
  const { t } = useT();
  const { confirm, holder } = useConfirm();
  const queryClient = useQueryClient();
  const setPending = useSetAtom(sessionModeSwitchPendingAtom);
  const modeSwitch = useMutation({
    mutationFn: (vars: { projectName: string; sessionId: string; mode: AgentSessionMode }) =>
      switchAgentSessionMode(vars.projectName, vars.sessionId, vars.mode),
    onMutate: (vars) => setPending((prev) => new Set(prev).add(vars.sessionId)),
    onError: (error, vars) => {
      const conflict = error instanceof ApiClientError && error.code === "SESSION_STATE_CONFLICT";
      void confirm({
        cancelLabel: t("cancel"),
        confirmLabel: t("session.retry"),
        message: conflict ? t("session.modeSwitch.busy") : t("api.agentSessionModeSwitchFailed"),
        title: t("session.modeSwitch.failedTitle"),
        tone: "accent",
      }).then((retry) => {
        if (retry) modeSwitch.mutate(vars);
      });
    },
    onSettled: (_data, _error, vars) => {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(vars.sessionId);
        return next;
      });
      return Promise.all([
        queryClient.invalidateQueries({
          exact: true,
          queryKey: ["projects", vars.projectName, "agent-sessions", vars.sessionId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["projects", vars.projectName, "agent-sessions"],
        }),
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
      ]);
    },
  });
  return { modeSwitch, holder };
}

/**
 * 实例行「置顶/重命名/关闭」动作装配双端单源（桌面 tabstrip ⋯ SessionTabStripActions + 移动
 * 03k info sheet .acts footer 双消费；原 mobile-workbench 内「单端收敛」——桌面
 * SessionTabStripActions 仍手写同构装配，全局同构 review 批上移至此并接入桌面）。build(
 * panelRef, sessionType) 返回单行动作的 label+run（pin 无类型门——v1.6 真机反馈终端会话 ⋯
 * 菜单缺置顶；pinned 链路本就类型无关，v1.5「dot 语言归属 agent」旧口径随置顶条换代失效）；
 * 渲染形态/排序/icon 注入留给消费方（菜单项 vs button 行，两端原型各自定）。
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
        pin: {
          label: pinnedNow ? t("workbench.unpin") : t("workbench.pin"),
          run: () => (pinnedNow ? unpinIt : pinIt).mutate(id),
        },
        rename: {
          label: t("session.rename"),
          run: (displayName: string) =>
            void renameSession.rename(panelRef, sessionType, displayName),
        },
      };
    },
  };
}
