import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSettings, StartupError } from "./settings";

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-settings-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("loadSettings reads config file values", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.toml");
  await writeFile(
    configPath,
    'app_password = "secret"\nprojects_root = "/tmp/projects"\napi_port = 3001\nweb_port = 3000\nweb_api_base_url = "/api"\n',
    { mode: 0o600 },
  );

  await expect(loadSettings({ configPath, env: {} })).resolves.toEqual({
    appPassword: "secret",
    projectsRoot: "/tmp/projects",
    apiPort: 3001,
    webPort: 3000,
    webApiBaseUrl: "/api",
    configPath,
  });
});

test("loadSettings lets environment override config values", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.toml");
  await writeFile(
    configPath,
    'app_password = "from-file"\nprojects_root = "/file/projects"\napi_port = 3001\nweb_port = 3000\nweb_api_base_url = "/api"\n',
    { mode: 0o600 },
  );

  const settings = await loadSettings({
    configPath,
    env: {
      APP_PASSWORD: "from-env",
      PROJECTS_ROOT: "/env/projects",
      API_PORT: "4001",
      WEB_PORT: "4000",
      WEB_API_BASE_URL: "/api",
    },
  });

  expect(settings.appPassword).toBe("from-env");
  expect(settings.projectsRoot).toBe("/env/projects");
  expect(settings.apiPort).toBe(4001);
  expect(settings.webPort).toBe(4000);
});

test("loadSettings creates a safe template and stops when config is missing", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "missing", "config.toml");

  await expect(loadSettings({ configPath, env: {} })).rejects.toMatchObject({
    code: "CONFIG_REQUIRED",
  });

  const template = await readFile(configPath, "utf8");
  expect(template).toContain('app_password = ""');
  expect(template).toContain('projects_root = ""');
});

test("loadSettings fails when required values are missing", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.toml");
  await writeFile(configPath, 'api_port = 3001\nweb_port = 3000\nweb_api_base_url = "/api"\n', {
    mode: 0o600,
  });

  try {
    await loadSettings({ configPath, env: {} });
    throw new Error("Expected loadSettings to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(StartupError);
    expect((error as StartupError).code).toBe("CONFIG_REQUIRED");
    expect((error as Error).message).toContain("app_password");
    expect((error as Error).message).toContain("projects_root");
  }
});

test("loadSettings rejects relative projects_root", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.toml");
  await writeFile(
    configPath,
    'app_password = "secret"\nprojects_root = "relative"\napi_port = 3001\nweb_port = 3000\nweb_api_base_url = "/api"\n',
    { mode: 0o600 },
  );

  await expect(loadSettings({ configPath, env: {} })).rejects.toMatchObject({
    code: "CONFIG_INVALID",
  });
});
