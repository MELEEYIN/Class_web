/* ==========================================================================
   app.js — 启动、弹窗管理、主题、快捷键、开机动画
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  var stack = [];              // 当前打开的弹窗 id 栈，最后一个是显示中的
  var lastFocus = null;
  var openDrawer = function () {};
  var closeDrawer = function () {};

  /* ======================================================================
     1. 弹窗管理
     ====================================================================== */
  function modalNode(id) {
    return document.getElementById('modal-' + id);
  }

  function isOpen(id) {
    var n = modalNode(id);
    return !!(n && n.classList.contains('open'));
  }

  function openModal(id) {
    var node = modalNode(id);
    if (!node) return;

    if (stack.indexOf(id) >= 0) return;   // 已经开着

    // 把当前显示中的那个藏起来，关闭时再露出来
    var top = stack[stack.length - 1];
    if (top) {
      var topNode = modalNode(top);
      if (topNode) topNode.classList.add('is-behind');
    }

    lastFocus = document.activeElement;

    // 各模块的「打开前」动作
    if (id === 'map' && CW.map) CW.map.onOpen();
    if (id === 'edit' && CW.editUI) CW.editUI.beginSession();
    if (id === 'schedule' && CW.schedule) {
      CW.schedule.setTab(CW.store.state.ui.schedTab || 'month');
      CW.schedule.refresh();
    }
    if (id === 'data' && CW.exporters) {
      CW.exporters.renderDataStats();
      CW.widgets.syncRemindState();
    }
    if (id === 'periods' && CW.exporters) CW.exporters.renderPeriodsModal();
    if (id === 'export' && CW.exporters) CW.exporters.renderIcsPreview();
    if (id === 'remind' && CW.widgets) CW.widgets.syncRemindState();
    if (id === 'bg' && CW.bg) CW.bg.syncControls();

    node.hidden = false;
    // 强制重排，保证 transition 生效
    void node.offsetWidth;
    node.classList.add('open');
    document.body.classList.add('modal-open');
    stack.push(id);

    // 焦点移到弹窗里第一个可交互元素
    setTimeout(function () {
      var focusable = node.querySelector(
        'button:not([disabled]):not([hidden]), [href], input:not([type=hidden]), select, textarea');
      var panel = node.querySelector('.modal-panel');
      if (focusable && panel && panel.contains(focusable)) focusable.focus();
      else if (panel) {
        panel.setAttribute('tabindex', '-1');
        panel.focus();
      }
    }, 60);

    emitOpen(id);
  }

  function closeModal(id) {
    var node = modalNode(id);
    if (!node || !node.classList.contains('open')) return;

    if (id === 'map' && CW.map) CW.map.onClose();

    node.classList.remove('open');
    stack = stack.filter(function (x) { return x !== id; });

    setTimeout(function () {
      if (!node.classList.contains('open')) node.hidden = true;
    }, 300);

    // 露出下面那个
    var top = stack[stack.length - 1];
    if (top) {
      var topNode = modalNode(top);
      if (topNode) topNode.classList.remove('is-behind');
    } else {
      document.body.classList.remove('modal-open');
      if (lastFocus && lastFocus.focus) {
        try { lastFocus.focus(); } catch (e) { /* 忽略 */ }
      }
    }

    emitClose(id);
  }

  function closeTop() {
    var top = stack[stack.length - 1];
    if (top) { closeModal(top); return true; }
    return false;
  }

  /** 供模块监听的开关事件（保持简单，不引入额外依赖） */
  var openHandlers = {}, closeHandlers = {};
  function emitOpen(id) { (openHandlers[id] || []).forEach(function (f) { f(); }); }
  function emitClose(id) { (closeHandlers[id] || []).forEach(function (f) { f(); }); }

  function onOpen(id, fn) { (openHandlers[id] = openHandlers[id] || []).push(fn); }
  function onClose(id, fn) { (closeHandlers[id] = closeHandlers[id] || []).push(fn); }

  /* ======================================================================
     2. 确认框（动态创建，不用在 HTML 里再写一个弹窗）
     ====================================================================== */
  var confirmNode = null;

  function buildConfirm() {
    if (confirmNode) return confirmNode;

    var panel = U.el('div', { class: 'modal-panel mw-sm' });
    confirmNode = U.el('div', {
      class: 'modal', id: 'modal-confirm', role: 'alertdialog', 'aria-modal': 'true',
      'aria-labelledby': 'confirmTitle', hidden: true
    }, [
      U.el('div', { class: 'modal-backdrop', 'data-close': '' }),
      panel
    ]);
    document.body.appendChild(confirmNode);

    confirmNode.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-close]')) closeModal('confirm');
    });
    return confirmNode;
  }

  function confirmThen(message, onOk, okLabel, okClass) {
    var node = buildConfirm();
    var panel = node.querySelector('.modal-panel');

    var okBtn = U.el('button', {
      class: 'btn ' + (okClass || 'btn-primary'), type: 'button',
      text: okLabel || '确定',
      onclick: function () {
        closeModal('confirm');
        setTimeout(function () { if (typeof onOk === 'function') onOk(); }, 120);
      }
    });

    U.render(panel, [
      U.el('div', { class: 'modal-head' }, [
        U.el('span', {
          class: 'lc-icon',
          style: { '--cc': 'var(--warn)', '--cc-soft': 'var(--warn-soft)', width: '34px', height: '34px', borderRadius: '10px', display: 'grid', placeItems: 'center' },
          'aria-hidden': 'true'
        }, [U.icon('i-alert', 'ico')]),
        U.el('div', { class: 'mh-text', style: { marginLeft: '10px' } }, [
          U.el('h2', { id: 'confirmTitle', text: '确认一下' }),
          U.el('p', { id: 'confirmMsg', text: message })
        ])
      ]),
      U.el('div', { class: 'modal-foot' }, [
        U.el('button', { class: 'btn', type: 'button', text: '取消', onclick: function () { closeModal('confirm'); } }),
        okBtn
      ])
    ]);

    openModal('confirm');
    setTimeout(function () { okBtn.focus(); }, 100);
    return true;
  }

  /* ======================================================================
     3. 主题
     ====================================================================== */
  function setTheme(name, persist) {
    document.documentElement.setAttribute('data-theme', name);
    var use = U.$('#themeIco use');
    if (use) use.setAttribute('href', name === 'dark' ? '#i-sun' : '#i-moon');
    var btn = U.$('#themeBtn');
    if (btn) {
      btn.title = name === 'dark' ? '切换到浅色（D）' : '切换到深色（D）';
      btn.setAttribute('aria-label', name === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', name === 'dark' ? '#060d1a' : '#2563eb');

    if (CW.bg) CW.bg.onThemeChange();
    if (persist !== false) {
      try { localStorage.setItem('cw.theme', name); } catch (e) { /* 忽略 */ }
      CW.store.setUI({ theme: name });
    }
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setTheme(next, true);
    U.toast(next === 'dark' ? '已切换到深色主题' : '已切换到浅色主题', 'ok', { timeout: 1500 });
  }

  /* ======================================================================
     4. 导航 / 抽屉 / 滚动
     ====================================================================== */
  function initNav() {
    var nav = U.$('#nav');
    function onScroll() {
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var burger = U.$('#burger');
    var drawer = U.$('#drawer');
    if (!burger || !drawer) return;

    function setDrawer(open) {
      if (open) {
        drawer.hidden = false;
        void drawer.offsetWidth;
        drawer.classList.add('open');
        burger.setAttribute('aria-expanded', 'true');
      } else {
        drawer.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
        setTimeout(function () { if (!drawer.classList.contains('open')) drawer.hidden = true; }, 260);
      }
    }

    openDrawer = function () { setDrawer(true); };
    closeDrawer = function () { setDrawer(false); };

    burger.addEventListener('click', function () {
      setDrawer(!drawer.classList.contains('open'));
    });

    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a, button')) setDrawer(false);
    });

    // 点到别处就收起抽屉。注意要放过「明确用来打开抽屉的东西」——
    // 底部标签栏的「更多」就是其中之一：它先打开抽屉，紧接着这次点击会冒泡到
    // document，如果这里不排除掉，抽屉会开了又立刻关（看起来像点了没反应）。
    document.addEventListener('click', function (e) {
      if (drawer.hidden) return;
      if (!e.target.closest) return;
      if (e.target.closest('#drawer, #burger, #mtabs')) return;
      setDrawer(false);
    });
  }

  /* ======================================================================
     5. 入场动画
     ====================================================================== */
  function initReveal() {
    var nodes = U.$$('[data-reveal]');
    if (U.prefersReducedMotion() || !('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var idx = Number(el.getAttribute('data-reveal-i') || 0);
        el.style.transitionDelay = (idx % 6) * 60 + 'ms';
        el.classList.add('is-visible');
        io.unobserve(el);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

    nodes.forEach(function (n, i) {
      n.setAttribute('data-reveal-i', String(i));
      io.observe(n);
    });
  }

  /* ======================================================================
     6. 快捷键
     ====================================================================== */
  function isTyping(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!el.isContentEditable;
  }

  function initKeys() {
    document.addEventListener('keydown', function (e) {
      // Esc 永远能关掉最上面那个弹窗
      if (e.key === 'Escape') {
        if (stack.length) {
          // 地图弹窗里 Esc 先退出全屏
          if (stack[stack.length - 1] === 'map' &&
              (document.fullscreenElement || document.webkitFullscreenElement)) {
            CW.map.onKey(e);
            return;
          }
          e.preventDefault();
          closeTop();
          return;
        }
        var q = U.$('#q');
        if (q && document.activeElement === q) { q.value = ''; CW.widgets.runSearch(''); q.blur(); }
        return;
      }

      // 地图打开时，方向键 / 加减号交给地图
      if (stack[stack.length - 1] === 'map' && CW.map) {
        if (CW.map.onKey(e)) { e.preventDefault(); return; }
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // 在输入框里打字时不触发
      if (isTyping(document.activeElement)) {
        // 例外：搜索框里的上下键可以跳转
        return;
      }

      // 日程弹窗里的月份 / 周次导航
      var topId = stack[stack.length - 1];
      if (topId === 'schedule') {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          var tab = CW.store.state.ui.schedTab || 'month';
          var dir = e.key === 'ArrowRight' ? 1 : -1;
          if (tab === 'month') {
            CW.schedule.view.calCursor = U.addMonths(CW.schedule.view.calCursor, dir);
            CW.schedule.renderFullCal();
            CW.schedule.renderDayDetail();
          } else if (tab === 'week') {
            CW.schedule.view.weekCursor = (CW.schedule.view.weekCursor || CW.schedule.currentWeek()) + dir;
            CW.schedule.renderTimetable();
          }
          e.preventDefault();
          return;
        }
        if (e.key === 't' || e.key === 'T') {
          CW.schedule.view.calCursor = U.startOfMonth(U.today());
          CW.schedule.view.selDate = U.today();
          CW.schedule.view.weekCursor = CW.schedule.currentWeek();
          CW.schedule.renderFullCal();
          CW.schedule.renderDayDetail();
          CW.schedule.renderTimetable();
          e.preventDefault();
          return;
        }
      }

      switch (e.key) {
        case '/':
          e.preventDefault();
          var q = U.$('#q');
          if (q) { q.focus(); q.select(); }
          break;
        case 'k': case 'K': e.preventDefault(); openModal('schedule'); break;
        case 'm': case 'M': e.preventDefault(); openModal('map'); break;
        case 'i': case 'I': e.preventDefault(); openModal('import'); break;
        case 'd': case 'D': e.preventDefault(); toggleTheme(); break;
        case 't': case 'T':
          e.preventDefault();
          openModal('schedule');
          CW.schedule.openFull(U.today());
          break;
        case '?':
          e.preventDefault();
          openModal('help');
          break;
        default: break;
      }
    });
  }

  /* ======================================================================
     7. [data-open] / [data-close] 统一绑定
     ====================================================================== */
  function initModalTriggers() {
    document.addEventListener('click', function (e) {
      var opener = e.target.closest ? e.target.closest('[data-open]') : null;
      if (opener) {
        var id = opener.getAttribute('data-open');
        if (id) { e.preventDefault(); openModal(id); return; }
      }

      var closer = e.target.closest ? e.target.closest('[data-close]') : null;
      if (closer) {
        e.preventDefault();
        var modal = closer.closest('.modal');
        if (modal && modal.id) closeModal(modal.id.replace(/^modal-/, ''));
      }
    });
  }

  /* ======================================================================
     8. 首次进入
     刻意不放任何示例课表：课表里有姓名、班级、上课时间和教室，
     这个页面是给全班人用的，不能把任何人的真实数据写进网站里。
     没有数据时左栏会显示空状态，引导去「导入」。
     ====================================================================== */
  function firstRun() {
    if (CW.store.stats().hasData) return;

    var hinted = CW.store.state.ui.dismissedHints || {};
    if (hinted.welcomeShown) return;
    CW.store.dismissHint('welcomeShown');

    U.toast('还没有课表。点「导入」上传教务系统导出的文件，或直接粘贴课表页面。', 'info', {
      timeout: 12000,
      action: { label: '现在导入 →', run: function () { openModal('import'); } }
    });
  }

  /* ======================================================================
     9. 启动
     ====================================================================== */
  function boot() {
    CW.store.load();

    // 主题：以 boot.js 已经设好的为准，再同步按钮图标
    var theme = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(theme, false);

    // 各模块
    if (CW.view) CW.view.init();
    if (CW.map) CW.map.init();
    if (CW.bg) CW.bg.init();
    if (CW.importUI) CW.importUI.init();
    if (CW.editUI) CW.editUI.init();
    if (CW.exporters) CW.exporters.init();
    if (CW.widgets) CW.widgets.init();
    if (CW.schedule) { CW.schedule.bind(); CW.store.ensureIds(); CW.schedule.refresh(); }

    initModalTriggers();
    initNav();
    initReveal();
    initKeys();

    // 主题按钮
    var themeBtn = U.$('#themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // 页脚年份
    var year = U.$('#year');
    if (year) year.textContent = String(new Date().getFullYear());

    // 数据变了就刷新视图
    CW.store.on('schedule', function () { if (CW.schedule) CW.schedule.refresh(); });

    // 从书签跳回来带的课表
    var fromBookmark = false;
    try { fromBookmark = CW.importUI.handleHashImport(); } catch (e) { console.error(e); }

    if (!fromBookmark) firstRun();

    // 页面隐藏前把待写入的数据落盘
    window.addEventListener('beforeunload', function () { CW.store.saveNow(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') CW.store.saveNow();
    });

    // 让键盘用户知道有快捷键
    document.body.classList.add('ready');
    console.log('%c校园主页已就绪', 'color:#2563eb;font-weight:700', '\n快捷键：/ 搜索 · K 日程 · M 地图 · I 导入 · D 深色 · ? 帮助');
  }

  /* ======================================================================
     导出
     ====================================================================== */
  CW.app = {
    boot: boot,
    openModal: openModal,
    closeModal: closeModal,
    closeTop: closeTop,
    isOpen: isOpen,
    onOpen: onOpen,
    onClose: onClose,
    confirmThen: confirmThen,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    openDrawer: function () { openDrawer(); },
    closeDrawer: function () { closeDrawer(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
