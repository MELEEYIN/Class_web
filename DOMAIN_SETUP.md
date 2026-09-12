# 域名接入指南：`leeyin.xyz` → Cloudflare

> 记录时间：2026-09-12。所有标「实测」的结论都来自本机直接查询**注册局 RDAP**、
> **.xyz 官方权威 TLD 服务器**与**公共 DNS 解析器**，不是推测。命令都写在文末，可自行复现。

---

## 一、当前状态（已复查两次，状态在变好）

### ✅ 好消息：实名认证已生效，域名锁定已解除

对比两次实测的注册局状态：

| 字段 | 第一次实测（06:08 UTC） | 复查（06:36 UTC） | 结论 |
|---|---|---|---|
| `status` | `server hold` + `client hold` + `server transfer prohibited` + `add period` | **`server transfer prohibited` + `add period`** | ✅ **两个 hold 都消失了** |
| `nameservers` | `dns19/dns20.hichina.com` | `dns19/dns20.hichina.com` | 还是阿里云默认 NS，**待换** |
| `last changed` | 2026-09-12 06:06:31 UTC | 2026-09-12 06:35:48 UTC | 状态确实被更新过 |

剩下的 `server transfer prohibited` 和 `add period` 是**新域名的正常状态**，不影响使用。
**你做的实名认证起作用了。**

### ⏳ 但：DNS 委派还没重新发布出来（这不是网络问题，也不是被墙）

`server hold` 的作用是把域名**从 TLD 区域里摘除**。现在 hold 解除了，
但注册局**重新发布委派有延迟**。

**权威验证**——直接问 `.xyz` 的官方权威 TLD 服务器，绕过全世界所有缓存：

```powershell
nslookup -type=ns leeyin.xyz x.nic.xyz    # x.nic.xyz = .xyz 官方权威服务器之一
# 输出：*** UnKnown can't find leeyin.xyz: Non-existent domain
```

三个权威服务器（`x.nic.xyz` / `y.nic.xyz` / `z.nic.xyz`）**全部**返回
`Non-existent domain`，解析器 `1.1.1.1`、`8.8.8.8`、`223.5.5.5` 也全部返回
`DNS name does not exist`。

👉 这说明 **TLD 注册局里现在还没有 `leeyin.xyz` 的委派记录**，全世界任何解析器都查不到它。
对照阿里云官方文档：实名认证成功后**约 1~2 个工作日**解锁，状态同步最多可能再等 2~3 天。

### 👉 所以现在该做什么？——**别干等，直接往下推进**

既然你**无论如何都要把 NS 换成 Cloudflare**，就没必要等阿里云那条 `hichina` 委派先出现：

> **你在阿里云改 NS 这个动作本身，就会触发注册局发布一条全新的委派。**

所以卡在这里等待是浪费时间。**下一步直接做第 1 步：去 Cloudflare 添加站点。**

---

## 二、操作顺序

### 第 0 步 · ✅ 已完成：实名认证 + 解除锁定

已完成，无需再做。保留此步仅为记录，并说明**万一状态回退怎么查**：

| 原因 | 去阿里云哪里看 | 怎么解决 |
|---|---|---|
| 未实名认证 | 域名列表 → 「域名状态」列 | 完成实名认证，成功后约 1~2 个工作日解锁 |
| 邮箱验证未通过 | 管理 → 基本信息 → 「联系人邮箱」状态 | 点「验证未通过」按提示完成邮箱验证 |
| 用了公共模板邮箱 | 管理 → 基本信息 → 邮箱是否为 `zyhl-admin@list.alibaba-inc.com` | 必须「更改（过户）」到你自己的**已实名**信息模板 |

> 官方依据：[阿里云文档 · 解除域名锁定状态 Clienthold、Serverhold](https://help.aliyun.com/zh/dws/support/how-to-unlock-a-domain-name-that-is-in-the-serverhold-or-clienthold-state)

### 第 1 步 · 在 Cloudflare 添加站点 ← **进行中：已到 DNS 记录页**

1. 打开 <https://dash.cloudflare.com/> → 右上 **Add a site**（添加站点）。
2. 输入 `leeyin.xyz` → 选 **Free** 方案 → 继续。
3. Cloudflare 会扫一遍现有 DNS 记录（现在是空的，正常），然后**给你两个专属 NS 地址**，
   形如 `xxxx.ns.cloudflare.com` 和 `yyyy.ns.cloudflare.com`。
4. **先把这两个地址记下来**。此时站点状态会是 `Pending Nameserver Update`，这是正常的。

> ⚠️ 这两个 NS 是 Cloudflare **分给你的、每个人都不一样**，不要照抄任何教程里的示例地址。

#### 🚨 这一步有个必踩的坑：**什么记录都不要加**

添加站点后的这一页标题是 **「Your traffic is almost ready to proxy」**，中间是
**DNS management for leeyin.xyz**，有一个 `Add record` 表单（Type / Name / IPv4 address /
Proxy status / TTL），底部有 **`Continue to activation`** 按钮。

**这一页对你是陷阱。什么都别填，直接点 `Continue to activation`。**

| 为什么不能加 | 说明 |
|---|---|
| **你没有源站 IP** | 你的网站是 Cloudflare **Worker + 静态资源**，根本没有服务器。A 记录要求的 `IPv4 address` 无从填起 |
| **会和 Custom Domain 打架** | 官方明确：**不能在已有同名 CNAME 记录的域名上创建 Custom Domain**。你在这里手动加的记录会挡住第 4 步的自动创建 |
| **本来就自动建** | Custom Domain 会**自动**创建 DNS 记录并签发证书，手动加是重复且有害的 |

页面上显示 **`No DNS records.` 是完全正常的**——你这套架构本来就不需要在这里加任何记录。

✅ 点完 `Continue to activation` 之后，**下一页才会显示要你把
`dns19.hichina.com` / `dns20.hichina.com` 替换成的那两个 Cloudflare NS 地址**。
把那两个地址抄下来，然后做第 2 步。

### 第 2 步 · 回阿里云，把 NS 换成 Cloudflare 的那两个

1. [阿里云域名控制台](https://dc.console.aliyun.com/#/domain-list/all) → 域名列表 → `leeyin.xyz` → **管理**。
2. 找到 **「DNS 修改」**（修改 DNS 服务器）→ 选**自定义 DNS**。
3. 把 `dns19.hichina.com` / `dns20.hichina.com` 换成 Cloudflare 给你的那两个，提交。

📌 现在 `client hold` 已经解除，这一步**应该可以正常提交了**。如果仍被拒绝，说明状态同步没完成，
把报错原文记下来。

⚠️ 改成 Cloudflare 的 NS 之后，**阿里云云解析里的所有记录都会失效**（阿里云不再负责这个域名的解析）。
这是预期行为，不是故障。

### 第 3 步 · 等 Cloudflare 站点变成 `Active`

- 一般几分钟到几小时，最长 24 小时。Cloudflare 会发邮件通知。
- 官方要求：**必须等到站点 `Active`（active Cloudflare zone），才能进行第 4 步。**
- 用文末命令复查：NS 查询返回 `*.ns.cloudflare.com` 就说明委派已发布。

### 第 4 步 · 把域名绑定到已经部署好的 Worker

1. Cloudflare 后台 → **Workers & Pages** → 选 `class-web` 这个项目。
2. **Settings → Domains & Routes → Add → Custom Domain**。
3. 填 `leeyin.xyz` → **Add Custom Domain**。

✅ **不要手动去 DNS 页面加记录。** Cloudflare 官方文档明确：
Custom Domain 会**自动替你创建 DNS 记录并签发证书**。

⚠️ 官方两条限制，记住免得踩坑：

- **不能在已有同名 CNAME 记录的域名上创建 Custom Domain。** 如果之前加过，先去 DNS 记录里删掉。
- **不能在你不拥有的 zone 上创建 Custom Domain**——所以域名必须先按第 1~3 步加进你自己的账号并激活。

### 第 5 步（可选）· 让 `www.leeyin.xyz` 也能用

Custom Domain 是**精确匹配**的：绑了 `leeyin.xyz`，**不会**自动接管 `www.leeyin.xyz`。两种做法二选一：

| 做法 | 效果 | 操作 |
|---|---|---|
| **(a) 最简单** | 两个地址都能直接打开同一个网站 | 重复第 4 步，再 Add 一个 Custom Domain 填 `www.leeyin.xyz` |
| **(b) www 跳转到主域** | 访问 `www` 会 301 跳到 `leeyin.xyz`（地址栏统一，对收录更友好） | 先在 DNS 加一条**已代理**的 A 记录：`www` → `192.0.2.0`（占位地址），再去 **Rules → Redirect Rules** 配 www→根域跳转 |

> `192.0.2.0` 是官方指定的"无源站占位地址"：因为记录是**已代理**的，请求根本不会到达这个 IP，
> Cloudflare 会直接拦截并执行跳转规则。

### 第 6 步 · 验证

用文末命令跑一遍，看到这些就算成功：

- NS 查询返回 `xxxx.ns.cloudflare.com`（不再是 hichina）
- A 查询返回 Cloudflare 的 IP（`104.x` / `172.67.x` 之类），不再是 NXDOMAIN
- 浏览器打开 `https://leeyin.xyz` 能看到网站，且地址栏有锁（HTTPS 证书生效）

---

## 三、代码要不要改？——**不用，一行都不用改**

已核实：`site/` 里所有资源都用**相对路径**引用（`./css/base.css`、`./js/app.js`、`./assets/map/campus.webp` …），
没有任何地方写死域名。绑域名是**纯 Cloudflare 侧的配置**，`wrangler.jsonc` 也不用动。

### 可选：把域名写进 `wrangler.jsonc`（用代码管理域名）

Cloudflare 支持在配置文件里声明 Custom Domain：

```jsonc
"routes": [
  { "pattern": "leeyin.xyz", "custom_domain": true },
  { "pattern": "www.leeyin.xyz", "custom_domain": true }
]
```

⚠️ **但站点 `Active` 之前千万不要加这一段。** 一旦加上，GitHub 推送触发的自动部署
（`npx wrangler deploy`）会因为找不到这个 zone 而**部署失败**，连现有站点都保不住。

**结论：现在别加。等第 3 步站点 `Active` 之后，再决定要不要走这条路。**
不走也完全没问题——在后台点按钮绑定一样好使，只是域名配置不在 git 里而已。

---

## 四、关于"国内能不能打开"的实话

`workers.dev` 在国内被墙（DNS 污染 + SNI 阻断）是 README 第六节已实测的结论。
换成自己的域名后：

- ✅ **理论上会好一些**——`workers.dev` 这个域名是被针对性封锁的，`leeyin.xyz` 不在那份黑名单里。
- ⚠️ **但不保证**。Cloudflare 免费版 IP 段在国内经常被间歇性干扰，`.xyz` 后缀本身在国内也偶有解析问题。
- 📌 **唯一可靠的判断方式是实测**：第 4 步绑定完成后，用文末命令在本机直连环境测一次。

如果实测仍然打不开，可选方向：

| 方式 | 效果 | 成本 |
|---|---|---|
| 挂代理访问 | 自己能用 | 已有 |
| 换国内可直连平台（Gitee Pages、腾讯 EdgeOne Pages 等） | 国内直连可用 | 免费，但要迁平台 |
| 域名备案 + 国内主机 | 国内最稳 | 需要备案，有成本，且要放弃 Cloudflare |

建议**先走完本文档、实测之后再决定**，不要提前折腾。

---

## 五、验证命令（可随时复现）

### 最快的方式：跑体检脚本

```powershell
powershell -ExecutionPolicy Bypass -File .\check-domain.ps1
```

它会依次检查 **注册局状态 / TLD 委派 / NS / A 记录 / HTTPS 可达性** 共 5 项，
最后直接告诉你「现在该做哪一步」。

> ⚠️ **实测注意**：第 1 项（RDAP）在国内网络下**直连不通**——`rdap.centralnic.com`
> 能解析但 TLS 握手立刻被切断（curl exit 35）。脚本会提示你改用
> [阿里云 whois](https://whois.aliyun.com/) 查。**这不影响第 2~5 项**，
> 那几项走的是 DNS 查询，本机可用。

### 手动逐条查

在 PowerShell 里跑，用来确认每一步是否真的生效：

```powershell
# 1) 委派是否已发布 + NS 是否已变成 Cloudflare
Resolve-DnsName -Name leeyin.xyz -Type NS -Server 1.1.1.1

# 2) 是否已解析到 Cloudflare 的 IP
Resolve-DnsName -Name leeyin.xyz -Type A -Server 1.1.1.1

# 3) 绕开所有缓存，直接问 .xyz 官方权威服务器（最权威的判断）
nslookup -type=ns leeyin.xyz x.nic.xyz

# 4) 查注册局原始记录：看 status 和 nameservers 两个字段
#    浏览器打开：https://rdap.centralnic.com/xyz/domain/leeyin.xyz
#    ⚠️ 本机实测：这个地址能解析但 TLS 握手被切断（curl exit=35），国内网络直连不通。
#       替代方案（国内可用）：阿里云 whois → https://whois.aliyun.com/  输入 leeyin.xyz
#       注意 RDAP/whois 的状态更新有延迟，DNS 查询（上面 1~3 条）才是实时生效的证据。
```

**怎么读结果：**

| 现象 | 含义 | 下一步 |
|---|---|---|
| 权威服务器返回 `Non-existent domain` | 委派还没发布 | 执行第 1~2 步（改 NS 会触发发布） |
| NS 是 `dns19/dns20.hichina.com` | 阿里云 NS 还没换 | 第 2 步 |
| NS 是 `*.ns.cloudflare.com`，但 A 查不到 | NS 换了，还在传播 | 等第 3 步 |
| A 返回 `104.x` / `172.67.x` | ✅ DNS 已生效 | 第 4 步绑 Worker |
| 浏览器能打开且 HTTPS 正常 | ✅ 全部完成 | 收工 |
| `status` 里又出现 `server hold` / `client hold` | 锁定回退（如邮箱验证过期） | 回第 0 步排查 |

---

## 六、两个必须记住的坑

1. **删除 Custom Domain 时，证书不会跟着删。**
   官方文档明确：要手动去 **SSL/TLS → Edge Certificates** 清掉那张证书，
   否则它会一直留在证书清单里。

2. **`leeyin.xyz` 只买了 1 年，2027-09-12 到期。**
   到期不续费域名会被释放，别人可以抢注——你分享出去的所有旧链接都会指向他的内容。
   如果打算长期用、或已经分享给很多人了，建议提前续费（通常可续多年）。

---

## 附：本文结论的官方依据

- [Cloudflare · Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
  —— 前置条件（active zone、不能与已有 CNAME 冲突）、自动创建 DNS 与证书、
  www 与根域的精确匹配行为、删域名不删证书
- [Cloudflare · Redirect www to root](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/)
  —— www→根域跳转规则与 `192.0.2.0` 占位记录
- [阿里云 · 解除域名锁定状态 Clienthold、Serverhold](https://help.aliyun.com/zh/dws/support/how-to-unlock-a-domain-name-that-is-in-the-serverhold-or-clienthold-state)
  —— clientHold 的三种原因、实名认证后 1~2 个工作日解锁、状态同步可能再等 2~3 天

---

## 变更记录

| 时间 | 事件 |
|---|---|
| 2026-09-12 06:08 UTC | 首次实测：`server hold` + `client hold`，域名被暂停解析 |
| 2026-09-12 06:36 UTC | 复查：**两个 hold 均已消失**（实名认证生效），但 TLD 委派尚未重新发布 |
| 2026-09-12 | `server transfer prohibited` + `add period` 保留，属新域名正常状态 |
| 2026-09-12 | 已在 Cloudflare 添加站点 `leeyin.xyz`（Free / DNS Setup: Full），进入 DNS 记录页，NS 尚未更换 |
