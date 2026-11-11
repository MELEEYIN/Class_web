#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
md2solve.py — 把 solve.md 编译成站点用的 solve-data.js

用法：
    python tools/review/md2solve.py

输入： tools/review/solve.md
输出： site/acm/solve-data.js   (window.__SOLVE = [...])
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools" / "review" / "solve.md"
DST = ROOT / "site" / "acm" / "solve-data.js"

# 分类顺序：按算法类型，不按难度
TYPE_ORDER = ["高精度", "枚举与模拟", "递推与数学", "搜索与回溯", "贪心",
              "排序", "二分", "位运算与状态", "数组与区间", "数据结构", "递归与分治"]


def field(block, key):
    m = re.search(r"(?m)^- " + key + r"[：:]\s*(.+)$", block)
    return m.group(1).strip() if m else ""


def section(body, name):
    m = re.search(r"(?ms)^\*\*" + name + r"\*\*\s*\n(.*?)(?=^\*\*|\Z)", body)
    return m.group(1).strip() if m else ""


def parse(text):
    items = []
    for p in re.split(r"(?m)^## ", text)[1:]:
        lines = p.splitlines()
        head = lines[0].strip()
        m = re.match(r"(\S+)\s+(.+)", head)
        if not m:
            continue
        pid, name = m.group(1), m.group(2).strip()
        block = "## " + p
        items.append({
            "pid": pid,
            "name": name,
            "diff": field(block, "难度") or "校内",
            "type": field(block, "类型") or "其他",
            "tag": field(block, "标签"),
            "idea": section(block, "思路"),
            "key": section(block, "关键"),
        })
    return items


def sort_key(it):
    t = it["type"]
    rank = TYPE_ORDER.index(t) if t in TYPE_ORDER else 99
    pid = it["pid"]
    # P 在前、B 其次、纯数字最后；同前缀按数值排
    pre = 0 if pid.startswith("P") else (1 if pid.startswith("B") else 2)
    num = re.sub(r"\D", "", pid)
    return (rank, pre, int(num or 0), pid)


def main():
    items = parse(SRC.read_text(encoding="utf-8"))
    items.sort(key=sort_key)
    out = (
        "/* 由 tools/review/md2solve.py 自动生成，请勿手改。\n"
        "   源文件：tools/review/solve.md */\n"
        "window.__SOLVE = " + json.dumps(items, ensure_ascii=False, indent=1) + ";\n"
    )
    DST.write_text(out, encoding="utf-8")

    from collections import Counter
    c = Counter(x["type"] for x in items)
    print("编译 %d 题 → %s" % (len(items), DST.relative_to(ROOT)))
    print("  类型：" + "  ".join("%s %d" % (k, v) for k, v in c.items()))


if __name__ == "__main__":
    main()
