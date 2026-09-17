/* ==========================================================================
   push.js — Web Push（RFC 8291 aes128gcm + VAPID）

   为什么要自己实现：Cloudflare Worker 里没有 node 的 web-push 包，
   但 WebCrypto 是齐全的（ECDH P-256 / HKDF / AES-GCM / ES256），足够按规范做。

   导出：
     · generateVapidKeys()        生成 VAPID 密钥对（配密钥用，只在本地跑）
     · encryptPayload(sub, data)  按 RFC 8291 加密载荷
     · sendPush(sub, payload, vapid)  发一条推送（带 VAPID 头）
     · b64u / unb64u              工具

   这份代码在 Worker 和 Node 里都能跑（都是 WebCrypto），所以加密逻辑可以
   用「客户端私钥解密」的方式做回环单测 —— 不用真机也能验证对不对。
   ========================================================================== */

const te = new TextEncoder();

export function b64u(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

/** HKDF（WebCrypto 的 deriveBits 一次只能出一个块，这里按需要拼） */
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

/** 生成一对 VAPID 密钥（P-256）。返回 { privateJwk, publicKey } */
export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);   // 65 字节未压缩点
  return { privateJwk: jwk, publicKey: b64u(raw) };
}

/**
 * 按 RFC 8291（aes128gcm）加密一条推送载荷。
 * sub = { endpoint, keys: { p256dh, auth } }（浏览器给的就是 base64url）
 */
export async function encryptPayload(sub, data) {
  const uaPublic = unb64u(sub.keys.p256dh);       // 65 字节
  const authSecret = unb64u(sub.keys.auth);       // 16 字节

  // ① 自己的临时 ECDH 密钥对
  const asPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asPair.publicKey));

  // ② ECDH 共享密钥
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPair.privateKey, 256));

  // ③ 按规范派生：先 auth_secret 混合，再按 salt 派生 CEK / nonce
  const ikm = await hkdf(authSecret, shared, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  // ④ 明文 = 内容 + 0x02（最后一条记录的分隔符）
  const plain = concat(te.encode(typeof data === 'string' ? data : JSON.stringify(data)), new Uint8Array([2]));
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));

  // ⑤ aes128gcm 头：salt(16) | rs(4, 大端) | idlen(1) | keyid(=as_public)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** VAPID 头：ES256 签的 JWT */
async function vapidAuth(endpoint, vapid) {
  const audience = new URL(endpoint).origin;
  const header = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(te.encode(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: vapid.subject || 'mailto:admin@example.com' })));
  const signingInput = header + '.' + body;

  const key = await crypto.subtle.importKey('jwk', Object.assign({}, vapid.privateJwk, { key_ops: ['sign'], ext: true }),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(signingInput)));

  return 'vapid t=' + signingInput + '.' + b64u(sig) + ', k=' + vapid.publicKey;
}

/** 发一条推送。返回 { ok, status, gone }（gone=true 表示订阅已失效，应删除） */
export async function sendPush(sub, payload, vapid, opts = {}) {
  const body = await encryptPayload(sub, payload);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      'content-length': String(body.length),
      'ttl': String(opts.ttl === undefined ? 60 * 60 * 12 : opts.ttl),
      'urgency': opts.urgency || 'normal',
      'authorization': await vapidAuth(sub.endpoint, vapid)
    },
    body
  });
  const gone = res.status === 404 || res.status === 410;
  return { ok: res.ok, status: res.status, gone };
}
