/* ==========================================================================
   dialog.js — 页面内弹窗，替代 window.confirm / window.prompt

   为什么不用原生弹窗：
     · iOS/iPadOS 把网站「添加到主屏幕」后是 standalone 模式（本站 manifest 就是
       display: standalone），这种模式下 confirm() / prompt() 会被系统直接忽略：
       confirm 返回 false、prompt 返回 null。于是手机上点「删除」「清空」看起来
       完全没反应 —— 这就是「手机版后台无法正常使用」的典型症状。
     · 原生弹窗在手机上样式丑、还会挡住内容，长得也不像本站。

   用法：
     CW.dialog.confirm('要删掉这条吗？').then(function (yes) { … });
     CW.dialog.text('输入「清空」两个字确认', { mustEqual: '清空' }).then(function (s) { … });
   两个函数都返回 Promise：confirm → true/false；text → 字符串或 null（取消）。
   样式内联注入，所以 admin 页面（只加载 admin.js）和首页都能直接用。
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var CSS_ID = 'cw-dialog-style';
  var openCount = 0;

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = [
      '.cwd-mask{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;',
      'padding:18px;background:rgba(15,23,42,.45);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);}',
      '.cwd-box{width:100%;max-width:420px;background:var(--surface,#fff);color:var(--ink,#111827);',
      'border:1px solid var(--line,#e5e7eb);border-radius:16px;box-shadow:0 18px 48px rgba(15,23,42,.28);',
      'padding:18px 18px 14px;font-size:15px;line-height:1.6;}',
      '.cwd-msg{white-space:pre-wrap;word-break:break-word;}',
      '.cwd-input{width:100%;margin-top:12px;padding:11px 12px;font-size:16px;line-height:1.4;',
      'border:1px solid var(--line,#e5e7eb);border-radius:11px;background:var(--surface-2,#f8fafc);',
      'color:inherit;font-family:inherit;}',
      '.cwd-input:focus{outline:2px solid var(--accent,#2563eb);outline-offset:1px;}',
      '.cwd-hint{margin-top:8px;font-size:12.5px;color:var(--muted,#64748b);}',
      '.cwd-actions{display:flex;gap:10px;margin-top:16px;}',
      '.cwd-btn{flex:1 1 0;min-height:44px;padding:10px 14px;font-size:15px;font-weight:700;',
      'border-radius:11px;border:1px solid var(--line,#e5e7eb);background:var(--surface-2,#f1f5f9);',
      'color:var(--ink-2,#334155);cursor:pointer;font-family:inherit;}',
      '.cwd-btn:active{transform:translateY(1px);}',
      '.cwd-ok{background:var(--accent,#2563eb);border-color:transparent;color:#fff;}',
      '.cwd-ok[disabled]{opacity:.5;}',
      '.cwd-danger{background:var(--danger,#dc2626);border-color:transparent;color:#fff;}'
    ].join('');
    document.head.appendChild(style);
  }

  function open(opts) {
    ensureCss();
    return new Promise(function (resolve) {
      var done = false;

      var mask = document.createElement('div');
      mask.className = 'cwd-mask';
      mask.setAttribute('role', 'presentation');

      var box = document.createElement('div');
      box.className = 'cwd-box';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');

      var msg = document.createElement('div');
      msg.className = 'cwd-msg';
      msg.textContent = opts.message || '';
      box.appendChild(msg);

      var input = null;
      if (opts.input) {
        input = document.createElement('input');
        input.className = 'cwd-input';
        input.type = opts.password ? 'password' : 'text';
        input.value = opts.value || '';
        input.placeholder = opts.placeholder || '';
        input.autocomplete = opts.password ? 'current-password' : 'off';
        box.appendChild(input);
      }

      if (opts.hint) {
        var hint = document.createElement('div');
        hint.className = 'cwd-hint';
        hint.textContent = opts.hint;
        box.appendChild(hint);
      }

      var actions = document.createElement('div');
      actions.className = 'cwd-actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'cwd-btn cwd-cancel';
      cancelBtn.textContent = opts.cancelText || '取消';

      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      // 始终带 cwd-ok（稳定的选择器），危险操作再叠一个 cwd-danger 换配色
      okBtn.className = 'cwd-btn cwd-ok' + (opts.danger ? ' cwd-danger' : '');
      okBtn.textContent = opts.okText || '确定';

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      box.appendChild(actions);
      mask.appendChild(box);
      document.body.appendChild(mask);
      openCount += 1;

      function close(value) {
        if (done) return;
        done = true;
        openCount -= 1;
        document.removeEventListener('keydown', onKey, true);
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        resolve(value);
      }

      function okValue() {
        if (!opts.input) return true;
        var v = input.value;
        if (opts.mustEqual && v.trim() !== opts.mustEqual) return null;   // 没输对就当没确认
        if (opts.required && !v.trim()) return null;
        return v;
      }

      function refresh() {
        if (!opts.input) return;
        var v = okValue();
        okBtn.disabled = (v === null);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(opts.input ? null : false); }
        else if (e.key === 'Enter' && opts.input) {
          var v = okValue();
          if (v !== null) { e.preventDefault(); close(v); }
        }
      }

      cancelBtn.addEventListener('click', function () { close(opts.input ? null : false); });
      okBtn.addEventListener('click', function () {
        var v = okValue();
        if (v === null) return;
        close(v);
      });
      mask.addEventListener('click', function (e) {
        if (e.target === mask) close(opts.input ? null : false);
      });
      document.addEventListener('keydown', onKey, true);

      if (input) {
        input.addEventListener('input', refresh);
        refresh();
        // 手机上要等一下再聚焦，不然键盘可能弹不出来
        setTimeout(function () { try { input.focus(); } catch (e) { /* 忽略 */ } }, 60);
      } else {
        setTimeout(function () { try { okBtn.focus(); } catch (e) { /* 忽略 */ } }, 60);
      }
    });
  }

  CW.dialog = {
    /** 确认框 → Promise<boolean>（取消/关闭 = false） */
    confirm: function (message, opts) {
      opts = opts || {};
      return open({
        message: message,
        okText: opts.okText || '确定',
        cancelText: opts.cancelText || '取消',
        danger: !!opts.danger
      });
    },
    /** 输入框 → Promise<string|null>（取消 = null；mustEqual 不匹配时「确定」是灰的） */
    text: function (message, opts) {
      opts = opts || {};
      return open({
        message: message,
        input: true,
        password: !!opts.password,
        value: opts.value || '',
        placeholder: opts.placeholder || '',
        hint: opts.hint || '',
        mustEqual: opts.mustEqual || '',
        required: opts.required !== false,
        okText: opts.okText || '确定',
        cancelText: opts.cancelText || '取消',
        danger: !!opts.danger
      });
    },
    get isOpen() { return openCount > 0; }
  };
})();
