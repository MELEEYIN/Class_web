/* ==========================================================================
   admin.js — 通知管理页（主机专用）
   这个页面刻意不依赖 store.js / util.js：它只跟 /api/* 打交道，
   不读也不写首页那些 localStorage 数据，免得两边互相影响。

   流程：
     1. GET  /api/state        看有没有设过管理密码
     2. POST /api/login        校验 / 首次初始化
     3. GET  /api/state        带密码读全部通知
     4. POST /api/publish      发布、修改、删除
     5. POST /api/reset        清空
   ========================================================================== */
(function () {
  'use strict';

  var LS_KEY = 'cw.adminKey';       // 只在这台设备上记住密码（可选）
  var API = {
    state: '/api/state',
    login: '/api/login',
    publish: '/api/publish',
    reset: '/api/reset',
    stats: '/api/stats',
    publicEvents: '/api/public-events',   // 公开读（全班共用清单）
    publicEvent: '/api/public-event',     // 发布 / 删除 / 清空（要密码）
    polls: '/api/polls',                  // 公开读投票
    poll: '/api/poll'                     // 建 / 暂停 / 恢复 / 删除（要密码）
  };

  var $ = function (sel) { return document.querySelector(sel); };

  var state = {
    key: '',
    initialized: false,
    fixed: false,
    storage: '',
    items: [],
    updatedAt: '',
    editingId: '',
    publicItems: [],
    polls: [],
    publicSource: '',
    publicUpdatedAt: ''
  };

  /* ======================================================================
     小工具
     ====================================================================== */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } }

  function toast(msg, type, ms) {
    type = type || 'info';
    var wrap = $('#toastWrap');
    if (!wrap) return;
    var icons = { ok: 'i-check-circle', error: 'i-warn-circle', warn: 'i-alert', info: 'i-info' };

    var node = document.createElement('div');
    node.className = 'toast toast-' + type;
    node.setAttribute('role', 'status');

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + (icons[type] || 'i-info'));
    svg.appendChild(use);

    var text = document.createElement('div');
    text.textContent = msg;

    node.appendChild(svg);
    node.appendChild(text);
    wrap.appendChild(node);

    setTimeout(function () {
      node.classList.add('leaving');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 240);
    }, ms || (type === 'error' ? 5200 : 3000));
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'accept': 'application/json' }, opts.headers || {});
    if (opts.body) headers['content-type'] = 'application/json; charset=utf-8';
    if (state.key && opts.auth !== false) headers['x-cw-key'] = state.key;

    return fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: '服务器返回的不是 JSON（HTTP ' + res.status + '）' }; })
        .then(function (data) {
          data.__status = res.status;
          return data;
        });
    });
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function relTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    if (min < 60 * 24) return Math.floor(min / 60) + ' 小时前';
    if (min < 60 * 24 * 7) return Math.floor(min / 1440) + ' 天前';
    return fmtTime(iso);
  }

  var LEVEL_LABEL = { info: '普通', ok: '好消息', warn: '注意', danger: '紧急' };

  /* ======================================================================
     1. 登录
     ====================================================================== */
  function showLogin(needSetup, storage) {
    $('#loginCard').hidden = false;
    $('#console').hidden = true;
    $('#lockBtn').hidden = true;

    $('#loginTitle').textContent = needSetup ? '第一次设置管理密码' : '进入通知管理';
    $('#loginHint').textContent = needSetup
      ? '这台 Worker 还没有设置过管理密码。你现在输入的密码会立刻生效，请务必记住它 —— 网页上不会再显示，忘记了只能重新绑定 KV 或换 secret。'
      : '输入管理密码。密码只在你的浏览器和服务器之间校验，服务器只保存它的哈希。';
    $('#pw2').hidden = !needSetup;
    $('#pw2Label').hidden = !needSetup;
    $('#loginBtn').textContent = needSetup ? '设置并进入' : '进入';
    $('#rememberWrap').hidden = false;
    $('#kvWarn').hidden = !(storage === 'file');

    var remembered = lsGet(LS_KEY, '');
    if (remembered && !needSetup) {
      state.key = remembered;
      enterConsole(true);
    } else if (remembered) {
      state.key = remembered;
    }
    var pw = $('#pw');
    if (pw) pw.focus();
  }

  function doLogin(e) {
    if (e) e.preventDefault();
    var pw = $('#pw').value;
    var pw2 = $('#pw2').value;
    var needSetup = !$('#pw2').hidden;

    if (!pw || pw.length < 5) { toast('密码至少 5 位。', 'warn'); $('#pw').focus(); return; }
    if (needSetup && pw !== pw2) { toast('两次输入的密码不一样。', 'warn'); $('#pw2').focus(); return; }

    var btn = $('#loginBtn');
    btn.disabled = true;
    btn.textContent = needSetup ? '正在设置…' : '正在校验…';

    api(API.login, { method: 'POST', auth: false, body: { password: pw } })
      .then(function (res) {
        if (!res.ok) {
          toast(res.error || '登录失败。', 'error');
          if (res.needsKv) $('#kvWarn').hidden = false;
          return;
        }
        state.key = pw;
        if ($('#remember').checked) lsSet(LS_KEY, pw); else lsDel(LS_KEY);
        if (res.message) toast(res.message, 'ok', 6000);
        enterConsole(false);
      })
      .catch(function (err) {
        toast('连不上服务器：' + ((err && err.message) || err), 'error');
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = $('#pw2').hidden ? '进入' : '设置并进入';
      });
  }

  function enterConsole(quiet) {
    $('#loginCard').hidden = true;
    $('#console').hidden = false;
    $('#lockBtn').hidden = false;
    syncAttachKey();
    if (!att) mountAttach();
    refresh(quiet);
    loadStats(quiet);
    loadPublicEvents(true);   // 顺便把公共事务清单也读出来
    loadPolls(true);          // 和投票列表
  }

  function lock() {
    state.key = '';
    lsDel(LS_KEY);
    $('#pw').value = '';
    $('#pw2').value = '';
    toast('已退出（本机记住的密码也清掉了）', 'info');
    boot();
  }

  /* ======================================================================
     2. 列表 / 刷新
     ====================================================================== */
  function refresh(quiet) {
    return api(API.state).then(function (res) {
      if (!res.ok) {
        if (res.__status === 401) {
          lsDel(LS_KEY);
          toast('密码已失效，请重新登录。', 'warn');
          boot();
          return;
        }
        if (!quiet) toast(res.error || '读取失败。', 'error');
        return;
      }

      state.initialized = !!res.initialized;
      state.fixed = !!res.fixed;
      state.storage = res.storage || '';
      state.items = res.items || [];
      state.updatedAt = res.updatedAt || '';

      renderStoreBadge();
      renderItems();
    }).catch(function (err) {
      if (!quiet) toast('连不上服务器：' + ((err && err.message) || err), 'error');
    });
  }

  function renderStoreBadge() {
    var b = $('#storeBadge');
    if (!b) return;
    if (state.storage === 'kv') {
      b.textContent = 'KV 存储 · 可在线发布';
      b.className = 'badge badge-ok';
    } else if (state.storage === 'local') {
      b.textContent = '本机预览 · 可发布（存 .preview-notify.json）';
      b.className = 'badge badge-ok';
    } else if (state.storage === 'file') {
      b.textContent = '只读 · 来自 hosts.json';
      b.className = 'badge badge-warn';
    } else {
      b.textContent = '状态未知';
      b.className = 'badge badge-plain';
    }
  }

  /* ======================================================================
     2.5 访问统计（自建：Worker + D1，无第三方脚本）
     ====================================================================== */
  function loadStats(quiet) {
    var box = $('#statsBody');
    if (!box) return Promise.resolve();
    var range = $('#statsRange');
    var days = (range && range.value) || '14';
    if (!quiet) box.textContent = '正在读取…';
    return api(API.stats + '?days=' + encodeURIComponent(days)).then(function (res) {
      if (!res.ok) {
        box.textContent = '';
        box.appendChild(hint('读不到统计：' + (res.error || '未知原因')));
        return;
      }
      renderStats(res);
    }).catch(function (err) {
      box.textContent = '';
      box.appendChild(hint('连不上服务器：' + ((err && err.message) || err)));
    });
  }

  function hint(text) {
    var p = document.createElement('p');
    p.className = 'hint';
    p.textContent = text;
    return p;
  }

  function statTile(label, value, sub) {
    var d = document.createElement('div');
    d.className = 'stat-tile';
    var v = document.createElement('div');
    v.className = 'stat-value';
    v.textContent = String(value == null ? 0 : value);
    var l = document.createElement('div');
    l.className = 'stat-label';
    l.textContent = label;
    d.appendChild(v);
    d.appendChild(l);
    if (sub) {
      var s = document.createElement('div');
      s.className = 'tiny faint';
      s.textContent = sub;
      d.appendChild(s);
    }
    return d;
  }

  function tableBlock(title, head, rows) {
    var wrap = document.createElement('div');
    wrap.className = 'stat-block';
    var h = document.createElement('h3');
    h.className = 'stat-block-title';
    h.textContent = title;
    wrap.appendChild(h);
    var t = document.createElement('table');
    t.className = 'stat-table';
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    head.forEach(function (x) { var th = document.createElement('th'); th.textContent = x; tr.appendChild(th); });
    thead.appendChild(tr);
    t.appendChild(thead);
    var tbody = document.createElement('tbody');
    rows.forEach(function (cells) {
      var r = document.createElement('tr');
      cells.forEach(function (x) { var td = document.createElement('td'); td.textContent = x; r.appendChild(td); });
      tbody.appendChild(r);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  function renderStats(d) {
    var box = $('#statsBody');
    if (!box) return;
    box.textContent = '';

    var tiles = document.createElement('div');
    tiles.className = 'stat-grid';
    tiles.appendChild(statTile('今日访问', d.todayHits, (d.today || '') + ' · ' + (d.todayVisitors || 0) + ' 位访客'));
    tiles.appendChild(statTile('近 7 天', d.weekHits, (d.weekVisitors || 0) + ' 位访客'));
    tiles.appendChild(statTile('近 30 天', d.monthHits, (d.monthVisitors || 0) + ' 位访客'));
    tiles.appendChild(statTile('累计访问', d.total, '累计 ' + (d.totalVisitors || 0) + ' 位访客（按天去重）'));
    box.appendChild(tiles);

    // 柱状图：纯 CSS，不引任何图表库
    var series = d.series || [];
    if (!series.length) {
      box.appendChild(hint('这段时间还没有访问记录。'));
      return;
    }
    var max = 1;
    series.forEach(function (row) { if (row.n > max) max = row.n; });
    var chart = document.createElement('div');
    chart.className = 'stat-chart';
    series.forEach(function (row) {
      var col = document.createElement('div');
      col.className = 'stat-bar-col';
      col.title = row.day + '：' + row.n + ' 次访问 / ' + row.u + ' 位访客';
      var bar = document.createElement('div');
      bar.className = 'stat-bar';
      bar.style.height = Math.max(3, Math.round((row.n / max) * 100)) + '%';
      var cap = document.createElement('span');
      cap.className = 'stat-bar-label';
      cap.textContent = String(row.day || '').slice(5);
      col.appendChild(bar);
      col.appendChild(cap);
      chart.appendChild(col);
    });
    box.appendChild(chart);

    if ((d.topPaths || []).length) {
      box.appendChild(tableBlock('访问最多的页面', ['页面', '次数'],
        d.topPaths.map(function (r) { return [r.path, String(r.n)]; })));
    }
    if ((d.countries || []).length) {
      box.appendChild(tableBlock('访客来自', ['国家/地区', '次数'],
        d.countries.map(function (r) { return [r.country, String(r.n)]; })));
    }
    if ((d.recent || []).length) {
      box.appendChild(tableBlock('最近访问', ['时间', '页面', '来源'],
        d.recent.slice(0, 12).map(function (r) {
          return [fmtTime(new Date(r.at).toISOString()), r.path, r.ref || '直接打开'];
        })));
    }
  }

  function renderItems() {
    var list = $('#itemList');
    var count = $('#itemCount');
    var at = $('#updatedAt');
    if (count) count.textContent = String(state.items.length);
    if (at) {
      at.textContent = state.updatedAt
        ? '最后更新：' + fmtTime(state.updatedAt) + (state.items.length ? '' : '（当前没有任何通知）')
        : '还没有发布过通知。';
    }
    if (!list) return;

    list.textContent = '';
    if (!state.items.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.style.padding = '20px 12px';
      empty.innerHTML = '<strong>还没有通知</strong><span>在左边写好内容，点「发布到全站」。</span>';
      list.appendChild(empty);
      return;
    }

    state.items.forEach(function (it) {
      list.appendChild(itemRow(it));
    });
  }

  function itemRow(it) {
    var isPinned = !!it.pinned;

    var row = document.createElement('div');
    row.className = 'row-item';
    row.setAttribute('data-color', levelColor(it.level));

    var bar = document.createElement('span');
    bar.className = 'ri-bar';

    var main = document.createElement('div');
    main.className = 'ri-main';

    var title = document.createElement('span');
    title.className = 'ri-title';
    title.textContent = (isPinned ? '📌 ' : '') + (it.title || '(无标题)');

    var meta = document.createElement('span');
    meta.className = 'ri-meta';
    meta.appendChild(chip(LEVEL_LABEL[it.level] || '普通'));
    if (it.source) meta.appendChild(chip(it.source));
    meta.appendChild(chip(fmtTime(it.at) + ' · ' + relTime(it.at)));

    var body = document.createElement('div');
    body.className = 'small muted';
    body.style.marginTop = '6px';
    body.style.whiteSpace = 'pre-wrap';
    body.textContent = it.body || '';

    main.appendChild(title);
    main.appendChild(meta);
    if (it.body) main.appendChild(body);
    if (it.files && it.files.length && window.CW && CW.attach) {
      var attNode = CW.attach.render(it.files, { compact: true });
      if (attNode) main.appendChild(attNode);
    }

    var actions = document.createElement('div');
    actions.className = 'ri-actions';

    var pinBtn = button(isPinned ? '取消置顶' : '置顶', 'i-pin', function () {
      save({ item: { id: it.id, title: it.title, body: it.body, level: it.level, source: it.source, pinned: !isPinned } });
    });

    var editBtn = button('编辑', 'i-plus', function () { startEdit(it); });
    var delBtn = button('删除', 'i-trash', function () {
      // 用页面内弹窗：手机上「添加到主屏」后 window.confirm 会被系统忽略
      askConfirm('删除这条通知？\n\n' + (it.title || ''), { danger: true, okText: '删除' }).then(function (yes) {
        if (yes) save({ action: 'delete', id: it.id });
      });
    });
    delBtn.classList.add('btn-danger');

    actions.appendChild(pinBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    row.appendChild(bar);
    row.appendChild(main);
    row.appendChild(actions);
    return row;
  }

  function chip(text) {
    var s = document.createElement('span');
    s.textContent = text;
    return s;
  }

  /* ----------------------------------------------------------------------
     页面内弹窗（CW.dialog，见 js/dialog.js）
     手机上把网站「添加到主屏幕」后是 standalone 模式，window.confirm/prompt
     会被系统直接忽略（返回 false / null），「删除」「清空」就会看起来毫无反应。
     dialog.js 没加载成功时退回原生弹窗，功能不至于不能用。
     ---------------------------------------------------------------------- */
  function askConfirm(message, opts) {
    if (window.CW && CW.dialog && CW.dialog.confirm) return CW.dialog.confirm(message, opts);
    return Promise.resolve(window.confirm(message));
  }

  function askText(message, opts) {
    if (window.CW && CW.dialog && CW.dialog.text) return CW.dialog.text(message, opts);
    try { return Promise.resolve(window.prompt(message)); } catch (e) { return Promise.resolve(null); }
  }

  /* ======================================================================
     3.5 公共事务（全班共用的一份清单，存在 KV 里）

     发布入口在首页「新增事务 → 设为公共事务」；这里专门用来「下架」：
     单条删除、或者把整份清单清空。都是 POST /api/public-event（要管理密码）。
     ====================================================================== */
  function loadPublicEvents(quiet) {
    return api(API.publicEvents, { auth: false }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || '读取失败');
      state.publicItems = Array.isArray(res.items) ? res.items : [];
      state.publicSource = res.source || '';
      state.publicUpdatedAt = res.updatedAt || '';
      renderPublicEvents();
      if (!quiet) toast('公共事务已刷新（共 ' + state.publicItems.length + ' 条）', 'info', 2000);
    }).catch(function (err) {
      var box = $('#pubListAdmin');
      if (box) box.textContent = '读不到公共事务清单：' + ((err && err.message) || err);
      if (!quiet) toast('读不到公共事务清单：' + ((err && err.message) || err), 'error', 5000);
    });
  }

  function pubWhen(it) {
    if (it.kind === 'weekly') {
      var wd = ['一', '二', '三', '四', '五', '六', '日'];
      return '每周' + (wd[(it.day || 1) - 1] || '?');
    }
    if (!it.date) return '日期待定';
    return it.date + (it.start ? ' ' + it.start + (it.end && it.end !== it.start ? '–' + it.end : '') : ' 全天');
  }

  function renderPublicEvents() {
    var box = $('#pubListAdmin');
    var badge = $('#pubCount');
    var n = state.publicItems.length;
    if (badge) badge.textContent = n ? n + ' 条' : '空';
    if (!box) return;

    box.textContent = '';

    if (!n) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '现在没有公共事务。首页「新增事务」里勾上「设为公共事务」就会出现在这里。';
      box.appendChild(empty);
      return;
    }

    state.publicItems.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'row-item';

      var bar = document.createElement('span');
      bar.className = 'ri-bar';

      var main = document.createElement('div');
      main.className = 'ri-main';

      var title = document.createElement('span');
      title.className = 'ri-title';
      title.textContent = it.title || '(无标题)';

      var meta = document.createElement('span');
      meta.className = 'ri-meta';
      meta.appendChild(chip(pubWhen(it)));
      if (it.location) meta.appendChild(chip(it.location));
      if (it.owner) meta.appendChild(chip('发布：' + it.owner));
      if (it.at) meta.appendChild(chip(relTime(it.at)));

      main.appendChild(title);
      main.appendChild(meta);
      if (it.note) {
        var note = document.createElement('div');
        note.className = 'small muted';
        note.style.marginTop = '6px';
        note.style.whiteSpace = 'pre-wrap';
        note.textContent = it.note;
        main.appendChild(note);
      }

      var actions = document.createElement('div');
      actions.className = 'ri-actions';
      var delBtn = button('下架这条', 'i-trash', function () {
        askConfirm('把这条公共事务从服务器上删掉？\n\n' + (it.title || '') +
          '\n\n所有设备重新打开后都看不到它（已经加进个人日程的不受影响）。',
          { danger: true, okText: '下架' }).then(function (yes) {
          if (yes) savePublic({ action: 'delete', id: it.id }, '已下架：' + (it.title || ''));
        });
      });
      delBtn.classList.add('btn-danger');
      actions.appendChild(delBtn);

      row.appendChild(bar);
      row.appendChild(main);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  function savePublic(payload, okMsg) {
    return api(API.publicEvent, { method: 'POST', body: payload }).then(function (res) {
      if (!res || !res.ok) {
        toast((res && res.error) || '操作失败。', 'error', 6000);
        return;
      }
      state.publicItems = Array.isArray(res.items) ? res.items : [];
      state.publicUpdatedAt = res.updatedAt || '';
      renderPublicEvents();
      toast(okMsg || '已更新公共事务。', 'ok', 2600);
    }).catch(function (err) {
      toast('连不上服务器：' + ((err && err.message) || err), 'error');
    });
  }

  function clearPublicEvents() {
    var n = state.publicItems.length;
    if (!n) { toast('现在没有公共事务。', 'info', 2000); return; }
    askText('这会清空服务器上整份公共事务清单（共 ' + n + ' 条），所有设备都看不到了。\n' +
      '已经加进别人个人日程的那几条不会被删掉。',
      { mustEqual: '清空', placeholder: '在这里输入「清空」', danger: true, okText: '清空',
        hint: '输入「清空」两个字后「清空」按钮才会亮起来。' }).then(function (typed) {
      if (typed === null) return;                       // 取消
      if (String(typed).trim() !== '清空') {
        toast('没有清空（要输入「清空」两个字才生效）。', 'warn', 3000);
        return;
      }
      savePublic({ action: 'clear' }, '已清空公共事务（共删掉 ' + n + ' 条）。');
    });
  }

  function levelColor(level) {
    return ({ info: '0', ok: '2', warn: '4', danger: '6' })[level] || '0';
  }

  function button(label, iconId, onclick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm btn-icon';
    b.title = label;
    b.setAttribute('aria-label', label);

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + iconId);
    svg.appendChild(use);
    b.appendChild(svg);
    b.addEventListener('click', onclick);
    return b;
  }

  /* ======================================================================
     3. 发布 / 修改 / 删除
     ====================================================================== */
  function save(payload) {
    var btn = $('#publishBtn');
    if (btn) btn.disabled = true;

    api(API.publish, { method: 'POST', body: payload }).then(function (res) {
      if (!res.ok) {
        toast(res.error || '发布失败。', 'error', 6000);
        if (res.needsKv) $('#kvWarn').hidden = false;
        return;
      }
      state.items = res.items || [];
      state.updatedAt = res.updatedAt || '';
      renderStoreBadge();
      renderItems();
      resetForm();
      toast('已发布，访客页面最迟 1 分钟内会自动更新。', 'ok', 4500);
    }).catch(function (err) {
      toast('连不上服务器：' + ((err && err.message) || err), 'error');
    }).then(function () {
      if (btn) btn.disabled = false;
    });
  }


  /* ======================================================================
     3.6 投票管理（建 / 暂停 / 结束 / 删除）

     走 POST /api/poll（要管理密码，和发通知同一把）：
       action=save   建或改（item）
       action=close  暂停 / 结束（暂停后不能再投，结果保留）
       action=reopen 恢复收票
       action=delete 删除（连票数一起清掉）
     ====================================================================== */
  function pollVotes(p) { return Object.keys(p.votes || {}).length; }
  function pollOver(p) {
    if (p.closed) return true;
    if (p.until) { var t = Date.parse(p.until); if (!isNaN(t) && Date.now() > t) return true; }
    return false;
  }

  function loadPolls(quiet) {
    return api(API.polls, { auth: false }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || '读取失败');
      state.polls = Array.isArray(res.items) ? res.items : [];
      renderPolls();
      if (!quiet) toast('投票已刷新（共 ' + state.polls.length + ' 个）', 'info', 2000);
    }).catch(function (err) {
      var box = $('#pollAdminList');
      if (box) box.textContent = '读不到投票：' + ((err && err.message) || err);
      if (!quiet) toast('读不到投票：' + ((err && err.message) || err), 'error', 5000);
    });
  }

  function renderPolls() {
    var box = $('#pollAdminList');
    var badge = $('#pollAdminCount');
    var list = state.polls || [];
    var open = list.filter(function (p) { return !pollOver(p); }).length;
    if (badge) badge.textContent = list.length ? (open + ' 个进行中 / 共 ' + list.length + ' 个') : '还没有';
    if (!box) return;
    box.textContent = '';

    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '还没有投票。在下面建一个，全班就能在首页投了。';
      box.appendChild(empty);
      return;
    }

    list.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'row-item';

      var bar = document.createElement('span');
      bar.className = 'ri-bar';

      var main = document.createElement('div');
      main.className = 'ri-main';

      var title = document.createElement('span');
      title.className = 'ri-title';
      title.textContent = p.title;

      var meta = document.createElement('span');
      meta.className = 'ri-meta';
      meta.appendChild(chip(p.options.length + ' 个选项'));
      meta.appendChild(chip(p.multi ? ('多选·最多 ' + (p.maxChoices || 1) + ' 项') : '单选'));
      meta.appendChild(chip(pollVotes(p) + ' 人已投'));
      if (p.until) meta.appendChild(chip('截止 ' + String(p.until).replace('T', ' ').slice(0, 16)));
      meta.appendChild(chip(p.closed ? '已暂停' : (pollOver(p) ? '已结束' : '进行中')));
      if (!p.once) meta.appendChild(chip('不限次数'));

      main.appendChild(title);
      main.appendChild(meta);

      // 每个选项的票数
      var counts = {};
      p.options.forEach(function (o) { counts[o.id] = 0; });
      Object.keys(p.votes || {}).forEach(function (dev) {
        (p.votes[dev] || []).forEach(function (id) { if (counts[id] !== undefined) counts[id]++; });
      });
      var detail = document.createElement('div');
      detail.className = 'small muted';
      detail.style.marginTop = '6px';
      detail.textContent = p.options.map(function (o) { return o.label + ' ' + counts[o.id] + ' 票'; }).join('　·　');
      main.appendChild(detail);

      var actions = document.createElement('div');
      actions.className = 'ri-actions';

      var toggle = button(p.closed ? '恢复收票' : '暂停投票', 'i-close', function () {
        var act = p.closed ? 'reopen' : 'close';
        var msg = p.closed ? ('恢复「' + p.title + '」，让同学继续投票？')
          : ('暂停「' + p.title + '」？\n\n暂停后同学不能再投，票数和结果都保留，可以随时「恢复收票」。');
        askConfirm(msg, { okText: p.closed ? '恢复' : '暂停' }).then(function (yes) {
          if (yes) savePoll({ action: act, id: p.id }, p.closed ? '已恢复收票' : '已暂停投票');
        });
      });
      actions.appendChild(toggle);

      var delBtn = button('删除这个投票', 'i-trash', function () {
        askConfirm('删除投票「' + p.title + '」？\n\n会连 ' + pollVotes(p) + ' 人的投票记录一起清掉，不可恢复。',
          { danger: true, okText: '删除' }).then(function (yes) {
          if (yes) savePoll({ action: 'delete', id: p.id }, '已删除投票：' + p.title);
        });
      });
      delBtn.classList.add('btn-danger');
      actions.appendChild(delBtn);

      row.appendChild(bar);
      row.appendChild(main);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  function savePoll(payload, okMsg) {
    return api(API.poll, { method: 'POST', body: payload }).then(function (res) {
      if (!res || !res.ok) { toast((res && res.error) || '操作失败。', 'error', 5200); return; }
      state.polls = Array.isArray(res.items) ? res.items : [];
      renderPolls();
      toast(okMsg || '已更新', 'ok', 2600);
    }).catch(function (err) {
      toast('连不上服务器：' + ((err && err.message) || err), 'error');
    });
  }

  function createPollAdmin() {
    var opts = ($('#paOptions').value || '').split('\n').map(function (x) { return x.trim(); })
      .filter(Boolean).map(function (label) { return { label: label }; });
    var title = ($('#paTitle').value || '').trim();
    if (!title) { toast('标题要填。', 'warn'); $('#paTitle').focus(); return; }
    if (opts.length < 2) { toast('至少两个选项（一行一个）。', 'warn'); $('#paOptions').focus(); return; }
    var multi = $('#paMulti').checked;
    savePoll({
      action: 'save',
      item: {
        title: title,
        desc: ($('#paDesc').value || '').trim(),
        options: opts,
        multi: multi,
        maxChoices: multi ? Number($('#paMax').value || 1) : 1,
        once: $('#paOnce').checked,
        until: ($('#paUntil').value || '')
      }
    }, '投票已创建：' + title).then(function () {
      ['#paTitle', '#paDesc', '#paOptions', '#paUntil'].forEach(function (sel) { var el = $(sel); if (el) el.value = ''; });
    });
  }

  /* 附件区（通知也能带图片/文档）：挂一次，发布时把元数据一起带上 */
  var att = null;
  var attExisting = [];      // 编辑已有通知时，线上已经有的附件

  function mountAttach() {
    if (!window.CW || !CW.attach) return;
    att = CW.attach.mount($('#fFiles'), { key: state.key || '' });
  }

  /** 编辑时把钥匙换掉（上传附件要用管理密码） */
  function syncAttachKey() { if (att) att.setKey(state.key || ''); }

  function currentFiles() {
    var byId = {};
    (attExisting || []).concat(att ? att.files() : []).forEach(function (f) {
      if (f && f.id) byId[f.id] = f;
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  function submitCompose(e) {
    if (e) e.preventDefault();
    var title = $('#fTitle').value.trim();
    var body = $('#fBody').value.trim();
    if (!title && !body) { toast('标题和正文至少写一个。', 'warn'); $('#fTitle').focus(); return; }

    save({
      item: {
        id: state.editingId || '',
        title: title,
        body: body,
        level: $('#fLevel').value,
        source: $('#fSource').value.trim(),
        pinned: $('#fPin').checked,
        files: currentFiles()
      }
    });
  }

  function startEdit(it) {
    state.editingId = it.id;
    $('#fTitle').value = it.title || '';
    $('#fBody').value = it.body || '';
    $('#fLevel').value = it.level || 'info';
    $('#fSource').value = it.source || '';
    $('#fPin').checked = !!it.pinned;
    // 线上已有的附件先记下（保存时会跟着这条一起发回去，没被移除的就留着）
    attExisting = Array.isArray(it.files) ? it.files.slice() : [];
    if (att) att.clear();
    var box = $('#fFiles');
    if (box) {
      var old = box.querySelector('.att-existing');
      if (old) old.parentNode.removeChild(old);
      if (attExisting.length && CW.attach) {
        box.appendChild(CW.attach.render(attExisting, { compact: true }));
        box.lastChild.classList.add('att-existing');
      }
    }
    $('#composeTitle').textContent = '修改这条通知';
    $('#publishBtn').textContent = '保存修改';
    $('#cancelEdit').hidden = false;
    updateCount();
    scrollTo({ top: 0, behavior: 'smooth' });
    $('#fTitle').focus();
  }

  function resetForm() {
    state.editingId = '';
    attExisting = [];
    if (att) att.clear();
    var box = $('#fFiles');
    if (box) { var old = box.querySelector('.att-existing'); if (old) old.parentNode.removeChild(old); }
    $('#fTitle').value = '';
    $('#fBody').value = '';
    $('#fLevel').value = 'info';
    $('#fSource').value = '';
    $('#fPin').checked = true;
    $('#composeTitle').textContent = '发一条通知';
    $('#publishBtn').textContent = '发布到全站';
    $('#cancelEdit').hidden = true;
    updateCount();
  }

  function updateCount() {
    var n = ($('#fBody').value || '').length;
    $('#bodyCount').textContent = String(n);
  }

  function clearAll() {
    askConfirm('确定清空全部通知？首页通知栏会变成「暂无通知」，此操作不可撤销。',
      { danger: true, okText: '清空' }).then(function (yes) {
      if (!yes) return;
      api(API.reset, { method: 'POST', body: {} }).then(function (res) {
        if (!res.ok) { toast(res.error || '清空失败。', 'error'); return; }
        state.items = [];
        renderItems();
        toast('已清空全部通知。', 'ok');
      }).catch(function (err) { toast('连不上服务器：' + ((err && err.message) || err), 'error'); });
    });
  }

  /* ======================================================================
     4. 导出 hosts.json（没绑 KV 时用它更新静态文件）
     ====================================================================== */
  function exportHosts() {
    var doc = {
      _说明: '通知栏的静态兜底文件：没绑定 KV 时，首页通知栏就读这里的内容。日常发布建议在 /admin.html 里做。',
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: '主机',
      source: 'hosts.json',
      items: state.items
    };
    var text = JSON.stringify(doc, null, 2) + '\n';

    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'hosts.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);

    toast('已下载 hosts.json。把它覆盖到 site/data/hosts.json 再 git push，全站就会看到这些通知。', 'ok', 8000);
  }

  /* ======================================================================
     5. 启动
     ====================================================================== */
  function boot() {
    api(API.state, { auth: false }).then(function (res) {
      state.storage = res.storage || '';
      renderStoreBadge();
      if (res.ok && res.initialized) {
        showLogin(false, res.storage);
      } else if (res.ok && !res.initialized) {
        showLogin(true, res.storage);
      } else {
        // 接口不可用（比如本地直接双击打开 html、或还没部署 Worker）
        showLogin(true, '');
        $('#loginHint').textContent = '读不到 /api/state。如果你是用 file:// 直接打开这个页面，' +
          '请改用部署好的网址（或本地起一个 wrangler dev）再试。';
      }
    }).catch(function () {
      showLogin(true, '');
      $('#loginHint').textContent = '连不上 /api/state。请确认网站是通过 Cloudflare Worker（或 wrangler dev）访问的。';
    });
  }

  function init() {
    var loginForm = $('#loginForm');
    if (loginForm) loginForm.addEventListener('submit', doLogin);

    var statsRefresh = $('#statsRefresh');
    if (statsRefresh) statsRefresh.addEventListener('click', function () {
      loadStats(false);
      toast('已刷新访问统计', 'info', 1600);
    });
    var statsRange = $('#statsRange');
    if (statsRange) statsRange.addEventListener('change', function () { loadStats(false); });

    var composeForm = $('#composeForm');
    if (composeForm) composeForm.addEventListener('submit', submitCompose);

    var body = $('#fBody');
    if (body) body.addEventListener('input', updateCount);

    var newBtn = $('#newBtn');
    if (newBtn) newBtn.addEventListener('click', resetForm);

    var cancel = $('#cancelEdit');
    if (cancel) cancel.addEventListener('click', resetForm);

    var lockBtn = $('#lockBtn');
    if (lockBtn) lockBtn.addEventListener('click', lock);

    var reload = $('#reloadBtn');
    if (reload) reload.addEventListener('click', function () { refresh(false); toast('已刷新', 'info', 1600); });

    var exportBtn = $('#exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportHosts);

    var clearBtn = $('#clearAll');
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    // 公共事务：刷新 / 单条下架（在行内）/ 全部清空
    var pollRefresh = $('#pollAdminRefresh');
    if (pollRefresh) pollRefresh.addEventListener('click', function () { loadPolls(false); });
    var paCreate = $('#paCreate');
    if (paCreate) paCreate.addEventListener('click', createPollAdmin);
    var paMulti = $('#paMulti');
    if (paMulti) paMulti.addEventListener('change', function () { var el = $('#paMax'); if (el) el.disabled = !paMulti.checked; });

    var pubRefresh = $('#pubRefresh');
    if (pubRefresh) pubRefresh.addEventListener('click', function () { loadPublicEvents(false); });
    var pubClear = $('#pubClearAll');
    if (pubClear) pubClear.addEventListener('click', clearPublicEvents);

    updateCount();
    boot();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
