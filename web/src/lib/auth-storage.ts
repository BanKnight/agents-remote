// 免登标记（localStorage）：登录成功写 "1"，AuthGate 据此在 auth 检查期间直接放行
// 上次位置（避免冷启动闪登录帧）；退出登录 / 收到 auth:unauthenticated 时清除。
// 与 HttpOnly token cookie 分工：cookie 是权威凭证（前端读不到、后端清），本标记只是
// 「本设备曾成功登录」的乐观提示，清掉不影响正确性（下次 me 校验会拦住）。

const AUTH_OK_KEY = "auth_ok";

export function readAuthOk(): boolean {
  try {
    return localStorage.getItem(AUTH_OK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAuthOk(): void {
  try {
    localStorage.setItem(AUTH_OK_KEY, "1");
  } catch {
    // localStorage unavailable
  }
}

export function clearAuthOk(): void {
  try {
    localStorage.removeItem(AUTH_OK_KEY);
  } catch {
    // localStorage unavailable
  }
}
