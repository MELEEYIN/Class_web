/* ==========================================================================
   view.js — 显示模式（手机版 / 电脑版）
     · 默认「自动」：按屏幕宽度 + 是否触屏设备判断，进入时即刻生效
     · 可以手动锁定成手机版或电脑版（存在 localStorage 的 cw.view）
     · 手机版配一条底部标签栏：首页 / 日程 / 待办 / 地图 / 更多
   判断函数写在 boot.js 里（window.CW_RESOLVE_VIEW），因为要赶在首次绘制前用，
   这里只负责读写偏好、同步界面、响应窗口变化。
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  var LS_KEY = 'view';
  var PREFS = ['auto', 'mobile', 'desktop'];

  var state = {
    pref: 'auto',      // 用户的选择
    mode: 'desktop'    // 实际生效的模式
  };

  var el = {};

  function resolve(pref) {
    if (typeof window.CW_RESOLVE_VIEW === 'function') return window.CW_RESOLVE_VIEW(pref);
    // 理论上不会走到这里，留个保底
    return (window.innerWidth || 1024) <= 720 ? 'mobile' : 'desktop';
  }

  function loadPref() {
    var p = U.lsGet(LS_KEY, 'auto');
    if (PREFS.indexOf(p) < 0) p = 'auto';
    state.pref = p;
    return p;
  }

  function label(pref) {
    return { auto: '自动', mobile: '手机版', desktop: '电脑版' }[pref] || pref;
  }

  /* ======================================================================
     应用
     ====================================================================== */
  function apply(reason) {
    var root = document.documentElement;
    var prev = state.mode;
    state.mode = resolve(state.pref);

    root.setAttribute('data-view', state.mode);
    root.setAttribute('data-view-pref', state.pref);
    // 给 iOS / 安卓状态栏用（全屏模式下页面会顶到最上面）
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var dark = root.getAttribute('data-theme') === 'dark';
      meta.setAttribute('content', dark ? (state.mode === 'mobile' ? '#0e1c30' : '#060d1a') : '#2563eb');
    }

    syncUI();

    if (prev !== state.mode) {
      // 布局变了，地图那类按像素计算的东西要重新适应
      if (CW.map && CW.app && CW.app.isOpen('map')) setTimeout(function () { CW.map.fit(true); }, 80);
      if (CW.schedule) CW.schedule.refresh();
      if (CW.widgets && CW.widgets.renderDash) CW.widgets.renderDash();
      document.dispatchEvent(new CustomEvent('cw:viewchange', { detail: { mode: state.mode, pref: state.pref } }));
    }

    return state.mode;
  }

  function setPref(pref, opts) {
    if (PREFS.indexOf(pref) < 0) pref = 'auto';
    state.pref = pref;
    U.lsSet(LS_KEY, pref);
    apply('setPref');
    if (!opts || opts.silent !== true) {
      var m = state.mode;
      U.toast('显示模式：' + label(pref) + (pref === 'auto' ? '（当前判定为' + label(m) + '）' : ''), 'ok', { timeout: 2000 });
    }
    return state.mode;
  }

  function toggleQuick() {
    // 「更多」里的一键切换：在手机版和电脑版之间直接翻
    setPref(state.mode === 'mobile' ? 'desktop' : 'mobile');
  }

  /* ======================================================================
     界面同步（设置里的三段控件 + 抽屉里的一键按钮 + 提示文案）
     ====================================================================== */
  function syncUI() {
    U.$$('#viewSeg button').forEach(function (b) {
      var on = b.getAttribute('data-view-pref') === state.pref;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    var hint = U.$('#viewHint');
    if (hint) {
      var vw = window.innerWidth || 0;
      var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
      var why = state.pref === 'auto'
        ? '当前自动判定为「' + label(state.mode) + '」：窗口宽 ' + vw + 'px' +
          (touch ? '，且检测到触摸屏' : '，未检测到触摸屏') + '。'
        : '已手动锁定为「' + label(state.mode) + '」，不会随窗口变化。';
      hint.textContent = why + ' 手机版会把入口收成紧凑列表、把日程提到最前，并在底部加一条导航栏。';
    }

    var quick = U.$('#viewQuick');
    if (quick) {
      var to = state.mode === 'mobile' ? '电脑版' : '手机版';
      U.render(quick, [
        U.icon(state.mode === 'mobile' ? 'i-monitor' : 'i-smartphone', 'ico'),
        U.el('span', { text: '切换到' + to })
      ]);
    }

    // 底部标签栏的待办角标
    var badge = U.$('#mtabsTodo');
    if (badge) {
      var st = CW.store.stats();
      var n = st.todo - st.todoDone;
      badge.hidden = !n;
      badge.textContent = n > 99 ? '99+' : String(n);
    }

    syncTabs();
  }

  /* ======================================================================
     底部标签栏
     ====================================================================== */
  var TAB_TARGETS = {
    home: function () { window.scrollTo({ top: 0, behavior: 'smooth' }); },
    schedule: function () { CW.schedule.openFull(U.today()); },
    todo: function () {
      var card = U.$('#todoCard');
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () {
        var input = U.$('#todoInput');
        if (input && window.innerWidth > 360) input.focus();
      }, 400);
    },
    map: function () { CW.app.openModal('map'); },
    // 「更多」是开关：再点一下要能收回去（以前只开不关，面板又占满屏幕 → 退不出去）
    more: function () { CW.app.toggleDrawer ? CW.app.toggleDrawer() : CW.app.openDrawer(); }
  };

  function syncTabs() {
    // 弹窗打开时，把对应标签点亮
    var active = null;
    if (CW.app && CW.app.isOpen('map')) active = 'map';
    else if (CW.app && CW.app.isOpen('schedule')) active = 'schedule';
    else if (window.scrollY < 120) active = 'home';

    U.$$('.mtab').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-mtab') === active);
    });
  }

  function bind() {
    el.mtabs = U.$('#mtabs');

    if (el.mtabs) {
      el.mtabs.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-mtab]') : null;
        if (!btn) return;
        var key = btn.getAttribute('data-mtab');
        var fn = TAB_TARGETS[key];
        if (!fn) return;
        e.preventDefault();
        // 点任何标签都先收起抽屉，免得抽屉压在内容上又挡着操作
        if (key !== 'more' && CW.app && CW.app.closeDrawer) CW.app.closeDrawer();
        // 有点按反馈
        btn.classList.add('is-active');
        fn();
      });
    }

    // 设置里的三段控件
    U.$$('#viewSeg button').forEach(function (b) {
      b.addEventListener('click', function () { setPref(b.getAttribute('data-view-pref')); });
    });

    // 抽屉里的一键切换
    var quick = U.$('#viewQuick');
    if (quick) quick.addEventListener('click', toggleQuick);

    // 窗口变化：只在「自动」模式下重新判断
    var onResize = U.debounce(function () {
      if (state.pref === 'auto') apply('resize');
      else syncUI();
    }, 150);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 260); });

    // 滚动时更新标签栏高亮
    window.addEventListener('scroll', U.throttle(syncTabs, 220), { passive: true });

    // 弹窗开关也影响高亮
    if (CW.app && CW.app.onOpen) {
      ['map', 'schedule'].forEach(function (id) {
        CW.app.onOpen(id, function () { setTimeout(syncTabs, 60); });
        CW.app.onClose(id, function () { setTimeout(syncTabs, 60); });
      });
    }

    // 待办数量变化 → 更新角标
    CW.store.on('todo', syncUI);

    // 监听系统的深浅色变化（只影响 theme-color，主题本身由用户决定）
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', syncUI);
    }

    apply('bind');
  }

  /* ======================================================================
     初始化
     ====================================================================== */
  function init() {
    // boot.js 已经算过一次并写进 data-view 了，这里以文件里的偏好为准再同步一次
    var bootPref = document.documentElement.getAttribute('data-view-pref');
    var stored = U.lsGet(LS_KEY, null);
    if (PREFS.indexOf(stored) >= 0) state.pref = stored;
    else if (bootPref === 'mobile' || bootPref === 'desktop') state.pref = bootPref;
    else state.pref = 'auto';

    state.mode = document.documentElement.getAttribute('data-view') || resolve(state.pref);
    bind();
    return state;
  }

  CW.view = {
    init: init,
    apply: apply,
    setPref: setPref,
    toggleQuick: toggleQuick,
    label: label,
    PREFS: PREFS,
    get pref() { return state.pref; },
    get mode() { return state.mode; },
    isMobile: function () { return state.mode === 'mobile'; }
  };
})();
