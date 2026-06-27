import { describe, expect, test } from "bun:test";
import { defaultRenderMode } from "./file-browser";

describe("defaultRenderMode", () => {
  test("markdown / html default to render", () => {
    expect(defaultRenderMode("README.md")).toBe("render");
    expect(defaultRenderMode("page.html")).toBe("render");
    expect(defaultRenderMode("legacy.htm")).toBe("render");
  });

  test("code and unknown files default to source", () => {
    expect(defaultRenderMode("app.tsx")).toBe("source");
    expect(defaultRenderMode("main.py")).toBe("source");
    expect(defaultRenderMode("config.json")).toBe("source");
    expect(defaultRenderMode("Makefile")).toBe("source");
  });
});
