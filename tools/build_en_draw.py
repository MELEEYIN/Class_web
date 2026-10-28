# -*- coding: utf-8 -*-
"""
build_en_draw.py — 生成 site/en/draw.html（工程制图 · 课件对照版）

章节、节次按 320 页 PPT 课件原样排；每章四段：
  M1 节表 → M2 逐节知识点 → M3 规范速查（表）→ M4 易错点 → M5 例题
页面外壳与高数页共用（shell.css + ex.css + math.css），所以目录三级、搜索、遮住解答都直接可用。

用法：python tools/build_en_draw.py
"""
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from nav_shared import build_nav
from draw_data_a import CH as CH_A
from draw_data_b import CH as CH_B

CH = CH_A + CH_B
OUT = os.path.join(ROOT, "site", "en", "draw.html")

# 补充内容（图解 + 追加知识点）放在 tools/draw_extra/dN.json 里：
#   { "d1-s1": { "figs": [{"cap": "...", "alt": "...", "svg": "<g>...</g>", "box": "0 0 640 320"}],
#                "pts": [["标题", "说明"], ...], "note": "一句看图口诀" } }
# 与 draw_data_a/b.py 里的基础内容分开存放，重跑生成器不会丢。
EXTRA_DIR = os.path.join(HERE, "draw_extra")


def load_extra():
    ex = {}
    if os.path.isdir(EXTRA_DIR):
        for fn in sorted(os.listdir(EXTRA_DIR)):
            if fn.endswith(".json"):
                with io.open(os.path.join(EXTRA_DIR, fn), encoding="utf-8") as f:
                    ex.update(json.load(f))
    return ex


EX = load_extra()
N_FIG = sum(len(v.get("figs", [])) for v in EX.values())
N_ADD = sum(len(v.get("pts", [])) for v in EX.values())


def ch_extra(ch):
    """这一章的补充内容总数（图解 / 追加知识点）。"""
    figs = add = 0
    for i, _s in enumerate(ch["secs"]):
        e = EX.get("%s-s%d" % (ch["id"], i + 1), {})
        figs += len(e.get("figs", []))
        add += len(e.get("pts", []))
    return figs, add

N_SEC = sum(len(c["secs"]) for c in CH)
N_PT = sum(len(s[4]) for c in CH for s in c["secs"])
N_EX = sum(len(c["ex"]) for c in CH)


def esc(s):
    return s


# ----------------------------------------------------------------------
# 各模块
# ----------------------------------------------------------------------
def render_secs(ch):
    rows = "".join(
        '<tr><td><a href="#%s-s%d">%s</a><span class="pg">%s</span></td><td>%s</td><td>%s</td></tr>'
        % (ch["id"], i + 1, s[0], s[1], s[2], s[3])
        for i, s in enumerate(ch["secs"]))
    return ('<div class="mod" id="%s-m1"><h3><span class="mtag">M1</span>节与必会'
            '<span class="msub">课件原节次 · 这一节必须会什么</span></h3>'
            '<table class="sectbl"><colgroup><col style="width:28%%"><col style="width:40%%">'
            '<col style="width:32%%"></colgroup>'
            '<thead><tr><th>节（页码）</th><th>必须会</th><th>怎么考</th></tr></thead>'
            '<tbody>%s</tbody></table></div>' % (ch["id"], rows))


def render_points(ch):
    out = []
    figno = 0
    for i, s in enumerate(ch["secs"]):
        key = "%s-s%d" % (ch["id"], i + 1)
        e = EX.get(key, {})
        pts = s[4]
        add = e.get("pts", [])
        items = "".join('<li id="%s-p%d"><b>%s</b><span class="kd">%s</span></li>'
                        % (key, j + 1, t, d) for j, (t, d) in enumerate(pts))
        items += "".join('<li id="%s-x%d" class="add"><b>%s</b><span class="kd">%s</span></li>'
                         % (key, j + 1, t, d) for j, (t, d) in enumerate(add))
        figs = []
        for f in e.get("figs", []):
            figno += 1
            figs.append(
                '<figure class="fig dfig">'
                '<svg class="figsvg" viewBox="%s" role="img" aria-label="%s">%s</svg>'
                '<figcaption><b>图 %d-%d</b>%s</figcaption></figure>'
                % (f.get("box", "0 0 640 320"), f.get("alt", s[0]), f["svg"],
                   ch["no"], figno, f["cap"]))
        figh = ('<div class="figset">%s</div>' % "".join(figs)) if figs else ""
        note = e.get("note", "")
        noteh = ('<p class="fig-note"><b>看图口诀　</b>%s</p>' % note) if note else ""
        out.append('<div class="sect-h" id="%s">%s<span class="pgx">%s · %d 条</span></div>%s'
                   '<ol class="kpt">%s</ol>%s'
                   % (key, s[0], s[1], len(pts) + len(add), figh, items, noteh))
    return ('<div class="mod" id="%s-m2"><h3><span class="mtag">M2</span>逐节知识点与图解'
            '<span class="msub">按课件节次展开 · 规范 / 画法 / 判断 · 每节配图</span></h3>%s</div>'
            % (ch["id"], "".join(out)))


def render_tables(ch):
    out = []
    for name, rows in ch["tables"]:
        trs = "".join("<tr><td class=\"p\">%s</td><td>%s</td></tr>" % (a, b) for a, b in rows)
        out.append('<div class="sect-h">%s</div><table><colgroup><col style="width:24%%">'
                   '<col style="width:76%%"></colgroup>'
                   '<thead><tr><th>项目</th><th>内容 / 规定</th></tr></thead><tbody>%s</tbody></table>'
                   % (name, trs))
    return ('<div class="mod" id="%s-m3"><h3><span class="mtag">M3</span>规范速查'
            '<span class="msub">考前扫一遍就够</span></h3>%s</div>' % (ch["id"], "".join(out)))


def render_traps(ch):
    pits = "".join("<li>%s</li>" % p for p in ch["pits"])
    return ('<div class="mod" id="%s-m4"><h3><span class="mtag">M4</span>易错点'
            '<span class="msub">扣分常从这里开始</span></h3><ul class="pit">%s</ul></div>'
            % (ch["id"], pits))


def render_examples(ch):
    blocks = []
    for i, (q, sol, tip) in enumerate(ch["ex"]):
        blocks.append(
            '<div class="eg">'
            '<div class="eg-h"><span class="eg-n">例 %d</span><b>题目</b>'
            '<button class="chip act" type="button" data-veil>遮住解答</button></div>'
            '<p class="eg-q">%s</p>'
            '<div class="eg-s"><b>解　</b>%s</div>'
            '<p class="eg-t">%s</p></div>' % (i + 1, q, sol, tip))
    return ('<div class="mod" id="%s-m5"><h3><span class="mtag">M5</span>例题'
            '<span class="msub">先盖住解自己做</span></h3>%s</div>' % (ch["id"], "".join(blocks)))


def render_ch(ch):
    n = ch["no"]
    body = (render_secs(ch) + render_points(ch) + render_tables(ch) +
            render_traps(ch) + render_examples(ch))
    head = (
        '<section class="unit" id="' + ch["id"] + '" data-unit="' + str(n) +
        '" data-title="' + ch["title"] + '">\n'
        '  <div class="uhead">\n'
        '    <div class="uno">' + ("%02d" % n) + '</div>\n'
        '    <div class="ut">\n'
        '      <h2 class="u2t">' + ch["title"] + '<span class="uzh">第 ' + str(n) + ' 章</span></h2>\n'
        '      <p class="usub">课件 ' + ch["pages"] + '　·　' + str(len(ch["secs"])) +
        ' 节　·　' + str(sum(len(s[4]) for s in ch["secs"]) + ch_extra(ch)[1]) + ' 条知识点　·　' +
        str(len(ch["ex"])) + ' 道例题　·　' + str(ch_extra(ch)[0]) + ' 张图解</p>\n'
        '    </div>\n'
        '    <div class="ubadges">\n'
        '      <span class="verdict off">课件口径</span>\n'
        '      <button class="btn-done" type="button" data-unit="' + ch["id"] + '">标记已学</button>\n'
        '    </div>\n'
        '  </div>\n'
        '  <p class="lead">' + ch["lead"] + '</p>\n'
    )
    return head + body + "\n</section>"


for _c in CH:
    _c["id"] = "d%d" % _c["no"]

HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>工程制图 · 课件对照版</title>
<meta name="description" content="按 320 页《工程制图》课件整理的工程制图学习页：九章 33 节，逐节给知识点、规范速查、易错点与例题。">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
@@ICON@@
<script src="../js/boot.js"></script>
<link rel="stylesheet" href="../acm/assets/shell.css">
<link rel="stylesheet" href="../acm/assets/content.css">
<link rel="stylesheet" href="./ex.css">
<link rel="stylesheet" href="./math.css">
</head>
<body data-book="draw">
<div class="app">
  <aside class="side" id="side">
    <div class="side-top">
      <a class="brand" href="./index.html">
        <span class="brand-mark is-mark" aria-hidden="true">@@GLYPH@@</span>
        <span class="brand-txt"><b>课程学习站</b><small>高数 · 英语 · 制图</small></span>
      </a>
      <button class="side-x" id="sideX" type="button" aria-label="收起侧栏">✕</button>
    </div>
    <div class="side-search">
      @@SEARCH@@
      <input id="sideSearch" type="search" placeholder="搜章节、规范、画法…" autocomplete="off" aria-label="搜索">
      <kbd>Ctrl K</kbd>
    </div>
    @@NAV@@
    <div class="side-foot">
      <div class="pg-t"><span>制图进度</span><b id="pgNum">0 / 9</b></div>
      <div class="pg-bar"><i id="pgBar"></i></div>
      <div class="side-tools"><a class="mini-btn" href="./index.html">总览</a></div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="./index.html">课程学习站</a><span class="sep">/</span><span class="cur">工程制图</span></div>
      <div class="top-r">
        <a class="top-btn home-btn" href="../index.html" title="回到网站主页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6 12 4l8 6.6"/><path d="M6.4 9.4V19a1 1 0 0 0 1 1h3.1v-4.6h3v4.6h3.1a1 1 0 0 0 1-1V9.4"/></svg><span class="tl">返回主页</span></a>
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色">@@THEME@@<span class="tl">浅色</span></button>
        <a class="top-btn" href="./math.html"><span class="tl">高等数学</span></a>
        <a class="top-btn" href="./b1.html"><span class="tl">大学英语</span></a>
      </div>
    </header>

    <button class="to-top" id="toTop" type="button" aria-label="回到顶部" title="回到顶部">@@TOPHAT@@</button>

    <div class="scroll" id="scroll">
      <div class="readbar"><i id="readBar"></i></div>
      <div class="view">
        <div class="stage">
          <article class="doc doc-study" id="doc">
            <header class="doc-head">
              <div class="eyebrow">课程学习站 · 工程制图</div>
              <h1>工程制图<span class="hno">9 章</span></h1>
              <p class="lede">按《工程制图》课件（320 页）的章、节顺序整理：九章 33 节。每章四段——先用「节表」看清这一节必须会什么、平常怎么考，再按节把规范、画法、判断要点写成人能直接背的句子，然后是规范速查表、易错点，最后是例题。判断题和作图题的分都在 M2 与 M4 里。</p>
              <div class="chips">
                <span class="chipk"><b>9</b> 章</span>
                <span class="chipk"><b>@@NSEC@@</b> 节</span>
                <span class="chipk"><b>@@NPT@@</b> 条知识点</span>
                <span class="chipk"><b>@@NFIG@@</b> 张图解</span>
                <span class="chipk lv"><b>@@NEX@@</b> 道例题</span>
              </div>
            </header>

            <div class="docbody">
              <div class="callout ok">
                <p><b>怎么用这一页</b></p>
                <p>① 先看 M1 节表，知道这一章有几节、每节考什么；② M2 按节读，画法类的内容（圆弧连接、相贯线、剖视）建议拿纸跟着画一遍；③ M3 的规范表是判断题的题库，考前扫一遍；④ M4 的每条都对应一个具体扣分点；⑤ M5 例题先遮住解答自己做。</p>
                <p>章节与页码取自《工程制图》课件（刘小年、刘国庆主编）共 320 页；知识点按课件正文整理，措辞做了压缩。</p>
              </div>
@@CHAPTERS@@
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


def main():
    # 复用高数页的图标与品牌字形
    math = io.open(os.path.join(ROOT, "site", "en", "math.html"), encoding="utf-8").read()
    icon = math[math.index('<link rel="icon"'):]
    icon = icon[:icon.index(">") + 1]
    g0 = math.index('<span class="brand-mark is-mark"')
    g1 = math.index("</span>", math.index("</svg>", g0)) + 7
    glyph = math[math.index(">", g0) + 1:g1 - 7]

    page = (HEAD.replace("@@ICON@@", icon)
                .replace("@@GLYPH@@", glyph)
                .replace("@@SEARCH@@", SEARCH)
                .replace("@@THEME@@", THEME)
                .replace("@@TOPHAT@@", TOPHAT)
                .replace("@@NAV@@", build_nav("./b1.html", "draw"))
                .replace("@@CHAPTERS@@", "\n".join(render_ch(c) for c in CH))
                .replace("@@NSEC@@", str(N_SEC))
                .replace("@@NPT@@", str(N_PT + N_ADD))
                .replace("@@NEX@@", str(N_EX))
                .replace("@@NFIG@@", str(N_FIG)))
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("chapters", len(CH), "secs", N_SEC, "points", N_PT, "+", N_ADD, "figs", N_FIG, "examples", N_EX)
    print("written:", OUT, len(page))


if __name__ == "__main__":
    main()
