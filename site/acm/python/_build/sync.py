#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 md 里 `python` 示例块的正文，用 examples 文件的原文就地覆盖（第一行保留 `# 示例：…` 标记）。

用法：`python site/acm/python/_build/sync.py 18`
配合 fill.py 的典型顺序：

    write 章节 md（python 块只写 `# 示例：examples/xx.py` 一行，text 块留空）
    python _build/sync.py  NN     # 正文变成文件原文，逐字节一致
    python _build/fill.py  NN     # text 块变成真实输出
    python _build/verify.py NN    # 全量校验

这样正文里的代码永远等于真正跑过的代码，不必手抄。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FENCE = re.compile(r"^```\s*([A-Za-z0-9_+-]*)\s*$")
FILE_TAG = re.compile(r"^#\s*示例[:：]\s*(examples/[\w./-]+\.py)\s*$")


def main(argv: list[str]) -> int:
    want = argv[1:]
    chapters = sorted(p for p in ROOT.glob("*.md") if not p.name.startswith(("README", "_")))
    if want:
        chapters = [c for c in chapters if any(c.name.startswith(w) for w in want)]
    if not chapters:
        print("没有找到要处理的章节文件。")
        return 1

    for chapter in chapters:
        lines = chapter.read_text(encoding="utf-8").splitlines()
        edits = []
        i, changed = 0, 0
        while i < len(lines):
            m = FENCE.match(lines[i])
            if not m:
                i += 1
                continue
            lang, open_i = m.group(1).lower(), i
            i += 1
            body = []
            while i < len(lines) and not FENCE.match(lines[i]):
                body.append(lines[i])
                i += 1
            close_i = i               # 结束围栏行号
            if lang == "python" and body:
                tag = FILE_TAG.match(body[0].strip())
                if tag:
                    src = (ROOT / tag.group(1)).read_text(encoding="utf-8")
                    src_lines = src.replace("\r\n", "\n").rstrip("\n").splitlines()
                    # 示例文件首行通常也是 `# 示例：…` 标记，避免重复
                    if src_lines and FILE_TAG.match(src_lines[0].strip()):
                        src_lines = src_lines[1:]
                    new = [body[0].strip()] + src_lines
                    if new != body:
                        edits.append((open_i + 1, close_i, new))
                        changed += 1
            i += 1
        for start, end, new in sorted(edits, reverse=True):
            lines[start:end] = new
        if changed:
            chapter.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        print(f"[sync] {chapter.name}: 同步 {changed} 个 python 块")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))