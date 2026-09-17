# tools/：本机小工具

## 一键自动导入课表（不需要你登录、不需要点菜单）

**双击 `一键自动导入课表.bat`**，全自动跑完：

1. 打开教务系统 → 自动填学号密码提交（统一身份认证那个「密码」标签页**没有验证码**，
   验证码输入框在页面里是隐藏的，所以能直接提交；万一学校哪天开了验证码，脚本会自己
   退回手动登录）；
2. 直接打开「学期理论课表」页面（`/jsxsd/xskb/xskb_list.do`），不用点左侧菜单；
3. 抓下表格 → **清洗**（正方每个格子里有一份 `display:none` 的打印版重复内容，
   不清洗会出现重复课程，链接也会长到十几万字符）→ 121KB 缩到 6KB；
4. **用你自己的默认浏览器**打开主页并把课表送进「导入预览」，你在页面上点一次
   「确认导入」就结束（这样导入的是你平时那份数据，不是临时浏览器里的）；
5. 顺手在 `.timetable-exports/` 存一份 `课表-日期.html`，万一没自动弹预览就
   「导入 → 上传文件」选它。

### 账号密码放哪

脚本按顺序找：

1. 环境变量 `CW_JWXT_USER` / `CW_JWXT_PASS`；
2. `.timetable-exports/jwxt-account.json`：`{"user":"学号","pass":"密码"}`
   —— 这个目录在 `.gitignore` 里，只在你本机；**不想留密码就删掉这个文件**，
   改用环境变量，或者用下面那个手动版。

密码只被填进学校的登录表单，不会发到别的地方，也不会写进站点。

### 出问题的话

- 学号密码错了 / 账号被锁 → 日志会说「自动登录没成功」，这时用手动版 `一键抓课表.bat`；
- 不在校园网（家宽/流量）→ 教务系统本身打不开，这个工具也抓不到，需要连校园网或学校 VPN；
- 想导入到本地预览而不是线上 → 加 `--local`。

---

## 一键抓课表（手动登录版）

**双击 `一键抓课表.bat`** 就行。它会：

1. 用调试端口打开一个**独立的 Edge/Chrome 窗口**，直接进教务系统；
2. 你在那个窗口里登录（验证码、统一身份认证都照常走浏览器 —— 脚本不填密码、不记密码）；
3. 你点到「学生个人课表」页面后，脚本自动认出课表表格；
4. 自动打开校园主页并把课表填进「导入预览」，还会告诉你认出了几条；
5. 同时在本目录的上一级 `.timetable-exports/` 存一份 `课表-日期.html`，万一没自动导入就手动「导入 → 上传文件」选它。

第一次运行要在那个窗口里登录一次；登录会话保存在 `.timetable-exports/browser-profile/`
（已 gitignore，只在你本机），下次运行通常不用再登。

### 为什么这么做

- 教务系统在**校园内网**（`jwxt.sztu.edu.cn`），云端服务器连不上，
  所以「服务器帮我校验并抓取」这条路不成立；
- 浏览器同源策略也不允许网站在别的域名上读教务系统的页面；
- 于是只剩两条：**书签小工具**（在教务系统页面上跑）和**这个本机工具**（用调试端口驱动你自己的浏览器）。
  后者不依赖书签栏，桌面端双击即可，也能顺手把 .xls 都省掉。

### 命令行用法

```powershell
node tools/timetable-helper.mjs                  # 手动登录流程
node tools/timetable-helper.mjs --auto           # 自动登录（凭据见上）
node tools/timetable-helper.mjs --auto --headless # 全程无窗口
node tools/timetable-helper.mjs --dry-run        # 只抓取、不开主页，打印结果（排查用）
node tools/timetable-helper.mjs --local          # 导入到本地预览，而不是线上主页
node tools/timetable-helper.mjs --same-profile   # 在工具自己的浏览器里预览（不交给默认浏览器）
node tools/timetable-helper.mjs --url <地址>     # 换起始页（默认教务系统入口）
node tools/timetable-helper.mjs --site <地址>    # 指定校园主页地址（默认：线上 → 本地预览 → 本地文件）
node tools/timetable-helper.mjs --timeout 900    # 最多等多久（秒）
```

### 依赖与隐私

- 只用 Node 自带能力（`WebSocket` + `fetch` 走 CDP 协议），**零第三方依赖**；Node 需 ≥ 22。
- 抓到的课表只写到本机文件、或直接填进你自己的浏览器页面，**不上传任何地方**。
- 浏览器配置目录 `.timetable-exports/browser-profile/`（以及自动版用的 `browser-profile-auto/`）
  里有你的登录 cookie，**不要提交、不要外传**。
