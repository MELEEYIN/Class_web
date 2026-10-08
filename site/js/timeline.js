/* ==========================================================================
   timeline.js — 时间线页（/timeline.html）
   --------------------------------------------------------------------------
   记录模型（localStorage，键 cw.timeline.v1）：
     {
       v: 1,
       days:   { '2026-10-08': { c: 3, items: [ { t: '09:00', e: '起床' } ] } },
       months: { '2026-10': '这个月的总结…' }
     }
     · c = 颜色序号（0..7，复用站点的 [data-color] 八色系统）或 -1 表示默认色
     · items 只存「时间 + 事件」两样东西，顺序按时间排好

   CSP 说明：本站根路径是 script-src 'self'，所以整页没有任何内联脚本 /
   onclick 属性，交互全部靠这里的事件委托完成。
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW || {};
  var U = CW.util;
  if (!U) { return; }                       /* util.js 没加载就安静退出 */

  var KEY = 'timeline.v1';
  var NCOLOR = 8;                           /* [data-color="0".."7"] */
  var WD = ['日', '一', '二', '三', '四', '五', '六'];

  /* ======================================================================
     1. 数据层
     ====================================================================== */
  function blank() { return { v: 1, days: {}, months: {} }; }

  function load() {
    var raw = U.lsGet(KEY, null);
    var d = blank();
    if (!raw || typeof raw !== 'object') return d;

    var days = raw.days && typeof raw.days === 'object' ? raw.days : {};
    Object.keys(days).forEach(function (k) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
      var src = days[k] || {};
      var items = [];
      (Array.isArray(src.items) ? src.items : []).forEach(function (it) {
        if (!it) return;
        var e = String(it.e == null ? '' : it.e).trim();
        if (!e) return;                     /* 空事件不保留 */
        items.push({ t: normTime(it.t), e: e });
      });
      if (!items.length) return;
      sortItems(items);
      var c = parseInt(src.c, 10);
      d.days[k] = { c: (c >= 0 && c < NCOLOR) ? c : -1, items: items };
    });

    var months = raw.months && typeof raw.months === 'object' ? raw.months : {};
    Object.keys(months).forEach(function (k) {
      if (!/^\d{4}-\d{2}$/.test(k)) return;
      var t = String(months[k] == null ? '' : months[k]);
      if (t.trim()) d.months[k] = t;
    });
    return d;
  }

  var data = load();
  var saveTimer = 0;

  function save() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    U.lsSet(KEY, data);
  }
  /* 文本框连续输入时防抖，别每敲一个字写一次 localStorage */
  function saveSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = 0; U.lsSet(KEY, data); }, 320);
  }

  /* ---- 时间归一化：'9' → 09:00、'930' → 09:30、'9:3' → 09:03，非法则留空 ---- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function normTime(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var m = /^(\d{1,2})\s*[:：.、]\s*(\d{1,2})$/.exec(s);
    var h, mi;
    if (m) { h = +m[1]; mi = +m[2]; }
    else {
      var dg = s.replace(/\D/g, '');
      if (!dg) return '';
      if (dg.length <= 2) { h = +dg; mi = 0; }
      else if (dg.length === 3) { h = +dg.slice(0, 1); mi = +dg.slice(1); }
      else { h = +dg.slice(0, 2); mi = +dg.slice(2, 4); }
    }
    if (!isFinite(h) || !isFinite(mi)) return '';
    if (h > 23) h = 23;
    if (mi > 59) mi = 59;
    return pad2(h) + ':' + pad2(mi);
  }

  /* 按时间排序；没填时间的排在最后（用 99:99 当哨兵，稳定排序保留先后） */
  function sortItems(arr) {
    arr.forEach(function (it, i) { it.__o = i; });
    arr.sort(function (a, b) {
      var ta = a.t || '99:99', tb = b.t || '99:99';
      return ta === tb ? a.__o - b.__o : (ta < tb ? -1 : 1);
    });
    arr.forEach(function (it) { delete it.__o; });
    return arr;
  }

  function dayOf(key) { return data.days[key] || null; }
  function ensureDay(key) {
    if (!data.days[key]) data.days[key] = { c: -1, items: [] };
    return data.days[key];
  }
  function dropIfEmpty(key) {
    var d = data.days[key];
    if (d && !d.items.length) delete data.days[key];
  }

  /* ======================================================================
     2. 视图状态
     ====================================================================== */
  var today = U.today();
  var view = { ym: U.fmtDate(today).slice(0, 7), q: '', editing: '' };

  var $ = U.$, $$ = U.$$;
  var hostDays, hostStats, sumTa, sumHint, monthLabel, monthTip, qInput, addBox;

  function ymLabel(ym) {
    var p = ym.split('-');
    return p[0] + ' 年 ' + parseInt(p[1], 10) + ' 月';
  }
  function shiftMonth(n) {
    view.ym = U.fmtDate(U.addMonths(U.parseDate(view.ym + '-01'), n)).slice(0, 7);
    render();
  }

  function hasItems(k) { return data.days[k] && data.days[k].items.length; }
  function monthKeys(ym) {
    return Object.keys(data.days).filter(function (k) {
      return hasItems(k) && k.slice(0, 7) === ym;
    }).sort();
  }
  function allKeys() {
    return Object.keys(data.days).filter(hasItems).sort();
  }

  /* ======================================================================
     3. 渲染
     ====================================================================== */
  function render() {
    var q = view.q.trim().toLowerCase();
    var searching = !!q;
    var keys = searching ? allKeys() : monthKeys(view.ym);

    /* 3.1 工具条 */
    monthLabel.textContent = ymLabel(view.ym);
    if (searching) {
      monthTip.innerHTML = '搜索中：跨全部月份';
      monthTip.hidden = false;
    } else {
      monthTip.hidden = true;
    }

    /* 3.2 统计（按当前显示范围算） */
    var nd = 0, ni = 0;
    keys.forEach(function (k) {
      var n = picked(data.days[k].items, q).length;
      if (n) { nd++; ni += n; }
    });
    hostStats.innerHTML =
      chip('天数', nd) + chip('事件', ni) +
      (nd ? chip('平均', (ni / nd).toFixed(1) + ' 条/天') : '');

    /* 3.3 本月总结（搜索时仍然显示当前月的那一份） */
    if (sumTa.value !== (data.months[view.ym] || '')) sumTa.value = data.months[view.ym] || '';
    updateSumHint();

    /* 3.4 日期卡片 */
    hostDays.innerHTML = '';
    var shown = 0;
    keys.forEach(function (k) {
      var rows = picked(data.days[k].items, q);
      if (!rows.length) return;
      hostDays.appendChild(dayCard(k, rows));
      shown++;
    });
    if (!shown) hostDays.appendChild(emptyState(searching, q));
    hostDays.dataset.count = shown;
  }

  /* 过滤出命中的行，并保留它在原数组里的下标（编辑/删除要用原下标） */
  function picked(items, q) {
    var out = [];
    items.forEach(function (it, i) {
      if (!q || (it.e + ' ' + it.t).toLowerCase().indexOf(q) >= 0) out.push({ it: it, i: i });
    });
    return out;
  }

  function chip(label, val) {
    return '<span class="badge badge-plain">' + U.escapeHtml(label) +
      ' <strong>' + U.escapeHtml(String(val)) + '</strong></span>';
  }

  function emptyState(searching, q) {
    var box = document.createElement('div');
    box.className = 'empty';
    box.innerHTML = searching
      ? '<strong>没有匹配的记录</strong><span>换个关键词试试；搜索是跨月份进行的。</span>'
      : '<strong>这个月还没有记录</strong><span>用上面的「记一笔」加第一条：填日期、时间、事件就行。</span>';
    return box;
  }

  /* ---- 一张日期卡片 ---- */
  function dayCard(key, rows) {
    var day = data.days[key];
    var d = U.parseDate(key);
    var card = document.createElement('article');
    card.className = 'tl-day';
    card.dataset.key = key;
    if (day.c >= 0) card.setAttribute('data-color', String(day.c));
    if (U.isSameDay(d, today)) card.classList.add('is-today');
    if (view.editing === key) card.classList.add('editing');

    /* 头：颜色点 + 日期 + 星期 + 条数 + ＋ */
    var head = document.createElement('div');
    head.className = 'tl-dh';
    head.innerHTML =
      '<button class="tl-cc" type="button" data-c="' + day.c + '" ' +
        'title="给这一天选颜色" aria-label="选择这一天的颜色"></button>' +
      '<span class="tl-date">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>' +
      '<span class="tl-wd">周' + WD[d.getDay()] + '</span>' +
      '<span class="tl-sp"></span>' +
      '<span class="tl-cnt" title="这一天共 ' + day.items.length + ' 条">' + day.items.length + '</span>' +
      '<button class="tl-ib" type="button" data-act="add" title="在这一天加一条" aria-label="加一条">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></button>';
    card.appendChild(head);

    /* 行：时间 + 事件（都是可编辑的输入框，平时看起来就是文字） */
    var body = document.createElement('div');
    body.className = 'tl-rows';
    rows.forEach(function (o) { body.appendChild(rowEl(o.it, o.i)); });
    card.appendChild(body);

    /* 收起状态下的「＋ 加一条」提示 */
    var addon = document.createElement('button');
    addon.className = 'tl-addon';
    addon.type = 'button';
    addon.dataset.act = 'add';
    addon.textContent = '＋ 加一条';
    card.appendChild(addon);

    /* 展开后的行内新增 */
    card.appendChild(addRowEl());
    return card;
  }

  function rowEl(item, idx) {
    var row = document.createElement('div');
    row.className = 'tl-row';
    row.dataset.i = String(idx);

    var t = document.createElement('input');
    t.className = 'tl-time';
    t.type = 'text';
    t.inputMode = 'numeric';
    t.maxLength = 5;
    t.placeholder = '--:--';
    t.value = item.t || '';
    t.setAttribute('aria-label', '时间');

    var e = document.createElement('input');
    e.className = 'tl-evt';
    e.type = 'text';
    e.value = item.e;
    e.placeholder = '做了什么…';
    e.setAttribute('aria-label', '事件');
    e.title = item.e;                        /* 卡片窄、长文本会被截断，悬停看全文 */

    var x = document.createElement('button');
    x.className = 'tl-del';
    x.type = 'button';
    x.dataset.act = 'del';
    x.textContent = '×';
    x.title = '删除这一条';
    x.setAttribute('aria-label', '删除');

    row.appendChild(t); row.appendChild(e); row.appendChild(x);
    return row;
  }

  function addRowEl() {
    var wrap = document.createElement('div');
    wrap.className = 'tl-add';

    var t = document.createElement('input');
    t.className = 'tl-time';
    t.type = 'text';
    t.inputMode = 'numeric';
    t.maxLength = 5;
    t.placeholder = '09:00';
    t.setAttribute('aria-label', '新记录的时间');

    var e = document.createElement('input');
    e.className = 'tl-evt';
    e.type = 'text';
    e.placeholder = '加一条…（回车即可）';
    e.setAttribute('aria-label', '新记录的事件');

    var ok = document.createElement('button');
    ok.className = 'tl-del';
    ok.type = 'button';
    ok.dataset.act = 'commit-add';
    ok.textContent = '✓';
    ok.title = '添加';
    ok.style.opacity = '1';

    wrap.appendChild(t); wrap.appendChild(e); wrap.appendChild(ok);
    return wrap;
  }

  /* ======================================================================
     4. 编辑动作
     ====================================================================== */
  /* 4.1 新增一条 */
  function addItem(key, t, e) {
    e = String(e || '').trim();
    if (!e) return false;
    var day = ensureDay(key);
    day.items.push({ t: normTime(t), e: e });
    sortItems(day.items);
    save();
    return true;
  }

  /* 4.2 修改某一行（时间或文字） */
  function commitRow(row) {
    var card = row.closest('.tl-day');
    if (!card) return;
    var key = card.dataset.key;
    var day = dayOf(key);
    var i = parseInt(row.dataset.i, 10);
    if (!day || !day.items[i]) return;

    var tEl = row.querySelector('.tl-time');
    var eEl = row.querySelector('.tl-evt');
    var t = normTime(tEl.value);
    var e = eEl.value.trim();

    tEl.value = t;
    if (!e) {                                  /* 事件被清空 = 删掉这条 */
      day.items.splice(i, 1);
      dropIfEmpty(key);
      save(); render(); return;
    }
    if (day.items[i].t === t && day.items[i].e === e) return;

    day.items[i].t = t;
    day.items[i].e = e;
    eEl.title = e;
    sortItems(day.items);
    save(); render();
  }

  /* 4.3 行内新增 */
  function commitAdd(card) {
    var key = card.dataset.key;
    var tEl = card.querySelector('.tl-add .tl-time');
    var eEl = card.querySelector('.tl-add .tl-evt');
    var e = eEl.value.trim();
    if (!e) {                                  /* 空着回车 = 收起这一行 */
      tEl.value = ''; eEl.value = '';
      view.editing = '';
      render();
      return;
    }
    addItem(key, tEl.value, e);
    tEl.value = ''; eEl.value = '';
    view.editing = key;                        /* 保持展开，方便连着记好几条 */
    render();
    focusAdd(key);
  }

  /* 4.4 焦点搬运（render 之后用） */
  function focusAdd(key) {
    var card = hostDays.querySelector('.tl-day[data-key="' + key + '"]');
    var el = card && card.querySelector('.tl-add .tl-evt');
    if (el) el.focus();
  }
  function focusRow(key, i) {
    var card = hostDays.querySelector('.tl-day[data-key="' + key + '"]');
    var row = card && card.querySelector('.tl-row[data-i="' + i + '"] .tl-evt');
    if (row) row.focus(); else focusAdd(key);
  }

  /* ======================================================================
     5. 事件委托（整页只有这几处监听）
     ====================================================================== */
  function bind() {
    /* 5.1 点击 */
    hostDays.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act], .tl-cc');
      if (!btn) return;
      var card = btn.closest('.tl-day');

      if (btn.classList.contains('tl-cc')) { openPalette(btn, card.dataset.key); return; }

      var act = btn.dataset.act;
      if (act === 'add') {
        view.editing = (view.editing === card.dataset.key) ? '' : card.dataset.key;
        render();
        if (view.editing) focusAdd(view.editing);
      } else if (act === 'del') {
        var row = btn.closest('.tl-row');
        var key = card.dataset.key;
        var day = dayOf(key);
        var i = parseInt(row.dataset.i, 10);
        if (!day || !day.items[i]) return;
        var removed = day.items[i].e;
        day.items.splice(i, 1);
        dropIfEmpty(key);
        save(); render();
        U.toast('已删除：' + U.truncate(removed, 18), 'ok', {
          timeout: 4000,
          action: { label: '撤销', run: function () { undoDelete(key, i, removed); } }
        });
      } else if (act === 'commit-add') {
        commitAdd(card);
      }
    });

    /* 5.2 编辑已有行：失焦提交（进入别的控件前先把值定下来） */
    hostDays.addEventListener('focusout', function (ev) {
      var row = ev.target.closest && ev.target.closest('.tl-row');
      if (row && row.contains(ev.target)) commitRow(row);
    });

    /* 5.3 键盘：回车提交 / Tab 自然切换 */
    hostDays.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      var t = ev.target;
      var addBox2 = t.closest && t.closest('.tl-add');
      if (addBox2) { ev.preventDefault(); commitAdd(t.closest('.tl-day')); return; }
      var row = t.closest && t.closest('.tl-row');
      if (row) {
        ev.preventDefault();
        var card = row.closest('.tl-day');
        commitRow(row);
        focusRow(card.dataset.key, parseInt(row.dataset.i, 10) + 1);
      }
    });

    /* 5.4 工具条 */
    $('[data-act="prev"]').addEventListener('click', function () { shiftMonth(-1); });
    $('[data-act="next"]').addEventListener('click', function () { shiftMonth(1); });
    $('[data-act="today"]').addEventListener('click', function () {
      view.ym = U.fmtDate(U.today()).slice(0, 7);
      view.q = ''; qInput.value = '';
      render();
      var c = hostDays.querySelector('.tl-day.is-today');
      if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    $('[data-act="add-toggle"]').addEventListener('click', function () {
      var on = addBox.hidden;
      addBox.hidden = !on;
      if (on) {
        var dt = addBox.querySelector('.tl-datein');
        var tm = addBox.querySelector('.tl-qtime');
        dt.value = U.fmtDate(U.today());
        tm.value = pad2(new Date().getHours()) + ':' + pad2(Math.floor(new Date().getMinutes() / 5) * 5);
        addBox.querySelector('.tl-qtext').focus();
      }
    });
    addBox.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); quickAdd(); }
    });
    addBox.querySelector('[data-act="quick-add"]').addEventListener('click', quickAdd);

    function quickAdd() {
      var dt = addBox.querySelector('.tl-datein').value;
      var tm = addBox.querySelector('.tl-qtime').value;
      var ev = addBox.querySelector('.tl-qtext').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dt)) { U.toast('先选一个日期', 'warn'); return; }
      if (!String(ev).trim()) { U.toast('写点什么吧', 'warn'); return; }
      addItem(dt, tm, ev);
      addBox.querySelector('.tl-qtext').value = '';
      view.ym = dt.slice(0, 7);
      render();
      focusRow(dt, -1);
      U.toast('已记到 ' + dt.replace(/-/g, '/'), 'ok', { timeout: 2600 });
    }

    /* 5.5 搜索 */
    qInput.addEventListener('input', function () { view.q = qInput.value; render(); });

    /* 5.6 本月总结：输入即存 */
    sumTa.addEventListener('input', function () {
      var t = sumTa.value;
      if (t.trim()) data.months[view.ym] = t; else delete data.months[view.ym];
      updateSumHint(t.length);
      saveSoon();
    });
    sumTa.addEventListener('blur', save);
  }

  function updateSumHint(len) {
    if (len === undefined) len = sumTa.value.length;
    sumHint.textContent = len ? len + ' 字 · 自动保存' : '自动保存';
  }

  /* ======================================================================
     6. 撤销删除
     ====================================================================== */
  var undoCache = null;
  function undoDelete(key, i, text) {
    if (undoCache && undoCache.key === key && undoCache.text === text) {
      var day = ensureDay(key);
      if (!day.items.some(function (x) { return x.e === text; })) {
        day.items.splice(Math.min(i, day.items.length), 0, { t: undoCache.t, e: text });
        sortItems(day.items);
        save(); render();
      }
    }
  }

  /* ======================================================================
     7. 每日配色（复用站点自带的 [data-color="0".."7"]）
     ====================================================================== */
  var pal = null, palFor = '';

  function buildPalette() {
    pal = document.createElement('div');
    pal.className = 'tl-pal';
    pal.hidden = true;
    var html = '<button class="tl-sw" type="button" data-c="-1" title="默认（跟随主题）"></button>';
    for (var i = 0; i < NCOLOR; i++) {
      html += '<button class="tl-sw" type="button" data-c="' + i + '" data-color="' + i + '" title="颜色 ' + (i + 1) + '"></button>';
    }
    pal.innerHTML = html;
    document.body.appendChild(pal);

    pal.addEventListener('click', function (ev) {
      var sw = ev.target.closest('.tl-sw');
      if (!sw || !palFor) return;
      var c = parseInt(sw.dataset.c, 10);
      var day = ensureDay(palFor);
      day.c = (c >= 0 && c < NCOLOR) ? c : -1;
      save();
      closePalette();
      render();
    });
  }

  function openPalette(anchor, key) {
    if (!pal) buildPalette();
    palFor = key;
    pal.hidden = false;
    var c = dayOf(key) ? dayOf(key).c : -1;
    $$('.tl-sw', pal).forEach(function (s) {
      s.classList.toggle('on', parseInt(s.dataset.c, 10) === c);
    });
    /* 贴着色点下方弹出，超出右边界就往左挪 */
    var r = anchor.getBoundingClientRect();
    var w = pal.offsetWidth || 152, h = pal.offsetHeight || 60;
    var left = Math.min(r.left - 6, window.innerWidth - w - 10);
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = r.top - h - 6;
    pal.style.left = Math.max(8, left) + 'px';
    pal.style.top = Math.max(8, top) + 'px';
  }
  function closePalette() { if (pal) pal.hidden = true; palFor = ''; }

  document.addEventListener('click', function (ev) {
    if (!pal || pal.hidden) return;
    if (pal.contains(ev.target)) return;
    if (ev.target.closest && ev.target.closest('.tl-cc')) return;
    closePalette();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closePalette();
  });
  window.addEventListener('scroll', closePalette, { passive: true });
  window.addEventListener('resize', closePalette);

  /* ======================================================================
     8. 主题切换（写站点共用的 cw.theme）
     ====================================================================== */
  function paintThemeIcon() {
    var ico = document.querySelector('#themeIco use');
    if (ico) ico.setAttribute('href',
      document.documentElement.getAttribute('data-theme') === 'dark' ? '#i-sun' : '#i-moon');
  }
  function bindTheme() {
    var btn = $('#themeBtn');
    paintThemeIcon();
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      U.lsSet('theme', next);                 /* 与校园主页共用同一个键 */
      paintThemeIcon();
    });
  }

  /* ======================================================================
     9. 启动
     ====================================================================== */
  function init() {
    hostDays = $('#days');
    hostStats = $('#stats');
    sumTa = $('#sum');
    sumHint = $('#sumHint');
    monthLabel = $('#monthLabel');
    monthTip = $('#monthTip');
    qInput = $('#q');
    addBox = $('#addBox');
    if (!hostDays) return;

    bind();
    bindTheme();
    render();
    addBox.hidden = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
