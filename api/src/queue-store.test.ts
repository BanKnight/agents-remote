import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  filterExecutedUuids,
  listOrphanQueueSessionIds,
  pruneQueueTmpFiles,
  queueFilePath,
  readSessionQueue,
  removeSessionQueue,
  writeSessionQueue,
} from "./queue-store";

let runDir: string;
const sessionId = "agent_e2e-queue-store-a";

beforeEach(() => {
  runDir = mkdtempSync(join(tmpdir(), "ar-queue-store-"));
});

afterEach(() => {
  rmSync(runDir, { recursive: true, force: true });
});

describe("queue-store roundtrip", () => {
  test("写后读回保序，queued/held 各自保形", () => {
    writeSessionQueue(runDir, sessionId, {
      schemaVersion: 1,
      savedAt: "2026-11-26T00:00:00.000Z",
      queued: [
        { uuid: "u1", content: "first" },
        { uuid: "u2", content: "second" },
      ],
      held: [{ uuid: "h1", content: "held message" }],
    });
    const read = readSessionQueue(runDir, sessionId);
    expect(read?.queued.map((e) => e.uuid)).toEqual(["u1", "u2"]);
    expect(read?.held.map((e) => e.uuid)).toEqual(["h1"]);
    expect(read?.schemaVersion).toBe(1);
    expect(read?.savedAt).toBe("2026-11-26T00:00:00.000Z");
  });

  test("queued/held 双空 → unlink（无残留文件）", () => {
    writeSessionQueue(runDir, sessionId, {
      schemaVersion: 1,
      savedAt: "x",
      queued: [{ uuid: "u1", content: "a" }],
      held: [],
    });
    expect(readSessionQueue(runDir, sessionId)).not.toBeNull();
    writeSessionQueue(runDir, sessionId, {
      schemaVersion: 1,
      savedAt: "x",
      queued: [],
      held: [],
    });
    expect(readSessionQueue(runDir, sessionId)).toBeNull();
  });
});

describe("queue-store 损坏面", () => {
  test("损坏 JSON → null 不抛且文件保留", () => {
    mkdirSync(join(runDir, "queues"), { recursive: true });
    const path = queueFilePath(runDir, sessionId);
    writeFileSync(path, "{not valid json");
    expect(readSessionQueue(runDir, sessionId)).toBeNull();
    // 文件保留（不删——半写损坏拒执行好过误执行）
    expect(existsSync(path)).toBe(true);
  });

  test("schemaVersion 不符 / 缺字段条目 / 重复 uuid → 过滤或拒读", () => {
    mkdirSync(join(runDir, "queues"), { recursive: true });
    const path = queueFilePath(runDir, sessionId);
    // schemaVersion !== 1 → 整体拒读
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 2,
        savedAt: "x",
        queued: [{ uuid: "u1", content: "a" }],
        held: [],
      }),
    );
    expect(readSessionQueue(runDir, sessionId)).toBeNull();
    // 缺 content 的条目被过滤；重复 uuid 首见保留（uuid 即幂等键）
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        savedAt: "x",
        queued: [
          { uuid: "u1", content: "ok" },
          { uuid: "u2" },
          null,
          "junk",
          { uuid: "u1", content: "dup" },
        ],
        held: [],
      }),
    );
    const read = readSessionQueue(runDir, sessionId);
    expect(read?.queued.map((e) => e.uuid)).toEqual(["u1"]);
    expect(read?.queued[0]?.content).toBe("ok");
  });

  test("queueFilePath 拒绝路径穿越形状的 sessionId", () => {
    expect(() => queueFilePath(runDir, "../evil")).toThrow();
    expect(() => queueFilePath(runDir, "a/b")).toThrow();
    expect(() => queueFilePath(runDir, "")).toThrow();
  });
});

describe("filterExecutedUuids", () => {
  test("顶层命中剔除、嵌套引用不误杀、损坏行跳过", () => {
    const u1 = "11111111-1111-4111-8111-111111111111";
    const u2 = "22222222-2222-4222-8222-222222222222";
    const u3 = "33333333-3333-4333-8333-333333333333";
    const u4 = "44444444-4444-4444-8444-444444444444";
    const jsonl = join(runDir, "hist.jsonl");
    writeFileSync(
      jsonl,
      [
        `{"uuid":"${u1}","type":"user"}`,
        `{"uuid":"a1","message":{"content":[]},"toolUseResult":{"uuid":"${u2}"}}`,
        "not json",
        `{"uuid":"${u3}","type":"user"}`,
      ].join("\n"),
    );
    const executed = filterExecutedUuids(jsonl, [u1, u2, u3, u4]);
    expect(executed.has(u1)).toBe(true);
    expect(executed.has(u3)).toBe(true);
    expect(executed.has(u2)).toBe(false);
    expect(executed.has(u4)).toBe(false);
  });

  test("JSONL 不存在 → 空集（全部视为未执行）", () => {
    const missing = join(runDir, "no-such.jsonl");
    const executed = filterExecutedUuids(missing, ["11111111-1111-4111-8111-111111111111"]);
    expect(executed.size).toBe(0);
  });

  test("compact 边界外的已执行条目 → 全量补扫命中", () => {
    const before = "aaaaaaaa-1111-4111-8111-111111111111";
    const after = "bbbbbbbb-2222-4222-8222-222222222222";
    // >8MB 尾窗：早段条目落在最后一个 compact boundary 之外，尾扫漏判 → 补扫命中
    const pad = `{"uuid":"pad-${"x".repeat(700)}","type":"filler"}`;
    const lines = [
      `{"uuid":"${before}","type":"user"}`,
      ...Array.from({ length: 11500 }, () => pad),
      '{"type":"system","subtype":"compact_boundary"}',
      `{"uuid":"${after}","type":"user"}`,
    ];
    const jsonl = join(runDir, "big.jsonl");
    writeFileSync(jsonl, lines.join("\n"));
    const executed = filterExecutedUuids(jsonl, [before, after]);
    expect(executed.has(before)).toBe(true);
    expect(executed.has(after)).toBe(true);
  });
});

describe("listOrphanQueueSessionIds", () => {
  test("queues/ 有 queue 文件但会话不在 live 集合 → 列孤儿（tmp 不算）", () => {
    mkdirSync(join(runDir, "queues"), { recursive: true });
    writeFileSync(queueFilePath(runDir, "agent_keep-1"), "{}");
    writeFileSync(queueFilePath(runDir, "agent_orphan-1"), "{}");
    writeFileSync(join(runDir, "queues", "agent_keep-1.json.999.tmp"), "{}");
    const orphans = listOrphanQueueSessionIds(runDir, new Set(["agent_keep-1"]));
    expect(orphans).toEqual(["agent_orphan-1"]);
  });
});

describe("temp 残留清理", () => {
  test("removeSessionQueue 连带清本会话残留 tmp", () => {
    mkdirSync(join(runDir, "queues"), { recursive: true });
    writeSessionQueue(runDir, sessionId, {
      schemaVersion: 1,
      savedAt: "x",
      queued: [{ uuid: "u1", content: "a" }],
      held: [],
    });
    const staleTmp = `${queueFilePath(runDir, sessionId)}.999.tmp`;
    writeFileSync(staleTmp, "{}");
    removeSessionQueue(runDir, sessionId);
    expect(existsSync(queueFilePath(runDir, sessionId))).toBe(false);
    expect(existsSync(staleTmp)).toBe(false);
  });

  test("pruneQueueTmpFiles 清全部 tmp 并计数；不动正式文件", () => {
    mkdirSync(join(runDir, "queues"), { recursive: true });
    writeSessionQueue(runDir, sessionId, {
      schemaVersion: 1,
      savedAt: "x",
      queued: [{ uuid: "u1", content: "a" }],
      held: [],
    });
    writeFileSync(`${queueFilePath(runDir, sessionId)}.111.tmp`, "{}");
    writeFileSync(`${queueFilePath(runDir, "agent_other-b")}.222.tmp`, "{}");
    expect(pruneQueueTmpFiles(runDir)).toBe(2);
    expect(existsSync(queueFilePath(runDir, sessionId))).toBe(true);
    expect(pruneQueueTmpFiles(runDir)).toBe(0);
  });
});

describe("removeSessionQueue", () => {
  test("写后 remove → 文件消失、再读 null；不存在时 no-op 不抛", () => {
    writeSessionQueue(runDir, sessionId, {
      schemaVersion: 1,
      savedAt: "x",
      queued: [{ uuid: "u1", content: "a" }],
      held: [],
    });
    removeSessionQueue(runDir, sessionId);
    expect(readSessionQueue(runDir, sessionId)).toBeNull();
    removeSessionQueue(runDir, "agent_no-such-session");
  });
});
