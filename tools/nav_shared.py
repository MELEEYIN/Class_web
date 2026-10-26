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

EN_UNITS = [
    (1, "College Life", "u1"),
    (2, "Understanding Relationships", "u2"),
    (3, "Holidays and Traditions", "u3"),
    (4, "Leisure", "u4"),
    (5, "Language Learning", "u5"),
    (6, "Food and Culture", "u6"),
]

CHEV = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>')


def _item(href, no, title, on=False, unit=None):
    attrs = ' class="nv-i' + (' on' if on else '') + '"'
    attrs += ' href="' + href + '"'
    if unit:
        attrs += ' data-unit="' + unit + '"'
    return ('<a' + attrs + '><span class="no">' + no + '</span>'
            '<span class="tt">' + title + '</span><span class="mk"></span></a>')


def build_nav(unit_prefix="", active="math"):
    """unit_prefix 为空 → 单元用页内锚点；否则拼成跨页链接。
    active：当前页属于哪一栏，那一栏排前面并默认展开，另一栏收起来
            （侧栏只有两栏，不来回滚动）。
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

    math_fold = "" if active == "math" else " fold"
    en_fold = "" if active == "en" else " fold"

    math_box = (
        '<div class="nv-mod' + math_fold + '" data-mod="math">'
        '<button class="nv-h" type="button" data-fold="math"><span class="chev">' + CHEV + '</span>'
        '<b>高等数学</b><em>13</em></button>'
        '<div class="nv-list">'
        '<div class="nv-grp">上册 · 第一～七章</div>' + up +
        '<div class="nv-grp">下册 · 第八～十三章</div>' + dn +
        '</div></div>')

    en_box = (
        '<div class="nv-mod' + en_fold + '" data-mod="en">'
        '<button class="nv-h" type="button" data-fold="en"><span class="chev">' + CHEV + '</span>'
        '<b>大学英语</b><em>4</em></button>'
        '<div class="nv-list">'
        '<div class="nv-grp">第 1 册 · 六个单元</div>' + units +
        '<div class="nv-grp">其他册</div>' + others +
        '</div></div>')

    order = (en_box + math_box) if active == "en" else (math_box + en_box)
    return '<nav class="side-nav" id="nav" aria-label="站点目录">' + order + '</nav>'
