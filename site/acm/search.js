/* ==========================================================================
   search.js — ACM 子站「跨块搜索」+ 「浮层打开整块内容」
   --------------------------------------------------------------------------
   用法：任意子站页面加一行
       <script src="./search.js" defer></script>
   它会自己做三件事，页面不需要额外写任何标记：
     ① 往 .acm-nav-actions 里插一个搜索按钮（没有这个容器就跳过）
     ② 往 body 末尾插两个浮层：搜索浮层、页面浮层
     ③ 惰性加载 ./site-index.json（第一次打开搜索才请求）

   门户页另可用：
       <input data-cw-searchbox>        → 自动接上搜索，结果渲染到 [data-cw-searchout]
       CW_SEARCH.openPage(url, title)   → 用浮层打开某个页面的完整内容

   快捷键：/ 或 Ctrl+K 打开搜索，Esc 关闭
   ========================================================================== */
(function () {
  'use strict';

  var BLOCKS = { hb: '学习手册', pl: '学习计划', dl: '日常开发' };
  var INDEX_URL = './site-index.json';
  var items = null, loading = null;

  /* ---------------- 数据 ---------------- */
  function load() {
    if (items) return Promise.resolve(items);
    if (loading) return loading;
    loading = fetch(INDEX_URL, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { items = j.items || []; return items; })
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }

  /* 打分：完全匹配 > 开头匹配 > 标题包含 > 关键词包含 > 章节包含 */
  function score(it, q) {
    var t = (it.t || '').toLowerCase(), k = (it.k || '').toLowerCase(), s = (it.s || '').toLowerCase();
    if (t === q) return 100;
    if (t.indexOf(q) === 0) return 80;
    if (t.indexOf(q) >= 0) return 60;
    if (k.indexOf(q) >= 0) return 40;
    if (s.indexOf(q) >= 0) return 20;
    return 0;
  }
  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var sc = score(items[i], q);
      if (sc > 0) out.push({ it: items[i], sc: sc });
    }
    out.sort(function (a, b) {
      return b.sc - a.sc || (a.it.u.length - b.it.u.length);
    });
    return out.slice(0, 40).map(function (x) { return x.it; });
  }

  /* ---------------- 结果渲染 ---------------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function renderInto(q, el) {
    q = q.trim();
    if (!q) { el.innerHTML = ''; return; }
    el.innerHTML = '<p class="cws-hint">正在搜索…</p>';
    load().then(function () {
      var res = search(q);
      if (!res.length) {
        el.innerHTML = '<p class="cws-hint">没找到「' + esc(q) + '」。试试算法名（线段树 / 二分）、或关键词（快读 / 对拍 / 离散化）。</p>';
        return;
      }
      // 按块分组
      var groups = {}, order = [];
      res.forEach(function (it) {
        if (!groups[it.b]) { groups[it.b] = []; order.push(it.b); }
        groups[it.b].push(it);
      });
      var h = '<p class="cws-hint">找到 ' + res.length + ' 条，来自 ' + order.length + ' 个板块</p>';
      order.forEach(function (b) {
        h += '<div class="cws-grp"><div class="cws-grp-hd">' + esc(BLOCKS[b] || b) + '<em>' + groups[b].length + ' 条</em></div><div class="cws-list">';
        groups[b].forEach(function (it) {
          h += '<a class="cws-item" href="' + esc(it.u) + '" data-cws-open="' + esc(it.u) + '">' +
               '<span class="cws-t">' + esc(it.t) + '</span>' +
               (it.s ? '<span class="cws-s">' + esc(it.s) + '</span>' : '') +
               (it.lv ? '<span class="cws-lv">' + esc(it.lv) + '</span>' : '') +
               '</a>';
        });
        h += '</div></div>';
      });
      el.innerHTML = h;
      bindOpen(el);
    }).catch(function () {
      el.innerHTML = '<p class="cws-hint cws-err">读不到搜索索引（site-index.json）。' +
        '用「在新标签页打开」也能正常浏览各页。</p>';
    });
  }

  // 结果项：默认用浮层打开；按住 Ctrl/⌘ 或中键则新标签页
  function bindOpen(root) {
    [].slice.call(root.querySelectorAll('[data-cws-open]')).forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        var u = a.getAttribute('data-cws-open');
        openPage(u.split('#')[0], a.querySelector('.cws-t').textContent, u.split('#')[1]);
      });
    });
  }

  /* ---------------- 浮层外壳 ---------------- */
  var elSearch = null, elPage = null;

  function buildShell(id, inner) {
    var d = document.createElement('div');
    d.className = 'cw-ov';
    d.id = id;
    d.innerHTML = '<div class="cw-ov-bg"></div><div class="cw-ov-panel">' + inner + '</div>';
    d.querySelector('.cw-ov-bg').addEventListener('click', function () { close(id); });
    document.body.appendChild(d);
    return d;
  }

  /* ---------- 搜索浮层 ---------- */
  function ensureSearch() {
    if (elSearch) return elSearch;
    elSearch = buildShell('cwSearchOv',
      '<div class="cw-ov-hd">' +
        '<input id="cwSq" type="search" placeholder="搜全部内容：算法名 / 关键词 / 小节名，如「线段树」「快读」「对拍」" autocomplete="off">' +
        '<button type="button" class="cw-x" id="cwSx" title="关闭（Esc）">✕</button>' +
      '</div>' +
      '<div class="cw-ov-bd" id="cwSr"></div>' +
      '<div class="cw-ov-ft">搜索范围：学习手册 122 张 · 学习计划 67 张 · 日常开发 41 张 · 入门篇详解 10 篇 —— 点结果直接在当前页弹出全文</div>');
    var q = elSearch.querySelector('#cwSq');
    q.addEventListener('input', function () { renderInto(q.value, elSearch.querySelector('#cwSr')); });
    elSearch.querySelector('#cwSx').addEventListener('click', function () { close('cwSearchOv'); });
    return elSearch;
  }

  function openSearch(initial) {
    var d = ensureSearch();
    d.classList.add('on');
    document.documentElement.classList.add('cw-noscroll');
    var q = d.querySelector('#cwSq');
    setTimeout(function () { q.focus(); q.select(); }, 30);
    if (initial != null) { q.value = initial; renderInto(initial, d.querySelector('#cwSr')); }
  }

  /* ---------- 页面浮层（显示整块内容） ---------- */
  function ensurePage() {
    if (elPage) return elPage;
    elPage = buildShell('cwPageOv',
      '<div class="cw-ov-hd cw-ov-hd2">' +
        '<b id="cwPt"></b>' +
        '<nav class="cw-ov-tabs" id="cwPnav"></nav>' +
        '<a class="cw-lnk" id="cwPn" target="_blank" rel="noopener" title="在新标签页里打开这一页">新标签页 ↗</a>' +
        '<button type="button" class="cw-x" id="cwPx" title="关闭（Esc）">✕</button>' +
      '</div>' +
      '<iframe id="cwPf" title="内容"></iframe>');
    elPage.querySelector('#cwPx').addEventListener('click', function () { close('cwPageOv'); });
    // 浮层内的板块切换
    var nav = elPage.querySelector('#cwPnav');
    PAGES.forEach(function (p) {
      var a = document.createElement('a');
      a.href = p.u;
      a.textContent = p.n;
      a.setAttribute('data-u', p.u);
      a.addEventListener('click', function (e) {
        e.preventDefault();
        openPage(p.u, p.n);
      });
      nav.appendChild(a);
    });
    return elPage;
  }

  var PAGES = [
    { n: '学习资料', u: './study.html' },
    { n: '题练场', u: './practice.html' }
  ];

  function titleOf(u) {
    u = u.replace(/^\.\//, '');
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i].u.replace(/^\.\//, '') === u) return PAGES[i].n;
    return '内容';
  }

  function openPage(url, title, hash) {
    var d = ensurePage();
    // 先把搜索浮层收起来，免得叠两层
    if (elSearch) elSearch.classList.remove('on');
    d.classList.add('on');
    document.documentElement.classList.add('cw-noscroll');

    // 归一化：搜索结果是 "handbook.html#x"，导航按钮是 "./handbook.html"，要去掉 "./" 才能比
    var base = url.replace(/^\.\//, '').split('#')[0];
    // 目标就在当前这一页（例如在 study.html 上搜到 study.html 的某张卡）：
    // 直接滚过去 / 设 hash，不用再套一层浮层 —— 否则等于把整页嵌进自己。
    var here = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
    if (base.replace(/\.html$/, '') === here) {
      if (hash) location.hash = hash;
      else window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    var f = d.querySelector('#cwPf');
    d.querySelector('#cwPt').textContent = title || titleOf(base);
    d.querySelector('#cwPn').setAttribute('href', url);
    [].slice.call(d.querySelectorAll('#cwPnav a')).forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-u').replace(/^\.\//, '') === base);
    });

    if (f.getAttribute('data-base') === base) {
      // 同一页只换锚点：直接改 hash，不重新加载
      try { f.contentWindow.location.hash = hash || ''; } catch (e) { /* 忽略 */ }
      if (hash) scrollInner(f, hash);
    } else {
      f.setAttribute('data-base', base);
      f.addEventListener('load', function onload() {
        f.removeEventListener('load', onload);
        slimInner(f);
        if (hash) scrollInner(f, hash);
      });
      f.src = url;
    }
  }

  // 把内嵌页面自己的顶栏收掉 —— 浮层已经有导航了，两套顶栏叠着很重
  function slimInner(f) {
    try {
      var doc = f.contentDocument;
      if (!doc) return;
      var st = doc.getElementById('cwSlim');
      if (!st) {
        st = doc.createElement('style');
        st.id = 'cwSlim';
        st.textContent = '.acm-nav{display:none!important}.acm-footer{display:none!important}' +
          ':root{--acm-nav-h:0px}html{scroll-padding-top:14px}';
        doc.head.appendChild(st);
      }
    } catch (e) { /* 跨域或沙箱限制：忽略，内嵌页保留自己的顶栏 */ }
  }

  function scrollInner(f, hash) {
    try {
      var el = f.contentDocument.getElementById(hash);
      if (el) {
        var box = el.closest && el.closest('details.fold');
        if (box) box.open = true;
        var sec = el.closest && el.closest('.sec');
        if (sec && sec.classList.contains('fold')) sec.classList.remove('fold');
        setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 40);
      }
    } catch (e) { /* 忽略 */ }
  }

  function close(id) {
    var d = document.getElementById(id);
    if (d) d.classList.remove('on');
    var any = document.querySelector('.cw-ov.on');
    if (!any) document.documentElement.classList.remove('cw-noscroll');
    if (id === 'cwPageOv' && elPage) {
      // 关掉时卸载 iframe，避免里面的计时器/媒体继续跑
      var f = elPage.querySelector('#cwPf');
      f.removeAttribute('data-base');
      f.src = 'about:blank';
    }
  }

  /* ---------------- 样式 ---------------- */
  function injectCss() {
    var css = ''
      + '.cw-ov{position:fixed;inset:0;z-index:200;display:none}'
      + '.cw-ov.on{display:block}'
      + '.cw-ov-bg{position:absolute;inset:0;background:rgb(2 6 14 / .66);backdrop-filter:blur(3px)}'
      + '.cw-ov-panel{position:absolute;inset:auto;left:50%;top:50%;transform:translate(-50%,-50%);'
      + 'width:min(1080px,calc(100vw - 48px));height:min(820px,calc(100vh - 48px));display:flex;flex-direction:column;'
      + 'background:rgb(var(--panel-rgb,19 28 46) / .98);border:1px solid var(--line-2,rgb(148 163 184 / .34));'
      + 'border-radius:16px;overflow:hidden;box-shadow:0 24px 70px rgb(0 0 0 / .55)}'
      + '.cw-ov-hd{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--line,rgb(148 163 184 / .18));flex:none}'
      + '.cw-ov-hd input{flex:1;padding:9px 13px;border-radius:10px;font-size:14px;'
      + 'border:1px solid var(--line-2,rgb(148 163 184 / .34));background:rgb(var(--bg-rgb,8 13 24) / .6);'
      + 'color:var(--text,#e4ebf6);outline:none}'
      + '.cw-ov-hd input:focus{border-color:var(--accent,#5b9dff)}'
      + '.cw-ov-hd b{font-size:14.5px;color:var(--text,#e4ebf6);white-space:nowrap}'
      + '.cw-x{border:1px solid var(--line-2,rgb(148 163 184 / .34));background:transparent;color:var(--text-2,#a2b2c9);'
      + 'border-radius:9px;width:34px;height:34px;cursor:pointer;font-size:14px;flex:none}'
      + '.cw-x:hover{border-color:var(--accent,#5b9dff);color:var(--accent,#5b9dff)}'
      + '.cw-ov-bd{flex:1;overflow:auto;padding:12px 14px 16px}'
      + '.cw-ov-ft{flex:none;padding:9px 14px;border-top:1px solid var(--line,rgb(148 163 184 / .18));'
      + 'font-size:11.5px;color:var(--text-3,#75879f)}'
      + '.cw-ov-tabs{display:flex;gap:2px;padding:2px;border:1px solid var(--line,rgb(148 163 184 / .18));border-radius:9px}'
      + '.cw-ov-tabs a{padding:5px 11px;border-radius:7px;font-size:12.5px;color:var(--text-3,#75879f);text-decoration:none;white-space:nowrap}'
      + '.cw-ov-tabs a:hover{color:var(--text,#e4ebf6)}'
      + '.cw-ov-tabs a.on{background:var(--accent,#5b9dff);color:#05101f;font-weight:600}'
      + '.cw-lnk{font-size:12px;color:var(--text-3,#75879f);text-decoration:none;white-space:nowrap;margin-left:auto}'
      + '.cw-lnk:hover{color:var(--accent,#5b9dff)}'
      + '.cw-ov-panel iframe{flex:1;width:100%;border:0;background:rgb(var(--bg-rgb,8 13 24))}'
      + '.cw-ov-hd2 b{flex:none;max-width:34%;overflow:hidden;text-overflow:ellipsis}'
      + '.cws-hint{font-size:12.5px;color:var(--text-3,#75879f);margin:4px 0 12px}'
      + '.cws-err{color:rgb(248 113 113)}'
      + '.cws-grp{margin:0 0 16px}'
      + '.cws-grp-hd{font-size:12px;color:var(--text-3,#75879f);letter-spacing:.5px;margin:0 0 6px;display:flex;gap:8px;align-items:baseline}'
      + '.cws-grp-hd em{font-style:normal;margin-left:auto}'
      + '.cws-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px}'
      + '.cws-item{display:flex;align-items:baseline;gap:8px;padding:8px 11px;border-radius:9px;text-decoration:none;'
      + 'border:1px solid var(--line,rgb(148 163 184 / .18));background:rgb(var(--bg-rgb,8 13 24) / .35)}'
      + '.cws-item:hover{border-color:var(--accent,#5b9dff);text-decoration:none}'
      + '.cws-t{font-size:13.5px;color:var(--text,#e4ebf6);font-weight:600}'
      + '.cws-s{font-size:11.5px;color:var(--text-3,#75879f);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.cws-lv{font-size:10.5px;color:var(--text-3,#75879f);margin-left:auto;white-space:nowrap}'
      + '.cw-menu-btn svg{width:15px;height:15px}'
      + 'html.cw-noscroll,html.cw-noscroll body{overflow:hidden}'
      + '@media (max-width:640px){.cw-ov-panel{width:100vw;height:100vh;max-width:100vw;max-height:100vh;border-radius:0}'
      + '.cw-ov-tabs a{padding:5px 8px;font-size:11.5px}.cw-lnk{display:none}}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------------- 顶栏搜索按钮 ---------------- */
  function injectButton() {
    var box = document.querySelector('.acm-nav-actions');
    if (!box || box.querySelector('[data-cw-searchbtn]')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'acm-btn acm-btn-icon cw-menu-btn';
    b.setAttribute('data-cw-searchbtn', '');
    b.title = '搜索全部内容（快捷键 / 或 Ctrl+K）';
    b.setAttribute('aria-label', '搜索全部内容');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/></svg>';
    b.addEventListener('click', function () { openSearch(''); });
    box.insertBefore(b, box.firstChild);
  }

  /* ---------------- 快捷键 ---------------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var on = document.querySelector('.cw-ov.on');
      if (on) { close(on.id); return; }
    }
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      openSearch('');
    }
  });

  /* ---------------- 启动 ---------------- */
  function init() {
    injectCss();
    injectButton();
    // 门户页的大搜索框
    [].slice.call(document.querySelectorAll('[data-cw-searchbox]')).forEach(function (q) {
      var out = document.querySelector('[data-cw-searchout]');
      if (!out) return;
      q.addEventListener('input', function () { renderInto(q.value, out); });
      q.addEventListener('focus', function () { if (items === null) load().catch(function () {}); });
      // 支持 ?q=xxx 直接从别的页跳进来搜
      var m = location.search.match(/[?&]q=([^&]*)/);
      if (m) {
        var v = decodeURIComponent(m[1].replace(/\+/g, ' '));
        q.value = v;
        renderInto(v, out);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.CW_SEARCH = { open: openSearch, openPage: openPage, close: close, load: load };
})();
