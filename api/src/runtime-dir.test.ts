import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureRuntimeDir, resolveRuntimePaths } from "./runtime-dir";
import { StartupError } from "./settings";

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-runtime-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("resolveRuntimePaths uses default run dir", () => {
  expect(resolveRuntimePaths({ env: {} })).toEqual({ runDir: "/run/agents-remote" });
});

test("resolveRuntimePaths uses AGENTS_REMOTE_RUN_DIR override", () => {
  expect(resolveRuntimePaths({ env: { AGENTS_REMOTE_RUN_DIR: "/tmp/agents-run" } })).toEqual({
    runDir: "/tmp/agents-run",
  });
});

test("ensureRuntimeDir creates runtime directory", async () => {
  const dir = await makeTempDir();
  const runDir = join(dir, "run");

  await expect(ensureRuntimeDir({ runDir })).resolves.toEqual({ runDir });
});

test("ensureRuntimeDir fails when path cannot be a directory", async () => {
  const dir = await makeTempDir();
  const runDir = join(dir, "file");
  await writeFile(runDir, "not a directory");

  try {
    await ensureRuntimeDir({ runDir });
    throw new Error("Expected ensureRuntimeDir to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(StartupError);
    expect((error as StartupError).code).toBe("RUNTIME_DIR_UNAVAILABLE");
    expect((error as Error).message).toContain(runDir);
  }
});
