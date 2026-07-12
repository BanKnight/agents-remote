import { type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EFFORT_LEVELS,
  type ClaudeModelMapping,
  type ClaudeModelTier,
  type ClaudeRuntimeConfig,
  type EffortLevel,
  type ProviderConfigMasked,
  type UpdateProviderRequest,
} from "@agents-remote/shared";

import { useT } from "../i18n";
import type { TranslationKey } from "../i18n/types";
import {
  ActionButton,
  MobilePageHeader,
  ShellInput,
  ShellSectionLabel,
  shellSurfaceClasses,
} from "../components/shell/shell-primitives";
import { MobilePrimaryNav } from "../components/shell/mobile-primary-nav";
import { useConfirm } from "../components/shell/confirm-dialog";
import { ActionMenu } from "../components/ui/action-menu";
import { OptionMenu } from "../components/ui/option-menu";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import {
  createProvider,
  deleteProvider,
  getSettings,
  updateClaudeRuntime,
  updateProvider,
} from "../api/client";

const TIERS: readonly ClaudeModelTier[] = ["default", "opus", "sonnet", "haiku"];

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

/**
 * 设置页（设计文档 §7）。移动端一级底部 tab「设置」+ 桌面 /settings 同路由。
 * 两段：API Providers（凭证 CRUD）+ Claude runtime（provider 选择 / tier→model ID 映射 /
 * 1M 开关 / effort 档位）。runtime 配置在 spawn CLI 时作为全局默认初始值注入。
 */
export function SettingsRoute() {
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

  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
    >
      <MobilePageHeader title={t("settings.title")} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-4 pb-24 lg:pb-8">
          {settingsQuery.isLoading ? (
            <p className="text-sm text-on-surface-muted">…</p>
          ) : settings ? (
            <div className="flex flex-col gap-6">
              <ProvidersSection providers={settings.providers} onDelete={handleDelete} />
              <ClaudeRuntimeSection
                key={JSON.stringify(settings.runtimes.claude)}
                runtime={settings.runtimes.claude}
                providers={settings.providers}
              />
            </div>
          ) : (
            <p className="text-sm text-error">
              {settingsQuery.error?.message ?? t("api.settingsFetchFailed")}
            </p>
          )}
        </div>
      </div>
      <MobilePrimaryNav />
      {confirmHolder}
    </main>
  );
}

// ── Providers section ────────────────────────────────────────────────

function ProvidersSection({
  providers,
  onDelete,
}: {
  providers: ProviderConfigMasked[];
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
        <ActionButton tone="accent" onClick={() => setCreating(true)}>
          {t("settings.addProvider")}
        </ActionButton>
      </div>

      <Card>
        <CardContent className="flex flex-col p-2">
          {providers.length === 0 ? (
            <p className="px-2 py-3 text-sm text-on-surface-muted">{t("settings.noProviders")}</p>
          ) : (
            providers.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                onEdit={() => setEditing(p)}
                onDelete={() => onDelete(p)}
              />
            ))
          )}
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
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-2.5 transition hover:bg-surface-inset/50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-on-surface">{provider.label}</p>
        <p className="truncate font-mono text-xs text-on-surface-muted">
          {provider.apiKeyMasked}
          {provider.baseUrl ? ` · ${provider.baseUrl}` : ""}
        </p>
      </div>
      <ActionMenu
        align="end"
        cancelLabel={t("cancel")}
        trigger={
          <button
            type="button"
            aria-label={t("settings.editProvider")}
            className="inline-flex size-8 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-surface-inset hover:text-on-surface"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
              <circle cx="3" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="13" cy="8" r="1.5" />
            </svg>
          </button>
        }
        items={[
          { label: t("settings.editProvider"), onSelect: onEdit },
          {
            label: t("settings.deleteProvider"),
            variant: "destructive",
            onSelect: onDelete,
          },
        ]}
      />
    </div>
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
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
        // apiKey 留空 = 不传 = 不改（后端 L73-74）；baseUrl 始终传当前值（空 = 清除）。
        const input: UpdateProviderRequest = {
          label: trimmedLabel,
          baseUrl: baseUrl.trim(),
        };
        if (apiKey.trim()) input.apiKey = apiKey.trim();
        await updateProvider(provider.id, input);
      } else {
        await createProvider({
          label: trimmedLabel,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || undefined,
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
            <Field
              label={t("settings.apiKey")}
              hint={isEdit ? t("settings.apiKeyHint") : undefined}
            >
              <ShellInput
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEdit ? provider?.apiKeyMasked : "sk-ant-..."}
              />
            </Field>
            <Field label={t("settings.baseUrl")} hint={t("settings.baseUrlHint")}>
              <ShellInput
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.anthropic.com"
              />
            </Field>
          </div>

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

// ── Claude runtime section ───────────────────────────────────────────

function ClaudeRuntimeSection({
  runtime,
  providers,
}: {
  runtime: ClaudeRuntimeConfig;
  providers: ProviderConfigMasked[];
}) {
  const { t } = useT();
  const queryClient = useQueryClient();

  // 父组件用 key={JSON.stringify(runtime)} remount：runtime 内容变（save 成功 / providerId
  // 被后端清）才重置 state；provider CRUD 不改 runtime 时 key 不变，用户编辑中的改动保留。
  const [providerId, setProviderId] = useState(runtime.providerId);
  const [modelMapping, setModelMapping] = useState<ClaudeModelMapping>(runtime.modelMapping);
  const [enable1m, setEnable1m] = useState(runtime.enable1mContext);
  const [effort, setEffort] = useState<EffortLevel>(runtime.effort);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const dirty =
    providerId !== runtime.providerId ||
    effort !== runtime.effort ||
    enable1m !== runtime.enable1mContext ||
    JSON.stringify(modelMapping) !== JSON.stringify(runtime.modelMapping);

  const handleSave = async () => {
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

  return (
    <section className="flex flex-col gap-3">
      <div>
        <ShellSectionLabel>{t("settings.runtime")}</ShellSectionLabel>
        <p className="mt-1 text-xs leading-5 text-on-surface-muted">{t("settings.runtimeHint")}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-3">
          <Field label={t("settings.runtimeProvider")}>
            <OptionMenu
              align="start"
              cancelLabel={t("cancel")}
              trigger={<SelectorTrigger label={selectedLabel} />}
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
            <p className="text-xs font-semibold text-on-surface-soft">
              {t("settings.modelMapping")}
            </p>
            <p className="text-xs leading-5 text-on-surface-muted">
              {t("settings.modelMappingHint")}
            </p>
            {TIERS.map((tier) => (
              <div key={tier} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-on-surface-muted">
                  {t(TIER_LABEL[tier])}
                </span>
                <ShellInput
                  value={modelMapping[tier]}
                  onChange={(e) => setModelMapping({ ...modelMapping, [tier]: e.target.value })}
                  placeholder={tier}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enable1m}
            onClick={() => setEnable1m(!enable1m)}
            className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition hover:bg-surface-inset/40"
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
              trigger={<SelectorTrigger label={t(EFFORT_LABEL[effort])} />}
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
            <ActionButton tone="accent" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? t("settings.saving") : t("settings.save")}
            </ActionButton>
          </div>
        </CardContent>
      </Card>
    </section>
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

function SelectorTrigger({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-line bg-surface-inset px-3 py-2.5 text-sm text-on-surface transition hover:border-on-surface-muted/40"
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
}
