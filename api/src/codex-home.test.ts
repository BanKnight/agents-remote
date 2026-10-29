import { afterEach, beforeEach, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  codexAuthJsonContent,
  codexConfigOverrideArgs,
  prepareCodexRuntimeHome,
} from "./codex-home";

let runDir: string;
let globalHome: string;

beforeEach(async () => {
  runDir = await mkdtemp(join(tmpdir(), "codex-home-run-"));
  globalHome = await mkdtemp(join(tmpdir(), "codex-home-global-"));
});

afterEach(async () => {
  await Promise.all([
    rm(runDir, { recursive: true, force: true }),
    rm(globalHome, { recursive: true, force: true }),
  ]);
});

// mode 读取走 stat（跟随 symlink 的目标位）；目录/文件权限断言用 lstat 的 mode。
const modeOf = async (path: string) => (await lstat(path)).mode & 0o777;

// ── 纯函数 ───────────────────────────────────────────────────────────────

test("codexAuthJsonContent：AuthDotJson 最小合法形态（serde rename 全大写键）", () => {
  const parsed = JSON.parse(codexAuthJsonContent("sk-abc")) as Record<string, unknown>;
  expect(parsed).toEqual({
    auth_mode: "apikey",
    OPENAI_API_KEY: "sk-abc",
    tokens: null,
    last_refresh: null,
  });
});

test("codexConfigOverrideArgs：每个覆盖展开成 -c 键值对", () => {
  expect(codexConfigOverrideArgs([])).toEqual([]);
  expect(codexConfigOverrideArgs(["openai_base_url=https://gw.test/v1"])).toEqual([
    "-c",
    "openai_base_url=https://gw.test/v1",
  ]);
});

// ── prepareCodexRuntimeHome ──────────────────────────────────────────────

test("无 apiKey → 不重定向（codexHome null），且 baseUrl 被忽略（防全局 OAuth token 外发）", async () => {
  const none = await prepareCodexRuntimeHome({ runDir, globalHome, env: {} });
  expect(none.codexHome).toBeNull();
  expect(none.configOverrides).toEqual([]);

  // 只填 baseUrl 不填 key：codex 会拿全局 login token 发往该端点 → 整体忽略。
  const urlOnly = await prepareCodexRuntimeHome({
    runDir,
    globalHome,
    env: {},
    credentials: { baseUrl: "https://gw.test/v1" },
  });
  expect(urlOnly.codexHome).toBeNull();
  expect(urlOnly.configOverrides).toEqual([]);

  // key + baseUrl 同时给 → 两者都生效。
  const both = await prepareCodexRuntimeHome({
    runDir,
    globalHome,
    env: {},
    credentials: { apiKey: "sk-x", baseUrl: "https://gw.test/v1" },
  });
  expect(both.codexHome).toBe(join(runDir, "codex-home"));
  expect(both.configOverrides).toEqual(["openai_base_url=https://gw.test/v1"]);
});

test("有 apiKey → home 0700 / auth.json 0600，内容正确", async () => {
  const prepared = await prepareCodexRuntimeHome({
    runDir,
    globalHome,
    env: {},
    credentials: { apiKey: "sk-x" },
  });
  const home = prepared.codexHome!;
  expect(home).toBe(join(runDir, "codex-home"));
  expect(await modeOf(home)).toBe(0o700);

  const authPath = join(home, "auth.json");
  expect(await readFile(authPath, "utf8")).toBe(codexAuthJsonContent("sk-x"));
  expect(await modeOf(authPath)).toBe(0o600);
});

test("config.toml 存在才链；sessions 恒链且目标目录自动建（0700）", async () => {
  // 全局 config.toml 缺省 → 不链（不造空文件）。
  const first = await prepareCodexRuntimeHome({
    runDir,
    globalHome,
    env: {},
    credentials: { apiKey: "sk-x" },
  });
  const home = first.codexHome!;
  const configLink = join(home, "config.toml");
  const sessionsLink = join(home, "sessions");
  expect(await lstat(configLink).catch(() => null)).toBeNull();
  // sessions 目标被自动创建（跨 home resume 依赖），链接指向全局。
  expect((await lstat(sessionsLink)).isSymbolicLink()).toBe(true);
  expect(await readlink(sessionsLink)).toBe(join(globalHome, "sessions"));
  expect((await stat(join(globalHome, "sessions"))).isDirectory()).toBe(true);
  expect(await modeOf(join(globalHome, "sessions"))).toBe(0o700);

  // 全局 config.toml 出现后 → 再准备即链上（幂等增量）。
  await writeFile(join(globalHome, "config.toml"), 'model = "gpt-5.1-codex"\n');
  await prepareCodexRuntimeHome({ runDir, globalHome, env: {}, credentials: { apiKey: "sk-x" } });
  expect((await lstat(configLink)).isSymbolicLink()).toBe(true);
  expect(await readlink(configLink)).toBe(join(globalHome, "config.toml"));
});

test("skills 存在才链（user 级 skills 跨 home 可见）；缺省不造空目录", async () => {
  // 全局 skills 缺省 → 不链（不造空目录/链接，config.toml 同款形态）。
  const first = await prepareCodexRuntimeHome({
    runDir,
    globalHome,
    env: {},
    credentials: { apiKey: "sk-x" },
  });
  const home = first.codexHome!;
  const skillsLink = join(home, "skills");
  expect(await lstat(skillsLink).catch(() => null)).toBeNull();

  // 全局 skills 目录出现后 → 再准备即链上（幂等增量）。
  await mkdir(join(globalHome, "skills"), { recursive: true });
  await prepareCodexRuntimeHome({ runDir, globalHome, env: {}, credentials: { apiKey: "sk-x" } });
  expect((await lstat(skillsLink)).isSymbolicLink()).toBe(true);
  expect(await readlink(skillsLink)).toBe(join(globalHome, "skills"));
});

test("幂等：内容未变不重写；链接占位被占用（实文件/异目标）时覆盖重建", async () => {
  const prepared = await prepareCodexRuntimeHome({
    runDir,
    globalHome,
    env: {},
    credentials: { apiKey: "sk-x" },
  });
  const home = prepared.codexHome!;
  const authPath = join(home, "auth.json");
  const before = (await stat(authPath)).mtimeMs;

  // 内容未变 → 不重写（mtime 不动）。
  await prepareCodexRuntimeHome({ runDir, globalHome, env: {}, credentials: { apiKey: "sk-x" } });
  expect((await stat(authPath)).mtimeMs).toBe(before);

  // key 轮换 → 重写 + 权限保持 0600。
  await prepareCodexRuntimeHome({ runDir, globalHome, env: {}, credentials: { apiKey: "sk-y" } });
  expect(await readFile(authPath, "utf8")).toBe(codexAuthJsonContent("sk-y"));
  expect(await modeOf(authPath)).toBe(0o600);

  // sessions 链接位被写实文件（曾自建目录导致跨 home 分裂的教训形态）→ 覆盖成链接。
  await rm(join(home, "sessions"));
  await mkdir(join(home, "sessions"));
  await prepareCodexRuntimeHome({ runDir, globalHome, env: {}, credentials: { apiKey: "sk-y" } });
  expect((await lstat(join(home, "sessions"))).isSymbolicLink()).toBe(true);
  expect(await readlink(join(home, "sessions"))).toBe(join(globalHome, "sessions"));
});
