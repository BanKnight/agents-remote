/**
 * WS 长连接应用层心跳间隔(客户端发起)。
 *
 * 重置 cloudflare edge(~100s)/ 移动 NAT(~60s)/ Bun idleTimeout(120s)三层空闲
 * 超时,防止 terminal/claude2 详情页前台空闲时 WS 被中间层静默断开。浏览器 JS
 * 无法发协议层 ping(W3C WebSocket API 无 sendPing),只能发应用层 {type:"ping"}
 * JSON——这是客户端发起心跳的唯一可行形式。
 *
 * 25s 给三层超时都留足余量,又不频繁到浪费带宽(几十字节/次)。客户端发起分散
 * 了定时器压力,服务端不额外维护心跳定时器(Bun 内置 sendPings 是 C 层兜底)。
 */
export const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * 距上次 pong 超过此阈值即判定连接 half-open（readyState 仍 OPEN 但对端不回 pong）。
 *
 * 取 2 倍心跳周期：容忍 1 次丢包/网络抖动，连续 2 次心跳仍无 pong 才判死，避免误杀
 * 健康连接。挂后台很久（分钟~小时级）回前台时 lastPong 必然远超此值 → visibilitychange
 * 立即触发重连；前台持续 half-open 的检测延迟 ≤ 此值。
 */
export const PONG_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2; // 50_000
