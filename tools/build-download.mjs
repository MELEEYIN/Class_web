import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const APP = '一键导入课表'
const SITE_DIR = join(ROOT, 'site', 'download')
const STAGE = join(ROOT, '.timetable-exports', 'download-build')

const BAT = [
  '@echo off',
  'chcp 65001 >nul',
  'title Auto import timetable',
  'cd /d "%~dp0"',
  '',
  'rem ASCII-only on purpose: cmd.exe reads .bat with the OEM codepage and',
  'rem garbles Chinese, which then breaks the following commands.',
  '',
  'echo.',
  'echo   ================================================',
  'echo     Campus homepage - auto import timetable',
  'echo   ================================================',
  'echo.',
  'echo   A browser window will open. Log in to jwxt.sztu.edu.cn there',
  'echo   (captcha and SSO are handled by the browser; this tool never',
  'echo   asks for or stores your password).',
  'echo.',
  'echo   Then open: left menu - training - my timetable - term timetable.',
  'echo   The script grabs that table and sends it back to the website.',
  'echo.',
  '',
  'where node >nul 2>nul',
  'if errorlevel 1 (',
  '  echo   [X] Node.js not found. Install the LTS build from https://nodejs.org/',
  '  echo.',
  '  pause',
  '  exit /b 1',
  ')',
  '',
  'node "%~dp0tools\\timetable-helper.mjs" %*',
  'set CODE=%ERRORLEVEL%',
  '',
  'echo.',
  'echo   ------------------------------',
  'if not "%CODE%"=="0" echo   Finished with exit code %CODE% - see messages above.',
  'if "%CODE%"=="0" echo   Done. Click "Confirm import" in the page that just opened.',
  'echo   ------------------------------',
  'echo.',
  'pause',
  ''
].join('\r\n')

const README = [
  '校园主页 · 一键导入课表（Windows）',
  '==================================',
  '',
  '【怎么用】',
  '1. 电脑上装 Node.js（LTS 版）：https://nodejs.org/',
  '2. 双击「一键导入课表.bat」。',
  '3. 弹出的浏览器窗口里登录教务系统（验证码、统一身份认证都在浏览器里走）。',
  '   课表在：左侧栏 → 培养管理 → 我的课表 → 学期理论课表；',
  '   打开那一页后脚本会自动认出课表，把结果送回校园主页并弹出「导入预览」。',
  '4. 在预览里点「确认导入」就完成。',
  '',
  '【它做了什么】',
  '· 只在这台电脑上跑：驱动一个临时的 Edge/Chrome 窗口，把课表页面的表格抓下来，',
  '  清洗后发回 https://leeyin.xyz 的导入预览，不经过任何第三方服务器。',
  '· 默认不保存、不填写任何密码 —— 需要你自己在那个窗口里登录。',
  '· 想全自动（可选，风险自负）：在这个 bat 旁边放一个 jwxt-account.json，内容',
  '  {"user":"学号","pass":"密码"}，脚本会自动登录；不想留密码就别建这个文件。',
  '· 抓下来的课表还会在 .timetable-exports\\ 里存一份「课表-日期.html」，',
  '  万一没自动导入，可以在主页「导入 → 上传文件」里选它。',
  '',
  '【手机上怎么办】',
  '手机跑不了这个工具（.bat 是 Windows 专用的）。手机上用主页「导入 → 书签」里的小书签：',
  '在手机浏览器里登录教务系统后点一下书签，课表就会自动回到主页。',
  '也可以：电脑上抓到后，把 .timetable-exports\\手机导入链接.txt 里的链接发到手机打开。',
  '',
  '【打不开 / 报错】',
  '· 提示「Node.js not found」：没装 Node，去 nodejs.org 装 LTS 版。',
  '· 窗口一闪而过或报错：把窗口里的文字截图发出来即可。',
  '· 抓不到课表：确认已经登录、并且停在「学期理论课表」那一页；',
  '  也可以直接在那一页点「导出」拿 .xls，回主页用「导入 → 上传文件」。',
  ''
].join('\r\n')

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n >>> 0); return b }
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b }

function makeZip(entries) {
  const chunks = []
  const central = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const data = e.data
    const crc = crc32(data)
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name
    ])
    chunks.push(local, data)
    central.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
      u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name
    ]))
    offset += local.length + data.length
  }
  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralBuf.length), u32(offset), u16(0)
  ])
  return Buffer.concat([...chunks, centralBuf, eocd])
}

const mjsPath = join(HERE, 'timetable-helper.mjs')
if (!existsSync(mjsPath)) { console.error('找不到 tools/timetable-helper.mjs'); process.exit(1) }

rmSync(STAGE, { recursive: true, force: true })
mkdirSync(join(STAGE, APP, 'tools'), { recursive: true })
copyFileSync(mjsPath, join(STAGE, APP, 'tools', 'timetable-helper.mjs'))
writeFileSync(join(STAGE, APP, '一键导入课表.bat'), BAT, 'ascii')
writeFileSync(join(STAGE, APP, '使用说明.txt'), '\uFEFF' + README, 'utf8')

mkdirSync(SITE_DIR, { recursive: true })
const zipPath = join(SITE_DIR, '一键导入课表.zip')
const entries = [
  { name: APP + '/一键导入课表.bat', data: Buffer.from(BAT, 'ascii') },
  { name: APP + '/使用说明.txt', data: Buffer.from('\uFEFF' + README, 'utf8') },
  { name: APP + '/tools/timetable-helper.mjs', data: readFileSync(mjsPath) }
]
writeFileSync(zipPath, makeZip(entries))

console.log('已生成 ' + zipPath + '（' + Math.round(readFileSync(zipPath).length / 1024) + ' KB）')
for (const e of entries) console.log('  · ' + e.name + '（' + e.data.length + ' 字节）')
