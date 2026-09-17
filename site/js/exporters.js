/* ==========================================================================
   exporters.js — 导出与数据管理
     · 导出 .ics（拿手机日历订阅/导入）
     · 导出 / 恢复 JSON 备份
     · 上课时间表弹窗
     · 清空数据
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  var icsCache = '';

  /* ======================================================================
     1. 初始化
     ====================================================================== */
  function init() {
    initBackups();
    // 数据弹窗
    var exp = U.$('#dataExport');
    if (exp) exp.addEventListener('click', function () { exportBackupFile(); });

    var impBtn = U.$('#dataImportBtn');
    var impFile = U.$('#dataImportFile');
    if (impBtn && impFile) {
      impBtn.addEventListener('click', function () { impFile.click(); });
      impFile.addEventListener('change', function () {
        if (impFile.files && impFile.files[0]) importBackupFile(impFile.files[0]);
        impFile.value = '';
      });
    }

    var clrSched = U.$('#clearSchedule');
    if (clrSched) {
      clrSched.addEventListener('click', function () {
        CW.app.confirmThen('清空所有课程与事务？待办和倒数日会保留。', function () {
          CW.store.clearSchedule();
          U.toast('课程与事务已清空', 'ok');
        }, '清空', 'btn-danger');
      });
    }

    var clrAll = U.$('#clearAll');
    if (clrAll) {
      clrAll.addEventListener('click', function () {
        CW.app.confirmThen(
          '这会删掉课表、事务、待办、倒数日、背景和全部设置，且无法撤销。确定要继续吗？',
          function () {
            CW.store.clearAll();
            if (CW.bg) { CW.bg.cfg.mode = 'preset'; CW.bg.cfg.preset = 'theme'; CW.bg.onThemeChange(); }
            U.toast('已清空全部本地数据', 'ok');
          }, '全部清空', 'btn-danger');
      });
    }

    // 导出 .ics 弹窗
    var scope = U.$('#icsScope');
    var wks = U.$('#icsWeeks');
    if (scope && wks) {
      var refresh = function () { renderIcsPreview(); };
      scope.addEventListener('change', refresh);
      wks.addEventListener('change', refresh);
      wks.addEventListener('input', U.debounce(refresh, 260));
    }

    var dl = U.$('#icsDownload');
    if (dl) dl.addEventListener('click', downloadIcs);

    var cp = U.$('#icsCopy');
    if (cp) {
      cp.addEventListener('click', function () {
        var text = buildIcs();
        U.copyText(text).then(function (ok) {
          U.toast(ok ? '日历内容已复制，可以贴进记事本或日历 App。' : '复制失败，请手动选中下面的内容。', ok ? 'ok' : 'warn');
        });
      });
    }

    CW.store.on('schedule', function () { icsCache = ''; });
  }

  /* ======================================================================
     2. 数据统计
     ====================================================================== */
  function renderDataStats() {
    var box = U.$('#dataStats');
    if (!box) return;

    var st = CW.store.stats();
    var sch = CW.store.state.schedule;

    var cards = [
      tile(String(st.courseNames), '门课程', st.courses + ' 条排课记录'),
      tile(String(st.courses), '条排课', '周均 ' + st.perWeek + ' 节'),
      tile(String(st.events), '条事务', U.fmtDate(U.today()) + ' 之后有 ' + upcomingCount() + ' 条'),
      tile(String(st.todo), '项待办', st.todoDone + ' 项已完成'),
      tile(String(st.countdown), '个倒数日', '最近一个：' + nearestCountdown()),
      tile(String(sch.settings.totalWeeks), '教学周', sch.settings.termStart + ' 起')
    ];

    U.render(box, cards);

    function tile(big, mid, small) {
      return U.el('div', { class: 'card', style: { padding: '13px 14px' } }, [
        U.el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px' } }, [
          U.el('b', { style: { fontSize: '21px', fontWeight: '780', letterSpacing: '-.02em', color: 'var(--accent)' }, text: big }),
          U.el('span', { class: 'small muted', text: mid })
        ]),
        U.el('div', { class: 'tiny faint', style: { marginTop: '2px' }, text: small })
      ]);
    }
  }

  function upcomingCount() {
    var t = U.today();
    return CW.store.state.schedule.events.filter(function (e) {
      return U.diffDays(t, U.parseDate(e.date)) >= 0;
    }).length;
  }

  function nearestCountdown() {
    if (!CW.store.state.countdown.length) return '还没有';
    var t = U.today();
    var best = null, bestD = Infinity;
    CW.store.state.countdown.forEach(function (c) {
      var d = U.diffDays(t, U.parseDate(c.date));
      if (d >= 0 && d < bestD) { bestD = d; best = c; }
    });
    if (!best) return '都过期了';
    return U.truncate(best.title, 10) + '（' + bestD + ' 天）';
  }

  /* ======================================================================
     3. JSON 备份
     ====================================================================== */
  function exportBackupFile() {
    CW.store.saveNow();
    var data = CW.store.exportBackup();
    var stamp = U.fmtDate(U.today());
    U.download('校园主页备份-' + stamp + '.json',
      JSON.stringify(data, null, 1), 'application/json;charset=utf-8');
    U.toast('已导出备份文件，请妥善保存。', 'ok', { timeout: 4000 });
  }

  function importBackupFile(file) {
    U.readFileAsText(file).then(function (text) {
      var obj;
      try { obj = JSON.parse(text); }
      catch (e) { throw new Error('这个文件不是合法的 JSON。'); }

      CW.app.confirmThen(
        '恢复备份会覆盖当前的课表、事务、待办与设置。确定吗？',
        function () {
          try {
            var res = CW.store.importBackup(obj);
            if (obj.bg) {
              U.lsSet('bg', obj.bg);
              if (CW.bg) { CW.bg.init(); }
            }
            U.toast('已恢复：' + res.courses + ' 条排课 · ' + res.events + ' 条事务 · ' +
              res.todo + ' 项待办 · ' + res.countdown + ' 个倒数日', 'ok', { timeout: 5200 });
          } catch (err) {
            U.toast('恢复失败：' + ((err && err.message) || err), 'error', { timeout: 6000 });
          }
        }, '恢复', 'btn-danger');
    }).catch(function (err) {
      U.toast('读取备份失败：' + ((err && err.message) || err), 'error', { timeout: 6000 });
    });
  }

  /* ======================================================================
     4. .ics 导出
     ====================================================================== */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 本地时间 -> ICS 用的 20260907T083000（不加 Z，表示「墙上时间」） */
  function icsDateTime(date, time) {
    var t = (time || '00:00').split(':');
    return date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) + 'T' +
      pad2(Number(t[0]) || 0) + pad2(Number(t[1]) || 0) + '00';
  }

  function icsDateOnly(date) {
    return date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate());
  }

  function icsEscape(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /** RFC 5545：每行不超过 75 个八位组，续行以空格开头（注意别把汉字切两半） */
  function foldLine(line) {
    var bytes = 0, out = '', limit = 73;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      var code = line.charCodeAt(i);
      var size = code < 0x80 ? 1 : (code < 0x800 ? 2 : (code >= 0xD800 && code <= 0xDBFF ? 4 : 3));
      if (bytes + size > limit && i > 0) {
        out += '\r\n ';
        bytes = 1;
      }
      out += ch;
      bytes += size;
      if (size === 4) { i++; out += line.charAt(i); }
    }
    return out;
  }

  function buildIcs() {
    var scopeEl = U.$('#icsScope');
    var weeksEl = U.$('#icsWeeks');
    var scope = scopeEl ? scopeEl.value : 'all';
    var weeks = U.clamp(Number(weeksEl && weeksEl.value) || CW.store.state.schedule.settings.totalWeeks, 1, 30);

    var sch = CW.store.state.schedule;
    var lines = [];

    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//Campus Home leeyin.xyz//Class Schedule//CN');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');
    lines.push('X-WR-CALNAME:' + icsEscape((sch.settings.studentName || '我') + '的课表'));
    lines.push('X-WR-TIMEZONE:Asia/Shanghai');

    var stamp = new Date();
    var dtstamp = stamp.getUTCFullYear() + pad2(stamp.getUTCMonth() + 1) + pad2(stamp.getUTCDate()) + 'T' +
      pad2(stamp.getUTCHours()) + pad2(stamp.getUTCMinutes()) + pad2(stamp.getUTCSeconds()) + 'Z';

    var count = 0;

    /* --- 课程：按周展开成一条条具体日期的日程 --- */
    if (scope === 'all' || scope === 'courses') {
      sch.courses.forEach(function (c) {
        if (!c.day) return;
        var effective = (c.weeks && c.weeks.length) ? c.weeks : range(1, weeks);
        effective.forEach(function (w) {
          if (w < 1 || w > weeks) return;
          var date = CW.schedule.dateOf(w, c.day);
          var t = CW.store.courseTimes(c);
          if (!t.start) return;
          count++;
          lines.push('BEGIN:VEVENT');
          lines.push('UID:course-' + c.id + '-w' + w + '@leeyin.xyz');
          lines.push('DTSTAMP:' + dtstamp);
          lines.push('DTSTART:' + icsDateTime(date, t.start));
          lines.push('DTEND:' + icsDateTime(date, t.end || t.start));
          lines.push('SUMMARY:' + icsEscape(c.name));
          if (c.room) lines.push('LOCATION:' + icsEscape(c.room));
          var desc = [];
          if (c.teacher) desc.push('教师：' + c.teacher);
          if (c.codes && c.codes.length) desc.push('第 ' + c.codes.join('/') + ' 节');
          desc.push('第 ' + w + ' 周');
          lines.push('DESCRIPTION:' + icsEscape(desc.join('；')));
          lines.push('CATEGORIES:课程');
          lines.push('END:VEVENT');
        });
      });
    }

    /* --- 事务：单次事件；重复规则尽量用 RRULE 表达，省体积 --- */
    if (scope === 'all' || scope === 'events') {
      sch.events.forEach(function (e) {
        var d = U.parseDate(e.date);
        if (!d) return;
        count++;
        lines.push('BEGIN:VEVENT');
        lines.push('UID:event-' + e.id + '@leeyin.xyz');
        lines.push('DTSTAMP:' + dtstamp);
        if (e.allDay || !e.start) {
          lines.push('DTSTART;VALUE=DATE:' + icsDateOnly(d));
          lines.push('DTEND;VALUE=DATE:' + icsDateOnly(U.addDays(d, 1)));
        } else {
          lines.push('DTSTART:' + icsDateTime(d, e.start));
          lines.push('DTEND:' + icsDateTime(d, e.end || e.start));
        }
        lines.push('SUMMARY:' + icsEscape(e.title));
        if (e.location) lines.push('LOCATION:' + icsEscape(e.location));
        if (e.note) lines.push('DESCRIPTION:' + icsEscape(e.note));
        lines.push('CATEGORIES:事务');
        if (e.repeat && e.repeat !== 'none') {
          var rule = 'FREQ=' + e.repeat.toUpperCase();
          if (e.repeatUntil) rule += ';UNTIL=' + icsDateOnly(U.parseDate(e.repeatUntil)) + 'T235959';
          lines.push('RRULE:' + rule);
        }
        lines.push('END:VEVENT');
      });
    }

    lines.push('END:VCALENDAR');

    icsCache = lines.map(foldLine).join('\r\n') + '\r\n';
    return icsCache;

    function range(a, b) {
      var out = [];
      for (var i = a; i <= b; i++) out.push(i);
      return out;
    }
  }

  function renderIcsPreview() {
    var box = U.$('#icsPreview');
    if (!box) return;
    var text = buildIcs();
    var n = (text.match(/BEGIN:VEVENT/g) || []).length;
    box.textContent = '共 ' + n + ' 条日程，' + Math.round(text.length / 1024) + ' KB\n\n' +
      text.split('\r\n').slice(0, 14).join('\n') + '\n…';
  }

  function downloadIcs() {
    var text = buildIcs();
    var n = (text.match(/BEGIN:VEVENT/g) || []).length;
    if (!n) { U.toast('当前没有可导出的课程或事务。', 'warn'); return; }
    U.download('校园主页-课表.ics', text, 'text/calendar;charset=utf-8');
    U.toast('已导出 ' + n + ' 条日程。手机打开这个文件即可导入系统日历。', 'ok', { timeout: 5200 });
  }

  /* ======================================================================
     5. 上课时间弹窗
     ====================================================================== */
  function renderPeriodsModal() {
    var box = U.$('#periodsBody');
    if (!box) return;

    var periods = CW.store.state.schedule.periods.slice().sort(function (a, b) {
      var sa = U.timeToMin(a.start), sb = U.timeToMin(b.start);
      if (sa < 0) return 1;
      if (sb < 0) return -1;
      return sa - sb;
    });

    var today = U.today();
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();

    U.render(box, [
      U.el('div', { class: 'row-list' }, periods.map(function (p) {
        var s = U.timeToMin(p.start), e = U.timeToMin(p.end);
        var live = s >= 0 && nowMin >= s && nowMin <= (e < 0 ? s + 45 : e);
        return U.el('div', {
          class: 'row-item',
          style: live ? { borderColor: 'var(--ok)', background: 'var(--ok-soft)' } : null
        }, [
          U.el('span', { class: 'ri-bar', style: { background: live ? 'var(--ok)' : 'var(--accent)' } }),
          U.el('div', { class: 'ri-main' }, [
            U.el('span', { class: 'ri-title', text: p.label + (live ? ' · 正在进行' : '') }),
            U.el('span', { class: 'ri-meta' }, [
              U.el('span', { class: 'mono', text: (p.start || '—') + (p.end ? '–' + p.end : '') }),
              U.el('span', { text: '第 ' + p.codes.join('/') + ' 节' })
            ])
          ])
        ]);
      })),
      U.el('p', { class: 'hint', style: { marginTop: '14px' },
        text: '这些时间来自课表里的节次行，也可以在「修改 → 学期与节次」里自己改。' })
    ]);
  }

  /* ======================================================================
     导出
     ====================================================================== */
  CW.exporters = {
    init: init,
    renderDataStats: renderDataStats,
    renderPeriodsModal: renderPeriodsModal,
    renderIcsPreview: renderIcsPreview,
    buildIcs: buildIcs,
    downloadIcs: downloadIcs,
    exportBackupFile: exportBackupFile,
    importBackupFile: importBackupFile
  };

  /* ----------------------------------------------------------------------
     自动快照列表（本机保留最近 3 版，每次保存前自动生成）
     ---------------------------------------------------------------------- */
  function relTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    if (min < 60 * 24) return Math.floor(min / 60) + ' 小时前';
    return Math.floor(min / 1440) + ' 天前';
  }

  function renderBackupList() {
    var box = U.$('#backupList');
    if (!box) return;
    var list = CW.store.backups ? CW.store.backups() : [];

    if (!list.length) {
      U.render(box, U.el('div', { class: 'tiny faint', text: '还没有自动快照。改动课表后，上一版会自动存在本机（最多 3 版，不上传）。' }));
      return;
    }

    var rows = list.map(function (item, i) {
      return U.el('div', { class: 'row-item', style: { marginTop: '8px' } }, [
        U.el('span', { class: 'ri-bar' }),
        U.el('div', { class: 'ri-main' }, [
          U.el('span', { class: 'ri-title', text: (i === 0 ? '上一版' : '更早一版') + ' · ' + relTime(item.at) }),
          U.el('span', { class: 'ri-meta' }, [
            U.el('span', { text: (item.courses || 0) + ' 门课' }),
            U.el('span', { text: (item.events || 0) + ' 条事务' }),
            U.el('span', { text: (item.notes || 0) + ' 条备注' })
          ])
        ]),
        U.el('div', { class: 'ri-actions' }, [
          U.el('button', {
            class: 'btn btn-sm btn-ghost', type: 'button', text: '恢复',
            onclick: function () {
              var doIt = function () {
                var item2 = CW.store.restoreBackup(i);
                if (!item2) { U.toast('这一版读不出来了。', 'warn'); return; }
                renderBackupList();
                U.toast('已恢复到这一版（' + (item2.courses || 0) + ' 门课）', 'ok', { timeout: 3200 });
              };
              var msg = '用这一版覆盖当前课表？\n\n' + relTime(item.at) + ' 的版本：' + (item.courses || 0) + ' 门课、' + (item.events || 0) + ' 条事务。\n（当前这版会先被存成新的快照，还能退回）';
              if (CW.dialog && CW.dialog.confirm) {
                CW.dialog.confirm(msg, { okText: '恢复' }).then(function (yes) { if (yes) doIt(); });
              } else if (window.confirm(msg)) doIt();
            }
          })
        ])
      ]);
    });

    U.render(box, [
      U.el('p', { class: 'field-label', style: { marginBottom: '2px' }, text: '自动快照（本机）' }),
      U.el('p', { class: 'hint', text: '每次保存课表前，上一版会自动存在这台设备上，最多 3 版，不上传。改坏了可以退回。' }),
      U.el('div', {}, rows)
    ]);
  }

  function initBackups() {
    renderBackupList();
    if (CW.store && CW.store.on) CW.store.on('schedule', function () { renderBackupList(); });
  }

})();
