import { describe, expect, test } from "bun:test";
import { lineDiff } from "./tool-ui-registry";

describe("lineDiff", () => {
  test("identical strings produce only same lines", () => {
    const out = lineDiff("a\nb\nc", "a\nb\nc");
    expect(out).toEqual([
      { type: "same", text: "a" },
      { type: "same", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  test("pure insertion marks new lines as add", () => {
    const out = lineDiff("a\nc", "a\nb\nc");
    expect(out).toEqual([
      { type: "same", text: "a" },
      { type: "add", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  test("pure deletion marks removed lines as del", () => {
    const out = lineDiff("a\nb\nc", "a\nc");
    expect(out).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  test("replacement of a middle line", () => {
    const out = lineDiff("a\nold\nc", "a\nnew\nc");
    expect(out).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "old" },
      { type: "add", text: "new" },
      { type: "same", text: "c" },
    ]);
  });

  test("empty old string is all additions", () => {
    const out = lineDiff("", "x\ny");
    expect(out).toEqual([
      { type: "add", text: "x" },
      { type: "add", text: "y" },
    ]);
  });

  test("both empty yields no diff lines", () => {
    const out = lineDiff("", "");
    expect(out).toEqual([]);
  });
});
