// ==UserScript==
// @name         超星学习通 · 视频倍速助手
// @namespace    https://leeyin.xyz/cx-speed
// @version      1.9.0
// @description  为超星慕课/学习通课程视频添加自定义倍速（自动覆盖内嵌 ananas iframe 播放器），支持自动静音、防暂停（移开鼠标/最小化/切标签页）、播完自动下一节、含测验章节跳过并记录、优先从目录直连跳转绕开确认框、快捷键与设置记忆
// @author       leeyin
// @match        *://*.chaoxing.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /* ===================== 配置 ===================== */
  const KEY_RATE = 'cx_speed_rate_v1';
  const KEY_AMUTE = 'cx_speed_amute_v2';
  const KEY_ANEXT = 'cx_speed_anext_v2';
  const KEY_APAUSE = 'cx_speed_apause_v2';
  const KEY_SKIPPED = 'cx_speed_skipped_v1';
  const KEY_ASKIP = 'cx_speed_askip_v1';
  const KEY_PLAYTS = 'cx_speed_playts_v1';
  const KEY_APLAY = 'cx_speed_aplay_v1';
  const KEY_TS = 'cx_speed_next_ts_v2';

  const MIN_RATE = 0.5;
  const MAX_RATE = 4;
  const STEP = 0.25;
  const SAFE_RATE = 2;      // 平台官方支持的上限，超过只提示不阻止
  const NEXT_DELAY = 1200;  // 播完后延迟多久切下一节（ms）
  const NEXT_COOLDOWN = 4000;

  const PRESETS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

  /* ===================== 状态 ===================== */
  let targetRate = 1;
  let autoMute = true;
  let autoNext = true;
  let antiPause = true;
  let chapterHasAssess = false;
  let skippedCount = 0;
  let lastJumpMsg = '';
  let autoSkipDone = true;
  let skipAssessKey = '';
  let autoSkipCount = 0;
  let autoPlayOn = true;
  let isTop = false;
  try { isTop = window.self === window.top; } catch (e) { isTop = false; }

  const clampRate = (v) => {
    v = Number(v);
    if (!isFinite(v)) return 1;
    v = Math.round(v / STEP) * STEP;
    return Math.min(MAX_RATE, Math.max(MIN_RATE, v));
  };

  const readStore = (k, d) => {
    try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  };
  const writeStore = (k, v) => {
    try { localStorage.setItem(k, String(v)); } catch (e) {}
  };

  targetRate = clampRate(readStore(KEY_RATE, 1));
  autoMute = readStore(KEY_AMUTE, '1') === '1';
  autoNext = readStore(KEY_ANEXT, '1') === '1';
  antiPause = readStore(KEY_APAUSE, '1') === '1';
  autoSkipDone = readStore(KEY_ASKIP, '1') === '1';
  autoPlayOn = readStore(KEY_APLAY, '1') === '1';
  skippedCount = readSkipped().length;

  /* ===================== 1. 锁定 playbackRate =====================
     超星播放器会在初始化、seek、切集时把倍速写回 1，
     所以必须在 document-start 改写原型 setter，
     让任何赋值最终都落到我们设定的倍速上。                       */
  (function lockPlaybackRate() {
    try {
      const proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
      if (!proto || proto.__cxSpeedLocked) return;
      const desc = Object.getOwnPropertyDescriptor(proto, 'playbackRate');
      if (!desc || !desc.set) return;
      Object.defineProperty(proto, 'playbackRate', {
        configurable: true,
        enumerable: desc.enumerable,
        get() { return desc.get.call(this); },
        set() { desc.set.call(this, targetRate); }
      });
      proto.__cxSpeedLocked = true;
    } catch (e) { /* 沙箱 iframe 不允许改写时退化为轮询 */ }
  })();

  /* ===================== 2. 视频接管 ===================== */
  function enforce(v) {
    if (!v || v.tagName !== 'VIDEO') return;
    try {
      if (Math.abs(v.playbackRate - targetRate) > 1e-3) v.playbackRate = targetRate;
      if (Math.abs(v.defaultPlaybackRate - targetRate) > 1e-3) v.defaultPlaybackRate = targetRate;
      autoMuteIfNeeded(v);
      if (!v.__cxBound) {
        v.__cxBound = true;
        v.addEventListener('ratechange', function () {
          if (Math.abs(v.playbackRate - targetRate) > 1e-3) {
            try {
              Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate').set.call(v, targetRate);
            } catch (e) { v.playbackRate = targetRate; }
          }
        });
      }
    } catch (e) {}
  }

  // 每个视频元素只自动静音一次，避免持续覆盖用户手动调音
  function autoMuteIfNeeded(v) {
    if (!autoMute || v.__cxMutedOnce) return;
    v.__cxMutedOnce = true;
    try { v.muted = true; } catch (e) {}
  }

  function scan() {
    let list;
    try { list = document.getElementsByTagName('video'); } catch (e) { return; }
    for (let i = 0; i < list.length; i++) enforce(list[i]);
  }

  try {
    new MutationObserver(() => scan()).observe(document.documentElement, {
      childList: true, subtree: true
    });
  } catch (e) {}

  ['play', 'playing', 'loadedmetadata', 'ratechange', 'seeking', 'timeupdate'].forEach((ev) => {
    document.addEventListener(ev, (e) => {
      const t = e.target;
      if (!t || t.tagName !== 'VIDEO') return;
      if (ev === 'timeupdate') {
        if (Math.abs(t.playbackRate - targetRate) > 1e-3) enforce(t);
        checkEnded(t);
      } else {
        enforce(t);
      }
    }, true);
  });

  setInterval(scan, 500);
  window.addEventListener('load', scan);
  document.addEventListener('DOMContentLoaded', scan);

  /* ===================== 3. 防暂停守卫 =====================
     超星的"防挂机"会从三个入口让视频停下：
       ① 鼠标移出播放器区域 → 触发 mouseleave 后调 pause()
       ② 切标签页 / 窗口失焦 → visibilitychange / window.blur
       ③ 播放器内部定时器直接调 pause()
     三条路分别堵：事件拦截 → 伪造可见性 → 兜底续播。         */

  let lastGesture = 0;
  ['mousedown', 'mouseup', 'click', 'keydown', 'touchstart', 'pointerdown'].forEach((t) => {
    window.addEventListener(t, () => { lastGesture = Date.now(); }, true);
  });
  // 只有"人手操作"才允许暂停，其余一律视为平台自动暂停
  const isUserAction = () => Date.now() - lastGesture < 900;

  function getFirstVideo() {
    const l = document.getElementsByTagName('video');
    return l.length ? l[0] : null;
  }

  // ①-a 吞掉非用户触发的 pause()
  const nativePause = HTMLMediaElement.prototype.pause;
  try {
    HTMLMediaElement.prototype.pause = function () {
      if (antiPause && !this.paused && !this.seeking && !this.ended && !isUserAction()) {
        return; // 静默丢弃
      }
      return nativePause.apply(this, arguments);
    };
  } catch (e) {}

  // ①-b 伪造页面可见性与焦点；realHidden() 保留真实状态，供内部判断
  let realHidden = () => false;
  (function fakeVisibility() {
    try {
      const dHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
      const dState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
      const nativeHidden = dHidden && dHidden.get;
      const nativeState = dState && dState.get;

      if (nativeHidden) {
        realHidden = () => { try { return nativeHidden.call(document); } catch (e) { return false; } };
        const getH = () => (antiPause ? false : nativeHidden.call(document));
        Object.defineProperty(document, 'hidden', { configurable: true, get: getH });
        Object.defineProperty(document, 'webkitHidden', { configurable: true, get: getH });
      }
      if (nativeState) {
        const getS = () => (antiPause ? 'visible' : nativeState.call(document));
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: getS });
        Object.defineProperty(document, 'webkitVisibilityState', { configurable: true, get: getS });
      }
      const nativeHasFocus = document.hasFocus;
      document.hasFocus = function () {
        return antiPause ? true : nativeHasFocus.call(document);
      };
    } catch (e) {}
  })();

  // ①-c 拦掉页面级 blur / visibilitychange（只拦 window、document 上的，元素失焦照常放行）
  ['blur', 'visibilitychange', 'webkitvisibilitychange', 'pagehide'].forEach((t) => {
    window.addEventListener(t, (e) => {
      if (!antiPause) return;
      if (e.target === window || e.target === document) e.stopImmediatePropagation();
    }, true);
  });

  // ② 吞掉"鼠标离开播放区域"的事件
  function swallowPointerLeave(e) {
    if (!antiPause) return;
    const v = getFirstVideo();
    if (!v) return;
    const t = e.target;
    if (!t) return;

    // 监听器挂在 document / window 上的情况
    if (t === document || t === window) {
      if (!e.relatedTarget) e.stopImmediatePropagation();
      return;
    }
    if (t.nodeType !== 1) return;

    // 指针离开整个窗口 / iframe 边界（relatedTarget 为空）
    if (t === document.body || t === document.documentElement) {
      if (e.relatedTarget) return; // 只是页面内部元素间移动，放行
      e.stopImmediatePropagation();
      return;
    }

    let hit = false;
    try { hit = t === v || (t.contains && t.contains(v)); } catch (err) { hit = false; }
    if (hit) e.stopImmediatePropagation();
  }

  ['mouseleave', 'mouseout', 'pointerleave', 'pointerout'].forEach((t) => {
    document.addEventListener(t, swallowPointerLeave, true);
  });

  // 记住"用户自己按的暂停"，后面的续播逻辑一律避开它
  document.addEventListener('play', (e) => {
    const v = e.target;
    if (!v || v.tagName !== 'VIDEO') return;
    if (isUserAction()) {
      v.__cxUserPaused = false;
      writeStore(KEY_PLAYTS, Date.now()); // 手动点了播放：说明想留在这章，别自动跳过
    }
  }, true);

  document.addEventListener('playing', (e) => {
    const v = e.target;
    if (v && v.tagName === 'VIDEO') v.__cxPlayedOnce = true;
  }, true);

  // ③-a 兜底：暂停落到播放器上后立刻续播
  document.addEventListener('pause', (e) => {
    const v = e.target;
    if (!v || v.tagName !== 'VIDEO') return;
    if (isUserAction()) { v.__cxUserPaused = true; return; } // 用户主动暂停，尊重
    v.__cxUserPaused = false;
    if (!antiPause || v.ended || v.seeking) return;
    if (v.__cxReplay && Date.now() - v.__cxReplay < 2000) return; // 防止与播放器来回拉锯
    v.__cxReplay = Date.now();
    setTimeout(() => {
      if (!antiPause || !v.paused || v.ended || isUserAction()) return;
      try {
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      } catch (err) {}
    }, 120);
  }, true);

  // ③-b 看门狗：有些版本用定时器直接 pause()，绕开了事件层，每秒巡检一次
  setInterval(() => {
    if (!antiPause) return;
    const v = getFirstVideo();
    if (!v || !v.paused || v.ended || v.seeking) return;
    if (v.__cxUserPaused) return;          // 用户自己暂停的，不打扰
    if (!v.__cxPlayedOnce && v.currentTime <= 0) return; // 还没开始播，不强行起播
    try {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    } catch (err) {}
  }, 1000);

  // ③-c 最小化/后台保活：窗口不可见时 rAF 会停摆，
  //     部分播放器正是靠"rAF 还在不在跳"来判断是否切到后台，
  //     这里把 rAF 换成 setTimeout 心跳，让它以为前台在正常刷新。
  (function rafFallback() {
    const nativeRAF = window.requestAnimationFrame;
    const nativeCAF = window.cancelAnimationFrame;
    if (typeof nativeRAF !== 'function') return;
    const BASE = 1 << 26;               // 自身 id 段，避免与原生 rAF id 撞号
    const pending = new Set();

    window.requestAnimationFrame = function (cb) {
      if (typeof cb !== 'function') return nativeRAF.call(window, cb);
      let hidden = false;
      try { hidden = realHidden(); } catch (e) { hidden = false; }
      if (!antiPause || !hidden) return nativeRAF.call(window, cb);
      const id = setTimeout(() => {
        pending.delete(id);
        try { cb(performance.now()); } catch (e) {}
      }, 16);
      pending.add(id);
      return BASE + id;
    };

    window.cancelAnimationFrame = function (id) {
      if (typeof id === 'number' && id > BASE) {
        const raw = id - BASE;
        if (pending.has(raw)) { clearTimeout(raw); pending.delete(raw); return; }
      }
      return nativeCAF.call(window, id);
    };
  })();

  /* ---------- 3.5 切到新课自动起播 ----------
     换章后播放器停在第 0 秒等点击，这里替用户点一下。
     只接管"停开头、没被用户暂停过"的视频，绝不打断正在看的。 */
  function tryAutoPlay() {
    if (!autoPlayOn) return;
    const v = getFirstVideo();
    if (!v || !v.paused || v.ended || v.seeking) return;
    if (v.__cxPlayedOnce) return;                // 本页已经播过，交给用户/防暂停处理
    if (v.__cxUserPaused) return;                // 用户自己按的暂停
    if (Date.now() - lastGesture < 1200) return; // 刚有操作，可能正在手动点
    if ((v.__cxPlayTries || 0) > 20) return;     // 最多尝试 20 次，别一直骚扰
    v.__cxPlayTries = (v.__cxPlayTries || 0) + 1;
    try {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  setInterval(tryAutoPlay, 800);

  /* ===================== 4. 播完自动下一节 ===================== */
  const NEXT_TEXTS = ['下一节', '下一章', '下一个', '下一课', '下一节视频', '下一小节'];
  const NEXT_SELECTORS = [
    '#prevNextFocusNext',
    '.posBottomBar .next',
    '.posBottomBar a.next',
    '.posBottomBar .nextChapter',
    '.prev_next a.next',
    '.prev_next #prevNextFocusNext',
    '#nextChapter',
    '.nextChapter',
    '#nextBtn',
    '.next-btn',
    '.btn-next'
  ];
  const CATALOG_ITEMS = '.posCatalog_select, .posCatalog_level li, #coursetree li, .catalog_points_li, .chapter_item, [id^="cur"]';

  const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/[›>》»→·\.]/g, '');

  function isClickable(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      if (el.disabled) return false;
      const cls = typeof el.className === 'string' ? el.className : '';
      if (/\b(disabled|is-disabled|forbid)\b/.test(cls)) return false;
      if (el.getAttribute('disabled') !== null) return false;
      if (el.getAttribute('aria-disabled') === 'true') return false;
      const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      const st = win.getComputedStyle(el);
      if (!st || st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) return false;
      return true;
    } catch (e) { return true; }
  }

  function findNextCatalogItem(doc) {
    let arr = [];
    try { arr = Array.prototype.slice.call(doc.querySelectorAll(CATALOG_ITEMS)); } catch (e) { return null; }
    if (!arr.length) return null;
    const idx = arr.findIndex((it) => /\b(active|current|curr|selected)\b/.test(String(it.className)));
    if (idx < 0 || idx + 1 >= arr.length) return null;
    const next = arr[idx + 1];
    const target = next.querySelector('a') || next;
    return isClickable(target) ? target : null;
  }

  // 给候选元素打分：宁可挑错同类按钮，也不要因为"看起来像"就点错方向
  function scoreCandidate(el) {
    let s = 0;
    try {
      const id = el.id || '';
      const cls = typeof el.className === 'string' ? el.className : '';
      const t = norm(el.textContent);
      if (id === 'prevNextFocusNext') s += 4;
      if (/next/i.test(id) || /\bnext\b/i.test(cls)) s += 2;
      if (/下一/.test(t)) s += 3;
      if (/上一/.test(t) || /prev/i.test(id) || /\bprev\b/i.test(cls)) s -= 4;
      if (el.closest && el.closest('.posBottomBar, .prev_next, .nextChapter')) s += 2;
    } catch (e) {}
    return s;
  }

  function collectCandidates(doc) {
    const out = [];
    const push = (el) => {
      if (!el || out.indexOf(el) >= 0) return;
      if (!isClickable(el)) return;
      out.push(el);
    };

    NEXT_SELECTORS.forEach((s) => {
      try { Array.prototype.forEach.call(doc.querySelectorAll(s), push); } catch (e) {}
    });

    // 按文字兜底（只认叶子节点，避免命中整块容器）
    try {
      const all = doc.querySelectorAll('a,button,span,em,li,i');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el.children && el.children.length > 0) continue;
        const t = norm(el.textContent);
        if (!t || t.length > 6) continue;
        if (NEXT_TEXTS.indexOf(t) >= 0) push(el);
      }
    } catch (e) {}

    const cat = findNextCatalogItem(doc);
    if (cat) push(cat);

    return out;
  }

  function findNext(doc) {
    if (!doc) return null;
    const cands = collectCandidates(doc);
    let best = null, bestScore = 0;
    for (let i = 0; i < cands.length; i++) {
      const s = scoreCandidate(cands[i]);
      if (s > bestScore) { bestScore = s; best = cands[i]; }
    }
    // 分数太低说明只是"碰巧有 next"的元素，宁可不点
    return bestScore >= 3 ? best : null;
  }

  function clickEl(el) {
    try { el.click(); return true; } catch (e) {}
    try {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch (e) {}
    return false;
  }

  // 跨 frame 去重：同一时刻只允许一次"下一节"
  function throttleNext() {
    const now = Date.now();
    let last = 0;
    try { last = Number(localStorage.getItem(KEY_TS) || 0); } catch (e) {}
    if (now - last < NEXT_COOLDOWN) return false;
    writeStore(KEY_TS, now);
    return true;
  }

  function getTopDoc() {
    try { return window.top.document; } catch (e) { return null; }
  }

  // 本章是否含测验/作业/考试：命中就停下自动跳转，把章节留给用户自己处理
  const ASSESS_SRC = /ananas\/modules\/(work|exam)|dowork|doHomeWork|exam\/test|\/work\/index|\/work\/doWork/i;
  const ASSESS_SIG = /(章节测验|单元测验|单元测试|测验|作业|考试)/;

  function detectAssessment(doc) {
    if (!doc) return false;
    try {
      const ifr = doc.querySelectorAll('iframe');
      for (let i = 0; i < ifr.length; i++) {
        const src = ifr[i].getAttribute('src') || ifr[i].getAttribute('data-src') || '';
        if (src && ASSESS_SRC.test(src)) return true;
      }
    } catch (e) {}
    try {
      const marks = doc.querySelectorAll('.ans-attach-online, .ans-job-icon, .ans-job-icon-gray, .posCatalog_select .icon');
      for (let i = 0; i < marks.length; i++) {
        const el = marks[i];
        const sig = (el.getAttribute('title') || '') + '|' + String(el.className || '') +
                    '|' + (el.textContent || '').slice(0, 40);
        if (ASSESS_SIG.test(sig)) return true;
      }
    } catch (e) {}
    return false;
  }

  function hasAssessment() {
    const doc = getTopDoc();
    if (!doc) return chapterHasAssess;
    chapterHasAssess = detectAssessment(doc);
    return chapterHasAssess;
  }

  if (isTop) {
    setInterval(() => {
      const now = detectAssessment(document);
      if (now !== chapterHasAssess) { chapterHasAssess = now; syncUI(); }
    }, 3000);
  }

  /* 跳过含测验章节时留痕，方便之后集中回补 */
  function currentChapterInfo() {
    const doc = getTopDoc() || document;
    let title = '';
    let cid = '';
    try {
      const act = doc.querySelector('.posCatalog_select.active, .posCatalog_select.cur, #coursetree .active');
      if (act) title = (act.getAttribute('title') || act.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    } catch (e) {}
    try {
      const m = String(doc.location.href).match(/chapterId=([\w-]+)/i);
      if (m) cid = m[1];
    } catch (e) {}
    return { title: title || doc.title.slice(0, 60), cid, ts: Date.now() };
  }

  function readSkipped() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY_SKIPPED) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function recordSkipped(info) {
    const list = readSkipped();
    if (info.cid && list.some((x) => x && x.cid === info.cid)) { skippedCount = list.length; return; }
    list.push(info);
    const trimmed = list.slice(-200);
    try { localStorage.setItem(KEY_SKIPPED, JSON.stringify(trimmed)); } catch (e) {}
    skippedCount = trimmed.length;
    syncUI();
  }

  function copySkipped() {
    const list = readSkipped();
    if (!list.length) return;
    const text = list.map((x, i) =>
      (i + 1) + '. ' + (x.title || '(未取到标题)') + (x.cid ? '   chapterId=' + x.cid : '')
    ).join('\n');

    const fallback = (t) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {}
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallback(text));
        return;
      }
    } catch (e) {}
    fallback(text);
  }

  function onVideoEnded() {
    if (!autoNext) return;

    // 含测验/作业的章节照常跳过，但记一笔，事后统一回补
    if (hasAssessment()) recordSkipped(currentChapterInfo());

    // 关键：视频播完后超星会立刻把内容区换成下一个任务点（通常是测验），
    // 播放器 iframe 会被销毁，写在这里的 setTimeout 根本来不及执行。
    // 所以统一交给顶层页面去跳，它的定时器不会随 iframe 消失。
    let handedToTop = false;
    try {
      if (window.top && window.top !== window) {
        window.top.postMessage({ __cxSpeed: 'next' }, '*');
        handedToTop = true;
      }
    } catch (e) { handedToTop = false; }

    if (handedToTop) return;

    if (!throttleNext()) return;
    setTimeout(requestNext, NEXT_DELAY);
  }

  function checkEnded(v) {
    if (!autoNext) return;
    if (!isFinite(v.duration) || v.duration <= 0) return;
    if (v.currentTime < v.duration - 0.3) { v.__cxEndHandled = false; return; }
    if (v.__cxEndHandled) return;
    v.__cxEndHandled = true;
    onVideoEnded();
  }

  document.addEventListener('ended', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') onVideoEnded();
  }, true);

  /* ---------- 4.2 直连跳转：绕开"下一节"自带的确认弹窗 ---------- */
  function currentChapterId(doc) {
    try {
      const m = String(doc.location.href).match(/[?&]chapterId=(\d+)/i);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  }

  function hasChapterRef(it) {
    try {
      if (/^cur\d+$/.test(String(it.id || ''))) return true;
      if (String(it.getAttribute && it.getAttribute('chapterid') || '').length > 0) return true;
      if (it.querySelector && it.querySelector('a[href*="chapterId="]')) return true;
    } catch (e) {}
    return false;
  }

  function nextCatalogItem(doc) {
    let arr;
    try { arr = Array.prototype.slice.call(doc.querySelectorAll(CATALOG_ITEMS)); } catch (e) { return null; }
    if (!arr.length) return null;

    let idx = arr.findIndex((it) => /\b(active|current|curr|selected)\b/.test(String(it.className)));

    // 目录项没有 active 标记时，用地址栏里的 chapterId 反查
    if (idx < 0) {
      const cid = currentChapterId(doc);
      if (cid) {
        idx = arr.findIndex((it) => {
          if (String(it.getAttribute && it.getAttribute('chapterid') || '') === cid) return true;
          if (String(it.id || '') === 'cur' + cid) return true;
          return false;
        });
      }
    }
    if (idx < 0) return null;

    // 往后找第一个真正带章节引用的节点，跳过"章"这种折叠标题
    for (let k = idx + 1; k < arr.length && k <= idx + 4; k++) {
      if (hasChapterRef(arr[k])) return arr[k];
    }
    return arr[idx + 1] || null;
  }

  function jumpDirect(doc) {
    const item = nextCatalogItem(doc);
    if (!item) return false;

    // 防止把当前章节当成下一节点回去（会重播本章，形成死循环）
    const curCid = currentChapterId(doc);
    const itemCid = (String(item.id || '').match(/^cur(\d+)$/) || [])[1] || '';
    if (curCid && itemCid && curCid === itemCid) return false;

    // ① 目录项里带 chapterId 的链接最可靠，点击后由平台自己完成跳转
    let a = null;
    try { a = item.querySelector('a[href*="chapterId="]'); } catch (e) {}
    if (a) { clickHard(a); return true; }

    // ② 目录项 id 形如 cur<chapterId>，直接改写地址栏
    if (itemCid) {
      try {
        const cur = String(doc.location.href);
        const url = cur.replace(/([?&]chapterId=)\d+/i, '$1' + itemCid);
        if (url !== cur) { doc.location.href = url; return true; }
      } catch (e) {}
    }

    // ③ 兜底：直接点目录项本身
    clickHard(item);
    return true;
  }

  // 兜底路径：点"下一节"按钮（可能弹确认框，由 4.1 自动点确定）
  function fallbackNext() {
    const topDoc = getTopDoc() || document;
    const el = findNext(topDoc);
    if (el) { clickEl(el); return true; }
    try { window.top.postMessage({ __cxSpeed: 'next' }, '*'); } catch (e) {}
    return false;
  }

  function requestNext() {
    const topDoc = getTopDoc();

    if (!topDoc) {
      try { window.parent.postMessage({ __cxSpeed: 'next' }, '*'); } catch (e) {}
      return false;
    }

    const before = currentChapterId(topDoc);

    if (jumpDirect(topDoc)) {
      setJumpMsg('');
      if (!before) return true;
      // 2.5s 后仍在原章节，说明点到的不是可跳转节点（比如章节折叠项），改走按钮
      setTimeout(() => {
        let now = '';
        try { now = currentChapterId(topDoc); } catch (e) {}
        if (now && now === before) {
          if (!fallbackNext()) {
            setJumpMsg('目录直跳未生效，也没找到"下一节"按钮（目录项 ' + countCatalog(topDoc) + '）');
          }
        }
      }, 2500);
      return true;
    }

    if (fallbackNext()) { setJumpMsg(''); return true; }
    setJumpMsg('没找到下一节入口（目录项 ' + countCatalog(topDoc) + '）');
    return false;
  }

  function countCatalog(doc) {
    try { return doc.querySelectorAll(CATALOG_ITEMS).length; } catch (e) { return -1; }
  }

  function setJumpMsg(m) {
    lastJumpMsg = m || '';
    if (m) { try { console.warn('[超星倍速] ' + m); } catch (e) {} }
    syncUI();
  }

  if (isTop) {
    // 顶层是唯一的执行者：冷却也在这里判定，避免多个 iframe 各跳一次
    window.addEventListener('message', (e) => {
      if (!e.data || e.data.__cxSpeed !== 'next') return;
      if (!autoNext) return;
      if (!throttleNext()) return;
      setTimeout(requestNext, NEXT_DELAY);
    });
  }

  /* ---------- 4.1 自动确认"任务点未完成"弹窗 ----------
     点"下一节"时超星会拦一下：当前章节还有任务点未完成，是否去完成？
     去学习 / 确定 —— 我们只点"确定"（继续跳），"去学习"永远不碰。   */
  const DIALOG_HINT = /(任务点未完成|任务点还未完成|还有任务点|是否去完成)/;
  const CONFIRM_TEXTS = ['确定', '确认', '继续', '仍然下一节', '继续下一节'];
  const CONFIRM_WINDOW = 10000; // 只处理我们自己触发跳转后出现的弹窗

  function lastAutoNextAt() {
    let ts = 0;
    try { ts = Number(localStorage.getItem(KEY_TS) || 0); } catch (e) {}
    return ts;
  }

  // 弹层按钮有的绑 mousedown，有的绑 click，整套派发一遍（确认动作重复执行无副作用）
  function clickHard(el) {
    try {
      ['mousedown', 'mouseup', 'click'].forEach((t) => {
        el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      });
      return true;
    } catch (e) { return clickEl(el); }
  }

  function findConfirmButton(root) {
    let list;
    try { list = root.querySelectorAll('a,button,span,div,em,i'); } catch (e) { return null; }
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (el.children && el.children.length > 0) continue;
      const t = norm(el.textContent);
      if (!t || t.length > 8) continue;
      if (CONFIRM_TEXTS.indexOf(t) >= 0 && isClickable(el)) return el;
    }
    return null;
  }

  function clickIncompleteConfirm(doc) {
    doc = doc || document;
    let boxes;
    try {
      boxes = doc.querySelectorAll('[class*="layer"], [class*="popup"], [class*="dialog"], [class*="modal"], [class*="alert"]');
    } catch (e) { return false; }

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!isClickable(b)) continue;
      const txt = b.textContent || '';
      if (txt.length > 400) continue;          // 整个页面容器，跳过
      if (!DIALOG_HINT.test(txt)) continue;
      // 绝不能点是"去学习"
      const btn = findConfirmButton(b);
      if (btn) { clickHard(btn); return true; }
    }
    return false;
  }

  // 只在我们自己发起跳转后的一小段时间内确认，避免误点用户手动触发的弹窗
  setInterval(() => {
    if (!autoNext) return;
    if (Date.now() - lastAutoNextAt() > CONFIRM_WINDOW) return;
    clickIncompleteConfirm(document);
  }, 700);

  /* ---------- 4.3 已完成章节自动跳过 ----------
     判定依据：内容区的任务点标记里，只要还有"未完成/待完成"就不动；
     全部显示"已完成"才跳。宁可漏跳，也不误跳掉没上的课。      */
  const JOB_SCOPE = ['.posContentMain', '#chapterContent', '.chapter_content', '.ans-attach-list', '.posContent'];

  function jobScope(doc) {
    for (let i = 0; i < JOB_SCOPE.length; i++) {
      try {
        const el = doc.querySelector(JOB_SCOPE[i]);
        if (el) return el;
      } catch (e) {}
    }
    return doc.body;
  }

  function detectCompletion(doc) {
    const res = { done: 0, undone: 0 };
    const scope = jobScope(doc);
    let nodes;
    try { nodes = scope.querySelectorAll('span,div,em,i,b,p'); } catch (e) { return res; }
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.children && el.children.length > 0) continue;
      const t = el.textContent || '';
      if (!t || t.length > 30) continue;
      let visible = false;
      try { visible = el.getClientRects().length > 0; } catch (e) { visible = false; }
      if (!visible) continue;
      if (/未完成|待完成/.test(t)) res.undone++;
      else if (/已完成/.test(t)) res.done++;
    }
    return res;
  }

  // 视频真在播（含内嵌 iframe）时不要跳，用户可能正在复习
  function anyVideoPlaying(doc) {
    const docs = [doc];
    try {
      const frames = doc.querySelectorAll('iframe');
      for (let i = 0; i < frames.length; i++) {
        try { if (frames[i].contentDocument) docs.push(frames[i].contentDocument); } catch (e) {}
      }
    } catch (e) {}
    for (let i = 0; i < docs.length; i++) {
      try {
        const v = docs[i].querySelector && docs[i].querySelector('video');
        if (v && !v.paused && v.currentTime > 1) return true;
      } catch (e) {}
    }
    return false;
  }

  function recentlyPlayed() {
    let ts = 0;
    try { ts = Number(localStorage.getItem(KEY_PLAYTS) || 0); } catch (e) {}
    return Date.now() - ts < 15000;
  }

  function maybeSkipCompleted() {
    if (!autoSkipDone) return;
    const doc = document;
    const cid = currentChapterId(doc);
    if (!cid || cid === skipAssessKey) return;
    if (recentlyPlayed() || anyVideoPlaying(doc)) return;

    const st = detectCompletion(doc);
    if (st.undone > 0 || st.done === 0) return; // 还有没做完的，或判断不出来，就别动

    skipAssessKey = cid;
    if (autoSkipCount >= 30) {
      setJumpMsg('连续自动跳过 ' + autoSkipCount + ' 章后停止，避免一路跑到底');
      return;
    }
    autoSkipCount++;
    setJumpMsg('本章任务点已完成，自动跳到下一节（第 ' + autoSkipCount + ' 章）');
    setTimeout(() => {
      if (currentChapterId(doc) !== cid) return;
      requestNext();
    }, 1500);
  }

  if (isTop) {
    setInterval(maybeSkipCompleted, 2000);
    window.addEventListener('load', () => setTimeout(maybeSkipCompleted, 1500));
  }

  /* ===================== 5. 跨 frame 同步 ===================== */
  window.addEventListener('storage', (e) => {
    if (e.key === KEY_RATE && e.newValue !== null) {
      const v = clampRate(e.newValue);
      if (v !== targetRate) { targetRate = v; scan(); syncUI(); }
    }
    if (e.key === KEY_AMUTE && e.newValue !== null) {
      autoMute = e.newValue === '1';
      applyMuteAll();
      syncUI();
    }
    if (e.key === KEY_ANEXT && e.newValue !== null) {
      autoNext = e.newValue === '1';
      syncUI();
    }
    if (e.key === KEY_APAUSE && e.newValue !== null) {
      antiPause = e.newValue === '1';
      syncUI();
    }
    if (e.key === KEY_ASKIP && e.newValue !== null) {
      autoSkipDone = e.newValue === '1';
      syncUI();
    }
    if (e.key === KEY_APLAY && e.newValue !== null) {
      autoPlayOn = e.newValue === '1';
      syncUI();
    }
    if (e.key === KEY_SKIPPED && e.newValue !== null) {
      try {
        const l = JSON.parse(e.newValue);
        skippedCount = Array.isArray(l) ? l.length : 0;
      } catch (err) { skippedCount = 0; }
      syncUI();
    }
  });

  function applyMuteAll() {
    const list = document.getElementsByTagName('video');
    for (let i = 0; i < list.length; i++) {
      try {
        list[i].muted = autoMute;
        if (autoMute) list[i].__cxMutedOnce = true;
        else list[i].__cxMutedOnce = false;
      } catch (e) {}
    }
  }

  function setRate(r) {
    targetRate = clampRate(r);
    writeStore(KEY_RATE, targetRate);
    scan();
    syncUI();
  }

  function toggleAutoMute() {
    autoMute = !autoMute;
    writeStore(KEY_AMUTE, autoMute ? 1 : 0);
    applyMuteAll();
    syncUI();
  }

  function toggleAutoNext() {
    autoNext = !autoNext;
    writeStore(KEY_ANEXT, autoNext ? 1 : 0);
    syncUI();
  }

  function toggleAntiPause() {
    antiPause = !antiPause;
    writeStore(KEY_APAUSE, antiPause ? 1 : 0);
    syncUI();
  }

  function toggleAutoSkipDone() {
    autoSkipDone = !autoSkipDone;
    writeStore(KEY_ASKIP, autoSkipDone ? 1 : 0);
    syncUI();
  }

  function toggleAutoPlay() {
    autoPlayOn = !autoPlayOn;
    writeStore(KEY_APLAY, autoPlayOn ? 1 : 0);
    syncUI();
  }

  /* ===================== 6. 快捷键 ===================== */
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); setRate(targetRate + STEP); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setRate(targetRate - STEP); }
    else if (e.key === '0') { e.preventDefault(); setRate(1); }
    else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleAutoMute(); }
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); toggleAutoNext(); }
    else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); toggleAntiPause(); }
  }, true);

  /* ===================== 7. 悬浮面板（仅顶层） ===================== */
  let ui = null;

  function whenBody(fn) {
    if (document.body) return fn();
    const ob = new MutationObserver(() => {
      if (document.body) { ob.disconnect(); fn(); }
    });
    ob.observe(document.documentElement, { childList: true, subtree: true });
  }

  function buildPanel() {
    const host = document.createElement('div');
    host.id = 'cx-speed-host';
    host.style.cssText = 'all:initial;position:fixed;top:88px;right:16px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });

    root.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .wrap {
          font: 12px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
          color: #e6edf3; background: rgba(22,27,34,.95);
          border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
          width: 212px; overflow: hidden; user-select: none;
          box-shadow: 0 10px 30px rgba(0,0,0,.4);
        }
        .hd { display: flex; align-items: center; justify-content: space-between;
              padding: 7px 10px; cursor: move; background: rgba(255,255,255,.05); }
        .ttl { display: flex; align-items: center; font-size: 12px; font-weight: 600; letter-spacing: .02em; }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: #3fb950; margin-right: 6px; }
        .dot.off { background: #6b7280; }
        em { font-style: normal; color: #58a6ff; margin-left: 5px; font-variant-numeric: tabular-nums; }
        .tg { cursor: pointer; opacity: .55; font-size: 11px; }
        .tg:hover { opacity: 1; }
        .bd { padding: 8px 10px 10px; display: grid; gap: 6px; }
        .bd.hide { display: none; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
        .r { all: unset; text-align: center; padding: 5px 0; border-radius: 6px;
             background: rgba(255,255,255,.07); cursor: pointer; font-size: 11.5px;
             color: #c9d1d9; transition: background .12s, color .12s; white-space: nowrap; }
        .r:hover { background: rgba(255,255,255,.15); }
        .r.on { background: #2f81f7; color: #fff; font-weight: 600; }
        .r.sw { padding: 6px 0; }
        .r.sw.on { background: #238636; }
        .row { display: flex; gap: 5px; }
        .hint { font-size: 10.5px; color: #8b949e; letter-spacing: .01em; }
        .warn { font-size: 10.5px; color: #d29922; display: none; }
        .warn.show { display: block; }
        .link { cursor: pointer; }
        .link:hover { text-decoration: underline; }
      </style>
      <div class="wrap">
        <div class="hd" id="hd">
          <span class="ttl"><i class="dot" id="dot"></i>倍速<em id="cur">1×</em></span>
          <span class="tg" id="tg">收起</span>
        </div>
        <div class="bd" id="bd">
          <div class="grid" id="grid"></div>
          <div class="row">
            <button class="r sw" id="amute" style="flex:1">自动静音：开</button>
            <button class="r sw" id="anext" style="flex:1">自动下一节：开</button>
          </div>
          <div class="row">
            <button class="r sw" id="aplay" style="flex:1">自动播放：开</button>
            <button class="r sw" id="askip" style="flex:1">已完成跳过：开</button>
          </div>
          <button class="r sw" id="apause" style="width:100%">防暂停（移开/最小化）：开</button>
          <button class="r" id="jump" style="width:100%">立即跳到下一节 →</button>
          <div class="hint">Alt+↑/↓ 微调 · Alt+0 复位 · Alt+M 静音 · Alt+N 下一节 · Alt+P 防暂停</div>
          <div class="warn" id="assess">本章含测验/作业 · 播完将跳过并记录</div>
          <div class="warn link" id="skipped">已跳过 0 个含测验章节</div>
          <div class="warn" id="dbg"></div>
          <div class="warn" id="warn">超过 2× 可能被平台记为异常学习</div>
        </div>
      </div>`;

    document.body.appendChild(host);

    const $ = (id) => root.getElementById(id);
    const grid = $('grid');

    PRESETS.forEach((r) => {
      const b = document.createElement('button');
      b.className = 'r';
      b.dataset.rate = String(r);
      b.textContent = r + '×';
      b.addEventListener('click', () => setRate(r));
      grid.appendChild(b);
    });

    $('amute').addEventListener('click', toggleAutoMute);
    $('anext').addEventListener('click', toggleAutoNext);
    $('apause').addEventListener('click', toggleAntiPause);
    $('askip').addEventListener('click', toggleAutoSkipDone);
    $('aplay').addEventListener('click', toggleAutoPlay);
    $('jump').addEventListener('click', () => {
      setJumpMsg('');
      requestNext();
    });
    $('skipped').addEventListener('click', () => {
      copySkipped();
      const el = $('skipped');
      el.textContent = '已复制到剪贴板';
      setTimeout(() => syncUI(), 1200);
    });

    const bd = $('bd'), tg = $('tg');
    tg.addEventListener('click', () => {
      const hidden = bd.classList.toggle('hide');
      tg.textContent = hidden ? '展开' : '收起';
    });

    let drag = null;
    $('hd').addEventListener('pointerdown', (e) => {
      if (e.target === tg) return;
      const rect = host.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, w: rect.width };
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      host.style.left = Math.max(0, Math.min(window.innerWidth - drag.w, e.clientX - drag.dx)) + 'px';
      host.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.dy)) + 'px';
      host.style.right = 'auto';
    });
    window.addEventListener('pointerup', () => { drag = null; });

    ui = { root, host };
    syncUI();
  }

  function syncUI() {
    if (!ui) return;
    const { root } = ui;
    const cur = root.getElementById('cur');
    if (cur) cur.textContent = (Math.round(targetRate * 100) / 100) + '×';

    root.querySelectorAll('button[data-rate]').forEach((b) => {
      b.classList.toggle('on', Math.abs(parseFloat(b.dataset.rate) - targetRate) < 1e-3);
    });

    const am = root.getElementById('amute');
    if (am) { am.textContent = '自动静音：' + (autoMute ? '开' : '关'); am.classList.toggle('on', autoMute); }

    const an = root.getElementById('anext');
    if (an) { an.textContent = '自动下一节：' + (autoNext ? '开' : '关'); an.classList.toggle('on', autoNext); }

    const ap = root.getElementById('apause');
    if (ap) { ap.textContent = '防暂停（移开/最小化）：' + (antiPause ? '开' : '关'); ap.classList.toggle('on', antiPause); }

    const ak = root.getElementById('askip');
    if (ak) {
      ak.textContent = '已完成跳过：' + (autoSkipDone ? '开' : '关');
      ak.classList.toggle('on', autoSkipDone);
      ak.title = '本章任务点全部已完成时，自动切到下一节';
    }

    const ap2 = root.getElementById('aplay');
    if (ap2) {
      ap2.textContent = '自动播放：' + (autoPlayOn ? '开' : '关');
      ap2.classList.toggle('on', autoPlayOn);
      ap2.title = '切到新章节后，播放器停在开头时自动起播';
    }

    const as = root.getElementById('assess');
    if (as) as.classList.toggle('show', chapterHasAssess);

    const sk = root.getElementById('skipped');
    if (sk) {
      sk.classList.toggle('show', skippedCount > 0);
      sk.textContent = '已跳过 ' + skippedCount + ' 个含测验章节 · 点此复制清单';
      sk.title = '点击把章节列表复制到剪贴板，方便之后集中回补';
    }

    const dbg = root.getElementById('dbg');
    if (dbg) {
      dbg.textContent = lastJumpMsg;
      dbg.classList.toggle('show', !!lastJumpMsg);
    }

    const warn = root.getElementById('warn');
    if (warn) warn.classList.toggle('show', targetRate > SAFE_RATE);

    const dot = root.getElementById('dot');
    if (dot) {
      const has = document.getElementsByTagName('video').length > 0;
      dot.classList.toggle('off', !has);
      dot.title = has ? '本页已检测到视频' : '本页未检测到视频（视频在内嵌播放器中）';
    }
  }

  if (isTop) whenBody(buildPanel);
})();
