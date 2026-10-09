/* ==========================================================================
   sw.js — service worker：让站点能装到桌面、断网也能打开

   策略（这个站是「本地优先」的，所以离线体验天然好）：
     · 页面外壳（HTML/CSS/JS/图标）：预缓存，cache-first
     · /api/*（通知、公共事务、投票、附件、统计）：**绝不缓存**，走网络；
       断网时直接失败，由页面显示「离线，稍后同步」—— 假装有数据更糟
     · 其它同源 GET：network-first + 缓存兜底

   版本号：每次改站点都改 VERSION；activate 时清掉旧缓存 ✓
   更新流程：新 SW install 后**不自动接管**，由页面提示「有新版本，点一下更新」，
   用户点了才 skipWaiting + reload（避免像以前那样用户长期跑在旧代码上）。
   ========================================================================== */
var VERSION = 'v16';  // 改样式/脚本时记得 +1（v14：新增时间线页 timeline.html + 它的 css/js）
var SHELL_CACHE = 'cw-shell-' + VERSION;
var RUNTIME_CACHE = 'cw-runtime-' + VERSION;

var SHELL = [
  './',
  './index.html',
  './site.webmanifest',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/mobile.css',
  './js/boot.js',
  './js/util.js',
  './js/view.js',
  './js/xls.js',
  './js/parse.js',
  './js/store.js',
  './js/schedule.js',
  './js/map.js',
  './js/background.js',
  './js/widgets.js',
  './js/attach.js',
  './js/board.js',
  './js/public.js',
  './js/import.js',
  './js/edit.js',
  './js/exporters.js',
  './js/dialog.js',
  './js/app.js',
  './js/stats.js',
  './js/pwa.js',
  './timeline.html',
  './css/timeline.css',
  './js/timeline.js',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon-180.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(function (c) {
      // 一个一个加：某一个 404 不该让整个安装失败
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { });
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

function isApi(url) {
  return url.pathname.indexOf('/api/') === 0;
}
function isAsset(url) {
  return /\.(css|js|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // 上传/发布这些一律走网络

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;        // 跨域（Bangumi/Jikan 等）不管

  if (isApi(url)) return;                                 // 接口：不拦，交给浏览器和页面

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        /* ★ 按「自己的 URL」存，不要统一塞进 './index.html'：
           否则打开任意子页面（/timeline.html、/admin.html…）都会把首页那份
           离线兜底覆盖掉，下次断网开首页就变成了那个子页面。 */
        var copy = res.clone();
        caches.open(RUNTIME_CACHE).then(function (c) { c.put(req.url, copy); });
        return res;
      }).catch(function () {
        /* 先找这一页自己的缓存，再退回首页，最后才是错误页 */
        return caches.match(req.url).then(function (hit) {
          if (hit) return hit;
          return caches.match('./index.html').then(function (home) {
            return home || new Response('离线了，而且还没缓存过这个页面。联网打开一次即可。', {
              status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' }
            });
          });
        });
      })
    );
    return;
  }

  if (isAsset(url)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) {
          // 后台顺手更新一份，下次就是新的
          fetch(req).then(function (res) {
            if (res && res.ok) caches.open(SHELL_CACHE).then(function (c) { c.put(req, res); });
          }).catch(function () { });
          return hit;
        }
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(RUNTIME_CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
  }
});
