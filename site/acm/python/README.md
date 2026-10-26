# Python 语法教程 · 正文源文件说明

这个目录是《Python 语法教程》的**全部正文源文件**。26 章 + 1 篇导读，每章一份 Markdown，
每个示例都是一份真实可运行的 `.py` 文件，文中所有输出都由脚本跑出来、逐字节比对过。

```
site/acm/python/
├── 00-guide.md                     # 导读：路线图、环境准备、卡住怎么办
├── 01-environment-and-interpreter.md
├── ...
├── 26-common-pitfalls.md           # 正文（事实来源）
├── index.json                      # 章节索引数据（由脚本生成，勿手改）
├── examples/                       # 每个 `# 示例：examples/xx.py` 对应的真实脚本
│   ├── ch01_01_first.py
│   ├── ch01_02_main_guard.py
│   ├── pkgdemo/                    # 第 19 章用的示例包
│   └── ...
├── _build/                         # 校验与生成工具（不参与发布）
│   ├── verify.py                   # 核心：pycon 跑 doctest，脚本跑真实输出并比对
│   ├── sync.py                     # 把 examples 文件正文同步进 md 代码块
│   ├── fill.py                     # 用真实 stdout 覆盖 md 里的 ```text 输出块
│   └── gen_index.py                # 生成 index.json
├── _STYLE.md                       # 写作规范（骨架、密度、术语、禁写清单）
├── _render.py                      # md → 静态页 + 同步侧栏（站点侧维护，见下）
├── _template.html                  # 章节页骨架（站点侧维护）
└── NN-slug.html                    # 渲染产物，**不要手改**
```

## 一条命令校验全部内容

```bash
python site/acm/python/_build/verify.py          # 全部章节
python site/acm/python/_build/verify.py 03 18    # 只查第 3、18 章
```

退出码 `0` 才算通过。它做三件事：

| 检查项 | 规则 |
| --- | --- |
| ` ```pycon ` 块 | 拼成 doctest **真的执行**，逐条比对输出（`ELLIPSIS` + `NORMALIZE_WHITESPACE`） |
| ` ```python ` 块 | 首行必须是 `# 示例：examples/xxx.py`，且正文与该文件**逐字节一致** |
| 紧随其后的 ` ```text ` 块 | 真跑那个脚本，stdout **逐字节**比对 |

> **⚠️ 易错**：`pycon` 块每个块独立执行，**不共享命名空间**。上一块定义的类/变量，这一块要重新定义（或 `import`），否则 `NameError`。

## 写一章的四步

```bash
# 1. 写 examples/chNN_K_name.py（先写脚本、先跑通，再写正文）
# 2. 写 NN-english-slug.md：python 块只写一行标记，text 块留空
# 3. 三连
python site/acm/python/_build/sync.py  NN   # 标记 → 文件全文（逐字节一致）
python site/acm/python/_build/fill.py  NN   # 空 text 块 → 真实 stdout
python site/acm/python/_build/verify.py NN  # 校验；失败就只修 pycon
# 4. 章节稳定后刷新索引
python site/acm/python/_build/gen_index.py
```

`sync.py` 与 `fill.py` 是幂等的，重复跑不会破坏内容；`sync.py` 会跳过已经同步过的块。

## 正文骨架（详见 `_STYLE.md`）

```markdown
# NN · 中文标题

> **本质**：一句话讲清这一章的核心机制。

**读完这一章你能做到**

1. ……（4～6 条，每条都是可验收的行为）

## NN.1 小节标题
……
## NN.a 与 C++ 的差别      ← 表格，≥6 行
## NN.b 易错点清单         ← 表格：现象 / 原因 / 一行修复
## NN.c 练习               ← 基础×3 + 变式 + 挑战，每题带「验收：」
## NN.d 小结               ← 3 条，末句引出下一章
```

提示框用引用块表达，渲染器会转成站点已有的 `box tip/warn/ok`：

| Markdown | 渲染结果 |
| --- | --- |
| `> **💡 提示**：……` | `<div class="box tip">` |
| `> **⚠️ 易错**：……` | `<div class="box warn">` |
| `> **✅ 小结**：……` | `<div class="box ok">` |
| `> **本质**：……` | `<div class="box essence">` |

代码围栏语言与站点样式的对应：`pycon` → 交互式会话、`python`/`py` → Python 代码、
`text` → 程序输出、`bash`/`shell`/`powershell` → 终端、`json`、`html`。
`text` 块紧跟在 `python` 块后面时，渲染器会把两者配成一组"代码 + 输出"。

## index.json

由 `_build/gen_index.py` 从 Markdown 里读出来生成，**不要手改**。结构：

```json
{
  "v": 1,
  "generator": "_build/gen_index.py",
  "updated": "2026-10-26",
  "n": 27,
  "items": [
    {
      "no": 3,
      "slug": "variables-and-types",
      "title": "变量与数据类型",
      "essence": "Python 的变量不是装数据的盒子，而是**贴在对象上的名字**。……",
      "file": "03-variables-and-types.md",
      "url": "03-variables-and-types.html",
      "kind": "chapter",
      "sections": [{"id": "3.1", "title": "名字不是盒子"}, "…"],
      "stats": {"pycon": 11, "scripts": 6, "sections": 14}
    }
  ]
}
```

- `kind`：`chapter`（01～26）或 `guide`（00 导读）。
- `sections`：`## NN.x` 二级小节的编号与标题，可直接用作页内目录或搜索分组。
- `stats`：`pycon` 交互块数、`scripts` 脚本块数、`sections` 小节数——用来快速判断一章的密度是否达标。

## 已知限制（写正文时请避开）

1. **输出必须确定**。不许写死 `set` 的直接打印顺序（用 `sorted()`）、`id()`、内存地址、
   耗时数字、时间戳、线程交错顺序、绝对路径、未固定精度的浮点。`verify.py` 会在别的机器上失败。
2. **异常一律用 `try/except` 打印**（`print(type(e).__name__, e)`），不要贴 `Traceback (...)` 文本块——
   traceback 里含文件路径与行号，无法跨环境比对。
3. **不可运行的示意代码**用 ` ```text ` 包起来，或首行标 `# 片段`（`verify.py` 会跳过这些块）。
4. **本机 Python 3.10+**，示例在 CPython 3.14 实测；3.10/3.11/3.12 才有的特性要在正文里标版本。
5. **没有安装 `pytest`**。第 24 章的 pytest 示例放在 ` ```text ` 块里并注明 `pip install pytest`；
   能跑的示例一律用标准库 `unittest`。
6. 站点代码高亮对 `#` 行注释的着色取决于站点侧实现，正文不必为此改写示例。

## 与站点渲染的关系

`_render.py` 与 `_template.html` 由站点侧维护，负责：

1. 把每个 `NN-english-slug.md` 渲染成同名 `.html`（骨架来自 `_template.html`）；
2. 把章节标题、简介、顺序写进 `site/js/learn-nav.js` 的 `@chapters:begin` 区块。

因此：

- **要改正文，改 `.md`**；改完重新跑 `_render.py`，不要手改 `.html`（会被覆盖）。
- 新增一章后，跑一次 `python site/acm/python/_render.py` 才会出现在侧栏里。
- 本目录的正文写作**不依赖**渲染器内部实现；`verify.py` 只认 Markdown 与 `examples/`。

## 所有权与改动边界

写正文时只应在 `site/acm/python/**` 下新增/修改内容文件（`.md`、`examples/*.py`、`index.json`）。
站点的 HTML 骨架、`site/js/` 下的路由、`site/acm/*.css` 属于站点侧，改之前先确认归属。
本目录不提交 git 操作。