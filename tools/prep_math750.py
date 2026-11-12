# -*- coding: utf-8 -*-
"""
prep_math750.py — 把四段资料合并成一份 tools/data/math750_all.json（1–750）

数据来源（三段已有 JSON，一段只有 md）：
    1–300    tools/data/math750_up.json（已入库，limit=300）
    301–450  merged_301_450.json（start / end 字段）
    451–600  merged_451_600.json（lo / hi 字段）
    601–750  高数750题上册_题目与答案_601-750.md（无 JSON，直接解析 md）

输出统一结构：
    {"questions": {"301": {tag, ch, sec, body}}, "answers": {"301": "..."},
     "notes": {"第3章 …||第二节 …": "..."}}

用法：
    python tools/prep_math750.py
"""
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SRC_UP = os.path.join(HERE, "data", "math750_up.json")
SRC_301 = r"C:/Users/LEEYIN/WorkBuddy/2026-11-12-18-52-19/750/merged_301_450.json"
SRC_451 = r"C:/Users/LEEYIN/WorkBuddy/2026-11-11-22-42-20/750/merged_451_600.json"
SRC_601_MD = r"C:/Users/LEEYIN/WorkBuddy/2026-11-11-22-42-20/750/高数750题上册_题目与答案_601-750.md"
OUT = os.path.join(HERE, "data", "math750_all.json")


def load_json(path):
    d = json.load(io.open(path, encoding="utf-8"))
    return d.get("questions", {}), d.get("answers", {}), d.get("notes", {})


# ----------------------------------------------------------------------
# 601–750：从 md 解析（格式与前三段一致，但没有 JSON）
# ----------------------------------------------------------------------
RE_ANCHOR = re.compile(r'^<a id="q(\d+)"></a>\s*$')
RE_TITLE = re.compile(r'^####\s*第\s*(\d+)\s*题\s*·\s*(.+?)\s*$')
RE_NOTE_OPEN = re.compile(r'^<details><summary>本节知识点与公式</summary>\s*$')


def parse_md(path):
    lines = io.open(path, encoding="utf-8").read().replace("\r\n", "\n").split("\n")
    q, a, notes = {}, {}, {}
    ch = sec = ""
    i, n = 0, len(lines)

    while i < n:
        line = lines[i].strip()

        if line.startswith("## "):
            ch, sec = line[3:].strip(), ""
            i += 1
            continue

        if line.startswith("### "):
            sec = line[4:].strip()
            # 小节标题后紧跟一个「本节知识点与公式」折叠块
            j = i + 1
            while j < n and not lines[j].strip():
                j += 1
            if j < n and RE_NOTE_OPEN.match(lines[j].strip()):
                j += 1
                buf = []
                while j < n and lines[j].strip() != "</details>":
                    buf.append(lines[j])
                    j += 1
                note = "\n".join(buf).strip()
                if note:
                    notes[ch + "||" + sec] = note
                i = j + 1
            else:
                i += 1
            continue

        m = RE_ANCHOR.match(line)
        if m:
            qid = m.group(1)
            i += 1
            # 标题行
            while i < n and not lines[i].strip():
                i += 1
            mt = RE_TITLE.match(lines[i].strip()) if i < n else None
            tag = mt.group(2).strip() if mt else ""
            i += 1
            # 题干：到 <details> 前
            buf = []
            while i < n and not lines[i].strip().startswith("<details>"):
                buf.append(lines[i])
                i += 1
            body = "\n".join(buf).strip()
            # 答案：<details> … </details>
            if i < n:
                i += 1
                buf = []
                while i < n and lines[i].strip() != "</details>":
                    buf.append(lines[i])
                    i += 1
                ans = "\n".join(buf).strip()
                i += 1
            else:
                ans = ""
            q[qid] = {"tag": tag, "ch": ch, "sec": sec or "未分节题目", "body": body}
            a[qid] = ans
            continue

        i += 1

    return q, a, notes


def main():
    qs, ans, notes = {}, {}, {}

    # 1) 1–300（已入库，结构最全）
    q, a, nt = load_json(SRC_UP)
    qs.update(q)
    ans.update(a)
    notes.update(nt)
    print("1–300    ", len(q))

    # 2) 301–450
    q, a, nt = load_json(SRC_301)
    qs.update(q)
    ans.update(a)
    notes.update(nt)
    print("301–450  ", len(q))

    # 3) 451–600
    q, a, nt = load_json(SRC_451)
    qs.update(q)
    ans.update(a)
    notes.update(nt)
    print("451–600  ", len(q))

    # 4) 601–750（md）
    q, a, nt = parse_md(SRC_601_MD)
    qs.update(q)
    ans.update(a)
    notes.update(nt)
    print("601–750  ", len(q), "节知识点", len(nt))

    ids = sorted(int(k) for k in qs)
    missing = [x for x in range(1, 751) if x not in ids]
    print("合计", len(qs), "题 | 区间", ids[0], "-", ids[-1], "| 缺号", missing[:10])

    no_body = [k for k, v in qs.items() if not v["body"].strip()]
    no_ans = [k for k in qs if not ans.get(k, "").strip()]
    print("无题干", len(no_body), no_body[:8])
    print("无答案", len(no_ans), no_ans[:8])

    out = {"questions": qs, "answers": ans, "notes": notes}
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(
        json.dumps(out, ensure_ascii=False, indent=0))
    print("written", OUT, os.path.getsize(OUT))


if __name__ == "__main__":
    main()
