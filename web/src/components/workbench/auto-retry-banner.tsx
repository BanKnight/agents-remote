// 自动重试待发注入条（03d `.count`）：provider 无关——pending 态挂在各 provider runtime
// 自己的 AutoRetryWatch 上，HTTP 面 /auto-retry/{status,cancel,fire} 由服务端按 metadata
// 派发。claude 与 codex 详情页共用本组件（多端同构铁律：能力在共享层单份实现）。

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { cancelAutoRetry, fetchAutoRetryStatus, fireAutoRetryNow } from "../../api/client";
import { ShellIcon } from "../shell/icons";
import { useT } from "../../i18n";

// 服务端 AutoRetryWatch 的待发注入快照（GET auto-retry/status）。pending 是纯内存态且
// 无 WS 广播（redesign-v2 §6.9 裁决）：连接期间 5s 轮询，scheduled=false 不渲染；注入
// 发生时流内本就有 isUserInput echo 可见，状态条随 refetch 消失。
// attempt/max 与设置页 ClaudeAutoRetryConfig 同源（03d pin②「次数/间隔/文案在 ℹ 配置」）。

const AUTO_RETRY_POLL_MS = 5000;

export function AutoRetryBanner({
  enabled,
  projectName,
  sessionId,
}: {
  enabled: boolean;
  projectName: string;
  sessionId: string;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const status = useQuery({
    enabled,
    queryFn: () => fetchAutoRetryStatus(projectName, sessionId),
    queryKey: ["projects", projectName, "agent-sessions", sessionId, "auto-retry-status"],
    refetchInterval: AUTO_RETRY_POLL_MS,
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["projects", projectName, "agent-sessions", sessionId, "auto-retry-status"],
    });
  };
  const cancel = useMutation({
    mutationFn: () => cancelAutoRetry(projectName, sessionId),
    onSuccess: invalidate,
  });
  const fire = useMutation({
    mutationFn: () => fireAutoRetryNow(projectName, sessionId),
    onSuccess: invalidate,
  });

  const pending = status.data?.scheduled === true ? status.data : null;
  const fireAt = pending?.fireAt;
  const [remainMs, setRemainMs] = useState(0);
  useEffect(() => {
    if (fireAt === undefined) {
      setRemainMs(0);
      return;
    }
    const tick = () => setRemainMs(Math.max(0, fireAt - Date.now()));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [fireAt]);

  if (pending === null || fireAt === undefined) return null;

  const totalSeconds = Math.ceil(remainMs / 1000);
  const mmss = `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  return (
    <div className="shrink-0 px-3 pt-1.5 sm:px-5">
      <div className="count">
        <div className="r1">
          <ShellIcon className="h-[15px] w-[14px] shrink-0" name="warning-triangle" />
          {/* live region 只包标题：倒计时每秒刷新，放外面会被读屏逐秒朗读（design L3）。 */}
          <span className="min-w-0 flex-1 truncate" role="status">
            {t("session.autoRetry.title")}
          </span>
          <span className="btns">
            <button
              className="btn ghost"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
              type="button"
            >
              {t("cancel")}
            </button>
            <button
              className="btn blue"
              disabled={fire.isPending}
              onClick={() => fire.mutate()}
              type="button"
            >
              {t("session.autoRetry.retryNow")}
            </button>
          </span>
        </div>
        <div className="r2">
          <span aria-hidden="true" className="tm">
            {t("session.autoRetry.countSchedule", {
              attempt: pending.attempt ?? 1,
              max: pending.max ?? 1,
              time: mmss,
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
