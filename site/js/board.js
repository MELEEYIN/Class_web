/* ==========================================================================
   board.js — 问题反馈 + 投票（全班公开）

   · 反馈：所有人可提、可回复；删除要管理密码
   · 投票：结果实时公开；**只有管理密码能建/改/结束**；同学只能投
   · 「每人一次」用设备标记（cw.device，浏览器本地随机 id）：
     能挡误触和重复点击，挡不住「换个浏览器再投」——界面上写清楚
   数据都在站点自己的 KV 里（/api/feedback、/api/polls），不经过第三方。
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  var state = { feedback: [], polls: [], loaded: false, busy: false, lastFeedbackAt: 0 };
  var FB_COOLDOWN_MS = 30 * 1000;      // 同设备 30 秒防刷

  /* ---------------- 设备标记 ---------------- */
  function deviceId() {
    var id = U.lsGet('device', '');
    if (!/^d_[A-Za-z0-9]{6,32}$/.test(String(id || ''))) {
      var rand = '';
      var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      for (var i = 0; i < 16; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
      id = 'd_' + rand;
      U.lsSet('device', id);
    }
    return id;
  }

  function adminKey() { return U.lsGet('adminKey', '') || ''; }

  function askKey(msg) {
    var dlg = window.CW && CW.dialog;
    if (dlg && dlg.text) {
      return dlg.text(msg || '这一步需要管理密码（和通知后台同一个）。', {
        password: true, placeholder: '管理密码', okText: '确定'
      }).then(function (v) { return String(v || '').trim(); });
    }
    try { return Promise.resolve(String(window.prompt(msg || '管理密码：') || '').trim()); }
    catch (e) { return Promise.resolve(''); }
  }

  function rel(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    if (min < 60 * 24) return Math.floor(min / 60) + ' 小时前';
    if (min < 60 * 24 * 30) return Math.floor(min / 1440) + ' 天前';
    var d = new Date(t);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  /* ---------------- 数据 ---------------- */
  function load(force) {
    var jobs = [
      fetch('/api/feedback', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch('/api/polls', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; })
    ];
    return Promise.all(jobs).then(function (res) {
      if (res[0] && res[0].ok) state.feedback = res[0].items || [];
      if (res[1] && res[1].ok) state.polls = res[1].items || [];
      state.loaded = true;
      renderAll();
    });
  }

  /* ---------------- 反馈 ---------------- */
  function sendFeedback() {
    var textEl = U.$('#fbText');
    var byEl = U.$('#fbBy');
    var text = (textEl ? textEl.value : '').trim();
    if (!text) { U.toast('先写点内容吧。', 'warn'); if (textEl) textEl.focus(); return; }
    var wait = FB_COOLDOWN_MS - (Date.now() - state.lastFeedbackAt);
    if (wait > 0) { U.toast('刚提交过，' + Math.ceil(wait / 1000) + ' 秒后再发。', 'warn'); return; }
    state.busy = true;
    fetch('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'add', text: text, by: byEl ? byEl.value.trim() : '' })
    }).then(function (r) { return r.json(); }).then(function (res) {
      state.busy = false;
      if (!res || !res.ok) { U.toast((res && res.error) || '提交失败。', 'error', { timeout: 5000 }); return; }
      state.lastFeedbackAt = Date.now();
      state.feedback = res.items || [];
      if (textEl) textEl.value = '';
      renderAll();
      U.toast('已提交，全班都能看到', 'ok');
    }).catch(function (e) {
      state.busy = false;
      U.toast('连不上服务器：' + ((e && e.message) || e), 'error', { timeout: 5000 });
    });
  }

  function replyFeedback(id, text, inputEl) {
    text = (text || '').trim();
    if (!text) { U.toast('回复不能为空。', 'warn'); return; }
    fetch('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'reply', id: id, reply: { text: text, by: (U.$('#fbBy') || {}).value || '' } })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.ok) { U.toast((res && res.error) || '回复失败。', 'error', { timeout: 5000 }); return; }
      state.feedback = res.items || [];
      if (inputEl) inputEl.value = '';
      renderAll();
      U.toast('已回复', 'ok');
    }).catch(function (e) { U.toast('连不上服务器：' + ((e && e.message) || e), 'error'); });
  }

  function deleteFeedback(id, hadKey) {
    var run = function (key) {
      fetch('/api/feedback', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: id, key: key })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res || !res.ok) { U.toast((res && res.error) || '删除失败。', 'error', { timeout: 5000 }); return; }
        state.feedback = res.items || [];
        renderAll();
        U.toast('已删除', 'ok');
      }).catch(function (e) { U.toast('连不上服务器：' + ((e && e.message) || e), 'error'); });
    };
    var msg = '删除这条反馈（连同它的回复）？';
    var after = function (yes) {
      if (!yes) return;
      var saved = adminKey();
      if (hadKey && saved) run(saved);
      else askKey('删除反馈需要管理密码：').then(function (k) {
        if (!k) { U.toast('没有密码，取消删除。', 'warn'); return; }
        U.lsSet('adminKey', k);
        run(k);
      });
    };
    if (CW.dialog && CW.dialog.confirm) CW.dialog.confirm(msg, { danger: true, okText: '删除' }).then(after);
    else after(window.confirm(msg));
  }

  function feedbackItem(it) {
    var replyBox = U.el('div', { class: 'fb-replies' }, (it.replies || []).map(function (r) {
      return U.el('div', { class: 'fb-reply' }, [
        U.el('span', { class: 'fb-reply-by', text: r.by + '：' }),
        U.el('span', { class: 'fb-reply-text', text: r.text }),
        U.el('span', { class: 'tiny faint', text: ' · ' + rel(r.at) })
      ]);
    }));

    var input = U.el('input', { class: 'input', type: 'text', maxlength: 200, placeholder: '回复…' });
    var row = U.el('div', { class: 'fb-reply-row' }, [
      input,
      U.el('button', {
        class: 'btn btn-sm', type: 'button', text: '回复',
        onclick: function () { replyFeedback(it.id, input.value, input); }
      })
    ]);

    var head = U.el('div', { class: 'fb-head' }, [
      U.el('span', { class: 'fb-by', text: it.by }),
      U.el('span', { class: 'tiny faint', text: rel(it.at) }),
      U.el('button', {
        class: 'btn btn-sm btn-ghost fb-del', type: 'button', title: '删除（需要管理密码）',
        onclick: function () { deleteFeedback(it.id, !!adminKey()); }
      }, [U.icon('i-trash', 'ico')])
    ]);

    return U.el('article', { class: 'fb-item' }, [
      head,
      U.el('p', { class: 'fb-text', text: it.text }),
      (it.replies || []).length ? replyBox : null,
      row
    ]);
  }

  function renderFeedback() {
    var box = U.$('#fbList');
    if (!box) return;
    if (!state.feedback.length) {
      U.render(box, U.el('div', { class: 'empty' }, [
        U.icon('i-note', 'ico'),
        U.el('strong', { text: '还没有人提过意见' }),
        U.el('span', { text: '你可以提第一条 —— 全班都能看到，也都能回复。' })
      ]));
      return;
    }
    U.render(box, U.el('div', { class: 'fb-list' }, state.feedback.map(feedbackItem)));
  }

  /* ---------------- 投票 ---------------- */
  function pollCounts(poll) {
    var counts = {};
    poll.options.forEach(function (o) { counts[o.id] = 0; });
    Object.keys(poll.votes || {}).forEach(function (dev) {
      (poll.votes[dev] || []).forEach(function (id) { if (counts[id] !== undefined) counts[id]++; });
    });
    return counts;
  }
  function myVote(poll) { return (poll.votes || {})[deviceId()] || null; }
  function totalVotes(poll) { return Object.keys(poll.votes || {}).length; }
  function isOver(poll) {
    if (poll.closed) return true;
    if (poll.until) {
      var t = Date.parse(poll.until);
      if (!isNaN(t) && Date.now() > t) return true;
    }
    return false;
  }

  function vote(poll, choices) {
    fetch('/api/poll-vote', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pollId: poll.id, device: deviceId(), choices: choices })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.ok) { U.toast((res && res.error) || '投票失败。', 'warn', { timeout: 5200 }); return; }
      state.polls = res.items || state.polls;
      renderAll();
      U.toast('投票成功', 'ok');
    }).catch(function (e) { U.toast('连不上服务器：' + ((e && e.message) || e), 'error'); });
  }

  function pollCard(poll, compact) {
    var counts = pollCounts(poll);
    var total = totalVotes(poll);
    var mine = myVote(poll);
    var over = isOver(poll);
    var canVote = !over && !(poll.once && mine);

    var picked = {};
    (mine || []).forEach(function (id) { picked[id] = 1; });
    var pending = {};

    var rows = poll.options.map(function (o) {
      var n = counts[o.id] || 0;
      var pct = total ? Math.round((n / total) * 100) : 0;

      if (!canVote) {
        return U.el('div', { class: 'poll-row is-static' + (picked[o.id] ? ' is-mine' : '') }, [
          U.el('span', { class: 'poll-label', text: o.label }),
          U.el('span', { class: 'poll-num', text: n + ' 票 · ' + pct + '%' }),
          U.el('span', { class: 'poll-bar' }, [U.el('i', { style: { width: pct + '%' } })])
        ]);
      }

      var row = U.el('button', { class: 'poll-row', type: 'button' }, [
        U.el('span', { class: 'poll-label', text: o.label }),
        U.el('span', { class: 'poll-num', text: n + ' 票 · ' + pct + '%' }),
        U.el('span', { class: 'poll-bar' }, [U.el('i', { style: { width: pct + '%' } })])
      ]);
      row.addEventListener('click', function () {
        if (!poll.multi) { vote(poll, [o.id]); return; }
        if (pending[o.id]) { delete pending[o.id]; row.classList.remove('is-picked'); }
        else {
          var pickedCount = Object.keys(pending).length;
          var limit = Math.max(1, Math.min(poll.maxChoices || 1, poll.options.length));
          if (pickedCount >= limit) { U.toast('最多选 ' + limit + ' 项', 'warn', { timeout: 2600 }); return; }
          pending[o.id] = 1;
          row.classList.add('is-picked');
        }
        var btn = row.parentNode && row.parentNode.querySelector('.poll-submit');
        if (btn) btn.disabled = !Object.keys(pending).length;
      });
      return row;
    });

    var footer = [];
    if (poll.multi && canVote) {
      footer.push(U.el('button', {
        class: 'btn btn-sm btn-primary poll-submit', type: 'button', disabled: true, text: '提交',
        onclick: function () { vote(poll, Object.keys(pending)); }
      }));
    }
    if (poll.until) footer.push(U.el('span', { class: 'tiny faint', text: '截止 ' + String(poll.until).replace('T', ' ').slice(0, 16) }));
    if (over) footer.push(U.el('span', { class: 'badge badge-plain', text: '已结束' }));
    else if (poll.once && mine) footer.push(U.el('span', { class: 'badge badge-ok', text: '你已投票' }));
    if (poll.multi && !over) footer.push(U.el('span', { class: 'tiny faint', text: '最多选 ' + Math.max(1, Math.min(poll.maxChoices || 1, poll.options.length)) + ' 项' }));

    return U.el('article', { class: 'poll-card' + (compact ? ' is-compact' : '') }, [
      U.el('div', { class: 'poll-head' }, [
        U.el('b', { class: 'poll-title', text: poll.title }),
        U.el('span', { class: 'poll-total tiny faint', text: total + ' 人已投' })
      ]),
      poll.desc && !compact ? U.el('p', { class: 'hint', text: poll.desc }) : null,
      U.el('div', { class: 'poll-rows' }, rows),
      footer.length ? U.el('div', { class: 'poll-foot' }, footer) : null
    ]);
  }

  function renderPolls() {
    var box = U.$('#pollList');
    if (box) {
      var list = state.polls.slice();
      if (!list.length) {
        U.render(box, U.el('div', { class: 'empty' }, [
          U.icon('i-chart', 'ico'),
          U.el('strong', { text: '还没有投票' }),
          U.el('span', { text: '在下面建一个，全班就能投了（结果实时公开）。' })
        ]));
      } else {
        U.render(box, U.el('div', { class: 'poll-list' }, list.map(function (p) { return pollCard(p, false); })));
      }
    }

    var badge = U.$('#pollCount');
    if (badge) badge.textContent = state.polls.filter(function (p) { return !isOver(p); }).length + ' 个进行中';
    var fbBadge = U.$('#fbCount');
    if (fbBadge) fbBadge.textContent = state.feedback.length + ' 条';

    renderMini();
  }

  /** 时钟卡旁边那张「实时投票」小卡 */
  function renderMini() {
    var box = U.$('#pollMini');
    if (!box) return;
    var open = state.polls.filter(function (p) { return !isOver(p); });
    if (!open.length) { box.hidden = true; return; }

    var poll = open[0];
    box.hidden = false;
    var title = U.$('#pollMiniTitle');
    if (title) title.textContent = poll.title;
    var cnt = U.$('#pollMiniCount');
    if (cnt) cnt.textContent = totalVotes(poll) + ' 人已投';

    var body = U.$('#pollMiniBody');
    if (body) U.render(body, pollCard(poll, true));

    if (open.length > 1) {
      var more = U.el('button', {
        class: 'btn btn-sm btn-ghost', type: 'button', style: { marginTop: '6px' },
        text: '还有 ' + (open.length - 1) + ' 个投票',
        onclick: function () { CW.app.openModal('poll'); }
      });
      body.appendChild(more);
    }
  }

  /* ---------------- 建投票 ---------------- */
  function createPoll() {
    var title = (U.$('#pollNewTitle') || {}).value || '';
    var desc = (U.$('#pollNewDesc') || {}).value || '';
    var rawOpts = (U.$('#pollNewOptions') || {}).value || '';
    var until = (U.$('#pollNewUntil') || {}).value || '';
    var multi = !!(U.$('#pollNewMulti') || {}).checked;
    var once = (U.$('#pollNewOnce') || {}).checked !== false;
    var maxChoices = Number((U.$('#pollNewMax') || {}).value || 1);

    var options = rawOpts.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (label) { return { label: label }; });
    if (!title.trim()) { U.toast('标题要填。', 'warn'); return; }
    if (options.length < 2) { U.toast('至少两个选项。', 'warn'); return; }

    var item = { title: title, desc: desc, options: options, multi: multi, maxChoices: multi ? maxChoices : 1, once: once, until: until };

    var doCreate = function (key) {
      fetch('/api/poll', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-cw-key': key },
        body: JSON.stringify({ action: 'save', item: item })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res || !res.ok) { U.toast((res && res.error) || '创建失败。', 'error', { timeout: 5200 }); return; }
        state.polls = res.items || [];
        ['#pollNewTitle', '#pollNewDesc', '#pollNewOptions', '#pollNewUntil'].forEach(function (sel) {
          var el = U.$(sel); if (el) el.value = '';
        });
        renderAll();
        U.toast('投票已创建，全班可以投了', 'ok');
      }).catch(function (e) { U.toast('连不上服务器：' + ((e && e.message) || e), 'error'); });
    };

    var saved = adminKey();
    if (saved) doCreate(saved);
    else askKey('建投票需要管理密码（和通知后台同一个）：').then(function (k) {
      if (!k) { U.toast('没有密码，取消创建。', 'warn'); return; }
      U.lsSet('adminKey', k);
      doCreate(k);
    });
  }

  /* ---------------- 渲染入口 ---------------- */
  function renderAll() { renderFeedback(); renderPolls(); }

  function init() {
    deviceId();                       // 保证设备标记存在
    var send = U.$('#fbSend');
    if (send) send.addEventListener('click', sendFeedback);
    var create = U.$('#pollCreate');
    if (create) create.addEventListener('click', createPoll);
    var multiBox = U.$('#pollNewMulti');
    if (multiBox) multiBox.addEventListener('change', function () {
      var maxEl = U.$('#pollNewMax');
      if (maxEl) maxEl.disabled = !multiBox.checked;
    });
    load(true);
    // 打开这两个弹窗时顺手刷新一次
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-open="feedback"],[data-open="poll"]') : null;
      if (t) load(false);
    });
  }

  CW.board = { init: init, load: load, render: renderAll, state: state, deviceId: deviceId };
})();
