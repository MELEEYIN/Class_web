/* ==========================================================================
   shell.js — ACM 算法站 · 路由 / 侧栏 / 搜索 / 进度 / 页内目录
   纯静态：内容片段放在 data/p/*.html，按需 fetch（需要 http(s) 环境）。
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  var NAV = null;                 // data/nav.json
  var INDEX = null;               // data/search.json（懒加载）
  var CACHE = {};                 // route -> html
  var CUR = null;                 // {mod, id, item, anchor}
  var LEARNED = loadLearned();
  var RECENT = loadRecent();

  /* ------------------------------------------------------------ 存储 */
  function lsGet(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略 */ }
  }
  function loadLearned() { var o = lsGet('acm.learned', {}); return (o && typeof o === 'object') ? o : {}; }
  function loadRecent() { var o = lsGet('acm.recent', []); return Array.isArray(o) ? o : []; }
  function saveLearned() { lsSet('acm.learned', LEARNED); }

  function learnedCount() {
    var n = 0;
    for (var k in LEARNED) if (LEARNED[k]) n++;
    return n;
  }

  /* ------------------------------------------------------------ 工具 */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function modOf(id) {
    if (!NAV) return null;
    for (var i = 0; i < NAV.modules.length; i++) if (NAV.modules[i].id === id) return NAV.modules[i];
    return null;
  }
  function allItems() {
    var out = [];
    NAV.modules.forEach(function (m) { m.items.forEach(function (it) { out.push(it); }); });
    return out;
  }
  function itemByRoute(route) {
    var all = allItems();
    for (var i = 0; i < all.length; i++) if (all[i].id === route) return all[i];
    return null;
  }

  /* ------------------------------------------------------------ 主题 */
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function applyTheme(t) {
    var root = document.documentElement;
    root.classList.add('theme-anim');
    clearTimeout(window.__themeT);
    window.__themeT = setTimeout(function () { root.classList.remove('theme-anim'); }, 340);
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('cw.theme', JSON.stringify(t)); } catch (e) {}
    var b = $('#themeBtn');
    if (b) b.innerHTML = t === 'light' ? ICON.moon + '<span>深色</span>' : ICON.sun + '<span>浅色</span>';
  }
  function toggleTheme() { applyTheme(currentTheme() === 'light' ? 'dark' : 'light'); }

  var ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5 5L20 6.5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    toc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h13"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>'
  };

  /* ------------------------------------------------------------ 路由 */
  function parseHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h || h === '/') return { route: '', anchor: '' };
    h = h.replace(/^\//, '');
    var i = h.indexOf('#');
    var route = i >= 0 ? h.slice(0, i) : h;
    var anchor = i >= 0 ? h.slice(i + 1) : '';
    return { route: route, anchor: anchor };
  }
  function go(route, anchor) {
    var h = '#/' + route + (anchor ? '#' + anchor : '');
    if (location.hash === h) { render(); return; }
    location.hash = h;
  }

  /* ------------------------------------------------------------ 侧栏 */
  function buildNav() {
    var host = $('#nav');
    var html = '';
    var lastSec = '';
    var act = (parseHash().route || 'course').split('/')[0];
    NAV.modules.forEach(function (m) {
      if (m.section && m.section !== lastSec) {
        html += '<div class="nv-sec">' + esc(m.section) + '</div>';
        lastSec = m.section;
      }
      var folded = lsGet('acm.fold.' + m.id, null);
      var fold = folded === null ? (m.id !== act) : !!folded;
      html += '<div class="nv-mod' + (fold ? ' fold' : '') + '" data-mod="' + m.id + '">';
      html += '<button class="nv-h" type="button" data-fold="' + m.id + '">' +
              '<span class="chev">' + ICON.chev + '</span><b>' + esc(m.name) + '</b>' +
              '<em>' + m.items.length + '</em></button>';
      html += '<div class="nv-list">';
      if (m.groups) {
        m.groups.forEach(function (g) {
          html += '<div class="nv-grp">' + esc(g.short || g.name) + '</div>';
          g.items.forEach(function (it) { html += navItem(it); });
        });
      } else {
        m.items.forEach(function (it) { html += navItem(it); });
      }
      html += '</div></div>';
    });
    host.innerHTML = html;
    $$('#nav .nv-mod').forEach(function (box) {
      var list = box.querySelector('.nv-list');
      if (list) list.style.maxHeight = box.classList.contains('fold') ? '0px' : 'none';
    });

    host.addEventListener('click', function (e) {
      var h = e.target.closest ? e.target.closest('[data-fold]') : null;
      if (h) {
        var mid = h.getAttribute('data-fold');
        var box = h.parentElement;
        var to = !box.classList.contains('fold');
        setFold(box, to, true);
        lsSet('acm.fold.' + mid, to);
        return;
      }
    });
  }
  function setFold(box, fold, animate) {
    var list = box.querySelector('.nv-list');
    box.classList.toggle('fold', fold);
    if (!list) return;
    if (!animate) { list.style.maxHeight = fold ? '0px' : 'none'; return; }
    if (fold) {
      list.style.maxHeight = list.scrollHeight + 'px';
      void list.offsetHeight;
      list.style.maxHeight = '0px';
    } else {
      list.style.maxHeight = list.scrollHeight + 'px';
      clearTimeout(list.__t);
      list.__t = setTimeout(function () {
        if (!box.classList.contains('fold')) list.style.maxHeight = 'none';
      }, 380);
    }
  }

  function navItem(it) {
    var done = LEARNED[it.id] ? ' done' : '';
    var no = it.no ? '<span class="no">' + it.no + '</span>' : '';
    return '<a class="nv-i' + done + '" href="#/' + it.id + '" data-route="' + it.id + '">' +
           no + '<span class="tt">' + esc(it.title) + '</span>' +
           '<span class="mk">' + ICON.check + '</span></a>';
  }
  function markNav() {
    var actEl = null;
    $$('#nav .nv-i').forEach(function (a) {
      var r = a.getAttribute('data-route');
      var on = !!(CUR && r === CUR.route);
      a.classList.toggle('on', on);
      a.classList.toggle('done', !!LEARNED[r]);
      if (on) actEl = a;
    });
    if (actEl) {
      var box = actEl.closest('.nv-mod');
      if (box && box.classList.contains('fold')) {
        setFold(box, false, false);
        lsSet('acm.fold.' + box.getAttribute('data-mod'), false);
      }
      var nav = $('#nav');
      var r = actEl.getBoundingClientRect(), nr = nav.getBoundingClientRect();
      if (r.top < nr.top + 30 || r.bottom > nr.bottom - 30) {
        nav.scrollTop += (r.top - nr.top) - nav.clientHeight / 2 + r.height / 2;
      }
    }
  }

  /* ------------------------------------------------------------ 渲染 */
  function setCrumb(mod, item) {
    var c = $('#crumb');
    if (!mod) { c.innerHTML = '<a href="#/">编程学习站</a><span class="sep">/</span><span class="cur">总览</span>'; return; }
    c.innerHTML = '<a href="#/">总览</a><span class="sep">/</span>' +
      '<a href="#/' + mod.id + '">' + esc(mod.name) + '</a>' +
      (item ? '<span class="sep">/</span><span class="cur">' + esc(item.title) + '</span>' : '');
  }

  function skeleton() {
    $('#doc').innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i><i></i></div>';
    $('#rail').style.display = 'none';
    $('#pager').innerHTML = '';
  }

  function showHome() {
    CUR = { route: '', mod: null, item: null };
    setCrumb(null);
    $('.stage').classList.add('wide');
    $('.view').classList.add('solo');
    $('.view').classList.add('solo');
    $('.stage').classList.add('wide');
    $('#rail').style.display = 'none';
    var tpl = $('#tpl-home');
    var doc = $('#doc');
    doc.className = 'doc home';
    doc.innerHTML = tpl.innerHTML;
    $('#pager').innerHTML = '';
    paintHome();
    enterAnim(doc);
    bindReveal(doc);
    markNav();
    $('#scroll').scrollTop = 0;
  }

  function paintHome() {
    var n = allItems().length;
    var lessons = lessonsTotal();
    var done = lessonsDone();
    var set = function (sel, v) { var el = $(sel); if (el) el.textContent = v; };
    set('[data-hs="total"]', n);
    set('[data-hs="lessons"]', lessons);
    set('[data-hs="done"]', done);
    set('[data-hs="pct"]', lessons ? Math.round(done / lessons * 100) + '%' : '0%');
    var bar = $('[data-hs="bar"]');
    if (bar) bar.style.width = (lessons ? done / lessons * 100 : 0) + '%';
    $$('.hero-stats b').forEach(countUp);
    // 最近浏览
    var r = $('#recent');
    if (r) {
      if (!RECENT.length) { r.innerHTML = '<div class="sov-e" style="padding:16px">还没有浏览记录，从上面四条路线任选一条开始。</div>'; }
      else {
        r.innerHTML = RECENT.slice(0, 4).map(function (x) {
          return '<a href="#/' + x.id + '"><span class="no">' + (x.no || '·') + '</span>' +
                 '<span class="tt">' + esc(x.title) + '</span>' +
                 '<span class="lvv">' + esc(x.mod || '') + '</span></a>';
        }).join('');
      }
    }
  }

  function showCourseIndex() {
    $('.stage').classList.add('wide');
    $('.view').classList.add('solo');
    $('.view').classList.add('solo');
    var m = modOf('course');
    CUR = { route: 'course', mod: m, item: null };
    setCrumb(m, null);
    $('#rail').style.display = 'none';
    var done = 0;
    var html = '<header class="doc-head"><div class="eyebrow">算竞教程</div>' +
      '<h1>60 节 · 从语法到提高</h1>' +
      '<p class="lede">十二组、每组五节：语法与数组 → 函数与排序 → 贪心与前缀和 → 递归与搜索 → BFS 与二分 → DP → 数论 → 图论 → 进阶数据结构 → 字符串 → 专题。每节都带「例题 · 新函数拆解 · 思考点 · 挑战题」。</p>' +
      '<div class="chips"><span class="chipk"><b id="cDone">0</b>&nbsp;/ 60 已学</span>' +
      '<span class="chipk">星级 = 已学范围（1–25 节为推荐入门段）</span></div></header>';
    m.groups.forEach(function (g) {
      html += '<div class="cg-t"><b>' + esc(g.name) + '</b><span>' + g.items.length + ' 节</span></div><div class="cgrid">';
      g.items.forEach(function (it) {
        html += '<a class="cc' + (LEARNED[it.id] ? ' done' : '') + '" href="#/' + it.id + '">' +
                '<span class="cno">' + it.no +
                (it.level ? ' · ' + esc(it.level) : '') +
                (LEARNED[it.id] ? '<i class="ok">✓</i>' : '') + '</span>' +
                '<span class="ctt">' + esc(it.title) + '</span></a>';
      });
      html += '</div>';
    });
    var doc = $('#doc');
    doc.className = 'doc home';
    doc.innerHTML = html;
    $('#cDone').textContent = courseDone();
    $('#pager').innerHTML = '';
    enterAnim(doc);
    bindReveal(doc);
    markNav();
    $('#scroll').scrollTop = 0;
  }
  function lessonsDone() {
    return courseDone() + pyDone();
  }
  function courseDone() {
    var m = modOf('course'), c = 0;
    if (m) m.items.forEach(function (it) { if (LEARNED[it.id]) c++; });
    return c;
  }
  function pyDone() {
    var m = modOf('py'), c = 0;
    if (m) m.items.forEach(function (it) { if (it.no && LEARNED[it.id]) c++; });
    return c;
  }
  /* 计入进度的只有「有编号的节」：course 60 + py 26（py 的导读不算一章） */
  function lessonsTotal() {
    var n = 0;
    ['course', 'py'].forEach(function (mid) {
      var m = modOf(mid);
      if (m) m.items.forEach(function (it) { if (it.no) n++; });
    });
    return n;
  }

  var CODE_RE = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d[\d]*(?:\.\d+)?\b)|(\b(?:int|long|double|float|char|bool|void|short|unsigned|signed|const|static|inline|extern|template|typename|class|struct|enum|union|namespace|using|public|private|protected|virtual|operator|new|delete|return|for|while|do|if|else|switch|case|default|break|continue|sizeof|typedef|auto|nullptr|true|false|this)\b)/g;
  function hl(s) {
    return s.replace(CODE_RE, function (m, cm, st, nm, kw) {
      if (cm) return '<i class="cm">' + cm + '</i>';
      if (st) return '<i class="st2">' + st + '</i>';
      if (nm) return '<i class="nm">' + nm + '</i>';
      if (kw) return '<i class="kw">' + kw + '</i>';
      return m;
    });
  }

  function afterRender(root) {
    /* 代码块：study 片段把源码放在 <script type="text/x-cpp"> */
    $$('.codebox', root).forEach(function (box) {
      var src = box.querySelector('script'), code = box.querySelector('code');
      if (!src || !code) return;
      var t = src.textContent.replace(/^\s*\n/, '').replace(/\s+$/, '');
      code.setAttribute('data-raw', t);
      code.innerHTML = hl(esc(t));
    });
    /* 复制按钮：所有 pre 都加一个 */
    $$('pre', root).forEach(function (pre) {
      if (pre.closest('[data-learn-content]')) return;   /* Python 片段：learn-code.js 自己装按钮 */
      if (pre.parentElement.classList.contains('codebox')) return;
      if (pre.querySelector('.cp2')) return;
      var b = document.createElement('button');
      b.className = 'cp2'; b.type = 'button'; b.textContent = '复制';
      b.addEventListener('click', function () {
        var t = pre.textContent.replace(/复制$/, '');
        copy(t, b);
      });
      pre.appendChild(b);
    });
    $$('.codebox .cp', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var codeEl = btn.parentElement.querySelector('code');
        copy(codeEl.getAttribute('data-raw') || codeEl.textContent, btn);
      });
    });
    /* 页内锚点：不能改 hash（会打断路由） */
    $$('a[href^="#"]', root).forEach(function (a) {
      var h = a.getAttribute('href');
      if (h.indexOf('#/') === 0 || h === '#') return;
      a.addEventListener('click', function (e) {
        var id = h.slice(1);
        var t = id && document.getElementById(id);
        if (t) {
          e.preventDefault();
          t.scrollIntoView({ behavior: 'smooth', block: 'start' });
          t.classList.remove('flash');
          void t.offsetWidth;
          t.classList.add('flash');
          clearTimeout(t.__ft);
          t.__ft = setTimeout(function () { t.classList.remove('flash'); }, 1600);
        }
      });
    });
    /* 片段里自带的搜索框：就地筛表格 */
    $$('input[type="search"], input[type="text"]', root).forEach(function (inp) {
      var tables = $$('table', root);
      if (!tables.length) return;
      inp.addEventListener('input', function () {
        var q = inp.value.trim().toLowerCase();
        tables.forEach(function (t) {
          $$('tr', t).forEach(function (tr) {
            if (tr.querySelector('th')) return;
            tr.style.display = (!q || tr.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
          });
        });
      });
    });
    /* 外链新窗口 */
    $$('a[href^="http"]', root).forEach(function (a) {
      if (a.hostname && a.hostname !== location.hostname) {
        a.target = '_blank'; a.rel = 'noopener noreferrer';
      }
    });
  }
  function copy(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = '已复制';
      btn.classList.add('done');
      setTimeout(function () { btn.classList.remove('done'); }, 400);
      setTimeout(function () { btn.textContent = old === '已复制' ? '复制' : old; }, 1200);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
    } else fallback(text, done);
  }
  function fallback(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ------------------------------------------------------------ 动效 */
  function enterAnim(doc) {
    doc.classList.remove('anim');
    void doc.offsetWidth;
    doc.classList.add('anim');
  }

  function bindReveal(doc) {
    var body = doc.querySelector('.docbody') || doc;
    var kids = $$(':scope > *', body);
    if (!('IntersectionObserver' in window)) {
      kids.forEach(function (el) { el.classList.add('rv', 'in'); });
      return;
    }
    var strip = doc.classList.contains('home');
    var targets = strip ? $$('.hero, .sec-t, .paths, .mods, .cont, .cg-t, .cgrid', doc) : kids;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { root: $('#scroll'), rootMargin: '0px 0px -6% 0px', threshold: .01 });
    targets.forEach(function (el, i) {
      if (i < 2 || el.offsetHeight < 24) return;
      el.classList.add('rv');
      if (i < 7) el.style.transitionDelay = (i * 0.035).toFixed(3) + 's';
      io.observe(el);
    });
    // 兜底：1.2s 后仍在视口内的直接显示
    setTimeout(function () {
      targets.forEach(function (el) {
        if (!el.classList.contains('rv')) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) el.classList.add('in');
      });
    }, 1200);
  }

  function countUp(el) {
    var target = parseInt(String(el.textContent).replace(/[^0-9]/g, ''), 10);
    if (!target || target < 2) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var t0 = performance.now(), dur = 760;
    var step = function (t) {
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------ 页内目录 */
  function buildTOC(root) {
    var list = $('#tocList');
    var entries = (CUR && CUR.item && CUR.item.toc) || [];
    entries = entries.filter(function (e) { return e.t && e.t.length < 64 && e.id; });
    if (entries.length < 3) {
      // 回退：从正文标题里现抓
      var heads = $$('h2, h3', root).filter(function (h) { return h.textContent.trim().length > 1; });
      entries = heads.map(function (h, i) {
        if (!h.id) h.id = 'h-' + i;
        return { lv: h.tagName === 'H2' ? 1 : 2, t: h.textContent.trim(), id: h.id };
      });
    }
    if (entries.length < 3) { $('#rail').style.display = 'none'; return; }
    var html = '';
    entries.forEach(function (e) {
      var cls = e.lv >= 4 ? 'lv4' : (e.lv === 3 ? 'lv3' : (e.lv === 2 ? 'lv2' : 'lv1'));
      html += '<a class="' + cls + '" href="#' + e.id + '" data-t="' + e.id + '">' + esc(e.t) + '</a>';
    });
    list.innerHTML = html;
    $('#rail').style.display = '';
    $$('#tocList a').forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var t = document.getElementById(a.getAttribute('data-t'));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    var els = entries.map(function (e) { return document.getElementById(e.id); }).filter(Boolean);
    spy(els);
  }

  var spyTimer = null;
  function spy(heads) {
    var sc = $('#scroll');
    var links = $$('#tocList a');
    var run = function () {
      var top = sc.getBoundingClientRect().top + 90;
      var cur = 0;
      heads.forEach(function (h, i) { if (h.getBoundingClientRect().top <= top) cur = i; });
      links.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
    };
    sc.onscroll = function () {
      var max = sc.scrollHeight - sc.clientHeight;
      var p = max > 0 ? sc.scrollTop / max : 0;
      $('#readBar').style.width = Math.min(100, p * 100) + '%';
      $('#top').classList.toggle('stuck', sc.scrollTop > 6);
      if (spyTimer) return;
      spyTimer = setTimeout(function () { spyTimer = null; run(); }, 60);
    };
    sc.onscroll();
  }

  /* ------------------------------------------------------------ 上一节 / 下一节 */
  function renderPager(mod, item) {
    var pager = $('#pager');
    if (!item) { pager.innerHTML = ''; return; }
    var idx = -1;
    mod.items.forEach(function (x, i) { if (x.id === item.id) idx = i; });
    var prev = idx > 0 ? mod.items[idx - 1] : null;
    var next = idx >= 0 && idx < mod.items.length - 1 ? mod.items[idx + 1] : null;
    var h = '';
    h += prev ? '<a href="#/' + prev.id + '"><small>← 上一页</small><b>' + esc(prev.title) + '</b></a>'
              : '<a class="dis"><small>← 上一页</small><b>已经是第一篇</b></a>';
    h += next ? '<a class="nx" href="#/' + next.id + '"><small>下一页 →</small><b>' + esc(next.title) + '</b></a>'
              : '<a class="nx dis"><small>下一页 →</small><b>本模块已读完</b></a>';
    pager.innerHTML = h;
  }

  /* ------------------------------------------------------------ 渲染一页 */
  function render() {
    if (!NAV) return;
    var p = parseHash();
    if (!p.route) { showHome(); return; }
    if (p.route === 'course') { showCourseIndex(); return; }

    var item = itemByRoute(p.route);
    if (!item) {
      // 不是已知路由：如果它是本页的锚点（例如 #fn-0），就地跳转，不要回首页
      var el = p.route && document.getElementById(p.route);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (CUR && CUR.route) history.replaceState(null, '', '#/' + CUR.route);
        return;
      }
      showHome();
      return;
    }
    var mod = modOf(p.route.split('/')[0]);
    CUR = { route: p.route, mod: mod, item: item, anchor: p.anchor };

    setCrumb(mod, item);
    markNav();
    $('.stage').classList.remove('wide');
    $('.view').classList.remove('solo');
    skeleton();
    var sc = $('#scroll');

    var paint = function (html) {
      var doc = $('#doc');
      doc.className = 'doc ' + (mod.id === 'course' || mod.id === 'sol' ? 'doc-lesson' : 'doc-study');
      var head = '<header class="doc-head">' +
        '<div class="eyebrow">' + esc(mod.name) + '</div>' +
        '<h1>' + (item.no ? '<span class="hno">' + item.no + '</span>' : '') + esc(item.title) + '</h1>' +
        (item.sub && !isCount(item.sub) ? '<p class="lede">' + esc(item.sub) + '</p>' : '') +
        chips(item, mod) + '</header>';
      doc.innerHTML = head + funcsTable(item) + '<div class="docbody">' + html + '</div>';
      if (mod.id === 'py') { doc.className = 'doc py-doc'; }
      afterRender(doc);
      if (mod.id === 'py' && window.LEARN_CODE) {
        try { window.LEARN_CODE.decorate(doc); } catch (e) { }
      }
      buildTOC(doc);
      renderPager(mod, item);
      enterAnim(doc);
      bindReveal(doc);
      markNav();
      // 进度条复位
      sc.scrollTop = 0;
      if (CUR.anchor) {
        setTimeout(function () {
          var t = document.getElementById(CUR.anchor);
          if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
      remember(item, mod);
      if (window.MathJax && window.MathJax.typesetPromise) {
        try { window.MathJax.typesetPromise([doc]); } catch (e) {}
      }
    };

    if (CACHE[p.route]) { paint(CACHE[p.route]); return; }
    fetch('data/p/' + item.file, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (t) { CACHE[p.route] = t; paint(t); })
      .catch(function () {
        $('#doc').innerHTML = '<div class="sov-e">内容加载失败：<code>' + esc(item.file) + '</code><br>' +
          '如果你是用 <code>file://</code> 直接双击打开的，请改用本地服务器（例如 <code>python -m http.server</code>）。</div>';
      });
  }

  function isCount(s) { return /^\d+\s*张卡片$/.test(s || ''); }
  function chips(item, mod) {
    var c = '', seen = {};
    function one(t, cls) {
      if (!t || seen[t]) return;
      seen[t] = 1;
      c += '<span class="chipk' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</span>';
    }
    one(item.level, 'lv');
    var LMAP = { '入门': 1, '入门+': 1.5, '普及-': 2, '普及/提高-': 3, '提高-': 3.5, '提高': 4, '提高+': 5 };
    if (item.luogu && Math.abs((LMAP[item.luogu] || 0) - (LMAP[item.level] || 0)) >= 0.9)
      one('洛谷 ' + item.luogu, 'luo');
    var LMAP = { '入门': 1, '入门+': 1.5, '普及-': 2, '普及/提高-': 3, '提高-': 3.5, '提高': 4, '提高+': 5 };
    if (item.luogu && Math.abs((LMAP[item.luogu] || 0) - (LMAP[item.level] || 0)) >= 0.9)
      one('洛谷 ' + item.luogu, 'luo');
    if (item.kind === 'review') one('回顾');
    if (item.kind === 'mock') one('模拟赛');
    one(item.dur);
    (item.tags || []).forEach(function (t) {
      if (t === '回顾' || t === '模拟赛') return;
      one(t);
    });
    if (isCount(item.sub)) c += '<span class="chipk">' + esc(item.sub) + '</span>';
    if (mod.id === 'course' || mod.id === 'py') {
      var isDone = !!LEARNED[item.id];
      c += '<span class="head-act"><button class="btn-done' + (isDone ? ' on' : '') + '" id="doneBtn" type="button">' +
           ICON.check + '<span>' + (isDone ? '已学' : '标记已学') + '</span></button></span>';
    }
    return '<div class="chips">' + c + '</div>';
  }

  function funcsTable(item) {
    var fs = item.funcs || [];
    if (!fs.length) return '';
    var rows = fs.map(function (f) {
      return '<a class="fnt-r" href="#' + f.id + '" data-t="' + f.id + '">' +
        '<code>' + esc(f.name) + '</code>' +
        '<span>' + esc(f.desc || '') + '</span>' +
        '<i aria-hidden="true">↓</i></a>';
    }).join('');
    return '<div class="fnt">' +
      '<div class="fnt-h"><b>本课函数表</b><em>' + fs.length + ' 个</em>' +
      '<span class="fnt-tip">点一行跳到讲解</span></div>' +
      '<div class="fnt-rows">' + rows + '</div></div>';
  }

  function remember(item, mod) {
    var rec = { id: item.id, title: item.title, no: item.no || '', mod: mod.name };
    RECENT = RECENT.filter(function (x) { return x.id !== item.id; });
    RECENT.unshift(rec);
    RECENT = RECENT.slice(0, 8);
    lsSet('acm.recent', RECENT);
  }

  /* 已学按钮（事件委托） */
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('#doneBtn') : null;
    if (!b || !CUR || !CUR.item) return;
    var id = CUR.item.id;
    LEARNED[id] = !LEARNED[id];
    saveLearned();
    b.classList.toggle('on', !!LEARNED[id]);
    b.querySelector('span').textContent = LEARNED[id] ? '已学' : '标记已学';
    markNav();
    paintProgress();
  });

  /* ------------------------------------------------------------ 进度 */
  function paintProgress() {
    var done = lessonsDone(), total = lessonsTotal() || 60;
    $('#pgNum').textContent = done + ' / ' + total;
    $('#pgBar').style.width = (done / total * 100) + '%';
    var c = $('#cDone');
    if (c) c.textContent = done;
  }

  /* ------------------------------------------------------------ 搜索 */
  var sels = { i: -1, list: [] };
  function openSearch() {
    $('#sov').classList.add('open');
    setTimeout(function () { $('#sovInput').focus(); }, 20);
    if (!INDEX) loadIndex();
    else runSearch($('#sovInput').value);
  }
  function closeSearch() {
    $('#sov').classList.remove('open');
    $('#sovInput').value = '';
  }
  function loadIndex() {
    fetch('data/search.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) { INDEX = d; runSearch($('#sovInput').value); })
      .catch(function () { INDEX = []; });
  }
  function runSearch(q) {
    var box = $('#sovList');
    q = (q || '').trim();
    if (!q) {
      // 默认：显示最近浏览 + 常用入口
      var h = '<div class="sov-g">最近浏览</div>';
      if (!RECENT.length) h += '<div class="sov-e">输入关键词搜索 122 张算法卡片、60 节算竞教程、26 章 Python 语法与全部计划章节。</div>';
      RECENT.slice(0, 6).forEach(function (x) {
        h += '<a class="sov-i" href="#/' + x.id + '"><span class="sm">' + esc(x.mod) + '</span>' +
             '<span class="st">' + esc(x.title) + '</span></a>';
      });
      box.innerHTML = h;
      sels.list = $$('.sov-i', box); sels.i = -1;
      return;
    }
    var ql = q.toLowerCase();
    var res = [];
    allItems().forEach(function (it) {
      var t = it.title.toLowerCase();
      var s = 0;
      if (t.indexOf(ql) === 0) s = 100;
      else if (t.indexOf(ql) >= 0) s = 80;
      else if ((it.sub || '').toLowerCase().indexOf(ql) >= 0) s = 40;
      if (s) res.push({ u: it.id, t: it.title, m: modOf(it.id.split('/')[0]).name, s: s, no: it.no || '' });
    });
    (INDEX || []).forEach(function (e) {
      for (var i = 0; i < e.h.length; i++) {
        if (e.h[i].toLowerCase().indexOf(ql) >= 0) {
          res.push({ u: e.u, t: e.h[i], m: e.m, s: 20, hint: e.t, no: '' });
          break;
        }
      }
    });
    res.sort(function (a, b) { return b.s - a.s; });
    res = res.slice(0, 40);
    if (!res.length) { box.innerHTML = '<div class="sov-e">没有找到「' + esc(q) + '」</div>'; sels.list = []; return; }
    var html = '', lastM = '';
    res.forEach(function (r) {
      if (r.m !== lastM) { html += '<div class="sov-g">' + esc(r.m) + '</div>'; lastM = r.m; }
      html += '<a class="sov-i" href="#/' + r.u + '">' +
        (r.no ? '<span class="sn">' + r.no + '</span>' : '<span class="sn">·</span>') +
        '<span class="st">' + mark(r.t, q) + '</span>' +
        (r.hint ? '<span class="sm">' + esc(r.hint) + '</span>' : '') + '</a>';
    });
    box.innerHTML = html;
    sels.list = $$('.sov-i', box); sels.i = 0;
    highlight();
  }
  function mark(t, q) {
    var i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
  }
  function highlight() {
    sels.list.forEach(function (a, i) { a.classList.toggle('cur', i === sels.i); });
    if (sels.list[sels.i]) sels.list[sels.i].scrollIntoView({ block: 'nearest' });
  }

  /* 回到顶部 */
  function bindToTop() {
    var btn = $('#toTop');
    if (!btn) return;
    var sc = $('#scroll');
    sc.addEventListener('scroll', function () {
      btn.classList.toggle('show', sc.scrollTop > 640);
    }, { passive: true });
    btn.addEventListener('click', function () {
      sc.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* 回到顶部 */
  function bindToTop() {
    var btn = $('#toTop');
    if (!btn) return;
    var sc = $('#scroll');
    sc.addEventListener('scroll', function () {
      btn.classList.toggle('show', sc.scrollTop > 640);
    }, { passive: true });
    btn.addEventListener('click', function () {
      sc.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }


  /* ------------------------------------------------------------ 背景与外观 */
  var WALL_DEF = { p: 'none', img: '', blur: 0, op: 100, dim: 0 };
  var WALL = null;

  function wallState() {
    if (WALL) return WALL;
    var o = lsGet('acm.wall', null);
    WALL = (o && typeof o === 'object') ? o : {};
    for (var k in WALL_DEF) if (typeof WALL[k] === 'undefined') WALL[k] = WALL_DEF[k];
    return WALL;
  }

  function applyWall() {
    var st = wallState(), bg = $('#bg'), dim = $('#bgDim'), root = document.documentElement;
    var custom = !!st.img;
    root.setAttribute('data-wall', custom ? 'custom' : (st.p || 'none'));
    bg.style.backgroundImage = custom ? 'url("' + st.img + '")' : '';
    bg.setAttribute('data-p', custom ? '' : (st.p || 'none'));
    bg.style.filter = st.blur ? 'blur(' + st.blur + 'px)' : 'none';
    bg.style.opacity = String(st.op / 100);
    dim.style.background = 'rgba(0,0,0,' + (st.dim / 100) + ')';
    // 面板同步
    $$('.wbtn').forEach(function (b) {
      b.classList.toggle('on', !custom && b.getAttribute('data-p') === (st.p || 'none'));
    });
    var rb = $('#rBlur'), ro = $('#rOp'), rd = $('#rDim');
    if (rb) { rb.value = st.blur; $('#vBlur').textContent = st.blur + 'px'; }
    if (ro) { ro.value = st.op; $('#vOp').textContent = st.op + '%'; }
    if (rd) { rd.value = st.dim; $('#vDim').textContent = st.dim + '%'; }
    lsSet('acm.wall', st);
  }

  function setWall(patch) {
    var st = wallState();
    for (var k in patch) st[k] = patch[k];
    applyWall();
  }

  function openSheet() { $('#sheet').classList.add('open'); }
  function closeSheet() { $('#sheet').classList.remove('open'); }

  function readImage(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.width, h = img.height;
        if (Math.max(w, h) > max) {
          var s = max / Math.max(w, h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        var data = cv.toDataURL('image/jpeg', 0.82);
        try {
          var st = wallState();
          st.img = data;
          if (!st.dim) st.dim = 40;          // 默认压暗一点，保证字能看清
          applyWall();
        } catch (e) { alert('图片太大，无法保存到本机，请换一张更小的图'); }
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function initWall() {
    applyWall();
    $('#wallBtn').addEventListener('click', openSheet);
    $$('#sheet [data-close]').forEach(function (el) { el.addEventListener('click', closeSheet); });
    $$('.wbtn').forEach(function (b) {
      b.addEventListener('click', function () {
        setWall({ p: b.getAttribute('data-p'), img: '' });
      });
    });
    $('#wallFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) readImage(e.target.files[0]);
      e.target.value = '';
    });
    $('#wallClear').addEventListener('click', function () { setWall({ img: '' }); });
    $('#wallReset').addEventListener('click', function () {
      WALL = null;
      try { localStorage.removeItem('acm.wall'); } catch (e) {}
      wallState();
      applyWall();
    });
    $('#rBlur').addEventListener('input', function (e) { setWall({ blur: +e.target.value }); });
    $('#rOp').addEventListener('input', function (e) { setWall({ op: +e.target.value }); });
    $('#rDim').addEventListener('input', function (e) { setWall({ dim: +e.target.value }); });
  }

  /* ------------------------------------------------------------ 启动 */
  function boot() {
    applyTheme(currentTheme());
    fetch('data/nav.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        NAV = d;
        buildNav();
        paintProgress();
        render();
      })
      .catch(function (e) {
        $('#doc').innerHTML = '<div class="sov-e">导航数据加载失败。请通过 https 访问，或用本地服务器打开。</div>';
      });

    window.addEventListener('hashchange', render);
    bindToTop();
    initWall();
    bindToTop();

    $('#themeBtn').addEventListener('click', toggleTheme);
    $('#sideX').addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    $('.mask').addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    $('.burger').addEventListener('click', function () { document.body.classList.add('nav-open'); });
    $('#searchBtn').addEventListener('click', openSearch);
    $('#sideSearch').addEventListener('focus', openSearch);
    $('#sov').addEventListener('click', function (e) { if (e.target === $('#sov')) closeSearch(); });
    $('#sovInput').addEventListener('input', function (e) { runSearch(e.target.value); });
    $('#sovClose').addEventListener('click', closeSearch);

    document.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); openSearch(); return; }
      if (k === 'escape') { closeSearch(); closeSheet(); document.body.classList.remove('nav-open'); return; }
      if ($('#sov').classList.contains('open')) {
        if (k === 'arrowdown') { e.preventDefault(); sels.i = Math.min(sels.i + 1, sels.list.length - 1); highlight(); }
        if (k === 'arrowup') { e.preventDefault(); sels.i = Math.max(sels.i - 1, 0); highlight(); }
        if (k === 'enter' && sels.list[sels.i]) { sels.list[sels.i].click(); closeSearch(); }
      }
      if (e.altKey && (k === 'arrowleft' || k === 'arrowright') && CUR && CUR.mod && CUR.item) {
        e.preventDefault();
        var mod = CUR.mod, idx = -1;
        mod.items.forEach(function (x, i) { if (x.id === CUR.item.id) idx = i; });
        var t = k === 'arrowleft' ? mod.items[idx - 1] : mod.items[idx + 1];
        if (t) go(t.id);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
