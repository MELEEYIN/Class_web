#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""校验 site/acm/python/*.md 里的示例是否真的能跑、输出是否真的是写的那个。

做三件事：
1. ```pycon 块 —— 拼成 doctest 真跑，逐条比对。
2. ```python 块 —— 首行必须是 `# 示例：examples/xxx.py`，检查文件存在。
3. 紧跟在 `python` 块后面的 ```text 块 —— 真跑 examples 里的脚本，逐字节比对 stdout。

用法（在仓库根目录）：
    python site/acm/python/_build/verify.py            # 全量
    python site/acm/python/_build/verify.py 05 06      # 只查指定章节前缀
退出码 0 表示全过。
"""
from __future__ import annotations

import doctest
import io
import os
import re
import subprocess
import sys
import traceback
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # site/acm/python
EXAMPLES = ROOT / "examples"
FENCE = re.compile(r"^```\s*([A-Za-z0-9_+-]*)\s*$")
FILE_TAG = re.compile(r"^#\s*示例[:：]\s*(examples/[\w./-]+\.py)")
LEAD_TAGS = re.compile(r"^(#\s*示例[:：]\s*examples/[\w./-]+\.py[ \t]*\n)+")


def strip_tags(text: str) -> str:
    """归一化换行并去掉开头可能重复的 `# 示例：…` 标记行，用于比对。"""
    return LEAD_TAGS.sub("", text.replace("\r\n", "\n")).strip()


def split_blocks(text: str):
    """把 md 切成 (行号, 语言, 内容) 序列，只返回围栏代码块。"""
    lines = text.splitlines()
    blocks, i = [], 0
    while i < len(lines):
        m = FENCE.match(lines[i])
        if not m:
            i += 1
            continue
        lang = m.group(1).lower()
        start = i
        i += 1
        body = []
        while i < len(lines) and not FENCE.match(lines[i]):
            body.append(lines[i])
            i += 1
        blocks.append((start + 1, lang, "\n".join(body)))
        i += 1
    return blocks


def run_doctest(chapter: Path, block: tuple, ns: dict, failures: list):
    start, _, body = block
    parser = doctest.DocTestParser()
    try:
        test = parser.get_doctest(body, ns, f"{chapter.name}:{start}", str(chapter), start)
    except ValueError as exc:            # 语法写坏了的 >>> 块
        failures.append(f"{chapter.name}:{start}  doctest 解析失败 -> {exc}")
        return
    if not test.examples:
        return
    runner = doctest.DocTestRunner(verbose=False, optionflags=doctest.ELLIPSIS | doctest.NORMALIZE_WHITESPACE)
    out = io.StringIO()
    with warnings.catch_warnings():
        # 有些章节要演示「会被解释器警告的写法」（如 finally 里的 return），
        # 警告属于教学内容本身，不该干扰校验报告。
        warnings.simplefilter("ignore", SyntaxWarning)
        result = runner.run(test, out=out.write)
    if result.failed:
        detail = "\n".join("    " + ln for ln in out.getvalue().rstrip().splitlines())
        failures.append(
            f"{chapter.name}:{start}  doctest 失败 {result.failed}/{result.attempted} 条\n{detail}"
        )


def run_script(rel: str):
    path = ROOT / rel
    if not path.exists():
        return None, f"缺少示例文件 {rel}"
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    proc = subprocess.run(
        [sys.executable, str(path)],
        capture_output=True, text=True, encoding="utf-8", env=env,
    )
    if proc.returncode != 0:
        return None, f"{rel} 退出码 {proc.returncode}\n{proc.stderr.strip()}"
    return proc.stdout.rstrip("\n"), None


def check_chapter(chapter: Path) -> list[str]:
    failures: list[str] = []
    blocks = split_blocks(chapter.read_text(encoding="utf-8"))
    ns: dict = {"__name__": "__main__"}

    for idx, (start, lang, body) in enumerate(blocks):
        if lang == "pycon":
            run_doctest(chapter, (start, lang, body), ns, failures)
        elif lang == "python":
            first = body.splitlines()[0].strip() if body.strip() else ""
            if first.startswith("# 片段"):
                continue                      # 练习用的小片段，不要求是独立文件
            m = FILE_TAG.match(first)
            if not m:
                failures.append(f"{chapter.name}:{start}  python 块首行缺少 `# 示例：examples/xxx.py` 标记")
                continue
            rel = m.group(1)
            if not (ROOT / rel).exists():
                failures.append(f"{chapter.name}:{start}  引用的示例文件不存在：{rel}")
                continue
            src = (ROOT / rel).read_text(encoding="utf-8")
            body_src = "\n".join(body.splitlines()[1:])          # 去掉 `# 示例：…` 标记行
            if strip_tags(src) != strip_tags(body_src):
                failures.append(f"{chapter.name}:{start}  代码块与示例文件内容不一致（{rel}）")
            # 找紧随其后的 text 块
            nxt = blocks[idx + 1] if idx + 1 < len(blocks) else None
            if nxt and nxt[1] == "text":
                actual, err = run_script(rel)
                if err:
                    failures.append(f"{chapter.name}:{start}  {err}")
                elif actual != nxt[2].rstrip("\n"):
                    failures.append(
                        f"{chapter.name}:{start}  输出不一致（{rel}）\n"
                        f"--- 文档里写的 ---\n{nxt[2].rstrip()}\n--- 实跑得到 ---\n{actual}"
                    )
    return failures


def main(argv: list[str]) -> int:
    want = argv[1:]
    chapters = sorted(p for p in ROOT.glob("*.md") if not p.name.startswith(("README", "_")))
    if want:
        chapters = [c for c in chapters if any(c.name.startswith(w) for w in want)]
    if not chapters:
        print("没有找到要检查的章节文件。")
        return 1

    all_failures: list[str] = []
    for chapter in chapters:
        try:
            fails = check_chapter(chapter)
        except Exception:
            fails = [f"{chapter.name}  校验器自身异常:\n{traceback.format_exc()}"]
        status = "OK  " if not fails else "FAIL"
        print(f"[{status}] {chapter.name}")
        all_failures.extend(fails)

    print()
    if all_failures:
        print(f"共 {len(all_failures)} 处问题：\n")
        for f in all_failures:
            print("-", f)
        return 1
    print(f"{len(chapters)} 章全部通过：所有 pycon 输出与脚本输出都和文档一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))