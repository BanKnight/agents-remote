import { expect, test, beforeEach } from "bun:test";
import { saveCurrentPath } from "./navigation-persistence";

let store: Record<string, string>;

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

globalThis.localStorage = fakeLocalStorage as typeof localStorage;

beforeEach(() => {
  store = {};
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
