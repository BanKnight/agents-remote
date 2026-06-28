import { describe, expect, test } from "bun:test";
import { extToEditorLanguage } from "./editor-languages";

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
