# -*- coding: utf-8 -*-
"""
build_en_cet4.py — 生成 site/en/cet6.html（六级学习专区）

内容来源：
  · tools/data/cet6_full.json —— 从本机真题原卷 PDF 提取的写作题、翻译题、
    两篇仔细阅读的主题（2023.03–2026.06，24 套；22 套有文字层）；
  · 考试结构、分值、时间分配、命题规律、30 天计划、考场策略 —— 按公开的
    六级考试大纲与真题分布整理，作为「怎么用真题」的脚手架。

为什么单独一页：六级不是「第四册」，它有自己的题型、分值与时间轴；
放进 b1–b4 任何一册都会把「单元学习」和「应试训练」混在一起。

用法：python tools/build_en_cet4.py
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
DATA = os.path.join(HERE, "data", "cet6_full.json")
OUT = os.path.join(SITE, "cet6.html")


def esc(t):
    return html.escape(t, quote=False)


SESSIONS = [
    ("2026-06", "2026 年 6 月"), ("2025-12", "2025 年 12 月"),
    ("2025-06", "2025 年 6 月"), ("2024-12", "2024 年 12 月"),
    ("2024-06", "2024 年 6 月"), ("2023-12", "2023 年 12 月"),
    ("2023-06", "2023 年 6 月"), ("2023-03", "2023 年 3 月（延期考试）"),
]


def load():
    papers = json.load(io.open(DATA, encoding="utf-8"))["papers"]
    sessions = []
    for sid, label in SESSIONS:
        sets = sorted([p for p in papers if p["session"] == sid], key=lambda x: x["set"])
        if sets:
            sessions.append({"id": sid, "label": label, "sets": sets})
    return {"sessions": sessions}


# ----------------------------------------------------------------------
# 组件
# ----------------------------------------------------------------------
def render_session(sess):
    sid = sess["id"]
    cards = []
    for s in sess["sets"]:
        n = s["set"]
        body = []
        if s["writing"]:
            w = s["writing"]
            if len(w) > 118:
                w = w[:118].rsplit(" ", 1)[0] + " …"
            body.append('<p class="paper-w"><i>Writing</i>%s</p>' % esc(w))
        if s["translation"]:
            t = s["translation"]
            if len(t) > 76:
                t = t[:76] + "…"
            body.append('<p class="paper-t"><i>Translation</i>%s</p>' % esc(t))
        if s.get("r1") or s.get("r2"):
            rr = []
            if s.get("r1"):
                rr.append('<span><b>Passage One</b>%s</span>' % esc(s["r1"]))
            if s.get("r2"):
                rr.append('<span><b>Passage Two</b>%s</span>' % esc(s["r2"]))
            body.append('<div class="paper-r">%s</div>' % "".join(rr))
        if s["note"]:
            body.append('<p class="paper-note">%s</p>' % esc(s["note"]))
        if not body:
            body.append('<p class="paper-note">这一套的原卷没有可用文字层，题干暂未录入。</p>')
        cards.append(
            '<article class="paper" id="%s-%d">'
            '<div class="paper-h"><b><a href="./cet6/%s-%d.html">第 %d 套</a></b>'
            '<span>%s</span></div>%s'
            '<a class="paper-go" href="./cet6/%s-%d.html">打开整套（题目 + 解析）→</a></article>'
            % (sid, n, sid, n, n, esc(sess["label"]), "".join(body), sid, n))
    return (
        '<div class="sess" id="p%s">'
        '<div class="sess-h"><h3>%s</h3><em>3 套</em></div>'
        '<div class="papers">%s</div></div>'
        % (sid, esc(sess["label"]), "".join(cards)))


def render_paper_index(data):
    rows = []
    for sess in data["sessions"]:
        done = sum(1 for s in sess["sets"] if s["writing"])
        rows.append(
            '<tr><td class="p"><a href="#p%s">%s</a></td><td>%d 套</td>'
            '<td>%d 套可读</td><td>%s</td></tr>'
            % (sess["id"], esc(sess["label"]), len(sess["sets"]), done,
               "整卷题目 + 解析" if done == 3 else
               ("部分套次为扫描件" if done else "扫描件，待补")))
    return (
        '<div class="tblwrap"><table class="ctbl"><colgroup><col style="width:28%"><col style="width:12%">'
        '<col style="width:16%"><col style="width:44%"></colgroup>'
        '<thead><tr><th>考试</th><th>套数</th><th>已录入</th><th>录入范围</th></tr></thead>'
        '<tbody>@ROWS@</tbody></table></div>').replace("@ROWS@", "".join(rows))


def render_writing_bank(data):
    types = [
        ("认知与意识", "开头句是「人们越来越意识到……」或「众所周知……」，先解释这种意识从哪来，再写它带来的改变。",
         ["2023-03 人们对健康 / 环境的意识增强",
          "2023-06 终身学习与文化素养",
          "2023-12 理财、家庭教育、技能与经验",
          "2024-06 传统文化、独立学习、时间管理"]),
        ("社会现象", "引语描述一个正在发生的社会变化（社交媒体、AI、就业竞争），先举例，再评价利弊。",
         ["2025-06 求职要求提高、社交媒体、AI 应用",
          "2025-12 竞争社会、中国梦、教师影响",
          "2026-06 全球化下的学生"]),
        ("能力与品质", "引语落在「设定目标、坚持不懈、自立自强」这类品质上，主体写「为什么重要 + 怎么练」。",
         ["2024-12 设定现实目标并坚持",
          "2025-12 自强自立",
          "2023-06 独立思考与判断"]),
        ("关系与价值", "引语谈人与人、人与社会的关系（不同意见、尊师、代际沟通），主体写「如何相处 + 价值」。",
         ["2023-06 面对不同意见",
          "2024-06 师生关系",
          "2025-06 跨文化沟通"]),
    ]
    out = []
    for name, desc, examples in types:
        out.append(
            '<div class="wtype"><div class="wt-h"><b>%s</b></div>'
            '<p>%s</p><ul>%s</ul></div>'
            % (esc(name), esc(desc),
               "".join("<li>%s</li>" % esc(x) for x in examples)))
    return '<div class="wtypes">%s</div>' % "".join(out)


def render_translation_bank(data):
    rows = []
    for sess in data["sessions"]:
        for s in sess["sets"]:
            if not s["translation"]:
                continue
            rows.append(
                '<tr><td class="p">%s · 第 %d 套</td><td class="tr">%s</td></tr>'
                % (esc(sess["label"]), s["set"], esc(s["translation"])))
    return (
        '<div class="tblwrap"><table class="ctbl trtbl"><colgroup><col style="width:18%"><col style="width:82%">'
        '</colgroup><thead><tr><th>出处</th><th>中文原文</th></tr></thead><tbody>@ROWS@</tbody>'
        '</table></div>').replace("@ROWS@", "".join(rows))

HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>六级学习专区 · 课程学习站</title>
<meta name="description" content="大学英语六级学习专区：2023.03–2026.06 共 24 套真题的写作题、翻译题与阅读主题，配考试结构、分值、时间分配、命题规律与 30 天备考计划。">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20rx%3D%2715%27%20fill%3D%27%232f63f6%27%2F%3E%3Ctext%20x%3D%2732%27%20y%3D%2743%27%20font-family%3D%27Segoe%20UI%2CArial%27%20font-size%3D%2726%27%20font-weight%3D%27700%27%20fill%3D%27%23fff%27%20text-anchor%3D%27middle%27%3EC4%3C%2Ftext%3E%3C%2Fsvg%3E">
<script src="../js/boot.js"></script>
<link rel="stylesheet" href="../acm/assets/shell.css">
<link rel="stylesheet" href="../acm/assets/content.css">
<link rel="stylesheet" href="./ex.css">
<style>
/* 六级专区：真题卡与题库表格用与首页同一套变量，只补这几条 */
.doc-study .hero h1 { text-wrap: balance; }
@media (max-width: 520px) { .doc-study .hero h1 { font-size: 27px; } }
.tblwrap { overflow-x: auto; margin: 12px 0; -webkit-overflow-scrolling: touch; }
.tblwrap table { min-width: 640px; }
.tblwrap table.trtbl { min-width: 520px; }
.side-empty { margin: 0 14px 8px; font-size: 12px; color: var(--ink-4); }
.cet4-lead { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0 6px; }
.cet4-lead .k { padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.cet4-lead .k b { display: block; font-size: 23px; color: var(--accent); line-height: 1.25; }
.cet4-lead .k span { display: block; margin-top: 3px; font-size: 12.4px; color: var(--ink-3); }
@media (max-width: 760px) { .cet4-lead { grid-template-columns: 1fr; } }
.sess { margin: 26px 0 4px; }
.sess-h { display: flex; align-items: baseline; gap: 10px; margin: 0 0 10px; }
.sess-h h3 { margin: 0; font-size: 16px; }
.sess-h em { font-style: normal; font-size: 12px; color: var(--ink-4); }
.papers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1080px) { .papers { grid-template-columns: 1fr; } }
.paper { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 13px 15px; }
.paper-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding-bottom: 8px; border-bottom: 1px dashed var(--line); }
.paper-h b { font-size: 13.2px; }
.paper-h b a { color: var(--ink); text-decoration: none; }
.paper-h b a:hover { color: var(--accent); text-decoration: underline; }
.paper-h span { font-size: 11.4px; color: var(--ink-4); }
.paper-w, .paper-t { margin: 9px 0 0; font-size: 12.9px; line-height: 1.75; color: var(--ink-2); }
.paper-w i, .paper-t i { display: inline-block; margin-right: 6px; padding: 1px 6px; border-radius: 5px; background: rgb(var(--accent-rgb) / .12); color: var(--accent); font-style: normal; font-size: 11px; font-weight: 600; }
.paper-r { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.paper-r span { font-size: 11.8px; color: var(--ink-3); padding: 2px 7px; border-radius: 5px; background: rgb(var(--accent-rgb) / .07); }
.paper-r b { margin-right: 4px; color: var(--ink-2); font-weight: 600; }
.paper-go { display: inline-block; margin-top: 9px; font-size: 12.2px; }
.paper-note { margin: 8px 0 0; font-size: 11.8px; color: var(--ink-4); }
.wtypes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 14px 0; }
@media (max-width: 900px) { .wtypes { grid-template-columns: 1fr; } }
.wtype { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 13px 15px; }
.wt-h b { font-size: 13.6px; color: var(--accent); }
.wtype p { margin: 6px 0; font-size: 12.6px; color: var(--ink-2); }
.wtype ul { margin: 6px 0 0; padding-left: 18px; }
.wtype li { font-size: 12.3px; line-height: 1.8; color: var(--ink-3); }
table.ctbl { table-layout: fixed; }
table.ctbl th, table.ctbl td { padding: 8px 10px; font-size: 12.6px; line-height: 1.7; vertical-align: top; }
table.trtbl td.tr { font-size: 12.5px; line-height: 1.8; color: var(--ink-2); }
.plan { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 14px 0; }
@media (max-width: 1080px) { .plan { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .plan { grid-template-columns: 1fr; } }
.plan-w { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 13px 15px; }
.plan-w .pk2 { display: inline-block; font-size: 11px; letter-spacing: .08em; color: var(--accent); }
.plan-w b { display: block; margin: 3px 0 6px; font-size: 13.6px; }
.plan-w ul { margin: 0; padding-left: 17px; }
.plan-w li { font-size: 12.3px; line-height: 1.85; color: var(--ink-3); }
.plan-w li b { display: inline; font-size: inherit; color: var(--ink-2); }
.checklist { list-style: none; padding: 0; margin: 10px 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
@media (max-width: 760px) { .checklist { grid-template-columns: 1fr; } }
.checklist li { position: relative; padding-left: 22px; font-size: 12.7px; line-height: 1.8; color: var(--ink-2); }
.checklist li::before { content: "✓"; position: absolute; left: 2px; top: 0; color: var(--accent); font-weight: 700; }
</style>
</head>
<body data-book="cet4">
<div class="app">
  <aside class="side" id="side">
    <div class="side-top">
      <a class="brand" href="./index.html">
        <span class="brand-mark is-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5c-1.75-1.3-3.5-1.85-5.3-1.65a.95.95 0 0 0-.85.95v9.9c0 .62.53 1.09 1.15 1.02 1.55-.16 3.1.28 4.45 1.24.32.23.74.23 1.06 0 1.35-.96 2.9-1.4 4.45-1.24.62.07 1.15-.4 1.15-1.02 V5.8a.95.95 0 0 0-.85-.95c-1.8-.2-3.55.35-5.3 1.65z" fill="currentColor" fill-opacity=".96"/><path d="M12 7.7v9.4" stroke="rgba(20,40,90,.45)" stroke-width="1" stroke-linecap="round"/></svg></span>
        <span class="brand-txt"><b>课程学习站</b><small>高数 · 英语 · 六级 · 制图</small></span>
      </a>
      <button class="side-x" id="sideX" type="button" aria-label="收起侧栏">✕</button>
    </div>
    <div class="side-search">
      %%SEARCH%%
      <input id="sideSearch" type="search" placeholder="搜真题、写作、翻译…" autocomplete="off" aria-label="搜索">
      <kbd>Ctrl K</kbd>
    </div>
    <p id="searchEmpty" class="side-empty" style="display:none">没有匹配的真题</p>
    %%NAV%%
    <div class="side-foot">
      <div class="pg-t"><span>内容规模</span><b>8 次考试 · 24 套 · 22 条题库</b></div>
      <div class="side-tools">
        <a class="mini-btn" href="./cet6.html">六级专区</a>
        <a class="mini-btn" href="./b1.html">大学英语</a>
      </div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="../index.html">校园主页</a><span class="sep">/</span><a href="./index.html">课程学习站</a><span class="sep">/</span><span class="cur">六级学习专区</span></div>
      <div class="top-r">
        <a class="top-btn home-btn" href="../index.html" title="回到网站主页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6 12 4l8 6.6"/><path d="M6.4 9.4V19a1 1 0 0 0 1 1h3.1v-4.6h3v4.6h3.1a1 1 0 0 0 1-1V9.4"/></svg><span class="tl">返回主页</span></a>
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色">%%THEME%%<span class="tl">浅色</span></button>
        <a class="top-btn" href="./cet6.html"><span class="tl">六级专区</span></a>
        <a class="top-btn" href="./b1.html"><span class="tl">第 1 册</span></a>
      </div>
    </header>

    <button class="to-top" id="toTop" type="button" aria-label="回到顶部" title="回到顶部">%%TOPHAT%%</button>

    <div class="scroll" id="scroll">
      <div class="readbar"><i id="readBar"></i></div>
      <div class="view">
        <div class="stage">
          <article class="doc doc-study" id="doc">

            <header class="hero">
              <div class="eyebrow">CET-6 · 六级学习专区</div>
              <h1>六级不是四级的加长版，<span>是另一套题</span></h1>
              <p>24 套真题（2023 年 3 月—2026 年 6 月）逐套拆开：听力 25 题、阅读三节原文与题目、写作题干（150–200 词，要求抄写首句）、翻译原文（180–200 字），最后一节是解析册的答案与逐题讲解。六级难在词汇深度、听力长度和写作的「引语开头」，不是把四级题做快一点。</p>
              <div class="hero-stats">
                <div><b>8</b><span>次考试</span></div>
                <div><b>24</b><span>套真题</span></div>
                <div><b>22</b><span>套可读</span></div>
                <div><b>425</b><span>通过线</span></div>
              </div>
            </header>

            <div class="cet4-lead">
              <div class="k"><b>35% + 35%</b><span>听力 249 分、阅读 249 分，两科决定过不过</span></div>
              <div class="k"><b>15% + 15%</b><span>写作 106.5 分、翻译 106.5 分，短期最能提分</span></div>
              <div class="k"><b>130 分钟</b><span>写作 30 + 听力 30 + 阅读 40 + 翻译 30</span></div>
            </div>

            <div class="sec-t"><h2 id="exam">先看结构：分都花在哪</h2><em>六级总分 710，425 分通过；听力比四级多 5 分钟</em></div>
            <div class="tblwrap"><table class="ctbl"><colgroup><col style="width:12%"><col style="width:18%"><col style="width:16%"><col style="width:10%"><col style="width:14%"><col style="width:30%"></colgroup>
              <thead><tr><th>部分</th><th>题型</th><th>题号</th><th>题量</th><th>分值</th><th>怎么拿分</th></tr></thead>
              <tbody>
                <tr><td class="p">Part I 写作</td><td>短文写作（150–200 词）</td><td>—</td><td>1 篇</td><td>15% · 106.5</td><td>题干给一句引语，要求抄在开头；先接住这句，再展开两个理由。</td></tr>
                <tr><td class="p">Part II 听力</td><td>Section A 长对话</td><td>1–8</td><td>8 题</td><td>8% · 56.8</td><td>场景更长，先看选项判断人物关系与话题。</td></tr>
                <tr><td class="p"></td><td>Section B 讲座 / 讲话</td><td>9–15</td><td>7 题</td><td>7% · 49.7</td><td>抓演讲结构：开场观点 → 例证 → 结论。</td></tr>
                <tr><td class="p"></td><td>Section C 讲话 / 报道</td><td>16–25</td><td>10 题</td><td>20% · 142</td><td>篇幅长、信息密，顺序出题，边听边定位。</td></tr>
                <tr><td class="p">Part III 阅读</td><td>Section A 选词填空</td><td>26–35</td><td>10 题</td><td>5% · 35.5</td><td>先标词性，再看空缺的语法位置；六级词更长，别靠语感。</td></tr>
                <tr><td class="p"></td><td>Section B 段落匹配</td><td>36–45</td><td>10 题</td><td>10% · 71</td><td>先读题干圈关键词，再扫段落首尾句。</td></tr>
                <tr><td class="p"></td><td>Section C 仔细阅读</td><td>46–55</td><td>10 题</td><td>20% · 142</td><td>两篇各 5 题，顺序出题；同义替换比四级更绕。</td></tr>
                <tr><td class="p">Part IV 翻译</td><td>汉译英（180–200 字）</td><td>—</td><td>1 段</td><td>15% · 106.5</td><td>先拆句、定主谓，再补修饰；段落比四级长，注意时态统一。</td></tr>
              </tbody>
            </table></div>
            <div class="callout"><p><b>先算一笔账：</b>425 分要求听力 + 阅读合计大约 300 分（各 150 左右），写作 + 翻译合计 110 分以上。六级听力 30 分钟、信息量更大，丢分往往不是听不懂，而是「上一题没放下」——平时训练就要按整套 25 题连续做。</p></div>

            <div class="sec-t"><h2 id="papers">真题卷宗 · 24 套</h2><em>点卡片进入整卷页：题目 + 解析</em></div>
            <p class="meta">下面是每套的摘要。点「打开整套」进入整卷页：<b>听力 25 题</b>的 A–D 选项、<b>阅读三节</b>原文与题目、写作题干、翻译原文，以及解析册的<b>答案与逐题讲解</b>（按 Part 折叠）。2026 年 6 月第 1、2 套原卷是扫描件，整卷页里只有解析。</p>
            %%PAPERINDEX%%
            %%SESSIONS%%

            <div class="sec-t"><h2 id="rules">近年命题规律</h2><em>把 22 道写作题、22 段翻译按任务类型归一次类</em></div>
            <div class="sec-t" style="margin-top:18px"><h2 id="rules-w">写作：引语开头是六级的分水岭</h2><em>先抄题干给的句子，再决定结构</em></div>
            %%WRITINGTYPES%%
            <div class="callout ok"><p><b>共同点：</b>六级写作大多要求「以某句开头」，这句既是题目也是评分点 —— 不抄、抄错、抄了却不接住，都会掉档。稳妥结构：首段抄句子 + 一句转述 + 亮观点；主体两段各一个理由（举例或对比）；尾段回扣引语。</p></div>

            <div class="sec-t" style="margin-top:26px"><h2 id="rules-t">翻译：主题集中在文化与经济社会</h2><em>22 段翻译按主题归档，先背主题词再练拆句</em></div>
            <table class="ctbl"><colgroup><col style="width:22%"><col style="width:12%"><col style="width:66%"></colgroup>
              <thead><tr><th>主题</th><th>段数</th><th>出现过的题目</th></tr></thead>
              <tbody>
                <tr><td class="p">传统文化与历史</td><td>10</td><td>张骞、郑和、徐霞客、文化产品出海、传统婚礼、竹子、扇子、尊老、自强、节俭</td></tr>
                <tr><td class="p">城市与基础设施</td><td>5</td><td>城市人居环境、公共设施、南水北调、洋山港、粤港澳大湾区</td></tr>
                <tr><td class="p">科技与航天</td><td>4</td><td>天宫空间站、北斗导航、神舟飞船、无人机产业</td></tr>
                <tr><td class="p">养老与人口</td><td>3</td><td>养老模式、人口老龄化、养老服务体系建设</td></tr>
              </tbody>
            </table>
            <div class="callout"><p><b>翻译的固定套路：</b>先找主干（谁 + 做什么 + 对谁），长定语拆成短句；括号里的英文专有名词原样用；数字、年代、百分比不要漏。六级段落长，写完先通读一遍时态与主谓一致。</p></div>

            <div class="sec-t"><h2 id="writing">写作题库</h2><em>题干原文按考试时间排列</em></div>
            <p class="meta">写作不用刷完 22 道。按下面的四组各挑 2 道：先原样抄首句，再列两个理由，最后对照解析里的范文改一句。</p>
            %%WRITINGBANK%%

            <div class="sec-t"><h2 id="translation">翻译题库 · 22 段</h2><em>原文逐段录入，按主题挑着练</em></div>
            <p class="meta">顺序建议：传统文化 3 段 → 社会与发展 3 段 → 经济与科技 3 段 → 其余各 1–2 段。每段限时 10 分钟，写完对照括号里的英文提示检查专有名词。</p>
            %%TRANSLATIONBANK%%

            <div class="sec-t"><h2 id="plan">30 天备考计划</h2><em>每天 90 分钟，四周走完「摸底 → 分项 → 输出 → 模考」</em></div>
            <div class="plan">
              <div class="plan-w"><span class="pk2">WEEK 1</span><b>摸底 + 听力</b><ul>
                <li><b>Day 1</b> 一套真题严格计时，算出听力 / 阅读 / 写译三块得分。</li>
                <li><b>Day 2–6</b> 每天一套听力（30 分钟完整做）：长对话抓场景，讲座抓结构。</li>
                <li><b>Day 7</b> 回看错题：没听到、没听懂，还是选项没读完？</li></ul></div>
              <div class="plan-w"><span class="pk2">WEEK 2</span><b>阅读 + 词汇</b><ul>
                <li><b>每天</b> 选词 1 篇 + 匹配 1 篇 + 仔细阅读 2 篇，限时 40 分钟。</li>
                <li><b>词汇</b> 只背真题里出现的生词，六级词义更偏抽象，记搭配不记单字。</li>
                <li><b>Day 7</b> 二刷错题，重点看定位句与选项的同义替换。</li></ul></div>
              <div class="plan-w"><span class="pk2">WEEK 3</span><b>写作 + 翻译</b><ul>
                <li><b>写作</b> 三类各写 2 篇，共 6 篇；每篇限时 30 分钟，必须抄首句。</li>
                <li><b>翻译</b> 传统文化 / 社会 / 经济科技各 2 段，共 6 段；每段限时 10 分钟。</li>
                <li><b>背诵</b> 整理 3 个引语开头句式、6 个主体句、3 个结尾。</li></ul></div>
              <div class="plan-w"><span class="pk2">WEEK 4</span><b>全真模考</b><ul>
                <li><b>3 套</b> 按 9:00–11:20 完整做，听力结束立刻收答题卡 1。</li>
                <li><b>复盘</b> 只回看错题与超时部分，不再开新题。</li>
                <li><b>考前 2 天</b> 背写作引语模板与翻译主题词，保证睡眠。</li></ul></div>
            </div>
            <div class="callout ok"><p><b>为什么是 30 天：</b>六级的知识面不比四级深太多，真正拉开差距的是听力耐力与写作的引语处理。30 天足够把三类写作、六类翻译主题和三种阅读题型各走一遍；只剩两周时，砍掉词汇书，只做真题和模板。</p></div>

            <div class="sec-t"><h2 id="strategy">考场时间与得分策略</h2><em>130 分钟，先做什么、什么时候必须停</em></div>
            <table class="ctbl"><colgroup><col style="width:16%"><col style="width:20%"><col style="width:64%"></colgroup>
              <thead><tr><th>时间</th><th>环节</th><th>要点</th></tr></thead>
              <tbody>
                <tr><td class="p">9:00–9:10</td><td>发卷、填信息</td><td>先看写作引语，心里过一遍两个理由。</td></tr>
                <tr><td class="p">9:10–9:40</td><td>写作 30 分钟</td><td>5 分钟审题，20 分钟写，5 分钟检查首句是否抄对。</td></tr>
                <tr><td class="p">9:40–10:10</td><td>听力 30 分钟</td><td>利用读题时间扫选项；边听边涂卡，结束立即收答题卡 1。</td></tr>
                <tr><td class="p">10:15–10:55</td><td>阅读 40 分钟</td><td>选词 10 分钟 → 匹配 12 分钟 → 仔细阅读 18 分钟。</td></tr>
                <tr><td class="p">10:55–11:20</td><td>翻译 30 分钟</td><td>5 分钟拆句，20 分钟译，5 分钟查时态、单复数、专有名词。</td></tr>
              </tbody>
            </table>
            <ul class="checklist">
              <li>写作首句是否原样抄写、有没有拼错？</li>
              <li>听力有没有因为纠结上一题漏掉下一题？</li>
              <li>选词填空是否先标词性再选？</li>
              <li>段落匹配是否先读题干再回原文？</li>
              <li>翻译时态是否统一、数字年代是否漏译？</li>
              <li>答题卡 1 是否在听力结束后立即上交？</li>
              <li>作文留了 3–5 分钟检查拼写与主谓一致？</li>
              <li>最后 5 分钟是否检查答题卡 2 的题号与填涂？</li>
            </ul>

            <div class="sec-t"><h2 id="src">这些内容从哪来</h2><em>哪些是原卷原文，哪些是按公开资料补充的</em></div>
            <div class="callout ok">
              <p><b>原卷原文（22 套）</b>：写作题干、翻译中文原文、听力 25 题选项、阅读三节原文与题目，均来自本机六级真题原卷 PDF（2023.03–2026.06，共 24 套）。原卷文字层直接提取；页脚里的店铺水印已统一过滤。</p>
              <p><b>补充内容</b>：分值比例、时间分配、命题规律分类、30 天计划、考场策略与检查清单，按六级考试公开大纲与真题分布整理。</p>
              <p><b>解析</b>：解析册多为扫描件，做 OCR 后按 Part 折叠展示；解析里的英文原文可能有识别错字，页面已标注「以原解析册为准」。2026.06 第 1、2 套原卷是扫描件，题目未录入，解析仍可查看。</p>
            </div>
            <table class="ctbl"><colgroup><col style="width:24%"><col style="width:76%"></colgroup>
              <thead><tr><th>数据源</th><th>说明</th></tr></thead>
              <tbody>
                <tr><td class="p">真题原卷 PDF（24 套）</td><td>2023 年 3 月（延期）、2023 年 6 月、2023 年 12 月、2024 年 6 月、2024 年 12 月、2025 年 6 月、2025 年 12 月、2026 年 6 月，每次 3 套。</td></tr>
                <tr><td class="p">答案解析 PDF</td><td>与每套原卷配套；扫描件经 OCR 识别，仅作检索与理解用。</td></tr>
                <tr><td class="p">听力音频（MP3）</td><td>按考试时间与套次命名；本站不转存音频，需要时用本机资料目录播放。</td></tr>
                <tr><td class="p">官方考试说明</td><td>题型、题量、分值比例与流程，以教育部教育考试院与考点发布的当次说明为准。</td></tr>
              </tbody>
            </table>
            <div class="callout"><p><b>版权说明：</b>真题原文版权归原出版方与考试机构所有，本页仅用于个人备考，不提供原卷 PDF / 音频下载。</p></div>

            <div class="home-foot">
              <span>© 2026 校园主页 · 课程学习站 · 纯静态页面，不收集任何数据</span>
              <span>六级专区：24 套真题（2023.03–2026.06）· 22 套题干 · 8 次考试</span>
              <span>真题原文版权归原出版方与考试机构；答案请以原解析册为准。</span>
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


def render_writing_index(data):
    rows = []
    for sess in data["sessions"]:
        for s in sess["sets"]:
            if not s["writing"]:
                continue
            rows.append(
                '<tr><td class="p"><a href="#%s-%d">%s · 第 %d 套</a></td><td class="tr">%s</td></tr>'
                % (sess["id"], s["set"], esc(sess["label"]), s["set"], esc(s["writing"])))
    return ('<div class="tblwrap"><table class="ctbl trtbl"><colgroup><col style="width:18%"><col style="width:82%">'
            '</colgroup><thead><tr><th>出处</th><th>题干</th></tr></thead><tbody>@ROWS@</tbody></table></div>'
            ).replace("@ROWS@", "".join(rows))


def main():
    data = load()
    page = (HEAD.replace("%%NAV%%", build_nav("./b1.html", "cet6"))
                .replace("%%SEARCH%%", SEARCH)
                .replace("%%THEME%%", THEME)
                .replace("%%TOPHAT%%", TOPHAT)
                .replace("%%PAPERINDEX%%", render_paper_index(data))
                .replace("%%SESSIONS%%", "".join(render_session(s) for s in data["sessions"]))
                .replace("%%WRITINGTYPES%%", render_writing_bank(data))
                .replace("%%WRITINGBANK%%", render_writing_index(data))
                .replace("%%TRANSLATIONBANK%%", render_translation_bank(data)))
    io.open(OUT, "w", encoding="utf-8").write(page)
    n = sum(len(s["sets"]) for s in data["sessions"])
    m = sum(1 for s in data["sessions"] for x in s["sets"] if x["writing"])
    print("wrote %s (%d sets, %d with text, %d chars)" % (OUT, n, m, len(page)))


if __name__ == "__main__":
    main()
