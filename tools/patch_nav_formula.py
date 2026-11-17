# -*- coding: utf-8 -*-
"""
patch_nav_formula.py — 把「公式总表」入口插进 /en 各页侧栏的数学分组（幂等）

为什么单独一个脚本：
    /en 下 20 多个页面的侧栏是各自构建脚本写死的，重建全部页面风险大。
    这里只在 `<div class="nv-grp">练习册 · 750 题</div>` 之前补一组「速查」，
    用 <!--fx-nav--> 标记定位，跑多少次结果都一样。

用法：
    python tools/patch_nav_formula.py          # 打补丁
    python tools/patch_nav_formula.py --dry    # 只看会改哪些文件
"""
import glob
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EN = os.path.join(ROOT, "site", "en")

ANCHOR = '<div class="nv-grp">练习册 · 750 题</div>'
BLOCK = ('<!--fx-nav--><div class="nv-grp">速查</div>'
         '<a class="nv-i" href="./math-formula.html"><span class="no">F</span>'
         '<span class="tt">公式总表 · 248 条</span><span class="mk"></span></a><!--/fx-nav-->')


def patch(path, dry=False):
    s = io.open(path, "r", encoding="utf-8").read()
    if "math-formula.html" in s:
        return False
    if ANCHOR not in s:
        return None
    s2 = s.replace(ANCHOR, BLOCK + ANCHOR, 1)
    if not dry:
        io.open(path, "w", encoding="utf-8", newline="\n").write(s2)
    return True


def main():
    dry = "--dry" in sys.argv
    changed, skipped = [], []
    for f in sorted(glob.glob(os.path.join(EN, "*.html"))):
        name = os.path.basename(f)
        if "side-nav" not in io.open(f, encoding="utf-8").read():
            skipped.append(name + "（无侧栏）")
            continue
        r = patch(f, dry)
        if r is True:
            changed.append(name)
        elif r is False:
            skipped.append(name + "（已有入口）")
    print(("[dry-run] " if dry else "") + "changed %d" % len(changed))
    for n in changed:
        print("  +", n)
    print("skipped %d: %s" % (len(skipped), ", ".join(skipped[:6]) + (" …" if len(skipped) > 6 else "")))


if __name__ == "__main__":
    main()
