/* ==========================================================================
   attach.js — 附件（通知 / 公共事务都能带图片、文档）

   怎么工作的：
     · 文件不走 base64：直接把原始字节 PUT/POST 给本站的 /api/file（要管理密码）。
     · 上传成功后拿到 { id, name, type, image, size }，这个元数据跟着通知/事务一起发布；
       列表接口里只有这点元数据，图片本身在 /api/file/<id> 上（带一年缓存，一个设备只下一次）。
     · 限制：单个 5MB、每条最多 6 个；只收图片(png/jpg/gif/webp)、pdf、txt、office、zip。

   用法：
     var att = CW.attach.mount(document.getElementById('box'), { by: '班长' });
     …发布时带上 att.files()
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};

  /* 这个模块要在两种页面上跑：
       · 首页（有 util.js，用完整的 U.el/U.render/U.icon/U.toast）
       · 后台 /admin（只加载 dialog.js + attach.js + admin.js，没有 util.js）
     所以这里必须在没有 CW.util 时自带一份最小实现，否则后台页里
     一调用 U.el 就抛错 —— 表现就是「附件区是个空框、没有加附件按钮」。 */
  function makeLocalUtil() {
    function el(tag, attrs, children) {
      var node = document.createElement(tag);
      if (attrs) {
        Object.keys(attrs).forEach(function (k) {
          var v = attrs[k];
          if (v === null || v === undefined || v === false) return;
          if (k === 'text') { node.textContent = String(v); return; }
          if (k === 'style' && typeof v === 'object') { Object.assign(node.style, v); return; }
          if (k === 'onclick' && typeof v === 'function') { node.addEventListener('click', v); return; }
          if (k === 'class') { node.className = String(v); return; }
          if (k === 'hidden') { node.hidden = !!v; return; }
          node.setAttribute(k, String(v));
        });
      }
      append(node, children);
      return node;
    }
    function append(node, children) {
      if (children === null || children === undefined || children === false) return;
      if (Array.isArray(children)) { children.forEach(function (c) { append(node, c); }); return; }
      if (children instanceof Node) { node.appendChild(children); return; }
      node.appendChild(document.createTextNode(String(children)));
    }
    return {
      el: el,
      render: function (box, content) {
        box.textContent = '';
        append(box, content);
      },
      icon: function (id, cls) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', cls || 'ico');
        svg.setAttribute('aria-hidden', 'true');
        var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#' + id);
        svg.appendChild(use);
        return svg;
      },
      toast: function (msg, type) {
        var wrap = document.getElementById('toastWrap');
        if (!wrap) { return; }
        var n = document.createElement('div');
        n.className = 'toast toast-' + (type || 'info');
        n.textContent = msg;
        wrap.appendChild(n);
        setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 4200);
      }
    };
  }

  var U = CW.util || makeLocalUtil();

  var VERSION = 'v4';        // 拖拽修复版：提示文字里会显示，方便确认页面有没有加载到新代码
  var LIMIT_FILES = 6;
  var LIMIT_BYTES = 5 * 1024 * 1024;
  var OK_EXT = /\.(png|jpe?g|gif|webp|pdf|txt|docx?|xlsx?|pptx?|zip)$/i;

  function humanSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (Math.round(n / 1024 / 102.4) / 10) + ' MB';
  }

  function fileUrl(id) { return '/api/file/' + encodeURIComponent(id); }

  /** 记住的管理密码（和通知后台 / 公共事务共用同一个 cw.adminKey） */
  function savedKey() {
    try { return (U.lsGet ? U.lsGet('adminKey', '') : '') || ''; } catch (e) { return ''; }
  }
  function rememberKey(k) {
    try { if (U.lsSet) U.lsSet('adminKey', k); } catch (e) { /* 忽略 */ }
  }

  /** 问一次管理密码（用页面内弹窗，手机上原生弹窗会被忽略） */
  function askKey() {
    var dlg = window.CW && CW.dialog;
    if (dlg && dlg.text) {
      return dlg.text('上传附件需要管理密码（和通知后台同一个）。', {
        password: true, placeholder: '管理密码', okText: '确定',
        hint: '输一次就记住了，以后不用再输。'
      }).then(function (v) { return String(v || '').trim(); });
    }
    try { return Promise.resolve(String(window.prompt('上传附件需要管理密码：') || '').trim()); }
    catch (e) { return Promise.resolve(''); }
  }

  /** 上传一个文件 → Promise<元数据>；遇到 401 会问密码并自动重传一次 */
  function upload(file, key) {
    return uploadOnce(file, key).then(function (res) {
      if (res && res.ok) return res;
      if (!res || !res.needKey) return res;
      // 密码不对/没带：问一次，记住，再传
      return askKey().then(function (typed) {
        if (!typed) return { ok: false, error: '没有输入管理密码，附件没传上去。' };
        rememberKey(typed);
        return uploadOnce(file, typed);
      });
    });
  }

  function uploadOnce(file, key) {
    return new Promise(function (resolve) {
      if (!file) return resolve({ ok: false, error: '没有文件' });
      if (file.size > LIMIT_BYTES) {
        return resolve({ ok: false, error: file.name + ' 太大（' + humanSize(file.size) + '），单个最多 5MB' });
      }
      if (!OK_EXT.test(file.name || '')) {
        return resolve({ ok: false, error: file.name + ' 这种类型不支持（只收图片 / pdf / txt / Word / Excel / PPT / zip）' });
      }
      fetch('/api/file', {
        method: 'POST',
        headers: {
          'x-cw-key': key || '',
          'x-cw-name': encodeURIComponent(file.name || 'file'),
          'content-type': 'application/octet-stream'
        },
        body: file
      }).then(function (r) {
        return r.json().catch(function () { return { ok: false, error: '服务器返回的不是 JSON（HTTP ' + r.status + '）' }; })
          .then(function (res) {
            if (res && res.ok) return resolve({ ok: true, file: res.file });
            var needKey = r.status === 401;
            resolve({ ok: false, needKey: needKey, error: (res && res.error) || ('上传失败（HTTP ' + r.status + '）') });
          });
      }).catch(function (e) {
        resolve({ ok: false, error: (e && e.message) || '网络失败' });
      });
    });
  }

  /** 渲染一组附件（只读展示，给通知弹窗 / 公共事务列表用） */
  function render(files, opts) {
    files = Array.isArray(files) ? files : [];
    if (!files.length) return null;
    opts = opts || {};

    // opts.links = true：不出缩略图（通知弹窗里就不放图片网格），全部按一行一个列出来
    var forceLinks = !!opts.links;
    var imgs = files.filter(function (f) { return f.image; });
    var docs = files.filter(function (f) { return !f.image; });
    var wrap = U.el('div', { class: 'att-list' + (opts.compact ? ' is-compact' : '') });

    // 缩略图：点了就地看大图（以前是 target=_blank 开新标签页）
    if (imgs.length && !forceLinks) {
      var grid = U.el('div', { class: 'att-thumbs' });
      imgs.forEach(function (f) {
        grid.appendChild(U.el('button', {
          type: 'button', class: 'att-thumb',
          'data-img-view': fileUrl(f.id), 'data-img-name': f.name,
          title: f.name + '（' + humanSize(f.size) + '）· 点开看大图'
        }, [
          U.el('img', { src: fileUrl(f.id), alt: f.name, loading: 'lazy' })
        ]));
      });
      wrap.appendChild(grid);
    }

    // 文件行：图片也是「点开看大图」，其它格式照旧下载
    var rows = forceLinks ? files.slice() : docs;
    if (rows.length) {
      var list = U.el('div', { class: 'att-files' });
      rows.forEach(function (f) {
        list.appendChild(f.image ? U.el('button', {
          type: 'button', class: 'att-file is-image',
          'data-img-view': fileUrl(f.id), 'data-img-name': f.name,
          title: f.name + '（' + humanSize(f.size) + '）· 点开看大图'
        }, [
          U.icon('i-image', 'ico'),
          U.el('span', { class: 'att-name', text: f.name }),
          U.el('span', { class: 'att-size faint', text: '看大图' })
        ]) : U.el('a', {
          class: 'att-file', href: fileUrl(f.id), download: f.name,
          title: '下载 ' + f.name
        }, [
          U.icon('i-download', 'ico'),
          U.el('span', { class: 'att-name', text: f.name }),
          U.el('span', { class: 'att-size faint', text: humanSize(f.size) })
        ]));
      });
      wrap.appendChild(list);
    }
    return wrap;
  }

  /* ==========================================================================
     图片大图预览
     以前通知里的图片是 <a download>，手机上一点就变成「下载文件」，
     图看不到、退也退不出来。现在统一走这个就地预览层：
     ✕ / 点背景 / Esc 都能关，另外给「下载」和「新标签页」两个出口。
     ========================================================================== */
  var viewer = null, viewerImg = null, viewerName = null, viewerDl = null, viewerOpen = null;

  function ensureViewer() {
    if (viewer) return viewer;
    viewerImg = U.el('img', { class: 'iv-img', alt: '' });
    viewerName = U.el('div', { class: 'iv-name' });
    viewerDl = U.el('a', { class: 'iv-btn', download: '' }, [U.icon('i-download', 'ico'), U.el('span', { text: '下载' })]);
    viewerOpen = U.el('a', { class: 'iv-btn', target: '_blank', rel: 'noopener' }, [U.icon('i-external', 'ico'), U.el('span', { text: '新标签页' })]);
    var closeBtn = U.el('button', { type: 'button', class: 'iv-close', 'aria-label': '关闭大图', title: '关闭' }, [U.icon('i-close', 'ico')]);
    closeBtn.addEventListener('click', function () { closeViewer(); });
    var backdrop = U.el('div', { class: 'iv-backdrop' });
    backdrop.addEventListener('click', function () { closeViewer(); });
    viewer = U.el('div', {
      class: 'img-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': '查看大图', hidden: true
    }, [
      backdrop, viewerImg,
      U.el('div', { class: 'iv-bar' }, [viewerName, viewerDl, viewerOpen, closeBtn])
    ]);
    document.body.appendChild(viewer);
    return viewer;
  }

  function onViewerKey(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();          // 只关大图；别顺手把下面的弹窗也关掉
    closeViewer();
  }

  function openViewer(url, name) {
    if (!url) return;
    var v = ensureViewer();
    viewerImg.src = url;
    viewerImg.alt = name || '图片';
    viewerName.textContent = name || '';
    viewerDl.setAttribute('href', url);
    viewerDl.setAttribute('download', name || 'image');
    viewerOpen.setAttribute('href', url);
    v.hidden = false;
    void v.offsetWidth;
    v.classList.add('open');
    document.body.classList.add('img-viewer-open');
    document.addEventListener('keydown', onViewerKey, true);
  }

  function closeViewer() {
    if (!viewer) return;
    var node = viewer;
    node.classList.remove('open');
    document.body.classList.remove('img-viewer-open');
    document.removeEventListener('keydown', onViewerKey, true);
    setTimeout(function () {
      if (node.classList.contains('open')) return;
      node.hidden = true;
      viewerImg.removeAttribute('src');
    }, 230);
  }

  /* 用事件委托：附件会出现在弹窗、编辑页等很多地方，逐个绑会漏 */
  function bindViewer() {
    if (document.__cwImgViewerBound) return;
    document.__cwImgViewerBound = true;
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-img-view]') : null;
      if (!t) return;
      e.preventDefault();
      openViewer(t.getAttribute('data-img-view'), t.getAttribute('data-img-name'));
    });
  }
  bindViewer();

  /**
   * 挂一个「附件区」到 box 上：选文件 → 立刻上传 → 显示成小卡片（可删）。
   * 返回 { files(), clear(), setKey() }
   */
  /* 已经挂上去的附件区。页面级拖放要在这里面找「该收给谁」。 */
  var mountRegistry = [];

  function visibleMount() {
    for (var i = mountRegistry.length - 1; i >= 0; i--) {
      var el = mountRegistry[i].el;
      if (!el) continue;
      // 注意别用 offsetParent：模态框 / 固定定位的祖先会让它返回 null，
      // 那样明明看得见的附件区会被判成不可见 → 拖进去没人接（之前的 bug）
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return mountRegistry[i];
    }
    return null;
  }

  /* 页面级拖放：用户多半不会精确地对准那个虚线框 ——
     以前拖到框外会被「防止浏览器打开文件」那层拦截静默吃掉，看着就像没反应。
     现在：拖到页面任何地方都会交给当前可见的附件区；拖放期间虚线框还是高亮的。 */
  var dropGuardBound = false;
  var dragBanner = null;
  function showBanner(text) {
    if (!dragBanner) {
      dragBanner = document.createElement('div');
      dragBanner.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:30000;' +
        'padding:9px 16px;border-radius:999px;background:var(--accent,#2563eb);color:#fff;font-size:13px;font-weight:700;' +
        'box-shadow:0 10px 28px rgba(15,23,42,.28);pointer-events:none;opacity:0;transition:opacity .15s';
      document.body.appendChild(dragBanner);
    }
    dragBanner.textContent = text;
    dragBanner.style.opacity = '1';
  }
  function hideBanner() { if (dragBanner) dragBanner.style.opacity = '0'; }

  function bindGlobalDrop() {
    if (dropGuardBound) return;
    dropGuardBound = true;

    window.addEventListener('dragend', hideBanner);

    function hasFiles(e) {
      var dt = e && e.dataTransfer;
      if (!dt) return false;
      var types = dt.types ? [].slice.call(dt.types) : [];
      return types.indexOf('Files') >= 0 || (dt.files && dt.files.length > 0);
    }

    document.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { /* 忽略 */ }
      var m = visibleMount();
      if (m) m.el.classList.add('is-drop');
      var kind = '';
      try { kind = [].slice.call(e.dataTransfer.types).join(','); } catch (err) { /* 忽略 */ }
      showBanner('松手就会传到附件区' + (kind ? '（识别到：' + kind + '）' : '') + (m ? '' : ' — 但页面上没有可见的附件区'));
    });
    document.addEventListener('dragleave', function (e) {
      if (e.target !== document && e.target !== document.documentElement) return;
      mountRegistry.forEach(function (m) { m.el.classList.remove('is-drop'); });
      hideBanner();
    });
    document.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      hideBanner();
      mountRegistry.forEach(function (m) { m.el.classList.remove('is-drop'); });
      // 导入弹窗自己的拖放区（上传 .xls 那个）优先，不抢
      var t = e.target;
      if (t && t.closest && t.closest('.dropzone')) return;
      var files = filesFromDataTransfer(e.dataTransfer);
      if (!files.length) {
        var kinds = '';
        try { kinds = e.dataTransfer && e.dataTransfer.types ? [].slice.call(e.dataTransfer.types).join(',') : ''; } catch (err) { /* 忽略 */ }
        U.toast('松手了，但没读到文件' + (kinds ? '（拖进来的类型：' + kinds + '）' : '') +
          '。可以点「加附件」自己选文件，或先把文件存到本地再拖。', 'warn', { timeout: 6000 });
        return;
      }
      var target = null;
      if (t && t.closest) {
        for (var i = mountRegistry.length - 1; i >= 0; i--) {
          if (mountRegistry[i].el.contains(t)) { target = mountRegistry[i]; break; }
        }
      }
      if (!target) target = visibleMount();
      if (!target) return;
      U.toast('收到 ' + files.length + ' 个文件，正在上传…', 'info', 2600);
      target.addFiles(files);
    });
  }

  /** 从一次拖放/粘贴事件里取出文件（files 和 items 都看，真实拖拽经常只有 items 有货） */
  function filesFromDataTransfer(dt) {
    var out = [];
    if (!dt) return out;
    try {
      if (dt.files && dt.files.length) {
        for (var i = 0; i < dt.files.length; i++) if (dt.files[i]) out.push(dt.files[i]);
      }
    } catch (e) { /* 忽略 */ }
    if (!out.length) {
      try {
        var items = dt.items ? [].slice.call(dt.items) : [];
        for (var j = 0; j < items.length; j++) {
          var it = items[j];
          if (it && it.kind === 'file' && typeof it.getAsFile === 'function') {
            var f = it.getAsFile();
            if (f) out.push(f);
          }
        }
      } catch (e) { /* 忽略 */ }
    }
    return out;
  }

  /** 页面级粘贴（Ctrl+V）：剪贴板里有图片/文件时收进附件区 */
  var pasteBound = false;
  function bindPaste() {
    if (pasteBound) return;
    pasteBound = true;
    document.addEventListener('paste', function (e) {
      var dt = e.clipboardData;
      if (!dt) return;
      var files = [];
      try {
        var items = dt.items ? [].slice.call(dt.items) : [];
        for (var i = 0; i < items.length; i++) {
          if (items[i] && items[i].kind === 'file') {
            var f = items[i].getAsFile();
            if (f) files.push(f);
          }
        }
      } catch (err) { /* 忽略 */ }
      if (!files.length) return;
      var target = visibleMount();
      if (!target) return;
      e.preventDefault();
      U.toast('从剪贴板收到 ' + files.length + ' 个文件，正在上传…', 'info', 2600);
      target.addFiles(files);
    });
  }

  function mount(box, opts) {
    opts = opts || {};
    var state = { list: [], key: opts.key || savedKey(), busy: 0 };
    if (!box) return { files: function () { return []; }, clear: function () {}, setKey: function () {} };

    var input = U.el('input', {
      type: 'file', multiple: true, style: { display: 'none' },
      accept: '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip'
    });
    var chips = U.el('div', { class: 'att-chips' });
    var hint = U.el('span', { class: 'tiny faint att-hint', text: '把文件拖进这个框，或点左边按钮；单个 ≤ 5MB，最多 ' + LIMIT_FILES + ' 个' });
    var addBtn = U.el('button', {
      class: 'btn btn-sm btn-ghost', type: 'button', onclick: function () { input.click(); }
    }, [U.icon('i-upload', 'ico'), '加附件']);

    function refresh() {
      U.render(chips, state.list.length ? state.list.map(function (f) {
        return U.el('span', { class: 'att-chip' }, [
          f.image ? U.el('img', { class: 'att-chip-img', src: fileUrl(f.id), alt: '' }) : U.icon('i-download', 'ico'),
          U.el('span', { class: 'att-chip-name', text: f.name }),
          U.el('button', {
            class: 'att-chip-x', type: 'button', title: '移除', 'aria-label': '移除附件',
            onclick: function () {
              state.list = state.list.filter(function (x) { return x.id !== f.id; });
              refresh();
            }
          }, [U.icon('i-close', 'ico')])
        ]);
      }) : []);
      addBtn.disabled = state.list.length >= LIMIT_FILES || state.busy > 0;
      if (state.list.length >= LIMIT_FILES) hint.textContent = '已经到 ' + LIMIT_FILES + ' 个上限了';
      else hint.textContent = '把文件拖到这里（页面任意位置都行），或点左边按钮 · ' + VERSION + '；单个 ≤ 5MB，最多 ' + LIMIT_FILES + ' 个';
    }

    input.addEventListener('change', function () {
      var picked = [].slice.call(input.files || []);
      input.value = '';
      addFiles(picked);
    });

    /** 收下一批文件：点选和拖拽都走这里 */
    function addFiles(picked) {
      if (!picked || !picked.length) return;
      picked.forEach(function (file) {
        if (state.list.length >= LIMIT_FILES) { U.toast('最多 ' + LIMIT_FILES + ' 个附件', 'warn'); return; }
        // 拖进来的可能是文件夹
        if (file.size === 0 && !/\.(txt|md)$/i.test(file.name || '')) {
          U.toast(file.name + ' 读不到内容（文件夹？），换个文件试试。', 'warn', { timeout: 4000 });
          return;
        }
        state.busy += 1;
        refresh();
        var chipLoading = U.el('span', { class: 'att-chip is-loading' }, [
          U.icon('i-upload', 'ico'),
          U.el('span', { class: 'att-chip-name', text: file.name + ' 上传中…' })
        ]);
        chips.appendChild(chipLoading);
        upload(file, state.key).then(function (res) {
          state.busy -= 1;
          if (res.ok) {
            state.list.push(res.file);
          } else {
            U.toast(res.error || '上传失败', 'error', { timeout: 5200 });
          }
          refresh();
        });
      });
    }

    /* ------------------------------------------------------------------
       拖拽上传：把文件直接拖进这个区域
       ------------------------------------------------------------------ */
    var mountEl = U.el('div', { class: 'att-mount' }, [
      U.el('div', { class: 'att-head' }, [addBtn, hint]),
      chips,
      input
    ]);

    var dropDepth = 0;   // dragenter/leave 会在子元素间反复触发，用计数更稳
    function hasFiles(e) {
      var dt = e && e.dataTransfer;
      if (!dt) return false;
      if (dt.types && [].slice.call(dt.types).indexOf('Files') >= 0) return true;
      return false;
    }
    mountEl.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dropDepth += 1;
      mountEl.classList.add('is-drop');
    });
    mountEl.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { /* 忽略 */ }
      mountEl.classList.add('is-drop');
    });
    mountEl.addEventListener('dragleave', function (e) {
      if (!hasFiles(e)) return;
      dropDepth = Math.max(0, dropDepth - 1);
      if (dropDepth === 0) mountEl.classList.remove('is-drop');
    });
    mountEl.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();          // 别让页面级处理器再收一次（否则同一个文件传两遍）
      dropDepth = 0;
      mountEl.classList.remove('is-drop');
      var files = filesFromDataTransfer(e.dataTransfer);
      if (!files.length) { U.toast('没读到拖进来的文件，试试点「加附件」。', 'warn'); return; }
      addFiles(files);
    });
    // 拖到页面别处时别让浏览器把文件当页面打开（只在有附件区的页面生效）
    if (!document.__cwAttDropGuard) {
      document.__cwAttDropGuard = true;
      document.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
      document.addEventListener('drop', function (e) { if (hasFiles(e)) e.preventDefault(); });
    }

    U.render(box, mountEl);
    refresh();
    bindGlobalDrop();
    bindPaste();

    var handle = {
      el: mountEl,
      addFiles: addFiles,                                  // 页面级拖放转发会用
      files: function () { return state.list.slice(); },
      clear: function () { state.list = []; refresh(); },
      setKey: function (k) { state.key = k || ''; }
    };
    mountRegistry.push(handle);
    return handle;
  }

  CW.attach = { mount: mount, render: render, upload: upload, humanSize: humanSize, fileUrl: fileUrl,
    openViewer: openViewer, closeViewer: closeViewer,
    LIMIT_FILES: LIMIT_FILES, LIMIT_BYTES: LIMIT_BYTES };
})();
