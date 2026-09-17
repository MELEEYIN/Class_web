/* ==========================================================================
   worker/index.js — Cloudflare Worker 后端
   职责只有一件事：把「主机（你）」发布的通知，同步给所有打开网站的人。

   路由：
     GET  /api/notice   所有人可读：返回当前通知栏内容（置顶 + 最近几条）
     GET  /api/state    谁知道管理密码谁可读：包含全部历史，供管理页编辑
     POST /api/login    校验管理密码（首次调用即完成初始化，把密码哈希写进 KV）
     POST /api/publish  发布 / 更新 / 删除通知（需要密码）
     POST /api/reset    清空全部通知（需要密码）

   存储：
     · 绑定了 KV（NOTIFY）时，通知存在 KV 里，随时可改、立即生效。
     · 没绑 KV 时自动退化成「只读」模式：直接读静态文件 site/data/hosts.json，
       这时候想改通知就编辑那个文件再 git push。

   密码：
     · 不保存明文。KV 里只存 SHA-256 哈希（key = cw:auth）。
     · 也可以用 `wrangler secret put ADMIN_HASH` 设一个固定的哈希，
       那样连初始化都不需要，而且别人无法通过网页改掉你的密码。
     · 连续输错 8 次会锁 15 分钟，防暴力破解。
   ========================================================================== */

var KV_KEY = 'cw:notice';      // 通知数据
var AUTH_KEY = 'cw:auth';      // 管理密码哈希
var LOCK_PREFIX = 'cw:lock:';  // 登录失败计数

var BGM_CACHE_PREFIX = 'cw:bgm:';
var BGM_CACHE_TTL = 7 * 24 * 3600;         // 条目缓存 7 天（封面地址是算出来的，不用存）
var BGM_UPSTREAM = 'https://bgmapi.anibt.net';
var BGM_IMG = 'https://bgmimg.anibt.net';
// 只允许这几个前缀被中转，防止有人拿这个接口去请求任意地址
var BGM_ALLOWED = /^\/(search\/subject\/|subject\/|v0\/subjects)/;
var BGM_MAX_BYTES = 512 * 1024;            // 单次响应最大 512KB，防止被拿来刷流量

var MAX_ITEMS = 40;            // 最多留多少条历史
var MAX_TITLE = 60;
var MAX_BODY = 500;
var MAX_SOURCE = 24;

var LEVELS = ['info', 'ok', 'warn', 'danger'];

/* ==========================================================================
   小工具
   ========================================================================== */
function json(data, status, extraHeaders) {
  var headers = Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }, extraHeaders || {});
  return new Response(JSON.stringify(data), { status: status || 200, headers: headers });
}

function nowIso() { return new Date().toISOString(); }

function str(v, max) {
  var s = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

function bodyText(v, max) {
  // 正文允许保留换行，但把连续空行压掉，避免有人贴一大段空白
  var s = String(v === null || v === undefined ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

function num(v, lo, hi, dflt) {
  var n = Number(v);
  if (!isFinite(n)) n = dflt;
  return Math.min(hi, Math.max(lo, n));
}

async function sha256Hex(text) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  var bytes = new Uint8Array(buf);
  var out = '';
  for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/** 定长比较，避免用 == 比哈希带来的时间差 */
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hasKv(env) { return !!(env && env.NOTIFY && typeof env.NOTIFY.get === 'function'); }

/* ==========================================================================
   附件（通知 / 公共事务都能带）

   设计要点：
     · 文件字节单独存在 KV 的 cw:file:<id> 里，通知/事务记录里只留
       {id, name, type, size} 这点元数据 —— 通知接口是全班每分钟轮询的，
       绝不能把图片塞进列表数据里（否则每人每分钟都要下几 MB）。
     · 读文件走 GET /api/file/<id>，带一年缓存（immutable），一个设备只下一次。
     · 只收白名单后缀：图片(png/jpg/gif/webp)、pdf、txt、office 文档、zip。
       故意不收 .html/.svg/.js —— 那些在咱们域名下内联显示会变成 XSS。
     · 非图片一律 Content-Disposition: attachment 下载，不内联。
   ========================================================================== */
var FILE_PREFIX = 'cw:file:';
var MAX_FILE_BYTES = 5 * 1024 * 1024;     // 单文件 5MB
var MAX_FILES_PER_ITEM = 6;               // 一条通知/事务最多几个附件

var FILE_TYPES = {
  png: { mime: 'image/png', image: true },
  jpg: { mime: 'image/jpeg', image: true },
  jpeg: { mime: 'image/jpeg', image: true },
  gif: { mime: 'image/gif', image: true },
  webp: { mime: 'image/webp', image: true },
  pdf: { mime: 'application/pdf' },
  txt: { mime: 'text/plain; charset=utf-8' },
  doc: { mime: 'application/msword' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xls: { mime: 'application/vnd.ms-excel' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ppt: { mime: 'application/vnd.ms-powerpoint' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  zip: { mime: 'application/zip' }
};

/** 只留文件名本身：去掉目录、控制字符，限长 */
function safeFileName(raw) {
  var s = String(raw || '').replace(/\\/g, '/').split('/').pop() || '';
  s = s.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!s) s = 'file';
  // 保留后缀好判断类型，文件名本身截到 60 字符
  var dot = s.lastIndexOf('.');
  var ext = dot > 0 ? s.slice(dot + 1).toLowerCase() : '';
  var base = (dot > 0 ? s.slice(0, dot) : s).slice(0, 60) || 'file';
  return ext ? base + '.' + ext : base;
}

function fileExt(name) {
  var m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

/** 后缀白名单 → {mime, image}；不在白名单返回 null */
function pickFileType(name) {
  var t = FILE_TYPES[fileExt(name)];
  return t ? { mime: t.mime, image: !!t.image } : null;
}

/** 附件元数据清洗（列表里存的就是这个） */
function sanitizeFiles(list) {
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var i = 0; i < list.length && out.length < MAX_FILES_PER_ITEM; i++) {
    var f = list[i];
    if (!f || typeof f !== 'object') continue;
    var id = str(f.id, 40);
    if (!/^f_[A-Za-z0-9]{4,32}$/.test(id)) continue;
    var name = safeFileName(f.name);
    var t = pickFileType(name);
    if (!t) continue;
    out.push({
      id: id,
      name: name,
      type: t.mime,
      image: t.image,
      size: num(f.size, 0, MAX_FILE_BYTES, 0)
    });
  }
  return out;
}

/** 删掉这些附件（删除通知/事务、清空时顺手清理，免得 KV 里留垃圾） */
async function deleteFiles(env, files) {
  if (!hasKv(env) || !Array.isArray(files)) return;
  for (var i = 0; i < files.length; i++) {
    var id = files[i] && files[i].id;
    if (id && /^f_[A-Za-z0-9]{4,32}$/.test(id)) {
      try { await env.NOTIFY.delete(FILE_PREFIX + id); } catch (e) { /* 忽略 */ }
    }
  }
}

/** POST /api/file —— 上传一个附件（原始字节，不走 base64） */
async function handleFileUpload(request, env) {
  if (!hasKv(env)) return json({ ok: false, error: '还没有绑定 KV 存储，无法上传附件。', needsKv: true }, 409);

  var rawName = request.headers.get('x-cw-name') || '';
  try { rawName = decodeURIComponent(rawName); } catch (e) { /* 没编码就用原样 */ }
  var name = safeFileName(rawName);
  var picked = pickFileType(name);
  if (!picked) {
    return json({ ok: false, error: '不支持这种文件。只收：图片(png/jpg/gif/webp)、pdf、txt、Word/Excel/PPT、zip。' }, 415);
  }

  var buf;
  try { buf = await request.arrayBuffer(); } catch (e) { buf = null; }
  if (!buf || !buf.byteLength) return json({ ok: false, error: '文件是空的。' }, 400);
  if (buf.byteLength > MAX_FILE_BYTES) {
    return json({ ok: false, error: '文件太大：单个最大 5MB（现在 ' + Math.round(buf.byteLength / 1024 / 1024 * 10) / 10 + 'MB）。' }, 413);
  }

  var id = 'f_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  var by = str(request.headers.get('x-cw-by'), MAX_SOURCE) || '主机';
  await env.NOTIFY.put(FILE_PREFIX + id, buf, {
    metadata: { name: name, type: picked.mime, image: picked.image, size: buf.byteLength, at: nowIso(), by: by }
  });

  return json({
    ok: true,
    file: { id: id, name: name, type: picked.mime, image: picked.image, size: buf.byteLength }
  });
}

/** GET /api/file/<id> —— 公开读一个附件 */
async function handleFileGet(env, id, method) {
  if (!/^f_[A-Za-z0-9]{4,32}$/.test(String(id || ''))) return new Response('Not found', { status: 404 });
  if (!hasKv(env)) return new Response('No storage', { status: 404 });

  var got;
  try {
    got = await env.NOTIFY.getWithMetadata(FILE_PREFIX + id, 'arrayBuffer', { cacheTtl: 31536000 });
  } catch (e) {
    got = null;
  }
  if (!got || !got.value) return new Response('Not found', { status: 404 });

  var meta = got.metadata || {};
  var type = String(meta.type || 'application/octet-stream');
  var headers = {
    'content-type': type,
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff'
  };
  if (!/^image\//.test(type)) {
    // 非图片一律下载，不在本站域名下内联渲染
    var ascii = String(meta.name || 'file').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    headers['content-disposition'] = 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(meta.name || 'file');
  }
  return new Response(method === 'HEAD' ? null : got.value, { status: 200, headers: headers });
}

/* ==========================================================================
   通知数据：读取 / 清洗
   ========================================================================== */
function emptyDoc(source) {
  return { version: 1, updatedAt: '', updatedBy: '', source: source || '', items: [] };
}

/** 静态兜底文件（site/data/hosts.json）—— 由主机自己维护并 push */
async function readSeed(env, request) {
  try {
    var url = new URL(request.url);
    url.pathname = '/data/hosts.json';
    url.search = '';
    var res = await env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }));
    if (!res || !res.ok) return null;
    var doc = await res.json();
    return sanitizeDoc(doc, 'hosts.json');
  } catch (e) {
    return null;
  }
}

function sanitizeItem(raw, fallbackAt) {
  if (!raw || typeof raw !== 'object') return null;
  var title = str(raw.title, MAX_TITLE);
  var body = bodyText(raw.body, MAX_BODY);
  if (!title && !body) return null;
  var level = LEVELS.indexOf(raw.level) >= 0 ? raw.level : 'info';
  return {
    id: str(raw.id, 40) || ('n_' + Math.random().toString(36).slice(2, 10)),
    title: title,
    body: body,
    level: level,
    source: str(raw.source, MAX_SOURCE),
    pinned: raw.pinned === undefined ? true : !!raw.pinned,
    at: str(raw.at, 40) || fallbackAt || nowIso(),
    files: sanitizeFiles(raw.files)
  };
}

function sanitizeDoc(raw, source) {
  var doc = emptyDoc(source);
  if (!raw || typeof raw !== 'object') return doc;
  doc.version = 1;
  doc.updatedAt = str(raw.updatedAt, 40);
  doc.updatedBy = str(raw.updatedBy, MAX_SOURCE);
  doc.source = str(raw.source, MAX_SOURCE) || source || '';
  var items = Array.isArray(raw.items) ? raw.items : [];
  doc.items = items.map(function (it, i) {
    return sanitizeItem(it, doc.updatedAt || new Date(Date.now() - i * 1000).toISOString());
  }).filter(Boolean).slice(0, MAX_ITEMS);
  return doc;
}

async function loadDoc(env, request) {
  if (hasKv(env)) {
    try {
      var stored = await env.NOTIFY.get(KV_KEY, 'json');
      if (stored) {
        var doc = sanitizeDoc(stored, 'kv');
        doc.storage = 'kv';
        return doc;
      }
    } catch (e) { /* KV 抽风就退回静态文件 */ }
  }
  var seed = await readSeed(env, request);
  if (seed) {
    seed.storage = 'file';
    return seed;
  }
  var empty = emptyDoc('none');
  empty.storage = hasKv(env) ? 'kv' : 'file';
  return empty;
}

async function saveDoc(env, doc) {
  if (!hasKv(env)) return false;
  doc.version = 1;
  doc.updatedAt = nowIso();
  await env.NOTIFY.put(KV_KEY, JSON.stringify(doc));
  return true;
}

/* ==========================================================================
   Bangumi 中转（给 /anime.html 用）
   为什么需要它：
     · 官方 api.bgm.tv 不返回 CORS 头，浏览器里 fetch 会被拦；国内也常常连不上。
     · 这里用 Cloudflare 的节点去取同一份数据，再原样发给浏览器，
       顺带用 KV 缓存一下，省得每次搜索都打上游。
   安全：
     · 只允许 /search/subject/、/subject/、/v0/subjects 开头，其它路径一律拒绝。
     · 上游内容里的图片地址会被改写成 https 的图片域名。
   ========================================================================== */
function bgmCacheKey(pathAndQuery) {
  // KV key 不能太长，用路径的简单哈希
  var h = 2166136261;
  for (var i = 0; i < pathAndQuery.length; i++) {
    h ^= pathAndQuery.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return BGM_CACHE_PREFIX + h.toString(36);
}

/** 递归把图片地址换成 https 的图片中转域名 */
function upgradeImages(node, depth) {
  if (!node || typeof node !== 'object' || (depth || 0) > 6) return node;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) upgradeImages(node[i], (depth || 0) + 1);
    return node;
  }
  Object.keys(node).forEach(function (k) {
    var v = node[k];
    if (typeof v === 'string') {
      // bangumi 的图片有 lain.bgm.tv 和 bgmimg.anibt.net 两个域名；
      // 上游返回的可能是 http，https 页面里会被浏览器拦掉，所以统一改写
      if (/^https?:\/\/(lain\.)?bgm\.tv\//i.test(v)) {
        node[k] = v.replace(/^https?:\/\/(lain\.)?bgm\.tv\//i, BGM_IMG + '/');
      } else if (/^http:\/\/bgmimg\.anibt\.net\//i.test(v)) {
        node[k] = v.replace(/^http:\/\/bgmimg\.anibt\.net\//i, BGM_IMG + '/');
      } else if (/^http:\/\//i.test(v) && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(v)) {
        node[k] = 'https://' + v.slice(7);
      }
    } else if (v && typeof v === 'object') {
      upgradeImages(v, (depth || 0) + 1);
    }
  });
  return node;
}

async function handleBangumi(pathAndQuery, env) {
  if (!BGM_ALLOWED.test(pathAndQuery)) {
    return json({ ok: false, error: '这个 Bangumi 路径不允许中转。' }, 403);
  }

  var cacheKey = bgmCacheKey(pathAndQuery);
  if (hasKv(env)) {
    try {
      var hit = await env.NOTIFY.get(cacheKey, 'json');
      if (hit) return json(hit, 200, { 'x-cw-cache': 'hit' });
    } catch (e) { /* 缓存不可用就直接取 */ }
  }

  var upstream;
  try {
    upstream = await fetch(BGM_UPSTREAM + pathAndQuery, {
      headers: { 'accept': 'application/json', 'user-agent': 'ClassWeb/1.0 (+https://leeyin.xyz)' }
    });
  } catch (e) {
    return json({ ok: false, error: '连不上 Bangumi 上游：' + ((e && e.message) || e) }, 502);
  }

  if (!upstream.ok) {
    return json({ ok: false, error: 'Bangumi 上游返回 HTTP ' + upstream.status }, 502);
  }

  var text = await upstream.text();
  if (text.length > BGM_MAX_BYTES) {
    return json({ ok: false, error: '上游返回内容过大，已拒绝。' }, 502);
  }

  var data;
  try { data = JSON.parse(text); } catch (e) {
    return json({ ok: false, error: '上游返回的不是 JSON。' }, 502);
  }

  upgradeImages(data, 0);

  if (hasKv(env)) {
    // 把写缓存放到响应之后做，别让访客等
    try { await env.NOTIFY.put(cacheKey, JSON.stringify(data), { expirationTtl: BGM_CACHE_TTL }); }
    catch (e) { /* 写不进去也无所谓 */ }
  }

  return json(data, 200, { 'x-cw-cache': 'miss' });
}

/* ==========================================================================
   鉴权
   ========================================================================== */
async function currentHash(env) {
  if (env && env.ADMIN_HASH) return String(env.ADMIN_HASH).toLowerCase().replace(/^sha256:/, '');
  if (!hasKv(env)) return '';
  try {
    var v = await env.NOTIFY.get(AUTH_KEY);
    return v ? String(v).toLowerCase().replace(/^sha256:/, '') : '';
  } catch (e) { return ''; }
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

async function lockState(env, request) {
  if (!hasKv(env)) return { fails: 0, locked: false };
  try {
    var raw = await env.NOTIFY.get(LOCK_PREFIX + clientIp(request), 'json');
    if (!raw) return { fails: 0, locked: false };
    if (raw.until && Date.now() < raw.until) return { fails: raw.fails || 0, locked: true };
    return { fails: 0, locked: false };
  } catch (e) { return { fails: 0, locked: false }; }
}

async function noteFail(env, request) {
  if (!hasKv(env)) return;
  var ip = LOCK_PREFIX + clientIp(request);
  try {
    var raw = (await env.NOTIFY.get(ip, 'json')) || { fails: 0 };
    // 上次失败是 15 分钟以前就重新计数
    if (raw.at && Date.now() - raw.at > 15 * 60 * 1000) raw.fails = 0;
    raw.fails = (raw.fails || 0) + 1;
    raw.at = Date.now();
    if (raw.fails >= 8) raw.until = Date.now() + 15 * 60 * 1000;
    await env.NOTIFY.put(ip, JSON.stringify(raw), { expirationTtl: 3600 });
  } catch (e) { /* 忽略 */ }
}

async function clearFail(env, request) {
  if (!hasKv(env)) return;
  try { await env.NOTIFY.delete(LOCK_PREFIX + clientIp(request)); } catch (e) { /* 忽略 */ }
}

/**
 * 校验管理密码。返回 { ok, initialized }
 *   initialized = false 表示这台 Worker 还没设过密码，调用方可以顺便完成初始化。
 */
async function checkAuth(env, request, provided) {
  var hash = await currentHash(env);
  if (!hash) return { ok: true, initialized: false };
  var got = await sha256Hex(provided || '');
  if (safeEqual(got, hash)) return { ok: true, initialized: true };
  return { ok: false, initialized: true };
}

async function readAuth(request) {
  var h = request.headers.get('x-cw-key') || '';
  if (h) return h;
  try {
    var body = await request.clone().json();
    return body && body.key ? String(body.key) : '';
  } catch (e) { return ''; }
}

/* ==========================================================================
   对外输出：给访客看的通知栏内容
   ========================================================================== */
function publicPayload(doc) {
  var items = (doc.items || []).slice().sort(function (a, b) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return String(b.at).localeCompare(String(a.at));
  });

  // 注意：这里要带上 files（附件元数据），否则附件写进去了但前台读不到
  var brief = function (x) {
    return {
      id: x.id, title: x.title, body: x.body, level: x.level,
      source: x.source, at: x.at, files: sanitizeFiles(x.files)
    };
  };

  var current = items.filter(function (x) { return x.pinned; })[0] || null;
  var recent = items.slice(0, 12).map(brief);

  return {
    ok: true,
    storage: doc.storage || '',
    updatedAt: doc.updatedAt || '',
    current: current ? brief(current) : null,
    recent: recent
  };
}

/* ==========================================================================
   路由
   ========================================================================== */
async function handleApi(request, env, ctx) {
  var url = new URL(request.url);
  var path = url.pathname.replace(/\/+$/, '') || '/api';
  var method = request.method.toUpperCase();

  /* ---- 看番页的 Bangumi 中转（公开只读，不需要密码） ---- */
  if (path.indexOf('/api/bangumi/') === 0 && (method === 'GET' || method === 'HEAD')) {
    return handleBangumi(url.pathname.slice('/api/bangumi'.length) + (url.search || ''), env);
  }

  /* ---- 附件：公开读（通知/公共事务里带的图片、文档） ---- */
  if (path.indexOf('/api/file/') === 0 && (method === 'GET' || method === 'HEAD')) {
    return handleFileGet(env, path.slice('/api/file/'.length), method);
  }

  /* ---- 附件：上传（需要密码；原始字节，不走 base64） ---- */
  if (path === '/api/file' && method === 'POST') {
    var providedFile = await readAuth(request);
    if (!providedFile) return json({ ok: false, error: '上传附件需要管理密码。' }, 401);
    var authFile = await checkAuth(env, request, providedFile);
    if (!authFile.ok || !authFile.initialized) {
      await noteFail(env, request);
      return json({
        ok: false,
        error: authFile.ok ? '还没设置管理密码：请先打开 /admin 设置一次。' : '密码不对。'
      }, 401);
    }
    await clearFail(env, request);
    return handleFileUpload(request, env);
  }

  /* ---- 问题反馈：公开读；提交 / 回复公开，删除要密码 ---- */
  if (path === '/api/feedback' && (method === 'GET' || method === 'HEAD')) {
    var fb = await loadFeedback(env);
    return json({ ok: true, storage: hasKv(env) ? 'kv' : '', updatedAt: fb.updatedAt, items: fb.items });
  }
  if (path === '/api/feedback' && method === 'POST') {
    return handleFeedback(request, env);
  }

  /* ---- 投票：公开读 / 投票；建、改、结束要管理密码 ---- */
  if (path === '/api/polls' && (method === 'GET' || method === 'HEAD')) {
    return handlePolls(env);
  }
  if (path === '/api/poll-vote' && method === 'POST') {
    return handlePollVote(request, env);
  }
  if (path === '/api/poll' && method === 'POST') {
    var providedPoll = await readAuth(request);
    if (!providedPoll) return json({ ok: false, error: '建投票需要管理密码。' }, 401);
    var authPoll = await checkAuth(env, request, providedPoll);
    if (!authPoll.ok || !authPoll.initialized) {
      await noteFail(env, request);
      return json({ ok: false, error: authPoll.ok ? '还没设置管理密码：请先打开 /admin 设置一次。' : '密码不对。' }, 401);
    }
    await clearFail(env, request);
    return handlePollAdmin(request, env);
  }

  /* ---- 公共事务：公开读（全班共用的一份清单） ---- */
  if (path === '/api/public-events' && (method === 'GET' || method === 'HEAD')) {
    var pe = await loadPublicEvents(env);
    return json({ ok: true, source: pe.source, updatedAt: pe.updatedAt, items: pe.items });
  }

  /* ---- 公共事务：发布 / 删除（需要密码） ---- */
  if (path === '/api/public-event' && method === 'POST') {
    var providedPe = await readAuth(request);
    if (!providedPe) return json({ ok: false, error: '发布公共事务需要管理密码。' }, 401);
    var authPe = await checkAuth(env, request, providedPe);
    // 注意：还没设过管理密码时 checkAuth 会返回 ok（那是给「首次初始化」用的），
    // 但发布类接口不能靠这个放行，否则谁都能在主机设密码之前先发东西。
    if (!authPe.ok || !authPe.initialized) {
      await noteFail(env, request);
      return json({
        ok: false,
        error: authPe.ok ? '还没设置管理密码：请先打开 /admin 设置一次。' : '密码不对。'
      }, 401);
    }
    await clearFail(env, request);
    return handlePublicEvent(request, env);
  }

  /* ---- 访问统计：记一次访问（公开，无需密码；数据只进你自己的 D1） ---- */
  if (path === '/api/hit' && method === 'POST') {
    return handleHit(request, env, ctx);
  }

  /* ---- 访问统计：读汇总（需要密码） ---- */
  if (path === '/api/stats' && (method === 'GET' || method === 'HEAD')) {
    var providedStats = await readAuth(request);
    if (!providedStats) return json({ ok: false, error: '需要密码。' }, 401);
    var authStats = await checkAuth(env, request, providedStats);
    if (!authStats.ok) {
      await noteFail(env, request);
      return json({ ok: false, error: '密码不对。' }, 401);
    }
    await clearFail(env, request);
    return handleStats(env, url);
  }

  /* ---- 访客：读通知 ---- */
  if (path === '/api/notice' && (method === 'GET' || method === 'HEAD')) {
    var doc = await loadDoc(env, request);
    return json(publicPayload(doc));
  }

  /* ---- 管理页：带密码读全部历史 ---- */
  if (path === '/api/state') {
    var storedHash = await currentHash(env);
    var providedState = await readAuth(request);

    if (!storedHash) {
      return json({ ok: true, initialized: false, storage: hasKv(env) ? 'kv' : 'file',
        fixed: !!env.ADMIN_HASH, items: [], updatedAt: '' });
    }

    // 已经设过密码、但这次没带密码来：这只是「需要先登录」，
    // 不该回 401 —— 否则管理页会把「登录」误显示成「首次设置密码」。
    if (!providedState) {
      return json({ ok: true, initialized: true, storage: hasKv(env) ? 'kv' : 'file',
        fixed: !!env.ADMIN_HASH, items: [], updatedAt: '' });
    }

    var lockState0 = await lockState(env, request);
    if (lockState0.locked) return json({ ok: false, error: '失败次数太多，请 15 分钟后再试。' }, 429);

    var authState = await checkAuth(env, request, providedState);
    if (!authState.ok) {
      await noteFail(env, request);
      return json({ ok: false, error: '密码不对。' }, 401);
    }

    await clearFail(env, request);
    var docState = await loadDoc(env, request);
    return json({
      ok: true,
      initialized: true,
      storage: hasKv(env) ? 'kv' : 'file',
      fixed: !!env.ADMIN_HASH,          // 密码由 secret 固定时，网页里改不了
      updatedAt: docState.updatedAt,
      updatedBy: docState.updatedBy,
      items: docState.items
    });
  }

  /* ---- 首次初始化 / 登录 ---- */
  if (path === '/api/login' && method === 'POST') {
    var body = {};
    try { body = await request.json(); } catch (e) { body = {}; }
    var password = body && body.password ? String(body.password) : '';

    if (!password || password.length < 5) {
      return json({ ok: false, error: '密码至少 5 位。' }, 400);
    }

    var lock = await lockState(env, request);
    if (lock.locked) return json({ ok: false, error: '失败次数太多，请 15 分钟后再试。' }, 429);

    var state = await checkAuth(env, request, password);

    if (!state.initialized) {
      // 第一次：把这次的密码设为管理密码
      if (!hasKv(env)) {
        return json({
          ok: false,
          error: '还没有绑定 KV 存储，无法保存管理密码。请先在 Cloudflare 建一个 KV 命名空间并按 README 绑定。',
          needsKv: true
        }, 409);
      }
      await env.NOTIFY.put(AUTH_KEY, await sha256Hex(password));
      return json({
        ok: true, initialized: true, storage: 'kv', fixed: false,
        message: '管理密码已设置。请记住它，网页上不会再显示。'
      });
    }

    if (!state.ok) {
      await noteFail(env, request);
      return json({ ok: false, error: '密码不对。' }, 401);
    }

    await clearFail(env, request);
    return json({ ok: true, initialized: true, storage: hasKv(env) ? 'kv' : 'file', fixed: !!env.ADMIN_HASH });
  }

  /* ---- 需要密码的接口 ---- */
  if (path === '/api/publish' || path === '/api/reset') {
    if (method !== 'POST') return json({ ok: false, error: '只支持 POST。' }, 405);

    var lock2 = await lockState(env, request);
    if (lock2.locked) return json({ ok: false, error: '失败次数太多，请 15 分钟后再试。' }, 429);

    var provided = await readAuth(request);
    var auth = await checkAuth(env, request, provided);
    // 同理：没设过密码时不能靠「首次初始化」放行发布，否则谁都能在主机设密码前先发通知
    if (!auth.ok || !auth.initialized) {
      await noteFail(env, request);
      return json({
        ok: false,
        error: auth.ok ? '还没设置管理密码：先在本页设置一次再发布。' : '密码不对，或者还没初始化。'
      }, 401);
    }

    if (!hasKv(env)) {
      return json({
        ok: false,
        error: '还没有绑定 KV 存储：现在通知是只读的（来自 site/data/hosts.json）。绑定 KV 之后才能在线发布。',
        needsKv: true
      }, 409);
    }

    var payload = {};
    try { payload = await request.json(); } catch (e) { payload = {}; }

    if (path === '/api/reset') {
      var beforeDoc = await loadDoc(env, request);
      for (var bi = 0; bi < beforeDoc.items.length; bi++) await deleteFiles(env, beforeDoc.items[bi].files);
      var cleared = emptyDoc('kv');
      cleared.updatedAt = nowIso();
      await saveDoc(env, cleared);
      return json({ ok: true, items: [], updatedAt: cleared.updatedAt });
    }

    var doc2 = await loadDoc(env, request);
    var action = String(payload.action || 'publish');
    var toRemove = [];      // 需要顺手删掉的旧附件（删条目、换附件、超出保留条数）
    var removed = null;

    if (action === 'delete') {
      var delId = str(payload.id, 40);
      doc2.items.forEach(function (x) { if (x.id === delId) toRemove.push(x); });
      doc2.items = doc2.items.filter(function (x) { return x.id !== delId; });
    } else {
      var item = sanitizeItem(payload.item || payload, nowIso());
      if (!item) return json({ ok: false, error: '标题和正文不能都是空的。' }, 400);
      item.source = item.source || '主机';
      item.at = nowIso();

      var idx = -1;
      for (var i = 0; i < doc2.items.length; i++) if (doc2.items[i].id === item.id) { idx = i; removed = doc2.items[i]; break; }
      if (idx >= 0) doc2.items[idx] = item;
      else doc2.items.unshift(item);

      // 置顶是唯一的：新置顶把旧的顶下来
      if (item.pinned) {
        doc2.items.forEach(function (x) { if (x.id !== item.id) x.pinned = false; });
      }
      // 更新时把这次没带上的旧附件删掉
      if (removed && removed.files && removed.files.length) {
        var keep = {};
        for (var ki = 0; ki < item.files.length; ki++) keep[item.files[ki].id] = 1;
        toRemove = toRemove.concat(removed.files.filter(function (f) { return !keep[f.id]; }));
      }
      // 超出保留条数的老通知：连附件一起清
      doc2.items.slice(MAX_ITEMS).forEach(function (x) { toRemove.push(x); });
      doc2.items = doc2.items.slice(0, MAX_ITEMS);
    }

    for (var ri = 0; ri < toRemove.length; ri++) await deleteFiles(env, toRemove[ri] && toRemove[ri].files);

    doc2.updatedBy = str(payload.by, MAX_SOURCE) || doc2.updatedBy || '主机';
    await clearFail(env, request);
    await saveDoc(env, doc2);

    var out = publicPayload(doc2);
    out.items = doc2.items;
    out.updatedAt = doc2.updatedAt;
    return json(out);
  }

  return json({ ok: false, error: '没有这个接口。' }, 404);
}

/* ==========================================================================
   公共事务（全班共用的一份清单，存在 KV 里）

   和「通知栏」的区别：
     · 通知栏 = 一条置顶的公告（首页顶部滚动展示）
     · 公共事务 = 一份清单（考试、班会、报名截止…），谁都能在「日程 → 公共事务」
       里一条条或一次性加进自己的日程；加进去之后就是普通事务，随便改

   静态兜底：KV 里没有内容时，客户端会去读 site/data/public-events.json（主机维护的那份）。
   ========================================================================== */
var PUBLIC_KEY = 'cw:publicevents';
var MAX_PUBLIC_ITEMS = 80;
var MAX_PE_TITLE = 60;
var MAX_PE_NOTE = 300;
var MAX_PE_LOC = 40;
var MAX_PE_OWNER = 20;
var PE_REPEATS = ['none', 'daily', 'weekly', 'monthly'];
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizePublicItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var title = str(raw.title, MAX_PE_TITLE);
  if (!title) return null;

  var item = {
    id: str(raw.id, 40) || ('p_' + Math.random().toString(36).slice(2, 10)),
    title: title,
    location: str(raw.location, MAX_PE_LOC),
    note: bodyText(raw.note, MAX_PE_NOTE),
    owner: str(raw.owner, MAX_PE_OWNER),
    allDay: raw.allDay === undefined ? true : !!raw.allDay,
    start: str(raw.start, 5),
    end: str(raw.end, 5),
    at: str(raw.at, 40),
    files: sanitizeFiles(raw.files)      // 附件只留元数据，字节在 cw:file:<id> 里
  };

  if (raw.kind === 'weekly') {
    item.kind = 'weekly';
    item.day = Math.round(num(raw.day, 1, 7, 1));
    item.weeksText = str(raw.weeksText, 40);
    item.weeks = Array.isArray(raw.weeks)
      ? raw.weeks.filter(function (n) { return Number.isSafeInteger(n) && n > 0 && n < 60; }).slice(0, 60)
      : [];
    return item;
  }

  item.kind = 'date';
  item.date = DATE_RE.test(String(raw.date || '')) ? String(raw.date) : '';
  if (!item.date) return null;
  item.repeat = PE_REPEATS.indexOf(raw.repeat) >= 0 ? raw.repeat : 'none';
  if (item.repeat !== 'none') {
    item.repeatUntil = DATE_RE.test(String(raw.repeatUntil || '')) ? String(raw.repeatUntil) : '';
  }
  return item;
}

function sanitizePublicItems(list) {
  return (Array.isArray(list) ? list : []).map(sanitizePublicItem).filter(Boolean).slice(0, MAX_PUBLIC_ITEMS);
}

async function loadPublicEvents(env) {
  if (!hasKv(env)) return { source: 'hosts.json', updatedAt: '', items: [] };
  try {
    var raw = await env.NOTIFY.get(PUBLIC_KEY, 'json');
    if (!raw || !Array.isArray(raw.items)) return { source: 'kv', updatedAt: '', items: [] };
    return { source: 'kv', updatedAt: str(raw.updatedAt, 40), items: sanitizePublicItems(raw.items) };
  } catch (e) {
    return { source: 'kv', updatedAt: '', items: [] };
  }
}

/** POST /api/public-event —— 发布 / 更新 / 删除 / 清空公共事务（都要管理密码） */
async function handlePublicEvent(request, env) {
  if (!hasKv(env)) {
    return json({ ok: false, error: '还没有绑定 KV 存储，无法在线发布公共事务。', needsKv: true }, 409);
  }

  var body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  var existing = await env.NOTIFY.get(PUBLIC_KEY, 'json');
  var items = sanitizePublicItems(existing && existing.items);
  var action = String(body.action || 'publish');

  if (action === 'clear') {
    // 全部删掉：连 KV 里的键一起删，免得留下一份带 items 的历史记录
    // （客户端看到空清单会回落到站点文件 data/public-events.json，那份要在仓库里改）
    // 附件也一起清掉，别在 KV 里留垃圾
    for (var ci = 0; ci < items.length; ci++) await deleteFiles(env, items[ci] && items[ci].files);
    await env.NOTIFY.delete(PUBLIC_KEY);
    return json({ ok: true, source: 'kv', updatedAt: '', items: [], cleared: true });
  }

  if (action === 'delete') {
    // 支持一次删多条：body.ids = [...]（没有 ids 就按 body.id 删一条）
    var ids = Array.isArray(body.ids)
      ? body.ids.map(function (x) { return str(x, 40); }).filter(Boolean)
      : [];
    var delId = str(body.id, 40);
    if (delId && ids.indexOf(delId) < 0) ids.push(delId);
    if (ids.length) {
      // 删之前先把这些条目带的附件清理掉
      for (var di = 0; di < items.length; di++) {
        if (ids.indexOf(items[di].id) >= 0) await deleteFiles(env, items[di].files);
      }
      items = items.filter(function (x) { return ids.indexOf(x.id) < 0; });
    }
  } else {
    var item = sanitizePublicItem(body.item || body);
    if (!item) return json({ ok: false, error: '标题不能为空；kind=date 时还要有合法日期。' }, 400);
    item.at = nowIso();
    item.owner = item.owner || '主机';
    var idx = -1;
    var replacedFiles = null;
    for (var i = 0; i < items.length; i++) if (items[i].id === item.id) { idx = i; replacedFiles = items[i].files; break; }
    if (idx >= 0) items[idx] = item;
    else items.unshift(item);
    // 更新同一条时，把这次没再带上的旧附件删掉（免得越攒越多）
    if (replacedFiles && replacedFiles.length) {
      var keep = {};
      for (var ki = 0; ki < item.files.length; ki++) keep[item.files[ki].id] = 1;
      await deleteFiles(env, replacedFiles.filter(function (f) { return !keep[f.id]; }));
    }
    items = items.slice(0, MAX_PUBLIC_ITEMS);
  }

  var next = { version: 1, updatedAt: nowIso(), updatedBy: str(body.by, MAX_SOURCE) || '主机', items: items };
  await env.NOTIFY.put(PUBLIC_KEY, JSON.stringify(next));
  return json({ ok: true, source: 'kv', updatedAt: next.updatedAt, items: items });
}

/* ==========================================================================
   问题反馈 + 投票（全班公开）

   为什么放 KV 而不是 D1：数据量很小（反馈几十条、投票一两个），
   和通知/公共事务同一套存储最省事；免费额度足够（一天 1000 次写）。

   安全与边界：
     · 反馈：所有人可提、可回复；删除要管理密码。
     · 投票：**只有管理密码能建/改/结束**；同学只能投。
     · 「每人一次」用设备标记（浏览器本地随机 id）——能挡误触和重复点击，
       挡不住「换个浏览器再投」（班内投票够用，写在界面上说明白）。
     · 所有文本都限长、去控制字符；设备 id 必须符合 d_xxx 形状。
   ========================================================================== */
var FEEDBACK_KEY = 'cw:feedback';
var POLLS_KEY = 'cw:polls';
var MAX_FEEDBACK = 60;
var MAX_FB_TEXT = 300;
var MAX_FB_REPLY = 200;
var MAX_FB_REPLIES = 40;
var MAX_POLLS = 20;
var MAX_POLL_TITLE = 60;
var MAX_POLL_DESC = 200;
var MAX_POLL_OPTIONS = 10;
var MAX_POLL_LABEL = 30;
var DEVICE_RE = /^d_[A-Za-z0-9]{6,32}$/;

function cleanText(v, max) {
  var t = String(v === null || v === undefined ? '' : v)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (max && t.length > max) t = t.slice(0, max);
  return t;
}
function cleanName(v) {
  return cleanText(v, 12).replace(/\n/g, ' ') || '匿名';
}
function newId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

/* ---------------- 问题反馈 ---------------- */
function sanitizeReply(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var text = cleanText(raw.text, MAX_FB_REPLY);
  if (!text) return null;
  return { id: str(raw.id, 40) || newId('r_'), text: text, by: cleanName(raw.by), at: str(raw.at, 40) || nowIso() };
}
function sanitizeFeedback(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var text = cleanText(raw.text, MAX_FB_TEXT);
  if (!text) return null;
  var replies = (Array.isArray(raw.replies) ? raw.replies : []).map(sanitizeReply).filter(Boolean).slice(0, MAX_FB_REPLIES);
  return {
    id: str(raw.id, 40) || newId('fb_'),
    text: text,
    by: cleanName(raw.by),
    at: str(raw.at, 40) || nowIso(),
    replies: replies,
    done: !!raw.done
  };
}
function sanitizeFeedbackList(list) {
  return (Array.isArray(list) ? list : []).map(sanitizeFeedback).filter(Boolean).slice(0, MAX_FEEDBACK);
}
async function loadFeedback(env) {
  var raw = await env.NOTIFY.get(FEEDBACK_KEY, 'json');
  return { source: 'kv', updatedAt: str(raw && raw.updatedAt, 40), items: sanitizeFeedbackList(raw && raw.items) };
}
async function handleFeedback(request, env) {
  if (!hasKv(env)) return json({ ok: false, error: '还没有绑定 KV 存储。', needsKv: true }, 409);
  var body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  var action = String(body.action || 'add');

  var doc = await env.NOTIFY.get(FEEDBACK_KEY, 'json');
  var items = sanitizeFeedbackList(doc && doc.items);

  if (action === 'delete') {
    // 删除要管理密码
    var key = str(body.key, 80);
    var auth = await checkAuth(env, request, key);
    if (!auth.ok || !auth.initialized) return json({ ok: false, error: '删除反馈需要管理密码。' }, 401);
    var delId = str(body.id, 40);
    items = items.filter(function (x) { return x.id !== delId; });
  } else if (action === 'reply') {
    var fbId = str(body.id, 40);
    var reply = sanitizeReply(body.reply || body);
    if (!reply) return json({ ok: false, error: '回复内容不能为空。' }, 400);
    var hit = null;
    for (var i = 0; i < items.length; i++) if (items[i].id === fbId) { hit = items[i]; break; }
    if (!hit) return json({ ok: false, error: '这条反馈不存在了。' }, 404);
    if (hit.replies.length >= MAX_FB_REPLIES) return json({ ok: false, error: '这条反馈的回复太多了。' }, 400);
    hit.replies.push(reply);
  } else {
    var item = sanitizeFeedback(body.item || body);
    if (!item) return json({ ok: false, error: '请写点内容再提交。' }, 400);
    items.unshift(item);
    items = items.slice(0, MAX_FEEDBACK);
  }

  var next = { version: 1, updatedAt: nowIso(), items: items };
  await env.NOTIFY.put(FEEDBACK_KEY, JSON.stringify(next));
  return json({ ok: true, updatedAt: next.updatedAt, items: items });
}

/* ---------------- 投票 ---------------- */
function sanitizePoll(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var title = cleanText(raw.title, MAX_POLL_TITLE).replace(/\n/g, ' ');
  if (!title) return null;
  var opts = (Array.isArray(raw.options) ? raw.options : []).map(function (o) {
    var label = cleanText(o && (o.label !== undefined ? o.label : o), MAX_POLL_LABEL).replace(/\n/g, ' ');
    if (!label) return null;
    return { id: str(o && o.id, 20) || newId('o_'), label: label };
  }).filter(Boolean).slice(0, MAX_POLL_OPTIONS);
  if (opts.length < 2) return null;

  var votes = {};
  var src = raw.votes && typeof raw.votes === 'object' ? raw.votes : {};
  var validIds = {};
  opts.forEach(function (o) { validIds[o.id] = 1; });
  Object.keys(src).forEach(function (dev) {
    if (!DEVICE_RE.test(dev)) return;
    var picked = (Array.isArray(src[dev]) ? src[dev] : []).filter(function (id) { return validIds[id]; });
    if (picked.length) votes[dev] = picked.slice(0, MAX_POLL_OPTIONS);
  });

  return {
    id: str(raw.id, 40) || newId('p_'),
    title: title,
    desc: cleanText(raw.desc, MAX_POLL_DESC),
    options: opts,
    multi: !!raw.multi,
    maxChoices: Math.round(num(raw.maxChoices, 1, MAX_POLL_OPTIONS, 1)),
    once: raw.once === undefined ? true : !!raw.once,
    until: str(raw.until, 20),
    closed: !!raw.closed,
    at: str(raw.at, 40) || nowIso(),
    votes: votes
  };
}
function sanitizePolls(list) {
  return (Array.isArray(list) ? list : []).map(sanitizePoll).filter(Boolean).slice(0, MAX_POLLS);
}
async function handlePolls(env) {
  if (!hasKv(env)) return json({ ok: true, storage: '', items: [] });
  var raw = await env.NOTIFY.get(POLLS_KEY, 'json');
  return json({ ok: true, updatedAt: str(raw && raw.updatedAt, 40), items: sanitizePolls(raw && raw.items) });
}

/** POST /api/poll —— 建 / 改 / 结束 / 删除（要管理密码） */
async function handlePollAdmin(request, env) {
  if (!hasKv(env)) return json({ ok: false, error: '还没有绑定 KV 存储。', needsKv: true }, 409);
  var body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  var doc = await env.NOTIFY.get(POLLS_KEY, 'json');
  var items = sanitizePolls(doc && doc.items);
  var action = String(body.action || 'save');

  if (action === 'delete') {
    var delId = str(body.id, 40);
    items = items.filter(function (x) { return x.id !== delId; });
  } else if (action === 'close' || action === 'reopen') {
    var cid = str(body.id, 40);
    var found = null;
    for (var i = 0; i < items.length; i++) if (items[i].id === cid) { found = items[i]; break; }
    if (!found) return json({ ok: false, error: '这个投票不存在了。' }, 404);
    found.closed = (action === 'close');
  } else {
    var poll = sanitizePoll(body.item || body);
    if (!poll) return json({ ok: false, error: '标题和至少两个选项都要填。' }, 400);
    if (!poll.multi) poll.maxChoices = 1;
    var idx = -1;
    for (var j = 0; j < items.length; j++) if (items[j].id === poll.id) { idx = j; break; }
    if (idx >= 0) {
      poll.votes = items[idx].votes || {};      // 改内容别把票丢了
      poll.at = items[idx].at || poll.at;
      items[idx] = poll;
    } else {
      items.unshift(poll);
    }
    items = items.slice(0, MAX_POLLS);
  }

  var next = { version: 1, updatedAt: nowIso(), items: items };
  await env.NOTIFY.put(POLLS_KEY, JSON.stringify(next));
  return json({ ok: true, updatedAt: next.updatedAt, items: items });
}

/** POST /api/poll-vote —— 投票（公开；同一设备同一投票只能投一次） */
async function handlePollVote(request, env) {
  if (!hasKv(env)) return json({ ok: false, error: '还没有绑定 KV 存储。', needsKv: true }, 409);
  var body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  var device = str(body.device, 40);
  if (!DEVICE_RE.test(device)) return json({ ok: false, error: '设备标识不对，刷新页面再试。' }, 400);

  var doc = await env.NOTIFY.get(POLLS_KEY, 'json');
  var items = sanitizePolls(doc && doc.items);
  var poll = null;
  for (var i = 0; i < items.length; i++) if (items[i].id === str(body.pollId, 40)) { poll = items[i]; break; }
  if (!poll) return json({ ok: false, error: '这个投票不存在了。' }, 404);
  if (poll.closed) return json({ ok: false, error: '投票已经结束了。' }, 400);
  if (poll.until && new Date(poll.until).getTime() && Date.now() > new Date(poll.until).getTime()) {
    return json({ ok: false, error: '投票已经到截止时间了。' }, 400);
  }
  if (poll.once && poll.votes[device]) return json({ ok: false, error: '你已经投过了（这台设备只能投一次）。' }, 409);

  var validIds = {};
  poll.options.forEach(function (o) { validIds[o.id] = 1; });
  var picked = (Array.isArray(body.choices) ? body.choices : []).map(function (x) { return str(x, 20); })
    .filter(function (id) { return validIds[id]; });
  picked = picked.filter(function (id, idx2) { return picked.indexOf(id) === idx2; });
  if (!picked.length) return json({ ok: false, error: '请先选一个选项。' }, 400);
  var limit = poll.multi ? Math.max(1, Math.min(poll.maxChoices || MAX_POLL_OPTIONS, MAX_POLL_OPTIONS)) : 1;
  if (picked.length > limit) return json({ ok: false, error: '最多只能选 ' + limit + ' 项。' }, 400);

  poll.votes[device] = picked;
  var next = { version: 1, updatedAt: nowIso(), items: items };
  await env.NOTIFY.put(POLLS_KEY, JSON.stringify(next));
  return json({ ok: true, updatedAt: next.updatedAt, items: items });
}

/* ==========================================================================
   自建访问统计（D1 / SQLite）

   隐私取向：
     · 不种 cookie、不引第三方脚本；数据只存在主机自己的 Cloudflare 账号里
     · visitor 是「IP + UA + 当天盐」的 sha256，只用于统计「今天来了几个不同的人」，
       盐每天更换，因此无法跨天追踪同一个人，也拿不回原始 IP
     · ref 只记来源域名，不记完整地址
     · 明显是机器人/爬虫/命令行工具的 UA 直接不记
   ========================================================================== */
var CN_OFFSET_MS = 8 * 3600 * 1000;            // 统一按北京时间分天
var BOT_UA_RE = /bot|crawl|spider|slurp|bingpreview|headless|curl|wget|python|node-fetch|java\/|monitor|uptime|preview|facebookexternalhit|semrush|ahrefs/i;

/** 北京时间下的 YYYY-MM-DD */
function cnDay(at) {
  return new Date(at + CN_OFFSET_MS).toISOString().slice(0, 10);
}

/** 当日盐化访客指纹（不可逆、不跨天关联） */
async function visitorHash(request, day) {
  var ip = clientIp(request);
  var ua = request.headers.get('user-agent') || '';
  return sha256Hex(ip + '|' + ua + '|cw-stats|' + day);
}

function statsReady(env) {
  return !!(env && env.STATS && typeof env.STATS.prepare === 'function');
}

/** POST /api/hit —— 记一次页面访问 */
async function handleHit(request, env, ctx) {
  if (!statsReady(env)) return json({ ok: false, error: '没有绑定 D1 统计数据库。' }, 503);

  var body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  var p = String((body && body.path) || '').split('?')[0].split('#')[0].slice(0, 120);
  if (!p || p.charAt(0) !== '/') return json({ ok: false, error: 'path 不合法。' }, 400);

  var ua = request.headers.get('user-agent') || '';
  if (BOT_UA_RE.test(ua)) return json({ ok: true, skipped: 'bot' });

  var at = Date.now();
  var day = cnDay(at);
  var visitor = await visitorHash(request, day);
  var country = request.headers.get('cf-ipcountry') || '';
  var ref = '';
  try { ref = new URL(request.headers.get('referer') || '').hostname.slice(0, 60); } catch (e) { ref = ''; }

  var job = env.STATS
    .prepare('INSERT INTO hits (at, day, path, visitor, country, ref) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(at, day, p, visitor, country, ref)
    .run()
    .catch(function () { /* 统计失败不能影响访客 */ });

  // 优先异步写，别让访客的请求等数据库
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(job);
  else await job;

  return json({ ok: true });
}

/** GET /api/stats?days=14 —— 给后台看汇总 */
async function handleStats(env, url) {
  if (!statsReady(env)) return json({ ok: false, error: '没有绑定 D1 统计数据库。' }, 503);

  var days = Math.round(num(url.searchParams.get('days'), 1, 90, 14));
  var now = Date.now();
  var today = cnDay(now);
  var since = cnDay(now - (days - 1) * 86400000);
  var week = cnDay(now - 6 * 86400000);
  var month = cnDay(now - 29 * 86400000);
  var one = function (sql, params) {
    var st = env.STATS.prepare(sql);
    return (params && params.length ? st.bind.apply(st, params) : st).first();
  };
  var all = function (sql, params) {
    var st = env.STATS.prepare(sql);
    return (params && params.length ? st.bind.apply(st, params) : st).all();
  };

  var total = await one('SELECT COUNT(*) AS n FROM hits');
  var totalVisitors = await one('SELECT COUNT(DISTINCT visitor) AS n FROM hits');
  var todayRow = await one('SELECT COUNT(*) AS n, COUNT(DISTINCT visitor) AS u FROM hits WHERE day = ?', [today]);
  var weekRow = await one('SELECT COUNT(*) AS n, COUNT(DISTINCT visitor) AS u FROM hits WHERE day >= ?', [week]);
  var monthRow = await one('SELECT COUNT(*) AS n, COUNT(DISTINCT visitor) AS u FROM hits WHERE day >= ?', [month]);
  var series = await all('SELECT day, COUNT(*) AS n, COUNT(DISTINCT visitor) AS u FROM hits WHERE day >= ? GROUP BY day ORDER BY day', [since]);
  var topPaths = await all('SELECT path, COUNT(*) AS n FROM hits WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 12', [since]);
  var countries = await all("SELECT country, COUNT(*) AS n FROM hits WHERE day >= ? AND country != '' GROUP BY country ORDER BY n DESC LIMIT 10", [since]);
  var recent = await all('SELECT at, path, country, ref FROM hits ORDER BY at DESC LIMIT 20');

  return json({
    ok: true,
    today: today,
    days: days,
    since: since,
    total: total ? total.n : 0,
    totalVisitors: totalVisitors ? totalVisitors.n : 0,
    todayHits: todayRow ? todayRow.n : 0,
    todayVisitors: todayRow ? todayRow.u : 0,
    weekHits: weekRow ? weekRow.n : 0,
    weekVisitors: weekRow ? weekRow.u : 0,
    monthHits: monthRow ? monthRow.n : 0,
    monthVisitors: monthRow ? monthRow.u : 0,
    series: series ? series.results : [],
    topPaths: topPaths ? topPaths.results : [],
    countries: countries ? countries.results : [],
    recent: recent ? recent.results : []
  });
}

/* ==========================================================================
   入口
   ========================================================================== */
export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.indexOf('/api/') === 0) {
      try {
        return await handleApi(request, env, ctx);
      } catch (err) {
        return json({ ok: false, error: '服务端出错了：' + ((err && err.message) || err) }, 500);
      }
    }

    // 其它请求交给静态资源（site/ 目录）
    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  }
};
