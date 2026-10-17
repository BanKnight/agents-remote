/// <reference lib="webworker" />
// 自定义 Service Worker（vite-plugin-pwa injectManifest 策略，PWA Web Push 批）：
// 保留 generateSW 时代的行为——全量 precache + navigateFallback——并承载 push /
// notificationclick handler（generateSW 模式无法注入自定义事件代码）。
// ⚠️ registerType: "autoUpdate" 只影响客户端 registerSW 的自动 reload 行为；
// skipWaiting/clientsClaim 在 injectManifest 模式必须在这里手写（缺了会导致新 SW
// 永久 waiting、发版不生效）。
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

// 与 vite.config.ts injectManifest.injectionPoint 对应（默认值即此，显式写出仅作文档）。
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA 导航全部 fallback 到 precached index.html（原 generateSW navigateFallback 语义）；
// /p/... 是对外直访静态站点，必须排除（原 navigateFallbackDenylist）。
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html"), { denylist: [/^\/p\//] }));

self.skipWaiting();
clientsClaim();

// ── Web Push 通知（PWA 通知批）──────────────────────────────────────────
// payload 形状 = shared 的 PushMessagePayload（服务端 JSON.stringify 后经 aes128gcm 加密）；
// 网络来料不可信，运行时手写形状守卫（SW bundle 里不引 shared 的类型层校验）。

type PushPayload = {
  kind: string;
  title: string;
  body: string;
  url: string;
  sessionId: string;
};

const isPushPayload = (value: unknown): value is PushPayload => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === "string" &&
    typeof v.title === "string" &&
    typeof v.body === "string" &&
    typeof v.url === "string" &&
    typeof v.sessionId === "string"
  );
};

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  // 坏帧忽略（不 showNotification 会遭浏览器 user-visible-only 惩罚，忽略优于惩罚）。
  if (!payload) return;
  event.waitUntil(showPushNotification(payload));
});

const parsePushPayload = (event: PushEvent): PushPayload | undefined => {
  try {
    const parsed: unknown = event.data?.json();
    return isPushPayload(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const showPushNotification = async (payload: PushPayload): Promise<void> => {
  // 前台抑制：任一窗口正盯着看（visible）→ 不打扰，会话页自己会渲染状态变化。
  const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (windowClients.some((client) => client.visibilityState === "visible")) return;
  await self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icons/icon-192.png",
    // 同会话合并替换：tag 只含 sessionId，后到通知（如 done）顶掉旧卡（如 blocked），
    // 不留过期卡片；kind 语义已在 title/body 表达（code review P2-1）。
    tag: payload.sessionId,
    data: payload,
  });
};

self.addEventListener("notificationclick", (event) => {
  const data: unknown = event.notification.data;
  const target =
    data && typeof data === "object" && typeof (data as PushPayload).url === "string"
      ? (data as PushPayload).url
      : "/";
  event.notification.close();
  event.waitUntil(focusOrOpen(target));
});

/** 深链聚焦：有窗口 → focus + navigate（失败退 openWindow）；无窗口 → openWindow（iOS 冷启）。 */
const focusOrOpen = async (target: string): Promise<void> => {
  const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windowClients[0];
  if (existing) {
    await existing.focus();
    try {
      if ("navigate" in existing) await existing.navigate(target);
      else await self.clients.openWindow(target);
    } catch {
      // navigate 被拒（跨源等）→ 兜底开新窗口。
      await self.clients.openWindow(target);
    }
    return;
  }
  await self.clients.openWindow(target);
};
