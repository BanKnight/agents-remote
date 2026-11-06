import { constants } from "node:fs";
import type { Dirent } from "node:fs";
import { UPLOAD_CHUNK_SIZE_BYTES } from "@agents-remote/shared";
import type {
  ApiErrorCode,
  CreateFileResponse,
  CreateFolderResponse,
  DeleteFileResponse,
  ProjectFileEntry,
  ProjectFileListResponse,
  ProjectFilePreviewMediaType,
  ProjectFilePreviewResponse,
  ProjectFileSearchMatch,
  ProjectFileSearchResponse,
  ProjectUnsupportedFilePreviewReason,
  RenameFileResponse,
  SaveFileResponse,
  UploadChunkResponse,
  UploadConflictPolicy,
  UploadFileResponse,
} from "@agents-remote/shared";
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative } from "node:path";
import { ProjectPathError, resolveProjectRelativePath, resolveProjectsRoot } from "./project-paths";

// 2MiB（2026-10-01 用户拍板放宽，原 256KiB）：项目内真实大文本（lock/log/tsbuildinfo/
// sourcemap/长文档，实测最大 553KB）全被 256KiB 挡在预览外，而它们恰是排查高价值文件；
// 2MiB = 4 倍余量，移动端 JSON gzip 传输秒级、CodeMirror 虚拟渲染查看无感。上限真正
// 挡的是「10MB sourcemap 不该在手机看」，那类留给 raw 下载。
export const TEXT_PREVIEW_LIMIT_BYTES = 2 * 1024 * 1024;
export const IMAGE_PREVIEW_LIMIT_BYTES = 5 * 1024 * 1024;

/** 03x 文件搜索：结果上限（达到即 truncated，客户端提示「仅显示前 N 个」）。 */
export const FILE_SEARCH_LIMIT = 200;
/**
 * 03x 文件搜索：遍历条目总量上限（security review P3①）——结果上限只兜「命中多」，
 * 兜不住「匹配少但目录树巨大」（超大项目全树 walk 才返回，CPU/IO 无上界）；visited 达限
 * 同样置 truncated（语义一致：结果可能不完整）。
 */
export const FILE_SEARCH_VISIT_LIMIT = 20_000;
/** 03x 搜索递归跳过的目录名（仓库元数据 / 依赖体积黑洞——遍历既慢又无业务意义）。 */
const FILE_SEARCH_SKIP = new Set([".git", "node_modules"]);

export type RawFileResult = {
  content: Buffer;
  mimeType: string;
};

export const UPLOAD_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
/**
 * 上传预检的 multipart 开销余量：multipart body 恒 ≥ 文件本体（boundary/头 + 尾开销），
 * content-length 超过「上限 + 余量」即必然超限，路由层在 formData() 全量接收前直接 413，
 * 免掉整段 body 传输；窄缝（body ≤ limit+余量 而 file > limit）由 writeUpload 兜底。
 */
export const UPLOAD_MULTIPART_OVERHEAD_ALLOWANCE = 64 * 1024;

// ── 分块上传（真进度正式方案）常量 ─────────────────────────────────────
/** 分块临时根：OS tmp 下独立目录；块阶段不触 PROJECTS_ROOT，complete 才合并落盘。 */
const UPLOAD_CHUNK_DIR = join(tmpdir(), "agents-remote-upload-chunks");
/** uploadId 白名单（客户端 crypto.randomUUID 生成）：匹配后才拼路径，防 `../` 注入。 */
const UPLOAD_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
/** 块数上限：50MiB 上限 ÷ 2MiB 块 = 25 块覆盖全部合法上传，64 留裕量。 */
export const UPLOAD_MAX_CHUNKS = 64;

/**
 * 文件 tab 列表黑名单：仅这些精确名字的一级条目被隐藏（list 不返回 + hidden 标记）。
 * 最小黑名单——只藏 `.git`（仓库元数据），其余 dot 项（`.claude/`、`.mcp.json`、
 * `.env` 等）保持可见，让用户能在文件 tab 检查插件管理的配置文件。
 * 精确匹配：`.gitignore`/`.gitattributes` 等不以 `.git` 为整名的不受影响。
 */
const FILE_LIST_BLOCKLIST = new Set([".git"]);

type ProjectFilesErrorCode = Extract<
  ApiErrorCode,
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_FILE_NOT_FOUND"
  | "PROJECT_FILE_NOT_DIRECTORY"
  | "PROJECT_FILE_NOT_FILE"
  | "PROJECT_FILE_TARGET_EXISTS"
  | "PROJECT_FILE_UPLOAD_FAILED"
  | "PROJECT_FILE_UPLOAD_TOO_LARGE"
  | "PROJECT_FILE_RENAME_FAILED"
  | "PROJECT_FILE_DELETE_FAILED"
  | "PROJECT_FILE_SAVE_FAILED"
  | "PROJECT_FS_ERROR"
>;

export class ProjectFilesError extends Error {
  constructor(
    readonly code: ProjectFilesErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectFilesError";
  }
}

export class ProjectFilesService {
  constructor(private readonly projectsRoot: string) {}

  /**
   * 列 PROJECTS_ROOT 一级目录（项目目录），用于全局 files tab 的根目录浏览。
   * 只读入口（用户权限边界：根目录层只读，写操作进入项目子目录后走 project-scoped API）。
   * 复用 listFiles 的 entryFromDirent + compareEntries + 隐藏过滤；projectName 返回 ""
   *（根层无所属项目，客户端按 currentPath 第一段切换数据源）。rootPath 带真实根目录
   * 绝对路径（realpath 后）——客户端 crumb 根段显示 basename，不硬编码根名。
   */
  async listRootFiles(): Promise<ProjectFileListResponse> {
    const rootPath = await resolveProjectsRoot(this.projectsRoot);

    try {
      const entries = await readdir(rootPath, { withFileTypes: true });
      const files = await Promise.all(
        entries.flatMap((entry) => {
          if (!entry.isDirectory() && !entry.isFile()) {
            return [];
          }

          if (FILE_LIST_BLOCKLIST.has(entry.name)) {
            return [];
          }

          return [this.entryFromDirent(rootPath, rootPath, entry)];
        }),
      );

      return {
        projectName: "",
        path: "",
        parentPath: null,
        rootPath,
        entries: files.sort(compareEntries),
      };
    } catch {
      throw new ProjectFilesError("PROJECT_FS_ERROR", "Unable to list root files");
    }
  }

  async listFiles(projectName: string, relativePath = ""): Promise<ProjectFileListResponse> {
    const resolved = await this.resolvePath(projectName, relativePath);
    const targetStat = await this.statPath(resolved.path);

    if (!targetStat.isDirectory()) {
      throw new ProjectFilesError(
        "PROJECT_FILE_NOT_DIRECTORY",
        "Project file path must be a directory",
      );
    }

    try {
      const entries = await readdir(resolved.path, { withFileTypes: true });
      const files = await Promise.all(
        entries.flatMap((entry) => {
          if (!entry.isDirectory() && !entry.isFile()) {
            return [];
          }

          if (FILE_LIST_BLOCKLIST.has(entry.name)) {
            return [];
          }

          return [this.entryFromDirent(resolved.project.path, resolved.path, entry)];
        }),
      );

      return {
        projectName: resolved.project.name,
        path: resolved.relativePath,
        parentPath: parentProjectPath(resolved.relativePath),
        entries: files.sort(compareEntries),
      };
    } catch (error) {
      if (error instanceof ProjectFilesError) {
        throw error;
      }

      throw new ProjectFilesError("PROJECT_FS_ERROR", "Unable to list project files");
    }
  }

  /**
   * 03x 文件搜索（M8）：项目内文件名子串匹配（大小写不敏感），递归 walk 跳过
   * `.git`/`node_modules`，symlink 不进结果（防循环出根）；命中达 FILE_SEARCH_LIMIT 截断。
   * 结果 path 为项目内相对路径（03x ②「结果显示相对路径」）。遍历条目总量另受
   * FILE_SEARCH_VISIT_LIMIT 约束（security review P3①，options.visitLimit 供测试注入小上限）。
   */
  async searchFiles(
    projectName: string,
    query: string,
    options?: { visitLimit?: number },
  ): Promise<ProjectFileSearchResponse> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { projectName, query: trimmed, matches: [], truncated: false };
    }

    const resolved = await this.resolvePath(projectName, "");
    const needle = trimmed.toLowerCase();
    const matches: ProjectFileSearchMatch[] = [];
    let truncated = false;
    let visited = 0;
    const visitLimit = options?.visitLimit ?? FILE_SEARCH_VISIT_LIMIT;

    const walk = async (dirPath: string): Promise<void> => {
      if (truncated) return;
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (truncated) return;
        visited += 1;
        if (visited > visitLimit) {
          truncated = true;
          return;
        }
        // symlink 两态皆 false（readdir Dirent 不跟随）→ 天然过滤，不会循出项目根。
        if (!entry.isFile() && !entry.isDirectory()) continue;
        if (FILE_SEARCH_SKIP.has(entry.name)) continue;
        const isDir = entry.isDirectory();
        if (entry.name.toLowerCase().includes(needle)) {
          if (matches.length >= FILE_SEARCH_LIMIT) {
            truncated = true;
            return;
          }
          const absPath = join(dirPath, entry.name);
          const entryStat = isDir ? undefined : await this.statEntry(absPath);
          matches.push({
            name: entry.name,
            path: relative(resolved.path, absPath),
            type: isDir ? "directory" : "file",
            size: entryStat?.size ?? null,
            ...(isDir || !entryStat ? {} : { mtimeMs: entryStat.mtimeMs }),
          });
        }
        if (isDir) {
          await walk(join(dirPath, entry.name));
        }
      }
    };

    try {
      await walk(resolved.path);
    } catch (error) {
      if (error instanceof ProjectFilesError) {
        throw error;
      }

      throw new ProjectFilesError("PROJECT_FS_ERROR", "Unable to search project files");
    }

    return { projectName: resolved.project.name, query: trimmed, matches, truncated };
  }

  async previewFile(projectName: string, relativePath = ""): Promise<ProjectFilePreviewResponse> {
    const resolved = await this.resolvePath(projectName, relativePath);
    const targetStat = await this.statPath(resolved.path);

    if (!targetStat.isFile()) {
      throw new ProjectFilesError("PROJECT_FILE_NOT_FILE", "Project file path must be a file");
    }

    const name = basename(resolved.path);
    const size = targetStat.size;
    const mediaType = imageMediaType(resolved.path);

    if (mediaType) {
      if (size > IMAGE_PREVIEW_LIMIT_BYTES) {
        return tooLargePreview(
          resolved.project.name,
          resolved.relativePath,
          name,
          size,
          IMAGE_PREVIEW_LIMIT_BYTES,
        );
      }

      const content = await this.readContent(resolved.path);

      return {
        type: "image",
        projectName: resolved.project.name,
        path: resolved.relativePath,
        name,
        size,
        mediaType,
        dataUrl: `data:${mediaType};base64,${content.toString("base64")}`,
      };
    }

    if (isSupportedTextPath(resolved.path)) {
      if (size > TEXT_PREVIEW_LIMIT_BYTES) {
        return tooLargePreview(
          resolved.project.name,
          resolved.relativePath,
          name,
          size,
          TEXT_PREVIEW_LIMIT_BYTES,
        );
      }

      const content = await this.readContent(resolved.path);
      const text = decodeText(content);

      if (text === undefined || containsBinaryControlCharacters(text)) {
        return unsupportedPreview(
          resolved.project.name,
          resolved.relativePath,
          name,
          size,
          "binary_text",
        );
      }

      return {
        type: "text",
        projectName: resolved.project.name,
        path: resolved.relativePath,
        name,
        size,
        content: text,
        // 移动预览 03q meta「更新 …」（M4）。
        mtimeMs: targetStat.mtimeMs,
      };
    }

    return unsupportedPreview(
      resolved.project.name,
      resolved.relativePath,
      name,
      size,
      "unsupported_type",
    );
  }

  async rawFile(projectName: string, relativePath: string): Promise<RawFileResult> {
    const resolved = await this.resolvePath(projectName, relativePath);
    const targetStat = await this.statPath(resolved.path);

    if (!targetStat.isFile()) {
      throw new ProjectFilesError("PROJECT_FILE_NOT_FILE", "Project file path must be a file");
    }

    const content = await this.readContent(resolved.path);
    const mimeType = rawFileMimeType(resolved.path);

    return { content, mimeType };
  }

  /**
   * 上传文件到项目内目录。同名冲突（03z 三选）按 `conflict` 处置：缺省维持 409 硬拒
   *（兼容旧调用方）；"overwrite" = 覆盖既有文件；"keepBoth" = 派生 `name(1).ext` 落盘。
   * 目标目录不存在时自动创建（composer uploads/ 首传：全仓无任何 mkdir 调用方，此前
   * 必 404；文件树场景目录必然已存在不受影响）——ensureDirectory 见 project-paths。
   */
  async uploadFile(
    projectName: string,
    directoryPath: string,
    fileName: string,
    content: Buffer,
    conflict?: UploadConflictPolicy,
  ): Promise<UploadFileResponse> {
    const resolved = await this.resolvePath(projectName, directoryPath, {
      ensureDirectory: true,
    });
    const dirStat = await this.statPath(resolved.path);

    if (!dirStat.isDirectory()) {
      throw new ProjectFilesError(
        "PROJECT_FILE_NOT_DIRECTORY",
        "Upload target must be a directory",
      );
    }

    return this.writeUpload(resolved.path, directoryPath, fileName, content, conflict);
  }

  /**
   * 上传文件到 PROJECTS_ROOT 根层（10 pin④「上传到当前作用域」，M8 全局文件写边界）。
   * 根层无项目上下文：resolveProjectsRoot（realpath 校验）+ 文件名/大小同款校验 +
   * 同名冲突同款三选语义；返回 entry.path = 根相对（即文件名本身）。
   */
  async uploadRootFile(
    fileName: string,
    content: Buffer,
    conflict?: UploadConflictPolicy,
  ): Promise<UploadFileResponse> {
    const rootPath = await resolveProjectsRoot(this.projectsRoot);
    return this.writeUpload(rootPath, "", fileName, content, conflict);
  }

  // ── 分块上传：单请求版在移动 tunnel 链路下进度是浏览器 send buffer 的猜测
  //（upload.onload 早于服务端收完是常态），且字节全在途时无任何服务端确认点。
  // 分块后每块 200 = 服务端已收下该块，进度真实可断；单块失败只重传该块。
  // 客户端不保留单请求路径（同一数据一条管道）；小文件 = 1 块的特例。

  private async chunkDirFor(uploadId: string): Promise<string> {
    if (!UPLOAD_ID_PATTERN.test(uploadId)) {
      throw new ProjectFilesError("PROJECT_NAME_INVALID", "Invalid upload id");
    }
    return join(UPLOAD_CHUNK_DIR, uploadId);
  }

  private validateChunkShape(totalChunks: number, index: number): void {
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > UPLOAD_MAX_CHUNKS) {
      throw new ProjectFilesError("PROJECT_NAME_INVALID", "Invalid chunk count");
    }
    if (!Number.isInteger(index) || index < 0 || index >= totalChunks) {
      throw new ProjectFilesError("PROJECT_NAME_INVALID", "Invalid chunk index");
    }
  }

  private async cleanupChunks(uploadId: string): Promise<void> {
    await rm(await this.chunkDirFor(uploadId), { recursive: true, force: true });
  }

  private async uploadChunkTo(
    uploadId: string,
    index: number,
    totalChunks: number,
    content: Buffer,
  ): Promise<UploadChunkResponse> {
    this.validateChunkShape(totalChunks, index);
    // 总大小上界提前拒绝（块阶段即 413，不必等 complete 拼接）；实际大小仍由
    // writeUpload 在 complete 时复核——谎报 total 只会少报，超限照样拦。
    if (totalChunks * UPLOAD_CHUNK_SIZE_BYTES > UPLOAD_FILE_LIMIT_BYTES) {
      await this.cleanupChunks(uploadId);
      throw new ProjectFilesError(
        "PROJECT_FILE_UPLOAD_TOO_LARGE",
        "File exceeds upload size limit",
      );
    }
    const dir = await this.chunkDirFor(uploadId);
    await mkdir(dir, { recursive: true });
    // 同一块重传以新内容为准（覆盖写）。
    await writeFile(join(dir, `${index}.part`), content);
    return { index, bytes: content.length };
  }

  private async joinChunks(uploadId: string, totalChunks: number): Promise<Buffer> {
    this.validateChunkShape(totalChunks, 0);
    const dir = await this.chunkDirFor(uploadId);
    const parts: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      try {
        parts.push(await readFile(join(dir, `${i}.part`)));
      } catch {
        throw new ProjectFilesError("PROJECT_TARGET_INVALID", `Missing chunk ${i}`);
      }
    }
    return Buffer.concat(parts);
  }

  // complete 共用收尾：合并落盘成功 / 非冲突失败都清临时块；409（同名冲突待用户三选）
  // 保留临时块——三选后客户端重发 complete 即可，不必重传全部字节。
  private async finalizeChunked(
    uploadId: string,
    totalChunks: number,
    fileName: string,
    conflict: UploadConflictPolicy | undefined,
    finalize: (content: Buffer) => Promise<UploadFileResponse>,
  ): Promise<UploadFileResponse> {
    const content = await this.joinChunks(uploadId, totalChunks);
    try {
      const response = await finalize(content);
      await this.cleanupChunks(uploadId);
      return response;
    } catch (error) {
      const conflictPending =
        error instanceof ProjectFilesError && error.code === "PROJECT_FILE_TARGET_EXISTS";
      if (!conflictPending) await this.cleanupChunks(uploadId);
      throw error;
    }
  }

  /** 分块上传单块（项目内）：目标目录合法性提前校验（早失败）；块落 OS tmp。 */
  async uploadChunk(
    projectName: string,
    directoryPath: string,
    uploadId: string,
    index: number,
    totalChunks: number,
    content: Buffer,
  ): Promise<UploadChunkResponse> {
    // 与 uploadFile 同款带 ensureDirectory：composer uploads/ 首传目录不存在，块阶段
    // 就建（complete 的 writeUpload 仍全套复核）；早失败语义（隐藏段/越界/symlink）保留。
    await this.resolvePath(projectName, directoryPath, { ensureDirectory: true });
    return this.uploadChunkTo(uploadId, index, totalChunks, content);
  }

  /** 分块上传单块（PROJECTS_ROOT 根层，10 pin④ 对称）。 */
  async uploadRootChunk(
    uploadId: string,
    index: number,
    totalChunks: number,
    content: Buffer,
  ): Promise<UploadChunkResponse> {
    await resolveProjectsRoot(this.projectsRoot);
    return this.uploadChunkTo(uploadId, index, totalChunks, content);
  }

  /** 分块合并落盘（项目内）：复用 uploadFile 全套校验与冲突三选（分块路径同等生效）。 */
  async completeChunkedUpload(
    projectName: string,
    directoryPath: string,
    uploadId: string,
    totalChunks: number,
    fileName: string,
    conflict?: UploadConflictPolicy,
  ): Promise<UploadFileResponse> {
    return this.finalizeChunked(uploadId, totalChunks, fileName, conflict, (content) =>
      this.uploadFile(projectName, directoryPath, fileName, content, conflict),
    );
  }

  /** 分块合并落盘（根层）：复用 uploadRootFile 同款边界。 */
  async completeRootChunkedUpload(
    uploadId: string,
    totalChunks: number,
    fileName: string,
    conflict?: UploadConflictPolicy,
  ): Promise<UploadFileResponse> {
    return this.finalizeChunked(uploadId, totalChunks, fileName, conflict, (content) =>
      this.uploadRootFile(fileName, content, conflict),
    );
  }

  // uploadFile / uploadRootFile 共用落盘段：入参校验（文件名 / 大小上限）→ 冲突处置 → 写入。
  // dirDisplayPath = 客户端视角的目标目录（项目相对 or "" 根层），仅用于构造 entry.path。
  private async writeUpload(
    dirPath: string,
    dirDisplayPath: string,
    fileName: string,
    content: Buffer,
    conflict?: UploadConflictPolicy,
  ): Promise<UploadFileResponse> {
    // 控制字符一并拒绝：文件名会原样进入 composer 的「Attachment: path」提及行，含 \n
    // 时可凭空多出一行指令。
    const hasControlChar = Array.from(fileName).some((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f;
    });
    if (fileName.includes("/") || fileName.includes("\\") || hasControlChar) {
      throw new ProjectFilesError("PROJECT_NAME_INVALID", "Invalid file name");
    }

    if (content.length > UPLOAD_FILE_LIMIT_BYTES) {
      throw new ProjectFilesError(
        "PROJECT_FILE_UPLOAD_TOO_LARGE",
        `File exceeds upload size limit of ${UPLOAD_FILE_LIMIT_BYTES / (1024 * 1024)} MiB`,
      );
    }

    let finalName = fileName;
    const targetPath = join(dirPath, fileName);

    // 末级 symlink 必须拒绝：stat/writeFile 都跟随 symlink，目录内一个指向界外的 symlink
    // 就能让上传写入项目外（安全审查实测：dangling symlink 被 stat 的 ENOENT 吞掉后
    // writeFile 直接在界外创建文件）。lstat 不跟随，dangling 也能识别。
    let existingStat: Awaited<ReturnType<typeof lstat>> | undefined;
    try {
      existingStat = await lstat(targetPath);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
    if (existingStat?.isSymbolicLink()) {
      throw new ProjectFilesError("PROJECT_TARGET_INVALID", "Upload target must not be a symlink");
    }

    if (existingStat?.isFile() && !conflict) {
      throw new ProjectFilesError(
        "PROJECT_FILE_TARGET_EXISTS",
        "A file with this name already exists",
      );
    }

    try {
      if (existingStat?.isFile() && conflict === "overwrite") {
        // O_NOFOLLOW：检查后被换成 symlink 时写入也拒绝，不越界。
        await writeFile(targetPath, content, {
          flag: constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW,
        });
      } else {
        // 新文件（含 keepBoth）：wx = O_CREAT|O_EXCL，路径已存在（含 symlink）即 EEXIST
        // 且不跟随——取代 existsSync 的检查-写入窗口。
        try {
          await writeFile(targetPath, content, { flag: "wx" });
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
          if (conflict !== "keepBoth") {
            throw new ProjectFilesError(
              "PROJECT_FILE_TARGET_EXISTS",
              "A file with this name already exists",
            );
          }
          finalName = await this.writeWithUniqueName(dirPath, fileName, content);
        }
      }
    } catch (error) {
      if (error instanceof ProjectFilesError) throw error;
      throw new ProjectFilesError("PROJECT_FILE_UPLOAD_FAILED", "Unable to write uploaded file");
    }

    const entryStat = await this.statPath(join(dirPath, finalName));

    return {
      entry: {
        name: finalName,
        path: dirDisplayPath.length > 0 ? `${dirDisplayPath}/${finalName}` : finalName,
        type: "file",
        hidden: false,
        size: entryStat.size,
      },
    };
  }

  // 03z「保留两者」：`name(1).ext` 起写第一个成功创建的候选（wx 原子占用，EEXIST 换下一
  // 个；上限 999 防恶意塞满目录时死循环）。
  private async writeWithUniqueName(
    dirPath: string,
    fileName: string,
    content: Buffer,
  ): Promise<string> {
    const ext = extname(fileName);
    const stem = ext.length > 0 ? fileName.slice(0, fileName.length - ext.length) : fileName;
    for (let i = 1; i <= 999; i++) {
      const candidate = `${stem}(${i})${ext}`;
      try {
        await writeFile(join(dirPath, candidate), content, { flag: "wx" });
        return candidate;
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
      }
    }
    throw new ProjectFilesError("PROJECT_FILE_UPLOAD_FAILED", "Unable to derive unique name");
  }

  async createFolder(
    projectName: string,
    parentPath: string,
    folderName: string,
  ): Promise<CreateFolderResponse> {
    const resolved = await this.resolvePath(projectName, parentPath);
    const dirStat = await this.statPath(resolved.path);

    if (!dirStat.isDirectory()) {
      throw new ProjectFilesError(
        "PROJECT_FILE_NOT_DIRECTORY",
        "Folder parent must be a directory",
      );
    }

    if (
      folderName.length === 0 ||
      folderName.includes("/") ||
      folderName.includes("\\") ||
      folderName.includes("\0")
    ) {
      throw new ProjectFilesError("PROJECT_NAME_INVALID", "Invalid folder name");
    }

    if (folderName.startsWith(".")) {
      throw new ProjectFilesError("PROJECT_NAME_INVALID", "Folder name must not start with a dot");
    }

    const targetPath = join(resolved.path, folderName);

    try {
      await mkdir(targetPath);
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        throw new ProjectFilesError(
          "PROJECT_FILE_TARGET_EXISTS",
          "A file or folder with this name already exists",
        );
      }

      throw new ProjectFilesError("PROJECT_FS_ERROR", "Unable to create folder");
    }

    return {
      entry: {
        name: folderName,
        path: parentPath.length > 0 ? `${parentPath}/${folderName}` : folderName,
        type: "directory",
        hidden: false,
        size: null,
      },
    };
  }

  /** 新建空文件（03y 新建 sheet，v1.4 批4）：校验骨架与 createFolder 同款（Project-safe
   * resolver + 名称合法性 + 重名硬拒），写空内容文件。 */
  async createFile(
    projectName: string,
    parentPath: string,
    fileName: string,
  ): Promise<CreateFileResponse> {
    const resolved = await this.resolvePath(projectName, parentPath);
    const dirStat = await this.statPath(resolved.path);

    if (!dirStat.isDirectory()) {
      throw new ProjectFilesError("PROJECT_FILE_NOT_DIRECTORY", "File parent must be a directory");
    }

    if (
      fileName.length === 0 ||
      fileName.includes("/") ||
      fileName.includes("\\") ||
      fileName.includes("\0")
    ) {
      throw new ProjectFilesError("PROJECT_NAME_INVALID", "Invalid file name");
    }

    if (fileName.startsWith(".")) {
      throw new ProjectFilesError("PROJECT_NAME_INVALID", "File name must not start with a dot");
    }

    const targetPath = join(resolved.path, fileName);

    try {
      // flag "wx" = 已存在即抛 EEXIST（默认 "w" 会截断既有文件，重名检查失效）。
      await writeFile(targetPath, "", { flag: "wx" });
      const entryStat = await this.statPath(targetPath);
      return {
        entry: {
          name: fileName,
          path: parentPath.length > 0 ? `${parentPath}/${fileName}` : fileName,
          type: "file",
          hidden: false,
          size: entryStat.size,
          ...(entryStat.isFile() ? { mtimeMs: entryStat.mtimeMs } : {}),
        },
      };
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        throw new ProjectFilesError(
          "PROJECT_FILE_TARGET_EXISTS",
          "A file or folder with this name already exists",
        );
      }

      throw new ProjectFilesError("PROJECT_FS_ERROR", "Unable to create file");
    }
  }

  async renameFile(
    projectName: string,
    relativePath: string,
    newName: string,
    targetDir?: string,
  ): Promise<RenameFileResponse> {
    const resolved = await this.resolvePath(projectName, relativePath);
    await this.statPath(resolved.path);

    if (
      newName.length === 0 ||
      newName.includes("/") ||
      newName.includes("\\") ||
      newName.includes("\0")
    ) {
      throw new ProjectFilesError("PROJECT_NAME_INVALID", "Invalid file name");
    }

    // 目标目录（M4 03w「移动到」= rename 带路径）：提供时过同款 resolver（PROJECTS_ROOT 不逃逸
    // + realpath 拦越界 symlink）且必须是已存在目录；缺省 = 原父目录（纯重命名）。
    let parent: string;
    let targetDirRelative: string;
    if (targetDir !== undefined && targetDir.length > 0) {
      const resolvedDir = await this.resolvePath(projectName, targetDir);
      const dirStat = await this.statPath(resolvedDir.path);
      if (!dirStat.isDirectory()) {
        throw new ProjectFilesError("PROJECT_NAME_INVALID", "Target is not a directory");
      }
      parent = resolvedDir.path;
      targetDirRelative = targetDir.replace(/\/+$/, "");
    } else {
      parent = dirname(resolved.path);
      const sourceParent = dirname(relativePath);
      targetDirRelative = sourceParent === "." ? "" : sourceParent;
    }
    const targetPath = join(parent, newName);

    try {
      const existingStat = await stat(targetPath);

      if (existingStat) {
        throw new ProjectFilesError(
          "PROJECT_FILE_TARGET_EXISTS",
          "A file or folder with this name already exists",
        );
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    try {
      await rename(resolved.path, targetPath);
    } catch {
      throw new ProjectFilesError("PROJECT_FILE_RENAME_FAILED", "Unable to rename file");
    }

    const entryStat = await this.statPath(targetPath);
    const entryPath = targetDirRelative.length === 0 ? newName : `${targetDirRelative}/${newName}`;

    return {
      entry: {
        name: newName,
        path: entryPath,
        type: entryStat.isDirectory() ? "directory" : "file",
        hidden: FILE_LIST_BLOCKLIST.has(newName),
        size: entryStat.isFile() ? entryStat.size : null,
      },
    };
  }

  async deleteFile(projectName: string, relativePath: string): Promise<DeleteFileResponse> {
    const resolved = await this.resolvePath(projectName, relativePath);
    await this.statPath(resolved.path);

    try {
      await rm(resolved.path, { recursive: true, force: true });
    } catch {
      throw new ProjectFilesError("PROJECT_FILE_DELETE_FAILED", "Unable to delete file");
    }

    return {
      deleted: true,
      projectName: resolved.project.name,
      path: resolved.relativePath,
    };
  }

  // Overwrite an existing project file's text content. Unlike uploadFile (which
  // refuses an existing name), save targets the file already under preview and
  // replaces its content in place. Reuses the same path-safe resolver and size
  // cap as upload so the write stays inside PROJECTS_ROOT and bounded.
  async saveFile(
    projectName: string,
    relativePath: string,
    content: string,
  ): Promise<SaveFileResponse> {
    const resolved = await this.resolvePath(projectName, relativePath);
    const targetStat = await this.statPath(resolved.path);

    if (!targetStat.isFile()) {
      throw new ProjectFilesError("PROJECT_FILE_NOT_FILE", "Save target must be a file");
    }

    if (Buffer.byteLength(content) > UPLOAD_FILE_LIMIT_BYTES) {
      throw new ProjectFilesError(
        "PROJECT_FILE_UPLOAD_TOO_LARGE",
        `File exceeds size limit of ${UPLOAD_FILE_LIMIT_BYTES / (1024 * 1024)} MiB`,
      );
    }

    try {
      await writeFile(resolved.path, content);
    } catch {
      throw new ProjectFilesError("PROJECT_FILE_SAVE_FAILED", "Unable to save file");
    }

    const entryStat = await this.statPath(resolved.path);
    const name = basename(resolved.path);

    return {
      entry: {
        name,
        path: resolved.relativePath,
        type: "file",
        hidden: FILE_LIST_BLOCKLIST.has(name),
        size: entryStat.size,
      },
    };
  }

  private async entryFromDirent(
    projectPath: string,
    directoryPath: string,
    entry: Dirent,
  ): Promise<ProjectFileEntry> {
    const path = join(directoryPath, entry.name);
    const entryStat = entry.isFile() ? await this.statPath(path) : undefined;

    return {
      name: entry.name,
      path: relative(projectPath, path),
      type: entry.isDirectory() ? "directory" : "file",
      hidden: FILE_LIST_BLOCKLIST.has(entry.name),
      size: entryStat?.size ?? null,
      // 移动文件工具 03o 行尾相对时间（M4）；目录行无 mtime。
      ...(entry.isFile() && entryStat ? { mtimeMs: entryStat.mtimeMs } : {}),
    };
  }

  private async resolvePath(
    projectName: string,
    relativePath: string,
    opts?: { ensureDirectory?: boolean },
  ) {
    try {
      return await resolveProjectRelativePath(this.projectsRoot, projectName, relativePath, opts);
    } catch (error) {
      if (error instanceof ProjectPathError) {
        if (error.code === "PROJECT_FS_ERROR") {
          throw new ProjectFilesError("PROJECT_FILE_NOT_FOUND", "Project file path was not found");
        }

        throw new ProjectFilesError(error.code, error.message);
      }

      throw error;
    }
  }

  private async statPath(path: string) {
    try {
      return await stat(path);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new ProjectFilesError("PROJECT_FILE_NOT_FOUND", "Project file path was not found");
      }

      throw new ProjectFilesError("PROJECT_FS_ERROR", "Unable to inspect project file path");
    }
  }

  // 搜索 walk 内的单文件 stat：文件可能在遍历间隙被删（ENOENT）——返回 undefined 不中断整个搜索。
  private async statEntry(path: string) {
    try {
      return await stat(path);
    } catch {
      return undefined;
    }
  }

  private async readContent(path: string) {
    try {
      return await readFile(path);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new ProjectFilesError("PROJECT_FILE_NOT_FOUND", "Project file path was not found");
      }

      throw new ProjectFilesError("PROJECT_FS_ERROR", "Unable to read project file");
    }
  }
}

const compareEntries = (left: ProjectFileEntry, right: ProjectFileEntry) => {
  if (left.type !== right.type) {
    return left.type === "directory" ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
};

const parentProjectPath = (relativePath: string) => {
  if (relativePath.length === 0) {
    return null;
  }

  const parent = dirname(relativePath);
  return parent === "." ? "" : parent;
};

const imageMediaType = (path: string): ProjectFilePreviewMediaType | undefined => {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return undefined;
  }
};

/**
 * 二进制扩展名黑名单（预览/编辑初筛）。判定方向 = 黑名单外皆按文本尝试（2026-10-01
 * 用户反馈 .mjs 等源码不能查看——文本白名单永远追不全源码/配置扩展名，反转后新扩展名
 * 天然支持）。黑名单只做初筛，真二进制另有内容级双闸兜底：UTF-8 strict 解码失败
 *（decodeText → undefined）或含控制字符（containsBinaryControlCharacters）都会落
 * unsupported，黑名单漏网文件不会以乱码漏出。无扩展名文件（Dockerfile/Makefile/LICENSE）
 * 不命中黑名单，天然放行；图片先由 imageMediaType 分流，不进本判定。
 */
const binaryExtensions = new Set([
  // 图片（svg 走 imageMediaType 先行分流，不在本列）
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
  // 音视频
  ".aac",
  ".avi",
  ".flac",
  ".m4a",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".wav",
  ".webm",
  // 归档/压缩
  ".7z",
  ".bz2",
  ".gz",
  ".rar",
  ".tar",
  ".tgz",
  ".xz",
  ".zst",
  ".zip",
  // 字体
  ".eot",
  ".otf",
  ".ttf",
  ".woff",
  ".woff2",
  // 文档（二进制格式）
  ".doc",
  ".docx",
  ".pdf",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  // 编译产物/二进制可执行
  ".a",
  ".class",
  ".dll",
  ".dylib",
  ".exe",
  ".jar",
  ".node",
  ".o",
  ".pyc",
  ".so",
  ".wasm",
  // 数据库/缓存/锁（bun.lockb 为二进制格式）
  ".db",
  ".ds_store",
  ".lockb",
  ".sqlite",
  ".sqlite3",
]);

const isSupportedTextPath = (path: string) => !binaryExtensions.has(extname(path).toLowerCase());

const decodeText = (content: Buffer) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return undefined;
  }
};

// 有意匹配控制字符（检测二进制预览内容，非输入校验）——no-control-regex 是该函数的职责本身。
const containsBinaryControlCharacters = (text: string) =>
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);

const unsupportedPreview = (
  projectName: string,
  path: string,
  name: string,
  size: number,
  reason: ProjectUnsupportedFilePreviewReason,
): ProjectFilePreviewResponse => ({
  type: "unsupported",
  projectName,
  path,
  name,
  size,
  reason,
});

const tooLargePreview = (
  projectName: string,
  path: string,
  name: string,
  size: number,
  limitBytes: number,
): ProjectFilePreviewResponse => ({
  type: "too_large",
  projectName,
  path,
  name,
  size,
  limitBytes,
});

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const isAlreadyExistsError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";

export const rawFileMimeType = (path: string): string => {
  switch (extname(path).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".txt":
    case ".md":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
};
