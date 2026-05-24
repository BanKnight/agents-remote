import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectService } from "./projects";

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

test("listProjects returns first-level directories sorted by name", async () => {
  await mkdir(join(root, "zeta"));
  await mkdir(join(root, "alpha"));
  await mkdir(join(root, "alpha", "nested"));
  await writeFile(join(root, "file.txt"), "content");

  const service = new ProjectService(root);

  await expect(service.listProjects()).resolves.toEqual([
    {
      name: "alpha",
      path: join(root, "alpha"),
      agentSessionCount: 0,
      terminalSessionCount: 0,
    },
    {
      name: "zeta",
      path: join(root, "zeta"),
      agentSessionCount: 0,
      terminalSessionCount: 0,
    },
  ]);
});

test("createProject creates and adopts a first-level folder name", async () => {
  const service = new ProjectService(root);

  await expect(service.createProject("demo")).resolves.toMatchObject({
    name: "demo",
    path: join(root, "demo"),
    agentSessionCount: 0,
    terminalSessionCount: 0,
  });
  await expect(service.createProject("demo")).resolves.toMatchObject({
    name: "demo",
    path: join(root, "demo"),
  });
});

test("createProject creates and adopts an absolute first-level child path", async () => {
  const service = new ProjectService(root);
  const projectPath = join(root, "absolute-demo");

  await expect(service.createProject(projectPath)).resolves.toMatchObject({
    name: "absolute-demo",
    path: projectPath,
  });
  await expect(service.createProject(projectPath)).resolves.toMatchObject({
    name: "absolute-demo",
    path: projectPath,
  });
});

test("createProject rejects root, nested, outside, empty, and file targets", async () => {
  const service = new ProjectService(root);
  await writeFile(join(root, "file"), "content");

  await expect(service.createProject("")).rejects.toMatchObject({ code: "PROJECT_TARGET_INVALID" });
  await expect(service.createProject(root)).rejects.toMatchObject({
    code: "PROJECT_TARGET_INVALID",
  });
  await expect(service.createProject(join(root, "demo", "nested"))).rejects.toMatchObject({
    code: "PROJECT_TARGET_INVALID",
  });
  await expect(service.createProject(join(outside, "demo"))).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
  await expect(service.createProject("file")).rejects.toMatchObject({
    code: "PROJECT_TARGET_INVALID",
  });
});

test("getProject returns details and reports missing projects", async () => {
  const service = new ProjectService(root);
  await mkdir(join(root, "demo"));

  await expect(service.getProject("demo")).resolves.toMatchObject({
    name: "demo",
    path: join(root, "demo"),
  });
  await expect(service.getProject("missing")).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
});
