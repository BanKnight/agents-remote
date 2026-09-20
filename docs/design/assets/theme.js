/* ============================================================
   agents-remote · theme.js —— HTML 轨主题运行时（每个页面必引）
   职责：
   1. 解析主题：URL ?theme=light|dark（QA/分享用）→ localStorage 记忆 → 默认深色
   2. 接收 index.html 的 postMessage 广播 {type:'adr-theme', theme:'light'|'dark'}
   3. storage 事件：多窗口/多 tab 自动同步
   4. 就绪后向父窗口回报 {type:'adr-theme-ready'}，父窗口立即下发当前主题
   切主题 = 给 <html> 置 data-theme，tokens.css 完成换值。
   ============================================================ */
(function () {
  var KEY = 'adr-theme';
  function apply(t) { document.documentElement.dataset.theme = t; }
  function remember(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }

  /* 1. URL 参数优先（无头浏览器 QA / 指定主题分享链接） */
  try {
    var p = new URLSearchParams(location.search).get('theme');
    if (p === 'light' || p === 'dark') { apply(p); remember(p); }
  } catch (e) {}

  /* 2. localStorage 记忆 */
  try {
    var s = localStorage.getItem(KEY);
    if (s === 'light' || s === 'dark') apply(s);
  } catch (e) {}

  /* 3. index.html 广播 */
  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (d.type === 'adr-theme' && (d.theme === 'light' || d.theme === 'dark')) {
      apply(d.theme); remember(d.theme);
    }
  });

  /* 4. 跨窗口同步 */
  window.addEventListener('storage', function (ev) {
    if (ev.key === KEY && (ev.newValue === 'light' || ev.newValue === 'dark')) apply(ev.newValue);
  });

  /* 5. 就绪回报，父窗口可立刻补发当前主题（解决 lazy iframe 晚加载） */
  try { if (window.parent !== window) parent.postMessage({ type: 'adr-theme-ready' }, '*'); } catch (e) {}

  window.__adrTheme = function () { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; };
})();
