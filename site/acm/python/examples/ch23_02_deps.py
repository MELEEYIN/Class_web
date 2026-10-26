import importlib.metadata as md
import tempfile
from pathlib import Path

REQ = """# 注释行会被忽略
pip>=20
nonexistent-package-xyz==1.0
"""
OPS = ("==", ">=", "<=", "~=", ">", "<")


def split_spec(text):
    for op in OPS:
        if op in text:
            name, _, ver = text.partition(op)
            return name, op, ver
    return text, "", ""


with tempfile.TemporaryDirectory() as td:
    path = Path(td) / "requirements.txt"
    path.write_text(REQ, encoding="utf-8")
    raw = path.read_text(encoding="utf-8").splitlines()
    specs = [ln.strip() for ln in raw if ln.strip() and not ln.lstrip().startswith("#")]

print("文件行数:", len(raw), "| 有效依赖:", len(specs))

for spec in specs:
    name, op, want = split_spec(spec)
    try:
        have = md.version(name)
    except md.PackageNotFoundError:
        print(f"{spec:<28} 未安装 -> 需要 pip install")
        continue
    print(f"{name:<8} 要求 {op}{want:<6} 已装 {have}")

report = {}
for dist in md.distributions():
    name = dist.metadata["Name"] or "?"
    report[name.lower()] = dist.version
print("索引条目 > 10:", len(report) > 10)
print("索引里有 pip:", "pip" in report)
print("同一包名不会重复:", len(report) == len({k.lower() for k in report}))