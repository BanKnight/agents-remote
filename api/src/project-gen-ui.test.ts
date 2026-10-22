import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildGenUiContextBlock,
  genUiRelativePath,
  isGenUiRelativePath,
  normalizeSessionState,
  ProjectGenUiError,
  ProjectGenUiService,
} from "./project-gen-ui";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-gen-ui-"));
  outside = await mkdtemp(join(tmpdir(), "agents-remote-gen-ui-outside-"));
  await mkdir(join(root, "demo"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

// mcp.json 门控:demo 项目默认开启 gen-ui capability。
const writeMcpConfig = async (config: object) => {
  const dir = join(root, "demo", ".agents-remote");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "mcp.json"), JSON.stringify(config));
};

const enableGenUi = async () => {
  await writeMcpConfig({ capabilities: { "gen-ui": true } });
};

const writeHtml = async (rel: string, content: string) => {
  const target = join(root, "demo", ".agents-remote", "gen-ui", rel);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, content);
};

const service = () => new ProjectGenUiService(root);

// ── 纯函数:路径守卫 ──────────────────────────────────────────────────

test("isGenUiRelativePath accepts paths inside gen-ui", () => {
  expect(isGenUiRelativePath(".agents-remote/gen-ui/slider.html")).toBe(true);
  expect(isGenUiRelativePath(".agents-remote/gen-ui/sub/dir/page.html")).toBe(true);
});

test("isGenUiRelativePath rejects escapes and malformed paths", () => {
  expect(isGenUiRelativePath(".agents-remote/gen-ui/../mcp.json")).toBe(false);
  expect(isGenUiRelativePath(".agents-remote/gen-ui/../../outside.html")).toBe(false);
  expect(isGenUiRelativePath("mcp.json")).toBe(false);
  expect(isGenUiRelativePath("")).toBe(false);
  expect(isGenUiRelativePath("/abs/path.html")).toBe(false);
  expect(isGenUiRelativePath(".agents-remote/gen-ui")).toBe(false);
});

test("genUiRelativePath strips the gen-ui prefix", () => {
  expect(genUiRelativePath(".agents-remote/gen-ui/a.html")).toBe("a.html");
  expect(genUiRelativePath(".agents-remote/gen-ui/s/b.html")).toBe("s/b.html");
  expect(genUiRelativePath("mcp.json")).toBeUndefined();
});

// ── readGenUiFile ───────────────────────────────────────────────────

test("readGenUiFile reads a generated page when capability is enabled", async () => {
  await enableGenUi();
  await writeHtml("slider.html", "<p>hello</p>");
  const file = await service().readGenUiFile("demo", ".agents-remote/gen-ui/slider.html");
  expect(file.mimeType).toBe("text/html");
  expect(file.html).toBe("<p>hello</p>");
});

test("readGenUiFile rejects when capability is disabled", async () => {
  await writeMcpConfig({ capabilities: { ui: true } });
  await writeHtml("slider.html", "<p>x</p>");
  expect(service().readGenUiFile("demo", ".agents-remote/gen-ui/slider.html")).rejects.toThrow();
});

test("readGenUiFile maps missing project to PROJECT_NOT_FOUND", async () => {
  await enableGenUi();
  let code = "";
  try {
    await service().readGenUiFile("ghost", ".agents-remote/gen-ui/a.html");
  } catch (error) {
    code = (error as ProjectGenUiError).code;
  }
  expect(code).toBe("PROJECT_NOT_FOUND");
});

test("readGenUiFile maps missing file to PROJECT_FILE_NOT_FOUND", async () => {
  await enableGenUi();
  let code = "";
  try {
    await service().readGenUiFile("demo", ".agents-remote/gen-ui/none.html");
  } catch (error) {
    code = (error as ProjectGenUiError).code;
  }
  expect(code).toBe("PROJECT_FILE_NOT_FOUND");
});

test("readGenUiFile rejects files over 1MB", async () => {
  await enableGenUi();
  await writeHtml("big.html", "x".repeat(1_000_001));
  let code = "";
  try {
    await service().readGenUiFile("demo", ".agents-remote/gen-ui/big.html");
  } catch (error) {
    code = (error as ProjectGenUiError).code;
  }
  expect(code).toBe("PROJECT_GEN_UI_INVALID");
});

test("readGenUiFile rejects directory paths", async () => {
  await enableGenUi();
  await writeHtml("adir/index.html", "<p>x</p>");
  let code = "";
  try {
    await service().readGenUiFile("demo", ".agents-remote/gen-ui/adir");
  } catch (error) {
    code = (error as ProjectGenUiError).code;
  }
  expect(code).toBe("PROJECT_FILE_NOT_FOUND");
});

test("readGenUiFile blocks symlink escape outside the project", async () => {
  await enableGenUi();
  await writeHtml("seed.html", "<p>seed</p>"); // 确保 gen-ui 目录存在
  const outsideFile = join(outside, "evil.html");
  await writeFile(outsideFile, "<p>secret</p>");
  const link = join(root, "demo", ".agents-remote", "gen-ui", "slip.html");
  await symlink(outsideFile, link);
  let code = "";
  try {
    await service().readGenUiFile("demo", ".agents-remote/gen-ui/slip.html");
  } catch (error) {
    code = (error as ProjectGenUiError).code;
  }
  expect(code).toBe("PROJECT_PATH_OUTSIDE_ROOT");
});

// ── readGenUiState / saveGenUiState ─────────────────────────────────

test("readGenUiState returns empty state when file is missing", async () => {
  await enableGenUi();
  const state = await service().readGenUiState("demo", "agent_abc123");
  expect(state.widgets).toEqual([]);
});

test("readGenUiState rejects invalid JSON", async () => {
  await enableGenUi();
  const stateDir = join(root, "demo", ".agents-remote", "gen-ui", "state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, "agent_bad.json"), "not-json");
  let code = "";
  try {
    await service().readGenUiState("demo", "agent_bad");
  } catch (error) {
    code = (error as ProjectGenUiError).code;
  }
  expect(code).toBe("PROJECT_GEN_UI_INVALID");
});

test("saveGenUiState round-trips a valid state", async () => {
  await enableGenUi();
  const svc = service();
  await svc.saveGenUiState("demo", "agent_rt", {
    schemaVersion: 1,
    widgets: [
      {
        path: ".agents-remote/gen-ui/slider.html",
        title: "Slider",
        modelContent: '{"value":42}',
        privateContent: "browser-secret",
        updatedAt: "2026-10-22T00:00:00.000Z",
      },
    ],
  });
  const readBack = await svc.readGenUiState("demo", "agent_rt");
  expect(readBack.widgets).toHaveLength(1);
  expect(readBack.widgets[0].modelContent).toBe('{"value":42}');
  expect(readBack.widgets[0].privateContent).toBe("browser-secret");
});

test("saveGenUiState rejects state over 16KiB", async () => {
  await enableGenUi();
  const big = "x".repeat(12_000);
  let code = "";
  try {
    await service().saveGenUiState("demo", "agent_big", {
      schemaVersion: 1,
      widgets: [
        { path: ".agents-remote/gen-ui/a.html", modelContent: big, updatedAt: "t" },
        { path: ".agents-remote/gen-ui/b.html", modelContent: big, updatedAt: "t" },
      ],
    });
  } catch (error) {
    code = (error as ProjectGenUiError).code;
  }
  expect(code).toBe("PROJECT_GEN_UI_INVALID");
});

test("saveGenUiState rejects invalid session ids", async () => {
  await enableGenUi();
  let code = "";
  try {
    await service().saveGenUiState("demo", "../escape", { schemaVersion: 1, widgets: [] });
  } catch (error) {
    code = (error as ProjectGenUiError).code;
  }
  expect(code).toBe("PROJECT_GEN_UI_INVALID");
});

test("saveGenUiState rejects more than 32 widgets", async () => {
  await enableGenUi();
  const widgets = Array.from({ length: 33 }, (_, i) => ({
    path: `.agents-remote/gen-ui/w${i}.html`,
    updatedAt: "t",
  }));
  let code = "";
  try {
    await service().saveGenUiState("demo", "agent_many", { schemaVersion: 1, widgets });
  } catch (error) {
    code = (error as ProjectGenUiError).code;
  }
  expect(code).toBe("PROJECT_GEN_UI_INVALID");
});

test("saveGenUiState dedupes same-path widgets with last-wins", async () => {
  await enableGenUi();
  const svc = service();
  await svc.saveGenUiState("demo", "agent_dup", {
    schemaVersion: 1,
    widgets: [
      { path: ".agents-remote/gen-ui/a.html", modelContent: "v1", updatedAt: "t1" },
      { path: ".agents-remote/gen-ui/a.html", modelContent: "v2", updatedAt: "t2" },
    ],
  });
  const state = await svc.readGenUiState("demo", "agent_dup");
  expect(state.widgets).toHaveLength(1);
  expect(state.widgets[0].modelContent).toBe("v2");
});

test("saveGenUiState serializes concurrent saves without corruption", async () => {
  await enableGenUi();
  const svc = service();
  await Promise.all([
    svc.saveGenUiState("demo", "agent_conc", {
      schemaVersion: 1,
      widgets: [{ path: ".agents-remote/gen-ui/a.html", modelContent: "one", updatedAt: "t" }],
    }),
    svc.saveGenUiState("demo", "agent_conc", {
      schemaVersion: 1,
      write2: "ignored-extra-keys-are-dropped",
      widgets: [{ path: ".agents-remote/gen-ui/a.html", modelContent: "two", updatedAt: "t" }],
    }),
  ]);
  const state = await svc.readGenUiState("demo", "agent_conc");
  expect(state.widgets).toHaveLength(1);
  expect(["one", "two"]).toContain(state.widgets[0].modelContent);
});

// ── normalizeSessionState / buildGenUiContextBlock ──────────────────

test("normalizeSessionState rejects bad versions, shapes and escaping widget paths", () => {
  const bads: unknown[] = [
    { schemaVersion: 2, widgets: [] },
    { schemaVersion: 1, widgets: "no" },
    { schemaVersion: 1, widgets: [{ path: "../evil.html", updatedAt: "t" }] },
    { schemaVersion: 1, widgets: [{ path: "mcp.json", updatedAt: "t" }] },
  ];
  for (const bad of bads) {
    let threw = false;
    try {
      normalizeSessionState(bad);
    } catch (error) {
      threw = error instanceof ProjectGenUiError;
    }
    expect(threw).toBe(true);
  }
});

test("buildGenUiContextBlock returns undefined for states without modelContent", () => {
  expect(buildGenUiContextBlock({ schemaVersion: 1, widgets: [] })).toBeUndefined();
  expect(
    buildGenUiContextBlock({
      schemaVersion: 1,
      widgets: [{ path: ".agents-remote/gen-ui/a.html", updatedAt: "t" }],
    }),
  ).toBeUndefined();
});

test("buildGenUiContextBlock assembles widget blocks from modelContent only", () => {
  const block = buildGenUiContextBlock({
    schemaVersion: 1,
    widgets: [
      {
        path: ".agents-remote/gen-ui/slider.html",
        title: "滑块",
        modelContent: '{"value":42}',
        privateContent: "browser-secret",
        updatedAt: "t",
      },
    ],
  });
  expect(block).toContain("<gen-ui-context>");
  expect(block).toContain('[gen-ui-widget path=".agents-remote/gen-ui/slider.html" title="滑块"]');
  expect(block).toContain('{"value":42}');
  expect(block).not.toContain("browser-secret");
});
