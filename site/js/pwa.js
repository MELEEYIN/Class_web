/* ==========================================================================
   pwa.js — 装到桌面 + 离线 + 更新提示

   · 注册 service worker（只在 https / localhost 下注册，本地 file:// 打开不注册）
   · 新版可用时**不静默接管**：右下角提示「有新版本，点一下更新」，点了才刷新
     （以前就是因为页面一直跑旧缓存，才出现「明明改了却还是老样子」）
   · 装到桌面：
       - 安卓 Chrome / 电脑 Chrome·Edge 会发 beforeinstallprompt
         → 卡片和说明弹窗里都出现「立即安装」按钮，点一下调起系统安装
       - 微信 / QQ / 抖音等内置浏览器、iOS 没有这个事件
         → 给出对应平台的手动步骤，入口不会变成「点了没反应」
   · beforeinstallprompt 有可能早于 DOMContentLoaded 触发（尤其二次访问、SW 已就绪时），
     所以这里在**脚本解析时**就监听，boot.js 还会先接住一份（window.CW_INSTALL_PROMPT），
     两处兜底 —— 错过这个事件就等于入口永远不出现
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;
  var reg = null;

  function canRegister() {
    if (!('serviceWorker' in navigator)) return false;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return false;
    return true;
  }

  /* ---------------- 更新提示 ---------------- */
  function showUpdateBar(worker) {
    var bar = document.createElement('div');
    bar.className = 'pwa-update';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '';
    var txt = document.createElement('span');
    txt.textContent = '有新版本了';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '点这里更新';
    btn.addEventListener('click', function () {
      try { worker.postMessage('skip-waiting'); } catch (e) { /* 忽略 */ }
      // 等新的 SW 接管后再刷新
      setTimeout(function () { location.reload(); }, 350);
    });
    bar.appendChild(txt);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  function watchUpdates() {
    if (!reg) return;
    reg.addEventListener('updatefound', function () {
      var sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', function () {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBar(sw);      // 已有页面在用旧版 → 提示更新
        }
      });
    });
    // 每小时检查一次新版本（页面开着也能收到）
    setInterval(function () { try { reg.update(); } catch (e) { /* 忽略 */ } }, 60 * 60 * 1000);
  }

  /* ---------------- 环境判断 ---------------- */
  var deferredPrompt = null;

  function ua() { return navigator.userAgent || ''; }

  function isStandalone() {
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function isIOS() { return /iPad|iPhone|iPod/.test(ua()) && !window.MSStream; }
  function isAndroid() { return /Android/i.test(ua()); }

  /* 微信 / QQ / 抖音 / 小红书 / 钉钉 / 支付宝等内置浏览器：
     不会发安装事件，也调不起系统安装 → 必须引导去真正的浏览器 */
  function inAppBrowser() {
    var s = ua();
    if (/MicroMessenger|QQ\/|QQBrowser|Weibo|DingTalk|Alipay|UCBrowser|Quark|Baidu|Bytedance|aweme|XHS|Lark|Feishu/i.test(s)) return true;
    if (/; wv\)/.test(s)) return true;                  // 安卓 WebView 套壳
    if (isIOS() && !/Safari/.test(s)) return true;      // iOS 上不是 Safari，基本都是内置浏览器
    return false;
  }

  function hintText() {
    if (isStandalone()) return '已经装好了：现在这个窗口就是桌面版，直接当 App 用，断网也能看课表。';
    if (inAppBrowser()) return '当前是微信 / QQ / 抖音这类内置浏览器，装不了桌面版。点右上角「…」→「在浏览器打开」（选 Chrome / Edge / 系统浏览器），再回来点这张卡片。';
    if (deferredPrompt) return '这个浏览器支持一键安装，点右下角「立即安装」就行。';
    if (isIOS()) return 'iPhone / iPad 只能用 Safari 装：点底部「分享」→「添加到主屏幕」。';
    if (isAndroid()) return '安卓请用 Chrome / Edge 打开本页：点右上角 ⋮ →「安装应用」或「添加到主屏幕」。';
    return '点浏览器地址栏右侧的安装图标（⊞ / ⊕），或者按下面各平台的手动步骤来。';
  }

  /* 卡片上那行小字（手机版也能看到，手机版会隐藏 .lc-foot） */
  function shortState() {
    if (isStandalone()) return '已装到桌面 · 断网也能看';
    if (inAppBrowser()) return '内置浏览器装不了 · 点开看办法';
    if (deferredPrompt) return '点开可一键安装';
    if (isIOS()) return '分享 → 添加到主屏幕';
    return '点开看安装步骤';
  }

  /* ---------------- 安装入口 ---------------- */
  function sync() {
    // 内置浏览器即使碰巧有安装事件也不能用：系统安装会被拦掉
    var installable = !!deferredPrompt && !inAppBrowser();

    var row = U.$('#installRow');
    if (row) {
      if (isStandalone()) row.hidden = true;
      else {
        row.hidden = false;
        if (installable) {
          U.render(row, U.el('button', {
            class: 'btn btn-sm btn-primary', type: 'button',
            onclick: function () { promptInstall(); }
          }, [U.icon('i-download', 'ico'), '安装到桌面']));
        } else {
          U.render(row, U.el('span', { class: 'tiny faint', text: shortState() }));
        }
      }
    }

    var host = U.$('#installCardHost');
    if (host) host.textContent = shortState();

    var hint = U.$('#installHint');
    if (hint) hint.textContent = hintText();

    var now = U.$('#installNow');
    if (now) now.hidden = !installable;
  }

  function promptInstall() {
    if (isStandalone()) { U.toast('已经装到桌面了', 'ok'); return; }
    if (inAppBrowser()) { U.toast(hintText(), 'warn', { timeout: 8000 }); sync(); return; }
    if (!deferredPrompt) { sync(); return; }
    var p = deferredPrompt;
    deferredPrompt = null;
    try { p.prompt(); } catch (e) { /* 忽略：个别浏览器会抛 */ }
    if (p.userChoice && p.userChoice.then) {
      p.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') U.toast('已装到桌面', 'ok');
        sync();
      });
    }
    sync();
  }

  function adoptPrompt(e) {
    if (!e) return;
    deferredPrompt = e;
    window.CW_INSTALL_PROMPT = null;   // 已经接管，清掉暂存的那份
    sync();
  }

  /* 解析时就监听：这个事件可能早于 DOMContentLoaded 触发 */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();               // 拦掉 Chrome 自己的小横幅，改用站内入口
    adoptPrompt(e);
  });
  window.addEventListener('cw:installprompt', function () { adoptPrompt(window.CW_INSTALL_PROMPT); });

  var nowBtn = U.$('#installNow');
  if (nowBtn) nowBtn.addEventListener('click', function () { promptInstall(); });

  function init() {
    adoptPrompt(window.CW_INSTALL_PROMPT);
    sync();

    if (CW.app && CW.app.onOpen) CW.app.onOpen('install', sync);

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      window.CW_INSTALL_PROMPT = null;
      sync();
      U.toast('已安装到桌面', 'ok');
    });

    if (!canRegister()) return;
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (r) {
      reg = r;
      watchUpdates();
    }).catch(function (e) {
      // 注册失败不影响正常使用（只是没有离线能力）
      console.warn('[pwa] service worker 注册失败：' + ((e && e.message) || e));
    });

    // 断网 / 恢复 时给个提示，别让人以为数据丢了
    window.addEventListener('offline', function () { U.toast('现在离线了：课表还能看，通知和投票要联网。', 'warn', { timeout: 5200 }); });
    window.addEventListener('online', function () { U.toast('网络恢复了', 'ok', { timeout: 2400 }); });
  }

  CW.pwa = {
    init: init,
    install: promptInstall,
    canInstall: function () { return !!deferredPrompt; },
    hint: hintText,
    isStandalone: isStandalone
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
