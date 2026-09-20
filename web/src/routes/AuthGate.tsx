import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { getAuthStatus, login } from "../api/client";
import { OfflineBanner } from "../components/OfflineBanner";
import { ShellIcon } from "../components/shell/icons";
import { useT } from "../i18n";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const isStandaloneDisplay = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  ("standalone" in window.navigator && window.navigator.standalone === true);

const AUTH_OK_KEY = "auth_ok";

export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [password, setPassword] = useState("");
  const passwordId = useId();
  const serverId = useId();
  // 部署地址（06 原型 ①「服务器」）。单部署模型下即当前 origin 的 host；多服务器历史留 M7。
  const serverLabel = window.location.host;
  const [authOk] = useState(() => localStorage.getItem(AUTH_OK_KEY) === "1");
  const auth = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getAuthStatus,
    retry: false,
    staleTime: Infinity,
  });
  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      setPassword("");
      localStorage.setItem(AUTH_OK_KEY, "1");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  useEffect(() => {
    if (isStandaloneDisplay()) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallDismissed(false);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setInstallDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    const handleUnauthenticated = () => {
      localStorage.removeItem(AUTH_OK_KEY);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    };
    window.addEventListener("auth:unauthenticated", handleUnauthenticated);
    return () => window.removeEventListener("auth:unauthenticated", handleUnauthenticated);
  }, [queryClient]);

  const handleInstall = async () => {
    if (!installPrompt) {
      return;
    }

    const prompt = installPrompt;
    setInstallPrompt(null);
    await prompt.prompt();
    const choice = await prompt.userChoice;

    if (choice.outcome === "dismissed") {
      setInstallDismissed(true);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPassword = password.trim();

    if (trimmedPassword.length === 0 || loginMutation.isPending) {
      return;
    }

    loginMutation.mutate(trimmedPassword);
  };

  const installBanner =
    installPrompt && !installDismissed ? (
      <InstallPromptBanner
        onDismiss={() => setInstallDismissed(true)}
        onInstall={() => void handleInstall()}
      />
    ) : null;

  if (auth.isLoading) {
    if (authOk) {
      return (
        <>
          <OfflineBanner />
          {children}
          {installBanner}
        </>
      );
    }

    return (
      <>
        <OfflineBanner />
        <AuthFrame title={t("auth.checkingTitle")} description={t("auth.checkingDesc")} />
        {installBanner}
      </>
    );
  }

  if (auth.error instanceof Error) {
    return (
      <>
        <OfflineBanner />
        <AuthFrame title={t("auth.errorTitle")} description={auth.error.message} />
        {installBanner}
      </>
    );
  }

  if (auth.data) {
    if (!authOk) {
      localStorage.setItem(AUTH_OK_KEY, "1");
    }
    return (
      <>
        <OfflineBanner />
        {children}
        {installBanner}
      </>
    );
  }

  return (
    <>
      <OfflineBanner />
      <AuthFrame title={t("auth.loginTitle")} description={t("auth.loginDesc")}>
        <form onSubmit={handleSubmit}>
          {/* 服务器 field：只读展示当前部署地址（06 原型 ①：点 › 切历史记录——多服务器历史
              留 M7，当前单部署取 window.location.host）。等宽字体对齐原型 .field。 */}
          <label className="mt-4 block text-caption text-ink-2" htmlFor={serverId}>
            {t("auth.serverLabel")}
          </label>
          <div
            className="mt-1.5 flex h-11 items-center justify-between rounded-xl border border-sep bg-elevated px-4 font-mono text-subhead text-ink-1"
            id={serverId}
          >
            <span className="min-w-0 truncate">{serverLabel}</span>
            <span className="text-ink-3">›</span>
          </div>
          <label className="mt-4 block text-caption text-ink-2" htmlFor={passwordId}>
            {t("auth.passwordLabel")}
          </label>
          <input
            autoComplete="current-password"
            className="mt-1.5 h-11 w-full rounded-xl border border-sep bg-elevated px-4 font-mono text-subhead text-ink-1 outline-none transition placeholder:text-ink-3 focus:border-primary focus:ring-2 focus:ring-primary/20"
            id={passwordId}
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className="mt-5 h-[46px] w-full cursor-pointer rounded-full bg-primary text-body font-semibold text-on-accent transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-elevated3 disabled:text-ink-2"
            disabled={password.trim().length === 0 || loginMutation.isPending}
            type="submit"
          >
            {loginMutation.isPending ? t("auth.unlocking") : t("auth.unlock")}
          </button>
          <p className="mt-3 text-center text-caption text-ink-2">{t("auth.hint")}</p>
          {loginMutation.error instanceof Error ? (
            <p className="mt-3 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-footnote text-error">
              {loginMutation.error.message}
            </p>
          ) : null}
        </form>
      </AuthFrame>
      {installBanner}
    </>
  );
}

type InstallPromptBannerProps = {
  onDismiss: () => void;
  onInstall: () => void;
};

function InstallPromptBanner({ onDismiss, onInstall }: InstallPromptBannerProps) {
  const { t } = useT();
  return (
    <section className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-primary/25 bg-surface-inset/95 p-3 text-on-surface shadow-2xl shadow-black/40 backdrop-blur sm:left-auto sm:right-4 sm:w-96">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("auth.installTitle")}</p>
          <p className="mt-1 text-xs leading-5 text-on-surface-muted">{t("auth.installDesc")}</p>
        </div>
        <button
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-on-surface-muted transition hover:bg-surface hover:text-on-surface-soft"
          type="button"
          onClick={onDismiss}
        >
          {t("auth.dismiss")}
        </button>
      </div>
      <button
        className="mt-3 w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-on-primary transition hover:bg-primary/90"
        type="button"
        onClick={onInstall}
      >
        {t("auth.installApp")}
      </button>
    </section>
  );
}

type AuthFrameProps = {
  children?: ReactNode;
  description: string;
  title: string;
};

/**
 * L0 登录/检查帧（redesign-v2.md M2，对标 06-login 原型）。整屏单列：logo 徽章（72px 圆角
 * 18px 主色底 + terminal 白描边图标）+ 品牌名 + tagline + 内容区 + 底部语言条（PWA 提示仅
 * 非 standalone 显示）。无 Tab Bar——L0 无导航概念（06 原型注释 ③）。
 *
 * `title`/`description` 承载检查中/错误态的文案（登录态另走 children 表单），品牌区恒定。
 */
function AuthFrame({ children, description, title }: AuthFrameProps) {
  const { lang, setLang, t } = useT();
  const [standalone] = useState(() => isStandaloneDisplay());
  return (
    <main className="relative flex h-[var(--app-viewport-height)] flex-col overflow-y-auto bg-canvas px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-on-surface">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <div className="mx-auto mt-[clamp(48px,18vh,150px)] flex size-[72px] items-center justify-center rounded-[18px] bg-primary">
          <ShellIcon className="size-10 text-on-accent" name="terminal" />
        </div>
        <div className="mt-[18px] text-center">
          <h1 className="text-[22px] font-bold text-ink-title">{t("auth.brand")}</h1>
          <p className="mt-1 text-footnote text-ink-2">{t("auth.tagline")}</p>
        </div>
        <section className="mt-14">
          <h2 className="sr-only">{title}</h2>
          <p className="text-footnote text-ink-2">{description}</p>
          {children}
        </section>
        <div className="mt-auto flex items-center justify-between pb-[max(20px,env(safe-area-inset-bottom))] pt-6 text-footnote">
          <button
            type="button"
            className="cursor-pointer font-semibold text-primary"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          >
            {t("auth.langLabel")} ›
          </button>
          {standalone ? null : <span className="text-ink-2">{t("auth.pwaHint")}</span>}
        </div>
      </div>
    </main>
  );
}
