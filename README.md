# 我的网页

一个**零构建**的静态个人主页：纯 HTML / CSS / JavaScript，push 到 GitHub，Cloudflare 自动发布到全球 CDN。

```
Class_web/
├─ site/                 ← 网页本体（要部署的就是这个目录）
│  ├─ index.html         ← 页面结构 / 文字内容
│  ├─ styles.css         ← 样式（配色变量集中在文件顶部）
│  ├─ script.js          ← 交互（菜单、主题、动画）
│  └─ _headers           ← 安全响应头（Pages / Workers 都支持）
├─ wrangler.jsonc        ← ⚠️ 关键：告诉 Cloudflare 网站内容在 ./site
├─ hexo/blog/            ← 你原有的 Hexo 骨架，本方案未使用，保持原样
├─ .gitignore
└─ README.md
```

> **`wrangler.jsonc` 不能删。** 没有它，Cloudflare Workers 不知道去哪个目录取网站内容，
> 部署会失败或得到一个空站点。它里面的 `assets.directory` 必须指向 `./site`。

---

## 一、本地预览

直接**双击 `site/index.html`** 就能看，不需要任何环境。

想用本地服务器（更接近线上环境）：

```powershell
python -m http.server 8912 --directory site
# 然后浏览器打开 http://127.0.0.1:8912
```

---

## 二、部署路线：GitHub + Cloudflare Workers 静态资源

**先说一句结论：你现在走的是 Workers，不是 Pages。**
新版 Cloudflare 控制台把 Pages 并入了 Workers & Pages，你的 `Create application` 弹窗
给出的是 `Create an app → Set up your application` 这个 **Workers** 流程。

这没关系——**Workers 静态资源托管一个纯静态网站，一样免费、一样有 HTTPS、一样 push 自动部署**，
而且是 Cloudflare 现在主推的方向。代价只有一个：**必须有 `wrangler.jsonc` 告诉它网站内容在哪**，
这个文件我已经建好了。

> 如果你更想用传统的 Pages（网址是 `xxx.pages.dev`）：在 `Create application` 里
> **切换到 `Pages` 标签页**再点 `Connect to Git`，然后 Build output directory 填 `site`。
> 两条路都能用，**二选一即可，不要两个都建**。

### 第 1 步：把代码推上 GitHub —— ✅ 已完成

| 项目 | 当前状态 |
|---|---|
| 远程仓库 | <https://github.com/MELEEYIN/Class_web> |
| 分支 | `main` |
| git 身份 | `MELEEYIN <2878989597@qq.com>`（项目级，未改动全局配置） |

代码已经推上去了，**第 1 步无需再做**，直接从第 2 步开始。

### 第 2 步：在 Cloudflare 创建应用

1. 打开 <https://dash.cloudflare.com/> → **Build → Compute → Workers & Pages**
   （快捷链接：<https://dash.cloudflare.com/?to=/:account/workers-and-pages>）。

   > 💡 **别在侧边栏里找 "Pages" —— 找不到是正常的。** 侧边栏只有 Workers & Pages 一项。

2. 点 **Create application** → 选择 **Continue with GitHub** / **Import a repository**。
3. 授权后选中仓库 **`MELEEYIN/Class_web`**。
4. 进入 **Set up your application** 页面，字段这样填：

   | 字段 | 填写内容 | 说明 |
   |---|---|---|
   | Project name | `class-web` | 决定你的网址前缀 |
   | Build command | **留空** | 我们是纯静态，没有构建步骤 |
   | Deploy command | `npx wrangler deploy` | **默认值就对了，别改** |

5. 点 **Create and deploy**。

> ⚠️ **`Deploy command` 必须是 `npx wrangler deploy`。**
> 它会在仓库根目录找到 `wrangler.jsonc`，读出 `assets.directory = "./site"`，
> 然后把 `site/` 里的 4 个文件发布出去。
> 如果你把这条命令删掉或改掉，部署会因为「找不到要发布的内容」而失败。

### 第 3 步：拿到你的网址 —— ✅ 已上线

| 项目 | 值 |
|---|---|
| **线上地址** | <https://class-web.2878989597.workers.dev> |
| 项目名 | `class-web` |
| 绑定的仓库 | `MELEEYIN/Class-web` |
| 部署状态 | Success（Cloudflare 构建耗时 1 分钟） |

> ⚠️ **国内网络下这个网址打不开**（见下方「五、关于访问」）。
> 在 Cloudflare 后台能看到站点健康运行，但在国内直连会被 DNS 污染 + SNI 阻断。
> 这**不是部署失败**，是 `workers.dev` 域名在国内被墙。

之后每次改动（改完 `site/` 里的文件后执行这三条）：

```powershell
cd "D:\DeepSeek Harness\Class_web"
git add .
git commit -m "更新文案"
git push
```

Cloudflare 检测到推送会自动重新部署，无需任何手动操作。

---

## 二·补、本地校验配置（可选，不用登录）

改过 `wrangler.jsonc` 之后，想确认配置有效再推上去：

```powershell
cd "D:\DeepSeek Harness\Class_web"
npx.cmd --yes wrangler@latest deploy --dry-run
```

看到 `Read 4 files from the assets directory ...\site` 就说明配置正确——它确认了
Cloudflare 会从 `site/` 取到那 4 个文件。

> 注意用 `npx.cmd` 而不是 `npx`：PowerShell 默认禁止运行 `npx.ps1` 脚本
> （会报「在此系统上禁止运行脚本」）。

---

## 三、怎么改成你自己的内容

| 想改什么 | 改哪里 |
|---|---|
| 名字、自我介绍、作品、联系方式 | `site/index.html`，文字都在 `<!-- 注释 -->` 段落里，直接替换 |
| 配色（主色 / 背景 / 文字色） | `site/styles.css` 最上面的 `:root { ... }`，改 `--accent`、`--bg` 等几个变量即可全站生效 |
| 建站日期（用于算"建站天数"） | `site/script.js` 里的 `var LAUNCH = new Date(2026, 8, 12);`<br>注意月份从 **0** 开始：`8` 代表 9 月 |
| 页脚署名 | `site/index.html` 底部的 `<footer>` |

改完刷新浏览器就能看到效果，满意了再 `git push`。

---

## 四、关于原有的 hexo/blog

`hexo/blog` 是一个**未完成的 Hexo 脚手架**（默认 landscape 主题，`_config.yml` 里还是 `John Doe` / `http://example.com`）。本方案没有使用它，也没有改动它。

如果以后想要"Markdown 写博客"：

- **简单路线**：继续用现在这套静态页面，写文章就复制一个新 HTML 文件。
- **Hexo 路线**：在 Cloudflare Pages 里把构建命令改成 `pnpm install && pnpm build`，
  输出目录改成 `hexo/blog/public`。但需要先把 Hexo 配好、主题选好，比现在这套重不少。

建议先把当前网站跑通、换成自己的域名，之后需要博客时再启用 Hexo。

---

## 五、关于域名：只买 1 年可以吗？以后能换吗？

**可以。换域名的成本极低，因为这个项目没有和任何域名绑定。**

已核实（代码审计）：`site/` 里所有资源都用相对路径引用
（`./styles.css`、`./script.js`），没有一个地方写死了域名。
所以换域名**不需要改任何代码**，`wrangler.jsonc` 也不用动。

Cloudflare 官方机制（[Custom Domains 文档](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)）：

| 事实 | 说明 |
|---|---|
| 一个 Worker 可绑**多个**自定义域名 | 旧新域名能并存，过渡期不用担心断档 |
| 加/删自定义域名不用改代码 | Cloudflare 自动创建 DNS 记录、自动签发 HTTPS 证书 |
| Custom Domain 是**路由**，域名是**可替换的配置** | Worker 本身完全独立于域名存在 |
| 证书**不会**随域名一起删除 | 删域名后要手动去 `SSL/TLS → Edge Certificates` 清掉，否则残留 |

### 换域名的完整流程

**新增**（可以和旧的并存）：Workers & Pages → `class-web` → Settings → Domains & Routes
→ Add → Custom Domain → 填新域名。

**切换到新域名**：确认新域名访问正常后，再删掉旧域名那条 Custom Domain，
然后去 `SSL/TLS → Edge Certificates` 删掉旧域名的证书。

### ⚠️ 只买 1 年的两个真实风险

1. **旧域名过期后可能被别人抢注。** 如果别人注册了你的旧域名，
   他就能控制那批旧链接的去向，甚至可能把访客引到别的地方。
   **如果你曾把这个网址分享给很多人，建议续费**，或者至少等旧域名自然过期后
   重新买回来做跳转。

2. **每次换域名，网站都会被"重新认识"一遍。** 已经得到的搜索引擎收录、
   别人收藏的链接、分享出去的 URL 全部作废，新域名要从头积累。

> 便宜的 `.top` / `.xyz` 首年常在 ¥10 以内，但**续费价通常明显高于首年**，
> 下单前看一下续费价格，别只看首年。

---

## 六、关于访问：`workers.dev` 在国内被墙

实测证据（2026-09-12，本机直连、无代理）：

| 站点 | 结果 |
|---|---|
| `github.com` | ✅ 通 |
| `registry.npmjs.org` | ✅ 通 |
| `developers.cloudflare.com` | ✅ 通 |
| `www.cloudflare.com` | ❌ 被阻断 |
| **`class-web.2878989597.workers.dev`** | ❌ **被阻断** |

具体表现（两层封锁）：

1. **DNS 污染** —— `workers.dev` 被解析到 `69.171.224.36`（Facebook 的 IP 段），不是 Cloudflare 的真实地址
2. **SNI 阻断** —— 即使手动用 `--resolve` 指定真实 Cloudflare IP，TCP 443 能连上（`TcpTestSucceeded: True`），
   但 TLS 握手立刻被切断（curl 返回 `000`，0 字节）

同时 `cloudflare.com` 解析正常（`104.16.x` / `162.159.x`），说明**被针对的是 `workers.dev` 这个域名，不是 Cloudflare 整体**。

### 这意味着什么

- ✅ **网站在线上是正常的** —— Cloudflare 后台、构建记录、部署状态都能证明
- ❌ **国内用户（包括你自己在不挂代理时）打不开它**
- ⚠️ 用 `workers.dev` 分享给国内朋友，对方同样打不开

### 可选的处理方式

| 方式 | 效果 | 成本 |
|---|---|---|
| 挂代理访问 | 自己能用 | 已有 |
| **换自定义域名** | 大概率可用（Cloudflare 免费版自定义域名国内连通性通常好于 `workers.dev`，但**不保证**，需实测） | 需买域名，约 ¥10–70/年 |
| **迁到国内可直连的平台** | 国内直连可用 | 免费，但平台不同（如 Gitee Pages、腾讯 EdgeOne Pages 等） |

> 换自定义域名的做法：在 Cloudflare 把域名接入（NS 指向 Cloudflare），
> 然后在 Workers 项目里 **Settings → Domains & Routes → Add → Custom domain**，
> 填 `www.你的域名.com`。之后 `wrangler.jsonc` 不需要改。

