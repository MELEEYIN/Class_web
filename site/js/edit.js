/* ==========================================================================
   edit.js — 修改：事务 / 课程 / 学期与节次
     共用 #modal-item 作为「单条编辑」表单，按类型切换字段。
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  var el = {};
  var current = null;          // { type: 'course' | 'event', id: string|null }
  var snapshot = null;         // 「撤销本次全部改动」用的快照

  /* ======================================================================
     1. 初始化
     ====================================================================== */
  function init() {
    el = {
      modal: U.$('#modal-edit'),
      itemModal: U.$('#modal-item'),
      itemTitle: U.$('#itemTitle'),
      itemSub: U.$('#itemSub'),
      itemBody: U.$('#itemBody'),
      itemSave: U.$('#itemSave'),
      itemDelete: U.$('#itemDelete'),

      evList: U.$('#evList'),
      evEmpty: U.$('#evEmpty'),
      coList: U.$('#coList'),
      coEmpty: U.$('#coEmpty'),

      setName: U.$('#setName'),
      setTerm: U.$('#setTerm'),
      setTermStart: U.$('#setTermStart'),
      setTotalWeeks: U.$('#setTotalWeeks'),
      setWeekNow: U.$('#setWeekNow'),
      applyWeekNow: U.$('#applyWeekNow'),
      termStartHint: U.$('#termStartHint'),
      periodEditor: U.$('#periodEditor'),
      periodReset: U.$('#periodReset'),
      editSaved: U.$('#editSaved')
    };

    bindTabs();
    bindButtons();
    bindTermForm();
    bindItemForm();

    CW.store.on('schedule', function () { renderAll(); });
  }

  function bindTabs() {
    U.$$('#modal-edit .tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-etab');
        U.$$('#modal-edit .tabs button').forEach(function (x) {
          x.setAttribute('aria-selected', x === b ? 'true' : 'false');
        });
        U.$$('#modal-edit .tab-panel').forEach(function (p) {
          p.hidden = p.getAttribute('data-epanel') !== key;
        });
        if (key === 'term') renderTerm();
      });
    });
  }

  function bindButtons() {
    var evAdd = U.$('#evAdd');
    if (evAdd) evAdd.addEventListener('click', function () { openEventForm(null); });

    var coAdd = U.$('#coAdd');
    if (coAdd) coAdd.addEventListener('click', function () { openCourseForm(null); });

    var undo = U.$('#editUndoAll');
    if (undo) {
      undo.addEventListener('click', function () {
        if (!snapshot) { U.toast('没有可撤销的改动。', 'info'); return; }
        CW.app.confirmThen('把课程、事务和学期设置恢复到打开这个窗口时的状态？', function () {
          CW.store.state.schedule = CW.store.sanitizeSchedule(snapshot);
          CW.store.saveNow();
          CW.store.emit('schedule', { reason: 'undo' });
          U.toast('已撤销本次改动', 'ok');
        }, '撤销', 'btn-danger');
      });
    }
  }

  /* ======================================================================
     2. 打开修改弹窗时记录快照
     ====================================================================== */
  function beginSession() {
    snapshot = JSON.parse(JSON.stringify(CW.store.state.schedule));
    renderAll();
    setTab('events');
  }

  function setTab(key) {
    U.$$('#modal-edit .tabs button').forEach(function (x) {
      x.setAttribute('aria-selected', x.getAttribute('data-etab') === key ? 'true' : 'false');
    });
    U.$$('#modal-edit .tab-panel').forEach(function (p) {
      p.hidden = p.getAttribute('data-epanel') !== key;
    });
    if (key === 'term') renderTerm();
  }

  function renderAll() {
    renderEvents();
    renderCourses();
    if (el.modal && el.modal.classList.contains('open')) renderTerm();
  }

  /* ======================================================================
     3. 事务列表
     ====================================================================== */
  function renderEvents() {
    if (!el.evList) return;
    var items = CW.store.state.schedule.events;

    if (!items.length) {
      U.render(el.evList, '');
      if (el.evEmpty) el.evEmpty.hidden = false;
      return;
    }
    if (el.evEmpty) el.evEmpty.hidden = true;

    U.render(el.evList, items.map(function (e) {
      var d = U.parseDate(e.date);
      return U.el('div', { class: 'row-item', 'data-color': String(U.colorFor(e)) }, [
        U.el('span', { class: 'ri-bar' }),
        U.el('div', { class: 'ri-main' }, [
          U.el('span', { class: 'ri-title', text: e.title }),
          U.el('span', { class: 'ri-meta' }, [
            U.el('span', { text: e.date + '（' + U.relativeDay(d) + '）' }),
            e.allDay ? U.el('span', { text: '全天' }) : U.el('span', { class: 'mono', text: (e.start || '') + (e.end ? '–' + e.end : '') }),
            e.location ? U.el('span', { text: e.location }) : null,
            e.repeat && e.repeat !== 'none' ? U.el('span', { class: 'badge badge-plain', text: repeatLabel(e.repeat) }) : null
          ])
        ]),
        U.el('div', { class: 'ri-actions' }, [
          U.el('button', {
            class: 'btn btn-sm btn-icon', type: 'button', title: '编辑', 'aria-label': '编辑',
            onclick: function () { openEventForm(e); }
          }, [U.icon('i-edit', 'ico')]),
          U.el('button', {
            class: 'btn btn-sm btn-icon', type: 'button', title: '删除', 'aria-label': '删除',
            onclick: function () { removeEvent(e); }
          }, [U.icon('i-trash', 'ico')])
        ])
      ]);
    }));
  }

  function removeEvent(e) {
    CW.app.confirmThen('删除事务「' + U.truncate(e.title, 20) + '」？', function () {
      CW.store.removeEvent(e.id);
      U.toast('已删除', 'ok', { timeout: 1600 });
    });
  }

  function repeatLabel(r) {
    return { none: '不重复', daily: '每天', weekly: '每周', monthly: '每月' }[r] || r;
  }

  /* ======================================================================
     4. 课程列表
     ====================================================================== */
  function renderCourses() {
    if (!el.coList) return;
    var items = CW.store.state.schedule.courses;

    if (!items.length) {
      U.render(el.coList, '');
      if (el.coEmpty) el.coEmpty.hidden = false;
      return;
    }
    if (el.coEmpty) el.coEmpty.hidden = true;

    var sorted = items.slice().sort(function (a, b) {
      if (a.day !== b.day) return (a.day || 8) - (b.day || 8);
      return (a.codes[0] || 99) - (b.codes[0] || 99);
    });

    U.render(el.coList, sorted.map(function (c) {
      var t = CW.store.courseTimes(c);
      return U.el('div', { class: 'row-item', 'data-color': String(U.colorFor(c)) }, [
        U.el('span', { class: 'ri-bar' }),
        U.el('div', { class: 'ri-main' }, [
          U.el('span', { class: 'ri-title', text: c.name }),
          U.el('span', { class: 'ri-meta' }, [
            U.el('span', { text: c.day ? '周' + CW.schedule.WEEKDAY_LABELS[c.day - 1] : '星期未定' }),
            c.codes && c.codes.length ? U.el('span', { text: '第 ' + c.codes.join('/') + ' 节' }) : null,
            t.start ? U.el('span', { class: 'mono', text: t.start + '–' + t.end }) : null,
            U.el('span', { text: (c.weeksText || '全学期') + ' 周' }),
            c.room ? U.el('span', { text: c.room }) : null,
            c.teacher ? U.el('span', { text: c.teacher }) : null
          ])
        ]),
        U.el('div', { class: 'ri-actions' }, [
          U.el('button', {
            class: 'btn btn-sm btn-icon', type: 'button', title: '编辑', 'aria-label': '编辑',
            onclick: function () { openCourseForm(c); }
          }, [U.icon('i-edit', 'ico')]),
          U.el('button', {
            class: 'btn btn-sm btn-icon', type: 'button', title: '复制一份', 'aria-label': '复制',
            onclick: function () {
              var copy = JSON.parse(JSON.stringify(c));
              delete copy.id;
              copy.name = c.name;
              CW.store.addCourse(copy);
              U.toast('已复制一条「' + U.truncate(c.name, 16) + '」，可以改成别的时段。', 'ok');
            }
          }, [U.icon('i-grid', 'ico')]),
          U.el('button', {
            class: 'btn btn-sm btn-icon', type: 'button', title: '删除', 'aria-label': '删除',
            onclick: function () {
              CW.app.confirmThen('删除课程「' + U.truncate(c.name, 20) + '」？', function () {
                CW.store.removeCourse(c.id);
                U.toast('已删除', 'ok', { timeout: 1600 });
              });
            }
          }, [U.icon('i-trash', 'ico')])
        ])
      ]);
    }));
  }

  /* ======================================================================
     5. 学期与节次
     ====================================================================== */
  function bindTermForm() {
    function push() {
      var patch = {};
      if (el.setName) patch.studentName = el.setName.value.trim();
      if (el.setTerm) patch.termLabel = el.setTerm.value.trim();
      if (el.setTermStart && U.parseDate(el.setTermStart.value)) {
        patch.termStart = U.fmtDate(U.mondayOf(U.parseDate(el.setTermStart.value)));
      }
      if (el.setTotalWeeks) patch.totalWeeks = U.clamp(Number(el.setTotalWeeks.value) || 18, 1, 30);
      CW.store.setSettings(patch);

      // 学期名称不是 settings 的字段，单独放进 meta
      if (patch.termLabel !== undefined) {
        CW.store.state.schedule.meta.term = patch.termLabel;
        CW.store.save('schedule');
      }
      syncTermHint();
    }

    [el.setName, el.setTerm, el.setTotalWeeks].forEach(function (n) {
      if (n) n.addEventListener('change', push);
    });
    if (el.setTermStart) el.setTermStart.addEventListener('change', push);

    if (el.applyWeekNow) {
      el.applyWeekNow.addEventListener('click', function () {
        var n = Number(el.setWeekNow && el.setWeekNow.value);
        if (!(n >= 1 && n <= 30)) { U.toast('请先填一个 1~30 之间的周次。', 'warn'); return; }
        var monday = U.mondayOf(U.addDays(U.today(), -(n - 1) * 7));
        CW.store.setSettings({ termStart: U.fmtDate(monday) });
        if (el.setTermStart) el.setTermStart.value = U.fmtDate(monday);
        syncTermHint();
        U.toast('已把第 1 周周一设为 ' + U.fmtDate(monday) + '（今天 = 第 ' + n + ' 周）', 'ok', { timeout: 4000 });
      });
    }

    if (el.periodReset) {
      el.periodReset.addEventListener('click', function () {
        CW.app.confirmThen('把节次时间恢复成教务系统的默认值？', function () {
          CW.store.setPeriods(CW.parse.defaultPeriods());
          renderPeriods();
          U.toast('节次已恢复默认', 'ok');
        });
      });
    }

    // 天数/时间一改就保存
    if (el.periodEditor) {
      el.periodEditor.addEventListener('change', U.debounce(collectPeriods, 320));
      el.periodEditor.addEventListener('input', U.debounce(collectPeriods, 550));
    }
  }

  function syncTermHint() {
    if (!el.termStartHint) return;
    var s = CW.store.state.schedule.settings;
    var wk = CW.schedule.weekOf(U.today());
    el.termStartHint.textContent = '当前：今天（' + U.fmtDate(U.today()) + '）是第 ' + wk +
      ' 周' + (CW.schedule.inTerm(wk) ? '' : '（不在学期范围内）') + '。';
  }

  function renderTerm() {
    var s = CW.store.state.schedule.settings;
    if (el.setName) el.setName.value = s.studentName || '';
    if (el.setTerm) el.setTerm.value = (CW.store.state.schedule.meta && CW.store.state.schedule.meta.term) || '';
    if (el.setTermStart) el.setTermStart.value = s.termStart;
    if (el.setTotalWeeks) el.setTotalWeeks.value = String(s.totalWeeks);
    if (el.setWeekNow && !el.setWeekNow.value) el.setWeekNow.value = String(Math.max(1, CW.schedule.weekOf(U.today())));
    syncTermHint();
    renderPeriods();
  }

  function renderPeriods() {
    if (!el.periodEditor) return;
    var periods = CW.store.state.schedule.periods;

    var rows = periods.map(function (p, i) {
      var label = U.el('input', { class: 'input', type: 'text', value: p.label, 'data-f': 'label', 'data-i': String(i), 'aria-label': '节次名称' });
      var codes = U.el('input', { class: 'input', type: 'text', value: p.codes.join(','), 'data-f': 'codes', 'data-i': String(i), 'aria-label': '节次编号', style: { maxWidth: '96px' } });
      var start = U.el('input', { class: 'input', type: 'time', value: p.start, 'data-f': 'start', 'data-i': String(i), 'aria-label': '开始时间', style: { maxWidth: '124px' } });
      var end = U.el('input', { class: 'input', type: 'time', value: p.end, 'data-f': 'end', 'data-i': String(i), 'aria-label': '结束时间', style: { maxWidth: '124px' } });

      return U.el('div', {
        class: 'row-item', style: { gap: '8px', flexWrap: 'wrap' }, 'data-i': String(i)
      }, [
        U.el('span', { class: 'ri-bar', style: { background: 'var(--accent)' } }),
        U.el('div', { style: { display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', flex: '1', minWidth: '260px' } }, [
          label, start, end, codes
        ]),
        U.el('button', {
          class: 'btn btn-sm btn-icon', type: 'button', title: '删除这一节', 'aria-label': '删除这一节',
          onclick: function () {
            var next = CW.store.state.schedule.periods.filter(function (x, xi) { return xi !== i; });
            CW.store.setPeriods(next);
            renderPeriods();
          }
        }, [U.icon('i-trash', 'ico')])
      ]);
    });

    rows.push(U.el('button', {
      class: 'btn btn-sm btn-ghost', type: 'button', style: { marginTop: '10px' },
      onclick: function () {
        var next = CW.store.state.schedule.periods.slice();
        var last = next[next.length - 1] || { codes: [1], start: '08:00', end: '08:45' };
        var newCodes = [(last.codes[last.codes.length - 1] || 0) + 1];
        next.push({ label: CW.parse.periodLabel(newCodes), codes: newCodes, start: '', end: '' });
        CW.store.setPeriods(next);
        renderPeriods();
      }
    }, [U.icon('i-plus', 'ico'), '加一节']));

    U.render(el.periodEditor, [
      U.el('p', { class: 'hint', style: { marginBottom: '10px' },
        text: '「节次编号」是课表里的小节号，可以写 1,2 或 1-2。课程的节次要和这里的编号对得上，才会显示在周课表里。' }),
      U.el('div', { class: 'row-list' }, rows)
    ]);
  }

  function collectPeriods() {
    if (!el.periodEditor) return;
    var inputs = U.$$('#periodEditor input[data-f]');
    var byIndex = {};
    inputs.forEach(function (inp) {
      var i = Number(inp.getAttribute('data-i'));
      var f = inp.getAttribute('data-f');
      byIndex[i] = byIndex[i] || {};
      byIndex[i][f] = inp.value;
    });

    var list = Object.keys(byIndex).sort(function (a, b) { return a - b; }).map(function (i) {
      var o = byIndex[i];
      var codes = CW.parse.expandCodes(o.codes || '');
      if (!codes.length) return null;
      return {
        label: (o.label || '').trim() || CW.parse.periodLabel(codes),
        codes: codes,
        start: CW.parse.normalizeTime(o.start) || '',
        end: CW.parse.normalizeTime(o.end) || ''
      };
    }).filter(Boolean);

    if (!list.length) return;
    var before = JSON.stringify(CW.store.state.schedule.periods);
    if (JSON.stringify(list) === before) return;
    CW.store.setPeriods(list);
    if (el.editSaved) {
      el.editSaved.textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
  }

  /* ======================================================================
     6. 单条编辑表单
     ====================================================================== */
  function bindItemForm() {
    if (el.itemSave) el.itemSave.addEventListener('click', saveItem);
    if (el.itemDelete) {
      el.itemDelete.addEventListener('click', function () {
        if (!current) return;
        if (current.type === 'course') {
          CW.app.confirmThen('删除这门课？', function () {
            CW.store.removeCourse(current.id);
            CW.app.closeModal('item');
          });
        } else {
          CW.app.confirmThen('删除这条事务？', function () {
            CW.store.removeEvent(current.id);
            CW.app.closeModal('item');
          });
        }
      });
    }
  }

  /* ---- 事务表单 ---- */
  function openEventForm(event, defaultDate) {
    current = { type: 'event', id: event ? event.id : null };
    var e = event || {
      title: '', date: U.fmtDate(defaultDate || U.today()),
      start: '', end: '', allDay: true, location: '', note: '', repeat: 'none', color: 0
    };

    if (el.itemTitle) el.itemTitle.textContent = event ? '编辑事务' : '新增事务';
    if (el.itemSub) el.itemSub.textContent = event ? '改完点保存' : '考试、截止日期、活动都可以放这里';
    if (el.itemDelete) el.itemDelete.hidden = !event;

    var title = U.el('input', { class: 'input', type: 'text', value: e.title || '', maxlength: '60', placeholder: '例如：高数期中考试' });
    var date = U.el('input', { class: 'input', type: 'date', value: e.date || U.fmtDate(U.today()) });
    var allDay = U.el('input', { type: 'checkbox' });
    allDay.checked = e.allDay !== false && !e.start;
    var start = U.el('input', { class: 'input', type: 'time', value: e.start || '' });
    var end = U.el('input', { class: 'input', type: 'time', value: e.end || '' });
    var loc = U.el('input', { class: 'input', type: 'text', value: e.location || '', maxlength: '60', placeholder: '例如：C-5-301' });
    var note = U.el('textarea', { class: 'textarea', style: { minHeight: '70px', fontFamily: 'var(--font)', fontSize: '13px' }, maxlength: '500' });
    note.value = e.note || '';
    var repeat = U.el('select', { class: 'select' });
    [['none', '不重复'], ['daily', '每天'], ['weekly', '每周'], ['monthly', '每月']].forEach(function (o) {
      var opt = U.el('option', { value: o[0], text: o[1] });
      if ((e.repeat || 'none') === o[0]) opt.selected = true;
      repeat.appendChild(opt);
    });
    var until = U.el('input', { class: 'input', type: 'date', value: e.repeatUntil || '' });
    var untilWrap = U.el('div', { class: 'field' }, [
      U.el('label', { class: 'field-label', text: '重复到（留空表示一直重复到学期末）' }), until
    ]);
    untilWrap.hidden = (e.repeat || 'none') === 'none';

    var timeWrap = U.el('div', { class: 'grid grid-2' }, [
      U.el('div', { class: 'field' }, [U.el('label', { class: 'field-label', text: '开始时间' }), start]),
      U.el('div', { class: 'field' }, [U.el('label', { class: 'field-label', text: '结束时间' }), end])
    ]);

    function syncAllDay() {
      var on = allDay.checked;
      timeWrap.hidden = on;
      if (on) { start.value = ''; end.value = ''; }
    }
    allDay.addEventListener('change', syncAllDay);
    syncAllDay();

    repeat.addEventListener('change', function () { untilWrap.hidden = repeat.value === 'none'; });

    U.render(el.itemBody, [
      U.el('div', { class: 'form-grid' }, [
        U.el('div', { class: 'field col-span-2' }, [
          U.el('label', { class: 'field-label', text: '标题' }), title
        ]),
        U.el('div', { class: 'field' }, [
          U.el('label', { class: 'field-label', text: '日期' }), date
        ]),
        U.el('div', { class: 'field' }, [
          U.el('span', { class: 'field-label', text: '时间' }),
          U.el('label', { class: 'check' }, [allDay, U.el('span', { text: '全天' })])
        ]),
        U.el('div', { class: 'col-span-2' }, timeWrap),
        U.el('div', { class: 'field col-span-2' }, [
          U.el('label', { class: 'field-label', text: '地点' }), loc
        ]),
        U.el('div', { class: 'field' }, [
          U.el('label', { class: 'field-label', text: '重复' }), repeat
        ]),
        untilWrap,
        U.el('div', { class: 'field col-span-2' }, [
          U.el('label', { class: 'field-label', text: '备注' }), note
        ])
      ]),
      U.el('div', { class: 'notice', style: { marginTop: '14px' } }, [
        U.icon('i-info', 'ico'),
        U.el('div', { class: 'tiny', text: '事务和课程都会出现在月历里。想批量导入（比如整学期考试安排），用「导入 → 复制粘贴」贴一段表格更快。' })
      ])
    ]);

    form = { title: title, date: date, allDay: allDay, start: start, end: end, loc: loc, note: note, repeat: repeat, until: until };
    CW.app.openModal('item');
    setTimeout(function () { title.focus(); }, 120);
  }

  /* ---- 课程表单 ---- */
  function openCourseForm(course) {
    current = { type: 'course', id: course ? course.id : null };
    var c = course || {
      name: '', teacher: '', room: '', day: U.isoDow(U.today()),
      codes: [], weeks: [], weeksText: '', color: 0
    };

    if (el.itemTitle) el.itemTitle.textContent = course ? '编辑课程' : '新增课程';
    if (el.itemSub) el.itemSub.textContent = course ? '改完点保存' : '实验课、临时课都可以手动加';
    if (el.itemDelete) el.itemDelete.hidden = !course;

    var name = U.el('input', { class: 'input', type: 'text', value: c.name || '', maxlength: '80', placeholder: '课程名称' });
    var teacher = U.el('input', { class: 'input', type: 'text', value: c.teacher || '', maxlength: '40', placeholder: '教师' });
    var room = U.el('input', { class: 'input', type: 'text', value: c.room || '', maxlength: '40', placeholder: '例如：C-5-102' });

    var day = U.el('select', { class: 'select' });
    [['', '未指定'], ['1', '星期一'], ['2', '星期二'], ['3', '星期三'], ['4', '星期四'],
      ['5', '星期五'], ['6', '星期六'], ['7', '星期日']].forEach(function (o) {
      var opt = U.el('option', { value: o[0], text: o[1] });
      if (String(c.day || '') === o[0]) opt.selected = true;
      day.appendChild(opt);
    });

    var codesInput = U.el('input', {
      class: 'input', type: 'text', value: (c.codes || []).join(','),
      placeholder: '例如：1,2 或 6-7', maxlength: '30'
    });
    var chipBox = U.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '7px' } });

    function renderChips() {
      var codes = CW.parse.expandCodes(codesInput.value);
      U.render(chipBox, CW.store.state.schedule.periods.map(function (p) {
        var on = p.codes.every(function (x) { return codes.indexOf(x) >= 0; });
        return U.el('button', {
          type: 'button',
          class: 'badge ' + (on ? '' : 'badge-plain'),
          style: { cursor: 'pointer', border: '1px solid ' + (on ? 'var(--accent-line)' : 'var(--line)') },
          'aria-pressed': on ? 'true' : 'false',
          title: (p.start || '') + (p.end ? '–' + p.end : ''),
          text: p.label,
          onclick: function () {
            var now = CW.parse.expandCodes(codesInput.value);
            var next;
            if (on) {
              next = now.filter(function (x) { return p.codes.indexOf(x) < 0; });
            } else {
              next = now.concat(p.codes);
            }
            codesInput.value = CW.parse.compressRanges(next);
            renderChips();
            updateSummary();
          }
        });
      }));
    }

    var weeksInput = U.el('input', {
      class: 'input', type: 'text', value: c.weeksText || '',
      placeholder: '例如：1-16 或 2-3,5-6,9-18，留空 = 全学期', maxlength: '60'
    });
    var weekQuick = U.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '7px' } }, [
      quickWeek('全学期', function () { weeksInput.value = ''; }),
      quickWeek('单周', function () { weeksInput.value = oddEven(1); }),
      quickWeek('双周', function () { weeksInput.value = oddEven(2); }),
      quickWeek('1-16', function () { weeksInput.value = '1-16'; }),
      quickWeek('1-18', function () { weeksInput.value = '1-18'; })
    ]);

    function quickWeek(label, run) {
      return U.el('button', {
        type: 'button', class: 'badge badge-plain',
        style: { cursor: 'pointer', border: '1px solid var(--line)' },
        text: label,
        onclick: function () { run(); updateSummary(); }
      });
    }

    function oddEven(parity) {
      var total = CW.store.state.schedule.settings.totalWeeks;
      var out = [];
      for (var i = parity; i <= total; i += 2) out.push(i);
      return CW.parse.compressRanges(out);
    }

    var summary = U.el('div', { class: 'notice', style: { marginTop: '14px' } });

    function updateSummary() {
      var codes = CW.parse.expandCodes(codesInput.value);
      var weeks = CW.parse.expandWeeks(weeksInput.value, CW.store.state.schedule.settings.totalWeeks);
      var t2 = CW.store.timesForCodes(codes);
      var times = t2.start ? t2.start + '–' + t2.end : '时间未知（节次对不上节次表）';
      U.render(summary, [
        U.icon('i-info', 'ico'),
        U.el('div', {}, [
          U.el('span', { text: '节次：' + (codes.length ? '第 ' + codes.join('/') + ' 节 · ' + times : '未指定') }),
          U.el('br'),
          U.el('span', { text: '周次：' + (weeks.length ? '第 ' + CW.parse.compressRanges(weeks) + ' 周（共 ' + weeks.length + ' 周）' : '全学期每周') })
        ])
      ]);
    }

    codesInput.addEventListener('input', function () { renderChips(); updateSummary(); });
    weeksInput.addEventListener('input', updateSummary);
    renderChips();
    updateSummary();

    U.render(el.itemBody, [
      U.el('div', { class: 'form-grid' }, [
        U.el('div', { class: 'field col-span-2' }, [
          U.el('label', { class: 'field-label', text: '课程名称' }), name
        ]),
        U.el('div', { class: 'field' }, [
          U.el('label', { class: 'field-label', text: '教师' }), teacher
        ]),
        U.el('div', { class: 'field' }, [
          U.el('label', { class: 'field-label', text: '教室' }), room
        ]),
        U.el('div', { class: 'field' }, [
          U.el('label', { class: 'field-label', text: '星期' }), day
        ]),
        U.el('div', { class: 'field' }, [
          U.el('label', { class: 'field-label', text: '节次' }), codesInput, chipBox
        ]),
        U.el('div', { class: 'field col-span-2' }, [
          U.el('label', { class: 'field-label', text: '上课周次' }), weeksInput, weekQuick
        ])
      ]),
      summary
    ]);

    form = { name: name, teacher: teacher, room: room, day: day, codes: codesInput, weeks: weeksInput };
    CW.app.openModal('item');
    setTimeout(function () { name.focus(); }, 120);
  }

  /* ---- 共享的 form 引用 ---- */
  var form = null;

  function saveItem() {
    if (!current || !form) return;

    if (current.type === 'event') {
      var title = form.title.value.trim();
      if (!title) { U.toast('请填写标题。', 'warn'); form.title.focus(); return; }
      var d = U.parseDate(form.date.value);
      if (!d) { U.toast('请选择日期。', 'warn'); form.date.focus(); return; }

      var allDay = form.allDay.checked;
      var data = {
        title: title,
        date: U.fmtDate(d),
        allDay: allDay,
        start: allDay ? '' : (CW.parse.normalizeTime(form.start.value) || ''),
        end: allDay ? '' : (CW.parse.normalizeTime(form.end.value) || ''),
        location: form.loc.value.trim(),
        note: form.note.value.trim(),
        repeat: form.repeat.value,
        repeatUntil: form.repeat.value === 'none' ? '' : (form.until.value || '')
      };

      if (current.id) CW.store.updateEvent(current.id, data);
      else CW.store.addEvent(data);

      CW.app.closeModal('item');
      U.toast(current.id ? '已保存' : '已新增事务', 'ok', { timeout: 1800 });
      return;
    }

    // 课程
    var cname = form.name.value.trim();
    if (!cname) { U.toast('请填写课程名称。', 'warn'); form.name.focus(); return; }

    var codes = CW.parse.expandCodes(form.codes.value);
    var weeks = CW.parse.expandWeeks(form.weeks.value, CW.store.state.schedule.settings.totalWeeks);

    var courseData = {
      name: cname,
      teacher: form.teacher.value.trim(),
      room: form.room.value.trim(),
      day: Number(form.day.value) || 0,
      codes: codes,
      weeks: weeks,
      weeksText: weeks.length ? CW.parse.compressRanges(weeks) : ''
    };

    if (!courseData.day) U.toast('没有指定星期，这门课不会出现在月历和周课表里。', 'warn', { timeout: 4000 });
    if (!codes.length) U.toast('没有指定节次，这门课不会显示在周课表里。', 'warn', { timeout: 4000 });

    if (current.id) CW.store.updateCourse(current.id, courseData);
    else {
      // 手工加的课保留一个显式颜色，避免和别的课撞色
      courseData.color = U.hashIndex(cname, 8);
      CW.store.addCourse(courseData);
    }

    CW.app.closeModal('item');
    U.toast(current.id ? '已保存' : '已新增课程', 'ok', { timeout: 1800 });
  }

  /* ======================================================================
     导出
     ====================================================================== */
  CW.editUI = {
    init: init,
    beginSession: beginSession,
    renderAll: renderAll,
    openEventForm: openEventForm,
    openCourseForm: openCourseForm,
    renderTerm: renderTerm
  };
})();
