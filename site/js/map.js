/* ==========================================================================
   map.js — 校园地图查看器
     · 校园总览 + C5 教学楼一~五层平面图
     · 滚轮 / 按钮 / 双击缩放，拖动平移，触屏双指缩放
     · ← → 切楼层，0 适应窗口，1 原始大小，F 全屏
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  /* 图片放在 site/assets/map/，尺寸写在这里，图片还没加载完也能先算好布局 */
  var MAPS = [
    { id: 'campus', name: '校园总览', short: '校园', src: './assets/map/campus.webp', w: 3200, h: 2770,
      note: '深圳技术大学校园总平面图 · 可放大查看楼栋与道路' },
    { id: 'c5-1', name: 'C5 一楼', short: '1F', src: './assets/map/c5-1.webp', w: 1604, h: 1279,
      note: 'C5 教学楼一层平面图 · 教室号 C-5-1xx' },
    { id: 'c5-2', name: 'C5 二楼', short: '2F', src: './assets/map/c5-2.webp', w: 1599, h: 1282,
      note: 'C5 教学楼二层平面图 · 教室号 C-5-2xx' },
    { id: 'c5-3', name: 'C5 三楼', short: '3F', src: './assets/map/c5-3.webp', w: 1602, h: 1279,
      note: 'C5 教学楼三层平面图 · 教室号 C-5-3xx' },
    { id: 'c5-4', name: 'C5 四楼', short: '4F', src: './assets/map/c5-4.webp', w: 1599, h: 1280,
      note: 'C5 教学楼四层平面图 · 教室号 C-5-4xx' },
    { id: 'c5-5', name: 'C5 五楼', short: '5F', src: './assets/map/c5-5.webp', w: 1600, h: 1279,
      note: 'C5 教学楼五层平面图 · 教室号 C-5-5xx' }
  ];

  var MIN_SCALE = 0.04;
  var MAX_SCALE = 8;

  var el = {};                 // 缓存的 DOM
  var state = {
    id: 'campus',
    scale: 1,
    tx: 0,
    ty: 0,
    naturalW: 0,
    naturalH: 0,
    loaded: {},
    dragging: false,
    moved: false,
    startX: 0, startY: 0, startTx: 0, startTy: 0,
    pinchDist: 0,
    pinchScale: 1
  };

  function mapById(id) {
    for (var i = 0; i < MAPS.length; i++) if (MAPS[i].id === id) return MAPS[i];
    return MAPS[0];
  }

  /* ======================================================================
     初始化
     ====================================================================== */
  function init() {
    el.modal = U.$('#modal-map');
    if (!el.modal) return;

    el.tabs = U.$('#mapTabs');
    el.thumbs = U.$('#mapThumbs');
    el.stage = U.$('#mapStage');
    el.canvas = U.$('#mapCanvas');
    el.img = U.$('#mapImg');
    el.loading = U.$('#mapLoading');
    el.loadingText = U.$('#mapLoadingText');
    el.pct = U.$('#mapZoomPct');
    el.hint = U.$('#mapHint');
    el.sub = U.$('#mapSub');
    el.openRaw = U.$('#mapOpenRaw');

    buildTabs();
    buildThumbs();
    bindTools();
    bindGestures();

    // 记住上次看的那张
    var last = CW.store.state.ui.lastMap;
    if (last && mapById(last).id === last) state.id = last;
  }

  function buildTabs() {
    U.render(el.tabs, MAPS.map(function (m, i) {
      var isFloor = m.id !== 'campus';
      return U.el('button', {
        type: 'button',
        class: 'btn btn-sm' + (m.id === state.id ? ' btn-primary' : ' btn-ghost'),
        'data-map': m.id,
        role: 'tab',
        'aria-selected': m.id === state.id ? 'true' : 'false',
        title: m.note,
        onclick: function () { show(m.id); }
      }, [
        isFloor ? U.el('span', { class: 'mono', text: m.short }) : U.icon('i-map', 'ico'),
        U.el('span', { text: m.name })
      ]);
    }));
  }

  function buildThumbs() {
    U.render(el.thumbs, MAPS.map(function (m) {
      return U.el('button', {
        type: 'button',
        class: 'map-thumb' + (m.id === state.id ? ' is-active' : ''),
        'data-map': m.id,
        title: m.name,
        onclick: function () { show(m.id); }
      }, [
        U.el('img', { src: m.src, alt: m.name, loading: 'lazy', decoding: 'async' }),
        U.el('span', { text: m.name })
      ]);
    }));
  }

  function syncTabs() {
    U.$$('#mapTabs button').forEach(function (b) {
      var on = b.getAttribute('data-map') === state.id;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.className = 'btn btn-sm ' + (on ? 'btn-primary' : 'btn-ghost');
    });
    U.$$('#mapThumbs .map-thumb').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-map') === state.id);
    });
  }

  /* ======================================================================
     切换图片
     ====================================================================== */
  function show(id) {
    var m = mapById(id);
    state.id = m.id;
    state.naturalW = m.w;
    state.naturalH = m.h;

    CW.store.setUI({ lastMap: m.id });
    syncTabs();

    if (el.sub) el.sub.textContent = m.note;
    if (el.openRaw) el.openRaw.href = m.src;

    // 重新加载图片
    var already = state.loaded[m.id];
    if (el.loading) {
      el.loading.classList.toggle('hide', !!already);
      if (el.loadingText) el.loadingText.textContent = '正在加载「' + m.name + '」…';
    }

    el.img.alt = m.name + '（' + m.note + '）';
    el.img.onload = function () {
      state.loaded[m.id] = true;
      state.naturalW = el.img.naturalWidth || m.w;
      state.naturalH = el.img.naturalHeight || m.h;
      if (el.loading) el.loading.classList.add('hide');
      fit(false);
    };
    el.img.onerror = function () {
      if (el.loadingText) el.loadingText.textContent = '地图加载失败：' + m.src + '（请确认 assets/map 目录已一起部署）';
      if (el.loading) el.loading.classList.remove('hide');
    };
    el.img.src = m.src;

    // src 命中缓存时 onload 可能不触发，兜底再试一次
    if (el.img.complete && el.img.naturalWidth) {
      state.naturalW = el.img.naturalWidth;
      state.naturalH = el.img.naturalHeight;
      if (el.loading) el.loading.classList.add('hide');
      fit(false);
    }
  }

  /* ======================================================================
     变换
     ====================================================================== */
  function apply(animate) {
    if (animate) {
      el.canvas.classList.add('is-animating');
      clearTimeout(apply._t);
      apply._t = setTimeout(function () { el.canvas.classList.remove('is-animating'); }, 360);
    } else {
      el.canvas.classList.remove('is-animating');
    }
    el.canvas.style.transform = 'translate3d(' + state.tx.toFixed(2) + 'px,' +
      state.ty.toFixed(2) + 'px,0) scale(' + state.scale.toFixed(5) + ')';
    el.canvas.style.width = state.naturalW + 'px';
    el.canvas.style.height = state.naturalH + 'px';
    el.img.style.width = state.naturalW + 'px';
    el.img.style.height = state.naturalH + 'px';
    if (el.pct) el.pct.textContent = Math.round(state.scale * 100) + '%';
  }

  function clampPan() {
    var sw = el.stage.clientWidth, sh = el.stage.clientHeight;
    var w = state.naturalW * state.scale, h = state.naturalH * state.scale;
    if (w <= sw) state.tx = (sw - w) / 2;
    else state.tx = U.clamp(state.tx, sw - w, 0);
    if (h <= sh) state.ty = (sh - h) / 2;
    else state.ty = U.clamp(state.ty, sh - h, 0);
  }

  /** 适应窗口 */
  function fit(animate) {
    var sw = el.stage.clientWidth, sh = el.stage.clientHeight;
    if (!sw || !sh || !state.naturalW) return;
    var pad = 26;
    var s = Math.min((sw - pad * 2) / state.naturalW, (sh - pad * 2) / state.naturalH);
    state.scale = U.clamp(s, MIN_SCALE, MAX_SCALE);
    clampPan();
    apply(animate !== false);
  }

  /** 原始大小（1:1） */
  function actualSize(animate) {
    var sw = el.stage.clientWidth, sh = el.stage.clientHeight;
    state.scale = 1;
    state.tx = (sw - state.naturalW) / 2;
    state.ty = (sh - state.naturalH) / 2;
    clampPan();
    apply(animate !== false);
  }

  /** 以 (cx, cy)（相对 stage 的坐标）为锚点缩放 */
  function zoomAt(cx, cy, factor, animate) {
    var next = U.clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);
    if (next === state.scale) return;
    var k = next / state.scale;
    state.tx = cx - (cx - state.tx) * k;
    state.ty = cy - (cy - state.ty) * k;
    state.scale = next;
    clampPan();
    apply(animate !== false);
  }

  function zoomCenter(factor, animate) {
    zoomAt(el.stage.clientWidth / 2, el.stage.clientHeight / 2, factor, animate);
  }

  /* ======================================================================
     工具按钮
     ====================================================================== */
  function bindTools() {
    U.$('#mapZoomIn').addEventListener('click', function () { zoomCenter(1.35, true); });
    U.$('#mapZoomOut').addEventListener('click', function () { zoomCenter(1 / 1.35, true); });
    U.$('#mapFit').addEventListener('click', function () { fit(true); });
    U.$('#mapActual').addEventListener('click', function () { actualSize(true); });
    U.$('#mapFull').addEventListener('click', toggleFullscreen);
  }

  /* 地图默认就是「铺满弹窗」的大视图；F 走的是浏览器真正的全屏 API */
  function isDocFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function toggleFullscreen() {
    if (isDocFullscreen()) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        var p = exit.call(document);
        if (p && p.catch) p.catch(function () { /* 忽略 */ });
      }
    } else {
      var req = el.modal.requestFullscreen || el.modal.webkitRequestFullscreen;
      if (!req) {
        U.toast('这个浏览器不支持全屏，按 F11 也可以用系统全屏。', 'info');
        return;
      }
      var r = req.call(el.modal);
      if (r && r.catch) {
        r.catch(function () {
          U.toast('浏览器拒绝了全屏请求，可以按 F11 使用系统全屏。', 'warn');
        });
      }
    }
    setTimeout(function () { updateFullIcon(); fit(true); }, 260);
  }

  function updateFullIcon() {
    var btn = U.$('#mapFull');
    if (!btn) return;
    var on = isDocFullscreen();
    U.render(btn, U.icon(on ? 'i-compress' : 'i-expand'));
    btn.title = on ? '退出全屏（F）' : '全屏（F）';
    btn.setAttribute('aria-label', on ? '退出全屏' : '进入全屏');
  }

  /* ======================================================================
     手势：滚轮 / 拖动 / 双击 / 触摸
     ====================================================================== */
  function bindGestures() {
    var stage = el.stage;

    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = stage.getBoundingClientRect();
      var cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      // 触控板的横向滚动也能缩放，手感更接近地图 App
      var delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 16;
      var factor = Math.pow(0.9986, delta);
      factor = U.clamp(factor, 0.6, 1.6);
      zoomAt(cx, cy, factor, false);
    }, { passive: false });

    stage.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      state.dragging = true;
      state.moved = false;
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.startTx = state.tx;
      state.startTy = state.ty;
      stage.classList.add('is-grabbing');
      if (stage.setPointerCapture) {
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      }
    });

    stage.addEventListener('pointermove', function (e) {
      if (!state.dragging) return;
      var dx = e.clientX - state.startX;
      var dy = e.clientY - state.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) state.moved = true;
      state.tx = state.startTx + dx;
      state.ty = state.startTy + dy;
      clampPan();
      apply(false);
    });

    function endDrag(e) {
      if (!state.dragging) return;
      state.dragging = false;
      stage.classList.remove('is-grabbing');
      if (stage.releasePointerCapture && e && e.pointerId !== undefined) {
        try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      }
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerleave', endDrag);

    stage.addEventListener('dblclick', function (e) {
      var rect = stage.getBoundingClientRect();
      var cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      zoomAt(cx, cy, e.shiftKey ? 1 / 1.9 : 1.9, true);
    });

    // 触屏双指缩放
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        state.pinchDist = touchDist(e.touches);
        state.pinchScale = state.scale;
        state.dragging = false;
      }
    }, { passive: true });

    stage.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2 || !state.pinchDist) return;
      e.preventDefault();
      var d = touchDist(e.touches);
      var rect = stage.getBoundingClientRect();
      var mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      };
      var target = U.clamp(state.pinchScale * (d / state.pinchDist), MIN_SCALE, MAX_SCALE);
      zoomAt(mid.x, mid.y, target / state.scale, false);
    }, { passive: false });

    stage.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) state.pinchDist = 0;
    }, { passive: true });

    // 窗口大小变化时重新适应
    window.addEventListener('resize', U.debounce(function () {
      if (el.modal.classList.contains('open')) fit(false);
    }, 160));

    document.addEventListener('fullscreenchange', function () {
      updateFullIcon();
      setTimeout(function () { if (el.modal.classList.contains('open')) fit(true); }, 80);
    });
    document.addEventListener('webkitfullscreenchange', function () {
      updateFullIcon();
      setTimeout(function () { if (el.modal.classList.contains('open')) fit(true); }, 80);
    });
  }

  function touchDist(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ======================================================================
     打开 / 关闭
     ====================================================================== */
  function onOpen(initialId) {
    show(initialId || state.id);
    updateFullIcon();
    // 提示条显示一下就淡出
    if (el.hint) {
      el.hint.classList.add('show');
      clearTimeout(onOpen._t);
      onOpen._t = setTimeout(function () { el.hint.classList.remove('show'); }, 3200);
    }
    // 弹窗动画结束后再量尺寸，否则 clientWidth 是 0
    setTimeout(function () { fit(false); }, 120);
    setTimeout(function () { fit(false); }, 380);
  }

  function onClose() {
    // 退出全屏，免得上一次的全屏状态影响下次打开
    var docFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (docFs && document.exitFullscreen) document.exitFullscreen().catch(function () { /* 忽略 */ });
  }

  function step(delta) {
    var i = 0;
    for (var k = 0; k < MAPS.length; k++) if (MAPS[k].id === state.id) i = k;
    var next = (i + delta + MAPS.length) % MAPS.length;
    show(MAPS[next].id);
  }

  /* ======================================================================
     键盘（只在弹窗打开时由 app.js 转发过来）
     ====================================================================== */
  function onKey(e) {
    var k = e.key;
    if (k === 'ArrowRight') { step(1); return true; }
    if (k === 'ArrowLeft') { step(-1); return true; }
    if (k === 'ArrowUp' || k === '+' || k === '=') { zoomCenter(1.25, true); return true; }
    if (k === 'ArrowDown' || k === '-' || k === '_') { zoomCenter(1 / 1.25, true); return true; }
    if (k === '0') { fit(true); return true; }
    if (k === '1') { actualSize(true); return true; }
    if (k === 'f' || k === 'F') { toggleFullscreen(); updateFullIcon(); return true; }
    return false;
  }

  CW.map = {
    MAPS: MAPS,
    init: init,
    open: function (id) { onOpen(id); },
    onOpen: onOpen,
    onClose: onClose,
    show: show,
    fit: fit,
    onKey: onKey,
    updateFullIcon: updateFullIcon
  };
})();
