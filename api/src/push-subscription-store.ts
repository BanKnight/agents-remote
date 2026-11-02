import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Web Push 订阅存储（PWA 通知批）：~/.agents-remote/push-subscriptions.json（0o600，原子写）。
// 多设备多订阅并存（每台设备的 SW 各一个 endpoint）；按 endpoint 幂等 upsert / remove。
// 同设备重订阅替换（deviceId，2026-11-03 死订阅清理批）：iOS 订阅死亡重订阅后 APNs 生成
// 新 endpoint，按 endpoint 去重会留下永远 201 的死记录（APNs 对死 endpoint 不报 404/410，
// notifyInner 的 gone prune 打不到）——上报带 deviceId 时 upsert 替换同 ID 旧记录
//（一设备一记录）；旧客户端缺省 deviceId，保持原行为。
export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
  deviceId?: string;
};

type SubscriptionFile = { subscriptions: PushSubscriptionRecord[] };

const isRecord = (value: unknown): value is PushSubscriptionRecord => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.endpoint === "string" &&
    typeof v.p256dh === "string" &&
    typeof v.auth === "string" &&
    typeof v.createdAt === "string" &&
    // deviceId optional（存量旧记录无此字段照常读）；存在但非字符串才拒。
    (v.deviceId === undefined || typeof v.deviceId === "string")
  );
};

const normalizeFile = (parsed: unknown): SubscriptionFile => {
  const root = parsed as Partial<SubscriptionFile> | null;
  return {
    subscriptions: Array.isArray(root?.subscriptions) ? root.subscriptions.filter(isRecord) : [],
  };
};

export const defaultSubscriptionsPath = () =>
  join(homedir(), ".agents-remote", "push-subscriptions.json");

export class PushSubscriptionStore {
  private readonly path: string;

  constructor(options: { path?: string } = {}) {
    this.path = options.path ?? defaultSubscriptionsPath();
  }

  /** 存量订阅；文件不存在或 JSON 损坏 → 空表（损坏即视为全部失效，安全方向）。 */
  async list(): Promise<PushSubscriptionRecord[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, "utf8"));
      return normalizeFile(parsed).subscriptions;
    } catch {
      return [];
    }
  }

  /**
   * 按 endpoint 去重 upsert（同 endpoint 重订阅覆盖 keys，createdAt 保留首订时间）。
   * 带 deviceId 时替换同 deviceId 的其他记录（一设备一记录——订阅死亡重订阅的新
   * endpoint 上报即淘汰旧死记录）；缺省 deviceId 不动任何他人记录（旧客户端兼容）。
   */
  async upsert(sub: {
    endpoint: string;
    p256dh: string;
    auth: string;
    deviceId?: string;
  }): Promise<void> {
    const current = await this.list();
    const existing = current.find((s) => s.endpoint === sub.endpoint);
    const record: PushSubscriptionRecord = existing
      ? {
          ...existing,
          p256dh: sub.p256dh,
          auth: sub.auth,
          deviceId: sub.deviceId ?? existing.deviceId,
        }
      : { ...sub, createdAt: new Date().toISOString() };
    const replaced = current.filter(
      (s) =>
        s.endpoint !== sub.endpoint &&
        !(sub.deviceId !== undefined && s.deviceId !== undefined && s.deviceId === sub.deviceId),
    );
    await this.persist([...replaced, record]);
  }

  /** 幂等删除；返回是否确有删除。 */
  async remove(endpoint: string): Promise<boolean> {
    const current = await this.list();
    const next = current.filter((s) => s.endpoint !== endpoint);
    if (next.length === current.length) return false;
    await this.persist(next);
    return true;
  }

  /** 批量清理（推送 404/410 后）；返回清理数。 */
  async removeMany(endpoints: string[]): Promise<number> {
    if (endpoints.length === 0) return 0;
    const gone = new Set(endpoints);
    const current = await this.list();
    const next = current.filter((s) => !gone.has(s.endpoint));
    if (next.length === current.length) return 0;
    await this.persist(next);
    return current.length - next.length;
  }

  private async persist(subscriptions: PushSubscriptionRecord[]): Promise<void> {
    const file: SubscriptionFile = { subscriptions };
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const tempPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.path);
  }
}
