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

### 第 3 步：拿到你的网址

部署成功后（约 30 秒，状态变 **Success**），网址形如：

- `https://class-web.<你的子域>.workers.dev` —— 正式网址，**HTTPS 自动配好**
  （你的子域在截图里是 `2878989597`，所以大概率是
  `https://class-web.2878989597.workers.dev`）
- 每次 push 还会生成一个预览地址

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
