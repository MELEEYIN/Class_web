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
  var WD_MON = ['一', '二', '三', '四', '五', '六', '日'];   /* 月度视图列顺序：周一起 */
  var MODE_KEY = 'timeline.viewmode';                         /* 记住用户上次选的视图 */

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

  /* ---- 时间归一化 ----
     预置的冒号 + 随手敲的数字 → 标准 HH:MM：
       '9'    -> 09:00     '13'   -> 13:00
       '930'  -> 09:30     '93'   -> 09:30   （93 不是合法小时，第二位数按「分钟十位」解）
       '1200' -> 12:00     '9:3'  -> 09:03   （手写的冒号也认）
     只剩一个冒号 → ''，表示「不确定几点」。 */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function normTime(v) {
    var s = String(v == null ? '' : v).trim();
    var h, mm;

    var m = /^(\d{1,2})\s*[:：.、]\s*(\d{0,2})$/.exec(s);
    if (m) {
      h = +m[1];
      mm = m[2] === '' ? 0 : +m[2];
      if (h > 23) {                        /* '93:' / '93:0' 这种：按 H:MM 再解一次 */
        var all = (m[1] + m[2]).replace(/\D/g, '');
        h = +all.charAt(0);
        mm = all.length === 2 ? +all.charAt(1) * 10 : (+all.slice(1, 3) || 0);
      }
    } else {
      var dg = s.replace(/\D/g, '').slice(0, 4);
      if (!dg) return '';
      if (dg.length <= 2) { h = +dg; mm = 0; }
      else if (dg.length === 3) { h = +dg.charAt(0); mm = +dg.slice(1); }
      else { h = +dg.slice(0, 2); mm = +dg.slice(2); }
      if (h > 23) {                        /* 小时不合法（如 '93'）→ 第二位数当分钟十位 */
        h = +dg.charAt(0);
        mm = dg.length === 2 ? +dg.charAt(1) * 10 : (+dg.slice(1, 3) || 0);
      }
    }
    if (!isFinite(h) || !isFinite(mm)) return '';
    if (h > 23) h = 23;
    if (mm > 59) mm = 59;
    return pad2(h) + ':' + pad2(mm);
  }

  /* 时间框的实时成型：冒号是预置的，随手敲数字就自动补成 HH:MM
     ':' → '9:' → '93:' → '9:30' → （继续敲）'12:00' */
  function maskTime(el) {
    var dg = el.value.replace(/\D/g, '').slice(0, 4);
    var out, caret;
    if (!dg) { out = ':'; caret = 0; }
    else if (dg.length <= 2) { out = dg + ':'; caret = dg.length; }   /* 光标停在冒号前 */
    else if (dg.length === 3) { out = dg.charAt(0) + ':' + dg.slice(1); caret = 4; }
    else { out = dg.slice(0, 2) + ':' + dg.slice(2); caret = 5; }
    if (el.value === out) return;
    el.value = out;
    try { el.setSelectionRange(caret, caret); } catch (e) { /* 忽略 */ }
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
  var view = {
    ym: U.fmtDate(today).slice(0, 7),
    q: '', editing: '',
    mode: U.lsGet(MODE_KEY, 'list') === 'month' ? 'month' : 'list'
  };

  var $ = U.$, $$ = U.$$;
  var hostDays, hostCal, hostStats, sumTa, sumHint, sumMonth, monthLabel, monthNav,
      btnToday, monthTip, qInput, addBox;

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
  /* ---- 顶部工具条 + 当前视图，一次渲染完 ---- */
  function render() {
    var q = view.q.trim().toLowerCase();
    var searching = !!q;
    /* 搜索只在列表视图里有意义：在月度视图下开始打字，就自动切回列表 */
    if (searching && view.mode === 'month') view.mode = 'list';
    syncMode();

    /* 列表：所有月份一起排（最新在前）；月度：只看当前月 */
    var isMonth = view.mode === 'month';
    var keys = isMonth ? monthKeys(view.ym) : allKeys().slice().reverse();

    /* 3.1 工具条：月份导航与「回到今天」只在月度视图里有意义 */
    monthNav.hidden = !isMonth;
    btnToday.hidden = !isMonth;
    monthLabel.textContent = ymLabel(view.ym);
    sumMonth.textContent = ymLabel(view.ym);
    monthTip.hidden = !searching;
    if (searching) monthTip.textContent = '搜索中：跨全部月份';

    /* 3.2 统计（搜索时按全部月份算，否则按本月） */
    var nd = 0, ni = 0;
    keys.forEach(function (k) {
      var n = picked(data.days[k].items, q).length;
      if (n) { nd++; ni += n; }
    });
    hostStats.innerHTML =
      chip('天数', nd) + chip('事件', ni) +
      (nd ? chip('平均', (ni / nd).toFixed(1) + ' 条/天') : '');

    /* 3.3 本月总结（搜索时也显示当前月的那一份） */
    if (sumTa.value !== (data.months[view.ym] || '')) sumTa.value = data.months[view.ym] || '';
    updateSumHint();

    /* 3.4 只渲染当前视图，另一个清空 */
    if (view.mode === 'month') {
      hostDays.hidden = true;
      hostDays.innerHTML = '';
      hostCal.hidden = false;
      renderCal();
    } else {
      hostCal.hidden = true;
      hostCal.innerHTML = '';
      hostDays.hidden = false;
      renderList(searching, q, keys);
    }
  }

  function syncMode() {
    $$('#viewTabs button').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-view') === view.mode ? 'true' : 'false');
    });
  }

  /* ---- 视图一 · 列表：只有有记录的日子 ---- */
  function renderList(searching, q, keys) {
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

  /* ---- 视图二 · 月度：小方块日历，一个月里每一天都有格子 ---- */
  /* 复刻 schedule.js 的 monthMatrix：从本月 1 号所在周的周一开始铺，铺满整周 */
  function matrixOf(d) {
    var start = U.mondayOf(U.startOfMonth(d));
    var weeks = [];
    for (var w = 0; w < 6; w++) {
      var row = [];
      for (var i = 0; i < 7; i++) row.push(U.addDays(start, w * 7 + i));
      weeks.push(row);
    }
    var last = weeks[5];
    /* 最后一行整行都不属于本月就去掉，省得空出一整行 */
    if (last[0].getMonth() !== d.getMonth() && last[6].getMonth() !== d.getMonth()) weeks.pop();
    return weeks;
  }

  function renderCal() {
    var cur = U.parseDate(view.ym + '-01');
    var grid = U.el('div', { class: 'cal-grid' });

    matrixOf(cur).forEach(function (row) {
      row.forEach(function (dt) {
        var key = U.fmtDate(dt);
        var day = dayOf(key);
        var items = day ? day.items : [];
        var n = items.length;
        var out = dt.getMonth() !== cur.getMonth();

        var cls = 'cal-day';
        if (out) cls += ' is-out';
        if (U.isSameDay(dt, today)) cls += ' is-today';

        /* 右上角：条数 + 颜色点（颜色点让「没记录但选过色」的日子也看得出） */
        var num = U.el('span', { class: 'cd-num' }, [
          U.el('span', { text: String(dt.getDate()) }),
          U.el('span', { class: 'tl-cd-r' }, [
            n ? U.el('span', { class: 'tl-cd-c', text: String(n) }) : null,
            (day && day.c >= 0) ? U.el('span', { class: 'tl-cd-dot' }) : null
          ])
        ]);

        /* 格子里最多放 3 条，多的用 +N 条 表示 */
        var evBox = U.el('span', { class: 'cd-events' });
        items.slice(0, 3).forEach(function (it) {
          evBox.appendChild(U.el('span', {
            class: 'cd-event',
            title: (it.t ? it.t + ' ' : '') + it.e,
            text: (it.t ? it.t + ' ' : '') + it.e
          }));
        });
        if (n > 3) evBox.appendChild(U.el('span', { class: 'cd-more', text: '+' + (n - 3) + ' 条' }));

        var btn = U.el('button', {
          type: 'button', class: cls, 'data-key': key,
          title: key + (n ? ' · ' + n + ' 条' : ' · 还没有记录，点一下就能补记'),
          onclick: function () { onCalDay(key); }
        }, [num, evBox]);
        if (day && day.c >= 0) btn.setAttribute('data-color', String(day.c));
        grid.appendChild(btn);
      });
    });

    U.render(hostCal, U.el('div', { class: 'cal-full' }, [
      U.el('div', { class: 'cal-week' }, WD_MON.map(function (t, i) {
        return U.el('span', { class: i >= 5 ? 'is-weekend' : '', text: t });
      })),
      grid
    ]));
  }

  /* 点月度格子：有记录 → 切回列表并定位到那天；没记录 → 直接开「记一笔」并把日期填好 */
  function onCalDay(key) {
    view.ym = key.slice(0, 7);
    view.editing = '';
    if (hasItems(key)) {
      view.mode = 'list';
      U.lsSet(MODE_KEY, 'list');
      render();
      var card = hostDays.querySelector('.tl-day[data-key="' + key + '"]');
      if (card) {
        card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        card.classList.add('hit');
        setTimeout(function () { card.classList.remove('hit'); }, 1400);
      }
    } else {
      render();
      openQuickAdd(key);
    }
  }

  /* 打开「记一笔」，可顺便把日期填好 */
  function openQuickAdd(dt) {
    addBox.hidden = false;
    addBox.querySelector('.tl-datein').value = dt || U.fmtDate(today);
    var tm = addBox.querySelector('.tl-qtime');
    if (!tm.value) { tm.value = ':'; tm.classList.add('masked'); }   /* 预置冒号，敲数字自动成型 */
    addBox.querySelector('.tl-qtext').focus();
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
      : '<strong>还没有任何记录</strong><span>用上面的「记一笔」加第一条：填日期、时间、事件就行（时间框里已经有个冒号，直接敲数字）。</span>';
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

    /* 行内新增：默认收起，点右上角的 ＋ 展开 */
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
    t.value = item.t || ':';        /* 空的时候预置一个冒号，敲数字就自动成型 */
    t.classList.toggle('masked', !item.t);
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
    t.value = ':';                  /* 预置冒号 */
    t.classList.add('masked');
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

    tEl.value = t || ':';                  /* 清空后留个冒号，方便接着填 */
    tEl.classList.toggle('masked', !t);
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
      tEl.value = ':'; tEl.classList.add('masked'); eEl.value = '';
      view.editing = '';
      render();
      return;
    }
    addItem(key, tEl.value, e);
    tEl.value = ':'; tEl.classList.add('masked'); eEl.value = '';
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
      view.ym = U.fmtDate(today).slice(0, 7);
      view.q = ''; qInput.value = '';
      view.mode = 'list';
      U.lsSet(MODE_KEY, 'list');
      render();
      var c = hostDays.querySelector('.tl-day.is-today');
      if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    $('[data-act="add-toggle"]').addEventListener('click', function () {
      if (addBox.hidden) openQuickAdd(U.fmtDate(today)); else addBox.hidden = true;
    });

    /* 视图切换：列表 / 月度，选完记住 */
    $$('#viewTabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        view.mode = b.getAttribute('data-view') === 'month' ? 'month' : 'list';
        U.lsSet(MODE_KEY, view.mode);
        render();
      });
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
      view.mode = 'list';                 /* 切回列表，好让用户马上看到刚记的这条 */
      U.lsSet(MODE_KEY, 'list');
      render();
      focusRow(dt, -1);
      U.toast('已记到 ' + dt.replace(/-/g, '/'), 'ok', { timeout: 2600 });
    }

    /* 5.5 搜索 */
    qInput.addEventListener('input', function () { view.q = qInput.value; render(); });

    /* 5.6 时间框：预置冒号 + 随手敲数字自动成型（行内行 / 行内新增 / 顶部记一笔 共用） */
    function isTimeBox(el) {
      return !!el && !!el.classList &&
        (el.classList.contains('tl-time') || el.classList.contains('tl-qtime'));
    }
    document.addEventListener('input', function (ev) {
      if (!isTimeBox(ev.target)) return;
      maskTime(ev.target);
      ev.target.classList.toggle('masked', normTime(ev.target.value) === '');
    }, true);
    document.addEventListener('focusin', function (ev) {
      var el = ev.target;
      if (isTimeBox(el) && !el.value) {
        el.value = ':';
        try { el.setSelectionRange(0, 0); } catch (e) { /* 忽略 */ }
      }
    });

    /* 5.8 月度总结：输入即存 */
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
      if (window.CW && CW.bg && CW.bg.onThemeChange) CW.bg.onThemeChange();
    });
  }

  /* ======================================================================
     8.5 自定义背景
     直接复用主站的 js/background.js：读写的都是同一份 cw.bg、同一张存在
     IndexedDB 的本地图片，所以在主站设过的背景在这里一样生效，改这里也全站生效。
     弹窗内的按钮/滑杆由 background.js 自己绑定，这里只管开与关。
     ====================================================================== */
  var bgModal = null;

  function openBg() {
    if (!bgModal) return;
    bgModal.hidden = false;
    void bgModal.offsetWidth;              /* 强制重排，保证 transition 生效 */
    bgModal.classList.add('open');
    document.body.classList.add('modal-open');
    if (window.CW && CW.bg && CW.bg.syncControls) CW.bg.syncControls();
  }
  function closeBg() {
    if (!bgModal || bgModal.hidden) return;
    bgModal.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(function () {
      if (!bgModal.classList.contains('open')) bgModal.hidden = true;
    }, 300);
  }
  function bindBg() {
    bgModal = $('#modal-bg');
    if (!bgModal) return;
    var btn = $('#bgBtn');
    if (btn) btn.addEventListener('click', openBg);
    $$('#modal-bg [data-close]').forEach(function (el) {
      el.addEventListener('click', closeBg);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeBg();
    });
    /* 背景本身由 background.js 负责套用（读 cw.bg → 写 --bg-* 变量） */
    if (window.CW && CW.bg && CW.bg.init) CW.bg.init();
  }

  /* ======================================================================
     9. 启动
     ====================================================================== */
  function init() {
    hostDays = $('#days');
    hostCal = $('#calBox');
    sumMonth = $('#sumMonth');
    monthNav = $('#monthNav');
    btnToday = $('#btnToday');
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
    bindBg();
    render();
    addBox.hidden = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
