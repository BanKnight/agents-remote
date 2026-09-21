import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { atom } from "jotai";
import type { McpServerEntry } from "@agents-remote/shared";

import { useT } from "../../i18n";
import { workbenchLastProjectAtom } from "../../routes/workbench-model";
import { DEFAULT_SKILL_AGENT } from "../../routes/PluginsRoute";
import { useMcpServers } from "../../hooks/mcp";
import { useCheckSkillUpdates, useInstalledSkills } from "../../hooks/skills";
import { ShellIcon } from "../shell/icons";
import { useCreateProjectDialog } from "../shell/project-setup";
import { MobileAddMcpSheet, mcpTypeLabel } from "./mobile-plugins-detail";
import { MobileProjectSwitchSheet } from "./mobile-sheets";

/**
 * 09 插件 Tab 视图位置（作用域 + 搜索词）。jotai 内存级而非组件 useState：点技能卡 navigate
 * /plugins/skill/$ 开深度页时本组件 unmount，返回 /plugins 重 mount，atom 读回原位置
 *（对标 pluginsSectionAtom 的取舍：刷新回默认可接受）。
 */
const pluginsMobileScopeAtom = atom<"global" | "project">("global");
const pluginsMobileQueryAtom = atom("");

/**
 * v2 09 插件 Tab 移动形态（L1 一级页，spec §3.5）：大标题 → 作用域分段（全局 / 本项目 · <名> ▾）
 * → 搜索（本地过滤两组已装列表；市场远端搜索在 18 页内）→ MCP 服务器组 → 已安装技能组 → 市场段。
 *
 * 作用域规则（§3.5）：「本项目」= 全局记忆的当前项目（workbenchLastProjectAtom，与工作台标题 ▾
 * 同一份记忆）；段上 ▾ 打开 03l 切换器换项目（切换器内点会话行在插件页降级为只切项目——插件页
 * 无会话上下文，激活会话是工作台语义）；从未选项目时本项目段渲染空态引导（编号⑥）。
 *
 * 能力边界（§6.6 摊牌）：MCP 卡不画「● 已连接 / N 个工具」（McpServerEntry 无运行时状态与工具
 * 清单，后端不 connect），d2 画有据字段（传输类型 + 命令/URL）；技能「有更新」chip 只在手动
 * 「检查更新」出结果后出现（避 GitHub 限速）；市场段只有技能市场入口（17 MCP 市场无 registry
 * 数据源不实现）。
 *
 * 深度页（M6-b 已落地）：技能卡 → /plugins/skill/$（12，global）/ /projects/$key/skill/$
 *（project，tab 带路径）；MCP 卡 → /plugins/mcp/$（13，仅 global——project scope MCP 无详情
 * 容器，记档）；＋ → 14 添加 sheet（scope 随段）；管理源 › → /plugins/sources（15）；
 * 技能市场 → /plugins/market（18）。
 */
export function MobilePluginsOverview() {
  const { t } = useT();
  const navigate = useNavigate();
  const [scope, setScope] = useAtom(pluginsMobileScopeAtom);
  const [query, setQuery] = useAtom(pluginsMobileQueryAtom);
  // 「本项目」段与工作台同源的上次项目记忆；▾ 切换器写入同一 atom（§3.5 作用域规则）。
  const [lastProject, setLastProject] = useAtom(workbenchLastProjectAtom);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [addMcpOpen, setAddMcpOpen] = useState(false);
  const createProjectDialog = useCreateProjectDialog();

  const projectName = scope === "project" && lastProject ? lastProject : undefined;
  const mcpScope = projectName ? ("project" as const) : ("user" as const);
  const servers = useMcpServers(mcpScope, projectName);
  const installed = useInstalledSkills(DEFAULT_SKILL_AGENT, projectName);
  // 更新检测手动触发（全局 scope 才有；避 GitHub API 限速，与 ManageTab 同纪律）。
  const updates = useCheckSkillUpdates(DEFAULT_SKILL_AGENT);

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

  /** MCP 卡副行（有据字段）：传输类型 + 命令（含参数）/ URL。类型文案复用 detail 的单一实现。 */
  const describeMcpTarget = (s: McpServerEntry) => {
    if (s.type === "stdio") {
      const command = [s.command, ...(s.args ?? [])].filter(Boolean).join(" ");
      return `${mcpTypeLabel(s, t)} · ${command}`;
    }
    return `${mcpTypeLabel(s, t)} · ${s.url ?? ""}`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Large title 行（原型 .h-row h1 30px/800；插件 Tab 无右侧动作组） */}
      <div className="px-4 pt-1">
        <h1 className="text-large-title font-extrabold leading-tight text-ink-title">
          {t("plugins.title")}
        </h1>
      </div>

      {/* 作用域分段（.segc）：全局 / 本项目 · <名> ▾（§3.5 编号①②） */}
      <div aria-label={t("plugins.scopeAria")} className="segc" role="group">
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
            <span
              aria-label={t("plugins.switchProject")}
              className="caret cursor-pointer"
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
              ▾
            </span>
          ) : null}
        </button>
      </div>

      {/* 搜索（原型 .search）：本地过滤两组已装列表 */}
      <div className="mx-4 mt-3 flex h-[38px] flex-none items-center gap-2 rounded-lg bg-fill-search px-3">
        <ShellIcon className="size-4 flex-none text-ink-2" name="search" />
        <input
          aria-label={t("plugins.searchPlaceholder")}
          className="w-full bg-transparent text-callout text-ink-1 outline-none placeholder:text-ink-2"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("plugins.searchPlaceholder")}
          type="search"
          value={query}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        {scope === "project" && !lastProject ? (
          /* 空态引导（编号⑥）：从未选项目时本项目段为引导卡 */
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-subhead font-semibold text-ink-2">{t("plugins.pickProject")}</p>
            <p className="text-footnote text-ink-2">{t("plugins.pickProjectHint")}</p>
          </div>
        ) : (
          <>
            {/* MCP 服务器组（编号④；＋ = 14 添加 sheet，scope 随当前段） */}
            <div className="psect">
              <span>{t("plugins.mcpGroup", { n: mcpList.length })}</span>
              <button
                aria-label={t("mcp.add")}
                className="r cursor-pointer"
                onClick={() => setAddMcpOpen(true)}
                type="button"
              >
                ＋
              </button>
            </div>
            {mcpList.map((s) =>
              projectName ? (
                /* project scope MCP 卡暂无详情容器（/plugins/mcp/$ 只承载 global），记档 M6-b。 */
                <div className="pcard" key={s.name}>
                  <div className="r1">{s.name}</div>
                  <div className="d2">{describeMcpTarget(s)}</div>
                </div>
              ) : (
                <button
                  className="pcard block w-full cursor-pointer text-left"
                  key={s.name}
                  onClick={() => {
                    void navigate({ to: "/plugins/mcp/$", params: { _splat: s.name } });
                  }}
                  type="button"
                >
                  <div className="r1">{s.name}</div>
                  <div className="d2">{describeMcpTarget(s)}</div>
                </button>
              ),
            )}
            {mcpList.length === 0 ? (
              <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("plugins.emptyMcp")}</p>
            ) : null}

            {/* 已安装技能组（编号③：有更新 chip；.r = 手动检查更新，仅全局 scope） */}
            <div className="psect">
              <span>{t("plugins.skillsGroup", { n: skillList.length })}</span>
              {projectName ? null : (
                <button
                  className="r cursor-pointer"
                  disabled={updates.isFetching}
                  onClick={() => void updates.refetch()}
                  type="button"
                >
                  {updates.isFetching ? t("skills.checking") : t("skills.checkUpdates")}
                </button>
              )}
            </div>
            {skillList.map((s) => (
              <button
                className="pcard block w-full cursor-pointer text-left"
                key={s.name}
                onClick={() => {
                  // 技能卡点入详情（编号③）：global → /plugins/skill/$（12）；project → 项目
                  // tab 带路径（skill preview 随项目 scope 查，/plugins/skill/$ 只承载 global）。
                  if (projectName) {
                    void navigate({
                      to: "/projects/$key/skill/$",
                      params: { key: projectName, _splat: s.name },
                    });
                  } else {
                    void navigate({ to: "/plugins/skill/$", params: { _splat: s.name } });
                  }
                }}
                type="button"
              >
                <div className="r1">
                  {s.name}
                  {/* project 技能与全局同名撞名时 updates 缓存会误报——chip 收敛全局段。 */}
                  {!projectName && hasUpdateNames.has(s.name) ? (
                    <span className="upd">{t("skills.hasUpdate")}</span>
                  ) : null}
                </div>
                <div className="d2">{s.path}</div>
              </button>
            ))}
            {skillList.length === 0 ? (
              <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("plugins.emptySkills")}</p>
            ) : null}

            {/* 市场段（编号⑤）：MCP 市场行不画（§6.6：无 registry 数据源）；管理源仅全局 scope */}
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
            <button
              className="mrow cursor-pointer"
              onClick={() => void navigate({ to: "/plugins/market" })}
              type="button"
            >
              <span className="n">{t("plugins.skillMarket")}</span>
              <span className="ar">›</span>
            </button>
          </>
        )}
      </div>

      {/* 03l 切换器（段上 ▾）：换项目写同一份 workbench 记忆（§3.5 作用域规则）。
          点会话行在插件页降级为只切项目（无会话上下文，激活会话是工作台语义）。 */}
      <MobileAddMcpSheet
        onOpenChange={setAddMcpOpen}
        open={addMcpOpen}
        projectName={projectName}
        scope={mcpScope}
      />
      <MobileProjectSwitchSheet
        onCreateProject={() => createProjectDialog.openCreate()}
        onOpenChange={setSwitchOpen}
        onSwitchProject={(name) => {
          setLastProject(name);
          setScope("project");
        }}
        onSwitchSession={(name) => {
          setLastProject(name);
          setScope("project");
        }}
        open={switchOpen}
      />
      {createProjectDialog.dialog}
    </div>
  );
}
