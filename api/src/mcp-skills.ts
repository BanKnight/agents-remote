import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { parseFrontmatter } from "./claude-slash-commands.js";
import { resolveProjectRelativePath } from "./project-paths.js";

/**
 * hub skills 能力域数据源（SEP-2640 Skills over MCP）。
 *
 * 数据源 = 本地 skills 管理面的同一批磁盘文件（单一数据源,无第二份存储）:
 * 项目级 `<projectRoot>/.claude/skills/` + 全局 `~/.claude/skills/` 下的各 skill
 * 目录并集(claude-code 口径;codex 目录暂不分发——hub 服务 claude 为主,Codex 侧仅提交时
 * 快照导入,见 docs/research/mcp-cli-ecosystem-notes.md)。停用区(`skills.disabled`
 * / `~/.agents/disabled-skills/`)不在扫描目录内,天然排除。
 *
 * 每 HTTP 请求实时扫描(hub 无状态,web 管理面随时改文件);skills/list、skills/get、
 * resources/read 单请求内共用一次扫描结果——digest 与内容必然一致,天然满足
 * SEP-2640 的读时校验模型。entry 形状是 SEP 精确契约:
 *   uri = skill://<name>/SKILL.md(末段 MUST 等于 frontmatter.name)
 *   resources = 完整文件清单(含 SKILL.md 自身),digest = 原始字节 SHA-256。
 * 超出 SEP 上限(单 skill ≤512 文件、总大小 ≤16MiB)的 skill 整体跳过——截断清单
 * 会产生违反「resources MUST 完整」的非法 entry。
 */

export const SKILL_URI_SCHEME = "skill://";
const SKILL_MANIFEST = "SKILL.md";
/** claude-code agent 的 skills 目录约定（skills CLI 项目/全局 scope 同布局,见 skill-market.ts）。 */
const CLAUDE_SKILLS_DIR = ".claude/skills";
/** SEP-2640 单 skill 文件数上限。 */
const MAX_FILES_PER_SKILL = 512;
/** SEP-2640 单 skill 总大小上限(字节)。 */
const MAX_SKILL_TOTAL_BYTES = 16 * 1024 * 1024;

export type HubSkillResource = {
  uri: string;
  /** 文件原始字节 SHA-256，`sha256:<64 位小写 hex>`（SEP-2640 契约格式）。 */
  digest: string;
  size: number;
};

export type HubSkill = {
  /** `skill://<name>/SKILL.md`——末段 = frontmatter.name（缺 name 时目录名兜底,保持自洽）。 */
  uri: string;
  /** SKILL.md frontmatter 逐字透传（parseFrontmatter 平铺 KV;name 保证在场）。 */
  frontmatter: Record<string, string>;
  /** skill 目录完整文件清单（含 SKILL.md 自身条目;按相对路径排序,输出确定）。 */
  resources: HubSkillResource[];
};

/**
 * 内部扫描结果:附磁盘定位 dir、解析后 name 与 uri→实际相对路径表(资源读取查表用,
 * 消灭「从 uri 反向构造路径」——中文/空格/含 `..` 字样的合法文件名都能读回),
 * 对外投影为 HubSkill。
 */
export type ScannedHubSkill = HubSkill & { dir: string; name: string; files: Map<string, string> };

/** skills/list 单页条数（本仓库 skills 量级小,常规单页全量;cursor = 纯 offset 十进制串）。 */
const SKILLS_PAGE_SIZE = 50;

/**
 * 扫描单项目可分发的全部 skills。项目 scope 在前、全局在后:同名 name 冲突时
 * 前者胜出(与 slash catalog「同名 project > user」口径一致),后者跳过并 warn
 * (SEP 语义:冲突不得默默丢弃)。目录缺失(未装任何 skill)→ 空数组,不报错。
 */
export const collectProjectSkills = async (
  projectsRoot: string,
  project: string,
  home: string = homedir(),
): Promise<ScannedHubSkill[]> => {
  const projectRoot = (await resolveProjectRelativePath(projectsRoot, project, "")).path;
  const roots = [join(projectRoot, CLAUDE_SKILLS_DIR), join(home, CLAUDE_SKILLS_DIR)];
  const skills = new Map<string, ScannedHubSkill>();
  for (const root of roots) {
    let entries: string[];
    let realRoot: string;
    try {
      entries = (await readdir(root)).sort(); // 排序:同名冲突胜者与输出顺序确定。
      realRoot = await realpath(root);
    } catch {
      continue; // 目录缺失 = 该 scope 无 skills,继续下一 scope。
    }
    for (const entry of entries) {
      if (entry.startsWith(".")) continue; // 隐藏条目(.system 等)——与 skills CLI 过滤口径一致。
      // 根级条目先 realpath:解析后必须仍落在 skills 根之下(symlink 指向外部 = 不分发,
      // 与内部条目 symlink 不跟随同口径;内部条目由 listSkillFiles 的 Dirent 判定保证)。
      const dir = await realpath(join(root, entry)).catch(() => null);
      if (!dir?.startsWith(realRoot + sep)) continue;
      const skill = await scanSkillDir(dir, entry).catch(() => null);
      if (!skill) continue;
      if (skills.has(skill.name)) {
        console.warn(`[mcp-skills] duplicate skill name "${skill.name}" (${dir}); keeping first`);
        continue;
      }
      skills.set(skill.name, skill);
    }
  }
  return [...skills.values()];
};

/** 实时扫描 + 按 manifest URI 精确查找(skills/get);非本 server 的 skill → undefined(调用方 -32602)。 */
export const findHubSkill = (skills: ScannedHubSkill[], uri: string): ScannedHubSkill | undefined =>
  skills.find((s) => s.uri === uri);

/**
 * resources/read 定位:任意 skill:// 文件 URI → { skill, relativePath }。
 * 扫描时建的 uri→相对路径表精确命中才读(只 serve 已列文件 = 防穿越第一道;表键
 * 由 readdir 产生,不含 `..`/隐藏条目,uri 段经 encodeURIComponent 单射编码无歧义)。
 */
export const resolveSkillResource = (
  skills: ScannedHubSkill[],
  uri: string,
): { skill: ScannedHubSkill; relativePath: string } | undefined => {
  if (!uri.startsWith(SKILL_URI_SCHEME)) return undefined;
  for (const skill of skills) {
    const relativePath = skill.files.get(uri);
    if (relativePath !== undefined) return { skill, relativePath };
  }
  return undefined;
};

/** skills/list offset 分页:非法/越界 cursor 宽容归零(列表权威来自当前扫描,不做强校验)。 */
export const decodeSkillCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};

export const skillsPageSize = (): number => SKILLS_PAGE_SIZE;

/** 内部:扫单 skill 目录 → entry(非目录/无 SKILL.md/超 SEP 上限/读失败 → null 跳过,不中断整列)。 */
const scanSkillDir = async (dir: string, dirName: string): Promise<ScannedHubSkill | null> => {
  const info = await stat(dir).catch(() => null);
  if (!info?.isDirectory()) return null;
  const raw = await readFile(join(dir, SKILL_MANIFEST), "utf8").catch(() => null);
  if (raw === null) return null; // 无 SKILL.md 的目录不分发——与 skills CLI 过滤口径一致。
  const fm = parseFrontmatter(raw);
  const name = fm.name?.trim() || dirName; // name 缺失 → 目录名兜底(URI 末段=frontmatter.name 恒自洽)。
  const frontmatter = { ...fm, name };
  const uriPrefix = `${SKILL_URI_SCHEME}${encodeURIComponent(name)}/`;
  const relFiles = await listSkillFiles(dir, "");
  if (relFiles.length > MAX_FILES_PER_SKILL) return null; // 超 SEP 文件数上限,整体跳过。
  const files = new Map<string, string>();
  const resources: HubSkillResource[] = [];
  let total = 0;
  for (const rel of relFiles) {
    // 流式 digest:不整读入内存(参考数据类大文件不至于把整份 buffer 顶进堆);串行
    // 累计总大小,超 SEP 上限中途放弃。
    const hasher = new Bun.CryptoHasher("sha256");
    const reader = Bun.file(join(dir, ...rel.split("/")))
      .stream()
      .getReader();
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hasher.update(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => {}); // 读毕释放底层句柄(已 done 时为无操作)。
    total += size;
    if (total > MAX_SKILL_TOTAL_BYTES) return null;
    const uri = `${uriPrefix}${rel.split("/").map(encodeURIComponent).join("/")}`;
    files.set(uri, rel);
    resources.push({ uri, digest: `sha256:${hasher.digest("hex")}`, size });
  }
  return {
    uri: `${uriPrefix}${SKILL_MANIFEST}`,
    frontmatter,
    resources: resources.sort((a, b) => a.uri.localeCompare(b.uri)),
    dir,
    name,
    files,
  };
};

/** 内部:递归收集目录下文件相对路径(`/` 分隔,排序)。跳隐藏条目;symlink 不跟随(防逃逸)。 */
const listSkillFiles = async (dir: string, prefix: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      files.push(...(await listSkillFiles(join(dir, e.name), rel)));
    } else if (e.isFile()) {
      files.push(rel);
    }
  }
  return files.sort();
};

/** 读取清单内文件(第二道防穿越:resolve 后必须仍落在 skill 目录内才读)。非 UTF-8 文本返回 null。 */
export const readSkillResourceText = async (
  skill: ScannedHubSkill,
  relativePath: string,
): Promise<string | null> => {
  const skillRoot = resolve(skill.dir);
  const abs = resolve(skillRoot, ...relativePath.split("/"));
  if (!abs.startsWith(skillRoot + sep)) return null;
  return readFile(abs, "utf8").catch(() => null);
};
