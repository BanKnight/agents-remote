import { afterEach, expect, mock, test } from "bun:test";
import * as realFs from "node:fs/promises";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "./config";
import { StartupError } from "./startup-error";

// 并发迁移竞态测试需要让 `rename` 可控地失败一次，其余 fs 保持真实。bun:test 的
// vi.mock 对 factory 不传 importOriginal 且 mock 内建模块易死循环；改用 mock.module
// 部分替换 node:fs/promises 导出——rename 包一层 mock（默认转发真实），竞态用例里
// mockImplementationOnce 让 rename 抛 ENOENT。
//
// 关键：bun 的 `import * as realFs` namespace 是活绑定，mock.module 注册后 realFs.rename
// 会解析回 renameMock，renameMock 闭包再调 realFs.rename → 无限递归（Maximum call
// stack size exceeded）。必须在 mock.module **之前**把真实实现复制进普通 const（闭包
// 引用 const 而非活 namespace，mock 生效后不受影响）。
const { rename: realRename, chmod: realChmod, ...realFsRest } = realFs;

// failBakRename 开启时，rename 源以 .toml 结尾（= 迁移末尾的 toml→.bak）抛 ENOENT，
// 模拟并发进程已 rename 掉 toml。writeConfigYaml 内部原子写 rename(temp→config) 源是
// .tmp、其他 rename 均不受影响——必须按参数条件触发而非 mockImplementationOnce（后者
// 会拦到 writeConfigYaml 的原子写 rename，config.yaml 根本没写成，竞态分支到不了）。
let failBakRename = false;
const renameMock = mock((from: string, to: string) => {
  if (failBakRename && from.endsWith(".toml")) {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }
  return realRename(from, to);
});

// failTomlChmod 开启时，chmod 目标以 .toml 结尾抛 ENOENT，模拟并发迁移竞态：B 进程
// stat(toml) 读到 0644 后、chmod(toml) 之前，A 进程已迁完 rename 掉 toml。config.yaml
// 主路径 chmod(configPath) 与 writeConfigYaml 的 chmod(temp) 均非 .toml 源，不受影响。
let failTomlChmod = false;
const chmodMock = mock((target: string, mode: number) => {
  if (failTomlChmod && target.endsWith(".toml")) {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }
  return realChmod(target, mode);
});
mock.module("node:fs/promises", () => ({ ...realFsRest, rename: renameMock, chmod: chmodMock }));

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-config-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  failBakRename = false;
  failTomlChmod = false;
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

test("concurrent migration race: rename ENOENT while yaml written → reads yaml, no template overwrite", async () => {
  // 双进程冷启动：A 完成迁移（writeConfigYaml + rename toml→.bak），B 并行读到 toml
  // 后 rename 时 toml 已被 A 移走 → ENOENT。writeConfigYaml 先于 rename，此时 yaml
  // 已含真实配置。修复前 B 会 createTemplate 覆盖 yaml（销毁配置）+ CONFIG_REQUIRED；
  // 修复后 B 读 yaml 返回迁移配置，yaml 不被覆盖。
  const dir = await makeTempDir();
  const configPath = join(dir, "config.yaml");
  const tomlPath = join(dir, "config.toml");
  await writeFile(
    tomlPath,
    'app_password = "secret"\nprojects_root = "/tmp/projects"\napi_port = 3001\nweb_port = 3000\nweb_api_base_url = "/api"\n',
    { mode: 0o600 },
  );

  // 模拟：本进程 writeConfigYaml 已写完 config.yaml，但迁移末尾 rename(toml→.bak) 时
  // toml 已被并发进程移走 → ENOENT。
  failBakRename = true;

  const resolved = await loadConfig({ configPath, env: {} });
  expect(resolved.appPassword).toBe("secret");

  // yaml 保留迁移产物（含真实配置），未被 createTemplate 覆盖成空模板。
  const yaml = await readFile(configPath, "utf8");
  expect(yaml).toContain("app_password: secret");
  expect(yaml).not.toContain('app_password: ""');
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

test("migration tightens world-readable legacy toml (0644) to 0600 before .bak", async () => {
  // 老用户 config.toml 可能是 0644（明文密码世界可读）。迁移末尾 rename(toml→.bak)
  // 保留 inode 权限——不先 chmod 0600，.bak 会把明文密码留在宽松权限文件里（权限退化）。
  const dir = await makeTempDir();
  const configPath = join(dir, "config.yaml");
  const tomlPath = join(dir, "config.toml");
  await writeFile(
    tomlPath,
    'app_password = "secret"\nprojects_root = "/tmp/projects"\napi_port = 3001\nweb_port = 3000\nweb_api_base_url = "/api"\n',
    { mode: 0o600 },
  );
  // 强制 0644（绕开 umask 可能对新建文件的收紧）——模拟真实宽松权限的 toml。
  await chmod(tomlPath, 0o644);
  const tomlStat = await stat(tomlPath);
  expect(tomlStat.mode & 0o077).not.toBe(0); // 前置：toml 确为世界可读

  const resolved = await loadConfig({ configPath, env: {} });
  expect(resolved.appPassword).toBe("secret");

  // 迁移成功 + .bak 权限被收紧（chmod 在 rename 前，.bak 继承 0600）——明文密码不再世界可读。
  const bakStat = await stat(`${tomlPath}.bak`);
  expect(bakStat.mode & 0o077).toBe(0);
  const bak = await readFile(`${tomlPath}.bak`, "utf8");
  expect(bak).toContain('app_password = "secret"');
});

test("concurrent migration race: chmod ENOENT on 0644 toml falls through to race path, not CONFIG_PERMISSION_UNSAFE", async () => {
  // 0644 老 toml + 双进程冷启动：B 进程 stat(config.yaml) 失败（A 还没写）→ 进 toml
  // 分支 → stat(toml) 读到 0644 → chmod(toml) 时 A 已迁完 rename 掉 toml → ENOENT。
  // 修复前 chmod catch 把 ENOENT 包成 CONFIG_PERMISSION_UNSAFE → 绕过 race 容错直接崩
  // （错误码还误导成「权限不安全」）；修复后 ENOENT rethrow 走外层 race 分支。
  //
  // 本测试只验证「chmod ENOENT 不再被误包成 CONFIG_PERMISSION_UNSAFE」——这是修复的
  // 核心不变量。race 分支后续走 stat(configPath)（本场景 yaml 不存在 → createTemplate
  // + CONFIG_REQUIRED）属另一路径，不在此断言（避免与「yaml 是否被并发写好」耦合）。
  const dir = await makeTempDir();
  const configPath = join(dir, "config.yaml"); // 不创建——模拟 B 启动时 yaml 还没出现
  const tomlPath = join(dir, "config.toml");
  await writeFile(
    tomlPath,
    'app_password = "secret"\nprojects_root = "/tmp/projects"\napi_port = 3001\nweb_port = 3000\nweb_api_base_url = "/api"\n',
    { mode: 0o600 },
  );
  await chmod(tomlPath, 0o644); // 0644 触发权限分支

  failTomlChmod = true;

  // 修复前：rejects CONFIG_PERMISSION_UNSAFE（chmod 误包）；修复后：rejects 但非该码
  // （ENOENT 走 race 分支 → yaml 不存在 → CONFIG_REQUIRED）。
  await expect(loadConfig({ configPath, env: {} })).rejects.not.toMatchObject({
    code: "CONFIG_PERMISSION_UNSAFE",
  });
});
