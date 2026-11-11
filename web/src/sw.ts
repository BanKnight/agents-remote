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

// ── Web Push 通知（PWA 通知批；2026-11-11 根治批 A 段）─────────────────
// WebKit 静默推送惩罚契约：每条 push 必须以 showNotification() 收尾，3 次不出通知
// 即撤销 origin 的推送权限（计数永不清零）。因此 push handler 无任何「不出通知就
// return」路径：坏帧出兜底卡、showNotification 被拒出最小参数兜底重试（A 段）。
// 「盯屏不打扰」上移服务端可见性抑制（B 段，sessions-stream visibility 帧），
// SW 层不再吞通知。payload 形状守卫与通知构造在 lib/push-notification.ts（零依赖，
// SW bundle 独立打包）。

import { buildPushNotification, type PushPayload } from "./lib/push-notification";

/** push 事件 → 未知负载：只做 json() 解析（code review P2-2——形状判定单源收敛到
 *  buildPushNotification，这里不再重复 isPushPayload）。解析失败按坏帧出兜底卡。 */
const parsePushPayload = (event: PushEvent): unknown => {
  try {
    return event.data?.json();
  } catch {
    return undefined;
  }
};

/** SW 侧异常/坏帧诊断中继：console + postMessage 回页面（SW 无 localStorage 落
 *  diag-log、iOS standalone 无 console——经页面 recordDiag("push") 落悬浮球缓冲）。 */
const reportPushDiag = async (text: string): Promise<void> => {
  console.warn(`[push-sw] ${text}`);
  try {
    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    for (const client of windowClients) client.postMessage({ kind: "push-diag", text });
  } catch {
    // 无客户端（冷启 push）时 postMessage 面不可用——console 已留痕。
  }
};

/** 任一窗口可见？（前台判定：后台 → 正常横幅；前台 → 桌面附 silent:true 静音增强。） */
const isAnyClientVisible = async (): Promise<boolean> => {
  try {
    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    return windowClients.some((client) => client.visibilityState === "visible");
  } catch {
    return false;
  }
};

const displayPush = async (event: PushEvent): Promise<void> => {
  const payload = parsePushPayload(event);
  const foregrounded = await isAnyClientVisible();
  const { title, options } = buildPushNotification(payload, foregrounded);
  try {
    await self.registration.showNotification(title, options);
  } catch (error) {
    await reportPushDiag(`showNotification rejected: ${String(error)}; fallback retry`);
    // 最小参数兜底重试（仅 title+body，排除一切可拒绝因素）；再拒绝只记录——
    // 义务已尽到，不叠兜底（避免 hide-forever 式循环）。
    try {
      await self.registration.showNotification(title, { body: options.body });
    } catch (retryError) {
      await reportPushDiag(`fallback showNotification also rejected: ${String(retryError)}`);
    }
  }
};

self.addEventListener("push", (event) => {
  event.waitUntil(displayPush(event));
});

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
