import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { getAuthStatus, login } from "../api/client";
import { OfflineBanner } from "../components/OfflineBanner";
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
        <form className="mt-5" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-200" htmlFor={passwordId}>
            {t("auth.passwordLabel")}
          </label>
          <input
            autoComplete="current-password"
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-primary focus:ring-2 focus:ring-primary/20"
            id={passwordId}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className="mt-4 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            disabled={password.trim().length === 0 || loginMutation.isPending}
            type="submit"
          >
            {loginMutation.isPending ? t("auth.unlocking") : t("auth.unlock")}
          </button>
          {loginMutation.error instanceof Error ? (
            <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
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
    <section className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-primary/25 bg-slate-950/95 p-3 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur sm:left-auto sm:right-4 sm:w-96">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("auth.installTitle")}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{t("auth.installDesc")}</p>
        </div>
        <button
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          type="button"
          onClick={onDismiss}
        >
          {t("auth.dismiss")}
        </button>
      </div>
      <button
        className="mt-3 w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-primary/90"
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

function AuthFrame({ children, description, title }: AuthFrameProps) {
  const { t } = useT();
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#0f2d3a_0,#020617_34rem)] px-4 text-slate-100">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900/85 p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
          {t("auth.brand")}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        {children}
      </section>
    </main>
  );
}
