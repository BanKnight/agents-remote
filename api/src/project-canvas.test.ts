import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CANVAS_MAX_ELEMENTS,
  CANVAS_MAX_OPERATION_IDS,
  normalizeCanvasElements,
  normalizeCanvasOperations,
  normalizeCanvasTitle,
  ProjectCanvasError,
  ProjectCanvasService,
} from "./project-canvas";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-canvas-"));
  await mkdir(join(root, "demo"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const service = () => new ProjectCanvasService(root);

const createElement = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  ...extra,
});

const createDoc = async (elements: unknown[] = [createElement("e1")]) => {
  const scene = await service().createDiagram("demo", {
    title: "Demo canvas",
    elements,
  });
  return scene;
};

// ── 纯函数:输入校验 ─────────────────────────────────────────────────

test("normalizeCanvasTitle accepts normal titles and rejects empty/oversized", () => {
  expect(normalizeCanvasTitle("架构图")).toBe("架构图");
  expect(() => normalizeCanvasTitle("   ")).toThrow(ProjectCanvasError);
  expect(() => normalizeCanvasTitle("a".repeat(201))).toThrow(ProjectCanvasError);
});

test("normalizeCanvasElements validates id uniqueness, shape and size gates", () => {
  expect(normalizeCanvasElements([createElement("a"), createElement("b")]).length).toBe(2);
  // 非数组 / 非对象元素 / 缺 id / 空 id / id 过长 / 重复 id
  expect(() => normalizeCanvasElements("nope")).toThrow(ProjectCanvasError);
  expect(() => normalizeCanvasElements([null])).toThrow(ProjectCanvasError);
  expect(() => normalizeCanvasElements([{ type: "rectangle" }])).toThrow(ProjectCanvasError);
  expect(() => normalizeCanvasElements([{ id: "" }])).toThrow(ProjectCanvasError);
  expect(() => normalizeCanvasElements([{ id: "x".repeat(129) }])).toThrow(ProjectCanvasError);
  expect(() => normalizeCanvasElements([createElement("a"), createElement("a")])).toThrow(
    ProjectCanvasError,
  );
  // 单元素 >16KiB 拒
  expect(() =>
    normalizeCanvasElements([createElement("big", { data: "x".repeat(17 * 1024) })]),
  ).toThrow(ProjectCanvasError);
});

test("normalizeCanvasElements rejects arrays over the element cap", () => {
  const many = Array.from({ length: CANVAS_MAX_ELEMENTS + 1 }, (_, i) => createElement(`e${i}`));
  expect(() => normalizeCanvasElements(many)).toThrow(ProjectCanvasError);
});

test("normalizeCanvasOperations validates op shapes", () => {
  expect(normalizeCanvasOperations([{ op: "add", element: createElement("a") }]).length).toBe(1);
  expect(normalizeCanvasOperations([{ op: "update", elementId: "a", patch: { x: 5 } }])[0]).toEqual(
    { op: "update", elementId: "a", patch: { x: 5 } },
  );
  expect(normalizeCanvasOperations([{ op: "remove", elementId: "a" }]).length).toBe(1);
  // 空/非数组、id 改写 patch、非法 op、缺 elementId
  expect(() => normalizeCanvasOperations([])).toThrow(ProjectCanvasError);
  expect(() =>
    normalizeCanvasOperations([{ op: "update", elementId: "a", patch: { id: "b" } }]),
  ).toThrow(ProjectCanvasError);
  expect(() => normalizeCanvasOperations([{ op: "noop", elementId: "a" }])).toThrow(
    ProjectCanvasError,
  );
  expect(() => normalizeCanvasOperations([{ op: "remove" }])).toThrow(ProjectCanvasError);
});

// ── createDiagram / readScene ───────────────────────────────────────

test("createDiagram creates revision 1 doc and readScene returns it", async () => {
  const created = await createDoc();
  expect(created.revision).toBe(1);
  expect(created.id).toMatch(/^canvas-[0-9a-f]{8}$/);
  expect(created.title).toBe("Demo canvas");

  const scene = await service().readScene("demo", created.id);
  expect(scene.revision).toBe(1);
  expect(scene.elements.map((el) => el.id)).toEqual(["e1"]);

  // 落盘结构:目录 + 单文件 JSON。
  const raw = await readFile(
    join(root, "demo", ".agents-remote", "canvas", `${created.id}.json`),
    "utf8",
  );
  expect(JSON.parse(raw).schemaVersion).toBe(1);
});

test("readScene filters by elementIds and ignores missing ids", async () => {
  const created = await createDoc([createElement("e1"), createElement("e2"), createElement("e3")]);
  const scene = await service().readScene("demo", created.id, ["e1", "e3", "missing"]);
  expect(scene.elements.map((el) => el.id)).toEqual(["e1", "e3"]);
});

test("readScene rejects malformed docId without touching the filesystem", async () => {
  expect(service().readScene("demo", "../escape")).rejects.toThrow(ProjectCanvasError);
  expect(service().readScene("demo", "canvas-zzzzzzzz")).rejects.toThrow(ProjectCanvasError);
});

// ── revision / 幂等 / 冲突 ──────────────────────────────────────────

test("applyOperations bumps revision and returns the full scene", async () => {
  const created = await createDoc();
  const scene = await service().applyOperations("demo", created.id, {
    operations: [
      { op: "update", elementId: "e1", patch: { x: 42 } },
      { op: "add", element: createElement("e2") },
    ],
    expectedRevision: 1,
  });
  expect(scene.revision).toBe(2);
  expect(scene.elements.find((el) => el.id === "e1")?.x).toBe(42);
  expect(scene.elements.find((el) => el.id === "e2")).toBeDefined();

  // remove 之后元素消失。
  const afterRemove = await service().applyOperations("demo", created.id, {
    operations: [{ op: "remove", elementId: "e2" }],
    expectedRevision: 2,
  });
  expect(afterRemove.revision).toBe(3);
  expect(afterRemove.elements.map((el) => el.id)).toEqual(["e1"]);
});

test("applyOperations conflicts on stale expectedRevision and leaves the doc untouched", async () => {
  const created = await createDoc();
  const conflict = service().applyOperations("demo", created.id, {
    operations: [{ op: "update", elementId: "e1", patch: { x: 1 } }],
    expectedRevision: 99,
  });
  expect(conflict).rejects.toThrow("Revision conflict");
  expect(conflict).rejects.toThrow(ProjectCanvasError);
  const scene = await service().readScene("demo", created.id);
  expect(scene.revision).toBe(1);
  expect(scene.elements[0].x).toBe(0);
});

test("applyOperations rejects update/remove on missing elements and duplicate adds", async () => {
  const created = await createDoc();
  const s = service();
  expect(
    s.applyOperations("demo", created.id, {
      operations: [{ op: "update", elementId: "ghost", patch: { x: 1 } }],
      expectedRevision: 1,
    }),
  ).rejects.toThrow("not found");
  expect(
    s.applyOperations("demo", created.id, {
      operations: [{ op: "remove", elementId: "ghost" }],
      expectedRevision: 1,
    }),
  ).rejects.toThrow("not found");
  expect(
    s.applyOperations("demo", created.id, {
      operations: [{ op: "add", element: createElement("e1") }],
      expectedRevision: 1,
    }),
  ).rejects.toThrow("already exists");
  // 文档未被破坏(revision 仍 1)。
  expect((await service().readScene("demo", created.id)).revision).toBe(1);
});

test("operationId replays are idempotent and return the original revision", async () => {
  const created = await createDoc();
  const s = service();
  const first = await s.applyOperations("demo", created.id, {
    operations: [{ op: "update", elementId: "e1", patch: { x: 7 } }],
    expectedRevision: 1,
    operationId: "op-1",
  });
  expect(first.revision).toBe(2);

  // 网络层重试:同 operationId + 同入参 → duplicate,元素不再变。
  const replay = await s.applyOperations("demo", created.id, {
    operations: [{ op: "update", elementId: "e1", patch: { x: 7 } }],
    expectedRevision: 1,
    operationId: "op-1",
  });
  expect(replay.revision).toBe(2);
  expect(replay.duplicate).toBe(true);

  // 落盘的 operations 表有记录。
  const raw = JSON.parse(
    await readFile(join(root, "demo", ".agents-remote", "canvas", `${created.id}.json`), "utf8"),
  );
  expect(raw.operations["op-1"].revision).toBe(2);
});

test("commitScene replaces the element snapshot with conflict + idempotency semantics", async () => {
  const created = await createDoc();
  const s = service();
  const committed = await s.commitScene("demo", created.id, {
    elements: [createElement("e1"), createElement("user-drawn")],
    expectedRevision: 1,
    operationId: "commit-a",
  });
  expect(committed.revision).toBe(2);
  expect(committed.elements.map((el) => el.id)).toEqual(["e1", "user-drawn"]);

  // 过期 revision 提交 → 冲突。
  await expect(
    s.commitScene("demo", created.id, {
      elements: [createElement("stale")],
      expectedRevision: 1,
      operationId: "commit-b",
    }),
  ).rejects.toThrow("Revision conflict");

  // 同 operationId 重放 → 原结果(元素回到 commit-a 的快照)。
  const replay = await s.commitScene("demo", created.id, {
    elements: [createElement("e1"), createElement("user-drawn")],
    expectedRevision: 1,
    operationId: "commit-a",
  });
  expect(replay.revision).toBe(2);
  expect(replay.duplicate).toBe(true);
});

test("operation table evicts oldest entries beyond the cap", async () => {
  const created = await createDoc();
  const s = service();
  let revision = 1;
  for (let i = 0; i < CANVAS_MAX_OPERATION_IDS + 2; i++) {
    await s.applyOperations("demo", created.id, {
      operations: [{ op: "update", elementId: "e1", patch: { x: i } }],
      expectedRevision: revision,
      operationId: `op-${i}`,
    });
    revision += 1;
  }
  const raw = JSON.parse(
    await readFile(join(root, "demo", ".agents-remote", "canvas", `${created.id}.json`), "utf8"),
  );
  const ids = Object.keys(raw.operations);
  expect(ids.length).toBe(CANVAS_MAX_OPERATION_IDS);
  expect(ids).not.toContain("op-0");
  expect(ids).toContain(`op-${CANVAS_MAX_OPERATION_IDS + 1}`);
});

// ── exportDiagram ───────────────────────────────────────────────────

test("exportDiagram returns native excalidraw JSON and verifies optional revision", async () => {
  const created = await createDoc();
  const exported = await service().exportDiagram("demo", created.id, {});
  const parsed = JSON.parse(exported.content);
  expect(parsed.type).toBe("excalidraw");
  expect(parsed.version).toBe(2);
  expect(parsed.elements.map((el: { id: string }) => el.id)).toEqual(["e1"]);

  await expect(
    service().exportDiagram("demo", created.id, { expectedRevision: 99 }),
  ).rejects.toThrow("Revision conflict");
});

// ── 容量与错误翻译 ──────────────────────────────────────────────────

test("docs near the byte cap are rejected at write time", async () => {
  // CANVAS_MAX_BYTES(6MiB) 全局闸:每元素 <16KiB(过单元素闸)、总数 ≤5000(过计数闸),
  // 合计超 6MiB(5000 × ~1.3KiB)。文档已存在 → apply 触达写路径被拒。
  const created = await createDoc();
  const fat = Array.from({ length: CANVAS_MAX_ELEMENTS - 1 }, (_, i) =>
    createElement(`fat-${i}`, { data: "x".repeat(1200) }),
  );
  await expect(
    service().applyOperations("demo", created.id, {
      operations: fat.map((element) => ({ op: "add", element })),
      expectedRevision: 1,
    }),
  ).rejects.toThrow("exceeds");

  // 写失败后文档未被破坏(revision 仍 1、元素仍只有 e1)。
  const scene = await service().readScene("demo", created.id);
  expect(scene.revision).toBe(1);
  expect(scene.elements.map((el) => el.id)).toEqual(["e1"]);
});

test("service maps path errors to project error codes", async () => {
  await expect(
    service().createDiagram("no-such-project", { title: "t", elements: [] }),
  ).rejects.toThrow(ProjectCanvasError);
});
