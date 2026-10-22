import { describe, expect, test } from "bun:test";
import { assembleGenUiDoc, GEN_UI_HTML_CSP, mergeWidgetState } from "./gen-ui-widget-card";
import type { GenUiSessionState } from "@agents-remote/shared";

// ── assembleGenUiDoc（srcdoc 拼装）───────────────────────────────────────

describe("assembleGenUiDoc", () => {
  const boot = {
    widgetState: { modelContent: '{"value":42}' },
    theme: "dark",
    locale: "zh",
  } as const;

  test("injects CSP meta and bridge after a leading doctype", () => {
    const doc = assembleGenUiDoc(
      "<!doctype html><html><head><title>t</title></head><body><p>hi</p></body></html>",
      boot,
    );
    // doctype 保持文档最前（quirks mode 防线）。
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    const injected = doc.slice("<!doctype html>".length);
    expect(injected.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc).toContain("__GEN_UI_BOOT__");
    expect(doc).toContain("window.zcode");
    // 页面内容在注入段之后,执行序 = meta CSP → boot → 桥 → 页面脚本。
    expect(doc.indexOf("<p>hi</p>")).toBeGreaterThan(doc.indexOf("window.zcode"));
  });

  test("injects at the very front when the page has no doctype", () => {
    const doc = assembleGenUiDoc("<html><body><p>hi</p></body></html>", boot);
    expect(doc.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc.indexOf("<p>hi</p>")).toBeGreaterThan(doc.indexOf("window.zcode"));
  });

  test("escapes < in boot JSON to prevent script-tag breakout", () => {
    const doc = assembleGenUiDoc("<p>hi</p>", {
      widgetState: { modelContent: "</script><script>alert(1)</script>" },
      theme: "dark",
      locale: "zh",
    });
    expect(doc).not.toContain("</script><script>alert(1)</script>");
    expect(doc).toContain("\\u003c/script>");
  });

  test("CSP keeps deny-by-default core directives", () => {
    expect(GEN_UI_HTML_CSP).toContain("default-src 'none'");
    expect(GEN_UI_HTML_CSP).toContain("connect-src 'none'");
    expect(GEN_UI_HTML_CSP).toContain("form-action 'none'");
  });

  test("bridge adapts slot types both ways (write stringify / read parse)", () => {
    // 页面两侧拿 JSON 原形:写侧非字符串槽自动序列化,读侧字符串槽自动反序列化。
    const doc = assembleGenUiDoc("<p>hi</p>", boot);
    expect(doc).toContain("JSON.stringify(v)");
    expect(doc).toContain("JSON.parse(v)");
  });
});

// ── mergeWidgetState（setWidgetState → 会话 state 合并）──────────────────

describe("mergeWidgetState", () => {
  const empty: GenUiSessionState = { schemaVersion: 1, widgets: [] };

  test("appends a new widget entry", () => {
    const next = mergeWidgetState(empty, ".agents-remote/gen-ui/a.html", "A", {
      modelContent: "v1",
    });
    expect(next.schemaVersion).toBe(1);
    expect(next.widgets).toHaveLength(1);
    expect(next.widgets[0].path).toBe(".agents-remote/gen-ui/a.html");
    expect(next.widgets[0].title).toBe("A");
    expect(next.widgets[0].modelContent).toBe("v1");
  });

  test("preserves the other slot and title when only one slot is written", () => {
    const seeded: GenUiSessionState = {
      schemaVersion: 1,
      widgets: [
        {
          path: ".agents-remote/gen-ui/a.html",
          title: "A",
          modelContent: "m1",
          privateContent: "p1",
        },
      ],
    };
    const next = mergeWidgetState(seeded, ".agents-remote/gen-ui/a.html", undefined, {
      privateContent: "p2",
    });
    expect(next.widgets[0].modelContent).toBe("m1");
    expect(next.widgets[0].privateContent).toBe("p2");
    expect(next.widgets).toHaveLength(1);
  });

  test("overwrites slots with last-wins and keeps other widgets intact", () => {
    const seeded: GenUiSessionState = {
      schemaVersion: 1,
      widgets: [
        { path: ".agents-remote/gen-ui/a.html", modelContent: "old", updatedAt: "t" },
        { path: ".agents-remote/gen-ui/b.html", modelContent: "keep", updatedAt: "t" },
      ],
    };
    const next = mergeWidgetState(seeded, ".agents-remote/gen-ui/a.html", undefined, {
      modelContent: "new",
    });
    expect(next.widgets).toHaveLength(2);
    expect(next.widgets.find((w) => w.path === ".agents-remote/gen-ui/b.html")?.modelContent).toBe(
      "keep",
    );
    expect(next.widgets.find((w) => w.path === ".agents-remote/gen-ui/a.html")?.modelContent).toBe(
      "new",
    );
  });

  test("caps the widget list at 32 entries, evicting the oldest", () => {
    // api hard-gates >32 widgets with a 400, which would silently break state
    // persistence for the whole session — the merge must stay under the cap.
    const seeded: GenUiSessionState = {
      schemaVersion: 1,
      widgets: Array.from({ length: 32 }, (_, i) => ({
        path: `.agents-remote/gen-ui/w${i}.html`,
        modelContent: `v${i}`,
        updatedAt: new Date(2026, 0, 1, 0, i).toISOString(),
      })),
    };
    const next = mergeWidgetState(seeded, ".agents-remote/gen-ui/new.html", undefined, {
      modelContent: "fresh",
    });
    expect(next.widgets).toHaveLength(32);
    expect(next.widgets.some((w) => w.path === ".agents-remote/gen-ui/w0.html")).toBe(false);
    expect(next.widgets.at(-1)?.path).toBe(".agents-remote/gen-ui/new.html");
  });
});
