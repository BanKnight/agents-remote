import type { AgentProvider } from "@agents-remote/shared";
import type { ReactNode } from "react";
import type { TranslateFn, TranslationKey } from "../../i18n/types";
import { type ShellTone, sessionMarker, StatusMarker } from "../shell/shell-primitives";
import { relativeTime } from "./history-list";

/**
 * table 视图列标识（设计文档 §9）。
 * - `project`：项目名（仅 global scope，project scope 隐藏）。
 * - `name`：类型 marker + 会话名（displayName，主列，§12 一等显示；marker 并入此列，
 *   不再单列 type，§10 StatusMarker 包 sessionMarker）。
 * - `activity`：最后活动（relativeTime，数据源 session.updatedAt ?? createdAt）。
 * - `actions`：▶ 进聚焦态 + ✕ 关闭。
 */
export type TableColumn = "project" | "name" | "activity" | "actions";

/**
 * table 行数据（presentational：action 回调已由调用方绑定，组件不接触 session 业务字段，
 * 仅消费已映射的 {label,tone} / displayName / activityIso）。`onClose` 缺省 = 不可关闭。
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
  onFocus: () => void;
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
 * table 视图（设计文档 §9）。语义 `<table>/<thead>/<tbody>`，列头 sticky；行**不整体
 * clickable**——▶ 按钮触发 focus（§9「行点 ▶ → 进聚焦态」），避免 `<tr onClick>` 键盘
 * 不可达 + nested interactive（tr role=button 内含 button）的 a11y 问题。▶/✕ 各 stopPropagation。
 * 桌面/移动共用（columns 由调用方按视口裁剪，§11 移动隐藏 project + activity）。
 */
export function SessionTable({ rows, columns, t }: SessionTableProps) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface-raised">
          <tr className="border-b border-neutral-line">
            {columns.map((col) => (
              <th
                className={`px-3 py-2 text-left text-[0.6rem] font-bold uppercase tracking-[0.12em] text-on-surface-muted ${colWidthClass(col)}`}
                key={col}
                scope="col"
              >
                {t(COL_HEADER_KEY[col])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className="border-b border-neutral-line/40 transition hover:bg-surface-raised/30"
              key={row.key}
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
 * 列宽 class（table-fixed 下严格生效）。name 列 `w-full` 拿走剩余宽度；其余列固定窄宽
 *（actions 按钮组、activity 相对时间、project 项目名均短文本）。name 列内层 `block truncate`
 * 按列宽截断 displayName 止水平溢出（§9 止溢）。th 与 td 同款 class 保持列宽一致。
 */
function colWidthClass(col: TableColumn): string {
  if (col === "name") return "w-full";
  if (col === "actions") return "w-24 whitespace-nowrap";
  if (col === "activity") return "w-28 whitespace-nowrap";
  return "w-32 whitespace-nowrap"; // project
}

/**
 * 单元格 td className。name 列加 `max-w-0`（双保险：让 td 可收缩，内层 `block truncate`
 * 尊重 max-width 截断）。其余列短文本 + whitespace-nowrap，不截断。
 */
function tdClass(col: TableColumn): string {
  const base = "px-3 py-2 align-middle";
  return col === "name" ? `${base} max-w-0 ${colWidthClass(col)}` : `${base} ${colWidthClass(col)}`;
}

function renderCell(col: TableColumn, row: SessionTableRow, t: TranslateFn): ReactNode {
  switch (col) {
    case "project":
      return <span className="whitespace-nowrap text-on-surface-soft">{row.projectName}</span>;
    case "name":
      return (
        <span className="flex items-center gap-2">
          <StatusMarker marker={sessionMarker(row.type, row.provider)} status={row.status} />
          <span className="block truncate font-semibold text-on-surface">{row.displayName}</span>
        </span>
      );
    case "activity": {
      const text = relativeTime(row.activityIso ?? "", t);
      return text ? <span className="whitespace-nowrap text-on-surface-muted">{text}</span> : null;
    }
    case "actions":
      return <RowActions onClose={row.onClose} onFocus={row.onFocus} t={t} />;
  }
}

/**
 * 行操作按钮：▶ focus（success hover，正向"进入"语义）+ ✕ close（error hover，复用
 * InstanceCard close button className，shell-primitives.tsx:409，视觉一致）。并排，各
 * stopPropagation（click + keydown 两路），与 InstanceCard close 同款防冒泡。
 */
function RowActions({
  onClose,
  onFocus,
  t,
}: {
  onClose?: () => void;
  onFocus: () => void;
  t: TranslateFn;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        aria-label={t("table.focus")}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-success/10 hover:text-success"
        onClick={(e) => {
          e.stopPropagation();
          onFocus();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        type="button"
      >
        <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16">
          <path d="M5 3l8 5-8 5V3z" fill="currentColor" />
        </svg>
      </button>
      {onClose ? (
        <button
          aria-label={t("session.close")}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-error/10 hover:text-error"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          type="button"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth={1.5}
            />
          </svg>
        </button>
      ) : null}
    </span>
  );
}
