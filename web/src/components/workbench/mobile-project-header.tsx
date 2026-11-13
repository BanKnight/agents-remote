import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { AgentProvider } from "@agents-remote/shared";
import { useT } from "../../i18n";
import type { GlobalInstanceCandidate } from "../../routes/workbench-model";
import { LucideIcon } from "../shell/lucide-icon";
import { ShellIcon } from "../shell/icons";
import { ProviderIcon } from "../shell/icons/provider-icon";
import { isSettledView, statusToV2DotClass, InstanceRowTrail } from "../shell/shell-primitives";
import { relativeTime } from "./history-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type MobileProjectHeaderProps = {
  projectName: string;
  /**
   * 行1 标题（v1.5 单会话化，spec §4.1-1）：当前聚焦对象名（实例名 / skill tab 名）；
   * 空态 / 自动聚焦瞬态 = 项目名。
   */
  title: string;
  /** runct ● 指示点：项目有运行中实例（原型 workspace.html `.runct` 去数字化）；0 不渲染。 */
  runningCount?: number;
  /** 全局活跃实例候选（▾ 菜单**唯一数据源** = useGlobalInstanceCandidates 单一 /api/overview
   *  管道）：三组（最近 / 当前项目 / 其它项目）全部由此派生——原「本项目行用
   *  useProjectInstances」是第二条管道，刷新节奏不同步（overview 有 WS 实时投影 + 10s 轮询；
   *  agent-sessions 列表无 updatedAt 失效通道）→ 同一会话最近组时间比项目组实时（用户
   *  2026-11-05 真机反馈）。单源后三组时间同值。 */
  foreignCandidates: GlobalInstanceCandidate[];
  /** 当前聚焦实例 id（菜单行高亮判定；skill/file 等非实例聚焦时菜单无高亮行）。 */
  focusId?: string;
  /** 行1 标题行首类型标（v1.6 workspace.html .tticn：agent=品牌件（focusProvider）/ sparkles
   *  / terminal=terminal；空态/插件 tab 等非实例聚焦 = project folder——标题即项目名，与实例
   *  类型标区分）。 */
  focusType?: "agent" | "terminal";
  /** 聚焦 agent 会话的 provider（品牌件分支；focusType="agent" 时消费，缺省退 sparkles）。 */
  focusProvider?: AgentProvider;
  /** 当前聚焦对象类别（design-review DR-P2-6）：skill tab 聚焦时标题 = skill 名，folder
   *  「项目」语义错位 → tticn 整体不渲染；session/空态按 focusType 派生。 */
  focusKind?: "session" | "skill";
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
  foreignCandidates,
  focusId,
  focusType,
  focusProvider,
  focusKind,
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
              focusKind={focusKind}
              focusType={focusType}
              focusProvider={focusProvider}
              foreignCandidates={foreignCandidates}
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

/** ▾ 菜单「最近」组条数上限（会话列表同源取最近 N 条活跃会话）。 */
const RECENT_GROUP_SIZE = 7;

/** ▾ 菜单组行（groups 投影统一形状）。 */
type SwitchMenuRow = {
  key: string;
  current: boolean;
  name: string;
  status: GlobalInstanceCandidate["status"];
  type: "agent" | "terminal";
  provider?: AgentProvider;
  updatedAt?: string;
  createdAt?: string;
  /** 已了结行（底部折叠组）：降饱和 + 无状态点，行尾时间 = 「N 天前了结」。 */
  settled?: boolean;
  settledAt?: string;
  onSelect: () => void;
};

type InstanceSwitchMenuProps = {
  projectName: string;
  title: string;
  runningCount?: number;
  foreignCandidates: GlobalInstanceCandidate[];
  focusId?: string;
  /** 行1 标题行首类型标（同 MobileProjectHeader.focusType）。 */
  focusType?: "agent" | "terminal";
  /** 聚焦 agent 会话 provider（同 MobileProjectHeader.focusProvider）。 */
  focusProvider?: AgentProvider;
  /** 聚焦对象类别（skill 态 tticn 不渲染，见 MobileProjectHeader.focusKind）。 */
  focusKind?: "session" | "skill";
  onSelectInstance: (projectName: string, sessionId: string) => void;
  onCreateInstance: () => void;
  onOpenHistory: () => void;
};

/**
 * 标题 ▾ 实例切换菜单（v1.6 workspace-instance-switch，族A 锚定浮卡点按型）：组头「切换实例」
 * + 跨项目分组活跃实例列表（**项目组头 .mh.g** + 行形 = §4.8 统一槽位：类型图标 + 名 +
 * 状态点 + 时间，无状态文字、无置顶标识（2026-11-02 补拍板）；当前行 =
 * 背景高亮 fill-selected，✓ 记号退役）+ 钉底「＋ 新建实例… · 当前项目」「⟲ 恢复历史会话…
 * · 当前项目」（与列表间分隔线，永不挤压）；空态（无活跃实例且无历史）= 列表区空提示 +
 * 仅新建（spec §4.1-1）。活跃实例切换零销毁（保活层语义，铁律 2）。
 *
 * 分组（v1.6 图例② + 2026-11-05 拍板）：「最近」组置顶 = **会话列表的最近视图**——唯一
 * 数据源 = foreignCandidates 全集（/api/overview 单源管道，与项目组/foreign 组同源），
 * updatedAt ?? createdAt 降序取前 RECENT_GROUP_SIZE 条活跃会话；**不含任何历史文件管道
 * 条目**（agent-history 方向废弃：文件 mtime 驱动天然混入已结束历史与 resume fork 副本
 * 幽灵行——「总共 5 个会话就 5 条」，用户拍板）。行点击 = 聚焦既有实例（无 resume 分流）
 * → 当前项目组（组头 = 项目名）→ 其余项目组按项目名 localeCompare（原「组内最新
 * updatedAt 降序」= 时间相关，会话一有更新组就跳位——排序稳定化；与服务端
 * listAllCandidates 项目序同口径）。「最近」组与所属项目组重复展示（不去重），行内不带
 * 项目名 chip（用户拍板 2026-11-05：项目归属不上行）。组内行间无线，组间分隔线落在
 * 第 2+ 组组头上方。跨项目行走 onSelectInstance(projectName, sessionId) 导航。
 */
function InstanceSwitchMenu({
  projectName,
  title,
  runningCount,
  foreignCandidates,
  focusId,
  focusType,
  focusProvider,
  focusKind,
  onSelectInstance,
  onCreateInstance,
  onOpenHistory,
}: InstanceSwitchMenuProps) {
  const { t } = useT();
  // 标题圆点跟聚焦对象类型走（2026-10-19 用户拍板）：聚焦会话 = 会话本身的状态点
  // （与 ▾ 浮层行同款 statusToV2DotClass，消「浮层黄点/标题恒绿」的观感冲突）；
  // 非会话聚焦（skill/空态）维持 runct 项目 running 指示。
  const focusedStatus = foreignCandidates.find((c) => c.ref.sessionId === focusId)?.status;
  // 活跃 / 已了结二分（settle，2026-11-13；谓词单源 isSettledView——settled 的在跑会话仍归
  // 活跃）。三组只吃活跃集；已了结集进钉底动作行上方的「已了结」折叠组（默认收起）。
  const activeCandidates = useMemo(
    () => foreignCandidates.filter((c) => !isSettledView(c)),
    [foreignCandidates],
  );
  const settledCandidates = useMemo(
    () => foreignCandidates.filter((c) => isSettledView(c)),
    [foreignCandidates],
  );
  // 折叠态不持久化（契约 §3.2）：菜单关闭即复位。（不用 <details>——Radix 菜单 roving
  // focus 只遍历 menuitem，<summary> 键盘不可达且 disclosure 不是 role="menu" 的合法子树；
  // 这里用可聚焦 menuitem 作组头，preventDefault 保持菜单开。）
  const [settledExpanded, setSettledExpanded] = useState(false);
  // 当前项目组 = 同一 candidates 单源按项目过滤（与最近组/foreign 组同值同步；原
  // useProjectInstances 第二管道刷新节奏不同步，见 props.foreignCandidates 注释）。
  const projectCandidates = useMemo(
    () => activeCandidates.filter((c) => c.ref.projectName === projectName),
    [activeCandidates, projectName],
  );
  // 跨项目分组（组内保持 candidates 序），组间按项目名 localeCompare——排序稳定化
  //（用户拍板 2026-11-05）：原「组内最新 updatedAt 降序」= 时间相关，会话一有更新组
  // 就跳位；项目名序恒定，与服务端 listAllCandidates 的项目序同口径。
  const foreignGroups = useMemo(() => {
    const byProject = new Map<string, GlobalInstanceCandidate[]>();
    for (const candidate of activeCandidates) {
      if (candidate.ref.projectName === projectName) continue;
      const list = byProject.get(candidate.ref.projectName);
      if (list) list.push(candidate);
      else byProject.set(candidate.ref.projectName, [candidate]);
    }
    return [...byProject.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [activeCandidates, projectName]);
  // 「最近」组 = 会话列表的最近视图（用户拍板 2026-11-05「唯一数据源，不考虑文件」）：
  // foreignCandidates 全集（与项目组/foreign 组同一 /api/overview 管道）按 updatedAt ??
  // createdAt 降序取前 N 条活跃会话；不含任何 agent-history 文件管道条目（该方向已废弃：
  // 文件 mtime 驱动天然混入已结束历史与 resume fork 副本幽灵行）。行形与项目组/foreign
  // 组完全同构（displayName / status / 时间同源同值），与所属项目组重复展示（不去重）。
  // 候选 ≤9 条排序开销可忽略，直接每次渲染投影。
  const recentRows: SwitchMenuRow[] = [...activeCandidates]
    .sort(
      (a, b) =>
        new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
        new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
    )
    .slice(0, RECENT_GROUP_SIZE)
    .map((candidate) => ({
      key: `recent:${candidate.ref.sessionId}`,
      current: candidate.ref.sessionId === focusId,
      name: candidate.displayName,
      status: candidate.status,
      type: candidate.type,
      provider: candidate.provider,
      updatedAt: candidate.updatedAt,
      createdAt: candidate.createdAt,
      onSelect: () => onSelectInstance(candidate.ref.projectName, candidate.ref.sessionId),
    }));
  // 空态 = 无活跃候选且无已了结候选（只有已了结时仍渲染折叠组供恢复关注）。
  const empty =
    projectCandidates.length === 0 && foreignGroups.length === 0 && settledCandidates.length === 0;
  // 菜单打开时把当前行（背景高亮）滚入视野：实例多溢出定高时队尾当前行会视野外——autoFocus
  // 常落队尾，不滚则用户看不到自己所在实例。Content 是 portal 子树且仅开态挂载（§14）：
  // mount 跑的 effect 拿到 null、open 变化不重跑 [] effect——用 state ref callback，挂载即
  // 触发重跑。
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    // 重复展示语义下当前行在「最近」组与所属项目组各一份——取最后一个 current（项目组
    // 副本，对齐「用户此刻在哪」的组）滚入视野。
    const currents = listNode?.querySelectorAll('[aria-current="true"]');
    currents?.[currents.length - 1]?.scrollIntoView({ block: "nearest" });
  }, [listNode]);
  // 列表组投影（最近组置顶 + 当前项目组 + foreign 组），组头样式共享（第 2+ 组组头上方
  // 分隔线，原型 .irow + .mh.g）。
  const groups = useMemo(
    () => [
      ...(recentRows.length > 0
        ? [{ name: t("workbench.switchRecentGroup"), rows: recentRows }]
        : []),
      ...(projectCandidates.length > 0
        ? [
            {
              name: projectName,
              rows: projectCandidates.map(
                (candidate): SwitchMenuRow => ({
                  key: candidate.ref.sessionId,
                  current: candidate.ref.sessionId === focusId,
                  name: candidate.displayName,
                  status: candidate.status,
                  type: candidate.type,
                  provider: candidate.provider,
                  updatedAt: candidate.updatedAt,
                  createdAt: candidate.createdAt,
                  onSelect: () => onSelectInstance(projectName, candidate.ref.sessionId),
                }),
              ),
            },
          ]
        : []),
      ...foreignGroups.map(([foreignProject, list]) => ({
        name: foreignProject,
        rows: list.map(
          (candidate): SwitchMenuRow => ({
            key: `${foreignProject}:${candidate.ref.sessionId}`,
            current: false,
            name: candidate.displayName,
            status: candidate.status,
            type: candidate.type,
            provider: candidate.provider,
            updatedAt: candidate.updatedAt,
            createdAt: candidate.createdAt,
            onSelect: () => onSelectInstance(foreignProject, candidate.ref.sessionId),
          }),
        ),
      })),
      // 已了结组（settle，2026-11-13）：钉底动作行上方、默认收起、折叠态不持久化。跨项目
      // 混排（settle 是全局面，不分当前项目/foreign）。
      ...(settledCandidates.length > 0
        ? [
            {
              name: t("workbench.settledGroup", { count: settledCandidates.length }),
              collapsible: true,
              rows: settledCandidates.map(
                (candidate): SwitchMenuRow => ({
                  key: `settled:${candidate.ref.projectName}:${candidate.ref.sessionId}`,
                  current: candidate.ref.sessionId === focusId,
                  name: candidate.displayName,
                  status: candidate.status,
                  type: candidate.type,
                  provider: candidate.provider,
                  settled: true,
                  settledAt: candidate.settledAt,
                  onSelect: () =>
                    onSelectInstance(candidate.ref.projectName, candidate.ref.sessionId),
                }),
              ),
            },
          ]
        : []),
    ],
    [
      focusId,
      foreignGroups,
      onSelectInstance,
      projectCandidates,
      projectName,
      recentRows,
      settledCandidates,
      t,
    ],
  );
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setSettledExpanded(false);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${title} · ${t("workbench.switchInstance")}`}
          className="group flex h-full w-full cursor-pointer items-center justify-center gap-1.5"
          type="button"
        >
          {/* 行1 类型标（v1.6 workspace.html h1 .tticn：行首品牌件/sparkles = Agent 会话类型标
            （2026-11-02 品牌件批：provider 有 → ProviderIcon，缺省退 sparkles），
            区别于项目 folder；terminal = terminal；空态/插件 tab = folder。skill tab 聚焦
            标题 = skill 名，folder「项目」语义错位 → 整体不渲染（DR-P2-6）） */}
          {focusKind === "skill" ? null : focusType === "agent" ? (
            focusProvider ? (
              <ProviderIcon className="tticn" provider={focusProvider} />
            ) : (
              <ShellIcon className="tticn" name="sparkles" />
            )
          ) : (
            <ShellIcon className="tticn" name={focusType === "terminal" ? "terminal" : "project"} />
          )}
          <span className="block truncate">{title}</span>
          {/* 聚焦会话 → 会话状态点（.dot 原语 7×7，单源 statusToV2DotClass）；非会话聚焦
            → runct ●（项目有运行中实例，9px 绿，原型 .runct 去数字化——数字统计只属于
            项目页，2026-10-15 用户拍板） */}
          {focusedStatus ? (
            <span className={statusToV2DotClass(focusedStatus)} />
          ) : runningCount ? (
            <span className="runct">●</span>
          ) : null}
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
      {/* 关闭不回焦 trigger（2026-10-14 真机反馈「关掉后标题行多出蓝色选中框」）：Radix
        关闭默认程序化 focus 回 trigger（键盘 a11y 默认），WebKit 对 tap 后的脚本 focus
        仍判 :focus-visible → 浏览器默认蓝环包住整行裸 button（h-full w-full，无 outline
        处理）；点空白焦点移走即消失 = 机制吻合。preventDefault 结构性免疫引擎分歧
        （frontend-notes §33）；取舍 = 键盘焦点落 body，本组件仅移动 header 点按场景消费，
        可接受（桌面 DropdownMenu 不拦，键盘焦点返还语义保留）。 */}
      <DropdownMenuContent
        align="center"
        className="w-[250px] p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-3.5 pb-1.5 pt-2.5 text-[10.5px] font-bold tracking-[0.5px] text-ink-2">
          {t("workbench.switchInstance")}
        </div>
        <div ref={setListNode} className="max-h-[200px] overflow-y-auto">
          {empty ? (
            <div className="px-3.5 py-3 text-[13px] text-ink-3">{projectName}</div>
          ) : (
            groups.map((group, groupIndex) => {
              const rows = group.rows.map((row) => (
                <InstanceSwitchRow
                  createdAt={row.createdAt}
                  current={row.current}
                  key={row.key}
                  name={row.name}
                  onSelect={row.onSelect}
                  provider={row.provider}
                  settled={row.settled}
                  settledAt={row.settledAt}
                  status={row.status}
                  type={row.type}
                  updatedAt={row.updatedAt}
                />
              ));
              // 「已了结」组可折叠（组头 = 可聚焦 menuitem，点按/Enter 切换；默认收起）。
              if ("collapsible" in group && group.collapsible) {
                return (
                  <div key={group.name}>
                    <DropdownMenuItem
                      aria-expanded={settledExpanded}
                      className={`min-h-0 rounded-none px-3.5 pt-2 pb-[3px] text-[10px] font-bold tracking-[0.5px] text-ink-3 hover:text-ink-2 focus:bg-transparent focus:text-ink-2${groupIndex > 0 ? " border-t border-sep" : ""}`}
                      onSelect={(event) => {
                        // 默认 onSelect 会关菜单；组头只切换展开态。
                        event.preventDefault();
                        setSettledExpanded((expanded) => !expanded);
                      }}
                    >
                      {group.name}
                    </DropdownMenuItem>
                    {settledExpanded ? rows : null}
                  </div>
                );
              }
              return (
                <div key={group.name}>
                  <div
                    className={`px-3.5 pt-2 pb-[3px] text-[10px] font-bold tracking-[0.5px] text-ink-3${groupIndex > 0 ? " border-t border-sep" : ""}`}
                  >
                    {group.name}
                  </div>
                  {rows}
                </div>
              );
            })
          )}
        </div>
        {/* 钉底两行动作（主色 600，与列表间分隔线，永不挤压；空态仅新建。⟲ 恢复历史是本项目
          动作——本项目无活跃实例时不渲染，保持「空态菜单仅新建」spec §4.1-1 语义。后缀
          「· 当前项目」= v1.6 原型 iact 逐字，标动作作用域） */}
        <div className="border-t border-sep-row pb-1">
          <DropdownMenuItem
            className="h-[42px] min-h-[42px] justify-start gap-[9px] rounded-none px-3.5 text-[13.5px] font-semibold text-primary focus:bg-on-surface/5"
            onSelect={onCreateInstance}
          >
            <span className="w-4 shrink-0 text-center text-[15px] font-bold leading-none">＋</span>
            {t("workbench.menuNewInstance")}
          </DropdownMenuItem>
          {projectCandidates.length === 0 ? null : (
            <DropdownMenuItem
              className="h-[42px] min-h-[42px] justify-start gap-[9px] rounded-none px-3.5 text-[13.5px] font-semibold text-primary focus:bg-on-surface/5"
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
  /** agent 行品牌件分支（缺省退 sparkles 主色——无 provider 数据路径）。 */
  provider?: AgentProvider;
  /** 相对时间源（agent = updatedAt ?? createdAt；terminal 仅 updatedAt）。 */
  updatedAt?: string;
  createdAt?: string;
  /** 已了结行（底部折叠组）：降饱和 + 无状态点，行尾时间 = 「N 天前了结」。 */
  settled?: boolean;
  settledAt?: string;
  onSelect: () => void;
};

/**
 * ▾ 菜单实例行（v1.6 .irow）：类型图标（agent = 品牌件（provider 有）/ sparkles 主色 /
 * terminal = square-terminal 绿；2026-11-02 品牌件批）+ 名 + 行尾簇（InstanceRowTrail
 * 单源：状态点 + 时间，v1.7 §4.8——状态文字退出列表行、置顶标识退出列表行）。项目分组
 * 已上收组头，行内不标注项目名（2026-11-05 拍板：「最近」组行同规则，项目归属不上行）。
 * 当前行 = 背景高亮（fill-selected，与 Sidebar selrow 同款；✓ 记号退役，v1.6 图例②），
 * 名字 600 不变。
 */
function InstanceSwitchRow({
  type,
  name,
  status,
  current,
  provider,
  updatedAt,
  createdAt,
  settled = false,
  settledAt,
  onSelect,
}: InstanceSwitchRowProps) {
  const { t } = useT();
  return (
    <DropdownMenuItem
      aria-current={current ? "true" : undefined}
      className={`h-[40px] min-h-[40px] justify-start gap-[9px] rounded-none px-3.5 text-[13.5px] font-normal focus:bg-on-surface/5${current ? " bg-fill-selected" : ""}${settled ? " text-ink-3" : ""}`}
      onSelect={onSelect}
    >
      {type === "agent" ? (
        provider ? (
          <ProviderIcon className="size-[15px] shrink-0" provider={provider} />
        ) : (
          <ShellIcon className="size-[15px] shrink-0 text-primary" name="sparkles" />
        )
      ) : (
        <ShellIcon className="size-[15px] shrink-0 text-success" name="terminal" />
      )}
      <span className={`min-w-0 truncate ${current ? "font-semibold" : ""}`}>{name}</span>
      <InstanceRowTrail
        className="ml-auto"
        dotClassName={settled ? undefined : statusToV2DotClass(status)}
        time={
          settled
            ? t("workbench.settledAgo", { time: relativeTime(settledAt ?? "", t) })
            : relativeTime(updatedAt ?? createdAt ?? "", t)
        }
      />
    </DropdownMenuItem>
  );
}
