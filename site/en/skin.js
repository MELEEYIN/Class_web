/* ==========================================================================
   skin.js — 课程学习站的「外观」面板：背景图 / 模糊 / 暗度
   --------------------------------------------------------------------------
   为什么要单独一个文件：
     算法站的外观面板绑在它自己的 shell.js 里（DOM 也是写死在 acm/index.html），
     三个 /en 页面没有那套结构。这里用同一份 CSS（shell.css 的 .sheet / .walls /
     .rng）在运行时把面板「搭」出来，页面 HTML 不用各写一遍。

   做什么：
     1) 铺两层背景：.bg（图片或预设）+ .bg-dim（暗度遮罩）
     2) 顶栏插一个「外观」按钮，点开右侧面板
     3) 图片：本地选图（canvas 压到 1920px、JPEG 0.82 后存 localStorage）或直接贴链接
     4) 模糊 0–24px、暗度 0–80%，拖动即时生效
     5) 存在 localStorage 的 cw.en.bg 里，只影响本机
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'cw.en.bg';
  var DEF = { mode: 'preset', preset: 'none', src: '', dim: 0, blur: 0 };
  var PRESETS = ['none', 'aurora', 'grid', 'dots', 'star', 'wave'];
  var st = load();

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var root = document.documentElement;

  function load() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { o = {}; }
    var out = { mode: 'preset', preset: 'none', src: '', dim: 0, blur: 0 };
    if (o.mode === 'image') out.mode = 'image';
    if (PRESETS.indexOf(o.preset) > -1) out.preset = o.preset;
    if (typeof o.src === 'string') out.src = o.src;
    out.dim = Math.min(80, Math.max(0, Number(o.dim) || 0));
    out.blur = Math.min(24, Math.max(0, Number(o.blur) || 0));
    return out;
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
    if (st.mode === 'image' && st.src) {
      bg.setAttribute('data-p', 'none');
      bg.style.backgroundImage = 'url("' + st.src.replace(/"/g, '%22') + '")';
      root.setAttribute('data-wall', 'custom');
    } else {
      bg.setAttribute('data-p', st.preset);
      bg.style.backgroundImage = '';
      root.setAttribute('data-wall', st.preset);
    }
    bg.style.filter = st.blur ? 'blur(' + st.blur + 'px) saturate(1.05)' : 'none';
    dim.style.background = st.dim ? 'rgba(2,6,14,' + (st.dim / 100).toFixed(2) + ')' : 'transparent';
  }

  /* ---------------------------------------------------------- 2. 面板 */
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/>' +
    '<circle cx="8.6" cy="9.4" r="1.5"/><path d="m3.5 16.5 4.7-4.2 3.4 3 2.6-2.3 5.8 5"/></svg>';

  var bar = $('.top-r');
  var btn = null;
  if (bar) {
    btn = document.createElement('button');
    btn.className = 'top-btn';
    btn.type = 'button';
    btn.id = 'skinBtn';
    btn.title = '背景与外观';
    btn.innerHTML = ICON + '<span class="tl">外观</span>';
    bar.insertBefore(btn, bar.firstChild);
  }

  var walls = PRESETS.map(function (p) {
    var label = { none: '默认', aurora: '极光', grid: '网格', dots: '点阵', star: '星空', wave: '波纹' }[p];
    return '<button class="wbtn" type="button" data-p="' + p + '">' + label + '</button>';
  }).join('');

  var sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.id = 'skinSheet';
  sheet.innerHTML =
    '<div class="sheet-mask" data-close></div>' +
    '<div class="sheet-box" role="dialog" aria-modal="true" aria-label="背景与外观">' +
      '<div class="sheet-h"><b>背景与外观</b><button class="sheet-x" type="button" data-close aria-label="关闭">✕</button></div>' +
      '<div class="sheet-body">' +
        '<div><div class="srow-t">背景预设<em>不放图时生效</em></div><div class="walls">' + walls + '</div></div>' +
        '<div><div class="srow-t">自定义图片<em>本机读取，不上传</em></div>' +
          '<div class="up-row"><button class="up-btn" type="button" id="skPick">选一张图</button>' +
          '<button class="up-btn ghost" type="button" id="skClear">清除图片</button></div>' +
          '<input type="file" id="skFile" accept="image/*" hidden>' +
          '<div class="sk-prev" id="skPrev"></div>' +
          '<div class="up-row" style="margin-top:8px">' +
            '<input class="sk-url" id="skUrl" type="url" placeholder="或粘贴图片链接 https://…">' +
            '<button class="up-btn" type="button" id="skApply">用链接</button>' +
          '</div>' +
        '</div>' +
        '<div><div class="srow-t">模糊<b id="skBlurV">0px</b></div><input class="rng" id="skBlur" type="range" min="0" max="24" step="1"></div>' +
        '<div><div class="srow-t">暗度<b id="skDimV">0%</b></div><input class="rng" id="skDim" type="range" min="0" max="80" step="1"></div>' +
        '<div class="sheet-f"><span>设置存在本机，换设备不同步。</span>' +
          '<button class="up-btn ghost" type="button" id="skReset" style="margin-left:auto">恢复默认</button></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(sheet);

  var elBlur = $('#skBlur', sheet), elDim = $('#skDim', sheet);
  var elBlurV = $('#skBlurV', sheet), elDimV = $('#skDimV', sheet);
  var elPrev = $('#skPrev', sheet), elUrl = $('#skUrl', sheet);

  function syncPanel() {
    sheet.querySelectorAll('.wbtn').forEach(function (b) {
      b.classList.toggle('on', st.mode === 'preset' && b.getAttribute('data-p') === st.preset);
    });
    elBlur.value = st.blur; elDim.value = st.dim;
    elBlurV.textContent = st.blur + 'px';
    elDimV.textContent = st.dim + '%';
    if (st.mode === 'image' && st.src) {
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

  if (btn) btn.addEventListener('click', open);
  sheet.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  sheet.querySelectorAll('.wbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      st.mode = 'preset';
      st.preset = b.getAttribute('data-p');
      st.src = '';
      save(); apply(); syncPanel();
    });
  });

  /* 选图 → 压到 1920px 长边 → JPEG 0.82 */
  $('#skPick', sheet).addEventListener('click', function () { $('#skFile', sheet).click(); });
  $('#skFile', sheet).addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var url = URL.createObjectURL(f);
    var img = new Image();
    img.onload = function () {
      var MAX = 1920;
      var k = Math.min(1, MAX / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var data = c.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);
      st.mode = 'image'; st.src = data;
      save(); apply(); syncPanel();
    };
    img.onerror = function () { URL.revokeObjectURL(url); alert('这张图读不了，换一张试试。'); };
    img.src = url;
    e.target.value = '';
  });

  $('#skClear', sheet).addEventListener('click', function () {
    st.mode = 'preset'; st.src = '';
    save(); apply(); syncPanel();
  });

  $('#skApply', sheet).addEventListener('click', function () {
    var v = (elUrl.value || '').trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v) && !/^data:image\//i.test(v)) {
      alert('请填以 http(s):// 开头的图片链接。');
      return;
    }
    st.mode = 'image'; st.src = v;
    save(); apply(); syncPanel();
  });

  elBlur.addEventListener('input', function () {
    st.blur = +elBlur.value; elBlurV.textContent = st.blur + 'px';
    apply(); save();
  });
  elDim.addEventListener('input', function () {
    st.dim = +elDim.value; elDimV.textContent = st.dim + '%';
    apply(); save();
  });
  $('#skReset', sheet).addEventListener('click', function () {
    st = { mode: 'preset', preset: 'none', src: '', dim: 0, blur: 0 };
    save(); apply(); syncPanel();
  });

  apply();
})();
