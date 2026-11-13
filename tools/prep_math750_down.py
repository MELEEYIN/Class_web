# -*- coding: utf-8 -*-
"""
prep_math750_down.py — 把下册全部 md 解析成 tools/data/math750_down.json

下册《高等数学（下册）精选 750 题》题号独立编号（1–750），分五段整理：
    高数750题下册_题目与答案_1-150.md
    高数750题下册_题目与答案_151-300.md
    高数750题下册_题目与答案_301-450.md
    高数750题下册_题目与答案_451-600.md
    高数750题下册_题目与答案_601-750.md

输出结构与上册一致：
    {"questions": {"1": {tag, ch, sec, body}}, "answers": {"1": "..."},
     "notes": {"第8章 …||第一节 …": "..."}}

用法：
    python tools/prep_math750_down.py
"""
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r"C:/Users/LEEYIN/WorkBuddy/2026-11-11-22-42-20/750"

SRC_A = r"C:/Users/LEEYIN/Downloads/Programs/高数750题下册_题目与答案_1-150.md"
SRC_B = os.path.join(BASE, "高数750题下册_题目与答案_151-300.md")
SRC_C = os.path.join(BASE, "高数750题下册_题目与答案_301-450.md")
SRC_D = os.path.join(BASE, "高数750题下册_题目与答案_451-600.md")
SRC_E = os.path.join(BASE, "高数750题下册_题目与答案_601-750.md")
OUT = os.path.join(HERE, "data", "math750_down.json")

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
            while i < n and not lines[i].strip():
                i += 1
            mt = RE_TITLE.match(lines[i].strip()) if i < n else None
            tag = mt.group(2).strip() if mt else ""
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith("<details>"):
                buf.append(lines[i])
                i += 1
            body = "\n".join(buf).strip()
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
    for path in (SRC_A, SRC_B, SRC_C, SRC_D, SRC_E):
        q, a, nt = parse_md(path)
        dup = set(qs) & set(q)
        assert not dup, ("题号重复", dup)
        qs.update(q)
        ans.update(a)
        notes.update(nt)
        print(os.path.basename(path), "→", len(q), "题")

    ids = sorted(int(k) for k in qs)
    print("合计", len(qs), "题 | 区间", ids[0], "-", ids[-1],
          "| 缺号", [x for x in range(1, ids[-1] + 1) if x not in ids][:10])

    no_body = [k for k, v in qs.items() if not v["body"].strip()]
    no_ans = [k for k in qs if not ans.get(k, "").strip()]
    print("无题干", len(no_body), no_body[:8])
    print("无答案", len(no_ans), no_ans[:8])

    # 第9章源文件漏了「第五节 隐函数的求导」这一节标题，35 道题落进「未分节题目」；
    # 内容全为复合函数/隐函数求导，按同济第9章节次归位。
    for k, v in qs.items():
        if v["ch"].startswith("第9章") and v["sec"] == "未分节题目":
            v["sec"] = "第五节 隐函数的求导"

    # 451–600 md 三处错标，按题号 + 内容（线积分/曲面积分关键词）订正：
    #   ① q451–465 误标「第12章 曲面积分·综合提高题」，实际是曲线积分（∮_L 线积分），
    #      应归入第11章 曲线积分·综合提高题（接 301–450 里的 q450）；
    #   ② q466–475 挂在第11章下但无小节，同样归为第11章 曲线积分·综合提高题；
    #   ③ q476–495 挂在第12章下无小节，实际是「第一类曲面积分（对面积的）」，
    #      补回缺失的第一节标题。
    # 于是第11章 = 356–475、第12章 = 476–600 与书本章节边界一致。
    for k, v in qs.items():
        n = int(k)
        if 451 <= n <= 475:
            v["ch"] = "第11章 曲线积分"
            v["sec"] = "综合提高题"
        elif 476 <= n <= 495:
            v["ch"] = "第12章 曲面积分"
            v["sec"] = "第一节 第一类曲面积分（对面积的曲面积分）"

    out = {"questions": qs, "answers": ans, "notes": notes}
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(
        json.dumps(out, ensure_ascii=False, indent=0))
    print("written", OUT, os.path.getsize(OUT))


if __name__ == "__main__":
    main()
