# -*- coding: utf-8 -*-
"""
build_en_math750.py — 生成 site/en/math750.html（高等数学 · 750 题栏目）

数据来源：宋浩《高等数学（上册）精选 750 题》题目册 + 答案册，
已整理成 tools/data/math750_up.json（questions / answers / notes 三段）。

公式在**构建期**用 KaTeX 渲染成静态 HTML（tools/katex_render.mjs），
页面不带任何 JS 渲染器，也不闪 $...$。

用法：
    python tools/build_en_math750.py
"""
import io
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site")
OUT = os.path.join(SITE, "en", "math750.html")
DATA = os.path.join(HERE, "data", "math750_up.json")
TMP_IN = os.path.join(ROOT, ".tmp_katex_in.json")
TMP_OUT = os.path.join(ROOT, ".tmp_katex_out.json")

sys.path.insert(0, HERE)
from nav_shared import build_nav

RAW = json.load(io.open(DATA, encoding="utf-8"))
Q = RAW["questions"]
A = RAW["answers"]
NOTES = RAW.get("notes", {})

TAG_CLASS = {"基础题": "t-base", "中等题": "t-mid", "较高题": "t-high", "综合题": "t-hard"}

# ----------------------------------------------------------------------
# 1. 公式：先抽出来，统一交给 KaTeX 渲染
# ----------------------------------------------------------------------
MATH_RE = re.compile(r"\$\$(.+?)\$\$|\$(.+?)\$", re.S)
_tex = []          # [(latex, display)]
_index = {}        # latex -> placeholder


def protect(text):
    """把 $...$ / $$...$$ 换成占位符，避免后面的 markdown 处理破坏公式"""
    global _tex

    def repl(m):
        tex = m.group(1) if m.group(1) is not None else m.group(2)
        display = m.group(1) is not None
        key = ("D" if display else "I") + tex
        if key not in _index:
            _index[key] = "@@M%d@@" % len(_tex)
            _tex.append((tex, display))
        return _index[key]

    return MATH_RE.sub(repl, text)


def render_all():
    json.dump({"formulas": _tex}, io.open(TMP_IN, "w", encoding="utf-8"), ensure_ascii=False)
    subprocess.run(["node", os.path.join(HERE, "katex_render.mjs"), TMP_IN, TMP_OUT],
                   check=True, shell=(os.name == "nt"))
    html = json.load(io.open(TMP_OUT, encoding="utf-8"))["html"]
    for f in (TMP_IN, TMP_OUT):
        try:
            os.remove(f)
        except OSError:
            pass
    return {("@@M%d@@" % i): h for i, h in enumerate(html)}


# ----------------------------------------------------------------------
# 2. 轻量 markdown：粗体、换行、答案解析标签
# ----------------------------------------------------------------------
def md_lite(text, placeholders):
    s = text.replace("\r\n", "\n").strip()
    s = s.replace("**答案**", '<span class="lbl lbl-a">答案</span>')
    s = s.replace("**解析**", '<span class="lbl lbl-s">解析</span>')
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s, flags=re.S)
    s = s.replace("\n", "<br>")
    for k, v in placeholders.items():
        s = s.replace(k, v)
    return s


# ----------------------------------------------------------------------
# 3. 结构：章 → 节 → 题
# ----------------------------------------------------------------------
def build_tree():
    chapters = []
    seen_ch, seen_sec = {}, {}
    for qid in sorted(Q, key=lambda x: int(x)):
        q = Q[qid]
        ch, sec = q["ch"], q["sec"]
        if ch not in seen_ch:
            seen_ch[ch] = {"title": ch, "secs": [], "_idx": {}}
            chapters.append(seen_ch[ch])
        c = seen_ch[ch]
        if sec not in c["_idx"]:
            c["_idx"][sec] = {"title": sec, "qs": [], "note": NOTES.get(ch + "||" + sec, "")}
            c["secs"].append(c["_idx"][sec])
        c["_idx"][sec]["qs"].append({
            "id": qid, "tag": q.get("tag", ""), "body": q.get("body", ""),
            "ans": A.get(qid, "")
        })
    return chapters


TREE = build_tree()

# 先算出所有公式，再渲染
PLAIN = {}
for ch in TREE:
    for sec in ch["secs"]:
        sec["body_h"] = [protect(x["body"]) for x in sec["qs"]]
        sec["ans_h"] = [protect(x["ans"]) for x in sec["qs"]]
        sec["note_h"] = protect(sec["note"]) if sec["note"] else ""

PH = render_all()


def q_html(ch_i, sec_i, qi, item, body_ph, ans_ph):
    tag = item["tag"]
    cls = TAG_CLASS.get(tag, "t-base")
    return (
        '<article class="q" id="q%s" data-tag="%s">'
        '<header class="qh">'
        '<span class="qn">%s</span>'
        '<span class="qtag %s">%s</span>'
        '</header>'
        '<div class="qb">%s</div>'
        '<details class="ans"><summary>答案与解析</summary>'
        '<div class="ab">%s</div></details>'
        '</article>'
        % (item["id"], tag, item["id"], cls, tag, md_lite(body_ph, PH), md_lite(ans_ph, PH))
    )


def chapter_html(ch, ci):
    total = sum(len(s["qs"]) for s in ch["secs"])
    secs_html = []
    for si, sec in enumerate(ch["secs"]):
        items = "".join(q_html(ci, si, 0, q, sec["body_h"][i], sec["ans_h"][i])
                        for i, q in enumerate(sec["qs"]))
        note = ("<details class=\"note\"><summary>本节知识点与公式</summary><div class=\"nb\">%s</div></details>"
                % md_lite(sec["note_h"], PH)) if sec["note"] else ""
        secs_html.append(
            '<div class="sect-h" id="q-ch%d-s%d">%s<span class="pgx">%d 题</span></div>%s'
            '<div class="qlist">%s</div>'
            % (ci, si + 1, sec["title"], len(sec["qs"]), note, items))
    return (
        '<section class="unit" id="q-ch%d" data-title="%s">\n'
        '<div class="uhead">\n'
        '<div class="uno">%02d</div>\n'
        '<div class="ut"><h2 class="u2t">%s<span class="uzh">%d 题</span></h2>'
        '<p class="usub">%d 节 · %d 题</p></div>\n'
        '</div>\n%s\n</section>'
        % (ci, ch["title"], ci, ch["title"], total, len(ch["secs"]), total, "".join(secs_html)))


def stats():
    from collections import Counter
    c = Counter(q.get("tag", "") for q in Q.values())
    return len(Q), len(TREE), sum(len(x["secs"]) for x in TREE), c


NQ, NCH, NSEC, TAGS = stats()

HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>高等数学 750 题 · 上册 1–150</title>
<meta name="description" content="宋浩《高等数学（上册）精选750题》第 1–150 题：题目、答案与解析逐题对照，按章、节归类，答案默认折叠。">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
@@ICON@@
<script src="../js/boot.js"></script>
<link rel="stylesheet" href="../acm/assets/shell.css">
<link rel="stylesheet" href="../acm/assets/content.css">
<link rel="stylesheet" href="./ex.css">
<link rel="stylesheet" href="./math.css">
<link rel="stylesheet" href="./math750.css">
</head>
<body data-book="m750">
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
      <input id="sideSearch" type="search" placeholder="搜题号、关键词、公式…" autocomplete="off" aria-label="搜索">
      <kbd>Ctrl K</kbd>
    </div>
    @@NAV@@
    <div class="side-foot">
      <div class="pg-t"><span>题量</span><b>上册 150 / 750</b></div>
      <div class="side-tools">
        <a class="mini-btn" href="./math.html">高数正课</a>
      </div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="./index.html">课程学习站</a><span class="sep">/</span><a href="./math.html">高等数学</a><span class="sep">/</span><span class="cur">750 题</span></div>
      <div class="top-r">
        <a class="top-btn home-btn" href="../index.html" title="回到网站主页">@@HOMEBTN@@</a>
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色">@@THEME@@<span class="tl">浅色</span></button>
        <a class="top-btn" href="./math.html"><span class="tl">高数正课</span></a>
      </div>
    </header>

    <button class="to-top" id="toTop" type="button" aria-label="回到顶部" title="回到顶部">@@TOPHAT@@</button>

    <div class="scroll" id="scroll">
      <div class="readbar"><i id="readBar"></i></div>
      <div class="view">
        <div class="stage">
          <article class="doc doc-study" id="doc">
            <header class="doc-head">
              <div class="eyebrow">课程学习站 · 高等数学 · 练习册</div>
              <h1>750 题<span class="hno">上册 1–150</span></h1>
              <p class="lede">宋浩《高等数学（上册）精选 750 题》的题目册 + 答案册，按题号一一对照：先自己做，再点开「答案与解析」。全书 750 题连续编号，这里先放 <b>第 1–150 题</b>，全部按讲义章、节归类，方便跟着正课进度刷。</p>
              <div class="chips">
                <span class="chipk"><b>@@NQ@@</b> 题</span>
                <span class="chipk"><b>@@NCH@@</b> 章 · <b>@@NSEC@@</b> 节</span>
                <span class="chipk lv">基础 @@TB@@ · 中等 @@TM@@</span>
                <span class="chipk lv">较高 @@TH@@ · 综合 @@TX@@</span>
              </div>
            </header>

            <div class="docbody">
              <div class="callout ok">
                <p><b>怎么刷</b></p>
                <p>① 遮住答案，先按题号自己做一遍；② 卡住时点「答案与解析」，重点看解析里<b>第一步怎么想到的</b>，不是看结果；③ 每节开头有「本节知识点与公式」，忘了就先扫一眼；④ 做错的题在题号上点一下（会变蓝），下次打开还在。</p>
                <p>题目与答案来自《高等数学（上册）精选 750 题》（宋浩主编）扫描件整理；公式用 KaTeX 排版。整理过程中个别符号可能有出入，以纸质书为准。</p>
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

SEARCH = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
          'stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>')
THEME = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
         'stroke-linecap="round" stroke-linejoin="round">'
         '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'
         '<circle cx="12" cy="12" r="3.6"/></svg>')
TOPHAT = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          'stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>')
HOMEBTN = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" '
           'stroke-linejoin="round"><path d="M4 10.6 12 4l8 6.6"/>'
           '<path d="M6.4 9.4V19a1 1 0 0 0 1 1h3.1v-4.6h3v4.6h3.1a1 1 0 0 0 1-1V9.4"/></svg>'
           '<span class="tl">返回主页</span>')


def main():
    math = io.open(os.path.join(SITE, "en", "math.html"), encoding="utf-8").read()
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
                .replace("@@HOMEBTN@@", HOMEBTN)
                .replace("@@NAV@@", build_nav("./b1.html", "math"))
                .replace("@@CHAPTERS@@", "\n".join(chapter_html(ch, i + 1) for i, ch in enumerate(TREE)))
                .replace("@@NQ@@", str(NQ))
                .replace("@@NCH@@", str(NCH))
                .replace("@@NSEC@@", str(NSEC))
                .replace("@@TB@@", str(TAGS.get("基础题", 0)))
                .replace("@@TM@@", str(TAGS.get("中等题", 0)))
                .replace("@@TH@@", str(TAGS.get("较高题", 0)))
                .replace("@@TX@@", str(TAGS.get("综合题", 0))))
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("questions", NQ, "chapters", NCH, "sections", NSEC, "formulas", len(_tex))
    print("written:", OUT, len(page))


if __name__ == "__main__":
    main()
