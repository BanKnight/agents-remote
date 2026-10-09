import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useT } from "../../i18n";
import { sessionStatusLabel } from "../../routes/console-model";
import type { GlobalInstanceCandidate } from "../../routes/workbench-model";
import { LucideIcon } from "../shell/lucide-icon";
import { ShellIcon } from "../shell/icons";
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
  /** 当前聚焦实例 id（菜单行高亮判定；skill/file 等非实例聚焦时菜单无高亮行）。 */
  focusId?: string;
  /** 行1 标题行首类型标（v1.6 workspace.html .tticn：agent=sparkles / terminal=terminal；
   *  空态/插件 tab 等非实例聚焦 = project folder——标题即项目名，与实例类型标区分）。 */
  focusType?: "agent" | "terminal";
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
  focusType,
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
              focusType={focusType}
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
                19px 无容器 → 与工具页右端 ⋯（恒 .ic）中心距差 3.5px，用户可见不一致）。
                批 16 反馈②：面板右滑入（InspectionPanel translate-x-full）/ 桌面右 aside，
                图标用右侧形制（panel-right 右竖线，近似原型 svg 竖线偏右；原型的右栏三短线
                细节在 §15③ Lucide 单轨下无对应物，不手绘模仿）。 */}
            <button
              aria-label={t("workbench.inspectionPanel")}
              className="ic relative cursor-pointer after:absolute after:-inset-2 after:content-['']"
              onClick={onOpenPanel}
              title={t("workbench.inspectionPanel")}
              type="button"
            >
              <LucideIcon name="panel-right" />
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
  /** 行1 标题行首类型标（同 MobileProjectHeader.focusType）。 */
  focusType?: "agent" | "terminal";
  onSelectInstance: (projectName: string, sessionId: string) => void;
  onCreateInstance: () => void;
  onOpenHistory: () => void;
};

/**
 * 标题 ▾ 实例切换菜单（v1.6 workspace-instance-switch，族A 锚定浮卡点按型）：组头「切换实例」
 * + 跨项目分组活跃实例列表（**项目组头 .mh.g** + 类型图标 + 名 + 状态点文案；当前行 =
 * 背景高亮 fill-selected，✓ 记号退役）+ 钉底「＋ 新建实例… · 当前项目」「⟲ 恢复历史会话…
 * · 当前项目」（与列表间分隔线，永不挤压）。活跃实例与历史互斥（已关闭会话不在列表，走
 * 恢复）；空态（无实例）= 列表区空提示 + 仅新建（spec §4.1-1）。切换零销毁（保活层语义，
 * 铁律 2）。
 *
 * 分组（v1.6 图例②）：当前项目组置顶（组头 = 项目名），其余项目按最近活动（组内最新
 * updatedAt）排序；组内行间无线，组间分隔线落在第 2+ 组组头上方。跨项目行走
 * onSelectInstance(projectName, sessionId) 导航。
 */
function InstanceSwitchMenu({
  projectName,
  title,
  runningCount,
  instances,
  foreignCandidates,
  focusId,
  focusType,
  onSelectInstance,
  onCreateInstance,
  onOpenHistory,
}: InstanceSwitchMenuProps) {
  const { t } = useT();
  // 跨项目分组（组内保持 candidates 序），组间按最近活动（组内最新 updatedAt）降序。
  const foreignGroups = useMemo(() => {
    const byProject = new Map<string, GlobalInstanceCandidate[]>();
    for (const candidate of foreignCandidates) {
      if (candidate.ref.projectName === projectName) continue;
      const list = byProject.get(candidate.ref.projectName);
      if (list) list.push(candidate);
      else byProject.set(candidate.ref.projectName, [candidate]);
    }
    const latestActivity = (list: GlobalInstanceCandidate[]) =>
      Math.max(...list.map((c) => Date.parse(c.updatedAt ?? c.createdAt ?? "")));
    return [...byProject.entries()].sort(([, a], [, b]) => latestActivity(b) - latestActivity(a));
  }, [foreignCandidates, projectName]);
  const empty = instances.length === 0 && foreignGroups.length === 0;
  // 菜单打开时把当前行（背景高亮）滚入视野：实例多溢出定高时队尾当前行会视野外——autoFocus
  // 常落队尾，不滚则用户看不到自己所在实例。Content 是 portal 子树且仅开态挂载（§14）：
  // mount 跑的 effect 拿到 null、open 变化不重跑 [] effect——用 state ref callback，挂载即
  // 触发重跑。
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    listNode?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [listNode]);
  // 列表组投影（当前项目组置顶 + foreign 组），组头样式共享（第 2+ 组组头上方分隔线，
  // 原型 .irow + .mh.g）。
  const groups = useMemo(
    () => [
      ...(instances.length > 0
        ? [
            {
              name: projectName,
              rows: instances.map((entry) => ({
                key: entry.session.id,
                current: entry.session.id === focusId,
                name: entry.session.displayName,
                status: entry.session.status,
                type: entry.type,
                onSelect: () => onSelectInstance(projectName, entry.session.id),
              })),
            },
          ]
        : []),
      ...foreignGroups.map(([foreignProject, list]) => ({
        name: foreignProject,
        rows: list.map((candidate) => ({
          key: `${foreignProject}:${candidate.ref.sessionId}`,
          current: false,
          name: candidate.displayName,
          status: candidate.status,
          type: candidate.type,
          onSelect: () => onSelectInstance(foreignProject, candidate.ref.sessionId),
        })),
      })),
    ],
    [focusId, foreignGroups, instances, onSelectInstance, projectName],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${title} · ${t("workbench.switchInstance")}`}
          className="group flex h-full w-full cursor-pointer items-center justify-center gap-1.5"
          type="button"
        >
          {/* 行1 类型标（v1.6 workspace.html h1 .tticn：行首 sparkles = Agent 会话类型标，
            区别于项目 folder；terminal = terminal；空态/插件 tab = folder） */}
          <ShellIcon
            className="tticn"
            name={
              focusType === "agent" ? "sparkles" : focusType === "terminal" ? "terminal" : "project"
            }
          />
          <span className="block truncate">{title}</span>
          {/* runct ●n：项目运行中实例数（9px 绿，原型 .runct） */}
          {runningCount ? <span className="runct">●{runningCount}</span> : null}
          {/* 实例切换菜单锚（批 12 反馈⑤：CSS 手绘 .sw 旋转盒退役 → Lucide 管线单轨；
            显式尺寸防 WebKit flex 收缩隐形，frontend-notes §15⑤。开态主色用 currentColor。 */}
          <LucideIcon
            className="size-3.5 shrink-0 text-ink-2 transition-colors group-data-[state=open]:text-primary"
            name="chevron-down"
          />
        </button>
      </DropdownMenuTrigger>
      {/* 分区容器菜单（标题 / 滚动列表 / 钉底动作三分区），非行式菜单——不挂 .menu-sep
        （行式菜单显式语义，v2-primitives）；组内行间无线（v1.6），组间线在组头上方。 */}
      <DropdownMenuContent align="center" className="w-[250px] p-0">
        <div className="px-3.5 pb-1.5 pt-2.5 text-[10.5px] font-bold tracking-[0.5px] text-ink-2">
          {t("workbench.switchInstance")}
        </div>
        <div ref={setListNode} className="max-h-[200px] overflow-y-auto">
          {empty ? (
            <div className="px-3.5 py-3 text-[13px] text-ink-3">{projectName}</div>
          ) : (
            groups.map((group, groupIndex) => (
              <div key={group.name}>
                <div
                  className={`px-3.5 pt-2 pb-[3px] text-[10px] font-bold tracking-[0.5px] text-ink-3${groupIndex > 0 ? " border-t border-sep" : ""}`}
                >
                  {group.name}
                </div>
                {group.rows.map((row) => (
                  <InstanceSwitchRow
                    current={row.current}
                    key={row.key}
                    name={row.name}
                    onSelect={row.onSelect}
                    status={row.status}
                    type={row.type}
                  />
                ))}
              </div>
            ))
          )}
        </div>
        {/* 钉底两行动作（主色 600，与列表间分隔线，永不挤压；空态仅新建。⟲ 恢复历史是本项目
          动作——本项目无活跃实例时不渲染，保持「空态菜单仅新建」spec §4.1-1 语义。后缀
          「· 当前项目」= v1.6 原型 iact 逐字，标动作作用域） */}
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
  current: boolean;
  onSelect: () => void;
};

/**
 * ▾ 菜单实例行（v1.6 .irow：项目分组已上收组头，行内不再标注项目名——badge 退役）：类型
 * 图标（agent = sparkles 主色 / terminal = square-terminal 绿；ShellIcon SF 名经菜单 17px
 * 标准档统一渲染——批 B 由 LucideIcon 15px 换轨，视觉差 15→17px 交真机确认）+ 名 + 状态列。
 * 当前行 = 背景高亮（fill-selected，与 Sidebar selrow 同款；✓ 记号退役，v1.6 图例②），
 * 名字 600 不变。
 */
function InstanceSwitchRow({ type, name, status, current, onSelect }: InstanceSwitchRowProps) {
  const { t } = useT();
  return (
    <DropdownMenuItem
      aria-current={current ? "true" : undefined}
      className={`justify-start gap-2.5 rounded-none px-3.5 text-[13.5px] font-normal focus:bg-on-surface/5${current ? " bg-fill-selected" : ""}`}
      onSelect={onSelect}
    >
      <ShellIcon
        className={`size-[15px] shrink-0 ${type === "agent" ? "text-primary" : "text-success"}`}
        name={type === "agent" ? "sparkles" : "terminal"}
      />
      <span className={`min-w-0 truncate ${current ? "font-semibold" : ""}`}>{name}</span>
      {/* 状态列（原型 .st.run = success-text 600 / .st.idle = ink-2） */}
      <span
        className={`ml-auto flex shrink-0 items-center gap-1 text-[11px] ${status === "running" ? "font-semibold text-success-text" : "text-ink-2"}`}
      >
        <span className={statusToV2DotClass(status)} />
        {t(sessionStatusLabel(status))}
      </span>
    </DropdownMenuItem>
  );
}
