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

// ── 设备随机 ID（死订阅清理批，2026-11-03）────────────────────────
// iOS 订阅死亡重订阅后 APNs 生成新 endpoint，服务端按 endpoint 去重的 upsert 会留下
// 永远 201 的死记录。上报时带 localStorage 持久化的随机 ID，服务端 upsert 即替换
// 同 ID 旧记录（一设备一记录）——对账自愈/手动重开走 enablePush 天然完成替换。

const PUSH_DEVICE_ID_KEY = "agents-remote.pushDeviceId";

/** 设备随机 ID（惰性生成并持久化；同设备跨会话稳定）。 */
export const pushDeviceId = (): string => {
  try {
    const existing = localStorage.getItem(PUSH_DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(PUSH_DEVICE_ID_KEY, id);
    return id;
  } catch {
    // 存储故障（Safari 禁用存储 / 配额满）：降级一次性 ID——订阅上报照常，仅失去
    // 跨会话替换语义（deviceId optional 兼容面），不阻断订阅本身。
    return crypto.randomUUID();
  }
};

/**
 * 开启推送：请求系统权限 → 取 VAPID 公钥 → SW pushManager 订阅 → 上报服务端。
 * 已有订阅直接复用（重开开关幂等）。失败抛错由调用方展示行内提示。
 * 两语境共用：①设置页开关（用户手势内——首次授权需手势弹窗）②静默对账
 * （reconcilePushSubscription；权限已 granted 时 requestPermission 同步返回 granted，
 * 不弹窗、无手势要求）。
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
    deviceId: pushDeviceId(),
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

// ── 订阅死亡静默对账（2026-11-03 通知排障拍板）────────────────────
// 背景：iOS 对主屏 PWA 的 push 订阅会在 SW 更新/系统更新/长期未激活后静默撤销
// （设备端 getSubscription() → null），而 APNs 对死 endpoint 仍报 201——服务端
// 零失败日志、设备永收不到，唯一线索是设置页开关变回关闭（2026-11-02 真机排障实锤）。
// 对账 = 前台激活时检查三 gate，全过即静默重订阅自愈，不再依赖用户偶然进设置页发现。

let reconcileInFlight = false;

/**
 * 订阅死亡对账（幂等、静默）：仅在「支持 push + 权限已 granted + 订阅确实没了」时
 * 复用 enablePush 重新订阅上报；其余情况（非 standalone / 权限未授权 / 订阅健在）
 * 直接跳过——首次授权必须用户手势，不属于对账职责（那是设置页开关的事）。
 * 返回是否触发了重新订阅（测试/调试用；失败内部吞掉只告警——自愈机制不允许打扰）。
 */
export const reconcilePushSubscription = async (): Promise<boolean> => {
  if (!canUsePush() || pushPermission() !== "granted") return false;
  // visibility 抖动并发防护：iOS 切 app 快速往返会连发多次 visible。
  if (reconcileInFlight) return false;
  reconcileInFlight = true;
  try {
    const existing = await getPushSubscription();
    if (existing) return false;
    await enablePush();
    return true;
  } catch (error) {
    // 吞错面覆盖全 async 段：SW/pushManager 边缘态 reject 与 enablePush 失败同样
    // 只告警（调用点都是 void，rejection 逃出即 unhandled）——自愈机制不允许打扰。
    console.warn("[push] reconcile resubscribe failed:", error);
    return false;
  } finally {
    reconcileInFlight = false;
  }
};
