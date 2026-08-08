import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddMcpServerRequest, McpScope, UpdateMcpServerRequest } from "@agents-remote/shared";
import { addMcpServer, listMcpServers, removeMcpServer, updateMcpServer } from "../api/client";

const MCP_KEY = ["mcp"] as const;
/** MCP list 缓存新鲜期：claude mcp / 直读配置在增删后由 mutation invalidate；staleTime 内切换秒回。 */
const MCP_STALE_MS = 60_000;

export function useMcpServers(scope: McpScope, projectName?: string) {
  return useQuery({
    queryKey: [...MCP_KEY, scope, projectName ?? null] as const,
    queryFn: () => listMcpServers(scope, projectName),
    staleTime: MCP_STALE_MS,
  });
}

// 增删后 invalidate 伞形 key（覆盖该 scope 列表；全局/项目页不同路由，一次只挂一个 scope）。
export function useAddMcpServer(scope: McpScope, projectName?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AddMcpServerRequest) => addMcpServer(req, scope, projectName),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MCP_KEY });
    },
  });
}

export function useRemoveMcpServer(scope: McpScope, projectName?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => removeMcpServer(name, scope, projectName),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MCP_KEY });
    },
  });
}

export function useUpdateMcpServer(scope: McpScope, projectName?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateMcpServerRequest) => updateMcpServer(req, scope, projectName),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MCP_KEY });
    },
  });
}
