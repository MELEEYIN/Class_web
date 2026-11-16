# -*- coding: utf-8 -*-
"""
patch_nav_stm32.py — 把 STM32 一栏插进 /en 各页的侧栏（幂等）

为什么单独一个脚本：
    /en 下十几个页面（首页、高数、四册英语、四六级、制图、750 题 13 页）
    的侧栏 HTML 是各自由 tools/build_en_*.py 写死的，重建全部页面风险大。
    这里只做一件最小的事：在每个页面的 <nav class="side-nav" id="nav"> 里补上
    STM32 模块，已存在就替换（靠 <!--stm32-nav--> 标记定位），跑多少次结果都一样。

用法（仓库根目录）：
    python tools/patch_nav_stm32.py          # 打补丁
    python tools/patch_nav_stm32.py --dry    # 只看会改哪些文件
"""
import glob
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EN = os.path.join(ROOT, "site", "en")

sys.path.insert(0, HERE)
from nav_shared import stm32_box

MARK_BEGIN = "<!--stm32-nav-->"
MARK_END = "<!--/stm32-nav-->"
BLOCK_RE = re.compile(re.escape(MARK_BEGIN) + r".*?" + re.escape(MARK_END), re.S)
NAV_OPEN_RE = re.compile(r'<nav class="side-nav" id="nav"[^>]*>')


def patch(path, block, dry=False):
    src = io.open(path, "r", encoding="utf-8").read()
    orig = src

    if MARK_BEGIN in src:
        src = BLOCK_RE.sub(block, src, count=1)
    else:
        m = None
        for m in NAV_OPEN_RE.finditer(src):
            break
        if not m:
            return None
        # 找到该 <nav> 对应的 </nav>
        end = src.find("</nav>", m.end())
        if end < 0:
            return None
        src = src[:end] + block + src[end:]

    if src == orig:
        return False
    if not dry:
        io.open(path, "w", encoding="utf-8", newline="\n").write(src)
    return True


def main():
    dry = "--dry" in sys.argv
    block = stm32_box(open_by_default=False)
    files = sorted(glob.glob(os.path.join(EN, "*.html")))
    changed, skipped = [], []
    for f in files:
        name = os.path.basename(f)
        if name == "stm32.html":
            skipped.append(name + "（本页由 build_en_stm32.py 生成，含展开版）")
            continue
        r = patch(f, block, dry)
        if r is None:
            skipped.append(name + "（没有侧栏 nav）")
        elif r:
            changed.append(name)
    print(("[dry-run] " if dry else "") + "changed %d / %d" % (len(changed), len(files)))
    for n in changed:
        print("  +", n)
    for n in skipped:
        print("  -", n)


if __name__ == "__main__":
    main()
