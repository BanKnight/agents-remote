import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { generateVAPIDKeys } from "web-push";

// Web Push VAPID 密钥管理（PWA 通知批）。密钥文件 ~/.agents-remote/push-vapid.json：
// 私钥纪律与 settings.yaml apiKey 同款——永不进响应、永不进日志；对外只有公钥
// （GET /api/push/vapid-public-key）。首启读不到即生成（照 index.ts tokenSecret 先例），
// 原子写（tmp + rename）+ 0o600；读到存量文件但权限过宽时收敛回 0o600。
export type VapidKeys = { publicKey: string; privateKey: string };

const isVapidKeys = (value: unknown): value is VapidKeys => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.publicKey === "string" && typeof v.privateKey === "string";
};

export const defaultPushKeysPath = () => join(homedir(), ".agents-remote", "push-vapid.json");

export class PushKeyManager {
  private readonly path: string;
  private cached: VapidKeys | undefined;
  // single-flight（code review P2）：首启「设置页拉公钥」与「第一条 notify」并发时，
  // 两路共用同一 in-flight promise——否则各自生成密钥 + 竞态写同一 tmp 路径，内存与
  // 磁盘可能永久分叉（订阅按旧公钥建立，重启后签名全 403 且不在 404/410 清理集）。
  private pending: Promise<VapidKeys> | undefined;

  constructor(options: { path?: string } = {}) {
    this.path = options.path ?? defaultPushKeysPath();
  }

  /** 读存量密钥，读不到（或内容损坏）即生成并持久化。同一进程复用缓存。 */
  async readOrCreate(): Promise<VapidKeys> {
    if (this.cached) return this.cached;
    this.pending ??= this.load().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async load(): Promise<VapidKeys> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, "utf8"));
      if (isVapidKeys(parsed)) {
        await this.constrainMode();
        this.cached = parsed;
        return parsed;
      }
    } catch {
      // 文件不存在或 JSON 损坏 → 走生成。损坏覆盖是安全方向（旧订阅将全部失效重订）。
    }
    const keys = generateVAPIDKeys();
    await this.persist(keys);
    this.cached = keys;
    return keys;
  }

  private async persist(keys: VapidKeys): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const tempPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.path);
  }

  private async constrainMode(): Promise<void> {
    try {
      const info = await stat(this.path);
      if ((info.mode & 0o777) !== 0o600) {
        await chmod(this.path, 0o600);
      }
    } catch {
      // stat 失败不阻塞读取路径（文件存在才走到这里，理论不可达）。
    }
  }
}
