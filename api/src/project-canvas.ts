import type {
  ApiErrorCode,
  CanvasDoc,
  CanvasElement,
  CanvasExportResponse,
  CanvasOperation,
  CanvasSceneResponse,
} from "@agents-remote/shared";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ProjectPathError, resolveProjectPath } from "./project-paths";

// 画布文档存储（Excalidraw ⭄对话循环，docs/research/mcp-apps-hosting.md §12.2 契约）：
// agent 经 ar-hub 四工具（create_diagram / read_scene / apply_operations / export_diagram）
// 与 web 卡片（commit_scene，M2.2）读写 per-project `.agents-remote/canvas/{docId}.json`。
// 并发语义：expectedRevision 乐观锁（冲突显式报错，调用方重读后重试）+ operationId
// 幂等表（同 id 重放复用首次结果）。容量闸照抄 ZCode：每文档 ≤5000 元素 / ≤6MiB。

/** 画布文档目录（相对项目根）。 */
export const CANVAS_DIR = ".agents-remote/canvas";

const CANVAS_SCHEMA_VERSION = 1;
/** 每文档元素上限（ZCode 同款）。 */
export const CANVAS_MAX_ELEMENTS = 5000;
/** 每文档序列化上限（ZCode 6MiB 同款）。 */
export const CANVAS_MAX_BYTES = 6 * 1024 * 1024;
/** title 上限（展示值，防单值撑爆文档）。 */
const CANVAS_MAX_TITLE_CHARS = 200;
/** 单元素序列化上限（防单值爆炸；全局闸之外的第一道）。 */
const CANVAS_MAX_ELEMENT_BYTES = 16 * 1024;
/** 元素 id 上限。 */
const CANVAS_MAX_ELEMENT_ID_CHARS = 128;
/** operationId 幂等表上限（超限 FIFO 淘汰最旧，防文档无界增长）。 */
export const CANVAS_MAX_OPERATION_IDS = 128;
/** docId 形态（服务生成 `canvas-` + 8 hex；入参按此校验防路径注入）。 */
const DOC_ID_PATTERN = /^canvas-[0-9a-f]{8}$/;

export type ProjectCanvasErrorCode = Extract<
  ApiErrorCode,
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_FS_ERROR"
  | "PROJECT_FILE_NOT_FOUND"
  | "PROJECT_CANVAS_INVALID"
  | "PROJECT_CANVAS_REVISION_CONFLICT"
>;

export class ProjectCanvasError extends Error {
  constructor(
    readonly code: ProjectCanvasErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectCanvasError";
  }
}

const isPathError = (error: unknown): error is ProjectPathError =>
  error instanceof ProjectPathError;

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

// ── 纯函数：输入校验/规范化 ───────────────────────────────────────────

const invalid = (message: string) => new ProjectCanvasError("PROJECT_CANVAS_INVALID", message);

export const normalizeCanvasTitle = (title: unknown): string => {
  if (
    typeof title !== "string" ||
    title.trim().length === 0 ||
    title.length > CANVAS_MAX_TITLE_CHARS
  ) {
    throw invalid("Canvas title must be a non-empty string of at most 200 chars");
  }
  return title;
};

/** 校验元素数组：对象 + 非空 id（≤128）+ id 唯一 + 单元素 ≤16KiB + 总数 ≤5000。
 *  元素其余字段不深校验（excalidraw 形状归前端渲染层，api 视作不透明 JSON）。 */
export const normalizeCanvasElements = (elements: unknown): CanvasElement[] => {
  if (!Array.isArray(elements)) {
    throw invalid("Canvas elements must be an array");
  }
  if (elements.length > CANVAS_MAX_ELEMENTS) {
    throw invalid(`Canvas doc exceeds ${CANVAS_MAX_ELEMENTS} elements`);
  }
  const seen = new Set<string>();
  const normalized: CanvasElement[] = [];
  for (const raw of elements) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw invalid("Canvas element must be an object");
    }
    const { id } = raw as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      id.length > CANVAS_MAX_ELEMENT_ID_CHARS ||
      seen.has(id)
    ) {
      throw invalid("Canvas element id must be a unique non-empty string");
    }
    seen.add(id);
    if (Buffer.byteLength(JSON.stringify(raw), "utf8") > CANVAS_MAX_ELEMENT_BYTES) {
      throw invalid(`Canvas element exceeds ${CANVAS_MAX_ELEMENT_BYTES} bytes`);
    }
    normalized.push(raw as CanvasElement);
  }
  return normalized;
};

/** 校验操作数组（apply_operations 入参）。 */
export const normalizeCanvasOperations = (operations: unknown): CanvasOperation[] => {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw invalid("Canvas operations must be a non-empty array");
  }
  const normalized: CanvasOperation[] = [];
  for (const raw of operations) {
    if (!raw || typeof raw !== "object") {
      throw invalid("Canvas operation must be an object");
    }
    const op = raw as Record<string, unknown>;
    if (op.op === "add") {
      const [element] = normalizeCanvasElements([op.element]);
      normalized.push({ op: "add", element });
    } else if (op.op === "update") {
      if (typeof op.elementId !== "string" || op.elementId.length === 0) {
        throw invalid("Canvas update operation requires elementId");
      }
      if (!op.patch || typeof op.patch !== "object" || Array.isArray(op.patch)) {
        throw invalid("Canvas update operation requires a patch object");
      }
      if ("id" in (op.patch as Record<string, unknown>)) {
        // 元素 id 是稳定锚点（agent 局部修改的唯一寻址方式），禁止经 patch 改写。
        throw invalid("Canvas update patch must not change element id");
      }
      normalized.push({
        op: "update",
        elementId: op.elementId,
        patch: op.patch as Record<string, unknown>,
      });
    } else if (op.op === "remove") {
      if (typeof op.elementId !== "string" || op.elementId.length === 0) {
        throw invalid("Canvas remove operation requires elementId");
      }
      normalized.push({ op: "remove", elementId: op.elementId });
    } else {
      throw invalid("Canvas operation op must be one of add/update/remove");
    }
  }
  return normalized;
};

const normalizeExpectedRevision = (expectedRevision: unknown): number => {
  if (
    typeof expectedRevision !== "number" ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1
  ) {
    throw invalid("expectedRevision must be a positive integer");
  }
  return expectedRevision;
};

const normalizeOperationId = (operationId: unknown): string | undefined => {
  if (operationId === undefined) return undefined;
  if (typeof operationId !== "string" || operationId.length === 0 || operationId.length > 128) {
    throw invalid("operationId must be a string of at most 128 chars");
  }
  return operationId;
};

const assertValidDocId = (docId: string): void => {
  if (!DOC_ID_PATTERN.test(docId)) {
    throw new ProjectCanvasError("PROJECT_FILE_NOT_FOUND", `Canvas doc not found: ${docId}`);
  }
};

/** 单元素浅合并 patch + 尺寸复检（update 专用：结果元素不得超单元素闸）。 */
const applyElementPatch = (
  element: CanvasElement,
  patch: Record<string, unknown>,
): CanvasElement => {
  const merged = { ...element, ...patch } as CanvasElement;
  if (Buffer.byteLength(JSON.stringify(merged), "utf8") > CANVAS_MAX_ELEMENT_BYTES) {
    throw invalid(`Canvas element exceeds ${CANVAS_MAX_ELEMENT_BYTES} bytes`);
  }
  return merged;
};

// ── service ──────────────────────────────────────────────────────────

export class ProjectCanvasService {
  /** read-modify-write 串行化（同 project/docId 链式排队，防并发丢更新）。 */
  private readonly writeQueues = new Map<string, Promise<unknown>>();

  constructor(private readonly projectsRoot: string) {}

  /** 新建文档：title + elements → revision 1。docId 服务生成（撞名重试一次）。 */
  async createDiagram(
    projectName: string,
    input: { title: unknown; elements: unknown },
  ): Promise<CanvasSceneResponse> {
    const title = normalizeCanvasTitle(input.title);
    const elements = normalizeCanvasElements(input.elements);
    const project = await this.resolveProject(projectName);

    let docId = newDocId();
    if (await this.docExists(project.path, docId)) {
      docId = newDocId();
    }

    const now = new Date().toISOString();
    const doc: CanvasDoc = {
      schemaVersion: CANVAS_SCHEMA_VERSION,
      id: docId,
      title,
      revision: 1,
      updatedAt: now,
      elements,
      operations: {},
    };
    await this.writeDoc(project.path, doc);
    return { id: doc.id, title: doc.title, revision: doc.revision, elements: doc.elements };
  }

  /** 读场景。elementIds 提供时只返回命中元素（缺失 id 静默忽略——选区语义）。 */
  async readScene(
    projectName: string,
    docId: string,
    elementIds?: unknown,
  ): Promise<CanvasSceneResponse> {
    assertValidDocId(docId);
    const doc = await this.readDoc(projectName, docId);
    const filter = parseElementIds(elementIds);
    const elements = filter ? doc.elements.filter((el) => filter.has(el.id)) : doc.elements;
    return { id: doc.id, title: doc.title, revision: doc.revision, elements };
  }

  /**
   * 按元素 id 增改删。expectedRevision 必带（乐观锁）；operationId 可选（幂等表）。
   * 冲突 → REVISION_CONFLICT（元素未动）；幂等重放 → duplicate: true。
   * 返回应用后的全场景（agent 无需再 read_scene）。
   */
  async applyOperations(
    projectName: string,
    docId: string,
    input: {
      operations: unknown;
      expectedRevision: unknown;
      operationId?: unknown;
    },
  ): Promise<CanvasSceneResponse> {
    assertValidDocId(docId);
    const operations = normalizeCanvasOperations(input.operations);
    const expectedRevision = normalizeExpectedRevision(input.expectedRevision);
    const operationId = normalizeOperationId(input.operationId);
    return this.enqueue(projectName, docId, async (projectPath) => {
      const doc = await this.readDocByPath(projectPath, docId);

      const replayed = operationId !== undefined ? doc.operations[operationId] : undefined;
      if (replayed) {
        return {
          id: doc.id,
          title: doc.title,
          revision: replayed.revision,
          elements: doc.elements,
          duplicate: true,
        };
      }

      assertRevision(doc, expectedRevision);
      const byId = new Map(doc.elements.map((el) => [el.id, el]));
      for (const operation of operations) {
        if (operation.op === "add") {
          if (byId.has(operation.element.id)) {
            throw invalid(`Canvas element already exists: ${operation.element.id}`);
          }
          byId.set(operation.element.id, operation.element);
        } else if (operation.op === "update") {
          const element = byId.get(operation.elementId);
          if (!element) {
            throw invalid(`Canvas element not found: ${operation.elementId}`);
          }
          byId.set(operation.elementId, applyElementPatch(element, operation.patch));
        } else {
          if (!byId.delete(operation.elementId)) {
            throw invalid(`Canvas element not found: ${operation.elementId}`);
          }
        }
      }
      if (byId.size > CANVAS_MAX_ELEMENTS) {
        throw invalid(`Canvas doc exceeds ${CANVAS_MAX_ELEMENTS} elements`);
      }

      const next = finalizeDoc(doc, [...byId.values()], operationId);
      await this.writeDoc(projectPath, next);
      return { id: next.id, title: next.title, revision: next.revision, elements: next.elements };
    });
  }

  /**
   * 页面提交编辑草稿（仅 web 卡片链消费，M2.2）：elements 全量快照替换 +
   * expectedRevision 冲突检查 + operationId 幂等，语义与 applyOperations 同管线。
   */
  async commitScene(
    projectName: string,
    docId: string,
    input: {
      elements: unknown;
      expectedRevision: unknown;
      operationId?: unknown;
    },
  ): Promise<CanvasSceneResponse> {
    assertValidDocId(docId);
    const elements = normalizeCanvasElements(input.elements);
    const expectedRevision = normalizeExpectedRevision(input.expectedRevision);
    const operationId = normalizeOperationId(input.operationId);
    return this.enqueue(projectName, docId, async (projectPath) => {
      const doc = await this.readDocByPath(projectPath, docId);

      const replayed = operationId !== undefined ? doc.operations[operationId] : undefined;
      if (replayed) {
        return {
          id: doc.id,
          title: doc.title,
          revision: replayed.revision,
          elements: doc.elements,
          duplicate: true,
        };
      }

      assertRevision(doc, expectedRevision);
      const next = finalizeDoc(doc, elements, operationId);
      await this.writeDoc(projectPath, next);
      return { id: next.id, title: next.title, revision: next.revision, elements: next.elements };
    });
  }

  /** 导出 excalidraw 原生 JSON。expectedRevision 可选（提供则校验）。 */
  async exportDiagram(
    projectName: string,
    docId: string,
    input: { expectedRevision?: unknown } = {},
  ): Promise<CanvasExportResponse> {
    assertValidDocId(docId);
    const doc = await this.readDoc(projectName, docId);
    if (input.expectedRevision !== undefined) {
      assertRevision(doc, normalizeExpectedRevision(input.expectedRevision));
    }
    const content = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "agents-remote",
      elements: doc.elements,
      appState: null,
    });
    return { id: doc.id, title: doc.title, revision: doc.revision, content };
  }

  /** read-modify-write 串行入口：队列内拿 project.path（resolve 一次复用）。 */
  private enqueue<T>(
    projectName: string,
    docId: string,
    task: (projectPath: string) => Promise<T>,
  ): Promise<T> {
    const key = `${projectName}/${docId}`;
    const write = async () => {
      const project = await this.resolveProject(projectName);
      return task(project.path);
    };
    const next = (this.writeQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(write);
    this.writeQueues.set(key, next);
    return next.finally(() => {
      if (this.writeQueues.get(key) === next) this.writeQueues.delete(key);
    });
  }

  // ── 落盘原语（gen-ui state 同款：mkdir 0o700 + temp→rename 0o600）────

  private docPath(projectPath: string, docId: string) {
    // projectPath 经 resolveProject（realpath 校验）、docId 经 DOC_ID_PATTERN——
    // 两段都不可携带路径语义，join 安全。
    return join(projectPath, CANVAS_DIR, `${docId}.json`);
  }

  private async docExists(projectPath: string, docId: string): Promise<boolean> {
    try {
      await readFile(this.docPath(projectPath, docId));
      return true;
    } catch {
      return false;
    }
  }

  private async readDoc(projectName: string, docId: string): Promise<CanvasDoc> {
    const project = await this.resolveProject(projectName);
    return this.readDocByPath(project.path, docId);
  }

  private async readDocByPath(projectPath: string, docId: string): Promise<CanvasDoc> {
    let raw: string;
    try {
      raw = await readFile(this.docPath(projectPath, docId), "utf8");
    } catch (error) {
      if (error instanceof ProjectCanvasError) throw error;
      if (isNotFoundError(error)) {
        throw new ProjectCanvasError("PROJECT_FILE_NOT_FOUND", `Canvas doc not found: ${docId}`);
      }
      throw new ProjectCanvasError("PROJECT_FS_ERROR", "Unable to read canvas doc");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ProjectCanvasError("PROJECT_CANVAS_INVALID", "Canvas doc is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new ProjectCanvasError("PROJECT_CANVAS_INVALID", "Canvas doc must be an object");
    }
    const doc = parsed as Partial<CanvasDoc>;
    if (
      doc.schemaVersion !== CANVAS_SCHEMA_VERSION ||
      typeof doc.id !== "string" ||
      typeof doc.title !== "string" ||
      typeof doc.revision !== "number" ||
      !Array.isArray(doc.elements) ||
      typeof doc.operations !== "object" ||
      doc.operations === null
    ) {
      throw new ProjectCanvasError("PROJECT_CANVAS_INVALID", "Canvas doc has an invalid shape");
    }
    return parsed as CanvasDoc;
  }

  private async writeDoc(projectPath: string, doc: CanvasDoc): Promise<void> {
    const payload = `${JSON.stringify(doc)}\n`;
    const payloadBytes = Buffer.byteLength(payload, "utf8");
    if (payloadBytes > CANVAS_MAX_BYTES) {
      throw new ProjectCanvasError(
        "PROJECT_CANVAS_INVALID",
        `Canvas doc exceeds ${CANVAS_MAX_BYTES} bytes`,
      );
    }
    const targetPath = this.docPath(projectPath, doc.id);
    const tempPath = `${targetPath}.${process.pid}.tmp`;
    try {
      await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
      await writeFile(tempPath, payload, { mode: 0o600 });
      await chmod(tempPath, 0o600);
      await rename(tempPath, targetPath);
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      if (error instanceof ProjectCanvasError) throw error;
      throw new ProjectCanvasError("PROJECT_FS_ERROR", "Unable to write canvas doc");
    }
  }

  private async resolveProject(projectName: string) {
    try {
      return await resolveProjectPath(this.projectsRoot, projectName);
    } catch (error) {
      if (isPathError(error)) {
        throw new ProjectCanvasError(error.code, error.message);
      }
      throw error;
    }
  }
}

// ── 辅助（模块级纯函数，便于单测）────────────────────────────────────

const newDocId = () => `canvas-${randomBytes(4).toString("hex")}`;

const parseElementIds = (elementIds: unknown): Set<string> | undefined => {
  if (elementIds === undefined) return undefined;
  if (!Array.isArray(elementIds)) {
    throw invalid("elementIds must be an array of element ids");
  }
  const ids = new Set<string>();
  for (const id of elementIds) {
    if (typeof id !== "string" || id.length === 0) {
      throw invalid("elementIds must be an array of element ids");
    }
    ids.add(id);
  }
  return ids;
};

const assertRevision = (doc: CanvasDoc, expectedRevision: number): void => {
  if (doc.revision !== expectedRevision) {
    throw new ProjectCanvasError(
      "PROJECT_CANVAS_REVISION_CONFLICT",
      `Revision conflict: doc is at ${doc.revision}, expected ${expectedRevision}`,
    );
  }
};

/** 应用成功后的文档收尾：revision+1 + 记 operationId（FIFO 淘汰超限旧表项）。 */
const finalizeDoc = (
  doc: CanvasDoc,
  elements: CanvasElement[],
  operationId: string | undefined,
): CanvasDoc => {
  const operations: CanvasDoc["operations"] = {};
  const entries = Object.entries(doc.operations);
  const overflow = entries.length + (operationId !== undefined ? 1 : 0) - CANVAS_MAX_OPERATION_IDS;
  for (const [id, record] of entries.slice(Math.max(overflow, 0))) {
    operations[id] = record;
  }
  if (operationId !== undefined) {
    operations[operationId] = { revision: doc.revision + 1, appliedAt: new Date().toISOString() };
  }
  return {
    ...doc,
    revision: doc.revision + 1,
    updatedAt: new Date().toISOString(),
    elements,
    operations,
  };
};
