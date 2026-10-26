/* ==========================================================================
   learn-shell.js — 「编程学习」站的行为层
   --------------------------------------------------------------------------
   数据来自 site/js/learn-nav.js（window.LEARN_NAV，唯一事实来源）。
   本文件只做渲染与交互，**不**硬编码任何章节标题；加章节 = 只改 learn-nav.js。

   页面侧只需要挂一个空的容器 + 一个 data 属性，脚本自己长进去：

     <div data-learn-sidebar></div>              侧栏（分类可折叠树 + 已读 + 进度）
     <div data-learn-crumb></div>               面包屑：编程学习 / Python / 教程 / 本章
     <div data-learn-pager></div>               上一课 / 下一课（站点内顺序，首尾给提示）
     <div data-learn-toc></div>                 页内目录（自动扫 h2/h3，缺 id 自动补）
     <div data-learn-progress></div>            "3 / 15 章已读" + 进度条
     <div data-learn-cards></div>               首页的 C++ / Python 两大分类卡
     <div data-learn-grid></div>                Python 区入口页的章节网格
     <div data-learn-cta></div>                 "开始 / 继续学习" 按钮
     <div data-learn-recent></div>              "继续上次" 一行（没记录就不渲染）
     <input data-learn-filter>                  章节网格的即时过滤框

   已读逻辑：
     · 正文页滚过 80% 自动记为已读；也可以点 [data-learn-mark] 手动标记 / 取消
     · 状态存 localStorage['learn.read']，折叠状态存 ['learn.fold']，
       最近浏览存 ['learn.recent']；与校园主页共用 cw.theme，不碰它的其它 key

   依赖：无（不依赖 search.js、不依赖任何框架）。file:// 双击打开也能跑。
   ========================================================================== */
(function (window, document) {
  'use strict';

  var NAV = window.LEARN_NAV;
  if (!NAV || !NAV.cats) { return; }

  var KEY_READ = 'learn.read';
  var KEY_FOLD = 'learn.fold';
  var KEY_RECENT = 'learn.recent';

  /* ------------------------------------------------------------------------
     0. 路径前缀：/acm/*.html → ''，/acm/python/*.html → '../'
        （导航数据里的 href 一律相对 /acm/ 书写，见 learn-nav.js 顶部注释）
     ------------------------------------------------------------------------ */
  var PREFIX = (function () {
    var p = String(location.pathname || '').replace(/\\/g, '/');
    var el = document.querySelector('[data-learn-prefix]');
    if (el) { return el.getAttribute('data-learn-prefix') || ''; }
    if (/\/acm\/python(\/|$)/.test(p)) { return '../'; }
    return '';
  })();

  function url(href) {
    if (!href) { return '#'; }
    if (/^(?:[a-z]+:|\/|#)/i.test(href)) { return href; }   /* 绝对地址、锚点原样返回 */
    return PREFIX + href;
  }

  /* ------------------------------------------------------------------------
     1. 导航数据摊平 / 当前页定位
     ------------------------------------------------------------------------ */
  var FLAT = [];       /* 全站条目顺序（不含 home）：上下篇按它算 */
  var BYID = {};       /* id → item */
  var CATOF = {};      /* item.id → cat */
  var GRPOF = {};      /* item.id → group */

  NAV.cats.forEach(function (cat) {
    (cat.groups || []).forEach(function (grp) {
      (grp.items || []).forEach(function (it) {
        it._cat = cat.id; it._grp = grp.id;
        FLAT.push(it);
        BYID[it.id] = it;
        CATOF[it.id] = cat;
        GRPOF[it.id] = grp;
      });
    });
  });

  /* 只统计「有编号的教程章节」，用于进度分母 */
  var LESSONS = FLAT.filter(function (it) { return it.no; });

  function key(href) {
    var s = String(href || '')
      .replace(/^\.\//, '').replace(/^(?:\.\.\/)+/, '')
      .replace(/[?#].*$/, '')
      .replace(/index\.html$/, '')
      .replace(/\.html$/, '')
      .replace(/\/$/, '');
    return s || 'index';
  }

  /* 当前页在数据里的 key：'study' / 'python' / 'python/03-variables-and-types' */
  var PAGEK = (function () {
    var p = String(location.pathname || '').replace(/\\/g, '/');
    var i = p.indexOf('/acm/');
    var tail = i >= 0 ? p.slice(i + 5) : p.replace(/^.*\/site\//, '');
    return key(tail);
  })();

  var CUR = (function () {
    /* ① 正文页可以显式声明：<body data-learn-page="py-04"> */
    var explicit = document.body && document.body.getAttribute('data-learn-page');
    if (explicit && BYID[explicit]) { return BYID[explicit]; }

    /* ② 按路径匹配 */
    for (var n = 0; n < FLAT.length; n++) {
      if (key(FLAT[n].href) === PAGEK) { return FLAT[n]; }
    }
    return null;    /* 首页 / 不认识的面页 → null */
  })();

  /* 落地页（Python 区入口等）在导航里没有自己的条目，但能对上某个分类：
     这样面包屑仍然给得出「编程学习 / Python」这一层 */
  var CURCAT = (function () {
    if (CUR) { return CATOF[CUR.id] || null; }
    for (var c = 0; c < NAV.cats.length; c++) {
      var cat = NAV.cats[c];
      if (key(cat.href) === PAGEK) { return cat; }
      var gs = cat.groups || [];
      for (var g = 0; g < gs.length; g++) {
        if (gs[g].href && key(gs[g].href) === PAGEK) { return cat; }
      }
    }
    return null;
  })();

  /* ------------------------------------------------------------------------
     2. 进度 / 已读 / 折叠 状态
     ------------------------------------------------------------------------ */
  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY_READ) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function isRead(id) { return read().indexOf(id) >= 0; }

  function setRead(id, on) {
    var list = read();
    var at = list.indexOf(id);
    if (on && at < 0) { list.push(id); }
    if (!on && at >= 0) { list.splice(at, 1); }
    try { localStorage.setItem(KEY_READ, JSON.stringify(list)); } catch (e) { }
    refreshMarks();
    renderProgress();
    return on;
  }

  function readCount() {
    var list = read();
    return LESSONS.filter(function (it) { return list.indexOf(it.id) >= 0; }).length;
  }

  function foldMap() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY_FOLD) || '{}');
      return (v && typeof v === 'object') ? v : {};
    } catch (e) { return {}; }
  }
  function setFoldId(id, open) {
    var m = foldMap();
    m[id] = !!open;
    try { localStorage.setItem(KEY_FOLD, JSON.stringify(m)); } catch (e) { }
  }

  function pushRecent(it) {
    if (!it || !it.no) { return; }
    var list = [];
    try { list = JSON.parse(localStorage.getItem(KEY_RECENT) || '[]') || []; } catch (e) { }
    if (!Array.isArray(list)) { list = []; }
    list = list.filter(function (x) { return x !== it.id; });
    list.unshift(it.id);
    try { localStorage.setItem(KEY_RECENT, JSON.stringify(list.slice(0, 8))); } catch (e) { }
  }

  /* ------------------------------------------------------------------------
     3. 小工具
     ------------------------------------------------------------------------ */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }
  function label(it) {
    return it.no ? ('第 ' + it.no + ' 章 · ' + it.title) : it.title;
  }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /* 缺 id 的标题自动补一个（中文也保留，只把空白与标点换成 -） */
  function slug(text, used) {
    var s = String(text || '').trim()
      .replace(/[\s\u3000]+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5\-]+/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    if (!s) { s = 'sec'; }
    var base = s, i = 2;
    while (used[s]) { s = base + '-' + i++; }
    used[s] = 1;
    return s;
  }

  function setFold(box, open, animate) {
    if (!box) { return; }
    if (!animate) {
      box.style.maxHeight = open ? 'none' : '0px';
      box.style.opacity = open ? '1' : '0';
      return;
    }
    var h = box.scrollHeight;
    if (open) {
      box.style.maxHeight = h + 'px';
      box.style.opacity = '1';
      window.setTimeout(function () {
        if (box.getAttribute('data-open') === '1') { box.style.maxHeight = 'none'; }
      }, 300);
    } else {
      box.style.maxHeight = h + 'px';   /* 先钉住当前高度，才能动起来 */
      void box.offsetHeight;
      box.style.maxHeight = '0px';
      box.style.opacity = '0';
    }
    box.setAttribute('data-open', open ? '1' : '0');
  }

  /* ------------------------------------------------------------------------
     4. 侧栏：分类（可折叠）→ 分组 → 条目
     ------------------------------------------------------------------------ */
  var SIDEBARS = [];

  function buildSidebar(host) {
    var compact = host.getAttribute('data-compact') === '1';
    var wrap = el('div', 'ls-nav');
    var rc = readCount();

    if (!compact) {
      var head = el('div', 'ls-head');
      head.appendChild(el('span', 'ls-title', '编程学习'));
      wrap.appendChild(head);
    }

    /* 站点首页 */
    var home = el('a', 'ls-home');
    home.href = url(NAV.home.href);
    var hi = el('i', 'ls-dot');
    home.appendChild(hi);
    home.appendChild(el('span', 'ls-t', NAV.home.title));
    if (!CUR && !CURCAT) { home.classList.add('on'); home.setAttribute('aria-current', 'page'); }
    wrap.appendChild(home);

    var fm = foldMap();

    NAV.cats.forEach(function (cat) {
      var sec = el('div', 'ls-cat ls-tint-' + (cat.tint || 'blue'));
      sec.setAttribute('data-cat', cat.id);

      var isCur = (CUR && CUR._cat === cat.id) || (!CUR && !!CURCAT && CURCAT.id === cat.id);
      var open = (cat.id in fm) ? !!fm[cat.id] : !!isCur;   /* 当前分类默认展开 */

      var btn = el('button', 'ls-catbtn');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-controls', 'ls-b-' + cat.id);
      btn.appendChild(el('i', 'ls-caret'));
      btn.appendChild(el('span', 'ls-catname', cat.name));
      var cnt = 0;
      (cat.groups || []).forEach(function (g) { cnt += (g.items || []).length; });
      btn.appendChild(el('span', 'ls-catn', String(cnt)));
      sec.appendChild(btn);

      var fold = el('div', 'ls-fold');
      fold.id = 'ls-b-' + cat.id;
      fold.style.overflow = 'hidden';
      var body = el('div', 'ls-body');
      fold.appendChild(body);
      sec.appendChild(fold);

      (cat.groups || []).forEach(function (grp) {
        var g = el('div', 'ls-grp');
        if (grp.name && (cat.groups.length > 1 || grp.href)) {
          if (grp.href) {
            var gl = el('a', 'ls-grpname', grp.name);
            gl.href = url(grp.href);
            if (key(grp.href) === PAGEK) { gl.classList.add('on'); gl.setAttribute('aria-current', 'page'); }
            g.appendChild(gl);
          } else {
            g.appendChild(el('span', 'ls-grpname', grp.name));
          }
        }
        (grp.items || []).forEach(function (it) {
          var a = el('a', 'ls-i');
          a.href = url(it.href);
          a.setAttribute('data-id', it.id);
          if (it.no) { a.appendChild(el('span', 'ls-no', pad2(it.no))); }
          a.appendChild(el('span', 'ls-t', it.title));
          if (it.tag) { a.appendChild(el('em', 'ls-tag', it.tag)); }
          if (isRead(it.id)) {
            a.classList.add('is-read');
            a.appendChild(el('span', 'ls-ok', '✓'));
          }
          if (CUR && CUR.id === it.id) {
            a.classList.add('on');
            a.setAttribute('aria-current', 'page');
          }
          g.appendChild(a);
        });
        body.appendChild(g);
      });

      setFold(fold, open, false);
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(next));
        setFold(fold, next, true);
        setFoldId(cat.id, next);
      });

      wrap.appendChild(sec);
    });

    /* 教程进度（有章节的站点才显示） */
    if (LESSONS.length && !compact) {
      var pg = el('div', 'ls-prog');
      var pct = Math.round(readCount() / LESSONS.length * 100);
      var bar = el('span', 'ls-bar');
      var fill = el('i');
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      pg.appendChild(bar);
      pg.appendChild(el('span', 'ls-progtxt', readCount() + ' / ' + LESSONS.length + ' 章'));
      wrap.appendChild(pg);
    }

    host.innerHTML = '';
    host.appendChild(wrap);
    host.classList.add('learn-sidebar-host');

    return { host: host, rebuild: function () { buildSidebar(host); } };
  }

  function refreshMarks() {
    /* 已读状态变了：只改标记，不整棵重建（避免把用户滚走的侧栏弹回顶部） */
    SIDEBARS.forEach(function (sb) {
      if (!sb.host.isConnected) { return; }
      var links = sb.host.querySelectorAll('.ls-i');
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var id = a.getAttribute('data-id');
        var on = isRead(id);
        var ok = a.querySelector('.ls-ok');
        if (on && !ok) { a.appendChild(el('span', 'ls-ok', '✓')); }
        if (!on && ok) { ok.parentNode.removeChild(ok); }
        a.classList.toggle('is-read', on);
      }
    });
  }

  /* ------------------------------------------------------------------------
     5. 面包屑
     ------------------------------------------------------------------------ */
  function renderCrumb(host) {
    if (!host) { return; }
    var box = el('nav', 'learn-crumb');
    box.setAttribute('aria-label', '面包屑');

    function link(text, href) {
      var a = el('a', null, text);
      a.href = url(href);
      box.appendChild(a);
      box.appendChild(el('span', 'sep', '/'));
      return a;
    }

    link('编程学习', NAV.home.href);

    if (!CUR) {   /* 首页 / 落地页：只剩一层当前 */
      box.appendChild(el('span', 'cur', CURCAT ? CURCAT.name : '首页'));
    } else {
      var cat = CATOF[CUR.id], grp = GRPOF[CUR.id];
      link(cat.name, cat.href || (grp && grp.href) || CUR.href);
      /* 分组链接和分类链接指向同一页时（如 Python → 语法教程）不重复显示 */
      if (grp && grp.href && key(grp.href) !== key(cat.href)) { link(grp.name, grp.href); }
      box.appendChild(el('span', 'cur', label(CUR)));
    }

    host.innerHTML = '';
    host.appendChild(box);
  }

  /* ------------------------------------------------------------------------
     6. 上一课 / 下一课
     ------------------------------------------------------------------------ */
  function renderPager(host) {
    if (!host || !CUR) { return; }
    var at = -1;
    for (var i = 0; i < FLAT.length; i++) { if (FLAT[i].id === CUR.id) { at = i; break; } }
    if (at < 0) { return; }

    var prev = FLAT[at - 1], next = FLAT[at + 1];
    var box = el('nav', 'learn-pager');
    box.setAttribute('aria-label', '上一课 / 下一课');

    function side(it, dir, emptyText) {
      var n;
      if (it) {
        n = el('a', 'learn-pg ' + dir);
        n.href = url(it.href);
        n.appendChild(el('em', null, dir === 'prev' ? '← 上一课' : '下一课 →'));
        n.appendChild(el('span', null, label(it)));
      } else {
        n = el('span', 'learn-pg ' + dir + ' dis');
        n.appendChild(el('em', null, dir === 'prev' ? '← 上一课' : '下一课 →'));
        n.appendChild(el('span', null, emptyText));
      }
      return n;
    }

    box.appendChild(side(prev, 'prev', '已经是第一篇了'));
    if (CUR._cat === 'python') {
      var mid = el('a', 'learn-pg-mid', '章节目录');
      mid.href = url(GRPOF[CUR.id] && GRPOF[CUR.id].href ? GRPOF[CUR.id].href : NAV.cats[1].href);
      box.appendChild(mid);
    }
    box.appendChild(side(next, 'next', '整站内容读完了'));

    host.innerHTML = '';
    host.appendChild(box);
  }

  /* ------------------------------------------------------------------------
     7. 页内目录 + 滚动高亮
     ------------------------------------------------------------------------ */
  function renderTocAll() {
    var hosts = document.querySelectorAll('[data-learn-toc]');
    if (!hosts.length) { return; }
    var scope = document.querySelector('[data-learn-content]') ||
                document.querySelector('main') || document.body;
    var heads = scope.querySelectorAll('h2, h3');
    var used = {}, list = [];

    for (var i = 0; i < heads.length; i++) {
      var h = heads[i];
      if (h.closest('.learn-toc, .learn-pager, .learn-crumb, nav, aside')) { continue; }
      var t = (h.textContent || '').trim();
      if (!t) { continue; }
      if (!h.id) { h.id = slug(t, used); }
      else { used[h.id] = 1; }
      list.push({ id: h.id, t: t, lv: h.tagName === 'H3' ? 3 : 2, el: h });
    }
    if (list.length < 2) { return; }   /* 只有一两个标题就不必给目录了 */

    /* 同一个目录会长在多个地方（桌面 rail + 窄屏折叠块），所以要给每一处都画一份 */
    var bars = [];
    var proto = el('nav', 'learn-toc');
    proto.setAttribute('aria-label', '本页目录');
    proto.appendChild(el('div', 'lt-head', '本页目录'));
    list.forEach(function (it) {
      var a = el('a', 'lt-i lv' + it.lv, it.t);
      a.href = '#' + it.id;
      a.setAttribute('data-for', it.id);
      proto.appendChild(a);
    });

    for (var h = 0; h < hosts.length; h++) {
      var host = hosts[h];
      host.innerHTML = '';
      var box = proto.cloneNode(true);
      host.appendChild(box);
      bars.push({ host: host, box: box });
    }

    var ticking = false;
    function spy() {
      ticking = false;
      var line = (window.pageYOffset || 0) + 130;
      var best = -1;
      for (var i = 0; i < list.length; i++) {
        if (list[i].el.getBoundingClientRect().top + (window.pageYOffset || 0) - 8 <= line) { best = i; }
      }
      if (best < 0) { best = 0; }

      bars.forEach(function (bar) {
        var links = bar.box.querySelectorAll('.lt-i');
        for (var j = 0; j < links.length; j++) { links[j].classList.toggle('on', j === best); }
        /* 让高亮项留在可视区里（目录本身可滚） */
        var act = links[best];
        if (act && bar.box.scrollHeight > bar.box.clientHeight + 4) {
          bar.box.scrollTop = Math.max(0, act.offsetTop - bar.box.clientHeight / 2);
        }
      });
    }
    window.addEventListener('scroll', function () {
      if (ticking) { return; }
      ticking = true;
      window.requestAnimationFrame(spy);
    }, { passive: true });
    spy();
  }

  /* ------------------------------------------------------------------------
     7.5 代码块复制按钮（不引第三方高亮库；只加一个「复制」）
     ------------------------------------------------------------------------ */
  function enhanceCode() {
    var scope = document.querySelector('[data-learn-content]');
    if (!scope || !scope.querySelectorAll) { return; }
    var pres = scope.querySelectorAll('pre');
    for (var i = 0; i < pres.length; i++) {
      (function (pre) {
        if (pre.classList.contains('has-copy')) { return; }
        pre.classList.add('has-copy');
        var btn = el('button', 'code-copy');
        btn.type = 'button';
        btn.textContent = '复制';
        btn.addEventListener('click', function () {
          var code = pre.querySelector('code');
          var text = (code || pre).textContent || '';
          function done() {
            btn.textContent = '已复制';
            btn.classList.add('done');
            window.setTimeout(function () { btn.textContent = '复制'; btn.classList.remove('done'); }, 1400);
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { legacy(); });
          } else { legacy(); }
          function legacy() {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { }
            document.body.removeChild(ta);
          }
        });
        pre.appendChild(btn);
      })(pres[i]);
    }
  }

  /* ------------------------------------------------------------------------
     7.6 宽表格兜底：给每张表套一层 .table-wrap（横向滚动），
         否则 8 列对照表在手机上会把整页撑出横向滚动条。
         _render.py 生成的表格已经自带容器，这里只处理手写的裸 <table>。
         study.html 的老内容表格也靠这一步兜住（它不在 [data-learn-content] 里）。
     ------------------------------------------------------------------------ */
  function wrapTables() {
    var scopes = document.querySelectorAll('[data-learn-content], .layout > main');
    for (var s = 0; s < scopes.length; s++) {
      var tables = scopes[s].querySelectorAll('table');
      for (var i = 0; i < tables.length; i++) {
        var t = tables[i];
        var p = t.parentNode;
        if (!p || (p.classList && p.classList.contains('table-wrap'))) { continue; }
        var box = el('div', 'table-wrap');
        p.insertBefore(box, t);
        box.appendChild(t);
      }
    }
  }

  /* ------------------------------------------------------------------------
     8. 进度条 / 开始学习按钮 / 最近浏览
     ------------------------------------------------------------------------ */
  function countOf(name) {
    if (!name || name === 'python') { return LESSONS.length; }   /* 默认 = Python 章数 */
    if (name === 'all') { return FLAT.length; }
    var n = 0;
    for (var i = 0; i < NAV.cats.length; i++) {
      if (NAV.cats[i].id !== name) { continue; }
      var gs = NAV.cats[i].groups || [];
      for (var j = 0; j < gs.length; j++) { n += (gs[j].items || []).length; }
    }
    return n;
  }

  /* 页面里的「N 章 / N 个页面」不写死：<span data-learn-count></span>，
     想数别的分类就写 data-learn-count="cpp"（分类 id）或 "all"（全站条目） */
  function renderCounts() {
    var hosts = document.querySelectorAll('[data-learn-count]');
    for (var i = 0; i < hosts.length; i++) {
      hosts[i].textContent = String(countOf(hosts[i].getAttribute('data-learn-count')));
    }
  }

  function renderProgress() {
    var hosts = document.querySelectorAll('[data-learn-progress]');
    if (!hosts.length || !LESSONS.length) { return; }
    var n = readCount(), total = LESSONS.length, pct = Math.round(n / total * 100);
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      host.innerHTML = '';
      var bar = el('span', 'learn-bar');
      var fill = el('i');
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      host.appendChild(bar);
      host.appendChild(el('span', 'learn-bartext', n + ' / ' + total + ' 章已读 · ' + pct + '%'));
    }
  }

  function nextLesson() {
    var done = read();
    for (var i = 0; i < LESSONS.length; i++) {
      if (done.indexOf(LESSONS[i].id) < 0) { return LESSONS[i]; }
    }
    return null;
  }

  function renderCta() {
    var hosts = document.querySelectorAll('[data-learn-cta]');
    if (!hosts.length) { return; }
    var it = nextLesson(), done = readCount();
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      host.innerHTML = '';
      var a = el('a', 'learn-cta');
      a.href = url(it ? it.href : LESSONS[LESSONS.length - 1].href);
      a.appendChild(el('em', null, done === 0 ? '从第 1 章开始' : (it ? '继续学习' : '已经全部读完，回看最后一章')));
      a.appendChild(el('span', null, it ? label(it) : label(LESSONS[LESSONS.length - 1])));
      host.appendChild(a);
    }
  }

  function renderRecent() {
    var hosts = document.querySelectorAll('[data-learn-recent]');
    if (!hosts.length) { return; }
    var list = [];
    try { list = JSON.parse(localStorage.getItem(KEY_RECENT) || '[]') || []; } catch (e) { }
    var it = null;
    for (var i = 0; i < list.length; i++) {
      if (BYID[list[i]]) { it = BYID[list[i]]; break; }
    }
    for (var k = 0; k < hosts.length; k++) {
      hosts[k].innerHTML = '';
      if (!it) { continue; }
      var a = el('a', 'learn-recent');
      a.href = url(it.href);
      a.appendChild(el('em', null, '继续上次'));
      a.appendChild(el('span', null, label(it)));
      hosts[k].appendChild(a);
    }
  }

  /* ------------------------------------------------------------------------
     9. 首页两大分类卡 / 章节网格 / 过滤
     ------------------------------------------------------------------------ */
  function renderCards() {
    var hosts = document.querySelectorAll('[data-learn-cards]');
    if (!hosts.length) { return; }
    var box = el('div', 'catrow');

    NAV.cats.forEach(function (cat) {
      var cnt = 0, tags = [];
      (cat.groups || []).forEach(function (g) {
        cnt += (g.items || []).length;
        (g.items || []).forEach(function (it) { if (it.tag) { tags.push(it.tag); } });
      });

      var a = el('a', 'catcard cat-' + (cat.tint || 'blue'));
      a.href = url(cat.href);

      var top = el('span', 'cat-top');
      top.appendChild(el('span', 'cat-tag', cat.short || cat.name));
      top.appendChild(el('span', 'cat-no',
        cat.id === 'python' ? (LESSONS.length + ' 章') : (cnt + ' 个入口')));
      a.appendChild(top);

      a.appendChild(el('b', 'cat-name', cat.name));
      a.appendChild(el('span', 'cat-note', cat.note || ''));

      var ul = el('span', 'cat-list');
      (cat.groups || []).forEach(function (g) {
        (g.items || []).forEach(function (it) {
          if (it.no) { return; }              /* 章节逐个列出太长，只列入口页 */
          var li = el('span', 'cat-li');
          li.appendChild(el('i', 'cat-li-dot'));
          li.appendChild(el('span', null, it.title));
          if (it.tag) { li.appendChild(el('em', null, it.tag)); }
          ul.appendChild(li);
        });
      });
      /* Python 那侧没有「入口页」这种条目，改为露前 3 章 + 总数 */
      if (cat.id === 'python' && LESSONS.length) {
        LESSONS.slice(0, 3).forEach(function (it) {
          var li = el('span', 'cat-li');
          li.appendChild(el('i', 'cat-li-dot'));
          li.appendChild(el('span', null, label(it)));
          ul.appendChild(li);
        });
        if (LESSONS.length > 3) {
          var more = el('span', 'cat-li');
          more.appendChild(el('i', 'cat-li-dot'));
          more.appendChild(el('span', null, '…… 后面还有 ' + (LESSONS.length - 3) + ' 章，共 '
            + LESSONS.length + ' 章'));
          ul.appendChild(more);
        }
      }
      a.appendChild(ul);

      a.appendChild(el('span', 'cat-go', '进入 →'));
      box.appendChild(a);
    });

    for (var i = 0; i < hosts.length; i++) {
      hosts[i].innerHTML = '';
      hosts[i].appendChild(box.cloneNode(true));
    }
  }

  function renderGrid() {
    var hosts = document.querySelectorAll('[data-learn-grid]');
    if (!hosts.length) { return; }
    var done = read();
    var grid = el('div', 'py-grid');

    LESSONS.forEach(function (it) {
      var a = el('a', 'py-card');
      a.href = url(it.href);
      a.setAttribute('data-text', (label(it) + ' ' + (it.desc || '')).toLowerCase());
      if (done.indexOf(it.id) >= 0) { a.classList.add('is-read'); }
      a.appendChild(el('span', 'py-no', pad2(it.no)));
      var body = el('span', 'py-body');
      body.appendChild(el('b', null, it.title));
      if (it.desc) { body.appendChild(el('span', 'py-desc', it.desc)); }
      a.appendChild(body);
      a.appendChild(el('span', 'py-ok', done.indexOf(it.id) >= 0 ? '✓ 已读' : '未读'));
      grid.appendChild(a);
    });

    for (var i = 0; i < hosts.length; i++) {
      hosts[i].innerHTML = '';
      hosts[i].appendChild(grid.cloneNode(true));
    }

    /* 即时过滤：标题 + 简介 */
    var inputs = document.querySelectorAll('[data-learn-filter]');
    for (var j = 0; j < inputs.length; j++) {
      (function (inp) {
        inp.addEventListener('input', function () {
          var q = String(inp.value || '').trim().toLowerCase();
          var cards = document.querySelectorAll('.py-card');
          for (var c = 0; c < cards.length; c++) {
            var t = cards[c].getAttribute('data-text') || '';
            cards[c].style.display = (!q || t.indexOf(q) >= 0) ? '' : 'none';
          }
        });
      })(inputs[j]);
    }
  }

  /* ------------------------------------------------------------------------
     10. 正文页：标题补水 + 自动记已读 + 手动标记
     ------------------------------------------------------------------------ */
  /* 章节页的 h1 / 导语可以先留空，由这里按 learn-nav.js 补上；
     作者要是已经在 HTML 里写了文字，就一个字都不动（静态文本对 SEO 与禁用 JS 更友好）。 */
  function hydrateHead() {
    if (!CUR) { return; }
    if (CUR.no) { document.title = label(CUR) + ' · Python 语法教程 · 编程学习'; }
    else { document.title = CUR.title + ' · 编程学习'; }

    var h1 = document.querySelector('.learn-head h1, .learn-head [data-learn-title]');
    if (h1 && !(h1.textContent || '').trim()) { h1.textContent = label(CUR); }

    var lead = document.querySelector('.learn-head [data-learn-lead], .learn-head .lead');
    if (lead && !(lead.textContent || '').trim() && CUR.desc) { lead.textContent = CUR.desc; }

    var md = document.querySelector('meta[name="description"]');
    if (md && !(md.getAttribute('content') || '').trim()) {
      md.setAttribute('content', CUR.desc || (label(CUR) + ' — Python 语法教程 · 编程学习站'));
    }
  }

  function wireReading() {
    if (!CUR || !CUR.no) { return; }
    pushRecent(CUR);

    /* 手动标记按钮 */
    var marks = document.querySelectorAll('[data-learn-mark]');
    for (var i = 0; i < marks.length; i++) {
      (function (btn) {
        function paint() {
          var on = isRead(CUR.id);
          btn.textContent = on ? '✓ 已标记为已读' : '标记为已读';
          btn.classList.toggle('on', on);
          btn.setAttribute('aria-pressed', String(on));
        }
        paint();
        btn.addEventListener('click', function () {
          setRead(CUR.id, !isRead(CUR.id));
          paint();
        });
      })(marks[i]);
    }

    /* 滚过 80% 自动记已读（只记一次，记过就不再打扰） */
    if (isRead(CUR.id)) { return; }
    var fired = false;
    function check() {
      if (fired) { return; }
      var doc = document.documentElement;
      var total = (doc.scrollHeight || 0) - window.innerHeight;
      if (total < 400) { return; }                 /* 短页面不自动记，靠手动 */
      var p = (window.pageYOffset || 0) / total;
      if (p >= 0.8) {
        fired = true;
        setRead(CUR.id, true);
        var marks2 = document.querySelectorAll('[data-learn-mark]');
        for (var k = 0; k < marks2.length; k++) {
          marks2[k].textContent = '✓ 已标记为已读';
          marks2[k].classList.add('on');
          marks2[k].setAttribute('aria-pressed', 'true');
        }
      }
    }
    window.addEventListener('scroll', check, { passive: true });
    check();
  }

  /* ------------------------------------------------------------------------
     11. 启动
     ------------------------------------------------------------------------ */
  function boot() {
    /* 侧栏（可以有多处：桌面 aside + 窄屏折叠条） */
    SIDEBARS = [];
    var sides = document.querySelectorAll('[data-learn-sidebar]');
    for (var i = 0; i < sides.length; i++) {
      SIDEBARS.push(buildSidebar(sides[i]));
    }

    renderCrumb(document.querySelector('[data-learn-crumb]'));
    renderPager(document.querySelector('[data-learn-pager]'));
    renderTocAll();
    renderCounts();
    renderProgress();
    renderCta();
    renderRecent();
    renderCards();
    renderGrid();
    enhanceCode();
    wrapTables();
    wireReading();

    document.documentElement.classList.add('learn-ready');
  }

  window.LEARN_SHELL = {
    nav: NAV,
    url: url,
    prefix: PREFIX,
    current: CUR,
    items: FLAT,
    lessons: LESSONS,
    label: label,
    isRead: isRead,
    setRead: setRead,
    progress: function () { return { read: readCount(), total: LESSONS.length }; },
    boot: boot
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);