import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  computeWeakEtag,
  matchPagesRoot,
  normalizeUrlPath,
  ProjectPagesError,
  ProjectPagesService,
} from "./project-pages";
import type { PagesRoot } from "@agents-remote/shared";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-pages-"));
  outside = await mkdtemp(join(tmpdir(), "agents-remote-pages-outside-"));
  await mkdir(join(root, "demo"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

const writePagesConfig = async (roots: PagesRoot[]) => {
  const service = new ProjectPagesService(root);
  await service.writeConfig("demo", roots);
};

// ── normalizeUrlPath ────────────────────────────────────────────────

test("normalizeUrlPath normalizes various inputs to absolute paths", () => {
  expect(normalizeUrlPath("")).toBe("/");
  expect(normalizeUrlPath("/")).toBe("/");
  expect(normalizeUrlPath("docs")).toBe("/docs");
  expect(normalizeUrlPath("docs/")).toBe("/docs");
  expect(normalizeUrlPath("/docs/")).toBe("/docs");
  expect(normalizeUrlPath("//a//b")).toBe("/a/b");
  expect(normalizeUrlPath("  /docs  ")).toBe("/docs");
});

// ── matchPagesRoot ─────────────────────────────────────────────────

test("matchPagesRoot uses longest-prefix match and allows nested roots", () => {
  const roots: PagesRoot[] = [
    { urlPath: "/", fsDir: "site", auth: "public" },
    { urlPath: "/docs", fsDir: "docs", auth: "public" },
  ];
  expect(matchPagesRoot(roots, "/docs/x.html")?.urlPath).toBe("/docs");
  expect(matchPagesRoot(roots, "/index.html")?.urlPath).toBe("/");
  expect(matchPagesRoot(roots, "/")?.urlPath).toBe("/");
  expect(matchPagesRoot(roots, "/docs")?.urlPath).toBe("/docs");
});

test("matchPagesRoot returns undefined when no root matches", () => {
  const roots: PagesRoot[] = [{ urlPath: "/docs", fsDir: "docs", auth: "public" }];
  expect(matchPagesRoot(roots, "/images/x.png")).toBeUndefined();
});

test("computeWeakEtag is stable for same inputs and changes with any input", () => {
  const a = computeWeakEtag(100, 1000, "/p/a.html");
  const b = computeWeakEtag(100, 1000, "/p/a.html");
  expect(a).toBe(b);
  expect(a.startsWith('W/"')).toBe(true);
  expect(computeWeakEtag(101, 1000, "/p/a.html")).not.toBe(a);
  expect(computeWeakEtag(100, 1001, "/p/a.html")).not.toBe(a);
  expect(computeWeakEtag(100, 1000, "/p/b.html")).not.toBe(a);
});

// ── readConfig ─────────────────────────────────────────────────────

test("readConfig returns empty roots when config is missing", async () => {
  const service = new ProjectPagesService(root);
  await expect(service.readConfig("demo")).resolves.toEqual({
    schemaVersion: 1,
    roots: [],
  });
});

test("readConfig reads and normalizes a valid config", async () => {
  await mkdir(join(root, "demo", ".agents-remote"));
  await writeFile(
    join(root, "demo", ".agents-remote", "pages.json"),
    JSON.stringify({
      schemaVersion: 1,
      roots: [{ urlPath: "/docs/", fsDir: "site/dist", auth: "token" }],
    }),
  );
  const service = new ProjectPagesService(root);
  await expect(service.readConfig("demo")).resolves.toEqual({
    schemaVersion: 1,
    roots: [{ urlPath: "/docs", fsDir: "site/dist", auth: "token" }],
  });
});

test("readConfig rejects invalid JSON", async () => {
  await mkdir(join(root, "demo", ".agents-remote"));
  await writeFile(join(root, "demo", ".agents-remote", "pages.json"), "{not json");
  const service = new ProjectPagesService(root);
  await expect(service.readConfig("demo")).rejects.toMatchObject({
    code: "PROJECT_PAGES_CONFIG_INVALID",
  });
});

test("readConfig rejects config with non-array roots", async () => {
  await mkdir(join(root, "demo", ".agents-remote"));
  await writeFile(
    join(root, "demo", ".agents-remote", "pages.json"),
    JSON.stringify({ roots: "nope" }),
  );
  const service = new ProjectPagesService(root);
  await expect(service.readConfig("demo")).rejects.toMatchObject({
    code: "PROJECT_PAGES_CONFIG_INVALID",
  });
});

// ── writeConfig ────────────────────────────────────────────────────

test("writeConfig writes config and recreates .agents-remote dir", async () => {
  const service = new ProjectPagesService(root);
  const config = await service.writeConfig("demo", [
    { urlPath: "/", fsDir: "site", auth: "public" },
  ]);
  expect(config.roots).toEqual([{ urlPath: "/", fsDir: "site", auth: "public" }]);
  // 重读一致
  await expect(service.readConfig("demo")).resolves.toEqual(config);
});

test("writeConfig rejects duplicate urlPath", async () => {
  const service = new ProjectPagesService(root);
  await expect(
    service.writeConfig("demo", [
      { urlPath: "/", fsDir: "site", auth: "public" },
      { urlPath: "/", fsDir: "other", auth: "public" },
    ]),
  ).rejects.toMatchObject({ code: "PROJECT_PAGES_ROOT_CONFLICT" });
});

test("writeConfig rejects empty fsDir and parent-traversal fsDir", async () => {
  const service = new ProjectPagesService(root);
  await expect(
    service.writeConfig("demo", [{ urlPath: "/", fsDir: "", auth: "public" }]),
  ).rejects.toMatchObject({ code: "PROJECT_PAGES_CONFIG_INVALID" });
  await expect(
    service.writeConfig("demo", [{ urlPath: "/", fsDir: "../escape", auth: "public" }]),
  ).rejects.toMatchObject({ code: "PROJECT_PAGES_CONFIG_INVALID" });
});

// ── serve ──────────────────────────────────────────────────────────

test("serve returns content with correct mime and etag for a matched file", async () => {
  await mkdir(join(root, "demo", "site"));
  await writeFile(join(root, "demo", "site", "index.html"), "<h1>hello</h1>");
  await writePagesConfig([{ urlPath: "/", fsDir: "site", auth: "public" }]);

  const service = new ProjectPagesService(root);
  const served = await service.serve("demo", "/index.html");
  expect(served.mimeType).toBe("text/html; charset=utf-8");
  expect(served.content.toString()).toBe("<h1>hello</h1>");
  expect(served.root.auth).toBe("public");
  expect(served.etag.startsWith('W/"')).toBe(true);
});

test("serve matches longest-prefix root and strips the prefix", async () => {
  await mkdir(join(root, "demo", "docs"), { recursive: true });
  await writeFile(join(root, "demo", "docs", "a.css"), "body{}");
  await writePagesConfig([
    { urlPath: "/", fsDir: "site", auth: "public" },
    { urlPath: "/docs", fsDir: "docs", auth: "public" },
  ]);

  const service = new ProjectPagesService(root);
  const served = await service.serve("demo", "/docs/a.css");
  expect(served.mimeType).toBe("text/css; charset=utf-8");
  expect(served.content.toString()).toBe("body{}");
});

test("serve rejects a directory without index.html (no listing)", async () => {
  await mkdir(join(root, "demo", "site", "sub"), { recursive: true });
  await writePagesConfig([{ urlPath: "/", fsDir: "site", auth: "public" }]);

  const service = new ProjectPagesService(root);
  await expect(service.serve("demo", "/sub/")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_FOUND",
  });
});

test("serve serves index.html when a directory is requested (default page)", async () => {
  await mkdir(join(root, "demo", "site", "sub"), { recursive: true });
  await writeFile(join(root, "demo", "site", "index.html"), "<h1>root</h1>");
  await writeFile(join(root, "demo", "site", "sub", "index.html"), "<h1>sub</h1>");
  await writePagesConfig([{ urlPath: "/", fsDir: "site", auth: "public" }]);

  const service = new ProjectPagesService(root);
  // 根目录(/)→ site/index.html(默认页,触发 /p/{name}/ 直访场景)
  const rootPage = await service.serve("demo", "/");
  expect(rootPage.content.toString()).toBe("<h1>root</h1>");
  expect(rootPage.mimeType).toBe("text/html; charset=utf-8");
  // 子目录(/sub/)→ site/sub/index.html
  const subPage = await service.serve("demo", "/sub/");
  expect(subPage.content.toString()).toBe("<h1>sub</h1>");
});

test("serve rejects an index.html that is a symlink escaping the project", async () => {
  await mkdir(join(root, "demo", "site"), { recursive: true });
  await writeFile(join(outside, "secret.txt"), "SECRET");
  // site/index.html 是指向项目外 secret.txt 的符号链接(恶意默认页)
  await symlink(join(outside, "secret.txt"), join(root, "demo", "site", "index.html"));
  await writePagesConfig([{ urlPath: "/", fsDir: "site", auth: "public" }]);

  const service = new ProjectPagesService(root);
  // 请求根目录 → 尝试 site/index.html → realpath 双校验检测越界 → PATH_OUTSIDE_ROOT
  await expect(service.serve("demo", "/")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

test("serve rejects a missing file (no SPA fallback)", async () => {
  await mkdir(join(root, "demo", "site"), { recursive: true });
  await writePagesConfig([{ urlPath: "/", fsDir: "site", auth: "public" }]);

  const service = new ProjectPagesService(root);
  await expect(service.serve("demo", "/missing.html")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_FOUND",
  });
});

test("serve returns NOT_FOUND when no root matches", async () => {
  await writePagesConfig([{ urlPath: "/docs", fsDir: "docs", auth: "public" }]);
  const service = new ProjectPagesService(root);
  await expect(service.serve("demo", "/images/x.png")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_FOUND",
  });
});

test("serve rejects path escape with ../", async () => {
  await mkdir(join(root, "demo", "site"), { recursive: true });
  await writeFile(join(outside, "secret.txt"), "SECRET");
  await writePagesConfig([{ urlPath: "/", fsDir: "site", auth: "public" }]);

  const service = new ProjectPagesService(root);
  await expect(service.serve("demo", "/../../outside/secret.txt")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

test("serve rejects a symlink escaping the project", async () => {
  await mkdir(join(root, "demo", "site"), { recursive: true });
  await writeFile(join(outside, "secret.txt"), "SECRET");
  // 在 site 内建符号链接指向 outside
  await symlink(join(outside, "secret.txt"), join(root, "demo", "site", "leak.txt"));
  await writePagesConfig([{ urlPath: "/", fsDir: "site", auth: "public" }]);

  const service = new ProjectPagesService(root);
  await expect(service.serve("demo", "/leak.txt")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

test("serve propagates PROJECT_NOT_FOUND for a missing project", async () => {
  const service = new ProjectPagesService(root);
  await expect(service.serve("missing-project", "/index.html")).rejects.toMatchObject({
    code: "PROJECT_NOT_FOUND",
  });
});

test("ProjectPagesError carries its code", () => {
  const err = new ProjectPagesError("PROJECT_PAGES_CONFIG_INVALID", "boom");
  expect(err).toBeInstanceOf(ProjectPagesError);
  expect(err.code).toBe("PROJECT_PAGES_CONFIG_INVALID");
});
