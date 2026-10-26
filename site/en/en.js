/* ==========================================================================
   en.js — 大学英语子站（/en/bN.html）的静态页交互
   --------------------------------------------------------------------------
   只做这件事需要的那几样，不引框架：
     1) 深浅色（沿用全站 cw.theme）
     2) 侧栏折叠 / 手机抽屉
     3) 页内搜索（按单元过滤）
     4) 右侧本页目录 + 阅读进度条
     5) 「遮住解析自测」开关
     6) 单元「标记已学」与进度条（本地 localStorage）
     7) 回到顶部、Ctrl/⌘+K 聚焦搜索
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
    },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  };

  /* ---------------------------------------------------------------- 1. 主题 */
  var THEME_KEY = 'cw.theme';
  var themeBtn = $('#themeBtn');

  function currentTheme() {
    var t = root.getAttribute('data-theme');
    return t === 'light' ? 'light' : 'dark';
  }
  function paintThemeBtn() {
    if (!themeBtn) return;
    var next = currentTheme() === 'dark' ? '浅色' : '深色';
    var tl = $('.tl', themeBtn);
    if (tl) tl.textContent = next;
    themeBtn.setAttribute('aria-label', '切换到' + next + '模式');
  }
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    root.setAttribute('data-mode', t);
    store.set(THEME_KEY, JSON.stringify(t));
    paintThemeBtn();
  }
  paintThemeBtn();
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      root.classList.add('theme-anim');
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
      setTimeout(function () { root.classList.remove('theme-anim'); }, 320);
    });
  }

  /* ---------------------------------------------------------- 2. 侧栏折叠 */
  /* shell.css 只给了 .fold 的透明度过渡，高度要自己算 max-height，否则
     折起来的列表只是看不见、还占着位置。 */
  function setFold(box, fold, animate) {
    var list = box.querySelector('.nv-list');
    box.classList.toggle('fold', fold);
    if (!list) return;
    if (!animate) list.style.transition = 'none';
    list.style.maxHeight = fold ? '0px' : list.scrollHeight + 'px';
    if (!animate) {
      /* 强制重排后再恢复过渡，避免首屏闪一下 */
      void list.offsetHeight;
      list.style.transition = '';
    }
  }

  $$('#nav .nv-h[data-fold]').forEach(function (btn) {
    var box = btn.closest('.nv-mod');
    var key = 'en.fold.' + btn.getAttribute('data-fold');
    var saved = store.get(key, null);
    var fold = saved === null ? box.classList.contains('fold') : saved === '1';
    setFold(box, fold, false);

    btn.addEventListener('click', function () {
      var next = !box.classList.contains('fold');
      setFold(box, next, true);
      store.set(key, next ? '1' : '0');
    });
  });

  /* ------------------------------------------------------ 3. 手机抽屉 */
  var burger = $('#burger');
  var sideX = $('#sideX');
  var mask = $('.mask');
  function closeNav() { document.body.classList.remove('nav-open'); }
  if (burger) burger.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
  if (sideX) sideX.addEventListener('click', closeNav);
  if (mask) mask.addEventListener('click', closeNav);
  $$('#nav a.nv-i').forEach(function (a) { a.addEventListener('click', closeNav); });

  /* ------------------------------------------------------- 4. 页内搜索 */
  var units = $$('.unit');
  var search = $('#sideSearch');
  var emptyTip = $('#searchEmpty');

  function applyFilter(q) {
    q = (q || '').trim().toLowerCase();
    var hit = 0;
    units.forEach(function (u) {
      var ok = !q || (u.textContent || '').toLowerCase().indexOf(q) > -1;
      u.style.display = ok ? '' : 'none';
      if (ok) hit++;
    });
    $$('#nav a.nv-i[data-unit]').forEach(function (a) {
      var id = a.getAttribute('data-unit');
      var el = document.getElementById(id);
      a.style.display = el && el.style.display === 'none' ? 'none' : '';
    });
    if (emptyTip) emptyTip.style.display = (!hit && q) ? '' : 'none';
    return hit;
  }
  if (search) {
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      var v = search.value;
      timer = setTimeout(function () { applyFilter(v); }, 90);
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { search.value = ''; applyFilter(''); search.blur(); }
    });
  }
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (search) { search.focus(); search.select(); }
    }
  });

  /* ------------------------------------------------ 5. 本页目录 + 进度 */
  var tocBox = $('#tocList');
  if (tocBox) {
    var html = '';
    $$('.unit').forEach(function (u) {
      var t = u.getAttribute('data-title') || (u.id || '').toUpperCase();
      var zh = $('.uzh', u);
      html += '<a class="lv2" href="#' + u.id + '">' + t + '</a>';
    });
    tocBox.innerHTML = html;
  }

  var readBar = $('#readBar');
  var toTop = $('#toTop');
  var navLinks = $$('#tocList a');
  var anchors = navLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });

  function onScroll() {
    var sc = $('#scroll') || document.scrollingElement;
    var top = sc.scrollTop || window.scrollY || 0;
    var h = (sc.scrollHeight - sc.clientHeight) || 1;
    if (readBar) readBar.style.width = Math.min(100, (top / h) * 100).toFixed(2) + '%';
    if (toTop) toTop.classList.toggle('show', top > 480);

    var idx = -1;
    for (var i = 0; i < anchors.length; i++) {
      var el = anchors[i];
      if (el && el.getBoundingClientRect().top <= 120) idx = i;
    }
    navLinks.forEach(function (a, i) { a.classList.toggle('on', i === idx); });
  }
  var scrollHost = $('#scroll');
  (scrollHost || window).addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      if (scrollHost) scrollHost.scrollTo({ top: 0, behavior: 'smooth' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ------------------------------------------- 6. 遮住解析自测 */
  $$('[data-veil]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var box = btn.closest('.exgrp') || btn.closest('.task-b');
      if (!box) return;
      var veiled = box.classList.toggle('veiled');
      btn.textContent = veiled ? '显示解析' : '遮住解析自测';
      btn.classList.toggle('on', veiled);
    });
  });

  /* ------------------------------------------- 7. 标记已学 + 进度 */
  var DONE_KEY = 'en.done.' + (document.body.getAttribute('data-book') || 'b1');
  var done = {};
  try { done = JSON.parse(store.get(DONE_KEY, '{}')) || {}; } catch (e) { done = {}; }

  var pgNum = $('#pgNum');
  var pgBar = $('#pgBar');

  function paintProgress() {
    var total = units.length || 1;
    var n = 0;
    units.forEach(function (u) {
      var isDone = !!done[u.id];
      if (isDone) n++;
      u.classList.toggle('done', isDone);
      var a = $('#nav a.nv-i[data-unit="' + u.id + '"]');
      if (a) a.classList.toggle('done', isDone);
      var b = $('.btn-done[data-unit="' + u.id + '"]');
      if (b) {
        b.classList.toggle('on', isDone);
        b.textContent = isDone ? '已标记' : '标记已学';
      }
    });
    if (pgNum) pgNum.textContent = n + ' / ' + total;
    if (pgBar) pgBar.style.width = (n / total * 100).toFixed(1) + '%';
  }

  $$('.btn-done[data-unit]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-unit');
      if (done[id]) delete done[id]; else done[id] = 1;
      store.set(DONE_KEY, JSON.stringify(done));
      paintProgress();
    });
  });
  paintProgress();
})();
