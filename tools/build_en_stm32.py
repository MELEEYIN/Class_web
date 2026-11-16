# -*- coding: utf-8 -*-
"""
build_en_stm32.py — 生成 site/en/stm32.html（STM32 单片机课程页）

为什么有这个脚本：
    正文是 19 课 + 附录的 Markdown（site/en/stm32/lessons/*.md），一人一手维护；
    站点要求纯静态 HTML、双击 file:// 也能看，所以这里把 md 渲染成站点片段，
    再套上 /en 子站现成的外壳（acm/assets/shell.css + content.css + en.css + math.css）。

一篇 md 的契约见 site/en/stm32/_STYLE.md，渲染约定：

    # 05 · 标题                 → 课号 + 标题（课号同时用来生成 sNN 锚点）
    part: 第二篇 · GPIO 与显示   → 眉标签
    video: P7 – P8              → 副标题里的来源
    level: 基础                  → 右上角徽标
    lead: 一句话本质              → 课首导语
    goals:                      → 「读完你能做到」清单，直到 stats:
    - ……
    stats: 6 个库函数 · 3 个坑    → 小字信息行

    ## 一、小节                → 节标题（页内目录第二层，锚点 sNN-s1）
    ### 小标题                  → h4
    ```c 代码 ```               → .codebox > pre
    | 表 | 表 |                 → <table>
    :::tip 标题 / :::warn / :::note → .callout
    Q| 题干  / A| 答案           → .exgrp 练习组（答案默认遮住，可展开）

用法（仓库根目录）：
    python tools/build_en_stm32.py
"""
import glob
import html
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nav_shared import build_nav, stm32_box, STM32_PARTS

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site")
LESSON_DIR = os.path.join(SITE, "en", "stm32", "lessons")
OUT = os.path.join(SITE, "en", "stm32.html")

# 篇 → 课号区间（只用于统计与地图展示，渲染以 md 为准）
PARTS = [p for p, _ in STM32_PARTS]

# ---------------------------------------------------------------------------
# 行内标记
# ---------------------------------------------------------------------------
INLINE_CODE = re.compile(r"`([^`]+)`")


def inline(s):
    """**粗体** / *斜体* / `代码` / [[超链接|href]]。

    先按反引号切段：代码段里原样输出、**不再做强调解析**——否则
    `value * 3300` 这种写法里的星号会被当成斜体标记，跨代码段吃掉半行，
    最终生成不配对的 <i>（html.parser 会报 unclosed i）。
    """
    s = html.escape(s, quote=False)
    s = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r'<a href="\2">\1</a>', s)
    out = []
    for seg in re.split(r"(`[^`]+`)", s):
        if len(seg) > 1 and seg.startswith("`") and seg.endswith("`"):
            out.append("<code>" + seg[1:-1] + "</code>")
            continue
        seg = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", seg)
        seg = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<i>\1</i>", seg)
        out.append(seg)
    return "".join(out)


def slug_anchor(lid, n):
    return "%s-s%d" % (lid, n)


# ---------------------------------------------------------------------------
# 块级渲染
# ---------------------------------------------------------------------------
def render_table(rows):
    head, body = rows[0], rows[2:]
    out = ["<table><thead><tr>"]
    out += ["<th>%s</th>" % inline(c) for c in head]
    out.append("</tr></thead><tbody>")
    for r in body:
        cells = r + [""] * (len(head) - len(r))
        out.append("<tr>" + "".join("<td>%s</td>" % inline(c) for c in cells) + "</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def render_code(lang, lines):
    body = html.escape("\n".join(lines), quote=False)
    cls = ' class="language-%s"' % lang if lang else ""
    return ('<div class="codebox"><button class="cp" type="button" data-copy>复制</button>'
            "<pre><code%s>%s</code></pre></div>" % (cls, body))


CALLOUT_KIND = {"tip": "ok", "warn": "warn", "note": ""}


def render_callout(kind, title, lines):
    cls = CALLOUT_KIND.get(kind, "")
    box = '<div class="callout%s">' % (" " + cls if cls else "")
    if title:
        box += "<p><b>%s</b></p>" % inline(title)
    paras = []
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        if ln.startswith("- "):
            paras.append("<li>%s</li>" % inline(ln[2:]))
        else:
            paras.append("<p>%s</p>" % inline(ln))
    # 把连续的 li 包成 ul
    out, buf = [], []
    for p in paras:
        if p.startswith("<li>"):
            buf.append(p)
        else:
            if buf:
                out.append("<ul>" + "".join(buf) + "</ul>")
                buf = []
            out.append(p)
    if buf:
        out.append("<ul>" + "".join(buf) + "</ul>")
    return box + "".join(out) + "</div>"


def render_body(lines, lid):
    """渲染 ## 之后的全部正文。返回 html 与 (节数, 练习数)。"""
    out = []
    nsec = nex = 0
    i = 0
    n = len(lines)
    list_buf = []
    list_tag = None

    def flush_list():
        nonlocal list_buf, list_tag
        if list_buf:
            out.append("<%s>%s</%s>" % (list_tag, "".join(list_buf), list_tag))
            list_buf = []
            list_tag = None

    while i < n:
        raw = lines[i]
        ln = raw.rstrip()
        s = ln.strip()

        # 代码块
        if s.startswith("```"):
            flush_list()
            lang = s[3:].strip()
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i].rstrip())
                i += 1
            i += 1
            out.append(render_code(lang, buf))
            continue

        # 提示块
        m = re.match(r"^:::(tip|warn|note)\s*(.*)$", s)
        if m:
            flush_list()
            kind, title = m.group(1), m.group(2).strip()
            i += 1
            buf = []
            while i < n and lines[i].strip() != ":::":
                buf.append(lines[i])
                i += 1
            i += 1
            out.append(render_callout(kind, title, buf))
            continue

        # 表格
        if s.startswith("|") and i + 1 < n and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            flush_list()
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                rows.append(cells)
                i += 1
            out.append(render_table(rows))
            continue

        # 小节标题
        if s.startswith("## "):
            flush_list()
            nsec += 1
            title = s[3:].strip()
            if title.startswith("练习"):
                nsec -= 1          # 练习不算「一节」，统计里只数正文小节
                out.append('<div class="sect-h" id="%s">%s<span class="pgx">做完再看答案</span></div>'
                           % (slug_anchor(lid, 99), inline(title)))
                # 练习组：紧跟着的 Q| / A| 成对
                i += 1
                qs = []
                while i < n:
                    cur = lines[i].strip()
                    if cur.startswith("Q|"):
                        qs.append([cur[2:].strip(), []])
                    elif cur.startswith("A|"):
                        if qs:
                            qs[-1][1].append(cur[2:].strip())
                    elif cur.startswith("## "):
                        break
                    i += 1
                if qs:
                    nex += len(qs)
                    # 默认就盖住答案（先练后讲）：en.js 的 data-veil 会切 .veiled
                    box = ['<div class="exgrp veiled"><div class="exh"><b>本课练习</b> · %d 题'
                           '<span class="exk self">自编 · 按课程考点</span>'
                           '<button class="chip act" type="button" data-veil="1">显示解析</button>'
                           "</div><ol class=\"exlist\">" % len(qs)]
                    for q, ans in qs:
                        box.append("<li><p class=\"exq\">%s</p>" % inline(q))
                        box.append('<div class="exa">%s</div></li>'
                                   % "<br>".join(inline(a) for a in ans))
                    box.append("</ol></div>")
                    out.append("".join(box))
                continue
            out.append('<div class="sect-h" id="%s">%s</div>' % (slug_anchor(lid, nsec), inline(title)))
            i += 1
            continue

        # 小标题
        if s.startswith("### "):
            flush_list()
            out.append('<h4 class="expl-h">%s</h4>' % inline(s[4:].strip()))
            i += 1
            continue

        # 列表
        m = re.match(r"^[-*]\s+(.*)$", s)
        mo = re.match(r"^\d+[.)]\s+(.*)$", s)
        if m or mo:
            tag = "ul" if m else "ol"
            if list_tag and list_tag != tag:
                flush_list()
            list_tag = tag
            list_buf.append("<li>%s</li>" % inline((m or mo).group(1)))
            i += 1
            continue

        if not s:
            flush_list()
            i += 1
            continue

        # 引用块
        if s.startswith("> "):
            flush_list()
            out.append("<blockquote><p>%s</p></blockquote>" % inline(s[2:].strip()))
            i += 1
            continue

        # 普通段落（连续非空行合并）
        flush_list()
        buf = [s]
        i += 1
        while i < n:
            t = lines[i].strip()
            if (not t or t.startswith("#") or t.startswith("```") or t.startswith("|")
                    or t.startswith(":::") or re.match(r"^[-*]\s", t)
                    or re.match(r"^\d+[.)]\s", t) or t.startswith("Q|") or t.startswith("A|")
                    or t.startswith("> ")):
                break
            buf.append(t)
            i += 1
        out.append("<p>%s</p>" % inline(" ".join(buf)))

    flush_list()
    return "".join(out), nsec, nex


# ---------------------------------------------------------------------------
# 一课
# ---------------------------------------------------------------------------
BADGE = {"入门": "off", "基础": "off", "进阶": "", "难点": "warn"}


def parse_lesson(path, lid=None):
    text = io.open(path, "r", encoding="utf-8").read().replace("\r\n", "\n")
    lines = text.split("\n")
    title_line = lines[0].lstrip("# ").strip()
    no, _, name = title_line.partition(" · ")
    meta = {}
    i = 1
    goals = []
    while i < len(lines) and not lines[i].startswith("## "):
        s = lines[i].strip()
        if s.startswith("goals:"):
            i += 1
            while i < len(lines) and lines[i].strip().startswith("- "):
                goals.append(lines[i].strip()[2:])
                i += 1
            continue
        m = re.match(r"^([a-z]+):\s*(.*)$", s)
        if m:
            meta[m.group(1)] = m.group(2)
        i += 1
    body, nsec, nex = render_body(lines[i:], lid or ("s" + no))
    return dict(no=no, name=name.strip(), meta=meta, goals=goals, body=body, nsec=nsec, nex=nex)


def render_lesson(L):
    lid = "s" + L["no"]
    meta = L["meta"]
    badge_cls = BADGE.get(meta.get("level", ""), "off")
    goals = ""
    if L["goals"]:
        goals = ('<div class="callout ok stm-goal"><p><b>读完这一课你能做到</b></p><ul>'
                 + "".join("<li>%s</li>" % inline(g) for g in L["goals"]) + "</ul></div>")
    return (
        '<section class="unit stm" id="%s" data-unit="%s" data-title="%s · %s">'
        '<div class="uhead"><div class="uno">%s</div>'
        '<div class="ut"><h2 class="u2t">%s<span class="uzh">%s</span></h2>'
        '<p class="usub">%s　·　%d 节　·　%d 题</p></div>'
        '<div class="ubadges"><span class="verdict %s">%s</span>'
        '<button class="btn-done" type="button" data-unit="%s">标记已学</button></div></div>'
        '<p class="lead">%s</p>%s%s</section>'
        % (lid, lid, L["no"], L["name"], L["no"], inline(L["name"]),
           html.escape(meta.get("part", "")), html.escape(meta.get("video", "")),
           L["nsec"], L["nex"], badge_cls, html.escape(meta.get("level", "基础")),
           lid, inline(meta.get("lead", "")), goals, L["body"])
    )


# ---------------------------------------------------------------------------
# 首页区块：课程地图 / 器件清单
# ---------------------------------------------------------------------------
MAP_CSS_PARTS = [
    ("第一篇 · 起步", "把「芯片里有什么」和「工程怎么建」先弄明白", "s01"),
    ("第二篇 · GPIO 与显示", "先点亮、再读按键、然后把字显示出来", "s03"),
    ("第三篇 · 中断与定时器", "外部事件、精确定时、PWM 与测频测速", "s06"),
    ("第四篇 · 模拟与数据通路", "电压怎么变成数字，数据怎么不占 CPU 地搬", "s11"),
    ("第五篇 · 通信总线", "串口 / I2C / SPI：三条最常见的通信线", "s13"),
    ("第六篇 · 系统与可靠性", "时间、功耗、复位、掉电保存", "s16"),
]


def render_map():
    out = ['<div class="stm-map">']
    for part, desc, first in MAP_CSS_PARTS:
        out.append('<a class="stm-mc" href="#%s"><span class="stm-mk">%s</span>'
                   '<b>%s</b><span class="stm-md">%s</span></a>'
                   % (first, part.split("·")[0].strip(), part.split("·")[1].strip(), desc))
    out.append("</div>")
    return "".join(out)


BILL = [
    ("STM32F103C8T6 最小系统板", "Cortex-M3 @72MHz，64KB Flash / 20KB SRAM，板载 8MHz 晶振与复位电路", "1 块"),
    ("ST-Link V2（或 DAP-Link）", "SWD 四线下载调试：3.3V / GND / SWDIO / SWCLK", "1 个"),
    ("LED 流水灯模块（8 位）", "接 PA0–PA7，低电平点亮；没有模块就用 8 个 LED + 8 个 1kΩ 限流电阻", "1 个"),
    ("按键模块 / 轻触按键", "接 PB1、PB11，一端接 IO 一端接 GND，IO 配上拉输入", "2 个"),
    ("0.96 寸 OLED（SSD1306，I2C）", "四针：VCC / GND / SCL→PB8 / SDA→PB9", "1 块"),
    ("对射式红外传感器 / 旋转编码器", "红外 DO→PB14；编码器 A/B→PB0 / PB1（需上拉）", "各 1 个"),
    ("SG90 舵机 + TB6612 电机驱动", "舵机信号→PA1（50Hz PWM）；电机 PWMA/PWMB 与方向脚见第 08 课", "1 套"),
    ("MPU6050 六轴模块", "I2C：SCL / SDA，地址 0x68（8 位写 0xD0）", "1 块"),
    ("W25Q64 Flash 模块", "SPI：CS→PA4 / SCK→PA5 / MISO→PA6 / MOSI→PA7", "1 块"),
    ("USB 转 TTL（CH340）", "串口 PA9(TX) / PA10(RX)，交叉接，共地", "1 个"),
]


def render_bill():
    rows = "".join("<tr><td class=\"p\">%s</td><td>%s</td><td class=\"n\">%s</td></tr>"
                   % (inline(a), inline(b), c) for a, b, c in BILL)
    return ('<div class="mod"><h3><span class="mtag">清单</span>这门课要用的器件</h3>'
            '<table><colgroup><col style="width:30%%"><col style="width:56%%"><col style="width:14%%">'
            '</colgroup><thead><tr><th>器件</th><th>关键参数 / 接线</th><th>数量</th></tr></thead>'
            "<tbody>%s</tbody></table></div>" % rows)


def render_appendix():
    """附录：速查表。md 里同样写，这里直接读 apx.md 当 unit 渲染。"""
    path = os.path.join(LESSON_DIR, "99-apx.md")
    if not os.path.exists(path):
        return ""
    L = parse_lesson(path, lid="apx")
    L["no"] = "apx"
    L["meta"].setdefault("level", "速查")
    lid = "apx"
    return (
        '<section class="unit stm" id="%s" data-unit="%s" data-title="%s">'
        '<div class="uhead"><div class="uno">附</div>'
        '<div class="ut"><h2 class="u2t">%s<span class="uzh">附录</span></h2>'
        '<p class="usub">%s</p></div>'
        '<div class="ubadges"><span class="verdict off">速查</span>'
        '<button class="btn-done" type="button" data-unit="%s">标记已学</button></div></div>'
        '<p class="lead">%s</p>%s</section>'
        % (lid, lid, L["name"], inline(L["name"]), html.escape(L["meta"].get("video", "")),
           lid, inline(L["meta"].get("lead", "")), L["body"])
    )


# ---------------------------------------------------------------------------
# 页面骨架（与 math.html 同一套外壳）
# ---------------------------------------------------------------------------
HEAD = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>STM32 单片机 · 从点灯到总线 · 19 课</title>
<meta name="description" content="STM32F103C8T6 标准库入门课：GPIO、OLED、EXTI、定时器与 PWM、输入捕获、编码器、ADC、DMA、USART、I2C/MPU6050、SPI/W25Q64、RTC、低功耗、看门狗、内部 FLASH，19 课按篇推进，每课给出原理、寄存器/框图层、可直接编译的代码与练习。">
<meta name="theme-color" content="#060d1a">
<meta name="color-scheme" content="dark light">
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27g%27%20x1%3D%270%27%20y1%3D%270%27%20x2%3D%271%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%27%20stop-color%3D%27%232f63f6%27%2F%3E%3Cstop%20offset%3D%27.5%27%20stop-color%3D%27%237b7bff%27%2F%3E%3Cstop%20offset%3D%271%27%20stop-color%3D%27%231fc7ae%27%2F%3E%3C%2FlinearGradient%3E%3CclipPath%20id%3D%27c%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20rx%3D%2715%27%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20rx%3D%2715%27%20fill%3D%27url%28%23g%29%27%2F%3E%3Cg%20clip-path%3D%27url%28%23c%29%27%3E%3Cpath%20d%3D%27M-8%2042%20L64%204%20L64%20-8%20L-8%2030%20Z%27%20fill%3D%27%23fff%27%20fill-opacity%3D%27.10%27%2F%3E%3C%2Fg%3E%3Crect%20x%3D%27.9%27%20y%3D%27.9%27%20width%3D%2762.2%27%20height%3D%2762.2%27%20rx%3D%2714.2%27%20fill%3D%27none%27%20stroke%3D%27%23fff%27%20stroke-opacity%3D%27.26%27%20stroke-width%3D%271.2%27%2F%3E%3Cg%20transform%3D%27translate%2832%2032%29%20scale%281.16%29%20translate%28-32%20-32%29%27%3E%3Cpath%20d%3D%27M32%2021.8c-4.4-3.2-8.8-4.3-13.2-3.9a1.4%201.4%200%200%200-1.3%201.4v25.1c0%201%20.9%201.7%201.9%201.6%203.9-.3%207.9.7%2011.4%203.1.7.5%201.7.5%202.4%200%203.5-2.4%207.5-3.4%2011.4-3.1%201%20.1%201.9-.6%201.9-1.6V19.3c0-.7-.6-1.3-1.3-1.4-4.4-.4-8.8.7-13.2%203.9z%27%20fill%3D%27%23fff%27%20fill-opacity%3D%27.97%27%2F%3E%3Cpath%20d%3D%27M32%2024.8v23.8%27%20stroke%3D%27%233d6bd6%27%20stroke-opacity%3D%27.4%27%20stroke-width%3D%271.8%27%20stroke-linecap%3D%27round%27%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E">
<script src="../js/boot.js"></script>
<link rel="stylesheet" href="../acm/assets/shell.css">
<link rel="stylesheet" href="../acm/assets/content.css">
<link rel="stylesheet" href="./ex.css">
<link rel="stylesheet" href="./math.css">
<link rel="stylesheet" href="./stm32.css">
</head>
<body data-book="stm32">
<div class="app">
  <aside class="side" id="side">
    <div class="side-top">
      <a class="brand" href="./index.html">
        <span class="brand-mark is-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5c-1.75-1.3-3.5-1.85-5.3-1.65a.95.95 0 0 0-.85.95v9.9c0 .62.53 1.09 1.15 1.02 1.55-.16 3.1.28 4.45 1.24.32.23.74.23 1.06 0 1.35-.96 2.9-1.4 4.45-1.24.62.07 1.15-.4 1.15-1.02 V5.8a.95.95 0 0 0-.85-.95c-1.8-.2-3.55.35-5.3 1.65z" fill="currentColor" fill-opacity=".96"/><path d="M12 7.7v9.4" stroke="rgba(20,40,90,.45)" stroke-width="1" stroke-linecap="round"/></svg></span>
        <span class="brand-txt"><b>课程学习站</b><small>单片机 · 高数 · 英语</small></span>
      </a>
      <button class="side-x" id="sideX" type="button" aria-label="收起侧栏">✕</button>
    </div>
    <div class="side-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
      <input id="sideSearch" type="search" placeholder="搜外设、库函数、报错…" autocomplete="off" aria-label="搜索">
      <kbd>Ctrl K</kbd>
    </div>
    @@NAV@@
    <div class="side-foot">
      <div class="pg-t"><span>STM32 进度</span><b id="pgNum">0 / 20</b></div>
      <div class="pg-bar"><i id="pgBar"></i></div>
      <div class="side-tools"><a class="mini-btn" href="./math.html">高等数学</a></div>
    </div>
  </aside>

  <div class="main">
    <header class="top" id="top">
      <button class="burger" id="burger" type="button" aria-label="打开目录">☰</button>
      <div class="crumb"><a href="./index.html">课程学习站</a><span class="sep">/</span><span class="cur">STM32 单片机</span></div>
      <div class="top-r">
        <a class="top-btn home-btn" href="../index.html" title="回到网站主页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6 12 4l8 6.6"/><path d="M6.4 9.4V19a1 1 0 0 0 1 1h3.1v-4.6h3v4.6h3.1a1 1 0 0 0 1-1V9.4"/></svg><span class="tl">返回主页</span></a>
        <button class="top-btn" id="themeBtn" type="button" title="切换深浅色"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="3.6"/></svg><span class="tl">浅色</span></button>
        <a class="top-btn" href="./math.html"><span class="tl">高数</span></a>
      </div>
    </header>

    <button class="to-top" id="toTop" type="button" aria-label="回到顶部" title="回到顶部"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button>

    <div class="scroll" id="scroll">
      <div class="readbar"><i id="readBar"></i></div>
      <div class="view">
        <div class="stage">
          <article class="doc doc-study" id="doc">
            <header class="doc-head">
              <div class="eyebrow">课程学习站 · 单片机</div>
              <h1>STM32<span class="hno">19 课</span></h1>
              <p class="lede">从「点亮一颗 LED」走到「用 DMA 搬 ADC 数据、用 SPI 读写 Flash」的完整路径。19 课按六篇推进，每课固定四件东西：<b>这一课要解决什么问题</b>、<b>原理与寄存器/框图层</b>、<b>能直接编译的标准库代码</b>、<b>四道带解析的练习</b>。全部代码按 STM32F103C8T6 + 标准外设库 3.5.0 编写，工程结构与课程一致（Start / Library / Hardware / User）。</p>
              <div class="chips">
                <span class="chipk"><b>6</b> 篇</span>
                <span class="chipk"><b>19</b> 课</span>
                <span class="chipk"><b>@@NSEC@@</b> 节</span>
                <span class="chipk"><b>@@NEX@@</b> 道练习</span>
                <span class="chipk lv">F103C8T6 · 标准库</span>
                <span class="chipk">代码可编译</span>
              </div>
            </header>

            <div class="docbody">
              <div class="callout ok">
                <p><b>这一页怎么用</b></p>
                <p>① 手上有板子的，按课号顺序做，每课最后一定要把代码烧进去看到现象——单片机不看现象等于没学；② 没有板子的，先读「原理」和「代码」，把三个问题在心里答一遍：这个外设的时钟挂在哪条总线、要配哪几个寄存器/结构体、出错时先查哪一处；③ 每课右上角的「标记已学」会记在本机，侧栏进度条是给自己看的。</p>
                <p>课程来源是江协科技《STM32 入门教程（2023 版）》的视频目录与讲解顺序（19 课对应 P1–P49），讲义由本站按「原理 → 配置步骤 → 代码 → 坑 → 练习」重写，代码与寄存器取值都按 F103 参考手册核对过。视频里讲过的细节这里不会省，视频里跳过的「为什么」这里补上。</p>
              </div>

              <div class="sec-t"><h2 id="map">课程地图</h2><em>六篇，一条从点灯到总线的路</em></div>
              @@MAP@@

              <div class="sec-t"><h2 id="bill">开工前：器件与环境</h2><em>没有全部器件也能学，缺的模块用替代方案</em></div>
              @@BILL@@
              <div class="callout">
                <p><b>软件三件套</b>：Keil MDK5（≥5.36）+ <b>Keil.STM32F1xx_DFP</b> 器件包 + <b>STSW-STM32054</b>（标准外设库 3.5.0）。仿真器驱动装 ST-Link 或 DAP-Link 的 CDC 驱动；串口助手用任意一款都行，课程里出现的波特率统一 9600。</p>
                <p><b>没有板子怎么办</b>：Keil 的软件仿真（Debug → Use Simulator）能看变量、单步执行，但 GPIO / OLED / 串口这类「看现象」的部分仿真不出来。建议至少备一块最小系统板 + ST-Link，三十几块钱，比看视频有效得多。</p>
              </div>

              @@LESSONS@@
              @@APX@@

              <div class="home-foot">
                <span>© 2026 校园主页 · 课程学习站 · 纯静态页面，进度只存本机</span>
                <span>STM32F103C8T6 · 标准外设库 3.5.0 · 19 课对应课程视频 P1–P49</span>
                <span>寄存器取值与库函数签名按《STM32F10x 参考手册》RM0008 与标准库头文件核对；板级接线以套件丝印为准。</span>
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
<script src="./stm32.js"></script>
</body>
</html>
"""


def main():
    files = sorted(glob.glob(os.path.join(LESSON_DIR, "[0-9][0-9]-*.md")))
    files = [f for f in files if not os.path.basename(f).startswith("99-")]
    lessons = [parse_lesson(f) for f in files]
    body = "".join(render_lesson(L) for L in lessons)
    nsec = sum(L["nsec"] for L in lessons)
    nex = sum(L["nex"] for L in lessons)

    page = HEAD.replace("@@NAV@@", build_nav("", "stm32"))
    page = page.replace("@@MAP@@", render_map())
    page = page.replace("@@BILL@@", render_bill())
    page = page.replace("@@LESSONS@@", body)
    page = page.replace("@@APX@@", render_appendix())
    page = page.replace("@@NSEC@@", str(nsec))
    page = page.replace("@@NEX@@", str(nex))
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("written: %s  %d 课 / %d 节 / %d 题 / %d chars"
          % (OUT, len(lessons), nsec, nex, len(page)))


if __name__ == "__main__":
    main()
