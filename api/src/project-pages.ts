import {
  type ApiErrorCode,
  type PagesConfig,
  type PagesRoot,
  type PagesRootAuth,
} from "@agents-remote/shared";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, normalize, sep } from "node:path";
import { ProjectPathError, resolveProjectPath, resolveProjectRelativePath } from "./project-paths";
import { rawFileMimeType } from "./project-files";

// pages 配置相对项目根的位置（dotfile，被 Files 列表过滤但 resolveProjectRelativePath
// 不拒点目录，可正常读写）。这是项目内首个配置文件。
const PAGES_CONFIG_RELATIVE = ".agents-remote/pages.json";
const PAGES_SCHEMA_VERSION = 1;
const PAGES_CONFIG_DIR_RELATIVE = ".agents-remote";

export type ProjectPagesErrorCode = Extract<
  ApiErrorCode,
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_FS_ERROR"
  | "PROJECT_FILE_NOT_FOUND"
  | "PROJECT_PAGES_CONFIG_INVALID"
  | "PROJECT_PAGES_ROOT_CONFLICT"
>;

export class ProjectPagesError extends Error {
  constructor(
    readonly code: ProjectPagesErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectPagesError";
  }
}

export type ServedPage = {
  content: Buffer;
  mimeType: string;
  /** 弱 ETag，格式 `W/"<hash>"`。文件内容/属性变化（mtimeNs 变）即变。 */
  etag: string;
  /** 命中的根配置（含 auth），供路由层条件鉴权用。 */
  root: PagesRoot;
};

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const isPathError = (error: unknown): error is ProjectPathError =>
  error instanceof ProjectPathError;

// ── 纯函数：URL 路径规范化、根匹配、ETag ──────────────────────────────

/**
 * 把任意 urlPath 规范化为绝对路径：补前导 "/"、去重复斜杠、去尾斜杠（根 "/" 保留）。
 * 空串、无前导斜杠、纯斜杠都归一为 "/"。供 normalize/匹配/serve 共用单一真相。
 */
export const normalizeUrlPath = (raw: string): string => {
  let s = raw.trim();
  if (!s.startsWith("/")) s = `/${s}`;
  const segments = s.split("/").filter((segment) => segment.length > 0);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
};

/**
 * 校验并规范化单个根的 fsDir：去首尾空白、normalize；非空、不是 "."、不含 ".." 段、
 * 不是绝对路径。配置层先拦（serve 仍走 resolver 兜底），早失败给出明确错误。
 */
const normalizeFsDir = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new ProjectPagesError(
      "PROJECT_PAGES_CONFIG_INVALID",
      "Pages root fsDir must not be empty",
    );
  }
  if (trimmed === "." || trimmed === "..") {
    throw new ProjectPagesError(
      "PROJECT_PAGES_CONFIG_INVALID",
      "Pages root fsDir must be a subdirectory",
    );
  }
  const normalized = normalize(trimmed);
  if (normalized === "." || normalized === "..") {
    throw new ProjectPagesError(
      "PROJECT_PAGES_CONFIG_INVALID",
      "Pages root fsDir must be a subdirectory",
    );
  }
  const segments = normalized.split(sep);
  if (segments.some((segment) => segment === "..")) {
    throw new ProjectPagesError(
      "PROJECT_PAGES_CONFIG_INVALID",
      "Pages root fsDir must stay inside the project",
    );
  }
  return normalized;
};

const normalizeAuth = (raw: unknown): PagesRootAuth => (raw === "token" ? "token" : "public");

/**
 * 规范化单个根：urlPath/fsDir/auth 全规范化。返回新的 PagesRoot（不 mutate 输入）。
 */
const normalizeRoot = (input: unknown): PagesRoot => {
  if (!input || typeof input !== "object") {
    throw new ProjectPagesError("PROJECT_PAGES_CONFIG_INVALID", "Pages root must be an object");
  }
  const { urlPath, fsDir, auth } = input as { urlPath?: unknown; fsDir?: unknown; auth?: unknown };
  if (typeof urlPath !== "string" || typeof fsDir !== "string") {
    throw new ProjectPagesError(
      "PROJECT_PAGES_CONFIG_INVALID",
      "Pages root urlPath and fsDir must be strings",
    );
  }
  return {
    urlPath: normalizeUrlPath(urlPath),
    fsDir: normalizeFsDir(fsDir),
    auth: normalizeAuth(auth),
  };
};

/**
 * 多根最长前缀匹配（nginx location 语义）。按 urlPath 长度降序，首个
 * `urlPath === "/"` 或 `requestPath.startsWith(rootPath + "/")` / `=== rootPath` 命中。
 * 允许嵌套（"/" 与 "/docs" 共存，"/docs/x" 命中 "/docs"）。无匹配返回 undefined。
 */
export const matchPagesRoot = (
  roots: readonly PagesRoot[],
  requestPath: string,
): PagesRoot | undefined => {
  const path = normalizeUrlPath(requestPath);
  const sorted = [...roots].sort((a, b) => b.urlPath.length - a.urlPath.length);
  for (const root of sorted) {
    if (root.urlPath === "/") return root;
    if (path === root.urlPath) return root;
    if (path.startsWith(`${root.urlPath}/`)) return root;
  }
  return undefined;
};

/**
 * 弱 ETag：sha1(size + mtimeMs + path)。不读全文件（性能），文件内容改 mtimeMs 必变 →
 * ETag 变。弱语义：同秒同大小覆盖（极少）会误命中 304，可接受（决策点 4「弱 ETag」）。
 */
export const computeWeakEtag = (size: number, mtimeMs: number, path: string): string => {
  const hash = createHash("sha1").update(`${size}:${mtimeMs}:${path}`).digest("hex").slice(0, 16);
  return `W/"${hash}"`;
};

// ── Service ──────────────────────────────────────────────────────────

export class ProjectPagesService {
  constructor(private readonly projectsRoot: string) {}

  /**
   * 读 pages 配置：缺文件 → 空 roots（不抛错）；项目不存在 → PROJECT_NOT_FOUND；
   * 非法 JSON/结构 → CONFIG_INVALID。先用 resolveProjectPath 确认项目存在并拿到
   * project.path（不存在项目 → PROJECT_NOT_FOUND，清晰区分于"配置文件不存在"），
   * 再自己读配置文件（ENOENT → 空配置）。
   */
  async readConfig(projectName: string): Promise<PagesConfig> {
    const project = await this.resolveProject(projectName);
    let raw: string;
    try {
      raw = await readFile(join(project.path, PAGES_CONFIG_RELATIVE), "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        return { schemaVersion: PAGES_SCHEMA_VERSION, roots: [] };
      }
      throw new ProjectPagesError("PROJECT_FS_ERROR", "Unable to read pages config");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ProjectPagesError("PROJECT_PAGES_CONFIG_INVALID", "Pages config is not valid JSON");
    }

    return normalizeConfig(parsed);
  }

  /**
   * PUT 整体覆盖写。校验每个根（normalize）+ urlPath 不冲突；原子写（temp→rename 0o600），
   * 先确保 `.agents-remote/` 目录存在（mkdir recursive 0o700）。
   */
  async writeConfig(projectName: string, roots: readonly PagesRoot[]): Promise<PagesConfig> {
    const normalized = normalizeRoots(roots);
    assertNoUrlPathConflict(normalized);
    const config: PagesConfig = { schemaVersion: PAGES_SCHEMA_VERSION, roots: normalized };

    const project = await this.resolveProject(projectName);
    const configPath = join(project.path, PAGES_CONFIG_RELATIVE);
    const tempPath = `${configPath}.${process.pid}.tmp`;
    const payload = `${JSON.stringify(config, null, 2)}\n`;
    await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
    await writeFile(tempPath, payload, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, configPath);
    return config;
  }

  /**
   * 核心：URL 路径 → 匹配根 → serve 文件。
   * 1. readConfig → roots；无匹配根 → PROJECT_FILE_NOT_FOUND（路由层 404）。
   * 2. subPath = requestPath 去掉根前缀；relative = join(root.fsDir, subPath)。
   * 3. resolveProjectRelativePath 双校验 + stat：文件 → serve；目录 → 尝试
   *    {dir}/index.html 默认页(再校验),无 index.html / 不存在 → NOT_FOUND(目录列表关)。
   * 4. readFile + MIME + 弱 ETag → { content, mimeType, etag, root }。
   */
  async serve(projectName: string, requestPath: string): Promise<ServedPage> {
    const { roots } = await this.readConfig(projectName);
    const root = matchPagesRoot(roots, requestPath);
    if (!root) {
      throw new ProjectPagesError(
        "PROJECT_FILE_NOT_FOUND",
        "No pages root matched the request path",
      );
    }

    const path = normalizeUrlPath(requestPath);
    const subPath = root.urlPath === "/" ? path : path.slice(root.urlPath.length) || "/";
    const relative = join(root.fsDir, normalizeUrlPath(subPath) === "/" ? "." : subPath);

    let target = await this.resolveAndStat(projectName, relative);
    // 目录 → 尝试 {dir}/index.html 默认页（nginx index 行为）。resolveAndStat 再走一次
    // resolveServePath(isInsideOrSelf + realpath 双校验)：index.html 若是指向项目外的
    // symlink 被拦成 PATH_OUTSIDE_ROOT → 400；不存在 → NOT_FOUND → 404。
    if (!target.stat.isFile()) {
      target = await this.resolveAndStat(projectName, join(relative, "index.html"));
    }
    if (!target.stat.isFile()) {
      // 仍非文件(目录 + 无 index.html)：目录列表关、无 SPA fallback（决策点 3）→ 404。
      throw new ProjectPagesError("PROJECT_FILE_NOT_FOUND", "Pages path is not a file");
    }

    let content: Buffer;
    try {
      content = await readFile(target.path);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new ProjectPagesError("PROJECT_FILE_NOT_FOUND", "Pages file was not found");
      }
      throw new ProjectPagesError("PROJECT_FS_ERROR", "Unable to read pages file");
    }

    const mimeType = rawFileMimeType(target.path);
    const etag = computeWeakEtag(target.stat.size, Number(target.stat.mtimeMs), target.path);

    return { content, mimeType, etag, root };
  }

  /**
   * 解析项目目录本身（不解析配置文件相对路径）。缺失项目 → PROJECT_NOT_FOUND，
   * 与"配置文件缺失"（readConfig 内吞 ENOENT → 空 roots）语义分离。
   * ProjectPathError.code 全部落在 ProjectPagesErrorCode 内，直接透传。
   */
  private async resolveProject(projectName: string) {
    try {
      return await resolveProjectPath(this.projectsRoot, projectName);
    } catch (error) {
      if (isPathError(error)) {
        throw new ProjectPagesError(error.code, error.message);
      }
      throw error;
    }
  }

  private async resolveServePath(projectName: string, relative: string) {
    try {
      return await resolveProjectRelativePath(this.projectsRoot, projectName, relative);
    } catch (error) {
      if (isPathError(error)) {
        if (error.code === "PROJECT_FS_ERROR") {
          throw new ProjectPagesError("PROJECT_FILE_NOT_FOUND", "Pages file was not found");
        }
        throw new ProjectPagesError(error.code, error.message);
      }
      throw error;
    }
  }

  /** resolveServePath + stat:解析(双校验)并取 stat。ENOENT → NOT_FOUND,其他 FS 错 → FS_ERROR。 */
  private async resolveAndStat(
    projectName: string,
    relative: string,
  ): Promise<{ path: string; stat: Stats }> {
    const resolved = await this.resolveServePath(projectName, relative);
    try {
      return { path: resolved.path, stat: await stat(resolved.path) };
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new ProjectPagesError("PROJECT_FILE_NOT_FOUND", "Pages file was not found");
      }
      throw new ProjectPagesError("PROJECT_FS_ERROR", "Unable to inspect pages file");
    }
  }
}

// ── 配置校验纯函数 ────────────────────────────────────────────────────

const normalizeConfig = (parsed: unknown): PagesConfig => {
  if (!parsed || typeof parsed !== "object") {
    throw new ProjectPagesError("PROJECT_PAGES_CONFIG_INVALID", "Pages config must be an object");
  }
  const { roots } = parsed as { roots?: unknown };
  if (!Array.isArray(roots)) {
    throw new ProjectPagesError(
      "PROJECT_PAGES_CONFIG_INVALID",
      "Pages config roots must be an array",
    );
  }
  const normalized = normalizeRoots(roots);
  // 读路径不做冲突拦截（容忍历史/手写的轻微冲突，按最长前缀匹配自然消解），
  // 仅写路径（writeConfig）强制无冲突。
  return { schemaVersion: PAGES_SCHEMA_VERSION, roots: normalized };
};

const normalizeRoots = (roots: readonly unknown[]): PagesRoot[] =>
  roots.map((entry) => normalizeRoot(entry));

const assertNoUrlPathConflict = (roots: readonly PagesRoot[]): void => {
  const seen = new Set<string>();
  for (const root of roots) {
    if (seen.has(root.urlPath)) {
      throw new ProjectPagesError(
        "PROJECT_PAGES_ROOT_CONFLICT",
        `Pages root urlPath "${root.urlPath}" is duplicated`,
      );
    }
    seen.add(root.urlPath);
  }
};

// 防止 PAGES_CONFIG_DIR_RELATIVE 未使用告警（语义文档化用，预留显式目录名常量）。
export const PAGES_CONFIG_DIR = PAGES_CONFIG_DIR_RELATIVE;
