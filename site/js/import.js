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
      bookmarkletHelp: U.$('#bookmarkletHelp'),
      jwBookmarklet: U.$('#jwBookmarklet'),
      jwCode: U.$('#jwCode'),
      jwHelp: U.$('#jwHelp'),
      failBox: U.$('#importFail')
    };

    bindTabs();
    bindFile();
    bindPaste();
    bindBookmarklet();
    bindAccount();
    bindIcs();
    bindManual();
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

      // 失败的要说清楚原因，并且**留在页面上**（toast 会消失，用户回头就看不到）
      if (fails.length) {
        var first = fails[0];
        U.toast('「' + first.name + '」没读成功：' + first.error, 'error', { timeout: 9000 });
        if (el.failBox) {
          el.failBox.hidden = false;
          U.render(el.failBox, U.el('div', { class: 'notice notice-danger' }, [
            U.icon('i-alert', 'ico'),
            U.el('div', {}, [
              U.el('strong', { text: fails.length + ' 个文件没能读出来' }),
              U.el('ul', {
                style: { marginTop: '6px', display: 'grid', gap: '4px', listStyle: 'disc', paddingLeft: '17px' }
              }, fails.map(function (f) {
                return U.el('li', { class: 'tiny', text: '「' + f.name + '」：' + f.error });
              }))
            ])
          ]));
        }
      } else if (el.failBox) {
        el.failBox.hidden = true;
        U.render(el.failBox, '');
      }

      if (!ok.length) {
        if (!fails.length) U.toast('这些文件里没有解析出可用内容。', 'warn', { timeout: 6000 });
        return;
      }

      var merged = mergeResults(ok.map(function (r) { return r.result; }));
      setResult(merged, ok.map(function (r) { return r.name; }).join('、'));
    }).catch(function (err) {
      if (t) t.dismiss();
      U.toast('导入过程出错：' + ((err && err.message) || err), 'error', { timeout: 8000 });
    });
  }

  function parseFile(file) {
    var name = file.name || '未命名文件';
    var ext = U.fileExt(name);

    if (ext === 'ics') {
      return U.readFileAsText(file).then(function (text) {
        return { name: name, result: CW.parse.fromIcs(text) };
      }).catch(function (e) { return { name: name, error: failReason(e, name) }; });
    }

    if (ext === 'json') {
      return U.readFileAsText(file).then(function (text) {
        var r = CW.parse.fromJsonText(text);
        if (!r) throw new Error('这个 JSON 不是课表或备份格式');
        return { name: name, result: r };
      }).catch(function (e) { return { name: name, error: failReason(e, name) }; });
    }

    // 网页另存的 .html（也包括本机抓课表小工具存下来的备份）：里面就是那张课表表格
    if (ext === 'html' || ext === 'htm') {
      return U.readFileAsText(file).then(function (text) {
        return { name: name, result: CW.parse.fromHtml(text) };
      }).catch(function (e) { return { name: name, error: failReason(e, name) }; });
    }

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      return U.readFileAsText(file).then(function (text) {
        // 有些「.txt / .csv」其实是网页另存的 HTML 表格
        if (CW.looksLikeHtmlMarkup && CW.looksLikeHtmlMarkup(new TextEncoder().encode(text.slice(0, 4096)))) {
          return { name: name, result: CW.parse.fromHtml(text) };
        }
        return { name: name, result: CW.parse.fromText(text, name) };
      }).catch(function (e) { return { name: name, error: failReason(e, name) }; });
    }

    // 剩下的按表格处理（.xls / .xlsx / 其他）
    return U.readFileAsArrayBuffer(file).then(function (buffer) {
      if (!CW.readSheet) throw new Error('表格解析模块没加载成功');
      return CW.readSheet(buffer, name).then(function (book) {
        // 教务系统常常把 HTML 表格直接存成 .xls：这种文件不是真的 xls，
        // 内容其实是网页，走 HTML 解析反而最准。
        if (book && book.kind === 'html' && book.html) {
          var res0 = CW.parse.fromHtml(book.html);
          res0.meta = res0.meta || {};
          if (!res0.meta.sheetName) res0.meta.sheetName = 'HTML 表格';
          return { name: name, result: res0 };
        }

        if (!book || !book.sheets || !book.sheets.length) {
          throw new Error('文件里没有读到工作表');
        }

        // 每个工作表都试一遍，取识别到课程最多的那个
        var best = null;
        book.sheets.forEach(function (sheet) {
          var res = CW.parse.fromGrid(sheet.rows);
          res.meta = res.meta || {};
          if (!res.meta.sheetName) res.meta.sheetName = sheet.name;
          if (!best || res.courses.length + res.events.length > best.courses.length + best.events.length) best = res;
        });

        if (!best || (!best.courses.length && !best.events.length)) {
          throw new Error('表格读出来了，但里面没有能认成课程或事务的行（' +
            book.sheets.length + ' 个工作表，最多 ' +
            book.sheets.reduce(function (mx, s) { return Math.max(mx, s.rows.length); }, 0) + ' 行）');
        }
        return { name: name, result: best };
      });
    }).catch(function (e) {
      return { name: name, error: failReason(e, name) };
    });
  }

  /** 把各种失败原因翻译成用户能看懂、并且知道下一步怎么办的话 */
  function failReason(err, name) {
    var msg = (err && err.message) || '解析失败';
    if (/OLE2|OLE|复合文档签名/.test(msg)) {
      return msg + ' 这可能不是教务系统导出的文件，或者文件下载不完整。建议重新导出一次，' +
        '或者直接把课表页面 Ctrl+A、Ctrl+C 复制后粘贴到「复制粘贴」那一栏。';
    }
    if (/截断|损坏|不完整/.test(msg)) {
      return msg + ' 文件可能没下完，重新导出/下载一次再试。';
    }
    if (/DecompressionStream/.test(msg)) {
      return msg + ' 或者把表格另存为 .xls / .csv 再导入。';
    }
    return msg;
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
          U.toast('这个浏览器不让网页直接读剪贴板。请在下面的框里长按 → 粘贴（手机）或按 Ctrl+V（电脑）。', 'warn', { timeout: 6500 });
          if (el.paste) el.paste.focus();
          return;
        }
        navigator.clipboard.readText().then(function (text) {
          if (!text || !text.trim()) { U.toast('剪贴板是空的。', 'warn'); return; }
          if (el.paste) el.paste.value = text;
          parsePaste(text);
        }).catch(function () {
          U.toast('读剪贴板被挡下了（浏览器要授权）。请在下面的框里长按 → 粘贴（手机）或按 Ctrl+V（电脑）。', 'warn', { timeout: 6500 });
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
    // 粘错了东西时，别只说「没认出课表」，直接告诉他问题出在哪
    if (!res.courses.length && !res.events.length) {
      res.warnings = (res.warnings || []).concat(pasteHints(text));
    }
    setResult(res, '粘贴的内容');
  }

  /** 粘贴内容没解析出东西时的针对性提示 */
  function pasteHints(text) {
    var t = String(text || '');
    var hints = [];
    if (t.trim().length < 60) {
      hints.push('粘贴的内容太短了：可能是没选全。请回到课表页，从课表左上方一直选到右下方。');
    }
    if (/成绩|学分|绩点|GPA/.test(t) && !/星期|周一|周一至/.test(t)) {
      hints.push('这看起来是成绩/学分类页面，不是课表。请切到「信息查询 → 学生个人课表」再复制。');
    }
    if (!/星期[一二三四五六日天]|周一|周二|周天/.test(t)) {
      hints.push('没找到「星期一…星期日」这一行表头。课表表格是带星期表头的，只复制课程名称是认不出来的。');
    } else if (!res0HasCourses(text)) {
      hints.push('看到了星期表头，但格子里没认出课程：可能只复制了表头那一行，请把整张课表都选上。');
    }
    hints.push('也可以换一种：课表页「导出 / 打印」得到 .xls，或用「上传文件」那一栏；手机上长按课表 → 全选 → 拷贝后再点「从剪贴板读取」。');
    return hints;
  }

  /** 表头有星期，但格子里有没有东西（用于区分「只复制了表头」） */
  function res0HasCourses(text) {
    var t = String(text || '');
    // 去掉星期那一行，看剩下还有没有像课程名的内容
    var rest = t.replace(/[^\n]*星期[^\n]*/g, '');
    return /[\u4e00-\u9fff]{2,}/.test(rest.replace(/第\s*\d+\s*[--]\s*\d+\s*节/g, ''));
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
   * 书签里那一小段「引导代码」。
   * 真正的逻辑放在站点的 js/bookmarklet.js 里，每次点书签都重新加载 ——
   * 这样站点改了逻辑，你手里的旧书签也自动用上新的（以前代码写死在书签里，
   * 站点升级后旧书签还是老逻辑，会出现「抓回主页却说没认出内容」这种情况）。
   * 加载不到（比如站点临时打不开）时，退回一小段自带的最小实现。
   */
  function buildLoaderBookmarklet(callExpr) {
    var base = String(location.href).split('#')[0];

    var code = [
      '(function(){',
      'var BASE=' + JSON.stringify(base) + ';',
      'function fallback(){',
      ' try{',
      '  var cands=[],ts=document.querySelectorAll("table");',
      '  for(var i=0;i<ts.length;i++){',
      '   var t=ts[i],x=t.innerText||t.textContent||"";',
      '   var m=x.match(/星期[一二三四五六日天]/g);',
      '   if(m&&m.length>=3) cands.push({el:t,n:m.length});',
      '  }',
      '  cands.sort(function(a,b){return b.n-a.n;});',
      '  if(!cands.length){ alert("这个页面上没找到课表。\\n先登录教务系统，或者手动打开「学期理论课表」那一页，再点一次书签。"); return; }',
      '  var b=btoa(unescape(encodeURIComponent(JSON.stringify({t:"html",h:cands[0].el.outerHTML})))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");',
      '  var u=BASE+"#data="+b;',
      '  var w=window.open(u,"_blank"); if(!w) location.href=u;',
      ' }catch(e){ alert("抓取失败："+((e&&e.message)||e)); }',
      '}',
      'var s=document.createElement("script");',
      's.src=BASE.replace(/\\/$/,"")+"/js/bookmarklet.js?t="+Date.now();',
      's.onload=function(){ try{ if(window.' + callExpr.fn + '){ ' + callExpr.call + '; } else { fallback(); } }catch(e){ fallback(); } };',
      's.onerror=function(){ fallback(); };',
      'document.documentElement.appendChild(s);',
      'setTimeout(function(){ if(!window.' + callExpr.fn + ' && !window.__cwTried) { window.__cwTried=1; fallback(); } },6000);',
      '})();'
    ].join('\n');

    return 'javascript:' + encodeURIComponent(code);
  }
  function buildBookmarklet() {
    return buildLoaderBookmarklet({ fn: '__cwGrab', call: 'window.__cwGrab(BASE)' });
  }


  /* ======================================================================
     5. 教务系统账号：记住密码 → 书签一键登录 + 抓课表
        密码只写进本机 localStorage，不经过任何服务器。
     ====================================================================== */
  function bindAccount() {
    var userEl = U.$('#jwUser');
    var passEl = U.$('#jwPass');
    var acc = CW.store.getAccount();

    if (userEl) userEl.value = acc.user || '';
    if (passEl) passEl.value = acc.pass || '';

    var saveBtn = U.$('#jwSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var user = userEl ? userEl.value.trim() : '';
        var pass = passEl ? passEl.value : '';
        if (!user) { U.toast('至少把学号填上。', 'warn'); if (userEl) userEl.focus(); return; }
        if (!pass) { U.toast('密码留空 = 不保存密码（书签会在教务系统页面上弹框让你输入）。', 'info', { timeout: 5200 }); }
        CW.store.setAccount(user, pass);
        refreshAccountUI(true);
        U.toast(pass ? '已保存在这台设备的浏览器里。公用电脑请记得「忘掉账号与密码」。' : '已记住学号，密码不保存。',
          'ok', { timeout: 5200 });
      });
    }

    var buildBtn = U.$('#jwBuild');
    if (buildBtn) buildBtn.addEventListener('click', function () { refreshAccountUI(true); U.toast('书签已按当前账号重新生成。', 'ok'); });

    var forgetBtn = U.$('#jwForget');
    if (forgetBtn) {
      forgetBtn.addEventListener('click', function () {
        CW.app.confirmThen('清掉这台设备上保存的教务系统学号和密码？', function () {
          CW.store.clearAccount();
          if (userEl) userEl.value = '';
          if (passEl) passEl.value = '';
          refreshAccountUI(true);
          U.toast('已清除本机保存的账号密码', 'ok');
        }, '清除', 'btn-danger');
      });
    }

    var copyBtn = U.$('#jwCopy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var code = el.jwBookmarklet ? el.jwBookmarklet.getAttribute('href') : '';
        U.copyText(code).then(function (ok) {
          U.toast(ok ? '书签代码已复制：新建一个书签，把「网址」整段替换掉即可。' : '复制失败，请手动选中下面的代码复制。',
            ok ? 'ok' : 'warn', { timeout: 6000 });
        });
      });
    }

    var howBtn = U.$('#jwHow');
    if (howBtn) {
      howBtn.addEventListener('click', function () {
        var on = howBtn.getAttribute('aria-expanded') === 'true';
        howBtn.setAttribute('aria-expanded', on ? 'false' : 'true');
        if (el.jwHelp) el.jwHelp.hidden = on;
      });
    }

    CW.store.on('account', function () { refreshAccountUI(false); });
    refreshAccountUI(false);
  }

  function refreshAccountUI(loud) {
    var acc = CW.store.getAccount();
    var hasUser = !!acc.user;

    var link = el.jwBookmarklet;
    var code = buildLoginBookmarklet(acc.user, acc.pass);
    if (link) link.setAttribute('href', code);
    if (el.jwCode) el.jwCode.value = code;

    var userEl = U.$('#jwUser');
    var passEl = U.$('#jwPass');
    if (userEl && document.activeElement !== userEl) userEl.value = acc.user || '';
    if (passEl && document.activeElement !== passEl) passEl.value = acc.pass || '';

    var box = U.$('#jwState');
    if (!box) return;

    if (!hasUser) {
      U.render(box, U.el('div', { class: 'notice notice-warn' }, [
        U.icon('i-alert', 'ico'),
        U.el('div', {}, [
          U.el('strong', { text: '还没有记住账号' }),
          U.el('div', { class: 'tiny', style: { marginTop: '4px' },
            text: '填上学号、点「保存到本机」之后，书签才能自动登录。现在也能用，只是每次要在教务系统页面上手输一次。' })
        ])
      ]));
      return;
    }

    U.render(box, U.el('div', { class: 'notice' }, [
      U.icon('i-check-circle', 'ico'),
      U.el('div', {}, [
        U.el('strong', { text: '已记住学号 ' + acc.user + (acc.pass ? '（含密码）' : '（不含密码，每次手输）') }),
        U.el('div', { class: 'tiny', style: { marginTop: '4px' },
          text: '存在本机浏览器的 cw.jwAccount 里' + (acc.savedAt ? '，保存于 ' + acc.savedAt.slice(0, 16).replace('T', ' ') : '') +
            '。换了设备或清了站点数据就要重新保存。' })
      ])
    ]));

    if (loud) U.toast('书签已更新，请重新拖一次到书签栏（旧的还带着旧账号）。', 'info', { timeout: 5200 });
  }

  /**
   * 生成「一键登录 + 抓课表」书签。
   * 它在教务系统的页面上运行，流程是：
   *   ① 已经登录（或已经在课表页）→ 直接抓课表
   *   ② 在登录页 → 自动填账号密码（有验证码就停下来等你补），提交
   *   ③ 课表还没出来 → 跳「学生个人课表」页，抓走
   * 抓到的表格 base64 后通过 #data= 传回本页，和普通书签抓取是同一条通路。
   */
  function buildLoginBookmarklet(user, pass) {
    // 同样走「引导代码 + 站点脚本」：账号密码作为参数传给站点脚本里的 __cwLogin
    return buildLoaderBookmarklet({
      fn: '__cwLogin',
      call: 'window.__cwLogin(BASE, ' + JSON.stringify(user || '') + ', ' + JSON.stringify(pass || '') + ')'
    });
  }

  /* ======================================================================
     6. 日历 / 事务
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
     6. 手动录入 / CSV 模板
     ====================================================================== */
  function bindManual() {
    var addCourse = U.$('#manualAddCourse');
    if (addCourse) addCourse.addEventListener('click', function () {
      CW.app.closeModal('import');
      CW.editUI.openCourseForm(null);
    });

    var addEvent = U.$('#manualAddEvent');
    if (addEvent) addEvent.addEventListener('click', function () {
      CW.app.closeModal('import');
      CW.editUI.openEventForm(null);
    });

    var openEdit = U.$('#openEditFromImport');
    if (openEdit) openEdit.addEventListener('click', function () {
      CW.app.closeModal('import');
      CW.app.openModal('edit');
    });

    var tpl = U.$('#downloadCsvTemplate');
    if (tpl) tpl.addEventListener('click', downloadCsvTemplate);
  }

  /**
   * CSV 模板。周次里带逗号（比如 2-3,5-6,9-18）时必须用双引号包起来，
   * 否则会被当成两列——所以示例里特意放了一条带引号的。
   */
  function csvTemplate() {
    return [
      '课程,教师,教室,星期,节次,周次',
      '高等数学B1,何俊锋,C-5-103,星期二,3-4,1-16',
      '大学英语A1,王曦兮,C-5-554,星期一,6-7,"2-3,5-6,9-18"',
      '大学物理,李四,C-2-201,星期四,6-7,1-16周(双)',
      '体育（游泳）,王五,体育馆,星期三,3-4,单周',
      '形势与政策,赵六,C-5-109,星期五,11-12,13'
    ].join('\r\n') + '\r\n';
  }

  function downloadCsvTemplate() {
    // 带 BOM，Excel 打开中文才不会乱码
    U.download('课表模板.csv', '\ufeff' + csvTemplate(), 'text/csv;charset=utf-8');
    U.toast('模板已下载。填好后回到「上传文件」把它拖进来即可。', 'ok', { timeout: 5000 });
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

    // 周次没读出来的课要单独说清楚，否则它们会按「整学期每周都上」铺满整个学期
    var noWeeks = (res.courses || []).filter(function (c) {
      return !c.weeks || !c.weeks.length;
    }).length;
    if (noWeeks) {
      nodes.push(U.el('div', { class: 'notice notice-warn', style: { marginTop: '12px' } }, [
        U.icon('i-alert', 'ico'),
        U.el('div', {}, [
          U.el('strong', { text: '有 ' + noWeeks + ' 门课没读到上课周次，将按「整学期每周都上」处理。' }),
          U.el('div', { class: 'tiny', style: { marginTop: '3px' },
            text: '如果其中有不每周都上的课，导入后到「修改 → 课程」里点周次方格改一下即可。' })
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
    if (!res.settings || !res.settings.totalWeeks) { /* 没带就沿用现有设置 */ }
    rememberImportedName(res);
    if (res.meta && res.meta.term && !CW.store.state.schedule.meta.sheetName) {
      CW.store.state.schedule.meta.term = res.meta.term;
    }

    CW.store.saveNow();

    var msgs = [];
    if (added.addedCourses) msgs.push(added.addedCourses + ' 条排课');
    if (added.addedEvents) msgs.push(added.addedEvents + ' 条事务');

    CW.app.closeModal('import');
    CW.app.closeModal('item');

    if (added.addedCourses || added.addedEvents) {
      if (added.skipped) msgs.push('跳过 ' + added.skipped + ' 条重复的');
      CW.util.toast('导入完成：' + msgs.join('，'), 'ok', { timeout: 5000 });
      // 导入完顺手看一眼课表
      setTimeout(function () { CW.schedule.openFull(U.today()); }, 260);
    } else {
      // 一条都没新增，多半是「这门课之前已经导过了」——直接说清楚，
      // 否则看起来就像导入失败。
      var total = CW.store.state.schedule.courses.length;
      CW.util.toast('这次没有新增内容：文件里的排课和现有课表重复（可能之前已经导入过）。当前共 ' +
        total + ' 条排课。要看课表就按下面的日程按钮。', 'info', { timeout: 8000 });
      setTimeout(function () { CW.schedule.openFull(U.today()); }, 600);
    }

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
    var jwDone = params.jwdone === '1';

    // 「一键登录」书签抓不到课表时，会带着 #jwdone=1 回来 —— 顺手把「教务系统账号」那一栏打开
    if (!raw && jwDone) {
      clearHash();
      CW.app.openModal('import');
      switchTab('account');
      U.toast('已经用你保存的账号登录过教务系统了，但没抓到课表。请手动点到课表页，再点一次那个书签。',
        'info', { timeout: 8000 });
      return true;
    }

    if (!raw) return false;

    // 立刻把 hash 清掉，免得刷新时重复导入，也免得长网址留在地址栏
    clearHash();

    var payload;
    try {
      payload = JSON.parse(U.b64Decode(raw));
    } catch (e) {
      U.toast('从书签带回的数据解不开，可能被截断了。改用「复制粘贴」再试一次。', 'error', { timeout: 6000 });
      return true;
    }

    var res;
    if (payload.t === 'html') res = CW.parse.fromHtml(payload.h);
    else if (payload.t === 'text') res = CW.parse.fromText(payload.h);
    else if (payload.t === 'xls') {
      /* 本机工具点了教务系统的「导出」，把拿到的 .xls/.xlsx 原样发回来（base64）。
         这里不重写解析：直接套「上传文件」那条路（parseFile），
         它连「正方把 HTML 存成 .xls」这种情况都处理了。 */
      var bytes;
      try {
        var bin = atob(String(payload.d || '').replace(/\s+/g, ''));
        bytes = new Uint8Array(bin.length);
        for (var bi = 0; bi < bin.length; bi++) bytes[bi] = bin.charCodeAt(bi);
      } catch (e) {
        U.toast('导出的表格数据解不开，可能被截断了。', 'error', { timeout: 6000 });
        return true;
      }
      var fname = payload.n || '课表.xls';
      var file = new File([bytes], fname, { type: 'application/vnd.ms-excel' });
      parseFile(file).then(function (r) {
        CW.app.openModal('import');
        if (r && r.result) {
          setResult(r.result, '教务系统导出表格（自动抓取）· ' + fname);
          if (!r.result.courses.length && !r.result.events.length) {
            U.toast('导出的表格里没认出课程，可以改用「上传文件」手动选它。', 'warn', { timeout: 6000 });
          } else {
            if (typeof applyImportedName === 'function') applyImportedName(r.result);
          }
        } else {
          U.toast('导出的表格解析失败：' + ((r && r.error) || '未知原因'), 'error', { timeout: 6200 });
        }
      });
      return true;
    } else res = CW.parse.fromText(payload.h);

    CW.app.openModal('import');
    setResult(res, jwDone ? '教务系统页面（账号自动登录 + 抓取）' : '教务系统页面（书签自动抓取）');

    if (!res.courses.length && !res.events.length) {
      U.toast('抓到的页面里没认出课表。可以改用「上传文件」，或让本机工具走「导出 xls」。', 'warn', { timeout: 6000 });
    } else {
      if (typeof applyImportedName === 'function') applyImportedName(res);
    }
    return true;
  }

  /**
   * 导入结果里一般带着姓名（教务系统课表表头就有）。
   * 这里**只把它当作建议**记在课表元数据里，绝不动问候语：
   * 问候语默认永远显示「同学」；想显示自己的名字，去
   * 「修改 → 学期与节次 → 我的名字」自己填一次。
   * 这样做一是尊重本人的选择，二是避免别人拿到这份课表时看到你的名字。
   */
  function rememberImportedName(res) {
    var student = res && res.meta && res.meta.student ? String(res.meta.student).trim() : '';
    if (!student) return;
    CW.store.state.schedule.meta.student = student;
    CW.store.save('schedule');
  }

  function clearHash() {
    try {
      if (window.history && history.replaceState) {
        history.replaceState(null, '', String(location.href).split('#')[0]);
      }
    } catch (e) { /* file:// 下可能不允许，忽略 */ }
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
    buildLoginBookmarklet: buildLoginBookmarklet,
    csvTemplate: csvTemplate,
    hasPending: function () { return !!pending; }
  };
})();
