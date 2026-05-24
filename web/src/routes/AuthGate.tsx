import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { getAuthStatus, login } from "../api/client";

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const passwordId = useId();
  const auth = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getAuthStatus,
    retry: false,
  });
  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPassword = password.trim();

    if (trimmedPassword.length === 0 || loginMutation.isPending) {
      return;
    }

    loginMutation.mutate(trimmedPassword);
  };

  if (auth.isLoading) {
    return <AuthFrame title="Checking private access" description="Restoring local session." />;
  }

  if (auth.error instanceof Error) {
    return <AuthFrame title="Unable to check access" description={auth.error.message} />;
  }

  if (auth.data) {
    return children;
  }

  return (
    <AuthFrame
      title="Private access"
      description="Enter the single deployment password to open the Project console."
    >
      <form className="mt-5" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-200" htmlFor={passwordId}>
          App password
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
          id={passwordId}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          className="mt-4 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          disabled={password.trim().length === 0 || loginMutation.isPending}
          type="submit"
        >
          {loginMutation.isPending ? "Unlocking..." : "Unlock console"}
        </button>
        {loginMutation.error instanceof Error ? (
          <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {loginMutation.error.message}
          </p>
        ) : null}
      </form>
    </AuthFrame>
  );
}

type AuthFrameProps = {
  children?: ReactNode;
  description: string;
  title: string;
};

function AuthFrame({ children, description, title }: AuthFrameProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#0f2d3a_0,#020617_34rem)] px-4 text-slate-100">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900/85 p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Agents Remote
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        {children}
      </section>
    </main>
  );
}
