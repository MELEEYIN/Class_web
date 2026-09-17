#!/usr/bin/env node
/**
 * 一键抓课表（本机小工具，零第三方依赖）
 *
 * 干什么：
 *   1. 用调试端口打开一个独立的 Edge/Chrome 窗口，直接进教务系统；
 *   2. 你自己登录（验证码、统一身份认证都照常走浏览器，脚本不碰你的密码）；
 *   3. 脚本自动认出课表表格，生成导入链接，直接打开校园主页并把课表填进导入预览；
 *   4. 同时把课表存一份 JSON 到 .timetable-exports/，万一没自动导入可以手动「导入」这个文件。
 *
 * 用法：
 *   双击 tools/一键抓课表.bat
 *   或： node tools/timetable-helper.mjs
 *
 * 可选参数：
 *   --url <地址>      换一个起始页面（默认教务系统入口）
 *   --site <地址>     校园主页地址（默认自动探测：本地预览 → 文件）
 *   --timeout <秒>    最多等多久（默认 600）
 *   --dry-run         只抓取、不打开主页，打印结果便于检查
 *   --headless        不显示浏览器窗口（自动化测试用）
 *
 * 隐私：登录会话只存在 .timetable-exports/browser-profile（已 gitignore），
 *       课表只写到本机文件，不上传任何地方。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/* ---------------- 可调项 ---------------- */
const CONFIG = {
  jwxtUrl: 'https://jwxt.sztu.edu.cn/',
  liveSite: 'https://leeyin.xyz/',
  localPreview: 'http://127.0.0.1:8931/index.html',
  siteFile: join(ROOT, 'site', 'index.html'),
  outDir: join(ROOT, '.timetable-exports'),
  profileDir: join(ROOT, '.timetable-exports', 'browser-profile'),
  debugPort: 9333,
  browserCandidates: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ],
}

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const START_URL = arg('--url', CONFIG.jwxtUrl)
const SITE_URL_ARG = arg('--site', '')
const TIMEOUT_MS = Number(arg('--timeout', '600')) * 1000
const DRY_RUN = argv.includes('--dry-run')
const HEADLESS = argv.includes('--headless')
// --auto：用学号密码自动登录（凭据见 readCredentials），不用人工点
const AUTO = argv.includes('--auto')
// 导入时用系统默认浏览器（你自己的数据），而不是工具自带的临时 profile
const SEND_TO_DEFAULT_BROWSER = !argv.includes('--same-profile')

const log = (...a) => console.log(...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------------- 小工具 ---------------- */
function findBrowser() {
  for (const p of CONFIG.browserCandidates) if (existsSync(p)) return p
  return null
}

/** 脱离父进程打开外部程序（用来把导入链接交给系统默认浏览器） */
function spawnDetached(cmd, args) {
  try {
    const p = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true })
    p.unref()
    return true
  } catch { return false }
}

/** 书签脚本里同一套找表逻辑：找「星期」出现最多的表，含同源 iframe */
const GRAB_EXPRESSION = `(function(){
  var cands = [];
  function scan(doc, depth) {
    if (depth > 2) return;
    try {
      var ts = doc.querySelectorAll('table');
      for (var i = 0; i < ts.length; i++) {
        var t = ts[i];
        var txt = t.innerText || t.textContent || '';
        if (!txt || txt.replace(/\\s+/g, '').length < 60) continue;
        var m = txt.match(/星期[一二三四五六日天]/g);
        cands.push({ n: m ? m.length : 0, r: t.rows ? t.rows.length : 0, html: t.outerHTML });
      }
    } catch (e) {}
    try {
      var fr = doc.querySelectorAll('iframe');
      for (var j = 0; j < fr.length; j++) { if (fr[j].contentDocument) scan(fr[j].contentDocument, depth + 1); }
    } catch (e) {}
  }
  scan(document, 0);
  cands.sort(function(a,b){ return (b.n - a.n) || (b.r - a.r); });
  var top = cands[0];
  var info = {
    title: document.title || '',
    url: location.href,
    hasPassword: document.querySelectorAll('input[type=password]').length > 0,
    tables: cands.length,
    weeks: top ? top.n : 0,
    rows: top ? top.r : 0,
    onIdp: /auth\\.sztu\\.edu\\.cn/.test(location.href),
  };
  if (top && (top.n >= 3 || top.r >= 6)) info.html = top.html;
  return JSON.stringify(info);
})()`

/** 选课期间的「临时启动页」：上面只有「进入选课 / 进入首页 / 退出登录」 */const ENTER_HOME_EXPRESSION = `(function(){
  var A = document.querySelectorAll('a,button');
  for (var i = 0; i < A.length; i++) {
    var t = (A[i].innerText || A[i].textContent || '').replace(/\\s+/g, '');
    if (t === '进入首页' || t.indexOf('进入首页') >= 0) { A[i].click(); return '进入首页'; }
  }
  return '';
})()`

/**
 * 在门户页里走到课表：优先点「学期理论课表」，
 * 其次按链接特征（xskbcx/kbcx），最后才去展开上级菜单。
 * 只点短标签，避免误点到整块容器。
 */
const OPEN_TIMETABLE_EXPRESSION = `(function(){
  // ① 链接地址里就带课表特征的，最稳
  var hrefs = document.querySelectorAll('a[href]');
  for (var j = 0; j < hrefs.length; j++) {
    var h = hrefs[j].getAttribute('href') || '';
    if (/xskbcx|kbcx|xsMain\\.jsp|kbcx\\.html/i.test(h)) { hrefs[j].click(); return 'href:' + h.slice(0, 26); }
  }
  // ② 只在「可点的元素」里找课表菜单项（先 a/button，避免点到包着链接的外层 li 而没反应）
  function pick(sel, words, exact) {
    var nodes = document.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].innerText || nodes[i].textContent || '').replace(/\\s+/g, '');
      if (!t || t.length > 20) continue;                 // 短标签才可能是菜单项
      for (var w = 0; w < words.length; w++) {
        if (exact ? t === words[w] : t.indexOf(words[w]) >= 0) { nodes[i].click(); return words[w]; }
      }
    }
    return '';
  }
  var TABLE_WORDS = ['学期理论课表', '理论课表', '实验课表查询', '学生个人课表', '我的课表', '班级课表查询'];
  var hit = pick('a,button', TABLE_WORDS, false);
  if (hit) return 'clicked:' + hit;
  // ③ 没看到就先展开上级菜单（这些常常是 li/span/div）
  var parent = pick('li,span,div', ['培养管理', '课表查询', '信息查询'], true);
  if (parent) return 'expand:' + parent;
  return pick('a,button', ['我的课表'], false) ? 'expand:我的课表' : '';
})()`


/* ---------------- 走「导出 xls」这条路 ----------------

   为什么还要这条：HTML 抓取依赖页面结构，而教务系统首页还挂着一个小课表挂件
   （7 个「星期」表头、只有被截断的课名），很容易抓错页。导出按钮给出的是教务系统
   自己生成的表格文件，和用户手动「导出 → 上传」是同一份数据，最稳。

   流程：开下载拦截 → 在课表页点「导出」→ 等文件落盘 → 读成 base64 交给主页。
   任何一步失败就返回 null，调用处自动回退到 HTML 抓取。 */

const EXPORT_CLICK_EXPRESSION = ['(function(){',
  'function findIn(doc){',
  ' var nodes = doc.querySelectorAll("a,button,input[type=button],input[type=submit],span,li,td");',
  ' for (var i = 0; i < nodes.length; i++) {',
  '  var el = nodes[i];',
  '  var t = ((el.innerText || el.textContent || "") + " " + (el.value || "") + " " + (el.id || "") + " " + (el.className || "") + " " + (el.getAttribute("href") || "")).replace(/\\s+/g, "");',
  '  if (t.length > 40) continue;',
  '  if (/导出|下载课表|export/i.test(t)) { el.click(); return (el.innerText || el.value || "").trim().slice(0, 12); }',
  ' }',
  ' return "";',
  '}',
  'var hit = findIn(document);',
  'if (hit) return hit;',
  'var fr = document.querySelectorAll("iframe");',
  'for (var j = 0; j < fr.length; j++) {',
  ' try { if (fr[j].contentDocument) { var h2 = findIn(fr[j].contentDocument); if (h2) return h2; } } catch (e) {}',
  '}',
  'return "";',
  '})()',
].join('')

function newestFile(dir, since) {
  let entries = []
  try { entries = readdirSync(dir) } catch { return null }
  let best = null
  for (const name of entries) {
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (!st.isFile()) continue
    if (st.mtimeMs < since - 1500) continue
    if (/\.crdownload$|\.tmp$|\.part$/i.test(name)) continue
    if (!best || st.mtimeMs > best.mtimeMs) best = { path: full, name, mtimeMs: st.mtimeMs, size: st.size }
  }
  return best
}

/** 在课表页点「导出」，把下载到的表格读成 base64。失败返回 null */
async function exportViaXls(cdp, sessionId, evaluate, log) {
  const dir = join(CONFIG.outDir, 'xls-download')
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  mkdirSync(dir, { recursive: true })

  try {
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true })
  } catch (e) {
    try { await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }, sessionId) } catch { /* 不支持就只能靠抓表 */ }
  }

  const since = Date.now()
  const clicked = await evaluate(EXPORT_CLICK_EXPRESSION).catch(() => '')
  if (!clicked) { log('   · 页面上没找到导出按钮，改用抓表格'); return null }
  log('   · 已点「' + clicked + '」，等导出的表格文件…')

  for (let i = 0; i < 24; i++) {
    await sleep(1000)
    const f = newestFile(dir, since)
    if (f && f.size > 0 && !/\.html?$/i.test(f.name)) {
      const raw = readFileSync(f.path)
      log('   ✓ 拿到导出文件：' + f.name + '（' + Math.round(raw.length / 1024) + ' KB）')
      return { name: f.name, b64: raw.toString('base64'), bytes: raw.length }
    }
  }
  log('   · 等了 24 秒没等到导出文件（可能弹了新窗口或被浏览器拦了），改用抓表格')
  return null
}

function toUrlSafeB64(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 清洗抓到的表格 HTML（在页面里跑）：
 *   正方课表的每个格子里其实有两份内容 —— 一份 display:none 的打印版
 *   （class=kbcontent1）和一份可见版（class=kbcontent），还夹着一堆二维码 <img>、
 *   隐藏 input、以及满屏的 style/class/width。原样送进主页有两个毛病：
 *     1. 同一门课被读两遍（出现重复课程）；
 *     2. 体积巨大（十多万字符），链接长得离谱。
 *   站点的解析器只用到 rowspan / colspan 和单元格文字，所以这里把隐藏内容和
 *   除了这两个之外的所有属性都去掉，体积能小一个数量级，课程也不会重复。
 */
const CLEAN_TABLE_EXPRESSION = (html) => `(function(){
  var box = document.createElement('div');
  box.innerHTML = ${JSON.stringify(html)};
  var table = box.querySelector('table') || box.firstElementChild;
  if (!table) return '';
  // ① 去掉隐藏元素（打印版重复内容）、图片、脚本、隐藏域
  var kill = table.querySelectorAll('[style*="display: none"],[style*="display:none"],.item-box,script,style,img,input,.kbcontent1');
  for (var i = 0; i < kill.length; i++) { if (kill[i].parentNode) kill[i].parentNode.removeChild(kill[i]); }
  // ② 属性只留 rowspan / colspan（解析器就认这两个）
  var all = table.querySelectorAll('*');
  var clean = function(el){
    var attrs = [].slice.call(el.attributes);
    for (var k = 0; k < attrs.length; k++) {
      var n = attrs[k].name.toLowerCase();
      if (n !== 'rowspan' && n !== 'colspan') el.removeAttribute(attrs[k].name);
    }
  };
  clean(table);
  for (var j = 0; j < all.length; j++) clean(all[j]);
  // ③ 顺手把空行空列里的 &nbsp; 也清掉，省体积
  return table.outerHTML.replace(/&nbsp;/g, ' ').replace(/[ \\t]+/g, ' ').replace(/\\n\\s*/g, '\\n');
})()`

/* ---------------- 自动登录（--auto） ----------------

   2026-09 实测：统一身份认证（auth.sztu.edu.cn，竹云）那个「密码」标签页
   只要求学号 + 密码，验证码输入框在 DOM 里但是隐藏的（display:none），
   所以脚本能直接填表提交，不需要识别验证码。登录后教务系统会发
   JSESSIONID，会话存在 browser-profile 里，之后短时间内不用重复登录。

   凭据来源（按顺序）：
     1. 环境变量 CW_JWXT_USER / CW_JWXT_PASS
     2. 本机文件 .timetable-exports/jwxt-account.json：{"user":"...","pass":"..."}
        （这个目录在 .gitignore 里，不会进仓库；不想留密码就删掉它，
          改用环境变量，或者干脆不加 --auto 手动登录。）
   脚本只把这些内容填进学校的登录表单，不会发到别的地方。 */

const ACCOUNT_FILE = join(CONFIG.outDir, 'jwxt-account.json')

function readCredentials() {
  const user = process.env.CW_JWXT_USER || ''
  const pass = process.env.CW_JWXT_PASS || ''
  if (user && pass) return { user, pass, from: '环境变量' }
  try {
    if (existsSync(ACCOUNT_FILE)) {
      const raw = JSON.parse(readFileSync(ACCOUNT_FILE, 'utf8'))
      if (raw && raw.user && raw.pass) return { user: String(raw.user).trim(), pass: String(raw.pass), from: ACCOUNT_FILE }
    }
  } catch (e) {
    log(`  ⚠ 读 ${ACCOUNT_FILE} 失败：${e.message}`)
  }
  return null
}

/** 教务系统里「学期理论课表」的固定地址（实测可直接打开，省得点菜单） */
const TIMETABLE_URL = 'https://jwxt.sztu.edu.cn/jsxsd/xskb/xskb_list.do'

/** 是不是统一身份认证的密码登录页（有可见的 j_username / j_password / 登录按钮） */
const LOGIN_PAGE_EXPRESSION = `(function(){
  var u = document.getElementById('j_username');
  var p = document.getElementById('j_password');
  var b = document.getElementById('loginButton');
  var visible = function(el){ if(!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return JSON.stringify({
    isLogin: !!(u && p && b && visible(u) && visible(p)),
    onIdp: /auth\\.sztu\\.edu\\.cn/.test(location.href),
    needCaptcha: !!document.getElementById('j_checkcode') && visible(document.getElementById('j_checkcode')),
    err: (function(){
      var n = document.querySelector('#errorDivMsg, #infoDivMsg, .errorTxt, .warningTxt');
      var t = n ? (n.innerText || '').trim() : '';
      return t;
    })()
  });
})()`

const FILL_LOGIN_EXPRESSION = (user, pass) => `(function(){
  var setVal = function(el, v){
    var d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
    if (d && d.set) d.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  var u = document.getElementById('j_username');
  var p = document.getElementById('j_password');
  if (!u || !p) return 'nouser';
  u.focus(); setVal(u, ${JSON.stringify(user)});
  p.focus(); setVal(p, ${JSON.stringify(pass)});
  var keep = document.getElementById('isSaveCookis');
  if (keep && !keep.checked) keep.click();
  return 'filled';
})()`

/**
 * 导入到哪个站点：默认用线上主页（leeyin.xyz），因为课表数据是存在浏览器本地的，
 * 你平时在手机/电脑上看到的也是它；本地预览那份是另一个 origin，导入进去你自己看不到。
 * 想导入到本地预览：加 --local（或 --site <地址> 指定别的地址）。
 */
async function probeSite() {
  if (SITE_URL_ARG) return SITE_URL_ARG
  if (!argv.includes('--local')) {
    try {
      const r = await fetch(CONFIG.liveSite, { method: 'HEAD' })
      if (r.ok) return CONFIG.liveSite
    } catch { /* 线上打不开就用本地 */ }
  }
  try {
    const r = await fetch(CONFIG.localPreview, { method: 'GET' })
    if (r.ok) return CONFIG.localPreview
  } catch { /* 本地预览没开 */ }
  if (existsSync(CONFIG.siteFile)) return 'file:///' + CONFIG.siteFile.replace(/\\/g, '/')
  return ''
}

/* ---------------- CDP ---------------- */
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.session = null }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true })
      ws.addEventListener('error', rej, { once: true })
    })
    const cdp = new Cdp(ws)
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id)
        cdp.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result)
      }
    })
    return cdp
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP 超时: ${method}`)) }
      }, 30000)
    })
  }
  close() { try { this.ws.close() } catch { /* ignore */ } }
}

async function main() {
  log('==================================================')
  log('  一键抓课表（本机小工具）')
  log('==================================================')

  const browser = findBrowser()
  if (!browser) {
    log('✗ 没有找到 Edge / Chrome。请先装一个，或把浏览器路径加到脚本的 browserCandidates 里。')
    return 1
  }
  log(`浏览器: ${browser}`)

  mkdirSync(CONFIG.profileDir, { recursive: true })

  const child = spawn(browser, [
    `--remote-debugging-port=${CONFIG.debugPort}`,
    `--user-data-dir=${CONFIG.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    ...(HEADLESS ? ['--headless=new'] : []),
    'about:blank',
  ], { stdio: 'ignore' })

  const cleanup = () => { try { child.kill() } catch { /* ignore */ } }

  // 等调试端口
  let version = null
  for (let i = 0; i < 40; i += 1) {
    await sleep(400)
    try {
      const r = await fetch(`http://127.0.0.1:${CONFIG.debugPort}/json/version`)
      if (r.ok) { version = await r.json(); break }
    } catch { /* 还没起来 */ }
  }
  if (!version) {
    log('✗ 浏览器调试端口没起来。可能已经有一个同配置的窗口开着 —— 关掉重试。')
    return 1
  }
  log(`已连上浏览器: ${version.Browser}`)

  const cdp = await Cdp.connect(version.webSocketDebuggerUrl)
  const { targetId } = await cdp.send('Target.createTarget', { url: START_URL })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)

  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false }, sessionId)
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || '页面脚本执行失败')
    return r.result?.value
  }

  log('')
  log(`已打开：${START_URL}`)

  const cred = AUTO ? readCredentials() : null
  if (AUTO && !cred) {
    log('⚠ 开了 --auto 但没找到账号密码，退回手动登录。')
    log(`   要么设环境变量 CW_JWXT_USER / CW_JWXT_PASS，`)
    log(`   要么把 {"user":"学号","pass":"密码"} 写进 ${ACCOUNT_FILE}`)
  }

  if (cred) {
    log(`🤖 自动模式：用账号 ${cred.user.slice(0, 4)}****（来自 ${cred.from}）登录，不用你动手。`)
  } else {
    log('👉 在这个窗口里登录教务系统（要验证码就输验证码）。')
  }
  log('   课表在：左侧栏 → 培养管理 → 我的课表 → 学期理论课表。')
  log('   脚本会自动往下走（临时启动页会帮你点「进入首页」，再帮你点到那张课表）；')
  log('   手动点过去也行，脚本一发现课表就自动带回主页。')
  log('')

  const start = Date.now()
  let navTries = 0
  let lastHint = Date.now()   // 别一上来就刷提示
  let lastNav = 0
  let captured = null
  let loginDone = false        // 自动登录只试一次，失败就别再打学校服务器
  let loggedIn = false         // 自动登录成功后置 true
  let loginFailed = ''
  let jumpedToTimetable = false
  let xlsTried = false       // 导出 xls 只试一次
  let capturedXls = null     // 拿到导出文件就用它，不再抓 HTML

  while (Date.now() - start < TIMEOUT_MS) {
    await sleep(1500)
    let info
    try {
      info = JSON.parse(await evaluate(GRAB_EXPRESSION))
    } catch (e) {
      // 页面正在跳转时常见，忽略
      continue
    }

    // 自动模式下只认「学期理论课表」那一页：教务系统首页也有个小课表挂件
    // （7 个「星期」表头、只有被截断的课程名，没有教师/教室/周次），
    // 以前会把那个挂件当成课表抓走 —— 表现就是「13 条、地点教师全空」。
    const onTimetablePage = /xskb_list|xskb/i.test(info.url || '');
    // 到了课表页，先试着点「导出」拿教务系统自己的表格文件（最稳，不依赖页面结构）
    if (cred && onTimetablePage && !xlsTried) {
      xlsTried = true
      const exp = await exportViaXls(cdp, sessionId, evaluate, log)
      if (exp) { capturedXls = exp; break }
      log('   · 导出没成功，改用抓页面表格（结果一样能用）')
    }

    // 注意：手动模式也必须只认课表页 —— 教务系统首页也挂了个小课表挂件
    // （有 7 个「星期」表头、只有被截断的课名），不作限制就会把它抓走。
    if (info.html && onTimetablePage) { captured = info; break }

    // ① 自动登录：只在登录页上试一次
    if (cred && !loginDone && !captured) {
      let page = { isLogin: false, onIdp: false, needCaptcha: false, err: '' }
      try { page = JSON.parse(await evaluate(LOGIN_PAGE_EXPRESSION)) } catch { /* 跳转中 */ }

      if (page.isLogin) {
        loginDone = true
        if (page.needCaptcha) {
          log('⚠ 学校的登录页这次要验证码，自动登录做不了 —— 改成手动在这个窗口里登录。')
        } else {
          log('   … 正在自动填学号密码并提交…')
          const filled = await evaluate(FILL_LOGIN_EXPRESSION(cred.user, cred.pass)).catch(() => '')
          if (filled === 'filled') {
            await evaluate(`document.getElementById('loginButton').click(); 'ok'`).catch(() => {})
            await sleep(6000)
            try {
              const after = JSON.parse(await evaluate(LOGIN_PAGE_EXPRESSION))
              if (after.isLogin) {
                loginFailed = after.err || '还停在登录页'
                log(`✗ 自动登录没成功：${loginFailed}`)
                log('   学号密码对不对？账号被锁也会这样。可以改成手动登录（去掉 --auto）。')
              } else {
                log('✓ 登录成功，会话已存进 browser-profile（短时间内不用重复登录）')
                loggedIn = true
                // 登录完别去点菜单：直接打开「学期理论课表」那个固定地址，稳且快
                jumpedToTimetable = true
                log(`   … 直接打开「学期理论课表」：${TIMETABLE_URL}`)
                await evaluate(`location.href = ${JSON.stringify(TIMETABLE_URL)}; 'go'`).catch(() => {})
              }
            } catch { log('✓ 已提交，页面正在跳转…'); loggedIn = true }
          } else {
            log('⚠ 没找到用户名/密码输入框，改成手动登录。')
          }
          continue
        }
      }
    }

    // ② 已经是登录状态、但还没到课表：直接跳课表页，比一层层点菜单稳
    //    注意别用「有没有表格」判断 —— 正方门户本身全是布局表格
    if ((loggedIn || (!info.onIdp && !info.hasPassword)) && !loginFailed && !jumpedToTimetable && !onTimetablePage && /jwxt\./i.test(info.url || '')) {
      jumpedToTimetable = true
      log(`   … 直接打开「学期理论课表」：${TIMETABLE_URL}`)
      await evaluate(`location.href = ${JSON.stringify(TIMETABLE_URL)}; 'go'`).catch(() => {})
      continue
    }

    const idle = Date.now() - lastHint > 25000

    // 到了统一身份认证：提示手动登录，别乱点
    if (info.onIdp) {
      if (idle) {
        if (cred && loginFailed) log('   … 自动登录失败，请在这个窗口里手动登录（登录后会自动继续）。')
        else log('   … 当前在「统一身份认证」页面：请在这里输入学号密码（该输验证码就输），登录后会自动继续。')
        lastHint = Date.now()
      }
      continue
    }
    // 停在教务系统自己的登录页
    if (info.hasPassword) {
      if (idle) { log('   … 停在登录页：请先在这个窗口里登录。'); lastHint = Date.now() }
      continue
    }

    // 已登录但还没到课表：一层一层往下走
    if (!onTimetablePage && Date.now() - lastNav > 4000 && navTries < 14) {
      lastNav = Date.now()
      const entered = await evaluate(ENTER_HOME_EXPRESSION).catch(() => '')
      if (entered) {
        navTries += 1
        log('   … 这是登录后的「临时启动页」，已帮你点「进入首页」')
        continue
      }
      const opened = await evaluate(OPEN_TIMETABLE_EXPRESSION).catch(() => '')
      if (opened) {
        navTries += 1
        if (opened.startsWith('expand:')) log(`   … 先展开菜单「${opened.slice(7)}」`)
        else log(`   … 已点开「${opened.replace(/^(clicked|href):/, '').slice(0, 20)}」`)
        continue
      }
    }

    if (idle) {
      log(`   … 还没找到课表（已 ${Math.round((Date.now() - start) / 1000)} 秒）。当前页面：${info.title || info.url}`)
      log('     课表路径：左侧栏 → 培养管理 → 我的课表 → 学期理论课表；手动点到那一页，脚本会自动发现。')
      log('     也可以点页面上的「导出」拿到 .xls，再用主页的「导入 → 上传文件」。')
      lastHint = Date.now()
    }
  }

  if (!captured && !capturedXls) {
    log('')
    log('✗ 等到超时也没找到课表。请确认：')
    log('   · 已经登录（不是停在「统一身份认证」或登录页）')
    log('   · 页面停在「学期理论课表」上（左侧栏 → 培养管理 → 我的课表 → 学期理论课表），')
    log('     页面上能看到「星期一…星期日」那一行表头')
    log('   · 如果它停在只有「进入选课 / 进入首页」的临时启动页，点一下「进入首页」再重跑')
    log('   · 实在不行：在那张课表页点「导出」，拿到 .xls 后回主页「导入 → 上传文件」')
    return 1
  }

  log('')
  if (capturedXls) log('✓ 已拿到教务系统导出的表格：' + capturedXls.name + '（' + Math.round(capturedXls.bytes / 1024) + ' KB）')
  else log(`✓ 抓到课表：${captured.weeks} 个星期列、${captured.rows} 行（来自「${captured.title}」）`)

  // 清洗一遍：去掉正方课表里那份 display:none 的重复内容，课程不会重复、链接也短很多
  let tableHtml = captured ? captured.html : ''
  try {
    const cleaned = await evaluate(CLEAN_TABLE_EXPRESSION(tableHtml))
    if (cleaned && cleaned.length > 200) {
      log(`  已清洗表格：${tableHtml.length} → ${cleaned.length} 字符`)
      tableHtml = cleaned
    }
  } catch (e) {
    log(`  ⚠ 清洗表格失败（用原始内容继续）：${e.message}`)
  }

  let payload
  let b64
  if (capturedXls) {
    // 教务系统导出的表格文件：base64 发回主页，那边用「上传文件」同一条解析路径
    payload = JSON.stringify({ t: 'xls', d: capturedXls.b64, n: capturedXls.name })
    b64 = toUrlSafeB64(payload)
    log('  载荷：教务系统导出的表格（' + capturedXls.name + '）')
  } else {
    payload = JSON.stringify({ t: 'html', h: tableHtml })
    b64 = toUrlSafeB64(payload)
  }

  // 备份成 .html：站点的「导入 → 选文件」能直接认（里面就是那张课表表格）
  mkdirSync(CONFIG.outDir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const htmlPath = join(CONFIG.outDir, `课表-${stamp}.html`)
  const srcNote = capturedXls ? ('教务系统导出表格 ' + capturedXls.name + ' → ' + TIMETABLE_URL) : captured.url
  writeFileSync(htmlPath, `<!-- 抓取自 ${srcNote} @ ${new Date().toISOString()} -->\n`
    + `<meta charset="utf-8">\n${tableHtml}\n`, 'utf8')
  if (capturedXls) {
    const xlsPath = join(CONFIG.outDir, capturedXls.name)
    writeFileSync(xlsPath, Buffer.from(capturedXls.b64, 'base64'))
    log(`  已另存导出的表格：${xlsPath}`)
    log('  （万一没自动导入，就在「导入 → 上传文件」里选这个文件）')
  } else {
    log(`  已另存一份：${htmlPath}`)
  }
  if (!capturedXls) log('  （万一没自动导入，就在「导入 → 上传文件」里选这个 .html 文件）')

  const site = await probeSite()
  if (!site) {
    log('✗ 找不到校园主页地址（本地预览没开、也没找到 site/index.html）。')
    return 1
  }
  const target = `${site}#data=${b64}`
  log(`  导入链接：${site}#data=…（${b64.length} 字符）`)

  // 顺手留一份「手机导入链接」：粘到微信/文件传输助手，手机上点开就能导入
  // （手机上跑不了这个 .bat，但课表数据是可以这样搬过去的；数据各存各的浏览器里）
  // 注意：这个链接一定用线上地址 —— 手机打不开你电脑上的 127.0.0.1
  try {
    const phoneSite = SITE_URL_ARG || CONFIG.liveSite
    const phoneLink = `${phoneSite}#data=${b64}`
    const linkPath = join(CONFIG.outDir, '手机导入链接.txt')
    writeFileSync(linkPath, phoneLink, 'utf8')
    log(`  📱 手机导入链接（${phoneSite}）：${linkPath}`)
    log('     把那个文件里的内容粘到微信「文件传输助手」，在手机上点开链接 → 主页会弹出导入预览 → 点「确认导入」。')
    if (!DRY_RUN) spawnDetached('powershell', ['-NoProfile', '-Command', `Get-Content -Raw -LiteralPath '${linkPath}' | Set-Clipboard`])
    log('     （已经帮你复制到剪贴板了）')
  } catch (e) {
    log(`  ⚠ 写「手机导入链接」失败：${e.message}`)
  }

  if (DRY_RUN) {
    log('  --dry-run：不打开主页。')
  } else if (SEND_TO_DEFAULT_BROWSER) {
    /* 关键一步：把导入链接交给「你自己的默认浏览器」打开。
       为什么不直接把 URL 传给 start：课表表格编码后有十几万字符，Windows 命令行
       上限是 8191，会被截断。所以先在本地写一个只做跳转的 .html，再让系统打开它 ——
       浏览器自己处理长 URL 没有这个限制，而且导入进的是你平时用的那份数据
       （工具自带的浏览器是临时 profile，导入进去你自己也看不到）。 */
    const redirectPath = join(CONFIG.outDir, '把课表导进主页.html')
    writeFileSync(redirectPath, `<!doctype html>
<meta charset="utf-8">
<title>正在打开校园主页…</title>
<body style="font:14px/1.7 system-ui,-apple-system,'Microsoft YaHei';padding:26px;color:#333">
  <p>正在把课表送进校园主页…（如果没自动跳，点<a id="a" href="#">这里</a>）</p>
  <p style="color:#888;font-size:12px">导入预览弹出后，点「确认导入」就完成了。</p>
<script>
  var target = ${JSON.stringify(target)};
  document.getElementById('a').href = target;
  location.replace(target);
</script>
</body>`, 'utf8')
    log(`  跳转页：${redirectPath}`)
    const opened = spawnDetached('cmd', ['/c', 'start', '', redirectPath])
    if (opened) {
      log('  ✓ 已用你的默认浏览器打开主页，导入预览应该已经弹出来了。')
      log('    在页面里点「确认导入」就完成（数据存进你自己浏览器的本地存储）。')
    } else {
      log('  ⚠ 没能自动打开浏览器，手动双击上面的「把课表导进主页.html」即可。')
    }
    log(`  （万一没弹预览：主页 → 导入 → 上传文件，选 ${htmlPath}）`)
  } else {
    const { targetId: siteTarget } = await cdp.send('Target.createTarget', { url: target })
    log('  已打开校园主页，正在确认导入结果…')
    // 挂到新标签页上，看看导入预览里到底认出了多少课
    await sleep(1800)
    try {
      const { sessionId: siteSession } = await cdp.send('Target.attachToTarget', { targetId: siteTarget, flatten: true })
      await cdp.send('Runtime.enable', {}, siteSession)
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(function(){
          var modal = document.getElementById('modal-import');
          var rows = document.querySelectorAll('#previewTable tbody tr').length;
          var summary = (document.getElementById('previewSummary') || {}).textContent || '';
          var badge = (document.getElementById('previewBadge') || {}).textContent || '';
          return JSON.stringify({ open: !!(modal && !modal.hidden), rows: rows, summary: summary.trim(), badge: badge.trim() });
        })()`,
        returnByValue: true,
      }, siteSession)
      const info = JSON.parse(r?.result?.value || '{}')
      if (info.open && info.rows > 0) {
        log(`  ✓ 主页已认出 ${info.rows} 条课程/事务${info.summary ? '（' + info.summary + '）' : ''}`)
        log('    在主页里点「确认导入」就完成了。')
      } else if (info.open) {
        log('  ⚠ 导入窗口开了，但没认出课程。可以在窗口里贴课表内容重试，或用上面的 .html 备份手动导入。')
      } else {
        log('  ⚠ 没能确认导入结果，请在打开的标签页里看一下；也可以手动导入上面的 .html 备份。')
      }
    } catch (e) {
      log(`  ⚠ 检查导入结果失败：${e.message}`)
    }
  }

  log('')
  if (HEADLESS) {
    log('（--headless 模式，自动结束）')
  } else {
    log('按回车结束（浏览器窗口留着，方便你自己核对；关掉它就行）…')
    await new Promise((r) => { const rl = readline.createInterface({ input: process.stdin }); rl.once('line', () => { rl.close(); r() }) })
  }

  // 显式收尾：先关 CDP，再杀浏览器，最后等一下，避免 Windows 上退出时抛 libuv 断言
  try { cdp.close() } catch { /* ignore */ }
  cleanup()
  await sleep(500)
  return 0
}

main().then((code) => {
  process.exit(code)
}).catch((e) => {
  console.error('出错了:', e.message)
  process.exit(1)
})
