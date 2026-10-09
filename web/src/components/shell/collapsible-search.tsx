import { useT } from "../../i18n";
import { ShellIcon } from "./icons";

/**
 * 收缩搜索展开态单源（v1.6 files-global-tab ①「点按展开 = 03x 全宽过滤」；2026-10-10 真机
 * 反馈：检视工具 chip 的 files 搜索此前用 .wsearch chip 内嵌形态，与全局文件/插件页的
 * .psearch + ✕ 全宽形态宽度和样式都不同——统一本组件，三处消费：全局文件行2 / 插件域行 /
 * 检视工具 chip 槽）。渲染 = .psearch（38px/r12 移动档单源）flex-1 + .obtn.srch ✕ 收起钮；
 * 收起清词由 onClose 调用方自理（各页 query state 留在调用方）。
 */
export function CollapsibleSearchRow({
  onChange,
  onClose,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  onClose: () => void;
  placeholder: string;
  value: string;
}) {
  const { t } = useT();
  return (
    <>
      <div className="psearch min-w-0 flex-1">
        <ShellIcon
          aria-hidden="true"
          className="size-4 flex-none text-ink-2"
          name="magnifyingglass"
        />
        <input
          aria-label={placeholder}
          autoFocus
          className="w-full bg-transparent text-callout text-ink-1 outline-none"
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type="search"
          value={value}
        />
      </div>
      <button
        aria-label={t("files.closeSearch")}
        className="obtn srch cursor-pointer"
        onClick={onClose}
        type="button"
      >
        <ShellIcon aria-hidden="true" name="close" />
      </button>
    </>
  );
}
