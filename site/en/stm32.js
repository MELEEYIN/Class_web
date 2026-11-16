/* ==========================================================================
   stm32.js — /en/stm32.html 的增量交互（只做一件小事）
   --------------------------------------------------------------------------
   en.js 已经接管了深色模式、侧栏、搜索、页内目录、标记已学、遮住解析，
   所以这里不再重复。代码块上的「复制」是本站新加的（算法站的 shell.js 有，
   但 /en 子站的 en.js 里没有），单独放一个文件，别的页面不受影响。
   ========================================================================== */
(function () {
  'use strict';

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    /* file:// 或非安全上下文里 clipboard API 不可用，退回 textarea 方案 */
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand failed'));
      } catch (e) {
        document.body.removeChild(ta);
        reject(e);
      }
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    btn.addEventListener('click', function () {
      var box = btn.closest('.codebox');
      var code = box && box.querySelector('code');
      if (!code) return;
      copyText(code.textContent).then(function () {
        var old = btn.textContent;
        btn.textContent = '已复制';
        btn.classList.add('done');
        setTimeout(function () {
          btn.textContent = old;
          btn.classList.remove('done');
        }, 1400);
      }).catch(function () {
        btn.textContent = '复制失败';
        setTimeout(function () { btn.textContent = '复制'; }, 1400);
      });
    });
  });
})();
