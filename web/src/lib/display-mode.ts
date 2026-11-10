// PWA standalone（已安装）检测：`display-mode: standalone`（Chromium/标准）或
// `navigator.standalone`（iOS Safari 专有属性）。06 登录页（PWA 提示仅在非 standalone 显示）
// 与 07 设置「服务器」组 PWA 行共用同一判定——单一实现避免两处漂移（code review P2）。

export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && window.navigator.standalone === true)
  );
}

/**
 * 「移动安装的 PWA」：standalone **且** primary pointer 触屏（§7 口径 hover:none +
 * pointer:coarse）。语义 = 「同源链接开不了新窗口」的安装形态——iOS/Android WebKit
 * standalone 里 target=_blank / window.open 都降级当前视图导航（2026-11-09 真机报障
 * 三轮定案），app 内预览层是唯一出路。桌面安装的 Chrome/Edge PWA 不在此列：Chromium
 * 的 _blank 正常开浏览器新标签（2026-11-10 用户拍板「桌面跳出浏览器更合适」），且触屏
 * 笔记本 primary pointer 是鼠标（fine）也正确落桌面侧。pages 行点击 gate 专用；
 * 「是否已安装」语义仍用 isStandaloneDisplay。
 */
export function isMobileStandaloneDisplay(): boolean {
  return isStandaloneDisplay() && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}
