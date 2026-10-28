# -*- coding: utf-8 -*-
"""把「节末练习」与「章首图解」拼进 site/en/math.html。

为什么要单独一个脚本：math.html 是 tools/build_en_math.py 的生成产物，
重跑生成器会把手写的练习/图解冲掉。改完生成器后按顺序跑：

    python tools/build_en_math.py      # 生成页面骨架
    python tools/math_explain.py       # 注入逐节讲解（tools/en_math_explain/）
    python tools/math_practice.py      # 注入节末练习 + 章首图解（本脚本）
    python tools/build_en_home.py      # 首页统计等

数据源（都在仓库里，和页面一起版本化管理）
    tools/en_math_practice/ex/mN-sK.html   每节 1~2 个 <div class="ex">…</div>
    tools/en_math_practice/fig/mN.html     <p class="fig-intro">…</p> + 1~2 个 <figure class="fig">

插入位置
    练习：该节 <ol class="kpt"> 的 </ol> 之后（讲解块在它前面，不能被误伤）
    图解：本章 <p class="lead">…</p> 之后

幂等：插入的块用 <!--EX:…--> / <!--FIG:…--> 包住，重跑先整块剥离。

用法
    python tools/math_practice.py --check   只检查覆盖与结构，不写回
    python tools/math_practice.py           写回 site/en/math.html
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MATH = os.path.join(ROOT, "site", "en", "math.html")
EXDIR = os.path.join(HERE, "en_math_practice", "ex")
FIGDIR = os.path.join(HERE, "en_math_practice", "fig")

SKIP_TAGS = re.compile(r"<(?:script|style|iframe|link)\b", re.I)


def read(path):
    return io.open(path, encoding="utf-8").read()


def strip_old(html):
    """剥掉上一次拼进去的块（含标记），返回干净 HTML。"""
    html = re.sub(r"\n?<!--EX:[\w-]+-->[\s\S]*?<!--/EX:[\w-]+-->\n?", "", html)
    html = re.sub(r"\n?<!--FIG:[\w-]+-->[\s\S]*?<!--/FIG:[\w-]+-->\n?", "", html)
    return html


def sections_of(html):
    """章 → [节 id]，按文档顺序。"""
    out = {}
    for m in re.finditer(r'<div class="sect-h" id="(m\d+-s\d+)"', html):
        sid = m.group(1)
        out.setdefault(sid.split("-")[0], []).append(sid)
    return out


def problems(sid, frag):
    errs = []
    if SKIP_TAGS.search(frag):
        errs.append("含 script/style/iframe")
    if re.search(r"\$[^<\s]{1,20}\$", frag):
        errs.append("疑似 LaTeX $…$")
    if re.search(r"\\frac|\\lim|\\int", frag):
        errs.append("含 LaTeX 命令")
    if "http" in frag:
        errs.append("含外链")
    n_ex = len(re.findall(r'<div class="ex">', frag))
    if n_ex == 0:
        errs.append("没有 .ex 例题块")
    n_dt = len(re.findall(r'<details class="ex-a">', frag))
    if n_ex != n_dt:
        errs.append("例题与 details 数量不一致（%d vs %d）" % (n_ex, n_dt))
    if n_ex != len(re.findall(r'<p class="ex-q">', frag)):
        errs.append("例题与题面数量不一致")
    for tag in ("div", "details", "p", "ol", "li"):
        o = len(re.findall(r"<%s[\s>]" % tag, frag))
        c = len(re.findall(r"</%s>" % tag, frag))
        if o != c:
            errs.append("<%s> 开闭不配平 %d/%d" % (tag, o, c))
    return errs


def check_fig(ch, frag):
    errs = []
    if SKIP_TAGS.search(frag):
        errs.append("含 script/style")
    if "<svg" not in frag:
        errs.append("没有 <svg>")
    if len(re.findall(r'<figure class="fig">', frag)) != len(re.findall(r"<figcaption", frag)):
        errs.append("figure 与 figcaption 数量不一致")
    if "viewBox" not in frag:
        errs.append("svg 缺 viewBox")
    for tag in ("figure", "svg", "p"):
        o = len(re.findall(r"<%s[\s>]" % tag, frag))
        c = len(re.findall(r"</%s>" % tag, frag))
        if o != c:
            errs.append("<%s> 不配平 %d/%d" % (tag, o, c))
    return errs


def kpt_end(html, sid):
    """返回该节 <ol class="kpt"> 的 </ol> 结束位置；找不到返回 -1。

    注意：节标题与知识点列表之间现在是「逐节讲解」块（里面有 ul/ol），
    所以必须从 <ol class="kpt" 起算，不能直接找第一个 </ol>。
    """
    m = re.search(r'<div class="sect-h" id="' + re.escape(sid) + r'">', html)
    if not m:
        return -1
    o = html.find('<ol class="kpt"', m.end())
    if o < 0:
        return -1
    # 讲解块在 kpt 之前插入时，kpt 仍在其后；这里只找从 o 开始的第一个 </ol>
    close = html.find("</ol>", o)
    if close < 0:
        return -1
    return close + len("</ol>")


def main():
    do_write = "--check" not in sys.argv
    html = read(MATH)
    html = strip_old(html)
    secs = sections_of(html)

    ex_all, fig_all, missing, bad = {}, {}, [], []
    for ch, sids in secs.items():
        for sid in sids:
            p = os.path.join(EXDIR, sid + ".html")
            if not os.path.exists(p):
                missing.append(sid)
                continue
            frag = read(p).strip()
            errs = problems(sid, frag)
            if errs:
                bad.append((sid, errs))
            ex_all[sid] = frag
        fp = os.path.join(FIGDIR, ch + ".html")
        if os.path.exists(fp):
            frag = read(fp).strip()
            errs = check_fig(ch, frag)
            if errs:
                bad.append((ch + ".fig", errs))
            fig_all[ch] = frag
        else:
            missing.append(ch + ".fig")

    total_sec = sum(len(v) for v in secs.values())
    print("章节 %d · 小节 %d · 练习文件 %d · 图解文件 %d"
          % (len(secs), total_sec, len(ex_all), len(fig_all)))
    if missing:
        print("缺失 %d 个：%s" % (len(missing), ", ".join(missing)))
    if bad:
        print("结构问题：")
        for sid, errs in bad:
            print("  ", sid, "→", "；".join(errs))
    if not do_write:
        return

    ins = []
    for sid, frag in ex_all.items():
        pos = kpt_end(html, sid)
        if pos < 0:
            print("跳过（找不到节或知识点列表）", sid)
            continue
        block = ('\n<!--EX:%s-->\n<div class="exset" data-ex="%s">\n%s\n</div>\n<!--/EX:%s-->'
                 % (sid, sid, frag, sid))
        ins.append((pos, block))
    for ch, frag in fig_all.items():
        m = re.search(r'(<section class="unit mth" id="' + re.escape(ch) + r'"[\s\S]*?)<p class="lead">[\s\S]*?</p>', html)
        if not m:
            print("跳过（找不到 lead）", ch)
            continue
        block = '\n<!--FIG:%s-->\n%s\n<!--/FIG:%s-->' % (ch, frag, ch)
        ins.append((m.end(), block))

    ins.sort(key=lambda x: x[0], reverse=True)
    for pos, block in ins:
        html = html[:pos] + block + html[pos:]

    io.open(MATH, "w", encoding="utf-8", newline="").write(html)
    print("写入 %s：插入 %d 块，%d 字符" % (MATH, len(ins), len(html)))


if __name__ == "__main__":
    main()