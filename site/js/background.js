/* ==========================================================================
   background.js — 本地自定义背景
     · 预设渐变（亮/暗各一套，跟着主题切换）
     · 上传本地图片（压缩后存 IndexedDB，不上传服务器）
     · 图片网址
     · 压暗遮罩 / 模糊 / 卡片玻璃效果
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  var LS_KEY = 'bg';
  var IDB_KEY = 'bg-image';
  var MAX_EDGE = 2560;          // 压缩后的最长边
  var MAX_BYTES = 6 * 1024 * 1024;

  /* ======================================================================
     预设
     ====================================================================== */
  var PRESETS = [
    {
      id: 'theme',
      name: '默认蓝白',
      light: 'none',
      dark: 'none'
    },
    {
      id: 'paper',
      name: '纸白',
      light: 'linear-gradient(180deg,#ffffff 0%,#f4f8fd 60%,#eef4fc 100%)',
      dark: 'linear-gradient(180deg,#070d18 0%,#0a1220 60%,#070d18 100%)'
    },
    {
      id: 'sky',
      name: '晴空',
      light: 'linear-gradient(165deg,#eaf4ff 0%,#d6e9ff 45%,#f3f9ff 100%)',
      dark: 'linear-gradient(165deg,#061124 0%,#0a1c36 50%,#060e1c 100%)'
    },
    {
      id: 'ice',
      name: '冰川',
      light: 'linear-gradient(205deg,#f9fcff 0%,#e1edfc 55%,#edf5ff 100%)',
      dark: 'linear-gradient(205deg,#040a14 0%,#0a1526 55%,#060d19 100%)'
    },
    {
      id: 'deep',
      name: '深海',
      light: 'linear-gradient(170deg,#e9f3ff 0%,#d2e5fb 55%,#eef6ff 100%)',
      dark: 'linear-gradient(170deg,#030d1c 0%,#072039 55%,#030d1c 100%)'
    },
    {
      id: 'mist',
      name: '晨雾',
      light: 'linear-gradient(140deg,#eef7ff 0%,#e4eefb 40%,#fbfdff 100%)',
      dark: 'linear-gradient(140deg,#070f1c 0%,#0f1c2e 45%,#070f1c 100%)'
    },
    {
      id: 'ink',
      name: '水墨',
      light: 'linear-gradient(150deg,#f7f9fc 0%,#e6edf7 50%,#f4f8fc 100%)',
      dark: 'linear-gradient(150deg,#070a11 0%,#111a26 50%,#070a11 100%)'
    },
    {
      id: 'grid',
      name: '网格',
      light: 'linear-gradient(rgba(37,99,235,.055) 1px, transparent 1px),' +
             'linear-gradient(90deg, rgba(37,99,235,.055) 1px, transparent 1px)',
      dark: 'linear-gradient(rgba(120,170,255,.075) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(120,170,255,.075) 1px, transparent 1px)',
      gridSize: '34px 34px'
    }
  ];

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return PRESETS[0];
  }

  /* ======================================================================
     配置
     ====================================================================== */
  var cfg = {
    preset: 'theme',
    mode: 'preset',        // 'preset' | 'image'
    imageUrl: '',          // mode === 'image' 且来源是网址
    imageName: '',
    imageW: 0,
    imageH: 0,
    imageBytes: 0,
    dim: 0,
    blur: 0,
    glass: true
  };

  var objectUrl = null;    // 从 IndexedDB 里取出的图片 Blob 的临时地址
  var el = {};

  function loadConfig() {
    var raw = U.lsGet(LS_KEY, null);
    if (raw && typeof raw === 'object') {
      Object.keys(cfg).forEach(function (k) {
        if (raw[k] !== undefined && raw[k] !== null) cfg[k] = raw[k];
      });
    }
    cfg.dim = U.clamp(Number(cfg.dim) || 0, 0, 80);
    cfg.blur = U.clamp(Number(cfg.blur) || 0, 0, 24);
    cfg.glass = cfg.glass !== false;
    if (cfg.mode !== 'image') cfg.mode = 'preset';
    return cfg;
  }

  function saveConfig() {
    U.lsSet(LS_KEY, cfg);
    // boot.js 下次进页面时也会读这个键，所以保持结构一致
  }

  /* ======================================================================
     应用到页面
     ====================================================================== */
  function apply() {
    var root = document.documentElement;
    var body = document.body;
    var preset = presetById(cfg.preset);
    var dark = root.getAttribute('data-theme') === 'dark';

    var DEFAULT_LIGHT = 'linear-gradient(180deg,#f3f8ff 0%,#eaf2fe 60%,#f5f9ff 100%)';
    var DEFAULT_DARK = 'linear-gradient(180deg,#060d1a 0%,#08111f 60%,#060d1a 100%)';

    /* 1. 底层渐变（自定义图片时用主题默认色打底，图片没加载出来也不难看） */
    var tint;
    if (cfg.mode === 'image') {
      tint = dark ? DEFAULT_DARK : DEFAULT_LIGHT;
    } else {
      tint = dark ? preset.dark : preset.light;
      if (tint === 'none') tint = dark ? DEFAULT_DARK : DEFAULT_LIGHT;
    }
    root.style.setProperty('--bg-tint', tint);

    /* 2. 覆盖层：要么是自定义图片，要么是带纹理的预设，要么什么都没有 */
    var layer = 'none';
    var size = 'cover, cover';

    if (cfg.mode === 'image') {
      var url = objectUrl || cfg.imageUrl;
      if (url) layer = 'url("' + String(url).replace(/"/g, '%22') + '")';
    } else if (preset.gridSize) {
      layer = dark ? preset.dark : preset.light;
      size = preset.gridSize + ', ' + preset.gridSize;
    }

    root.style.setProperty('--bg-image', layer);
    root.style.setProperty('--bg-size', size);

    /* 3. 压暗 / 模糊 */
    root.style.setProperty('--bg-dim', String(cfg.dim / 100));
    root.style.setProperty('--bg-blur', cfg.blur + 'px');

    /* 4. 玻璃卡片：只有「真的有背景图」且开启玻璃时才半透明 */
    body.classList.toggle('has-bg', cfg.mode === 'image' && layer !== 'none' && cfg.glass);
    root.setAttribute('data-glass', cfg.glass ? 'on' : 'off');
  }

  /* ======================================================================
     初始化：把 IndexedDB 里的图片读回来
     ====================================================================== */
  function init() {
    loadConfig();
    el = {
      presets: U.$('#bgPresets'),
      file: U.$('#bgFile'),
      current: U.$('#bgCurrent'),
      dim: U.$('#bgDim'),
      dimVal: U.$('#bgDimVal'),
      blur: U.$('#bgBlur'),
      blurVal: U.$('#bgBlurVal'),
      glass: U.$('#bgGlass')
    };
    bind();

    apply();   // 先用预设/网址铺一层，别让用户看到空窗

    if (cfg.mode === 'image' && !cfg.imageUrl) {
      U.idbGet(IDB_KEY).then(function (blob) {
        if (blob && blob.size) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(blob);
          apply();
        } else {
          // 存储里没有图（换了设备或清了数据），退回预设
          cfg.mode = 'preset';
          cfg.preset = 'theme';
          saveConfig();
          apply();
        }
      }).catch(function () {
        cfg.mode = 'preset';
        apply();
      });
    }

    renderPresets();
    syncControls();
  }

  /* ======================================================================
     预设按钮
     ====================================================================== */
  function renderPresets() {
    if (!el.presets) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';

    U.render(el.presets, PRESETS.map(function (p) {
      var bg = dark ? p.dark : p.light;
      var style = {
        position: 'absolute', inset: '0', display: 'block',
        background: (bg === 'none') ? (dark ? '#08111f' : '#eef5fe') : bg
      };
      if (p.gridSize) style.backgroundSize = p.gridSize;

      var active = cfg.mode === 'preset' && cfg.preset === p.id;
      return U.el('button', {
        type: 'button',
        class: 'bg-preset' + (active ? ' is-active' : ''),
        title: p.name,
        'aria-pressed': active ? 'true' : 'false',
        'aria-label': '背景预设：' + p.name,
        onclick: function () { usePreset(p.id); }
      }, [
        U.el('span', { style: style, 'aria-hidden': 'true' }),
        U.el('span', { text: p.name })
      ]);
    }));
  }

  function usePreset(id) {
    cfg.mode = 'preset';
    cfg.preset = id;
    cfg.imageUrl = '';
    saveConfig();
    apply();
    renderPresets();
    syncControls();
    U.toast('已套用背景：' + presetById(id).name, 'ok', { timeout: 1800 });
  }

  /* ======================================================================
     本地图片
     ====================================================================== */
  function handleFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      U.toast('请选择图片文件（jpg / png / webp / gif）。', 'warn');
      return;
    }
    var t = U.toast('正在处理图片…', 'info', { timeout: 0 });

    compressImage(file).then(function (res) {
      // IndexedDB 写失败也要能用，只是下次打开就没了
      return U.idbSet(IDB_KEY, res.blob).then(function () { return true; }, function () { return false; })
        .then(function (persisted) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(res.blob);

          cfg.mode = 'image';
          cfg.preset = cfg.preset || 'theme';
          cfg.imageUrl = '';
          cfg.imageName = file.name;
          cfg.imageW = res.width;
          cfg.imageH = res.height;
          cfg.imageBytes = res.blob.size;
          saveConfig();
          apply();
          renderPresets();
          syncControls();

          if (t) t.dismiss();
          if (persisted) {
            U.toast('背景已更新：' + file.name + '（' + res.width + '×' + res.height + '，' +
              Math.round(res.blob.size / 1024) + ' KB）', 'ok', { timeout: 4000 });
          } else {
            U.toast('背景已套用，但浏览器不允许长期保存（可能是隐私模式或用 file:// 直接打开），刷新后会恢复原状。', 'warn', { timeout: 6500 });
          }
        });
    }).catch(function (err) {
      if (t) t.dismiss();
      U.toast('图片处理失败：' + ((err && err.message) || '未知错误'), 'error');
    });
  }

  /**
   * 用 canvas 压到最长边 MAX_EDGE，输出 JPEG。
   * 一张 8MB 的手机照片通常能压到 400KB 以内，够当背景也不会撑爆存储配额。
   */
  function compressImage(file) {
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error('读不到图片尺寸');

      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var tw = Math.max(1, Math.round(w * scale));
      var th = Math.max(1, Math.round(h * scale));

      // 太小的图不放大，直接用原图
      if (scale >= 1 && file.size <= MAX_BYTES) {
        return { blob: file, width: w, height: h };
      }

      var canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // 背景图不需要透明，先铺白底，避免 PNG 透明区域变黑
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);

      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob) { resolve({ blob: file, width: w, height: h }); return; }
          resolve({ blob: blob, width: tw, height: th });
        }, 'image/jpeg', 0.82);
      });
    });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); setTimeout(function () { URL.revokeObjectURL(url); }, 4000); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片无法解码')); };
      img.src = url;
    });
  }

  /* ======================================================================
     图片网址
     ====================================================================== */
  function askForUrl() {
    var existing = U.$('#bgUrlRow');
    if (existing) { existing.querySelector('input').focus(); return; }

    var input = U.el('input', {
      class: 'input', type: 'url', placeholder: 'https://example.com/bg.jpg',
      value: cfg.mode === 'image' ? (cfg.imageUrl || '') : ''
    });
    var row = U.el('div', {
      class: 'field', id: 'bgUrlRow',
      style: { marginTop: '12px' }
    }, [
      U.el('label', { class: 'field-label', text: '图片网址（需要允许跨域访问，否则浏览器不会显示）' }),
      U.el('div', { style: { display: 'flex', gap: '8px' } }, [
        input,
        U.el('button', {
          class: 'btn btn-sm btn-primary', type: 'button', text: '套用',
          onclick: function () {
            var v = input.value.trim();
            if (!/^https?:\/\//i.test(v)) { U.toast('请填写以 http:// 或 https:// 开头的网址。', 'warn'); return; }
            cfg.mode = 'image';
            cfg.imageUrl = v;
            cfg.imageName = v.split('/').pop().split('?')[0] || '网络图片';
            cfg.imageBytes = 0;
            if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
            saveConfig();
            apply();
            renderPresets();
            syncControls();
            U.toast('已套用网络背景图。如果没显示，多半是那个站点不允许外链。', 'ok', { timeout: 4200 });
          }
        })
      ])
    ]);

    var anchor = U.$('#bgClear');
    if (anchor && anchor.parentNode) anchor.parentNode.insertAdjacentElement('afterend', row);
    input.focus();
  }

  /* ======================================================================
     清除
     ====================================================================== */
  function clearBg() {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    cfg.mode = 'preset';
    cfg.preset = 'theme';
    cfg.imageUrl = '';
    cfg.imageName = '';
    cfg.imageW = cfg.imageH = cfg.imageBytes = 0;
    saveConfig();
    U.idbDel(IDB_KEY).catch(function () { /* 忽略 */ });
    apply();
    renderPresets();
    syncControls();
    U.toast('背景已恢复为默认蓝白。', 'ok', { timeout: 1800 });
  }

  /* ======================================================================
     控件同步
     ====================================================================== */
  function syncControls() {
    if (el.dim) {
      el.dim.value = String(cfg.dim);
      if (el.dimVal) el.dimVal.textContent = cfg.dim + '%';
    }
    if (el.blur) {
      el.blur.value = String(cfg.blur);
      if (el.blurVal) el.blurVal.textContent = cfg.blur + 'px';
    }
    if (el.glass) el.glass.checked = cfg.glass;

    if (!el.current) return;

    if (cfg.mode !== 'image') {
      U.render(el.current, U.el('div', { class: 'notice' }, [
        U.icon('i-info', 'ico'),
        U.el('div', { text: '当前使用「' + presetById(cfg.preset).name + '」渐变背景，没有本地图片。从下面选一张图，或直接用预设。' })
      ]));
      return;
    }

    var url = objectUrl || cfg.imageUrl;
    var meta = [];
    if (cfg.imageW && cfg.imageH) meta.push(cfg.imageW + '×' + cfg.imageH);
    if (cfg.imageBytes) meta.push(Math.round(cfg.imageBytes / 1024) + ' KB');
    meta.push(cfg.imageUrl ? '来自网络' : '存在本机 IndexedDB');

    U.render(el.current, U.el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, [
      U.el('div', {
        style: {
          width: '92px', height: '60px', flex: 'none', borderRadius: 'var(--r-sm)',
          border: '1px solid var(--line)',
          background: 'url("' + String(url).replace(/"/g, '%22') + '") center/cover no-repeat',
          backgroundColor: 'var(--surface-3)'
        },
        'aria-hidden': 'true'
      }),
      U.el('div', { style: { minWidth: '0' } }, [
        U.el('strong', { class: 'small truncate', style: { display: 'block' }, text: cfg.imageName || '自定义背景' }),
        U.el('span', { class: 'tiny faint', text: meta.join(' · ') })
      ])
    ]));
  }

  /* ======================================================================
     事件绑定
     ====================================================================== */
  function bind() {
    var pick = U.$('#bgPick');
    if (pick) pick.addEventListener('click', function () { if (el.file) el.file.click(); });

    if (el.file) {
      el.file.addEventListener('change', function () {
        if (el.file.files && el.file.files[0]) handleFile(el.file.files[0]);
        el.file.value = '';
      });
    }

    var urlBtn = U.$('#bgPasteUrl');
    if (urlBtn) urlBtn.addEventListener('click', askForUrl);

    var clearBtn = U.$('#bgClear');
    if (clearBtn) clearBtn.addEventListener('click', clearBg);

    if (el.dim) {
      el.dim.addEventListener('input', U.throttle(function () {
        cfg.dim = U.clamp(Number(el.dim.value) || 0, 0, 80);
        if (el.dimVal) el.dimVal.textContent = cfg.dim + '%';
        apply();
        saveConfig();
      }, 60));
    }

    if (el.blur) {
      el.blur.addEventListener('input', U.throttle(function () {
        cfg.blur = U.clamp(Number(el.blur.value) || 0, 0, 24);
        if (el.blurVal) el.blurVal.textContent = cfg.blur + 'px';
        apply();
        saveConfig();
      }, 60));
    }

    if (el.glass) {
      el.glass.addEventListener('change', function () {
        cfg.glass = el.glass.checked;
        apply();
        saveConfig();
      });
    }

    // 支持在弹窗里直接 Ctrl+V 贴一张图
    var modal = U.$('#modal-bg');
    if (modal) {
      modal.addEventListener('paste', function (e) {
        var items = (e.clipboardData && e.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.indexOf('image') === 0) {
            var f = items[i].getAsFile();
            if (f) { handleFile(f); e.preventDefault(); return; }
          }
        }
      });
    }
  }

  /* ======================================================================
     导出
     ====================================================================== */
  CW.bg = {
    PRESETS: PRESETS,
    cfg: cfg,
    init: init,
    apply: apply,
    /** 主题变了要重画预设色块并重新套用 */
    onThemeChange: function () { apply(); renderPresets(); },
    syncControls: syncControls
  };
})();
