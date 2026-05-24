import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ProjectPathError,
  resolveProjectPath,
  resolveProjectRelativePath,
  resolveProjectsRoot,
  validateProjectName,
} from "./project-paths";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-projects-"));
  outside = await mkdtemp(join(tmpdir(), "agents-remote-outside-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test("resolveProjectsRoot requires an accessible directory", async () => {
  await expect(resolveProjectsRoot(root)).resolves.toBe(root);
});

test("validateProjectName accepts first-level names with URL-sensitive characters", () => {
  expect(validateProjectName("hello world 中文")).toBe("hello world 中文");
});

test("validateProjectName rejects nested and empty names", () => {
  expect(() => validateProjectName("")).toThrow(ProjectPathError);
  expect(() => validateProjectName("../other")).toThrow(ProjectPathError);
  expect(() => validateProjectName("nested/project")).toThrow(ProjectPathError);
  expect(() => validateProjectName("nested\\project")).toThrow(ProjectPathError);
});

test("resolveProjectPath returns the real path for an existing first-level directory", async () => {
  await mkdir(join(root, "demo"));

  await expect(resolveProjectPath(root, "demo")).resolves.toEqual({
    name: "demo",
    path: join(root, "demo"),
  });
});

test("resolveProjectPath rejects missing projects and non-directory targets", async () => {
  await writeFile(join(root, "file"), "content");

  await expect(resolveProjectPath(root, "missing")).rejects.toMatchObject({
    code: "PROJECT_NOT_FOUND",
  });
  await expect(resolveProjectPath(root, "file")).rejects.toMatchObject({
    code: "PROJECT_TARGET_INVALID",
  });
});

test("resolveProjectPath rejects symlinks that escape PROJECTS_ROOT", async () => {
  await mkdir(join(outside, "escaped"));
  await symlink(join(outside, "escaped"), join(root, "escaped"), "dir");

  await expect(resolveProjectPath(root, "escaped")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

test("resolveProjectRelativePath resolves empty and nested paths inside a project", async () => {
  await mkdir(join(root, "demo", "src"), { recursive: true });
  await writeFile(join(root, "demo", "src", "index.ts"), "");

  await expect(resolveProjectRelativePath(root, "demo", "")).resolves.toMatchObject({
    path: join(root, "demo"),
  });
  await expect(resolveProjectRelativePath(root, "demo", "src/index.ts")).resolves.toMatchObject({
    path: join(root, "demo", "src", "index.ts"),
  });
});

test("resolveProjectRelativePath rejects parent traversal and symlink escapes", async () => {
  await mkdir(join(root, "demo"));
  await mkdir(join(root, "other"));
  await mkdir(join(outside, "secret"));
  await symlink(join(outside, "secret"), join(root, "demo", "secret"), "dir");

  await expect(resolveProjectRelativePath(root, "demo", "../other")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
  await expect(resolveProjectRelativePath(root, "demo", "secret")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});
