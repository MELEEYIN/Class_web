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
     0. 实时时间（全部跟着系统时间走，每秒刷新）
        页面上所有时间都来自同一个 tick，所以日期一旦跨天也会同步更新，
        不会出现「时钟已经 00:00，问候语还写着昨天」的情况。
     ====================================================================== */
  var clockTimer = null;
  var lastTickMinute = -1;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 当前时间（本地时区，就是系统时间） */
  function nowTime() { return new Date(); }

  function tickClock() {
    var now = nowTime();

    var timeEl = U.$('#clockTime');
    if (timeEl) {
      timeEl.textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
    }

    var dateEl = U.$('#clockDate');
    if (dateEl) {
      dateEl.textContent = (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' + U.weekdayFull(now);
    }

    // 每秒只动秒数；分钟一变，才刷新问候语、日期行这些文字
    var m = now.getHours() * 60 + now.getMinutes();
    if (m === lastTickMinute) return;
    lastTickMinute = m;

    paintDateLabels(now);
    renderClockMeta(now);
  }

  /** 问候语 + 日期行 + 教学周（跟着系统时间） */
  function paintDateLabels(now) {
    now = now || nowTime();
    var h = now.getHours();

    var greet = h < 5 ? '凌晨好' : h < 11 ? '早上好' : h < 13 ? '中午好'
      : h < 18 ? '下午好' : h < 23 ? '晚上好' : '夜深了';

    var greetEl = U.$('#dashGreet');
    if (greetEl) greetEl.textContent = greet;

    var nameEl = U.$('#dashName');
    if (nameEl) nameEl.textContent = displayName();

    var dateEl = U.$('#dashDate');
    if (dateEl) {
      dateEl.textContent = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' +
        now.getDate() + ' 日 · ' + U.weekdayFull(now) + ' · ' +
        pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    }

    var lunar = U.$('#dashLunar');
    if (lunar) {
      var sch = CW.store.state.schedule;
      var week = CW.schedule.weekOf(U.today());
      lunar.textContent = CW.schedule.inTerm(week)
        ? '第 ' + week + ' / ' + sch.settings.totalWeeks + ' 教学周'
        : '假期中（学期共 ' + sch.settings.totalWeeks + ' 周）';
    }
  }

  /**
   * 显示用的名字。
   * 只认使用者自己在「修改 → 学期与节次」里填的名字；没填就是「同学」。
   *
   * 这里刻意**不**去读课表元数据里那个姓名（meta.student）：
   * 那是从教务系统课表表头读出来的，很可能不是当前这台设备的主人
   * （比如你拿了同学的课表文件来导入）。默认显示「同学」最稳妥，
   * 想用自己的名字手动填一次即可，也可以在「修改 → 学期与节次」里
   * 点那个「用这个名字」按钮。
   */
  function displayName() {
    var name = String(CW.store.state.schedule.settings.studentName || '').trim();
    return name || '同学';
  }

  function renderClockMeta(now) {
    var box = U.$('#clockMeta');
    if (!box) return;
    now = now || nowTime();

    var week = CW.schedule.weekOf(U.today());
    var nodes = [];

    if (CW.schedule.inTerm(week)) {
      nodes.push(U.el('span', { class: 'badge badge-plain', text: '第 ' + week + ' 教学周' }));
    } else {
      nodes.push(U.el('span', { class: 'badge badge-plain', text: '假期' }));
    }
    nodes.push(U.el('span', { class: 'ck-tz', text: '本机时间' }));

    var box2 = U.$('#clockBox');
    if (box2) box2.title = '跟随这台设备（系统）的时间与时区：' + timezoneLabel();

    U.render(box, nodes);
  }

  function timezoneLabel() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) return tz;
    } catch (e) { /* 老浏览器忽略 */ }
    var off = -new Date().getTimezoneOffset();
    var sign = off >= 0 ? 'UTC+' : 'UTC-';
    off = Math.abs(off);
    return sign + Math.floor(off / 60) + (off % 60 ? ':' + pad2(off % 60) : '');
  }

  function initClock() {
    tickClock();
    clockTimer = setInterval(tickClock, 1000);
  }

  /* ======================================================================
     0.1 通知栏 —— 由服务端（主机）发布，所有访客自动同步
          没绑定 KV 时，内容来自站点里的 /data/hosts.json
     ====================================================================== */
  var NOTICE_API = '/api/notice';
  var NOTICE_POLL_MS = 60 * 1000;

  var notice = {
    ok: false,
    failed: false,
    storage: '',
    updatedAt: '',
    current: null,
    recent: []
  };

  var noticeTimer = null;

  function initNotice() {
    fetchNotice(false);
    noticeTimer = setInterval(function () { fetchNotice(true); }, NOTICE_POLL_MS);

    // 从后台切回来时立刻对一次，别让通知停在旧内容上
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') fetchNotice(true);
    });

    var refresh = U.$('#noticeRefresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        U.toast('正在读取最新通知…', 'info', { timeout: 1500 });
        fetchNotice(false, true);
      });
    }
  }

  function fetchNotice(silent, loud) {
    return fetch(NOTICE_API, { cache: 'no-store', headers: { 'accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var before = notice.current ? notice.current.id + '@' + notice.current.at : '';
        notice.ok = !!data.ok;
        notice.failed = false;
        notice.storage = data.storage || '';
        notice.updatedAt = data.updatedAt || '';
        notice.current = data.current || null;
        notice.recent = data.recent || [];
        renderNoticeBox();

        var after = notice.current ? notice.current.id + '@' + notice.current.at : '';
        // 主机发了新通知：提醒一下，并把已经开着的通知弹窗刷新掉
        if (after && after !== before) {
          if (before || loud) U.toast('通知栏有新内容：' + U.truncate(notice.current.title || notice.current.body, 24), 'info', { timeout: 6000 });
          if (CW.app.isOpen('notice')) renderNoticeBody();
        }
      })
      .catch(function (err) {
        notice.failed = true;
        renderNoticeBox();
        if (!silent) console.warn('[CW] notice fetch failed:', err);
      });
  }

  function levelClass(level) {
    return level === 'ok' ? 'is-ok' : level === 'warn' ? 'is-warn' : level === 'danger' ? 'is-danger' : '';
  }

  function levelBadge(level) {
    if (level === 'danger') return { cls: 'badge-danger', text: '紧急' };
    if (level === 'warn') return { cls: 'badge-warn', text: '注意' };
    if (level === 'ok') return { cls: 'badge-ok', text: '通知' };
    return { cls: 'badge-plain', text: '通知' };
  }

  function noticeTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = Math.round((Date.now() - d.getTime()) / 60000);
    var abs = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (diff < 1) return '刚刚';
    if (diff < 60) return diff + ' 分钟前';
    if (diff < 60 * 24) return Math.floor(diff / 60) + ' 小时前';
    return abs;
  }

  /** 小卡里最多列几条（其余点「查看全部」看） */
  var NOTICE_ROWS = 5;

  /**
   * 首页那张通知卡：每条只占一行（标题 + 发布者 + 时间），
   * 不显示正文，点任意一行打开弹窗看全文。
   */
  function renderNoticeBox() {
    var box = U.$('#noticeBox');
    if (!box) return;

    var head = U.el('div', { class: 'nt-head' }, [
      U.el('span', { class: 'nt-title' }, [U.icon('i-bell', 'ico'), '通知栏']),
      U.el('span', { class: 'nt-tag', text: notice.storage === 'kv' ? '服务端同步' : '本地' })
    ]);

    // 读不到接口（例如本地 file:// 打开，或还没部署 Worker）
    if (!notice.ok) {
      U.render(box, [
        head,
        U.el('div', { class: 'nt-empty' }, [
          U.el('strong', { text: '通知暂时读不到' }),
          U.el('span', { class: 'tiny', text: notice.failed ? '服务器没有响应，稍后会自动重试。' : '正在读取…' })
        ])
      ]);
      return;
    }

    if (!notice.recent.length) {
      U.render(box, [
        head,
        U.el('div', { class: 'nt-empty' }, [
          U.el('strong', { text: '暂无通知' }),
          U.el('span', { class: 'tiny', text: '主机发布通知后，所有打开本站的人都会看到。' })
        ])
      ]);
      return;
    }

    var cur = notice.current || notice.recent[0];
    var total = notice.recent.length;

    var nodes = [
      head,
      U.el('div', { class: 'nt-list' }, notice.recent.slice(0, NOTICE_ROWS).map(function (it) {
        var badge = levelBadge(it.level);
        return U.el('button', {
          type: 'button',
          class: 'nt-line ' + levelClass(it.level) + (cur && it.id === cur.id ? ' is-current' : ''),
          'data-qp': 'notice',
          title: (it.title || '（无标题）') + (it.body ? '\n\n' + it.body : '')
        }, [
          U.el('span', { class: 'nt-dot', title: badge.text }),
          U.el('b', { class: 'nt-line-title', text: it.title || '（无标题）' }),
          U.el('span', { class: 'nt-line-meta' }, [
            (it.files && it.files.length) ? U.icon('i-note', 'ico') : null,   // 附件标记（用文档图标，别用图片图标）
            it.source ? U.el('span', { class: 'nt-line-src', text: U.truncate(it.source, 8) }) : null,
            U.el('span', { class: 'nt-line-time', text: noticeTime(it.at) })
          ])
        ]);
      }))
    ];

    // 还有更多 → 看全部；都列出来了但有正文 → 看全文
    var more = '';
    if (total > NOTICE_ROWS) more = '查看全部 ' + total + ' 条通知';
    else if (notice.recent.some(function (x) { return x.body; })) more = '查看完整通知';
    if (more) {
      nodes.push(U.el('button', { type: 'button', class: 'nt-more', 'data-qp': 'notice', text: more }));
    }

    U.render(box, nodes);
  }

  /** 通知弹窗里的内容 */
  function renderNoticeBody() {
    var body = U.$('#noticeBody');
    var sub = U.$('#noticeSub');
    var foot = U.$('#noticeFoot');
    if (!body) return;

    if (sub) {
      sub.textContent = notice.storage === 'kv'
        ? '由主机在后台发布，所有打开本站的人都能看到'
        : '读取自站点的 data/hosts.json';
    }
    if (foot) {
      foot.textContent = notice.updatedAt
        ? '最后更新：' + noticeTime(notice.updatedAt)
        : (notice.failed ? '读取失败，稍后自动重试' : '');
    }

    if (!notice.recent.length) {
      U.render(body, U.el('div', { class: 'empty' }, [
        U.icon('i-bell', 'ico'),
        U.el('strong', { text: '还没有通知' }),
        U.el('span', { text: '主机在 /admin.html 里发布后，这里就会出现内容。' })
      ]));
      return;
    }

    U.render(body, notice.recent.map(function (it) {
      var badge = levelBadge(it.level);
      return U.el('article', { class: 'nt-item ' + levelClass(it.level) }, [
        U.el('div', { class: 'nt-item-head' }, [
          U.el('span', { class: 'badge ' + badge.cls, text: badge.text }),
          it.title ? U.el('strong', { text: it.title }) : null,
          U.el('span', { class: 'tiny faint', style: { marginLeft: 'auto' }, text: noticeTime(it.at) })
        ]),
        it.body ? U.el('p', { class: 'nt-item-body', text: it.body }) : null,
        // 首页通知区只列附件名，不放图片缩略图（用户要求）
        (it.files && it.files.length && CW.attach) ? CW.attach.render(it.files, { links: true }) : null,
        it.source ? U.el('div', { class: 'tiny faint', text: '发布：' + it.source }) : null
      ]);
    }));
  }

  /* ======================================================================
     0.2 天气
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
    var humidity = Math.round(cur.relative_humidity_2m);
    var wind = cur.wind_speed_10m === null || cur.wind_speed_10m === undefined
      ? null : Math.round(cur.wind_speed_10m);

    function stat(label, value) {
      return U.el('div', { class: 'wx-stat' }, [
        U.el('span', { class: 'wx-k', text: label }),
        U.el('b', { class: 'wx-v mono', text: value })
      ]);
    }

    U.render(box, [
      U.el('div', { class: 'wx-head' }, [
        U.el('span', { class: 'wx-ico', 'aria-hidden': 'true', text: info[0] }),
        U.el('div', { class: 'wx-main' }, [
          U.el('div', { class: 'wx-temp' }, [
            U.el('b', { text: temp + '°' }),
            U.el('span', { class: 'wx-cond', text: info[1] })
          ]),
          U.el('div', { class: 'wx-sub tiny muted truncate', text: (cur.is_day ? '白天' : '夜间') + ' · ' + (stale ? '缓存数据' : '实时') })
        ])
      ]),
      U.el('div', { class: 'wx-grid' }, [
        stat('体感', feels + '°'),
        stat('湿度', humidity + '%'),
        today ? stat('今日', today.min + '~' + today.max + '°') : null,
        today && today.rain !== null && today.rain !== undefined
          ? stat('降水', today.rain + '%')
          : (wind !== null ? stat('风速', wind + 'km/h') : null)
      ]),
      U.el('div', { class: 'wx-foot tiny faint' }, [
        U.el('span', { text: '深圳 · 坪山' }),
        stale ? U.el('span', { class: 'wx-stale', text: '缓存' }) : null
      ])
    ]);
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
        问候语、日期、姓名、教学周都交给 paintDateLabels（由每秒的时钟驱动），
        这里只负责跟着数据变化重画标签、时钟下方的周次与通知栏。
     ====================================================================== */
  function renderDash() {
    var now = nowTime();
    paintDateLabels(now);
    renderClockMeta(now);
    renderChips();
    renderNoticeBox();
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

    // 说明：以前这里会把课表里的附注（sch.notes）显示成「备注 …」徽章，
    // 但这些文字（例如「军事训练 1-18周」）对看课表没有帮助，反而占位置，所以不再展示。
    // 附注仍然照常解析并保存在 sch.notes 里，需要的时候还能取用。

    U.render(box, chips);
  }


  /* ======================================================================
     顶部小卡里的按钮走事件委托（卡片内容会整体重绘，不能逐个绑监听）
     目前只有通知栏上有按钮：查看全部通知。
     ====================================================================== */
  function bindSideActions() {
    var box = U.$('#noticeBox');
    if (!box) return;

    box.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-qp]') : null;
      if (!btn) return;
      var key = btn.getAttribute('data-qp');
      e.preventDefault();

      if (key === 'import') { CW.app.openModal('import'); return; }
      if (key === 'map') { CW.app.openModal('map'); return; }
      if (key === 'notice') { openNoticeModal(); return; }
      if (key === 'event') { CW.editUI.openEventForm(null, U.today()); return; }
      if (key === 'schedule' || key === 'today') { CW.schedule.openFull(U.today()); return; }
      if (key === 'countdown') {
        var card = U.$('#cdCard');
        if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (key === 'todo') {
        var card2 = U.$('#todoCard');
        if (card2 && card2.scrollIntoView) card2.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () {
          var input = U.$('#todoInput');
          if (input) input.focus();
        }, 380);
      }
    });
  }

  /* ======================================================================
     初始化
     ====================================================================== */
  function openNoticeModal() {
    renderNoticeBody();
    CW.app.openModal('notice');
  }

  function init() {
    initClock();
    initNotice();
    initWeather();
    initTodo();
    initCountdown();
    initSearch();
    initReminder();
    bindSideActions();
    renderDash();

    CW.store.on('schedule', function () { renderDash(); });
    CW.store.on('any', U.debounce(function (evt) {
      if (evt === 'schedule' || evt === 'todo' || evt === 'countdown') renderDash();
    }, 200));

    // 每 20 秒对一次数据（时钟自己每秒走，不依赖这里）
    setInterval(function () { renderDash(); }, 20000);
  }

  CW.widgets = {
    init: init,
    renderDash: renderDash,
    renderTodo: renderTodo,
    renderCountdown: renderCountdown,
    runSearch: runSearch,
    syncRemindState: syncRemindState,
    fetchWeather: fetchWeather,
    fetchNotice: fetchNotice,
    renderNoticeBox: renderNoticeBox,
    renderNoticeBody: renderNoticeBody,
    openNoticeModal: openNoticeModal,
    now: nowTime
  };
})();
