// 批 11 反馈②「真同构」：全局文件树（FilesPanel）与工具区文件树（FilesToolPanel）的行 =
// 同一份代码。此前两份独立实现（FileEntryList .frow 行分支 vs FilesToolPanel 内联 map）——
// 形制看似一样但代码不同（用户 2026-10-07 反馈：贴边间距不同、地址栏不同）。多端同构原则：
// 行行为收敛共享组件层，差异经 props 表达（菜单编排/写操作 dialog 留各自容器）。
//
// 差异面全部 props 化：
//   - menuItemsFor(entry)：行菜单 items（容器各自构造；目录行由回调内按 entry.type 分支）
//   - renderTrailing(entry)：.tm 之后追加槽（工具侧 GitStatusBadge）
//   - renaming / selectedFilePath / onCardDragStart / readOnly / filesClickable：global 侧特有

import type { ProjectFileEntry } from "@agents-remote/shared";
import type { ActionMenuItem } from "../ui/action-menu";
import type { CardDragStartHandler } from "../workbench/drag-source";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";
import { ActionMenu, useLongPressActions, useRowContextMenu } from "../ui/action-menu";
import { DragSourceCard } from "../workbench/drag-source";
import { relativeTime } from "../workbench/history-list";

/** frow 行尾进入指示 chevron（.ar 内 14×14，SF Symbols chevron.right；与 SettingsChevron 同范式）。
 *  原在 project-tool-panels（批 10 起导出供全局树复用）——批 11 单源后行组件在本文件，
 *  下沉到叶模块消除 files/ ↔ workbench/ 模块环（code-review 批 11）；workbench 侧反向导入。 */
export function RowChevron() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export type FileTreeRowsProps = {
  entries: ProjectFileEntry[];
  /** 行点击语义（两侧各自注入）：目录 = 导航、文件 = 打开预览/中栏 file tab。 */
  onOpenDirectory: (path: string) => void;
  onPreviewFile: (path: string) => void;
  /** 行菜单 items（容器各自构造——菜单编排是容器层职责，留各自容器）。
   *  目录行菜单由回调内按 entry.type 分支（tool 侧包装 dirMenuItems）。 */
  menuItemsFor: (entry: ProjectFileEntry) => ActionMenuItem[];
  /** .tm 之后追加槽（工具侧 = GitStatusBadge）。undefined = 无。 */
  renderTrailing?: (entry: ProjectFileEntry) => ReactNode;
  /** 根目录只读模式：无菜单/右键/长按（global 侧根层 gate）。 */
  readOnly?: boolean;
  /** 行选中高亮（global 侧 sel 联动；工具侧不传）。 */
  selectedFilePath?: string;
  /** 行点击 gate（global 侧根目录浏览根层文件不可点开预览；缺省 true = 工具侧全可点）。 */
  filesClickable?: boolean;
  /** 拖动源启动（global 侧文件行 DragSourceCard 拖到中栏开 tab）。undefined = 裸行。 */
  onCardDragStart?: CardDragStartHandler;
  /** 文件所属项目名（构造 fileRef.path 全路径）。undefined → 文件行不可拖。 */
  fileProjectName?: string;
  /** inline rename（global 侧特有；工具侧不传 = 无 inline 态，重命名走 RenameDialog）。 */
  renaming?: {
    path: string | null;
    name: string;
    onNameChange: (name: string) => void;
    onSubmit: (path: string, name: string) => void;
    onCancel: () => void;
  };
};

export function FileTreeRows({
  entries,
  onOpenDirectory,
  onPreviewFile,
  menuItemsFor,
  renderTrailing,
  readOnly = false,
  selectedFilePath,
  filesClickable = true,
  onCardDragStart,
  fileProjectName,
  renaming,
}: FileTreeRowsProps) {
  const { t } = useT();
  const renameInputRef = useRef<HTMLInputElement>(null);
  // 长按/右键菜单/rename input ref 自持（调用方无行外消费——编排经 menuItemsFor 注入）。
  const ctx = useRowContextMenu();
  const lp = useLongPressActions(ctx.openAt);

  // inline rename Escape 取消（原 FileEntryList 同名 effect 迁移）。依赖用基本量——
  // renaming 是调用方每次渲染新建的字面量，逐键 teardown/re-add document 监听（code-review 批 11）。
  useEffect(() => {
    const cancel = renaming?.onCancel;
    if (!renaming?.path || !cancel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [renaming?.path, renaming?.onCancel]);

  // 根 div 带 frow-host 标记（批 10 分隔线组合选择器）：工具侧前置「..」裸 .frow 与本列表
  // 首行之间恢复发丝线（.frow + .frow-host .frow；全局侧前置非 .frow 零副作用——design-review 批 11）。
  return (
    <div aria-label="Project files" className="frow-host animate-stagger-rows">
      {entries.map((entry) => {
        const selected = entry.path === selectedFilePath;
        const isDirectory = entry.type === "directory";
        const clickable = isDirectory || filesClickable;
        const isRenaming = entry.path === renaming?.path;

        // 行 body = .ic + (.p | rename input) + .tm + trailing + .ar + ActionMenu(hidden)。
        const rowBody = (
          <>
            <span className="ic">
              <ShellIcon className="size-[17px]" name={isDirectory ? "project" : "file"} />
            </span>
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="h-7 w-full min-w-0 rounded-lg border border-primary/60 bg-surface-inset/70 px-2 text-[0.82rem] font-semibold text-on-surface font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                type="text"
                value={renaming.name}
                autoFocus
                onFocus={(e) => e.target.select()}
                onBlur={() => renaming.onCancel()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renaming.onSubmit(entry.path, renaming.name);
                }}
                onChange={(e) => renaming.onNameChange(e.target.value)}
              />
            ) : (
              <span className={`p${isDirectory ? " dir" : ""}`}>{entry.name}</span>
            )}
            {/* .tm 槽：hidden 标注占 .tm 槽（mtime 让位）；文件行 mtime 相对时间。 */}
            {entry.hidden ? (
              <span className="tm">{t("files.hidden")}</span>
            ) : !isDirectory && entry.mtimeMs ? (
              <span className="tm">{relativeTime(new Date(entry.mtimeMs).toISOString(), t)}</span>
            ) : null}
            {renderTrailing?.(entry)}
            <span className="ar">
              <RowChevron />
            </span>
            <ActionMenu
              cancelLabel={t("cancel")}
              items={menuItemsFor(entry)}
              trigger={<span className="hidden" />}
              contextMenuPoint={readOnly ? undefined : ctx.pointFor(entry.path)}
              onContextMenuClose={ctx.close}
            />
          </>
        );
        // 重命名态行 = div（HTML 内容模型禁 button 含交互式后代 input；此态行本就不可
        // 交互——onClick/onContextMenu/bind 全部早退，code-review P1）。
        const row = isRenaming ? (
          <div className="frow w-full select-none text-left" key={`${entry.type}:${entry.path}`}>
            {rowBody}
          </div>
        ) : (
          <button
            className={`frow w-full cursor-pointer select-none text-left${selected ? " sel" : ""}`}
            key={`${entry.type}:${entry.path}`}
            onClick={(e) => {
              // §4:行内 ActionMenu scrim click 按 fiber 冒泡到行,target 在 body 不在行内
              // → 忽略;guardClick 抑制长按后紧随的合成 click(02c 同款)。
              if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node))
                return;
              if (lp.guardClick()) return;
              if (!clickable) return;
              if (isDirectory) onOpenDirectory(entry.path);
              else onPreviewFile(entry.path);
            }}
            onContextMenu={readOnly ? undefined : (e) => ctx.openAt(entry.path, e)}
            type="button"
            {...(readOnly ? {} : lp.bind(entry.path))}
          >
            {rowBody}
          </button>
        );
        // 文件行（非目录 + 已知项目名 + 拖动注入）→ DragSourceCard 包 .frow 拖到中栏开
        // file tab（inClose 判定命中行根 button：单击走行自身 onClick、拖动走序列）。
        if (onCardDragStart && fileProjectName && !isDirectory) {
          return (
            <DragSourceCard
              className="frow-host"
              dragRef={{ kind: "file", path: `${fileProjectName}/${entry.path}` }}
              key={`${entry.type}:${entry.path}`}
              onDragStart={onCardDragStart}
              onSelect={() => onPreviewFile(entry.path)}
            >
              {row}
            </DragSourceCard>
          );
        }
        return row;
      })}
    </div>
  );
}
