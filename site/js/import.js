/* ==========================================================================
   import.js — 导入课表 / 事务
     四种方式：
       ① 上传文件（.xls / .xlsx / .csv / .ics / .json）
       ② 复制粘贴（网页表格、纯文本、JSON、ICS）
       ③ 书签自动抓取（在教务系统页面执行，读到自己登录后的课表再跳回来）
       ④ 示例数据
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  var pending = null;          // 解析结果，等着用户确认
  var pendingSource = '';
  var el = {};

  /* ======================================================================
     1. 初始化
     ====================================================================== */
  function init() {
    el = {
      modal: U.$('#modal-import'),
      drop: U.$('#importDrop'),
      file: U.$('#importFile'),
      paste: U.$('#pasteArea'),
      ics: U.$('#icsArea'),
      preview: U.$('#importPreview'),
      badge: U.$('#previewBadge'),
      summary: U.$('#previewSummary'),
      warnings: U.$('#previewWarnings'),
      table: U.$('#previewTable'),
      merge: U.$('#mergeMode'),
      confirm: U.$('#importConfirm'),
      reset: U.$('#importReset'),
      bookmarkletLink: U.$('#bookmarkletLink'),
      bookmarkletCode: U.$('#bookmarkletCode'),
      bookmarkletHelp: U.$('#bookmarkletHelp')
    };

    bindTabs();
    bindFile();
    bindPaste();
    bindBookmarklet();
    bindIcs();
    bindDemo();
    bindActions();
  }

  function bindTabs() {
    U.$$('#modal-import .tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-itab');
        U.$$('#modal-import .tabs button').forEach(function (x) {
          x.setAttribute('aria-selected', x === b ? 'true' : 'false');
        });
        U.$$('#modal-import .tab-panel').forEach(function (p) {
          p.hidden = p.getAttribute('data-ipanel') !== key;
        });
      });
    });
  }

  /* ======================================================================
     2. 上传文件
     ====================================================================== */
  function bindFile() {
    if (el.drop) {
      el.drop.addEventListener('click', function () { el.file.click(); });
      el.drop.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.file.click(); }
      });

      ['dragenter', 'dragover'].forEach(function (ev) {
        el.drop.addEventListener(ev, function (e) {
          e.preventDefault();
          e.stopPropagation();
          el.drop.classList.add('is-over');
        });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        el.drop.addEventListener(ev, function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (ev === 'dragleave' && el.drop.contains(e.relatedTarget)) return;
          el.drop.classList.remove('is-over');
        });
      });
      el.drop.addEventListener('drop', function (e) {
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) handleFiles(files);
      });
    }

    if (el.file) {
      el.file.addEventListener('change', function () {
        if (el.file.files && el.file.files.length) handleFiles(el.file.files);
        el.file.value = '';
      });
    }

    // 整个弹窗支持 Ctrl+V 贴文件 / 贴表格
    if (el.modal) {
      el.modal.addEventListener('paste', function (e) {
        var dt = e.clipboardData;
        if (!dt) return;

        var files = dt.files;
        if (files && files.length && /\.(xls|xlsx|csv|ics|json)$/i.test(files[0].name || '')) {
          e.preventDefault();
          handleFiles(files);
          return;
        }
        var html = dt.getData('text/html');
        if (html && /<table/i.test(html)) {
          e.preventDefault();
          switchTab('paste');
          var res = CW.parse.fromHtml(html);
          res.sourceFormat = 'html';
          setResult(res, '从剪贴板粘贴的网页表格');
          return;
        }
        var text = dt.getData('text/plain');
        if (text && text.length > 20) {
          e.preventDefault();
          switchTab('paste');
          if (el.paste) el.paste.value = text;
          var res2 = CW.parse.fromText(text);
          setResult(res2, '从剪贴板粘贴的文本');
        }
      });
    }
  }

  function switchTab(key) {
    U.$$('#modal-import .tabs button').forEach(function (x) {
      x.setAttribute('aria-selected', x.getAttribute('data-itab') === key ? 'true' : 'false');
    });
    U.$$('#modal-import .tab-panel').forEach(function (p) {
      p.hidden = p.getAttribute('data-ipanel') !== key;
    });
  }

  function handleFiles(files) {
    files = Array.prototype.slice.call(files);
    if (!files.length) return;

    var tasks = files.map(parseFile);
    var t = U.toast('正在解析 ' + files.length + ' 个文件…', 'info', { timeout: 0 });

    Promise.all(tasks).then(function (results) {
      if (t) t.dismiss();
      var ok = results.filter(function (r) { return r && r.result; });
      var fails = results.filter(function (r) { return r && r.error; });

      fails.forEach(function (f) {
        U.toast('「' + f.name + '」解析失败：' + f.error, 'error', { timeout: 6000 });
      });

      if (!ok.length) {
        if (!fails.length) U.toast('这些文件里没有解析出可用内容。', 'warn');
        return;
      }

      var merged = mergeResults(ok.map(function (r) { return r.result; }));
      setResult(merged, ok.map(function (r) { return r.name; }).join('、'));
    }).catch(function (err) {
      if (t) t.dismiss();
      U.toast('导入过程出错：' + ((err && err.message) || err), 'error');
    });
  }

  function parseFile(file) {
    var name = file.name || '未命名文件';
    var ext = U.fileExt(name);

    if (ext === 'ics') {
      return U.readFileAsText(file).then(function (text) {
        return { name: name, result: CW.parse.fromIcs(text) };
      }).catch(function (e) { return { name: name, error: (e && e.message) || '读取失败' }; });
    }

    if (ext === 'json') {
      return U.readFileAsText(file).then(function (text) {
        var r = CW.parse.fromJsonText(text);
        if (!r) throw new Error('这个 JSON 不是课表或备份格式');
        return { name: name, result: r };
      }).catch(function (e) { return { name: name, error: (e && e.message) || '解析失败' }; });
    }

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      return U.readFileAsText(file).then(function (text) {
        return { name: name, result: CW.parse.fromText(text, name) };
      }).catch(function (e) { return { name: name, error: (e && e.message) || '读取失败' }; });
    }

    // 剩下的按二进制表格处理（.xls / .xlsx / 其他）
    return U.readFileAsArrayBuffer(file).then(function (buffer) {
      if (!CW.readSheet) throw new Error('表格解析模块没加载成功');
      return CW.readSheet(buffer, name).then(function (book) {
        if (!book || !book.sheets || !book.sheets.length) throw new Error('文件里没有工作表');
        // 每个工作表都试一遍，取识别到课程最多的那个
        var best = null;
        book.sheets.forEach(function (sheet) {
          var res = CW.parse.fromGrid(sheet.rows);
          res.meta = res.meta || {};
          if (!res.meta.sheetName) res.meta.sheetName = sheet.name;
          if (!best || res.courses.length + res.events.length > best.courses.length + best.events.length) best = res;
        });
        return { name: name, result: best };
      });
    }).catch(function (e) {
      return { name: name, error: (e && e.message) || '解析失败' };
    });
  }

  function mergeResults(list) {
    var out = {
      kind: 'schedule', meta: {}, periods: null,
      courses: [], events: [], notes: [], warnings: [], sourceFormat: 'mixed'
    };
    list.forEach(function (r) {
      if (!r) return;
      out.meta = Object.assign(out.meta, r.meta || {});
      if (!out.periods && r.periods && r.periods.length) out.periods = r.periods;
      out.courses = out.courses.concat(r.courses || []);
      out.events = out.events.concat(r.events || []);
      out.notes = out.notes.concat(r.notes || []);
      out.warnings = out.warnings.concat(r.warnings || []);
    });
    out.courses = CW.parse.dedupeCourses(out.courses);
    out.warnings = uniq(out.warnings);
    out.notes = uniq(out.notes);
    return out;
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (s) { if (s && !seen[s]) { seen[s] = 1; out.push(s); } });
    return out;
  }

  /* ======================================================================
     3. 粘贴
     ====================================================================== */
  function bindPaste() {
    var btn = U.$('#pasteFromClipboard');
    if (btn) {
      btn.addEventListener('click', function () {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          U.toast('这个浏览器不允许直接读剪贴板，请在下面的框里按 Ctrl+V 粘贴。', 'warn', { timeout: 5000 });
          if (el.paste) el.paste.focus();
          return;
        }
        navigator.clipboard.readText().then(function (text) {
          if (!text || !text.trim()) { U.toast('剪贴板是空的。', 'warn'); return; }
          if (el.paste) el.paste.value = text;
          parsePaste(text);
        }).catch(function () {
          U.toast('读取剪贴板被拒绝了，请在下面的框里按 Ctrl+V 粘贴。', 'warn', { timeout: 5000 });
          if (el.paste) el.paste.focus();
        });
      });
    }

    var clearBtn = U.$('#pasteClear');
    if (clearBtn) clearBtn.addEventListener('click', function () { if (el.paste) el.paste.value = ''; });

    if (el.paste) {
      el.paste.addEventListener('input', U.debounce(function () {
        var v = el.paste.value;
        if (v.trim().length < 8) return;
        parsePaste(v);
      }, 420));
    }
  }

  function parsePaste(text) {
    var res = CW.parse.fromText(text);
    setResult(res, '粘贴的内容');
  }

  /* ======================================================================
     4. 书签自动抓取
     ====================================================================== */
  function bindBookmarklet() {
    var code = buildBookmarklet();
    if (el.bookmarkletLink) {
      el.bookmarkletLink.setAttribute('href', code);
      // 拖拽时用 dataTransfer 带上代码，防止某些浏览器把 href 规范化后失效
      el.bookmarkletLink.addEventListener('dragstart', function (e) {
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/uri-list', code);
          e.dataTransfer.setData('text/plain', code);
        }
      });
      el.bookmarkletLink.addEventListener('click', function (e) {
        e.preventDefault();
        U.toast('这个按钮是给书签栏用的：把它拖到书签栏，或点「复制书签代码」手动建一个书签。', 'info', { timeout: 5200 });
      });
    }
    if (el.bookmarkletCode) el.bookmarkletCode.value = code;

    var copyBtn = U.$('#copyBookmarklet');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        U.copyText(code).then(function (ok) {
          U.toast(ok ? '书签代码已复制，粘到一个新书签的「网址」里即可。' : '复制失败，请手动选中下面的代码复制。',
            ok ? 'ok' : 'warn');
        });
      });
    }

    var helpBtn = U.$('#showBookmarklet');
    if (helpBtn) {
      helpBtn.addEventListener('click', function () {
        var on = helpBtn.getAttribute('aria-expanded') === 'true';
        helpBtn.setAttribute('aria-expanded', on ? 'false' : 'true');
        if (el.bookmarkletHelp) el.bookmarkletHelp.hidden = on;
      });
    }
  }

  /**
   * 生成书签小工具。它会在教务系统页面里执行：
   * 找到最大的课表 <table>，序列化成 JSON，base64 后拼到本站地址的 # 后面跳回来。
   * 站点地址是运行时取当前页面的，所以本地测试和正式域名都能用。
   */
  function buildBookmarklet() {
    var base = String(location.href).split('#')[0];

    var code = [
      '(function(){',
      'var BASE=' + JSON.stringify(base) + ';',
      'function collect(doc,out){',
      ' try{',
      '  var ts=doc.querySelectorAll("table");',
      '  for(var i=0;i<ts.length;i++){',
      '   var t=ts[i],txt=t.innerText||t.textContent||"";',
      '   var m=txt.match(/星期[一二三四五六日天]/g);',
      '   out.push({el:t,n:m?m.length:0});',
      '  }',
      ' }catch(e){}',
      ' return out;',
      '}',
      'try{',
      ' var cands=collect(document,[]);',
      ' var fr=document.querySelectorAll("iframe");',
      ' for(var i=0;i<fr.length;i++){ try{ if(fr[i].contentDocument) collect(fr[i].contentDocument,cands); }catch(e){} }',
      ' cands.sort(function(a,b){return b.n-a.n;});',
      ' var payload;',
      ' if(cands.length&&cands[0].n>=3){ payload={t:"html",h:cands[0].el.outerHTML}; }',
      ' else { payload={t:"text",h:(document.body.innerText||document.body.textContent||"").slice(0,150000)}; }',
      ' var s=JSON.stringify(payload);',
      ' var b=btoa(unescape(encodeURIComponent(s)));',
      ' if(b.length>100000){',
      '  try{',
      '   navigator.clipboard.writeText(s);',
      '   alert("课表内容比较大（"+b.length+" 个字符），已经复制到剪贴板。\\n请回到校园主页，打开「导入 → 复制粘贴」，按 Ctrl+V 即可。");',
      '   return;',
      '  }catch(e){}',
      ' }',
      ' var url=BASE+"#data="+b;',
      ' var w=window.open(url,"_blank");',
      ' if(!w) location.href=url;',
      '}catch(e){ alert("抓取失败："+((e&&e.message)||e)); }',
      '})();'
    ].join('\n');

    return 'javascript:' + encodeURIComponent(code);
  }

  /* ======================================================================
     5. 日历 / 事务
     ====================================================================== */
  function bindIcs() {
    var btn = U.$('#parseIcs');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var text = el.ics ? el.ics.value.trim() : '';
      if (!text) { U.toast('请先把 .ics 内容粘贴到上面的框里。', 'warn'); return; }
      var res = CW.parse.fromIcs(text);
      setResult(res, '.ics 日历');
    });
  }

  /* ======================================================================
     6. 示例数据
     ====================================================================== */
  function bindDemo() {
    var btn = U.$('#loadDemo');
    if (!btn) return;
    btn.addEventListener('click', function () {
      loadDemo().then(function (doc) {
        if (!doc) { U.toast('示例数据没找到（site/data/demo-schedule.js 缺失？）。', 'error'); return; }
        var res = {
          kind: 'schedule',
          meta: doc.meta || {},
          periods: doc.periods || null,
          courses: doc.courses || [],
          events: doc.events || [],
          notes: doc.notes || [],
          settings: doc.settings || null,
          warnings: [],
          label: doc.label || '',
          sourceFormat: 'demo'
        };
        setResult(res, '示例课表');
        if (el.merge) el.merge.value = 'replace';
      });
    });
  }

  function loadDemo() {
    if (window.CW_DEMO_SCHEDULE) return Promise.resolve(window.CW_DEMO_SCHEDULE);
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = './data/demo-schedule.js';
      s.onload = function () { resolve(window.CW_DEMO_SCHEDULE || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }

  /* ======================================================================
     7. 底部动作
     ====================================================================== */
  function bindActions() {
    if (el.reset) {
      el.reset.addEventListener('click', function () {
        pending = null;
        pendingSource = '';
        if (el.preview) el.preview.hidden = true;
        if (el.paste) el.paste.value = '';
        if (el.ics) el.ics.value = '';
        if (el.confirm) el.confirm.disabled = true;
        if (el.merge) el.merge.value = 'merge';
        switchTab('file');
        U.toast('已清空，可以重新选一次。', 'info', { timeout: 1800 });
      });
    }

    if (el.confirm) el.confirm.addEventListener('click', applyResult);
  }

  /* ======================================================================
     8. 预览
     ====================================================================== */
  function setResult(res, source) {
    if (!res) { U.toast('没解析出内容。', 'warn'); return; }
    pending = res;
    pendingSource = source || '';

    var nCourses = (res.courses || []).length;
    var nEvents = (res.events || []).length;

    if (!nCourses && !nEvents) {
      if (el.preview) el.preview.hidden = false;
      if (el.badge) { el.badge.textContent = '没有识别到内容'; el.badge.className = 'badge badge-danger'; }
      if (el.confirm) el.confirm.disabled = true;
      renderWarnings(res.warnings, true);
      U.render(el.table, '');
      U.render(el.summary, U.el('div', { class: 'notice notice-warn' }, [
        U.icon('i-alert', 'ico'),
        U.el('div', {}, [
          U.el('strong', { text: '没能从「' + U.truncate(source, 30) + '」里认出课程或事务。' }),
          U.el('div', { class: 'tiny', style: { marginTop: '4px' },
            text: '最稳的办法：在教务系统点「导出」，拿到 .xls 文件后拖到「上传文件」那一栏。' })
        ])
      ]));
      if (el.preview.scrollIntoView) el.preview.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    if (el.badge) {
      var parts = [];
      if (nCourses) parts.push(nCourses + ' 条排课');
      if (nEvents) parts.push(nEvents + ' 条事务');
      el.badge.textContent = parts.join(' · ');
      el.badge.className = 'badge badge-ok';
    }
    if (el.confirm) el.confirm.disabled = false;
    if (el.preview) el.preview.hidden = false;

    renderSummary(res, source);
    renderWarnings(res.warnings, false);
    renderTable(res);
    if (el.preview.scrollIntoView) el.preview.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderSummary(res, source) {
    var meta = res.meta || {};
    var bits = [];
    if (meta.school) bits.push(meta.school);
    if (meta.student) bits.push(meta.student);
    if (meta.term) bits.push(meta.term + ' 学期');
    if (meta.className) bits.push(meta.className);
    if (meta.college) bits.push(meta.college);
    if (meta.major) bits.push(meta.major);

    var settings = CW.store.state.schedule.settings;
    var dateInput = U.el('input', { class: 'input', type: 'date', value: settings.termStart, style: { maxWidth: '170px' } });

    var nodes = [
      U.el('div', { class: 'notice' }, [
        U.icon('i-check-circle', 'ico'),
        U.el('div', {}, [
          U.el('strong', { text: '解析成功' }),
          U.el('div', { class: 'tiny', style: { marginTop: '3px' },
            text: '来源：' + source + (bits.length ? ' · ' + bits.join(' · ') : '') })
        ])
      ]),
      U.el('div', { class: 'field', style: { marginTop: '14px', maxWidth: '420px' } }, [
        U.el('label', { class: 'field-label', text: '第 1 周周一（决定「第几周」怎么算）' }),
        dateInput,
        U.el('span', { class: 'hint', text: '默认沿用当前设置。不确定的话，先导入，之后在「修改 → 学期与节次」里用「按今天算是第几周」反推。' })
      ])
    ];

    if (res.notes && res.notes.length) {
      nodes.push(U.el('div', { class: 'notice notice-warn', style: { marginTop: '12px' } }, [
        U.icon('i-info', 'ico'),
        U.el('div', {}, [
          U.el('strong', { text: '课表附注（不会变成课程，只是提醒）' }),
          U.el('div', { class: 'tiny', style: { marginTop: '3px' }, text: res.notes.join('；') })
        ])
      ]));
    }

    if (res.label) {
      nodes.push(U.el('p', { class: 'small muted', style: { marginTop: '10px' }, text: '标记：' + res.label }));
    }

    U.render(el.summary, nodes);

    // 用户改了日期就记下来，确认导入时一起写进设置
    dateInput.addEventListener('change', function () {
      var d = U.parseDate(dateInput.value);
      if (!d) return;
      pending.settings = Object.assign({}, pending.settings || {}, { termStart: U.fmtDate(U.mondayOf(d)) });
    });
  }

  function renderWarnings(list, isError) {
    if (!el.warnings) return;
    if (!list || !list.length) { U.render(el.warnings, ''); return; }

    U.render(el.warnings, U.el('div', {
      class: 'notice ' + (isError ? 'notice-danger' : 'notice-warn'),
      style: { marginTop: '12px' }
    }, [
      U.icon('i-alert', 'ico'),
      U.el('div', {}, [
        U.el('strong', { text: list.length + ' 条提醒' }),
        U.el('ul', { style: { marginTop: '5px', display: 'grid', gap: '4px', listStyle: 'disc', paddingLeft: '17px' } },
          list.slice(0, 8).map(function (w) { return U.el('li', { class: 'tiny', text: w }); })
            .concat(list.length > 8 ? [U.el('li', { class: 'tiny faint', text: '…还有 ' + (list.length - 8) + ' 条' })] : []))
      ])
    ]));
  }

  function renderTable(res) {
    if (!el.table) return;

    var head = U.el('tr', {}, [
      U.el('th', { text: '类型' }),
      U.el('th', { text: '名称' }),
      U.el('th', { text: '星期' }),
      U.el('th', { text: '节次 / 时间' }),
      U.el('th', { text: '周次' }),
      U.el('th', { text: '地点' }),
      U.el('th', { text: '教师' })
    ]);

    var rows = [];
    (res.courses || []).slice(0, 200).forEach(function (c) {
      var t = CW.store.timesForCodes(c.codes);
      rows.push(U.el('tr', {}, [
        U.el('td', { class: 'cell-mono', text: '课程' }),
        U.el('td', { class: 'cell-name', text: c.name }),
        U.el('td', { text: c.day ? '周' + CW.schedule.WEEKDAY_LABELS[c.day - 1] : '—' }),
        U.el('td', { class: 'cell-mono', text: (c.codes && c.codes.length ? '第 ' + c.codes.join('/') + ' 节' : '—') +
          (t.start ? '  ' + t.start + '–' + (t.end || '') : '') }),
        U.el('td', { class: 'cell-mono', text: c.weeksText || (c.weeks && c.weeks.length ? CW.parse.compressRanges(c.weeks) : '全学期') }),
        U.el('td', { text: c.room || '—' }),
        U.el('td', { text: c.teacher || '—' })
      ]));
    });

    (res.events || []).slice(0, 100).forEach(function (e) {
      rows.push(U.el('tr', {}, [
        U.el('td', { class: 'cell-mono', text: '事务' }),
        U.el('td', { class: 'cell-name', text: e.title }),
        U.el('td', { text: e.date }),
        U.el('td', { class: 'cell-mono', text: e.allDay ? '全天' : ((e.start || '') + (e.end ? '–' + e.end : '')) }),
        U.el('td', { text: '—' }),
        U.el('td', { text: e.location || '—' }),
        U.el('td', { text: '—' })
      ]));
    });

    U.render(el.table, [U.el('thead', {}, head), U.el('tbody', {}, rows)]);
  }

  /* ======================================================================
     9. 确认导入
     ====================================================================== */
  function applyResult() {
    if (!pending) return;

    var mode = el.merge ? el.merge.value : 'merge';
    var hasData = CW.store.state.schedule.courses.length || CW.store.state.schedule.events.length;

    if (mode === 'replace' && hasData) {
      CW.app.confirmThen('替换会清空现有的课程与事务，确定吗？', doApply, '确定替换', 'btn-danger');
      return;
    }
    doApply();
  }

  function doApply() {
    var mode = el.merge ? el.merge.value : 'merge';
    var res = pending;

    var added = CW.store.replaceSchedule(res, {
      mode: mode,
      adoptMeta: true,
      adoptPeriods: !!(res.periods && res.periods.length)
    });

    if (res.settings && res.settings.termStart) {
      var d = U.parseDate(res.settings.termStart);
      if (d) CW.store.setSettings({ termStart: U.fmtDate(U.mondayOf(d)) });
    }
    if (res.settings && res.settings.totalWeeks) {
      CW.store.setSettings({ totalWeeks: res.settings.totalWeeks });
    }
    if (res.meta && res.meta.student && !CW.store.state.schedule.settings.studentName) {
      CW.store.setSettings({ studentName: res.meta.student });
    }
    if (res.meta && res.meta.term && !CW.store.state.schedule.meta.sheetName) {
      CW.store.state.schedule.meta.term = res.meta.term;
    }

    CW.store.saveNow();

    var msgs = [];
    if (added.addedCourses) msgs.push(added.addedCourses + ' 条排课');
    if (added.addedEvents) msgs.push(added.addedEvents + ' 条事务');
    if (added.skipped) msgs.push('跳过 ' + added.skipped + ' 条重复或无效');

    CW.app.closeModal('import');
    CW.app.closeModal('item');
    CW.util.toast(msgs.length ? '导入完成：' + msgs.join('，') : '导入完成，没有新增内容。', 'ok', { timeout: 4500 });

    // 导入完顺手看一眼课表
    setTimeout(function () { CW.schedule.openFull(U.today()); }, 260);

    pending = null;
    if (el.preview) el.preview.hidden = true;
    if (el.confirm) el.confirm.disabled = true;
  }

  /* ======================================================================
     10. 处理从书签跳回来带的 #data=
     ====================================================================== */
  function handleHashImport() {
    var params = U.hashParams();
    var raw = params.data;
    if (!raw) return false;

    // 立刻把 hash 清掉，免得刷新时重复导入，也免得长网址留在地址栏
    try {
      if (window.history && history.replaceState) {
        history.replaceState(null, '', String(location.href).split('#')[0]);
      }
    } catch (e) { /* file:// 下可能不允许，忽略 */ }

    var payload;
    try {
      payload = JSON.parse(U.b64Decode(raw));
    } catch (e) {
      U.toast('从书签带回的数据解不开，可能被截断了。改用「复制粘贴」再试一次。', 'error', { timeout: 6000 });
      return true;
    }

    var res;
    if (payload.t === 'html') res = CW.parse.fromHtml(payload.h);
    else res = CW.parse.fromText(payload.h);

    CW.app.openModal('import');
    setResult(res, '教务系统页面（书签自动抓取）');

    if (!res.courses.length && !res.events.length) {
      U.toast('抓到的页面里没认出课表。可以把课表页面的表格直接复制粘贴过来。', 'warn', { timeout: 6000 });
    }
    return true;
  }

  /* ======================================================================
     导出
     ====================================================================== */
  CW.importUI = {
    init: init,
    handleHashImport: handleHashImport,
    switchTab: switchTab,
    setResult: setResult,
    buildBookmarklet: buildBookmarklet,
    hasPending: function () { return !!pending; }
  };
})();
