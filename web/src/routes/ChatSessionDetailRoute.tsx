import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { getChatSession } from "../api/client";
import { useT } from "../i18n";

/**
 * Chat 会话 detail 占位（设计 workbench-views §3.1，Phase 1）。`/chat/$id` 独立路由
 *（rootRoute 平级，同 settingsRoute 范式）——chat 不绑项目，不进 workbench panel focus
 * 体系（非 InstanceArea panel、不依赖 layout 保活）；移动端「全屏聚焦态」由本页全屏渲染
 * 呈现（无底部 nav、无返回 header 栏之外的 chrome）。
 *
 * Phase 4 替换：复用 `ClaudeChat` UI 形态（`useExternalStoreRuntime` provider-agnostic），
 * 数据源换 `/api/chat-sessions/:id/stream`（pi 事件流 → storeAdapter），历史走 pi
 * SessionManager JSONL 回放。
 */
export function ChatSessionDetailRoute() {
  const { t } = useT();
  const navigate = useNavigate();
  const { id } = useParams({ from: "/chat/$id" });
  const { data } = useQuery({
    queryKey: ["chat-sessions", id],
    queryFn: () => getChatSession(id),
  });
  const backToList = () => void navigate({ to: "/projects", search: { mode: "chat" } });
  return (
    <main className="flex h-[var(--app-viewport-height)] flex-col overflow-hidden bg-surface pt-[var(--shell-safe-area-top)] text-on-surface">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-on-surface/5 px-3">
        <button
          aria-label={t("chat.backToList")}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
          onClick={backToList}
          type="button"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-base font-semibold">
          {data?.session.displayName ?? id}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <p className="text-sm text-on-surface-muted">{t("chat.notAvailable")}</p>
      </div>
    </main>
  );
}
