import { describe, expect, test } from "bun:test";
import { DEFAULT_TOOL_ICON, ToolIcons } from "./tool-head";

describe("ToolIcons", () => {
  test("has a sparkles glyph (gen-ui cards must not silently fall back to command)", () => {
    expect(ToolIcons.sparkles).toBeDefined();
    expect(ToolIcons.sparkles).toContain("<path");
    expect(ToolIcons.sparkles).not.toBe(ToolIcons[DEFAULT_TOOL_ICON]);
  });
});
