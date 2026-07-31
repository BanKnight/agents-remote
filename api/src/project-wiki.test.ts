import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectWikiError, ProjectWikiService, sanitizeWikiSlug } from "./project-wiki";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-wiki-"));
  outside = await mkdtemp(join(tmpdir(), "agents-remote-wiki-outside-"));
  await mkdir(join(root, "demo"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── sanitizeWikiSlug ───────────────────────────────────────────────

test("sanitizeWikiSlug accepts legal slugs", () => {
  expect(sanitizeWikiSlug("my-page")).toBe("my-page");
  expect(sanitizeWikiSlug("my.page")).toBe("my.page");
  expect(sanitizeWikiSlug("My_Page1")).toBe("My_Page1");
  expect(sanitizeWikiSlug("  trim-me  ")).toBe("trim-me");
});

test("sanitizeWikiSlug rejects empty, traversal, and slash slugs with WIKI_SLUG_INVALID", () => {
  for (const bad of ["", "  ", "..", ".", "../etc", "a/b", "a\\b", "has\0null"]) {
    let caught: unknown;
    try {
      sanitizeWikiSlug(bad);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProjectWikiError);
    expect((caught as ProjectWikiError).code).toBe("WIKI_SLUG_INVALID");
  }
});

// ── listPages ──────────────────────────────────────────────────────

test("listPages returns [] when wiki dir does not exist", async () => {
  const service = new ProjectWikiService(root);
  await expect(service.listPages("demo")).resolves.toEqual([]);
});

test("listPages returns [] for an empty wiki dir", async () => {
  await mkdir(join(root, "demo", "wiki"));
  const service = new ProjectWikiService(root);
  await expect(service.listPages("demo")).resolves.toEqual([]);
});

test("listPages returns summaries and skips non-md files", async () => {
  const service = new ProjectWikiService(root);
  await service.writePage("demo", "page-a", { title: "Page A", content: "body a", tags: ["x"] });
  await service.writePage("demo", "page-b", { title: "Page B", content: "body b" });
  await writeFile(join(root, "demo", "wiki", "notes.txt"), "not a page");

  const pages = await service.listPages("demo");
  expect(pages).toHaveLength(2);
  const slugs = pages.map((p) => p.slug).sort();
  expect(slugs).toEqual(["page-a", "page-b"]);
  const a = pages.find((p) => p.slug === "page-a");
  expect(a?.title).toBe("Page A");
  expect(a?.tags).toEqual(["x"]);
  expect(a?.updated).toMatch(ISO_DATE_RE);
});

// ── readPage ───────────────────────────────────────────────────────

test("readPage returns frontmatter + body for a written page", async () => {
  const service = new ProjectWikiService(root);
  await service.writePage("demo", "intro", {
    title: "Introduction",
    content: "# Hello\n\nworld",
    tags: ["a", "b"],
  });
  const page = await service.readPage("demo", "intro");
  expect(page.slug).toBe("intro");
  expect(page.frontmatter.title).toBe("Introduction");
  expect(page.frontmatter.tags).toEqual(["a", "b"]);
  expect(page.frontmatter.created).toMatch(ISO_DATE_RE);
  expect(page.frontmatter.updated).toBe(page.frontmatter.created); // 新建 created==updated
  expect(page.body).toContain("# Hello");
  expect(page.body).toContain("world");
});

test("readPage falls back to slug/mtime for a page without frontmatter", async () => {
  await mkdir(join(root, "demo", "wiki"), { recursive: true });
  await writeFile(join(root, "demo", "wiki", "bare.md"), "# just a body\n");
  const service = new ProjectWikiService(root);
  const page = await service.readPage("demo", "bare");
  expect(page.frontmatter.title).toBe("bare"); // 缺 title → slug
  expect(page.frontmatter.tags).toEqual([]);
  expect(page.frontmatter.created).toMatch(ISO_DATE_RE); // 缺 created → mtime 日期
  expect(page.body).toContain("# just a body");
});

test("readPage normalizes unquoted YAML dates (js-yaml parses to Date) to strings", async () => {
  await mkdir(join(root, "demo", "wiki"), { recursive: true });
  // 手写无引号日期:js-yaml 会解析成 Date 对象,buildWikiPage 须归一化回字符串。
  await writeFile(
    join(root, "demo", "wiki", "dated.md"),
    "---\ntitle: D\ntags: []\ncreated: 2026-01-02\nupdated: 2026-01-03\n---\nbody\n",
  );
  const service = new ProjectWikiService(root);
  const page = await service.readPage("demo", "dated");
  expect(page.frontmatter.created).toBe("2026-01-02");
  expect(page.frontmatter.updated).toBe("2026-01-03");
  expect(typeof page.frontmatter.created).toBe("string");
});

test("readPage rejects a missing page with PROJECT_FILE_NOT_FOUND", async () => {
  await mkdir(join(root, "demo", "wiki"));
  const service = new ProjectWikiService(root);
  await expect(service.readPage("demo", "nope")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_FOUND",
  });
});

test("readPage rejects a traversal slug with WIKI_SLUG_INVALID (regex blocks /)", async () => {
  const service = new ProjectWikiService(root);
  await expect(service.readPage("demo", "../../etc/passwd")).rejects.toMatchObject({
    code: "WIKI_SLUG_INVALID",
  });
});

test("readPage rejects a wiki page that is a symlink escaping the project", async () => {
  await mkdir(join(root, "demo", "wiki"), { recursive: true });
  await writeFile(join(outside, "secret.md"), "SECRET");
  await symlink(join(outside, "secret.md"), join(root, "demo", "wiki", "leak.md"));
  const service = new ProjectWikiService(root);
  await expect(service.readPage("demo", "leak")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

// ── writePage ──────────────────────────────────────────────────────

test("writePage creates a new page with injected frontmatter on disk", async () => {
  const service = new ProjectWikiService(root);
  const result = await service.writePage("demo", "new-page", {
    title: "New",
    content: "fresh body",
    tags: ["t1", "t2"],
  });
  expect(result.created).toBe(true);
  // 落盘内容含 frontmatter + body。
  const raw = await import("node:fs/promises").then((m) =>
    m.readFile(join(root, "demo", "wiki", "new-page.md"), "utf8"),
  );
  expect(raw).toContain("title: New");
  expect(raw).toContain("- t1");
  expect(raw).toContain("fresh body");
});

test("writePage refuses to overwrite an existing page without overwrite=true", async () => {
  const service = new ProjectWikiService(root);
  await service.writePage("demo", "exists", { title: "V1", content: "v1" });
  await expect(
    service.writePage("demo", "exists", { title: "V2", content: "v2" }),
  ).rejects.toMatchObject({ code: "PROJECT_FILE_TARGET_EXISTS" });
});

test("writePage with overwrite=true preserves created and refreshes updated", async () => {
  await mkdir(join(root, "demo", "wiki"), { recursive: true });
  // 预置一个 created 较旧的页面。
  await writeFile(
    join(root, "demo", "wiki", "old.md"),
    "---\ntitle: Old\ntags: []\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\nold body\n",
  );
  const service = new ProjectWikiService(root);
  const result = await service.writePage("demo", "old", {
    title: "Old",
    content: "new body",
    overwrite: true,
  });
  expect(result.created).toBe(false); // 覆盖
  const page = await service.readPage("demo", "old");
  expect(page.frontmatter.created).toBe("2026-01-01"); // 保留原 created
  expect(page.frontmatter.updated).toMatch(ISO_DATE_RE); // 刷新为今天
  expect(page.body).toContain("new body");
});

test("writePage falls back title to slug when title is blank", async () => {
  const service = new ProjectWikiService(root);
  await service.writePage("demo", "no-title", { title: "   ", content: "x" });
  const page = await service.readPage("demo", "no-title");
  expect(page.frontmatter.title).toBe("no-title");
});

test("writePage rejects a traversal slug with WIKI_SLUG_INVALID", async () => {
  const service = new ProjectWikiService(root);
  await expect(
    service.writePage("demo", "../escape", { title: "x", content: "y" }),
  ).rejects.toMatchObject({ code: "WIKI_SLUG_INVALID" });
});

test("writePage propagates PROJECT_NOT_FOUND for a missing project", async () => {
  const service = new ProjectWikiService(root);
  await expect(
    service.writePage("missing-project", "x", { title: "x", content: "y" }),
  ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
});

test("ProjectWikiError carries its code", () => {
  const err = new ProjectWikiError("WIKI_SLUG_INVALID", "boom");
  expect(err).toBeInstanceOf(ProjectWikiError);
  expect(err.code).toBe("WIKI_SLUG_INVALID");
});
