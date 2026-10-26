"""ch17_02_pathlib.py —— 路径运算、目录遍历与文件元数据"""
import os
import shutil
from pathlib import Path

WORK = Path(__file__).resolve().parent / "_tmp" / "ch17_02"
if WORK.exists():
    shutil.rmtree(WORK)
(WORK / "src" / "app").mkdir(parents=True)
(WORK / "logs").mkdir()

(WORK / "src" / "main.py").write_text("print('hi')\n", encoding="utf-8")
(WORK / "src" / "app" / "utils.py").write_text("x = 1\n", encoding="utf-8")
(WORK / "logs" / "a.log").write_text("log\n", encoding="utf-8")


def rel(p):
    return p.relative_to(WORK).as_posix()


print("=== 用 / 拼路径，而不是字符串加斜杠 ===")
p = WORK / "src" / "main.py"
print("相对路径：", rel(p))
print("name：", p.name, "| stem：", p.stem, "| suffix：", p.suffix)
print("parent：", rel(p.parent))
print("parts 末三段：", p.parts[-3:])

print("=== with_suffix / with_name：换扩展名、换文件名 ===")
print(rel(p.with_suffix(".txt")))
print(rel(p.with_name("other.py")))

print("=== 属性判断与元数据 ===")
print("exists：", p.exists(), "| is_file：", p.is_file(), "| is_dir：", p.is_dir())
print("父目录是目录：", p.parent.is_dir())
print("大小：", p.stat().st_size, "字节")

print("=== 列目录：iterdir 只列一层 ===")
for child in sorted(WORK.iterdir()):
    print("  ", rel(child), "| 是目录：", child.is_dir())

print("=== glob 与 rglob：按模式匹配 ===")
for f in sorted((WORK / "src").glob("*.py")):
    print("  顶层匹配：", rel(f))
for f in sorted(WORK.rglob("*.py")):
    print("  递归匹配：", rel(f))
print("所有 .log：", [rel(f) for f in WORK.rglob("*.log")])

print("=== read_text / write_text：小文件的最短路径 ===")
new = WORK / "logs" / "b.txt"
new.write_text("你好\n", encoding="utf-8")
print("读回：", repr(new.read_text(encoding="utf-8")))

with open(new, "a", encoding="utf-8") as f:
    f.write("第二行\n")
print("追加后行列表：", new.read_text(encoding="utf-8").splitlines())

print("=== rename / unlink ===")
renamed = new.with_name("c.txt")
new.rename(renamed)
print("改名后：原名存在 =", new.exists(), "| 新名存在 =", renamed.exists())
renamed.unlink()
print("删除后：", renamed.exists())

print("=== mkdir 的层层创建与幂等 ===")
deep = WORK / "src" / "app" / "deep" / "deeper"
deep.mkdir(parents=True, exist_ok=True)
print("多级目录已建好：", deep.is_dir())
deep.mkdir(parents=True, exist_ok=True)
print("重复创建不报错：", deep.is_dir())
try:
    (WORK / "src").mkdir()
except FileExistsError as e:
    print("不加 exist_ok 就报 FileExistsError，errno =", e.errno)

print("=== 相对路径与绝对路径 ===")
print("Path('a/b') 是绝对路径吗：", Path("a/b").is_absolute())
print("resolve 之后呢：", Path("a/b").resolve().is_absolute())
print("resolve 只补全、不检查存在：", Path("不存在的目录/x.txt").resolve().name)

print("=== os.path 与 pathlib 的对照 ===")
print("splitext：", os.path.splitext("main.py")[1], "| Path.suffix：", Path("main.py").suffix)
print("basename：", os.path.basename(os.path.join("a", "b.txt")), "| Path.name：", Path("a/b.txt").name)

print("=== 统计目录总大小 ===")
total = sum(f.stat().st_size for f in WORK.rglob("*") if f.is_file())
print("所有文件字节合计：", total)

shutil.rmtree(WORK)
print("清理完成：", WORK.exists())