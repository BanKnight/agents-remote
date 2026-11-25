import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type ClaudeQueuedCommand } from "@agents-remote/shared";
import { HISTORY_TAIL_SCAN_BYTES, sliceLastCompactBlock } from "./session-relay";

// 队列重物化落盘（#11 重启恢复）：排队/冻结的用户消息独立成文件，与 metadata 权威
// 分离——metadata patch 会灌噪音进 sessions-stream 广播且污染 schema。写入策略 =
// 每次变更同步写（人手频率 <1KB，temp→rename 原子替换，registry 落盘同款）；
// destroy 不清盘（respawn 与 api 重启正是盘面要救的状态）。
export type SessionQueueFile = {
  schemaVersion: 1;
  savedAt: string;
  queued: ClaudeQueuedCommand[];
  held: ClaudeQueuedCommand[];
};

// 防御上限：读取超限按损坏处理（console.error + null，文件保留不删）。人手频率下
// 不可达，兜底「拒执行总好过错误执行」。
const MAX_QUEUE_ENTRIES = 100;
const MAX_ENTRY_CONTENT_BYTES = 100 * 1024;
const MAX_QUEUE_FILE_BYTES = 256 * 1024;

export function queueFilePath(runDir: string, sessionId: string): string {
  return join(runDir, "sessions", `${sessionId}.queue.json`);
}

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

function sanitizeEntries(raw: unknown): ClaudeQueuedCommand[] {
  if (!Array.isArray(raw)) return [];
  const entries: ClaudeQueuedCommand[] = [];
  for (const item of raw) {
    const entry = item as Partial<ClaudeQueuedCommand> | null;
    if (
      !entry ||
      typeof entry.uuid !== "string" ||
      entry.uuid.length === 0 ||
      typeof entry.content !== "string" ||
      entry.content.length === 0 ||
      Buffer.byteLength(entry.content) > MAX_ENTRY_CONTENT_BYTES
    ) {
      continue;
    }
    entries.push({ uuid: entry.uuid, content: entry.content });
    if (entries.length >= MAX_QUEUE_ENTRIES) break;
  }
  return entries;
}

/**
 * 读回会话队列文件。不存在 → null（无恢复态）；parse 失败 / schema 不符 / 超限 →
 * console.error + null，文件保留（不删——可能是半写损坏，重物化拒绝执行总好过
 * 误执行，用户下次变更会覆盖重写）。
 */
export function readSessionQueue(runDir: string, sessionId: string): SessionQueueFile | null {
  const path = queueFilePath(runDir, sessionId);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return null;
    console.error(`[queue-store] read failed ${sessionId}:`, error);
    return null;
  }
  if (raw.length > MAX_QUEUE_FILE_BYTES) {
    console.error(`[queue-store] file over limit (${raw.length}B) ${sessionId}, ignoring`);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(`[queue-store] corrupt JSON ${sessionId}, ignoring:`, error);
    return null;
  }
  const file = parsed as Partial<SessionQueueFile> | null;
  if (
    !file ||
    file.schemaVersion !== 1 ||
    !Array.isArray(file.queued) ||
    !Array.isArray(file.held)
  ) {
    console.error(`[queue-store] schema mismatch ${sessionId}, ignoring`);
    return null;
  }
  const queued = sanitizeEntries(file.queued);
  const held = sanitizeEntries(file.held);
  if (queued.length !== file.queued.length || held.length !== file.held.length) {
    console.error(`[queue-store] invalid entries dropped ${sessionId}`);
  }
  return {
    schemaVersion: 1,
    savedAt: typeof file.savedAt === "string" ? file.savedAt : "",
    queued,
    held,
  };
}

/** 同步原子写（temp→rename 0600）；queued/held 双空 = 清盘 unlink。 */
export function writeSessionQueue(runDir: string, sessionId: string, file: SessionQueueFile): void {
  const path = queueFilePath(runDir, sessionId);
  if (file.queued.length === 0 && file.held.length === 0) {
    try {
      rmSync(path, { force: true });
    } catch (error) {
      console.error(`[queue-store] unlink failed ${sessionId}:`, error);
    }
    return;
  }
  try {
    mkdirSync(join(runDir, "sessions"), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(file), { mode: 0o600 });
    renameSync(tmp, path);
  } catch (error) {
    console.error(`[queue-store] write failed ${sessionId}:`, error);
  }
}

/** 删除级联（会话删除 / rollback fork）显式清盘；不存在 = no-op。 */
export function removeSessionQueue(runDir: string, sessionId: string): void {
  try {
    rmSync(queueFilePath(runDir, sessionId), { force: true });
  } catch (error) {
    console.error(`[queue-store] remove failed ${sessionId}:`, error);
  }
}

// 锚命中的顶层确认（session-relay topLevelUuidIs 同款思路，本地副本）。
function topLevelUuidIs(line: string, uuid: string): boolean {
  try {
    return (JSON.parse(line) as { uuid?: unknown }).uuid === uuid;
  } catch {
    return false;
  }
}

// 读「最后一个 compact block」（无 boundary 会话回落全读）——历史权威尾段，与
// relay 构建回放历史的口径一致：已执行条目的 uuid 必在此段内。尾窗 8MB 同
// HISTORY_TAIL_SCAN_BYTES；越窗 boundary 缺失时退化为尾窗本身（窗外漏判由 CLI
// uuid 幂等兜底，见 plan 风险表）。
function readCompactTailLines(jsonlPath: string): string[] {
  const fd = openSync(jsonlPath, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - HISTORY_TAIL_SCAN_BYTES);
    const tail = Buffer.allocUnsafe(size - start);
    const bytesRead = readSync(fd, tail, 0, tail.length, start);
    const window = tail.subarray(0, bytesRead);
    const block = sliceLastCompactBlock(window);
    const text = block ?? (start === 0 ? window : readFileSync(jsonlPath));
    return text.toString("utf8").split("\n");
  } finally {
    closeSync(fd);
  }
}

/**
 * JSONL 对照：返回目标 uuid 中已出现在历史（顶层 uuid 命中）的子集。重物化前剔除
 * 已执行条目，防「write stdin 与进度推进之间崩溃」的双发（CLI uuid 幂等是第二道网）。
 * 文件不存在/读失败 → 空集（全部视为未执行，重发）。
 */
export function filterExecutedUuids(jsonlPath: string, uuids: string[]): Set<string> {
  const targets = new Set(uuids);
  const executed = new Set<string>();
  if (targets.size === 0) return executed;
  let lines: string[];
  try {
    lines = readCompactTailLines(jsonlPath);
  } catch {
    return executed;
  }
  for (const line of lines) {
    // needle 预筛避免无谓 parse（relay locateReplayAnchor 同款 needle 形状）
    let hit = false;
    for (const uuid of targets) {
      if (executed.has(uuid)) continue;
      if (line.includes(`"uuid":"${uuid}"`)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    for (const uuid of targets) {
      if (!executed.has(uuid) && line.includes(`"uuid":"${uuid}"`) && topLevelUuidIs(line, uuid)) {
        executed.add(uuid);
      }
    }
  }
  return executed;
}

/** boot 孤儿 GC：盘面有 queue 文件但会话已不存在的 sessionId 列表。 */
export function listOrphanQueueSessionIds(
  runDir: string,
  liveSessionIds: ReadonlySet<string>,
): string[] {
  const dir = join(runDir, "sessions");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const orphans: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".queue.json")) continue;
    const sessionId = name.slice(0, -".queue.json".length);
    if (!liveSessionIds.has(sessionId)) orphans.push(sessionId);
  }
  return orphans;
}
