import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { SkillMarketEntry } from "@agents-remote/shared";

import { useT } from "../../i18n";
import { DEFAULT_SKILL_AGENT } from "../../routes/PluginsRoute";
import {
  useAddSkillSource,
  useInstallSkill,
  useInstalledSkills,
  useRemoveSkillSource,
  useSkillSearch,
  useSkillSources,
} from "../../hooks/skills";
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
 * 18 技能市场移动页（v2 M6，spec §3.5 市场浏览）：nav（‹ 插件 / 标题 / ⚙→15）→ 来源 chips →
 * 搜索 → 市场卡（mono 名 + 来源章 + 安装量 + 安装钮）→ 进度 → 已安装态 → mfoot。
 *
 * 能力边界（§6.6 摊牌 + M6-a 记档）：原型 18 的 tabseg「MCP 服务器|技能」双段不画（17 MCP 市场
 * 无 registry 数据源不实现，只剩技能市场——单段无分段意义）；来源 chips 只画 skills.sh（「官方
 * 精选」策展清单与「我的源」市场搜索均无数据源）；卡副行只画安装量（skills.sh search 无简介
 * 字段）；安装进度无百分比数据（SkillTaskFrame 只有状态机），卡内进度条为 pulse 动画无 pct 文字。
 * 安装确认 M6-a 过渡复用 InstallConfirmDialog（v1 Dialog），M6-b 换 16 审计 sheet。
 */
export function MobileSkillMarket() {
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
    <div className="flex h-full min-h-0 flex-col">
      <PluginNav
        backLabel={t("plugins.title")}
        onBack={() => void navigate({ to: "/plugins" })}
        title={t("plugins.marketTitle")}
        trailing={
          <button
            aria-label={t("plugins.sourcesTitle")}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-1 transition hover:bg-on-surface/5 active:bg-on-surface/10"
            onClick={() => void navigate({ to: "/plugins/sources" })}
            type="button"
          >
            <ShellIcon className="size-[22px]" name="settings" />
          </button>
        }
      />

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
    </div>
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
