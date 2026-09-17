/* ==========================================================================
   自建访问统计：每次打开页面，往自己的 Worker 记一次访问

   特点：
     · 不引第三方脚本（不像 Cloudflare 的 beacon 那样被 CSP 挡掉）
     · 不种 cookie；只上报「当前路径」，服务器那边用「IP+UA+当天盐」的散列
       统计“今天来了几个人”，无法跨天追踪，也拿不回 IP
     · 用 sendBeacon 发，不阻塞页面；失败也完全不影响使用
     · 后台页面（/admin*）与接口（/api*）不统计
   ========================================================================== */
(function () {
  try {
    if (!/^https?:$/.test(location.protocol)) return;          // file:// 预览不统计
    var p = location.pathname || '/';
    if (/^\/(admin|api)(\/|$)/.test(p)) return;                // 自己看后台不算访客
    var body = JSON.stringify({ path: p });
    if (navigator.sendBeacon) {
      // 用 Blob 指定 application/json，Worker 那边才能直接 request.json()
      navigator.sendBeacon('/api/hit', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/hit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body,
      keepalive: true
    }).catch(function () {});
  } catch (e) { /* 统计永远不该影响页面 */ }
})();
