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

export const pushTitle = (info: { projectName: string; sessionName?: string }): string =>
  info.sessionName || info.projectName;

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

// VAPID sub 联系地址：**不能用 localhost 域**——APNs 对 mailto:...@localhost 直接
// 403 BadJwtToken（真机通知排障 2026-10-17 实锤：Node/Bun、自实现/库签名、curl/fetch
// 全部复现，换域名同密钥同订阅立即 201）。
const VAPID_SUBJECT = "mailto:notify@bannight.com";

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
          subject: VAPID_SUBJECT,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
        TTL: 3600,
      },
    );
    const response = await fetch(subscription.endpoint, {
      method: details.method,
      headers: details.headers as Record<string, string>,
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
