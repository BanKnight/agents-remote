import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  filterExecutedUuids,
  listOrphanQueueSessionIds,
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
    const dir = join(runDir, "sessions");
    mkdirSync(dir, { recursive: true });
    const path = queueFilePath(runDir, sessionId);
    writeFileSync(path, "{not valid json");
    expect(readSessionQueue(runDir, sessionId)).toBeNull();
    // 文件保留（不删——半写损坏拒执行好过误执行）
    expect(existsSync(path)).toBe(true);
  });

  test("schemaVersion 不符 / 缺字段条目 / 超限条目 → 过滤或拒读", () => {
    const dir = join(runDir, "sessions");
    mkdirSync(dir, { recursive: true });
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
    // 缺 content 的条目被过滤，合法条目保留
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        savedAt: "x",
        queued: [{ uuid: "u1", content: "ok" }, { uuid: "u2" }, null, "junk"],
        held: [],
      }),
    );
    const read = readSessionQueue(runDir, sessionId);
    expect(read?.queued.map((e) => e.uuid)).toEqual(["u1"]);
  });
});

describe("filterExecutedUuids", () => {
  test("顶层命中剔除、嵌套引用不误杀、损坏行跳过", () => {
    const dir = join(runDir, "sessions");
    mkdirSync(dir, { recursive: true });
    const jsonl = join(dir, "hist.jsonl");
    const u1 = "11111111-1111-4111-8111-111111111111";
    const u2 = "22222222-2222-4222-8222-222222222222";
    const u3 = "33333333-3333-4333-8333-333333333333";
    const u4 = "44444444-4444-4444-8444-444444444444";
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
    const missing = join(runDir, "sessions", "no-such.jsonl");
    const executed = filterExecutedUuids(missing, ["11111111-1111-4111-8111-111111111111"]);
    expect(executed.size).toBe(0);
  });
});

describe("listOrphanQueueSessionIds", () => {
  test("盘面有 queue 文件但会话不在 live 集合 → 列孤儿", () => {
    const dir = join(runDir, "sessions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(queueFilePath(runDir, "agent_keep-1"), "{}");
    writeFileSync(queueFilePath(runDir, "agent_orphan-1"), "{}");
    writeFileSync(join(dir, "agent_keep-1.json"), "{}");
    writeFileSync(join(dir, "x.tmp"), "{}");
    const orphans = listOrphanQueueSessionIds(runDir, new Set(["agent_keep-1"]));
    expect(orphans).toEqual(["agent_orphan-1"]);
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
