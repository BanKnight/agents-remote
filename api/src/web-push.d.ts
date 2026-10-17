// web-push 窄类型声明：本仓只用 generateVAPIDKeys + generateRequestDetails（加密产物层，
// 发送由 Bun fetch 承担——web-push 内置发送恒走 node:https.request，http endpoint 也强走
// TLS，且 Bun 下 sendNotification 请求层不可用，Spike 1 实证）。其余导出按 any 兜底。
declare module "web-push" {
  export type VapidDetails = { subject: string; publicKey: string; privateKey: string };

  export type GenerateRequestDetailsOptions = {
    vapidDetails?: VapidDetails;
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    topic?: string;
  };

  export type PushRequestDetails = {
    endpoint: string;
    method: "POST";
    headers: Record<string, string | number>;
    body?: Buffer;
  };

  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };

  export function generateRequestDetails(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string | Buffer | undefined | null,
    options?: GenerateRequestDetailsOptions,
  ): PushRequestDetails;
}
