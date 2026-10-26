"""ch17_01_text_io.py —— 文本/二进制读写、编码与文件指针"""
import shutil
from pathlib import Path

WORK = Path(__file__).resolve().parent / "_tmp" / "ch17_01"
if WORK.exists():
    shutil.rmtree(WORK)
WORK.mkdir(parents=True)

p = WORK / "hello.txt"

print("=== 写：w 清空重建，a 追加 ===")
with open(p, "w", encoding="utf-8") as f:
    f.write("第一行\n")
    f.write("第二行\n")
print("写入后字节数：", p.stat().st_size, "（UTF-8 下每个汉字 3 字节）")

with open(p, "a", encoding="utf-8") as f:
    f.write("追加行\n")

with open(p, encoding="utf-8") as f:
    print("整个读出：", repr(f.read()))

print("=== 逐行迭代：内存里只有一行 ===")
with open(p, encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        print(f"  第{i}行 {line!r}")

print("=== 去掉行尾换行 ===")
with open(p, encoding="utf-8") as f:
    lines = [line.rstrip("\n") for line in f]
print(lines, "| 行数：", len(lines))

print("=== Path.read_text / splitlines 一步到位 ===")
print(p.read_text(encoding="utf-8").splitlines())

print("=== 编码不一致会抛 UnicodeDecodeError ===")
gbk = WORK / "gbk.txt"
gbk.write_bytes("中文内容".encode("gbk"))
try:
    gbk.read_text(encoding="utf-8")
except UnicodeDecodeError as e:
    print("UnicodeDecodeError 原因：", e.reason, "| 出错字节位置：", e.start)
print("用 gbk 解码：", gbk.read_text(encoding="gbk"))

print("=== 二进制模式：字节就是字节 ===")
blob = WORK / "data.bin"
with open(blob, "wb") as f:
    f.write(bytes([0, 1, 2, 255]))
print("read_bytes：", blob.read_bytes())
with open(blob, "rb") as f:
    print("先读 2 字节：", f.read(2))
    print("tell 位置：", f.tell())
    f.seek(0)
    print("seek 回 0 再全读：", f.read())

print("=== print 直接写文件 ===")
log = WORK / "log.txt"
with open(log, "w", encoding="utf-8") as f:
    print("第一行", file=f)
    print("第二行", file=f, end="")
print("log.txt 内容：", repr(log.read_text(encoding="utf-8")))

print("=== 文件不存在 ===")
try:
    open(WORK / "nope.txt", encoding="utf-8")
except FileNotFoundError as e:
    print("FileNotFoundError errno =", e.errno, "| strerror =", e.strerror)

print("=== 换行符：newline 参数决定写什么、按什么读 ===")
crlf = WORK / "crlf.txt"
with open(crlf, "w", encoding="utf-8", newline="") as f:
    f.write("a\r\nb\r\n")
print("写成 CRLF 的原始字节：", crlf.read_bytes())
print("按通用换行读出：", crlf.read_text(encoding="utf-8").splitlines())

print("=== 追加模式的文件指针 ===")
with open(log, "a", encoding="utf-8") as f:
    print("追加的一行", file=f)
print("追加后：", log.read_text(encoding="utf-8").splitlines())

shutil.rmtree(WORK)
print("清理完成，临时目录还在吗：", WORK.exists())