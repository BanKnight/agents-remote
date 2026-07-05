import type { Dirent } from "node:fs";
import type {
  ApiErrorCode,
  CreateFolderResponse,
  DeleteFileResponse,
  ProjectFileEntry,
  ProjectFileListResponse,
  ProjectFilePreviewMediaType,
  ProjectFilePreviewResponse,
  ProjectUnsupportedFilePreviewReason,
  RenameFileResponse,
  SaveFileResponse,
  UploadFileResponse,
} from "@agents-remote/shared";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { ProjectPathError, resolveProjectRelativePath, resolveProjectsRoot } from "./project-paths";

export const TEXT_PREVIEW_LIMIT_BYTES = 256 * 1024;
export const IMAGE_PREVIEW_LIMIT_BYTES = 5 * 1024 * 1024;

export type RawFileResult = {
  content: Buffer;
  mimeType: string;
};

export const UPLOAD_FILE_LIMIT_BYTES = 50 * 1024 * 1024;

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
   *（根层无所属项目，客户端按 currentPath 第一段切换数据源）。
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

          if (entry.name.startsWith(".")) {
            return [];
          }

          return [this.entryFromDirent(rootPath, rootPath, entry)];
        }),
      );

      return {
        projectName: "",
        path: "",
        parentPath: null,
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

          if (entry.name.startsWith(".")) {
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

  async uploadFile(
    projectName: string,
    directoryPath: string,
    fileName: string,
    content: Buffer,
  ): Promise<UploadFileResponse> {
    const resolved = await this.resolvePath(projectName, directoryPath);
    const dirStat = await this.statPath(resolved.path);

    if (!dirStat.isDirectory()) {
      throw new ProjectFilesError(
        "PROJECT_FILE_NOT_DIRECTORY",
        "Upload target must be a directory",
      );
    }

    if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("\0")) {
      throw new ProjectFilesError("PROJECT_NAME_INVALID", "Invalid file name");
    }

    if (content.length > UPLOAD_FILE_LIMIT_BYTES) {
      throw new ProjectFilesError(
        "PROJECT_FILE_UPLOAD_TOO_LARGE",
        `File exceeds upload size limit of ${UPLOAD_FILE_LIMIT_BYTES / (1024 * 1024)} MiB`,
      );
    }

    const targetPath = join(resolved.path, fileName);

    try {
      const existingStat = await stat(targetPath);

      if (existingStat.isFile()) {
        throw new ProjectFilesError(
          "PROJECT_FILE_TARGET_EXISTS",
          "A file with this name already exists",
        );
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    try {
      await writeFile(targetPath, content);
    } catch {
      throw new ProjectFilesError("PROJECT_FILE_UPLOAD_FAILED", "Unable to write uploaded file");
    }

    const entryStat = await this.statPath(targetPath);

    return {
      entry: {
        name: fileName,
        path: directoryPath.length > 0 ? `${directoryPath}/${fileName}` : fileName,
        type: "file",
        hidden: false,
        size: entryStat.size,
      },
    };
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

  async renameFile(
    projectName: string,
    relativePath: string,
    newName: string,
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

    const parent = dirname(resolved.path);
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
    const newRelativePath = dirname(relativePath);
    const entryPath =
      newRelativePath === "." || newRelativePath.length === 0
        ? newName
        : `${newRelativePath}/${newName}`;

    return {
      entry: {
        name: newName,
        path: entryPath,
        type: entryStat.isDirectory() ? "directory" : "file",
        hidden: newName.startsWith("."),
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
        hidden: name.startsWith("."),
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
      hidden: entry.name.startsWith("."),
      size: entryStat?.size ?? null,
    };
  }

  private async resolvePath(projectName: string, relativePath: string) {
    try {
      return await resolveProjectRelativePath(this.projectsRoot, projectName, relativePath);
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

const textExtensions = new Set([
  "",
  ".c",
  ".conf",
  ".cpp",
  ".css",
  ".csv",
  ".env",
  ".gitignore",
  ".go",
  ".h",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".md",
  ".py",
  ".rs",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const isSupportedTextPath = (path: string) => textExtensions.has(extname(path).toLowerCase());

const decodeText = (content: Buffer) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return undefined;
  }
};

const containsBinaryControlCharacters = (text: string) => /[ --]/.test(text);

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

const rawFileMimeType = (path: string): string => {
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
