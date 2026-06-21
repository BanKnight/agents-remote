import { beforeEach, describe, expect, mock, test } from "bun:test";
import { setPerfTraceEnabled } from "./debug-flags";
import {
  __resetPerfTrace,
  count,
  getArrival,
  getReport,
  markOnce,
  measureFrom,
  measureSince,
  peekMark,
  resetArrival,
  tickArrival,
  timed,
} from "./perf-trace";

describe("perf-trace", () => {
  beforeEach(() => {
    __resetPerfTrace();
    setPerfTraceEnabled(false);
  });

  test("disabled (default): returns fn result, records nothing", () => {
    const result = timed("normalize", () => 42, 100);
    expect(result).toBe(42);
    expect(getReport()).toEqual({});
  });

  test("enabled: records a sample with size and non-negative duration", () => {
    setPerfTraceEnabled(true);
    const result = timed("normalize", () => "ok", 100);
    expect(result).toBe("ok");
    const report = getReport();
    expect(report.normalize).toBeDefined();
    expect(report.normalize.count).toBe(1);
    expect(report.normalize.total).toBeGreaterThanOrEqual(0);
    expect(report.normalize.lastSize).toBe(100);
  });

  test("aggregates multiple samples: count, mean, max", () => {
    setPerfTraceEnabled(true);
    timed("a", () => 1);
    timed("a", () => 2);
    timed("a", () => 3);
    const report = getReport();
    expect(report.a.count).toBe(3);
    expect(report.a.max).toBeGreaterThanOrEqual(report.a.mean);
    expect(report.a.mean).toBeCloseTo(report.a.total / 3, 5);
  });

  test("measureSince records elapsed for a marked key and clears it", () => {
    setPerfTraceEnabled(true);
    markOnce("k");
    // Missing key records nothing.
    measureSince("missing", "nope");
    expect(getReport().nope).toBeUndefined();
    measureSince("k", "span", 5);
    const span = getReport().span;
    expect(span).toBeDefined();
    expect(span.lastSize).toBe(5);
    // markOnce re-settable after measureSince cleared it.
    markOnce("k");
    measureSince("k", "span2");
    expect(getReport().span2).toBeDefined();
  });

  test("measureFrom records delta from an arbitrary timestamp", () => {
    setPerfTraceEnabled(true);
    const start = performance.now();
    measureFrom("commit", start, 3);
    const commit = getReport().commit;
    expect(commit).toBeDefined();
    expect(commit.max).toBeGreaterThanOrEqual(0);
    expect(commit.lastSize).toBe(3);
  });

  test("peekMark reads a mark without clearing it", () => {
    setPerfTraceEnabled(true);
    markOnce("k");
    const t0 = peekMark("k");
    expect(t0).toBeDefined();
    expect(t0).toBeGreaterThanOrEqual(0);
    // Still present after a peek — it does not consume the mark.
    expect(peekMark("k")).toBe(t0);
    measureSince("k", "span");
    expect(getReport().span).toBeDefined();
  });

  test("count records occurrences without tripping the slow-sample warn", () => {
    setPerfTraceEnabled(true);
    const warnSpy = mock(() => undefined);
    const original = console.warn;
    console.warn = warnSpy;
    try {
      count("historyStart");
      count("historyStart");
      count("historyStart");
      const entry = getReport().historyStart;
      expect(entry).toBeDefined();
      expect(entry.count).toBe(3);
      // Zero-duration occurrences never trip the slow-sample warn.
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      console.warn = original;
    }
  });

  test("arrival probe aggregates inter-arrival gaps and processing time", () => {
    setPerfTraceEnabled(true);
    const base = performance.now();
    tickArrival(base, 1);
    tickArrival(base + 2, 3);
    tickArrival(base + 5, 2);
    const a = getArrival();
    expect(a.count).toBe(3);
    expect(a.procTotal).toBe(6);
    expect(a.procMax).toBe(3);
    // gaps: 2, 3 → max 3
    expect(a.gapMax).toBe(3);
  });

  test("resetArrival clears the probe", () => {
    setPerfTraceEnabled(true);
    tickArrival(performance.now(), 1);
    tickArrival(performance.now(), 2);
    resetArrival();
    expect(getArrival().count).toBe(0);
  });

  test("arrival probe is a no-op when tracing is disabled", () => {
    setPerfTraceEnabled(false);
    const base = performance.now();
    tickArrival(base, 5);
    tickArrival(base + 10, 5);
    setPerfTraceEnabled(true);
    expect(getArrival().count).toBe(0);
  });

  test("ring buffer caps the retained samples", () => {
    setPerfTraceEnabled(true);
    for (let i = 0; i < 250; i++) timed("bulk", () => i);
    // Cap is 200; oldest 50 dropped, so aggregation sees the last 200.
    expect(getReport().bulk.count).toBe(200);
  });

  test("a fast sample does not trigger the slow-sample warn", () => {
    setPerfTraceEnabled(true);
    const warnSpy = mock(() => undefined);
    const original = console.warn;
    console.warn = warnSpy;
    try {
      timed("fast", () => 1);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      console.warn = original;
    }
  });
});
