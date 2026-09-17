/* ==========================================================================
   public.js — 公共事务（全班共用的一份清单）
   用途：班会、考试、报名截止、班级活动这类「全班都要知道」的事务，
        谁打开网站都能看到，点一下就复制进自己的日程（复制之后就是普通事务，可以随便改）。

   内容从哪里来（按顺序尝试）：
     1. 本站后端 /api/public-events —— 主机在「日程 → 修改 → 新增事务」里勾上
        「设为公共事务」就能在线发布，存在 KV 里，全班最先看到的就是这份；
     2. 兜底：站点文件 ./data/public-events.json（主机手工维护、push 生效的那份）。
   两边都读不到时，就只用本地缓存（localStorage）。

   新鲜度（跨设备能不能看到，就看这里）：
     · 打开「公共事务」标签页、以及从后台切回页面，都会去服务器确认一次；
     · 60 秒内不重复请求；但如果本地清单是空的，就一定去问（否则别的设备会一直显示空）；
     · 页面里还有「重新读取」按钮，可以随时强制拉一次最新的。
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  var API_URL = '/api/public-events';                 // 后端（KV，可在线发布）
  var SOURCE_URL = './data/public-events.json';       // 兜底：静态文件
  var PUBLISH_URL = '/api/public-event';              // 发布 / 删除（需要管理密码）
  var KEY_LS = 'adminKey';                            // 和通知后台共用同一把管理密码
  // 注意：U.lsGet/U.lsSet 会自动加上 'cw.' 前缀，所以这里不能写成 'cw.adminKey'，
  // 否则实际读写的是 cw.cw.adminKey，永远读不到后台存的那把密码。
  var FETCHED_FLAG = 'publicFetchedAt';   // localStorage 里的记号：上次成功读取的时间
  // 缓存时间。以前是 10 分钟，结果是：主机在这台设备上次打开后的 10 分钟内发布了新事务，
  // 这台设备（尤其是一直开着或刚刷新过的手机）怎么点都看不到，因为压根没去问服务器。
  // 更糟的是清单为空时也照样信缓存 → 新设备永远停在「暂时没有公共事务」。
  // 现在：60 秒，而且「本地清单是空的」和「手动点重新读取」都会强制去服务器确认。
  var TTL_MS = 60 * 1000;

  var ui = { showImported: false, loading: false };

  var WD = ['一', '二', '三', '四', '五', '六', '日'];

  /* ======================================================================
     1. 读取清单
     ====================================================================== */
  function init() {
    bind();
    // 先渲染一遍缓存里的（页面立刻有内容），再去线上取最新的一份
    render();
    fetchList(false);
    // 手机切走再切回来（或从后台恢复）时，别拿着旧清单不放
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) fetchList(false);
    });
  }

  function fetchList(force) {
    var last = Number(U.lsGet(FETCHED_FLAG, 0)) || 0;
    var empty = CW.store.publicItems().length === 0;
    // 本地一条都没有的时候不信缓存：可能是主机刚发布，这台设备还没读到过
    var fresh = !empty && last && (Date.now() - last < TTL_MS);
    if (fresh && !force) return Promise.resolve(false);

    ui.loading = true;
    if (empty) render();          // 空清单时先给个「正在读取…」，别让人以为真的没有

    // 优先读后端（能在线发布的那份）；后端空或读不到，再回落到静态文件
    return fetchJSON(API_URL)
      .then(function (data) {
        if (data && Array.isArray(data.items) && data.items.length) {
          return applyList(data, 'kv', force);
        }
        return fetchJSON(SOURCE_URL).then(function (fallback) {
          if (!fallback || !Array.isArray(fallback.items)) throw new Error('格式不对');
          return applyList(fallback, fallback.source || 'public-events.json', force);
        });
      })
      .catch(function (err) {
        ui.loading = false;
        console.warn('[CW] public events fetch failed:', err);
        if (force) U.toast('读不到公共事务清单，请检查网络。', 'warn', { timeout: 4200 });
        render();
        return false;
      });
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function applyList(data, source, force) {
    var before = CW.store.publicItems().length;
    var wasLoading = ui.loading;
    ui.loading = false;
    var n = CW.store.setPublicList(data.items, {
      source: source,
      updatedAt: data.updatedAt || ''
    });
    U.lsSet(FETCHED_FLAG, Date.now());

    // 清单有变化、或刚才在转圈、或手动点了重新读取 → 重画
    if (n !== before || force || wasLoading) {
      render();
      if (force) U.toast('公共事务已是最新（共 ' + n + ' 条）', 'ok', { timeout: 2200 });
    }
    return true;
  }

  /* ======================================================================
     1.5 发布 / 删除（主机在「新增事务」里勾上「设为公共事务」时走这里）

     需要管理密码：和通知后台共用 localStorage 里的 cw.adminKey（同一台设备上
     在后台登录过就不用再输）。不是主机的人勾了这个，也会因为密码不对而失败。
     ====================================================================== */
  function adminKey(interactive) {
    var saved = U.lsGet(KEY_LS, '');
    if (saved) return Promise.resolve(saved);
    if (!interactive) return Promise.resolve('');

    // 用页面内弹窗（CW.dialog）：手机上把网站「添加到主屏」后是 standalone 模式，
    // window.prompt 会被系统直接忽略（返回 null），那样这里永远拿不到密码、
    // 勾了「设为公共事务」也发不出去。dialog.js 没加载成功才退回原生弹窗。
    var dlg = window.CW && CW.dialog;
    var ask = (dlg && dlg.text)
      ? dlg.text('发布公共事务需要管理密码（和通知后台同一个）。', {
        password: true, placeholder: '管理密码', okText: '确定',
        hint: '先去「通知后台」登录一次也可以，本机会记住它，之后不用再输。'
      })
      : Promise.resolve((function () {
        try { return window.prompt('发布公共事务需要管理密码（和通知后台同一个）：') || ''; } catch (e) { return ''; }
      })());

    return ask.then(function (typed) {
      typed = String(typed || '').trim();
      if (!typed) {
        // 没拿到密码时给条明路：去后台登录一次，密码会记在本机
        U.toast('没有拿到管理密码：可以先去「通知后台」登录一次，本机会记住它，再回来勾选发布。', 'warn', { timeout: 6000 });
        return '';
      }
      U.lsSet(KEY_LS, typed);
      return typed;
    });
  }

  function publishEvent(item, opts) {
    opts = opts || {};
    return adminKey(true).then(function (key) {
      if (!key) return { ok: false, error: '没有输入管理密码。' };

      return fetch(PUBLISH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cw-key': key },
        body: JSON.stringify({ action: opts.action || 'publish', item: item, id: item && item.id, by: opts.by || '' })
      }).then(function (r) {
        return r.json().catch(function () { return { ok: false, error: '服务器返回的不是 JSON。' }; });
      }).then(function (res) {
        if (res && res.ok) {
          // 发布成功后立刻把最新清单同步到本地缓存并重画
          applyList(res, 'kv', false);
          U.lsSet(FETCHED_FLAG, Date.now());
        } else if (res && res.__status === 401) {
          U.lsDel(KEY_LS);   // 密码不对就别留着，下次重新输
        }
        return res || { ok: false, error: '未知错误' };
      }).catch(function (err) {
        return { ok: false, error: (err && err.message) || String(err) };
      });
    });
  }

  function deleteEvent(id) {
    return publishEvent({ id: id }, { action: 'delete' });
  }

  /* ======================================================================
     2. 渲染（日程弹窗里的「公共事务」标签页）
     ====================================================================== */
  function render() {
    var box = U.$('#pubList');
    if (!box) return;

    var all = CW.store.publicItems();
    var addedCount = CW.store.publicAddedCount();
    var newCount = all.length - addedCount;

    // 标签页上的角标 + 副标题
    var tabCount = U.$('#pubTabCount');
    if (tabCount) {
      tabCount.textContent = String(all.length);
      tabCount.hidden = !all.length;
    }

    var sub = U.$('#pubSub');
    if (sub) {
      sub.textContent = all.length
        ? '共 ' + all.length + ' 条 · 已添加 ' + addedCount + ' 条' + (newCount ? ' · 还有 ' + newCount + ' 条没加' : '')
        : '给全班看的事务清单：班会、考试、报名截止这些。';
    }

    var importBtn = U.$('#pubImportNew');
    if (importBtn) {
      importBtn.disabled = !newCount;
      importBtn.textContent = newCount ? '全部添加到我的日程（' + newCount + '）' : '都已经添加过了';
    }

    var sw = U.$('#pubShowImported');
    if (sw) sw.checked = ui.showImported;

    if (!all.length) {
      U.render(box, U.el('div', { class: 'empty' }, [
        U.icon(ui.loading ? 'i-refresh' : 'i-calendar-plus', 'ico'),
        U.el('strong', { text: ui.loading ? '正在读取公共事务…' : '暂时没有公共事务' }),
        U.el('span', {
          text: ui.loading
            ? '正在从服务器取最新的一份清单。'
            : '主机在「新增事务」里勾上「设为公共事务」之后，这里就会出现全班共用的清单。'
        }),
        U.el('button', {
          class: 'btn btn-sm', type: 'button', style: { marginTop: '4px' },
          disabled: !!ui.loading,
          onclick: function () { fetchList(true); }
        }, [U.icon('i-refresh', 'ico'), ui.loading ? '读取中…' : '重新读取'])
      ]));
      return;
    }

    var list = U.el('div', { class: 'row-list' });
    var hiddenCount = 0;

    all.slice().sort(bySoonest).forEach(function (it) {
      var already = !!CW.store.publicAddedId(it.id);
      if (already && !ui.showImported) { hiddenCount++; return; }
      list.appendChild(publicRow(it, already));
    });

    var nodes = [list];

    if (hiddenCount) {
      nodes.push(U.el('button', {
        class: 'btn btn-sm btn-ghost', type: 'button',
        style: { width: '100%', marginTop: '10px' },
        text: hiddenCount + ' 条已经加进你的日程（点这里显示）',
        onclick: function () { ui.showImported = true; render(); }
      }));
    }

    var src = CW.store.state.public;
    nodes.push(U.el('div', { class: 'card-head', style: { marginTop: '18px' } }, [
      U.el('span', { class: 'small muted' }, [
        U.icon('i-info', 'ico'),
        ' 数据来源：' + (src.source || 'public-events.json') +
        (src.updatedAt ? ' · 更新于 ' + fmtShort(src.updatedAt) : '')
      ]),
      U.el('button', {
        class: 'btn btn-sm btn-ghost', type: 'button',
        onclick: function () { fetchList(true); }
      }, [U.icon('i-refresh', 'ico'), '重新读取'])
    ]));

    U.render(box, nodes);
  }

  /** 排在前面的：先按日期（周事务排最后），再按时间 */
  function bySoonest(a, b) {
    var da = a.kind === 'date' ? a.date : '9999-99-99';
    var db = b.kind === 'date' ? b.date : '9999-99-99';
    if (da !== db) return da < db ? -1 : 1;
    var sa = U.timeToMin(a.start), sb = U.timeToMin(b.start);
    if (sa < 0 && sb < 0) return 0;
    if (sa < 0) return 1;
    if (sb < 0) return -1;
    return sa - sb;
  }

  function whenText(it, occurrences) {
    if (it.kind === 'weekly') {
      var w = '每周' + WD[it.day - 1];
      if (it.weeks && it.weeks.length) {
        var span = CW.parse.compressRanges(it.weeks);
        if (span) return w + ' · ' + span + ' 周';
      }
      return w + '（整学期）';
    }

    var d = U.parseDate(it.date);
    if (!d) return it.date || '日期待定';
    var label = U.fmtCN(d) + ' ' + U.weekdayFull(d) + '（' + U.relativeDay(d) + '）';
    if (it.repeat && it.repeat !== 'none') {
      label += ' · ' + ({ daily: '每天', weekly: '每周', monthly: '每月' }[it.repeat] || '');
    }
    if (occurrences && occurrences.length > 1) label += ' · 共 ' + occurrences.length + ' 次';
    return label;
  }

  function timeText(it) {
    if (!it.start) return it.codes && it.codes.length ? '第 ' + it.codes.join('/') + ' 节' : '全天';
    return it.start + (it.end ? '–' + it.end : '');
  }

  function publicRow(it, already) {
    var occurrences = it.kind === 'date' ? weekdayOccurrences(it) : null;

    var meta = [
      U.el('span', { class: 'mono', text: timeText(it) }),
      U.el('span', { text: whenText(it, occurrences) }),
      it.location ? U.el('span', {}, [U.icon('i-pin', 'ico'), it.location]) : null,
      it.owner ? U.el('span', { text: '发布：' + it.owner }) : null
    ].filter(Boolean);

    var actions = U.el('div', { class: 'ri-actions' }, [
      already
        ? U.el('span', { class: 'badge badge-ok', text: '已添加' })
        : U.el('button', {
          class: 'btn btn-sm btn-primary', type: 'button',
          onclick: function () { addOne(it); }
        }, [U.icon('i-plus', 'ico'), '添加']),
      already
        ? U.el('button', {
          class: 'btn btn-sm btn-ghost', type: 'button', title: '从我的日程里移除',
          onclick: function () { undoOne(it); }
        }, [U.icon('i-trash', 'ico')])
        : null
    ]);

    return U.el('div', { class: 'row-item' + (already ? ' is-dim' : ''), 'data-color': String(it.color) }, [
      U.el('span', { class: 'ri-bar' }),
      U.el('div', { class: 'ri-main' }, [
        U.el('span', { class: 'ri-title', text: it.title }),
        U.el('span', { class: 'ri-meta' }, meta),
        it.note ? U.el('div', { class: 'tiny muted', style: { marginTop: '4px', whiteSpace: 'pre-wrap' }, text: it.note }) : null,
        (it.files && it.files.length && CW.attach) ? CW.attach.render(it.files, { compact: true }) : null
      ]),
      actions
    ]);
  }

  /**
   * 事务的重复规则（每周 / 每天）会在日历上铺开，这里算一下它到底会出现几次，
   * 好让用户加进来之前心里有数。
   */
  function weekdayOccurrences(it) {
    if (!it.repeat || it.repeat === 'none') return [it.date];
    var start = U.parseDate(it.date);
    var until = it.repeatUntil ? U.parseDate(it.repeatUntil) : null;
    if (!start || !until) return null;

    var out = [];
    var step = it.repeat === 'weekly' ? 7 : 1;
    var d = start;
    var guard = 0;
    for (var i = 0; i < 400 && U.diffDays(d, until) >= 0; i++) {
      if (it.repeat === 'monthly') {
        // 每月同一天：这里只做个大致估计，真正的判断在 schedule.eventOn 里
        out.push(U.fmtDate(d));
        d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
      } else {
        out.push(U.fmtDate(d));
        d = U.addDays(d, step);
      }
      if (++guard > 400) break;
    }
    return out.length ? out : [it.date];
  }

  /* ======================================================================
     3. 添加 / 撤销
     ====================================================================== */
  function addOne(it) {
    var e = CW.store.importPublicItem(it.id);
    if (!e) { U.toast('这条事务加不进去，可能格式不对。', 'warn'); return; }
    render();
    U.toast('已添加「' + U.truncate(it.title, 16) + '」到你的日程', 'ok', { timeout: 2600 });
  }

  function undoOne(it) {
    var id = CW.store.publicAddedId(it.id);
    if (!id) return;
    CW.app.confirmThen('从你的日程里移除「' + U.truncate(it.title, 16) + '」？', function () {
      CW.store.removeEvent(id);
      state_unmark(it.id);
      render();
      U.toast('已从你的日程里移除', 'ok', { timeout: 2200 });
    }, '移除', 'btn-danger');
  }

  function state_unmark(id) {
    var added = CW.store.state.public.added;
    if (!added) return;
    delete added[id];
    CW.store.save('public');
    CW.store.emit('public', { reason: 'unmark', id: id });
  }

  function addAllNew() {
    var items = CW.store.publicItems().filter(function (it) { return !CW.store.publicAddedId(it.id); });
    if (!items.length) { U.toast('没有新的事务要添加。', 'info', { timeout: 2000 }); return; }

    CW.app.confirmThen(
      '把这 ' + items.length + ' 条公共事务复制到你的日程？\n\n' +
      items.slice(0, 5).map(function (it) { return '· ' + it.title; }).join('\n') +
      (items.length > 5 ? '\n…还有 ' + (items.length - 5) + ' 条' : ''),
      function () {
        var added = CW.store.importPublicNew();
        render();
        U.toast('已添加 ' + added.length + ' 条到你的日程', 'ok', { timeout: 3200 });
      },
      '全部添加'
    );
  }

  /* ======================================================================
     4. 绑定
     ====================================================================== */
  function bind() {
    var btn = U.$('#pubImportNew');
    if (btn) btn.addEventListener('click', addAllNew);

    var sw = U.$('#pubShowImported');
    if (sw) {
      sw.addEventListener('change', function () {
        ui.showImported = sw.checked;
        render();
      });
    }

    // 别人（导入流程、清空数据等）改了公共事务的标记，跟着重画
    CW.store.on('public', function () { render(); });
    CW.store.on('schedule', function () { render(); });
  }

  function fmtShort(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  CW.publicUI = {
    init: init,
    render: render,
    fetchList: fetchList,
    // 打开「公共事务」标签页时调：带 60 秒节流地确认一次服务器上的最新清单
    refresh: function () { return fetchList(false); },
    // 忽略节流，立刻去服务器拿（「重新读取」按钮用）
    refreshNow: function () { return fetchList(true); },
    addAllNew: addAllNew,
    publishEvent: publishEvent,
    deleteEvent: deleteEvent,
    state: ui
  };
})();
