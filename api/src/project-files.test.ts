import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  FILE_SEARCH_LIMIT,
  IMAGE_PREVIEW_LIMIT_BYTES,
  ProjectFilesService,
  TEXT_PREVIEW_LIMIT_BYTES,
  UPLOAD_FILE_LIMIT_BYTES,
} from "./project-files";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-files-"));
  outside = await mkdtemp(join(tmpdir(), "agents-remote-files-outside-"));
  await mkdir(join(root, "demo"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test("listFiles hides only blocklisted entries (.git); other dot items visible", async () => {
  await mkdir(join(root, "demo", "z-dir"));
  await mkdir(join(root, "demo", ".config")); // 非 .git dot 目录 → 可见
  await mkdir(join(root, "demo", ".git")); // 黑名单 → 隐藏
  await writeFile(join(root, "demo", "beta.txt"), "beta");
  await writeFile(join(root, "demo", ".env"), "SECRET=example"); // 非 .git dot 文件 → 可见

  const service = new ProjectFilesService(root);

  await expect(service.listFiles("demo")).resolves.toEqual({
    projectName: "demo",
    path: "",
    parentPath: null,
    entries: [
      { name: ".config", path: ".config", type: "directory", hidden: false, size: null },
      { name: "z-dir", path: "z-dir", type: "directory", hidden: false, size: null },
      {
        name: ".env",
        path: ".env",
        type: "file",
        hidden: false,
        size: 14,
        mtimeMs: expect.any(Number),
      },
      {
        name: "beta.txt",
        path: "beta.txt",
        type: "file",
        hidden: false,
        size: 4,
        mtimeMs: expect.any(Number),
      },
    ],
  });
});

test("listRootFiles hides only blocklisted entries (.git); other dot items visible", async () => {
  // root 已含 demo 目录（beforeEach）；补几个同级项目目录 + dot 项 + 黑名单 + 散落文件
  await mkdir(join(root, "alpha"));
  await mkdir(join(root, ".config"));
  await mkdir(join(root, ".git")); // 黑名单 → 隐藏
  await writeFile(join(root, "README.md"), "root readme");
  await writeFile(join(root, ".env"), "SECRET=example");

  const service = new ProjectFilesService(root);

  await expect(service.listRootFiles()).resolves.toEqual({
    projectName: "",
    path: "",
    parentPath: null,
    // v1.6 根名真实化：rootPath = 服务器根绝对路径（realpath 后，macOS /var→/private/var
    // 符号链接差异故同函数换算），客户端 crumb 根段取 basename。
    rootPath: await realpath(root),
    entries: [
      { name: ".config", path: ".config", type: "directory", hidden: false, size: null },
      { name: "alpha", path: "alpha", type: "directory", hidden: false, size: null },
      { name: "demo", path: "demo", type: "directory", hidden: false, size: null },
      {
        name: ".env",
        path: ".env",
        type: "file",
        hidden: false,
        size: 14,
        mtimeMs: expect.any(Number),
      },
      {
        name: "README.md",
        path: "README.md",
        type: "file",
        hidden: false,
        size: 11,
        mtimeMs: expect.any(Number),
      },
    ],
  });
});

test("listFiles reports parent paths for nested directories", async () => {
  await mkdir(join(root, "demo", "src", "nested"), { recursive: true });
  const service = new ProjectFilesService(root);

  await expect(service.listFiles("demo", "src/nested")).resolves.toMatchObject({
    path: "src/nested",
    parentPath: "src",
  });
});

test("previewFile returns bounded text and image previews", async () => {
  await writeFile(join(root, "demo", "README.md"), "hello files");
  await writeFile(join(root, "demo", "logo.svg"), "<svg></svg>");
  const service = new ProjectFilesService(root);

  await expect(service.previewFile("demo", "README.md")).resolves.toMatchObject({
    type: "text",
    projectName: "demo",
    path: "README.md",
    name: "README.md",
    content: "hello files",
  });
  await expect(service.previewFile("demo", "logo.svg")).resolves.toMatchObject({
    type: "image",
    mediaType: "image/svg+xml",
    dataUrl: `data:image/svg+xml;base64,${Buffer.from("<svg></svg>").toString("base64")}`,
  });
});

test("previewFile returns unsupported and too_large preview states", async () => {
  await writeFile(join(root, "demo", "archive.zip"), "zip");
  await writeFile(join(root, "demo", "binary.txt"), Buffer.from([0, 1, 2]));
  await writeFile(join(root, "demo", "large.txt"), Buffer.alloc(TEXT_PREVIEW_LIMIT_BYTES + 1));
  await writeFile(join(root, "demo", "large.png"), Buffer.alloc(IMAGE_PREVIEW_LIMIT_BYTES + 1));
  const service = new ProjectFilesService(root);

  await expect(service.previewFile("demo", "archive.zip")).resolves.toMatchObject({
    type: "unsupported",
    reason: "unsupported_type",
  });
  await expect(service.previewFile("demo", "binary.txt")).resolves.toMatchObject({
    type: "unsupported",
    reason: "binary_text",
  });
  await expect(service.previewFile("demo", "large.txt")).resolves.toMatchObject({
    type: "too_large",
    limitBytes: TEXT_PREVIEW_LIMIT_BYTES,
  });
  await expect(service.previewFile("demo", "large.png")).resolves.toMatchObject({
    type: "too_large",
    limitBytes: IMAGE_PREVIEW_LIMIT_BYTES,
  });
});

// 黑名单反转语义（2026-10-01 用户反馈 .mjs 不能查看）：扩展名只做二进制初筛，
// 黑名单外（含未知扩展/无扩展名）皆按文本尝试，真二进制由内容级检测兜底。
test("previewFile treats unknown extensions as text (binary blocklist)", async () => {
  await writeFile(join(root, "demo", "script.mjs"), "export default 1;");
  await writeFile(join(root, "demo", "Dockerfile"), "FROM node:22\n");
  await writeFile(join(root, "demo", "schema.sql"), "CREATE TABLE t(id);");
  await writeFile(join(root, "demo", "firmware.wasm"), "text-in-disguise");
  const service = new ProjectFilesService(root);

  await expect(service.previewFile("demo", "script.mjs")).resolves.toMatchObject({
    type: "text",
    content: "export default 1;",
  });
  await expect(service.previewFile("demo", "Dockerfile")).resolves.toMatchObject({
    type: "text",
    content: "FROM node:22\n",
  });
  await expect(service.previewFile("demo", "schema.sql")).resolves.toMatchObject({
    type: "text",
  });
  // 黑名单初筛：.wasm 即使内容是文本也拦（unsupported_type）。
  await expect(service.previewFile("demo", "firmware.wasm")).resolves.toMatchObject({
    type: "unsupported",
    reason: "unsupported_type",
  });
});

test("ProjectFilesService rejects path escape and type mismatches", async () => {
  await mkdir(join(root, "demo", "src"));
  await writeFile(join(root, "demo", "file.txt"), "content");
  await mkdir(join(outside, "secret"));
  await symlink(join(outside, "secret"), join(root, "demo", "secret"), "dir");
  const service = new ProjectFilesService(root);

  await expect(service.listFiles("demo", "file.txt")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_DIRECTORY",
  });
  await expect(service.previewFile("demo", "src")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_FILE",
  });
  await expect(service.previewFile("demo", "missing.txt")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_FOUND",
  });
  await expect(service.listFiles("demo", "../other")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
  await expect(service.listFiles("demo", "secret")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

test("uploadFile writes content and returns entry", async () => {
  const service = new ProjectFilesService(root);

  await expect(
    service.uploadFile("demo", "", "hello.txt", Buffer.from("hello world")),
  ).resolves.toMatchObject({
    entry: {
      name: "hello.txt",
      path: "hello.txt",
      type: "file",
      hidden: false,
      size: 11,
    },
  });
});

test("uploadFile rejects existing file name", async () => {
  const service = new ProjectFilesService(root);
  await writeFile(join(root, "demo", "exists.txt"), "old");

  await expect(
    service.uploadFile("demo", "", "exists.txt", Buffer.from("new")),
  ).rejects.toMatchObject({ code: "PROJECT_FILE_TARGET_EXISTS" });
});

test("uploadFile rejects path traversal in file name", async () => {
  const service = new ProjectFilesService(root);

  await expect(
    service.uploadFile("demo", "", "../escape.txt", Buffer.from("x")),
  ).rejects.toMatchObject({ code: "PROJECT_NAME_INVALID" });
});

test("uploadFile rejects non-directory target", async () => {
  const service = new ProjectFilesService(root);
  await writeFile(join(root, "demo", "file.txt"), "content");

  await expect(
    service.uploadFile("demo", "file.txt", "extra.txt", Buffer.from("x")),
  ).rejects.toMatchObject({ code: "PROJECT_FILE_NOT_DIRECTORY" });
});

test("uploadFile auto-creates missing target directory", async () => {
  const service = new ProjectFilesService(root);

  await expect(
    service.uploadFile("demo", "uploads/nested", "note.txt", Buffer.from("hello")),
  ).resolves.toMatchObject({
    entry: {
      name: "note.txt",
      path: "uploads/nested/note.txt",
      type: "file",
      hidden: false,
      size: 5,
    },
  });
  expect(await readFile(join(root, "demo", "uploads", "nested", "note.txt"), "utf8")).toBe("hello");
});

test("uploadFile keeps both inside auto-created directory", async () => {
  const service = new ProjectFilesService(root);
  await service.uploadFile("demo", "uploads", "dup.txt", Buffer.from("first"));
  // 自动建目录后 keepBoth 派生 name(1).ext 正常工作。
  await expect(
    service.uploadFile("demo", "uploads", "dup.txt", Buffer.from("second"), "keepBoth"),
  ).resolves.toMatchObject({ entry: { name: "dup(1).txt", path: "uploads/dup(1).txt" } });
});

test("uploadFile rejects file-typed ancestor of missing directory", async () => {
  const service = new ProjectFilesService(root);
  await writeFile(join(root, "demo", "blocker.txt"), "content");

  // 目标目录的祖先是文件：mkdir 分支必须分类为 TARGET_INVALID（400 语义），不能落 FS_ERROR。
  await expect(
    service.uploadFile("demo", "blocker.txt/sub", "x.txt", Buffer.from("x")),
  ).rejects.toMatchObject({ code: "PROJECT_TARGET_INVALID" });
});

test("uploadFile does not mask missing project behind auto-create", async () => {
  const service = new ProjectFilesService(root);

  // 项目不存在：resolveProjectPath 先抛 NOT_FOUND，mkdir 分支永不触达。
  await expect(
    service.uploadFile("ghost-project", "uploads", "x.txt", Buffer.from("x")),
  ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
});

test("uploadFile refuses dangling symlink target without writing outside", async () => {
  const service = new ProjectFilesService(root);
  // uploads 是指向界外不存在路径的 symlink：mkdir 对存在路径报 EEXIST（不跟随）→
  // TARGET_INVALID——绝不顺着 symlink 在界外创建；复检防线拦「指向界外已存在目录」。
  await symlink(join(outside, "escape"), join(root, "demo", "uploads"));

  await expect(
    service.uploadFile("demo", "uploads", "x.txt", Buffer.from("x")),
  ).rejects.toMatchObject({ code: "PROJECT_TARGET_INVALID" });
  expect(existsSync(join(outside, "escape"))).toBe(false);
});

test("uploadFile does not mkdir through an outside-pointing parent symlink", async () => {
  const service = new ProjectFilesService(root);
  // 父链上的 symlink 指向界外已存在目录 + 后缀不存在：mkdir(recursive) 会跟随父链把
  // 目录建到界外，事后再复检已太晚——建前祖先校验必须拦住，界外一个目录都不能创建。
  await mkdir(join(outside, "outside-existing"));
  await symlink(join(outside, "outside-existing"), join(root, "demo", "uploads"));

  await expect(
    service.uploadFile("demo", "uploads/evil/nested", "x.txt", Buffer.from("x")),
  ).rejects.toMatchObject({ code: "PROJECT_PATH_OUTSIDE_ROOT" });
  expect(existsSync(join(outside, "outside-existing", "evil"))).toBe(false);
});

test("uploadFile refuses writing through a file-target symlink (dangling and existing)", async () => {
  const service = new ProjectFilesService(root);
  await mkdir(join(root, "demo", "uploads"));
  // 末级 dangling symlink：stat 的 ENOENT 曾被吞成「不存在」→ writeFile 越界创建。
  await symlink(join(outside, "escape.txt"), join(root, "demo", "uploads", "evil.txt"));

  await expect(
    service.uploadFile("demo", "uploads", "evil.txt", Buffer.from("pwn")),
  ).rejects.toMatchObject({ code: "PROJECT_TARGET_INVALID" });
  expect(existsSync(join(outside, "escape.txt"))).toBe(false);

  // 指向界外已存在文件的 symlink + overwrite：也不得覆盖界外内容。
  await writeFile(join(outside, "victim.txt"), "original");
  await symlink(join(outside, "victim.txt"), join(root, "demo", "uploads", "victim.txt"));
  await expect(
    service.uploadFile("demo", "uploads", "victim.txt", Buffer.from("pwn"), "overwrite"),
  ).rejects.toMatchObject({ code: "PROJECT_TARGET_INVALID" });
  await expect(readFile(join(outside, "victim.txt"), "utf8")).resolves.toBe("original");
});

test("uploadFile rejects control characters in file name", async () => {
  const service = new ProjectFilesService(root);

  await expect(
    service.uploadFile("demo", "", "evil\nAttachment: injected.txt", Buffer.from("x")),
  ).rejects.toMatchObject({ code: "PROJECT_NAME_INVALID" });
});

test("uploadFile auto-create rejects hidden path segments", async () => {
  const service = new ProjectFilesService(root);

  await expect(
    service.uploadFile("demo", ".git/hooks", "x.txt", Buffer.from("x")),
  ).rejects.toMatchObject({ code: "PROJECT_TARGET_INVALID" });
  expect(existsSync(join(root, "demo", ".git"))).toBe(false);
});

test("uploadFile rejects oversized content", async () => {
  const service = new ProjectFilesService(root);
  const large = Buffer.alloc(UPLOAD_FILE_LIMIT_BYTES + 1, 0);

  await expect(service.uploadFile("demo", "", "big.bin", large)).rejects.toMatchObject({
    code: "PROJECT_FILE_UPLOAD_TOO_LARGE",
  });
});

test("createFolder creates a directory and returns entry", async () => {
  const service = new ProjectFilesService(root);

  await expect(service.createFolder("demo", "", "src")).resolves.toMatchObject({
    entry: {
      name: "src",
      path: "src",
      type: "directory",
      hidden: false,
      size: null,
    },
  });
});

test("createFolder creates nested directory", async () => {
  await mkdir(join(root, "demo", "lib"));
  const service = new ProjectFilesService(root);

  await expect(service.createFolder("demo", "lib", "utils")).resolves.toMatchObject({
    entry: {
      name: "utils",
      path: "lib/utils",
      type: "directory",
    },
  });
});

test("createFolder rejects dot-prefixed folder name", async () => {
  const service = new ProjectFilesService(root);

  await expect(service.createFolder("demo", "", ".hidden")).rejects.toMatchObject({
    code: "PROJECT_NAME_INVALID",
  });
});

test("createFolder rejects path traversal in folder name", async () => {
  const service = new ProjectFilesService(root);

  await expect(service.createFolder("demo", "", "../escape")).rejects.toMatchObject({
    code: "PROJECT_NAME_INVALID",
  });
});

test("createFolder rejects existing folder", async () => {
  const service = new ProjectFilesService(root);
  await mkdir(join(root, "demo", "exists"));

  await expect(service.createFolder("demo", "", "exists")).rejects.toMatchObject({
    code: "PROJECT_FILE_TARGET_EXISTS",
  });
});

test("createFolder rejects non-directory parent", async () => {
  const service = new ProjectFilesService(root);
  await writeFile(join(root, "demo", "file.txt"), "content");

  await expect(service.createFolder("demo", "file.txt", "sub")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_DIRECTORY",
  });
});

test("createFile creates an empty file and returns entry", async () => {
  const service = new ProjectFilesService(root);

  await expect(service.createFile("demo", "", "note.md")).resolves.toMatchObject({
    entry: {
      name: "note.md",
      path: "note.md",
      type: "file",
      hidden: false,
      size: 0,
    },
  });
});

test("createFile creates nested file", async () => {
  await mkdir(join(root, "demo", "lib"));
  const service = new ProjectFilesService(root);

  await expect(service.createFile("demo", "lib", "index.ts")).resolves.toMatchObject({
    entry: {
      name: "index.ts",
      path: "lib/index.ts",
      type: "file",
    },
  });
});

test("createFile rejects dot-prefixed file name", async () => {
  const service = new ProjectFilesService(root);

  await expect(service.createFile("demo", "", ".env")).rejects.toMatchObject({
    code: "PROJECT_NAME_INVALID",
  });
});

test("createFile rejects path traversal in file name", async () => {
  const service = new ProjectFilesService(root);

  await expect(service.createFile("demo", "", "../escape")).rejects.toMatchObject({
    code: "PROJECT_NAME_INVALID",
  });
});

test("createFile rejects existing name (file or folder)", async () => {
  const service = new ProjectFilesService(root);
  await writeFile(join(root, "demo", "exists.txt"), "x");
  await mkdir(join(root, "demo", "exists-dir"));

  await expect(service.createFile("demo", "", "exists.txt")).rejects.toMatchObject({
    code: "PROJECT_FILE_TARGET_EXISTS",
  });
  await expect(service.createFile("demo", "", "exists-dir")).rejects.toMatchObject({
    code: "PROJECT_FILE_TARGET_EXISTS",
  });
});

test("createFile rejects non-directory parent", async () => {
  const service = new ProjectFilesService(root);
  await writeFile(join(root, "demo", "file.txt"), "content");

  await expect(service.createFile("demo", "file.txt", "sub.txt")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_DIRECTORY",
  });
});

test("renameFile renames a file and returns updated entry", async () => {
  await writeFile(join(root, "demo", "old.txt"), "hello");
  const service = new ProjectFilesService(root);

  await expect(service.renameFile("demo", "old.txt", "new.txt")).resolves.toMatchObject({
    entry: {
      name: "new.txt",
      path: "new.txt",
      type: "file",
    },
  });
});

test("renameFile with targetDir moves a file across directories", async () => {
  await mkdir(join(root, "demo", "dest"));
  await writeFile(join(root, "demo", "moved.txt"), "payload");
  const service = new ProjectFilesService(root);

  await expect(
    service.renameFile("demo", "moved.txt", "renamed.txt", "dest"),
  ).resolves.toMatchObject({
    entry: {
      name: "renamed.txt",
      path: "dest/renamed.txt",
      type: "file",
    },
  });
});

test("renameFile with targetDir rejects missing or non-directory target", async () => {
  await writeFile(join(root, "demo", "file.txt"), "x");
  const service = new ProjectFilesService(root);

  await expect(
    service.renameFile("demo", "file.txt", "x.txt", "no-such-dir"),
  ).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_FOUND",
  });

  await expect(service.renameFile("demo", "file.txt", "x.txt", "../outside")).rejects.toMatchObject(
    {
      code: "PROJECT_PATH_OUTSIDE_ROOT",
    },
  );
});

test("renameFile renames a directory", async () => {
  await mkdir(join(root, "demo", "old-dir"));
  const service = new ProjectFilesService(root);

  await expect(service.renameFile("demo", "old-dir", "new-dir")).resolves.toMatchObject({
    entry: {
      name: "new-dir",
      path: "new-dir",
      type: "directory",
    },
  });
});

test("renameFile rejects path traversal in new name", async () => {
  await writeFile(join(root, "demo", "file.txt"), "x");
  const service = new ProjectFilesService(root);

  await expect(service.renameFile("demo", "file.txt", "../escape.txt")).rejects.toMatchObject({
    code: "PROJECT_NAME_INVALID",
  });
});

test("renameFile rejects empty name", async () => {
  await writeFile(join(root, "demo", "file.txt"), "x");
  const service = new ProjectFilesService(root);

  await expect(service.renameFile("demo", "file.txt", "")).rejects.toMatchObject({
    code: "PROJECT_NAME_INVALID",
  });
});

test("renameFile rejects existing target name", async () => {
  await writeFile(join(root, "demo", "a.txt"), "a");
  await writeFile(join(root, "demo", "b.txt"), "b");
  const service = new ProjectFilesService(root);

  await expect(service.renameFile("demo", "a.txt", "b.txt")).rejects.toMatchObject({
    code: "PROJECT_FILE_TARGET_EXISTS",
  });
});

test("renameFile rejects missing file", async () => {
  const service = new ProjectFilesService(root);

  await expect(service.renameFile("demo", "missing.txt", "x.txt")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_FOUND",
  });
});

test("deleteFile removes a file and returns confirmation", async () => {
  await writeFile(join(root, "demo", "remove.txt"), "bye");
  const service = new ProjectFilesService(root);

  await expect(service.deleteFile("demo", "remove.txt")).resolves.toMatchObject({
    deleted: true,
    projectName: "demo",
    path: "remove.txt",
  });
});

test("deleteFile removes a directory recursively", async () => {
  await mkdir(join(root, "demo", "to-delete"));
  await writeFile(join(root, "demo", "to-delete", "inner.txt"), "x");
  const service = new ProjectFilesService(root);

  await expect(service.deleteFile("demo", "to-delete")).resolves.toMatchObject({
    deleted: true,
  });
});

test("deleteFile rejects missing file", async () => {
  const service = new ProjectFilesService(root);

  await expect(service.deleteFile("demo", "ghost.txt")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_FOUND",
  });
});

test("saveFile overwrites existing content and returns entry", async () => {
  await writeFile(join(root, "demo", "note.txt"), "old");
  const service = new ProjectFilesService(root);

  await expect(service.saveFile("demo", "note.txt", "new content")).resolves.toMatchObject({
    entry: {
      name: "note.txt",
      path: "note.txt",
      type: "file",
      hidden: false,
      size: 11,
    },
  });

  // Verify the new content actually landed on disk via the same read path preview uses.
  await expect(service.previewFile("demo", "note.txt")).resolves.toMatchObject({
    type: "text",
    content: "new content",
  });
});

test("saveFile rejects non-file target", async () => {
  await mkdir(join(root, "demo", "subdir"));
  const service = new ProjectFilesService(root);

  await expect(service.saveFile("demo", "subdir", "x")).rejects.toMatchObject({
    code: "PROJECT_FILE_NOT_FILE",
  });
});

test("saveFile rejects path traversal", async () => {
  const service = new ProjectFilesService(root);

  await expect(service.saveFile("demo", "../escape.txt", "x")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

test("saveFile rejects oversized content", async () => {
  await writeFile(join(root, "demo", "big.txt"), "seed");
  const service = new ProjectFilesService(root);
  const large = "x".repeat(UPLOAD_FILE_LIMIT_BYTES + 1);

  await expect(service.saveFile("demo", "big.txt", large)).rejects.toMatchObject({
    code: "PROJECT_FILE_UPLOAD_TOO_LARGE",
  });
});

// ── M8：03x 文件搜索 + 03z 上传冲突三选 + 根层上传 ─────────────────────────

test("searchFiles matches names case-insensitively and returns relative paths", async () => {
  await mkdir(join(root, "demo", "src", "auth"), { recursive: true });
  await writeFile(join(root, "demo", "src", "auth", "Passkey.ts"), "export {}");
  await writeFile(join(root, "demo", "passkey-notes.md"), "notes");

  const service = new ProjectFilesService(root);
  const response = await service.searchFiles("demo", "PASSKEY");

  expect(response.projectName).toBe("demo");
  expect(response.query).toBe("PASSKEY");
  expect(response.truncated).toBe(false);
  expect(response.matches.map((m) => m.path).sort()).toEqual([
    "passkey-notes.md",
    join("src", "auth", "Passkey.ts"),
  ]);
  const fileMatch = response.matches.find((m) => m.name === "Passkey.ts");
  expect(fileMatch?.type).toBe("file");
  expect(fileMatch?.size).toBe("export {}".length);
  expect(fileMatch?.mtimeMs).toEqual(expect.any(Number));
});

test("searchFiles skips .git/node_modules and symlinks, matches directories", async () => {
  await mkdir(join(root, "demo", ".git"), { recursive: true });
  await mkdir(join(root, "demo", "node_modules", "pkg"), { recursive: true });
  await mkdir(join(root, "demo", "src"), { recursive: true });
  await writeFile(join(root, "demo", ".git", "target.txt"), "x");
  await writeFile(join(root, "demo", "node_modules", "pkg", "target.txt"), "x");
  await writeFile(join(root, "demo", "src", "target.ts"), "x");
  // symlink（目录型/文件型）：Dirent.isFile/isDirectory 对 symlink 均 false → 不进结果不递归。
  await symlink(join(outside), join(root, "demo", "target-link"));
  await symlink(join(outside, "x.txt"), join(root, "demo", "target-symlink.txt"));

  const service = new ProjectFilesService(root);
  const response = await service.searchFiles("demo", "target");

  expect(response.matches.map((m) => m.path)).toEqual([join("src", "target.ts")]);
});

test("searchFiles truncates at FILE_SEARCH_LIMIT and reports truncated flag", async () => {
  await mkdir(join(root, "demo", "d"), { recursive: true });
  const total = FILE_SEARCH_LIMIT + 1;
  for (let i = 0; i < total; i++) {
    await writeFile(join(root, "demo", "d", `hit-${String(i).padStart(3, "0")}.txt`), "x");
  }

  const service = new ProjectFilesService(root);
  const response = await service.searchFiles("demo", "hit-");

  expect(response.matches).toHaveLength(FILE_SEARCH_LIMIT);
  expect(response.truncated).toBe(true);
});

test("searchFiles reports truncated when traversal exceeds visit limit", async () => {
  await mkdir(join(root, "demo", "d"), { recursive: true });
  // 文件名全不含 needle（结果上限不触发），visitLimit=2 时第三个条目触发遍历上限。
  for (const name of ["a.txt", "b.txt", "c.txt"]) {
    await writeFile(join(root, "demo", "d", name), "x");
  }

  const service = new ProjectFilesService(root);
  const response = await service.searchFiles("demo", "zzz-no-match", { visitLimit: 2 });

  expect(response.matches).toHaveLength(0);
  expect(response.truncated).toBe(true);
});

test("uploadFile conflict=overwrite replaces existing file content", async () => {
  await writeFile(join(root, "demo", "a.txt"), "old");
  const service = new ProjectFilesService(root);

  const response = await service.uploadFile("demo", "", "a.txt", Buffer.from("new"), "overwrite");

  expect(response.entry.name).toBe("a.txt");
  const saved = await readFile(join(root, "demo", "a.txt"), "utf8");
  expect(saved).toBe("new");
});

test("uploadFile conflict=keepBoth derives name(1).ext instead of 409", async () => {
  await writeFile(join(root, "demo", "a.txt"), "existing");
  const service = new ProjectFilesService(root);

  const response = await service.uploadFile(
    "demo",
    "",
    "a.txt",
    Buffer.from("incoming"),
    "keepBoth",
  );

  expect(response.entry.name).toBe("a(1).txt");
  expect(response.entry.path).toBe("a(1).txt");
  const existing = await readFile(join(root, "demo", "a.txt"), "utf8");
  expect(existing).toBe("existing");
  const both = await readFile(join(root, "demo", "a(1).txt"), "utf8");
  expect(both).toBe("incoming");
});

test("uploadFile without conflict keeps 409 on existing name (backward compat)", async () => {
  await writeFile(join(root, "demo", "a.txt"), "old");
  const service = new ProjectFilesService(root);

  await expect(service.uploadFile("demo", "", "a.txt", Buffer.from("new"))).rejects.toMatchObject({
    code: "PROJECT_FILE_TARGET_EXISTS",
  });
});

test("uploadRootFile writes into PROJECTS_ROOT top level with same conflict semantics", async () => {
  await writeFile(join(root, "loose.txt"), "old");
  const service = new ProjectFilesService(root);

  const keep = await service.uploadRootFile("loose.txt", Buffer.from("incoming"), "keepBoth");
  expect(keep.entry.name).toBe("loose(1).txt");
  expect(keep.entry.path).toBe("loose(1).txt");
  expect(keep.entry.hidden).toBe(false);

  await expect(service.uploadRootFile("loose.txt", Buffer.from("new"))).rejects.toMatchObject({
    code: "PROJECT_FILE_TARGET_EXISTS",
  });

  const over = await service.uploadRootFile("loose.txt", Buffer.from("new"), "overwrite");
  expect(over.entry.name).toBe("loose.txt");
});
