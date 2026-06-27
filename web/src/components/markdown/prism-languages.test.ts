import { describe, expect, test } from "bun:test";
import { extToLang, KNOWN_LANGUAGES } from "./prism-languages";

describe("extToLang", () => {
  test("maps common extensions to prism language ids", () => {
    expect(extToLang("app.tsx")).toBe("tsx");
    expect(extToLang("index.ts")).toBe("typescript");
    expect(extToLang("main.py")).toBe("python");
    expect(extToLang("config.json")).toBe("json");
    expect(extToLang("style.css")).toBe("css");
    expect(extToLang("page.html")).toBe("html");
    expect(extToLang("README.md")).toBe("markdown");
    expect(extToLang("patch.diff")).toBe("diff");
    expect(extToLang("Cargo.toml")).toBe("toml");
  });

  test("is case-insensitive on the extension", () => {
    expect(extToLang("App.TSX")).toBe("tsx");
    expect(extToLang("MAIN.PY")).toBe("python");
  });

  test("returns undefined for unknown extension or no extension", () => {
    expect(extToLang("Makefile")).toBeUndefined();
    expect(extToLang("file.unknownext")).toBeUndefined();
    expect(extToLang("noext")).toBeUndefined();
  });

  test("returns only ids that are registered with Prism", () => {
    const lang = extToLang("app.tsx");
    if (lang !== undefined) expect(KNOWN_LANGUAGES.has(lang)).toBe(true);
  });
});

describe("KNOWN_LANGUAGES", () => {
  test("covers common languages used in chat + files", () => {
    const expected = [
      "tsx",
      "typescript",
      "ts",
      "javascript",
      "js",
      "python",
      "py",
      "bash",
      "sh",
      "shell",
      "markup",
      "json",
      "yaml",
      "yml",
      "toml",
      "css",
      "html",
      "xml",
      "svg",
      "go",
      "rust",
      "rs",
      "sql",
      "markdown",
      "md",
      "diff",
    ];
    for (const lang of expected) {
      expect(KNOWN_LANGUAGES.has(lang)).toBe(true);
    }
  });
});
