// 回放缓存的存储层（2026-10-26，IDB 迁移批）：claude-replay-cache.ts 的逻辑层
// （行 cap / 锚推导 / LRU / 墓碑 / 配额重试）通过本文件暴露的 ReplayCacheStore
// 接口访问底层存储——生产 = 原生 IndexedDB，测试 = 内存实现（bun/jsdom 无 IDB，
// 注入 seam 见 cache 层 setReplayCacheStoreForTests）。
//
// 为什么双 store（entries + meta）：LRU 淘汰扫描只读 meta（几十条小记录），绝不
// getAll() 反序列化 MB 级 entry——localStorage 时代 readSavedAt 只窥探串头部 64
// 字节的同款动机；IDB 没有部分读，只能用小记录副承载淘汰扫描所需字段。
//
// putUnlessTombstone 的原子性（单 readwrite tx 内 get → 条件 put）：clear（墓碑）
// 与迟到 flush 的线性化——墓碑 tx 在后则覆盖、save tx 在后则 tx 内 get 到墓碑被
// 挡；同 key 并发 flush 按 tx 创建序 FIFO，last-flush-wins。所有 request 都在
// request 回调内同步发起（不跨 await 使用 tx），避开「微任务 continuation 里 tx
// 是否 active」的引擎差异面（WebKit 有历史坑，主目标 iOS 不赌）。
//
// 降级：无 indexedDB（bun/jsdom/SSR）→ 工厂返回 null；open 失败（隐私模式等）→
// dbPromise 缓存 null，本页面加载内所有操作静默 no-op 且不重试（反复重试只有噪
// 音）。缓存是增强能力，任何失败都等价于「缓存从未命中」，全量回放兜底。

export const REPLAY_CACHE_PREFIX = "claudeReplayCache:";
/** DB 与 store 常量：scripts/probe-replay-cache-*.mjs 复制此处的值（探针预写/断言用）。 */
export const REPLAY_CACHE_DB_NAME = "agents-remote-replay-cache";
export const REPLAY_CACHE_ENTRY_STORE = "entries";
const REPLAY_CACHE_META_STORE = "meta";
const REPLAY_CACHE_DB_VERSION = 1;

/** 落盘形态：raw 为 JSONL 单串（结构化克隆直存对象，不再 JSON.stringify 外壳）。 */
export type StoredEntry = {
  savedAt: number;
  v: 1;
  cursorUuid: string;
  resume: boolean;
  raw: string;
};

/** entries 里实际存在的两种记录：正常 entry 与删除墓碑。 */
export type StoredRecord = StoredEntry | { savedAt: number; v: 1; removed: true };

/** LRU 扫描行：chars 是软预算口径（raw 为主，无需精确）。 */
export type ReplayCacheMeta = { key: string; savedAt: number; chars: number };

export interface ReplayCacheStore {
  load(key: string): Promise<StoredRecord | null>;
  /**
   * 原子 check-墓碑-then-put（同 tx 维护 meta）：false = 被墓碑挡（删除语义对
   * save 的单向闸）；抛错 = 存储层失败（配额等，由调用方决定淘汰重试）。
   */
  putUnlessTombstone(key: string, entry: StoredEntry): Promise<boolean>;
  /** 硬删（无锚窗口等「不应存在垃圾」场景；与墓碑语义不同，见 cache 层调用点）。 */
  remove(key: string): Promise<void>;
  /** 写 removed 标记：挡住迟到的 save 重写；随 LRU 淘汰后自然重试（自愈）。 */
  tombstone(key: string): Promise<void>;
  /** LRU 扫描数据源：只读 meta 小记录，绝不反序列化大 entry。 */
  listMeta(): Promise<ReplayCacheMeta[]>;
  deleteMany(keys: string[]): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
}

/** 墓碑的软尺寸：参与全局 LRU 预算（可被淘汰自愈），数值无需精确。 */
const TOMBSTONE_CHARS = 64;

function entryChars(entry: StoredEntry): number {
  return entry.raw.length + entry.cursorUuid.length + TOMBSTONE_CHARS;
}

function isTombstone(record: unknown): record is { savedAt: number; v: 1; removed: true } {
  return (record as { removed?: unknown } | null)?.removed === true;
}

// ── 原生 IndexedDB 实现 ──

let idbPromise: Promise<IDBDatabase | null> | null = null;

function openReplayDb(): Promise<IDBDatabase | null> {
  idbPromise ??= (async () => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(REPLAY_CACHE_DB_NAME, REPLAY_CACHE_DB_VERSION);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(REPLAY_CACHE_ENTRY_STORE)) {
            req.result.createObjectStore(REPLAY_CACHE_ENTRY_STORE);
          }
          if (!req.result.objectStoreNames.contains(REPLAY_CACHE_META_STORE)) {
            req.result.createObjectStore(REPLAY_CACHE_META_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
        req.onblocked = () => reject(new Error("indexedDB open blocked"));
      });
      // 其它标签页请求升级版本时让出连接（本应用只有 v1，纯防御）。
      db.onversionchange = () => {
        db.close();
        idbPromise = null;
      };
      return db;
    } catch {
      return null; // open 失败：本页面加载内永久降级，不重试
    }
  })();
  return idbPromise;
}

function txAsPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    // 只挂 complete/abort：request 级错误默认 abort tx，abort 是最终态（onerror
    // 可能与 onabort 双 fire，promise 二次 settle 无害但不挂更干净）。
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("indexedDB transaction aborted"));
  });
}

/**
 * 生产存储。返回 null = 环境无 indexedDB（bun/jsdom/SSR）；open 失败的降级在操
 * 作级（每个方法 await 连接后 no-op）。工厂体开头执行旧 localStorage 清理——
 * 独立于 IDB open 成败（清理动机恰是释放配额），每页面加载至多一次、天然幂等。
 */
export function createIdbReplayStore(): ReplayCacheStore | null {
  if (typeof indexedDB === "undefined") return null;
  sweepLegacyReplayCache();
  return {
    load(key) {
      return withDb(async (db) => {
        const tx = db.transaction(REPLAY_CACHE_ENTRY_STORE, "readonly");
        return await new Promise<StoredRecord | null>((resolve, reject) => {
          const req = tx.objectStore(REPLAY_CACHE_ENTRY_STORE).get(key);
          req.onsuccess = () => resolve((req.result as StoredRecord | undefined) ?? null);
          req.onerror = () => reject(req.error ?? new Error("indexedDB get failed"));
        });
      });
    },
    putUnlessTombstone(key, entry) {
      return withDb((db) => {
        const tx = db.transaction([REPLAY_CACHE_ENTRY_STORE, REPLAY_CACHE_META_STORE], "readwrite");
        let blocked = false;
        const getReq = tx.objectStore(REPLAY_CACHE_ENTRY_STORE).get(key);
        getReq.onsuccess = () => {
          if (isTombstone(getReq.result)) {
            blocked = true;
            return; // 无新 request → tx 自动 commit
          }
          tx.objectStore(REPLAY_CACHE_ENTRY_STORE).put(entry, key);
          tx.objectStore(REPLAY_CACHE_META_STORE).put(
            { savedAt: entry.savedAt, chars: entryChars(entry) },
            key,
          );
        };
        return txAsPromise(tx).then(() => !blocked);
      });
    },
    remove(key) {
      return withDb((db) => {
        const tx = db.transaction([REPLAY_CACHE_ENTRY_STORE, REPLAY_CACHE_META_STORE], "readwrite");
        tx.objectStore(REPLAY_CACHE_ENTRY_STORE).delete(key);
        tx.objectStore(REPLAY_CACHE_META_STORE).delete(key);
        return txAsPromise(tx);
      });
    },
    deleteMany(keys) {
      return withDb(async (db) => {
        const tx = db.transaction([REPLAY_CACHE_ENTRY_STORE, REPLAY_CACHE_META_STORE], "readwrite");
        for (const key of keys) {
          tx.objectStore(REPLAY_CACHE_ENTRY_STORE).delete(key);
          tx.objectStore(REPLAY_CACHE_META_STORE).delete(key);
        }
        await txAsPromise(tx);
      });
    },
    listKeys(prefix) {
      return withDb(async (db) => {
        const tx = db.transaction(REPLAY_CACHE_ENTRY_STORE, "readonly");
        return await new Promise<string[]>((resolve, reject) => {
          const req = tx.objectStore(REPLAY_CACHE_ENTRY_STORE).getAllKeys();
          req.onsuccess = () =>
            resolve(
              req.result.filter((k): k is string => typeof k === "string" && k.startsWith(prefix)),
            );
          req.onerror = () => reject(req.error ?? new Error("indexedDB getAllKeys failed"));
        });
      });
    },
    tombstone(key) {
      return withDb(async (db) => {
        const tx = db.transaction([REPLAY_CACHE_ENTRY_STORE, REPLAY_CACHE_META_STORE], "readwrite");
        const record = { savedAt: Date.now(), v: 1 as const, removed: true as const };
        tx.objectStore(REPLAY_CACHE_ENTRY_STORE).put(record, key);
        tx.objectStore(REPLAY_CACHE_META_STORE).put(
          { savedAt: record.savedAt, chars: TOMBSTONE_CHARS },
          key,
        );
        await txAsPromise(tx);
      });
    },
    listMeta() {
      return withDb(async (db) => {
        const tx = db.transaction(REPLAY_CACHE_META_STORE, "readonly");
        return await new Promise<ReplayCacheMeta[]>((resolve, reject) => {
          const store = tx.objectStore(REPLAY_CACHE_META_STORE);
          const valuesReq = store.getAll();
          const keysReq = store.getAllKeys();
          valuesReq.onsuccess = () => {
            // getAll 与 getAllKeys 同 request 队列序，结果同序（IndexedDB 规范）。
            const values = valuesReq.result as Array<{ savedAt: number; chars: number }>;
            resolve(
              keysReq.result?.length === values.length
                ? keysReq.result.map((key, i) => ({ key: key as string, ...values[i]! }))
                : [],
            );
          };
          valuesReq.onerror = () => reject(valuesReq.error ?? new Error("indexedDB getAll failed"));
        });
      });
    },
  };
}

/** openReplayDb 失败（null）时操作级 no-op 的小包装。 */
function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  return (async () => {
    const db = await openReplayDb();
    if (!db) return undefined as T;
    return await fn(db);
  })();
}

// ── 测试内存实现 ──

export function createMemReplayStore() {
  const entries = new Map<string, StoredRecord>();
  const meta = new Map<string, { savedAt: number; chars: number }>();
  return {
    // 故障注入旋钮（仅测试用；接口 ReplayCacheStore 上不可见）。
    failPutOnce: false,
    failPutAlways: false,
    loadDelayMs: 0,
    async load(key: string): Promise<StoredRecord | null> {
      if (this.loadDelayMs > 0) await new Promise((r) => setTimeout(r, this.loadDelayMs));
      return entries.get(key) ?? null;
    },
    async putUnlessTombstone(key: string, record: StoredEntry): Promise<boolean> {
      if (this.failPutAlways) throw new Error("quota exceeded (always)");
      if (this.failPutOnce) {
        this.failPutOnce = false;
        throw new Error("quota exceeded (once)");
      }
      if (isTombstone(entries.get(key))) return false;
      entries.set(key, record);
      meta.set(key, { savedAt: record.savedAt, chars: entryChars(record) });
      return true;
    },
    async remove(key: string): Promise<void> {
      entries.delete(key);
      meta.delete(key);
    },
    async tombstone(key: string): Promise<void> {
      const record = { savedAt: Date.now(), v: 1 as const, removed: true as const };
      entries.set(key, record);
      meta.set(key, { savedAt: record.savedAt, chars: TOMBSTONE_CHARS });
    },
    async listMeta(): Promise<ReplayCacheMeta[]> {
      return [...meta.entries()].map(([key, m]) => ({ key, ...m }));
    },
    async deleteMany(keys: string[]): Promise<void> {
      for (const key of keys) {
        entries.delete(key);
        meta.delete(key);
      }
    },
    async listKeys(prefix: string): Promise<string[]> {
      return [...entries.keys()].filter((k) => k.startsWith(prefix));
    },
    /** 注入任意对象（坏形状/墓碑），测 load 侧校验与墓碑拦截。 */
    rawPut(key: string, record: unknown): void {
      entries.set(key, record as StoredRecord);
    },
    metaChars(key: string): number | undefined {
      return meta.get(key)?.chars;
    },
  };
}

// ── 旧 localStorage 数据一次性清理 ──

/**
 * localStorage 时代（≤2.5M 全局 cap、单 entry 1.5M 截断）的残留 key 全删——不迁
 * 移：存量全部截断过、可由服务端全量回放再生，迁移无价值；清理动机是释放配额给
 * workbench 等其它键。幂等：无前缀 key 时零操作。
 */
export function sweepLegacyReplayCache(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(REPLAY_CACHE_PREFIX)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    // ignore（隐私模式等；removeItem 不受配额约束，失败只可能来自存储不可用）
  }
}
