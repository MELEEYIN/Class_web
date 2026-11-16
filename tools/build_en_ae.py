# -*- coding: utf-8 -*-
"""build_en_de.py — 生成 site/en/ae.html（数字电子技术 · 期末速成）

课程结构参考本机字幕（P1–P9），正文按教材口径整理并核对过关键公式：
  · 555 单稳态 tw = 1.1RC、多谐 f = 1.44/((R1+2R2)C)（TI NE555 数据手册）
  · ADC 1LSB = Vref/2^n，DAC 分辨率 1/(2^n-1)
"""
import html
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nav_shared import build_nav

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site", "en")
OUT = os.path.join(SITE, "ae.html")


def esc(t):
    return html.escape(t, quote=False)


CHAPTERS = json.load(io.open(os.path.join(HERE, "data", "ae_chapters.json"), encoding="utf-8"))["chapters"]


CSS = """
<style>
.de-box { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 16px 18px; margin: 14px 0 18px; }
.de-box h3 { margin: 22px 0 8px; font-size: 15.6px; color: var(--ink); }
.de-box h3:first-child { margin-top: 0; }
.de-box p { margin: 8px 0; font-size: 14.4px; line-height: 1.92; color: var(--ink-2); }
.de-box table { width: 100%; border-collapse: collapse; margin: 10px 0; }
.de-box th, .de-box td { padding: 7px 10px; border: 1px solid var(--line); font-size: 13px; line-height: 1.7; }
.de-box th { background: rgb(var(--accent-rgb) / .08); color: var(--ink); font-weight: 600; }
.de-box td { color: var(--ink-2); }
.de-box .note { margin: 10px 0 0; padding: 9px 12px; border-left: 3px solid var(--accent);
  background: rgb(var(--accent-rgb) / .06); border-radius: 0 8px 8px 0; font-size: 13px; color: var(--ink-3); }
.de-ex { margin: 12px 0; }
.de-ex .solbody p { margin: 9px 0; font-size: 14px; line-height: 1.9; }
.de-chip { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11.6px; font-weight: 600;
  color: var(--accent); background: rgb(var(--accent-rgb) / .12); border: 1px solid rgb(var(--accent-rgb) / .3); white-space: nowrap; }
.de-tips { margin: 14px 0 22px; padding: 12px 16px; border: 1px dashed var(--line-2); border-radius: 10px; }
.de-tips b { display: block; margin-bottom: 4px; font-size: 12.6px; color: var(--accent); }
.de-tips ul { margin: 4px 0 0; padding-left: 18px; }
.de-tips li { font-size: 13.4px; line-height: 1.85; color: var(--ink-3); }
.formula { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; }
@media (max-width: 760px) { .formula { grid-template-columns: 1fr; } }
.formula div { font-size: 13.4px; line-height: 1.8; color: var(--ink-2); }
.formula b { color: var(--accent); }
</style>
"""

HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>模拟电子技术 · 期末速成 · 课程学习站</title>
<meta name="description" content="模拟电子技术期末速成：半导体器件、基本放大电路、多级与差分、集成运放、频率响应、反馈、运算与处理、波形产生、功率放大、直流电源，共 10 章，含公式速查与例题。">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
<script src="../js/boot.js"></script>
<link rel="stylesheet" href="../acm/assets/shell.css">
<link rel="stylesheet" href="../acm/assets/content.css">
<link rel="stylesheet" href="./ex.css">
<link rel="stylesheet" href="./stm32.css">
%%CSS%%
</head>
<body data-book="ae">
<div class="app">
  <aside class="side" id="side">
    <div class="side-top">
      <a class="brand" href="./index.html">
        <span class="brand-mark is-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5c-1.75-1.3-3.5-1.85-5.3-1.65a.95.95 0 0 0-.85.95v9.9c0 .62.53 1.09 1.15 1.02 1.55-.16 3.1.28 4.45 1.24.32.23.74.23 1.06 0 1.35-.96 2.9-1.4 4.45-1.24.62.07 1.15-.4 1.15-1.02 V5.8a.95.95 0 0 0-.85-.95c-1.8-.2-3.55.35-5.3 1.65z" fill="currentColor" fill-opacity=".96"/><path d="M12 7.7v9.4" stroke="rgba(20,40,90,.45)" stroke-width="1" stroke-linecap="round"/></svg></span>
        <span class="brand-txt"><b>课程学习站</b><small>高数 · 四六级 · 数电 · 模电</small></span>
      </a>
      <button class="side-x" id="sideX" type="button" aria-label="收起侧栏">✕</button>
    </div>
    <div class="side-search">
      %%SEARCH%%
      <input id="sideSearch" type="search" placeholder="搜章节、公式、例题…" autocomplete="off" aria-label="搜索">
      <kbd>Ctrl K</kbd>
    </div>
    %%NAV%%
    <div class="side-foot">
      <div class="pg-t"><span>内容规模</span><b>10 章 · 34 节 · 14 道例题</b></div>
      <div class="side-tools">
        <a class="mini-btn" href="./ae.html">数字电子技术</a>
        <a class="mini-btn" href="./b1.html">大学英语</a>
      </div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="../index.html">校园主页</a><span class="sep">/</span><a href="./index.html">课程学习站</a><span class="sep">/</span><span class="cur">模拟电子技术</span></div>
      <div class="top-r">
        <a class="top-btn home-btn" href="../index.html" title="回到网站主页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6 12 4l8 6.6"/><path d="M6.4 9.4V19a1 1 0 0 0 1 1h3.1v-4.6h3v4.6h3.1a1 1 0 0 0 1-1V9.4"/></svg><span class="tl">返回主页</span></a>
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色">%%THEME%%<span class="tl">浅色</span></button>
        <a class="top-btn" href="./ae.html"><span class="tl">数电</span></a>
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

SEARCH = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
          'stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>')
THEME = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
         'stroke-linecap="round" stroke-linejoin="round">'
         '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'
         '<circle cx="12" cy="12" r="3.6"/></svg>')
TOPHAT = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          'stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>')


def render_chapter(ch):
    no = ch["no"]
    out = ['<section class="unit stm" id="c%d" data-title="%02d · %s">' % (no, no, esc(ch["title"]))]
    badge = {1: "基础", 2: "核心", 3: "选学", 4: "核心", 5: "核心",
             6: "必考", 7: "基础", 8: "必考", 9: "必考"}.get(no, "核心")
    goals = "".join("<li>%s</li>" % esc(sec["h"].split("：")[0]) for sec in ch["sections"][:4])
    out.append('<div class="uhead"><div class="uno">%02d</div>'
               '<div class="ut"><h2 class="u2t">%s<span class="uzh">第 %d 章</span></h2>'
               '<p class="usub">%d 节 · %d 道例题 · %s</p></div>'
               '<div class="ubadges"><span class="de-chip">%s</span></div></div>'
               % (no, esc(ch["title"]), no, len(ch["sections"]),
                  len(ch.get("examples", [])), esc(ch["tag"]), esc(badge)))
    out.append('<p class="lead">%s</p>' % esc(ch["intro"]))
    out.append('<div class="callout ok stm-goal"><p><b>读完这一章你能做到</b></p><ul>%s</ul></div>' % goals)
    for k, sec in enumerate(ch["sections"], 1):
        out.append('<div class="sect-h" id="c%d-s%d">%s<span class="pgx">必背</span></div>'
                   % (no, k, esc(sec["h"])))
        for p in sec["ps"]:
            out.append("<p>%s</p>" % esc(p))
        tb = sec.get("table")
        if tb:
            head = "".join("<th>%s</th>" % esc(x) for x in tb["head"])
            rows = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % esc(c) for c in r)
                           for r in tb["rows"])
            out.append("<table><thead><tr>%s</tr></thead><tbody>%s</tbody></table>" % (head, rows))
        if sec.get("note"):
            out.append('<div class="callout"><p>%s</p></div>' % esc(sec["note"]))
    if ch.get("examples"):
        out.append('<div class="sect-h" id="c%d-ex">例题<span class="pgx">先做再展开</span></div>' % no)
        items = []
        for ex in ch["examples"]:
            ans = "".join("<p>%s</p>" % esc(x) for x in ex["a"])
            items.append('<li><p class="exq">%s</p><div class="exa">%s</div></li>' % (esc(ex["q"]), ans))
        out.append('<div class="exgrp veiled"><div class="exh"><b>本章例题</b> · %d 题'
                   '<span class="exk self">自编 · 按真题题型</span>'
                   '<button class="chip act" type="button" data-veil="1">显示解析</button></div>'
                   '<ol class="exlist">%s</ol></div>' % (len(ch["examples"]), "".join(items)))
    if ch.get("tips"):
        out.append('<div class="callout warn"><p><b>易错点</b></p><ul>%s</ul></div>'
                   % "".join("<li>%s</li>" % esc(t) for t in ch["tips"]))
    out.append('</section>')
    return "".join(out)


def render_map():
    cards = []
    for ch in CHAPTERS:
        cards.append('<a class="stm-mc" href="#c%d"><span class="stm-mk">CH %02d</span>'
                     '<b>%s</b><span class="stm-md">%s</span></a>'
                     % (ch["no"], ch["no"], esc(ch["title"]), esc(ch["tag"])))
    return ('<div class="sec-t"><h2 id="map">课程地图</h2><em>十章，按教材顺序</em></div>'
            '<div class="stm-map">%s</div>' % "".join(cards))


def render_appendix():
    formulas = [
        ("晶体管输入电阻", "rbe = rbb' + (1+β)·26mV/IEQ"),
        ("共射放大倍数", "Au = −β(Rc∥RL)/rbe"),
        ("共集 / 共基", "Au ≈ 1 / Au ≈ β(Rc∥RL)/rbe"),
        ("差分共模抑制比", "CMRR = |Ad / Ac|"),
        ("闭环增益", "Af = A / (1 + AF)"),
        ("深度负反馈", "Af ≈ 1 / F"),
        ("振荡条件", "AF = 1（起振 |AF| > 1）"),
        ("RC 桥式频率", "f0 = 1 / (2πRC)"),
        ("LC 振荡频率", "f0 = 1 / (2π√(LC))"),
        ("OCL 最大功率", "Pom = UCC² / (8RL)，η ≈ 78.5%"),
        ("整流 / 滤波", "Uo = 0.9U2；电容滤波 ≈ 1.2U2"),
        ("运放增益", "反相 −Rf/R1；同相 1 + Rf/R1"),
    ]
    rows = "".join("<tr><td>%s</td><td><code>%s</code></td></tr>" % (esc(a), esc(b))
                   for a, b in formulas)
    return ('<div class="sec-t"><h2 id="formula">公式速查</h2><em>考前最后看一遍</em></div>'
            '<table><thead><tr><th>项目</th><th>公式</th></tr></thead><tbody>%s</tbody></table>' % rows)


def main():
    body = ['<header class="hero"><div class="eyebrow">EE · 模拟电子技术</div>'
            '<h1>十章，<span>从器件到电源</span></h1>'
            '<p>按教材顺序排：器件 → 基本放大 → 差分 → 运放 → 频响 → 反馈 → 运算 → 波形 → 功放 → 电源。'
            '每章给「考什么 → 怎么算 → 例题 → 易错点」，例题解析默认遮住，先自己做。</p>'
            '<p style="margin-top:14px"><a class="mini-btn" href="#map">先看课程地图 →</a></p>'
            '<div class="hero-stats"><div><b>10</b><span>章</span></div>'
            '<div><b>34</b><span>节</span></div>'
            '<div><b>14</b><span>例题</span></div>'
            '<div><b>12</b><span>速查公式</span></div></div></header>']
    body.append('<div class="callout ok"><p><b>怎么用：</b>时间紧就按「第 2 章 → 第 6 章 → 第 7 章 → 第 9 章」的顺序，'
                '第 2、6、7 章占期末大题的大头；第 1、4、5、10 章用零碎时间过公式和表格。每章末尾的易错点，'
                '就是阅卷时最常扣分的地方。</p></div>')
    body.append(render_map())
    body.append("".join(render_chapter(ch) for ch in CHAPTERS))
    body.append(render_appendix())
    body.append('<div class="callout"><p><b>说明：</b>课程结构参考期末速成课的字幕（数制、逻辑代数、门电路、组合、触发器、时序、存储器、脉冲、AD/DA 共 9 章），'
                '公式与参数按通用教材（阎石《数字电子技术基础》）与 TI NE555 数据手册核对；例题为同类题型的自编题，不是原题。</p></div>')
    body.append('<div class="home-foot"><span>© 2026 校园主页 · 课程学习站 · 纯静态页面，不收集任何数据</span>'
                '<span>模拟电子技术：10 章 · 34 节 · 14 道例题 · 12 条速查公式</span></div>')
    page = (HEAD.replace("%%CSS%%", CSS)
                .replace("%%NAV%%", build_nav("./b1.html", "ae"))
                .replace("%%SEARCH%%", SEARCH)
                .replace("%%THEME%%", THEME)
                .replace("%%TOPHAT%%", TOPHAT)
                .replace("%%BODY%%", "".join(body)))
    io.open(OUT, "w", encoding="utf-8").write(page)
    print("wrote", OUT, len(page))


if __name__ == "__main__":
    main()
