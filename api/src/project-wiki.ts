import {
  type ApiErrorCode,
  type WikiPage,
  type WikiPageFrontmatter,
  type WikiPageSummary,
} from "@agents-remote/shared";
import matter from "gray-matter";
import { chmod, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import { dirname, join } from "node:path";
import {
  ProjectPathError,
  resolveProjectPath,
  resolveProjectRelativePath,
} from "./project-paths.js";

// wiki 目录相对项目根(flat markdown 目录,起步态;后续按类型子目录见 plan 后续打磨)。
const WIKI_DIR_RELATIVE = "wiki";
const WIKI_PAGE_SUFFIX = ".md";

export type ProjectWikiErrorCode = Extract<
  ApiErrorCode,
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_FS_ERROR"
  | "PROJECT_FILE_NOT_FOUND"
  | "PROJECT_FILE_TARGET_EXISTS"
  | "WIKI_SLUG_INVALID"
>;

export class ProjectWikiError extends Error {
  constructor(
    readonly code: ProjectWikiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectWikiError";
  }
}

const isNotFoundError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const isPathError = (error: unknown): error is ProjectPathError =>
  error instanceof ProjectPathError;

/**
 * wiki 页面 slug 校验:只允许 `[a-zA-Z0-9._-]`,拒空/null byte/`.`/`..`。
 * slug 直接拼进文件名(wiki/{slug}.md),必须防穿越——regex 拒 `/` 已堵 `../`。
 */
const WIKI_SLUG_RE = /^[a-zA-Z0-9._-]+$/;

export function sanitizeWikiSlug(input: string): string {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
    throw new ProjectWikiError("WIKI_SLUG_INVALID", "Wiki slug must be a non-empty string");
  }
  const value = input.trim();
  if (value === "." || value === ".." || !WIKI_SLUG_RE.test(value)) {
    throw new ProjectWikiError("WIKI_SLUG_INVALID", `Invalid wiki slug: ${value}`);
  }
  return value;
}

/** 写入参数(MCP 工具 wiki_write_page 构造;HTTP consumer 只读不写)。 */
export type WikiPageWriteInput = {
  slug: string;
  title: string;
  content: string; // markdown 正文(不含 frontmatter)
  tags?: string[];
  overwrite?: boolean;
};

export type WikiPageWriteResult = {
  slug: string;
  path: string;
  created: boolean; // true=新建,false=覆盖
};

// ── 纯函数:frontmatter 解析/序列化 ────────────────────────────────────

const todayISO = (): string => new Date().toISOString().slice(0, 10);

/**
 * 归一化日期字段为 YYYY-MM-DD 字符串。js-yaml 会把无引号 `2026-07-31` 解析成 Date
 * 对象(冒烟实测),这里统一回字符串;缺字段/非法 → fallback(传文件 mtime 日期)。
 */
const normalizeWikiDate = (value: unknown, fallback: string): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length > 0) return value.slice(0, 10);
  return fallback;
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : [];

/** 从原始 markdown + 文件 mtime 构造 WikiPage(frontmatter 缺字段时 fallback 稳健显示)。 */
const buildWikiPage = (slug: string, raw: string, mtimeMs: number): WikiPage => {
  const parsed = matter(raw);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const mtimeDate = new Date(mtimeMs).toISOString().slice(0, 10);
  const frontmatter: WikiPageFrontmatter = {
    title: typeof data.title === "string" && data.title.length > 0 ? data.title : slug,
    tags: toStringArray(data.tags),
    created: normalizeWikiDate(data.created, mtimeDate),
    updated: normalizeWikiDate(data.updated, mtimeDate),
  };
  return { slug, frontmatter, body: parsed.content };
};

// ── Service(单一数据源:MCP 工具 producer + HTTP consumer 都调它)──────────

export class ProjectWikiService {
  constructor(private readonly projectsRoot: string) {}

  /**
   * 列 wiki/ 下所有 .md 页面摘要。空目录/无 wiki 目录 → [](不抛)。
   * 逐页读 frontmatter 取 title/tags/updated(首期页面少,全量 parse 可接受;
   * 后续可只读头部或缓存,见 plan 后续打磨)。
   */
  async listPages(projectName: string): Promise<WikiPageSummary[]> {
    // wiki 目录可能不存在(无页面),不能用要求路径已存在的 resolveProjectRelativePath。
    // resolveProject 拿 project.path + join 拼 wiki 目录,readdir ENOENT → []。
    const project = await this.resolveProject(projectName);
    const dirPath = join(project.path, WIKI_DIR_RELATIVE);
    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw new ProjectWikiError("PROJECT_FS_ERROR", "Unable to read wiki directory");
    }

    const summaries: WikiPageSummary[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(WIKI_PAGE_SUFFIX)) continue;
      const slug = entry.slice(0, -WIKI_PAGE_SUFFIX.length);
      try {
        const page = await this.readPage(projectName, slug);
        summaries.push({
          slug: page.slug,
          title: page.frontmatter.title,
          tags: page.frontmatter.tags,
          updated: page.frontmatter.updated,
        });
      } catch (error) {
        // 非法 slug 文件(用户手放)或读失败的单页 → 跳过,不让单条脏数据整盘 500。
        if (
          error instanceof ProjectWikiError &&
          (error.code === "PROJECT_FILE_NOT_FOUND" || error.code === "WIKI_SLUG_INVALID")
        ) {
          continue;
        }
        throw error;
      }
    }
    return summaries;
  }

  /** 读单页:wiki/{slug}.md → gray-matter 解析 → { slug, frontmatter, body }。不存在 → NOT_FOUND。 */
  async readPage(projectName: string, slugInput: string): Promise<WikiPage> {
    const slug = sanitizeWikiSlug(slugInput);
    const resolved = await this.resolvePagePath(projectName, slug);
    let raw: string;
    let fileStat: Stats;
    try {
      raw = await readFile(resolved.path, "utf8");
      fileStat = await stat(resolved.path);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new ProjectWikiError("PROJECT_FILE_NOT_FOUND", `Wiki page not found: ${slug}`);
      }
      throw new ProjectWikiError("PROJECT_FS_ERROR", "Unable to read wiki page");
    }
    return buildWikiPage(slug, raw, Number(fileStat.mtimeMs));
  }

  /**
   * 写单页:校验 slug → 序列化 frontmatter(title/tags/created/updated;created 首写定、
   * updated 每次刷新;overwrite 保留原 created)→ 原子写(temp→rename 0o600 + mkdir wiki/ 0o700)。
   * 已存在且 !overwrite → PROJECT_FILE_TARGET_EXISTS。title 空 → fallback slug。
   */
  async writePage(
    projectName: string,
    slugInput: string,
    input: WikiPageWriteInput,
  ): Promise<WikiPageWriteResult> {
    const slug = sanitizeWikiSlug(slugInput);
    // 写路径:文件可能不存在(新建),不能用要求路径已存在的 resolveProjectRelativePath。
    // 仿 ProjectPagesService.writeConfig:resolveProjectPath 拿 project.path + 手拼安全相对路径
    // (slug 已由 sanitizeWikiSlug 校验不含 `/`/`..`,文件名必在 wiki/ 内,不越界)。
    const project = await this.resolveProject(projectName);
    const pagePath = join(project.path, WIKI_DIR_RELATIVE, `${slug}${WIKI_PAGE_SUFFIX}`);

    let existed = false;
    let createdDate = todayISO();
    try {
      await stat(pagePath);
      existed = true;
      if (!input.overwrite) {
        throw new ProjectWikiError(
          "PROJECT_FILE_TARGET_EXISTS",
          `Wiki page already exists: ${slug} (set overwrite=true to replace)`,
        );
      }
      // 覆盖:读原 frontmatter 的 created 保留(updated 每次刷新)。
      try {
        const oldRaw = await readFile(pagePath, "utf8");
        const oldData = (matter(oldRaw).data ?? {}) as Record<string, unknown>;
        createdDate = normalizeWikiDate(oldData.created, todayISO());
      } catch {
        // 原文件无 frontmatter / 读失败 → created 用 today,不阻塞覆盖。
      }
    } catch (error) {
      if (error instanceof ProjectWikiError) throw error;
      if (!isNotFoundError(error)) {
        throw new ProjectWikiError("PROJECT_FS_ERROR", "Unable to check existing wiki page");
      }
      // ENOENT → 新建,existed=false,created=today。
    }

    const title =
      typeof input.title === "string" && input.title.trim().length > 0 ? input.title.trim() : slug;
    const frontmatter: WikiPageFrontmatter = {
      title,
      tags: toStringArray(input.tags),
      created: createdDate,
      updated: todayISO(),
    };
    const payload = matter.stringify(input.content, frontmatter);

    const tempPath = `${pagePath}.${process.pid}.tmp`;
    await mkdir(dirname(pagePath), { recursive: true, mode: 0o700 });
    await writeFile(tempPath, payload, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, pagePath);

    return { slug, path: pagePath, created: !existed };
  }

  // ── private:路径解析(每次过 resolver,不信任快照)──────────────────────

  /** 解析 project 目录本身(不解析文件路径)。写路径用:文件可能新建,realpath 会失败。 */
  private async resolveProject(projectName: string) {
    try {
      return await resolveProjectPath(this.projectsRoot, projectName);
    } catch (error) {
      if (isPathError(error)) {
        throw new ProjectWikiError(error.code, error.message);
      }
      throw error;
    }
  }

  private async resolvePageRelative(projectName: string, relative: string) {
    try {
      return await resolveProjectRelativePath(this.projectsRoot, projectName, relative);
    } catch (error) {
      if (isPathError(error)) {
        if (error.code === "PROJECT_FS_ERROR") {
          throw new ProjectWikiError("PROJECT_FILE_NOT_FOUND", "Wiki page was not found");
        }
        throw new ProjectWikiError(error.code, error.message);
      }
      throw error;
    }
  }

  /** 读单页用:wiki/{slug}.md 相对路径解析(realpath 校验,拦截越界 symlink)。 */
  private resolvePagePath(projectName: string, slug: string) {
    return this.resolvePageRelative(projectName, `${WIKI_DIR_RELATIVE}/${slug}${WIKI_PAGE_SUFFIX}`);
  }
}
