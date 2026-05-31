import type { Dirent } from "node:fs";
import type {
  ApiErrorCode,
  ProjectFileEntry,
  ProjectFileListResponse,
  ProjectFilePreviewMediaType,
  ProjectFilePreviewResponse,
  ProjectUnsupportedFilePreviewReason,
} from "@agents-remote/shared";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { ProjectPathError, resolveProjectRelativePath } from "./project-paths";

export const TEXT_PREVIEW_LIMIT_BYTES = 256 * 1024;
export const IMAGE_PREVIEW_LIMIT_BYTES = 5 * 1024 * 1024;

export type RawFileResult = {
  content: Buffer;
  mimeType: string;
};

type ProjectFilesErrorCode = Extract<
  ApiErrorCode,
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_FILE_NOT_FOUND"
  | "PROJECT_FILE_NOT_DIRECTORY"
  | "PROJECT_FILE_NOT_FILE"
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
