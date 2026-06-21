// Read-only performance tracing for the Claude2 replay pipeline.
//
// Every entry point short-circuits when isPerfTraceEnabled() is false (default):
// `timed`, `markOnce`/`peekMark`/`measureSince`, `measureFrom`, `count` are no-ops — no
// performance.now() call, no closure allocation, no buffer write. The hot path
// (normalize/render run on every live message) is a single boolean read when off.
//
// Samples accumulate in a module-level ring buffer (NOT React state), so tracing
// never triggers a re-render and never alters render output. Toggle from the
// console, load a long session, then call __arDebug.perfReport() for the
// aggregated table. See docs/research/claude2-replay-performance.md for what
// each label measures and the (a)/(b)/(c) decision it drives.
import { isPerfTraceEnabled } from "./debug-flags";

type Sample = { label: string; ms: number; size?: number };

const MAX_SAMPLES = 200;
const SLOW_THRESHOLD_MS = 50;

const samples: Sample[] = [];
const marks = new Map<string, number>();

function record(sample: Sample): void {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.shift();
  if (sample.ms >= SLOW_THRESHOLD_MS) {
    const sizeStr = sample.size != null ? ` size=${sample.size}` : "";
    console.warn(`[perf] slow ${sample.label}: ${sample.ms.toFixed(1)}ms${sizeStr}`);
  }
}

/** Time a synchronous block. Zero-overhead direct call when tracing is off. */
export function timed<T>(label: string, fn: () => T, size?: number): T {
  if (!isPerfTraceEnabled()) return fn();
  const t0 = performance.now();
  const result = fn();
  record({ label, ms: performance.now() - t0, size });
  return result;
}

/** Set a start mark, keeping the first value (re-settable after measureSince clears it). */
export function markOnce(key: string): void {
  if (!isPerfTraceEnabled()) return;
  if (!marks.has(key)) marks.set(key, performance.now());
}

/** Read a mark's timestamp without clearing it, so two spans can share one start
 *  (e.g. historyRecv reads at history_end; loadE2E still consumes it at live_end). */
export function peekMark(key: string): number | undefined {
  if (!isPerfTraceEnabled()) return undefined;
  return marks.get(key);
}

/** Record the elapsed time since `key` was marked, then clear it (so reconnects re-mark). */
export function measureSince(key: string, label: string, size?: number): void {
  if (!isPerfTraceEnabled()) return;
  const t0 = marks.get(key);
  if (t0 == null) return;
  record({ label, ms: performance.now() - t0, size });
  marks.delete(key);
}

/** Record the elapsed time since an arbitrary timestamp (e.g. a render-phase mark → commit). */
export function measureFrom(label: string, startMs: number, size?: number): void {
  if (!isPerfTraceEnabled()) return;
  record({ label, ms: performance.now() - startMs, size });
}

/** Record an event occurrence (zero-duration) so its count surfaces in the report.
 *  Used to count how many times a phase fired (e.g. historyStart, to spot a double-load). */
export function count(label: string): void {
  if (!isPerfTraceEnabled()) return;
  record({ label, ms: 0 });
}

// ── Inter-arrival probe ─────────────────────────────────────────────────
// Across a burst of events (e.g. the WS history frames), separates time spent
// *processing* each event in onmessage from time spent *waiting* for the next
// event to arrive. If procTotal ≪ burst wall-clock AND inter-arrival gaps stay
// small and even, the burst time is the network delivering frames — not the
// client processing them. That is the test we need to rule the client out.
const arrival = { count: 0, firstArrive: 0, prevArrive: 0, gapMax: 0, procTotal: 0, procMax: 0 };

/** Reset the probe at the start of a burst (called at history_start). */
export function resetArrival(): void {
  if (!isPerfTraceEnabled()) return;
  arrival.count = 0;
  arrival.firstArrive = 0;
  arrival.prevArrive = 0;
  arrival.gapMax = 0;
  arrival.procTotal = 0;
  arrival.procMax = 0;
}

/** Record one event: its arrival timestamp (for the inter-arrival gap) and the
 *  wall-clock spent processing it (parse + dispatch + buffer push). */
export function tickArrival(arriveMs: number, procMs: number): void {
  if (!isPerfTraceEnabled()) return;
  if (arrival.count === 0) arrival.firstArrive = arriveMs;
  if (arrival.prevArrive > 0) {
    const gap = arriveMs - arrival.prevArrive;
    if (gap > arrival.gapMax) arrival.gapMax = gap;
  }
  arrival.prevArrive = arriveMs;
  arrival.procTotal += procMs;
  if (procMs > arrival.procMax) arrival.procMax = procMs;
  arrival.count += 1;
}

export type ArrivalReport = { count: number; procTotal: number; procMax: number; gapMax: number };

/** Snapshot the probe (for tests / programmatic reads). */
export function getArrival(): ArrivalReport {
  return {
    count: arrival.count,
    procTotal: arrival.procTotal,
    procMax: arrival.procMax,
    gapMax: arrival.gapMax,
  };
}

/** Emit a one-line arrival breakdown for a burst of `burstMs` wall-clock. */
export function reportArrival(burstMs: number): void {
  if (!isPerfTraceEnabled()) return;
  if (arrival.count === 0) return;
  const waitMs = Math.max(0, burstMs - arrival.procTotal);
  const avgGap = arrival.count > 1 ? burstMs / (arrival.count - 1) : 0;
  console.warn(
    `[perf] arrival: frames=${arrival.count} burst=${burstMs.toFixed(0)}ms ` +
      `procTotal=${arrival.procTotal.toFixed(0)}ms procMax=${arrival.procMax.toFixed(1)}ms ` +
      `gapAvg=${avgGap.toFixed(2)}ms gapMax=${arrival.gapMax.toFixed(1)}ms wait≈${waitMs.toFixed(0)}ms`,
  );
}

export type PerfReportEntry = {
  count: number;
  mean: number;
  max: number;
  total: number;
  lastSize?: number;
};
export type PerfReport = Record<string, PerfReportEntry>;

/** Aggregate recorded samples by label. */
export function getReport(): PerfReport {
  const report: PerfReport = {};
  for (const s of samples) {
    const entry = report[s.label] ?? { count: 0, mean: 0, max: 0, total: 0 };
    entry.count += 1;
    entry.total += s.ms;
    entry.max = Math.max(entry.max, s.ms);
    entry.mean = entry.total / entry.count;
    if (s.size != null) entry.lastSize = s.size;
    report[s.label] = entry;
  }
  return report;
}

/** Print the aggregated report as a console table. */
export function printReport(): void {
  const rows = Object.entries(getReport()).map(([label, e]) => ({
    label,
    count: e.count,
    meanMs: +e.mean.toFixed(1),
    maxMs: +e.max.toFixed(1),
    totalMs: +e.total.toFixed(1),
    lastSize: e.lastSize ?? "",
  }));
  console.table(rows);
}

/** Test-only: clear the buffer and marks. */
export function __resetPerfTrace(): void {
  samples.length = 0;
  marks.clear();
  arrival.count = 0;
  arrival.firstArrive = 0;
  arrival.prevArrive = 0;
  arrival.gapMax = 0;
  arrival.procTotal = 0;
  arrival.procMax = 0;
}
