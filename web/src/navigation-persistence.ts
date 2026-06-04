const LAST_PATH_KEY = "last_path";

export function saveCurrentPath(pathname: string, search: string) {
  const href = pathname + search;
  if (href === "/") {
    localStorage.removeItem(LAST_PATH_KEY);
  } else {
    localStorage.setItem(LAST_PATH_KEY, href);
  }
}

export function restoreLastPath() {
  const savedPath = localStorage.getItem(LAST_PATH_KEY);
  if (savedPath && savedPath !== "/" && window.location.pathname === "/") {
    window.history.replaceState(null, "", savedPath);
  }
}
