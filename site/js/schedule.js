/* ==========================================================================
   schedule.js — 日程计算 + 各种视图渲染
     · 第几周 / 某天有哪些课 / 下一节课
     · 左栏：今天 + 迷你月历 + 未来几天 + 统计
     · 弹窗：完整月历（可翻很多个月）、周课表、清单
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  /* ======================================================================
     1. 学期与周次
     ====================================================================== */
  function settings() { return CW.store.state.schedule.settings; }

  /** 第 1 周的周一 */
  function termStart() {
    var d = U.parseDate(settings().termStart);
    return U.mondayOf(d || U.today());
  }

  /** 某个日期属于第几周（可能 <=0 或超过总周数） */
  function weekOf(date) {
    var start = termStart();
    return Math.floor(U.diffDays(start, U.mondayOf(date)) / 7) + 1;
  }

  /** 第 week 周、星期 day(1-7) 的日期 */
  function dateOf(week, day) {
    return U.addDays(termStart(), (week - 1) * 7 + (day - 1));
  }

  function weekRange(week) {
    return { start: dateOf(week, 1), end: dateOf(week, 7) };
  }

  /** 该周是否在学期范围内 */
  function inTerm(week) {
    return week >= 1 && week <= settings().totalWeeks;
  }

  /* ======================================================================
     2. 课程 / 事务的出现规则
     ====================================================================== */
  function courseInWeek(course, week) {
    var w = course.weeks;
    // 没有周次信息 = 整学期都上（课表里没写进格子的那种附注课程）
    if (!w || !w.length) return inTerm(week);
    return w.indexOf(week) >= 0;
  }

  /** 某天的课程（已按开始时间排序） */
  function coursesOn(date) {
    var week = weekOf(date);
    var day = U.isoDow(date);
    var list = CW.store.state.schedule.courses.filter(function (c) {
      return c.day === day && courseInWeek(c, week);
    });
    return list.map(function (c) {
      var t = CW.store.courseTimes(c);
      return {
        kind: 'course',
        ref: c,
        id: c.id,
        name: c.name,
        teacher: c.teacher,
        room: c.room,
        codes: c.codes,
        start: t.start,
        end: t.end,
        color: U.colorFor(c),
        week: week,
        date: date
      };
    }).sort(byStart);
  }

  function byStart(a, b) {
    var sa = U.timeToMin(a.start), sb = U.timeToMin(b.start);
    if (sa < 0 && sb < 0) return 0;
    if (sa < 0) return 1;
    if (sb < 0) return -1;
    return sa - sb;
  }

  /** 事务是否发生在某天（含每日 / 每周 / 每月重复） */
  function eventOn(event, date) {
    var base = U.parseDate(event.date);
    if (!base) return false;
    var until = event.repeatUntil ? U.parseDate(event.repeatUntil) : null;
    if (until && U.diffDays(date, until) < 0) return false;
    var diff = U.diffDays(base, date);
    if (diff === 0) return true;
    if (diff < 0) return false;
    var r = event.repeat || 'none';
    if (r === 'daily') return true;
    if (r === 'weekly') return diff % 7 === 0;
    if (r === 'monthly') return date.getDate() === base.getDate();
    return false;
  }

  function eventsOn(date) {
    return CW.store.state.schedule.events.filter(function (e) {
      return eventOn(e, date);
    }).map(function (e) {
      return {
        kind: 'event',
        ref: e,
        id: e.id,
        name: e.title,
        title: e.title,
        location: e.location,
        room: e.location,
        note: e.note,
        start: e.allDay ? '' : e.start,
        end: e.allDay ? '' : e.end,
        allDay: !!e.allDay,
        color: U.colorFor(e),
        date: date
      };
    }).sort(byStart);
  }

  /** 某天的全部条目：课程 + 事务，按时间排序（全天事务排最前） */
  function itemsOn(date, opts) {
    opts = opts || {};
    var items = [];
    if (opts.courses !== false) items = items.concat(coursesOn(date));
    items = items.concat(eventsOn(date));
    return items.sort(function (a, b) {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return byStart(a, b);
    });
  }

  /** 某天的条目数量（画日历小圆点用，便宜版本） */
  function countOn(date) {
    return coursesOn(date).length + eventsOn(date).length;
  }

  /* ======================================================================
     3. 下一节课 / 正在上课
     ====================================================================== */
  /**
   * 返回：
   *   { status: 'live' | 'next' | 'none', ... }
   * live 时带 msLeft / progress；next 时带 msUntil。
   */
  function nextClass(now) {
    now = now || new Date();
    var today = U.startOfDay(now);
    var nowMin = now.getHours() * 60 + now.getMinutes();

    for (var offset = 0; offset <= 21; offset++) {
      var date = U.addDays(today, offset);
      var list = coursesOn(date);

      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var s = U.timeToMin(it.start);
        var e = U.timeToMin(it.end);
        if (s < 0) continue;
        if (e < 0) e = s + 45;

        if (offset === 0) {
          if (nowMin >= s && nowMin <= e) {
            return {
              status: 'live', item: it, date: date,
              startMin: s, endMin: e,
              msLeft: (e - nowMin) * 60000,
              progress: U.clamp((nowMin - s) / Math.max(1, e - s), 0, 1)
            };
          }
          if (nowMin < s) {
            return {
              status: 'next', item: it, date: date,
              startMin: s, endMin: e,
              msUntil: (s - nowMin) * 60000
            };
          }
          // 今天这节已经过了，继续找下一节
          continue;
        }

        return {
          status: 'next', item: it, date: date,
          startMin: s, endMin: e,
          msUntil: U.diffDays(now, date) * 86400000 - (now.getHours() * 3600000 + now.getMinutes() * 60000) + s * 60000
        };
      }
    }
    return { status: 'none' };
  }

  /** 未来 n 天的日程（按天分组，跳过没有内容的天） */
  function agenda(from, days) {
    from = from || U.today();
    days = days || 7;
    var out = [];
    for (var i = 0; i < days; i++) {
      var d = U.addDays(from, i);
      var items = itemsOn(d);
      if (!items.length) continue;
      out.push({ date: d, items: items });
    }
    return out;
  }

  /* ======================================================================
     4. 月历矩阵
     ====================================================================== */
  /** 返回 6×7 的日期矩阵（总是整周对齐，前后补相邻月份的日子） */
  function monthMatrix(cursor) {
    var first = U.startOfMonth(cursor);
    var gridStart = U.mondayOf(first);
    var weeks = [];
    var total = 42;
    for (var w = 0; w < total / 7; w++) {
      var row = [];
      for (var d = 0; d < 7; d++) row.push(U.addDays(gridStart, w * 7 + d));
      weeks.push(row);
    }
    // 最后一行整行都在下个月 -> 去掉，避免 6 行里有一行全是下个月
    var lastRow = weeks[weeks.length - 1];
    if (lastRow[0].getMonth() !== cursor.getMonth() && lastRow[6].getMonth() !== cursor.getMonth()) {
      weeks.pop();
    }
    return weeks;
  }

  /* ======================================================================
     5. 视图状态
     ====================================================================== */
  var view = {
    calCursor: U.startOfMonth(U.today()),
    selDate: U.today(),
    weekCursor: null,          // null = 跟随今天
    tab: 'month'
  };

  function currentWeek() { return weekOf(U.today()); }

  function ensureWeekCursor() {
    if (view.weekCursor === null) view.weekCursor = currentWeek();
    return view.weekCursor;
  }

  /* ======================================================================
     6. 渲染：左侧「今天 / 下一节课」
     ====================================================================== */
  function renderNow() {
    var box = U.$('#schedNow');
    if (!box) return;

    var live = nextClass();

    if (live.status === 'none') {
      U.render(box, U.el('div', { class: 'empty', style: { padding: '16px 12px' } }, [
        U.icon('i-sparkles', 'ico'),
        U.el('strong', { text: '最近没有课程' }),
        U.el('span', { class: 'tiny', text: '导入课表后这里会显示下一节课。' })
      ]));
      return;
    }

    var it = live.item;
    var isLive = live.status === 'live';
    var dateLabel = U.relativeDay(live.date) + (live.start ? ' ' + live.start : '');

    var children = [
      U.el('div', { class: 'sn-label' }, [
        isLive ? U.el('span', { class: 'sn-live-dot' }) : U.icon('i-clock', 'ico'),
        isLive ? '正在上课' : (U.diffDays(U.today(), live.date) === 0 ? '下一节课' : '下一节课 · ' + U.relativeDay(live.date))
      ]),
      U.el('div', { class: 'sn-title', text: it.name }),
      U.el('div', { class: 'sn-meta' }, [
        U.el('span', {}, [U.icon('i-clock', 'ico'), it.start ? it.start + (it.end ? '–' + it.end : '') : '时间待定']),
        it.room ? U.el('span', {}, [U.icon('i-pin', 'ico'), it.room]) : null,
        it.teacher ? U.el('span', {}, [U.icon('i-user', 'ico'), it.teacher]) : null
      ])
    ];

    if (isLive) {
      children.push(U.el('div', { class: 'bar' }, [
        U.el('span', { style: { width: Math.round(live.progress * 100) + '%' } })
      ]));
      children.push(U.el('div', { class: 'sn-count', text: '还有 ' + U.humanDuration(live.msLeft) + ' 下课' }));
    } else {
      children.push(U.el('div', { class: 'sn-count', text: dateLabel + ' · ' + U.humanDuration(live.msUntil) + '后开始' }));
    }

    U.render(box, U.el('div', { class: 'sched-now' + (isLive ? ' is-live' : '') }, children));
  }

  /* ======================================================================
     7. 渲染：迷你月历（左栏）
     ====================================================================== */
  function renderMiniCal() {
    var box = U.$('#schedMiniCal');
    if (!box) return;

    var cursor = U.startOfMonth(U.today());
    var weeks = monthMatrix(cursor);
    // 左栏这张迷你日历固定按 6 行排：否则 5 行和 6 行的月份会让整个「日程表」卡片
    // 高度忽高忽低（外框就不稳了）。多出来的那行是该月的下一周，属于「本月之外」，显示为灰。
    // 注意：月历弹窗（calFull）仍按原规则走，5 行就是 5 行，不浪费空间。
    while (weeks.length < 6) {
      weeks.push(weeks[weeks.length - 1].map(function (d) { return U.addDays(d, 7); }));
    }
    var today = U.today();

    var grid = U.el('div', { class: 'cal-grid' });
    weeks.forEach(function (row) {
      row.forEach(function (d) {
        var out = d.getMonth() !== cursor.getMonth();
        var cls = 'cal-day';
        if (out) cls += ' is-out';
        if (U.isSameDay(d, today)) cls += ' is-today';
        if (U.isoDow(d) >= 6) cls += ' is-weekend';

        var items = out ? [] : itemsOn(d);
        var dots = U.el('span', { class: 'cal-dots' });
        items.slice(0, 3).forEach(function (it) {
          dots.appendChild(U.el('i', { 'data-color': String(it.color) }));
        });

        grid.appendChild(U.el('button', {
          type: 'button', class: cls, title: items.length ? items.length + ' 项日程' : '',
          onclick: function () { openFull(d); }
        }, [U.el('span', { text: String(d.getDate()) }), dots]));
      });
    });

    U.render(box, U.el('div', { class: 'cal' }, [
      U.el('div', { class: 'cal-week' }, ['一', '二', '三', '四', '五', '六', '日'].map(function (w, i) {
        return U.el('span', { class: i >= 5 ? 'is-weekend' : '', text: w });
      })),
      grid
    ]));
  }

  /* ======================================================================
     8. 渲染：未来几天（左栏）
     ====================================================================== */
  function renderUpcoming() {
    var box = U.$('#schedUpcoming');
    if (!box) return;

    var stats = CW.store.stats();
    if (!stats.hasData) {
      U.render(box, U.el('div', { class: 'empty' }, [
        U.icon('i-calendar-plus', 'ico'),
        U.el('strong', { text: '还没有课表和事务' }),
        U.el('span', { text: '点上面的「导入」，上传教务系统导出的课表文件，或直接粘贴。' }),
        U.el('button', {
          class: 'btn btn-sm btn-primary', type: 'button', text: '去导入',
          style: { marginTop: '4px' },
          onclick: function () { CW.app.openModal('import'); }
        })
      ]));
      return;
    }

    var groups = agenda(U.today(), 7);
    if (!groups.length) {
      U.render(box, U.el('div', { class: 'empty', style: { padding: '16px 12px' } }, [
        U.icon('i-check-circle', 'ico'),
        U.el('strong', { text: '未来 7 天没有安排' })
      ]));
      return;
    }

    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();

    var list = U.el('div', { class: 'sched-list' });
    groups.forEach(function (g) {
      var head = U.el('div', { class: 'sl-day' }, [
        U.el('span', { text: U.relativeDay(g.date) }),
        U.el('i', { class: 'line' }),
        U.el('span', { text: (g.date.getMonth() + 1) + '/' + g.date.getDate() })
      ]);
      list.appendChild(head);

      g.items.slice(0, 6).forEach(function (it) {
        var done = U.isSameDay(g.date, U.today()) && !it.allDay &&
          U.timeToMin(it.end) >= 0 && nowMin > U.timeToMin(it.end);

        list.appendChild(U.el('button', {
          type: 'button',
          class: 'sched-item' + (done ? ' is-done' : ''),
          'data-color': String(it.color),
          title: it.name,
          onclick: function () { openFull(g.date); }
        }, [
          U.el('span', { class: 'si-bar' }),
          U.el('span', { class: 'si-body' }, [
            U.el('span', { class: 'si-title truncate', text: it.name }),
            U.el('span', { class: 'si-meta' }, [
              it.room ? U.el('span', { text: it.room }) : null,
              it.teacher ? U.el('span', { text: it.teacher }) : null,
              it.kind === 'event' ? U.el('span', { text: '事务' }) : null
            ])
          ]),
          U.el('span', { class: 'si-time', text: it.allDay ? '全天' : (it.start || '') })
        ]));
      });

      if (g.items.length > 6) {
        list.appendChild(U.el('button', {
          type: 'button', class: 'sched-item', onclick: function () { openFull(g.date); }
        }, [U.el('span', { class: 'si-bar', style: { background: 'var(--line-strong)' } }),
            U.el('span', { class: 'si-body' }, [
              U.el('span', { class: 'si-meta', text: '还有 ' + (g.items.length - 6) + ' 项…' })
            ])]));
      }
    });

    U.render(box, list);
  }

  /* ======================================================================
     9. 渲染：统计
     ====================================================================== */
  function renderStats() {
    var box = U.$('#schedStats');
    if (!box) return;

    var st = CW.store.stats();
    var wk = weekOf(U.today());
    var settingsNow = settings();

    var perWeekToday = coursesOn(U.today()).length;

    U.render(box, [
      stat(String(st.courseNames), '门课程'),
      stat(String(st.perWeek), '周均节次'),
      stat(String(perWeekToday), '今日课程'),
      stat(inTerm(wk) ? '第 ' + wk + ' 周' : '假期', inTerm(wk) ? '共 ' + settingsNow.totalWeeks + ' 周' : '不在学期内')
    ]);

    function stat(big, small) {
      return U.el('div', { class: 'st' }, [
        U.el('b', { text: big }),
        U.el('span', { text: small })
      ]);
    }
  }

  /* ======================================================================
     10. 渲染：完整月历（弹窗）
     ====================================================================== */
  var WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

  function renderFullCal() {
    var box = U.$('#calFull');
    if (!box) return;

    var cursor = view.calCursor;
    var showCourses = CW.store.state.ui.calShowCourses !== false;

    var mLabel = U.$('#calLabel');
    if (mLabel) mLabel.textContent = cursor.getFullYear() + ' 年 ' + (cursor.getMonth() + 1) + ' 月';

    var badge = U.$('#calTermBadge');
    if (badge) {
      var w = weekOf(cursor);
      if (inTerm(w)) {
        badge.hidden = false;
        badge.textContent = '第 ' + w + ' 周起';
      } else {
        badge.hidden = true;
      }
    }

    var weeks = monthMatrix(cursor);
    var today = U.today();
    var grid = U.el('div', { class: 'cal-grid' });

    weeks.forEach(function (row) {
      row.forEach(function (d) {
        var out = d.getMonth() !== cursor.getMonth();
        var cls = 'cal-day';
        if (out) cls += ' is-out';
        if (U.isSameDay(d, today)) cls += ' is-today';
        if (U.isSameDay(d, view.selDate)) cls += ' is-selected';

        var items = itemsOn(d, { courses: showCourses });
        var w = weekOf(d);

        var numRow = U.el('span', { class: 'cd-num' }, [
          U.el('span', { text: String(d.getDate()) }),
          inTerm(w) ? U.el('span', { class: 'cd-week', text: 'W' + w }) : null
        ]);

        // 注意：<button> 里只能放行内元素，所以这里用 span + display:grid
        var evBox = U.el('span', { class: 'cd-events' });
        // 手机版的格子小，少放两条，剩下的用「+N 项」表示
        var perDay = (CW.view && CW.view.isMobile && CW.view.isMobile()) ? 2 : 3;
        var shown = items.slice(0, perDay);
        shown.forEach(function (it) {
          evBox.appendChild(U.el('span', {
            class: 'cd-event' + (it.allDay ? '' : ' is-time'),
            'data-color': String(it.color),
            title: it.name + (it.room ? ' · ' + it.room : ''),
            text: (it.allDay ? '' : (it.start ? it.start + ' ' : '')) + it.name
          }));
        });
        if (items.length > shown.length) {
          evBox.appendChild(U.el('span', { class: 'cd-more', text: '+' + (items.length - shown.length) + ' 项' }));
        }

        grid.appendChild(U.el('button', {
          type: 'button', class: cls,
          onclick: function () {
            view.selDate = d;
            if (out) view.calCursor = U.startOfMonth(d);
            renderFullCal();
            renderDayDetail();
          },
          ondblclick: function () {
            view.selDate = d;
            CW.app.openModal('edit');
            CW.editUI.openEventForm(null, d);
          }
        }, [numRow, evBox]));
      });
    });

    U.render(box, U.el('div', { class: 'cal-full' }, [
      U.el('div', { class: 'cal-week' }, WEEKDAY_LABELS.map(function (t, i) {
        return U.el('span', { class: i >= 5 ? 'is-weekend' : '', text: t });
      })),
      grid
    ]));
  }

  /* ======================================================================
     11. 渲染：某天的详情
     ====================================================================== */
  function renderDayDetail() {
    var box = U.$('#calDayDetail');
    if (!box) return;

    var d = view.selDate || U.today();
    var showCourses = CW.store.state.ui.calShowCourses !== false;
    var items = itemsOn(d, { courses: showCourses });
    var w = weekOf(d);

    var head = U.el('div', { class: 'card-head' }, [
      U.el('h3', { class: 'card-title' }, [
        U.icon('i-calendar', 'ico'),
        U.fmtCN(d) + ' · ' + U.weekdayFull(d),
        inTerm(w) ? U.el('span', { class: 'badge', text: '第 ' + w + ' 周' }) : null
      ]),
      U.el('div', { class: 'head-actions' }, [
        U.el('button', {
          class: 'btn btn-sm btn-primary', type: 'button',
          onclick: function () { CW.editUI.openEventForm(null, d); }
        }, [U.icon('i-plus', 'ico'), '加事务'])
      ])
    ]);

    if (!items.length) {
      U.render(box, [head, U.el('div', { class: 'empty' }, [
        U.icon('i-check-circle', 'ico'),
        U.el('strong', { text: '这天没有安排' }),
        U.el('span', { text: '双击月历上的任意一天，也能直接新建事务。' })
      ])]);
      return;
    }

    var list = U.el('div', { class: 'row-list' });
    items.forEach(function (it) {
      var isCourse = it.kind === 'course';
      list.appendChild(U.el('div', {
        class: 'row-item', 'data-color': String(it.color)
      }, [
        U.el('span', { class: 'ri-bar' }),
        U.el('div', { class: 'ri-main' }, [
          U.el('span', { class: 'ri-title', text: it.name }),
          U.el('span', { class: 'ri-meta' }, [
            U.el('span', { class: 'mono', text: it.allDay ? '全天' : (it.start ? it.start + (it.end ? '–' + it.end : '') : '时间待定') }),
            it.room ? U.el('span', { text: it.room }) : null,
            it.teacher ? U.el('span', { text: it.teacher }) : null,
            isCourse && it.codes && it.codes.length ? U.el('span', { text: '第 ' + it.codes.join('/') + ' 节' }) : null,
            isCourse && it.ref.weeksText ? U.el('span', { text: it.ref.weeksText + ' 周' }) : null
          ])
        ]),
        U.el('div', { class: 'ri-actions' }, [
          U.el('button', {
            class: 'btn btn-sm btn-icon', type: 'button', title: '编辑',
            'aria-label': '编辑',
            onclick: function () {
              if (isCourse) CW.editUI.openCourseForm(it.ref);
              else CW.editUI.openEventForm(it.ref);
            }
          }, [U.icon('i-edit', 'ico')])
        ])
      ]));
    });

    U.render(box, [head, list]);
  }

  /* ======================================================================
     12. 渲染：周课表
     ====================================================================== */
  function renderTimetable() {
    var box = U.$('#timetableWrap');
    if (!box) return;

    var sch = CW.store.state.schedule;
    var periods = sch.periods;
    var week = ensureWeekCursor();
    var showWeekend = sch.settings.showWeekend !== false;
    var days = showWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
    var today = U.today();
    var todayDow = U.isoDow(today);

    var label = U.$('#wkLabel');
    if (label) {
      var r = weekRange(week);
      label.textContent = '第 ' + week + ' 周 · ' +
        (r.start.getMonth() + 1) + '/' + r.start.getDate() + ' – ' +
        (r.end.getMonth() + 1) + '/' + r.end.getDate() +
        (inTerm(week) ? '' : '（不在学期内）');
    }

    if (!sch.courses.length) {
      U.render(box, U.el('div', { class: 'empty', style: { padding: '40px 20px', border: '0' } }, [
        U.icon('i-book', 'ico'),
        U.el('strong', { text: '还没有课程' }),
        U.el('span', { text: '导入课表后，这里会显示整周的课表格子。' })
      ]));
      return;
    }

    var cols = days.length + 1;
    // 手机版把每列收窄、时间列也收窄；列数保持一致，靠横向滚动看全天
    var isMobile = !!(CW.view && CW.view.isMobile && CW.view.isMobile());
    var timeCol = isMobile ? 54 : 76;
    var dayCol = isMobile ? 94 : 112;
    var grid = U.el('div', {
      class: 'timetable',
      style: {
        'grid-template-columns': timeCol + 'px repeat(' + days.length + ', minmax(' + dayCol + 'px, 1fr))',
        'min-width': (timeCol + days.length * dayCol) + 'px'
      }
    });

    // 表头
    grid.appendChild(U.el('div', { class: 'tt-corner', style: { 'grid-row': '1', 'grid-column': '1' } }, [
      U.el('span', { class: 'tiny faint', text: '节次 / 星期' })
    ]));
    days.forEach(function (day, i) {
      var date = dateOf(week, day);
      grid.appendChild(U.el('div', {
        class: 'tt-head' + (U.isSameDay(date, today) ? ' is-today' : ''),
        style: { 'grid-row': '1', 'grid-column': String(i + 2) }
      }, [
        U.el('span', { text: '周' + WEEKDAY_LABELS[day - 1] }),
        U.el('small', { text: (date.getMonth() + 1) + '/' + date.getDate() })
      ]));
    });

    // 节次列 + 空白格子（画网格线）
    periods.forEach(function (p, pi) {
      var rowNo = pi + 2;
      grid.appendChild(U.el('div', {
        class: 'tt-time', style: { 'grid-row': String(rowNo), 'grid-column': '1' }
      }, [
        U.el('b', { text: p.label }),
        U.el('span', { text: (p.start || '') + (p.end ? '–' + p.end : '') })
      ]));
      days.forEach(function (day, di) {
        grid.appendChild(U.el('div', {
          class: 'tt-cell', style: { 'grid-row': String(rowNo), 'grid-column': String(di + 2) }
        }));
      });
    });

    // 课程卡片：按「首次出现的节次行」定位，并跨行合并
    var placed = {}, orphan = [];

    sch.courses.forEach(function (c) {
      if (days.indexOf(c.day) < 0) return;
      if (!courseInWeek(c, week)) return;

      var firstIdx = -1, lastIdx = -1;
      periods.forEach(function (p, pi) {
        var hit = p.codes.some(function (code) { return c.codes.indexOf(code) >= 0; });
        if (!hit) return;
        if (firstIdx < 0) firstIdx = pi;
        lastIdx = pi;
      });
      if (firstIdx < 0) { orphan.push(c); return; }

      var di = days.indexOf(c.day);
      var key = String(c.day) + '_' + String(firstIdx);
      var rowSpan = lastIdx - firstIdx + 1;
      var stack = placed[key] = placed[key] || 0;
      placed[key]++;

      var card = U.el('button', {
        type: 'button',
        class: 'tt-course',
        'data-color': String(U.colorFor(c)),
        title: c.name + (c.room ? '\n' + c.room : '') + (c.teacher ? '\n' + c.teacher : '') +
          (c.weeksText ? '\n第 ' + c.weeksText + ' 周' : ''),
        style: {
          'grid-row': String(firstIdx + 2) + ' / span ' + rowSpan,
          'grid-column': String(di + 2),
          'margin': '4px',
          'margin-top': (4 + stack * 2) + 'px',
          'z-index': String(2 + stack)
        },
        onclick: function () { CW.editUI.openCourseForm(c); }
      }, [
        U.el('b', { text: c.name }),
        c.room ? U.el('span', { class: 'tt-room', text: c.room }) : null,
        c.teacher ? U.el('span', { text: c.teacher }) : null,
        c.weeksText && c.weeksText !== '1-' + sch.settings.totalWeeks
          ? U.el('span', { text: c.weeksText + ' 周' })
          : null
      ]);

      grid.appendChild(card);
    });

    U.render(box, grid);

    // 节次对不上任何一行的课程，单独列出来提醒
    if (orphan.length) {
      box.appendChild(U.el('div', { class: 'notice notice-warn', style: { margin: '12px' } }, [
        U.icon('i-alert', 'ico'),
        U.el('div', {}, [
          U.el('strong', { text: '有 ' + orphan.length + ' 门课的节次对不上当前节次表：' }),
          U.el('span', { text: orphan.map(function (c) { return c.name; }).join('、') }),
          U.el('div', { class: 'tiny', style: { marginTop: '4px' }, text: '可以在「修改 → 学期与节次」里调整节次时间，或把这门课的节次改成已存在的。' })
        ])
      ]));
    }
  }

  /* ======================================================================
     13. 渲染：清单
     ====================================================================== */
  function renderLists() {
    var sch = CW.store.state.schedule;

    var coList = U.$('#listCourses');
    var coCount = U.$('#listCourseCount');
    if (coCount) coCount.textContent = String(sch.courses.length);
    if (coList) {
      if (!sch.courses.length) {
        U.render(coList, U.el('div', { class: 'empty' }, [
          U.icon('i-book', 'ico'),
          U.el('strong', { text: '还没有课程' })
        ]));
      } else {
        var sorted = sch.courses.slice().sort(function (a, b) {
          if (a.day !== b.day) return a.day - b.day;
          var sa = U.timeToMin(CW.store.courseTimes(a).start);
          var sb = U.timeToMin(CW.store.courseTimes(b).start);
          if (sa < 0 && sb < 0) return 0;
          if (sa < 0) return 1;
          if (sb < 0) return -1;
          return sa - sb;
        });
        U.render(coList, sorted.map(courseRow));
      }
    }

    var evList = U.$('#listEvents');
    var evCount = U.$('#listEventCount');
    if (evCount) evCount.textContent = String(sch.events.length);
    if (evList) {
      if (!sch.events.length) {
        U.render(evList, U.el('div', { class: 'empty' }, [
          U.icon('i-flag', 'ico'),
          U.el('strong', { text: '还没有事务' }),
          U.el('span', { text: '考试、截止日期、活动都可以加进来。' })
        ]));
      } else {
        U.render(evList, sch.events.map(eventRow));
      }
    }
  }

  function courseRow(c) {
    var t = CW.store.courseTimes(c);
    return U.el('div', { class: 'row-item', 'data-color': String(U.colorFor(c)) }, [
      U.el('span', { class: 'ri-bar' }),
      U.el('div', { class: 'ri-main' }, [
        U.el('span', { class: 'ri-title', text: c.name }),
        U.el('span', { class: 'ri-meta' }, [
          U.el('span', { text: c.day ? '周' + WEEKDAY_LABELS[c.day - 1] : '星期未定' }),
          c.codes && c.codes.length ? U.el('span', { text: '第 ' + c.codes.join('/') + ' 节' }) : null,
          t.start ? U.el('span', { class: 'mono', text: t.start + '–' + t.end }) : null,
          c.weeksText ? U.el('span', { text: c.weeksText + ' 周' }) : null,
          c.room ? U.el('span', { text: c.room }) : null,
          c.teacher ? U.el('span', { text: c.teacher }) : null
        ])
      ]),
      U.el('div', { class: 'ri-actions' }, [
        U.el('button', {
          class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': '编辑', title: '编辑',
          onclick: function () { CW.editUI.openCourseForm(c); }
        }, [U.icon('i-edit', 'ico')]),
        U.el('button', {
          class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': '删除', title: '删除',
          onclick: function () {
            CW.app.confirmThen('删除课程「' + U.truncate(c.name, 20) + '」？', function () {
              CW.store.removeCourse(c.id);
              CW.util.toast('已删除课程', 'ok');
            });
          }
        }, [U.icon('i-trash', 'ico')])
      ])
    ]);
  }

  function eventRow(e) {
    var d = U.parseDate(e.date);
    var rel = U.relativeDay(d);
    return U.el('div', { class: 'row-item', 'data-color': String(U.colorFor(e)) }, [
      U.el('span', { class: 'ri-bar' }),
      U.el('div', { class: 'ri-main' }, [
        U.el('span', { class: 'ri-title', text: e.title }),
        U.el('span', { class: 'ri-meta' }, [
          U.el('span', { text: U.fmtDate(d) + '（' + rel + '）' }),
          e.allDay ? U.el('span', { text: '全天' }) : U.el('span', { class: 'mono', text: (e.start || '') + (e.end ? '–' + e.end : '') }),
          e.location ? U.el('span', { text: e.location }) : null,
          e.repeat && e.repeat !== 'none' ? U.el('span', { class: 'badge badge-plain', text: { daily: '每天', weekly: '每周', monthly: '每月' }[e.repeat] }) : null
        ])
      ]),
      U.el('div', { class: 'ri-actions' }, [
        U.el('button', {
          class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': '编辑', title: '编辑',
          onclick: function () { CW.editUI.openEventForm(e); }
        }, [U.icon('i-edit', 'ico')]),
        U.el('button', {
          class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': '删除', title: '删除',
          onclick: function () {
            CW.app.confirmThen('删除事务「' + U.truncate(e.title, 20) + '」？', function () {
              CW.store.removeEvent(e.id);
              CW.util.toast('已删除事务', 'ok');
            });
          }
        }, [U.icon('i-trash', 'ico')])
      ])
    ]);
  }

  /* ======================================================================
     14. 页脚统计 & 弹窗副标题
     ====================================================================== */
  function renderFoot() {
    var st = CW.store.stats();
    var sch = CW.store.state.schedule;
    var foot = U.$('#schedFootStats');
    if (foot) {
      foot.textContent = sch.courses.length
        ? st.courseNames + ' 门课程 · ' + st.courses + ' 条排课 · ' + st.events + ' 条事务 · 周均 ' + st.perWeek + ' 节'
        : '还没有数据，点右上角「导入」开始。';
    }

    var sub = U.$('#schedSub');
    if (sub) {
      var meta = sch.meta || {};
      var bits = [];
      if (meta.school) bits.push(meta.school);
      if (meta.term) bits.push(meta.term + ' 学期');
      if (meta.className) bits.push(meta.className);
      bits.push('学期从 ' + sch.settings.termStart + ' 起，共 ' + sch.settings.totalWeeks + ' 周');
      sub.textContent = bits.join(' · ');
    }

    var title = U.$('#schedTitle');
    if (title) {
      title.textContent = sch.settings.studentName ? sch.settings.studentName + ' 的日程表' : '日程表';
    }
  }

  /* ======================================================================
     15. 打开完整日程（指定日期 / 月份）
     ====================================================================== */
  function openFull(date) {
    if (date) {
      view.selDate = date;
      view.calCursor = U.startOfMonth(date);
      if (U.diffDays(termStart(), date) >= 0) view.weekCursor = weekOf(date);
    }
    CW.app.openModal('schedule');
    setTab(view.tab || 'month');
    refresh();
  }

  function setTab(tab) {
    view.tab = tab;
    U.$$('#modal-schedule .tabs button').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab ? 'true' : 'false');
    });
    U.$$('#modal-schedule .tab-panel').forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== tab;
    });
    CW.store.setUI({ schedTab: tab });
    if (tab === 'week') renderTimetable();
    if (tab === 'list') renderLists();
    if (tab === 'public' && CW.publicUI) {
      // 每次打开这个标签页都跟服务器确认一次（内部有 60 秒节流，清单为空时一定去问），
      // 否则别的设备刚发布的公共事务在这台设备上要等很久才看得到
      if (CW.publicUI.refresh) CW.publicUI.refresh();
      CW.publicUI.render();
    }
    if (tab === 'month') { renderFullCal(); renderDayDetail(); }
  }

  /* ======================================================================
     16. 统一的刷新入口
     ====================================================================== */
  function refresh() {
    // 有没有任何课表/事务：没有的话让左栏卡片自然短一点（不然会留一大片空白），
    // 一旦有内容，CSS 里给「下一节课 / 未来几天」留的固定高度就会生效，外框不再跳。
    var card = U.$('#schedCard');
    if (card) card.classList.toggle('is-empty', !CW.store.stats().hasData);

    renderNow();
    renderMiniCal();
    renderUpcoming();
    renderStats();
    renderFoot();

    var modalOpen = U.$('#modal-schedule');
    if (modalOpen && modalOpen.classList.contains('open')) {
      if (view.tab === 'week') renderTimetable();
      else if (view.tab === 'list') renderLists();
      else if (view.tab === 'public') { if (CW.publicUI) CW.publicUI.render(); }
      else { renderFullCal(); renderDayDetail(); }
    }
  }

  /* ======================================================================
     17. 交互绑定（翻月 / 翻周 / 标签页）
     ====================================================================== */
  function bind() {
    var calPrev = U.$('#calPrev'), calNext = U.$('#calNext'), calToday = U.$('#calToday');
    if (calPrev) calPrev.addEventListener('click', function () {
      view.calCursor = U.addMonths(view.calCursor, -1); renderFullCal(); renderDayDetail();
    });
    if (calNext) calNext.addEventListener('click', function () {
      view.calCursor = U.addMonths(view.calCursor, 1); renderFullCal(); renderDayDetail();
    });
    if (calToday) calToday.addEventListener('click', function () {
      view.calCursor = U.startOfMonth(U.today());
      view.selDate = U.today();
      view.weekCursor = currentWeek();
      renderFullCal(); renderDayDetail();
    });

    var wkPrev = U.$('#wkPrev'), wkNext = U.$('#wkNext'), wkThis = U.$('#wkThis');
    if (wkPrev) wkPrev.addEventListener('click', function () {
      view.weekCursor = ensureWeekCursor() - 1; renderTimetable();
    });
    if (wkNext) wkNext.addEventListener('click', function () {
      view.weekCursor = ensureWeekCursor() + 1; renderTimetable();
    });
    if (wkThis) wkThis.addEventListener('click', function () {
      view.weekCursor = currentWeek(); renderTimetable();
    });

    var printBtn = U.$('#wkPrint');
    if (printBtn) printBtn.addEventListener('click', printTimetable);

    var showCourses = U.$('#calShowCourses');
    if (showCourses) {
      showCourses.checked = CW.store.state.ui.calShowCourses !== false;
      showCourses.addEventListener('change', function () {
        CW.store.setUI({ calShowCourses: showCourses.checked });
        renderFullCal(); renderDayDetail(); renderMiniCal();
      });
    }

    U.$$('#modal-schedule .tabs button').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
    });

    U.$$('#listAddCourse').forEach(function (b) {
      b.addEventListener('click', function () { CW.editUI.openCourseForm(null); });
    });
    U.$$('#listAddEvent').forEach(function (b) {
      b.addEventListener('click', function () { CW.editUI.openEventForm(null); });
    });
  }

  /** 只打印课表：给 body 加个类，配合 base.css 里的 @media print */
  function printTimetable() {
    document.body.classList.add('printing');
    var cleanup = function () {
      document.body.classList.remove('printing');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(function () {
      window.print();
      setTimeout(cleanup, 1200);
    }, 60);
  }

  /* ======================================================================
     导出
     ====================================================================== */
  CW.schedule = {
    weekOf: weekOf, termStart: termStart, dateOf: dateOf, weekRange: weekRange, inTerm: inTerm,
    courseInWeek: courseInWeek, coursesOn: coursesOn, eventsOn: eventsOn, itemsOn: itemsOn,
    eventOn: eventOn, countOn: countOn,
    nextClass: nextClass, agenda: agenda, monthMatrix: monthMatrix, currentWeek: currentWeek,
    view: view, setTab: setTab, openFull: openFull, refresh: refresh, bind: bind,
    renderMiniCal: renderMiniCal, renderFullCal: renderFullCal, renderTimetable: renderTimetable,
    renderDayDetail: renderDayDetail, renderLists: renderLists,
    WEEKDAY_LABELS: WEEKDAY_LABELS
  };
})();
