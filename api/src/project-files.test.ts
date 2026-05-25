import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  IMAGE_PREVIEW_LIMIT_BYTES,
  ProjectFilesService,
  TEXT_PREVIEW_LIMIT_BYTES,
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

test("listFiles returns hidden entries with directories first and names sorted", async () => {
  await mkdir(join(root, "demo", "z-dir"));
  await mkdir(join(root, "demo", ".config"));
  await writeFile(join(root, "demo", "beta.txt"), "beta");
  await writeFile(join(root, "demo", ".env"), "SECRET=example");

  const service = new ProjectFilesService(root);

  await expect(service.listFiles("demo")).resolves.toEqual({
    projectName: "demo",
    path: "",
    parentPath: null,
    entries: [
      { name: ".config", path: ".config", type: "directory", hidden: true, size: null },
      { name: "z-dir", path: "z-dir", type: "directory", hidden: false, size: null },
      { name: ".env", path: ".env", type: "file", hidden: true, size: 14 },
      { name: "beta.txt", path: "beta.txt", type: "file", hidden: false, size: 4 },
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
