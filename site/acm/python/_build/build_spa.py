#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 site/acm/python/*.html 里的 <article data-learn-content> 抽成 SPA 片段。

远端（origin/main）的 ACM 子站已经换成 hash 路由外壳：
    site/acm/index.html + assets/shell.js + data/nav.json + data/search.json
    + data/p/*.html（纯 body 片段，由 shell.js fetch 后塞进 #doc）

本脚本做三件事（全部幂等，可以反复跑）：
    1. 每章抽一份片段到 site/acm/data/p/py-<slug>.html
       —— 只保留 <article data-learn-content> 外壳与内部标记，
          代码块/表格/提示框的类名全部原样保留，交给 learn-code.js 美化。
    2. 在 data/nav.json 里追加（或整体替换）id="py" 的模块，并把已有模块
       标上 section，让侧栏出现「C++ 算法竞赛 / Python 语法教程」两个大分类。
    3. 在 data/search.json 里追加每条章节的小节标题，供全站搜索命中正文。

用法（仓库根目录）：
    python site/acm/python/_build/build_spa.py
"""
from __future__ import print_function

import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))       # site/acm/python/_build
PY_DIR = os.path.dirname(HERE)                          # site/acm/python
ACM_DIR = os.path.dirname(PY_DIR)                       # site/acm
DATA_DIR = os.path.join(ACM_DIR, "data")
FRAG_DIR = os.path.join(DATA_DIR, "p")
NAV_PATH = os.path.join(DATA_DIR, "nav.json")
INDEX_PATH = os.path.join(DATA_DIR, "search.json")

MOD_ID = "py"
MOD_NAME = "Python 语法教程"
MOD_NOTE = "26 章 · 从语法到工程习惯"
SEC_CPP = "C++ 算法竞赛"
SEC_PY = "Python 语法教程"

ARTICLE_RE = re.compile(r"<article data-learn-content>([\s\S]*?)</article>")
HEAD_RE = re.compile(r'<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)</h\1>')
TAG_RE = re.compile(r"<[^>]+>")
MD_RE = re.compile(r"\*\*|__|`")


def read(path):
    with io.open(path, encoding="utf-8") as f:
        return f.read()


def write(path, text):
    with io.open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def unescape(s):
    return (s.replace("&nbsp;", " ")
             .replace("&lt;", "<").replace("&gt;", ">")
             .replace("&quot;", '"').replace("&#39;", "'")
             .replace("&amp;", "&"))


def plain(html):
    """去标签 + 去 markdown 强调符 + 压空白"""
    text = TAG_RE.sub("", html)
    text = MD_RE.sub("", unescape(text))
    return re.sub(r"\s+", " ", text).strip()


def one_line(s, limit=110):
    s = MD_RE.sub("", s or "")
    s = re.sub(r"\s+", " ", s).strip()
    m = re.search(r"[。；!？?]", s)
    if m and m.start() <= limit:
        return s[:m.start() + 1]
    return s if len(s) <= limit else s[:limit - 1] + "…"


def minified(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def main():
    doc = json.loads(read(os.path.join(PY_DIR, "index.json")))
    chapters = sorted(doc["items"], key=lambda it: it["no"])
    if not os.path.isdir(FRAG_DIR):
        os.makedirs(FRAG_DIR)

    nav_items = []
    search_items = []
    total_bytes = 0

    for it in chapters:
        slug = it["slug"]
        page = os.path.join(PY_DIR, it["url"])
        html = read(page)
        m = ARTICLE_RE.search(html)
        if not m:
            sys.exit("article not found: %s" % page)
        inner = m.group(1).strip("\n")

        toc = []
        for lv, hid, head_html in HEAD_RE.findall(inner):
            t = plain(head_html)
            if not t or len(t) >= 64:
                continue
            toc.append({"lv": int(lv), "t": t, "id": hid})
        if not toc:
            sys.exit("no headings with id: %s" % page)

        frag = "<article data-learn-content>\n" + inner + "\n</article>\n"
        frag_name = "py-%s.html" % slug
        write(os.path.join(FRAG_DIR, frag_name), frag)
        total_bytes += len(frag.encode("utf-8"))

        no = it["no"]
        nav_items.append({
            "id": "%s/%s" % (MOD_ID, slug),
            "title": it["title"],
            "sub": one_line(it.get("essence", "")),
            "file": frag_name,
            "no": "" if not no else "%02d" % no,
            "toc": toc,
        })
        search_items.append({
            "u": "%s/%s" % (MOD_ID, slug),
            "t": it["title"],
            "m": MOD_NAME,
            "h": [e["t"] for e in toc],
        })

    # ---------------- nav.json ----------------
    nav = json.loads(read(NAV_PATH))
    modules = [m for m in nav["modules"] if m.get("id") != MOD_ID]
    for m in modules:
        m.setdefault("section", SEC_CPP)
    modules.append({
        "id": MOD_ID,
        "name": MOD_NAME,
        "note": MOD_NOTE,
        "section": SEC_PY,
        "items": nav_items,
    })
    nav["modules"] = modules
    write(NAV_PATH, minified(nav))

    # ---------------- search.json ----------------
    sindex = json.loads(read(INDEX_PATH))
    sindex = [e for e in sindex if not str(e.get("u", "")).startswith(MOD_ID + "/")]
    sindex.extend(search_items)
    write(INDEX_PATH, minified(sindex))

    print("fragments : %d 篇 / %.1f KB" % (len(nav_items), total_bytes / 1024.0))
    print("nav items : %d（模块 %d 个）" % (len(nav_items), len(modules)))
    print("search    : 共 %d 条（Python %d 条）" % (len(sindex), len(search_items)))
    print("toc       : %d 个小节标题" % sum(len(e["h"]) for e in search_items))


if __name__ == "__main__":
    main()