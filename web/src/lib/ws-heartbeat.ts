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
