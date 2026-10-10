import { forwardRef, type ButtonHTMLAttributes, type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AUTO_RETRY_DEFAULT,
  EFFORT_LEVELS,
  PI_PROVIDER_APIS,
  type AcpCredentialsMasked,
  type AcpRuntimeConfigMasked,
  type AgentProviderInfo,
  type ClaudeModelMapping,
  type ClaudeModelTier,
  type ClaudePresetMasked,
  type CreateClaudePresetRequest,
  type CreatePiPresetRequest,
  type EffortLevel,
  type GetSettingsResponse,
  type ListProviderModelsResponse,
  type PiPresetMasked,
  type PiProviderApi,
  type PiProviderAuthType,
  type UpdateAcpRuntimeRequest,
  type UpdateClaudePresetRequest,
  type UpdatePiPresetRequest,
  type UpdatePiRuntimeRequest,
} from "@agents-remote/shared";

import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import { clearAuthOk } from "../../lib/auth-storage";
import { isStandaloneDisplay } from "../../lib/display-mode";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useTheme } from "../../theme";
import { toggleSwitchKnobClasses, toggleSwitchTrackClasses } from "./shell-primitives";
import { ShellIcon } from "./icons";
import { useConfirm } from "./confirm-dialog";
import { MobileSheet } from "./mobile-sheet";
import { ActionMenu } from "../ui/action-menu";
import { OptionMenu } from "../ui/option-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import {
  createClaudePreset,
  createPiPreset,
  deleteClaudePreset,
  deletePiPreset,
  fetchAgentProviders,
  getSettings,
  listPiProviders,
  logout,
  listPresetModels,
  testPresetModels,
  updateAcpRuntime,
  updateClaudePreset,
  updateClaudeRuntime,
  updatePiPreset,
  updatePiRuntime,
} from "../../api/client";

const TIERS: readonly ClaudeModelTier[] = ["default", "opus", "sonnet", "haiku"];

// ── v2 表单原语（设置二级换代：原型缺位部分按 Apple Settings 语言 + token 自行设计）──
// 输入框：elevated2 内嵌面 + sep-strong 描边 + r10（对齐 retry .fld 形态，instance-area）。
const settingsInputClasses =
  "w-full rounded-[10px] border border-sep-strong bg-elevated2 px-3 py-2 text-sm text-ink-1 placeholder:text-ink-2 transition focus:border-primary focus:outline-none";
// 主色实心钮（保存）：bg-primary + on-accent 文字 + 按压 scale（移动动效批统一契约）。
const settingsPrimaryButtonClasses =
  "cursor-pointer rounded-[10px] bg-primary px-4 py-1.5 text-[13px] font-semibold text-on-accent transition-[scale,background-color,opacity] active:scale-[0.98] disabled:cursor-default disabled:opacity-40";
// 次级面钮（测试连接）：elevated2 面实感，弱于主钮一档。
const settingsGhostButtonClasses =
  "cursor-pointer rounded-[10px] border border-sep-strong bg-elevated2 px-3 py-1.5 text-[13px] text-ink-1 transition-[scale,background-color] active:scale-[0.98] disabled:cursor-default disabled:opacity-40";
// 文字钮（取消）：无面 muted 文字 + hover 淡底。
const settingsTextButtonClasses =
  "cursor-pointer rounded-[10px] px-3 py-1.5 text-[13px] text-ink-2 transition-[scale,background-color] hover:bg-ink-1/5 active:scale-[0.98]";

/** 行内副文本（12px ink-2）——值行/开关行/输入行的 hint 与 sgroup 脚注共用档。 */
const settingsHintClasses = "mt-0.5 block text-xs leading-5 text-ink-2";

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

/** 设置页两层结构的 section 标识（决策 48，Apple 设置范式）。外壳持有、SettingsContent 接 props。 */
export type SettingsSection = "root" | "claude" | "pi" | "acp" | "general";

/** 各 section 的 header 标题（桌面弹窗 header / 移动 MobilePageHeader 共用）。 */
export const sectionTitle = (section: SettingsSection, t: ReturnType<typeof useT>["t"]): string => {
  switch (section) {
    case "claude":
      return t("settings.section.claude");
    case "pi":
      return t("settings.section.pi");
    case "acp":
      return t("settings.section.acp");
    case "general":
      return t("settings.section.general");
    default:
      return t("settings.title");
  }
};

/**
 * 设置内容（桌面 `SettingsMainPage` / 移动 `SettingsRoute` 共享，决策 44 + 48）。
 * 两层结构（Apple 设置范式）：root = 2 个入口胶囊（Claude 运行时 / 通用），
 * 点入 detail = 该项具体配置（不再有胶囊）。`activeSection` 由外壳持有、本组件接 props
 * 单向流——桌面弹窗 header / 移动 MobilePageHeader 据同一 state 渲染返回。
 * 不含外壳——由调用方包：移动端 `SettingsRoute` = main + MobilePageHeader + 本组件 +
 * MobilePrimaryNav；桌面端 `SettingsMainPage` = main 整页（mhead + 560px col）+ 本组件。
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
      <p className="text-[13px] text-error">
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
    case "pi":
      body = (
        <PiRuntimeContent
          // key 只随 activePresetId 变（preset CRUD 不触发 remount）：用户在激活选择的未保存
          // 编辑得以保留；激活预设被级联清空时才 remount 重置 state。
          key={`${settings?.runtimes.pi?.activePresetId ?? ""}`}
          pi={settings?.runtimes.pi}
          loading={loading}
        />
      );
      break;
    case "acp":
      body = <AcpRuntimeSection acp={settings?.runtimes.acp} loading={loading} />;
      break;
    case "general":
      body = <GeneralSection />;
      break;
    default:
      body = <SettingsRootView settings={settings} onNavigate={onNavigate} />;
  }

  return body;
}

/**
 * 第一层总入口（决策 48）：sect + sgroup 分组（v2 设置分组语言单源），整行点击进 detail。
 * title-only + 右 chevron（Apple 设置一级项范式）。
 */
function SettingsRootView({
  settings,
  onNavigate,
}: {
  settings: GetSettingsResponse["settings"] | undefined;
  onNavigate: (section: SettingsSection) => void;
}) {
  const { t, pref: langPref } = useT();
  const { theme } = useTheme();
  const [standalone] = useState(() => isStandaloneDisplay());
  const { confirm, holder: confirmHolder } = useConfirm();
  const logoutMutation = useLogout();

  /** 值行：整行点击进 detail（无 detail 的行不传 onClick，渲染为静态行）。
   *  可点行的值内缀 `.ar` ›（07 原型：通用/RUNTIME 行有 chevron、自动重试/PWA 静态行无）。 */
  const row = (label: ReactNode, value: ReactNode, onClick?: () => void, valueClass?: string) => {
    const content = (
      <>
        {label}
        {value === null ? null : (
          <span className={`v${valueClass ? ` ${valueClass}` : ""}`}>
            {value}
            {onClick ? (
              <span aria-hidden="true" className="ar">
                ›
              </span>
            ) : null}
          </span>
        )}
      </>
    );
    return onClick ? (
      <button className="setrow cursor-pointer" onClick={onClick} type="button">
        {content}
      </button>
    ) : (
      <div className="setrow">{content}</div>
    );
  };

  const claudeActive = settings?.runtimes.claude.activePresetId
    ? (settings.runtimes.claude.presets.find(
        (p) => p.id === settings.runtimes.claude.activePresetId,
      )?.label ?? t("settings.activePresetNone"))
    : t("settings.activePresetNone");
  const piActive = settings?.runtimes.pi.activePresetId
    ? (settings.runtimes.pi.presets.find((p) => p.id === settings.runtimes.pi.activePresetId)
        ?.label ?? t("settings.piActivePresetNone"))
    : t("settings.piActivePresetNone");
  const hasFirecrawl = Boolean(settings?.runtimes.pi.firecrawlApiKeyMasked);
  // ACP 已配置 provider 数（有据：acp 掩码配置里 hasApiKey 的项）。
  const acpConfiguredCount = Object.values(settings?.runtimes.acp ?? {}).filter(
    (c) => c?.hasApiKey,
  ).length;

  const themeLabel =
    theme === "system" ? t("theme.system") : theme === "light" ? t("theme.light") : t("theme.dark");
  const langLabel =
    langPref === "system"
      ? t("theme.system")
      : langPref === "zh"
        ? t("settings.langZh")
        : t("settings.langEn");

  const handleLogout = () => {
    void confirm({
      title: t("settings.logout"),
      message: t("settings.logoutConfirm"),
      confirmLabel: t("settings.logout"),
      cancelLabel: t("cancel"),
      tone: "danger",
    }).then((ok) => {
      if (ok) logoutMutation.mutate();
    });
  };

  return (
    <div className="flex flex-col">
      {/* 通用（07 第一组）：外观 / 语言 —— 值行 + › 进 general detail */}
      <div className="sect">{t("settings.section.general")}</div>
      <div className="sgroup">
        {row(t("theme.label"), <>{themeLabel}</>, () => onNavigate("general"))}
        {row(t("settings.lang"), <>{langLabel}</>, () => onNavigate("general"))}
      </div>

      {/* RUNTIME 预设（07 第二组）：新建实例时可选；全局默认，会话 ℹ 可覆盖 */}
      <div className="sect">{t("settings.runtimePresets")}</div>
      <div className="sgroup">
        {row(t("settings.claudePreset"), <>{claudeActive}</>, () => onNavigate("claude"))}
        {row(t("settings.piProvider"), <>{piActive}</>, () => onNavigate("pi"))}
        {row(
          t("settings.firecrawlKey"),
          hasFirecrawl ? t("settings.keySet") : t("settings.keyUnset"),
          () => onNavigate("pi"),
          hasFirecrawl ? "ok" : undefined,
        )}
        {/* ACP 段入口（07 原型只画 3 行，但 ACP 是真实 runtime——无入口则配置能力被割裂，
            且与 §6.8 自述「四行含 ACP」一致）。值 = 已配置 provider 数（有据：acp 掩码配置）。 */}
        {row(
          t("settings.section.acp"),
          <>
            {acpConfiguredCount > 0
              ? t("settings.acpConfiguredCount", { n: acpConfiguredCount })
              : t("settings.acpNotConfigured")}
          </>,
          () => onNavigate("acp"),
          acpConfiguredCount > 0 ? "ok" : undefined,
        )}
      </div>

      {/* 自动重试默认（07 第三组）：真实默认值静态展示（会话 ℹ 可覆盖） */}
      <div className="sect">{t("settings.autoRetryDefaults")}</div>
      <div className="sgroup">
        {row(
          t("settings.retryMaxLabel"),
          <>{t("settings.retryMaxValue", { n: AUTO_RETRY_DEFAULT.maxPerWindow })}</>,
        )}
        {row(
          t("settings.retryDelay"),
          <>
            {t("settings.retryDelayValue", {
              s: Math.round(AUTO_RETRY_DEFAULT.delayMs / 1000),
              m: Math.round(AUTO_RETRY_DEFAULT.windowMs / 60_000),
            })}
          </>,
        )}
        {row(
          t("settings.retryMessage"),
          <>{`「${t("session.autoRetry.defaultMessage")}」`}</>,
          undefined,
          "mono",
        )}
      </div>

      {/* 服务器（07 第四组）：地址 + PWA 安装态；连接状态/版本无数据源不画（§6.8） */}
      <div className="sect">{t("settings.section.server")}</div>
      <div className="sgroup">
        {row(<span className="font-mono">{window.location.host}</span>, null)}
        {row(
          t("settings.pwa"),
          <>{standalone ? t("settings.pwaInstalled") : t("settings.pwaBrowser")}</>,
          undefined,
          standalone ? "ok" : undefined,
        )}
      </div>

      <button className="logout" onClick={handleLogout} type="button">
        {t("settings.logout")}
      </button>
      {logoutMutation.error ? (
        <p className="mx-4 mt-3 text-center text-caption text-error">{t("api.logoutFailed")}</p>
      ) : null}
      {confirmHolder}
    </div>
  );
}

/**
 * 通用段 detail（决策 48 + 07 原型「外观 / 语言」两行）：外观三态（跟随系统/明亮/暗黑，
 * `themeAtom` 持久化）+ 语言三态（跟随系统/中文/English，偏好写 i18n localStorage）。
 * 两者同构：都是「全局默认、覆盖系统偏好」的三态选择。
 * v2 二级换代：sect + sgroup 分组（一级同构）+ `.segc` 三态分段（fill-segmented 底 +
 * segmented-thumb 活动块），hint 作 kfoot 脚注（原型未覆盖二级，按 Apple 语言补位）。
 */
function GeneralSection() {
  const { t, pref: langPref, setLang } = useT();
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex flex-col">
      <div className="sect">{t("theme.label")}</div>
      <div className="sgroup">
        <div className="py-3">
          <div aria-label={t("theme.label")} className="segc w-full" role="tablist">
            {(
              [
                { value: "system", label: t("theme.system") },
                { value: "light", label: t("theme.light") },
                { value: "dark", label: t("theme.dark") },
              ] as const
            ).map((opt) => (
              <button
                aria-selected={theme === opt.value}
                className={theme === opt.value ? "on" : ""}
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                role="tab"
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="kfoot mx-4">{t("theme.hint")}</p>

      <div className="sect">{t("settings.lang")}</div>
      <div className="sgroup">
        <div className="py-3">
          <div aria-label={t("settings.lang")} className="segc w-full" role="tablist">
            {(
              [
                { value: "system", label: t("theme.system") },
                { value: "zh", label: t("settings.langZh") },
                { value: "en", label: t("settings.langEn") },
              ] as const
            ).map((opt) => (
              <button
                aria-selected={langPref === opt.value}
                className={langPref === opt.value ? "on" : ""}
                key={opt.value}
                onClick={() => setLang(opt.value)}
                role="tab"
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="kfoot mx-4">{t("settings.langHint")}</p>
    </div>
  );
}

/** PWA standalone（已安装）检测——见 `lib/display-mode.ts`（AuthGate 共用同实现）。 */

/**
 * 退出登录（07 pin ④）：调 POST /api/auth/logout 清 HttpOnly cookie + 本地免登标记，
 * 随后失效 auth query（AuthGate 立即回登录帧）。服务端数据与会话不受影响。
 * onSettled（成败都失效）：成功 → 回登录帧；失败 → 与服务端真实状态对齐
 *（cookie 未清则如实留在应用），错误经调用方行内提示可见（security review P2）。
 */
function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      clearAuthOk();
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

/**
 * 桌面设置 main 整页（07m 原型，v2 M9 批次 d）：并入 mainPage 体系取代 SettingsDialog——
 * side 恒定 sidewin（footnav 设置项 .on 激活由 Sidebar 判定），main = mhead 标题 +
 * 560px 居中 col（对齐原型 .col width:560px margin:0 auto）。两层结构契约同移动
 * SettingsRoute（决策 48：activeSection 外壳持 state，切走 unmount 自然回 root）；
 * detail 态 mhead 加返回箭头、无关闭钮（离开 = footnav 导航别处）。
 */
export function SettingsMainPage() {
  const { t } = useT();
  const [activeSection, setActiveSection] = useState<SettingsSection>("root");
  const isRoot = activeSection === "root";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 px-5 pt-2.5">
        {isRoot ? null : (
          <button
            type="button"
            aria-label={t("settings.back")}
            onClick={() => setActiveSection("root")}
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 transition hover:bg-ink-1/5 hover:text-ink-1 active:bg-ink-1/10"
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
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-ink-1">
          {isRoot ? t("settings.title") : sectionTitle(activeSection, t)}
        </h1>
      </header>
      {/* root/detail 态内容都自带 16px 边距（.sect/.sgroup margin，对齐 07/07m 原型）→
          容器不再叠 padding（v2 二级换代：detail 段同用分组语言）。 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto w-full max-w-[560px] pb-6 ${isRoot ? "pt-2.5" : "pt-3"}`}>
          <SettingsContent activeSection={activeSection} onNavigate={setActiveSection} />
        </div>
      </div>
    </div>
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
    <div className="flex flex-col">
      {/* 运行时三旋钮单组（v2 二级换代：一级同构分组语言；原型未覆盖二级，按 Apple
          Settings 语言补位）：值行（OptionMenu 整行 trigger，asChild 直接子为原生
          button——props 直接落地）+ 开关行 + 值行 + 保存行，行间 sep-row 由
          `.setrow + .setrow` 自动接管。 */}
      <div className="sgroup">
        <OptionMenu
          align="start"
          cancelLabel={t("cancel")}
          trigger={
            <button
              className="setrow h-auto cursor-pointer py-2.5 disabled:cursor-default disabled:opacity-60"
              disabled={loading}
              type="button"
            >
              <span className="min-w-0">
                <span className="block">{t("settings.activePreset")}</span>
                <span className={settingsHintClasses}>{t("settings.activePresetHint")}</span>
              </span>
              <span className="v">
                {selectedLabel}
                <span aria-hidden="true" className="ar">
                  ›
                </span>
              </span>
            </button>
          }
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

        <button
          aria-checked={enable1m}
          className="setrow h-auto cursor-pointer gap-3 py-2.5 disabled:cursor-default disabled:opacity-60"
          disabled={loading}
          onClick={() => !loading && setEnable1m(!enable1m)}
          role="switch"
          type="button"
        >
          <span className="min-w-0">
            <span className="block">{t("settings.enable1m")}</span>
            <span className={settingsHintClasses}>{t("settings.enable1mHint")}</span>
          </span>
          <span
            aria-hidden="true"
            className={`ml-auto shrink-0 ${toggleSwitchTrackClasses(enable1m)}`}
          >
            <span
              className={`${toggleSwitchKnobClasses} ${enable1m ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
            />
          </span>
        </button>

        <OptionMenu
          align="start"
          cancelLabel={t("cancel")}
          trigger={
            <button
              className="setrow h-auto cursor-pointer py-2.5 disabled:cursor-default disabled:opacity-60"
              disabled={loading}
              type="button"
            >
              <span className="min-w-0">
                <span className="block">{t("settings.effort")}</span>
                <span className={settingsHintClasses}>{t("settings.effortHint")}</span>
              </span>
              <span className="v">
                {effort}
                <span aria-hidden="true" className="ar">
                  ›
                </span>
              </span>
            </button>
          }
          items={EFFORT_LEVELS.map((level) => ({
            label: level,
            isActive: level === effort,
            onSelect: () => setEffort(level),
          }))}
        />

        {/* 保存行（组末行）：左脏态/已保存状态 + 右主色实心钮（显式保存语义不变）。 */}
        <div className="setrow">
          <span
            className={`text-[13px] ${justSaved ? "font-medium text-success-text" : "text-ink-2"}`}
          >
            {justSaved ? `✓ ${t("settings.saved")}` : dirty ? t("settings.unsavedChanges") : ""}
          </span>
          <button
            className={`ml-auto ${settingsPrimaryButtonClasses}`}
            disabled={loading || !dirty || saving}
            onClick={handleSave}
            type="button"
          >
            {saving ? t("settings.saving") : t("settings.save")}
          </button>
        </div>
      </div>

      {error && <p className="mx-4 mt-2 text-[13px] text-error">{error}</p>}

      <PresetListSection presets={claude.presets} loading={loading} />
    </div>
  );
}

// ── pi runtime detail：激活预设 + 预设列表（v5 presets 体系） ──────────

/**
 * pi 运行时段（v5 presets 体系）：chat 全局会话运行时。顶部 = 激活预设选择（None = 停用，
 * Save 持久化 activePresetId）；下方 = 预设列表 CRUD（PiPresetListSection，每个预设自带
 * provider/model/apiKey/baseUrl/api，CRUD 即时持久化）。key 只随 activePresetId 变
 * （见 SettingsContent），preset CRUD 不触发 remount。
 */
/**
 * ACP 运行时段（per-provider 凭据切片）：provider 列表来自 GET /api/agent-providers
 * （profile 注册表投影——新 ACP CLI 注册后此列表自动跟随，UI 零改动），每个
 * transport=acp 的 provider 渲染一张凭据卡（AcpRuntimeContent，独立保存）。枚举失败
 * 显示错误文本（凭据表单不可盲写 provider）。
 */
function AcpRuntimeSection({
  acp,
  loading = false,
}: {
  acp: AcpRuntimeConfigMasked | undefined;
  loading?: boolean;
}) {
  const { t } = useT();
  const providersQuery = useQuery({
    queryKey: ["agent-providers"],
    queryFn: fetchAgentProviders,
  });
  if (providersQuery.isError) {
    return (
      <p className="text-[13px] text-error">
        {providersQuery.error instanceof Error
          ? providersQuery.error.message
          : t("api.agentProvidersFailed")}
      </p>
    );
  }
  const acpProviders = providersQuery.data?.providers.filter((p) => p.transport === "acp") ?? [];
  return (
    <div className="flex flex-col">
      {acpProviders.map((info) => (
        <AcpRuntimeContent
          // key 随加载完成态变（loading → loaded remount 回填 baseUrl 初值）；保存成功后
          // masked 值刷新也走同 key（hasApiKey/baseUrl 未变则不 remount，不清用户输入）。
          key={`${info.provider}|${Boolean(acp?.[info.provider]?.hasApiKey)}|${acp?.[info.provider]?.baseUrl ?? ""}`}
          info={info}
          credentials={acp?.[info.provider]}
          loading={loading}
        />
      ))}
    </div>
  );
}

/**
 * ACP 单 provider 凭据卡：apiKey + baseUrl 保存（无 preset 列表——command/模型切换预设
 * 留 Phase 2）。apiKey 语义同 claude/pi preset PUT：留空 = 不改（masked 占位提示现有
 * key）；baseUrl 明文回填，清空保存 = 删除（回退官方端点）。保存走 updateAcpRuntime
 * （带 provider），成功 invalidate settings 刷 masked 值。hint 按 profile 投影增强：
 * 注入 env 变量名（技术标识不翻译）。凭据 provider 平权：切片未配置 = 走 agent 自身
 * 凭证链，不借用其它 runtime 的配置。
 */
function AcpRuntimeContent({
  info,
  credentials,
  loading = false,
}: {
  info: AgentProviderInfo;
  credentials: AcpCredentialsMasked | undefined;
  loading?: boolean;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(credentials?.baseUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasApiKey = Boolean(credentials?.hasApiKey);
  const baseUrlDirty = baseUrl.trim() !== (credentials?.baseUrl ?? "");
  const dirty = !loading && (apiKey.trim() !== "" || baseUrlDirty);

  const handleSave = async () => {
    if (loading) return;
    setError(null);
    setSaving(true);
    try {
      const input: UpdateAcpRuntimeRequest = { provider: info.provider };
      // apiKey：非空 = 覆盖；空 = 不改（编辑态留空保留原 key）。
      if (apiKey.trim()) input.apiKey = apiKey.trim();
      // baseUrl：显式传值（含空串 = 删除）；未改 = 不传。
      if (baseUrlDirty) input.baseUrl = baseUrl.trim();
      await updateAcpRuntime(input);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setApiKey("");
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // env 注入名（CLI 固有，来自 profile 投影；无 credentials 声明的 provider 不显示）。
  const envNames = [info.credentialsEnv?.apiKeyEnv, info.credentialsEnv?.baseUrlEnv]
    .filter((v) => typeof v === "string" && v.length > 0)
    .join(" / ");

  return (
    <div>
      <div className="sect">{info.label}</div>
      <div className="sgroup">
        {/* apiKey 输入行（v2 输入形态：elevated2 内嵌 + sep-strong 描边 + r10）。 */}
        <div className="setrow h-auto flex-col items-stretch gap-1.5 py-2.5">
          <span className="text-[13px] text-ink-2">{t("settings.apiKey")}</span>
          <p className="text-xs leading-5 text-ink-2">{t("settings.apiKeyHint")}</p>
          <input
            aria-label={t("settings.apiKey")}
            autoComplete="off"
            className={settingsInputClasses}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? credentials?.apiKeyMasked : t("settings.acpApiKeyBlank")}
            type="text"
            value={apiKey}
          />
        </div>

        {/* baseUrl 输入行 */}
        <div className="setrow h-auto flex-col items-stretch gap-1.5 py-2.5">
          <span className="text-[13px] text-ink-2">{t("settings.baseUrl")}</span>
          <p className="text-xs leading-5 text-ink-2">{t("settings.acpBaseUrlHint")}</p>
          <input
            aria-label={t("settings.baseUrl")}
            autoComplete="off"
            className={settingsInputClasses}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.anthropic.com"
            type="text"
            value={baseUrl}
          />
        </div>

        {/* 保存行（组末行）：显式保存语义不变。 */}
        <div className="setrow">
          <span
            className={`text-[13px] ${justSaved ? "font-medium text-success-text" : "text-ink-2"}`}
          >
            {justSaved ? `✓ ${t("settings.saved")}` : dirty ? t("settings.unsavedChanges") : ""}
          </span>
          <button
            className={`ml-auto ${settingsPrimaryButtonClasses}`}
            disabled={loading || !dirty || saving}
            onClick={handleSave}
            type="button"
          >
            {saving ? t("settings.saving") : t("settings.save")}
          </button>
        </div>
      </div>

      <p className="kfoot mx-4">{t("settings.acpHint")}</p>
      {envNames ? (
        <p className="kfoot mx-4">
          {t("settings.acpEnvHint")} <span className="font-mono">{envNames}</span>
        </p>
      ) : null}
      {error && <p className="mx-4 mt-2 text-[13px] text-error">{error}</p>}
    </div>
  );
}

function PiRuntimeContent({
  pi,
  loading = false,
}: {
  pi:
    | { presets: PiPresetMasked[]; activePresetId: string; firecrawlApiKeyMasked?: string }
    | undefined;
  loading?: boolean;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();

  const [activePresetId, setActivePresetId] = useState(pi?.activePresetId ?? "");
  const [firecrawlKey, setFirecrawlKey] = useState("");
  const [firecrawlClearing, setFirecrawlClearing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFirecrawlKey = Boolean(pi?.firecrawlApiKeyMasked);
  const firecrawlDirty = (firecrawlClearing && hasFirecrawlKey) || firecrawlKey.trim() !== "";
  const dirty = !loading && (activePresetId !== (pi?.activePresetId ?? "") || firecrawlDirty);

  const handleSave = async () => {
    if (loading) return;
    setError(null);
    setSaving(true);
    try {
      const input: UpdatePiRuntimeRequest = { activePresetId };
      // firecrawl key 语义：清除 → 空串（移除）；非空 → 新 key；空 + 未清除 → 不改。
      if (firecrawlClearing) input.firecrawlApiKey = "";
      else if (firecrawlKey.trim()) input.firecrawlApiKey = firecrawlKey.trim();
      await updatePiRuntime(input);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setFirecrawlKey("");
      setFirecrawlClearing(false);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const selectedLabel = activePresetId
    ? (pi?.presets.find((p) => p.id === activePresetId)?.label ?? activePresetId)
    : t("settings.piActivePresetNone");

  return (
    <div className="flex flex-col">
      <div className="sgroup">
        {/* 值行：激活预设（None = 停用）。 */}
        <OptionMenu
          align="start"
          cancelLabel={t("cancel")}
          trigger={
            <button
              className="setrow h-auto cursor-pointer py-2.5 disabled:cursor-default disabled:opacity-60"
              disabled={loading}
              type="button"
            >
              <span className="min-w-0">
                <span className="block">{t("settings.activePreset")}</span>
                <span className={settingsHintClasses}>{t("settings.piActivePresetHint")}</span>
              </span>
              <span className="v">
                {selectedLabel}
                <span aria-hidden="true" className="ar">
                  ›
                </span>
              </span>
            </button>
          }
          items={[
            {
              label: t("settings.piActivePresetNone"),
              isActive: activePresetId === "",
              onSelect: () => setActivePresetId(""),
            },
            ...(pi?.presets ?? []).map((p) => ({
              label: p.label,
              isActive: p.id === activePresetId,
              onSelect: () => setActivePresetId(p.id),
            })),
          ]}
        />

        {/* firecrawl 输入行（清除/取消小钮内嵌行首行右侧）。 */}
        <div className="setrow h-auto flex-col items-stretch gap-1.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-ink-2">{t("settings.firecrawlKey")}</span>
            {hasFirecrawlKey && !firecrawlClearing ? (
              <button
                className={`shrink-0 ${settingsTextButtonClasses}`}
                onClick={() => setFirecrawlClearing(true)}
                type="button"
              >
                {t("settings.clear")}
              </button>
            ) : null}
            {firecrawlClearing ? (
              <button
                className={`shrink-0 ${settingsTextButtonClasses}`}
                onClick={() => setFirecrawlClearing(false)}
                type="button"
              >
                {t("cancel")}
              </button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-ink-2">{t("settings.firecrawlKeyHint")}</p>
          <input
            aria-label={t("settings.firecrawlKey")}
            autoComplete="off"
            className={settingsInputClasses}
            onChange={(e) => setFirecrawlKey(e.target.value)}
            placeholder={
              hasFirecrawlKey ? pi?.firecrawlApiKeyMasked : t("settings.firecrawlKeyBlank")
            }
            type="text"
            value={firecrawlKey}
          />
        </div>

        {/* 保存行（组末行）：显式保存语义不变。 */}
        <div className="setrow">
          <span
            className={`text-[13px] ${justSaved ? "font-medium text-success-text" : "text-ink-2"}`}
          >
            {justSaved ? `✓ ${t("settings.saved")}` : dirty ? t("settings.unsavedChanges") : ""}
          </span>
          <button
            className={`ml-auto ${settingsPrimaryButtonClasses}`}
            disabled={loading || !dirty || saving}
            onClick={handleSave}
            type="button"
          >
            {saving ? t("settings.saving") : t("settings.save")}
          </button>
        </div>
      </div>

      <p className="kfoot mx-4">{t("settings.piHint")}</p>
      {error && <p className="mx-4 mt-2 text-[13px] text-error">{error}</p>}

      <PiPresetListSection presets={pi?.presets ?? []} loading={loading} />
    </div>
  );
}

/**
 * pi 预设列表段（v5 presets 体系）：sect + sgroup 分组行（v2 设置语言）+ 整行点击进编辑；
 * 新增/编辑走 PiPresetDialog（移动 sheet / 桌面 Dialog 分流）；删除走 confirm + deletePiPreset，
 * 即时持久化 + invalidate settings。删除激活预设的级联清空由后端保证。
 */
function PiPresetListSection({
  presets,
  loading = false,
}: {
  presets: PiPresetMasked[];
  loading?: boolean;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { confirm, holder: confirmHolder } = useConfirm();
  const [editing, setEditing] = useState<PiPresetMasked | null>(null);
  const [creating, setCreating] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: deletePiPreset,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const handleDelete = async (preset: PiPresetMasked) => {
    const ok = await confirm({
      title: t("settings.deletePreset"),
      message: t("settings.piDeletePresetConfirm", { label: preset.label }),
      confirmLabel: t("settings.deletePreset"),
      cancelLabel: t("cancel"),
      tone: "danger",
    });
    if (ok) await deleteMutation.mutateAsync(preset.id);
  };

  return (
    <section className="flex flex-col">
      <div className="sect">{t("settings.presets")}</div>
      <div className="sgroup">
        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <div aria-hidden="true">
              {Array.from({ length: PRESET_SKELETON_ROW_COUNT }, (_, i) => (
                <div className="setrow h-auto items-center gap-2 py-2.5" key={i}>
                  <span className="min-w-0 flex-1">
                    <span className="skeleton-shimmer block h-4 w-28 rounded" />
                    <span className="skeleton-shimmer mt-1.5 block h-3 w-48 rounded" />
                  </span>
                  <span className="skeleton-shimmer size-8 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          ) : presets.length === 0 ? (
            <p className="py-2.5 text-[13px] text-ink-2">{t("settings.piNoPresets")}</p>
          ) : (
            presets.map((p) => (
              <PiPresetRow
                key={p.id}
                preset={p}
                onEdit={() => setEditing(p)}
                onDelete={() => handleDelete(p)}
              />
            ))
          )}
        </div>
        {/* 添加行（Apple 分组列表添加行惯例）：c-primary 文字 + ＋ 前缀；滚动容器外，
            与列表段之间 border-t 显式分隔（.setrow + .setrow 隔容器不生效）。 */}
        <button
          className="setrow cursor-pointer border-t border-sep-row text-primary disabled:cursor-default disabled:opacity-40"
          disabled={loading}
          onClick={() => setCreating(true)}
          type="button"
        >
          ＋ {t("settings.addPreset")}
        </button>
      </div>
      <p className="kfoot mx-4">{t("settings.piPresetsHint")}</p>

      {(creating || editing) && (
        <PiPresetDialog
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

function PiPresetRow({
  preset,
  onEdit,
  onDelete,
}: {
  preset: PiPresetMasked;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  return (
    <div
      className="setrow h-auto cursor-pointer gap-2 py-2.5 transition-[scale,background-color] interactive-row active:scale-[0.98]"
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{preset.label}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-ink-2">
          <span>
            {preset.provider} / {preset.model}
          </span>
          {preset.baseUrl ? <span>{preset.baseUrl}</span> : null}
          {preset.apiKeyMasked ? <span>{preset.apiKeyMasked}</span> : null}
        </span>
      </span>
      <span
        className="shrink-0"
        // stopPropagation：⋯ 点击不冒泡触发整行编辑（对齐 file-browser ListRow actions 模式）。
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ActionMenu
          align="end"
          cancelLabel={t("cancel")}
          trigger={
            <button
              aria-label={t("settings.deletePreset")}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-2 transition hover:bg-ink-1/5 hover:text-ink-1 active:bg-ink-1/10"
              type="button"
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
    </div>
  );
}

// provider 认证形态的菜单标记文案（对齐 pi-agent-dashboard「Subscriptions (OAuth) / API Keys」分组语义）。
function piAuthTypeLabel(authType: PiProviderAuthType): string {
  switch (authType) {
    case "api_key":
      return "API key";
    case "oauth":
      return "OAuth";
    case "both":
      return "API key / OAuth";
    default:
      return "";
  }
}

/**
 * pi 内置 provider 选择器：枚举 SDK 内置 provider（useQuery 拉取，memo 在 api 侧），
 * label = 显示名、description = provider id + 认证形态标记（对齐 model selector「alias + 具体 ID」模式）。
 * 当前值命中内置 id 时 trigger 显示显示名；否则 fallback（加载中/失败/自定义 id）。
 */
function ProviderSelect({
  value,
  onChange,
  fallbackLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  fallbackLabel: string;
}) {
  const providersQuery = useQuery({ queryKey: ["pi-providers"], queryFn: listPiProviders });
  const builtin = providersQuery.data?.providers ?? [];
  const active = builtin.find((p) => p.id === value.trim());
  const { t } = useT();

  return (
    <OptionMenu
      align="start"
      cancelLabel={t("cancel")}
      trigger={<SelectorTrigger label={active?.name ?? fallbackLabel} />}
      items={builtin.map((p) => {
        const authLabel = piAuthTypeLabel(p.authType);
        return {
          label: p.name,
          description: authLabel ? `${p.id} · ${authLabel}` : p.id,
          isActive: p.id === value.trim(),
          onSelect: () => onChange(p.id),
        };
      })}
    />
  );
}

/**
 * pi 预设编辑/新建弹窗。预设 = provider + model + apiKey + 可选 baseUrl/api（自定义兼容端点）。
 * 不做模型发现/测试连接（决策 4：model id 手填）。apiKey 编辑态留空 = 不改（后端回退原 key）；
 * baseUrl 显式空串 = 删除（联动删 api）。api 下拉仅 baseUrl 非空时渲染。
 */
function PiPresetDialog({
  preset,
  onClose,
}: {
  preset: PiPresetMasked | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const isEdit = preset !== null;

  const [label, setLabel] = useState(preset?.label ?? "");
  const [provider, setProvider] = useState(preset?.provider ?? "");
  const [model, setModel] = useState(preset?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(preset?.baseUrl ?? "");
  const [api, setApi] = useState<PiProviderApi | undefined>(preset?.api);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 当前 provider 的认证形态（决定 apiKey 输入框渲染与必填校验）。与 ProviderSelect 同
  // queryKey 缓存命中，零重复请求；枚举失败/自定义 id → unknown（apiKey 可选）。
  const providersQuery = useQuery({ queryKey: ["pi-providers"], queryFn: listPiProviders });
  const activeAuthType =
    providersQuery.data?.providers.find((p) => p.id === provider.trim())?.authType ?? "unknown";

  const trimmedBaseUrl = baseUrl.trim();
  const showApiSelect = trimmedBaseUrl !== "";

  const handleSubmit = async () => {
    setError(null);
    const trimmedLabel = label.trim();
    const trimmedProvider = provider.trim();
    const trimmedModel = model.trim();
    if (!trimmedLabel) {
      setError(t("settings.labelHint"));
      return;
    }
    if (!trimmedProvider) {
      setError(t("settings.piProvider"));
      return;
    }
    if (!trimmedModel) {
      setError(t("settings.piModel"));
      return;
    }
    // 新建态 apiKey 必填仅限纯 API-key 型 provider；OAuth/both/unknown 可留空（走凭证链）。
    if (!isEdit && activeAuthType === "api_key" && !apiKey.trim()) {
      setError(t("settings.apiKey"));
      return;
    }
    setSaving(true);
    try {
      if (isEdit && preset) {
        // apiKey 留空 = 不传 = 不改（后端回退原 key）；baseUrl 显式空串 = 删除（联动删 api）。
        const input: UpdatePiPresetRequest = {
          label: trimmedLabel,
          provider: trimmedProvider,
          model: trimmedModel,
          baseUrl: trimmedBaseUrl,
        };
        if (apiKey.trim()) input.apiKey = apiKey.trim();
        if (trimmedBaseUrl && api) input.api = api;
        await updatePiPreset(preset.id, input);
      } else {
        const input: CreatePiPresetRequest = {
          label: trimmedLabel,
          provider: trimmedProvider,
          apiKey: apiKey.trim(),
          model: trimmedModel,
        };
        if (trimmedBaseUrl) {
          input.baseUrl = trimmedBaseUrl;
          if (api) input.api = api;
        }
        await createPiPreset(input);
      }
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const title = isEdit ? t("settings.editPreset") : t("settings.newPreset");
  // 表单体两端共享（多端同构铁律：行为能力单份，只分容器）。取消 = muted 文字钮、
  // 保存 = 主色实心钮（v2 钮语言）。
  const form = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Field label={t("settings.label")}>
          <input
            aria-label={t("settings.label")}
            className={settingsInputClasses}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("settings.labelHint")}
            type="text"
            value={label}
          />
        </Field>
        <Field label={t("settings.piProvider")} hint={t("settings.piProviderHint")}>
          {/* 双入口单 state：内置选择器（label=显示名/description=id）+ 手填自定义 id
              （兼容端点）。选内置 → input 同步显示 id；手改 input → trigger 落回 fallback
              （除非恰好命中内置）。枚举失败静默降级为手填（provider 列表是可选便利）。 */}
          <div className="flex flex-col gap-2">
            <ProviderSelect
              value={provider}
              onChange={setProvider}
              fallbackLabel={t("settings.piProviderPick")}
            />
            <input
              aria-label={t("settings.piProvider")}
              className={settingsInputClasses}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="anthropic"
              type="text"
              value={provider}
            />
          </div>
        </Field>
        <Field label={t("settings.piModel")} hint={t("settings.piModelHint")}>
          <input
            aria-label={t("settings.piModel")}
            className={settingsInputClasses}
            onChange={(e) => setModel(e.target.value)}
            placeholder="claude-sonnet-5"
            type="text"
            value={model}
          />
        </Field>
        {activeAuthType === "oauth" ? (
          <Field label={t("settings.apiKey")}>
            <div className="rounded-[10px] border border-sep bg-elevated2 px-3 py-2 text-xs leading-5 text-ink-2">
              {t("settings.piAuthOauthHint")}
            </div>
          </Field>
        ) : (
          <Field
            label={t("settings.apiKey")}
            hint={
              isEdit
                ? t("settings.apiKeyHint")
                : activeAuthType === "api_key"
                  ? undefined
                  : activeAuthType === "both"
                    ? t("settings.piApiKeyOptionalHint")
                    : t("settings.piApiKeyLocalHint")
            }
          >
            {/* 明文：个人私有部署无密码管理器必要；placeholder 露 masked 指纹提示已配置。 */}
            <input
              aria-label={t("settings.apiKey")}
              autoComplete="off"
              className={settingsInputClasses}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEdit ? preset?.apiKeyMasked : "sk-ant-..."}
              type="text"
              value={apiKey}
            />
          </Field>
        )}
        <Field label={t("settings.baseUrl")} hint={t("settings.piBaseUrlHint")}>
          <input
            aria-label={t("settings.baseUrl")}
            className={settingsInputClasses}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com"
            type="text"
            value={baseUrl}
          />
        </Field>
        {showApiSelect && (
          <Field label={t("settings.piApi")} hint={t("settings.piApiHint")}>
            <OptionMenu
              align="start"
              cancelLabel={t("cancel")}
              trigger={<SelectorTrigger label={api ?? t("settings.piApiDefault")} />}
              items={PI_PROVIDER_APIS.map((value) => ({
                label: value,
                isActive: value === api,
                onSelect: () => setApi(value),
              }))}
            />
          </Field>
        )}
      </div>

      {error && <p className="text-[13px] text-error">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button className={settingsTextButtonClasses} onClick={onClose} type="button">
          {t("cancel")}
        </button>
        <button
          className={settingsPrimaryButtonClasses}
          disabled={saving}
          onClick={handleSubmit}
          type="button"
        >
          {saving ? t("settings.saving") : t("settings.save")}
        </button>
      </div>
    </div>
  );

  // 移动 = 半屏 sheet（msheet 自带 20px 侧距 + max-height 内滚）；桌面 = 居中 Dialog
  //（v2 面：bg-elevated + sep 描边 + r20 弹窗档）。
  if (isMobile) {
    return (
      <MobileSheet onOpenChange={(o) => !o && onClose()} open title={title}>
        <div className="pb-2">{form}</div>
      </MobileSheet>
    );
  }
  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open>
      <DialogContent>
        <div className="flex max-h-[85vh] flex-col gap-4 overflow-hidden rounded-[20px] border border-sep bg-elevated p-5 shadow-2xl shadow-black/40">
          <DialogTitle className="text-base font-semibold text-ink-1">{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
          <div className="-mr-1 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">{form}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 预设列表段（决策 4：预设 CRUD 合并进 Claude 运行时段）。sect + sgroup 分组行（v2 设置
 * 语言）+ 整行点击进编辑；新增/编辑走 PresetDialog（移动 sheet / 桌面 Dialog 分流）；删除走
 * confirm + deleteClaudePreset，即时持久化 + invalidate settings。删除激活预设的级联清空由后端保证。
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
    <section className="flex flex-col">
      <div className="sect">{t("settings.presets")}</div>
      <div className="sgroup">
        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <div aria-hidden="true">
              {Array.from({ length: PRESET_SKELETON_ROW_COUNT }, (_, i) => (
                <div className="setrow h-auto items-center gap-2 py-2.5" key={i}>
                  <span className="min-w-0 flex-1">
                    <span className="skeleton-shimmer block h-4 w-28 rounded" />
                    <span className="skeleton-shimmer mt-1.5 block h-3 w-48 rounded" />
                  </span>
                  <span className="skeleton-shimmer size-8 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          ) : presets.length === 0 ? (
            <p className="py-2.5 text-[13px] text-ink-2">{t("settings.noPresets")}</p>
          ) : (
            presets.map((p) => (
              <PresetRow
                key={p.id}
                preset={p}
                onEdit={() => setEditing(p)}
                onDelete={() => handleDelete(p)}
              />
            ))
          )}
        </div>
        {/* 添加行（Apple 分组列表添加行惯例）：c-primary 文字 + ＋ 前缀；滚动容器外，
            与列表段之间 border-t 显式分隔（.setrow + .setrow 隔容器不生效）。 */}
        <button
          className="setrow cursor-pointer border-t border-sep-row text-primary disabled:cursor-default disabled:opacity-40"
          disabled={loading}
          onClick={() => setCreating(true)}
          type="button"
        >
          ＋ {t("settings.addPreset")}
        </button>
      </div>
      <p className="kfoot mx-4">{t("settings.presetsHint")}</p>

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
  return (
    <div
      className="setrow h-auto cursor-pointer gap-2 py-2.5 transition-[scale,background-color] interactive-row active:scale-[0.98]"
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{preset.label}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-ink-2">
          {preset.baseUrl ? <span>{preset.baseUrl}</span> : null}
          {preset.apiKeyMasked ? <span>{preset.apiKeyMasked}</span> : null}
        </span>
      </span>
      <span
        className="shrink-0"
        // stopPropagation：⋯ 点击不冒泡触发整行编辑（对齐 file-browser ListRow actions 模式）。
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ActionMenu
          align="end"
          cancelLabel={t("cancel")}
          trigger={
            <button
              aria-label={t("settings.deletePreset")}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-2 transition hover:bg-ink-1/5 hover:text-ink-1 active:bg-ink-1/10"
              type="button"
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
    </div>
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
  const isMobile = useIsMobile();
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
  // 测试连接拉到 >5 模型时「查看全部」弹窗的受控 open。
  const [modelsOpen, setModelsOpen] = useState(false);

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

  const title = isEdit ? t("settings.editPreset") : t("settings.newPreset");
  // 表单体两端共享（多端同构铁律）：取消 = muted 文字钮、保存 = 主色实心钮（v2 钮语言）。
  const form = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Field label={t("settings.label")}>
          <input
            aria-label={t("settings.label")}
            className={settingsInputClasses}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("settings.labelHint")}
            type="text"
            value={label}
          />
        </Field>
        <Field label={t("settings.baseUrl")} hint={t("settings.baseUrlHint")}>
          <input
            aria-label={t("settings.baseUrl")}
            className={settingsInputClasses}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com"
            type="text"
            value={baseUrl}
          />
        </Field>
        <Field label={t("settings.apiKey")} hint={isEdit ? t("settings.apiKeyHint") : undefined}>
          {/* 明文：个人私有部署无密码管理器必要；type=password 会触发浏览器「保存密码」提示。 */}
          <input
            aria-label={t("settings.apiKey")}
            autoComplete="off"
            className={settingsInputClasses}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={isEdit ? preset?.apiKeyMasked : "sk-ant-..."}
            type="text"
            value={apiKey}
          />
        </Field>

        {/* 模型映射（4-tier）：tier 行保持 flex 布局，ModelTierSelect 逻辑零改动只换皮。 */}
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-2">{t("settings.modelMapping")}</p>
          <p className="text-xs leading-5 text-ink-2">{t("settings.modelMappingHint")}</p>
          {TIERS.map((tier) => (
            <div className="flex items-center gap-2" key={tier}>
              <span className="w-16 shrink-0 text-xs text-ink-2">{t(TIER_LABEL[tier])}</span>
              <ModelTierSelect
                models={models}
                loading={modelsLoading}
                onChange={(v) => setModelMapping({ ...modelMapping, [tier]: v })}
                tier={tier}
                value={modelMapping[tier]}
              />
            </div>
          ))}
        </div>

        {/* 测试连接：refetch modelsQuery，与 modelMapping 下拉共享同一凭证源。凭证不全
            （baseUrl 空）时按钮禁用。上游失败 → {ok:false}，前端展示测试结果而非报错 toast。 */}
        <div className="flex flex-col gap-1.5">
          <button
            className={`w-fit ${settingsGhostButtonClasses}`}
            disabled={modelsQuery.isFetching || saving || !trimmedBaseUrl}
            onClick={() => modelsQuery.refetch()}
            type="button"
          >
            {modelsQuery.isFetching
              ? t("settings.testConnectionRunning")
              : t("settings.testConnection")}
          </button>
          {modelsQuery.data && (
            <p
              className={`text-[13px] ${modelsQuery.data.ok ? "text-success-text" : "text-error"}`}
            >
              {modelsQuery.data.ok
                ? modelsQuery.data.models.length > 0
                  ? t("settings.testConnectionOk", { count: modelsQuery.data.models.length })
                  : t("settings.testConnectionOkEmpty")
                : t("settings.testConnectionFailed", { error: modelsQuery.data.error ?? "" })}
            </p>
          )}
          {modelsQuery.data?.ok && modelsQuery.data.models.length > 0 && (
            <p className="truncate font-mono text-[11px] text-ink-2">
              {modelsQuery.data.models.slice(0, 5).join(" · ")}
            </p>
          )}
          {modelsQuery.data?.ok && modelsQuery.data.models.length > 5 && (
            <button
              className="flex w-fit cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] text-primary transition hover:bg-primary/10"
              onClick={() => setModelsOpen(true)}
              type="button"
            >
              {t("settings.viewAllModels", { count: modelsQuery.data.models.length })}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-[13px] text-error">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button className={settingsTextButtonClasses} onClick={onClose} type="button">
          {t("cancel")}
        </button>
        <button
          className={settingsPrimaryButtonClasses}
          disabled={saving}
          onClick={handleSubmit}
          type="button"
        >
          {saving ? t("settings.saving") : t("settings.save")}
        </button>
      </div>
    </div>
  );

  // 移动 = 半屏 sheet（msheet 自带 20px 侧距 + max-height 内滚）；桌面 = 居中 Dialog
  //（v2 面：bg-elevated + sep 描边 + r20 弹窗档）。ModelsListDialog 随容器分流。
  if (isMobile) {
    return (
      <>
        <MobileSheet onOpenChange={(o) => !o && onClose()} open title={title}>
          <div className="pb-2">{form}</div>
        </MobileSheet>
        <ModelsListDialog models={models} onClose={() => setModelsOpen(false)} open={modelsOpen} />
      </>
    );
  }
  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open>
      <DialogContent>
        <div className="flex max-h-[85vh] flex-col gap-4 overflow-hidden rounded-[20px] border border-sep bg-elevated p-5 shadow-2xl shadow-black/40">
          <DialogTitle className="text-base font-semibold text-ink-1">{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
          <div className="-mr-1 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">{form}</div>
        </div>
      </DialogContent>
      <ModelsListDialog models={models} onClose={() => setModelsOpen(false)} open={modelsOpen} />
    </Dialog>
  );
}

// 测试连接拉到 >5 模型时展示完整列表的弹窗。受控 open，与宿主弹窗同级嵌套（两个 Portal
// 都落 body，内层后挂载 DOM 序靠后，同 stacking context 盖上层，Radix 支持嵌套 focus
// scope，无需动 z-index）。容器随宿主分流：移动 sheet / 桌面居中 Dialog。
function ModelsListDialog({
  open,
  models,
  onClose,
}: {
  open: boolean;
  models: string[];
  onClose: () => void;
}) {
  const { t } = useT();
  const isMobile = useIsMobile();
  const list = (
    <div className="max-h-[50vh] min-h-0 overflow-y-auto">
      {models.map((m, index) => (
        <div
          className="break-words border-b border-sep-row py-1.5 font-mono text-xs text-ink-1 last:border-b-0"
          key={`${m}-${index}`}
        >
          {m}
        </div>
      ))}
    </div>
  );
  if (isMobile) {
    return (
      <MobileSheet
        onOpenChange={(o) => !o && onClose()}
        open={open}
        title={t("settings.modelsDialogTitle", { count: models.length })}
      >
        <div className="pb-2">{list}</div>
      </MobileSheet>
    );
  }
  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent>
        <div className="flex max-h-[85vh] flex-col gap-4 overflow-hidden rounded-[20px] border border-sep bg-elevated p-5 shadow-2xl shadow-black/40">
          <div className="flex shrink-0 items-center gap-2">
            <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold text-ink-1">
              {t("settings.modelsDialogTitle", { count: models.length })}
            </DialogTitle>
            <button
              aria-label={t("session.close")}
              className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 transition hover:bg-ink-1/5 hover:text-ink-1 active:bg-ink-1/10"
              onClick={onClose}
              type="button"
            >
              <ShellIcon className="h-4 w-4" name="close" />
            </button>
          </div>
          <DialogDescription className="sr-only">
            {t("settings.modelsDialogTitle", { count: models.length })}
          </DialogDescription>
          <div className="-mr-1 min-h-0 overflow-y-auto pr-1">{list}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared field primitives ──────────────────────────────────────────

/** 弹窗表单字段（v2 语言）：label 13px ink-2 + hint 12px ink-2 + 控件（与 sgroup 内
 *  输入行同款语言；弹窗无 sgroup 容器，字段直排）。 */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] text-ink-2">{label}</p>
      {hint && <p className="text-xs leading-5 text-ink-2">{hint}</p>}
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
      className="inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-sep-strong bg-elevated2 px-3 py-2 text-sm text-ink-1 transition hover:bg-elevated3 disabled:cursor-default disabled:opacity-60"
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
// 模型列表空（凭证不全 / 上游 ok:false / 拉取失败）→ 降级手填输入框，保证用户始终能配置。
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
  // 手填模式：用户显式从下拉「手动输入模型…」进入，输入任意模型 ID（列表之外也可）。
  // 输入即存进 modelMapping[tier]（与降级分支一致）；切回下拉只换渲染形态、不回滚已输入值。
  const [editing, setEditing] = useState(false);
  const unavailable = !loading && models.length === 0;
  if (unavailable) {
    // 无模型列表（提供商无 /v1/models 端点或拉取失败）→ 直接手填，无切回需求。
    return (
      <input
        aria-label={t(TIER_LABEL[tier])}
        className={settingsInputClasses}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tier}
        type="text"
        value={value}
      />
    );
  }

  if (editing) {
    return (
      <div className="flex w-full flex-col gap-1">
        <input
          aria-label={t(TIER_LABEL[tier])}
          className={settingsInputClasses}
          onChange={(e) => onChange(e.target.value)}
          placeholder={tier}
          type="text"
          value={value}
        />
        <button
          className="flex w-fit cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] text-ink-2 transition hover:bg-primary/10 hover:text-primary"
          onClick={() => setEditing(false)}
          type="button"
        >
          {t("settings.modelSelectBackToList")}
        </button>
      </div>
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
      items={[
        // 手填入口：列表之外的自定义模型 ID 也能配置。保持纯 label（无 description），
        // 否则 OptionMenu 的 hasDescription 会让整份移动 sheet 切到 items-start 对齐。
        { label: t("settings.modelSelectManual"), onSelect: () => setEditing(true) },
        ...options.map((m) => ({
          label: m === value && !fetchedSet.has(m) ? `${m} ${t("settings.modelSelectCustom")}` : m,
          isActive: m === value,
          onSelect: () => onChange(m),
        })),
      ]}
    />
  );
}
