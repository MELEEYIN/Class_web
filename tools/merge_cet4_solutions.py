# -*- coding: utf-8 -*-
"""把 ocr_out/ 的解析册 OCR 结果按 Part 切分，生成 tools/data/cet4_solutions.json"""
import io, json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OCR = os.path.join(ROOT, "ocr_out")
if not os.path.isdir(OCR):
    OCR = os.path.join(os.path.dirname(ROOT), "ocr_out")
OUT = os.path.join(HERE, "data", "cet4_solutions.json")

def clean(pages):
    t = "\n".join(p.get("text","") for p in pages)
    out=[]
    for ln in t.split("\n"):
        s = " ".join(ln.split())
        if not s: continue
        if re.match(r"^第\s*\d+\s*页", s): continue
        if re.search(r"第\s*\d+\s*页[，,]\s*共\s*\d+\s*页", s): continue
        if re.search(r"四级\s*20\d\d\.\d+", s): continue
        if re.match(r"^•?\s*四级\s*20\d\d", s): continue
        out.append(s)
    return "\n".join(out)

def split(t):
    kws = {"writing":"Writing","listening":"Listening","reading":"Reading","translation":"Translation"}
    order = ["writing","listening","reading","translation"]
    all_parts = [m.start() for m in re.finditer(r"Part\s*[I1l|ⅡⅢⅣ]+", t)]
    pos = {}
    for lab in order:
        c = t.find(kws[lab])
        if c >= 0:
            pos[lab] = c
    # Part 标记补缺失段：在该段前后已知位置之间找最近的 Part
    for i, lab in enumerate(order):
        if lab in pos:
            continue
        if lab == "writing":
            pos[lab] = 0
            continue
        lo = max([pos[x] for x in order[:i] if x in pos] or [-1])
        hi = min([pos[x] for x in order[i+1:] if x in pos] or [len(t)])
        cand = [p for p in all_parts if lo < p < hi]
        if cand:
            pos[lab] = min(cand)
    # 保序并切分
    items = sorted(pos.items(), key=lambda x: x[1])
    seg = {}
    for i, (lab, p) in enumerate(items):
        end = items[i+1][1] if i+1 < len(items) else len(t)
        seg[lab] = t[p:end]
    return {k: v for k, v in seg.items() if len(v) > 30}

papers = {}
for fn in sorted(os.listdir(OCR)):
    if not fn.endswith(".json"): continue
    d = json.load(io.open(os.path.join(OCR, fn), encoding="utf-8"))
    cid = "%s-%d" % (d["session"], d["set"])
    t = clean(d["pages"])
    seg = split(t)
    seg = {k: v for k, v in seg.items() if v and len(v) > 30}
    if seg:
        papers[cid] = seg
        print(cid, {k: len(v) for k, v in seg.items()})
# 2026.06 的解析册有文字层，直接提取，不必 OCR
try:
    import pymupdf
    PDF26 = r"E:\网课\四六级\四级\真题\2026年6月CET4题+答案+听力"
    if os.path.isdir(PDF26):
        for n in (1, 2, 3):
            fp = os.path.join(PDF26, "2026年6月英语四级解析第%d套.pdf" % n)
            if os.path.exists(fp):
                t26 = clean([{"text": pg.get_text()} for pg in pymupdf.open(fp)])
                papers["2026-06-%d" % n] = split(t26)
except Exception as e:
    print("2026 direct extract skipped:", e)

json.dump({"papers": papers}, io.open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved", len(papers))
