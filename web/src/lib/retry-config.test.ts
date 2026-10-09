import { describe, expect, test } from "bun:test";

import {
  RETRY_DELAY_STEPS_MS,
  RETRY_MAX_PER_WINDOW_MAX,
  RETRY_MAX_PER_WINDOW_MIN,
  formatRetryDelay,
  retryDelayStepIndex,
  stepRetryCount,
} from "./retry-config";

describe("formatRetryDelay", () => {
  test("秒级", () => {
    expect(formatRetryDelay(45_000)).toBe("45s");
    expect(formatRetryDelay(30_000)).toBe("30s");
  });

  test("整分与非整分", () => {
    expect(formatRetryDelay(60_000)).toBe("1m");
    expect(formatRetryDelay(300_000)).toBe("5m");
    expect(formatRetryDelay(1_800_000)).toBe("30m");
    expect(formatRetryDelay(90_000)).toBe("1.5m");
  });
});

describe("stepRetryCount", () => {
  test("普通步进", () => {
    expect(stepRetryCount(3, 1)).toBe(4);
    expect(stepRetryCount(3, -1)).toBe(2);
  });

  test("边界钳制", () => {
    expect(stepRetryCount(RETRY_MAX_PER_WINDOW_MIN, -1)).toBe(RETRY_MAX_PER_WINDOW_MIN);
    expect(stepRetryCount(RETRY_MAX_PER_WINDOW_MAX, 1)).toBe(RETRY_MAX_PER_WINDOW_MAX);
  });
});

describe("RETRY_DELAY_STEPS_MS", () => {
  test("升序且含默认值 1m", () => {
    for (let i = 1; i < RETRY_DELAY_STEPS_MS.length; i++) {
      expect(RETRY_DELAY_STEPS_MS[i] > RETRY_DELAY_STEPS_MS[i - 1]).toBe(true);
    }
    expect(RETRY_DELAY_STEPS_MS).toContain(60_000);
  });

  test("全在服务端 clamp 区间内", () => {
    for (const step of RETRY_DELAY_STEPS_MS) {
      expect(step >= 5_000).toBe(true);
      expect(step <= 3_600_000).toBe(true);
    }
  });
});

describe("retryDelayStepIndex", () => {
  test("命中档位返回索引", () => {
    expect(retryDelayStepIndex(45_000)).toBe(1);
    expect(retryDelayStepIndex(60_000)).toBe(2);
  });

  test("非档内值返回 -1", () => {
    expect(retryDelayStepIndex(90_000)).toBe(-1);
  });
});
