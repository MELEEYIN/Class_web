/* ==========================================================================
   boot.js — 在首屏绘制前套用「显示模式 / 主题 / 背景」
   这个文件故意写得很小，并且放在 <head> 里同步执行：
   如果等到 body 里的脚本再切换手机版布局，手机上会先闪一下桌面版。
   ========================================================================== */
(function () {
  'use strict';
  var root = document.documentElement;

  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function readJson(key, fallback) {
    var raw = read(key);
    if (raw === null || raw === undefined) return fallback;
    try {
      var v = JSON.parse(raw);
      return (v === null || v === undefined) ? fallback : v;
    } catch (e) {
      return raw;   // 兼容早期直接存的裸字符串
    }
  }

  /* ------------------------------------------------------------------------
     显示模式
     这个函数是「唯一实现」：view.js 也会调用它，避免两处判断不一致。
     返回 'mobile' 或 'desktop'。
     ------------------------------------------------------------------------ */
  window.CW_RESOLVE_VIEW = function (pref) {
    if (pref === 'mobile' || pref === 'desktop') return pref;   // 手动指定优先
    var w = window.innerWidth || root.clientWidth || 1024;
    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    if (w <= 720) return 'mobile';                 // 窄屏一律手机版
    if (coarse && touch && w <= 900) return 'mobile';  // 手机横屏 / 小平板
    return 'desktop';
  };

  /* 主题：没有存过就跟随系统 */
  try {
    var theme = readJson('cw.theme', null);
    if (theme !== 'light' && theme !== 'dark') {
      theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', theme);
  } catch (e) { /* 隐私模式等，忽略 */ }

  /* 显示模式 */
  try {
    var pref = readJson('cw.view', 'auto');
    if (pref !== 'mobile' && pref !== 'desktop') pref = 'auto';
    root.setAttribute('data-view-pref', pref);
    root.setAttribute('data-view', window.CW_RESOLVE_VIEW(pref));
  } catch (e) {
    root.setAttribute('data-view', 'desktop');
    root.setAttribute('data-view-pref', 'auto');
  }

  /* 背景：只套用「轻量」的部分（渐变 / 压暗 / 模糊）。
     自定义图片存在 IndexedDB 里，交给 background.js 在 DOMContentLoaded 后再贴。 */
  try {
    var cfg = readJson('cw.bg', null);
    if (cfg && typeof cfg === 'object') {
      if (cfg.tint) root.style.setProperty('--bg-tint', cfg.tint);
      if (typeof cfg.dim === 'number') root.style.setProperty('--bg-dim', String(cfg.dim / 100));
      if (typeof cfg.blur === 'number') root.style.setProperty('--bg-blur', cfg.blur + 'px');
      if (cfg.glass === false) root.setAttribute('data-glass', 'off');
    }
  } catch (e) { /* 忽略 */ }
})();
