// 批 11 反馈②「真同构」：地址栏单源。此前 FilesToolPanel 的 .crumb（usePanelToolChip 内联）
// 与 FilesPanel 的 PathBreadcrumb（v1 遗留 🏠 + 斜杠段钮）是两份独立实现——用户实测
//「地址栏明显不同」。FileCrumb 收敛同一份 DOM（.crumb 形制：根段图标 + 中间段钮 + <b> 收尾），
// 差异经 props：
//   - rootLabel：根态展示文字（tool 语境 = 项目名；global 根层 = 产品名，v1.6 原型
//     files-global-tab「folder + <b>agents-remote</b>」）
//
// diverge 记档（redesign-v2 §6.14 批 11）：原型全局文件页（files-global-tab / ipad /
// mac-files-global）地址栏 = .sfield 搜索框、无 crumb——用户「两树真同构」要求优先于原型落图。
// v1.6（2026-10-10）原型显式给出根名文字（folder + <b>根名</b>），批 11「纯图标根段」
// 随之退役：根态 = 图标 + <b>{rootLabel}</b>；子目录层根段回归纯图标回根钮。

import { ShellIcon } from "../shell/icons";

export function FileCrumb({
  onNavigate,
  rootLabel,
  segments: rawSegments,
}: {
  /** 路径段（受控 cwd 拆分；tool 语境 = 相对项目根，global 语境 = 首段为项目名）。
   *  空段（双斜杠/尾斜杠残留）在此处过滤——单源收口，不依赖调用方传干净路径
   *（原 PathBreadcrumb 的 .filter(Boolean) 语义随单源迁入，code-review 批 11）。 */
  segments: string[];
  /** 根段/中间段点击导航（根段 = onNavigate("")）。 */
  onNavigate: (path: string) => void;
  /** 根态展示文字 + 根段可访问名。 */
  rootLabel: string;
}) {
  const segments = rawSegments.filter(Boolean);
  return (
    <div className="crumb">
      {/* 根段：子目录层 = 纯图标回根钮（aria-label = rootLabel，纯图标对读屏静默由根态
        文字兜底语义——design-review P1）；已在根 = 图标 + <b>{rootLabel}</b>（v1.6 原型
        files-global-tab：folder + <b>agents-remote</b>）。 */}
      {segments.length > 0 ? (
        <button
          aria-label={rootLabel}
          className="cseg"
          onClick={() => onNavigate("")}
          type="button"
        >
          <ShellIcon className="cico" name="project" />
        </button>
      ) : (
        <span className="cseg flex-none">
          <ShellIcon className="cico" name="project" />
          <b>{rootLabel}</b>
        </span>
      )}
      {segments.slice(0, -1).map((seg, i) => (
        <button
          key={i}
          onClick={() => onNavigate(segments.slice(0, i + 1).join("/"))}
          type="button"
        >
          {seg}
        </button>
      ))}
      {segments.length > 0 ? <b>{segments[segments.length - 1]}</b> : null}
    </div>
  );
}
