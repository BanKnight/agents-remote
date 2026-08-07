// probe 脚本共享的部署配置读取（对齐 C2 部署柱：config.yaml 统一 YAML）。
//
// scripts/ 无法解析根 node_modules 的 yaml 包（未 hoist，只有 api/ 与 web/ 能 resolve），
// 故用标量正则解析——config.yaml 只有标量字段（app_password/projects_root/api_port/...，
// 见 api/src/config.ts 的写盘形状与 web/vite.config.ts 的 readDeployConfig）。语义契约：
//   config.yaml 优先 → config.toml 回退（旧格式过渡期，loadConfig 迁移后不再生成）。
// 读取失败静默（config.yaml 缺失即返回空对象），与 vite readDeployConfig 一致。
//
// 密码由消费脚本自读（env → config.yaml/toml → api 进程 environ），不打印值、不进 agent 上下文。
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".agents-remote");
const CANDIDATE_NAMES = ["config.yaml", "config.toml"];

/** 标量配置解析：兼容 YAML `key: value` 与旧 TOML `key = value` 两种语法；去引号、跳过空/注释/嵌套行。 */
function parseScalarConfig(text) {
  const result = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // 数组/映射等嵌套结构跳过（probe 只需标量）；空值跳过。
    if (value.length > 0 && !value.startsWith("[") && !value.startsWith("{")) {
      result[m[1]] = value;
    }
  }
  return result;
}

/** 读取部署配置（config.yaml 优先，config.toml 回退）。key 保持文件原样（snake_case）。 */
export async function readDeployConfig() {
  for (const name of CANDIDATE_NAMES) {
    try {
      return parseScalarConfig(await readFile(join(CONFIG_DIR, name), "utf8"));
    } catch {
      // 尝试下一个候选文件
    }
  }
  return {};
}

/** 定位 APP_PASSWORD：env → config 文件 → api 进程 environ。返回 { value, source }；未找到返回 null。 */
async function findAppPassword() {
  if (process.env.APP_PASSWORD) {
    return { value: process.env.APP_PASSWORD, source: "env APP_PASSWORD" };
  }
  for (const name of CANDIDATE_NAMES) {
    try {
      const cfg = parseScalarConfig(await readFile(join(CONFIG_DIR, name), "utf8"));
      if (cfg.app_password) {
        return { value: cfg.app_password, source: `~/.agents-remote/${name}` };
      }
    } catch {
      // 尝试下一个候选文件
    }
  }
  try {
    const pid = execSync(
      "ss -ltnp 2>/dev/null | grep ':43011' | grep -oP 'pid=\\K[0-9]+' | head -1",
      { encoding: "utf8" },
    ).trim();
    if (pid) {
      const env = await readFile(`/proc/${pid}/environ`, "utf8");
      const entry = env.split("\0").find((e) => e.startsWith("APP_PASSWORD="));
      if (entry)
        return { value: entry.slice("APP_PASSWORD=".length), source: `/proc/${pid}/environ` };
    }
  } catch {}
  return null;
}

/** 读 APP_PASSWORD；未找到则抛错（不返回，避免调用方把错误当空密码）。 */
export async function readAppPassword() {
  const found = await findAppPassword();
  if (!found)
    throw new Error("password not found (env / config.yaml / config.toml / api environ 均无)");
  return found.value;
}

/** 返回 APP_PASSWORD 来源标记（用于日志显示，不含值本身）。 */
export async function readAppPasswordSource() {
  return (
    (await findAppPassword())?.source ?? "未找到（env / config.yaml / config.toml / api environ）"
  );
}
