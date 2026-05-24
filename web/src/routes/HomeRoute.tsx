import type { HealthResponse } from "@agents-remote/shared";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { getApiHealth } from "../api/client";
import { inputPanelOpenAtom } from "../state/ui";

export function HomeRoute() {
  const [inputPanelOpen, setInputPanelOpen] = useAtom(inputPanelOpenAtom);
  const health = useQuery<HealthResponse>({
    queryKey: ["api", "health"],
    queryFn: getApiHealth,
  });

  const status = health.data
    ? `api:${health.data.service}:${health.data.ok}`
    : health.error instanceof Error
      ? health.error.message
      : "checking /api/health...";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <section className="mx-auto flex max-w-md flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/30">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-300">
          Agents Remote
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Server control plane</h1>
        <p className="text-sm leading-6 text-slate-300">
          TanStack Router owns URL state, TanStack Query owns server state, and Jotai owns local UI
          state.
        </p>
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 font-mono text-sm">
          {status}
        </div>
        <button
          className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          type="button"
          onClick={() => setInputPanelOpen((value) => !value)}
        >
          Input panel: {inputPanelOpen ? "open" : "closed"}
        </button>
      </section>
    </main>
  );
}
