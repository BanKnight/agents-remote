import type {
  ApiErrorCode,
  GenUiFileResponse,
  GenUiSessionState,
  GenUiWidgetState,
} from "@agents-remote/shared";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { isInsideOrSelf, ProjectPathError, resolveProjectPath } from "./project-paths";
import { readProjectMcpConfig } from "./mcp-config";

// Gen UI（生成式界面）：agent 经 visualize 型 skill 生成单文件 HTML 到项目
// `.agents-remote/gen-ui/`，assistant 文本以 `::gen-ui{...}` 标记引用；web 宿主卡片
// 经本文件供给的端点加载 HTML（沙箱 iframe）并注入迷你桥（window.zcode），桥把用户
// 交互状态（widgetState）写回 `.agents-remote/gen-ui/state/{sessionId}.json`；发送
// prompt 前把各活页 modelContent 组装进 `<gen-ui-context>` 块回流给模型。契约与安全
// 防线照抄 ZCode Gen UI（docs/research/mcp-apps-hosting.md §11/§12.4）：
// HTML ≤1MB、路径必须落在 gen-ui 目录内（禁穿越/symlink 逃逸）、state 双槽合计
// ≤16KiB、回流只有 modelContent（privateContent 不进上下文）。

/** 生成页输出目录（相对项目根）。项目级共享，不带 sessionId（agent 不知道自己的
 *  sessionId，env 注入需 Bash 展开；覆盖风险由 skill 命名规范 `<slug>-<rand4>.html`
 *  解决，会话隔离由 state 的 sessionId key 保证——立项决策，计划文件决策 2）。 */
export const GEN_UI_DIR = ".agents-remote/gen-ui";

const GEN_UI_STATE_DIR = "state";
const GEN_UI_STATE_SCHEMA_VERSION = 1;

/** 单个生成页 HTML 大小上限（ZCode 同款防线）。 */
export const GEN_UI_MAX_HTML_BYTES = 1_000_000;
/** 会话 widgetState 双槽合计上限（ZCode 16KiB 同款）。 */
export const GEN_UI_MAX_STATE_BYTES = 16 * 1024;
/** 单会话活页数上限（防 state 数组无界增长）。 */
export const GEN_UI_MAX_WIDGETS = 32;
/** title 单值上限（回流块里逐字注入，防单值撑爆 state）。 */
const GEN_UI_MAX_TITLE_CHARS = 200;
/** modelContent / privateContent 单槽上限（合计闸之外的防单值爆炸）。 */
const GEN_UI_MAX_SLOT_CHARS = 12_000;
/** sessionId 文件名形态校验（agent_xxx；防路径注入——sessionId 直接进文件名）。 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type ProjectGenUiErrorCode = Extract<
  ApiErrorCode,
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_FS_ERROR"
  | "PROJECT_FILE_NOT_FOUND"
  | "PROJECT_GEN_UI_INVALID"
>;

export class ProjectGenUiError extends Error {
  constructor(
    readonly code: ProjectGenUiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectGenUiError";
  }
}

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const isPathError = (error: unknown): error is ProjectPathError =>
  error instanceof ProjectPathError;

// ── 纯函数：state 校验/规范化 + 回流块组装 ─────────────────────────────

/** 静态路径守卫：项目根相对路径必须落在 gen-ui 目录内（纯字符串级，不做 fs——
 *  state 写入时目标文件可能尚未生成）。realpath 终检由读取端点负责。 */
export const isGenUiRelativePath = (projectRelativePath: string): boolean => {
  if (
    projectRelativePath.length === 0 ||
    projectRelativePath.includes("\0") ||
    isAbsolute(projectRelativePath)
  ) {
    return false;
  }
  const genUiRoot = resolve("/", GEN_UI_DIR);
  const target = resolve("/", projectRelativePath);
  // 等于 gen-ui 根本身（目录路径，无文件名）不算合法生成页路径。
  if (target === genUiRoot) return false;
  return isInsideOrSelf(genUiRoot, target);
};

/** 项目根相对路径 → gen-ui 相对路径（`<relative-to-project>` 去 `.agents-remote/gen-ui/` 前缀）。
 *  不是 gen-ui 内路径 → undefined。标记/桥两侧统一用项目根相对路径表达。 */
export const genUiRelativePath = (projectRelativePath: string): string | undefined => {
  if (!isGenUiRelativePath(projectRelativePath)) return undefined;
  const prefix = `${GEN_UI_DIR}/`;
  return projectRelativePath.startsWith(prefix)
    ? projectRelativePath.slice(prefix.length)
    : undefined;
};

const normalizeWidget = (input: unknown): GenUiWidgetState => {
  if (!input || typeof input !== "object") {
    throw new ProjectGenUiError("PROJECT_GEN_UI_INVALID", "Widget state must be an object");
  }
  const { path, title, modelContent, privateContent, updatedAt } = input as Record<string, unknown>;
  if (typeof path !== "string" || !isGenUiRelativePath(path)) {
    throw new ProjectGenUiError(
      "PROJECT_GEN_UI_INVALID",
      "Widget path must be a relative path inside .agents-remote/gen-ui/",
    );
  }
  if (title !== undefined && (typeof title !== "string" || title.length > GEN_UI_MAX_TITLE_CHARS)) {
    throw new ProjectGenUiError("PROJECT_GEN_UI_INVALID", "Widget title is too long");
  }
  for (const slot of [modelContent, privateContent]) {
    if (slot !== undefined && (typeof slot !== "string" || slot.length > GEN_UI_MAX_SLOT_CHARS)) {
      throw new ProjectGenUiError("PROJECT_GEN_UI_INVALID", "Widget state slot is too large");
    }
  }
  return {
    path,
    ...(title !== undefined && title.length > 0 ? { title } : {}),
    ...(typeof modelContent === "string" && modelContent.length > 0 ? { modelContent } : {}),
    ...(typeof privateContent === "string" && privateContent.length > 0 ? { privateContent } : {}),
    updatedAt: typeof updatedAt === "string" ? updatedAt : new Date().toISOString(),
  };
};

/** 校验并规范化会话 state（PUT 整体覆盖写语义）。同 path 后者覆盖前者。 */
export const normalizeSessionState = (parsed: unknown): GenUiSessionState => {
  if (!parsed || typeof parsed !== "object") {
    throw new ProjectGenUiError("PROJECT_GEN_UI_INVALID", "Gen UI state must be an object");
  }
  const { schemaVersion, widgets } = parsed as Record<string, unknown>;
  if (schemaVersion !== GEN_UI_STATE_SCHEMA_VERSION) {
    throw new ProjectGenUiError("PROJECT_GEN_UI_INVALID", "Unsupported gen-ui state version");
  }
  if (!Array.isArray(widgets)) {
    throw new ProjectGenUiError("PROJECT_GEN_UI_INVALID", "Gen UI state widgets must be an array");
  }
  if (widgets.length > GEN_UI_MAX_WIDGETS) {
    throw new ProjectGenUiError("PROJECT_GEN_UI_INVALID", "Too many widgets");
  }
  const byPath = new Map<string, GenUiWidgetState>();
  for (const raw of widgets) {
    const widget = normalizeWidget(raw);
    byPath.set(widget.path, widget);
  }
  return {
    schemaVersion: GEN_UI_STATE_SCHEMA_VERSION,
    widgets: [...byPath.values()],
  };
};

/**
 * 组装回流块（claude-stream 发送 prompt 前消费）：只取 modelContent 非空的活页。
 * 空态返回 undefined（调用方不附加任何内容）。
 */
export const buildGenUiContextBlock = (state: GenUiSessionState): string | undefined => {
  const widgets = state.widgets.filter(
    (widget) => typeof widget.modelContent === "string" && widget.modelContent.length > 0,
  );
  if (widgets.length === 0) return undefined;
  const parts = widgets.map((widget) => {
    const attrs = `path=${JSON.stringify(widget.path)}${
      widget.title ? ` title=${JSON.stringify(widget.title)}` : ""
    }`;
    return `[gen-ui-widget ${attrs}]\n${widget.modelContent}\n[/gen-ui-widget]`;
  });
  return `<gen-ui-context>\n以下状态快照来自用户在本会话中交互的生成式界面组件（HTML 小部件），记录其当前状态。当用户消息引用界面操作（如"拖到了 42"、"选中了节点 A"）时，以这些状态为准。\n${parts.join(
    "\n",
  )}\n</gen-ui-context>`;
};

// ── service：文件读取 + state 读写 ────────────────────────────────────

export class ProjectGenUiService {
  /** state 写入串行化（persistQueue 式）：同 key 请求链式排队，防 temp→rename 竞态。 */
  private readonly writeQueues = new Map<string, Promise<unknown>>();

  constructor(private readonly projectsRoot: string) {}

  /** 读取生成页 HTML（供给端点）。门控：project 存在 + capabilities.gen-ui 开启。 */
  async readGenUiFile(projectName: string, relPath: string): Promise<GenUiFileResponse> {
    await this.ensureCapabilityEnabled(projectName);
    const target = await this.resolveGenUiPath(projectName, relPath);

    const fileStat = target.stat;
    if (!fileStat.isFile()) {
      throw new ProjectGenUiError("PROJECT_FILE_NOT_FOUND", "Gen UI path is not a file");
    }
    if (fileStat.size > GEN_UI_MAX_HTML_BYTES) {
      throw new ProjectGenUiError(
        "PROJECT_GEN_UI_INVALID",
        `Gen UI file exceeds ${GEN_UI_MAX_HTML_BYTES} bytes`,
      );
    }

    let html: string;
    try {
      html = await readFile(target.path, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new ProjectGenUiError("PROJECT_FILE_NOT_FOUND", "Gen UI file was not found");
      }
      throw new ProjectGenUiError("PROJECT_FS_ERROR", "Unable to read gen-ui file");
    }
    return { mimeType: "text/html", html };
  }

  /** 读会话 widgetState。缺文件 → 空态；非法 JSON/结构 → GEN_UI_INVALID。 */
  async readGenUiState(projectName: string, sessionId: string): Promise<GenUiSessionState> {
    await this.ensureCapabilityEnabled(projectName);
    validateSessionId(sessionId);

    let raw: string;
    try {
      raw = await readFile(this.statePath(projectName, sessionId), "utf8");
    } catch (error) {
      if (error instanceof ProjectGenUiError) throw error;
      if (isNotFoundError(error)) {
        return { schemaVersion: GEN_UI_STATE_SCHEMA_VERSION, widgets: [] };
      }
      throw new ProjectGenUiError("PROJECT_FS_ERROR", "Unable to read gen-ui state");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ProjectGenUiError("PROJECT_GEN_UI_INVALID", "Gen UI state is not valid JSON");
    }
    return normalizeSessionState(parsed);
  }

  /** 覆盖写会话 widgetState（整体 PUT 语义）。序列化 ≤16KiB 硬闸 + 串行原子写。 */
  async saveGenUiState(
    projectName: string,
    sessionId: string,
    state: unknown,
  ): Promise<GenUiSessionState> {
    await this.ensureCapabilityEnabled(projectName);
    validateSessionId(sessionId);
    const normalized = normalizeSessionState(state);

    const payload = `${JSON.stringify(normalized)}\n`;
    const payloadBytes = Buffer.byteLength(payload, "utf8");
    if (payloadBytes > GEN_UI_MAX_STATE_BYTES) {
      throw new ProjectGenUiError(
        "PROJECT_GEN_UI_INVALID",
        `Gen UI state exceeds ${GEN_UI_MAX_STATE_BYTES} bytes`,
      );
    }

    const key = `${projectName}/${sessionId}`;
    const write = async () => {
      await this.resolveProject(projectName);
      const statePath = this.statePath(projectName, sessionId);
      const tempPath = `${statePath}.${process.pid}.tmp`;
      await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
      await writeFile(tempPath, payload, { mode: 0o600 });
      await chmod(tempPath, 0o600);
      await rename(tempPath, statePath);
    };
    const next = (this.writeQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(write);
    this.writeQueues.set(key, next);
    try {
      await next;
    } finally {
      if (this.writeQueues.get(key) === next) this.writeQueues.delete(key);
    }
    return normalized;
  }

  /**
   * 解析 gen-ui 相对路径 → 项目内绝对路径。双校验：字符串级 resolve 不出 gen-ui 根 +
   * realpath 终检（symlink 指向 gen-ui 外 → PATH_OUTSIDE_ROOT；目标不存在 → NOT_FOUND）。
   * 返回 stat 供调用方判定文件/目录与大小。
   */
  private async resolveGenUiPath(projectName: string, relPath: string) {
    const genUiRel = genUiRelativePath(relPath);
    if (!genUiRel) {
      throw new ProjectGenUiError(
        "PROJECT_PATH_OUTSIDE_ROOT",
        "Gen UI path must stay inside .agents-remote/gen-ui/",
      );
    }
    const project = await this.resolveProject(projectName);
    const genUiRoot = join(project.path, GEN_UI_DIR);
    const targetPath = resolve(genUiRoot, genUiRel);

    try {
      const [realRoot, realTarget] = await Promise.all([realpath(genUiRoot), realpath(targetPath)]);
      if (!isInsideOrSelf(realRoot, realTarget)) {
        throw new ProjectGenUiError(
          "PROJECT_PATH_OUTSIDE_ROOT",
          "Gen UI path must stay inside .agents-remote/gen-ui/",
        );
      }
      const fileStat = await stat(realTarget);
      return { path: realTarget, stat: fileStat };
    } catch (error) {
      if (error instanceof ProjectGenUiError) throw error;
      if (isNotFoundError(error)) {
        throw new ProjectGenUiError("PROJECT_FILE_NOT_FOUND", "Gen UI file was not found");
      }
      throw new ProjectGenUiError("PROJECT_FS_ERROR", "Unable to resolve gen-ui path");
    }
  }

  /** 门控：project 存在 + mcp.json capabilities.gen-ui === true，否则一律 NOT_FOUND
   *  （不暴露具体原因，与 mcp-ui-resource 路由同原则——功能关 = 整体不可见）。 */
  private async ensureCapabilityEnabled(projectName: string) {
    let enabled = false;
    try {
      const config = await readProjectMcpConfig(this.projectsRoot, projectName);
      enabled = config?.capabilities?.["gen-ui"] === true;
    } catch {
      // project 不存在 / 路径越界 / mcp.json 非法 → 统一 NOT_FOUND。
      throw new ProjectGenUiError("PROJECT_NOT_FOUND", "Project not found");
    }
    if (!enabled) {
      throw new ProjectGenUiError("PROJECT_FILE_NOT_FOUND", "Gen UI capability is disabled");
    }
  }

  private async resolveProject(projectName: string) {
    try {
      return await resolveProjectPath(this.projectsRoot, projectName);
    } catch (error) {
      if (isPathError(error)) {
        throw new ProjectGenUiError(error.code, error.message);
      }
      throw error;
    }
  }

  private statePath(projectName: string, sessionId: string) {
    // resolveProject 在调用链上游已把 projectName 校验成一级目录名；sessionId 有
    // SESSION_ID_PATTERN 守卫——两段都不可携带路径语义，这里 join 是安全的。
    return join(this.projectsRoot, projectName, GEN_UI_DIR, GEN_UI_STATE_DIR, `${sessionId}.json`);
  }
}

const validateSessionId = (sessionId: string) => {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new ProjectGenUiError("PROJECT_GEN_UI_INVALID", "Invalid session id");
  }
};
