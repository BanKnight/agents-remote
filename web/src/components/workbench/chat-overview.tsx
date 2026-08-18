import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import {
  closeChatSession,
  createChatSession,
  listChatSessions,
  renameChatSession,
  type ChatSession,
} from "../../api/client";
import { useConfirm } from "../shell/confirm-dialog";
import { usePromptDialog } from "../shell/prompt-dialog";
import { actionButtonClasses, ListGroup, ListRow, ShellInput } from "../shell/shell-primitives";
import { ActionMenu, useRowContextMenu, type ActionMenuItem } from "../ui/action-menu";
import { ShellIcon } from "../shell/icons";

const CHAT_SESSIONS_QUERY_KEY = ["chat-sessions"] as const;

/**
 * Chat 模式主体（设计 docs/design/workbench-views.md §3.1，2026-08-18）。global scope 下
 * Agent/Chat 双模式 tab 切到 Chat 时渲染于中栏：搜索框 + 新建按钮 + 全局会话列表（不绑项目）。
 *
 * 与 Agent 模式（`GlobalProjectsOverview` 按项目分段网格）互斥。chat 会话点进去 → `/chat/$id`
 * 独立路由（Phase 1 占位 detail，Phase 4 复用 `ClaudeChat` UI 形态 + pi 事件流）。
 *
 * 行操作不显按钮（§4 frontend-notes 长按/右键范式）：移动端长按、桌面端右键 → 同一
 * `onContextMenu` → `ActionMenu`（桌面 popover 坐标 / 移动 sheet）出改名/删除。移动浏览器
 * 长按会触发 contextmenu 事件，与桌面右键同一 handler，无需额外 pointer 长按逻辑。
 */
export function ChatOverview() {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { holder: promptHolder, prompt } = usePromptDialog();
  const { holder: confirmHolder, confirm } = useConfirm();

  const { data, isPending } = useQuery({
    queryKey: CHAT_SESSIONS_QUERY_KEY,
    queryFn: listChatSessions,
  });

  const sessions = data?.sessions ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length === 0) return sessions;
    return sessions.filter((s) => s.displayName.toLowerCase().includes(q));
  }, [sessions, search]);

  const createMutation = useMutation({
    mutationFn: () => createChatSession(),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: CHAT_SESSIONS_QUERY_KEY });
      // 创建即进入会话（与 Agent 模式 useCreateSession 一致：创建即聚焦）。
      void navigate({ to: "/chat/$id", params: { id: res.session.id } });
    },
  });

  const openSession = (id: string) => {
    void navigate({ to: "/chat/$id", params: { id } });
  };

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: CHAT_SESSIONS_QUERY_KEY });

  const renameSession = async (session: ChatSession) => {
    const next = await prompt({
      cancelLabel: t("cancel"),
      confirmLabel: t("chat.rename"),
      initialValue: session.displayName,
      title: t("chat.renamePrompt"),
    });
    if (next === null || next === session.displayName || next.length === 0) return;
    try {
      await renameChatSession(session.id, next);
    } catch {
      // 路由已返回错误码；UI 不额外提示，失效缓存让列表自愈。
    }
    invalidate();
  };

  const deleteSession = async (session: ChatSession) => {
    const ok = await confirm({
      cancelLabel: t("cancel"),
      confirmLabel: t("chat.delete"),
      message: t("chat.deleteConfirmMessage", { name: session.displayName }),
      title: t("chat.deleteConfirmTitle"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await closeChatSession(session.id);
    } catch {
      // 同上，失效缓存自愈。
    }
    invalidate();
  };

  const empty = !isPending && filtered.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header chrome（对齐 §12.1 总览/列表 header 行）：搜索框 + 新建按钮，shrink-0 不滚。 */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-on-surface/5 px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <ShellInput
            aria-label={t("chat.searchPlaceholder")}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("chat.searchPlaceholder")}
            type="search"
            value={search}
          />
        </div>
        <button
          aria-label={t("chat.createAria")}
          className={actionButtonClasses({ compact: true, tone: "accent" })}
          disabled={createMutation.isPending}
          onClick={() => createMutation.mutate()}
          type="button"
        >
          {t("chat.create")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {empty ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <p className="text-sm text-on-surface-muted">{t("chat.emptyList")}</p>
          </div>
        ) : (
          <ListGroup ariaLabel={t("chat.listAria")}>
            {filtered.map((session) => (
              <ChatRow
                key={session.id}
                deleteLabel={t("chat.delete")}
                meta={formatRelativeTime(session.updatedAt)}
                onDelete={() => void deleteSession(session)}
                onOpen={() => openSession(session.id)}
                onRename={() => void renameSession(session)}
                renameLabel={t("chat.rename")}
                rowMenuAria={t("chat.rowMenuAria")}
                session={session}
                title={session.displayName}
              />
            ))}
          </ListGroup>
        )}
      </div>
      {promptHolder}
      {confirmHolder}
    </div>
  );
}

type ChatRowProps = {
  deleteLabel: string;
  meta: string;
  onDelete: () => void;
  onOpen: () => void;
  onRename: () => void;
  renameLabel: string;
  rowMenuAria: string;
  session: ChatSession;
  title: string;
};

/**
 * 单个 chat 会话行（file-browser 行菜单同款范式）：ListRow 直接子（保 ListGroup divide-y
 * separator）+ `onContextMenu` prop（桌面右键 / 移动长按同一 handler）+ `actions` slot 挂
 * per-row ActionMenu。行操作 hover 显隐 ⋯（touch 常显），右键/长按走 contextMenuPoint。
 */
function ChatRow({
  deleteLabel,
  meta,
  onDelete,
  onOpen,
  onRename,
  renameLabel,
  rowMenuAria,
  session,
  title,
}: ChatRowProps) {
  const ctx = useRowContextMenu();
  const items: ActionMenuItem[] = [
    { label: renameLabel, icon: <ShellIcon name="edit" />, onSelect: onRename },
    {
      label: deleteLabel,
      icon: <ShellIcon name="trash" />,
      onSelect: onDelete,
      variant: "destructive",
    },
  ];
  return (
    <ListRow
      actions={
        <ActionMenu
          align="end"
          cancelLabel={rowMenuAria}
          contextMenuPoint={ctx.pointFor(session.id)}
          items={items}
          onContextMenuClose={ctx.close}
          trigger={
            <button
              aria-label={rowMenuAria}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-on-surface-muted transition hover:bg-on-surface/5 hover-capable:opacity-0 hover-capable:group-hover:opacity-100 touch:h-10 touch:w-10 touch:opacity-100"
              onClick={(e) => e.stopPropagation()}
              tabIndex={-1}
              type="button"
            >
              <ShellIcon className="h-4 w-4" name="ellipsis" />
            </button>
          }
        />
      }
      className="group"
      meta={<span className="text-xs text-on-surface-muted">{meta}</span>}
      onClick={(e) => {
        // §4:portal fiber 冒泡守卫——ActionMenu portal（sheet/popover）dismiss 的 click 冒泡
        // 到行（DOM target 在 body）会误触发 onOpen 导航，contains 判断只接受行内真实 click。
        if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node)) return;
        onOpen();
      }}
      onContextMenu={(e) => ctx.openAt(session.id, e)}
      title={title}
    />
  );
}

/**
 * 相对时间格式化（粗粒度，与 history 列表「刚刚/N分钟前/昨天」语义对齐）。
 * 简化版：同天显示「N小时前/刚刚」，跨天显示日期。Phase 1 足够。
 */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "昨天";
  if (diffDay < 7) return `${diffDay}天前`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
