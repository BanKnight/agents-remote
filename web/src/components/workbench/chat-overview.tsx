import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import { useIsMobile } from "../../lib/use-is-mobile";
import { useWorkbenchNavigate } from "../../routes/workbench-model";
import {
  archiveChatSession,
  closeChatSession,
  createChatSession,
  listChatSessions,
  pinChatSession,
  renameChatSession,
  unarchiveChatSession,
  unpinChatSession,
  type ChatSession,
} from "../../api/client";
import { useConfirm } from "../shell/confirm-dialog";
import { usePromptDialog } from "../shell/prompt-dialog";
import { actionButtonClasses, ListGroup, ListRow, ShellInput } from "../shell/shell-primitives";
import { ActionMenu, useRowContextMenu, type ActionMenuItem } from "../ui/action-menu";
import { ShellIcon } from "../shell/icons";

const CHAT_SESSIONS_QUERY_KEY = ["chat-sessions"] as const;

/**
 * 会话分组纯函数（会话管理增强，可单测）。返回三个数组：
 * - pinned：置顶且未归档（列表顶部置顶组）
 * - active：未归档未置顶（按 updatedAt 降序）
 * - archived：已归档（按 archivedAt 降序；恢复/清空用）
 */
export function groupChatSessions(sessions: ChatSession[]): {
  pinned: ChatSession[];
  active: ChatSession[];
  archived: ChatSession[];
} {
  const pinned: ChatSession[] = [];
  const active: ChatSession[] = [];
  const archived: ChatSession[] = [];
  for (const s of sessions) {
    if (s.archivedAt) {
      archived.push(s);
    } else if (s.pinned) {
      pinned.push(s);
    } else {
      active.push(s);
    }
  }
  const byDesc = (a: string, b: string) => b.localeCompare(a) || a.localeCompare(b);
  pinned.sort((a, b) => byDesc(a.updatedAt, b.updatedAt));
  active.sort((a, b) => byDesc(a.updatedAt, b.updatedAt));
  archived.sort((a, b) => byDesc(a.archivedAt ?? a.updatedAt, b.archivedAt ?? b.updatedAt));
  return { pinned, active, archived };
}

/**
 * Chat 模式主体（设计 docs/design/workbench-views.md §3.1，2026-08-18）。global scope 下
 * Agent/Chat 双模式 tab 切到 Chat 时渲染于中栏：搜索框 + 新建按钮 + 全局会话列表（不绑项目）。
 *
 * 会话管理增强（2026-08-20）：分组（置顶优先 + 活跃 updatedAt 降序 + 底部归档折叠组）+ 多选
 * 批量模式（⋯ 菜单「选择会话」→ SelectionBar：全选/归档/删除/取消）。置顶/归档存元数据字段
 * `pinned`/`archivedAt`（随 `<id>.json` 持久化），管理操作不动 updatedAt。
 *
 * 行操作不显按钮（§4 frontend-notes 长按/右键范式）：移动端长按、桌面端右键 → 同一
 * `onContextMenu` → `ActionMenu`（桌面 popover 坐标 / 移动 sheet）出改名/删除等。移动浏览器
 * 长按会触发 contextmenu 事件，与桌面右键同一 handler，无需额外 pointer 长按逻辑。
 */
export function ChatOverview() {
  const { t } = useT();
  const navigate = useNavigate();
  const navigateWorkbench = useWorkbenchNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
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

  const grouped = useMemo(() => groupChatSessions(filtered), [filtered]);
  const empty = !isPending && filtered.length === 0;

  // 多选在搜索+分组后的当前可见集合上工作；任意分组都计入（含归档）。
  const visibleAll = useMemo(
    () => [...grouped.pinned, ...grouped.active, ...grouped.archived],
    [grouped],
  );

  const createMutation = useMutation({
    mutationFn: () => createChatSession(),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: CHAT_SESSIONS_QUERY_KEY });
      // 创建即进入会话（与 Agent 模式 useCreateSession 一致：创建即聚焦）。桌面 → workbench
      // focus 中栏；移动 → /chat/$id 全屏（openSession 同分流，见 openChat）。
      navigateToChat(res.session.id);
    },
  });

  const openChat = (id: string) => {
    if (selecting) {
      toggleSelected(id);
      return;
    }
    navigateToChat(id);
  };

  const navigateToChat = (id: string) => {
    // 桌面 → workbench focus（focus effect 开 chat tab 于中栏）；移动 → /chat/$id 全屏。
    if (isMobile) {
      void navigate({ to: "/chat/$id", params: { id } });
      return;
    }
    // 桌面 chat 列表仅在 global scope 渲染（WorkbenchRoute global 下 Chat 模式），故从 global
    // 出发；mode:"chat" 保持 Chat 模式 tab，navigateWorkbench 拼 focus URL
    // `/projects/session/chat_xxx`，focus effect 随即开 chat tab 于中栏。
    navigateWorkbench({ kind: "global" }, id, { mode: "chat" });
  };

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: CHAT_SESSIONS_QUERY_KEY });

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const endSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === visibleAll.length && visibleAll.length > 0) return new Set();
      return new Set(visibleAll.map((s) => s.id));
    });
  };

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

  const pinSession = async (session: ChatSession) => {
    try {
      await (session.pinned ? unpinChatSession(session.id) : pinChatSession(session.id));
    } catch {
      // 同上，失效缓存自愈。
    }
    invalidate();
  };

  const archiveSession = async (session: ChatSession) => {
    try {
      await archiveChatSession(session.id);
    } catch {
      // 同上，失效缓存自愈。
    }
    invalidate();
    endSelecting();
  };

  const restoreSession = async (session: ChatSession) => {
    try {
      await unarchiveChatSession(session.id);
    } catch {
      // 同上，失效缓存自愈。
    }
    invalidate();
  };

  // 批量操作：Promise.allSettled 逐条，任一失败不阻断其他条（与单条 catch 语义一致）。
  const bulkArchive = async () => {
    await Promise.allSettled([...selected].map((id) => archiveChatSession(id)));
    invalidate();
    endSelecting();
  };

  const bulkDelete = async () => {
    const ok = await confirm({
      cancelLabel: t("cancel"),
      confirmLabel: t("chat.delete"),
      message: t("chat.deleteSelected"),
      title: t("chat.deleteConfirmTitle"),
      tone: "danger",
    });
    if (!ok) return;
    await Promise.allSettled([...selected].map((id) => closeChatSession(id)));
    invalidate();
    endSelecting();
  };

  const clearArchived = async () => {
    const count = grouped.archived.length;
    if (count === 0) return;
    const ok = await confirm({
      cancelLabel: t("cancel"),
      confirmLabel: t("chat.clearArchived"),
      message: t("chat.clearArchivedConfirmMessage", { count }),
      title: t("chat.clearArchivedConfirmTitle"),
      tone: "danger",
    });
    if (!ok) return;
    await Promise.allSettled(grouped.archived.map((s) => closeChatSession(s.id)));
    invalidate();
  };

  const renderGroup = (label: string, list: ChatSession[], ariaLabel: string) => (
    <ListGroup ariaLabel={ariaLabel}>
      {list.map((session) => (
        <ChatRow
          key={session.id}
          archived={!!session.archivedAt}
          deleteLabel={t("chat.delete")}
          meta={formatRelativeTime(session.updatedAt)}
          onArchive={() => void archiveSession(session)}
          onDelete={() => void deleteSession(session)}
          onOpen={() => openChat(session.id)}
          onPin={() => void pinSession(session)}
          onRename={() => void renameSession(session)}
          onRestore={() => void restoreSession(session)}
          onSelect={() => toggleSelected(session.id)}
          renameLabel={t("chat.rename")}
          rowMenuAria={t("chat.rowMenuAria")}
          selected={selected.has(session.id)}
          selecting={selecting}
          session={session}
          title={session.displayName}
        />
      ))}
    </ListGroup>
  );

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
        {/* 多选模式：搜索框替换为 SelectionBar（全选/归档/删除/取消）。 */}
        {selecting ? (
          <>
            <button
              type="button"
              aria-label={t("chat.selectAll")}
              className={actionButtonClasses({ compact: true, tone: "default" })}
              onClick={toggleSelectAll}
            >
              {t("chat.selectAll")}
            </button>
            <button
              type="button"
              aria-label={t("chat.archiveSelected")}
              className={actionButtonClasses({ compact: true, tone: "default" })}
              disabled={selected.size === 0}
              onClick={() => void bulkArchive()}
            >
              {t("chat.archiveSelected")}
            </button>
            <button
              type="button"
              aria-label={t("chat.deleteSelected")}
              className={actionButtonClasses({ compact: true, tone: "danger" })}
              disabled={selected.size === 0}
              onClick={() => void bulkDelete()}
            >
              {t("chat.deleteSelected")}
            </button>
            <button
              type="button"
              aria-label={t("chat.cancelSelect")}
              className={actionButtonClasses({ compact: true, tone: "default" })}
              onClick={endSelecting}
            >
              {t("chat.cancelSelect")}
            </button>
          </>
        ) : (
          <button
            aria-label={t("chat.createAria")}
            className={actionButtonClasses({ compact: true, tone: "accent" })}
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
            type="button"
          >
            {t("chat.create")}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selecting ? (
          <div className="shrink-0 px-2 pb-1 text-xs font-semibold text-on-surface-muted">
            {t("chat.selectedCount", { count: selected.size })}
          </div>
        ) : null}
        {empty ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <p className="text-sm text-on-surface-muted">{t("chat.emptyList")}</p>
          </div>
        ) : (
          <>
            {grouped.pinned.length > 0
              ? renderGroup(t("chat.pinnedGroup"), grouped.pinned, t("chat.pinnedAria"))
              : null}
            {grouped.active.length > 0
              ? renderGroup(t("chat.title"), grouped.active, t("chat.listAria"))
              : null}
            {grouped.archived.length > 0 ? (
              <ArchivedGroup
                count={grouped.archived.length}
                emptyText={t("chat.emptyArchived")}
                onClear={() => void clearArchived()}
                onRestore={restoreSession}
                onDelete={deleteSession}
                openChat={openChat}
                renameLabel={t("chat.rename")}
                deleteLabel={t("chat.delete")}
                onSelect={toggleSelected}
                selecting={selecting}
                selected={selected}
                sessions={grouped.archived}
              />
            ) : null}
          </>
        )}
      </div>
      {promptHolder}
      {confirmHolder}
    </div>
  );
}

/**
 * 归档折叠组（列表底部）。`<details>` 折叠：open 时显示已归档行列表 + 操作（行内恢复/删除）
 * + 清空按钮。搜索过滤后计数以可见集合为准（archived 组可能因搜索而空）。清空 = 批量永久删除。
 */
function ArchivedGroup({
  count,
  emptyText,
  onClear,
  onRestore,
  onDelete,
  openChat,
  renameLabel,
  deleteLabel,
  onSelect,
  selecting,
  selected,
  sessions,
}: {
  count: number;
  emptyText: string;
  onClear: () => void;
  onRestore: (session: ChatSession) => void;
  onDelete: (session: ChatSession) => void;
  openChat: (id: string) => void;
  renameLabel: string;
  deleteLabel: string;
  onSelect: (id: string) => void;
  selecting: boolean;
  selected: Set<string>;
  sessions: ChatSession[];
}) {
  const { t } = useT();
  return (
    <details className="mt-2">
      <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-1 py-1.5 text-xs font-semibold text-on-surface-muted hover:text-on-surface">
        {t("chat.archivedGroup", { count })}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className={actionButtonClasses({ compact: true, tone: "default" })}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClear();
            }}
          >
            {t("chat.clearArchived")}
          </button>
        </span>
      </summary>
      {sessions.length === 0 ? (
        <div className="px-2 py-2 text-xs text-on-surface-muted">{emptyText}</div>
      ) : (
        <ListGroup ariaLabel={t("chat.archivedAria")}>
          {sessions.map((session) => (
            <ChatRow
              key={session.id}
              archived
              deleteLabel={deleteLabel}
              meta={formatRelativeTime(session.updatedAt)}
              onDelete={() => onDelete(session)}
              onOpen={() => openChat(session.id)}
              onRename={() => {}}
              onRestore={() => onRestore(session)}
              onSelect={() => onSelect(session.id)}
              renameLabel={renameLabel}
              rowMenuAria={t("chat.rowMenuAria")}
              selected={selected.has(session.id)}
              selecting={selecting}
              session={session}
              title={session.displayName}
            />
          ))}
        </ListGroup>
      )}
    </details>
  );
}

type ChatRowProps = {
  archived?: boolean;
  deleteLabel: string;
  meta: string;
  onDelete: () => void;
  onOpen: () => void;
  onRename: () => void;
  onPin?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onSelect: () => void;
  renameLabel: string;
  rowMenuAria: string;
  selected?: boolean;
  selecting: boolean;
  session: ChatSession;
  title: string;
};

/**
 * 单个 chat 会话行（file-browser 行菜单同款范式）：ListRow 直接子（保 ListGroup divide-y
 * separator）+ `onContextMenu` prop（桌面右键 / 移动长按同一 handler）+ `actions` slot 挂
 * per-row ActionMenu。行操作 hover 显隐 ⋯（touch 常显），右键/长按走 contextMenuPoint。
 *
 * 会话管理增强：行菜单按上下文组装——非归档行 = rename + pin/unpin + archive + select +
 * delete；归档行 = restore + select + delete。selecting 下行点击 = 勾选切换（不导航），
 * marker 显示勾选态；否则点击导航。
 */
function ChatRow({
  archived = false,
  deleteLabel,
  meta,
  onDelete,
  onOpen,
  onRename,
  onPin,
  onArchive,
  onRestore,
  onSelect,
  renameLabel,
  rowMenuAria,
  selected = false,
  selecting,
  session,
  title,
}: ChatRowProps) {
  const ctx = useRowContextMenu();

  const items: ActionMenuItem[] = [];
  if (archived) {
    if (onRestore)
      items.push({
        label: "chat.restore",
        icon: <ShellIcon name="restore" />,
        onSelect: onRestore,
      });
  } else {
    items.push({ label: renameLabel, icon: <ShellIcon name="edit" />, onSelect: onRename });
    if (onPin)
      items.push({
        label: session.pinned ? "chat.unpin" : "chat.pin",
        icon: <ShellIcon name="pin" />,
        onSelect: onPin,
      });
    if (onArchive)
      items.push({
        label: "chat.archive",
        icon: <ShellIcon name="archive" />,
        onSelect: onArchive,
      });
  }
  items.push({ label: "chat.select", icon: <ShellIcon name="check" />, onSelect: onSelect });
  items.push({
    label: deleteLabel,
    icon: <ShellIcon name="trash" />,
    onSelect: onDelete,
    variant: "destructive",
  });

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
      marker={
        selecting ? (
          <span
            aria-hidden="true"
            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
              selected ? "border-primary bg-primary text-on-primary" : "border-on-surface/20"
            }`}
          >
            {selected ? <ShellIcon className="h-2.5 w-2.5" name="check" /> : null}
          </span>
        ) : undefined
      }
      meta={<span className="text-xs text-on-surface-muted">{meta}</span>}
      onClick={(e) => {
        // §4:portal fiber 冒泡守卫——ActionMenu portal（sheet/popover）dismiss 的 click 冒泡
        // 到行（DOM target 在 body）会误触发 onOpen 导航，contains 判断只接受行内真实 click。
        if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node)) return;
        // 多选模式：行点击 = 勾选切换；否则导航打开。
        if (selecting) {
          onSelect();
          return;
        }
        onOpen();
      }}
      onContextMenu={(e) => ctx.openAt(session.id, e)}
      selected={selected}
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
