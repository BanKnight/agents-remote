import { forwardRef, type ButtonHTMLAttributes, type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EFFORT_LEVELS,
  PROVIDER_PROTOCOLS,
  type ClaudeModelMapping,
  type ClaudeModelTier,
  type ClaudeRuntimeConfig,
  type EffortLevel,
  type ListProviderModelsResponse,
  type ProviderConfigMasked,
  type ProviderProtocol,
  type UpdateProviderRequest,
} from "@agents-remote/shared";

import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import {
  ActionButton,
  ListGroup,
  ListRow,
  SegmentedControl,
  ShellInput,
  ShellSectionLabel,
  listGroupClasses,
  shellSurfaceClasses,
} from "./shell-primitives";
import { ShellIcon } from "./icons";
import { useConfirm } from "./confirm-dialog";
import { ActionMenu } from "../ui/action-menu";
import { OptionMenu } from "../ui/option-menu";
import { Card, CardContent } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import {
  createProvider,
  deleteProvider,
  getSettings,
  listProviderModels,
  updateClaudeRuntime,
  updateProvider,
} from "../../api/client";

const TIERS: readonly ClaudeModelTier[] = ["default", "opus", "sonnet", "haiku"];

/** 加载态占位 runtime：让 ClaudeRuntimeSection 结构即时渲染（providerId="" 走 ShellInput 分支）。 */
const EMPTY_RUNTIME: ClaudeRuntimeConfig = {
  providerId: "",
  modelMapping: { default: "", opus: "", sonnet: "", haiku: "" },
  enable1mContext: false,
  effort: "high",
};

/** providers 列表加载骨架行数（对齐真实 ProviderRow 高度，2 行传达列表结构即可）。 */
const PROVIDER_SKELETON_ROW_COUNT = 2;

const TIER_LABEL: Record<ClaudeModelTier, TranslationKey> = {
  default: "settings.tier.default",
  opus: "settings.tier.opus",
  sonnet: "settings.tier.sonnet",
  haiku: "settings.tier.haiku",
};

const EFFORT_LABEL: Record<EffortLevel, TranslationKey> = {
  low: "settings.effort.low",
  medium: "settings.effort.medium",
  high: "settings.effort.high",
  xhigh: "settings.effort.xhigh",
  max: "settings.effort.max",
};

const PROTOCOL_LABEL: Record<ProviderProtocol, TranslationKey> = {
  anthropic: "settings.protocol.anthropic",
  "openai-compatible": "settings.protocol.openaiCompatible",
};

/**
 * 设置内容（桌面 `SettingsDialog` / 移动 `SettingsRoute` 共享，决策 44）。
 * 两段：API Providers（凭证 CRUD）+ Runtime（决策 46 起 multi-runtime：[Claude|Codex]
 * 切换；Claude = provider 选择 / tier→model ID 映射 / 1M 开关 / effort 档位，Codex = 占位）。
 * runtime 配置在 spawn CLI 时作为全局默认初始值注入。
 * 不含外壳——由调用方包：移动端 `SettingsRoute` = main + MobilePageHeader + 本组件 +
 * MobilePrimaryNav；桌面端 `SettingsDialog` = Dialog + DialogContent + 本组件。
 */
export function SettingsContent() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { confirm, holder: confirmHolder } = useConfirm();

  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const deleteMutation = useMutation({
    mutationFn: deleteProvider,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const handleDelete = async (provider: ProviderConfigMasked) => {
    const ok = await confirm({
      title: t("settings.deleteProvider"),
      message: t("settings.deleteConfirm", { label: provider.label }),
      confirmLabel: t("settings.deleteProvider"),
      cancelLabel: t("cancel"),
      tone: "danger",
    });
    if (ok) await deleteMutation.mutateAsync(provider.id);
  };

  const settings = settingsQuery.data?.settings;
  const loading = settingsQuery.isLoading;

  // 固定结构即时渲染（VSCode/macOS prefs 风格）：加载中也出两段框架，providers 列表
  // 用骨架行、runtime 控件 disabled；加载完 key remount 填真实值。失败才替换为错误文案。
  if (!loading && !settings) {
    return (
      <>
        <p className="text-sm text-error">
          {settingsQuery.error?.message ?? t("api.settingsFetchFailed")}
        </p>
        {confirmHolder}
      </>
    );
  }

  const providers = settings?.providers ?? [];
  const runtime = settings?.runtimes.claude ?? EMPTY_RUNTIME;

  return (
    <>
      <div className="flex flex-col gap-6">
        <ProvidersSection providers={providers} loading={loading} onDelete={handleDelete} />
        <RuntimeSection loading={loading} providers={providers} runtime={runtime} />
      </div>
      {confirmHolder}
    </>
  );
}

/**
 * 桌面设置弹窗（决策 44）：`ActivityBar` 设置按钮 `useState` 触发，居中 modal。
 * `ui/dialog.tsx` 的 `DialogContent` 只提供 Portal + Overlay（模糊背景）+ Content 容器
 * + Radix dismiss/focus-trap——**不内置卡片视觉与关闭按钮**，调用方在 Content 内自行
 * 包一层卡片 div（对齐 `confirm-dialog` 桌面态 / DESIGN.md `dialog` 条目居中形态）。
 * 卡片限高 `max-h-[85vh] overflow-hidden` 保持圆角，内容区 `overflow-y-auto` 承载两段。
 * 嵌套 `ProviderDialog` / confirm Dialog 走受控 open（非 trigger asChild），Radix 支持嵌套。
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div
          className={`flex max-h-[85vh] flex-col overflow-hidden rounded-2xl shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <header className="flex items-center justify-between gap-3 px-5 pt-5">
            <DialogTitle className="text-base font-semibold text-on-surface">
              {t("settings.title")}
            </DialogTitle>
            <button
              type="button"
              aria-label={t("session.close")}
              onClick={onClose}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
            >
              <ShellIcon className="h-4 w-4" name="close" />
            </button>
          </header>
          <DialogDescription className="sr-only">{t("settings.title")}</DialogDescription>
          <div className="overflow-y-auto px-5 pb-5">
            <SettingsContent />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Providers section ────────────────────────────────────────────────

function ProvidersSection({
  providers,
  loading = false,
  onDelete,
}: {
  providers: ProviderConfigMasked[];
  loading?: boolean;
  onDelete: (provider: ProviderConfigMasked) => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState<ProviderConfigMasked | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <ShellSectionLabel>{t("settings.providers")}</ShellSectionLabel>
          <p className="mt-1 text-xs leading-5 text-on-surface-muted">
            {t("settings.providersHint")}
          </p>
        </div>
        <ActionButton tone="accent" onClick={() => setCreating(true)} disabled={loading}>
          {t("settings.addProvider")}
        </ActionButton>
      </div>

      {/* Apple Settings grouped：圆角 Card + 整行 ListRow 点击进编辑详情；列表独立 max-h-72 内滚。 */}
      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div aria-hidden="true" className={listGroupClasses()}>
                {Array.from({ length: PROVIDER_SKELETON_ROW_COUNT }, (_, i) => (
                  <div className="flex h-auto w-full items-center px-3 py-2.5" key={i}>
                    <span className="flex min-w-0 grow items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="skeleton-shimmer block h-4 w-28 rounded" />
                        <span className="skeleton-shimmer mt-1.5 block h-3 w-48 rounded" />
                      </span>
                      <span className="skeleton-shimmer size-8 shrink-0 rounded-md" />
                    </span>
                  </div>
                ))}
              </div>
            ) : providers.length === 0 ? (
              <p className="px-3 py-3 text-sm text-on-surface-muted">{t("settings.noProviders")}</p>
            ) : (
              <ListGroup ariaLabel={t("settings.providers")}>
                {providers.map((p) => (
                  <ProviderRow
                    key={p.id}
                    provider={p}
                    onEdit={() => setEditing(p)}
                    onDelete={() => onDelete(p)}
                  />
                ))}
              </ListGroup>
            )}
          </div>
        </CardContent>
      </Card>

      {(creating || editing) && (
        <ProviderDialog
          provider={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function ProviderRow({
  provider,
  onEdit,
  onDelete,
}: {
  provider: ProviderConfigMasked;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const subtitle = [
    provider.apiKeyMasked,
    provider.baseUrl || null,
    t(PROTOCOL_LABEL[provider.protocol ?? "anthropic"]),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ListRow
      title={provider.label}
      subtitle={<span className="font-mono">{subtitle}</span>}
      onClick={onEdit}
      actions={
        // stopPropagation：⋯ 点击不冒泡触发整行编辑（对齐 file-browser ListRow actions 模式）。
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <ActionMenu
            align="end"
            cancelLabel={t("cancel")}
            trigger={
              <button
                type="button"
                aria-label={t("settings.deleteProvider")}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
              >
                <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
                  <circle cx="3" cy="8" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="13" cy="8" r="1.5" />
                </svg>
              </button>
            }
            items={[
              {
                label: t("settings.deleteProvider"),
                variant: "destructive",
                onSelect: onDelete,
              },
            ]}
          />
        </span>
      }
    />
  );
}

function ProviderDialog({
  provider,
  onClose,
}: {
  provider: ProviderConfigMasked | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const isEdit = provider !== null;

  const [label, setLabel] = useState(provider?.label ?? "");
  const [protocol, setProtocol] = useState<ProviderProtocol>(provider?.protocol ?? "anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<ListProviderModelsResponse | null>(null);

  // 测试连接：验证已保存的 provider 凭证 + 预览可用模型列表。成功后预热 runtime 段
  // 的 provider-models 缓存（用已保存 protocol 作 key，与 ClaudeRuntimeSection 一致）。
  const testMutation = useMutation({
    mutationFn: (id: string) => listProviderModels(id),
    onSuccess: (data) => {
      setTestResult(data);
      if (data.ok && provider) {
        queryClient.setQueryData(
          ["provider-models", provider.id, provider.protocol ?? "anthropic"],
          data,
        );
      }
    },
    onError: (e) =>
      setTestResult({
        ok: false,
        models: [],
        error: e instanceof Error ? e.message : String(e),
      }),
  });

  const handleSubmit = async () => {
    setError(null);
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError(t("settings.labelHint"));
      return;
    }
    if (!isEdit && !apiKey.trim()) {
      setError(t("settings.apiKey"));
      return;
    }
    setSaving(true);
    try {
      if (isEdit && provider) {
        // apiKey 留空 = 不传 = 不改（后端 L73-74）；baseUrl 始终传当前值（空 = 清除）；
        // protocol 始终传（可改协议）。
        const input: UpdateProviderRequest = {
          label: trimmedLabel,
          baseUrl: baseUrl.trim(),
          protocol,
        };
        if (apiKey.trim()) input.apiKey = apiKey.trim();
        await updateProvider(provider.id, input);
      } else {
        await createProvider({
          label: trimmedLabel,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || undefined,
          protocol,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div
          className={`flex flex-col gap-4 rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <DialogTitle className="text-base font-semibold text-on-surface">
            {isEdit ? t("settings.editProvider") : t("settings.addProvider")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? t("settings.editProvider") : t("settings.addProvider")}
          </DialogDescription>

          <div className="flex flex-col gap-3">
            <Field label={t("settings.label")}>
              <ShellInput
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("settings.labelHint")}
              />
            </Field>
            <Field label={t("settings.protocol")} hint={t("settings.protocolHint")}>
              {/* 协议只有两档，用内联分段控件（SegmentedControl）而非 OptionMenu：OptionMenu 移动端
                  形态是 Radix Dialog，嵌套在本 ProviderDialog（也是 Dialog）内会被 dismissable layer
                  打断、trigger 点击无反应。原生 button 无此问题，移动端触摸也更大。 */}
              <SegmentedControl
                ariaLabel={t("settings.protocol")}
                onChange={setProtocol}
                options={PROVIDER_PROTOCOLS.map((p) => ({ label: t(PROTOCOL_LABEL[p]), value: p }))}
                value={protocol}
              />
            </Field>
            <Field label={t("settings.baseUrl")} hint={t("settings.baseUrlHint")}>
              <ShellInput
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.anthropic.com"
              />
            </Field>
            <Field
              label={t("settings.apiKey")}
              hint={isEdit ? t("settings.apiKeyHint") : undefined}
            >
              {/* 明文：个人私有部署无密码管理器必要；type=password 会触发浏览器「保存密码」提示。 */}
              <ShellInput
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEdit ? provider?.apiKeyMasked : "sk-ant-..."}
                autoComplete="off"
              />
            </Field>
          </div>

          {isEdit && provider && (
            <div className="flex flex-col gap-1.5">
              <ActionButton
                tone="muted"
                onClick={() => testMutation.mutate(provider.id)}
                disabled={testMutation.isPending || saving}
              >
                {testMutation.isPending
                  ? t("settings.testConnectionRunning")
                  : t("settings.testConnection")}
              </ActionButton>
              {testResult && (
                <p className={`text-xs ${testResult.ok ? "text-success" : "text-error"}`}>
                  {testResult.ok
                    ? testResult.models.length > 0
                      ? t("settings.testConnectionOk", { count: testResult.models.length })
                      : t("settings.testConnectionOkEmpty")
                    : t("settings.testConnectionFailed", { error: testResult.error ?? "" })}
                </p>
              )}
              {testResult?.ok && testResult.models.length > 0 && (
                <p className="truncate font-mono text-[11px] text-on-surface-muted">
                  {testResult.models.slice(0, 5).join(" · ")}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-error">{error}</p>}

          <div className="flex justify-end gap-3">
            <ActionButton tone="muted" onClick={onClose}>
              {t("cancel")}
            </ActionButton>
            <ActionButton tone="accent" onClick={handleSubmit} disabled={saving}>
              {saving ? t("settings.saving") : t("settings.save")}
            </ActionButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Runtime section（多 runtime 切换器，决策 46）──────────────────────

function RuntimeSection({
  runtime,
  providers,
  loading = false,
}: {
  runtime: ClaudeRuntimeConfig;
  providers: ProviderConfigMasked[];
  loading?: boolean;
}) {
  const { t } = useT();
  // runtime 类型 tab：本地 state 不持久化（Codex 尚未支持，纯结构预留）。
  const [tab, setTab] = useState<"claude" | "codex">("claude");

  return (
    <section className="flex flex-col gap-3">
      <div>
        <ShellSectionLabel>{t("settings.runtime")}</ShellSectionLabel>
        <p className="mt-1 text-xs leading-5 text-on-surface-muted">{t("settings.runtimeHint")}</p>
      </div>

      <SegmentedControl
        ariaLabel={t("settings.runtime")}
        onChange={setTab}
        options={[
          { label: t("settings.runtimeTabClaude"), value: "claude" },
          { label: t("settings.runtimeTabCodex"), value: "codex" },
        ]}
        value={tab}
      />

      {tab === "claude" ? (
        <ClaudeRuntimeContent
          key={loading ? "loading" : JSON.stringify(runtime)}
          loading={loading}
          providers={providers}
          runtime={runtime}
        />
      ) : (
        <CodexRuntimeContent />
      )}
    </section>
  );
}

// Claude runtime 配置主体（原 ClaudeRuntimeSection 的 Card）。父组件 RuntimeSection 用
// key={JSON.stringify(runtime)} remount：runtime 内容变（save 成功 / providerId 被后端清）
// 才重置 state；provider CRUD 不改 runtime 时 key 不变，用户编辑中的改动保留。
function ClaudeRuntimeContent({
  runtime,
  providers,
  loading = false,
}: {
  runtime: ClaudeRuntimeConfig;
  providers: ProviderConfigMasked[];
  loading?: boolean;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();

  const [providerId, setProviderId] = useState(runtime.providerId);
  const [modelMapping, setModelMapping] = useState<ClaudeModelMapping>(runtime.modelMapping);
  const [enable1m, setEnable1m] = useState(runtime.enable1mContext);
  const [effort, setEffort] = useState<EffortLevel>(runtime.effort);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const dirty =
    !loading &&
    (providerId !== runtime.providerId ||
      effort !== runtime.effort ||
      enable1m !== runtime.enable1mContext ||
      JSON.stringify(modelMapping) !== JSON.stringify(runtime.modelMapping));

  const handleSave = async () => {
    if (loading) return;
    setSaving(true);
    try {
      await updateClaudeRuntime({
        providerId,
        modelMapping,
        enable1mContext: enable1m,
        effort,
      });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const selectedLabel = providerId
    ? (providers.find((p) => p.id === providerId)?.label ?? providerId)
    : t("settings.runtimeProviderNone");
  const selectedProtocol: ProviderProtocol =
    providers.find((p) => p.id === providerId)?.protocol ?? "anthropic";

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-3">
        <Field label={t("settings.runtimeProvider")}>
          <OptionMenu
            align="start"
            cancelLabel={t("cancel")}
            trigger={<SelectorTrigger label={selectedLabel} disabled={loading} />}
            items={[
              {
                label: t("settings.runtimeProviderNone"),
                isActive: providerId === "",
                onSelect: () => setProviderId(""),
              },
              ...providers.map((p) => ({
                label: p.label,
                isActive: p.id === providerId,
                onSelect: () => setProviderId(p.id),
              })),
            ]}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-on-surface-soft">{t("settings.modelMapping")}</p>
          <p className="text-xs leading-5 text-on-surface-muted">
            {t("settings.modelMappingHint")}
          </p>
          {TIERS.map((tier) => (
            <div key={tier} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-on-surface-muted">
                {t(TIER_LABEL[tier])}
              </span>
              {providerId && !loading ? (
                <ModelTierSelect
                  tier={tier}
                  value={modelMapping[tier]}
                  providerId={providerId}
                  protocol={selectedProtocol}
                  onChange={(v) => setModelMapping({ ...modelMapping, [tier]: v })}
                />
              ) : (
                <ShellInput
                  value={modelMapping[tier]}
                  onChange={(e) => setModelMapping({ ...modelMapping, [tier]: e.target.value })}
                  placeholder={tier}
                  disabled={loading}
                />
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enable1m}
          disabled={loading}
          onClick={() => !loading && setEnable1m(!enable1m)}
          className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition hover:bg-surface-inset/40 disabled:cursor-default disabled:opacity-60"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-on-surface">
              {t("settings.enable1m")}
            </span>
            <span className="block text-xs leading-5 text-on-surface-muted">
              {t("settings.enable1mHint")}
            </span>
          </span>
          <span
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${enable1m ? "bg-primary" : "bg-surface-inset"}`}
          >
            <span
              className={`inline-block size-5 transform rounded-full bg-on-primary shadow transition ${enable1m ? "translate-x-[1.375rem]" : "translate-x-0.5"} ${enable1m ? "" : "bg-on-surface"}`}
            />
          </span>
        </button>

        <Field label={t("settings.effort")} hint={t("settings.effortHint")}>
          <OptionMenu
            align="start"
            cancelLabel={t("cancel")}
            trigger={<SelectorTrigger label={t(EFFORT_LABEL[effort])} disabled={loading} />}
            items={EFFORT_LEVELS.map((level) => ({
              label: t(EFFORT_LABEL[level]),
              isActive: level === effort,
              onSelect: () => setEffort(level),
            }))}
          />
        </Field>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-on-surface-muted">
            {justSaved ? t("settings.saved") : dirty ? t("settings.unsavedChanges") : ""}
          </span>
          <ActionButton tone="accent" onClick={handleSave} disabled={loading || !dirty || saving}>
            {saving ? t("settings.saving") : t("settings.save")}
          </ActionButton>
        </div>
      </CardContent>
    </Card>
  );
}

// Codex runtime 占位（决策 46）：agent 尚未支持，诚实空态——无伪造控件、不读后端。
// 未来 Codex 接入时把本组件换成真实配置主体 + 接 backend，runtime 段结构无需改动。
function CodexRuntimeContent() {
  const { t } = useT();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
        <p className="text-sm font-semibold text-on-surface-soft">
          {t("settings.codexRuntimeUnsupported")}
        </p>
        <p className="text-xs leading-5 text-on-surface-muted">
          {t("settings.codexRuntimeUnsupportedHint")}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Shared field primitives ──────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <p className="text-xs font-semibold text-on-surface-soft">{label}</p>
        {hint && <p className="text-xs leading-5 text-on-surface-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

// 经 OptionMenu 的 Radix `asChild` 注入 toggle / aria-expanded / data-state / onClick，
// 必须把 `...rest` 与 `ref` 透传到原生 <button>，否则 Trigger 不生效（点击无反应、无 aria-expanded）。
const SelectorTrigger = forwardRef<
  HTMLButtonElement,
  { label: string; disabled?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>
>(function SelectorTrigger({ label, disabled = false, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className="inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-neutral-line bg-surface-inset px-3 py-2.5 text-sm text-on-surface transition hover:border-on-surface-muted/40 disabled:cursor-default disabled:opacity-60"
      {...rest}
    >
      <span className="truncate text-left">{label}</span>
      <svg
        className="size-4 shrink-0 opacity-60"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
});

// tier → model 下拉：选项来自所选 provider 的可用模型列表（useQuery 缓存）。
// 拉取失败 / 上游 ok:false → 降级手填 ShellInput，保证用户始终能配置。
// 选项 = 拉取列表 ∪ 当前值；当前值不在列表时加 (custom) 标记保留旧值。
function ModelTierSelect({
  tier,
  value,
  providerId,
  protocol,
  onChange,
}: {
  tier: ClaudeModelTier;
  value: string;
  providerId: string;
  protocol: ProviderProtocol;
  onChange: (next: string) => void;
}) {
  const { t } = useT();
  const query = useQuery({
    queryKey: ["provider-models", providerId, protocol],
    queryFn: () => listProviderModels(providerId),
    enabled: !!providerId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (query.isError || (query.data && !query.data.ok)) {
    return (
      <ShellInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tier}
        aria-label={t(TIER_LABEL[tier])}
      />
    );
  }

  const fetched = query.data?.ok ? query.data.models : [];
  const fetchedSet = new Set(fetched);
  const options = fetchedSet.has(value) ? fetched : [value, ...fetched];
  const loading = query.isLoading && !query.data;
  const triggerLabel =
    value || (loading ? t("settings.modelSelectLoading") : t("settings.modelSelectPlaceholder"));

  return (
    <OptionMenu
      align="start"
      cancelLabel={t("cancel")}
      trigger={<SelectorTrigger label={triggerLabel} />}
      items={options.map((m) => ({
        label: m === value && !fetchedSet.has(m) ? `${m} ${t("settings.modelSelectCustom")}` : m,
        isActive: m === value,
        onSelect: () => onChange(m),
      }))}
    />
  );
}
