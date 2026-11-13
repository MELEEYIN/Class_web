# -*- coding: utf-8 -*-
"""从本机四级原卷 PDF 重建整卷题目（不入库的临时版本）"""
import pymupdf, re, json, os, sys
sys.stdout.reconfigure(encoding="utf-8")
root = r"E:\网课\四六级\四级\真题"
papers=[]
def add(s,n,rel): papers.append((s,n,os.path.join(root,rel)))
b=os.path.join("2023年03月CET4题+解+音频","01、真题PDF版（推荐打印）❤")
for n in (1,2,3): add("2023-03",n,os.path.join(b,f"2023.03英语四级真题第{n}套.pdf"))
b=os.path.join("2023年06月CET4题+解+音频","01、真题PDF版（推荐打印）❤")
for n in (1,2,3): add("2023-06",n,os.path.join(b,f"2023.06英语四级真题第{n}套.pdf"))
b=os.path.join("2023年12月CET4题+解+音频","01、真题PDF版（推荐打印）❤")
for n in (1,2,3): add("2023-12",n,os.path.join(b,f"2023.12四级真题第{n}套【可复制可检索】.pdf"))
b=os.path.join("2024年06月CET4题+解+音频","2024年06月CET4","2024年6月四级真题-原题")
for n in (1,2,3): add("2024-06",n,os.path.join(b,f"大学英语四级考试2024年6月真题【第{'一二三'[n-1]}套】.pdf"))
for s,d in [("2024-12","2024年12月CET4题+解+音频"),("2025-06",os.path.join("2025年06月CET4题+解+音频","3.2025年06月四级真题（新更）")),("2025-12","2025年12月CET4题+答案+音频")]:
    for n in (1,2,3): add(s,n,os.path.join(d,f"{s.replace('-','.')}四级真题第{n}套.pdf"))
b="2026年6月CET4题+答案+听力"
for n in (1,2,3): add("2026-06",n,os.path.join(b,f"2026.06四级真题第{n}套【可复制可搜索，打印首选】.pdf"))
BASE = json.load(open("repo/tools/data/cet4_papers.json", encoding="utf-8"))
meta = {s["id"]: s for s in BASE["sessions"]}
LABEL = {k: v["label"] for k,v in meta.items()}

def rows_of(doc, order=None):
    rows=[]
    pages = [doc[i] for i in order] if order else list(doc)
    for idx, pg in enumerate(pages):
        for b in pg.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                txt="".join(sp.get("text","") for sp in ln.get("spans",[])).strip()
                if not txt: continue
                rows.append((idx, ln["bbox"][1], ln["bbox"][0], txt))
    return rows

def clean(t):
    t=t.replace("\u00ad","")
    t=re.sub(r"\d{4}\s*年\s*\d{1,2}\s*月\s*四级真题[^•·\n]*[•·]?\s*\d?","",t)
    t=re.sub(r"[^\n]*•\s*\d{4}[^\n]*", "", t)
    return t

def extract_q(rows, lo, hi):
    qs=[(pg,y,x,txt) for pg,y,x,txt in rows if re.match(r"^\s*(\d{1,2})\.", txt)]
    out=[]
    for i,(pg,y,x,txt) in enumerate(qs):
        no=int(re.match(r"^\s*(\d{1,2})\.",txt).group(1))
        if not (lo <= no <= hi): continue
        nxt=next((yy for pp,yy,xx,tt in qs if pp==pg and yy>y+2), y+60)
        blk=[(yy,xx,tt) for pp,yy,xx,tt in rows if pp==pg and y-1<=yy<nxt-1]
        joined=" ".join(t for _,_,t in sorted(blk, key=lambda z:(z[0],z[1])))
        # 选项被页拆分：从下一页顶部补到下一个题号之前
        got=set(re.findall(r"(?<![A-Za-z])([ABCD])\)\s*", joined))
        if len(got)<4:
            nxtpg=[(yy,xx,tt) for pp,yy,xx,tt in rows if pp==pg+1]
            stop=1e9
            for yy,xx,tt in nxtpg:
                if re.match(r"^\s*\d{1,2}\.", tt):
                    stop=yy; break
            addt=[(yy,xx,tt) for yy,xx,tt in nxtpg if yy<stop and "四级真题" not in tt and "第" not in tt[:2]]
            joined += " " + " ".join(t for _,_,t in sorted(addt[:6], key=lambda z:(z[0],z[1])))
        parts=re.split(r"(?<![A-Za-z])([ABCD])\)\s*", joined)
        stem=re.split(r"(?<![A-Za-z])[ABCD]\)\s*", joined)[0]
        stem=re.sub(r"^\s*\d{1,2}\.\s*", "", stem).strip()
        o={}
        for k in range(1,len(parts)-1,2):
            v=" ".join(parts[k+1].split())
            v=re.sub(r"\s+Questions?\s+\d+.*$","",v)
            v=re.sub(r"\s*\d{4}\s*年\s*\d{1,2}\s*月\s*四级真题.*$","",v)
            v=re.sub(r"([A-Za-z])5(?=\s)","\\1'",v)
            v=re.sub(r"\s+\d{1,2}\.$","",v).strip()
            if v: o.setdefault(parts[k], v)
        for L in "ABCD":
            if L in o: continue
            cand=None
            for pp,yy,xx,tt in sorted(rows, key=lambda z:(z[0],z[1])):
                if pp==pg and yy>=y-2 and yy<=y+85 and re.match(r"^\s*"+L+r"\)", tt):
                    cand=tt; break
            if cand is None:
                for pp,yy,xx,tt in sorted(rows, key=lambda z:(z[0],z[1])):
                    if pp==pg+1 and re.match(r"^\s*"+L+r"\)", tt):
                        cand=tt; break
            if cand:
                v=re.sub(r"^\s*"+L+r"\)\s*","",cand)
                v=re.sub(r"\s+\d{1,2}\.$","",v).strip()
                if v: o[L]=v
        out.append({"no":no,"stem":stem,"opts":o})
    return out

res=[]
for s,n,p in papers:
    d=pymupdf.open(p)
    order=None
    # 2024.12 第 2 套的 PDF 把第 8、9 页印反了（Passage Two 在前），按正确页序重排
    if "2024.12四级真题第2套" in p and d.page_count >= 9:
        order=list(range(d.page_count)); order[7],order[8]=order[8],order[7]
    rows=rows_of(d, order)
    full=clean(" ".join(t for _,_,_,t in sorted(rows, key=lambda z:(z[0], z[1], z[2])))) if False else ""
    # 用视觉顺序拼全文（页内按 y 行聚类）
    lines=[]
    for idx in sorted(set(r[0] for r in rows)):
        byrow={}
        for pp,yy,xx,tt in rows:
            if pp==idx: byrow.setdefault(round(yy/4), []).append((xx,tt))
        for k in sorted(byrow):
            lines.append(" ".join(t for _,t in sorted(byrow[k], key=lambda z:z[0])))
    t=clean("\n".join(lines))
    ml=re.search(r"Listening\s*Comprehension", t)
    mr=re.search(r"Reading\s*Comprehension", t)
    ts=t.find("Translation", mr.end() if mr else 0)
    ms=re.search(r"Part\s*(?:IV|1V|IY|FV|V)\s*\n?\s*Translation", t)
    listen=extract_q(rows, 1, 25) if (ml and mr) else []
    groups=[]
    for gm in re.finditer(r"Questions?\s+(\d+)\s+(?:and|to)\s+(\d+)\s+are based on\s+([^.]+\.)", t):
        groups.append({"from":int(gm.group(1)),"to":int(gm.group(2)),"desc":gm.group(3).strip()})
    read=t[mr.start():ms.start()] if (mr and ms) else (t[mr.start():ts] if mr else "")
    item={"id":"%s-%d"%(s,n),"session":s,"label":LABEL.get(s,""),"set":n,
          "writing":"","translation":"","listening":listen,"groups":groups,"reading":read,
          "chars":len(t)}
    # 从已清洗的 JSON 取写作/翻译
    for sess in BASE["sessions"]:
        if sess["id"]==s:
            for st in sess["sets"]:
                if st["set"]==n:
                    item["writing"]=st["writing"]; item["translation"]=st["translation"]
    res.append(item)
    miss=[q["no"] for q in listen if len(q["opts"])<4]
    print(s,n,"listen",len(listen),"miss",miss,"read",len(read),"w",len(item["writing"]))
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"data","cet4_full.json")
json.dump({"papers":res}, open(OUT,"w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved", len(res))
