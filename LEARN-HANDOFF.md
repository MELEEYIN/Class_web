# 「编程学习」站 · 架构与导航层交接说明

> 本文由架构/导航层负责人（负责 `site/acm` 的 .html 骨架与导航、`site/js/**`）撰写。
> 覆盖：分类与侧栏数据源、编程学习首页、Python 区入口页、章节页模板、TOC / 面包屑 / 上下篇、与 C++（原 ACM）内容的耦合点。
> **正文（`site/acm/python/*.md`）、样式（`site/css/**`）分别由提示词工程师与前端开发者负责。**

---

## 0. 现状一句话

`site/acm/` 已从「ACM 算法子站」升级为「编程学习站」：顶层两大分类 **C++ 算法竞赛** 与 **Python**；
C++ 侧仍是原来的 `study.html` / `practice.html`（**URL 一个没变**，老链接与深链全部有效）；
Python 侧有区入口页 `python/index.html` + 按章独立 URL 的教程页。全站共用一棵左侧导航树，由 JS 按同一份数据渲染。

```
/acm/                     编程学习首页（分类卡 + 全站搜索 + 分工说明 + Python 入口）
/acm/study.html           C++ 学习资料（原样保留，左侧多出一块「站点导航」）
/acm/practice.html        C++ 题练场（原样保留，左侧多出折叠式「站点导航」）
/acm/python/              Python 语法教程 · 区入口（章节网格 + 进度 + 过滤）
/acm/python/NN-slug.html  Python 教程第 NN 章（模板生成，正文来自 NN-slug.md）
```

加一章 = 写 `NN-slug.md` + 跑一次 `python site/acm/python/_render.py`。章数不写死在页面里：
页面上任何 `<span data-learn-count></span>` 都由 `learn-shell.js` 填真数（本文件写下时是 27 章，会随写作继续涨）。

> `.qa/` 是我做窄屏验证用的临时目录（390px 视口的量测页 + 截图），随时可以整目录删掉，不参与部署。

---

## 1. 文件地图（谁拥有什么）

| 文件 | 作用 | 所有者 |
| --- | --- | --- |
| `site/js/learn-nav.js` | **唯一事实来源**：分类 / 分组 / 条目 / 章节目录 | 导航层（我） |
| `site/js/learn-shell.js` | 行为层：侧栏树、面包屑、上下篇、页内 TOC、已读与进度 | 导航层（我） |
| `site/acm/learn.css` | 上面两层需要的全部样式（**只服务学习站**，token 继承 `acm.css`） | 导航层（我） |
| `site/acm/index.html` | 编程学习首页（hub） | 导航层（我） |
| `site/acm/python/index.html` | Python 区入口页 | 导航层（我） |
| `site/acm/python/_template.html` | 章节页模板（顶部 `<!--CONTRACT-START-->` 注释是给作者的约定，渲染时会被删掉） | 导航层（我） |
| `site/acm/python/_render.py` | Markdown → 章节页 + 自动同步 `learn-nav.js` 的渲染器 | 导航层（我） |
| `site/acm/python/NN-slug.md`、`examples/`、`_build/verify.py` | 章节正文与示例代码、校验脚本 | 提示词工程师 |
| `site/acm/acm.css`、`site/css/**` | 既有视觉体系（色彩 token、导航、页脚） | 前端开发者 |
| `site/acm/study.html`、`practice.html` | C++ 内容页 | 前端/内容侧；导航层只做了**最小侵入式补丁**（见 §7） |

---

## 2. 数据源契约：`site/js/learn-nav.js`

纯 JS 全局字面量（不是 JSON、不走 fetch），所以 `file://` 双击也能跑。

```js
window.LEARN_NAV = {
  v: 1, updated: '…',
  site: '编程学习',
  home: { id: 'home', title: '编程学习首页', href: 'index.html' },
  cats: [ /* 两个分类 */ ]
};
```

- **`href` 一律相对 `/acm/` 书写**（`'study.html'`、`'python/index.html'`），页面在 `python/` 下时由 `learn-shell.js` 自动补 `../` 前缀（依据 `location.pathname`；也可以用 `[data-learn-prefix]` 强制覆盖）。
- 分类（cat）：`id / name / short / tint('blue'|'amber') / note / href / groups[]`
- 分组（group）：`id / name / href?(有则渲染成可点标题) / note / items[]`
- 条目（item）：`id / title / href / tag?(徽章) / desc?(一句话简介) / no?(章号)`
  - **只有带 `no` 的条目才算「教程章节」**：进进度分母、上下篇 label 显示「第 3 章 · …」。

### Python 章节目录是自动区块，别手改

```js
    /* @chapters:begin —— 下面这段由 site/acm/python/_render.py 自动生成，别手改；
       … */
    { id: 'py-01', no: 1, title: '环境与解释器', href: 'python/01-environment-and-interpreter.html', desc: '…' },
    …
    /* @chapters:end */
```

两个标记之间的内容每次渲染都会被**整段重写**（顺序 = 章号升序），同时把分组 `note` 更新成「共 N 章 · 按写作顺序陆续上线」。
👉 **加一章的正确姿势：写 `NN-slug.md`，然后跑一次渲染器**，不要在别处再维护章节列表。

---

## 3. 渲染流水线：`site/acm/python/_render.py`

```bash
python site/acm/python/_render.py              # 渲染全部章节 + 同步导航
python site/acm/python/_render.py 03 05        # 只渲染指定章
python site/acm/python/_render.py --no-nav     # 只出 HTML，不动 learn-nav.js
```

- 扫描 `site/acm/python/NN-english-slug.md`（正则 `^(\d{2})-([a-z0-9][a-z0-9-]*)\.md$`），输出同名 `.html`。
- 只用 Python 标准库，无依赖；本机 Python 3.14.7 验证通过。
- 从 md 读到的：h1 `# 03 · 变量与数据类型` → 页 `<h1>第 3 章 · 变量与数据类型</h1>`、`<title>`、`meta description`；
  紧跟的 `> **本质**：…` → 页头 `.lead`。**页面不写死任何标题**，改 md 就够。
- 标题 id：`## 3.14 小结` → `id="s3-14"`；无编号标题 → `id="s-" + slug(标题)`；重名自动加 `-2`。
- 消费的 Markdown 子集：段落 / 列表 / 表格 / 引用（提示框）/ 分隔线 / 行内 `code`、**粗**、*斜*、[链接] / 围栏代码块。
- 提示框：`> **💡 提示**` `> **⚠️ 易错**` `> **✅ 小结**` `> **本质**` → `<div class="box tip|warn|ok|essence">`（样式已在 `learn.css` 里）。
- 代码块三件套（与 `_STYLE.md` 一致）：
  - ` ```pycon ` → `pre.pycon`（保留 `>>> ` / `... ` 前缀）
  - ` ```python ` 首行 `# 示例：examples/xxx.py` → 抽成 `<figure class="code">` 的标题条 `.code-src`
  - 紧随其后的 ` ```text ` → 合并进同一个 `figure`，包成 `.out-wrap` + 「运行输出」标签
  - 首行 `# 片段` 的 python 块 → 去掉标记，普通代码块
- 每页页脚自动带「上一课 / 下一课」与站内导航，靠 `learn-shell.js` 按 `learn-nav.js` 顺序算，无需作者维护。

**改了 `_template.html` 要重跑渲染器**，已有章节页才会跟着变（模板里 `data-learn-page` 是占位，会被逐页替换成 `py-NN`）。

---

## 4. 页面侧挂载点（想要哪块，就放一个空容器）

| 容器 | 渲染内容 |
| --- | --- |
| `<div data-learn-sidebar>` | 左侧导航树（分类可折叠 + 已读打勾 + 进度）；加 `data-compact="1"` 隐藏标题与进度条 |
| `<div data-learn-crumb>` | 面包屑：编程学习 / Python / 第 3 章 · 变量与数据类型 |
| `<div data-learn-pager>` | 上一课 / 下一课（站点内顺序；首尾显示「已经是第一篇了」「本模块已读完」） |
| `<div data-learn-toc>` | 页内目录（自动扫 h2/h3，缺 id 自动补；可放多个，例如侧栏 rail + 移动端折叠块） |
| `<div data-learn-progress>` | 「3 / 8 章已读」+ 进度条 |
| `<div data-learn-cards>` | 首页两大分类卡 |
| `<div data-learn-grid>` | Python 区入口的章节网格 |
| `<div data-learn-cta>` | 「开始 / 继续学习」按钮 |
| `<div data-learn-recent>` | 「继续上次」一行（没有记录就不渲染） |
| `<button data-learn-mark>` | 手动标记本章已读 / 取消 |
| `<input data-learn-filter>` | 章节网格的即时过滤框 |
| `<span data-learn-count>` | 动态填充章数（**别在文案里写死数字**） |
| `<div data-learn-title> / <div data-learn-lead>` | 空则用 `learn-nav.js` 数据补标题 / 导语；已写文字则一字不动 |
| `<body data-learn-page="py-03">` | 显式声明当前页属于哪个条目（章节页由渲染器写入；比按路径猜更稳） |

状态全部存在浏览器：`learn.read`（已读 id 数组）、`learn.fold`（分类折叠）、`learn.recent`（最近 8 章）；
深浅色沿用校园主页的 `cw.theme`，**`learn-shell.js` 不接管 `#themeBtn`**（各页自己的内联脚本负责切换，避免双触发）。

---

## 5. `learn.css` 提供的 class（前端开发者请勿在 `site/css/**` 里重复实现）

布局：`.learn-layout`（232px + 正文 + 196px 目录三栏）/ `.learn-layout.two-col` / `.learn-aside` / `.learn-rail` / `.learn-main`
导航：`.ls-nav .ls-head .ls-title .ls-home .ls-dot .ls-cat.ls-tint-blue|.ls-tint-amber .ls-catbtn .ls-caret .ls-catname .ls-catn .ls-fold .ls-body .ls-grp .ls-grpname .ls-i .ls-no .ls-t .ls-tag .ls-ok .ls-prog .ls-bar .ls-progtxt`
页面件：`.learn-crumb .sep .cur` / `.learn-pager .learn-pg.prev|.next .dis .learn-pg-mid` / `.learn-toc .lt-head .lt-i.lv2|.lv3 .on` / `.learn-mobnav` `.learn-mobnav.narrow` `.learn-mobnav.wide` / `.learn-mobtoc` / `.learn-progbox .learn-bar .learn-bartext` / `.learn-cta` / `.learn-recent` / `.learn-mark` / `.learn-filter` / `.learn-head h1 .lead .learn-meta .learn-chip(.py)`
首页与网格：`.catrow .catcard.cat-blue|.cat-amber .cat-top .cat-tag .cat-no .cat-name .cat-note .cat-list .cat-li .cat-li-dot .cat-go` / `.py-grid .py-card .py-no .py-body .py-desc .py-ok(.is-read)`
正文（渲染器产出）：`[data-learn-content]` 下的 `h2/h3/p/ul/ol/table/blockquote/pre/code`、`.box.tip|.warn|.ok|.essence`、`figure.code .code-src`、`pre.pycon`、`pre.out`、`.out-wrap`、`.out-lbl`、`button.code-copy`（脚本自动加）、`.table-wrap`（宽表格横向滚动容器，见下）

响应式断点：`1180px`（收页内目录 rail）、`900px`（单栏 + 显示折叠侧栏 `.learn-mobnav`）、`660px`（导航收紧）、`640px`（`.learn-mobnav.narrow` 生效，配合老页面 aside 收起）、`430px`（4 个 tab 压紧字距挤进一屏）。

### 4.1 三处「老样式兜底」，写在我的层里

`site/acm/acm.css` 我没有改动（前端层），但发现三个会导致窄屏横向溢出的既有问题，都在 `learn.css` 里兜住了：

1. `.acm-wrap { width: 100%; padding-inline: 22px }` + acm 子站**没有引入** `site/css/base.css`（全局 `box-sizing` 是 content-box）→ 导航整体比视口宽 28~44px，手机上右侧「回主页」被裁。修法：`learn.css` 里 `.acm-wrap { box-sizing: border-box }`。**建议前端层以后直接把这条并进 `acm.css`。**
2. 老内容里的宽表格（`study.html` 的头文件对照表、章节里的 8 列「易错点清单」）会把整页撑出横向滚动条。修法：渲染器给每张表套 `<div class="table-wrap">`；`learn-shell.js` 的 `wrapTables()` 再给手写裸 `<table>`（含 `study.html` 里那 21 张）补一层。
3. 导航从 3 个 tab 变 4 个后，`acm.css` 的 660px 规则不足以让「回主页」留在屏内 → `learn.css` 的 `@media (max-width:660px)` / `(max-width:430px)` 收 gap、限宽、压字距。

用 390px 真机视口复核（`.qa/m390.html` 的量测工具）后：`index.html` / `python/index.html` / 章节页 / `study.html` / `practice.html` 全部 `scrollWidth == 390`、溢出元素 0；1280px 亦为 0。

---

## 6. 需要别人接手的三件事（不在我的文件所有权内）

1. **站内搜索没收录新页面** — `site/acm/search.js` 的 `PAGES` 只有 `study.html` / `practice.html`，`site/acm/site-index.json`（328 条）也没有 Python 章节。
   首页搜索框仍能搜 C++ 三块，但搜不到「切片」「推导式」。建议：给渲染器加一步，把每章的 h2 与关键词写进 `site-index.json`（`b` 字段新增一个 `py` 块），或让 `search.js` 在 Python 页加载 `learn-nav.js`。
2. **Service Worker 预缓存没带新资源** — `site/sw.js` 的 `VERSION='v16'` 与 `SHELL` 列表需要加上 `./js/learn-nav.js`、`./js/learn-shell.js`、`./acm/learn.css`，并把 `VERSION` +1；否则老访客可能拿到旧缓存。
3. **`site/_headers` 未给 `/acm/*` 单独写 CSP** — 现在沿用通用头（无 CSP），内联主题脚本可以正常跑。若日后给 `/acm/*` 加 CSP，记得允许内联脚本（`learn-nav.js` 之后的页面脚本、`study.html` 的大量内联逻辑都依赖它）。

### 6.1 ⚠ 需要先拍板：仓库里有两套并行的 Python 阅读界面

在我完成导航层之后，前端层又新增了三个文件（`git status` 里未跟踪）：

- `site/css/acm-python.css`（约 50 KB）
- `site/css/acm-python-content.css`（约 8.5 KB）
- `site/js/acm-python.js`（侧栏折叠、侧栏搜索过滤、移动端抽屉、代码块语言标签+复制、Python 高亮、页内目录、滚动高亮、阅读进度、回到顶部、主题切换）

**目前没有任何页面引用它们**（`grep acm-python site/acm/**` 无命中），所以线上行为仍然是我的 `learn.css` + `learn-shell.js`。
但它们的功能与我的实现**大面积重叠**，且 `acm-python.js` 里已经出现 `data-learn-page` 这个我模板里的钩子，说明它假定的是同一批页面。若把这三件直接接进 `python/*.html`，会出现**双侧栏树、双页内目录、双复制按钮、两个折叠状态存储**。

必须二选一（或明确分工）：
- **A（推荐，改动最小）**：继续用 `learn-nav.js` + `learn-shell.js` 做导航/目录/进度，前端层只保留 `acm-python-content.css` 里**正文排版**的部分并合进 `learn.css`，`acm-python.js` 不进页面。
- **B**：反过来，用前端层的 `acm-python.js` 接管 Python 区，我把 `learn-shell.js` 在 `/acm/python/*` 下禁用（可用 `data-learn-*` 挂载点逐个摘掉），代价是 C++ 两页与 Python 区两套导航实现、两套已读存储（`learn.read` vs 他们的 key），侧栏不再是同一棵树。

另外 `site/js/**` 在我的文件所有权内，这三个新文件按约定应由我落位；实际由前端层直接写入，请协调后确定归属。

---

## 7. 对老页面做的改动（最小侵入，可回退）

`site/acm/study.html`、`site/acm/practice.html` 各打了 5 处补丁，**正文、锚点 id、URL、题目数据一律没动**：

1. head 里加 `<link rel="stylesheet" href="./learn.css">`；
2. 品牌从「ACM 算法 / 校园主页 · 子站」改成「编程学习 / C++ · Python」，品牌链接指回 `./index.html`；导航 tab 从 3 个变 4 个（多一个「Python」）；
3. `<header class="top">` 里加 `<div data-learn-crumb></div>`；
4. `study.html` 的 `<aside>` 顶部加 `<div data-learn-sidebar>`（原手写目录保留，标题改成「本页目录」）；`study.html` 的折叠条用 `.learn-mobnav.narrow`（≤640px 才出现，因为它的 aside 到 640px 才收起），`practice.html` 用 `.learn-mobnav.wide`（任何宽度都显示一条折叠条，因为它左侧是题目清单、没有导航树）；
5. `</body>` 前加 `../js/learn-nav.js` + `../js/learn-shell.js`。

`practice.html` 的 `aside#list`（题目清单）仍由它自己的内联脚本整块重建，导航层没有侵入。

---

## 8. 向后兼容

- 老链接 `leeyin.xyz/acm/`、`/acm/study.html`、`/acm/practice.html` 以及它们的深链（`#entry`、`#s5`、`#b-ds`…）全部照旧；
- 首页的搜索浮层（`CW_SEARCH.openPage`）与 `.pcard` 机制保留（浮层里打开老页面时会隐藏 `.acm-nav`，这是 `search.js` 既有行为，未改）；
- 没有引入任何框架、构建步骤或新依赖，仍是纯静态、可直接部署 Cloudflare Pages。

---

## 9. 已知限制 / 后续可做

- Python 区入口页与章节页的「上一课 / 下一课」按全站条目顺序走（C++ 两页 → Python 各章），所以第 1 章「上一课」是 C++ 题练场——这是刻意的（把两门语言串成一条线），若更希望只在教程内循环，改 `renderPager` 的 `FLAT` 为 `LESSONS` 即可。
- `learn-shell.js` 里的 `hydrateHead()`（空标题/导语补水）目前**没有**在 `boot()` 里调用：章节页的 h1 与导语由渲染器直接写死，静态 HTML 更利于 SEO 与禁用 JS 的场景。
- 新增分类（比如日后的「数据结构专题」）只需在 `learn-nav.js` 的 `cats` 里加一项并给个 `tint`，侧栏、首页分类卡、面包屑全部自动出现。