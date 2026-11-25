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
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type ClaudeQueuedCommand } from "@agents-remote/shared";
import { HISTORY_TAIL_SCAN_BYTES, sliceLastCompactBlock, topLevelUuidIs } from "./session-relay";

// 队列重物化落盘（#11 重启恢复）：排队/冻结的用户消息独立成文件，与 metadata 权威
// 分离——metadata patch 会灌噪音进 sessions-stream 广播且污染 schema；独立目录
// `runDir/queues/`（security review P1：损坏 queue 文件不得让注册表 loadIndex 失败）。
// 写入策略 = 每次变更同步写（人手频率 <1KB，temp→rename 原子替换，registry 落盘
// 同款）；destroy 不清盘（respawn 与 api 重启正是盘面要救的状态）。
export type SessionQueueFile = {
  schemaVersion: 1;
  savedAt: string;
  queued: ClaudeQueuedCommand[];
  held: ClaudeQueuedCommand[];
};

// 防御上限（security review P2-2 对称化）：写侧（reportUserInput 入队 gate）与读侧
// 共用同一组常量——超限条目不入队（直注 echo 降级，会话内照常执行），盘面永不出现
// 读侧会拒收的形状；读侧 size 先判后读（超大文件不进内存）。
export const MAX_QUEUE_ENTRIES = 100;
export const MAX_ENTRY_CONTENT_BYTES = 512 * 1024;
const MAX_QUEUE_FILE_BYTES = 4 * 1024 * 1024;

// sessionId 字符白名单（security review P3-4）：registry 生成的 id 均为
// `agent_<hex16>` / `terminal_<hex16>`；拒绝路径穿越字符（纵深防御，正常调用面
// 不会触达）。
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

// 队列文件独立目录 `runDir/queues/`（security review P1）：与 metadata 的
// `sessions/*.json` 命名空间分离——损坏 queue 文件不得让注册表 loadIndex 整体失败。
export function queueFilePath(runDir: string, sessionId: string): string {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error(`[queue-store] invalid sessionId: ${sessionId}`);
  }
  return join(runDir, "queues", `${sessionId}.json`);
}

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

function sanitizeEntries(raw: unknown): ClaudeQueuedCommand[] {
  if (!Array.isArray(raw)) return [];
  const entries: ClaudeQueuedCommand[] = [];
  // 按 uuid 去重（首见保留）：同一条目重复入盘时重发循环会因 claim 冲突跳过，但
  // 去重后语义更清晰（uuid 即幂等键，见 flushRecoveredCommands）。
  const seen = new Set<string>();
  for (const item of raw) {
    const entry = item as Partial<ClaudeQueuedCommand> | null;
    if (
      !entry ||
      typeof entry.uuid !== "string" ||
      entry.uuid.length === 0 ||
      seen.has(entry.uuid) ||
      typeof entry.content !== "string" ||
      entry.content.length === 0 ||
      Buffer.byteLength(entry.content) > MAX_ENTRY_CONTENT_BYTES
    ) {
      continue;
    }
    seen.add(entry.uuid);
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
    // size 先判后读：超限文件不进内存（spawn 关键路径的 OOM 防线）。
    if (statSync(path).size > MAX_QUEUE_FILE_BYTES) {
      console.error(`[queue-store] file over limit ${sessionId}, ignoring`);
      return null;
    }
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return null;
    console.error(`[queue-store] read failed ${sessionId}:`, error);
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
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(join(runDir, "queues"), { recursive: true });
    writeFileSync(tmp, JSON.stringify(file), { mode: 0o600 });
    renameSync(tmp, path);
  } catch (error) {
    console.error(`[queue-store] write failed ${sessionId}:`, error);
    // 写崩清理自己的 temp（rename 前失败 = 半写残留，不留给 GC）。
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* no-op */
    }
  }
}

/** 该会话的残留 temp（`<id>.queue.json.<pid>.tmp`，write 崩在 rename 前残留）。 */
function removeQueueTmpFiles(runDir: string, sessionId: string): void {
  const dir = join(runDir, "queues");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  const prefix = `${sessionId}.json.`;
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(".tmp")) continue;
    try {
      rmSync(join(dir, name), { force: true });
    } catch {
      /* no-op */
    }
  }
}

/** 删除级联（会话删除 / rollback fork）显式清盘；不存在 = no-op。 */
export function removeSessionQueue(runDir: string, sessionId: string): void {
  try {
    rmSync(queueFilePath(runDir, sessionId), { force: true });
  } catch (error) {
    console.error(`[queue-store] remove failed ${sessionId}:`, error);
  }
  removeQueueTmpFiles(runDir, sessionId);
}

/** boot 清扫：删除全部残留 queue temp（启动时无在途写，安全；孤儿 GC 只覆盖
 *  已删会话，存活会话的陈旧 temp 由这里兜底）。返回清理个数。 */
export function pruneQueueTmpFiles(runDir: string): number {
  const dir = join(runDir, "queues");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!name.includes(".json.") || !name.endsWith(".tmp")) continue;
    try {
      rmSync(join(dir, name), { force: true });
      removed++;
    } catch {
      /* no-op */
    }
  }
  return removed;
}

// 读「最后一个 compact block」（无 boundary 会话回落全读）——历史权威尾段，与
// relay 构建回放历史的口径一致。尾窗 8MB 同 HISTORY_TAIL_SCAN_BYTES；越窗
// boundary 缺失时退化为尾窗本身。complete=false 表示 compact 边界之前的行未进
// 扫描面（调用方按需补扫全量）。
function readCompactTailLines(jsonlPath: string): { lines: string[]; complete: boolean } {
  const fd = openSync(jsonlPath, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - HISTORY_TAIL_SCAN_BYTES);
    const tail = Buffer.allocUnsafe(size - start);
    const bytesRead = readSync(fd, tail, 0, tail.length, start);
    const window = tail.subarray(0, bytesRead);
    const block = sliceLastCompactBlock(window);
    if (block) {
      return { lines: block.toString("utf8").split("\n"), complete: start === 0 };
    }
    const text = start === 0 ? window : readFileSync(jsonlPath);
    return { lines: text.toString("utf8").split("\n"), complete: true };
  } finally {
    closeSync(fd);
  }
}

// needle 预筛 + 顶层 uuid 确认（relay locateReplayAnchor / topLevelUuidIs 同款形状）。
function scanExecutedLines(lines: string[], needles: Map<string, string>, executed: Set<string>) {
  for (const line of lines) {
    let hit = false;
    for (const uuid of needles.keys()) {
      if (executed.has(uuid)) continue;
      if (line.includes(needles.get(uuid) as string)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    for (const [uuid, needle] of needles) {
      if (!executed.has(uuid) && line.includes(needle) && topLevelUuidIs(line, uuid)) {
        executed.add(uuid);
      }
    }
  }
}

/**
 * JSONL 对照：返回目标 uuid 中已出现在历史（顶层 uuid 命中）的子集。重物化前剔除
 * 已执行条目，防「write stdin 与进度推进之间崩溃」的双发（CLI uuid 幂等是第二道网）。
 * 先扫最后一个 compact block；未命中的目标可能在边界之外（被 compact 摘要吞掉的
 * 更早历史），补一次全量扫描（恢复低频路径；已在尾段命中的不重复扫）。
 * 文件不存在/读失败 → 当前已扫到的结果（通常为空集 = 全部视为未执行，重发）。
 */
export function filterExecutedUuids(jsonlPath: string, uuids: string[]): Set<string> {
  const targets = new Set(uuids);
  const executed = new Set<string>();
  if (targets.size === 0) return executed;
  const needles = new Map([...targets].map((uuid) => [uuid, `"uuid":"${uuid}"`]));
  let scan: { lines: string[]; complete: boolean };
  try {
    scan = readCompactTailLines(jsonlPath);
  } catch {
    return executed;
  }
  scanExecutedLines(scan.lines, needles, executed);
  if (!scan.complete && executed.size < targets.size) {
    try {
      scanExecutedLines(readFileSync(jsonlPath, "utf8").split("\n"), needles, executed);
    } catch {
      /* 补扫失败以尾段结果为准 */
    }
  }
  return executed;
}

/** boot 孤儿 GC：queues/ 有 queue 文件但会话已不存在的 sessionId 列表。调用方删除
 *  前须以 registry index 二次确认（listAllCandidates 的 live 快照有探活 await 窗口，
 *  期间新建的会话不在内——security review P2-3）。 */
export function listOrphanQueueSessionIds(
  runDir: string,
  liveSessionIds: ReadonlySet<string>,
): string[] {
  const dir = join(runDir, "queues");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const orphans: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const sessionId = name.slice(0, -".json".length);
    if (!liveSessionIds.has(sessionId)) orphans.push(sessionId);
  }
  return orphans;
}
