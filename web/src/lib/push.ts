import { getVapidPublicKey, subscribePush, unsubscribePush } from "../api/client";
import { isStandaloneDisplay } from "./display-mode";

// Web Push 客户端（PWA 通知批）。订阅必须 HTTPS + standalone（iOS 16.4+ 只在主屏
// PWA 暴露 push 权限）；enablePush 必须在用户手势内调用（Notification.requestPermission
// 在无手势上下文直接 denied）。支持性 gate 集中在 canUsePush，UI 层据此显「需添加到
// 主屏幕」等降级提示，不抛错。
export const canUsePush = (): boolean =>
  isStandaloneDisplay() &&
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const pushPermission = (): NotificationPermission =>
  typeof Notification === "undefined" ? "denied" : Notification.permission;

/** 现有推送订阅（未订阅 / SW 未注册 → null）。 */
export const getPushSubscription = async (): Promise<PushSubscription | null> => {
  if (!canUsePush()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
};

/** base64url（VAPID 公钥）→ Uint8Array<ArrayBuffer>（applicationServerKey 要求 BufferSource）。 */
export const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Url = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Url);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
};

/**
 * 开启推送（手势内）：请求系统权限 → 取 VAPID 公钥 → SW pushManager 订阅 → 上报服务端。
 * 已有订阅直接复用（重开开关幂等）。失败抛错由调用方展示行内提示。
 */
export const enablePush = async (): Promise<PushSubscription> => {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(`notification permission ${permission}`);
  }
  const { publicKey } = await getVapidPublicKey();
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error("service worker not registered");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  const json = subscription.toJSON();
  const keys = json.keys as { p256dh?: string; auth?: string } | undefined;
  if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error("incomplete push subscription");
  }
  await subscribePush({
    subscription: { endpoint: json.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
  });
  return subscription;
};

/** 关闭推送：退订 pushManager（有订阅时）+ 服务端移除记录（幂等）。 */
export const disablePush = async (): Promise<void> => {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await unsubscribePush({ endpoint });
  }
};
