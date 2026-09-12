# 我的网页

一个**零构建**的静态个人主页：纯 HTML / CSS / JavaScript，push 到 GitHub，Cloudflare Pages 自动发布到全球 CDN。

```
Class_web/
├─ site/                 ← 网页本体（要部署的就是这个目录）
│  ├─ index.html         ← 页面结构 / 文字内容
│  ├─ styles.css         ← 样式（配色变量集中在文件顶部）
│  ├─ script.js          ← 交互（菜单、主题、动画）
│  └─ _headers           ← Cloudflare Pages 专用的安全响应头
├─ hexo/blog/            ← 你原有的 Hexo 骨架，本方案未使用，保持原样
├─ .gitignore
└─ README.md
```

---

## 一、本地预览

直接**双击 `site/index.html`** 就能看，不需要任何环境。

想用本地服务器（更接近线上环境）：

```powershell
python -m http.server 8912 --directory site
# 然后浏览器打开 http://127.0.0.1:8912
```

---

## 二、部署路线：GitHub + Cloudflare Pages

两步：**代码放上 GitHub → Cloudflare Pages 连上这个仓库**。之后每次 `git push`，几秒后线上自动更新。

### 第 1 步：把代码推上 GitHub

✅ **本仓库已经初始化完毕**（分支 `main`，首个提交 `1fa9f27` 已生成），
git 身份也已按项目级配置写好：`MELEEYIN <2878989597@qq.com>`。
所以**不需要**再执行 `git init`、`git add`、`git commit`。

你只需要两步：

**① 在 GitHub 网页上新建一个空仓库**，名字建议 `my-site`，
**不要**勾选 "Add a README" / ".gitignore" / "license"（保持空仓库，否则 push 会被拒）。

**② 回到项目里绑定远程仓库并推送**（把 `你的用户名` 换成真实的 GitHub 用户名）：

```powershell
cd "D:\DeepSeek Harness\Class_web"
git remote add origin https://github.com/你的用户名/my-site.git
git push -u origin main
```

> 第一次 `push` 会弹出浏览器让你登录 GitHub 授权，点同意即可。
> 如果提示 `remote origin already exists`，改用：
> `git remote set-url origin https://github.com/你的用户名/my-site.git`

> 想改提交里显示的名字/邮箱，随时可以改（只改这个项目，不动全局配置）：
> ```powershell
> git config user.name "新名字"
> git config user.email "新邮箱@example.com"
> ```
> 注意：这**不会**改动已有的提交，历史里的作者信息仍是旧的。

### 第 2 步：Cloudflare Pages 连接仓库

1. 打开 <https://dash.cloudflare.com/> 注册 / 登录（免费，不需要买域名）。
2. 左侧菜单进入 **Workers & Pages** → 点 **Create** → 选 **Pages** 标签页 → **Connect to Git**。
3. 授权 Cloudflare 访问 GitHub，选中刚才的 `my-site` 仓库 → **Begin setup**。
4. 构建设置这样填（关键，别填错）：

   | 项目 | 填写内容 |
   |---|---|
   | Project name | `my-site`（决定你的网址） |
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | **留空** |
   | Build output directory | **`site`** |

   > ⚠️ **注意 `Build output directory` 必须填 `site`。**
   > 网页文件在仓库的 `site/` 子目录里，如果填成 `/`，网站首页会变成这个 README 而不是你的网页。
   >
   > 如果想按 Cloudflare Pages 最常见的习惯，把网页放在仓库根目录：
   > 执行 `git mv site/* .` 把 4 个文件移到根目录，删掉空的 `site` 文件夹，
   > 然后 Build output directory 改填 `/`。两种结构都可以，填对就行。

5. 点 **Save and Deploy**。等约 30 秒，状态变成 **Success**。

### 第 3 步：拿到你的网址

部署成功后会得到两个地址：

- `https://my-site.pages.dev` —— 正式网址，**HTTPS 自动配好**，直接分享给别人。
- `https://<随机串>.my-site.pages.dev` —— 每次提交生成的预览地址。

之后每次改动（改完 `site/` 里的文件后执行这三条）：

```powershell
cd "D:\DeepSeek Harness\Class_web"
git add .
git commit -m "更新文案"
git push
```

Cloudflare 检测到推送会自动重新部署，无需任何手动操作。

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
