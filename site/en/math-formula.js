/* ==========================================================================
   math-formula.js — 公式总表的即时搜索
   --------------------------------------------------------------------------
   只做一件事：边输入边过滤表格行，并把「整张表没有命中」「整组没有命中」
   一起隐藏，避免只剩一堆空标题。
   搜索是纯前端过滤，没有索引、没有网络请求；248 条全部在 DOM 里，
   一次遍历的成本可以忽略。
   ========================================================================== */
(function () {
  'use strict';

  var input = document.getElementById('fxQ');
  var meta = document.getElementById('fxMeta');
  var clearBtn = document.getElementById('fxClear');
  var empty = document.getElementById('fxEmpty');
  if (!input) return;

  var rows = [].slice.call(document.querySelectorAll('tr[data-fx]'));
  var blocks = [].slice.call(document.querySelectorAll('.fx-block'));
  var groups = [].slice.call(document.querySelectorAll('.unit.fx'));
  var total = rows.length;

  /* 预先算出每行的可搜索文本：公式 + 说明，去掉多余空白，转小写 */
  rows.forEach(function (tr) {
    tr.__t = (tr.textContent || '').replace(/\s+/g, '').toLowerCase();
  });

  var pending = 0;   // 用定时器而不是 rAF：后台标签页 / 无头环境会暂停 rAF

  function apply() {
    var raw = input.value.trim();
    var q = raw.replace(/\s+/g, '').toLowerCase();
    var hit = 0;

    if (!q) {
      rows.forEach(function (tr) {
        tr.hidden = false;
        tr.classList.remove('hit');
      });
      blocks.forEach(function (b) { b.classList.remove('is-empty'); });
      groups.forEach(function (g) { g.classList.remove('is-empty'); });
      document.documentElement.classList.remove('fx-searching');
      meta.textContent = '共 ' + total + ' 条';
      if (clearBtn) clearBtn.hidden = true;
      if (empty) empty.hidden = true;
      return;
    }

    rows.forEach(function (tr) {
      var ok = tr.__t.indexOf(q) >= 0;
      tr.hidden = !ok;
      tr.classList.toggle('hit', ok);
      if (ok) hit++;
    });

    blocks.forEach(function (b) {
      b.classList.toggle('is-empty', !b.querySelector('tr[data-fx]:not([hidden])'));
    });
    groups.forEach(function (g) {
      g.classList.toggle('is-empty', !g.querySelector('tr[data-fx]:not([hidden])'));
    });

    document.documentElement.classList.add('fx-searching');
    meta.textContent = hit + ' / ' + total + ' 条';
    if (clearBtn) clearBtn.hidden = false;
    if (empty) empty.hidden = hit > 0;
  }

  input.addEventListener('input', function () {
    if (pending) return;
    pending = setTimeout(function () {
      pending = 0;
      apply();
    }, 16);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      input.value = '';
      apply();
      input.blur();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      input.value = '';
      apply();
      input.focus();
    });
  }

  /* 页面里 Ctrl/⌘+K 已经绑给侧栏搜索，这里给 "/" 一个入口 */
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input &&
        !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  apply();
})();
