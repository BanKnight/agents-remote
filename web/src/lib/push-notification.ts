// Push 通知构造纯函数（PWA 通知批，2026-11-11 根治批 A 段）：
// sw.ts 的 push handler 必须「每推必显」（WebKit 静默推送惩罚：3 次不出通知即撤销
// origin 的推送权限，计数永不清零）——坏帧与 showNotification 拒绝一律出兜底卡，
// 不再 return。本模块零依赖（SW bundle 独立打包，只含类型/常量/纯函数）。
// payload 形状 = shared 的 PushMessagePayload（服务端 JSON.stringify 后经 aes128gcm
// 加密）；网络来料不可信，运行时手写形状守卫（不引 shared 的类型层校验）。

type PushPayload = {
  kind: string;
  title: string;
  body: string;
  url: string;
  sessionId: string;
};

export type { PushPayload };

export const isPushPayload = (value: unknown): value is PushPayload => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === "string" &&
    // 显示字段非空才认：空 title/body 的形状合法帧在部分引擎会拒显（或显空卡）——
    // 按坏帧出兜底卡，比赌引擎行为稳。
    typeof v.title === "string" &&
    v.title.length > 0 &&
    typeof v.body === "string" &&
    v.body.length > 0 &&
    typeof v.url === "string" &&
    typeof v.sessionId === "string"
  );
};

export const PUSH_FALLBACK_TITLE = "agents-remote";
export const PUSH_FALLBACK_BODY = "收到一条通知，但内容无法解析；点按打开应用查看";
const NOTIFICATION_ICON = "/icons/icon-192.png";
/** 连续坏帧合并为一张卡（固定 tag 顶替），不刷屏。 */
const FALLBACK_TAG = "push-fallback";

export type PushNotificationContent = {
  title: string;
  options: NotificationOptions;
};

/**
 * push 事件 → 通知内容：合法帧原样呈现（tag = sessionId，同会话后到卡顶掉旧卡；
 * data 带 payload 供 notificationclick 深链）；坏帧出兜底卡（无 data，click 落 "/"）。
 * foregrounded（app 前台）：附 silent:true 静音增强——桌面 Chrome/Android 支持，
 * iOS 不支持该属性（忽略无害）；iOS 的「盯屏不打扰」由服务端可见性抑制承担（B 段）。
 * 契约：任何输入返回可显示的内容（title/body 恒非空）——showNotification 只可能
 * 因参数被拒，不会因本函数产物缺失而跳过。
 */
export const buildPushNotification = (
  payload: unknown,
  foregrounded: boolean,
): PushNotificationContent => {
  if (!isPushPayload(payload)) {
    return {
      title: PUSH_FALLBACK_TITLE,
      options: { body: PUSH_FALLBACK_BODY, icon: NOTIFICATION_ICON, tag: FALLBACK_TAG },
    };
  }
  return {
    title: payload.title,
    options: {
      body: payload.body,
      icon: NOTIFICATION_ICON,
      tag: payload.sessionId,
      data: payload,
      ...(foregrounded ? { silent: true } : {}),
    },
  };
};
