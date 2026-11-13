# -*- coding: utf-8 -*-
"""
build_en_cet4_papers.py — 生成 site/en/cet4/<id>.html（四级每套真题的整卷页）

数据：
  · tools/data/cet4_full.json      —— 从原卷 PDF 重建的听力 25 题、阅读全文、写作与翻译
  · tools/data/cet4_solutions.json —— 解析册 OCR 后按 Part 切分的文本（可选；缺省显示待补）

页面结构与 cet4.html 同一套壳：左侧栏 + 顶栏 + 右侧目录，正文按
Part I → Part II → Part III → Part IV → 答案解析 排列。

用法：python tools/build_en_cet4_papers.py
"""
import html
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nav_shared import build_nav

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site", "en")
OUTDIR = os.path.join(SITE, "cet4")
FULL = os.path.join(HERE, "data", "cet4_full.json")
SOL = os.path.join(HERE, "data", "cet4_solutions.json")


def esc(t):
    return html.escape(t, quote=False)


def load_json(p, default):
    if not os.path.exists(p):
        return default
    return json.load(io.open(p, encoding="utf-8"))


def load():
    data = load_json(FULL, {"papers": []})
    sol = load_json(SOL, {"papers": {}})
    notes = {}
    for sess in load_json(os.path.join(HERE, "data", "cet4_papers.json"), {"sessions": []}).get("sessions", []):
        for st in sess.get("sets", []):
            notes["%s-%d" % (sess["id"], st["set"])] = st.get("note", "")
    for p in data["papers"]:
        p["solution"] = sol["papers"].get(p["id"], {})
        p["note"] = notes.get(p["id"], "")
    return data


CSS = """
<style>
.qitem { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); padding: 10px 13px; margin: 9px 0; }
.qitem .qh { font-size: 12.6px; color: var(--ink-2); line-height: 1.75; margin-bottom: 5px; }
.qitem .qn { display: inline-block; min-width: 26px; margin-right: 6px; padding: 0 6px; border-radius: 5px;
  background: rgb(var(--accent-rgb) / .12); color: var(--accent); font-weight: 600; font-size: 11.6px; text-align: center; }
.qgroup { margin: 16px 0 6px; font-size: 12.4px; color: var(--accent); font-weight: 600; }
.opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 18px; }
@media (max-width: 720px) { .opts { grid-template-columns: 1fr; } }
.opts div { font-size: 12.4px; line-height: 1.7; color: var(--ink-3); }
.opts b { color: var(--ink-2); margin-right: 4px; }
.paper-body { font-size: 13.2px; line-height: 1.9; color: var(--ink-2); }
.paper-body p { margin: 7px 0; }
.paper-body p.dir { font-size: 12.3px; color: var(--ink-4); }
.part { margin: 30px 0 8px; padding-bottom: 7px; border-bottom: 1px solid var(--line); }
.part h2 { margin: 0; font-size: 17px; }
.part em { font-style: normal; font-size: 12.4px; color: var(--ink-4); margin-left: 8px; }
.solbox { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); margin: 12px 0; }
.solbox summary { cursor: pointer; padding: 11px 14px; font-size: 13.2px; font-weight: 600; color: var(--ink); }
.solbox summary::marker { color: var(--accent); }
.solbody { padding: 0 14px 14px; border-top: 1px dashed var(--line); }
.solbody p { margin: 7px 0; font-size: 12.6px; line-height: 1.85; color: var(--ink-2); }
.navpair { display: flex; justify-content: space-between; gap: 10px; margin: 26px 0 4px; }
.navpair a { font-size: 12.6px; }
.meta2 { font-size: 12.4px; color: var(--ink-4); }
</style>
"""

HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%%TITLE%% · 四级学习专区</title>
<meta name="description" content="%%DESC%%">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
<script src="../../js/boot.js"></script>
<link rel="stylesheet" href="../../acm/assets/shell.css">
<link rel="stylesheet" href="../../acm/assets/content.css">
<link rel="stylesheet" href="../ex.css">
%%CSS%%
</head>
<body data-book="cet4">
<div class="app">
  <aside class="side" id="side">
    <div class="side-top">
      <a class="brand" href="../index.html">
        <span class="brand-mark is-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5c-1.75-1.3-3.5-1.85-5.3-1.65a.95.95 0 0 0-.85.95v9.9c0 .62.53 1.09 1.15 1.02 1.55-.16 3.1.28 4.45 1.24.32.23.74.23 1.06 0 1.35-.96 2.9-1.4 4.45-1.24.62.07 1.15-.4 1.15-1.02 V5.8a.95.95 0 0 0-.85-.95c-1.8-.2-3.55.35-5.3 1.65z" fill="currentColor" fill-opacity=".96"/><path d="M12 7.7v9.4" stroke="rgba(20,40,90,.45)" stroke-width="1" stroke-linecap="round"/></svg></span>
        <span class="brand-txt"><b>课程学习站</b><small>高数 · 英语 · 四级 · 制图</small></span>
      </a>
      <button class="side-x" id="sideX" type="button" aria-label="收起侧栏">✕</button>
    </div>
    <div class="side-search">
      %%SEARCH%%
      <input id="sideSearch" type="search" placeholder="搜本题干、选项…" autocomplete="off" aria-label="搜索">
      <kbd>Ctrl K</kbd>
    </div>
    %%NAV%%
    <div class="side-foot">
      <div class="pg-t"><span>本套</span><b>%%FOOT%%</b></div>
      <div class="side-tools">
        <a class="mini-btn" href="../cet4.html">四级专区</a>
        <a class="mini-btn" href="./%%PREV%%">上一套</a>
      </div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="../../index.html">校园主页</a><span class="sep">/</span><a href="../index.html">课程学习站</a><span class="sep">/</span><a href="../cet4.html">四级学习专区</a><span class="sep">/</span><span class="cur">%%CRUMB%%</span></div>
      <div class="top-r">
        <a class="top-btn home-btn" href="../../index.html" title="回到网站主页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6 12 4l8 6.6"/><path d="M6.4 9.4V19a1 1 0 0 0 1 1h3.1v-4.6h3v4.6h3.1a1 1 0 0 0 1-1V9.4"/></svg><span class="tl">返回主页</span></a>
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色">%%THEME%%<span class="tl">浅色</span></button>
        <a class="top-btn" href="../cet4.html"><span class="tl">四级专区</span></a>
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
<script src="../skin.js"></script>
<script src="../en.js"></script>
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
SESSION_ORDER = ["2026-06", "2025-12", "2025-06", "2024-12", "2024-06", "2023-12", "2023-06", "2023-03"]


def render_listening(items, groups=None):
    if not items:
        return '<p class="meta">本套原卷未单列听力（该次考试听音与另一套一致，或原卷只提供写作与翻译）。</p>'
    out = []
    gmap = {g["from"]: g for g in (groups or [])}
    for q in items:
        g = gmap.get(q["no"])
        if g:
            out.append('<div class="qgroup">Questions %d–%d · %s</div>'
                       % (g["from"], g["to"], esc(g["desc"])))
        o = q.get("opts", {})
        cells = "".join('<div><b>%s</b>%s</div>' % (L, esc(o.get(L, ""))) for L in "ABCD")
        stem = ('<div class="qh">%s</div>' % esc(q["stem"])) if q.get("stem") else ""
        out.append('<div class="qitem"><div class="qh"><span class="qn">%d</span></div>'
                  '<div class="qh">%s</div><div class="opts">%s</div></div>'
                  % (q["no"], stem, cells))
    return "".join(out)


def render_reading(text, note=""):
    if not text.strip():
        if note:
            return '<div class="callout"><p>%s</p></div>' % esc(note)
        return '<p class="meta">本套原卷为扫描件，阅读原文暂未录入。</p>'
    out = []
    for ln in text.split("\n"):
        s = ln.strip()
        if not s:
            continue
        cls = ' class="dir"' if s.startswith("Directions") or s.startswith("Section") else ""
        out.append("<p%s>%s</p>" % (cls, esc(s)))
    return '<div class="paper-body">%s</div>' % "".join(out)


def render_solution(sol, has_text):
    if not sol:
        if not has_text:
            return ('<div class="callout"><p>这一套的原卷是扫描件，解析册也未做文字识别，'
                    '题目与解析暂未录入。</p></div>')
        return ('<div class="callout"><p><b>解析整理中。</b>原卷题目已经录入；'
                '解析册是扫描件，正在做文字识别与校对，完成后会补在这一节。</p></div>')
    names = [("writing", "Part I 写作"), ("listening", "Part II 听力"),
             ("reading", "Part III 阅读"), ("translation", "Part IV 翻译")]
    out = []
    for key, name in names:
        txt = sol.get(key)
        if not txt:
            continue
        body = "".join("<p>%s</p>" % esc(x.strip()) for x in txt.split("\n") if x.strip())
        out.append('<details class="solbox"><summary>%s 解析</summary>'
                   '<div class="solbody">%s</div></details>' % (name, body))
    if not out:
        return '<div class="callout"><p>解析已识别，但没匹配到 Part 分段，请查看原解析册。</p></div>'
    note = ('<div class="callout"><p><b>解析来自配套解析册的扫描件 OCR。</b>中文讲解与答案可直接检索；'
            '英文原文、范文和选项里的单词可能有识别错字（例如把撇号认成 5、把 in 认成 1n），'
            '引用到作文或翻译时请以原解析册为准。</p></div>')
    return note + "".join(out)


def build_body(p):
    sid = p["id"]
    has_text = bool(p.get("writing") or p.get("reading"))
    n_q = len(p.get("listening") or [])
    n_read = 30 if len(p.get("reading", "")) > 2000 else 0
    if p.get("note"):
        intro = p["note"]
    elif not has_text:
        intro = "这一套的原卷是扫描件，没有可提取的文字层，题目与解析暂未录入。"
    else:
        intro = ("整卷题目按原卷顺序录入：写作题干、听力 25 题选项、阅读三节原文与题目、翻译中文原文；"
                 "解析册的答案与逐题讲解放在最后一节，可折叠查看。")
    hero = (
        '<header class="hero">'
        '<div class="eyebrow">CET-4 · %s · 第 %d 套</div>'
        '<h1>%s <span>第 %d 套</span></h1>'
        '<p>%s</p>'
        '<div class="hero-stats">'
        '<div><b>%d</b><span>听力题</span></div>'
        '<div><b>%d</b><span>阅读题</span></div>'
        '<div><b>1</b><span>篇写作</span></div>'
        '<div><b>1</b><span>段翻译</span></div>'
        '</div></header>'
        % (esc(p["label"]), p["set"], esc(p["label"]), p["set"], esc(intro), n_q, n_read))

    body = [hero]
    body.append('<div class="sec-t"><h2 id="writing">Part I · 写作</h2><em>120–180 词，30 分钟</em></div>')
    if p.get("writing"):
        body.append('<div class="paper-body"><p>%s</p></div>' % esc(p["writing"]))
    else:
        body.append('<div class="callout"><p>这一套原卷是扫描件，写作题干暂未录入。</p></div>')

    body.append('<div class="sec-t"><h2 id="listening">Part II · 听力</h2><em>%s</em></div>'
                % ("25 题，选项按原卷录入" if n_q else "本次未单列听力"))
    if n_q:
        body.append('<p class="meta2">听力题干由录音念出，原卷只印选项；答案与听力原文见最后一节解析。</p>')
        body.append(render_listening(p.get("listening") or [], p.get("groups") or []))

    body.append('<div class="sec-t"><h2 id="reading">Part III · 阅读</h2><em>选词填空 + 段落匹配 + 两篇仔细阅读</em></div>')
    body.append(render_reading(p.get("reading", ""), p.get("note", "")))

    body.append('<div class="sec-t"><h2 id="translation">Part IV · 翻译</h2><em>140–160 字，30 分钟</em></div>')
    if p.get("translation"):
        body.append('<div class="paper-body"><p>%s</p></div>' % esc(p["translation"]))
    else:
        body.append('<div class="callout"><p>这一套原卷是扫描件，翻译原文暂未录入。</p></div>')

    body.append('<div class="sec-t"><h2 id="solution">答案解析</h2><em>来自配套解析册</em></div>')
    body.append(render_solution(p.get("solution") or {}, has_text))

    order = [x["id"] for x in PAPERS]
    i = order.index(sid)
    prev_id = order[i - 1] if i > 0 else ""
    next_id = order[i + 1] if i + 1 < len(order) else ""
    nav = ['<div class="navpair">']
    nav.append('<a href="./%s.html">← %s</a>' % (prev_id, esc(PAPERS[i - 1]["label"] + " 第 %d 套" % PAPERS[i - 1]["set"])) if prev_id else "<span></span>")
    nav.append('<a href="../cet4.html">四级专区总览 →</a>')
    nav.append('<a href="./%s.html">%s →</a>' % (next_id, esc(PAPERS[i + 1]["label"] + " 第 %d 套" % PAPERS[i + 1]["set"])) if next_id else "<span></span>")
    nav.append('</div>')
    body.append("".join(nav))

    body.append('<div class="home-foot"><span>© 2026 校园主页 · 课程学习站 · 纯静态页面，不收集任何数据</span>'
                '<span>真题原文版权归原出版方与考试机构；本页仅用于个人备考</span></div>')
    return "".join(body)


def main():
    global PAPERS
    data = load()
    PAPERS = data["papers"]
    os.makedirs(OUTDIR, exist_ok=True)
    n = 0
    for p in PAPERS:
        order = [x["id"] for x in PAPERS]
        i = order.index(p["id"])
        prev_id = order[i - 1] if i > 0 else ""
        title = "%s 第 %d 套" % (p["label"], p["set"])
        page = (HEAD.replace("%%TITLE%%", esc(title))
                    .replace("%%DESC%%", esc(title + "：写作、听力、阅读、翻译原文与答案解析"))
                    .replace("%%CSS%%", CSS)
                    .replace("%%NAV%%", build_nav("../b1.html", "cet4").replace('href="./', 'href="../'))
                    .replace("%%SEARCH%%", SEARCH)
                    .replace("%%THEME%%", THEME)
                    .replace("%%TOPHAT%%", TOPHAT)
                    .replace("%%FOOT%%", esc("%d 题听力 · 30 题阅读" % len(p.get("listening") or [])))
                    .replace("%%PREV%%", prev_id + ".html" if prev_id else "../cet4.html")
                    .replace("%%CRUMB%%", esc(title))
                    .replace("%%BODY%%", build_body(p)))
        io.open(os.path.join(OUTDIR, p["id"] + ".html"), "w", encoding="utf-8").write(page)
        n += 1
    print("wrote %d paper pages to %s" % (n, OUTDIR))


if __name__ == "__main__":
    PAPERS = []
    main()
