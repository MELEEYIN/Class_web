/* ==========================================================================
   bg.js — 大学英语子站的背景层：与校园主页完全一致

   为什么要单独写一个：
     主页的背景由 site/js/background.js 负责，但它是一个绑死在主页 DOM 上的 IIFE
     （要拿 #bgPresets / #bgFile 这些元素），子站直接引会报错。
     而 site/js/boot.js 只套用了「轻量」的那两项（--bg-dim / --bg-blur），
     --bg-tint 与 --bg-image 它不管 —— 所以子站以前只有一层淡淡的渐变，
     主页上设过的自定义背景图在子站里完全看不到。

   这里做的就是把 background.js 的 apply() 按同一套规则复刻一遍：
     · 读同一个存储键 cw.bg（localStorage）
     · 读同一张图片 cw-bg / kv / bg-image（IndexedDB）
     · 用同一套预设渐变（表内容照抄 background.js 的 PRESETS）
     · 写同一组变量：--bg-tint / --bg-image / --bg-size / --bg-dim / --bg-blur

   ⚠️ 主页改预设或改变量名时，这里要同步 —— 两处是「同一份规则的两次实现」。
   ========================================================================== */
(function () {
  'use strict';

  var LS_KEY = 'cw.bg';
  var DB_NAME = 'cw-bg';
  var IDB_STORE = 'kv';
  var IDB_KEY = 'bg-image';

  var DEFAULT_LIGHT = 'linear-gradient(180deg,#f3f8ff 0%,#eaf2fe 60%,#f5f9ff 100%)';
  var DEFAULT_DARK = 'linear-gradient(180deg,#060d1a 0%,#08111f 60%,#060d1a 100%)';

  /* 与 site/js/background.js 的 PRESETS 保持一致 */
  var PRESETS = [
    { id: 'theme', light: 'none', dark: 'none' },
    { id: 'paper', light: 'linear-gradient(180deg,#ffffff 0%,#f4f8fd 60%,#eef4fc 100%)',
      dark: 'linear-gradient(180deg,#070d18 0%,#0a1220 60%,#070d18 100%)' },
    { id: 'sky', light: 'linear-gradient(165deg,#eaf4ff 0%,#d6e9ff 45%,#f3f9ff 100%)',
      dark: 'linear-gradient(165deg,#061124 0%,#0a1c36 50%,#060e1c 100%)' },
    { id: 'ice', light: 'linear-gradient(205deg,#f9fcff 0%,#e1edfc 55%,#edf5ff 100%)',
      dark: 'linear-gradient(205deg,#040a14 0%,#0a1526 55%,#060d19 100%)' },
    { id: 'deep', light: 'linear-gradient(170deg,#e9f3ff 0%,#d2e5fb 55%,#eef6ff 100%)',
      dark: 'linear-gradient(170deg,#030d1c 0%,#072039 55%,#030d1c 100%)' },
    { id: 'mist', light: 'linear-gradient(140deg,#eef7ff 0%,#e4eefb 40%,#fbfdff 100%)',
      dark: 'linear-gradient(140deg,#070f1c 0%,#0f1c2e 45%,#070f1c 100%)' },
    { id: 'ink', light: 'linear-gradient(150deg,#f7f9fc 0%,#e6edf7 50%,#f4f8fc 100%)',
      dark: 'linear-gradient(150deg,#070a11 0%,#111a26 50%,#070a11 100%)' },
    { id: 'grid',
      light: 'linear-gradient(rgba(37,99,235,.055) 1px, transparent 1px),' +
             'linear-gradient(90deg, rgba(37,99,235,.055) 1px, transparent 1px)',
      dark: 'linear-gradient(rgba(120,170,255,.075) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(120,170,255,.075) 1px, transparent 1px)',
      gridSize: '34px 34px' }
  ];

  var CFG = {
    preset: 'theme', mode: 'preset', imageUrl: '',
    dim: 0, blur: 0, glass: true
  };

  var objectUrl = null;

  function readCfg() {
    var raw = null;
    try { raw = JSON.parse(window.localStorage.getItem(LS_KEY)); } catch (e) { return; }
    if (!raw || typeof raw !== 'object') return;
    Object.keys(CFG).forEach(function (k) {
      if (raw[k] !== undefined && raw[k] !== null) CFG[k] = raw[k];
    });
    CFG.dim = Math.min(80, Math.max(0, Number(CFG.dim) || 0));
    CFG.blur = Math.min(24, Math.max(0, Number(CFG.blur) || 0));
    if (CFG.mode !== 'image') CFG.mode = 'preset';
  }

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; ++i) if (PRESETS[i].id === id) return PRESETS[i];
    return PRESETS[0];
  }

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function apply() {
    var root = document.documentElement;
    var dark = isDark();
    var preset = presetById(CFG.preset);

    /* 1. 底层渐变 */
    var tint;
    if (CFG.mode === 'image') {
      tint = dark ? DEFAULT_DARK : DEFAULT_LIGHT;
    } else {
      tint = dark ? preset.dark : preset.light;
      if (tint === 'none') tint = dark ? DEFAULT_DARK : DEFAULT_LIGHT;
    }
    root.style.setProperty('--bg-tint', tint);

    /* 2. 覆盖层：自定义图片 / 带纹理的预设 / 无 */
    var layer = 'none';
    var size = 'cover, cover';
    if (CFG.mode === 'image') {
      var url = objectUrl || CFG.imageUrl;
      if (url) layer = 'url("' + String(url).replace(/"/g, '%22') + '")';
    } else if (preset.gridSize) {
      layer = dark ? preset.dark : preset.light;
      size = preset.gridSize + ', ' + preset.gridSize;
    }
    root.style.setProperty('--bg-image', layer);
    root.style.setProperty('--bg-size', size);

    /* 3. 压暗 / 模糊 */
    root.style.setProperty('--bg-dim', String(CFG.dim / 100));
    root.style.setProperty('--bg-blur', CFG.blur + 'px');

    /* 4. 有自定义背景图时把面板调薄，保证卡片上的文字仍然看得清 */
    var hasImg = (CFG.mode === 'image' && layer !== 'none');
    root.style.setProperty('--panel-a', hasImg ? (dark ? 0.86 : 0.9) : (dark ? 0.94 : 1));
  }

  /* 从主页那颗 IndexedDB 键里把图片取回来（同源，能直接读到） */
  function loadImage() {
    if (!window.indexedDB) return;
    var req;
    try { req = window.indexedDB.open(DB_NAME, 1); }
    catch (e) { return; }
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onerror = function () { /* 打不开就算了，渐变已经铺上 */ };
    req.onblocked = function () { /* 同上 */ };
    req.onsuccess = function () {
      var db = req.result;
      try {
        var get = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      } catch (e) { return; }
      get.onerror = function () { /* 忽略 */ };
      get.onsuccess = function () {
        var blob = get.result;
        if (!blob || !blob.size) return;
        if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (e) {} }
        objectUrl = URL.createObjectURL(blob);
        apply();
      };
    };
  }

  function init() {
    readCfg();
    apply();
    if (CFG.mode === 'image' && !CFG.imageUrl) loadImage();

    /* 深浅色切换（导航栏那颗按钮）后重新取一遍预设渐变 */
    if (window.MutationObserver) {
      new MutationObserver(apply).observe(document.documentElement, {
        attributes: true, attributeFilter: ['data-theme']
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
