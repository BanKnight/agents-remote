import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { atom } from "jotai";
import type {
  InstalledSkill,
  McpMarketEntry,
  McpServerEntry,
  SkillMarketEntry,
} from "@agents-remote/shared";

import { useT } from "../../i18n";
import { workbenchLastProjectAtom } from "../../routes/workbench-model";
import { DEFAULT_SKILL_AGENT } from "../../routes/plugins-shared";
import { useIsMobile } from "../../lib/use-is-mobile";
import {
  useMcpMarketSearch,
  useMcpServers,
  useRemoveMcpServer,
  useSetMcpDisabled,
} from "../../hooks/mcp";
import {
  useCheckSkillUpdates,
  useInstalledSkills,
  useInstallSkill,
  useSetSkillDisabled,
  useSkillSearch,
  useUninstallSkill,
} from "../../hooks/skills";
import { ShellIcon } from "../shell/icons";
import { LucideIcon } from "../shell/lucide-icon";
import { LargeTitleRow, ListRowSkeleton } from "../shell/shell-primitives";
import { useCreateProjectDialog } from "../shell/project-setup";
import { useConfirm } from "../shell/confirm-dialog";
import { ActionMenu, useLongPressActions, useRowContextMenu } from "../ui/action-menu";
import type { ActionMenuItem } from "../ui/action-menu";
import { MobileAddMcpSheet, mcpTypeLabel } from "./mobile-plugins-detail";
import { InstallAuditSheet, McpInstallAuditSheet } from "./mobile-plugins-market";
import { MobileProjectSwitchSheet } from "./mobile-sheets";
import { pluginsMobileScopeAtom, ScopeSwitchPopover } from "./mobile-plugins-scope-popover";

/**
 * v2 09 插件 Tab 移动形态（L1 一级页，spec §3.5，v1.4 批6 重排）：大标题 → 搜索（已装本地过滤
 * + 市场远端搜索融合，编号①：未安装项以「市场 · 安装」行出现）→ 作用域分段（全局 / 本项目 ·
 * <名> ▾）→ 市场组顶部化（组头「市场」+「管理源 ›」→ quick chips：MCP 市场｜技能市场）→
 * MCP 服务器组 → 已安装技能组。
 *
 * 作用域规则（§3.5）：「本项目」= 全局记忆的当前项目（workbenchLastProjectAtom，与工作台标题 ▾
 * 同一份记忆）；▾ 分流收进 PluginsScopeSegmented 单源（文件末）：移动 = 03l 半屏 sheet
 *（MobileProjectSwitchSheet），桌面 = 09mb 锚定 Popover（ScopeSwitchPopover）；从未选项目时
 * 本项目段渲染空态引导（编号⑥）。
 *
 * 能力边界（§6.6 摊牌）：MCP 卡不画「● 已连接 / N 个工具」（McpServerEntry 无运行时状态与工具
 * 清单，后端不 connect），d2 画有据字段（传输类型 + 命令/URL）；技能「有更新」chip 只在手动
 * 「检查更新」出结果后出现（避 GitHub 限速）；组头「n 个更新 ›」= 状态指示（更新逐个确认收敛
 * 在详情页，无独立清单页）。
 *
 * 长按/右键卡（09b）：查看详情 / 停用（停止注入）/ 卸载…（红，确认后走服务端 rename/rm）；
 * 停用 = 批6 服务端语义（目录 rename 进停用区，防复活四点配套）。
 *
 * 深度页（M6-b 已落地）：技能卡 → /plugins/skill/$（12，global）/ /projects/$key/skill/$
 *（project，tab 带路径）；MCP 卡 → /plugins/mcp/$（13，仅 global——project scope MCP 无详情
 * 容器，记档）；MCP ＋ → 14 添加 sheet（scope 随段）；技能 ＋ 添加 → 技能市场（18）；
 * 管理源 › → /plugins/sources（15）。
 */
/**
 * 09 插件 Tab 搜索词。jotai 内存级：点卡 navigate 深度页 unmount 后返回读回（对标 scope atom）。
 */
const pluginsMobileQueryAtom = atom("");

export function MobilePluginsOverview({ hideTitle = false }: { hideTitle?: boolean }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [scope] = useAtom(pluginsMobileScopeAtom);
  const [query, setQuery] = useAtom(pluginsMobileQueryAtom);
  // 「本项目」段与工作台同源的上次项目记忆（写入点随 segc 抽取移入 PluginsScopeSegmented
  // 单源，§3.5 作用域规则）。
  const [lastProject] = useAtom(workbenchLastProjectAtom);
  const [addMcpOpen, setAddMcpOpen] = useState(false);

  const projectName = scope === "project" && lastProject ? lastProject : undefined;
  const mcpScope = projectName ? ("project" as const) : ("user" as const);
  const servers = useMcpServers(mcpScope, projectName);
  const installed = useInstalledSkills(DEFAULT_SKILL_AGENT, projectName);
  // 更新检测手动触发（全局 scope 才有；避 GitHub API 限速，与 ManageTab 同纪律）。
  const updates = useCheckSkillUpdates(DEFAULT_SKILL_AGENT);
  // 搜索融合（编号①）：query ≥2 字符并行搜市场（hooks 内部 enabled 门控），已装过滤后
  // 各组尾插「市场 · 安装」行（点击 → 审计 sheet 安装；scope 语义见 sheet 各自 JSDoc）。
  const skillSearch = useSkillSearch(query);
  const mcpSearch = useMcpMarketSearch(query);
  const install = useInstallSkill();
  const [skillPending, setSkillPending] = useState<SkillMarketEntry | null>(null);
  const [mcpPending, setMcpPending] = useState<McpMarketEntry | null>(null);
  const uninstall = useUninstallSkill(projectName);
  const setSkillDisabled = useSetSkillDisabled(projectName);
  const removeMcp = useRemoveMcpServer(mcpScope, projectName);
  const setMcpDisabled = useSetMcpDisabled(mcpScope, projectName);
  const { confirm, holder: confirmHolder } = useConfirm();
  const ctx = useRowContextMenu();
  const longPress = useLongPressActions(ctx.openAt);

  const q = query.trim().toLowerCase();
  const mcpList = (servers.data?.servers ?? []).filter(
    (s) => !q || s.name.toLowerCase().includes(q),
  );
  const skillList = (installed.data?.skills ?? []).filter(
    (s) => !q || s.name.toLowerCase().includes(q),
  );
  // 「有更新」集合：仅在手动检测出结果后出现（updates.data 为 undefined = 尚未检测）。
  const hasUpdateNames = new Set(
    (updates.data?.updates ?? []).filter((u) => u.hasUpdate).map((u) => u.name),
  );
  // 搜索融合去重：已装过滤后的市场命中（编号①），空查询时不显示（hooks 内 enabled 门控）。
  const installedNames = new Set((installed.data?.skills ?? []).map((s) => s.name));
  const installedMcpNames = new Set((servers.data?.servers ?? []).map((s) => s.name));
  const skillMarketHits = (skillSearch.data?.skills ?? []).filter(
    (e) => !installedNames.has(e.name),
  );
  const mcpMarketHits = (mcpSearch.data?.servers ?? []).filter(
    (e) => !installedMcpNames.has(e.name),
  );

  /** MCP 卡副行（有据字段）：传输类型 + 命令（含参数）/ URL。类型文案复用 detail 的单一实现。 */
  const describeMcpTarget = (s: McpServerEntry) => {
    if (s.type === "stdio") {
      const command = [s.command, ...(s.args ?? [])].filter(Boolean).join(" ");
      return `${mcpTypeLabel(s, t)} · ${command}`;
    }
    return `${mcpTypeLabel(s, t)} · ${s.url ?? ""}`;
  };

  /** 09b 长按/右键菜单（MCP 卡）：查看详情（仅 global，project 无详情容器）/ 停用（启用）/ 移除…
   *  icon 契约（批 14 统一样式）：原型 plugins-skill-menu.html 铁证——查看详情 doc.text /
   *  停用 pause / 启用 play / 卸载 trash，全行 17px。 */
  const mcpMenuItems = (s: McpServerEntry): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [];
    if (!projectName) {
      items.push({
        icon: <ShellIcon className="size-[17px]" name="doc-text" />,
        label: t("plugins.menuView"),
        onSelect: () => void navigate({ to: "/plugins/mcp/$", params: { _splat: s.name } }),
      });
    }
    items.push({
      icon: <ShellIcon className="size-[17px]" name={s.disabled ? "play" : "pause"} />,
      label: s.disabled ? t("plugins.menuEnable") : t("plugins.menuDisable"),
      onSelect: () => setMcpDisabled.mutate({ name: s.name, disabled: !s.disabled }),
    });
    items.push({
      icon: <ShellIcon className="size-[17px]" name="trash" />,
      label: t("mcp.remove"),
      onSelect: () => {
        void confirm({
          title: t("mcp.removeConfirmTitle"),
          message: t("mcp.removeConfirmBody"),
          confirmLabel: t("mcp.removeConfirmCta"),
          cancelLabel: t("cancel"),
          tone: "danger",
        }).then((ok) => {
          if (ok) removeMcp.mutate(s.name);
        });
      },
      variant: "destructive",
    });
    return items;
  };

  /** 09b 长按/右键菜单（技能卡）：查看详情 / 停用（启用）/ 卸载… */
  const skillMenuItems = (s: InstalledSkill): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [];
    items.push({
      icon: <ShellIcon className="size-[17px]" name="doc-text" />,
      label: t("plugins.menuView"),
      onSelect: () => {
        if (projectName) {
          void navigate({
            to: "/projects/$key/skill/$",
            params: { key: projectName, _splat: s.name },
          });
        } else {
          void navigate({ to: "/plugins/skill/$", params: { _splat: s.name } });
        }
      },
    });
    items.push({
      icon: <ShellIcon className="size-[17px]" name={s.disabled ? "play" : "pause"} />,
      label: s.disabled ? t("plugins.menuEnable") : t("plugins.menuDisable"),
      onSelect: () =>
        setSkillDisabled.mutate({
          name: s.name,
          agent: DEFAULT_SKILL_AGENT,
          disabled: !s.disabled,
        }),
    });
    items.push({
      icon: <ShellIcon className="size-[17px]" name="trash" />,
      label: t("skills.uninstall"),
      onSelect: () => {
        void confirm({
          title: t("skills.uninstallConfirmTitle"),
          message: t("skills.uninstallConfirmBody"),
          confirmLabel: t("skills.uninstall"),
          cancelLabel: t("cancel"),
          tone: "danger",
        }).then((ok) => {
          if (ok) uninstall.mutate({ name: s.name, agent: DEFAULT_SKILL_AGENT });
        });
      },
      variant: "destructive",
    });
    return items;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Large title 行（LargeTitleRow 单源）。hideTitle（桌面 mainPage 消费，§6.12j 批次 4）
          = 标题由 MainPageShell 17px h1 承担（09m .mhead 形态）。 */}
      {hideTitle ? null : <LargeTitleRow title={t("plugins.title")} />}

      {/* 搜索（原型 .search 在分段之上，编号①）：本地过滤已装 + 市场融合。.psearch 单源。
          margin-top 统一 10px（2026-09-29 真机反馈：三页原型页私值 8/12/10 各异致切换跳动，
          跨页一致优先统一 mt-2.5，与项目/全局文件页同值）。 */}
      <div className="psearch mx-4 mt-2.5 flex-none">
        <ShellIcon className="size-4 flex-none text-ink-2" name="magnifyingglass" />
        <input
          aria-label={t("plugins.searchPlaceholder")}
          className="w-full bg-transparent text-callout text-ink-1 outline-none placeholder:text-ink-2"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("plugins.searchPlaceholder")}
          type="search"
          value={query}
        />
      </div>

      {/* 作用域分段（.segc 单源 PluginsScopeSegmented，文件末）：全局 / 本项目 · <名> ▾
          （§3.5 编号②）。hideTitle（桌面 mainPage）不再渲染内联段——由 MainPageShell actions
          承载（限宽 290 对齐 09m seg4）；移动一级页满宽段（margin 由本处 utility 注入）。 */}
      {hideTitle ? null : <PluginsScopeSegmented className="mx-4 mt-3.5" />}

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        {scope === "project" && !lastProject ? (
          /* 空态引导（编号⑥）：从未选项目时本项目段为引导卡 */
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-subhead font-semibold text-ink-2">{t("plugins.pickProject")}</p>
            <p className="text-footnote text-ink-2">{t("plugins.pickProjectHint")}</p>
          </div>
        ) : (
          <>
            {/* 市场组顶部化（v1.4 批6，编号③）：组头「市场」+「管理源 ›」（仅全局，恒显——
                源维护唯一入口，检测状态挂技能组头不在此）→ quick chips（MCP 市场｜技能市场 →
                /plugins/market 带 tab；带袋形图标 + 无计数 = registry 无总量数据源 §6.12g）。
                原「检查更新」检测钮退役进 18 市场页（搜索融合后 home 不再承担检测入口）。 */}
            <div className="psect">
              <span>{t("plugins.market")}</span>
              {projectName ? null : (
                <button
                  className="r cursor-pointer"
                  onClick={() => void navigate({ to: "/plugins/sources" })}
                  type="button"
                >
                  {t("plugins.manageSources")}
                </button>
              )}
            </div>
            <div className="quick">
              <button
                className="q cursor-pointer"
                onClick={() =>
                  void navigate({ to: "/plugins/market", search: { marketTab: "mcp" } })
                }
                type="button"
              >
                <ShellIcon className="size-3.5" name="bag" />
                {t("plugins.mcpMarket")}
              </button>
              <button
                className="q cursor-pointer"
                onClick={() =>
                  void navigate({ to: "/plugins/market", search: { marketTab: "skill" } })
                }
                type="button"
              >
                <ShellIcon className="size-3.5" name="bag" />
                {t("plugins.skillMarket")}
              </button>
            </div>

            {/* MCP 服务器组（编号④；＋ 添加 = 14 添加 sheet，scope 随当前段；.r 文字钮 =
                原型 09 L72 组头形态，与技能组头同体系） */}
            <div className="psect">
              <span>{t("plugins.mcpGroup", { n: mcpList.length })}</span>
              <button
                className="r cursor-pointer"
                onClick={() => setAddMcpOpen(true)}
                type="button"
              >
                {t("plugins.add")}
              </button>
            </div>
            {servers.isPending ? (
              // 首载骨架（§6.12o）：仅 isPending 显，防 pending 闪「无 MCP」伪空态；
              // pcard（名 + 副行，无 marker/尾钮）→ marker=false + action="none"。
              <ListRowSkeleton action="none" count={2} marker={false} />
            ) : (
              <>
                {mcpList.map((s) =>
                  projectName ? (
                    /* project scope MCP 卡暂无详情容器（/plugins/mcp/$ 只承载 global），记档 M6-b。 */
                    <div className="pcard" key={s.name}>
                      <div className="r1">
                        {s.name}
                        {s.disabled ? (
                          <span className="upd">{t("plugins.disabledChip")}</span>
                        ) : null}
                      </div>
                      <div className="d2">{describeMcpTarget(s)}</div>
                    </div>
                  ) : (
                    /* 可点卡 = button：宽度由 .pcard 内 width:stretch 填满（勿加 w-full——100% 不扣
                       margin，叠 .pcard 横向 margin 即右侧溢出 32px，M10 第五轮用户真机复验）。 */
                    <div
                      className="pcard block cursor-pointer text-left"
                      key={s.name}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        // §4:portal fiber 冒泡守卫（frontend-notes §4）——菜单 sheet/popover
                        // dismiss click 冒泡到卡会误导航；contains 只接受卡内真实 click。
                        if (
                          e.target !== e.currentTarget &&
                          !e.currentTarget.contains(e.target as Node)
                        )
                          return;
                        if (longPress.guardClick()) return;
                        void navigate({ to: "/plugins/mcp/$", params: { _splat: s.name } });
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        void navigate({ to: "/plugins/mcp/$", params: { _splat: s.name } });
                      }}
                      onContextMenu={(e) => ctx.openAt(`mcp:${s.name}`, e)}
                      {...longPress.bind(`mcp:${s.name}`)}
                    >
                      <div className="r1">
                        {s.name}
                        {s.disabled ? (
                          <span className="upd off">{t("plugins.disabledChip")}</span>
                        ) : null}
                      </div>
                      <div className="d2">{describeMcpTarget(s)}</div>
                      <ActionMenu
                        items={mcpMenuItems(s)}
                        trigger={
                          <button
                            aria-hidden="true"
                            className="hidden"
                            tabIndex={-1}
                            type="button"
                          />
                        }
                        contextMenuPoint={ctx.pointFor(`mcp:${s.name}`)}
                        onContextMenuClose={ctx.close}
                      />
                    </div>
                  ),
                )}
                {mcpList.length === 0 ? (
                  <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("plugins.emptyMcp")}</p>
                ) : null}
                {!projectName && mcpMarketHits.length > 0
                  ? mcpMarketHits.map((e) => (
                      <button
                        className="mrow cursor-pointer"
                        key={`market:${e.name}`}
                        onClick={() => setMcpPending(e)}
                        type="button"
                      >
                        <span className="n">{e.name}</span>
                        <span className="c">{t("plugins.installFromMarket")}</span>
                        <span className="ar">›</span>
                      </button>
                    ))
                  : null}
              </>
            )}

            {/* 已安装技能组（v1.4 批6 组头：n 个更新 ›（有结果时，点击重检测）+「＋ 添加」→ 18；
                无更新时检测入口 = 「检查更新」钮（避 GitHub 限速手动触发纪律不变） */}
            <div className="psect">
              <span>{t("plugins.skillsGroup", { n: skillList.length })}</span>
              {projectName ? null : (
                <span className="ml-auto flex items-center gap-3">
                  {hasUpdateNames.size > 0 ? (
                    <button
                      className="r cursor-pointer"
                      disabled={updates.isFetching}
                      onClick={() => void updates.refetch()}
                      type="button"
                      style={{ color: "var(--c-warning-text)" }}
                    >
                      {updates.isFetching
                        ? t("skills.checking")
                        : t("plugins.updatesChip", { n: hasUpdateNames.size }) + " ›"}
                    </button>
                  ) : (
                    <button
                      className="r cursor-pointer"
                      disabled={updates.isFetching}
                      onClick={() => void updates.refetch()}
                      type="button"
                    >
                      {updates.isFetching ? t("skills.checking") : t("skills.checkUpdates")}
                    </button>
                  )}
                  <button
                    className="r cursor-pointer"
                    onClick={() =>
                      void navigate({ to: "/plugins/market", search: { marketTab: "skill" } })
                    }
                    type="button"
                  >
                    {t("plugins.add")}
                  </button>
                </span>
              )}
            </div>
            {installed.isPending ? (
              // 同上：仅 isPending 显骨架，防 pending 闪「暂无技能」伪空态。
              <ListRowSkeleton action="none" count={3} marker={false} />
            ) : (
              <>
                {skillList.map((s) => (
                  <div
                    className="pcard block cursor-pointer text-left"
                    key={s.name}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      // 技能卡点入详情：global → /plugins/skill/$（12）；project → 项目 tab 带路径
                      //（skill preview 随项目 scope 查，/plugins/skill/$ 只承载 global）。
                      if (
                        e.target !== e.currentTarget &&
                        !e.currentTarget.contains(e.target as Node)
                      )
                        return;
                      if (longPress.guardClick()) return;
                      if (projectName) {
                        void navigate({
                          to: "/projects/$key/skill/$",
                          params: { key: projectName, _splat: s.name },
                        });
                      } else {
                        void navigate({ to: "/plugins/skill/$", params: { _splat: s.name } });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      if (projectName) {
                        void navigate({
                          to: "/projects/$key/skill/$",
                          params: { key: projectName, _splat: s.name },
                        });
                      } else {
                        void navigate({ to: "/plugins/skill/$", params: { _splat: s.name } });
                      }
                    }}
                    onContextMenu={(e) => ctx.openAt(`skill:${s.name}`, e)}
                    {...longPress.bind(`skill:${s.name}`)}
                  >
                    <div className="r1">
                      {s.name}
                      {/* project 技能与全局同名撞名时 updates 缓存会误报——chip 收敛全局段。 */}
                      {!projectName && hasUpdateNames.has(s.name) ? (
                        <span className="upd">{t("skills.hasUpdate")}</span>
                      ) : null}
                      {s.disabled ? (
                        <span className="upd off">{t("plugins.disabledChip")}</span>
                      ) : null}
                      {/* 来源 chip（2026-10-04 用户拍板「右上角标注来源」）：skills 锁记录
                          slug，手写（无锁记录）= 本地；中性灰变体——元信息不与「有更新」
                          蓝 tint 抢注意力。副行 d2 回归纯描述：line-clamp 2 下长描述占满
                          副行会截掉「描述 · 来源」里的来源段，chip 位始终可见。 */}
                      <span className="upd off">
                        {s.source
                          ? t("plugins.skillSource", { source: s.source })
                          : t("plugins.skillLocal")}
                      </span>
                    </div>
                    {/* 副行 = 纯描述（frontmatter；来源已挪右上角 chip）。path 不上列表
                       （原型语义；长路径串换行即用户反馈的观感差异，字段保留给调试/深度页）。 */}
                    {s.description ? <div className="d2">{s.description}</div> : null}
                    <ActionMenu
                      items={skillMenuItems(s)}
                      trigger={
                        <button aria-hidden="true" className="hidden" tabIndex={-1} type="button" />
                      }
                      contextMenuPoint={ctx.pointFor(`skill:${s.name}`)}
                      onContextMenuClose={ctx.close}
                    />
                  </div>
                ))}
                {skillList.length === 0 ? (
                  <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("plugins.emptySkills")}</p>
                ) : null}
                {!projectName && skillMarketHits.length > 0
                  ? skillMarketHits.map((e) => (
                      <button
                        className="mrow cursor-pointer"
                        key={`market:${e.id}`}
                        onClick={() => setSkillPending(e)}
                        type="button"
                      >
                        <span className="n">{e.name}</span>
                        <span className="c">{t("plugins.installFromMarket")}</span>
                        <span className="ar">›</span>
                      </button>
                    ))
                  : null}
              </>
            )}
          </>
        )}
      </div>

      {/* 03l 切换器随 segc 抽取移入 PluginsScopeSegmented（sheet 仅移动形态挂载）。 */}
      <MobileAddMcpSheet
        onOpenChange={setAddMcpOpen}
        open={addMcpOpen}
        projectName={projectName}
        scope={mcpScope}
      />
      {/* 搜索融合安装（编号①）：pending 审计 sheet。技能装全局（sheet 固定），MCP 走 sheet 内
          stabseg 自管 scope。安装成功 invalidate 自动把命中项从「市场 · 安装」行转为已装卡。 */}
      {skillPending ? (
        <InstallAuditSheet
          entry={skillPending}
          error={install.error ? install.error.message : null}
          installing={install.isPending}
          onCancel={() => {
            install.reset();
            setSkillPending(null);
          }}
          onConfirm={async () => {
            if (!skillPending) return;
            try {
              await install.mutateAsync({
                source: skillPending.source,
                skillId: skillPending.skillId || skillPending.name,
                agent: DEFAULT_SKILL_AGENT,
              });
              setSkillPending(null);
            } catch {
              /* 失败保留 sheet 重试（error 行由 install.error 呈现） */
            }
          }}
        />
      ) : null}
      {mcpPending ? (
        <McpInstallAuditSheet entry={mcpPending} onCancel={() => setMcpPending(null)} />
      ) : null}
      {confirmHolder}
    </div>
  );
}

/** 作用域分段单源（.segc：全局 / 本项目 · <名> ▾）。移动一级页正文顶部满宽（margin 由
 *  消费方 utility 注入 mx-4 mt-3.5）；桌面 mainPage 标题行右端（actions 槽，限宽 290 对齐
 *  09m seg4）。▾ 分流（§3.5，多端同构容器分化）：移动 = 03l 半屏 sheet
 *（MobileProjectSwitchSheet projectOnly——插件语境无会话上下文，语义 = 切换项目，真机反馈
 *  2026-09-28）；桌面 = 09mb 锚定 Popover（ScopeSwitchPopover）。分流判定 = useIsMobile
 *（断点与 useIsDesktopViewport 同一 1024px 分界，消费语境互斥）。
 *
 * caret Lucide 化（批 13 反馈⑦）：`.caret` CSS 类已退役，span 语义外壳保留（▾ 只开切换器，
 * 不随段落点击切换作用域——stopPropagation），触区扩 = p-2 -m-2（原 .caret 精神），内文
 * LucideIcon size-3.5（显式尺寸防 WebKit flex 收缩隐形，frontend-notes §15⑤）。 */
export function PluginsScopeSegmented({ className }: { className?: string }) {
  const { t } = useT();
  const [scope, setScope] = useAtom(pluginsMobileScopeAtom);
  const [lastProject, setLastProject] = useAtom(workbenchLastProjectAtom);
  const [switchOpen, setSwitchOpen] = useState(false);
  const isMobile = useIsMobile();
  const createProjectDialog = useCreateProjectDialog();
  return (
    <>
      <div
        aria-label={t("plugins.scopeAria")}
        className={`segc${className ? ` ${className}` : ""}`}
        role="group"
      >
        <button
          aria-pressed={scope === "global"}
          className={`cursor-pointer${scope === "global" ? " on" : ""}`}
          onClick={() => setScope("global")}
          type="button"
        >
          {t("plugins.scopeGlobal")}
        </button>
        <button
          aria-pressed={scope === "project"}
          className={`cursor-pointer${scope === "project" ? " on" : ""}`}
          onClick={() => setScope("project")}
          type="button"
        >
          <span className="min-w-0 truncate">
            {lastProject
              ? t("plugins.scopeProject", { name: lastProject })
              : t("plugins.scopeProjectEmpty")}
          </span>
          {lastProject ? (
            isMobile ? (
              <span
                aria-label={t("plugins.switchProject")}
                className="-m-2 cursor-pointer p-2"
                onClick={(event) => {
                  // ▾ 只开切换器，不随段落点击切换作用域。
                  event.stopPropagation();
                  setSwitchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  setSwitchOpen(true);
                }}
                role="button"
                tabIndex={0}
              >
                <LucideIcon className="size-3.5" name="chevron-down" />
              </span>
            ) : (
              <ScopeSwitchPopover />
            )
          ) : null}
        </button>
      </div>
      {isMobile ? (
        <MobileProjectSwitchSheet
          onCreateProject={() => createProjectDialog.openCreate()}
          onOpenChange={setSwitchOpen}
          onSwitchProject={(name) => {
            setLastProject(name);
            setScope("project");
          }}
          open={switchOpen}
          projectOnly
        />
      ) : null}
    </>
  );
}
