import type { AgentProvider } from "@agents-remote/shared";
import type { ReactNode } from "react";
import type { TranslateFn, TranslationKey } from "../../i18n/types";
import { type ShellTone, sessionMarker, StatusMarker } from "../shell/shell-primitives";
import { ActionMenu, type ActionMenuItem } from "../ui/action-menu";
import { ShellIcon } from "../shell/icons";
import { relativeTime } from "./history-list";

/**
 * table 视图列标识（设计文档 §5.3）。
 * - `project`：项目名（仅 global scope，project scope 隐藏）。
 * - `name`：类型 marker + 会话名（displayName，主列，§12 一等显示；marker 并入此列，
 *   不再单列 type，§10 StatusMarker 包 sessionMarker）。
 * - `activity`：最后活动（relativeTime，数据源 session.updatedAt ?? createdAt）。
 * - `actions`：⋯ 菜单（收起改名 + 关闭，与 InstanceCard 同原语；整行点击承担 focus，见 §5.3 行契约）。
 */
export type TableColumn = "project" | "name" | "activity" | "actions";

/**
 * table 行数据（presentational：action 回调已由调用方绑定，组件不接触 session 业务字段，
 * 仅消费已映射的 {label,tone} / displayName / activityIso）。`onClose`/`onRename` 缺省 =
 * 不可关闭/改名（按钮不渲染）。整行点击触发 `onFocus`（开/激活 tab，§5.3）。
 */
export type SessionTableRow = {
  key: string;
  projectName?: string;
  type: "agent" | "terminal";
  provider?: AgentProvider;
  displayName: string;
  status: { label: string; tone: ShellTone };
  activityIso?: string;
  onClose?: () => void;
  onRename?: () => void;
  onFocus: () => void;
  /** global 表 project 列点进项目（navigate /projects/$key）；缺省=纯文本（project scope 无此列）。 */
  onEnterProject?: () => void;
};

type SessionTableProps = {
  rows: SessionTableRow[];
  /** 按作用域/视口裁剪的列顺序（project scope 3 列无 project；global 4 列；移动 project 2 列）。 */
  columns: TableColumn[];
  t: TranslateFn;
};

const COL_HEADER_KEY: Record<TableColumn, TranslationKey> = {
  project: "table.colProject",
  name: "table.colName",
  activity: "table.colActivity",
  actions: "table.colActions",
};

/**
 * table 视图（设计文档 §5.3）。语义 `<table>/<thead>/<tbody>`，列头 sticky；**整行可点**
 * → onFocus（开/激活 tab，与 grid 卡片单击同语义）。`<tr onClick>` + cursor-pointer；操作
 * 列按钮 stopPropagation 防冒泡到行。桌面/移动共用（columns 由调用方按视口裁剪，
 * §9 移动隐藏 project + activity）。
 */
export function SessionTable({ rows, columns, t }: SessionTableProps) {
  return (
    <div className="@container h-full overflow-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface-raised">
          <tr className="border-b border-neutral-line">
            {columns.map((col) => (
              <th className={thClass(col)} key={col} scope="col">
                {t(COL_HEADER_KEY[col])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className="cursor-pointer border-b border-neutral-line/40 transition hover:bg-surface-raised/30"
              key={row.key}
              onClick={() => row.onFocus()}
            >
              {columns.map((col) => (
                <td className={tdClass(col)} key={col}>
                  {renderCell(col, row, t)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 列宽 class（table-fixed 下严格生效）。**收缩优先级：activity > name**（§5.3）。
 * - `name`：`w-full` 拿走剩余宽度，是最后的吸收列——只有当 activity 已完全隐藏后 name 才开始截断。
 * - `activity`：容器查询三段式——宽容器 `w-28`(112px) 显示完整相对时间；`@max-[26rem]:w-16`
 *   (容器 <416px) 收窄到 64px，内层 `block truncate` 截断「最后活动」文字；`@max-[22rem]:hidden`
 *   (容器 <352px) 整列隐藏（th+td 同款），把空间还给 name + project。
 * - `actions`：`w-14`(56px) 容纳单个 ⋯ 按钮组（h-7 w-7 + px-3）。
 * - `project`：`w-24`(96px) 短文本，进项目入口不收缩。
 */
function colWidthClass(col: TableColumn): string {
  if (col === "name") return "w-full";
  if (col === "actions") return "w-14 whitespace-nowrap";
  if (col === "activity") return "w-28 @max-[26rem]:w-16 @max-[22rem]:hidden";
  return "w-24 whitespace-nowrap"; // project
}

/**
 * 表头 th className。activity 表头在窄容器（`@max-[26rem]:w-16`=64px）文字需截断，加 `truncate`
 * 让超列宽文字 ellipsis（overflow:hidden + text-overflow）。**不加 `max-w-0`**：table-fixed 下
 * 列宽由 th 的 `w-28/w-16` 定义，`max-width:0` 会把整列塌成 padding-only（实测 24px）。
 * `max-w-0` 只放 td（跟随 th 列宽、仅让内层 `block truncate` 生效，不改列宽，见 name 列先例）。
 */
function thClass(col: TableColumn): string {
  const base =
    "px-3 py-2 text-left text-[0.6rem] font-bold uppercase tracking-[0.12em] text-on-surface-muted";
  if (col === "activity") return `${base} truncate ${colWidthClass(col)}`;
  return `${base} ${colWidthClass(col)}`;
}

/**
 * 单元格 td className。name + activity 列加 `max-w-0`（让 td 可收缩，内层 `block truncate`
 * 尊重 max-width 截断）；其余列短文本 + whitespace-nowrap 不截断。
 */
function tdClass(col: TableColumn): string {
  const base = "px-3 py-2 align-middle";
  if (col === "name" || col === "activity") return `${base} max-w-0 ${colWidthClass(col)}`;
  return `${base} ${colWidthClass(col)}`;
}

function renderCell(col: TableColumn, row: SessionTableRow, t: TranslateFn): ReactNode {
  switch (col) {
    case "project":
      // project 列 = 进项目超链接（global 表，navigate /projects/$key）；project scope 无此列。
      // 有 onEnterProject 渲染为 primary 链接 button（stopPropagation 不触发行 onFocus）；
      // 缺省回退纯文本。block truncate 按列宽截断长项目名。
      return row.onEnterProject ? (
        <button
          className="block w-full cursor-pointer truncate text-left font-semibold text-primary transition hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            row.onEnterProject?.();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          title={row.projectName}
          type="button"
        >
          {row.projectName}
        </button>
      ) : (
        <span className="block w-full truncate text-on-surface-soft" title={row.projectName}>
          {row.projectName}
        </span>
      );
    case "name":
      return (
        <span className="flex items-center gap-2">
          <StatusMarker marker={sessionMarker(row.type, row.provider)} status={row.status} />
          <span className="block truncate font-semibold text-on-surface">{row.displayName}</span>
        </span>
      );
    case "activity": {
      const text = relativeTime(row.activityIso ?? "", t);
      return text ? <span className="block truncate text-on-surface-muted">{text}</span> : null;
    }
    case "actions":
      return <RowActions onClose={row.onClose} onRename={row.onRename} t={t} />;
  }
}

/**
 * 行操作：⋯ ActionMenu（与 InstanceCard / GroupedProjectsList 同一原语，收起 rename+close）。
 * focus 由整行点击承担（§5.3），操作列只留一个 ⋯ 入口。trigger stopPropagation（click +
 * keydown 两路）防冒泡到行 onClick 触发 focus；ActionMenu 经 Radix asChild 注入 toggle 时
 * `composeEventHandlers` 先跑调用方 stopPropagation 再 toggle，两者不冲突。
 */
function RowActions({
  onClose,
  onRename,
  t,
}: {
  onClose?: () => void;
  onRename?: () => void;
  t: TranslateFn;
}) {
  const items: ActionMenuItem[] = [];
  if (onRename) {
    items.push({ label: t("session.rename"), icon: <ShellIcon name="edit" />, onSelect: onRename });
  }
  if (onClose) {
    items.push({
      label: t("session.close"),
      icon: <ShellIcon name="close" />,
      onSelect: onClose,
      variant: "destructive",
    });
  }
  if (items.length === 0) return null;
  return (
    <ActionMenu
      align="end"
      cancelLabel={t("cancel")}
      items={items}
      trigger={
        <button
          aria-label={t("session.actions")}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          type="button"
        >
          <ShellIcon className="h-4 w-4" name="ellipsis" />
        </button>
      }
    />
  );
}
