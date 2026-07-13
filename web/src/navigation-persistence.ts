const LAST_PATH_KEY = "last_path";

// 仅 standalone PWA（装到主屏）才持久化/恢复上次路径；浏览器 tab 不参与。
// 否则会把「主动导航到 /」误判为「冷启动落到 /、需要恢复」而 replaceState 跳回上次位置
//（如 /files → 改 / → boot 命中 pathname==="/" → 跳回 /files）。与 AuthGate 内判定同源。
const isStandaloneDisplay = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && window.navigator.standalone === true));

export function saveCurrentPath(pathname: string, search: string) {
  if (!isStandaloneDisplay()) return;
  const href = pathname + search;
  if (href === "/") {
    localStorage.removeItem(LAST_PATH_KEY);
  } else {
    localStorage.setItem(LAST_PATH_KEY, href);
  }
}

export function restoreLastPath() {
  if (!isStandaloneDisplay()) return;
  const savedPath = localStorage.getItem(LAST_PATH_KEY);
  if (savedPath && savedPath !== "/" && window.location.pathname === "/") {
    window.history.replaceState(null, "", savedPath);
  }
}
