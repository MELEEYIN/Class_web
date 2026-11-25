# -*- coding: utf-8 -*-
"""
build_en_electronics.py — 生成 site/en/electronics/index.html（电子与单片机资料库导览页）

12 套教程的正文是整站离线包原样镜像（electronic/ 与 mcu/ 两个目录），
不重写、不裁剪；这里只做统一入口：本站外壳、侧栏、分区卡片、12 章电路目录、
使用说明与来源声明。

用法（仓库根目录）：
    python tools/build_en_electronics.py
"""
import html
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_en_stm32 as base
from nav_shared import build_nav

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "site", "en", "electronics.html")

CIRCUIT = [
    ("02", "第 2 章", "电阻电路的等效变换"),
    ("03", "第 3 章", "电阻电路的一般分析"),
    ("04", "第 4 章", "电路定理"),
    ("05", "第 5 章", "含有运算放大器的电阻电路"),
    ("06", "第 6 章", "储能元件（电容与电感）"),
    ("07", "第 7 章", "一阶电路和二阶电路的时域分析"),
    ("08", "第 8~9 章", "相量法与正弦稳态电路分析"),
    ("09", "第 9 章（教材第 10 章）", "含耦合电感的电路与变压器"),
    ("10", "第 10 章（教材第 11 章）", "电路的频率响应与谐振"),
    ("11", "第 11 章（教材第 12 章）", "三相电路"),
    ("12", "第 12 章（教材第 13 章）", "非正弦周期电流电路"),
    ("13", "第 13 章（教材第 14、16 章）", "复频域分析与二端口网络"),
]

COURSES = [
    # 电子信息基础（电路主卡在页面里单独渲染）
    dict(kind="电子", no="02", title="数字电子技术基础",
         kicker="15 章 · 两周通关",
         desc="从数制与码制、逻辑代数与卡诺图，讲到门电路、组合逻辑、触发器、时序逻辑与 555 定时器；每章带例题、易错点与自测。",
         tags=["352 KB", "15 章", "答案折叠"],
         href="electronic/digital.html"),
    dict(kind="电子", no="03", title="时序逻辑 · 傻子都听得懂",
         kicker="12 节 · 7 张手绘图",
         desc="从「记忆是怎么来的」开始，用大白话讲触发器、寄存器、计数器与状态机；适合学完数电组合部分、卡在时序上的读者。",
         tags=["12 节", "7 张手绘图", "零基础"],
         href="electronic/seq.html"),
    # 微机与单片机
    dict(kind="微机", no="04", title="51 单片机详细教程",
         kicker="35 章 + 2 附录 · 26 图",
         desc="对齐普中官方 35 章：从点亮 LED 到 GPIO、中断、定时器、串口、总线、传感器、TFT 彩屏与 RS485；附录补电子元件与模块结构。",
         tags=["35 章", "26 张图", "普中体系"],
         href="mcu/51mcu.html"),
    dict(kind="微机", no="05", title="STM32 入门教程 · 深度版",
         kicker="22 章 · 37 张课件图",
         desc="按 207 页课件重做，每章补足网课缺的理论：寄存器位、总线分层、逐次逼近、开漏线与、波特率误差、Flash 只能 1→0。",
         tags=["22 章", "5.0 MB", "深度版"],
         href="mcu/stm32.html"),
    dict(kind="微机", no="06", title="STM32 入门教程 · 江协科技版",
         kicker="15 章 49 节 · 44 张图",
         desc="完全按江协科技课件与视频原顺序讲解；每节含课件原图、视频要点、代码与公式，并对照参考手册与数据手册。",
         tags=["15 章 49 节", "3.0 MB", "跟课版"],
         href="mcu/stm32-jx.html"),
    dict(kind="微机", no="07", title="STM32 TIM 定时器",
         kicker="13 节 · 22 张图",
         desc="把时基单元讲透，再到 PWM、舵机、输入捕获与编码器接口；适合已经会点灯、想在定时器上补一课的人。",
         tags=["13 节", "2.1 MB", "专题"],
         href="mcu/tim.html"),
    dict(kind="微机", no="08", title="蓝桥杯嵌入式 G431 实战",
         kicker="12 章 · 对齐真题题型",
         desc="从考场规则讲到板级电路、时钟树与外设寄存器原理；每章一个「深挖」小节与可手算的数字，面向蓝桥杯嵌入式赛项。",
         tags=["12 章", "G431", "蓝桥杯"],
         href="mcu/g431.html"),
    dict(kind="微机", no="09", title="STM32F103C8T6 HAL 库",
         kicker="14 章 · 11 类外设",
         desc="每类外设一张函数速查表（原型逐条核对），讲透阻塞/中断/DMA 三种模式，并汇总 20 个高频坑。",
         tags=["14 章", "HAL", "速查表"],
         href="mcu/hal.html"),
    dict(kind="微机", no="10", title="51 单片机汇编语言",
         kicker="14 天 · 5 张图",
         desc="两周速通 51 汇编：指令字节数与周期数、定时器初值、串口波特率全部实算，适合想看懂底层时序与反汇编的读者。",
         tags=["14 天", "汇编", "实算"],
         href="mcu/asm.html"),
    dict(kind="微机", no="11", title="微机原理与接口技术",
         kicker="12 篇 · 43 张对照表",
         desc="8086 体系 12 篇：数制、寻址、汇编、译码、8259A / 8255A / 8253 / 8251A、A/D 与总线；用对照表梳理芯片引脚与工作方式。",
         tags=["12 篇", "8086", "43 张表"],
         href="mcu/micro.html"),
    dict(kind="微机", no="12", title="51 入门前置知识",
         kicker="1 套 · 269 KB",
         desc="学 51 之前该补的数电、电路与 C 语言基础，按「用得上什么」组织；从电压、二进制到点亮第一颗 LED 之前的知识都在这。",
         tags=["前置", "图解", "零基础"],
         href="mcu/prep.html"),
]


def card(c):
    tags = "".join("<span>%s</span>" % html.escape(t) for t in c["tags"])
    return ('<a class="elc-card" href="./electronics/%s">'
            '<span class="elc-kicker">%s · %s</span>'
            '<h3>%s</h3><p>%s</p>'
            '<div class="elc-tags">%s</div>'
            '<span class="elc-go">打开教程 →</span></a>'
            % (c["href"], "电子信息基础" if c["kind"] == "电子" else "微机与单片机",
               html.escape(c["kicker"]), html.escape(c["title"]),
               html.escape(c["desc"]), tags))


def circuit_card():
    chs = "".join(
        '<a class="elc-ch" href="./electronics/electronic/circuit-%s.html">'
        '<span class="elc-ch-no">%s</span><span class="elc-ch-tt">%s</span></a>'
        % (no, html.escape(label), html.escape(name)) for no, label, name in CIRCUIT)
    return ('<article class="elc-card elc-wide">'
            '<span class="elc-kicker">电子信息基础 · 12 章 · 约 10 小时</span>'
            '<h3>邱关源《电路》· 30 分钟速通</h3>'
            '<p>从第 2 章到第 13 章，每章 30 分钟：先给「这一章到底在讲什么」的地图，再按站点拆公式、画电路图、逐题演算。'
            '第 6 版章节号与教材第 14 章后的内容在页面里单独标注，避免对不上书。</p>'
            '<div class="elc-chapters">%s</div>'
            '<a class="elc-go" href="./electronics/electronic/circuit-02.html">从第 2 章开始 →</a>'
            '</article>' % chs)


DOC_HEAD = """<header class="doc-head">
              <div class="eyebrow">课程学习站 · 电子与单片机</div>
              <h1>电子与单片机<span class="hno">12 套 · 23 页</span></h1>
              <p class="lede">把「电路 → 数电 → 时序逻辑 → 51 / 汇编 / 微机 → STM32 → HAL / 定时器 / G431」串成一条底层硬件路线。12 套教程全部来自整站离线包，按原样镜像，保留每套自己的章节分页、搜索、深色模式与学习进度；这里只做一张统一入口与目录。</p>
              <div class="chips">
                <span class="chipk"><b>2</b> 个分区</span>
                <span class="chipk"><b>12</b> 套教程</span>
                <span class="chipk"><b>23</b> 个页面</span>
                <span class="chipk"><b>150+</b> 章节课时</span>
                <span class="chipk lv">《电路》12 章</span>
                <span class="chipk">离线可读</span>
              </div>
            </header>"""

INTRO = """<div class="callout ok">
                <p><b>这是什么</b></p>
                <p>这是从「杨人的学习网站」（suanjing-tutorial.pages.dev）整站离线包里整理出的电子与单片机资料库，收录 2 个分区、12 套教程、23 个页面。每套教程都是一个独立页面，保留原站的章节分页、侧栏搜索、深色模式和「标记已学」进度；各教程的进度独立记在本机，互不影响。</p>
                <p>它和本站原有课程的关系是「精简课 vs 完整教程」：本站的<a href="./de.html">数字电子技术 9 章</a>、<a href="./ae.html">模拟电子技术 10 章</a>、<a href="./stm32.html">STM32 标准库 19 课</a>、<a href="./stm32-hal.html">HAL 库 24 课</a> 是按考点重写的短课；资料库收的是原站更长的教程，适合想系统读一遍、或需要更多例题与图解的场合。两边目录都保留，按需要进。</p>
                <p><b>建议路径</b>：电路 12 章 → 数电 → 时序逻辑 → 51 入门前置 → 51 单片机（或汇编）→ STM32 江协版 → TIM 专题 → HAL/G431 → 微机原理。只想补一块，就直接从侧栏点对应教程。</p>
              </div>"""
HEAD = base.HEAD
HEAD = HEAD.replace(
    "<title>STM32 单片机 · 从点灯到总线 · 19 课</title>",
    "<title>电子与单片机资料库 · 12 套教程 · 23 页</title>")
HEAD = re.sub(
    r'<meta name="description" content="[^"]*">',
    '<meta name="description" content="电子与单片机资料库：邱关源《电路》12 章、数字电子技术、'
    '时序逻辑、51 单片机 35 章、STM32 深度版/江协版、TIM 定时器、蓝桥杯 G431、'
    'F103C8T6 HAL 库、51 汇编、微机原理与接口技术、51 前置知识，共 12 套教程 23 个页面，'
    '保留原教程的分页、搜索、进度与深色模式。">',
    HEAD, count=1)
HEAD = HEAD.replace('<link rel="stylesheet" href="./stm32.css">',
                    '<link rel="stylesheet" href="./stm32.css">\n'
                    '<link rel="stylesheet" href="./electronics.css">')
HEAD = HEAD.replace('<body data-book="stm32">', '<body data-book="elec">')
HEAD = HEAD.replace('<span class="brand-txt"><b>课程学习站</b><small>单片机 · 高数 · 英语</small></span>',
                    '<span class="brand-txt"><b>课程学习站</b><small>电子 · 单片机 · 高数</small></span>')
HEAD = HEAD.replace('<div class="pg-t"><span>STM32 进度</span><b id="pgNum">0 / 20</b></div>',
                    '<div class="pg-t"><span>资料库</span><b>12 套 · 23 页</b></div>')
HEAD = HEAD.replace('<div class="pg-bar"><i id="pgBar"></i></div>', '')
HEAD = HEAD.replace('<a class="mini-btn" href="./math.html">高等数学</a>',
                    '<a class="mini-btn" href="./index.html">课程学习站</a>')
HEAD = HEAD.replace('<span class="cur">STM32 单片机</span>',
                    '<span class="cur">电子与单片机</span>')
HEAD = HEAD.replace('<a class="top-btn" href="./math.html"><span class="tl">高数</span></a>',
                    '<a class="top-btn" href="./index.html"><span class="tl">课程站</span></a>')
HEAD = HEAD.replace('placeholder="搜外设、库函数、报错…"',
                    'placeholder="搜教程、章节、器件…"')
HEAD = re.sub(r'<header class="doc-head">.*?</header>', DOC_HEAD, HEAD, count=1, flags=re.S)
HEAD = re.sub(r'<div class="callout ok">\s*<p><b>这一页怎么用</b></p>.*?</div>',
              INTRO, HEAD, count=1, flags=re.S)
FOOT = """<div class="home-foot">
                <span>© 2026 校园主页 · 课程学习站 · 电子与单片机资料库 · 进度只存本机</span>
                <span>12 套教程 / 23 个页面，来自「杨人的学习网站」整站离线包</span>
                <span>内容版权归原作者；本页仅做离线镜像、目录整合与统一入口，原教程的分页、搜索与主题保持原样。</span>
              </div>"""
HEAD = re.sub(r'<div class="home-foot">.*?</div>', FOOT, HEAD, count=1, flags=re.S)

# 删掉从标准库页继承下来的「课程地图 / 开工前 / 软件三件套」残块：
# 资料库页的正文从 INTRO 直接进入 BODY（BODY 自己带地图与卡片）。
_start = HEAD.find('<div class="sec-t"><h2 id="map">')
_end = HEAD.find('@@LESSONS@@')
if _start != -1 and _end != -1 and _end > _start:
    HEAD = HEAD[:_start] + '@@LESSONS@@' + HEAD[_end + len('@@LESSONS@@'):]

BODY = """<div class="callout ok">
                <p><b>怎么用这一页</b></p>
                <p>① 每张卡片打开的就是教程第一页，教程内部有自己的侧栏（左侧菜单按钮）与章节切换；② 页内的「标记已学」记在本机，换教程各记各的；③ 原站页面默认浅色，右上角/侧栏的按钮可切深色；④ 手机上看，点左上角菜单按钮展开章节列表。</p>
              </div>

              <div class="sec-t"><h2 id="map">资料库地图</h2><em>2 个分区，12 套教程，23 个页面</em></div>
              <div class="elc-split">
                <a class="elc-mapcard" href="#elec"><span class="elc-kicker">01 / ELECTRONICS</span><b>电子信息基础</b><p>电路 12 章 · 数字电子技术 · 时序逻辑</p><span class="elc-go">3 套 · 14 页 →</span></a>
                <a class="elc-mapcard" href="#mcu"><span class="elc-kicker">02 / MCU &amp; MICRO</span><b>微机与单片机</b><p>51 · STM32 · HAL · TIM · G431 · 汇编 · 8086</p><span class="elc-go">9 套 · 9 页 →</span></a>
              </div>

              <div class="sec-t"><h2 id="elec">电子信息基础</h2><em>先把电路与数字逻辑的地基打牢</em></div>
              <div class="elc-grid">
                @@CIRCUIT@@
                @@ELEC_CARDS@@
              </div>

              <div class="sec-t"><h2 id="mcu">微机与单片机</h2><em>从 51 到 STM32，再到 8086 体系</em></div>
              <div class="elc-grid">
                @@MCU_CARDS@@
              </div>

              <div class="sec-t"><h2 id="how">和本站课程怎么配合</h2><em>短课按考点，资料库按体系</em></div>
              <table><thead><tr><th>主题</th><th>本站精简课程</th><th>资料库完整教程</th></tr></thead><tbody>
                <tr><td class="p">电路</td><td>—</td><td>邱关源《电路》12 章 → <code>circuit-02</code></td></tr>
                <tr><td class="p">数字电子</td><td>[[数字电子技术 9 章|./de.html]]</td><td>数字电子技术基础 15 章 → <code>digital</code></td></tr>
                <tr><td class="p">模拟电子</td><td>[[模拟电子技术 10 章|./ae.html]]</td><td>资料库暂未收（原站无独立模电分册）</td></tr>
                <tr><td class="p">时序逻辑</td><td>数电第 5–6 章</td><td>时序逻辑专题 12 节 → <code>seq</code></td></tr>
                <tr><td class="p">51 / 汇编 / 微机</td><td>—</td><td>51 35 章、汇编 14 天、微机 12 篇</td></tr>
                <tr><td class="p">STM32</td><td>[[标准库 19 课|./stm32.html]]</td><td>深度版 22 章 / 江协版 15 章 49 节</td></tr>
                <tr><td class="p">STM32 HAL</td><td>[[HAL 库 24 课|./stm32-hal.html]]</td><td>F103C8T6 HAL 14 章 → <code>hal</code></td></tr>
                <tr><td class="p">定时器</td><td>标准库第 07–10 课</td><td>TIM 专题 13 节 → <code>tim</code></td></tr>
              </tbody></table>

              <div class="callout">
                <p><b>两套 STM32 教程怎么选</b>：江协科技版是「跟课版」，15 章 49 节完全按视频顺序，适合第一次学、想边看视频边对照；深度版是「重做版」，22 章按 207 页课件重排，补了寄存器位、总线分层、逐次逼近、开漏线与、波特率误差等理论，适合已经看过一遍、想补「为什么」的人。两套都保留，先跟课再深挖，或直接按需查章节。</p>
                <p><b>《电路》章节号对不上教材</b>：原教程从第 2 章开始（第 1 章是电路模型与定律），且第 9 页起有「教材第 10 章」之类的偏移标注。看页内标题的括号说明即可，不要只按文件名判断章号。</p>
              </div>

              <div class="sec-t"><h2 id="src">来源与说明</h2><em>离线镜像，不是重写</em></div>
              <div class="callout">
                <p>全部 12 套教程来自「杨人的学习网站」（suanjing-tutorial.pages.dev）的整站离线包，原作者未提供公开 GitHub 仓库；本站按离线包原样镜像到 <code>/en/electronics/</code>，只把页内「返回首页」链接改到本资料库首页。教程中的代码、公式、插图与文字版权归原作者，本站仅做离线保存、目录整合与统一入口。</p>
                <p>如果你在原站看到更新，以原站为准；镜像页不会自动同步。原站的「编程语言」「算法竞赛」两个分区未纳入本资料库，避免与本站英语/算法子站重复。</p>
              </div>"""


def main():
    grids = {}
    grids["CIRCUIT"] = circuit_card()
    grids["ELEC_CARDS"] = "".join(card(c) for c in COURSES if c["kind"] == "电子")
    grids["MCU_CARDS"] = "".join(card(c) for c in COURSES if c["kind"] == "微机")
    body = BODY
    for k, v in grids.items():
        body = body.replace("@@" + k + "@@", v)
    # 主体里的 markdown 链接 [[文字|href]] 转成 a
    body = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r'<a href="\2">\1</a>', body)
    body = body.replace("@@NAV@@", "")
    page = HEAD.replace("@@NAV@@", build_nav("./b1.html", "elec", elec_prefix="./electronics/"))
    page = page.replace("@@MAP@@", "")
    page = page.replace("@@BILL@@", "")
    page = page.replace("@@LESSONS@@", body)
    page = page.replace("@@APX@@", "")
    page = page.replace("@@NSEC@@", "150+")
    page = page.replace("@@NEX@@", "—")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("written:", OUT, len(page), "chars")


if __name__ == "__main__":
    main()