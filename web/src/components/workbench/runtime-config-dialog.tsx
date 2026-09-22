import { useQueryClient } from "@tanstack/react-query";
import type { EffortLevel } from "@agents-remote/shared";
import { EFFORT_LEVELS } from "@agents-remote/shared";

import { getAgentSession } from "../../api/client";
import { claudeBridgeKey, getClaudeBridge } from "../../routes/claude-adapter";
import {
  modelDisplayLabel,
  PERMISSION_MODE_LABELS,
  resolveCurrentModelAlias,
} from "../../routes/ClaudeSessionDetailRoute";
import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";
import type { InfoSheetVariant } from "../shell/info-sheet";
import { Dialog, DialogContent } from "../ui/dialog";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { useConfirm } from "../shell/confirm-dialog";

/**
 * 运行配置下钻字段（第八轮批次 2b）：ℹ 实例信息浮层的模型/权限/推理 effort 三设置行
 * （InfoField.onSelect）各自点开的单字段选择面——03k:65-67 三行 › chevron affordance 的
 * 第二层。切换协议只走 WS bridge（registry 取用，无 REST 路由）：model/permission =
 * in-process control_request；effort = set_runtime_effort（服务端重启 CLI --resume，WS 断开
 * 重连）——与会话页 ModelSelector/PermissionModeSelector/EffortSelector 同一协议面，本组件
 * 是 ℹ 浮层的便捷入口（无 spinner/回滚状态机，切换即收起，值由 detail 查询刷新回填）。
 * 选项数据复用 detail 查询（同 queryKey 缓存零额外网络）+ 共用映射函数（modelDisplayLabel /
 * PERMISSION_MODE_LABELS / EFFORT_LEVELS），不复制会话页逻辑。
 */
export type RuntimeConfigField = "model" | "permission" | "effort";

/** 权限模式枚举 fallback（对齐 PermissionModeSelector：server 未 advertise 时的兜底集）。 */
const FALLBACK_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "auto",
  "dontAsk",
];

export function RuntimeConfigDialog({
  field,
  onOpenChange,
  projectName,
  sessionId,
  variant,
}: {
  field: RuntimeConfigField;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  sessionId: string;
  variant: InfoSheetVariant;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { confirm, holder } = useConfirm();
  const detail = queryClient.getQueryData<Awaited<ReturnType<typeof getAgentSession>>>([
    "projects",
    projectName,
    "agent-sessions",
    sessionId,
  ]);
  const bridge = getClaudeBridge(claudeBridgeKey(projectName, sessionId));
  const session = detail?.session;

  const title =
    field === "model"
      ? t("session.instanceInfo.model")
      : field === "permission"
        ? t("session.instanceInfo.permission")
        : t("session.instanceInfo.effort");

  type Option = { value: string; label: string; description?: string; active: boolean };
  const options: Option[] = (() => {
    if (field === "model") {
      const resolved = detail?.availableModelResolved;
      const current = resolveCurrentModelAlias(session?.modelAlias ?? session?.model, resolved);
      return (detail?.availableModels ?? []).map((modelId) => ({
        value: modelId,
        label: modelDisplayLabel(modelId),
        description: resolved?.[modelId],
        active: modelId === current,
      }));
    }
    if (field === "permission") {
      const advertised = detail?.availablePermissionModes ?? [];
      const modes = advertised.length > 0 ? advertised : FALLBACK_PERMISSION_MODES;
      return modes.map((mode) => ({
        value: mode,
        label: PERMISSION_MODE_LABELS[mode] ?? mode,
        active: mode === session?.permissionMode,
      }));
    }
    const current: EffortLevel = session?.effort ?? "high";
    return EFFORT_LEVELS.map((level) => ({
      value: level,
      label: level,
      active: level === current,
    }));
  })();

  const pick = async (value: string) => {
    if (!bridge) return;
    if (field === "model") {
      bridge.switchModel(value);
    } else if (field === "permission") {
      bridge.switchPermissionMode(value);
    } else {
      // effort = CLI 重启（--resume 重连），running 中切换会打断当前 turn——与会话页
      // onSelectEffort 同款 danger confirm；无流内信号，detail 失效重取后才见新值。
      if (session?.status === "running") {
        const ok = await confirm({
          cancelLabel: t("cancel"),
          confirmLabel: t("claude.effort.restart"),
          message: t("claude.effort.restartConfirmRunning"),
          title: t("claude.effort.restartTitle"),
          tone: "danger",
        });
        if (!ok) return;
      }
      bridge.switchEffort(value as EffortLevel);
    }
    onOpenChange(false);
    void queryClient.invalidateQueries({
      exact: true,
      queryKey: ["projects", projectName, "agent-sessions", sessionId],
    });
  };

  const body = (
    <div className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}>
      <h2 className="text-title font-semibold text-ink-1">{title}</h2>
      <div className="mt-2.5 border-t border-sep-row" />
      <div className="divide-y divide-sep-row">
        {bridge ? (
          options.map((option) => (
            <button
              className="flex w-full cursor-pointer items-center py-[11px] text-left text-footnote transition active:opacity-60"
              key={option.value}
              onClick={() => void pick(option.value)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-ink-1">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block truncate font-mono text-caption text-ink-2">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {option.active ? (
                <ShellIcon className="ml-auto h-4 w-4 shrink-0 text-primary" name="check" />
              ) : null}
            </button>
          ))
        ) : (
          <p className="py-[11px] text-footnote text-ink-2">
            {t("session.runtimeConfig.unavailable")}
          </p>
        )}
      </div>
      <div className="kbtns">
        <button className="c cursor-pointer" onClick={() => onOpenChange(false)} type="button">
          {t("cancel")}
        </button>
      </div>
      {/* effort running 切换的 danger confirm（useConfirm holder，portal 渲染）。 */}
      {holder}
    </div>
  );

  return (
    <Dialog defaultOpen onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent
        className={
          variant === "sheet"
            ? "fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-x-0 translate-y-0 flex items-end justify-center"
            : undefined
        }
      >
        {variant === "sheet" ? (
          <div className="w-full max-w-md rounded-t-[20px] border-t border-sep bg-elevated px-5 pt-1 pb-[max(12px,env(safe-area-inset-bottom))] shadow-2xl shadow-black/40">
            <div
              aria-hidden="true"
              className="mx-auto mb-2.5 mt-3 h-[5px] w-10 rounded-[3px] bg-ink-3"
            />
            {body}
            <div aria-hidden="true" className="h-1" />
          </div>
        ) : (
          body
        )}
      </DialogContent>
    </Dialog>
  );
}
