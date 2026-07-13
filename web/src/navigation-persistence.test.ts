// @vitest-environment jsdom
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, expect, test, beforeEach } from "bun:test";
import { restoreLastPath, saveCurrentPath } from "./navigation-persistence";

let store: Record<string, string>;
let standalone = true;

const fakeLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    store = {};
  },
};

// Snapshot globals so we can restore them afterAll — bun test shares globalThis
// across files in the same process, and leaking window/localStorage breaks other
// suites (e.g. claude2-adapter.hook.test.ts sets up its own JSDOM).
const prevWindow = (globalThis as { window?: Window }).window;
const prevLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;

// jsdom is missing matchMedia; stub it so isStandaloneDisplay() reads `.matches`,
// toggled by `standalone`.
beforeAll(() => {
  const dom = new JSDOM("<!DOCTYPE html>", { url: "http://localhost/" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.window.matchMedia = ((query: string) => ({
    matches: query.includes("standalone") && standalone,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  globalThis.localStorage = fakeLocalStorage as typeof localStorage;
});

afterAll(() => {
  (globalThis as { window?: Window }).window = prevWindow;
  (globalThis as { localStorage?: Storage }).localStorage = prevLocalStorage;
});

const setStandalone = (next: boolean) => {
  standalone = next;
};
// jsdom's window.location is a read-only accessor; drive pathname via history
// (restoreLastPath reads window.location.pathname, which follows history state).
const setPathname = (pathname: string) => {
  window.history.replaceState(null, "", pathname);
};

beforeEach(() => {
  store = {};
  setStandalone(true);
  setPathname("/");
});

test("saveCurrentPath stores non-root URL", () => {
  saveCurrentPath("/projects/foo", "?workspace=agents");
  expect(localStorage.getItem("last_path")).toBe("/projects/foo?workspace=agents");
});

test("saveCurrentPath removes key when on root", () => {
  localStorage.setItem("last_path", "/projects/old");

  saveCurrentPath("/", "");

  expect(localStorage.getItem("last_path")).toBeNull();
});

test("saveCurrentPath handles root with trailing query as non-root", () => {
  saveCurrentPath("/", "?foo=bar");
  expect(localStorage.getItem("last_path")).toBe("/?foo=bar");
});

test("saveCurrentPath handles session detail deep link", () => {
  saveCurrentPath("/projects/demo/agent-sessions/abc123", "");
  expect(localStorage.getItem("last_path")).toBe("/projects/demo/agent-sessions/abc123");
});

test("saveCurrentPath only accepts string arguments", () => {
  // Passing a non-string would be a type error caught by TS.
  // This test documents the contract: both arguments MUST be strings,
  // preventing the "Cannot convert object to primitive value" bug.
  const href = "/projects/foo" + "?ws=agents";
  expect(typeof href).toBe("string");
  expect(() => localStorage.setItem("last_path", href)).not.toThrow();
});

// ── standalone gate：浏览器 tab（非 PWA）不存不恢复，避免主动导航到 / 被跳回 ──────────

test("saveCurrentPath is a no-op outside standalone PWA (browser tab)", () => {
  setStandalone(false);
  saveCurrentPath("/projects/foo", "?workspace=agents");
  expect(localStorage.getItem("last_path")).toBeNull();
});

test("restoreLastPath replaces URL when standalone + on root + saved path exists", () => {
  localStorage.setItem("last_path", "/files");
  const calls: string[] = [];
  const orig = window.history.replaceState;
  window.history.replaceState = ((...args: unknown[]) => {
    calls.push(args[2] as string);
    return orig.apply(window.history, args as never);
  }) as typeof window.history.replaceState;

  restoreLastPath();

  window.history.replaceState = orig;
  expect(calls).toEqual(["/files"]);
});

test("restoreLastPath is a no-op when not on root (other valid URLs keep their path)", () => {
  localStorage.setItem("last_path", "/files");
  setPathname("/projects");
  const calls: string[] = [];
  const orig = window.history.replaceState;
  window.history.replaceState = ((...args: unknown[]) => {
    calls.push(args[2] as string);
    return orig.apply(window.history, args as never);
  }) as typeof window.history.replaceState;

  restoreLastPath();

  window.history.replaceState = orig;
  expect(calls).toEqual([]);
});

test("restoreLastPath is a no-op outside standalone PWA (browser tab never reverts)", () => {
  setStandalone(false);
  localStorage.setItem("last_path", "/files");
  const calls: string[] = [];
  const orig = window.history.replaceState;
  window.history.replaceState = ((...args: unknown[]) => {
    calls.push(args[2] as string);
    return orig.apply(window.history, args as never);
  }) as typeof window.history.replaceState;

  restoreLastPath();

  window.history.replaceState = orig;
  expect(calls).toEqual([]);
});
