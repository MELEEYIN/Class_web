# -*- coding: utf-8 -*-
"""
nav_shared.py — /en 三个页面（首页 / 高等数学 / 大学英语第 1 册）共用的侧栏

只有一个原则：侧栏就两栏 —— 数学一栏、英语一栏，不再有「课程总览」那种
把同样的链接又列一遍的分组。品牌区点回首页，其余入口一律走这两栏。

用法：
    from nav_shared import build_nav
    html = build_nav()                    # 单元用页内锚点 #u1（第 1 册页）
    html = build_nav("./b1.html")          # 单元跨页链接（首页 / 高数页）
"""

MATH_CH = [
    (1, "函数与极限"), (2, "导数与微分"), (3, "中值定理与导数应用"), (4, "不定积分"),
    (5, "定积分"), (6, "定积分的应用"), (7, "微分方程"),
    (8, "向量代数与空间解析几何"), (9, "多元函数微分法"), (10, "重积分"),
    (11, "曲线积分"), (12, "曲面积分"), (13, "无穷级数"),
]

DRAW_CH = [
    (1, "制图的基本知识"), (2, "正投影法基础"), (3, "立体的投影"),
    (4, "轴测投影图"), (5, "组合体视图"), (6, "机件常用的表达方法"),
    (7, "标准件、齿轮和弹簧"), (8, "零件图"), (9, "装配图"),
    (10, "几何元素间的相对位置"), (11, "换面法"), (12, "截交线"),
    (13, "相贯线"), (14, "尺寸标注的方法"), (15, "计算机绘图入门"),
]

# 四级学习专区（/en/cet4.html）：侧栏只列「备考 + 8 次考试 + 题库」，
# 不把 24 套试卷逐条铺开，否则侧栏会被挤出可视区。
CET4_SESSIONS = [
    ("2026-06", "2026 年 6 月", "26.6"),
    ("2025-12", "2025 年 12 月", "25.12"),
    ("2025-06", "2025 年 6 月", "25.6"),
    ("2024-12", "2024 年 12 月", "24.12"),
    ("2024-06", "2024 年 6 月", "24.6"),
    ("2023-12", "2023 年 12 月", "23.12"),
    ("2023-06", "2023 年 6 月", "23.6"),
    ("2023-03", "2023 年 3 月（延期）", "23.3"),
]

CET6_SESSIONS = [
    ("2026-06", "2026 年 6 月", "26.6"),
    ("2025-12", "2025 年 12 月", "25.12"),
    ("2025-06", "2025 年 6 月", "25.6"),
    ("2024-12", "2024 年 12 月", "24.12"),
    ("2024-06", "2024 年 6 月", "24.6"),
    ("2023-12", "2023 年 12 月", "23.12"),
    ("2023-06", "2023 年 6 月", "23.6"),
    ("2023-03", "2023 年 3 月（延期）", "23.3"),
]

EN_UNITS = [
    (1, "College Life", "u1"),
    (2, "Understanding Relationships", "u2"),
    (3, "Holidays and Traditions", "u3"),
    (4, "Leisure", "u4"),
    (5, "Language Learning", "u5"),
    (6, "Food and Culture", "u6"),
]

# 750 题练习册**按章拆页**（见 tools/build_en_math750.py）：
# 上册第 1 章沿用 math750.html，其余 math750-N.html；下册从 math750-8.html 起。
# 下册现已整理全 750 题（第 8–13 章）。
M750_UP = [
    ("m750-1", "./math750.html", "第1章", "函数与极限"),
    ("m750-2", "./math750-2.html", "第2章", "导数与微分"),
    ("m750-3", "./math750-3.html", "第3章", "中值定理"),
    ("m750-4", "./math750-4.html", "第4章", "不定积分"),
    ("m750-5", "./math750-5.html", "第5章", "定积分"),
    ("m750-6", "./math750-6.html", "第6章", "定积分应用"),
    ("m750-7", "./math750-7.html", "第7章", "微分方程"),
]
M750_DOWN = [
    ("m750-8", "./math750-8.html", "第8章", "向量与空间解析几何"),
    ("m750-9", "./math750-9.html", "第9章", "多元函数微分"),
    ("m750-10", "./math750-10.html", "第10章", "重积分"),
    ("m750-11", "./math750-11.html", "第11章", "曲线积分"),
    ("m750-12", "./math750-12.html", "第12章", "曲面积分"),
    ("m750-13", "./math750-13.html", "第13章", "无穷级数"),
]


def _vols(cur, part="up"):
    """练习册按章做成小格子：逐条列出会把当前页挤出可视区。"""
    rows = [("上册", M750_UP), ("下册", M750_DOWN)]
    out = []
    for label, items in rows:
        out.append('<div class="nv-sub">' + label + '</div><div class="nv-vols">')
        for key, href, chip, name in items:
            on = " on" if key == cur else ""
            out.append('<a class="nv-vol%s" href="%s" title="%s %s">%s</a>'
                       % (on, href, label, name, chip))
        out.append('</div>')
    return "".join(out)

CHEV = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>')

# ---------------------------------------------------------------- STM32（正文由 tools/build_en_stm32.py 从
# site/en/stm32/lessons/*.md 渲染到 site/en/stm32.html）。
# 与正文一致是硬约束：改这里必须同时改 md 的编号与标题，否则侧栏、进度、
# 页内目录三处会对不上。
AE_CH = [
    (1, "常用半导体器件"), (2, "基本放大电路"), (3, "多级与差分放大"),
    (4, "集成运算放大电路"), (5, "频率响应"), (6, "反馈放大电路"),
    (7, "信号的运算与处理"), (8, "波形产生与信号转换"),
    (9, "功率放大电路"), (10, "直流电源"),
]

DE_CH = [
    (1, "数制与码制"), (2, "逻辑代数基础"), (3, "门电路"), (4, "组合逻辑电路"),
    (5, "锁存器与触发器"), (6, "时序逻辑电路"), (7, "存储器"),
    (8, "脉冲发生与整形"), (9, "A/D 与 D/A 转换"),
]

STM32_PARTS = [
    ("第一篇 · 起步", [
        ("s01", "认识 STM32 与最小系统板"),
        ("s02", "建工程：Keil、标准库与第一个 main"),
    ]),
    ("第二篇 · GPIO 与显示", [
        ("s03", "GPIO 输出：LED 与蜂鸣器"),
        ("s04", "GPIO 输入：按键与光敏传感器"),
        ("s05", "OLED：用软件 I2C 驱动 SSD1306"),
    ]),
    ("第三篇 · 中断与定时器", [
        ("s06", "EXTI 外部中断：红外计次与旋转编码器"),
        ("s07", "TIM 定时中断：给系统装一个心跳"),
        ("s08", "输出比较与 PWM：呼吸灯、舵机、直流电机"),
        ("s09", "输入捕获：测频率与占空比"),
        ("s10", "编码器接口：正交解码测速"),
    ]),
    ("第四篇 · 模拟与数据通路", [
        ("s11", "ADC：把电压读成 12 位数字"),
        ("s12", "DMA：让数据自己搬家"),
    ]),
    ("第五篇 · 通信总线", [
        ("s13", "USART 串口：收发、数据包与串口下载"),
        ("s14", "I2C 与 MPU6050：六轴姿态传感器"),
        ("s15", "SPI 与 W25Q64：外部 Flash"),
    ]),
    ("第六篇 · 系统与可靠性", [
        ("s16", "Unix 时间戳与 RTC / BKP：断电也不丢的时间"),
        ("s17", "PWR 电源控制：睡眠、停止、待机"),
        ("s18", "看门狗：让跑飞的程序自己回来"),
        ("s19", "内部 FLASH 与芯片 ID：把参数存进芯片里"),
    ]),
]

STM32_APPENDIX = ("apx", "速查表：库函数 · 报错 · 接线")


def stm32_box(open_by_default=False, href="./stm32.html"):
    """侧栏里的 STM32 一栏。open_by_default=True 用在 stm32.html 自己那页。"""
    mod = "nv-mod" if open_by_default else "nv-mod fold"
    out = ['<!--stm32-nav--><div class="' + mod + '" data-mod="stm32">'
           '<button class="nv-h" type="button" data-fold="stm32"><span class="chev">' + CHEV + '</span>'
           '<b>STM32 单片机</b><em>19</em></button><div class="nv-list">']
    n = 0
    for part, lessons in STM32_PARTS:
        out.append('<div class="nv-grp">' + part + '</div>')
        for lid, title in lessons:
            n += 1
            out.append(_item('%s#%s' % (href, lid), '%02d' % n, title, unit=lid))
    out.append('<div class="nv-grp">附录</div>')
    out.append(_item('%s#%s' % (href, STM32_APPENDIX[0]), '附', STM32_APPENDIX[1],
                     unit=STM32_APPENDIX[0]))
    out.append('</div></div><!--/stm32-nav-->')
    return "".join(out)


CHEV = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>')


def _item(href, no, title, on=False, unit=None):
    attrs = ' class="nv-i' + (' on' if on else '') + '"'
    attrs += ' href="' + href + '"'
    if unit:
        attrs += ' data-unit="' + unit + '"'
    return ('<a' + attrs + '><span class="no">' + no + '</span>'
            '<span class="tt">' + title + '</span><span class="mk"></span></a>')


def build_nav(unit_prefix="", active="math", cur=""):
    """unit_prefix 为空 → 单元用页内锚点；否则拼成跨页链接。
    active：当前页属于哪一栏，那一栏排前面并默认展开，另一栏收起来
            （侧栏只有两栏，不来回滚动）。
    cur：当前页在侧栏里的标识（如 "m750-3"），用于高亮同一页的条目。
    """
    up = "".join(_item("./math.html#m%d" % n, "%02d" % n, t) for n, t in MATH_CH[:7])
    dn = "".join(_item("./math.html#m%d" % n, "%02d" % n, t) for n, t in MATH_CH[7:])

    if unit_prefix:
        units = "".join(_item("%s#%s" % (unit_prefix, uid), "%02d" % n, title)
                        for n, title, uid in EN_UNITS)
    else:
        units = "".join(_item("#" + uid, "%02d" % n, title, unit=uid)
                        for n, title, uid in EN_UNITS)

    others = "".join(_item("./%s.html" % b, b.upper(), "第 %s 册" % b[1])
                     for b in ("b2", "b3", "b4"))

    draw = "".join(_item("./draw.html#d%d" % n, "%02d" % n, t) for n, t in DRAW_CH)
    draw_a = "".join(_item("./draw.html#d%d" % n, "%02d" % n, t) for n, t in DRAW_CH if n <= 9)
    draw_b = "".join(_item("./draw.html#d%d" % n, "%02d" % n, t) for n, t in DRAW_CH if n > 9)

    math_fold = "" if active == "math" else " fold"
    en_fold = "" if active == "en" else " fold"
    cet4_fold = "" if active == "cet4" else " fold"
    cet6_fold = "" if active == "cet6" else " fold"
    draw_fold = "" if active == "draw" else " fold"
    de_fold = "" if active == "de" else " fold"
    ae_fold = "" if active == "ae" else " fold"

    math_box = (
        '<div class="nv-mod' + math_fold + '" data-mod="math">'
        '<button class="nv-h" type="button" data-fold="math"><span class="chev">' + CHEV + '</span>'
        '<b>高等数学</b><em>13</em></button>'
        '<div class="nv-list">'
        '<div class="nv-grp">上册 · 第一～七章</div>' + up +
        '<div class="nv-grp">下册 · 第八～十三章</div>' + dn +
        '<div class="nv-grp">练习册 · 750 题</div>' +
        _vols(cur) +
        '</div></div>')

    en_box = (
        '<div class="nv-mod' + en_fold + '" data-mod="en">'
        '<button class="nv-h" type="button" data-fold="en"><span class="chev">' + CHEV + '</span>'
        '<b>大学英语</b><em>4</em></button>'
        '<div class="nv-list">'
        '<div class="nv-grp">第 1 册 · 六个单元</div>' + units +
        '<div class="nv-grp">其他册</div>' + others +
        '</div></div>')

    draw_box = (
        '<div class="nv-mod' + draw_fold + '" data-mod="draw">'
        '<button class="nv-h" type="button" data-fold="draw"><span class="chev">' + CHEV + '</span>'
        '<b>工程制图</b><em>15</em></button>'
        '<div class="nv-list">'
        '<div class="nv-grp">课件 · 第一～九章</div>' + draw_a +
        '<div class="nv-grp">字幕专题 · 第十～十五章</div>' + draw_b +
        '</div></div>')

    cet4_box = (
        '<div class="nv-mod' + cet4_fold + '" data-mod="cet4">'
        '<button class="nv-h" type="button" data-fold="cet4"><span class="chev">' + CHEV + '</span>'
        '<b>四级学习专区</b><em>22</em></button>'
        '<div class="nv-list">'
        '<div class="nv-grp">备考</div>' +
        _item("./cet4.html#exam", "01", "考试结构与分值") +
        _item("./cet4.html#rules", "02", "近年命题规律") +
        _item("./cet4.html#plan", "03", "30 天备考计划") +
        '<div class="nv-grp">真题卷宗 · 8 次考试</div>' +
        _item("./cet4.html#papers", "ALL", "24 套真题总览") +
        "".join(_item("./cet4.html#p%s" % sid, chip, title)
                for sid, title, chip in CET4_SESSIONS) +
        '<div class="nv-grp">题库</div>' +
        _item("./cet4.html#writing", "W", "写作题库 · 22 题") +
        _item("./cet4.html#translation", "T", "翻译题库 · 22 段") +
        _item("./cet4-drill.html", "DR", "专项练习") +
        '</div></div>')

    cet6_box = (
        '<div class="nv-mod' + cet6_fold + '" data-mod="cet6">'
        '<button class="nv-h" type="button" data-fold="cet6"><span class="chev">' + CHEV + '</span>'
        '<b>六级学习专区</b><em>24</em></button>'
        '<div class="nv-list">'
        '<div class="nv-grp">备考</div>' +
        _item("./cet6.html#exam", "01", "考试结构与分值") +
        _item("./cet6.html#rules", "02", "近年命题规律") +
        _item("./cet6.html#plan", "03", "30 天备考计划") +
        '<div class="nv-grp">真题卷宗 · 8 次考试</div>' +
        _item("./cet6.html#papers", "ALL", "24 套真题总览") +
        "".join(_item("./cet6.html#p%s" % sid, chip, title)
                for sid, title, chip in CET6_SESSIONS) +
        '<div class="nv-grp">题库</div>' +
        _item("./cet6.html#writing", "W", "写作题库") +
        _item("./cet6.html#translation", "T", "翻译题库") +
        _item("./cet6-drill.html", "DR", "专项练习") +
        '</div></div>')

    # 侧栏顶部的科目方框已按需求移除：各页只保留目录树，入口都在目录分组里

    de_box = (
        '<div class="nv-mod' + de_fold + '" data-mod="de">'
        '<button class="nv-h" type="button" data-fold="de"><span class="chev">' + CHEV + '</span>'
        '<b>数字电子技术</b><em>9</em></button>'
        '<div class="nv-list">'
        '<div class="nv-grp">九章 · 期末速成</div>' +
        "".join(_item("./de.html#c%d" % n, "%02d" % n, t) for n, t in DE_CH) +
        '<div class="nv-grp">速查</div>' +
        _item("./de.html#formula", "FX", "公式速查") +
        '</div></div>')

    ae_box = (
        '<div class="nv-mod' + ae_fold + '" data-mod="ae">'
        '<button class="nv-h" type="button" data-fold="ae"><span class="chev">' + CHEV + '</span>'
        '<b>模拟电子技术</b><em>10</em></button>'
        '<div class="nv-list">'
        '<div class="nv-grp">十章 · 期末速成</div>' +
        "".join(_item("./ae.html#c%d" % n, "%02d" % n, t) for n, t in AE_CH) +
        '<div class="nv-grp">速查</div>' +
        _item("./ae.html#formula", "FX", "公式速查") +
        '</div></div>')

    stm_box = stm32_box(open_by_default=(active == "stm32"))

    if active == "cet4":
        order = cet4_box + cet6_box + de_box + ae_box + en_box + draw_box + math_box + stm_box
    elif active == "cet6":
        order = cet6_box + cet4_box + de_box + ae_box + en_box + draw_box + math_box + stm_box
    elif active == "en":
        order = en_box + cet4_box + cet6_box + de_box + ae_box + draw_box + math_box + stm_box
    elif active == "draw":
        order = draw_box + math_box + en_box + cet4_box + cet6_box + de_box + ae_box + stm_box
    elif active == "ae":
        order = ae_box + math_box + en_box + cet4_box + cet6_box + de_box + draw_box + stm_box
    elif active == "de":
        order = de_box + ae_box + math_box + en_box + cet4_box + cet6_box + draw_box + stm_box
    elif active == "stm32":
        order = stm_box + de_box + ae_box + math_box + en_box + cet4_box + cet6_box + draw_box
    else:
        order = math_box + en_box + cet4_box + cet6_box + de_box + ae_box + draw_box + stm_box
    return '<nav class="side-nav" id="nav" aria-label="站点目录">' + order + '</nav>'
