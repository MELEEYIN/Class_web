/* ==========================================================================
   widgets.js — 小组件
     · 天气（Open-Meteo，免费且允许跨域，不需要 API Key）
     · 待办清单
     · 倒数日
     · 搜索框（本地筛选入口 / 课程，回车用搜索引擎）
     · 上课提醒（浏览器通知）
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  /* ======================================================================
     1. 天气
     ====================================================================== */
  // 深圳技术大学（坪山区）大致坐标
  var LAT = 22.6885;
  var LON = 114.3410;
  var CACHE_MS = 30 * 60 * 1000;
  var WEATHER_URL = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + LAT + '&longitude=' + LON +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=Asia%2FShanghai&forecast_days=3';

  var WMO = {
    0: ['☀️', '晴'], 1: ['🌤️', '大部晴朗'], 2: ['⛅', '局部多云'], 3: ['☁️', '阴'],
    45: ['🌫️', '有雾'], 48: ['🌫️', '雾凇'],
    51: ['🌦️', '小毛毛雨'], 53: ['🌦️', '毛毛雨'], 55: ['🌧️', '大毛毛雨'],
    56: ['🌧️', '冻毛毛雨'], 57: ['🌧️', '冻毛毛雨'],
    61: ['🌦️', '小雨'], 63: ['🌧️', '中雨'], 65: ['🌧️', '大雨'],
    66: ['🌧️', '冻雨'], 67: ['🌧️', '强冻雨'],
    71: ['🌨️', '小雪'], 73: ['🌨️', '中雪'], 75: ['❄️', '大雪'], 77: ['🌨️', '雪粒'],
    80: ['🌦️', '阵雨'], 81: ['🌧️', '强阵雨'], 82: ['⛈️', '暴雨'],
    85: ['🌨️', '阵雪'], 86: ['❄️', '强阵雪'],
    95: ['⛈️', '雷阵雨'], 96: ['⛈️', '雷阵雨伴冰雹'], 99: ['⛈️', '强雷暴伴冰雹']
  };

  function wmo(code) { return WMO[code] || ['🌡️', '未知']; }

  var weatherTimer = null;

  function initWeather() {
    var box = U.$('#weatherBox');
    if (!box) return;
    renderWeatherFromCache(true);
    weatherTimer = setInterval(function () { renderWeatherFromCache(false); }, 5 * 60 * 1000);
  }

  function renderWeatherFromCache(silent) {
    var cached = U.lsGet('weather', null);
    var fresh = cached && cached.at && (Date.now() - cached.at < CACHE_MS);

    if (cached && cached.data) {
      paintWeather(cached.data, !fresh);
      if (fresh) return;
    }
    if (!fresh) fetchWeather(silent && cached && cached.data);
  }

  function fetchWeather(silentFail) {
    var box = U.$('#weatherBox');
    if (box && !silentFail) {
      U.render(box, U.el('div', { class: 'loading-inline' }, [
        U.el('span', { class: 'spinner-sm' }), '正在获取天气…'
      ]));
    }

    fetch(WEATHER_URL, { mode: 'cors', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        U.lsSet('weather', { at: Date.now(), data: data });
        paintWeather(data, false);
      })
      .catch(function (err) {
        if (silentFail) return;
        var box2 = U.$('#weatherBox');
        if (!box2) return;
        U.render(box2, U.el('div', {}, [
          U.el('div', { class: 'card-sub', text: '天气获取失败' }),
          U.el('p', { class: 'tiny faint', style: { marginTop: '4px' }, text: '可能是网络或校园网限制，不影响其他功能。' }),
          U.el('button', {
            class: 'btn btn-sm btn-ghost', type: 'button', style: { marginTop: '7px' },
            text: '重试',
            onclick: function () { fetchWeather(false); }
          })
        ]));
        console.warn('[CW] weather failed:', err);
      });
  }

  function paintWeather(data, stale) {
    var box = U.$('#weatherBox');
    if (!box || !data || !data.current) return;

    var cur = data.current;
    var info = wmo(cur.weather_code);
    var today = data.daily && data.daily.time && data.daily.time.length
      ? {
        max: Math.round(data.daily.temperature_2m_max[0]),
        min: Math.round(data.daily.temperature_2m_min[0]),
        rain: data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max[0] : null,
        code: data.daily.weather_code[0]
      } : null;

    var temp = Math.round(cur.temperature_2m);
    var feels = Math.round(cur.apparent_temperature);

    U.render(box, U.el('div', {}, [
      U.el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px' } }, [
        U.el('span', { style: { fontSize: '27px', lineHeight: '1' }, text: info[0], 'aria-hidden': 'true' }),
        U.el('div', { style: { minWidth: '0' } }, [
          U.el('div', { style: { fontSize: '20px', fontWeight: '760', letterSpacing: '-.02em', lineHeight: '1.1' }, text: temp + '°' }),
          U.el('div', { class: 'tiny muted truncate', text: info[1] + ' · ' + (cur.is_day ? '白天' : '夜间') })
        ])
      ]),
      U.el('div', { class: 'tiny faint', style: { marginTop: '8px', display: 'flex', gap: '9px', flexWrap: 'wrap' } }, [
        U.el('span', { text: '体感 ' + feels + '°' }),
        U.el('span', { text: '湿度 ' + Math.round(cur.relative_humidity_2m) + '%' }),
        today ? U.el('span', { text: today.min + '~' + today.max + '°' }) : null,
        today && today.rain !== null && today.rain > 0 ? U.el('span', { text: '降水 ' + today.rain + '%' }) : null
      ]),
      U.el('div', { class: 'tiny faint', style: { marginTop: '5px' } }, [
        U.el('span', { text: '深圳 · 坪山' + (stale ? ' · 缓存' : '') })
      ])
    ]));
  }

  /* ======================================================================
     2. 待办
     ====================================================================== */
  function initTodo() {
    var form = U.$('#todoForm');
    var input = U.$('#todoInput');
    if (form && input) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (!text) return;
        CW.store.addTodo(text);
        input.value = '';
      });
    }

    CW.store.on('todo', function () { renderTodo(); });
    renderTodo();
  }

  function renderTodo() {
    var list = U.$('#todoList');
    var count = U.$('#todoCount');
    if (!list) return;

    var items = CW.store.state.todo;
    var pending = items.filter(function (t) { return !t.done; }).length;
    var done = items.length - pending;

    if (count) count.textContent = items.length ? (pending + ' 项待办' + (done ? ' · ' + done + ' 项已完成' : '')) : '';

    if (!items.length) {
      U.render(list, U.el('div', { class: 'empty', style: { padding: '16px 12px' } }, [
        U.icon('i-check-circle', 'ico'),
        U.el('span', { text: '暂时没有待办' })
      ]));
      return;
    }

    var sorted = items.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return 0;
    });

    var nodes = sorted.map(function (t) {
      var cb = U.el('input', { type: 'checkbox', 'aria-label': '标记完成' });
      cb.checked = t.done;
      cb.addEventListener('change', function () { CW.store.toggleTodo(t.id); });

      return U.el('div', { class: 'todo-item' + (t.done ? ' is-done' : '') }, [
        cb,
        U.el('div', { class: 'ti-body' }, [
          U.el('span', { class: 'ti-text', text: t.text }),
          U.el('span', { class: 'ti-meta' }, [
            t.due ? U.el('span', { text: '截止 ' + t.due }) : null,
            U.el('span', { text: createdLabel(t.createdAt) })
          ])
        ]),
        U.el('button', {
          class: 'ti-del', type: 'button', 'aria-label': '删除待办', title: '删除',
          onclick: function () { CW.store.removeTodo(t.id); }
        }, [U.icon('i-close')])
      ]);
    });

    if (done > 0) {
      nodes.push(U.el('button', {
        class: 'btn btn-sm btn-ghost', type: 'button',
        style: { marginTop: '9px', width: '100%' },
        text: '清空已完成（' + done + '）',
        onclick: function () { CW.store.clearDoneTodos(); }
      }));
    }

    U.render(list, nodes);
  }

  function createdLabel(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    return U.relativeDay(U.startOfDay(d)) + '添加';
  }

  /* ======================================================================
     3. 倒数日
     ====================================================================== */
  function initCountdown() {
    var addBtn = U.$('#cdAdd');
    if (addBtn) addBtn.addEventListener('click', toggleCountdownForm);
    CW.store.on('countdown', function () { renderCountdown(); });
    renderCountdown();
  }

  function toggleCountdownForm() {
    var card = U.$('#cdCard');
    if (!card) return;
    var existing = U.$('#cdForm');
    if (existing) { existing.parentNode.removeChild(existing); return; }

    var title = U.el('input', { class: 'input', type: 'text', placeholder: '例如：期末考试', maxlength: '40' });
    var date = U.el('input', { class: 'input', type: 'date' });
    var note = U.el('input', { class: 'input', type: 'text', placeholder: '备注（可不填）', maxlength: '60' });
    date.value = U.fmtDate(U.addDays(U.today(), 30));

    var form = U.el('div', {
      class: 'field', id: 'cdForm',
      style: { marginTop: '12px', padding: '12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }
    }, [
      U.el('label', { class: 'field-label', text: '倒数日名称' }), title,
      U.el('label', { class: 'field-label', text: '目标日期' }), date,
      U.el('label', { class: 'field-label', text: '备注' }), note,
      U.el('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } }, [
        U.el('button', {
          class: 'btn btn-sm btn-primary', type: 'button', text: '添加',
          onclick: function () {
            var t = title.value.trim();
            if (!t) { U.toast('给倒数日起个名字吧。', 'warn'); title.focus(); return; }
            if (!U.parseDate(date.value)) { U.toast('请选择日期。', 'warn'); return; }
            CW.store.addCountdown(t, date.value, note.value.trim());
            U.toast('已添加倒数日', 'ok', { timeout: 1600 });
            if (form.parentNode) form.parentNode.removeChild(form);
          }
        }),
        U.el('button', {
          class: 'btn btn-sm btn-ghost', type: 'button', text: '取消',
          onclick: function () { if (form.parentNode) form.parentNode.removeChild(form); }
        })
      ])
    ]);

    var list = U.$('#cdList');
    card.insertBefore(form, list);
    title.focus();
  }

  function renderCountdown() {
    var list = U.$('#cdList');
    if (!list) return;

    var items = CW.store.state.countdown;
    if (!items.length) {
      U.render(list, U.el('div', { class: 'empty', style: { padding: '16px 12px' } }, [
        U.icon('i-flag', 'ico'),
        U.el('span', { text: '加一个倒数日，比如期末考试或回家日期' })
      ]));
      return;
    }

    var today = U.today();

    U.render(list, items.map(function (c) {
      var d = U.parseDate(c.date);
      var days = U.diffDays(today, d);
      var past = days < 0;

      return U.el('div', { class: 'countdown-item' + (past ? ' is-past' : '') }, [
        U.el('div', { class: 'cd-days' }, [
          U.el('b', { text: past ? String(-days) : String(days) }),
          U.el('span', { text: past ? '天前' : (days === 0 ? '就是今天' : '天后') })
        ]),
        U.el('div', { class: 'cd-info' }, [
          U.el('b', { class: 'truncate', text: c.title }),
          U.el('span', { text: c.date + (c.note ? ' · ' + c.note : '') })
        ]),
        U.el('button', {
          class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': '删除倒数日', title: '删除',
          onclick: function () {
            CW.app.confirmThen('删除倒数日「' + U.truncate(c.title, 16) + '」？', function () {
              CW.store.removeCountdown(c.id);
            });
          }
        }, [U.icon('i-trash', 'ico')])
      ]);
    }));
  }

  /* ======================================================================
     4. 搜索
     ====================================================================== */
  var searchState = { query: '' };

  function initSearch() {
    var input = U.$('#q');
    if (!input) return;

    var reset = U.$('#linksReset');
    if (reset) {
      reset.addEventListener('click', function () {
        input.value = '';
        runSearch('');
        input.focus();
      });
    }

    input.addEventListener('input', U.debounce(function () {
      runSearch(input.value);
    }, 90));

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = input.value.trim();
        if (!q) return;
        var first = visibleLink();
        if (first) {
          window.open(first.href, '_blank', 'noopener');
          input.blur();
        } else {
          CW.app.confirmThen('没有匹配的入口。用必应搜索「' + U.truncate(q, 30) + '」？', function () {
            window.open('https://www.bing.com/search?q=' + encodeURIComponent(q), '_blank', 'noopener');
          }, '去搜索');
        }
      } else if (e.key === 'Escape') {
        input.value = '';
        runSearch('');
        input.blur();
      }
    });

    // 点搜索框外收起筛选
    document.addEventListener('click', function (e) {
      if (!searchState.query) return;
      if (e.target === input) return;
      if (e.target.closest && e.target.closest('#links, #tools, #linksReset, .nav-search')) return;
      input.value = '';
      runSearch('');
    });
  }

  function visibleLink() {
    var cards = U.$$('#linkGrid .link-card');
    for (var i = 0; i < cards.length; i++) {
      if (!cards[i].classList.contains('is-filtered')) return cards[i];
    }
    return null;
  }

  function runSearch(raw) {
    var q = String(raw || '').trim().toLowerCase();
    searchState.query = q;

    var reset = U.$('#linksReset');
    if (reset) reset.hidden = !q;

    var shown = 0;
    U.$$('#linkGrid .link-card').forEach(function (card) {
      var hay = ((card.getAttribute('data-key') || '') + ' ' +
        (card.querySelector('.lc-name') ? card.querySelector('.lc-name').textContent : '') + ' ' +
        (card.getAttribute('href') || '')).toLowerCase();
      var hit = !q || hay.indexOf(q) >= 0;
      card.classList.toggle('is-filtered', !hit);
      if (hit) shown++;
    });

    // 工具卡片也一起筛（它们是 button，不影响 layout）
    U.$$('#toolGrid .link-card').forEach(function (card) {
      var hay = (card.textContent || '').toLowerCase();
      card.classList.toggle('is-filtered', !!q && hay.indexOf(q) < 0);
    });

    var empty = U.$('#linksEmpty');
    if (empty) empty.hidden = shown > 0 || !q;

    // 课程也顺便找一找
    if (q) {
      var hits = CW.store.state.schedule.courses.filter(function (c) {
        return (c.name + ' ' + (c.teacher || '') + ' ' + (c.room || '')).toLowerCase().indexOf(q) >= 0;
      });
      if (hits.length && empty) {
        empty.hidden = false;
        U.render(empty, [
          U.icon('i-book', 'ico'),
          U.el('strong', { text: '入口里没找到，但课表里有 ' + hits.length + ' 条相关课程' }),
          U.el('div', {
            style: { display: 'grid', gap: '4px', width: '100%', marginTop: '4px' }
          }, hits.slice(0, 5).map(function (c) {
            return U.el('button', {
              class: 'sched-item', type: 'button', 'data-color': String(U.colorFor(c)),
              onclick: function () {
                var d = CW.schedule.dateOf(Math.max(1, CW.schedule.weekOf(U.today())), c.day || 1);
                CW.schedule.openFull(d);
              }
            }, [
              U.el('span', { class: 'si-bar' }),
              U.el('span', { class: 'si-body' }, [
                U.el('span', { class: 'si-title truncate', text: c.name }),
                U.el('span', { class: 'si-meta' }, [
                  U.el('span', { text: c.day ? '周' + CW.schedule.WEEKDAY_LABELS[c.day - 1] : '星期未定' }),
                  c.room ? U.el('span', { text: c.room }) : null,
                  c.teacher ? U.el('span', { text: c.teacher }) : null
                ])
              ])
            ]);
          }))
        ]);
      } else if (empty && hits.length === 0) {
        // 保留默认文案
        U.render(empty, [
          U.icon('i-search', 'ico'),
          U.el('strong', { text: '没有匹配的入口' }),
          U.el('span', { text: '回车可以用必应搜索「' + U.truncate(raw, 24) + '」。' })
        ]);
      }
    } else if (empty) {
      U.render(empty, [
        U.icon('i-search', 'ico'),
        U.el('strong', { text: '没有匹配的入口' }),
        U.el('span', { text: '试试「教务」「课表」「邮箱」这类关键词。' })
      ]);
    }
  }

  /* ======================================================================
     5. 上课提醒
     ====================================================================== */
  var notified = {};
  var remindTimer = null;

  function notifySupported() {
    return typeof window.Notification === 'function';
  }

  function notifyPermission() {
    if (!notifySupported()) return 'unsupported';
    return Notification.permission;   // 'default' | 'granted' | 'denied'
  }

  function initReminder() {
    var enableBtn = U.$('#notifyEnable');
    var testBtn = U.$('#notifyTest');
    var minSel = U.$('#remindMin');

    if (minSel) {
      minSel.value = String(CW.store.state.schedule.settings.remindMinutes || 20);
      minSel.addEventListener('change', function () {
        CW.store.setSettings({ remindMinutes: Number(minSel.value) || 20 });
        U.toast('提醒时间已设为课前 ' + minSel.value + ' 分钟', 'ok', { timeout: 1800 });
        syncRemindState();
      });
    }

    if (enableBtn) enableBtn.addEventListener('click', requestNotify);
    if (testBtn) testBtn.addEventListener('click', function () {
      if (notifyPermission() !== 'granted') { requestNotify(); return; }
      sendNotification('这是一条测试通知', '如果能看到它，上课提醒就能正常工作。');
    });

    CW.store.on('settings', syncRemindState);
    syncRemindState();

    // 每 25 秒检查一次
    remindTimer = setInterval(checkRemind, 25000);
    checkRemind();
  }

  function requestNotify() {
    if (!notifySupported()) {
      U.toast('这个浏览器不支持桌面通知。手机可以把本页添加到主屏幕后再试。', 'warn', { timeout: 5000 });
      syncRemindState();
      return;
    }
    if (Notification.permission === 'denied') {
      U.toast('通知权限被拒绝了。请点地址栏左边的图标，把「通知」改成允许。', 'warn', { timeout: 6000 });
      syncRemindState();
      return;
    }
    Notification.requestPermission().then(function (p) {
      if (p === 'granted') {
        U.toast('已开启上课提醒', 'ok');
        sendNotification('提醒已开启', '会在每节课前 ' + (CW.store.state.schedule.settings.remindMinutes || 20) + ' 分钟通知你。');
      } else {
        U.toast('没有拿到通知权限，提醒功能无法使用。', 'warn');
      }
      syncRemindState();
    });
  }

  function sendNotification(title, body) {
    try {
      var n = new Notification(title, {
        body: body,
        icon: './assets/favicon.svg',
        badge: './assets/favicon.svg',
        tag: 'cw-class-' + title + Date.now(),
        silent: false
      });
      n.onclick = function () { window.focus(); n.close(); };
      setTimeout(function () { try { n.close(); } catch (e) { /* 忽略 */ } }, 30000);
    } catch (e) { /* 某些浏览器不允许在非 SW 环境里弹通知 */ }
  }

  function checkRemind() {
    if (notifyPermission() !== 'granted') return;
    var nx = CW.schedule.nextClass();
    if (nx.status !== 'next' || !nx.msUntil) return;

    var lead = (CW.store.state.schedule.settings.remindMinutes || 20) * 60000;
    if (nx.msUntil > lead) return;

    var key = nx.item.id + '@' + U.fmtDate(nx.date) + '#' + nx.item.start;
    if (notified[key]) return;
    notified[key] = true;

    var mins = Math.max(1, Math.round(nx.msUntil / 60000));
    sendNotification(
      mins + ' 分钟后上课：' + nx.item.name,
      (nx.item.start ? nx.item.start + ' 开始' : '') +
      (nx.item.room ? ' · ' + nx.item.room : '') +
      (nx.item.teacher ? ' · ' + nx.item.teacher : '')
    );
  }

  function syncRemindState() {
    var p = notifyPermission();
    var text = p === 'granted' ? '已开启'
      : p === 'denied' ? '已被拒绝'
      : p === 'unsupported' ? '不支持' : '未开启';

    var stateEl = U.$('#remindState');
    if (stateEl) stateEl.textContent = text;

    var stateEl2 = U.$('#notifyState');
    if (stateEl2) {
      stateEl2.textContent = p === 'granted'
        ? '桌面通知已开启：页面开着时，会在课前 ' + (CW.store.state.schedule.settings.remindMinutes || 20) + ' 分钟提醒你。'
        : p === 'denied'
          ? '通知权限被拒绝了。需要在浏览器设置里手动把本站的通知改成「允许」。'
          : p === 'unsupported'
            ? '当前浏览器不支持桌面通知，可以改用导出的 .ics 在手机日历里提醒。'
            : '还没有开启通知。点上面的按钮授权即可，本站不会发送任何服务器通知。';
    }

    var enableBtn = U.$('#notifyEnable');
    if (enableBtn) enableBtn.disabled = (p === 'granted' || p === 'unsupported');

    renderRemindModal();
  }

  function renderRemindModal() {
    var body = U.$('#remindBody');
    if (!body) return;

    var p = notifyPermission();
    var mins = CW.store.state.schedule.settings.remindMinutes || 20;
    var nx = CW.schedule.nextClass();

    var nodes = [
      U.el('div', { class: 'notice' + (p === 'granted' ? '' : ' notice-warn') }, [
        U.icon(p === 'granted' ? 'i-check-circle' : 'i-bell', 'ico'),
        U.el('div', {}, [
          U.el('strong', { text: '通知状态：' + (p === 'granted' ? '已开启' : p === 'denied' ? '已被拒绝' : p === 'unsupported' ? '不支持' : '未开启') }),
          U.el('div', { class: 'tiny', style: { marginTop: '3px' }, text: '课前 ' + mins + ' 分钟提醒。页面需要保持打开（可以放在后台标签页）。' })
        ])
      ])
    ];

    if (nx.status === 'next') {
      nodes.push(U.el('div', { class: 'card', style: { marginTop: '14px', boxShadow: 'none', background: 'var(--surface-2)' } }, [
        U.el('div', { class: 'card-sub', text: '下一节课' }),
        U.el('div', { style: { fontWeight: '700', marginTop: '3px' }, text: nx.item.name }),
        U.el('div', { class: 'small muted', style: { marginTop: '3px' },
          text: U.relativeDay(nx.date) + ' ' + (nx.item.start || '') + (nx.item.room ? ' · ' + nx.item.room : '') })
      ]));
    } else if (nx.status === 'live') {
      nodes.push(U.el('div', { class: 'card', style: { marginTop: '14px', boxShadow: 'none', background: 'var(--ok-soft)' } }, [
        U.el('div', { class: 'card-sub', text: '正在上课' }),
        U.el('div', { style: { fontWeight: '700', marginTop: '3px' }, text: nx.item.name }),
        U.el('div', { class: 'small muted', style: { marginTop: '3px' }, text: '还有 ' + U.humanDuration(nx.msLeft) + ' 下课' })
      ]));
    } else {
      nodes.push(U.el('p', { class: 'small muted', style: { marginTop: '14px' }, text: '最近没有排课，导入课表后提醒才会生效。' }));
    }

    if (p !== 'granted') {
      nodes.push(U.el('button', {
        class: 'btn btn-primary', type: 'button', style: { marginTop: '14px', width: '100%' },
        onclick: requestNotify
      }, [U.icon('i-bell', 'ico'), '开启桌面通知']));
    }

    U.render(body, nodes);
  }

  /* ======================================================================
     6. 顶部问候条
     ====================================================================== */
  function renderDash() {
    var now = new Date();
    var h = now.getHours();

    var greet = h < 5 ? '凌晨好' : h < 11 ? '早上好' : h < 13 ? '中午好'
      : h < 18 ? '下午好' : h < 23 ? '晚上好' : '夜深了';

    var greetEl = U.$('#dashGreet');
    if (greetEl) greetEl.textContent = greet;

    var nameEl = U.$('#dashName');
    var sch = CW.store.state.schedule;
    if (nameEl) {
      var name = sch.settings.studentName || (sch.meta && sch.meta.student) || '';
      nameEl.textContent = name || '同学';
    }

    var dateEl = U.$('#dashDate');
    if (dateEl) {
      dateEl.textContent = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' +
        now.getDate() + ' 日 · ' + U.weekdayFull(now) + ' · ' +
        pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    }

    var lunar = U.$('#dashLunar');
    if (lunar) {
      var week = CW.schedule.weekOf(U.today());
      if (CW.schedule.inTerm(week)) {
        var total = sch.settings.totalWeeks;
        lunar.textContent = '第 ' + week + ' / ' + total + ' 教学周';
      } else {
        lunar.textContent = '假期中（学期共 ' + sch.settings.totalWeeks + ' 周）';
      }
    }

    renderChips();
  }

  function renderChips() {
    var box = U.$('#dashChips');
    if (!box) return;

    var sch = CW.store.state.schedule;
    var st = CW.store.stats();
    var todayItems = CW.schedule.itemsOn(U.today());
    var todayCourses = todayItems.filter(function (i) { return i.kind === 'course'; });
    var week = CW.schedule.weekOf(U.today());

    var chips = [];

    if (CW.schedule.inTerm(week)) {
      chips.push(U.el('span', { class: 'badge', text: '第 ' + week + ' 教学周' }));
    } else {
      chips.push(U.el('span', { class: 'badge badge-plain', text: '假期' }));
    }

    chips.push(U.el('span', {
      class: 'badge ' + (todayCourses.length ? 'badge-ok' : 'badge-plain'),
      text: todayCourses.length ? '今天 ' + todayCourses.length + ' 节课' : '今天没课'
    }));

    if (st.events) chips.push(U.el('span', { class: 'badge badge-plain', text: st.events + ' 条事务' }));
    if (st.todo) chips.push(U.el('span', { class: 'badge badge-plain', text: st.todo + ' 项待办' }));

    if (sch.meta && sch.meta.term) {
      chips.push(U.el('span', { class: 'badge badge-plain', text: sch.meta.term + ' 学期' }));
    }

    // 最近一条备注（军事训练之类）
    if (sch.notes && sch.notes.length) {
      chips.push(U.el('span', {
        class: 'badge badge-warn', title: sch.notes.join('；'),
        text: '★ ' + U.truncate(sch.notes[0], 18)
      }));
    }

    U.render(box, chips);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ======================================================================
     初始化
     ====================================================================== */
  function init() {
    initWeather();
    initTodo();
    initCountdown();
    initSearch();
    initReminder();
    renderDash();

    CW.store.on('schedule', function () { renderDash(); });
    CW.store.on('any', U.debounce(function (evt) {
      if (evt === 'schedule' || evt === 'todo' || evt === 'countdown') renderDash();
    }, 200));

    // 每 30 秒刷新问候条（时间在走）
    setInterval(function () { renderDash(); }, 30000);
  }

  CW.widgets = {
    init: init,
    renderDash: renderDash,
    renderTodo: renderTodo,
    renderCountdown: renderCountdown,
    runSearch: runSearch,
    syncRemindState: syncRemindState,
    fetchWeather: fetchWeather
  };
})();
