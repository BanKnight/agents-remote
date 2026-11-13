import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  SetAgentSessionSettledResponse,
  SetTerminalSessionSettledResponse,
} from "@agents-remote/shared";
import { setAgentSessionSettled, setTerminalSessionSettled } from "../api/client";

/**
 * 会话了结（settle，2026-11-13 T3 学习点②，见 docs/design/session-attention.md）：人的
 * 「这件事办完了」——移出活跃注意力集，不删除、可恢复关注（`settled: false`）。
 *
 * **不做乐观更新**（与 pin 不同）：settle 落 registry 元数据 → `patchMetadata` 触发
 * `onMetadataChanged` → sessions-stream 壳帧广播**整体覆盖** `["overview"]` 缓存，跨设备也
 * 同源即时；本地再乐观改一份反而制造两条真相。RTT 内点击无视觉变化，靠菜单关闭承接。
 * 失效只是兜底（WS 断线时 REST 轮询自愈，同 `003ee20` 的纵深闸语义）。
 */
export type SetSessionSettledVars = {
  projectName: string;
  sessionId: string;
  type: "agent" | "terminal";
  settled: boolean;
};

export function useSetSessionSettled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      vars: SetSessionSettledVars,
    ): Promise<SetAgentSessionSettledResponse | SetTerminalSessionSettledResponse> =>
      vars.type === "agent"
        ? setAgentSessionSettled(vars.projectName, vars.sessionId, vars.settled)
        : setTerminalSessionSettled(vars.projectName, vars.sessionId, vars.settled),
    onSettled: (_data, _error, vars) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["overview"] }),
        qc.invalidateQueries({
          queryKey: ["projects", vars.projectName, `${vars.type}-sessions`],
        }),
        // 详情：菜单的 settled 态（「标记已了结」↔「恢复关注」）读的就是 detail.session。
        qc.invalidateQueries({
          exact: true,
          queryKey: ["projects", vars.projectName, `${vars.type}-sessions`, vars.sessionId],
        }),
        // settle=true 会取消置顶（服务端裁决），置顶条同步。
        qc.invalidateQueries({ queryKey: ["pinned-sessions"] }),
      ]),
  });
}
