# -*- coding: utf-8 -*-
"""build_en_drill.py — 生成四级/六级专项练习页（cet4-drill.html / cet6-drill.html）

从整套真题里按题型抽出样本：选词填空、段落匹配、仔细阅读、翻译、写作，
每类 2 套；答案与解析取解析册的对应 Section / Part，折叠在题后。
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_en_cet4_papers as P
from nav_shared import build_nav

ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site", "en")

LEVELS = [
    dict(key="cet4", name="四级", data="cet4_full.json", sol="cet4_solutions.json",
         samples=["2025-12-1", "2024-12-1"], subtitle="CET-4 · 专项练习"),
    dict(key="cet6", name="六级", data="cet6_full.json", sol="cet6_solutions.json",
         samples=["2025-12-1", "2024-12-1"], subtitle="CET-6 · 专项练习"),
]

EXTRA_CSS = """
<style>
.drill { margin: 14px 0 22px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.drill .src { display: inline-block; margin-bottom: 8px; padding: 2px 8px; border-radius: 6px;
  background: rgb(var(--accent-rgb) / .12); color: var(--accent); font-size: 11.6px; font-weight: 600; }
.drill .wcard { margin: 0 0 10px; }
</style>
"""

HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%%TITLE%% · 课程学习站</title>
<meta name="description" content="%%DESC%%">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
<script src="../js/boot.js"></script>
<link rel="stylesheet" href="../acm/assets/shell.css">
<link rel="stylesheet" href="../acm/assets/content.css">
<link rel="stylesheet" href="./ex.css">
%%CSS%%
%%EXTRA%%
</head>
<body data-book="%%BOOK%%">
<div class="app">
  <aside class="side" id="side">
    <div class="side-top">
      <a class="brand" href="./index.html">
        <span class="brand-mark is-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5c-1.75-1.3-3.5-1.85-5.3-1.65a.95.95 0 0 0-.85.95v9.9c0 .62.53 1.09 1.15 1.02 1.55-.16 3.1.28 4.45 1.24.32.23.74.23 1.06 0 1.35-.96 2.9-1.4 4.45-1.24.62.07 1.15-.4 1.15-1.02 V5.8a.95.95 0 0 0-.85-.95c-1.8-.2-3.55.35-5.3 1.65z" fill="currentColor" fill-opacity=".96"/><path d="M12 7.7v9.4" stroke="rgba(20,40,90,.45)" stroke-width="1" stroke-linecap="round"/></svg></span>
        <span class="brand-txt"><b>课程学习站</b><small>高数 · 英语 · 四六级 · 制图</small></span>
      </a>
      <button class="side-x" id="sideX" type="button" aria-label="收起侧栏">✕</button>
    </div>
    <div class="side-search">
      %%SEARCH%%
      <input id="sideSearch" type="search" placeholder="搜专项、题干…" autocomplete="off" aria-label="搜索">
      <kbd>Ctrl K</kbd>
    </div>
    %%NAV%%
    <div class="side-foot">
      <div class="pg-t"><span>专项</span><b>5 类 · 各 2 套</b></div>
      <div class="side-tools">
        <a class="mini-btn" href="./%%HOME%%">%%NAME%%专区</a>
        <a class="mini-btn" href="./b1.html">大学英语</a>
      </div>
    </div>
  </aside>
  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="../index.html">校园主页</a><span class="sep">/</span><a href="./index.html">课程学习站</a><span class="sep">/</span><a href="./%%HOME%%">%%NAME%%专区</a><span class="sep">/</span><span class="cur">专项练习</span></div>
      <div class="top-r">
        <a class="top-btn home-btn" href="../index.html" title="回到网站主页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6 12 4l8 6.6"/><path d="M6.4 9.4V19a1 1 0 0 0 1 1h3.1v-4.6h3v4.6h3.1a1 1 0 0 0 1-1V9.4"/></svg><span class="tl">返回主页</span></a>
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色">%%THEME%%<span class="tl">浅色</span></button>
        <a class="top-btn" href="./%%HOME%%"><span class="tl">%%NAME%%专区</span></a>
      </div>
    </header>
    <button class="to-top" id="toTop" type="button" aria-label="回到顶部" title="回到顶部">%%TOPHAT%%</button>
    <div class="scroll" id="scroll">
      <div class="readbar"><i id="readBar"></i></div>
      <div class="view">
        <div class="stage">
          <article class="doc doc-study" id="doc">
%%BODY%%
          </article>
        </div>
        <aside class="rail" id="rail">
          <div class="rail-in"><div class="rail-t">本页目录</div><nav id="tocList"></nav></div>
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


def load(name):
    return json.load(io.open(os.path.join(HERE, "data", name), encoding="utf-8"))


def sec_of(text, letter):
    m = re.search(r"Section\s*%s\b" % letter, text)
    if not m:
        return ""
    rest = text[m.end():]
    n = re.search(r"Section\s*[ABC4]\b|Part\s*[IVX]+\b", rest)
    end = m.end() + (n.start() if n else len(rest))
    return text[m.start():end].strip()


def sol_sec(text, letter):
    """解析册 OCR 常把 Section A 识别成 Sectionl / Section[囚，按出现顺序取前三处。"""
    if not text:
        return ""
    idx = {"A": 0, "B": 1, "C": 2}[letter]
    pos = [m.start() for m in re.finditer(r"Section\s*\S{0,4}", text)]
    if len(pos) <= idx:
        return text
    start = pos[idx]
    end = pos[idx + 1] if idx + 1 < len(pos) else len(text)
    return text[start:end]


def render_sol(txt):
    if not txt:
        return '<div class="callout"><p>这一道没有匹配到解析册段落，请查看解析册原文。</p></div>'
    body = []
    for kind, val in P.sol_blocks(txt):
        if kind == "h":
            body.append('<h5 class="solh">%s</h5>' % P.esc(val))
        elif kind == "qh":
            body.append('<h6 class="solq">%s</h6>' % P.esc(val))
        else:
            body.append('<p class="%s">%s</p>' % (kind, P.esc(val)))
    return '<div class="solbody">%s</div>' % "".join(body)


def sample_block(paper, sol, kind):
    label = "%s · 第 %d 套" % (paper["label"], paper["set"])
    if kind == "bank":
        q = P.render_reading(sec_of(paper["reading"], "A"))
        a = sol_sec(sol.get("reading", ""), "A")
        src = label + " · Section A 选词填空"
    elif kind == "match":
        q = P.render_reading(sec_of(paper["reading"], "B"))
        a = sol_sec(sol.get("reading", ""), "B")
        src = label + " · Section B 段落匹配"
    elif kind == "careful":
        q = P.render_reading(sec_of(paper["reading"], "C"))
        a = sol_sec(sol.get("reading", ""), "C")
        src = label + " · Section C 仔细阅读"
    elif kind == "translation":
        q = '<div class="wcard"><div class="wtag">Translation</div><p>%s</p></div>' % P.esc(paper["translation"])
        a = sol.get("translation", "")
        src = label + " · 汉译英"
    else:
        q = '<div class="wcard"><div class="wtag">Writing</div><p>%s</p></div>' % P.esc(paper["writing"])
        a = sol.get("writing", "")
        src = label + " · 写作"
    if not q or len(q) < 30:
        return ""
    return ('<article class="drill"><div class="src">%s</div>%s'
            '<details class="solbox"><summary>答案与解析</summary>%s</details></article>'
            % (P.esc(src), q, render_sol(a)))


def build(level):
    full = load(level["data"])
    sols = load(level["sol"])["papers"]
    papers = {p["id"]: p for p in full["papers"]}
    body = []
    body.append('<header class="hero"><div class="eyebrow">%s</div>'
                '<h1>五个专项，<span>各两道真题</span></h1>'
                '<p>从最近两次考试的整卷里各抽一套：选词填空、段落匹配、仔细阅读、翻译、写作。'
                '每道题下面折叠着解析册的答案与讲解；先自己做，再展开对答案。</p>'
                '<div class="hero-stats"><div><b>5</b><span>类专项</span></div>'
                '<div><b>10</b><span>组练习</span></div>'
                '<div><b>25</b><span>题听力（整卷）</span></div>'
                '<div><b>2</b><span>次考试样本</span></div></div></header>' % P.esc(level["subtitle"]))

    sections = [
        ("bank", "专项一 · 选词填空", "先标词性，再按空缺的语法位置选；每题 10 空，词库 15 选 10。"),
        ("match", "专项二 · 段落匹配", "先读题干圈关键词，再扫段落首尾句；一段可能对应多题，也可能不用。"),
        ("careful", "专项三 · 仔细阅读", "两篇各 5 题，顺序出题；先定位再比对选项，注意同义替换。"),
        ("translation", "专项四 · 翻译", "先拆句、定主谓，再补修饰；先写自己的版本，再展开参考译文。"),
        ("writing", "专项五 · 写作", "先抄题干给的句子（六级必须抄），再列两个理由；对照范文看结构与用词。"),
    ]
    for kind, title, desc in sections:
        blocks = []
        for pid in level["samples"]:
            p = papers.get(pid)
            if not p:
                continue
            b = sample_block(p, sols.get(pid, {}), kind)
            if b:
                blocks.append(b)
        if not blocks:
            continue
        body.append('<div class="sec-t"><h2 id="%s">%s</h2><em>%d 组 · 来自整卷真题</em></div>'
                    % (kind, P.esc(title), len(blocks)))
        body.append('<p class="meta">%s</p>' % P.esc(desc))
        body.append("".join(blocks))

    body.append('<div class="callout ok"><p><b>怎么用：</b>每类先做第 1 组，限时（选词 10 分钟、匹配 12 分钟、'
                '仔细阅读 18 分钟、翻译 10 分钟、写作 30 分钟），做完再展开解析；第 2 组隔一天做，'
                '对比两次错的地方是不是同一类（词性、定位、长难句）。</p></div>')
    body.append('<div class="home-foot"><span>© 2026 校园主页 · 课程学习站 · 纯静态页面，不收集任何数据</span>'
                '<span>题目来自原卷，解析来自解析册（扫描件 OCR，英文可能有识别错字）</span></div>')

    page = (HEAD.replace("%%TITLE%%", P.esc(level["name"] + "专项练习"))
                .replace("%%DESC%%", P.esc(level["name"] + "专项练习：选词填空、段落匹配、仔细阅读、翻译、写作，各两道真题带答案解析"))
                .replace("%%CSS%%", P.CSS)
                .replace("%%EXTRA%%", EXTRA_CSS)
                .replace("%%BOOK%%", level["key"])
                .replace("%%NAV%%", build_nav("./b1.html", level["key"]))
                .replace("%%SEARCH%%", P.SEARCH)
                .replace("%%THEME%%", P.THEME)
                .replace("%%TOPHAT%%", P.TOPHAT)
                .replace("%%HOME%%", level["key"] + ".html")
                .replace("%%NAME%%", P.esc(level["name"]))
                .replace("%%BODY%%", "".join(body)))
    out = os.path.join(SITE, level["key"] + "-drill.html")
    io.open(out, "w", encoding="utf-8").write(page)
    print("wrote", out, len(page))


def main():
    for lv in LEVELS:
        build(lv)


if __name__ == "__main__":
    main()
