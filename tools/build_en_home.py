# -*- coding: utf-8 -*-
"""
build_en_home.py — 生成 site/en/index.html（课程学习站首页）

为什么重写：旧页是「顶部横向导航 + 两栏正文」的老外壳，宽度和 acm 子站对不上。
现在统一成 acm 的全屏外壳（侧栏 + 顶栏 + 右侧目录），首页直接用 acm 首页那套组件
（.hero / .hero-stats / .sec-t / .paths / .mods / .home-foot），尺寸自然一致。

内容来源：旧页正文（tools/legacy/en-index.html）里的三步学习法、六个模块、
24 个单元矩阵与数据源说明，逐段搬过来，只换外壳与组件。

用法：python tools/build_en_home.py
"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nav_shared import build_nav
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site", "en")
LEGACY = os.path.join(ROOT, "tools", "legacy", "en-index.html")
OUT = os.path.join(SITE, "index.html")

src = io.open(LEGACY, encoding="utf-8").read()


def squeeze(t):
    return re.sub(r"\s+", " ", t).strip()


# ----------------------------------------------------------------------
# 1. 从旧页取数据
# ----------------------------------------------------------------------
def parse_books():
    books = []
    for m in re.finditer(r'<div class="book" id="(b\d)"><div class="bn">(.*?)</div>'
                         r'<h3>(.*?)</h3><p>(.*?)</p>', src, re.S):
        bid, tag, title, desc = m.groups()
        books.append(dict(id=bid, tag=squeeze(tag), title=squeeze(title),
                          desc=squeeze(desc), units=[]))
    # 单元：按出现顺序分给对应册
    cur = -1
    for m in re.finditer(r'<div class="book" id="b\d"|<a class="uw" href="([^"]+)"><b>(.*?)</b><span>(.*?)</span></a>', src):
        if m.group(0).startswith('<div class="book'):
            cur += 1
        elif cur >= 0:
            books[cur]["units"].append(dict(href=m.group(1), en=squeeze(m.group(2)),
                                            zh=squeeze(m.group(3))))
    return books


def parse_steps():
    out = []
    for m in re.finditer(r'<div class="step"><span class="n">(\d)</span><b>(.*?)</b><span>(.*?)</span></div>', src, re.S):
        out.append((m.group(1), squeeze(m.group(2)), squeeze(m.group(3))))
    return out


def parse_modules():
    out = []
    for m in re.finditer(r'<div class="ml"><b><i>(M\d)</i>(.*?)</b><span>(.*?)</span></div>', src, re.S):
        out.append((m.group(1), squeeze(m.group(2)), squeeze(m.group(3))))
    return out


def parse_src_block():
    i = src.find('<div class="callout ok">', src.find('id="src"'))
    j = src.find("</main>", i)
    block = src[i:j]
    block = block.replace('<div class="callout warn">', '<div class="callout">')
    # 表格第一列被长 URL 挤成一字一行：加 colgroup + 专用类，交给 ex.css 控宽
    block = block.replace(
        "<table><thead><tr><th>数据源</th><th>说明</th></tr></thead><tbody>",
        '<table class="srctbl"><colgroup><col style="width:26%"><col style="width:74%"></colgroup>'
        "<thead><tr><th>数据源</th><th>说明</th></tr></thead><tbody>")
    return block.strip()


BOOKS = parse_books()

# 旧页里第 1 册 Unit 2 的课文名是「People and Relationships」，按 WE Learn 已更正为
# Understanding Relationships（见 b1.html 的「一处更正」），这里同步过去
for _b in BOOKS:
    if _b["id"] == "b1":
        for _u in _b["units"]:
            if "People and Relationships" in _u["en"]:
                _u["en"] = _u["en"].replace("People and Relationships", "Understanding Relationships")
                _u["zh"] = "理解人际关系"
STEPS = parse_steps()
MODULES = parse_modules()
SRCBLOCK = parse_src_block()

UNIT_TOTAL = sum(len(b["units"]) for b in BOOKS)

# ----------------------------------------------------------------------
# 2. 渲染片段
# ----------------------------------------------------------------------
def render_books():
    out = []
    for b in BOOKS:
        tiles = "".join(
            '<a class="ug" href="%s"><b>%s</b><span>%s</span></a>' % (u["href"], u["en"], u["zh"])
            for u in b["units"])
        out.append(
            '<div class="book" id="%s">'
            '<div class="bn">%s</div>'
            '<h3>%s</h3>'
            '<p>%s</p>'
            '<div class="ugrid">%s</div>'
            '<a class="enter" href="./%s.html">进入本册 →</a>'
            '</div>' % (b["id"], b["tag"], b["title"], b["desc"], tiles, b["id"]))
    return "".join(out)


def render_steps():
    out = []
    for n, title, desc in STEPS:
        out.append('<div class="path"><span class="pk">STEP %s</span><b>%s</b><p>%s</p></div>'
                   % (n, title, desc))
    return "".join(out)


def render_modules():
    out = []
    for tag, name, desc in MODULES:
        out.append('<a class="mod-c" href="./b1.html#u1">'
                   '<div class="mt"><b>%s</b><em>%s</em></div>'
                   '<div class="md">%s</div></a>' % (name, tag, desc))
    return "".join(out)


HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>课程学习站 · 高等数学 13 章 + 大学英语 24 单元</title>
<meta name="description" content="课程学习站：高等数学（按宋浩讲义 13 章 75 节整理，含节表、核心公式、易错点）与大学英语（领航大学英语四册 24 单元，第 1 册课内习题已按 WE Learn 任务链重排）。">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%234d8dff'/%3E%3Ctext x='32' y='46' font-family='system-ui,sans-serif' font-size='30' font-weight='700' fill='%23041020' text-anchor='middle'%3E%E5%AD%A6%3C/text%3E%3C/svg%3E">
<script src="../js/boot.js"></script>
<link rel="stylesheet" href="../acm/assets/shell.css">
<link rel="stylesheet" href="../acm/assets/content.css">
<link rel="stylesheet" href="./ex.css">
</head>
<body data-book="home">
<div class="app">
  <aside class="side" id="side">
    <div class="side-top">
      <a class="brand" href="./index.html">
        <span class="brand-mark">学</span>
        <span class="brand-txt"><b>课程学习站</b><small>高等数学 · 大学英语</small></span>
      </a>
      <button class="side-x" id="sideX" type="button" aria-label="收起侧栏">✕</button>
    </div>
    <div class="side-search">
      @@SEARCH@@
      <input id="sideSearch" type="search" placeholder="搜课程、册次、单元…" autocomplete="off" aria-label="搜索">
      <kbd>Ctrl K</kbd>
    </div>
    @@NAV@@
    <div class="side-foot">
      <div class="pg-t"><span>内容规模</span><b>13 章 · 24 单元</b></div>
      <div class="side-tools">
        <a class="mini-btn" href="./math.html">高等数学</a>
        <a class="mini-btn" href="./b1.html">大学英语</a>
      </div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="../index.html">校园主页</a><span class="sep">/</span><span class="cur">课程学习站</span></div>
      <div class="top-r">
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色">@@THEME@@<span class="tl">浅色</span></button>
        <a class="top-btn" href="./math.html"><span class="tl">高等数学</span></a>
        <a class="top-btn" href="./b1.html"><span class="tl">第 1 册</span></a>
      </div>
    </header>

    <button class="to-top" id="toTop" type="button" aria-label="回到顶部" title="回到顶部">@@TOPHAT@@</button>

    <div class="scroll" id="scroll">
      <div class="readbar"><i id="readBar"></i></div>
      <div class="view">
        <div class="stage">
          <article class="doc doc-study" id="doc">

            <header class="hero">
              <div class="eyebrow">Campus · 课程学习子站</div>
              <h1>两门课，<span>一套外壳</span></h1>
              <p>高等数学负责「把公式背到能默写、把易错点变成不丢分」；大学英语负责「按平台任务链做完整单元的题」。两侧共用一套目录、一套检索、一套深浅色，换课不用重新找路。</p>
              <div class="hero-stats">
                <div><b>2</b><span>门课</span></div>
                <div><b>@@UNITS@@</b><span>英语单元</span></div>
                <div><b>13</b><span>高数章</span></div>
                <div><b>75</b><span>高数节</span></div>
              </div>
            </header>

            <div class="sec-t"><h2 id="entry">从哪进</h2><em>两门课，三条主线</em></div>
            <div class="paths">
              <a class="path" href="./math.html">
                <span class="pk">高等数学 · 13 章 75 节</span>
                <b>按讲义章节推进</b>
                <p>上册 7 章、下册 6 章，节次与页码照《宋浩高等数学讲义》。每章三层：节表（必会 / 怎么考）→ 核心公式 → 易错点与综合提高题型。</p>
                <span class="go">打开高等数学 →</span>
              </a>
              <a class="path" href="./b1.html">
                <span class="pk">大学英语 · 第 1 册</span>
                <b>课内习题对齐版</b>
                <p>六个单元的课内习题按 WE Learn 真实任务链重排，Translation 六组题面与参考译文按教材录入，配逐句结构对照与逐题解析。</p>
                <span class="go">打开第 1 册 →</span>
              </a>
              <a class="path" href="#books">
                <span class="pk">大学英语 · 四册</span>
                <b>24 个单元全览</b>
                <p>每册 6 个单元、每单元固定 6 个模块（M1–M6）。这里能看到四册的单元名与话题，点进去直接落在对应单元。</p>
                <span class="go">看四册清单 →</span>
              </a>
            </div>

            <div class="sec-t"><h2 id="how">三步学习法</h2><em>一个英语单元分三次、每次半小时</em></div>
            <div class="paths">@@STEPS@@</div>
            <div class="callout"><p><b>一句话原则：</b>单元里的 6 个模块是「清单」，不是「课文」。哪一项薄弱就点哪一项，不用按顺序。M6 的自测清单如果四条都打不上勾，说明前面三个模块白看了，回头补。</p></div>

            <div class="sec-t"><h2 id="modules">每个单元里的 6 个学习模块</h2><em>四册 24 个单元结构完全一致</em></div>
            <div class="mods">@@MODULES@@</div>
            <div class="callout ok">
              <p><b>模块下面还挂着一层「课内例题精讲」</b> —— 教材里每一道课内练习（Use of Language 的选词填空 / 短语填空 / 句型转换、WE Learn Task、段落翻译、写作规划）都配了<b>逐题答案与解析</b>，解析里写清考的语法点、固定搭配，以及容易混的近义词辨析。</p>
              <p>每组例题右上角有<b>「遮住解析自测」</b>：先点它把解析盖住，做完再显示对答案 —— 这比直接读解析有用得多。</p>
              <p>标记说明：<span class="exk off">教材原题</span> = 题目来自教材或课内练习，逐字录入；<span class="exk self">自编</span> = 该单元的原题还没拿到，先按同样的题型与考点自编一套顶上。</p>
            </div>

            <div class="sec-t"><h2 id="books">四册 · @@UNITS@@ 个单元</h2><em>点单元直接落到对应册页的锚点</em></div>
            <div class="books">@@BOOKS@@</div>

            <div class="sec-t"><h2 id="src">这些内容从哪来</h2><em>哪些是官方口径，哪些是按话题补的</em></div>
            @@SRCBLOCK@@

            <div class="home-foot">
              <span>© 2026 校园主页 · 课程学习站 · 纯静态页面，不收集任何数据</span>
              <span>高等数学：章节与页码取自《宋浩高等数学讲义》上下册 · 大学英语：按《领航大学英语·综合教程》四册编排</span>
              <span>教材课文原文与官方练习不在站内（版权归外教社），请配合纸质教材与 WE Learn 平台使用。</span>
            </div>

          </article>
        </div>
        <aside class="rail" id="rail">
          <div class="rail-in">
            <div class="rail-t">本页目录</div>
            <nav id="tocList"></nav>
          </div>
        </aside>
      </div>
    </div>
  </div>
</div>
<div class="mask"></div>
<script src="./skin.js"></script>
<script src="./en.js"></script>
</body>
</html>
"""

CHEV = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>')
SEARCH = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
          'stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>')
THEME = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
         'stroke-linecap="round" stroke-linejoin="round">'
         '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'
         '<circle cx="12" cy="12" r="3.6"/></svg>')
TOPHAT = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          'stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>')

MATH_CH = [(1, "函数与极限"), (2, "导数与微分"), (3, "中值定理与导数应用"),
           (4, "不定积分"), (5, "定积分"), (6, "定积分的应用"), (7, "微分方程"),
           (8, "向量代数与空间解析几何"), (9, "多元函数微分法"),
           (10, "重积分"), (11, "曲线积分"), (12, "曲面积分"), (13, "无穷级数")]


def math_nav(items):
    return "".join('<a class="nv-i" href="./math.html#m%d"><span class="no">%02d</span>'
                   '<span class="tt">%s</span></a>' % (n, n, t) for n, t in items)


def main():
    page = (HEAD.replace("@@NAV@@", build_nav("./b1.html", "math"))
                .replace("@@SEARCH@@", SEARCH)
                .replace("@@CHEV@@", CHEV)
                .replace("@@THEME@@", THEME)
                .replace("@@TOPHAT@@", TOPHAT)
                .replace("@@MATHUP@@", math_nav(MATH_CH[:7]))
                .replace("@@MATHDN@@", math_nav(MATH_CH[7:]))
                .replace("@@STEPS@@", render_steps())
                .replace("@@MODULES@@", render_modules())
                .replace("@@BOOKS@@", render_books())
                .replace("@@SRCBLOCK@@", SRCBLOCK)
                .replace("@@UNITS@@", str(UNIT_TOTAL)))
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("books:", [(b["id"], len(b["units"])) for b in BOOKS])
    print("steps:", len(STEPS), "modules:", len(MODULES))
    print("written:", OUT, len(page), "chars")


if __name__ == "__main__":
    main()
