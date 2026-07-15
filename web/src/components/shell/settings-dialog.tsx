import { forwardRef, type ButtonHTMLAttributes, type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EFFORT_LEVELS,
  type ClaudeModelMapping,
  type ClaudeModelTier,
  type ClaudePresetMasked,
  type CreateClaudePresetRequest,
  type EffortLevel,
  type ListProviderModelsResponse,
  type UpdateClaudePresetRequest,
} from "@agents-remote/shared";

import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import {
  ActionButton,
  IconMarker,
  ListGroup,
  ListRow,
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
  createClaudePreset,
  deleteClaudePreset,
  getSettings,
  listPresetModels,
  testPresetModels,
  updateClaudePreset,
  updateClaudeRuntime,
} from "../../api/client";

const TIERS: readonly ClaudeModelTier[] = ["default", "opus", "sonnet", "haiku"];

// 新建预设的模型映射默认值：全 tier 别名透传（与 v1 默认 runtime.modelMapping 一致），
// 用户可在 PresetDialog 内逐 tier 改成具体 ID。定义在此避免 magic literal。
const DEFAULT_PRESET_MAPPING: ClaudeModelMapping = {
  default: "sonnet",
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
};

// settings.runtimes.claude 的完整视图（含 presets）——比 shared 的 ClaudeRuntimeConfig 多
// presets[]（presets 与 runtime 三旋钮同属 runtimes.claude 对象）。加载态占位让结构即时渲染。
type ClaudeRuntimeSettings = {
  presets: ClaudePresetMasked[];
  activePresetId: string;
  enable1mContext: boolean;
  effort: EffortLevel;
};

const EMPTY_CLAUDE: ClaudeRuntimeSettings = {
  presets: [],
  activePresetId: "",
  enable1mContext: false,
  effort: "high",
};

/** presets 列表加载骨架行数（对齐真实 PresetRow 高度，2 行传达列表结构即可）。 */
const PRESET_SKELETON_ROW_COUNT = 2;

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

/** 设置页两层结构的 section 标识（决策 48，Apple 设置范式）。外壳持有、SettingsContent 接 props。 */
export type SettingsSection = "root" | "claude" | "general";

/** 各 section 的 header 标题（桌面弹窗 header / 移动 MobilePageHeader 共用）。 */
export const sectionTitle = (section: SettingsSection, t: ReturnType<typeof useT>["t"]): string => {
  switch (section) {
    case "claude":
      return t("settings.section.claude");
    case "general":
      return t("settings.section.general");
    default:
      return t("settings.title");
  }
};

/**
 * 设置内容（桌面 `SettingsDialog` / 移动 `SettingsRoute` 共享，决策 44 + 48）。
 * 两层结构（Apple 设置范式）：root = 2 个入口胶囊（Claude 运行时 / 通用），
 * 点入 detail = 该项具体配置（不再有胶囊）。`activeSection` 由外壳持有、本组件接 props
 * 单向流——桌面弹窗 header / 移动 MobilePageHeader 据同一 state 渲染返回。
 * 不含外壳——由调用方包：移动端 `SettingsRoute` = main + MobilePageHeader + 本组件 +
 * MobilePrimaryNav；桌面端 `SettingsDialog` = Dialog + DialogContent + 本组件。
 */
export function SettingsContent({
  activeSection = "root",
  onNavigate,
}: {
  activeSection?: SettingsSection;
  onNavigate: (section: SettingsSection) => void;
}) {
  const { t } = useT();

  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const settings = settingsQuery.data?.settings;
  const loading = settingsQuery.isLoading;

  // 固定结构即时渲染（VSCode/macOS prefs 风格）：加载中也出框架，加载完填真实值。
  // 失败才替换为错误文案。
  if (!loading && !settings) {
    return (
      <p className="text-sm text-error">
        {settingsQuery.error?.message ?? t("api.settingsFetchFailed")}
      </p>
    );
  }

  const claude = settings?.runtimes.claude ?? EMPTY_CLAUDE;

  let body: ReactNode;
  switch (activeSection) {
    case "claude":
      body = (
        <ClaudeRuntimeContent
          // key 只随 runtime 级三旋钮变（不含 presets）：preset CRUD 改 presets 不触发
          // remount，用户在激活选择/effort 的未保存编辑得以保留；runtime Save 成功或激活预设
          // 被级联清空时才 remount 重置 state。
          key={`${claude.activePresetId}|${claude.enable1mContext}|${claude.effort}`}
          claude={claude}
          loading={loading}
        />
      );
      break;
    case "general":
      body = <GeneralSection />;
      break;
    default:
      body = <SettingsRootView onNavigate={onNavigate} />;
  }

  return body;
}

/**
 * 第一层总入口（决策 48）：grouped Card + 2 个 ListRow 胶囊，整行点击进 detail。
 * 复用 DESIGN.md `list` grouped 契约（与预设列表同款）。title-only + 右 chevron
 * （Apple 设置一级项范式）。
 */
function SettingsRootView({ onNavigate }: { onNavigate: (section: SettingsSection) => void }) {
  const { t } = useT();
  const sections: {
    section: SettingsSection;
    title: string;
    icon: "anthropic" | "info";
    tone: "warning" | "muted";
  }[] = [
    { section: "claude", title: t("settings.section.claude"), icon: "anthropic", tone: "warning" },
    { section: "general", title: t("settings.section.general"), icon: "info", tone: "muted" },
  ];
  return (
    <Card className="gap-0 border border-neutral-line bg-surface py-0 ring-0">
      <CardContent className="p-0">
        <ListGroup ariaLabel={t("settings.title")}>
          {sections.map(({ section, title, icon, tone }) => (
            <ListRow
              key={section}
              title={title}
              onClick={() => onNavigate(section)}
              marker={
                <IconMarker size="sm" tone={tone}>
                  <ShellIcon className="h-4 w-4" name={icon} />
                </IconMarker>
              }
              meta={<SettingsChevron />}
            />
          ))}
        </ListGroup>
      </CardContent>
    </Card>
  );
}

/** 设置 root 胶囊右侧的进入指示 chevron（Apple 设置范式，区别于 PresetRow actions 的 ⋯ 动作）。 */
function SettingsChevron() {
  return (
    <svg
      className="h-4 w-4 text-on-surface-muted"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 通用段（决策 48）：诚实占位——无伪造配置，后续版本补充只读系统信息。 */
function GeneralSection() {
  const { t } = useT();
  return (
    <Card className="border border-neutral-line bg-surface ring-0">
      <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
        <p className="text-sm font-semibold text-on-surface-soft">
          {t("settings.section.general")}
        </p>
        <p className="text-xs leading-5 text-on-surface-muted">{t("settings.generalHint")}</p>
      </CardContent>
    </Card>
  );
}

/**
 * 桌面设置弹窗（决策 44）：`ActivityBar` 设置按钮 `useState` 触发，居中 modal。
 * `ui/dialog.tsx` 的 `DialogContent` 只提供 Portal + Overlay（模糊背景）+ Content 容器
 * + Radix dismiss/focus-trap——**不内置卡片视觉与关闭按钮**，调用方在 Content 内自行
 * 包一层卡片 div（对齐 `confirm-dialog` 桌面态 / DESIGN.md `dialog` 条目居中形态）。
 * 卡片限高 `max-h-[85vh] overflow-hidden` 保持圆角，内容区 `overflow-y-auto` 承载两段。
 * 嵌套 `PresetDialog` / confirm Dialog 走受控 open（非 trigger asChild），Radix 支持嵌套。
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  // 两层结构（决策 48）：state 在外壳，header 与 SettingsContent 共享。Dialog 关闭即 unmount
  // → 下次打开自然回 root（不停在 detail）。
  const [activeSection, setActiveSection] = useState<SettingsSection>("root");
  const isRoot = activeSection === "root";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div
          className={`flex h-[75vh] flex-col overflow-hidden rounded-2xl shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <header className="flex shrink-0 items-center gap-2 px-5 pt-5">
            {isRoot ? null : (
              <button
                type="button"
                aria-label={t("settings.back")}
                onClick={() => setActiveSection("root")}
                className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M10 3L5 8l5 5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold text-on-surface">
              {isRoot ? t("settings.title") : sectionTitle(activeSection, t)}
            </DialogTitle>
            <button
              type="button"
              aria-label={t("session.close")}
              onClick={onClose}
              className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
            >
              <ShellIcon className="h-4 w-4" name="close" />
            </button>
          </header>
          <DialogDescription className="sr-only">{t("settings.title")}</DialogDescription>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <SettingsContent activeSection={activeSection} onNavigate={setActiveSection} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Claude runtime detail：激活预设 + effort/1m + 预设列表 ────────────────

/**
 * Claude 运行时段（决策 4：UI 合并进运行时）。顶部 = 激活预设选择 + effort/1M（runtime 级，
 * Save 持久化 activePresetId/enable1mContext/effort）；下方 = 预设列表 CRUD（PresetListSection，
 * 每个预设自带 baseUrl/key/modelMapping，CRUD 即时持久化）。key 只随 runtime 三旋钮变
 * （见 SettingsContent），preset CRUD 不触发 remount。
 */
function ClaudeRuntimeContent({
  claude,
  loading = false,
}: {
  claude: ClaudeRuntimeSettings;
  loading?: boolean;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();

  const [activePresetId, setActivePresetId] = useState(claude.activePresetId);
  const [enable1m, setEnable1m] = useState(claude.enable1mContext);
  const [effort, setEffort] = useState<EffortLevel>(claude.effort);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    !loading &&
    (activePresetId !== claude.activePresetId ||
      effort !== claude.effort ||
      enable1m !== claude.enable1mContext);

  const handleSave = async () => {
    if (loading) return;
    setError(null);
    setSaving(true);
    try {
      await updateClaudeRuntime({
        activePresetId,
        enable1mContext: enable1m,
        effort,
      });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const selectedLabel = activePresetId
    ? (claude.presets.find((p) => p.id === activePresetId)?.label ?? activePresetId)
    : t("settings.activePresetNone");

  return (
    <div className="flex flex-col gap-3">
      <Card className="border border-neutral-line bg-surface ring-0">
        <CardContent className="flex flex-col gap-4 p-3">
          <Field label={t("settings.activePreset")} hint={t("settings.activePresetHint")}>
            <OptionMenu
              align="start"
              cancelLabel={t("cancel")}
              trigger={<SelectorTrigger label={selectedLabel} disabled={loading} />}
              items={[
                {
                  label: t("settings.activePresetNone"),
                  isActive: activePresetId === "",
                  onSelect: () => setActivePresetId(""),
                },
                ...claude.presets.map((p) => ({
                  label: p.label,
                  isActive: p.id === activePresetId,
                  onSelect: () => setActivePresetId(p.id),
                })),
              ]}
            />
          </Field>

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

          {error && <p className="text-xs text-error">{error}</p>}
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

      <PresetListSection presets={claude.presets} loading={loading} />
    </div>
  );
}

/**
 * 预设列表段（决策 4：预设 CRUD 合并进 Claude 运行时段）。Apple Settings grouped Card +
 * 整行 ListRow 点击进编辑；新增/编辑走 PresetDialog；删除走 confirm + deleteClaudePreset，
 * 即时持久化 + invalidate settings。删除激活预设的级联清空由后端保证。
 */
function PresetListSection({
  presets,
  loading = false,
}: {
  presets: ClaudePresetMasked[];
  loading?: boolean;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { confirm, holder: confirmHolder } = useConfirm();
  const [editing, setEditing] = useState<ClaudePresetMasked | null>(null);
  const [creating, setCreating] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: deleteClaudePreset,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const handleDelete = async (preset: ClaudePresetMasked) => {
    const ok = await confirm({
      title: t("settings.deletePreset"),
      message: t("settings.deletePresetConfirm", { label: preset.label }),
      confirmLabel: t("settings.deletePreset"),
      cancelLabel: t("cancel"),
      tone: "danger",
    });
    if (ok) await deleteMutation.mutateAsync(preset.id);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <ShellSectionLabel>{t("settings.presets")}</ShellSectionLabel>
          <p className="mt-1 text-xs leading-5 text-on-surface-muted">
            {t("settings.presetsHint")}
          </p>
        </div>
        <ActionButton tone="accent" onClick={() => setCreating(true)} disabled={loading}>
          {t("settings.addPreset")}
        </ActionButton>
      </div>

      <Card className="gap-0 border border-neutral-line bg-surface py-0 ring-0">
        <CardContent className="p-0">
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div aria-hidden="true" className={listGroupClasses()}>
                {Array.from({ length: PRESET_SKELETON_ROW_COUNT }, (_, i) => (
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
            ) : presets.length === 0 ? (
              <p className="px-3 py-3 text-sm text-on-surface-muted">{t("settings.noPresets")}</p>
            ) : (
              <ListGroup ariaLabel={t("settings.presets")}>
                {presets.map((p) => (
                  <PresetRow
                    key={p.id}
                    preset={p}
                    onEdit={() => setEditing(p)}
                    onDelete={() => handleDelete(p)}
                  />
                ))}
              </ListGroup>
            )}
          </div>
        </CardContent>
      </Card>

      {(creating || editing) && (
        <PresetDialog
          preset={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
      {confirmHolder}
    </section>
  );
}

function PresetRow({
  preset,
  onEdit,
  onDelete,
}: {
  preset: ClaudePresetMasked;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const subtitle = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
      {preset.baseUrl ? <span className="text-on-surface">{preset.baseUrl}</span> : null}
      {preset.apiKeyMasked ? (
        <span className="text-on-surface-muted">{preset.apiKeyMasked}</span>
      ) : null}
    </span>
  );

  return (
    <ListRow
      title={preset.label}
      subtitle={subtitle}
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
                aria-label={t("settings.deletePreset")}
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
                label: t("settings.deletePreset"),
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

/**
 * 预设编辑/新建弹窗。预设 = baseUrl + apiKey + 4-tier 模型映射（与端点绑定一体）。
 * 模型发现凭证源（ModelTierSelect + 测试连接）：编辑态未改凭证（无内联 apiKey）→ listPresetModels
 * 用已保存 preset 凭证；新建态或改了 apiKey/baseUrl → testPresetModels 内联凭证。两者共享
 * 同一 useQuery（queryKey 含凭证签名），凭证变自动重拉；测试连接按钮 = refetch。
 */
function PresetDialog({
  preset,
  onClose,
}: {
  preset: ClaudePresetMasked | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const isEdit = preset !== null;
  const presetId = preset?.id ?? null;

  const [label, setLabel] = useState(preset?.label ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(preset?.baseUrl ?? "");
  const [modelMapping, setModelMapping] = useState<ClaudeModelMapping>(
    preset?.modelMapping ?? DEFAULT_PRESET_MAPPING,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 模型发现：queryKey 含 presetId + baseUrl + apiKey 签名，凭证变即重拉。编辑态未输内联 key
  // → listPresetModels 回退已保存原 key（原 key 永不出 api 进程，前端只持 masked）。
  const trimmedBaseUrl = baseUrl.trim();
  const hasInlineKey = !!apiKey.trim();
  const modelsQuery = useQuery({
    queryKey: ["preset-models", presetId ?? "new", trimmedBaseUrl, hasInlineKey ? "k" : "n"],
    queryFn: async (): Promise<ListProviderModelsResponse> => {
      if (presetId && !hasInlineKey) return listPresetModels(presetId);
      return testPresetModels({
        ...(presetId ? { id: presetId } : {}),
        ...(hasInlineKey ? { apiKey: apiKey.trim() } : {}),
        ...(trimmedBaseUrl ? { baseUrl: trimmedBaseUrl } : {}),
      });
    },
    enabled: !!trimmedBaseUrl,
    staleTime: 5 * 60_000,
    retry: false,
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
    if (!trimmedBaseUrl) {
      setError(t("settings.baseUrlRequired"));
      return;
    }
    setSaving(true);
    try {
      if (isEdit && preset) {
        // apiKey 留空 = 不传 = 不改（后端回退原 key）；baseUrl 必填；modelMapping 整体传。
        const input: UpdateClaudePresetRequest = {
          label: trimmedLabel,
          baseUrl: trimmedBaseUrl,
          modelMapping,
        };
        if (apiKey.trim()) input.apiKey = apiKey.trim();
        await updateClaudePreset(preset.id, input);
      } else {
        const input: CreateClaudePresetRequest = {
          label: trimmedLabel,
          apiKey: apiKey.trim(),
          baseUrl: trimmedBaseUrl,
          modelMapping,
        };
        await createClaudePreset(input);
      }
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const models = modelsQuery.data?.ok ? modelsQuery.data.models : [];
  const modelsLoading = modelsQuery.isFetching && !modelsQuery.data;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div
          className={`flex max-h-[85vh] flex-col gap-4 overflow-hidden rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <DialogTitle className="text-base font-semibold text-on-surface">
            {isEdit ? t("settings.editPreset") : t("settings.newPreset")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? t("settings.editPreset") : t("settings.newPreset")}
          </DialogDescription>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            <Field label={t("settings.label")}>
              <ShellInput
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("settings.labelHint")}
              />
            </Field>
            <Field label={t("settings.baseUrl")} hint={t("settings.baseUrlHint")}>
              <ShellInput
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com"
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
                placeholder={isEdit ? preset?.apiKeyMasked : "sk-ant-..."}
                autoComplete="off"
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
                  <ModelTierSelect
                    tier={tier}
                    value={modelMapping[tier]}
                    models={models}
                    loading={modelsLoading}
                    onChange={(v) => setModelMapping({ ...modelMapping, [tier]: v })}
                  />
                </div>
              ))}
            </div>

            {/* 测试连接：refetch modelsQuery，与 modelMapping 下拉共享同一凭证源。凭证不全
                （baseUrl 空）时按钮禁用。上游失败 → {ok:false}，前端展示测试结果而非报错 toast。 */}
            <div className="flex flex-col gap-1.5">
              <ActionButton
                tone="muted"
                onClick={() => modelsQuery.refetch()}
                disabled={modelsQuery.isFetching || saving || !trimmedBaseUrl}
              >
                {modelsQuery.isFetching
                  ? t("settings.testConnectionRunning")
                  : t("settings.testConnection")}
              </ActionButton>
              {modelsQuery.data && (
                <p className={`text-xs ${modelsQuery.data.ok ? "text-success" : "text-error"}`}>
                  {modelsQuery.data.ok
                    ? modelsQuery.data.models.length > 0
                      ? t("settings.testConnectionOk", { count: modelsQuery.data.models.length })
                      : t("settings.testConnectionOkEmpty")
                    : t("settings.testConnectionFailed", { error: modelsQuery.data.error ?? "" })}
                </p>
              )}
              {modelsQuery.data?.ok && modelsQuery.data.models.length > 0 && (
                <p className="truncate font-mono text-[11px] text-on-surface-muted">
                  {modelsQuery.data.models.slice(0, 5).join(" · ")}
                </p>
              )}
            </div>
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

// tier → model 下拉：选项来自 PresetDialog 层基于凭证拉取的可用模型列表。
// 模型列表空（凭证不全 / 上游 ok:false / 拉取失败）→ 降级手填 ShellInput，保证用户始终能配置。
// 选项 = 拉取列表 ∪ 当前值；当前值不在列表时加 (custom) 标记保留旧值。
function ModelTierSelect({
  tier,
  value,
  models,
  loading,
  onChange,
}: {
  tier: ClaudeModelTier;
  value: string;
  models: string[];
  loading: boolean;
  onChange: (next: string) => void;
}) {
  const { t } = useT();
  const unavailable = !loading && models.length === 0;
  if (unavailable) {
    return (
      <ShellInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tier}
        aria-label={t(TIER_LABEL[tier])}
      />
    );
  }

  const fetchedSet = new Set(models);
  const options = fetchedSet.has(value) ? models : [value, ...models];
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
