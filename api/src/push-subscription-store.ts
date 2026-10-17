import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Web Push 订阅存储（PWA 通知批）：~/.agents-remote/push-subscriptions.json（0o600，原子写）。
// 多设备多订阅并存（每台设备的 SW 各一个 endpoint）；按 endpoint 幂等 upsert / remove。
export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
};

type SubscriptionFile = { subscriptions: PushSubscriptionRecord[] };

const isRecord = (value: unknown): value is PushSubscriptionRecord => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.endpoint === "string" &&
    typeof v.p256dh === "string" &&
    typeof v.auth === "string" &&
    typeof v.createdAt === "string"
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

  /** 按 endpoint 去重 upsert（同设备重订阅覆盖 keys，createdAt 保留首订时间）。 */
  async upsert(sub: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    const current = await this.list();
    const existing = current.find((s) => s.endpoint === sub.endpoint);
    const record: PushSubscriptionRecord = existing
      ? { ...existing, p256dh: sub.p256dh, auth: sub.auth }
      : { ...sub, createdAt: new Date().toISOString() };
    await this.persist([...current.filter((s) => s.endpoint !== sub.endpoint), record]);
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
