import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAtom } from "jotai";
import type { McpMarketEntry, SkillMarketEntry } from "@agents-remote/shared";
import { mcpMarketEntryToInstallRequest } from "@agents-remote/shared";

import { useT } from "../../i18n";
import { DEFAULT_SKILL_AGENT } from "../../routes/PluginsRoute";
import { workbenchLastProjectAtom } from "../../routes/workbench-model";
import {
  useAddSkillSource,
  useInstallSkill,
  useInstalledSkills,
  useRemoveSkillSource,
  useSkillSearch,
  useSkillSources,
} from "../../hooks/skills";
import { useAddMcpServer, useMcpMarketSearch, useMcpServers } from "../../hooks/mcp";
import { ShellIcon } from "../shell/icons";
import { MobileSheet } from "../shell/mobile-sheet";

/**
 * M6 插件深度页共用的 nav header(原型 .nav:.back 返回 + 17px/600 标题 + 右侧动作)。
 * 顶部 safe-area 由 workbench layout 移动外壳(pt-[var(--shell-safe-area-top)])承担,nav 自身
 * 只占 44px 内容行——原型 .nav 的 52px padding-top 是 stage 状态栏区(app 外壳对应物)。
 *
 * `.back` 设计语言(与 mobile-project-header 同款):主色 15px + ::before chevron + 可见
 * backLabel 文字(原型 12/13/15/18 的返回键均带 label,非裸箭头图标钮)。
 *
 * `mono`(12/13 详情页):标题是技术名(skill/server name),原型 12/13 nav h1 = mono 15px;
 * 市场页(18/15)保持 17px/600 常规标题。
 */
export function PluginNav({
  backLabel,
  mono,
  title,
  onBack,
  trailing,
}: {
  backLabel: string;
  mono?: boolean;
  title: string;
  onBack: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 px-3">
      <button className="back cursor-pointer touch:px-2 touch:py-2" onClick={onBack} type="button">
        {backLabel}
      </button>
      <h1
        className={`min-w-0 flex-1 truncate font-semibold text-ink-1 ${
          mono ? "font-mono text-[15px]" : "text-[17px]"
        }`}
      >
        {title}
      </h1>
      {trailing}
    </header>
  );
}

/**
 * 17/18 市场移动页（v2 M6-c，spec §3.5 市场浏览）：单页双段 tabseg「MCP 服务器｜技能」
 *（原型 17:60 / 18:60 同页结构，mfoot「技能市场在同页『技能』tab」），初始段走 URL
 * ?marketTab=mcp|skill（validateWorkbenchSearch 白名单；缺省 skill），09 市场段两条 mrow
 * 分别落对应段。
 *
 * 能力边界（§6.6 摊牌 + §6.12g 记档）：来源 chips——技能段只画 skills.sh（「官方精选」策展
 * 清单与「我的源」均无数据源）、MCP 段只画官方 Registry 单源（15 页无 MCP 源可管，无管理源
 * 入口）；17 卡的「✓ 认证」徽标、工具数、安装量、进度百分比均无 registry 字段，不画——安装
 * 是同步 POST（/api/mcp/add 无 task 流），卡内降级为「添加中…」disabled 钮；卡副行画
 * description · v{version}（有据字段）。
 */
export function MobileMarket() {
  const { t } = useT();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const marketTab = search.marketTab === "mcp" ? "mcp" : "skill";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PluginNav
        backLabel={t("plugins.title")}
        onBack={() => void navigate({ to: "/plugins" })}
        title={marketTab === "mcp" ? t("plugins.mcpMarketTitle") : t("plugins.marketTitle")}
        trailing={
          marketTab === "skill" ? (
            <button
              aria-label={t("plugins.sourcesTitle")}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-1 transition hover:bg-on-surface/5 active:bg-on-surface/10"
              onClick={() => void navigate({ to: "/plugins/sources" })}
              type="button"
            >
              <ShellIcon className="size-[22px]" name="settings" />
            </button>
          ) : undefined
        }
      />

      {/* 双段切换（原型 .tabseg；navigate 整体替换 search——该路由无其他 search 维度） */}
      <div className="tabseg" role="tablist">
        <button
          aria-selected={marketTab === "mcp"}
          className={`cursor-pointer${marketTab === "mcp" ? " on" : ""}`}
          onClick={() => void navigate({ to: "/plugins/market", search: { marketTab: "mcp" } })}
          role="tab"
          type="button"
        >
          {t("plugins.marketTabMcp")}
        </button>
        <button
          aria-selected={marketTab === "skill"}
          className={`cursor-pointer${marketTab === "skill" ? " on" : ""}`}
          onClick={() => void navigate({ to: "/plugins/market", search: { marketTab: "skill" } })}
          role="tab"
          type="button"
        >
          {t("plugins.marketTabSkill")}
        </button>
      </div>

      {marketTab === "mcp" ? <McpMarketTab /> : <SkillMarketTab />}
    </div>
  );
}

/**
 * 18 技能市场段（v2 M6-a 主体下沉，结构不变）：来源 chips → 搜索 → 市场卡（mono 名 + 来源章 +
 * 安装量 + 安装钮）→ 审计 sheet。能力边界沿 M6-a 记档：卡副行只画安装量（skills.sh search 无
 * 简介字段）；安装进度无百分比数据（SkillTaskFrame 只有状态机），pulse 动画无 pct 文字。
 */
function SkillMarketTab() {
  const { t } = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const search = useSkillSearch(query);
  const install = useInstallSkill();
  const installed = useInstalledSkills(DEFAULT_SKILL_AGENT);
  const [pending, setPending] = useState<SkillMarketEntry | null>(null);
  // 当前安装中的条目 id（install.isPending 是共享态，逐卡比对才渲染单卡进度）。
  const [installingId, setInstallingId] = useState<string | null>(null);

  const trimmed = query.trim();
  const skills = search.data?.skills ?? [];
  const installedNames = new Set((installed.data?.skills ?? []).map((s) => s.name));
  const showHint = trimmed.length < 2;

  return (
    <>
      {/* 来源 chips（§6.6：只画有据源 skills.sh；恒 on——单源无切换语义）+ 管理源入口 */}
      <div className="mchips">
        <span className="chip2 on">{t("plugins.officialTag")} skills.sh</span>
        <button
          className="mg cursor-pointer"
          onClick={() => void navigate({ to: "/plugins/sources" })}
          type="button"
        >
          {t("plugins.manageSources")}
        </button>
      </div>

      {/* 搜索（原型 .msearch） */}
      <div className="msearch">
        <ShellIcon className="size-4 flex-none" name="magnifyingglass" />
        <input
          aria-label={t("skills.searchPlaceholder")}
          className="w-full bg-transparent text-callout text-ink-1 outline-none placeholder:text-ink-2"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("skills.searchPlaceholder")}
          type="search"
          value={query}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        {showHint ? (
          <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("plugins.emptyMarket")}</p>
        ) : search.isLoading ? (
          <p className="px-4 py-2 text-[11.5px] text-ink-2">…</p>
        ) : skills.length === 0 ? (
          <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("skills.empty")}</p>
        ) : (
          skills.map((e) => {
            const isInstalled = installedNames.has(e.name);
            const isInstalling = install.isPending && installingId === e.id;
            return (
              <div className="mcard" key={e.id}>
                <div className="r1">
                  {e.name}
                  <span className="src">{e.source}</span>
                </div>
                <div className="d2">{t("skills.installs", { n: e.installs })}</div>
                {isInstalled ? (
                  <div className="r3">
                    <span className="installed">✓ {t("skills.installedChip")}</span>
                  </div>
                ) : isInstalling ? (
                  <>
                    <div className="prog">
                      <i className="w-[42%] animate-pulse" />
                    </div>
                    <div className="pct">{t("skills.installing")}</div>
                  </>
                ) : (
                  <div className="r3">
                    <button
                      className="btn2 cursor-pointer"
                      disabled={install.isPending}
                      onClick={() => setPending(e)}
                      type="button"
                    >
                      {t("skills.install")}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        {/* mfoot（原型）：来源与类型绑定说明 */}
        <p className="mfoot">{t("plugins.marketFoot")}</p>
      </div>

      {pending ? (
        <InstallAuditSheet
          entry={pending}
          error={install.error ? install.error.message : null}
          installing={install.isPending}
          onCancel={() => {
            install.reset();
            setInstallingId(null);
            setPending(null);
          }}
          onConfirm={async () => {
            setInstallingId(pending.id);
            try {
              await install.mutateAsync({
                source: pending.source,
                skillId: pending.skillId || pending.name,
                agent: DEFAULT_SKILL_AGENT,
              });
              setPending(null);
            } catch {
              // 失败保留 sheet（error 文案显示），用户可取消或重试。
            }
          }}
        />
      ) : null}
    </>
  );
}

/**
 * 17 MCP 市场段（v2 M6-c 新增，数据源 = registry.modelcontextprotocol.io 官方 Registry）：
 * 单源 chip → 搜索 → 市场卡（mono 名 + 来源章 + description · v{version} + 三态）→ 安装审计
 * sheet（必填变量输入 + 作用域 + 走既有 /api/mcp/add）。
 *
 * 能力边界（§6.12g 记档）：「✓ 认证」徽标、工具数、安装量无 registry 字段不画；安装为同步
 * POST（无 task 流），卡内三态 = ✓ 已安装（user scope 名单匹配）/「添加中…」disabled / 安装钮；
 * registry 不可达 → 错误行（页面不崩，可切回技能段）；不可一键安装条目（remote 与 npm 包均无）
 * disabled 钮 + 手动配置说明。已装判定只比 user scope（project scope 跨 scope 同名合法共存）。
 */
function McpMarketTab() {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const search = useMcpMarketSearch(query);
  const installed = useMcpServers("user");
  const [pending, setPending] = useState<McpMarketEntry | null>(null);

  const trimmed = query.trim();
  const servers = search.data?.servers ?? [];
  const installedNames = new Set((installed.data?.servers ?? []).map((s) => s.name));
  const showHint = trimmed.length < 2;

  return (
    <>
      {/* 单源恒 on（官方 Registry；无切换语义，15 页无 MCP 源可管 → 无管理源入口） */}
      <div className="mchips">
        <span className="chip2 on">{t("plugins.officialRegistry")}</span>
      </div>

      <div className="msearch">
        <ShellIcon className="size-4 flex-none" name="magnifyingglass" />
        <input
          aria-label={t("plugins.mcpSearchPlaceholder")}
          className="w-full bg-transparent text-callout text-ink-1 outline-none placeholder:text-ink-2"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("plugins.mcpSearchPlaceholder")}
          type="search"
          value={query}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        {showHint ? (
          <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("plugins.emptyMarket")}</p>
        ) : search.isLoading ? (
          <p className="px-4 py-2 text-[11.5px] text-ink-2">…</p>
        ) : search.error ? (
          <p className="px-4 py-2 text-[11.5px] text-error">{search.error.message}</p>
        ) : servers.length === 0 ? (
          <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("skills.empty")}</p>
        ) : (
          servers.map((e) => {
            const isInstalled = installedNames.has(e.name);
            const installable = e.remote !== null || e.package !== null;
            return (
              <div className="mcard" key={e.registryName}>
                <div className="r1">
                  {e.name}
                  {e.repositorySource ? <span className="src">{e.repositorySource}</span> : null}
                </div>
                {e.description || e.version ? (
                  <div className="d2">
                    {[e.description, e.version ? `v${e.version}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                ) : null}
                {isInstalled ? (
                  <div className="r3">
                    <span className="installed">✓ {t("skills.installedChip")}</span>
                  </div>
                ) : (
                  <div className="r3">
                    <button
                      className="btn2 cursor-pointer disabled:opacity-45"
                      disabled={!installable}
                      onClick={() => setPending(e)}
                      type="button"
                    >
                      {t("skills.install")}
                    </button>
                  </div>
                )}
                {!isInstalled && !installable ? (
                  <div className="d2">{t("plugins.mcpManualConfigNote")}</div>
                ) : null}
              </div>
            );
          })
        )}
        <p className="mfoot">{t("plugins.marketFoot")}</p>
      </div>

      {pending ? <McpInstallAuditSheet entry={pending} onCancel={() => setPending(null)} /> : null}
    </>
  );
}

/**
 * 17→16 同款安装审计 sheet（MCP 版）：条目行（mono 名 + v 章）→ 目标只读行（remote 传输+URL /
 * npm 包 npx 命令）→ 作用域 stabseg（全局｜本项目=workbenchLastProjectAtom；无记忆项目时
 * 本项目段 disabled）→ registry 必填 env/headers 输入行（isSecret → password；无必填项整段
 * 不渲染 = 一键提交）→ error 行 → kbtns → 信任 snote。
 *
 * 提交 = shared mcpMarketEntryToInstallRequest 翻译（remote 优先 / npm→npx -y；只并入实填键）
 * 走既有 useAddMcpServer；成功关 sheet（invalidate 自动转 ✓ 已安装），失败保留 sheet 重试。
 * 作用域切换在 pending 中禁用（mutation 实例随 scope 参数重建，防 mid-flight 错位）。
 */
function McpInstallAuditSheet({
  entry,
  onCancel,
}: {
  entry: McpMarketEntry;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [lastProject] = useAtom(workbenchLastProjectAtom);
  const [scope, setScope] = useState<"user" | "project">("user");
  const projectName = scope === "project" ? lastProject || undefined : undefined;
  const add = useAddMcpServer(scope, projectName);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});

  const requiredEnv = entry.package?.requiredEnv ?? [];
  const requiredHeaders = entry.remote?.requiredHeaders ?? [];
  // 必填完整性：registry 标 required 的变量全部非空才可提交（isSecret 值不回显、不落日志）。
  const complete =
    requiredEnv.every((v) => (envValues[v.name] ?? "").trim().length > 0) &&
    requiredHeaders.every((h) => (headerValues[h.name] ?? "").trim().length > 0);

  const request = mcpMarketEntryToInstallRequest(entry, {
    env: Object.fromEntries(Object.entries(envValues).filter(([, v]) => v.trim().length > 0)),
    headers: Object.fromEntries(
      Object.entries(headerValues).filter(([, v]) => v.trim().length > 0),
    ),
  });

  const close = () => {
    add.reset();
    onCancel();
  };

  return (
    <MobileSheet
      onOpenChange={(next) => {
        // busy 守卫：pending 中禁关（scrim/Esc），防迟到 settle 的 error 残留到下次打开。
        if (!next && !add.isPending) close();
      }}
      open
      title={t("skills.auditTitle")}
    >
      <div className="pb-2">
        <div className="flex items-center gap-2 pt-2">
          <span className="truncate font-mono text-[15px] font-bold text-ink-1">{entry.name}</span>
          {entry.version ? (
            <span className="shrink-0 rounded-full bg-elevated2 px-2.5 py-0.5 text-[10.5px] font-semibold text-ink-2">
              v{entry.version}
            </span>
          ) : null}
        </div>

        {/* 目标只读行（有据字段：remote 传输/URL 或 npm 包命令） */}
        {entry.remote ? (
          <>
            <div className="skrow">
              <span>{t("mcp.type")}</span>
              <span className="v">{entry.remote.transport}</span>
            </div>
            <div className="skrow">
              <span>{t("mcp.url")}</span>
              <span className="v">{entry.remote.url}</span>
            </div>
          </>
        ) : entry.package ? (
          <div className="skrow">
            <span>{t("mcp.command")}</span>
            <span className="v">npx -y {entry.package.identifier}</span>
          </div>
        ) : null}

        <div className="klabel">{t("plugins.scopeField")}</div>
        <div className="stabseg">
          <button
            className={`cursor-pointer${scope === "user" ? " on" : ""}`}
            disabled={add.isPending}
            onClick={() => setScope("user")}
            type="button"
          >
            {t("mcp.scopeGlobalValue")}
          </button>
          <button
            className={`cursor-pointer${scope === "project" ? " on" : ""}`}
            disabled={add.isPending || !lastProject}
            onClick={() => setScope("project")}
            type="button"
          >
            {lastProject
              ? t("mcp.scopeProjectValue", { name: lastProject })
              : t("mcp.scopeProjectValue", { name: "—" })}
          </button>
        </div>

        {requiredEnv.map((v) => (
          <div key={`env-${v.name}`}>
            <div className="klabel">{t("mcp.marketEnvField", { name: v.name })}</div>
            <input
              aria-label={t("mcp.marketEnvField", { name: v.name })}
              autoComplete="off"
              className="kfield mono cursor-text"
              onChange={(event) =>
                setEnvValues((prev) => ({ ...prev, [v.name]: event.target.value }))
              }
              type={v.isSecret ? "password" : "text"}
              value={envValues[v.name] ?? ""}
            />
          </div>
        ))}
        {requiredHeaders.map((h) => (
          <div key={`header-${h.name}`}>
            <div className="klabel">{t("mcp.marketHeaderField", { name: h.name })}</div>
            <input
              aria-label={t("mcp.marketHeaderField", { name: h.name })}
              autoComplete="off"
              className="kfield mono cursor-text"
              onChange={(event) =>
                setHeaderValues((prev) => ({ ...prev, [h.name]: event.target.value }))
              }
              type={h.isSecret ? "password" : "text"}
              value={headerValues[h.name] ?? ""}
            />
          </div>
        ))}

        {add.error ? (
          <p className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {add.error.message}
          </p>
        ) : null}
        <div className="kbtns">
          <button
            className="c cursor-pointer"
            disabled={add.isPending}
            onClick={close}
            type="button"
          >
            {t("cancel")}
          </button>
          <button
            className="p solid cursor-pointer"
            disabled={add.isPending || !request || !complete}
            onClick={() => {
              if (!request) return;
              void add
                .mutateAsync(request)
                .then(() => close())
                .catch(() => {
                  // 失败保留 sheet（error 文案显示），用户可修正后重试。
                });
            }}
            type="button"
          >
            {add.isPending ? t("mcp.adding") : `${t("mcp.add")} ›`}
          </button>
        </div>
        <div className="snote">{t("mcp.addConfirmBody")}</div>
      </div>
    </MobileSheet>
  );
}

/**
 * 15 市场源管理移动页（v2 M6，§3.5）：hint + 官方精选卡（内置）+ skills.sh 卡（官方）+ 自定义
 * 源卡（可移除）+ 添加源。
 *
 * 能力边界（§6.6 摊牌 + M6-a 记档）：源开关 toggle 无数据源（SkillSource 无 enabled 字段，只有
 * add/remove）不画；「上次同步 N 分钟前」无数据源不画；MCP Registry 卡不画（MCP 市场不实现）；
 * 「纯内网部署」offcard 语义依赖源开关，随 toggle 一并不画（自定义源删除后即达同等效果）。
 * 自定义源的移除在卡内以 danger 文字钮呈现（原型 15 无移除操作，但 removeSource 能力存在，
 * 需要出口——记档待 reviewer 裁决）。
 */
export function MobileMarketSources() {
  const { t } = useT();
  const navigate = useNavigate();
  const sources = useSkillSources();
  const addSource = useAddSkillSource();
  const removeSource = useRemoveSkillSource();
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const list = sources.data?.sources ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PluginNav
        backLabel={t("plugins.title")}
        onBack={() => void navigate({ to: "/plugins" })}
        title={t("plugins.sourcesTitle")}
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        <p className="hint">{t("plugins.sourcesHint")}</p>

        {/* 官方精选（内置，静态卡） */}
        <div className="scard">
          <div className="r1">
            {t("plugins.officialCurated")}
            <span className="tag builtin">{t("plugins.builtinTag")}</span>
          </div>
          <div className="d">{t("plugins.curatedDesc")}</div>
        </div>

        {/* skills.sh（官方源，静态卡） */}
        <div className="scard">
          <div className="r1">
            skills.sh
            <span className="tag official">{t("plugins.officialTag")}</span>
          </div>
          <div className="url">skills.sh/registry</div>
          <div className="d">{t("plugins.skillsShDesc")}</div>
        </div>

        {/* 自定义源（removeSource 有真实能力，卡内 danger 钮为出口；失败 error 行渲染） */}
        {list.map((source) => (
          <div className="scard" key={source.id}>
            <div className="r1">
              {source.label || source.repo || source.path || source.id}
              <span className="tag builtin">{t("plugins.customSourceTag")}</span>
              <button
                className="ml-auto cursor-pointer text-[11px] font-semibold text-error"
                disabled={removeSource.isPending}
                onClick={() => removeSource.mutate(source.id)}
                type="button"
              >
                {t("skills.removeSource")}
              </button>
            </div>
            {source.repo || source.path ? (
              <div className="url">{source.repo ?? source.path}</div>
            ) : null}
          </div>
        ))}
        {removeSource.error ? (
          <p className="mx-4 mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {removeSource.error.message}
          </p>
        ) : null}

        {/* 添加自定义源：addsrc 点击展开表单（repo/branch/label，同 SourcesTab 字段） */}
        {adding ? (
          <div className="mx-4 mt-3 space-y-2 rounded-xl border border-sep bg-elevated p-3">
            <input
              aria-label={t("skills.repo")}
              className="h-10 w-full rounded-lg border border-sep bg-elevated2 px-3 text-sm text-ink-1 outline-none placeholder:text-ink-2 focus:border-primary"
              onChange={(e) => setRepo(e.target.value)}
              placeholder={t("skills.repo")}
              value={repo}
            />
            <input
              aria-label={t("skills.branch")}
              className="h-10 w-full rounded-lg border border-sep bg-elevated2 px-3 text-sm text-ink-1 outline-none placeholder:text-ink-2 focus:border-primary"
              onChange={(e) => setBranch(e.target.value)}
              placeholder={t("skills.branch")}
              value={branch}
            />
            <input
              aria-label={t("skills.labelField")}
              className="h-10 w-full rounded-lg border border-sep bg-elevated2 px-3 text-sm text-ink-1 outline-none placeholder:text-ink-2 focus:border-primary"
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("skills.labelField")}
              value={label}
            />
            <div className="flex justify-end gap-2">
              <button
                className="h-9 cursor-pointer rounded-full px-4 text-sm text-ink-2"
                onClick={() => {
                  setAdding(false);
                  setRepo("");
                  setBranch("");
                  setLabel("");
                }}
                type="button"
              >
                {t("cancel")}
              </button>
              <button
                className="h-9 cursor-pointer rounded-full bg-primary/15 px-4 text-sm font-semibold text-primary disabled:opacity-45"
                disabled={!repo.trim() || addSource.isPending}
                onClick={() => {
                  // 成功才清字段关表单；失败保留表单显示 error（reviewer P2：失败静默 + unhandled rejection）。
                  void addSource
                    .mutateAsync({
                      repo: repo.trim(),
                      branch: branch.trim() || undefined,
                      label: label.trim() || undefined,
                    })
                    .then(() => {
                      setRepo("");
                      setBranch("");
                      setLabel("");
                      setAdding(false);
                    })
                    .catch(() => {
                      // 失败保留表单，addSource.error 文案显示，可修正后重试。
                    });
                }}
                type="button"
              >
                {addSource.isPending ? t("skills.adding") : t("skills.addSource")}
              </button>
            </div>
            {addSource.error ? (
              <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
                {addSource.error.message}
              </p>
            ) : null}
          </div>
        ) : (
          <button className="addsrc" onClick={() => setAdding(true)} type="button">
            {t("plugins.addCustomSource")}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 16 安装前审计 sheet（v2 M6，市场「安装」→ 审计确认）：标题 + 条目行（name + 来源章 + 来源）+
 * 作用域 + 确认钮（.p.solid 实底）+ 信任说明 snote。
 *
 * 能力边界（§6.6 摊牌）：原型 16 的 sha256 校验行、权限声明 perm（manifest 负声明）、注入工具
 * tools 预览均无数据源（SkillMarketEntry 只有 id/name/installs/source；安装前无 manifest 拉取
 * 面）——只画有据字段。作用域恒全局（useInstallSkill 移动市场装全局 agent），只读行。
 * 信任警告 = snote（对称桌面 InstallConfirmDialog 的 installConfirmBody 文案）。
 */
export function InstallAuditSheet({
  entry,
  error,
  installing,
  onCancel,
  onConfirm,
}: {
  entry: SkillMarketEntry;
  error: string | null;
  installing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  return (
    <MobileSheet
      onOpenChange={(open) => {
        if (!open && !installing) onCancel();
      }}
      open
      title={t("skills.auditTitle")}
    >
      <div className="pb-2">
        <div className="flex items-center gap-2 pt-2">
          <span className="truncate font-mono text-[15px] font-bold text-ink-1">{entry.name}</span>
          <span className="shrink-0 rounded-full bg-elevated2 px-2.5 py-0.5 text-[10.5px] font-semibold text-ink-2">
            {entry.source}
          </span>
        </div>
        <div className="mt-1.5 text-[11px] text-ink-2">
          {t("skills.installs", { n: entry.installs })}
        </div>
        <div className="skrow">
          <span>{t("plugins.scopeField")}</span>
          <span className="v">{t("plugins.scopeGlobal")}</span>
        </div>
        {error ? (
          <p className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">{error}</p>
        ) : null}
        <div className="kbtns">
          <button
            className="c cursor-pointer"
            disabled={installing}
            onClick={onCancel}
            type="button"
          >
            {t("cancel")}
          </button>
          <button
            className="p solid cursor-pointer"
            disabled={installing}
            onClick={onConfirm}
            type="button"
          >
            {installing ? t("skills.installing") : t("skills.installConfirmCta")}
          </button>
        </div>
        <div className="snote">{t("skills.installConfirmBody")}</div>
      </div>
    </MobileSheet>
  );
}
