# -*- coding: utf-8 -*-
"""
build_en_cet4_papers.py — 生成 site/en/cet4/<id>.html（四级每套真题的整卷页）

数据：
  · tools/data/cet6_full.json      —— 从原卷 PDF 重建的听力 25 题、阅读全文、写作与翻译
  · tools/data/cet6_solutions.json —— 解析册 OCR 后按 Part 切分的文本（可选；缺省显示待补）

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
OUTDIR = os.path.join(SITE, "cet6")
FULL = os.path.join(HERE, "data", "cet6_full.json")
SOL = os.path.join(HERE, "data", "cet6_solutions.json")


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
/* 整卷页：正文按「文章」排版，题目按「题卡」排版，尽量贴近 MDN / Notion 的阅读密度 */
.paper-body { font-size: 15px; line-height: 1.95; color: var(--ink-2); max-width: 76ch; }
.paper-body p { margin: 12px 0; }
.paper-body .rsec { margin: 34px 0 12px; padding: 9px 0 9px 13px; border-left: 3px solid var(--accent);
  font-size: 15px; letter-spacing: .02em; color: var(--ink); background: rgb(var(--accent-rgb) / .06);
  border-radius: 0 9px 9px 0; }
.paper-body .rsub { margin: 24px 0 8px; font-size: 14.5px; color: var(--ink); }
.paper-body p.rq { margin: 20px 0 8px; font-size: 14.7px; font-weight: 500; color: var(--ink); }
.dirbox { margin: 14px 0; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.dirbox summary { padding: 8px 13px; font-size: 12.4px; color: var(--ink-4); cursor: pointer; }
.dirbox p { margin: 0; padding: 0 13px 12px; font-size: 12.8px; line-height: 1.8; color: var(--ink-4); }
.bank { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px 14px; margin: 18px 0;
  padding: 13px 15px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.bank span { display: flex; gap: 5px; font-size: 13px; color: var(--ink-2); }
.bank span b { font-size: 12.2px; font-weight: 600; color: var(--accent); }
@media (max-width: 720px) { .bank { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

.qnav { position: sticky; top: 0; z-index: 4; display: flex; flex-wrap: wrap; gap: 5px;
  padding: 9px 0; margin: 2px 0 12px; background: var(--bg, transparent); backdrop-filter: blur(7px); }
.qnav a { min-width: 27px; padding: 3px 6px; text-align: center; border-radius: 6px; border: 1px solid var(--line);
  font-size: 12px; color: var(--ink-3); text-decoration: none; }
.qnav a:hover { border-color: rgb(var(--accent-rgb) / .55); color: var(--accent); }
.qlist { display: grid; gap: 10px; }
.qgroup { margin: 18px 0 1px; font-size: 12.6px; font-weight: 600; color: var(--accent); }
.qitem { display: grid; grid-template-columns: 38px 1fr; gap: 12px; padding: 13px 16px;
  border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.qitem:target { border-color: rgb(var(--accent-rgb) / .6); background: rgb(var(--accent-rgb) / .05); }
.qno { font-size: 20px; font-weight: 700; line-height: 1.15; text-align: right; color: rgb(var(--accent-rgb) / .7); }
.qstem { margin: 0 0 9px; font-size: 14.2px; line-height: 1.75; color: var(--ink); }
.opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 22px; }
.opt { display: grid; grid-template-columns: 22px 1fr; gap: 7px; font-size: 13.6px; line-height: 1.7; color: var(--ink-2); }
.opt b { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
  border-radius: 50%; border: 1px solid var(--line-2); font-size: 11.5px; color: var(--ink-3); }
@media (max-width: 760px) {
  .opts { grid-template-columns: 1fr; }
  .qitem { grid-template-columns: 30px 1fr; padding: 12px 13px; }
  .qno { font-size: 17px; }
}

.wcard { margin: 14px 0; padding: 16px 19px; border: 1px solid var(--line); border-radius: 12px;
  background: linear-gradient(180deg, rgb(var(--accent-rgb) / .07), transparent 62%), var(--surface); }
.wtag { margin-bottom: 7px; font-size: 11.6px; letter-spacing: .08em; color: var(--accent); }
.wcard p { margin: 0; font-size: 14.7px; line-height: 1.95; color: var(--ink); }

.solbox { margin: 12px 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.solbox summary { padding: 12px 16px; font-size: 13.4px; font-weight: 600; color: var(--ink); cursor: pointer; }
.solbox summary::marker { color: var(--accent); }
.solbody { padding: 2px 16px 16px; border-top: 1px dashed var(--line); }
.solbody p { margin: 12px 0; }
.solbody .solh { margin: 26px 0 8px; font-size: 13.6px; font-weight: 600; color: var(--accent); }
.solbody .solq { margin: 18px 0 6px; font-size: 13px; font-weight: 600; color: var(--ink); }
.solbody p.en { color: var(--ink-3); font-size: 13.4px; line-height: 1.78; }
.solbody p.zh { color: var(--ink); font-size: 14px; line-height: 1.95; }
.navpair { display: flex; justify-content: space-between; gap: 10px; margin: 30px 0 6px; }
.navpair a { font-size: 12.8px; }
.meta2 { font-size: 12.6px; color: var(--ink-4); }
</style>
"""

HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%%TITLE%% · 六级学习专区</title>
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
        <a class="mini-btn" href="../cet6.html">六级专区</a>
        <a class="mini-btn" href="./%%PREV%%">上一套</a>
      </div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="../../index.html">校园主页</a><span class="sep">/</span><a href="../index.html">课程学习站</a><span class="sep">/</span><a href="../cet6.html">六级学习专区</a><span class="sep">/</span><span class="cur">%%CRUMB%%</span></div>
      <div class="top-r">
        <a class="top-btn home-btn" href="../../index.html" title="回到网站主页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6 12 4l8 6.6"/><path d="M6.4 9.4V19a1 1 0 0 0 1 1h3.1v-4.6h3v4.6h3.1a1 1 0 0 0 1-1V9.4"/></svg><span class="tl">返回主页</span></a>
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色">%%THEME%%<span class="tl">浅色</span></button>
        <a class="top-btn" href="../cet6.html"><span class="tl">六级专区</span></a>
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
    out = ['<nav class="qnav" aria-label="听力题号">']
    for q in items:
        out.append('<a href="#q%d">%d</a>' % (q["no"], q["no"]))
    out.append('</nav><div class="qlist">')
    gmap = {g["from"]: g for g in (groups or [])}
    for q in items:
        g = gmap.get(q["no"])
        if g:
            out.append('<div class="qgroup">Questions %d–%d · %s</div>'
                       % (g["from"], g["to"], esc(g["desc"])))
        o = q.get("opts", {})
        cells = "".join('<div class="opt"><b>%s</b><span>%s</span></div>' % (L, esc(o.get(L, "")))
                        for L in "ABCD")
        stem = ('<p class="qstem">%s</p>' % esc(q["stem"])) if q.get("stem") else ""
        out.append('<div class="qitem" id="q%d"><div class="qno">%d</div>'
                   '<div class="qbody">%s<div class="opts">%s</div></div></div>'
                   % (q["no"], q["no"], stem, cells))
    out.append("</div>")
    return "".join(out)


MARK = re.compile(r"^(Section [ABC]|Passage (One|Two)|Directions|Questions? \d|Reading Comprehension|Part [IVX]+)")
QBANK = re.compile(r"^(?:[A-O]|0)\)")
QNUM = re.compile(r"^\d{1,2}\.\s")


def reading_blocks(text):
    lines = [x.strip() for x in text.split("\n") if x.strip()]
    out = []
    i = 0
    n = len(lines)
    while i < n:
        s = lines[i]
        if re.match(r"^Section [ABC]$", s):
            out.append(("h2", s)); i += 1; continue
        if s in ("Passage One", "Passage Two"):
            out.append(("h3", s)); i += 1; continue
        if s.startswith("Directions"):
            buf = [s]; i += 1
            while i < n and not MARK.match(lines[i]) and not QNUM.match(lines[i]) and not QBANK.match(lines[i]):
                buf.append(lines[i]); i += 1
            out.append(("dir", " ".join(buf))); continue
        if QBANK.match(s):
            raw = []
            while i < n and QBANK.match(lines[i]):
                raw.append(lines[i]); i += 1
            items = {}
            for ln in raw:
                parts = re.split(r"(?<![A-Za-z])([A-O0])\)\s*", ln)
                for k in range(1, len(parts) - 1, 2):
                    v = parts[k+1].strip()
                    letter = "O" if parts[k] == "0" else parts[k]
                    if v and letter not in items:
                        items[letter] = v
            out.append(("bank", sorted(items.items()))); continue
        if QNUM.match(s):
            buf = [s]; i += 1
            while i < n and not QNUM.match(lines[i]) and not MARK.match(lines[i]) and not QBANK.match(lines[i]):
                buf.append(lines[i]); i += 1
            out.append(("q", " ".join(buf))); continue
        buf = [s]; i += 1
        while i < n and not MARK.match(lines[i]) and not QNUM.match(lines[i]) and not QBANK.match(lines[i]):
            buf.append(lines[i]); i += 1
            joined = " ".join(buf)
            if re.search(r"[.?!。？！][”\"')]?$", buf[-1]) and len(joined) >= 140:
                break
        out.append(("p", " ".join(buf)))
    return out


def render_reading(text, note=""):
    text = re.sub(r"<\d+>", "“", text)
    text = re.sub(r",(\d)\s", ", ” ", text)
    if not text.strip():
        if note:
            return '<div class="callout"><p>%s</p></div>' % esc(note)
        return '<p class="meta">本套原卷为扫描件，阅读原文暂未录入。</p>'
    blocks = reading_blocks(text)
    out = []
    for kind, val in blocks:
        if kind == "h2":
            out.append('<h3 class="rsec">%s</h3>' % esc(val))
        elif kind == "h3":
            out.append('<h4 class="rsub">%s</h4>' % esc(val))
        elif kind == "dir":
            out.append('<details class="dirbox"><summary>考试说明 Directions</summary>'
                       '<p>%s</p></details>' % esc(val))
        elif kind == "bank":
            out.append('<div class="bank">%s</div>'
                       % "".join('<span><b>%s</b>%s</span>' % (esc(a), esc(w)) for a, w in val))
        elif kind == "q":
            out.append('<p class="rq">%s</p>' % esc(val))
        else:
            out.append('<p>%s</p>' % esc(val))
    return '<div class="paper-body">%s</div>' % "".join(out)


def paragraphs(text):
    out = []
    buf = ""
    for ln in text.split("\n"):
        s = ln.strip()
        if not s:
            continue
        if re.match(r"^(Part [IVX]+|Section [ABC]|Listening Comprehension|Reading Comprehension|Writing|Translation)", s):
            if buf: out.append(buf); buf = ""
            out.append("@H@" + s)
            continue
        buf = (buf + " " + s).strip() if buf else s
        if re.search(r"[.?!。？！][”\"')]?$", s) and len(buf) >= 90:
            out.append(buf); buf = ""
    if buf: out.append(buf)
    return out


def sol_blocks(text):
    """OCR 解析册是「英文原文 / 中文讲解」交错的行，按语种分块比合并成长段好读。"""
    out = []
    cur = None
    buf = []
    def flush():
        nonlocal cur, buf
        if buf:
            out.append((cur, " ".join(buf)))
            buf = []
    for ln in text.split("\n"):
        s = ln.strip()
        if not s:
            continue
        if re.match(r"^(Part [IVX]+|Section [ABC]|Listening Comprehension|Reading Comprehension|Writing|Translation)$", s):
            flush(); cur = None
            out.append(("h", s)); continue
        if re.match(r"^\d{1,2}\s*[\.、]\s*\S", s) and len(s) < 120:
            flush(); cur = None
            out.append(("qh", s)); continue
        zh = len(re.findall(r"[\u4e00-\u9fff]", s))
        ratio = zh / max(len(s), 1)
        kind = "zh" if ratio > 0.2 else "en"
        if kind != cur:
            flush(); cur = kind
        buf.append(s)
    flush()
    return out


def render_solution(sol, has_text):
    if not sol:
        if not has_text:
            return ('<div class="callout"><p>这一套的原卷是扫描件，解析册也未做文字识别，'
                    '题目与解析暂未录入。</p></div>')
        return ('<div class="callout"><p><b>解析整理中。</b>原卷题目已经录入；'
                '解析册是扫描件，正在做文字识别与校对，完成后会补在这一节。</p></div>')
    names = [("writing", "Part I 写作"), ("listening", "Part II 听力"),
             ("reading", "Part III 阅读"), ("translation", "Part IV 翻译")]
    note = ('<div class="callout"><p><b>解析来自配套解析册的扫描件 OCR。</b>中文讲解与答案可直接检索；'
            '英文原文、范文和选项里的单词可能有识别错字（例如把撇号认成 5、把 in 认成 1n），'
            '引用到作文或翻译时请以原解析册为准。</p></div>')
    out = [note]
    for key, name in names:
        txt = sol.get(key)
        if not txt:
            continue
        body = []
        for kind, val in sol_blocks(txt):
            if kind == "h":
                body.append('<h5 class="solh">%s</h5>' % esc(val))
            elif kind == "qh":
                body.append('<h6 class="solq">%s</h6>' % esc(val))
            else:
                body.append('<p class="%s">%s</p>' % (kind, esc(val)))
        out.append('<details class="solbox"><summary>%s 解析</summary>'
                   '<div class="solbody">%s</div></details>' % (name, "".join(body)))
    if len(out) == 1:
        return '<div class="callout"><p>解析已识别，但没匹配到 Part 分段，请查看原解析册。</p></div>'
    return "".join(out)



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
        '<div class="eyebrow">CET-6 · %s · 第 %d 套</div>'
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
    body.append('<div class="sec-t"><h2 id="writing">Part I · 写作</h2><em>150–200 词，30 分钟</em></div>')
    if p.get("writing"):
        body.append('<div class="wcard"><div class="wtag">Writing · 30 分钟 · 150–200 词</div>'
                    '<p>%s</p></div>' % esc(p["writing"]))
    else:
        body.append('<div class="callout"><p>这一套原卷是扫描件，写作题干暂未录入。</p></div>')

    body.append('<div class="sec-t"><h2 id="listening">Part II · 听力</h2><em>%s</em></div>'
                % ("25 题，选项按原卷录入" if n_q else "本次未单列听力"))
    if n_q:
        body.append('<p class="meta2">听力题干由录音念出，原卷只印选项；答案与听力原文见最后一节解析。</p>')
        body.append(render_listening(p.get("listening") or [], p.get("groups") or []))

    body.append('<div class="sec-t"><h2 id="reading">Part III · 阅读</h2><em>选词填空 + 段落匹配 + 两篇仔细阅读</em></div>')
    body.append(render_reading(p.get("reading", ""), p.get("note", "")))

    body.append('<div class="sec-t"><h2 id="translation">Part IV · 翻译</h2><em>180–200 字，30 分钟</em></div>')
    if p.get("translation"):
        body.append('<div class="wcard"><div class="wtag">Translation · 30 分钟 · 180–200 字</div>'
                    '<p>%s</p></div>' % esc(p["translation"]))
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
    nav.append('<a href="../cet6.html">六级专区总览 →</a>')
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
                    .replace("%%NAV%%", build_nav("../b1.html", "cet6").replace('href="./', 'href="../'))
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
