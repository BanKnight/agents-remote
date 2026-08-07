import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "./config";
import { StartupError } from "./startup-error";

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-config-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// 有效 YAML 配置基线（密码带引号贴近安全写法；projects_root 无引号验证 yaml 标量解析）
const YAML_BASE = [
  'app_password: "secret"',
  "projects_root: /tmp/projects",
  "api_port: 3001",
  "web_port: 3000",
  "web_api_base_url: /api",
].join("\n");

// ── YAML 读取 ──

test("loadConfig reads config file values", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.yaml");
  await writeFile(configPath, YAML_BASE, { mode: 0o600 });

  await expect(loadConfig({ configPath, env: {} })).resolves.toEqual({
    appPassword: "secret",
    projectsRoot: "/tmp/projects",
    apiPort: 3001,
    webPort: 3000,
    mcpPort: 43013,
    webApiBaseUrl: "/api",
    tokenTtlHours: 720,
    configPath,
  });
});

test("loadConfig reads mcp_port from config and lets MCP_PORT env override it", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.yaml");
  await writeFile(configPath, `${YAML_BASE}\nmcp_port: 14301`, { mode: 0o600 });

  const fromConfig = await loadConfig({ configPath, env: {} });
  expect(fromConfig.mcpPort).toBe(14301);

  const fromEnv = await loadConfig({ configPath, env: { MCP_PORT: "14302" } });
  expect(fromEnv.mcpPort).toBe(14302);
});

test("loadConfig lets environment override config values", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.yaml");
  await writeFile(configPath, YAML_BASE, { mode: 0o600 });

  const config = await loadConfig({
    configPath,
    env: {
      APP_PASSWORD: "from-env",
      PROJECTS_ROOT: "/env/projects",
      API_PORT: "4001",
      WEB_PORT: "4000",
      WEB_API_BASE_URL: "/api",
    },
  });

  expect(config.appPassword).toBe("from-env");
  expect(config.projectsRoot).toBe("/env/projects");
  expect(config.apiPort).toBe(4001);
  expect(config.webPort).toBe(4000);
});

test("loadConfig creates a safe template and stops when config is missing", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "missing", "config.yaml");

  await expect(loadConfig({ configPath, env: {} })).rejects.toMatchObject({
    code: "CONFIG_REQUIRED",
  });

  const template = await readFile(configPath, "utf8");
  expect(template).toContain('app_password: ""');
  expect(template).toContain('projects_root: ""');
});

test("loadConfig fails when required values are missing", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.yaml");
  await writeFile(configPath, "api_port: 3001\nweb_port: 3000\nweb_api_base_url: /api\n", {
    mode: 0o600,
  });

  try {
    await loadConfig({ configPath, env: {} });
    throw new Error("Expected loadConfig to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(StartupError);
    expect((error as StartupError).code).toBe("CONFIG_REQUIRED");
    expect((error as Error).message).toContain("app_password");
    expect((error as Error).message).toContain("projects_root");
  }
});

test("loadConfig rejects relative projects_root", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.yaml");
  await writeFile(configPath, `${YAML_BASE}\nprojects_root: relative`, { mode: 0o600 });

  await expect(loadConfig({ configPath, env: {} })).rejects.toMatchObject({
    code: "CONFIG_INVALID",
  });
});

// ── config.toml → config.yaml 迁移 ──

test("migrates legacy config.toml to config.yaml (atomic write + .bak)", async () => {
  const dir = await makeTempDir();
  const tomlPath = join(dir, "config.toml");
  const configPath = join(dir, "config.yaml");
  await writeFile(
    tomlPath,
    'app_password = "secret"\nprojects_root = "/tmp/projects"\napi_port = 3001\nweb_port = 3000\nmcp_port = 14301\nweb_api_base_url = "/api"\n',
    { mode: 0o600 },
  );

  const resolved = await loadConfig({ configPath, env: {} });

  expect(resolved.mcpPort).toBe(14301);

  const yamlContent = await readFile(configPath, "utf8");
  expect(yamlContent).toContain("app_password: secret");
  expect(yamlContent).toContain("mcp_port: 14301");

  const bak = await readFile(`${tomlPath}.bak`, "utf8");
  expect(bak).toContain('app_password = "secret"');
  await expect(readFile(tomlPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

test("migration is idempotent: existing config.yaml is authoritative", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.yaml");
  const tomlPath = join(dir, "config.toml");
  await writeFile(configPath, YAML_BASE, { mode: 0o600 });
  await writeFile(
    tomlPath,
    'app_password = "toml-secret"\nprojects_root = "/tmp/projects"\napi_port = 3001\nweb_port = 3000\nweb_api_base_url = "/api"\n',
    { mode: 0o600 },
  );

  const resolved = await loadConfig({ configPath, env: {} });
  expect(resolved.appPassword).toBe("secret"); // yaml 优先，toml 被忽略
  expect(await readFile(tomlPath, "utf8")).toContain("toml-secret"); // toml 未被触碰
});

test("migration preserves special chars in app_password (YAML auto-quoting round-trip)", async () => {
  const dir = await makeTempDir();
  const configPath = join(dir, "config.yaml");
  const tomlPath = join(dir, "config.toml");
  await writeFile(
    tomlPath,
    'app_password = "p#ss:word \\"quoted\\""\nprojects_root = "/tmp/projects"\napi_port = 3001\nweb_port = 3000\nweb_api_base_url = "/api"\n',
    { mode: 0o600 },
  );

  const resolved = await loadConfig({ configPath, env: {} });
  expect(resolved.appPassword).toBe('p#ss:word "quoted"');

  // 迁移产物 config.yaml 再次读取，值不变（round-trip 无损）
  const again = await loadConfig({ configPath, env: {} });
  expect(again.appPassword).toBe('p#ss:word "quoted"');
});
