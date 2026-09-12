/* ==========================================================================
   boot.js — 在首屏绘制前套用已保存的主题与背景，避免闪白 / 闪色
   这个文件故意写得很小，并且放在 <head> 里同步执行。
   ========================================================================== */
(function () {
  'use strict';
  var root = document.documentElement;

  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  /* 主题：没有存过就跟随系统 */
  try {
    var theme = read('cw.theme');
    if (theme !== 'light' && theme !== 'dark') {
      theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', theme);
  } catch (e) { /* 隐私模式等，忽略 */ }

  /* 背景：只套用「轻量」的部分（渐变 / 压暗 / 模糊）。
     自定义图片存在 IndexedDB 里，放进 <style> 里做会阻塞首屏，
     所以交给 background.js 在 DOMContentLoaded 后再贴上去。 */
  try {
    var raw = read('cw.bg');
    if (raw) {
      var cfg = JSON.parse(raw);
      if (cfg && typeof cfg === 'object') {
        if (cfg.tint) root.style.setProperty('--bg-tint', cfg.tint);
        if (typeof cfg.dim === 'number') root.style.setProperty('--bg-dim', String(cfg.dim / 100));
        if (typeof cfg.blur === 'number') root.style.setProperty('--bg-blur', cfg.blur + 'px');
        if (cfg.glass === false) root.setAttribute('data-glass', 'off');
      }
    }
  } catch (e) { /* 忽略 */ }
})();
