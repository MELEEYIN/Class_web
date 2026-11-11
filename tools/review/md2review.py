#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
md2review.py — 把 cards.md 编译成站点用的 review-data.js

用法：
    python tools/review/md2review.py

输入： tools/review/cards.md
输出： site/acm/review-data.js   (window.__REVIEW_CARDS = [...])
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools" / "review" / "cards.md"
DST = ROOT / "site" / "acm" / "review-data.js"


def field(block, key):
    m = re.search(r"(?m)^- " + key + r":\s*(.+)$", block)
    return m.group(1).strip() if m else ""


def split_sections(body):
    """按 **现象** / **原因** / **修法** 切开，末尾的 > 一句话 单独摘出来"""
    marks = ["**现象**", "**原因**", "**修法**"]
    pos = []
    for m in marks:
        i = body.find(m)
        if i >= 0:
            pos.append((i, m))
    pos.sort()
    out = {"symptom": "", "cause": "", "fix": "", "one": ""}
    keymap = {"**现象**": "symptom", "**原因**": "cause", "**修法**": "fix"}
    for idx, (i, m) in enumerate(pos):
        start = i + len(m)
        end = pos[idx + 1][0] if idx + 1 < len(pos) else len(body)
        out[keymap[m]] = body[start:end].strip()

    if pos:
        tail = body[pos[-1][0]:]
        one = re.search(r"(?m)^>\s*一句话[：:]\s*(.+)$", tail)
        if one:
            out["one"] = one.group(1).strip()
            out["fix"] = re.sub(r"(?m)^>\s*一句话[：:].*$", "", out["fix"]).strip()
    return out


def parse(text):
    parts = re.split(r"(?m)^## ", text)[1:]
    cards = []
    for p in parts:
        lines = p.splitlines()
        m = re.match(r"([A-Za-z]\d+[a-z]?)\s+(.+)", lines[0].strip())
        if not m:
            continue
        cid, title = m.group(1), m.group(2).strip()
        block = "## " + p
        body_at = len(lines)
        for i, ln in enumerate(lines):
            if ln.strip() == "":
                body_at = i
                break
        body = "\n".join(lines[body_at:]).strip()
        sec = split_sections(body)
        cards.append({
            "id": cid,
            "title": title,
            "pid": field(block, "题"),
            "type": field(block, "型") or "坑点",
            "topic": field(block, "知") or "其他",
            "date": field(block, "记") or "",
            "symptom": sec["symptom"],
            "cause": sec["cause"],
            "fix": sec["fix"],
            "one": sec["one"],
        })
    return cards


def main():
    cards = parse(SRC.read_text(encoding="utf-8"))
    out = (
        "/* 由 tools/review/md2review.py 自动生成，请勿手改。\n"
        "   源文件：tools/review/cards.md */\n"
        "window.__REVIEW_CARDS = " + json.dumps(cards, ensure_ascii=False, indent=1) + ";\n"
    )
    DST.write_text(out, encoding="utf-8")
    by = {}
    for c in cards:
        by[c["type"]] = by.get(c["type"], 0) + 1
    print("编译 %d 张 → %s" % (len(cards), DST.relative_to(ROOT)))
    print("  分类：" + "  ".join("%s %d" % (k, v) for k, v in by.items()))


if __name__ == "__main__":
    main()
