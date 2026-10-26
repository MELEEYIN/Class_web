#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把「逐节讲解」块注入 site/en/math.html。

为什么需要这个脚本
------------------
site/en/math.html 是 tools/build_en_math.py 生成出来的。逐节讲解（每节 900–1600 字
的讲义式正文，含定义 / 定理 / 推导 / 例题）体量太大，不适合塞进生成器的模板串，
因此单独存放为 tools/en_math_explain/mN.html，由本脚本在生成之后拼接进去。

用法（在仓库根目录执行）
------------------------
    python tools/math_explain.py            # 注入 / 覆盖旧块
    python tools/math_explain.py --check    # 只报告覆盖情况，不写文件

注意：如果重新跑了 tools/build_en_math.py，math.html 会回到没有讲解的状态，
需要再执行一次本脚本（本脚本幂等，重复执行结果不变）。

块格式
------
    <!--EXPL:m1-s1-->
    <div class="explain" data-expl="m1-s1"> … </div>
    <!--/EXPL:m1-s1-->

插入位置：<div class="sect-h" id="m1-s1"> 与紧随其后的 <ol class="kpt"> 之间，
这样右栏目录（en.js 里按 sect-h 找下一个 ol.kpt）仍然是「章 → 节 → 知识点」三级。
"""

import glob
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "site", "en", "math.html")
SRC_DIR = os.path.join(ROOT, "tools", "en_math_explain")
INFO = os.path.join(ROOT, "tmp", "ch", "info.json")

STRIP_RE = re.compile(r"\n?<!--EXPL:[\w-]+-->[\s\S]*?<!--/EXPL:[\w-]+-->\n?")
BLOCK_RE = re.compile(r"<!--EXPL:(m\d+-s\d+)-->\s*([\s\S]*?)\s*<!--/EXPL:\1-->")
FORBIDDEN = ("<script", "<style", "http://", "https://", "\\frac", "\\int", " style=")


def load_blocks():
    blocks, bad = {}, []
    for path in sorted(glob.glob(os.path.join(SRC_DIR, "m*.html"))):
        if "_" in os.path.basename(path):
            continue
        text = io.open(path, encoding="utf-8").read()
        for m in BLOCK_RE.finditer(text):
            sid, body = m.group(1), m.group(2).strip()
            for pat in FORBIDDEN:
                if pat in body:
                    bad.append((sid, pat))
            blocks[sid] = body
    return blocks, bad


def section_ids():
    if not os.path.exists(INFO):
        print("! 缺少 tmp/ch/info.json，无法确定节 id；改用页面中出现的 sect-h id")
        return []
    info = json.load(io.open(INFO, encoding="utf-8"))
    return [sec[0] for ch in info for sec in ch["secs"]]


def main():
    check_only = "--check" in sys.argv
    html = io.open(PAGE, encoding="utf-8").read()
    stripped = STRIP_RE.sub("", html)
    if len(stripped) != len(html):
        print("清除旧块：-%d 字符" % (len(html) - len(stripped)))
    html = stripped

    blocks, bad = load_blocks()
    sids = section_ids() or sorted(blocks)

    missing, inserted = [], 0
    for sid in sids:
        if sid not in blocks:
            missing.append(sid)
            continue
        anchor = '<div class="sect-h" id="%s"' % sid
        i = html.find(anchor)
        if i < 0:
            missing.append(sid + "(找不到 sect-h)")
            continue
        j = html.find('<ol class="kpt"', i)
        if j < 0 or j - i > 2000:
            missing.append(sid + "(找不到 ol.kpt)")
            continue
        if check_only:
            inserted += 1
            continue
        block = "<!--EXPL:%s-->\n%s\n<!--/EXPL:%s-->" % (sid, blocks[sid], sid)
        html = html[:j] + block + "\n" + html[j:]
        inserted += 1

    print("讲解块文件：%d 个，块 %d 个" % (len(glob.glob(os.path.join(SRC_DIR, "m*.html"))), len(blocks)))
    print("可插入 %d / 应插入 %d" % (inserted, len(sids)))
    if missing:
        print("缺失 %d：%s" % (len(missing), missing[:10]))
    if bad:
        print("违规片段 %d：%s" % (len(bad), bad[:8]))

    if check_only:
        print("（--check：未写文件）")
        return 0
    io.open(PAGE, "w", encoding="utf-8", newline="").write(html)
    print("写入 %s：%d 字符 / %d 字节" % (os.path.relpath(PAGE, ROOT), len(html), len(html.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())