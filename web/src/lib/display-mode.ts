// PWA standalone（已安装）检测：`display-mode: standalone`（Chromium/标准）或
// `navigator.standalone`（iOS Safari 专有属性）。06 登录页（PWA 提示仅在非 standalone 显示）
// 与 07 设置「服务器」组 PWA 行共用同一判定——单一实现避免两处漂移（code review P2）。

export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && window.navigator.standalone === true)
  );
}
