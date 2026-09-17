/* ==========================================================================
   util.js — 通用小工具：DOM、日期、存储、提示条、下载、剪贴板
   全局命名空间：window.CW
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};

  /* ======================================================================
     DOM
     ====================================================================== */
  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(sel));
  }

  /**
   * 建元素：el('div', { class: 'x', onclick: fn }, [child, 'text'])
   * 属性名里 data-* / aria-* 直接写；on* 当事件处理；其他走 setAttribute。
   */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class' || k === 'className') { node.className = v; return; }
        if (k === 'text') { node.textContent = v; return; }
        if (k === 'html') { node.innerHTML = v; return; }
        if (k === 'style' && typeof v === 'object') {
          Object.keys(v).forEach(function (p) { node.style.setProperty(p, v[p]); });
          return;
        }
        if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
          return;
        }
        if (v === true) { node.setAttribute(k, ''); return; }
        node.setAttribute(k, String(v));
      });
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children === null || children === undefined) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number'
        ? document.createTextNode(String(c))
        : c);
    });
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  /** 用 DOM 节点或字符串替换容器内容 */
  function render(container, content) {
    if (!container) return;
    clear(container);
    appendChildren(container, content);
  }

  /** 复刻一个 <svg><use href="#id"/></svg> */
  function icon(id, cls) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    var use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 纯文本截断（不破坏语义，用于标题显示） */
  function truncate(s, n) {
    s = String(s === null || s === undefined ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* ======================================================================
     日期 —— 全部按「本地日期」处理，避免 UTC 时区偏移
     ====================================================================== */
  var DAY_MS = 86400000;

  /** 'YYYY-MM-DD' -> Date（本地 0 点） */
  function parseDate(s) {
    if (!s) return null;
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  /** Date -> 'YYYY-MM-DD' */
  function fmtDate(d) {
    if (!d) return '';
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

  function daysInMonth(d) { return endOfMonth(d).getDate(); }

  /** 周一 = 1 … 周日 = 7 */
  function isoDow(d) { var w = d.getDay(); return w === 0 ? 7 : w; }

  /** 该日期所在周的周一 */
  function mondayOf(d) { return addDays(d, -(isoDow(d) - 1)); }

  function diffDays(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS); }

  function isSameDay(a, b) {
    return !!a && !!b && a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  var WD_CN = ['日', '一', '二', '三', '四', '五', '六'];
  var WD_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  function weekdayShort(d) { return WD_CN[d.getDay()]; }
  function weekdayFull(d) { return WD_FULL[d.getDay()]; }
  function weekdayFullFromNum(n) { return WD_FULL[n === 7 ? 0 : n]; }

  function fmtCN(d) {
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  /** 相对日期说法：今天 / 明天 / 昨天 / 3 天后 / 9 月 20 日 */
  function relativeDay(d, base) {
    base = base || today();
    var n = diffDays(base, d);
    if (n === 0) return '今天';
    if (n === 1) return '明天';
    if (n === 2) return '后天';
    if (n === -1) return '昨天';
    if (n === -2) return '前天';
    if (n > 0 && n <= 7) return n + ' 天后';
    if (n < 0 && n >= -7) return (-n) + ' 天前';
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  /** 'HH:MM' -> 当天分钟数；失败返回 -1 */
  function timeToMin(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    if (!m) return -1;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function minToTime(min) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /** 人类可读的倒计时：2 小时 5 分钟 / 18 分钟 / 已开始 */
  function humanDuration(ms) {
    if (ms <= 0) return '已开始';
    var min = Math.round(ms / 60000);
    if (min < 1) return '不到 1 分钟';
    if (min < 60) return min + ' 分钟';
    var h = Math.floor(min / 60), r = min % 60;
    if (h < 24) return h + ' 小时' + (r ? ' ' + r + ' 分钟' : '');
    return Math.floor(h / 24) + ' 天' + (h % 24 ? ' ' + (h % 24) + ' 小时' : '');
  }

  /* ======================================================================
     localStorage —— 全部包一层 try/catch（隐私模式 / 配额满）
     ====================================================================== */
  var LS_PREFIX = 'cw.';

  function lsGet(key, fallback) {
    try {
      var raw = window.localStorage.getItem(LS_PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function lsSet(key, value) {
    try {
      window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      warnStorage(e);
      return false;
    }
  }

  function lsDel(key) {
    try { window.localStorage.removeItem(LS_PREFIX + key); } catch (e) { /* 忽略 */ }
  }

  var storageWarned = false;
  function warnStorage(err) {
    if (storageWarned) return;
    storageWarned = true;
    CW.util.toast('浏览器存储写入失败（可能是隐私模式或空间已满），本次改动可能不会被保存。' +
      (err && err.name ? '（' + err.name + '）' : ''), 'error', { timeout: 6000 });
  }

  /* ======================================================================
     IndexedDB —— 只用来存背景图片这种大块数据
     ====================================================================== */
  var DB_NAME = 'cw-bg';
  var STORE = 'kv';
  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('no-indexeddb')); return; }
      var req;
      try { req = window.indexedDB.open(DB_NAME, 1); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb-open-failed')); };
      req.onblocked = function () { reject(new Error('idb-blocked')); };
    });
    return dbPromise;
  }

  function idbRun(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        var out;
        try { out = fn(store); } catch (e) { reject(e); return; }
        tx.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('idb-aborted')); };
      });
    });
  }

  function idbGet(key) {
    return idbRun('readonly', function (s) { return s.get(key); });
  }
  function idbSet(key, value) {
    return idbRun('readwrite', function (s) { return s.put(value, key); });
  }
  function idbDel(key) {
    return idbRun('readwrite', function (s) { return s.delete(key); });
  }

  /* ======================================================================
     Toast 提示条
     ====================================================================== */
  var ICON_BY_TYPE = { ok: 'i-check-circle', error: 'i-warn-circle', warn: 'i-alert', info: 'i-info' };

  function toast(message, type, opts) {
    opts = opts || {};
    var wrap = document.getElementById('toastWrap');
    if (!wrap) { return null; }
    type = type || 'info';

    var node = el('div', { class: 'toast toast-' + type, role: 'status' }, [
      icon(ICON_BY_TYPE[type] || 'i-info', 'ico'),
      el('div', { style: { flex: '1', 'min-width': '0' } }, [
        el('div', { text: message }),
        opts.action ? el('button', {
          type: 'button',
          text: opts.action.label,
          style: { marginTop: '5px', padding: '0' },
          onclick: function () { dismiss(); opts.action.run(); }
        }) : null
      ])
    ]);

    wrap.appendChild(node);

    var timer = null;
    function dismiss() {
      if (timer) clearTimeout(timer);
      if (!node.parentNode) return;
      node.classList.add('leaving');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 240);
    }

    var ms = opts.timeout === undefined ? (type === 'error' ? 5200 : 3200) : opts.timeout;
    if (ms > 0) timer = setTimeout(dismiss, ms);
    node.addEventListener('click', function (e) { if (e.target === node) dismiss(); });

    return { dismiss: dismiss, node: node };
  }

  /* ======================================================================
     下载 / 剪贴板
     ====================================================================== */
  function download(filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = el('textarea', {
        value: text,
        style: { position: 'fixed', top: '-1000px', opacity: '0' }
      });
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ======================================================================
     杂项
     ====================================================================== */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, wait || 200);
    };
  }

  function throttle(fn, wait) {
    var last = 0, timer = null, lastArgs = null;
    return function () {
      var now = Date.now(), self = this;
      lastArgs = arguments;
      if (now - last >= wait) {
        last = now;
        fn.apply(self, lastArgs);
      } else if (!timer) {
        timer = setTimeout(function () {
          timer = null; last = Date.now();
          fn.apply(self, lastArgs);
        }, wait - (now - last));
      }
    };
  }

  /**
   * 稳定的字符串哈希 -> 0..n-1
   * 用来给课程名分配固定配色：同名的课每次打开颜色都一样。
   */
  function hashIndex(str, n) {
    var h = 2166136261;
    str = String(str || '');
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h % (n || 8);
  }

  /** 课程 / 事务的配色索引（0..7），优先用显式指定的 */
  function colorFor(item) {
    if (item && typeof item.color === 'number' && item.color >= 0) return item.color % 8;
    var key = (item && (item.name || item.title)) || '';
    // 去掉教学班后缀，让同一门课的不同班次保持同色
    key = String(key).replace(/\s*\(.*$/, '').trim();
    return hashIndex(key, 8);
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /**
   * 解析 location.hash 里的 key=value（不依赖 URLSearchParams，兼容 file://）。
   *
   * 为什么不能用 URLSearchParams：它按表单规则解析，会把 base64 里的「+」当成空格。
   * 书签抓课表回传的就是 base64，一旦含「+」就会被改坏，表现为「数据解不开，可能被截断了」。
   */
  function hashParams() {
    var h = String(window.location.hash || '').replace(/^#/, '');
    var out = {};
    if (!h) return out;
    var dec = function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    };
    h.split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      if (i < 0) { out[dec(pair)] = ''; return; }
      out[dec(pair.slice(0, i))] = dec(pair.slice(i + 1));
    });
    return out;
  }

  // 用 URLSearchParams 更省事，但要去掉可能的 ? 前缀
  function hashParamsSafe() {
    var h = String(window.location.hash || '').replace(/^#/, '');
    var out = {};
    if (!h) return out;
    try {
      var sp = new URLSearchParams(h);
      sp.forEach(function (v, k) { out[k] = v; });
      return out;
    } catch (e) { return hashParams(); }
  }

  /* UTF-8 安全的 base64（btoa 只认 Latin-1） */
  function b64Encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function b64Decode(b64) {
    var bin = atob(String(b64).replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function fileExt(name) {
    var m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error || new Error('读取文件失败')); };
      fr.readAsArrayBuffer(file);
    });
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error || new Error('读取文件失败')); };
      fr.readAsText(file);
    });
  }

  /* ======================================================================
     导出
     ====================================================================== */
  CW.util = {
    $: $, $$: $$, el: el, clear: clear, render: render, icon: icon,
    escapeHtml: escapeHtml, truncate: truncate, appendChildren: appendChildren,

    DAY_MS: DAY_MS,
    parseDate: parseDate, fmtDate: fmtDate, today: today, startOfDay: startOfDay,
    addDays: addDays, addMonths: addMonths, startOfMonth: startOfMonth,
    endOfMonth: endOfMonth, daysInMonth: daysInMonth,
    isoDow: isoDow, mondayOf: mondayOf, diffDays: diffDays, isSameDay: isSameDay,
    weekdayShort: weekdayShort, weekdayFull: weekdayFull, weekdayFullFromNum: weekdayFullFromNum,
    fmtCN: fmtCN, relativeDay: relativeDay,
    timeToMin: timeToMin, minToTime: minToTime, humanDuration: humanDuration,

    lsGet: lsGet, lsSet: lsSet, lsDel: lsDel,
    idbGet: idbGet, idbSet: idbSet, idbDel: idbDel,

    toast: toast, download: download, copyText: copyText,
    uid: uid, clamp: clamp, debounce: debounce, throttle: throttle,
    hashIndex: hashIndex, colorFor: colorFor,
    prefersReducedMotion: prefersReducedMotion,
    hashParams: hashParams,
    b64Encode: b64Encode, b64Decode: b64Decode,
    fileExt: fileExt,
    readFileAsArrayBuffer: readFileAsArrayBuffer, readFileAsText: readFileAsText
  };
})();
