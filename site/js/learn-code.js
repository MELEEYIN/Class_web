/* ==========================================================================
   learn-code.js — 教程代码块的「语言角标 + 语法高亮 + 输出合并」
   --------------------------------------------------------------------------
   只做一件事：把 <article data-learn-content> 里渲染器吐出来的裸 <pre> 美化。
   侧栏 / 目录 / 进度归 learn-shell.js（整页阅读模式）；本文件只管代码块。

   两种加载场景都支持：
     1) 章节整页（site/acm/python/*.html）：DOMContentLoaded 时自动扫一遍，
        learn-shell.js 已注入的复制按钮会被挪进角标条；
     2) SPA 片段（site/acm/assets/shell.js 把 data/p/py-*.html 塞进 #doc）：
        没有 learn-shell，所以这里自己造复制按钮，并由外壳在每次路由渲染后调
        window.LEARN_CODE.decorate(容器) —— 可重复调用，靠 data-lc 幂等。

   本文件必须排在 learn-shell.js 之后加载（要让 shell 的按钮先就位）。

   输入（site/acm/python/_render.py 产物）：
     <pre class="py">…</pre>       可执行脚本
     <pre class="pycon">…</pre>    >>> REPL 交互
     <pre class="out">…</pre>      上面某个块的实跑输出
     <pre class="shell">…</pre>    命令行
     <pre class="code">…</pre>     通用（C++ 片段 / 纯文本）
     <figure class="code"><figcaption class="code-src">…</figcaption><pre>…</pre></figure>

   输出：
     <div class="lc-code" data-lang="python">
       <div class="lc-head"><span class="lc-lang">Python</span>[复制]</div>
       <pre class="py has-copy"><code>…带 <i class="kw"> 的 HTML…</code></pre>
       <pre class="out lc-out"><code>…</code></pre>   ← 紧跟的输出并进同一张卡
     </div>

   为什么自己写高亮而不上 highlight.js / Prism：
     本站要能双击 file:// 直接打开、无构建步骤、无第三方 CDN 依赖；
     两个正则覆盖 Python / C++ 的"读起来爽"的程度，足够教程场景。
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 词法 ---------------- */
  var PY_KW = 'False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|match|case';
  var PY_BI = 'abs|all|any|bin|bool|bytearray|bytes|callable|chr|classmethod|compile|complex|dict|dir|divmod|enumerate|eval|exec|filter|float|format|frozenset|getattr|globals|hasattr|hash|help|hex|id|input|int|isinstance|issubclass|iter|len|list|locals|map|max|memoryview|min|next|object|oct|open|ord|pow|print|property|range|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|vars|zip|self|cls';
  var PY_SRC =
    '(#[^\\n]*)' +
    '|("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\')' +
    '|("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\')' +
    '|\\b(' + PY_KW + ')\\b' +
    '|\\b(' + PY_BI + ')\\b' +
    '|\\b(\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[jJ]?)\\b' +
    '|(@[A-Za-z_]\\w*)' +
    '|\\b([A-Za-z_]\\w*)(?=\\s*\\()';
  /* 下标即捕获组序号，第 0 位留空占位（少写一个空串就会整条错位） */
  var PY_GROUPS = ['', 'cm', 'st2', 'st', 'kw', 'bi', 'nm', 'dc', 'fn'];

  var CPP_KW = 'alignas|alignof|asm|auto|bool|break|case|catch|char|class|const|constexpr|continue|decltype|default|delete|do|double|else|enum|explicit|extern|false|float|for|friend|goto|if|inline|int|long|namespace|new|nullptr|operator|private|protected|public|return|short|signed|sizeof|static|struct|switch|template|this|throw|true|try|typedef|typename|union|unsigned|using|virtual|void|volatile|while';
  var CPP_BI = 'std|string|vector|map|set|unordered_map|unordered_set|queue|stack|deque|priority_queue|pair|array|sort|max|min|swap|abs|printf|scanf|puts|cout|cerr|cin|endl|size|begin|end|first|second|push_back|pop_back|emplace_back|make_pair|find|count|insert|erase|INT_MAX|INT_MIN';
  var CPP_SRC =
    '(\\/\\/[^\\n]*)' +
    '|(\\/\\*[\\s\\S]*?\\*\\/)' +
    '|(^[ \\t]*#[^\\n]*)' +
    '|("(?:\\\\.|[^"\\\\\\n])*")' +
    '|(\'(?:\\\\.|[^\'\\\\\\n])*\')' +
    '|\\b(' + CPP_KW + ')\\b' +
    '|\\b(' + CPP_BI + ')\\b' +
    '|\\b(\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b' +
    '|\\b([A-Za-z_]\\w*)(?=\\s*\\()';
  var CPP_GROUPS = ['', 'cm', 'cm', 'at', 'st', 'st2', 'kw', 'bi', 'nm', 'fn'];

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function wrap(cls, s) { return '<i class="' + cls + '">' + esc(s) + '</i>'; }

  /* 单趟扫描：re 必须带 g（REPL 逐行处理时用不带 m 的副本） */
  function hlText(src, re, groups) {
    var out = '', last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (m.index > last) { out += esc(src.slice(last, m.index)); }
      for (var i = 1; i < groups.length; i++) {
        if (m[i]) { out += wrap(groups[i], m[i]); break; }
      }
      last = m.index + m[0].length;
    }
    return out + esc(src.slice(last));
  }

  var PY_RE = new RegExp(PY_SRC, 'gm');
  var PY_RE_LINE = new RegExp(PY_SRC, 'g');
  var CPP_RE = new RegExp(CPP_SRC, 'gm');
  var CPP_RE_LINE = new RegExp(CPP_SRC, 'g');

  /* >>> 提示符压暗，输出行整行压暗；只有代码部分染色 */
  function hlRepl(src) {
    var lines = src.split('\n'), out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = /^(>>>|\.\.\.)(\s?)([\s\S]*)$/.exec(line);
      if (m) {
        out.push('<i class="lc-p">' + m[1] + '</i>' + m[2] + hlText(m[3], PY_RE_LINE, PY_GROUPS));
      } else if (/^\s*$/.test(line)) {
        out.push('');
      } else {
        out.push('<i class="out">' + esc(line) + '</i>');
      }
    }
    return out.join('\n');
  }

  /* ---------------- 分类 ---------------- */
  var LABEL = { python: 'Python', pycon: 'Python REPL', cpp: 'C++', shell: 'Shell', out: '输出', text: '文本' };

  function looksCpp(text) {
    return /#include|std::|\bcout\b|\bprintf\s*\(|\bint\s+main\s*\(|->\s*\w+\s*\(|::/.test(text);
  }

  function kindOf(pre, code) {
    var cls = (pre.className || '').toLowerCase();
    if (/(^|\s)pycon(\s|$)/.test(cls)) { return 'pycon'; }
    if (/(^|\s)py(\s|$)/.test(cls)) { return 'python'; }
    if (/(^|\s)(cpp|c\+\+|cxx)(\s|$)/.test(cls)) { return 'cpp'; }
    if (/(^|\s)(shell|sh|bash|console)(\s|$)/.test(cls)) { return 'shell'; }
    if (/(^|\s)(out|output|stdout)(\s|$)/.test(cls)) { return 'out'; }
    if (looksCpp(code.textContent || '')) { return 'cpp'; }
    return 'text';
  }

  function ensureCode(pre) {
    var code = pre.querySelector('code');
    if (code) { return code; }
    code = document.createElement('code');
    var kids = [].slice.call(pre.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 1 && /(^|\s)code-copy(\s|$)/.test(n.className || '')) { continue; }
      code.appendChild(n);
    }
    pre.appendChild(code);
    return code;
  }

  function paint(code, kind) {
    if (!code || code.querySelector('i')) { return; }
    var src = code.textContent || '';
    if (kind === 'pycon') { code.innerHTML = hlRepl(src); return; }
    if (kind === 'python' || kind === 'shell') {
      /* shell 与 Python 共用词法：注释 / 串 / 关键字都对，够用 */
      code.innerHTML = hlText(src, PY_RE, PY_GROUPS);
      return;
    }
    if (kind === 'cpp') { code.innerHTML = hlText(src, CPP_RE, CPP_GROUPS); }
  }

  /* ---------------- 组装卡片 ---------------- */
  function makeCard(lang) {
    var box = document.createElement('div');
    box.className = 'lc-code';
    box.setAttribute('data-lang', lang);
    var head = document.createElement('div');
    head.className = 'lc-head';
    var tag = document.createElement('span');
    tag.className = 'lc-lang';
    tag.textContent = LABEL[lang] || lang;
    head.appendChild(tag);
    box.appendChild(head);
    return box;
  }

  /* ---------------- 复制按钮 ----------------
     learn-shell.js 在整页模式下已经给每个 pre 注入了 .code-copy；
     SPA 片段里没有它，所以缺了就自己造一个，行为与 shell 版一致。 */
  function bindCopy(pre) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.textContent = '复制';
    btn.addEventListener('click', function () {
      var code = pre.querySelector('code');
      var text = (code || pre).textContent || '';
      function done() {
        btn.textContent = '已复制';
        btn.classList.add('done');
        window.setTimeout(function () { btn.textContent = '复制'; btn.classList.remove('done'); }, 1400);
      }
      function legacy() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { legacy(); });
      } else { legacy(); }
    });
    pre.classList.add('has-copy');
    return btn;
  }

  function moveCopyButton(pre, head) {
    if (!head) { return; }
    var btn = pre.querySelector('.code-copy') || bindCopy(pre);
    if (!btn) { return; }
    if (btn.parentNode !== head) {
      btn.style.position = 'static';
      btn.style.top = 'auto';
      btn.style.right = 'auto';
      btn.style.marginLeft = 'auto';
      head.appendChild(btn);
    }
  }

  function decorate(pre) {
    if (!pre || pre.getAttribute('data-lc') === '1') { return; }
    pre.setAttribute('data-lc', '1');

    var code = ensureCode(pre);
    var kind = kindOf(pre, code);
    paint(code, kind);

    var prev = pre.previousElementSibling;

    /* 渲染器会把输出块包进 <div class="out-wrap"><div class="out-lbl">运行输出</div><pre>… */
    var host = pre.parentElement;
    var wrapped = !!(host && /(^|\s)out-wrap(\s|$)/.test(host.className || ''));
    if (wrapped) { prev = host.previousElementSibling; }
    var prevIsCard = prev && (/(^|\s)lc-code(\s|$)/.test(prev.className || '') ||
      (prev.tagName === 'FIGURE' && /(^|\s)lc-dark(\s|$)/.test(prev.className || '')));

    /* ① 输出块：紧跟在上一个代码卡（或带文件名的 figure）后面就并进去，别另起一张卡 */
    if (kind === 'out') {
      var node = wrapped ? host : pre;
      node.classList.add('lc-out');
      if (wrapped) { node.classList.add('lc-out-wrap'); }
      /* a) 渲染器已把输出放进同一个 figure：保持层级，交给 CSS 上色 */
      var figHost = host && host.parentElement;
      if (figHost && figHost.tagName === 'FIGURE' && /(^|\s)code(\s|$)/.test(figHost.className || '')) {
        figHost.classList.add('lc-dark');
        return;
      }
      /* b) 紧跟上一张卡：并进同一张卡 */
      if (prevIsCard) { prev.appendChild(node); return; }
      /* c) 孤立输出段：自己一张卡 */
      var outCard = makeCard('out');
      node.parentNode.insertBefore(outCard, node);
      outCard.appendChild(node);
      moveCopyButton(pre, outCard.querySelector('.lc-head'));
      return;
    }

    /* ② 渲染器已生成的带文件名块：只加深底色 + 角标 */
    var fig = pre.parentElement;
    if (fig && fig.tagName === 'FIGURE' && /(^|\s)code(\s|$)/.test(fig.className || '')) {
      fig.classList.add('lc-dark');
      fig.setAttribute('data-lang', kind);
      var cap = fig.querySelector('.code-src');
      if (cap && !cap.querySelector('.lc-lang')) {
        var chip = document.createElement('span');
        chip.className = 'lc-lang';
        chip.textContent = LABEL[kind] || kind;
        chip.style.cssText = 'float:right;margin-left:10px';
        cap.appendChild(chip);
      }
      if (cap) { moveCopyButton(pre, cap); }
      return;
    }

    /* ③ 普通块：包一层卡 */
    var box = makeCard(kind);
    pre.parentNode.insertBefore(box, pre);
    box.appendChild(pre);
    moveCopyButton(pre, box.querySelector('.lc-head'));
  }

  function decorateAll(scope) {
    var host = (scope && scope.nodeType === 1) ? scope : document;
    var root = (host.matches && host.matches('[data-learn-content]'))
      ? host : host.querySelector('[data-learn-content]');
    if (!root || root.getAttribute('data-lc') === '1') { return 0; }
    root.setAttribute('data-lc', '1');
    var pres = [].slice.call(root.querySelectorAll('pre'));
    for (var i = 0; i < pres.length; i++) { decorate(pres[i]); }
    return pres.length;
  }

  /* SPA 外壳（site/acm/assets/shell.js）每次渲染完路由都会调一次 */
  window.LEARN_CODE = { decorate: decorateAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { decorateAll(document); });
  } else {
    decorateAll(document);
  }
})();
