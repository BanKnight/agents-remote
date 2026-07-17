import { useState } from "react";
import type { SkillAgent, SkillMarketEntry } from "@agents-remote/shared";

import { useT } from "../i18n";
import { MarkdownString } from "../components/markdown/MarkdownString";
import {
  ActionButton,
  ListGroup,
  ListRow,
  MobilePageHeader,
  SegmentedControl,
  ShellInput,
} from "../components/shell/shell-primitives";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import {
  useAddSkillSource,
  useInstallSkill,
  useInstalledSkills,
  useRemoveSkillSource,
  useSkillPreview,
  useSkillSearch,
  useSkillSources,
  useUninstallSkill,
} from "../hooks/skills";

type SkillTab = "discover" | "manage" | "sources";

/**
 * 技能市场主体（桌面左栏 + 移动主体共用，仿 GlobalFilesOverview）。三 tab：discover / manage /
 * sources。agent 首版 claude-code（架构透传 --agent 支持 codex，runtime 选择器留后续）。
 *
 * 由 workbench layout 消费：桌面 `WorkbenchContent` leftMode="skills" → leftPanel=SkillsPanel；
 * 移动 `MobileWorkbench` → MobileSkillsOverview 外壳 + SkillsPanel 主体。
 *
 * tab memory：query 搜索词提升到此（SkillsPanel 是 tabs 的 parent，tab 切换不 unmount）→ 切回
 * discover 时 useSkillSearch(query) 命中 TanStack 缓存，搜索结果保留；manage 的 useInstalledSkills
 * 切回 refetch（staleTime 0）= "必要项刷新"。装/卸后 server 遍历活跃 session 发 /reload-skills，
 * slash catalog 经 WS 广播自动刷新。
 */
export function SkillsPanel() {
  const { t } = useT();
  const [tab, setTab] = useState<SkillTab>("discover");
  // 提升至 parent：tab 切换 SkillsPanel 不 unmount，query 保留 → 搜索结果 memory。
  const [query, setQuery] = useState("");
  const agent: SkillAgent = "claude-code";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-neutral-line/40 bg-surface px-3 py-2">
        <SegmentedControl
          ariaLabel={t("skills.title")}
          onChange={setTab}
          options={[
            { value: "discover", label: t("skills.tabDiscover") },
            { value: "manage", label: t("skills.tabManage") },
            { value: "sources", label: t("skills.tabSources") },
          ]}
          value={tab}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-raised/15">
        <div className="p-3">
          {tab === "discover" ? (
            <DiscoverTab agent={agent} query={query} setQuery={setQuery} />
          ) : null}
          {tab === "manage" ? <ManageTab agent={agent} /> : null}
          {tab === "sources" ? <SourcesTab /> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * 移动技能一级页面外壳（仿 MobileFilesOverview）：MobilePageHeader title 无 back（一级页面，
 * 底部胶囊切换）+ SkillsPanel 主体。
 */
export function MobileSkillsOverview() {
  const { t } = useT();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobilePageHeader title={t("skills.title")} />
      <div className="min-h-0 flex-1">
        <SkillsPanel />
      </div>
    </div>
  );
}

function DiscoverTab({
  agent,
  query,
  setQuery,
}: {
  agent: SkillAgent;
  query: string;
  setQuery: (q: string) => void;
}) {
  const { t } = useT();
  const search = useSkillSearch(query);
  const install = useInstallSkill();
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

function ManageTab({ agent }: { agent: SkillAgent }) {
  const { t } = useT();
  const installed = useInstalledSkills(agent);
  const uninstall = useUninstallSkill();
  const [previewName, setPreviewName] = useState<string | null>(null);
  const preview = useSkillPreview(previewName, agent);

  if (installed.isLoading) {
    return <p className="px-1 text-xs text-on-surface-muted">…</p>;
  }
  const skills = installed.data?.skills ?? [];
  if (skills.length === 0) {
    return <p className="px-1 text-xs text-on-surface-muted">{t("skills.emptyInstalled")}</p>;
  }

  return (
    <div className="space-y-3">
      <ListGroup ariaLabel={t("skills.tabManage")}>
        {skills.map((s) => (
          <ListRow
            actions={
              <ActionButton
                compact
                disabled={uninstall.isPending}
                onClick={() => uninstall.mutate({ name: s.name, agent })}
                tone="danger"
              >
                {uninstall.isPending ? t("skills.uninstalling") : t("skills.uninstall")}
              </ActionButton>
            }
            key={s.name}
            onClick={() => setPreviewName(previewName === s.name ? null : s.name)}
            selected={previewName === s.name}
            subtitle={s.path}
            title={s.name}
          />
        ))}
      </ListGroup>
      {previewName && preview.data ? (
        <div className="rounded-xl border border-neutral-line/40 bg-surface p-4">
          <MarkdownString text={preview.data.content} />
        </div>
      ) : null}
    </div>
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
