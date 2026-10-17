import { createPrivateKey, createSign, type KeyObject } from "node:crypto";
import { generateRequestDetails } from "web-push";
import type { PushMessagePayload, PushNotificationKind } from "@agents-remote/shared";
import type { SettingsStore } from "./settings-store";
import { PushSubscriptionStore } from "./push-subscription-store";
import type { VapidKeys } from "./push-keys";

// Web Push 发送器（PWA 通知批）。发送层不直接用 web-push 的 sendNotification（其内置
// 发送恒走 node:https.request，http endpoint 也强走 TLS，Bun 下不可用——Spike 1 实证），
// 只取其加密产物 generateRequestDetails（aes128gcm 密文 + VAPID headers），HTTP 由 Bun
// fetch 承担。gate：settings.notifications[kind] === false → 不发（normalizeSettings 补
// 默认全 true，旧 yaml 无该域 = 全开）。
//
// 发送是 fire-and-forget（触发点 void 调用）：notify 兜底 catch，任何失败不向上抛；
// 404/410（subscription gone）→ 清除该订阅。

export type PushNotifyInfo = {
  projectName: string;
  sessionId: string;
  sessionName?: string;
  toolName?: string;
  inputSummary?: string;
};

export type PushSendFn = (
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushMessagePayload,
) => Promise<void>;

const SUBSCRIPTION_GONE_STATUS = new Set([404, 410]);

/** VAPID token 有效期（RFC 8292 建议值，上限 24h）。 */
const VAPID_TTL_SECONDS = 12 * 60 * 60;

/** 推送消息在推送服务（APNs）的暂存时长：设备不可达期间 APNs 代存，回来即补送，
 *  过期即丢弃。取 APNs 上限 24h——「该知道的事完全不知道」远比「迟到的事件快照
 *  可能已失效」代价大（通知点进会话看到的是实时状态，过时只影响提醒本身）；
 *  用户拍板无脑顶格（2026-10-17）。 */
const PUSH_TTL_SECONDS = 24 * 60 * 60;

// title = 「项目 · 会话」（语义化，2026-10-18 用户反馈「看不出通知从哪个项目哪个会话
// 发出来」）；会话名缺省回落项目名。
export const pushTitle = (info: { projectName: string; sessionName?: string }): string =>
  info.sessionName ? `${info.projectName} · ${info.sessionName}` : info.projectName;

export const pushBody = (kind: PushNotificationKind, info: PushNotifyInfo): string => {
  if (kind === "blocked") {
    const summary = info.inputSummary ? ` · ${info.inputSummary}` : "";
    return `等待审批：${info.toolName ?? "工具调用"}${summary}`;
  }
  return kind === "done" ? "任务已完成" : "任务出错，请查看会话";
};

const deepLink = (projectName: string, sessionId: string): string =>
  `/projects/${encodeURIComponent(projectName)}/session/${encodeURIComponent(sessionId)}`;

export class PushNotifier {
  constructor(
    private readonly deps: {
      keys: { readOrCreate(): Promise<VapidKeys> };
      subscriptions: PushSubscriptionStore;
      settings: SettingsStore;
      send?: PushSendFn;
    },
  ) {
    this.subscriptions = deps.subscriptions;
    this.settings = deps.settings;
    this.send = deps.send ?? defaultSend(deps.keys);
  }

  private readonly subscriptions: PushSubscriptionStore;
  private readonly settings: SettingsStore;
  private readonly send: PushSendFn;

  /**
   * 触发点入口（fire-and-forget：调用方 `void pushNotifier.notify(...)`；本方法兜底
   * catch——任何失败不向上抛，settings/keys 层错误只告警。
   */
  async notify(kind: PushNotificationKind, info: PushNotifyInfo): Promise<void> {
    try {
      await this.notifyInner(kind, info);
    } catch (error) {
      console.warn(`[push] notify ${kind} failed:`, error);
    }
  }

  private async notifyInner(kind: PushNotificationKind, info: PushNotifyInfo): Promise<void> {
    const state = await this.settings.read();
    if (state.notifications?.[kind] === false) return;

    const subscriptions = await this.subscriptions.list();
    if (subscriptions.length === 0) return;

    const payload: PushMessagePayload = {
      kind,
      title: pushTitle(info),
      body: pushBody(kind, info),
      url: deepLink(info.projectName, info.sessionId),
      projectName: info.projectName,
      sessionId: info.sessionId,
      sentAt: new Date().toISOString(),
    };
    if (info.sessionName) payload.sessionName = info.sessionName;
    if (info.toolName) payload.toolName = info.toolName;
    if (info.inputSummary) payload.inputSummary = info.inputSummary;

    const outcomes = await Promise.allSettled(
      subscriptions.map((subscription) => this.send(subscription, payload)),
    );
    const gone = outcomes.flatMap((outcome, i) =>
      outcome.status === "rejected" && SUBSCRIPTION_GONE_STATUS.has(goneStatus(outcome.reason))
        ? [subscriptions[i].endpoint]
        : [],
    );
    if (gone.length > 0) {
      const removed = await this.subscriptions.removeMany(gone);
      console.warn(`[push] pruned ${removed} gone subscription(s)`);
    }
    // 非 gone 失败（网络断 / 429 / 401·403 VAPID 失配）：log 便于排查「为什么没收到推送」，
    // 不清理不清运（code review P3-3）。
    for (const outcome of outcomes) {
      if (
        outcome.status === "rejected" &&
        !SUBSCRIPTION_GONE_STATUS.has(goneStatus(outcome.reason))
      ) {
        console.warn(`[push] send failed: ${describeSendError(outcome.reason)}`);
      }
    }
  }
}

const describeSendError = (reason: unknown): string => {
  const status = goneStatus(reason);
  return status > 0 ? `status ${status}` : String(reason);
};

/** 404/410 之外的发送失败：log 不抛（gone 判定见 SUBSCRIPTION_GONE_STATUS）。 */
const goneStatus = (reason: unknown): number => {
  const status = (reason as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : 0;
};

// VAPID sub（RFC 8292 的联系地址声明）**不发**：它是可选声明（SHOULD 非 MUST），且
// APNs 对 mailto:...@localhost 直接 403 BadJwtToken（真机排障 2026-10-17 实锤，报错
// 文案误导性极强）；而任何硬编码域名都无法代表「任意部署者的地址」——不发 sub 让每个
// 部署零配置合规（无 sub 实测 201）。web-push 库的 subject 校验强制非空，故 vapidDetails
// 传占位值仅为通过库校验（其只用于拼库版 Authorization 头，下方会被自签名覆盖）；加密层
// （aes128gcm/ECDH）不受影响仍走库产物。
const VAPID_SUBJECT_PLACEHOLDER = "mailto:agents-remote@invalid";

// createPrivateKey 的 JWK 导入每次发送重建（解析 + EC 导入）有常量开销——PushKeyManager
// 进程内返回同一 VapidKeys 实例，按对象身份 WeakMap 缓存派生 KeyObject 复用；换钥（重启
// 后新实例）自然失效（code review P3）。
const vapidPrivateKeyCache = new WeakMap<VapidKeys, KeyObject>();

const vapidPrivateKey = (vapid: VapidKeys): KeyObject => {
  let key = vapidPrivateKeyCache.get(vapid);
  if (!key) {
    const raw = Buffer.from(vapid.publicKey, "base64url"); // 65B：0x04 || x || y
    key = createPrivateKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: raw.subarray(1, 33).toString("base64url"),
        y: raw.subarray(33, 65).toString("base64url"),
        d: vapid.privateKey,
      },
      format: "jwk",
    });
    vapidPrivateKeyCache.set(vapid, key);
  }
  return key;
};

/** 自实现 VAPID JWT（RFC 8292，无 sub）：库版 Authorization 因强制 subject 不可用，
 *  签名逻辑很短（ES256 + aud/exp 两声明）不值得引新依赖。derToJose 语义：ECDSA DER 签名
 *  → JOSE raw（r||s 各 32B 左零填充）。 */
export const signVapidAuthorization = (endpoint: string, vapid: VapidKeys): string => {
  const privateKey = vapidPrivateKey(vapid);
  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const header = encode({ typ: "JWT", alg: "ES256" });
  const payload = encode({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + VAPID_TTL_SECONDS,
  });
  const secured = `${header}.${payload}`;
  const der = createSign("sha256").update(Buffer.from(secured)).sign(privateKey);
  // DER 签名（SEQUENCE{INTEGER r, INTEGER s}）→ raw：逐 INTEGER 去符号填充位后左补零。
  let offset = 2;
  const readInt = (): Buffer => {
    // 形状断言（security review P3）：DER 异常（截断/误用）显式抛错而非越界读出静默
    // 错误签名。sign() 产物恒合法，此路实际不可达——纯防御。
    if (offset + 2 > der.length || offset + 2 + der[offset + 1] > der.length) {
      throw new Error("malformed DER ECDSA signature");
    }
    const len = der[offset + 1];
    let value = der.subarray(offset + 2, offset + 2 + len);
    offset += 2 + len;
    if (value.length > 32) value = value.subarray(value.length - 32);
    return Buffer.concat([Buffer.alloc(32 - value.length, 0), value]);
  };
  const signature = Buffer.concat([readInt(), readInt()]);
  return `vapid t=${secured}.${signature.toString("base64url")}, k=${vapid.publicKey}`;
};

const defaultSend =
  (keys: { readOrCreate(): Promise<VapidKeys> }): PushSendFn =>
  async (subscription, payload) => {
    const vapid = await keys.readOrCreate();
    const details = generateRequestDetails(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: VAPID_SUBJECT_PLACEHOLDER,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
        TTL: PUSH_TTL_SECONDS,
      },
    );
    const response = await fetch(subscription.endpoint, {
      method: details.method,
      headers: {
        ...(details.headers as Record<string, string>),
        Authorization: signVapidAuthorization(subscription.endpoint, vapid),
      },
      // Buffer 不在 BodyInit 类型内（运行时同源 ArrayBuffer 视图，包一层即过）。
      body: details.body ? new Uint8Array(details.body) : undefined,
    });
    if (!response.ok) {
      const error = new Error(`push send failed: ${response.status}`) as Error & {
        statusCode: number;
      };
      error.statusCode = response.status;
      throw error;
    }
  };
