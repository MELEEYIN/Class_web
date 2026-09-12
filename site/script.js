/* ===========================================================
   我的主页 —— 交互脚本
   1) 手机端菜单开关
   2) 深色 / 浅色主题切换（记住选择）
   3) 滚动时导航栏描边
   4) 元素滚动出现动画
   5) 导航高亮当前区块
   6) 自动显示年份 / 建站天数
   =========================================================== */

(function () {
  'use strict';

  /* ---------- 1. 手机端菜单 ---------- */
  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('navMenu');

  function closeMenu() {
    if (!menu) return;
    menu.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // 点菜单里的链接后自动收起
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') closeMenu();
    });
    // 点了别处也收起
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target) && !toggle.contains(e.target)) closeMenu();
    });
    // 按 Esc 收起
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ---------- 2. 主题切换 ---------- */
  var root = document.documentElement;
  var themeBtn = document.getElementById('themeToggle');
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (err) { /* 隐私模式下忽略 */ }

  var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  setTheme(saved || (prefersLight ? 'light' : 'dark'));

  function setTheme(name) {
    root.setAttribute('data-theme', name);
    if (themeBtn) {
      var icon = themeBtn.querySelector('.theme-icon');
      if (icon) icon.textContent = name === 'light' ? '☀️' : '🌙';
      themeBtn.title = name === 'light' ? '切换到深色主题' : '切换到浅色主题';
    }
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      setTheme(next);
      try { localStorage.setItem('theme', next); } catch (err) { /* 忽略 */ }
    });
  }

  /* ---------- 3. 滚动时给导航加描边 ---------- */
  var nav = document.getElementById('nav');
  function onScroll() {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 4. 滚动出现动画 ---------- */
  var revealables = document.querySelectorAll('[data-reveal]');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    // 不支持或被要求减少动效：直接全部显示
    Array.prototype.forEach.call(revealables, function (el) {
      el.classList.add('is-visible');
    });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    Array.prototype.forEach.call(revealables, function (el, i) {
      // 依次出现，看起来更顺
      el.style.transitionDelay = Math.min(i % 6, 5) * 70 + 'ms';
      io.observe(el);
    });
  }

  /* ---------- 5. 导航高亮当前区块 ---------- */
  var sections = document.querySelectorAll('main section[id]');
  var navLinks = menu ? menu.querySelectorAll('a[href^="#"]') : [];

  if (sections.length && navLinks.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        Array.prototype.forEach.call(navLinks, function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + id);
        });
      });
    }, { threshold: 0.35 });

    Array.prototype.forEach.call(sections, function (s) { spy.observe(s); });
  }

  /* ---------- 6. 年份 & 建站天数 ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // 想改建站日期，就改下面这一行（年, 月-1, 日）
  var LAUNCH = new Date(2026, 8, 12);
  var daysEl = document.getElementById('statDays');
  if (daysEl) {
    var days = Math.floor((Date.now() - LAUNCH.getTime()) / 86400000) + 1;
    // 同一天显示 1，不会显示 0 或负数
    daysEl.textContent = String(days > 0 ? days : 1);
  }
})();
