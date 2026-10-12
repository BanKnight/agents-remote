import { describe, expect, test } from "bun:test";
import { extToEditorLanguage, shouldWrapInEditor } from "./editor-languages";

describe("extToEditorLanguage", () => {
  test("returns a single-element extension array for known code extensions", () => {
    expect(extToEditorLanguage("app.tsx")).toHaveLength(1);
    expect(extToEditorLanguage("index.ts")).toHaveLength(1);
    expect(extToEditorLanguage("main.py")).toHaveLength(1);
    expect(extToEditorLanguage("config.json")).toHaveLength(1);
    expect(extToEditorLanguage("page.html")).toHaveLength(1);
    expect(extToEditorLanguage("main.go")).toHaveLength(1);
  });

  test("returns an empty array for extensions without a language pack", () => {
    expect(extToEditorLanguage("notes.yaml")).toEqual([]);
    expect(extToEditorLanguage("config.toml")).toEqual([]);
    expect(extToEditorLanguage("deploy.sh")).toEqual([]);
    expect(extToEditorLanguage("patch.diff")).toEqual([]);
  });

  test("returns an empty array for unknown extensions or no extension", () => {
    expect(extToEditorLanguage("file.unknownext")).toEqual([]);
    expect(extToEditorLanguage("Makefile")).toEqual([]);
    expect(extToEditorLanguage("noext")).toEqual([]);
  });

  test("is case-insensitive on the extension", () => {
    expect(extToEditorLanguage("App.TSX")).toHaveLength(1);
    expect(extToEditorLanguage("MAIN.PY")).toHaveLength(1);
  });
});

describe("shouldWrapInEditor", () => {
  test("prose files wrap", () => {
    expect(shouldWrapInEditor("README.md")).toBe(true);
    expect(shouldWrapInEditor("notes.markdown")).toBe(true);
    expect(shouldWrapInEditor("todo.txt")).toBe(true);
    expect(shouldWrapInEditor("ReadMe.MD")).toBe(true);
  });

  test("code and structured files do not wrap", () => {
    expect(shouldWrapInEditor("index.ts")).toBe(false);
    expect(shouldWrapInEditor("main.py")).toBe(false);
    expect(shouldWrapInEditor("config.json")).toBe(false);
    expect(shouldWrapInEditor("page.html")).toBe(false);
    // 散文 + 代码混合按源码处理。
    expect(shouldWrapInEditor("post.mdx")).toBe(false);
    expect(shouldWrapInEditor("notes.yaml")).toBe(false);
  });

  test("unknown extensions and extension-less names do not wrap", () => {
    expect(shouldWrapInEditor("file.unknownext")).toBe(false);
    expect(shouldWrapInEditor("Makefile")).toBe(false);
  });
});
