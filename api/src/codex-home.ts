// codex 运行期凭证/配置 home（CODEX_HOME 重定向）——settings 凭据切片的唯一注入通道。
//
// 背景（codex 0.163 源码 + 实测双证，2026-10-28 调研）：codex 运行期**不读**
// OPENAI_API_KEY / OPENAI_BASE_URL 环境变量（load_auth 的凭据链是 CODEX_API_KEY →
// CODEX_ACCESS_TOKEN → 持久化 store），base_url 只认配置（openai_base_url /
// model_providers.<id>.base_url）。因此「settings 填 apiKey/baseUrl」必须落到
// $CODEX_HOME/auth.json + config 覆盖，注入进程的只有非机密目录路径——chat 形态
// （Bun.spawn app-server）与 terminal 形态（tmux 内 codex resume TUI）同用该 home。
// 竞品 hapi / orca 同款方案。
//
// 目录形态（runDir 每次启动幂等重建，不含机密以外的持久数据）：
//   <runDir>/codex-home/          0700
//   ├── auth.json                 0600  {"auth_mode":"apikey","OPENAI_API_KEY":"…"}
//   ├── config.toml               symlink → 用户全局 config.toml（存在时；零漂移）
//   └── sessions                  symlink → 用户全局 sessions（thread 跨 home 可 resume）
//
// base_url 不走 config.toml 改写（TOML 合并易碎），走 `-c openai_base_url=…` 命令行覆盖
// （值非机密，可进 argv；app-server 与 resume 子命令均支持 -c）。

import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { CodexCredentials } from "@agents-remote/shared";

/** 专属 home 目录名（runDir 下）。 */
export const CODEX_RUNTIME_HOME_DIR = "codex-home";

/** auth.json 的 API key 模式标记（codex-rs AuthDotJson auth_mode 的 serde 值）。 */
const AUTH_MODE_API_KEY = "apikey";

export type PreparedCodexHome = {
  /** 注入 spawn env 的 CODEX_HOME；null = 未配置 apiKey，不重定向（回退用户 ~/.codex）。 */
  codexHome: string | null;
  /** `-c key=value` 配置覆盖（baseUrl → openai_base_url；值非机密）。 */
  configOverrides: string[];
};

/** auth.json 内容（codex login --with-api-key 落盘形态的最小等价，实测三者同效：
 *  login status / exec / app-server 均读取并带 Bearer）。键名全大写 OPENAI_API_KEY 是
 *  AuthDotJson 的 serde rename，不是笔误。 */
export function codexAuthJsonContent(apiKey: string): string {
  return `${JSON.stringify(
    {
      auth_mode: AUTH_MODE_API_KEY,
      OPENAI_API_KEY: apiKey,
      tokens: null,
      last_refresh: null,
    },
    null,
    2,
  )}\n`;
}

/** configOverrides → spawn argv 片段（`-c k=v`）。 */
export function codexConfigOverrideArgs(configOverrides: string[]): string[] {
  return configOverrides.flatMap((override) => ["-c", override]);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/** 幂等 symlink：链接位不存在 → 建；已是同目标 symlink → 跳过；占位是其它形态 → 覆盖
 *  （链接位永远是我们自建的 home 内路径；被 codex 写实文件/目录时覆盖成链接，避免
 *  「专属 home 自建 sessions 占位目录导致跨 home resume 失效」的静默分裂）。
 *  覆盖用 rm recursive——占位可能是目录（unlink 对目录 EPERM，曾被 ENOENT 容错
 *  catch 吞掉 → symlink 撞 EEXIST 静默失败，单测实抓）。 */
async function ensureSymlink(linkPath: string, target: string): Promise<void> {
  const existing = await lstat(linkPath).catch(() => null);
  if (existing?.isSymbolicLink() && (await readlink(linkPath)) === target) return;
  if (existing) await rm(linkPath, { recursive: true, force: true });
  await symlink(target, linkPath);
}

/**
 * 准备 codex 专属 home。
 *
 * - 无 apiKey → `{ codexHome: null }`：不重定向，行为与配置凭据前完全一致（回退用户
 *   自己的 ~/.codex 凭证链），零回归风险。
 * - 有 apiKey → 建目录 0700 / 写 auth.json 0600（内容未变不重写）/ config.toml 与
 *   sessions 软链到用户全局 home（存在才链，缺省不造空文件）。
 * - baseUrl 恒经 configOverrides 返回（与 apiKey 是否配置无关）。
 */
export async function prepareCodexRuntimeHome(options: {
  runDir: string;
  credentials?: CodexCredentials;
  /** 用户实际 codex home（默认 env.CODEX_HOME ?? ~/.codex）；测试 seam。 */
  globalHome?: string;
  env?: Record<string, string | undefined>;
}): Promise<PreparedCodexHome> {
  const env = options.env ?? process.env;
  const globalHome = options.globalHome ?? env.CODEX_HOME ?? join(homedir(), ".codex");
  const apiKey = options.credentials?.apiKey;
  const baseUrl = options.credentials?.baseUrl;

  // 安全（P2-2）：baseUrl 只在有 apiKey 时生效。无 apiKey 时不重定向 home → codex 会
  // 读用户全局 auth.json 的 ChatGPT OAuth token，把该 Bearer 发给用户手填的任意端点。
  // 该组合视为配置不完整（要自定义端点请同时填 key），忽略 baseUrl。
  if (baseUrl && !apiKey) {
    console.warn(
      "[codex-home] baseUrl ignored: apiKey missing (would send global codex login token to a custom endpoint)",
    );
    return { codexHome: null, configOverrides: [] };
  }
  const configOverrides = baseUrl ? [`openai_base_url=${baseUrl}`] : [];

  if (!apiKey) {
    // 密钥被清空/轮换下线：删掉本模块自建的 auth.json——runDir 持久，吊销后的旧 key
    // 不应长期留盘（安全 P3-3）。
    await rm(join(options.runDir, CODEX_RUNTIME_HOME_DIR, "auth.json"), { force: true });
    return { codexHome: null, configOverrides };
  }

  const home = join(options.runDir, CODEX_RUNTIME_HOME_DIR);
  await mkdir(home, { recursive: true, mode: 0o700 });
  // mkdir 的 mode 受 umask 影响且对已存在目录不生效 → 显式收紧。
  await chmod(home, 0o700);

  const authPath = join(home, "auth.json");
  const content = codexAuthJsonContent(apiKey);
  const existing = await readFile(authPath, "utf8").catch(() => null);
  if (existing !== content) {
    // 非原子写（安全附注）：跨会话并发 spawn 时另一进程可能读到截断内容 → 临时文件 +
    // rename（同目录 rename 原子）。
    const tmpPath = `${authPath}.${process.pid}.tmp`;
    await writeFile(tmpPath, content, { mode: 0o600 });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, authPath);
  }
  // 权限无条件收紧（安全 P2-1）：内容未变分支（备份/迁移落地的 0644 副本）同样要 0600。
  await chmod(authPath, 0o600);

  // config.toml：用户全局存在才链（不存在 = codex 用内置默认，不造空文件）。
  const globalConfig = join(globalHome, "config.toml");
  if (await pathExists(globalConfig)) {
    await ensureSymlink(join(home, "config.toml"), globalConfig);
  }

  // skills：用户级 skills（CODEX_HOME/skills）跨 home 共享——app-server 的 skills/list
  // 从专属 home 发现 user scope 条目，不链则托管 apiKey 会话看不见用户 skills（批 G
  // 批 5 遗留修复）。同 config.toml：存在才链，缺省不造。
  const globalSkills = join(globalHome, "skills");
  if (await pathExists(globalSkills)) {
    await ensureSymlink(join(home, "skills"), globalSkills);
  }

  // sessions：thread 存储跨 home 共享（实测 symlink 后可 resume 另一 home 建的线程）。
  const globalSessions = join(globalHome, "sessions");
  await mkdir(globalSessions, { recursive: true, mode: 0o700 });
  await ensureSymlink(join(home, "sessions"), globalSessions);

  return { codexHome: home, configOverrides };
}
