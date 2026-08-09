import { type ComponentProps, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { atom, useAtom } from "jotai";
import type {
  AddMcpServerRequest,
  McpScope,
  McpServerEntry,
  McpServerType,
  SkillAgent,
  SkillMarketEntry,
} from "@agents-remote/shared";

import { useT } from "../i18n";
import { MarkdownString } from "../components/markdown/MarkdownString";
import {
  ActionButton,
  ListGroup,
  ListRow,
  ListRowSkeleton,
  MobilePageHeader,
  SegmentedControl,
  ShellInput,
} from "../components/shell/shell-primitives";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { DraggableListRow, type CardDragStartHandler } from "../components/workbench/drag-source";
import { TabButton } from "../components/workbench/right-panel-tabs";
import {
  useAddMcpServer,
  useMcpServers,
  useRemoveMcpServer,
  useUpdateMcpServer,
} from "../hooks/mcp";
import {
  useAddSkillSource,
  useCheckSkillUpdates,
  useInstallSkill,
  useInstalledSkills,
  useRemoveSkillSource,
  useSkillPreview,
  useSkillSearch,
  useSkillSources,
  useUninstallSkill,
  useUpdateSkill,
} from "../hooks/skills";

/**
 * 默认 skill agent（ManageTab / SkillTabPreview 共用）。当前固定 claude-code——PluginsPanel 单
 * agent，tabId 不编码 agent（`skill_${name}` 足够去重）；未来支持 codex 同名 skill 再扩展。
 */
export const DEFAULT_SKILL_AGENT: SkillAgent = "claude-code";

/** MCP 新增表单 env 文本域解析：每行 `KEY=value`，忽略空行与无 `=` 行（取首个 `=` 切分，值保留 `=`）。 */
export function parseEnvLines(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** 插件一级区（skill + mcp）与 skill 二级 tab。 */
export type PluginSection = "skill" | "mcp";
export type SkillTab = "discover" | "manage" | "sources";

/**
 * 插件页视图位置 state（section / skill 二级 tab / 搜索词）。提到 jotai atom（内存级，不持久化）
 * 而非组件 useState：移动端从 Manage/MCP 点行开 skill focus（navigate /plugins/skill/$）时整个
 * `<main>` 换分支，PluginsPanel unmount；返回 /plugins 重 mount。useState 会丢位置回到默认
 * skill/discover，atom 在 jotai 全局 store unmount 后存活，重 mount 读回原位置（对标
 * workbenchMobileOverviewTabAtom）。桌面 PluginsPanel 常驻不 unmount，读写同一 atom 无行为差异。
 * 刷新回默认可接受（不持久化到 localStorage）。
 */
const pluginsSectionAtom = atom<PluginSection>("skill");
const pluginsSkillTabAtom = atom<SkillTab>("discover");
const pluginsQueryAtom = atom("");

/**
 * 插件市场主体（桌面左栏 + 移动主体共用，仿 GlobalFilesOverview）。一级 Skill/MCP
 * SegmentedControl：Skill 子区 = discover/manage/sources 三弱文字 tab；MCP 子区 = 外部 server 管理
 *（user scope，Phase 3 接 project scope）。agent 首版 claude-code（架构透传 --agent 支持 codex）。
 *
 * 由 workbench layout 消费：桌面 `WorkbenchContent` leftMode="plugins" → leftPanel=PluginsPanel；
 * 移动 `MobileWorkbench` → MobilePluginsOverview 外壳 + PluginsPanel 主体。
 *
 * tab 层级：一级 Skill/MCP 用强 SegmentedControl（互斥主区），二级 Discover/Manage/Sources 用弱
 * 文字 tab（TabButton，active primary 色、无容器）——避免两层同款 segment 叠加（非原生移动端做法）。
 *
 * tab memory：query/二级 tab/section 提到 jotai atom（见上）→ 切回 discover 时 useSkillSearch(query)
 * 命中 TanStack 缓存，搜索结果保留；移动端开 skill focus 再返回不丢位置。
 *
 * `onOpenSkill` 依赖注入（仿 GlobalFilesOverview.onOpenFile）：桌面 WorkbenchContent 注入
 * 「开中栏 skill tab + focus」，移动 MobilePluginsOverview 注入「navigate /plugins/skill/$」
 *（移动无中栏，开 focus 主体）。Manage tab 点已装 skill 行触发，详情在中栏/focus 打开（非 inline）。
 */
export function PluginsPanel({
  projectName,
  onOpenSkill,
  onCardDragStart,
}: {
  /**
   * 项目 scope 信号：给定 → 项目工作台插件 tab（skill 写 <project>/.claude/skills、MCP 写
   * <project>/.mcp.json，隐藏 sources tab 与「检查更新」）。undefined → 全局 /plugins（user scope）。
   */
  projectName?: string;
  /** 全局 scope 打开 skill 详情（开中栏 tab / navigate）。项目 scope 走 inline setSelectedSkill，不调此 prop → 可选。 */
  onOpenSkill?: (name: string) => void;
  /** 拖动源启动（skill 行拖到中栏开 skill tab，WorkbenchContent onCardDragStart）。undefined 退纯点击（移动端不传）。 */
  onCardDragStart?: CardDragStartHandler;
}) {
  const { t } = useT();
  const [section, setSection] = useAtom(pluginsSectionAtom);
  const [skillTab, setSkillTab] = useAtom(pluginsSkillTabAtom);
  const [query, setQuery] = useAtom(pluginsQueryAtom);
  const agent: SkillAgent = DEFAULT_SKILL_AGENT;
  // 项目 scope skill 详情：项目工作台无中栏 tab 树（不进路由），用内部 state inline 切换
  //（selectedSkill 非 null → SkillTabPreview + 顶部返回；null → 主体）。桌面项目左栏、移动
  // MobileProjectOverview 都走这条 inline 路径。全局 scope 仍走 onOpenSkill（开中栏 tab / navigate）。
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  // 项目 scope 的「打开 skill 详情」= inline setSelectedSkill；全局 = 调用方 onOpenSkill。
  const openSkill = (name: string) => {
    if (projectName) setSelectedSkill(name);
    else onOpenSkill?.(name);
  };

  if (projectName && selectedSkill) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-neutral-line/40 bg-surface px-3 py-2">
          <ActionButton compact onClick={() => setSelectedSkill(null)}>
            {t("nav.back")}
          </ActionButton>
          <span className="truncate text-sm font-semibold text-on-surface">{selectedSkill}</span>
        </div>
        <SkillTabPreview name={selectedSkill} projectName={projectName} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-neutral-line/40 bg-surface px-3 py-2">
        <SegmentedControl
          ariaLabel={t("plugins.title")}
          onChange={setSection}
          options={[
            { value: "skill", label: t("plugins.skillTab") },
            { value: "mcp", label: t("plugins.mcpTab") },
          ]}
          value={section}
        />
      </div>
      {section === "skill" ? (
        <>
          <div className="flex shrink-0 items-center gap-1 border-b border-neutral-line/40 bg-surface px-3 py-2">
            <TabButton
              active={skillTab === "discover"}
              label={t("skills.tabDiscover")}
              onClick={() => setSkillTab("discover")}
            />
            <TabButton
              active={skillTab === "manage"}
              label={t("skills.tabManage")}
              onClick={() => setSkillTab("manage")}
            />
            {/* sources 是全局 settings（项目 scope 无源概念），项目时隐藏。 */}
            {projectName ? null : (
              <TabButton
                active={skillTab === "sources"}
                label={t("skills.tabSources")}
                onClick={() => setSkillTab("sources")}
              />
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-surface-raised max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)]">
            <div className="p-3">
              {skillTab === "discover" ? (
                <DiscoverTab
                  agent={agent}
                  projectName={projectName}
                  query={query}
                  setQuery={setQuery}
                />
              ) : null}
              {skillTab === "manage" ? (
                <ManageTab
                  agent={agent}
                  projectName={projectName}
                  onCardDragStart={onCardDragStart}
                  onGoToSources={() => setSkillTab("sources")}
                  onOpenSkill={openSkill}
                />
              ) : null}
              {skillTab === "sources" && !projectName ? <SourcesTab /> : null}
            </div>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-raised max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)]">
          <div className="p-3">
            <McpPanel projectName={projectName} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 移动插件一级页面外壳（仿 MobileFilesOverview）：MobilePageHeader title 无 back（一级页面，
 * 底部胶囊切换）+ PluginsPanel 主体。
 */
export function MobilePluginsOverview() {
  const { t } = useT();
  const navigate = useNavigate();
  // 移动无中栏 tab 树：点已装 skill 行 → navigate /plugins/skill/$name 开 focus 主体
  //（MobileSkillFocus，对标 MobileFileFocus）。桌面 WorkbenchContent 注入的开中栏 tab 实现不适用。
  const onOpenSkill = (name: string) => {
    void navigate({ to: "/plugins/skill/$", params: { _splat: name } });
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobilePageHeader title={t("plugins.title")} />
      <div className="min-h-0 flex-1">
        <PluginsPanel onOpenSkill={onOpenSkill} />
      </div>
    </div>
  );
}

function DiscoverTab({
  agent,
  projectName,
  query,
  setQuery,
}: {
  agent: SkillAgent;
  projectName?: string;
  query: string;
  setQuery: (q: string) => void;
}) {
  const { t } = useT();
  const search = useSkillSearch(query);
  const install = useInstallSkill(projectName);
  const [pending, setPending] = useState<SkillMarketEntry | null>(null);

  const trimmed = query.trim();
  const skills = search.data?.skills ?? [];
  const showHint = trimmed.length < 2;

  return (
    <div className="space-y-3">
      <ShellInput
        aria-label={t("skills.searchPlaceholder")}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("skills.searchPlaceholder")}
        type="search"
        value={query}
      />
      {showHint ? (
        <p className="px-1 text-xs text-on-surface-muted">{t("skills.searchHint")}</p>
      ) : search.isLoading ? (
        <p className="px-1 text-xs text-on-surface-muted">…</p>
      ) : skills.length > 0 ? (
        <ListGroup ariaLabel={t("skills.tabDiscover")}>
          {skills.map((s) => (
            <ListRow
              actions={
                <ActionButton
                  compact
                  disabled={install.isPending}
                  onClick={() => setPending(s)}
                  tone="accent"
                >
                  {t("skills.install")}
                </ActionButton>
              }
              key={s.id}
              meta={
                <span className="text-xs text-on-surface-muted">
                  {t("skills.installs", { n: s.installs })}
                </span>
              }
              subtitle={s.source}
              title={s.name}
            />
          ))}
        </ListGroup>
      ) : (
        <p className="px-1 text-xs text-on-surface-muted">{t("skills.empty")}</p>
      )}
      {pending ? (
        <InstallConfirmDialog
          agent={agent}
          entry={pending}
          error={install.error ? install.error.message : null}
          installing={install.isPending}
          onCancel={() => {
            install.reset();
            setPending(null);
          }}
          onConfirm={async () => {
            try {
              await install.mutateAsync({
                source: pending.source,
                skillId: pending.skillId || pending.name,
                agent,
              });
              setPending(null);
            } catch {
              // 失败保留 dialog，install.error 文案显示，用户可取消或重试。
            }
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * 安装执行信任确认（Radix Dialog）。第三方 skill 被 agent 以完整权限执行，install 前必须提示
 * 用户确认信任来源——这是 skill 引入最大安全面，比路径穿越更需显式确认。失败保留 dialog，
 * 显示 error 文案，不自动关闭（用户可见失败原因、可取消或重试）。
 */
function InstallConfirmDialog({
  agent,
  entry,
  error,
  installing,
  onCancel,
  onConfirm,
}: {
  agent: SkillAgent;
  entry: SkillMarketEntry;
  error: string | null;
  installing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !installing) onCancel();
      }}
      open
    >
      <DialogContent className="gap-4 p-5">
        <DialogTitle className="text-base font-semibold text-on-surface">
          {t("skills.installConfirmTitle")}
        </DialogTitle>
        <DialogDescription className="text-sm text-on-surface-muted">
          {t("skills.installConfirmBody")}
        </DialogDescription>
        <div className="rounded-lg bg-surface-inset px-3 py-2 text-sm">
          <div className="font-semibold text-on-surface">{entry.name}</div>
          <div className="text-xs text-on-surface-muted">{[entry.source, agent].join(" · ")}</div>
        </div>
        {error ? (
          <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <ActionButton disabled={installing} onClick={onCancel}>
            {t("cancel")}
          </ActionButton>
          <ActionButton disabled={installing} onClick={onConfirm} tone="accent">
            {installing ? t("skills.installing") : t("skills.installConfirmCta")}
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageTab({
  agent,
  projectName,
  onGoToSources,
  onOpenSkill,
  onCardDragStart,
}: {
  agent: SkillAgent;
  /**
   * 项目 scope 信号：给定 → 每行恒显「更新」（直接拉取，无检测）、隐藏「检查更新」按钮 +
   * update 徽标 + 「纳入管理」按钮。undefined → 全局 scope（hasUpdate 驱动）。
   */
  projectName?: string;
  /** 未纳入版本管理（手写/本地）skill 的「纳入管理」入口：跳 Sources tab 挂 local/git 源。 */
  onGoToSources: () => void;
  onOpenSkill: (name: string) => void;
  /** 拖动源启动（skill 行拖到中栏开 skill tab，透传自 PluginsPanel）。undefined 退纯点击。 */
  onCardDragStart?: CardDragStartHandler;
}) {
  const { t } = useT();
  const installed = useInstalledSkills(agent, projectName);
  const uninstall = useUninstallSkill(projectName);
  // 项目 update 直接拉取同步，无 checkUpdates；hook 仍调（Rules of Hooks + 全局分支用），
  // 项目分支不渲染检查更新按钮，updates.data 不参与项目行徽标。
  const updates = useCheckSkillUpdates(agent);
  const update = useUpdateSkill(projectName);
  const [updating, setUpdating] = useState<string | null>(null);

  if (installed.isLoading) {
    // 骨架对齐 ManageTab 真实行结构：无 marker（ListRow 未传 marker）+ 右 ActionButton 文字按钮
    //（rounded-xl）——而非文件树的左 icon + 右小方块，否则加载→真实跳变。
    return <ListRowSkeleton action="button" count={4} marker={false} />;
  }
  const skills = installed.data?.skills ?? [];
  if (skills.length === 0) {
    return <p className="px-1 text-xs text-on-surface-muted">{t("skills.emptyInstalled")}</p>;
  }
  const statusByName = new Map(
    (updates.data?.updates ?? []).map((status) => [status.name, status]),
  );

  return (
    <div className="space-y-3">
      {/* 全局 scope 才有「检查更新」（GitHub Trees API 检测）；项目 update 直接拉取，无检测按钮。 */}
      {projectName ? null : (
        <ActionButton
          compact
          disabled={updates.isFetching}
          onClick={() => void updates.refetch()}
          tone="accent"
        >
          {updates.isFetching ? t("skills.checking") : t("skills.checkUpdates")}
        </ActionButton>
      )}
      {update.error ? (
        <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
          {update.error.message}
        </p>
      ) : null}
      <ListGroup ariaLabel={t("skills.tabManage")}>
        {skills.map((s) => {
          const status = statusByName.get(s.name);
          // 更新按钮：项目 scope 每行恒显（直接拉取同步）；全局仅「有更新」(manageable+hasUpdate) 显。
          const showUpdate =
            Boolean(projectName) || Boolean(status?.manageable && status.hasUpdate);
          // rowCommon 复用：onClick 是键盘 Enter/Space → click 路径；actions 的 uninstall 按钮点击
          // 走原生 click（inClose 判定：closest("button") → 不触发拖动 onSelect）。onCardDragStart
          // 存在 → DraggableListRow 拖到中栏开 skill tab（设计 §7.2）。
          const rowCommon: ComponentProps<typeof ListRow> = {
            actions: (
              <>
                {showUpdate ? (
                  <ActionButton
                    compact
                    disabled={updating === s.name}
                    onClick={() => {
                      setUpdating(s.name);
                      void update.mutateAsync({ name: s.name, agent }).finally(() => {
                        setUpdating(null);
                      });
                    }}
                    tone="accent"
                  >
                    {updating === s.name ? t("skills.updating") : t("skills.update")}
                  </ActionButton>
                ) : null}
                {/* 「纳入管理」仅全局 scope（手写/本地 skill 跳 Sources 挂源）；项目无源概念。 */}
                {projectName ? null : status && !status.manageable ? (
                  <ActionButton compact onClick={onGoToSources}>
                    {t("skills.bringUnderManagement")}
                  </ActionButton>
                ) : null}
                <ActionButton
                  compact
                  disabled={uninstall.isPending}
                  onClick={() => uninstall.mutate({ name: s.name, agent })}
                  tone="danger"
                >
                  {uninstall.isPending ? t("skills.uninstalling") : t("skills.uninstall")}
                </ActionButton>
              </>
            ),
            // 徽标仅全局 scope（项目无检测，无 hasUpdate/manageable 信号）。
            meta: projectName ? null : status ? (
              status.manageable ? (
                status.hasUpdate ? null : (
                  <span className="rounded-full bg-on-surface/10 px-2 py-0.5 text-[10px] font-semibold text-on-surface-muted">
                    {t("skills.upToDate")}
                  </span>
                )
              ) : (
                <span className="rounded-full bg-on-surface/10 px-2 py-0.5 text-[10px] font-semibold text-on-surface-muted">
                  {t("skills.local")}
                </span>
              )
            ) : null,
            subtitle: s.path,
            title: s.name,
            onClick: () => onOpenSkill(s.name),
          };
          if (onCardDragStart) {
            return (
              <DraggableListRow
                key={s.name}
                {...rowCommon}
                dragRef={{ kind: "skill", name: s.name }}
                onCardDragStart={onCardDragStart}
                onSelect={() => onOpenSkill(s.name)}
              />
            );
          }
          return <ListRow key={s.name} {...rowCommon} />;
        })}
      </ListGroup>
    </div>
  );
}

/**
 * skill 详情预览面板（中栏 skill tab + 移动 MobileSkillFocus body 共用，对标 FileTabPreview）。
 * 只读渲染本地 SKILL.md（useSkillPreview → MarkdownString）——无编辑无保存（区别于 FileTabPreview
 * 可编辑）。**不带 h4 标题栏**：SKILL.md 正文自带 `# H1` 标题，再加 h4 会重复（区别于 FilePreviewPanel
 * 保留 h4——文件正文不带 `# 标题` 不重复）；section 直接从 loading/error/内容态开始。桌面由
 * PanelRouter 渲染、移动由 MobileSkillFocus 包 header 后渲染 body。顶层组件
 *（rerender-no-inline-components），不嵌套定义。
 */
export function SkillTabPreview({ name, projectName }: { name: string; projectName?: string }) {
  const { t } = useT();
  const preview = useSkillPreview(name, DEFAULT_SKILL_AGENT, projectName);

  return (
    <section
      aria-label={name}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-raised/25"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {preview.isLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-muted">
              {t("skills.previewLoading")}
            </span>
          </div>
        ) : preview.error ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
              {preview.error.message}
            </p>
          </div>
        ) : preview.data ? (
          <div className="p-4">
            <MarkdownString text={preview.data.content} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SourcesTab() {
  const { t } = useT();
  const sources = useSkillSources();
  const addSource = useAddSkillSource();
  const removeSource = useRemoveSkillSource();
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [label, setLabel] = useState("");

  const list = sources.data?.sources ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-neutral-line/40 bg-surface p-4">
        <ShellInput
          aria-label={t("skills.repo")}
          onChange={(e) => setRepo(e.target.value)}
          placeholder={t("skills.repo")}
          value={repo}
        />
        <ShellInput
          aria-label={t("skills.branch")}
          onChange={(e) => setBranch(e.target.value)}
          placeholder={t("skills.branch")}
          value={branch}
        />
        <ShellInput
          aria-label={t("skills.labelField")}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("skills.labelField")}
          value={label}
        />
        <ActionButton
          disabled={!repo.trim() || addSource.isPending}
          onClick={async () => {
            try {
              await addSource.mutateAsync({
                repo: repo.trim(),
                branch: branch.trim() || undefined,
                label: label.trim() || undefined,
              });
              setRepo("");
              setBranch("");
              setLabel("");
            } catch {
              // 输入非法（非 owner/repo）server 返回 400，表单保留供修正。
            }
          }}
          tone="accent"
        >
          {addSource.isPending ? t("skills.adding") : t("skills.addSource")}
        </ActionButton>
        {addSource.error ? (
          <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {addSource.error.message}
          </p>
        ) : null}
      </div>

      {list.length === 0 ? (
        <p className="px-1 text-xs text-on-surface-muted">{t("skills.sourcesEmpty")}</p>
      ) : (
        <ListGroup ariaLabel={t("skills.tabSources")}>
          {list.map((src) => (
            <ListRow
              actions={
                <ActionButton
                  compact
                  disabled={removeSource.isPending}
                  onClick={() => removeSource.mutate(src.id)}
                  tone="danger"
                >
                  {t("skills.removeSource")}
                </ActionButton>
              }
              key={src.id}
              subtitle={[src.repo, src.branch].filter(Boolean).join(" · ")}
              title={src.label || src.repo}
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}

/**
 * MCP 外部 server 管理（scope 由 projectName 决定：user 读写 ~/.claude.json / project 读写
 * <project>/.mcp.json，wrap claude mcp）。列表 + 新增表单（stdio: command+args+env；sse/http:
 * url）+ 删除。增删前弹信任确认 Dialog（外部 MCP 可访问本机资源并执行命令，是引入第三方工具的
 * 主要安全面——对称 InstallConfirmDialog）。agent 实例由 CLI 原生合并生效（下次 spawn 读配置）。
 */
function McpPanel({ projectName }: { projectName?: string }) {
  const { t } = useT();
  const scope: McpScope = projectName ? "project" : "user";
  const servers = useMcpServers(scope, projectName);
  const addServer = useAddMcpServer(scope, projectName);
  const removeServer = useRemoveMcpServer(scope, projectName);
  const updateServer = useUpdateMcpServer(scope, projectName);
  const [name, setName] = useState("");
  const [type, setType] = useState<McpServerType>("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [url, setUrl] = useState("");
  // 编辑态：editing 非 null 时表单为「编辑」模式（name 只读、提交调 update）。
  const [editing, setEditing] = useState<McpServerEntry | null>(null);
  // 信任确认：pendingAdd=true 提交新增、pendingRemove=server name 提交移除、pendingUpdate=true 提交修改。
  const [pendingAdd, setPendingAdd] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState(false);

  const list = servers.data?.servers ?? [];
  // 编辑模式下 name 锁定为 editing.name（update = remove+add 同名，不允许改名）。
  const effectiveName = editing ? editing.name : name;

  const buildDraft = (): AddMcpServerRequest | null => {
    const trimmedName = effectiveName.trim();
    if (!trimmedName) return null;
    if (type === "stdio") {
      const trimmedCommand = command.trim();
      if (!trimmedCommand) return null;
      const argList = args.split(/\s+/).filter(Boolean);
      const envMap = parseEnvLines(env);
      return {
        name: trimmedName,
        type,
        command: trimmedCommand,
        ...(argList.length ? { args: argList } : {}),
        ...(envMap ? { env: envMap } : {}),
      };
    }
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return null;
    return { name: trimmedName, type, url: trimmedUrl };
  };

  const resetForm = () => {
    setName("");
    setType("stdio");
    setCommand("");
    setArgs("");
    setEnv("");
    setUrl("");
    setEditing(null);
  };

  /** 进入编辑模式：回填表单字段（name 锁定为 entry.name，只读）。 */
  const fillForm = (entry: McpServerEntry) => {
    setEditing(entry);
    setType(entry.type);
    setCommand(entry.command ?? "");
    setArgs(entry.args?.join(" ") ?? "");
    setEnv(
      entry.env
        ? Object.entries(entry.env)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n")
        : "",
    );
    setUrl(entry.url ?? "");
    setName(entry.name);
  };

  return (
    <div className="space-y-4">
      {/* 新增/编辑表单（editing 非 null = 编辑模式：name 只读、提交调 update） */}
      <div className="space-y-2 rounded-xl border border-neutral-line/40 bg-surface p-4">
        <ShellInput
          aria-label={t("mcp.name")}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("mcp.name")}
          readOnly={!!editing}
          value={effectiveName}
        />
        <SegmentedControl
          ariaLabel={t("mcp.type")}
          onChange={setType}
          options={[
            { value: "stdio" as const, label: t("mcp.typeStdio") },
            { value: "sse" as const, label: t("mcp.typeSse") },
            { value: "http" as const, label: t("mcp.typeHttp") },
          ]}
          value={type}
        />
        {type === "stdio" ? (
          <>
            <ShellInput
              aria-label={t("mcp.command")}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t("mcp.command")}
              value={command}
            />
            <ShellInput
              aria-label={t("mcp.args")}
              onChange={(e) => setArgs(e.target.value)}
              placeholder={t("mcp.args")}
              value={args}
            />
            <textarea
              aria-label={t("mcp.env")}
              className="w-full resize-none rounded-lg border border-neutral-line bg-surface-inset px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-muted/60 focus:border-primary focus:outline-none focus:ring-primary/30"
              onChange={(e) => setEnv(e.target.value)}
              placeholder={t("mcp.env")}
              rows={3}
              value={env}
            />
          </>
        ) : (
          <ShellInput
            aria-label={t("mcp.url")}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("mcp.url")}
            value={url}
          />
        )}
        <div className="flex gap-2">
          {editing ? (
            <ActionButton
              onClick={() => {
                resetForm();
                addServer.reset();
                updateServer.reset();
              }}
            >
              {t("cancel")}
            </ActionButton>
          ) : null}
          <ActionButton
            disabled={
              editing
                ? updateServer.isPending || !buildDraft()
                : addServer.isPending || !buildDraft()
            }
            onClick={() => (editing ? setPendingUpdate(true) : setPendingAdd(true))}
            tone="accent"
          >
            {editing
              ? updateServer.isPending
                ? t("mcp.updating")
                : t("mcp.save")
              : addServer.isPending
                ? t("mcp.adding")
                : t("mcp.add")}
          </ActionButton>
        </div>
        {(editing ? updateServer.error : addServer.error) ? (
          <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {(editing ? updateServer.error : addServer.error)?.message}
          </p>
        ) : null}
      </div>

      {/* server 列表 */}
      {servers.isLoading ? (
        <ListRowSkeleton count={3} marker={false} action="button" />
      ) : list.length === 0 ? (
        <p className="px-1 text-xs text-on-surface-muted">{t("mcp.empty")}</p>
      ) : (
        <ListGroup ariaLabel={t("mcp.title")}>
          {list.map((s) => (
            <ListRow
              actions={
                <>
                  <ActionButton compact onClick={() => fillForm(s)}>
                    {t("mcp.edit")}
                  </ActionButton>
                  <ActionButton
                    compact
                    disabled={removeServer.isPending}
                    onClick={() => setPendingRemove(s.name)}
                    tone="danger"
                  >
                    {t("mcp.remove")}
                  </ActionButton>
                </>
              }
              key={s.name}
              meta={
                <span className="rounded-full bg-on-surface/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-on-surface-muted">
                  {s.type}
                </span>
              }
              subtitle={s.type === "stdio" ? s.command : s.url}
              title={s.name}
            />
          ))}
        </ListGroup>
      )}

      {pendingAdd ? (
        <McpConfirmDialog
          busy={addServer.isPending}
          error={addServer.error ? addServer.error.message : null}
          kind="add"
          name={name.trim()}
          onCancel={() => {
            addServer.reset();
            setPendingAdd(false);
          }}
          onConfirm={async () => {
            const draft = buildDraft();
            if (!draft) return;
            try {
              await addServer.mutateAsync(draft);
              setPendingAdd(false);
              resetForm();
            } catch {
              // 失败保留 dialog，error 文案显示，用户可取消或重试。
            }
          }}
        />
      ) : null}
      {pendingRemove ? (
        <McpConfirmDialog
          busy={removeServer.isPending}
          error={removeServer.error ? removeServer.error.message : null}
          kind="remove"
          name={pendingRemove}
          onCancel={() => {
            removeServer.reset();
            setPendingRemove(null);
          }}
          onConfirm={async () => {
            try {
              await removeServer.mutateAsync(pendingRemove);
              setPendingRemove(null);
            } catch {
              // 失败保留 dialog，error 文案显示，用户可取消或重试。
            }
          }}
        />
      ) : null}
      {pendingUpdate ? (
        <McpConfirmDialog
          busy={updateServer.isPending}
          error={updateServer.error ? updateServer.error.message : null}
          kind="update"
          name={effectiveName.trim()}
          onCancel={() => {
            updateServer.reset();
            setPendingUpdate(false);
          }}
          onConfirm={async () => {
            const draft = buildDraft();
            if (!draft) return;
            try {
              await updateServer.mutateAsync(draft);
              setPendingUpdate(false);
              resetForm();
            } catch {
              // 失败保留 dialog，error 文案显示，用户可取消或重试。
            }
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * MCP 增/删/改信任确认（Radix Dialog，对称 InstallConfirmDialog）。外部 MCP 可访问本机资源并
 * 执行命令，增删改前必须提示用户确认——与 skill install 同级的第三方引入安全面。失败保留
 * dialog，显示 error 文案，不自动关闭（用户可见失败原因、可取消或重试）。
 */
function McpConfirmDialog({
  kind,
  name,
  error,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: "add" | "remove" | "update";
  name: string;
  error: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  const labels = {
    add: {
      title: t("mcp.addConfirmTitle"),
      body: t("mcp.addConfirmBody"),
      cta: t("mcp.addConfirmCta"),
      busy: t("mcp.adding"),
    },
    remove: {
      title: t("mcp.removeConfirmTitle"),
      body: t("mcp.removeConfirmBody"),
      cta: t("mcp.removeConfirmCta"),
      busy: t("mcp.removing"),
    },
    update: {
      title: t("mcp.updateConfirmTitle"),
      body: t("mcp.updateConfirmBody"),
      cta: t("mcp.updateConfirmCta"),
      busy: t("mcp.updating"),
    },
  }[kind];
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
      open
    >
      <DialogContent className="gap-4 p-5">
        <DialogTitle className="text-base font-semibold text-on-surface">
          {labels.title}
        </DialogTitle>
        <DialogDescription className="text-sm text-on-surface-muted">
          {labels.body}
        </DialogDescription>
        <div className="rounded-lg bg-surface-inset px-3 py-2 text-sm">
          <div className="font-semibold text-on-surface">{name}</div>
        </div>
        {error ? (
          <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <ActionButton disabled={busy} onClick={onCancel}>
            {t("cancel")}
          </ActionButton>
          <ActionButton disabled={busy} onClick={onConfirm} tone="accent">
            {busy ? labels.busy : labels.cta}
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
