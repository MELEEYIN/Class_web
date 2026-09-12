/* ==========================================================================
   store.js — 状态、持久化、订阅、增删改
   数据全部放在本机：日程在 localStorage('cw.schedule')，待办、倒数日各一条。
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  var KEY_SCHEDULE = 'schedule';
  var KEY_TODO = 'todo';
  var KEY_COUNTDOWN = 'countdown';
  var KEY_UI = 'ui';

  var listeners = {};

  /* ======================================================================
     默认值
     ====================================================================== */
  function defaultSettings() {
    return {
      termStart: defaultTermStart(),
      totalWeeks: 18,
      remindMinutes: 20,
      showWeekend: true,
      firstDayOfWeek: 1,
      studentName: '',
      siteName: '校园主页'
    };
  }

  /**
   * 默认开学日：取「今年的 9 月 1 日所在周的周一」。
   * 只是给一个合理起点，用户可以随时在「修改 → 学期与节次」里改。
   */
  function defaultTermStart() {
    var now = new Date();
    var y = now.getFullYear();
    var sep1 = new Date(y, 8, 1);
    // 如果现在还没到 8 月，说明可能在春季学期，回退到上一年的 9 月
    if (now.getMonth() < 6) sep1 = new Date(y - 1, 8, 1);
    return U.fmtDate(U.mondayOf(sep1));
  }

  function emptyState() {
    return {
      version: 2,
      kind: 'cw-schedule',
      label: '',
      meta: {},
      settings: defaultSettings(),
      periods: CW.parse.defaultPeriods(),
      courses: [],
      events: [],
      notes: []
    };
  }

  /* ======================================================================
     清洗 / 校验 —— 手工改过 localStorage 或旧版本数据也能安全加载
     ====================================================================== */
  function sanitizeCourse(c) {
    if (!c || typeof c !== 'object') return null;
    var name = String(c.name || '').trim();
    if (!name) return null;
    var day = Number(c.day);
    if (!(day >= 1 && day <= 7)) day = 0;
    var weeks = Array.isArray(c.weeks) ? c.weeks.map(Number).filter(function (n) { return n >= 1 && n <= 30; }) : [];
    var codes = Array.isArray(c.codes) ? c.codes.map(Number).filter(function (n) { return n >= 1 && n <= 20; }) : [];
    var weeksText = String(c.weeksText || '').trim();
    // 保险：只给了文字周次（手工填写、或旧版本存下来的数据）就再解析一次，
    // 免得「1-16周(单)」这类写法退化成「整学期每周都上」。
    if (!weeks.length && weeksText && weeksText !== '全学期') {
      var spec = CW.parse.parseWeekSpec(weeksText, 30);
      if (spec.weeks.length) {
        weeks = spec.weeks;
        weeksText = spec.text || weeksText;
      }
    }
    return {
      id: c.id || U.uid('co'),
      name: name,
      teacher: String(c.teacher || '').trim(),
      room: String(c.room || '').trim(),
      day: day,
      codes: uniqNums(codes),
      weeks: uniqNums(weeks),
      weeksText: weeksText || CW.parse.compressRanges(weeks),
      note: String(c.note || '').trim(),
      color: typeof c.color === 'number' ? c.color % 8 : CW.parse.defaultColor(name)
    };
  }

  function sanitizeEvent(e) {
    if (!e || typeof e !== 'object') return null;
    var title = String(e.title || e.name || '').trim();
    var date = U.fmtDate(U.parseDate(e.date));
    if (!title || !date) return null;
    return {
      id: e.id || U.uid('ev'),
      title: title,
      date: date,
      start: CW.parse.normalizeTime(e.start) || '',
      end: CW.parse.normalizeTime(e.end) || '',
      allDay: e.allDay === undefined ? !CW.parse.normalizeTime(e.start) : !!e.allDay,
      location: String(e.location || e.room || '').trim(),
      note: String(e.note || '').trim(),
      repeat: ['none', 'daily', 'weekly', 'monthly'].indexOf(e.repeat) >= 0 ? e.repeat : 'none',
      repeatUntil: e.repeatUntil ? U.fmtDate(U.parseDate(e.repeatUntil)) : '',
      color: typeof e.color === 'number' ? e.color % 8 : U.hashIndex(title, 8)
    };
  }

  function uniqNums(arr) {
    var seen = {}, out = [];
    arr.forEach(function (n) { if (!seen[n]) { seen[n] = 1; out.push(n); } });
    return out.sort(function (a, b) { return a - b; });
  }

  function sanitizePeriods(list) {
    if (!Array.isArray(list) || !list.length) return CW.parse.defaultPeriods();
    var out = list.map(function (p, i) {
      if (!p || typeof p !== 'object') return null;
      var codes = Array.isArray(p.codes) ? uniqNums(p.codes.map(Number).filter(function (n) { return n >= 1 && n <= 20; })) : [];
      if (!codes.length) return null;
      return {
        label: String(p.label || CW.parse.periodLabel(codes)),
        codes: codes,
        start: CW.parse.normalizeTime(p.start) || '',
        end: CW.parse.normalizeTime(p.end) || ''
      };
    }).filter(Boolean);
    return out.length ? out.sort(byStartTime) : CW.parse.defaultPeriods();
  }

  /** 按真实开始时间排序（注意 SZTU 的「第15节」在时间上早于「第11 12节」） */
  function byStartTime(a, b) {
    var sa = U.timeToMin(a.start), sb = U.timeToMin(b.start);
    if (sa < 0 && sb < 0) return a.codes[0] - b.codes[0];
    if (sa < 0) return 1;
    if (sb < 0) return -1;
    return sa - sb;
  }

  function sanitizeSchedule(raw) {
    var base = emptyState();
    if (!raw || typeof raw !== 'object') return base;

    var out = {
      version: 2,
      kind: 'cw-schedule',
      label: String(raw.label || ''),
      meta: (raw.meta && typeof raw.meta === 'object') ? raw.meta : {},
      settings: Object.assign(defaultSettings(), raw.settings || {}),
      periods: sanitizePeriods(raw.periods),
      courses: (Array.isArray(raw.courses) ? raw.courses : []).map(sanitizeCourse).filter(Boolean),
      events: (Array.isArray(raw.events) ? raw.events : []).map(sanitizeEvent).filter(Boolean),
      notes: (Array.isArray(raw.notes) ? raw.notes : []).map(String).filter(Boolean)
    };

    // 设置项校验
    var s = out.settings;
    s.totalWeeks = U.clamp(Number(s.totalWeeks) || 18, 1, 30);
    s.remindMinutes = U.clamp(Number(s.remindMinutes) || 20, 0, 180);
    s.showWeekend = s.showWeekend !== false;
    s.firstDayOfWeek = s.firstDayOfWeek === 7 ? 7 : 1;
    var ts = U.parseDate(s.termStart);
    s.termStart = U.fmtDate(U.mondayOf(ts || U.parseDate(defaultTermStart())));
    s.studentName = String(s.studentName || '').trim();
    s.siteName = String(s.siteName || '校园主页').trim() || '校园主页';

    return out;
  }

  function sanitizeTodo(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (t) {
      if (!t || typeof t !== 'object') return null;
      var text = String(t.text || '').trim();
      if (!text) return null;
      return {
        id: t.id || U.uid('td'),
        text: text,
        done: !!t.done,
        createdAt: t.createdAt || new Date().toISOString(),
        due: t.due ? U.fmtDate(U.parseDate(t.due)) : ''
      };
    }).filter(Boolean);
  }

  function sanitizeCountdown(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (c) {
      if (!c || typeof c !== 'object') return null;
      var title = String(c.title || '').trim();
      var date = U.fmtDate(U.parseDate(c.date));
      if (!title || !date) return null;
      return { id: c.id || U.uid('cd'), title: title, date: date, note: String(c.note || '').trim() };
    }).filter(Boolean);
  }

  /* ======================================================================
     状态
     ====================================================================== */
  var state = {
    schedule: emptyState(),
    todo: [],
    countdown: [],
    ui: {
      theme: 'light',
      calShowCourses: true,
      lastMap: 'campus',
      schedTab: 'month',
      dismissedHints: {}
    },
    loaded: false
  };

  function defaultUI() {
    return {
      theme: (document.documentElement.getAttribute('data-theme') === 'dark') ? 'dark' : 'light',
      calShowCourses: true,
      lastMap: 'campus',
      schedTab: 'month',
      dismissedHints: {}
    };
  }

  function load() {
    state.schedule = sanitizeSchedule(U.lsGet(KEY_SCHEDULE, null));
    state.todo = sanitizeTodo(U.lsGet(KEY_TODO, []));
    state.countdown = sanitizeCountdown(U.lsGet(KEY_COUNTDOWN, []));
    state.ui = Object.assign(defaultUI(), U.lsGet(KEY_UI, {}) || {});
    if (typeof state.ui.calShowCourses !== 'boolean') state.ui.calShowCourses = true;
    state.loaded = true;
    return state;
  }

  /* ======================================================================
     保存（防抖，避免连续编辑时频繁写盘）
     ====================================================================== */
  var ALL_KEYS = ['schedule', 'todo', 'countdown', 'ui'];
  var pending = {};

  /** 把指定（或全部）分区写进 localStorage */
  function flush(keys) {
    if (!keys || !keys.length) keys = ALL_KEYS;
    var ok = true;
    keys.forEach(function (key) {
      if (key === 'schedule') { if (!U.lsSet(KEY_SCHEDULE, state.schedule)) ok = false; }
      else if (key === 'todo') { if (!U.lsSet(KEY_TODO, state.todo)) ok = false; }
      else if (key === 'countdown') { if (!U.lsSet(KEY_COUNTDOWN, state.countdown)) ok = false; }
      else if (key === 'ui') { if (!U.lsSet(KEY_UI, state.ui)) ok = false; }
    });
    return ok;
  }

  var saveTimer = null;
  var saveSoon = function () {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      var keys = Object.keys(pending);
      pending = {};
      if (!keys.length) return;
      if (flush(keys)) emit('saved', { keys: keys });
    }, 250);
  };

  function save(what) {
    if (what === undefined) pending = { schedule: 1, todo: 1, countdown: 1, ui: 1 };
    else pending[what] = 1;
    saveSoon();
  }

  /** 立刻写盘（导出、离开页面、恢复备份前用） */
  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    var keys = Object.keys(pending);
    pending = {};
    return flush(keys.length ? keys : ALL_KEYS);
  }

  /* ======================================================================
     订阅
     ====================================================================== */
  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
    return function off() {
      listeners[event] = (listeners[event] || []).filter(function (f) { return f !== fn; });
    };
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error('[CW.store] listener error on "' + event + '"', e); }
    });
    if (event !== 'any') emitAny(event, payload);
  }

  function emitAny(event, payload) {
    (listeners['any'] || []).forEach(function (fn) {
      try { fn(event, payload); } catch (e) { /* 忽略 */ }
    });
  }

  /* ======================================================================
     日程：整体替换 / 合并
     ====================================================================== */
  function replaceSchedule(parsed, options) {
    options = options || {};
    var mode = options.mode || 'merge';
    var sch = state.schedule;

    if (mode === 'replace') {
      sch.courses = [];
      sch.events = [];
      sch.notes = [];
      if (options.adoptMeta !== false) sch.meta = Object.assign({}, parsed.meta || {});
    } else {
      sch.meta = Object.assign({}, sch.meta || {}, parsed.meta || {});
    }

    // 节次：如果导入结果带了更完整的节次表，用它的
    if (Array.isArray(parsed.periods) && parsed.periods.length && options.adoptPeriods !== false) {
      sch.periods = sanitizePeriods(parsed.periods);
    }

    var addedCourses = 0, addedEvents = 0, skipped = 0;

    (parsed.courses || []).forEach(function (raw) {
      var c = sanitizeCourse(raw);
      if (!c) { skipped++; return; }
      var dup = sch.courses.some(function (x) {
        return x.name === c.name && x.day === c.day &&
          x.codes.join('-') === c.codes.join('-') &&
          x.weeks.join('-') === c.weeks.join('-') &&
          (x.room || '') === (c.room || '');
      });
      if (dup) { skipped++; return; }
      sch.courses.push(c);
      addedCourses++;
    });

    (parsed.events || []).forEach(function (raw) {
      var e = sanitizeEvent(raw);
      if (!e) { skipped++; return; }
      var dup = sch.events.some(function (x) {
        return x.title === e.title && x.date === e.date && (x.start || '') === (e.start || '');
      });
      if (dup) { skipped++; return; }
      sch.events.push(e);
      addedEvents++;
    });

    if (Array.isArray(parsed.notes) && parsed.notes.length) {
      (mode === 'replace' ? parsed.notes : sch.notes.concat(parsed.notes)).forEach(function (n) {
        if (sch.notes.indexOf(n) < 0) sch.notes.push(n);
      });
    }

    if (parsed.settings) {
      var s = sch.settings;
      if (parsed.settings.termStart && U.parseDate(parsed.settings.termStart)) {
        s.termStart = U.fmtDate(U.mondayOf(U.parseDate(parsed.settings.termStart)));
      }
      if (parsed.settings.totalWeeks) s.totalWeeks = U.clamp(Number(parsed.settings.totalWeeks) || 18, 1, 30);
    }

    if (parsed.label) sch.label = parsed.label;

    save('schedule');
    emit('schedule', { reason: 'replace', addedCourses: addedCourses, addedEvents: addedEvents, skipped: skipped });
    return { addedCourses: addedCourses, addedEvents: addedEvents, skipped: skipped };
  }

  /** 保证每条课程 / 事务都有 id（外部直接 push 时用） */
  function ensureIds() {
    state.schedule.courses.forEach(function (c) { if (!c.id) c.id = U.uid('co'); });
    state.schedule.events.forEach(function (e) { if (!e.id) e.id = U.uid('ev'); });
  }

  /* ======================================================================
     课程增删改
     ====================================================================== */
  function addCourse(data) {
    var c = sanitizeCourse(Object.assign({ id: U.uid('co') }, data));
    if (!c) return null;
    state.schedule.courses.push(c);
    save('schedule');
    emit('schedule', { reason: 'course-add', course: c });
    return c;
  }

  function updateCourse(id, patch) {
    var i = indexOfCourse(id);
    if (i < 0) return null;
    var merged = Object.assign({}, state.schedule.courses[i], patch);
    var c = sanitizeCourse(merged);
    if (!c) return null;
    c.id = id;
    state.schedule.courses[i] = c;
    save('schedule');
    emit('schedule', { reason: 'course-update', course: c });
    return c;
  }

  function removeCourse(id) {
    var i = indexOfCourse(id);
    if (i < 0) return false;
    state.schedule.courses.splice(i, 1);
    save('schedule');
    emit('schedule', { reason: 'course-remove', id: id });
    return true;
  }

  function indexOfCourse(id) {
    for (var i = 0; i < state.schedule.courses.length; i++) {
      if (state.schedule.courses[i].id === id) return i;
    }
    return -1;
  }

  function getCourse(id) {
    var i = indexOfCourse(id);
    return i < 0 ? null : state.schedule.courses[i];
  }

  /* ======================================================================
     事务增删改
     ====================================================================== */
  function addEvent(data) {
    var e = sanitizeEvent(Object.assign({ id: U.uid('ev') }, data));
    if (!e) return null;
    state.schedule.events.push(e);
    sortEvents();
    save('schedule');
    emit('schedule', { reason: 'event-add', event: e });
    return e;
  }

  function updateEvent(id, patch) {
    var i = indexOfEvent(id);
    if (i < 0) return null;
    var merged = Object.assign({}, state.schedule.events[i], patch);
    var e = sanitizeEvent(merged);
    if (!e) return null;
    e.id = id;
    state.schedule.events[i] = e;
    sortEvents();
    save('schedule');
    emit('schedule', { reason: 'event-update', event: e });
    return e;
  }

  function removeEvent(id) {
    var i = indexOfEvent(id);
    if (i < 0) return false;
    state.schedule.events.splice(i, 1);
    save('schedule');
    emit('schedule', { reason: 'event-remove', id: id });
    return true;
  }

  function indexOfEvent(id) {
    for (var i = 0; i < state.schedule.events.length; i++) {
      if (state.schedule.events[i].id === id) return i;
    }
    return -1;
  }

  function getEvent(id) {
    var i = indexOfEvent(id);
    return i < 0 ? null : state.schedule.events[i];
  }

  function sortEvents() {
    state.schedule.events.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var sa = U.timeToMin(a.start), sb = U.timeToMin(b.start);
      if (sa < 0 && sb < 0) return 0;
      if (sa < 0) return -1;
      if (sb < 0) return 1;
      return sa - sb;
    });
  }

  /* ======================================================================
     设置 / 节次
     ====================================================================== */
  function setSettings(patch) {
    var s = state.schedule.settings;
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    // 走一遍清洗
    state.schedule = sanitizeSchedule(state.schedule);
    save('schedule');
    emit('schedule', { reason: 'settings' });
    emit('settings', patch);
  }

  function setPeriods(list) {
    state.schedule.periods = sanitizePeriods(list);
    save('schedule');
    emit('schedule', { reason: 'periods' });
  }

  function findPeriod(codes) {
    var list = state.schedule.periods;
    var want = (codes || []).join('-');
    for (var i = 0; i < list.length; i++) {
      if (list[i].codes.join('-') === want) return list[i];
    }
    // 退一步：只要包含第一个节次就算
    if (codes && codes.length) {
      for (var j = 0; j < list.length; j++) {
        if (list[j].codes.indexOf(codes[0]) >= 0) return list[j];
      }
    }
    return null;
  }

  /**
   * 一组节次在一天里的起止时间。
   * 注意「中国近现代史纲要」这种 8/9/10 节连上的课：节次表里只有
   * 「第8 9节 15:45-17:10」和「第10节 17:15-17:55」两行，
   * 所以要取所有相交行的最早开始 + 最晚结束，否则会少算半节课。
   */
  function timesForCodes(codes) {
    if (!codes || !codes.length) return { start: '', end: '' };
    var starts = [], ends = [];
    state.schedule.periods.forEach(function (p) {
      var hit = codes.some(function (c) { return p.codes.indexOf(c) >= 0; });
      if (!hit) return;
      if (p.start) starts.push(p.start);
      if (p.end) ends.push(p.end);
    });
    if (!starts.length) return { start: '', end: '' };
    starts.sort(function (a, b) { return U.timeToMin(a) - U.timeToMin(b); });
    ends.sort(function (a, b) { return U.timeToMin(a) - U.timeToMin(b); });
    return { start: starts[0], end: ends[ends.length - 1] };
  }

  /** 某节课在一天里的起止时间 */
  function courseTimes(course) {
    return timesForCodes(course && course.codes);
  }

  /* ======================================================================
     待办
     ====================================================================== */
  function addTodo(text, due) {
    text = String(text || '').trim();
    if (!text) return null;
    var t = { id: U.uid('td'), text: text, done: false, createdAt: new Date().toISOString(), due: due || '' };
    state.todo.unshift(t);
    save('todo');
    emit('todo', { reason: 'add', item: t });
    return t;
  }

  function toggleTodo(id) {
    var t = state.todo.filter(function (x) { return x.id === id; })[0];
    if (!t) return null;
    t.done = !t.done;
    save('todo');
    emit('todo', { reason: 'toggle', item: t });
    return t;
  }

  function updateTodo(id, patch) {
    var t = state.todo.filter(function (x) { return x.id === id; })[0];
    if (!t) return null;
    Object.assign(t, patch);
    save('todo');
    emit('todo', { reason: 'update', item: t });
    return t;
  }

  function removeTodo(id) {
    var before = state.todo.length;
    state.todo = state.todo.filter(function (x) { return x.id !== id; });
    if (state.todo.length === before) return false;
    save('todo');
    emit('todo', { reason: 'remove', id: id });
    return true;
  }

  function clearDoneTodos() {
    state.todo = state.todo.filter(function (x) { return !x.done; });
    save('todo');
    emit('todo', { reason: 'clear-done' });
  }

  /* ======================================================================
     倒数日
     ====================================================================== */
  function addCountdown(title, date, note) {
    title = String(title || '').trim();
    var d = U.parseDate(date);
    if (!title || !d) return null;
    var c = { id: U.uid('cd'), title: title, date: U.fmtDate(d), note: String(note || '').trim() };
    state.countdown.push(c);
    sortCountdowns();
    save('countdown');
    emit('countdown', { reason: 'add', item: c });
    return c;
  }

  function updateCountdown(id, patch) {
    var c = state.countdown.filter(function (x) { return x.id === id; })[0];
    if (!c) return null;
    Object.assign(c, patch);
    save('countdown');
    emit('countdown', { reason: 'update', item: c });
    return c;
  }

  function removeCountdown(id) {
    var before = state.countdown.length;
    state.countdown = state.countdown.filter(function (x) { return x.id !== id; });
    if (state.countdown.length === before) return false;
    save('countdown');
    emit('countdown', { reason: 'remove', id: id });
    return true;
  }

  function sortCountdowns() {
    var t = U.today();
    state.countdown.sort(function (a, b) {
      var da = U.diffDays(t, U.parseDate(a.date));
      var db = U.diffDays(t, U.parseDate(b.date));
      var fa = da < 0, fb = db < 0;
      if (fa !== fb) return fa ? 1 : -1;          // 已过的排后面
      return Math.abs(da) - Math.abs(db);
    });
  }

  /* ======================================================================
     UI 偏好
     ====================================================================== */
  function setUI(patch) {
    Object.assign(state.ui, patch);
    save('ui');
    emit('ui', patch);
  }

  function dismissHint(key) {
    var d = state.ui.dismissedHints || (state.ui.dismissedHints = {});
    if (d[key]) return;
    d[key] = true;
    save('ui');
  }

  /* ======================================================================
     备份 / 恢复 / 清空
     ====================================================================== */
  function exportBackup() {
    return {
      kind: 'cw-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      generator: '校园主页 · leeyin.xyz',
      schedule: state.schedule,
      todo: state.todo,
      countdown: state.countdown,
      ui: { calShowCourses: state.ui.calShowCourses, theme: state.ui.theme },
      bg: U.lsGet('bg', null)
    };
  }

  function importBackup(obj, options) {
    options = options || {};
    if (!obj || typeof obj !== 'object') throw new Error('备份文件格式不对。');
    if (obj.kind !== 'cw-backup' && !obj.schedule) throw new Error('这看起来不是本站导出的备份文件。');

    if (obj.schedule) state.schedule = sanitizeSchedule(obj.schedule);
    if (Array.isArray(obj.todo)) state.todo = sanitizeTodo(obj.todo);
    if (Array.isArray(obj.countdown)) state.countdown = sanitizeCountdown(obj.countdown);
    if (obj.ui && typeof obj.ui === 'object') {
      if (typeof obj.ui.calShowCourses === 'boolean') state.ui.calShowCourses = obj.ui.calShowCourses;
      if (obj.ui.theme) state.ui.theme = obj.ui.theme;
    }
    pending = { schedule: 1, todo: 1, countdown: 1, ui: 1 };
    flush();
    emit('schedule', { reason: 'restore' });
    emit('todo', { reason: 'restore' });
    emit('countdown', { reason: 'restore' });
    emit('ui', { reason: 'restore' });
    return {
      courses: state.schedule.courses.length,
      events: state.schedule.events.length,
      todo: state.todo.length,
      countdown: state.countdown.length
    };
  }

  function clearSchedule() {
    state.schedule.courses = [];
    state.schedule.events = [];
    state.schedule.notes = [];
    state.schedule.meta = {};
    state.schedule.label = '';
    save('schedule');
    emit('schedule', { reason: 'clear' });
  }

  function clearAll() {
    ['schedule', 'todo', 'countdown', 'ui', 'bg'].forEach(function (k) { U.lsDel(k); });
    U.idbDel('bg-image').catch(function () { /* IndexedDB 不可用时忽略 */ });
    state.schedule = emptyState();
    state.todo = [];
    state.countdown = [];
    state.ui = defaultUI();
    flush();
    emit('schedule', { reason: 'clear-all' });
    emit('todo', { reason: 'clear-all' });
    emit('countdown', { reason: 'clear-all' });
    emit('ui', { reason: 'clear-all' });
  }

  function stats() {
    var s = state.schedule;
    var names = {};
    s.courses.forEach(function (c) { names[c.name] = 1; });
    var weeks = {};
    s.courses.forEach(function (c) { (c.weeks || []).forEach(function (w) { weeks[w] = (weeks[w] || 0) + 1; }); });
    var perWeek = Object.keys(weeks).length ? Object.keys(weeks).map(function (w) { return weeks[w]; }) : [0];
    var avg = perWeek.reduce(function (a, b) { return a + b; }, 0) / perWeek.length;
    return {
      courses: s.courses.length,
      courseNames: Object.keys(names).length,
      events: s.events.length,
      todo: state.todo.length,
      todoDone: state.todo.filter(function (t) { return t.done; }).length,
      countdown: state.countdown.length,
      perWeek: Math.round(avg * 10) / 10,
      hasData: s.courses.length > 0 || s.events.length > 0
    };
  }

  /* ======================================================================
     导出
     ====================================================================== */
  CW.store = {
    state: state,
    load: load, save: save, saveNow: saveNow,
    on: on, emit: emit,

    emptyState: emptyState,
    defaultSettings: defaultSettings,
    sanitizeSchedule: sanitizeSchedule,
    sanitizeCourse: sanitizeCourse,
    sanitizeEvent: sanitizeEvent,
    sanitizePeriods: sanitizePeriods,

    replaceSchedule: replaceSchedule,
    ensureIds: ensureIds,

    addCourse: addCourse, updateCourse: updateCourse, removeCourse: removeCourse, getCourse: getCourse,
    addEvent: addEvent, updateEvent: updateEvent, removeEvent: removeEvent, getEvent: getEvent,
    setSettings: setSettings, setPeriods: setPeriods,
    findPeriod: findPeriod, timesForCodes: timesForCodes, courseTimes: courseTimes,

    addTodo: addTodo, toggleTodo: toggleTodo, updateTodo: updateTodo,
    removeTodo: removeTodo, clearDoneTodos: clearDoneTodos,

    addCountdown: addCountdown, updateCountdown: updateCountdown, removeCountdown: removeCountdown,

    setUI: setUI, dismissHint: dismissHint,

    exportBackup: exportBackup, importBackup: importBackup,
    clearSchedule: clearSchedule, clearAll: clearAll, stats: stats
  };
})();
