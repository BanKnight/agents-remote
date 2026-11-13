import { useQuery } from "@tanstack/react-query";
import type {
  AgentProvider,
  AgentProviderCapabilities,
  AgentProviderInfo,
} from "@agents-remote/shared";

import { fetchAgentProviders } from "../api/client";

/**
 * provider 注册表（GET /api/agent-providers）单源查询：能力声明表 + 显示名 + 创建菜单
 * 的数据源。能力是 provider 静态属性（api 进程内固定，不随会话变化）→ staleTime
 * Infinity，与 settings 页（AcpRuntimeSection）共享同一 queryKey 缓存。
 *
 * 消费形态：组件顶层取列表，闭包/渲染内用下方纯函数按 provider 查表——判定逻辑一律走
 * shared 的 resolve* 能力函数（前端不再按 provider 名硬编码）。queryKey 与 settings 页
 * 共享（TanStack 对同 key 观察者去重、单次请求；settings 观察者用默认 staleTime，打开
 * 设置页会触发共享缓存重取——无害）。
 */
export function useAgentProviderInfos(): AgentProviderInfo[] | undefined {
  return useQuery({
    queryKey: ["agent-providers"],
    queryFn: fetchAgentProviders,
    staleTime: Infinity,
  }).data?.providers;
}

/** provider 能力声明；注册表未加载 / 未知 provider → undefined（调用方据此不渲染控件）。 */
export function providerCapabilities(
  infos: AgentProviderInfo[] | undefined,
  provider: AgentProvider | undefined,
): AgentProviderCapabilities | undefined {
  if (!provider) return undefined;
  return infos?.find((p) => p.provider === provider)?.capabilities;
}

/** provider 显示名：注册表 label 单源（品牌名中英一致不走 i18n）；未知 provider（注册表
 *  已加载但查无此项）回退原值原样展示，注册表未加载回退 "—"（与 provider 缺省同口径，
 *  不闪裸 id）。取代原先的本地硬编码 if 链——新 provider 注册后自动正确。 */
export function providerLabelOf(
  infos: AgentProviderInfo[] | undefined,
  provider: string | undefined,
): string {
  if (!provider || !infos) return "—";
  return infos.find((p) => p.provider === provider)?.label ?? provider;
}
