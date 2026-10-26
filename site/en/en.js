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
    if (!units.length) {
      /* 首页：按册过滤，命中的册整块保留 */
      $$('.book').forEach(function (b) {
        var ok = !q || (b.textContent || '').toLowerCase().indexOf(q) > -1;
        b.style.display = ok ? '' : 'none';
        if (ok) hit++;
      });
      $$('.sec-t, .books, .paths, .mods').forEach(function (el) { el.style.display = ''; });
      if (emptyTip) emptyTip.style.display = (!hit && q) ? '' : 'none';
      return hit;
    }
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

  /* ------------------------------------------------ 5. 本页目录 + 进度
     目录分两种：
       · 普通页（英语单元 / 首页）：只列一层「章」或「小节」
       · 高数页（有 .sect-h 节标题）：章 → 节 → 该节的知识点，当前节自动展开 */
  var tocBox = $('#tocList');
  var secs = units.length ? units : $$('.sec-t');
  var DEEP = $$('.sect-h[id]').length > 0;
  var tocData = DEEP ? buildTocData() : null;
  var navLinks = [];
  var railKey = '';
  var sideLinks = $$('#nav a.nv-i[data-unit]');

  function buildTocData() {
    var out = [];
    $$('.unit').forEach(function (u) {
      var ch = { id: u.id, title: u.getAttribute('data-title') || u.id, secs: [] };
      $$('.sect-h[id]', u).forEach(function (h) {
        var c = h.cloneNode(true);
        var pg = c.querySelector('.pgx');
        if (pg) pg.parentNode.removeChild(pg);
        var t = (c.textContent || '').replace(/\s+/g, ' ').trim()
          .replace(/^第[一二三四五六七八九十]+节\s*/, '');
        var sec = { id: h.id, title: t, pts: [] };
        var ol = h.nextElementSibling;
        /* 节标题后面可能先插了「逐节讲解」块，跳过它再找知识点列表 */
        while (ol && ol.nodeType === 1 && !ol.classList.contains('kpt')) ol = ol.nextElementSibling;
        if (ol && ol.classList.contains('kpt')) {
          $$('li', ol).forEach(function (li) {
            var bb = li.querySelector('b');
            if (li.id && bb) sec.pts.push({ id: li.id, title: bb.textContent.trim() });
          });
        }
        ch.secs.push(sec);
      });
      out.push(ch);
    });
    return out;
  }

  function renderRail(chIdx, secIdx) {
    if (!tocBox) return;
    var h = '';
    if (!DEEP) {
      if (units.length) {
        units.forEach(function (u, i) {
          h += '<a class="lv2' + (i === chIdx ? ' on' : '') + '" href="#' + u.id + '">' +
            (u.getAttribute('data-title') || u.id) + '</a>';
        });
      } else {
        $$('.sec-t h2[id]').forEach(function (x, i) {
          h += '<a class="lv2' + (i === chIdx ? ' on' : '') + '" href="#' + x.id + '">' +
            x.textContent.replace(/\s+/g, ' ').trim() + '</a>';
        });
      }
      tocBox.innerHTML = h;
      navLinks = $$('a', tocBox);
      return;
    }
    tocData.forEach(function (ch, i) {
      h += '<a class="lv2' + (i === chIdx ? ' cur' : '') + '" href="#' + ch.id + '">' + ch.title + '</a>';
      if (i !== chIdx) return;
      ch.secs.forEach(function (sec, j) {
        h += '<a class="lv3' + (j === secIdx ? ' on' : '') + '" href="#' + sec.id + '" title="' +
          sec.title + '">' + sec.title + '</a>';
        if (j !== secIdx) return;
        sec.pts.forEach(function (pt) {
          h += '<a class="lv4" href="#' + pt.id + '" title="' + pt.title + '">' + pt.title + '</a>';
        });
      });
    });
    tocBox.innerHTML = h;
    navLinks = $$('a', tocBox);
  }

  function activeIndex() {
    var chIdx = -1, secIdx = -1, ptIdx = -1;
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].getBoundingClientRect().top <= 140) chIdx = i;
    }
    if (DEEP && chIdx >= 0 && tocData[chIdx]) {
      var list = tocData[chIdx].secs;
      for (var j = 0; j < list.length; j++) {
        var el = document.getElementById(list[j].id);
        if (el && el.getBoundingClientRect().top <= 168) secIdx = j;
      }
      if (secIdx >= 0) {
        var pts = list[secIdx].pts;
        for (var k = 0; k < pts.length; k++) {
          var li = document.getElementById(pts[k].id);
          if (li && li.getBoundingClientRect().top <= 176) ptIdx = k;
        }
      }
    }
    return [chIdx, secIdx, ptIdx];
  }

  var readBar = $('#readBar');
  var toTop = $('#toTop');

  function onScroll() {
    var sc = $('#scroll') || document.scrollingElement;
    var top = sc.scrollTop || window.scrollY || 0;
    var hgt = (sc.scrollHeight - sc.clientHeight) || 1;
    if (readBar) readBar.style.width = Math.min(100, (top / hgt) * 100).toFixed(2) + '%';
    if (toTop) toTop.classList.toggle('show', top > 480);

    var act = activeIndex();
    var key = act[0] + '/' + act[1] + '/' + act[2];
    if (key !== railKey) { railKey = key; renderRail(act[0], act[1]); }

    /* 高亮只改 class；当前节与其知识点都点亮，章本身不点亮（避免和节抢视觉） */
    navLinks.forEach(function (a, idx) {
      var id = a.getAttribute('href').slice(1);
      var on = false;
      if (DEEP && act[0] >= 0 && act[1] >= 0 && tocData[act[0]]) {
        var sec = tocData[act[0]].secs[act[1]];
        on = id === sec.id || (act[2] >= 0 && sec.pts[act[2]] && id === sec.pts[act[2]].id);
      } else {
        on = idx === act[0];
      }
      a.classList.toggle('on', on);
    });

    var cur = act[0] >= 0 ? (secs[act[0]].id || '') : '';
    sideLinks.forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-unit') === cur); });
  }
  var scrollHost = $('#scroll');
  (scrollHost || window).addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
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
      var box = btn.closest('.exgrp') || btn.closest('.task-b') || btn.closest('.eg');
      if (!box) return;
      var veiled = box.classList.toggle('veiled');
      var isEg = !!btn.closest('.eg');
      btn.textContent = veiled ? (isEg ? '显示解答' : '显示解析') : (isEg ? '遮住解答' : '遮住解析自测');
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
