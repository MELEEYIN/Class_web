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
# 下册目前只整理到第 10 章（1–300 题），后续补到 750 题时再加 11–13。
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

    math_fold = "" if active == "math" else " fold"
    en_fold = "" if active == "en" else " fold"
    draw_fold = "" if active == "draw" else " fold"

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
        '<b>工程制图</b><em>9</em></button>'
        '<div class="nv-list">'
        '<div class="nv-grp">第一～九章</div>' + draw +
        '</div></div>')

    sw = (
        '<div class="subj-sw">'
        '<a class="' + ('on' if active == 'math' else '') + '" href="./math.html">数学</a>'
        '<a class="' + ('on' if active == 'en' else '') + '" href="./b1.html">英语</a>'
        '<a class="' + ('on' if active == 'draw' else '') + '" href="./draw.html">制图</a>'
        '</div>')

    if active == "en":
        order = en_box + draw_box + math_box
    elif active == "draw":
        order = draw_box + math_box + en_box
    else:
        order = math_box + en_box + draw_box
    return sw + '<nav class="side-nav" id="nav" aria-label="站点目录">' + order + '</nav>'
