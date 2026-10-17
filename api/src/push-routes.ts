import type {
  PushSubscribeRequest,
  PushUnsubscribeRequest,
  PushVapidPublicKeyResponse,
} from "@agents-remote/shared";
import { jsonError } from "./http-auth";
import { PushSubscriptionStore } from "./push-subscription-store";
import type { PushKeyManager } from "./push-keys";

// Web Push 订阅 REST（PWA 通知批），照 settings-routes 手写路由分发模式。
// 挂载在 index.ts 的 requireHttpAuth 已认证段（settings 路由同段结构挂载）。

const JSON_HEADERS = { "content-type": "application/json" };

export const handlePushRoutes = async (
  request: Request,
  url: URL,
  deps: { keys: PushKeyManager; subscriptions: PushSubscriptionStore },
): Promise<Response | undefined> => {
  if (url.pathname === "/api/push/vapid-public-key" && request.method === "GET") {
    const keys = await deps.keys.readOrCreate();
    const response: PushVapidPublicKeyResponse = { publicKey: keys.publicKey };
    return new Response(JSON.stringify(response), { headers: JSON_HEADERS });
  }

  if (url.pathname === "/api/push/subscriptions" && request.method === "POST") {
    const body = (await request.json().catch(() => undefined)) as PushSubscribeRequest | undefined;
    if (!body || !isSubscriptionShape(body)) {
      return jsonError("SETTINGS_INVALID", "invalid subscription", 400);
    }
    await deps.subscriptions.upsert({
      endpoint: body.subscription.endpoint,
      p256dh: body.subscription.keys.p256dh,
      auth: body.subscription.keys.auth,
    });
    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
  }

  if (url.pathname === "/api/push/subscriptions" && request.method === "DELETE") {
    const body = (await request.json().catch(() => undefined)) as
      | PushUnsubscribeRequest
      | undefined;
    if (!body || typeof body.endpoint !== "string" || !body.endpoint) {
      return jsonError("SETTINGS_INVALID", "invalid endpoint", 400);
    }
    await deps.subscriptions.remove(body.endpoint);
    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
  }

  return undefined;
};

// 纵深加固（security review P3-1）：endpoint 限 https URL（push service 均为 https），
// 防「认证后注册内网 URL → 服务端每次推送时 POST 内网」的盲 SSRF 面；keys 限长防
// 认证后缓慢撑盘（每次 upsert 全量重写订阅文件）。
const ENDPOINT_MAX_LENGTH = 2048;
const KEY_MAX_LENGTH = 512;

const isSubscriptionShape = (body: PushSubscribeRequest): boolean => {
  const sub = body.subscription;
  if (
    !sub ||
    typeof sub.endpoint !== "string" ||
    sub.endpoint.length > ENDPOINT_MAX_LENGTH ||
    typeof sub.keys?.p256dh !== "string" ||
    !sub.keys.p256dh ||
    sub.keys.p256dh.length > KEY_MAX_LENGTH ||
    typeof sub.keys?.auth !== "string" ||
    !sub.keys.auth ||
    sub.keys.auth.length > KEY_MAX_LENGTH
  ) {
    return false;
  }
  try {
    return new URL(sub.endpoint).protocol === "https:";
  } catch {
    return false;
  }
};
