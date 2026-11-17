# -*- coding: utf-8 -*-
"""
build_en_math_formula.py — 生成 site/en/math-formula.html（高等数学公式总表）

数据在 tools/math_formula.py，8 组 40 张表 248 条。
页面只做三件事：按组排表、给一个即时搜索框、复用 /en 子站的外壳。

用法：
    python tools/build_en_math_formula.py
"""

import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site")
OUT = os.path.join(SITE, "en", "math-formula.html")

sys.path.insert(0, HERE)
from nav_shared import build_nav
from math_formula import SECTIONS



# 数据里为了可读性直接写 ^{...} / _{...}（LaTeX 习惯），渲染时转成上下标。
# 先处理带花括号的，再处理单个字符（e^x、x_1 这种）。
SUP_BRACE = re.compile(r"\^\{([^{}]*)\}")
SUB_BRACE = re.compile(r"_\{([^{}]*)\}")
SUP_ONE = re.compile(r"\^([A-Za-z0-9\u0370-\u03ff])")
SUB_ONE = re.compile(r"_([A-Za-z0-9\u0370-\u03ff])")


def mathify(s):
    # 数据里用全角双空格分隔「同一行的两个相关公式」，渲染成换行：
    # 窄屏上两列只有一半宽度，挤在一行会折得很难看
    s = s.replace("\u3000\u3000", "<br>")
    s = SUP_BRACE.sub(r"<sup>\1</sup>", s)
    s = SUB_BRACE.sub(r"<sub>\1</sub>", s)
    s = SUP_ONE.sub(r"<sup>\1</sup>", s)
    s = SUB_ONE.sub(r"<sub>\1</sub>", s)
    return s


TOTAL = sum(len(t["rows"]) for s in SECTIONS for t in s["tables"])
NTAB = sum(len(s["tables"]) for s in SECTIONS)


def render_group(sec, idx):
    rows = sum(len(t["rows"]) for t in sec["tables"])
    body = []
    for t in sec["tables"]:
        trs = "".join(
            '<tr data-fx><td class="fx-f"><span class="fm">%s</span></td>'
            '<td class="fx-n">%s</td></tr>' % (mathify(a), mathify(b))
            for a, b in t["rows"]
        )
        note = ('<span class="fx-tn">%s</span>' % t["note"]) if t.get("note") else ""
        body.append(
            '<div class="fx-block"><h3 class="fx-h">%s%s<span class="fx-c">%d 条</span></h3>'
            '<table class="fx-t"><tbody>%s</tbody></table></div>'
            % (t["title"], note, len(t["rows"]), trs)
        )
    return (
        '<section class="unit fx" id="%s" data-unit="%s" data-title="%s">'
        '<div class="uhead"><div class="uno">%02d</div>'
        '<div class="ut"><h2 class="u2t">%s<span class="uzh">第 %d 组</span></h2>'
        '<p class="usub">%d 张表　·　%d 条</p></div></div>'
        '<p class="lead">%s</p>%s</section>'
        % (sec["id"], sec["id"], sec["title"], idx + 1, sec["title"], idx + 1,
           len(sec["tables"]), rows, sec["note"], "".join(body))
    )


HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>高等数学公式总表 · @@TOTAL@@ 条速查</title>
<meta name="description" content="高等数学常用公式总表：极限与等价无穷小、导数公式与求导法则、中值定理与泰勒展开、不定积分基本表、定积分与应用、多元函数与重积分、无穷级数、常用不等式与核心关系，共 8 组 40 张表 @@TOTAL@@ 条，支持即时搜索。">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27g%27%20x1%3D%270%27%20y1%3D%270%27%20x2%3D%271%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%27%20stop-color%3D%27%232f63f6%27%2F%3E%3Cstop%20offset%3D%27.5%27%20stop-color%3D%27%237b7bff%27%2F%3E%3Cstop%20offset%3D%271%27%20stop-color%3D%27%231fc7ae%27%2F%3E%3C%2FlinearGradient%3E%3CclipPath%20id%3D%27c%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20rx%3D%2715%27%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20rx%3D%2715%27%20fill%3D%27url%28%23g%29%27%2F%3E%3Cg%20clip-path%3D%27url%28%23c%29%27%3E%3Cpath%20d%3D%27M-8%2042%20L64%204%20L64%20-8%20L-8%2030%20Z%27%20fill%3D%27%23fff%27%20fill-opacity%3D%27.10%27%2F%3E%3C%2Fg%3E%3Crect%20x%3D%27.9%27%20y%3D%27.9%27%20width%3D%2762.2%27%20height%3D%2762.2%27%20rx%3D%2714.2%27%20fill%3D%27none%27%20stroke%3D%27%23fff%27%20stroke-opacity%3D%27.26%27%20stroke-width%3D%271.2%27%2F%3E%3Cg%20transform%3D%27translate%2832%2032%29%20scale%281.16%29%20translate%28-32%20-32%29%27%3E%3Cpath%20d%3D%27M32%2021.8c-4.4-3.2-8.8-4.3-13.2-3.9a1.4%201.4%200%200%200-1.3%201.4v25.1c0%201%20.9%201.7%201.9%201.6%203.9-.3%207.9.7%2011.4%203.1.7.5%201.7.5%202.4%200%203.5-2.4%207.5-3.4%2011.4-3.1%201%20.1%201.9-.6%201.9-1.6V19.3c0-.7-.6-1.3-1.3-1.4-4.4-.4-8.8.7-13.2%203.9z%27%20fill%3D%27%23fff%27%20fill-opacity%3D%27.97%27%2F%3E%3Cpath%20d%3D%27M32%2024.8v23.8%27%20stroke%3D%27%233d6bd6%27%20stroke-opacity%3D%27.4%27%20stroke-width%3D%271.8%27%20stroke-linecap%3D%27round%27%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E">
<script src="../js/boot.js"></script>
<link rel="stylesheet" href="../acm/assets/shell.css">
<link rel="stylesheet" href="../acm/assets/content.css">
<link rel="stylesheet" href="./ex.css">
<link rel="stylesheet" href="./math.css">
<link rel="stylesheet" href="./math-formula.css">
</head>
<body data-book="math-formula">
<div class="app">
  <aside class="side" id="side">
    <div class="side-top">
      <a class="brand" href="./index.html">
        <span class="brand-mark is-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5c-1.75-1.3-3.5-1.85-5.3-1.65a.95.95 0 0 0-.85.95v9.9c0 .62.53 1.09 1.15 1.02 1.55-.16 3.1.28 4.45 1.24.32.23.74.23 1.06 0 1.35-.96 2.9-1.4 4.45-1.24.62.07 1.15-.4 1.15-1.02 V5.8a.95.95 0 0 0-.85-.95c-1.8-.2-3.55.35-5.3 1.65z" fill="currentColor" fill-opacity=".96"/><path d="M12 7.7v9.4" stroke="rgba(20,40,90,.45)" stroke-width="1" stroke-linecap="round"/></svg></span>
        <span class="brand-txt"><b>课程学习站</b><small>高等数学 · 公式速查</small></span>
      </a>
      <button class="side-x" id="sideX" type="button" aria-label="收起侧栏">✕</button>
    </div>
    <div class="side-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
      <input id="sideSearch" type="search" placeholder="搜章节、公式、易错点…" autocomplete="off" aria-label="搜索">
      <kbd>Ctrl K</kbd>
    </div>
    @@NAV@@
    <div class="side-foot">
      <div class="pg-t"><span>速查范围</span><b>@@NTAB@@ 表 · @@TOTAL@@ 条</b></div>
      <div class="side-tools"><a class="mini-btn" href="./math.html">回高数页</a></div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="./index.html">课程学习站</a><span class="sep">/</span><span class="cur">公式总表</span></div>
      <div class="top-r">
        <a class="top-btn home-btn" href="../index.html" title="回到网站主页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6 12 4l8 6.6"/><path d="M6.4 9.4V19a1 1 0 0 0 1 1h3.1v-4.6h3v4.6h3.1a1 1 0 0 0 1-1V9.4"/></svg><span class="tl">返回主页</span></a>
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="3.6"/></svg><span class="tl">浅色</span></button>
        <a class="top-btn" href="./math.html"><span class="tl">高数讲解</span></a>
        <a class="top-btn" href="./math750.html"><span class="tl">750 题</span></a>
      </div>
    </header>

    <button class="to-top" id="toTop" type="button" aria-label="回到顶部" title="回到顶部"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button>

    <div class="scroll" id="scroll">
      <div class="readbar"><i id="readBar"></i></div>
      <div class="view">
        <div class="stage">
          <article class="doc doc-study" id="doc">
            <header class="doc-head">
              <div class="eyebrow">课程学习站 · 高等数学 · 公式速查</div>
              <h1>公式总表<span class="hno">@@TOTAL@@ 条</span></h1>
              <p class="lede">把上册下册会用到的东西按「用的时候会想起什么」重排了一遍：极限、导数、中值定理与泰勒、不定积分、定积分、多元、级数，最后单独一组建模「概念之间的关系与常用不等式」。左边是公式，右边是条件、记忆点和最常见的错法——<b>条件比公式更容易丢分</b>。</p>
              <div class="chips">
                <span class="chipk"><b>8</b> 组</span>
                <span class="chipk"><b>@@NTAB@@</b> 张表</span>
                <span class="chipk"><b>@@TOTAL@@</b> 条</span>
                <span class="chipk lv">上册 4 组 · 下册 4 组</span>
                <span class="chipk">即时搜索</span>
              </div>
            </header>

            <div class="docbody">
              <div class="fx-bar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
                <input id="fxQ" type="search" placeholder="搜公式：tan、格林、Wallis、arcsin、分部…" autocomplete="off" aria-label="搜索公式">
                <span class="fx-meta" id="fxMeta">共 @@TOTAL@@ 条</span>
                <button class="fx-clear" id="fxClear" type="button" hidden>清空</button>
              </div>
              <div class="fx-empty" id="fxEmpty" hidden>没有匹配的公式，换个关键词试试（可以搜函数名、定理名或符号）。</div>
              @@GROUPS@@
              <div class="home-foot">
                <span>© 2026 校园主页 · 课程学习站 · 公式总表</span>
                <span>共 8 组 @@NTAB@@ 张表 @@TOTAL@@ 条；条件与说明按《高等数学》教学要求整理</span>
                <span>公式用 HTML + Unicode 手排，不加载任何数学脚本；支持深浅色</span>
              </div>
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
<script src="./math-formula.js"></script>
</body>
</html>
"""


def main():
    body = "".join(render_group(s, i) for i, s in enumerate(SECTIONS))
    page = (HEAD.replace("@@NAV@@", build_nav("", "math"))
                .replace("@@GROUPS@@", body)
                .replace("@@NTAB@@", str(NTAB))
                .replace("@@TOTAL@@", str(TOTAL)))
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("written: %s  %d 组 / %d 表 / %d 条 / %d chars"
          % (OUT, len(SECTIONS), NTAB, TOTAL, len(page)))


if __name__ == "__main__":
    main()
