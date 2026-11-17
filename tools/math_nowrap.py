# -*- coding: utf-8 -*-
"""把 math.html 里公式的「不换行空格」换成靠 class 控制的 nowrap。

为什么要有这一步
----------------
早期为了让短公式不拆行（`sin x` 不被拆成两行），构建时把 `.fm` 里的普通空格
全替换成了 `&#160;`（不换行空格）。桌面没问题，但窄屏上这些公式**一个字都
不能断**，于是一行长公式直接撑出容器、被裁掉——手机上表现为「右侧文字被切」。

`&#160;` 是字符本身的属性，CSS 改不回来（word-break / overflow-wrap 对
U+00A0 无效），只能在构建期还原。

现在的做法：
  · 所有 `.fm` 里的 `&#160;` 还原成普通空格 —— 长公式可以正常折行
  · 短公式（去掉标签后 ≤ 30 字）额外加 `fm-nw` 类，靠 `white-space: nowrap`
    维持「不拆行」的效果，桌面观感与原来一致

用法（在 math_practice.py 之后执行）：
    python tools/math_nowrap.py           # 处理并写回
    python tools/math_nowrap.py --check   # 只统计，不写
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "site", "en", "math.html")

OPEN = '<span class="fm">'
OPEN_NW = '<span class="fm fm-nw">'
WRAP_MAX = 30
TAG_RE = re.compile(r"<[^>]+>")
SPAN_RE = re.compile(r"<span\b|</span>")


def wrap_formulas(html):
    """逐个处理 .fm 块，正确处理嵌套 span（.fr / .lm 都在里面）。"""
    out = []
    i = 0
    n_total = n_nw = 0
    while True:
        j = html.find(OPEN, i)
        if j < 0:
            out.append(html[i:])
            break
        out.append(html[i:j])

        # 从 .fm 开头往后数，找到与之配对的 </span>
        k = j + len(OPEN)
        depth = 1
        end = -1
        while depth > 0:
            m = SPAN_RE.search(html, k)
            if not m:
                break
            if m.group(0) == "</span>":
                depth -= 1
                if depth == 0:
                    end = m.start()
                    break
            else:
                depth += 1
            k = m.end()

        if end < 0:                       # 结构异常，原样保留
            out.append(html[j:])
            break

        inner = html[j + len(OPEN):end].replace("&#160;", " ")
        plain = TAG_RE.sub("", inner).replace("&#160;", " ").strip()
        n_total += 1
        if len(plain) <= WRAP_MAX:
            n_nw += 1
            out.append(OPEN_NW + inner + "</span>")
        else:
            out.append(OPEN + inner + "</span>")
        i = end + len("</span>")

    return "".join(out), n_total, n_nw


def main():
    html = io.open(PAGE, "r", encoding="utf-8").read()
    new, total, nw = wrap_formulas(html)
    left = new.count("&#160;")
    print("公式块 %d 个（其中短公式 nowrap %d 个）；剩余 &#160; %d 处" % (total, nw, left))
    if "--check" in sys.argv:
        return
    io.open(PAGE, "w", encoding="utf-8", newline="\n").write(new)
    print("written:", PAGE, len(new), "chars")


if __name__ == "__main__":
    main()
