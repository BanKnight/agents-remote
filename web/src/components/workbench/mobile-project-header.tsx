import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useT } from "../../i18n";
import { sessionStatusLabel } from "../../routes/console-model";
import type { GlobalInstanceCandidate } from "../../routes/workbench-model";
import { LucideIcon } from "../shell/lucide-icon";
import { statusToV2DotClass } from "../shell/shell-primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { type ProjectInstanceEntry } from "./instance-area";

type MobileProjectHeaderProps = {
  projectName: string;
  /**
   * 行1 标题（v1.5 单会话化，spec §4.1-1）：当前聚焦对象名（实例名 / skill tab 名）；
   * 空态 / 自动聚焦瞬态 = 项目名。
   */
  title: string;
  /** runct ●n 微标：项目运行中实例数（原型 workspace.html `.runct`）；0 不渲染。 */
  runningCount?: number;
  /** 项目活跃实例（▾ 实例切换菜单列表源 = useProjectInstances 单一数据管道）。 */
  instances: ProjectInstanceEntry[];
  /** 全局活跃实例候选（真机复验反馈③：▾ 菜单跨项目——本项目行由 instances 承载，这里只
   *  消费其它项目部分；数据源 = useGlobalInstanceCandidates 单一 /api/overview 管道）。 */
  foreignCandidates: GlobalInstanceCandidate[];
  /** 当前聚焦实例 id（菜单行 ✓ 判定；skill/file 等非实例聚焦时菜单无 ✓ 行）。 */
  focusId?: string;
  onSelectInstance: (projectName: string, sessionId: string) => void;
  /** ▾ 菜单钉底「＋ 新建实例…」（→ 03j sheet）。 */
  onCreateInstance: () => void;
  /** ▾ 菜单钉底「⟲ 恢复历史会话…」（捷径直通 ⋯ 会话历史 sheet；空态菜单不渲染本行——
   * spec §4.1-1「空态菜单内仅新建」）。 */
  onOpenHistory: () => void;
  /** L3 详情页 nav 形态（03q/03r/03u/03s）：非空时 header 只渲染 nav 行——back 显示
   * backLabel（父目录/Git 检视/提交历史/分组名）、标题切 L3 标题（文件名/commit hash/页名）、
   * 右侧 actions（03q ⋯ 菜单）。▾/面板钮不渲染（L3 是内容区替换的独立页面）。 */
  l3?: { backLabel: string; title: string; onClick: () => void; actions?: ReactNode };
  onBack: () => void;
  /** nav ⋯ 更多菜单（v1.5 = 会话历史 / 实例信息，workspace-more-menu；调用方装配 ActionMenu）。 */
  moreMenu?: ReactNode;
  /** 检视面板入口（v1.5 行1 右端 [面板]：文件树/Git/Wiki 合并入口，03 面板钮自行2 迁入）。 */
  onOpenPanel: () => void;
};

/**
 * 移动项目工作台行1 导航（v1.5 单会话化定案，spec §4.1-1，对标 workspace.html / workspace-
 * instance-switch.html）：
 *
 * - 行1（44px，唯一常驻行）：`.back`「项目」（‹ 返回项目 Tab 根）+ 标题 = **当前实例名**
 *   + `runct ●n` 运行徽标 + `▾`（实例切换菜单锚，族A 锚定浮卡）+ 右端 **[面板][⋯]** 两图标。
 * - **行2（实例 pills + ＋ + 面板钮）已退役**——pills 常驻撤除，切换/新建/恢复收进标题 ▾
 *   菜单（活跃实例列表定高滚动 + 钉底 ＋ 新建 / ⟲ 恢复历史会话）；面板钮迁行1 右端。
 * - 原「项目名 ▾ 项目切换」（03l sheet）随工作台 Tab 退役并入 back（‹ 项目 = 项目 Tab 根，
 *   项目列表即项目切换器）。
 * - pill 长按菜单（02c 置顶/重命名/关闭）随 pills 退役——操作全量收进实例信息面板动作行
 *  （⋯ › 实例信息，入口唯一）。
 *
 * 原语类（.nav/.back/.nv-t/.ticon）消费 v2-primitives.css 单源。
 */
export function MobileProjectHeader({
  projectName,
  title,
  runningCount,
  instances,
  foreignCandidates,
  focusId,
  onSelectInstance,
  onCreateInstance,
  onOpenHistory,
  l3,
  onBack,
  moreMenu,
  onOpenPanel,
}: MobileProjectHeaderProps) {
  const { t } = useT();
  return (
    <>
      {/* 行1（原型 .nav：back + 标题▾ + [面板][⋯]；safe-area 顶带由外层 wrapper 消费）。
        L3 态（03q/03r/03u/03s）：back 换语义 label、标题换 L3 标题（mono 14px，原型规格）。 */}
      <div className="nav shrink-0">
        <button
          className="back cursor-pointer touch:px-2 touch:py-2"
          onClick={l3 ? l3.onClick : onBack}
          type="button"
        >
          {l3 ? l3.backLabel : t("nav.projects")}
        </button>
        <h1 className="nv-t min-w-0">
          {l3 ? (
            <span className="block truncate font-mono text-[14px]">{l3.title}</span>
          ) : (
            <InstanceSwitchMenu
              focusId={focusId}
              foreignCandidates={foreignCandidates}
              instances={instances}
              onCreateInstance={onCreateInstance}
              onOpenHistory={onOpenHistory}
              onSelectInstance={onSelectInstance}
              projectName={projectName}
              runningCount={runningCount}
              title={title}
            />
          )}
        </h1>
        {l3 ? (
          l3.actions
        ) : (
          <>
            {/* 检视面板单入口（v1.5 行1 右端 [面板]：03 面板钮自行2 迁入；热区扩展同前 M10 语义）。
                真机复验反馈②：与右端 ⋯ 同 .ic 26×26 形制（原型 nav 右端两钮恒 .ic，此前 .ticon
                19px 无容器 → 与工具页 [pencil][⋯]（恒 .ic）中心距差 3.5px，用户可见不一致）。 */}
            <button
              aria-label={t("workbench.inspectionPanel")}
              className="ic relative cursor-pointer after:absolute after:-inset-2 after:content-['']"
              onClick={onOpenPanel}
              title={t("workbench.inspectionPanel")}
              type="button"
            >
              <LucideIcon name="panel-left" />
            </button>
            {moreMenu}
          </>
        )}
      </div>
    </>
  );
}

type InstanceSwitchMenuProps = {
  projectName: string;
  title: string;
  runningCount?: number;
  instances: ProjectInstanceEntry[];
  foreignCandidates: GlobalInstanceCandidate[];
  focusId?: string;
  onSelectInstance: (projectName: string, sessionId: string) => void;
  onCreateInstance: () => void;
  onOpenHistory: () => void;
};

/**
 * 标题 ▾ 实例切换菜单（v1.5 workspace-instance-switch，族A 锚定浮卡点按型）：组头「切换实例」
 * + 活跃实例列表（类型图标 + 名 + 状态点文案，当前行 ✓；max-h 定高滚动，实例多不挤压）+
 * 钉底「＋ 新建实例…」「⟲ 恢复历史会话…」（与列表间分隔线，永不挤压）。活跃实例与历史互斥
 *（已关闭会话不在列表，走恢复）；空态（无实例）= 列表区空提示 + 仅新建（spec §4.1-1）。
 * 切换零销毁（保活层语义，铁律 2）。
 *
 * 真机复验反馈③：列表跨项目——本项目行在前（不标注），其它项目活跃实例按项目名分组排后，
 * 行内标注项目名（原型 workspace-instance-switch 是单项目形态，跨项目为反馈驱动的 diverge
 * 扩展）。✓ 只标本项目当前行；跨项目行走 onSelectInstance(projectName, sessionId) 导航。
 */
function InstanceSwitchMenu({
  projectName,
  title,
  runningCount,
  instances,
  foreignCandidates,
  focusId,
  onSelectInstance,
  onCreateInstance,
  onOpenHistory,
}: InstanceSwitchMenuProps) {
  const { t } = useT();
  // 其它项目活跃实例：按项目名分组（组内保持 candidates 序），行内标注项目名。
  const foreignGroups = useMemo(() => {
    const byProject = new Map<string, GlobalInstanceCandidate[]>();
    for (const candidate of foreignCandidates) {
      if (candidate.ref.projectName === projectName) continue;
      const list = byProject.get(candidate.ref.projectName);
      if (list) list.push(candidate);
      else byProject.set(candidate.ref.projectName, [candidate]);
    }
    return [...byProject.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [foreignCandidates, projectName]);
  const empty = instances.length === 0 && foreignGroups.length === 0;
  // 菜单打开时把当前行（✓）滚入视野：实例多溢出定高时队尾当前行会视野外——autoFocus 常落
  // 队尾，不滚则用户看不到自己所在实例。Content 是 portal 子树且仅开态挂载（§14）：mount 跑
  // 的 effect 拿到 null、open 变化不重跑 [] effect——用 state ref callback，挂载即触发重跑。
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    listNode?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [listNode]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${title} · ${t("workbench.switchInstance")}`}
          className="group flex h-full w-full cursor-pointer items-center justify-center gap-1.5"
          type="button"
        >
          <span className="block truncate">{title}</span>
          {/* runct ●n：项目运行中实例数（9px 绿，原型 .runct） */}
          {runningCount ? <span className="runct">●{runningCount}</span> : null}
          {/* 实例切换菜单锚（真机复验反馈③：文字「▾」10px 尺寸失真 → .sw 8px 几何 chevron
            （原型「标题▾」单源，v2-primitives 已物化）；开态主色同原型激活语义。 */}
          <span
            aria-hidden
            className="sw shrink-0 transition-colors group-data-[state=open]:[border-color:var(--c-primary)]"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-[250px] p-0">
        <div className="px-3.5 pb-1.5 pt-2.5 text-[10.5px] font-bold tracking-[0.5px] text-ink-2">
          {t("workbench.switchInstance")}
        </div>
        <div ref={setListNode} className="max-h-[200px] overflow-y-auto">
          {empty ? (
            <div className="px-3.5 py-3 text-[13px] text-ink-3">{projectName}</div>
          ) : (
            <>
              {instances.map((entry) => (
                <InstanceSwitchRow
                  current={entry.session.id === focusId}
                  key={entry.session.id}
                  name={entry.session.displayName}
                  onSelect={() => onSelectInstance(projectName, entry.session.id)}
                  status={entry.session.status}
                  type={entry.type}
                />
              ))}
              {foreignGroups.map(([foreignProject, list]) =>
                list.map((candidate) => (
                  <InstanceSwitchRow
                    badge={foreignProject}
                    current={false}
                    key={`${foreignProject}:${candidate.ref.sessionId}`}
                    name={candidate.displayName}
                    onSelect={() => onSelectInstance(foreignProject, candidate.ref.sessionId)}
                    status={candidate.status}
                    type={candidate.type}
                  />
                )),
              )}
            </>
          )}
        </div>
        {/* 钉底两行动作（主色 600，与列表间分隔线，永不挤压；空态仅新建。⟲ 恢复历史是本项目
          动作——本项目无活跃实例时不渲染，保持「空态菜单仅新建」spec §4.1-1 语义） */}
        <div className="border-t border-sep-row pb-1">
          <DropdownMenuItem
            className="h-[42px] justify-start gap-2.5 rounded-none px-3.5 text-[13.5px] font-semibold text-primary focus:bg-on-surface/5"
            onSelect={onCreateInstance}
          >
            <span className="w-4 shrink-0 text-center text-[15px] font-bold leading-none">＋</span>
            {t("workbench.menuNewInstance")}
          </DropdownMenuItem>
          {instances.length === 0 ? null : (
            <DropdownMenuItem
              className="h-[42px] justify-start gap-2.5 rounded-none px-3.5 text-[13.5px] font-semibold text-primary focus:bg-on-surface/5"
              onSelect={onOpenHistory}
            >
              <span className="w-4 shrink-0 text-center text-[15px] font-bold leading-none">⟲</span>
              {t("workbench.resumeHistory")}
            </DropdownMenuItem>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type InstanceSwitchRowProps = {
  type: "agent" | "terminal";
  name: string;
  status: GlobalInstanceCandidate["status"];
  /** 非本项目行的行内项目名标注（反馈③跨项目；undefined = 本项目行不标注）。 */
  badge?: string;
  current: boolean;
  onSelect: () => void;
};

/**
 * ▾ 菜单实例行（本项目行与跨项目行同形制，spec §6.2 类型图标 registry 单源）：类型图标
 * （agent = sparkles 主色 / terminal = square-terminal 绿）+ 名 + [项目名标注] + 状态列 +
 * 当前行 ✓（主色，原型 .ck）。
 */
function InstanceSwitchRow({
  type,
  name,
  status,
  badge,
  current,
  onSelect,
}: InstanceSwitchRowProps) {
  const { t } = useT();
  return (
    <DropdownMenuItem
      aria-current={current ? "true" : undefined}
      className="justify-start gap-2.5 rounded-none border-t border-sep px-3.5 text-[13.5px] font-normal focus:bg-on-surface/5 first:border-t-0"
      onSelect={onSelect}
    >
      <LucideIcon
        className={`size-[15px] shrink-0 ${type === "agent" ? "text-primary" : "text-success"}`}
        name={type === "agent" ? "sparkles" : "square-terminal"}
      />
      <span className={`min-w-0 truncate ${current ? "font-semibold" : ""}`}>{name}</span>
      {badge ? <span className="shrink-0 text-[11px] text-ink-2">{badge}</span> : null}
      {/* 状态列（原型 .st.run = success-text 600 / .st.idle = ink-2） */}
      <span
        className={`ml-auto flex shrink-0 items-center gap-1 text-[11px] ${status === "running" ? "font-semibold text-success-text" : "text-ink-2"}`}
      >
        <span className={statusToV2DotClass(status)} />
        {t(sessionStatusLabel(status))}
      </span>
      {current ? (
        <span aria-hidden className="shrink-0 text-[12px] font-bold text-primary">
          ✓
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}
