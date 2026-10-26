#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成 site/acm/python/index.json —— 章节索引（给导航、搜索、目录页用）。

数据全部从 `NN-slug.md` 里读出来，**不手写**，所以永远和正文一致。
重跑：

    python site/acm/python/_build/gen_index.py

字段说明见 README.md「index.json」一节。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # site/acm/python

CH_FILE = re.compile(r"^(\d{2})-([a-z0-9][a-z0-9-]*)\.md$")
H1 = re.compile(r"^#\s+(\d{2})\s*·\s*(.+?)\s*$")
ESSENCE = re.compile(r"^>\s*\*\*本质\*\*\s*[：:]\s*(.+?)\s*$")
H2 = re.compile(r"^##\s+(\d{1,2}\.[a-z0-9]+)\s+(.+?)\s*$")
FENCE = re.compile(r"^```\s*([A-Za-z0-9_+-]*)\s*$")


def scan(path: Path) -> dict:
    title, essence, sections = path.stem, "", []
    pycon = python_blocks = 0
    in_fence, lang_open = False, ""
    for line in path.read_text(encoding="utf-8").splitlines():
        m = FENCE.match(line)
        if m:
            if not in_fence:
                in_fence, lang_open = True, m.group(1).lower()
                if lang_open == "pycon":
                    pycon += 1
                elif lang_open == "python":
                    python_blocks += 1
            else:
                in_fence = False
            continue
        if in_fence:
            continue
        if (m := H1.match(line)) and title == path.stem:
            title = m.group(2)
        elif (m := ESSENCE.match(line)) and not essence:
            essence = m.group(1)
        elif m := H2.match(line):
            sections.append({"id": m.group(1), "title": m.group(2)})
    return {
        "title": title,
        "essence": essence,
        "sections": sections,
        "stats": {"pycon": pycon, "scripts": python_blocks, "sections": len(sections)},
    }


def main() -> int:
    items, newest = [], 0.0
    for path in sorted(ROOT.glob("*.md")):
        m = CH_FILE.match(path.name)
        if not m:
            continue
        no = int(m.group(1))
        info = scan(path)
        newest = max(newest, path.stat().st_mtime)
        item = {
            "no": no,
            "slug": m.group(2),
            "title": info["title"],
            "essence": info["essence"],
            "file": path.name,
            "url": path.name[:-3] + ".html",
            "kind": "guide" if no == 0 else "chapter",
            "sections": info["sections"],
            "stats": info["stats"],
        }
        items.append(item)

    data = {
        "v": 1,
        "generator": "_build/gen_index.py",
        "updated": __import__("datetime").date.fromtimestamp(newest).isoformat() if items else "",
        "n": len(items),
        "items": items,
    }
    out = ROOT / "index.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8", newline="\n")
    print(f"[index] {out.name}: {len(items)} 条（章节 {sum(1 for i in items if i['kind'] == 'chapter')}，"
          f"导读 {sum(1 for i in items if i['kind'] == 'guide')}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())