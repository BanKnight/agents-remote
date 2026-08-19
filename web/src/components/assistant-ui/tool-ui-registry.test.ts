import { describe, expect, test } from "bun:test";
import {
  FirecrawlSearchToolUI,
  FirecrawlScrapeToolUI,
  getToolRenderer,
  lineDiff,
} from "./tool-ui-registry";

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

describe("pi tool renderer registry", () => {
  test("firecrawl tools resolve to dedicated renderers, not GenericToolUI", () => {
    expect(getToolRenderer("firecrawl_search")).toBe(FirecrawlSearchToolUI);
    expect(getToolRenderer("firecrawl_scrape")).toBe(FirecrawlScrapeToolUI);
  });

  test("pi built-in lowercase tools resolve to non-generic renderers", () => {
    for (const name of ["read", "ls", "grep", "find"]) {
      expect(getToolRenderer(name)).not.toBe(getToolRenderer("unknown_tool"));
    }
  });

  test("unknown tool still falls back to GenericToolUI", () => {
    const generic = getToolRenderer("definitely_not_a_tool");
    const generic2 = getToolRenderer("generic_tool");
    expect(generic).toBe(generic2);
  });
});
