/* ==========================================================================
   skin.js — 课程学习站的「背景与外观」面板
   --------------------------------------------------------------------------
   为什么单独一个文件：
     算法站（/acm）的外观面板是写死在 acm/index.html 里、由 shell.js 驱动的；
     /en 的四个页面没有 shell.js，也没有那段 DOM。这里用**和算法站同一套**
     标记与样式（shell.css 的 .sheet / .srow / .walls / .wbtn / .rng）把面板
     在运行时搭出来，所以两边长得完全一样，页面 HTML 不用各写一遍。

   和算法站对齐的地方（v2，2026-09）：
     1) 预设背景改成六格缩略图：无 / 极光 / 网格 / 圆点 / 星点 / 斜纹
     2) 三个滑杆：模糊 0–24px、透明度 10–100%、压暗 0–80%
     3) 选图走 <label class="up-btn">，与算法站同一个文件输入样式
     4) 选图后自动压到 1600px 长边、JPEG 0.82，并把压暗默认拨到 40%，
        否则照片会把正文洗白（这是算法站踩过的坑）
     5) 状态存 localStorage，键 cw.en.bg，只影响本机

   另外还保留一条算法站没有的路子：直接粘贴图片链接（https 或 data:），
   省得每次都要找本地文件。
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'cw.en.bg';
  var PRESETS = ['none', 'aurora', 'grid', 'dots', 'star', 'wave'];
  var LABEL = { none: '无', aurora: '极光', grid: '网格', dots: '圆点', star: '星点', wave: '斜纹' };
  var DEF = { mode: 'preset', preset: 'none', src: '', blur: 0, op: 100, dim: 0 };

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var st = load();

  function load() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { o = {}; }
    var out = { mode: 'preset', preset: 'none', src: '', blur: 0, op: 100, dim: 0 };
    if (o.mode === 'image') out.mode = 'image';
    if (PRESETS.indexOf(o.preset) > -1) out.preset = o.preset;
    if (typeof o.src === 'string') out.src = o.src;
    out.blur = clamp(o.blur, 0, 24, 0);
    out.op = clamp(o.op, 10, 100, 100);
    out.dim = clamp(o.dim, 0, 80, 0);
    return out;
  }

  function clamp(v, lo, hi, def) {
    var n = Number(v);
    if (!isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); }
    catch (e) { alert('这张图存不下了（浏览器本地存储约 5MB）。换一张小一点的，或用图片链接。'); }
  }

  /* ---------------------------------------------------------- 1. 背景层 */
  var bg = $('#bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.className = 'bg';
    bg.id = 'bg';
    bg.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(bg, document.body.firstChild);
  }
  var dim = $('#bgDim');
  if (!dim) {
    dim = document.createElement('div');
    dim.className = 'bg-dim';
    dim.id = 'bgDim';
    dim.setAttribute('aria-hidden', 'true');
    bg.parentNode.insertBefore(dim, bg.nextSibling);
  }

  function apply() {
    var custom = st.mode === 'image' && !!st.src;
    root.setAttribute('data-wall', custom ? 'custom' : st.preset);
    if (custom) {
      bg.setAttribute('data-p', '');
      bg.style.backgroundImage = 'url("' + String(st.src).replace(/"/g, '%22') + '")';
    } else {
      bg.setAttribute('data-p', st.preset);
      bg.style.backgroundImage = '';
    }
    bg.style.filter = st.blur ? 'blur(' + st.blur + 'px) saturate(1.05)' : 'none';
    bg.style.opacity = String(st.op / 100);
    dim.style.background = st.dim ? 'rgba(2,6,14,' + (st.dim / 100).toFixed(2) + ')' : 'transparent';
  }

  /* ---------------------------------------------------------- 2. 顶栏按钮 */
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/>' +
    '<circle cx="8.6" cy="9.4" r="1.5"/><path d="m3.5 16.5 4.7-4.2 3.4 3 2.6-2.3 5.8 5"/></svg>';

  var bar = $('.top-r');
  if (bar && !$('#skinBtn')) {
    var btn = document.createElement('button');
    btn.className = 'top-btn';
    btn.type = 'button';
    btn.id = 'skinBtn';
    btn.title = '背景与外观';
    btn.innerHTML = ICON + '<span class="tl">外观</span>';
    bar.insertBefore(btn, bar.firstChild);
  }

  /* ---------------------------------------------------------- 3. 面板 DOM */
  var walls = PRESETS.map(function (p) {
    return '<button class="wbtn" type="button" data-p="' + p + '">' + LABEL[p] + '</button>';
  }).join('');

  var sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.id = 'skinSheet';
  sheet.innerHTML =
    '<div class="sheet-mask" data-close></div>' +
    '<div class="sheet-box" role="dialog" aria-modal="true" aria-label="背景与外观">' +
      '<div class="sheet-h"><b>背景与外观</b>' +
        '<button class="sheet-x" type="button" data-close aria-label="关闭">✕</button></div>' +
      '<div class="sheet-body">' +
        '<div class="srow"><div class="srow-t">预设背景<em>只影响背景层，不影响正文可读性</em></div>' +
          '<div class="walls">' + walls + '</div></div>' +
        '<div class="srow"><div class="srow-t">自定义图片<em>保存在本机，不上传</em></div>' +
          '<div class="up-row">' +
            '<label class="up-btn">选择图片<input type="file" id="skFile" accept="image/*" hidden></label>' +
            '<button class="up-btn ghost" type="button" id="skClear">清除图片</button>' +
          '</div>' +
          '<div class="up-row" style="margin-top:8px">' +
            '<input class="sk-url" id="skUrl" type="url" placeholder="或粘贴图片链接 https://…">' +
            '<button class="up-btn" type="button" id="skApply">用链接</button>' +
          '</div>' +
          '<div class="sk-prev" id="skPrev"></div></div>' +
        '<div class="srow"><div class="srow-t">模糊<b id="skBlurV">0px</b></div>' +
          '<input class="rng" id="skBlur" type="range" min="0" max="24" step="1"></div>' +
        '<div class="srow"><div class="srow-t">透明度<b id="skOpV">100%</b></div>' +
          '<input class="rng" id="skOp" type="range" min="10" max="100" step="1"></div>' +
        '<div class="srow"><div class="srow-t">压暗<b id="skDimV">0%</b></div>' +
          '<input class="rng" id="skDim" type="range" min="0" max="80" step="1"></div>' +
        '<div class="sheet-f"><button class="up-btn ghost" type="button" id="skReset">恢复默认</button>' +
          '<span>图片会自动压缩到 1600px 内；设置存在本机，换设备不同步。</span></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(sheet);

  var elBlur = $('#skBlur', sheet), elOp = $('#skOp', sheet), elDim = $('#skDim', sheet);
  var elBlurV = $('#skBlurV', sheet), elOpV = $('#skOpV', sheet), elDimV = $('#skDimV', sheet);
  var elPrev = $('#skPrev', sheet), elUrl = $('#skUrl', sheet);

  function syncPanel() {
    var custom = st.mode === 'image' && !!st.src;
    $$('.wbtn', sheet).forEach(function (b) {
      b.classList.toggle('on', !custom && b.getAttribute('data-p') === st.preset);
    });
    elBlur.value = st.blur; elBlurV.textContent = st.blur + 'px';
    elOp.value = st.op; elOpV.textContent = st.op + '%';
    elDim.value = st.dim; elDimV.textContent = st.dim + '%';
    if (custom) {
      elPrev.innerHTML = '<img src="' + st.src + '" alt="当前背景">';
      elPrev.classList.add('has');
      elUrl.value = /^https?:/i.test(st.src) ? st.src : '';
    } else {
      elPrev.innerHTML = '';
      elPrev.classList.remove('has');
    }
  }

  function open() { syncPanel(); sheet.classList.add('open'); }
  function close() { sheet.classList.remove('open'); }

  var skinBtn = $('#skinBtn');
  if (skinBtn) skinBtn.addEventListener('click', open);
  sheet.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  $$('.wbtn', sheet).forEach(function (b) {
    b.addEventListener('click', function () {
      st.mode = 'preset';
      st.preset = b.getAttribute('data-p');
      st.src = '';
      save(); apply(); syncPanel();
    });
  });

  /* 选图 → 压到 1600px 长边 → JPEG 0.82 → dataURL */
  $('#skFile', sheet).addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var url = URL.createObjectURL(f);
    var img = new Image();
    img.onload = function () {
      var MAX = 1600;
      var k = Math.min(1, MAX / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      st.mode = 'image';
      st.src = c.toDataURL('image/jpeg', 0.82);
      if (!st.dim) st.dim = 40;
      save(); apply(); syncPanel();
    };
    img.onerror = function () { URL.revokeObjectURL(url); alert('这张图读不了，换一张试试。'); };
    img.src = url;
    e.target.value = '';
  });

  $('#skClear', sheet).addEventListener('click', function () {
    st.mode = 'preset';
    st.src = '';
    save(); apply(); syncPanel();
  });

  $('#skApply', sheet).addEventListener('click', function () {
    var v = (elUrl.value || '').trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v) && !/^data:image\//i.test(v)) {
      alert('请填以 http(s):// 开头的图片链接。');
      return;
    }
    st.mode = 'image';
    st.src = v;
    if (!st.dim) st.dim = 40;
    save(); apply(); syncPanel();
  });

  elBlur.addEventListener('input', function () {
    st.blur = +elBlur.value; elBlurV.textContent = st.blur + 'px';
    apply(); save();
  });
  elOp.addEventListener('input', function () {
    st.op = +elOp.value; elOpV.textContent = st.op + '%';
    apply(); save();
  });
  elDim.addEventListener('input', function () {
    st.dim = +elDim.value; elDimV.textContent = st.dim + '%';
    apply(); save();
  });
  $('#skReset', sheet).addEventListener('click', function () {
    st = { mode: 'preset', preset: 'none', src: '', blur: 0, op: 100, dim: 0 };
    save(); apply(); syncPanel();
  });

  apply();
})();