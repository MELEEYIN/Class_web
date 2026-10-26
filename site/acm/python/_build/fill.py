#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 md 里 `python` 示例块后面的 ```text 块，用实跑 stdout 就地填好。

写章节时只需要写：
    ```python
    # 示例：examples/ch05_02_format.py
    <文件原文>
    ```

    ```text
    （留空或随便写，会被覆盖）
    ```

然后 `python site/acm/python/_build/fill.py 05` —— text 块就变成真实输出。
输出永远来自真实执行，不可能与代码不一致。
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FENCE = re.compile(r"^```\s*([A-Za-z0-9_+-]*)\s*$")
FILE_TAG = re.compile(r"^#\s*示例[:：]\s*(examples/[\w./-]+\.py)")


def blocks(lines: list[str]):
    """返回 [(open_idx, close_idx, lang, body_lines)]，索引是 0 基行号。"""
    out, i = [], 0
    while i < len(lines):
        m = FENCE.match(lines[i])
        if not m:
            i += 1
            continue
        lang, open_i, i = m.group(1).lower(), i, i + 1
        body = []
        while i < len(lines) and not FENCE.match(lines[i]):
            body.append(lines[i])
            i += 1
        out.append((open_i, i, lang, body))
        i += 1
    return out


def run(rel: str) -> str:
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    proc = subprocess.run(
        [sys.executable, str(ROOT / rel)],
        capture_output=True, text=True, encoding="utf-8", env=env,
    )
    if proc.returncode != 0:
        raise SystemExit(f"!! {rel} 运行失败（退出码 {proc.returncode}）：\n{proc.stderr}")
    return proc.stdout.rstrip("\n")


def fill(chapter: Path) -> int:
    text = chapter.read_text(encoding="utf-8")
    lines = text.splitlines()
    bs = blocks(lines)
    edits = []                     # (start_line_no, end_line_no_exclusive, new_lines)
    filled = 0
    for k, (open_i, close_i, lang, body) in enumerate(bs):
        if lang != "python" or not body:
            continue
        m = FILE_TAG.match(body[0].strip())
        if not m:
            continue
        if k + 1 >= len(bs):
            continue
        n_open, n_close, n_lang, _ = bs[k + 1]
        if n_lang != "text":
            print(f"  ! 第 {open_i + 1} 行的 python 块后面没有 ```text 块，跳过")
            continue
        new = run(m.group(1)).splitlines() or [""]
        edits.append((n_open + 1, n_close, new))
        filled += 1

    for start, end, new in sorted(edits, reverse=True):
        lines[start:end] = new
    if filled:
        chapter.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"[fill] {chapter.name}: 更新 {filled} 个 text 块")
    return filled


def main(argv: list[str]) -> int:
    want = argv[1:]
    chapters = sorted(p for p in ROOT.glob("*.md") if not p.name.startswith(("README", "_")))
    if want:
        chapters = [c for c in chapters if any(c.name.startswith(w) for w in want)]
    for c in chapters:
        fill(c)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))