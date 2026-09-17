/* ==========================================================================
   bookmarklet.js — 书签小工具真正执行的代码

   为什么要单独放一个文件：
     书签里那点代码是复制到你书签里的，改不了、也不会自动更新 —— 站点一升级，
     旧书签就还是老逻辑（曾经因此出现「抓回主页却显示没识别到内容」）。
     所以书签里现在只有一小段引导代码：它把这个文件注入当前页面并调用
     window.__cwGrab / window.__cwLogin。站点这边改了什么，下次点书签就生效。

   被谁调用：
     · bookmarket 引导代码：__cwGrab(base) / __cwLogin(base, user, pass)
     · base 是校园主页地址（如 https://leeyin.xyz/）
   安全：只在你自己的浏览器里跑，课表数据只发回你自己的主页地址；不上传别处。
   ========================================================================== */
(function () {
  'use strict';

  var TT_URL = '/jsxsd/xskb/xskb_list.do';          // 正方「学期理论课表」

  function toUrlSafeB64(s) {
    return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* 正方课表每个格子里有两份内容：一份 display:none 的打印版（class=kbcontent1）、
     一份可见版，还夹着二维码 <img> 和隐藏 input。原样发回主页会有两个毛病：
       ① 同一门课读两遍 → 重复课程；
       ② 体积大十倍（十几万字符）。
     站点解析只用 rowspan/colspan 和单元格文字，其余属性全部去掉。 */
  function cleanTable(t) {
    try {
      var c = t.cloneNode(true);
      var kill = c.querySelectorAll('[style*="display: none"],[style*="display:none"],.item-box,script,style,img,input,.kbcontent1');
      for (var i = 0; i < kill.length; i++) { if (kill[i].parentNode) kill[i].parentNode.removeChild(kill[i]); }
      function strip(el) {
        var a = [].slice.call(el.attributes);
        for (var k = 0; k < a.length; k++) {
          var n = a[k].name.toLowerCase();
          if (n !== 'rowspan' && n !== 'colspan') el.removeAttribute(a[k].name);
        }
      }
      strip(c);
      var all = c.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) strip(all[j]);
      return c.outerHTML.replace(/&nbsp;/g, ' ');
    } catch (e) {
      return t.outerHTML;
    }
  }

  /** 找「星期」出现最多的那张表（含同源 iframe） */
  function bestTable(doc) {
    var cands = [];
    function scan(d, depth) {
      if (depth > 2) return;
      try {
        var ts = d.querySelectorAll('table');
        for (var i = 0; i < ts.length; i++) {
          var t = ts[i];
          var txt = t.innerText || t.textContent || '';
          if (!txt || txt.replace(/\s+/g, '').length < 60) continue;
          var m = txt.match(/星期[一二三四五六日天]/g);
          cands.push({ el: t, n: m ? m.length : 0, r: t.rows ? t.rows.length : 0 });
        }
      } catch (e) { /* 跨域 iframe 等 */ }
      try {
        var fr = d.querySelectorAll('iframe');
        for (var j = 0; j < fr.length; j++) { if (fr[j].contentDocument) scan(fr[j].contentDocument, depth + 1); }
      } catch (e) { /* 忽略 */ }
    }
    scan(doc, 0);
    cands.sort(function (a, b) { return (b.n - a.n) || (b.r - a.r); });
    if (!cands.length) return null;
    return (cands[0].n >= 3 || cands[0].r >= 6) ? cands[0].el : null;
  }

  function looksLikeLogin(doc) {
    try {
      if (doc.querySelector('input[type=password]')) return true;
      var h = (doc.body && (doc.body.innerText || '')) || '';
      return /统一身份认证|请输入密码|登录/.test(h.slice(0, 1200)) && /密码/.test(h.slice(0, 1200));
    } catch (e) { return false; }
  }

  function say(msg) { try { alert(msg); } catch (e) { /* 忽略 */ } }

  /**
   * 读页面上的报错文字。统一身份认证把错误放在几个小容器里（有时是浮层），
   * 位置很不起眼 —— 用户只会看到「点了登录什么都没发生」。所以这里主动找出来告诉用户。
   */
  function pageError() {
    try {
      var sels = ['#errorDivMsg', '#infoDivMsg', '.errorTxt', '.warningTxt', '.loginError',
        '.error-msg', '.ui-state-error', '.alert-danger'];
      for (var i = 0; i < sels.length; i++) {
        var n = document.querySelector(sels[i]);
        var t = n ? String(n.innerText || n.textContent || '').trim() : '';
        if (t && t.length < 120) return t;
      }
      var body = (document.body && (document.body.innerText || document.body.textContent)) || '';
      var m = body.match(/(用户名或密码[^\n]{0,24}|密码错误|密码不正确|验证码[^\n]{0,20}|账号(?:被)?锁[^\n]{0,16}|用户不存在|登录失败[^\n]{0,24})/);
      return m ? m[1].trim() : '';
    } catch (e) { return ''; }
  }

  /** 把 payload 送回校园主页 */
  function send(base, payload) {
    var s = JSON.stringify(payload);
    var b = toUrlSafeB64(s);
    if (b.length > 90000) {
      try {
        navigator.clipboard.writeText(s);
        say('课表内容比较大（' + b.length + ' 个字符），已经复制到剪贴板。\n请回到校园主页，打开「导入 → 复制粘贴」，粘贴一下即可。');
        return;
      } catch (e) { /* 剪贴板不给用就继续走链接 */ }
    }
    var url = base + '#data=' + b;
    var w = window.open(url, '_blank');
    if (!w) location.href = url;
  }

  function guideNoTable() {
    say('这个页面上没有找到课表。\n\n' +
      '① 先登录教务系统：登录成功后再点一次这个书签，它会自己去拿「学期理论课表」。\n' +
      '② 或者手动打开：左侧栏 → 培养管理 → 我的课表 → 学期理论课表，再点一次书签。\n' +
      '③ 兜底：在课表页点「导出」拿到 .xls，回校园主页用「导入 → 上传文件」。');
  }

  /** 当前页面扫一遍（不在教务系统、或 fetch 失败时的兜底） */
  function domGrab(base) {
    var el = bestTable(document);
    if (el) { send(base, { t: 'html', h: cleanTable(el) }); return; }
    var txt = (document.body && (document.body.innerText || document.body.textContent)) || '';
    // 只有内容真的像课表才当文本发过去，别把随便一个页面的文字发回去
    // （以前会把门户页的文字发回主页，那边显示「没有识别到内容」，让人一头雾水）
    if (/星期[一二三四五六日天]/.test(txt) && /节/.test(txt)) {
      send(base, { t: 'text', h: txt.slice(0, 150000) });
      return;
    }
    guideNoTable();
  }

  /** 抓课表：在教务系统里就同源 fetch 直接取课表页，省得点菜单 */
  function grab(base) {
    if (!/jwxt\./i.test(location.hostname)) { domGrab(base); return; }
    fetch(TT_URL, { credentials: 'include' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = null;
        try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { /* 忽略 */ }
        var el = doc ? bestTable(doc) : null;
        if (el) { send(base, { t: 'html', h: cleanTable(el) }); return; }
        if (doc && looksLikeLogin(doc)) {
          say('看起来教务系统这边没登录成功（拿到的还是登录页）。\n请先登录教务系统，登录后再点一次这个书签。');
          return;
        }
        domGrab(base);
      })
      .catch(function () { domGrab(base); });
  }

  /* ------------------------------------------------------------------
     一键登录 + 抓课表（账号密码由书签传进来，只在本机浏览器里用）
     ------------------------------------------------------------------ */
  function cwLogin(base, user, pass) {
    function cwq(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }
    function pick(selectors, idWords) {
      var i, n;
      for (i = 0; i < selectors.length; i++) { n = cwq(selectors[i]); if (n) return n; }
      var all = document.querySelectorAll('input'), j, s;
      for (i = 0; i < idWords.length; i++) {
        for (j = 0; j < all.length; j++) {
          s = ((all[j].id || '') + ' ' + (all[j].name || '') + ' ' + (all[j].getAttribute('placeholder') || '')).toLowerCase();
          if (s.indexOf(idWords[i]) >= 0) return all[j];
        }
      }
      return null;
    }
    function fill(n, v) {
      if (!n) return false;
      n.focus();
      n.value = v;
      try {
        n.dispatchEvent(new Event('input', { bubbles: true }));
        n.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) { /* 忽略 */ }
      return true;
    }

    var u = pick(['input#userAccount', 'input#account', 'input[name=userAccount]', 'input[name=account]',
      'input[name=username]', 'input[name=userName]', 'input#username', 'input#yhm', 'input[name=yhm]'],
      ['account', 'user', 'name', 'yhm', 'zh']);
    var p = pick(['input#userPassword', 'input#password', 'input[name=userPassword]', 'input[name=password]', 'input[type=password]'],
      ['pass', 'pwd', 'mm']);
    var c = pick(['input#RANDOMCODE', 'input[name=RANDOMCODE]', 'input#captcha', 'input[name=captcha]', 'input[name=verifyCode]'],
      ['randomcode', 'captcha', 'verify', 'checkcode', 'yzm']);

    var onLogin = !!(u && p && document.querySelectorAll('input[type=password]').length);
    var onIdp = /auth\.sztu\.edu\.cn/i.test(location.hostname);
    var title = document.title || '';

    // 没在登录页、也不在课表页 → 当作「已登录」，直接抓
    if (!onLogin && !onIdp && !/课表/.test(title)) { grab(base); return; }
    if (!onLogin && !onIdp) { grab(base); return; }
    if (!onLogin && onIdp) {
      say('这个页面是统一身份认证，但没找到账号密码输入框。\n请手动登录一次，登录成功后再点一次书签即可抓课表。');
      return;
    }

    /* 验证码：可见的验证码框 = 这次真的要验证码（学校按风控决定，有时要有时不要）。
       不能用「框里有没有字」判断 —— 它的 value 是占位文字「验证码」，会被误判成已填好。 */
    var codeHidden = false;
    try { codeHidden = !!(c && (c.offsetParent === null || getComputedStyle(c).display === 'none')); } catch (e) { /* 忽略 */ }
    if (codeHidden && c) c.value = '';
    if (u && user) fill(u, user);
    if (p && pass) fill(p, pass);

    if (!user && !pass) {
      say('没有记住账号密码。\n请手动输入账号密码' + (c && !codeHidden ? '和验证码' : '') + '，登录成功后再点一次书签，就能自动抓课表。');
      return;
    }
    if (c && !codeHidden) {
      say('账号密码已经填好。\n这次学校要求验证码，请手动填写后点登录；登录成功后再点一次这个书签就会自动抓课表。');
      try { c.focus(); } catch (e) { /* 忽略 */ }
      return;
    }

    var btn = cwq('button#loginButton') || cwq('#loginButton') || cwq('input#loginButton') ||
      cwq('a#loginButton') || cwq('button[type=submit]');
    if (!btn && p && p.form) {
      var bs = p.form.querySelectorAll('button,input[type=submit]');
      if (bs.length) btn = bs[0];
    }

    // ① 页面上已经有报错（上一次登录被拒）→ 直接说清楚，别再闷头点一次
    var err0 = pageError();
    if (err0 && /密码|验证码|锁定|不存在|失败/.test(err0)) {
      say('登录没有成功，页面上的提示是：\n「' + err0 + '」\n\n' +
        '· 学号密码对吗？（可以在「导入 → 书签」里重新保存一次账号密码）\n' +
        '· 如果提示要验证码：请手动填验证码后点登录，登录成功后再点一次这个书签。\n' +
        '· 也可以先手动登录一次，然后点「抓课表」那个书签。');
      return;
    }

    say('账号密码已经填好，正在点登录。\n\n' +
      '登录成功后页面会跳到教务系统，这时【再点一次这个书签】它就会自己把课表抓回来。\n' +
      '（如果点了确定以后页面没跳转，说明登录被拒了，稍后会有第二次提示告诉你原因。）');

    // 点真正的登录按钮：页面自己的校验/提交逻辑才会跑
    if (btn) btn.click();
    else if (p && p.form) p.form.submit();

    // ② 过几秒如果还停在登录页，说明没提交成功 / 被拒了 —— 把原因说出来
    setTimeout(function () {
      try {
        var stillLogin = !!(cwq('input[type=password]') && (cwq('#loginButton') || cwq('button[type=submit]')));
        if (!stillLogin) return;                 // 已经跳走了，正常
        var e2 = pageError();
        if (e2) {
          say('登录没成功，页面提示：「' + e2 + '」');
        } else {
          say('点了登录，但页面还停在登录页。\n\n' +
            '· 有可能是学号密码不对 —— 到「导入 → 书签」里重新保存一次账号密码\n' +
            '· 也有可能这次学校要求验证码：手动填一下验证码再点登录，然后点「抓课表」书签\n' +
            '· 最省事的办法还是电脑上用 tools\\一键自动导入课表.bat');
        }
      } catch (e) { /* 页面正在跳转，正常 */ }
    }, 3000);
  }

  window.__cwGrab = grab;
  window.__cwLogin = cwLogin;
  window.__cwBookmarkletVersion = '2026-09-13';
})();
