"""ch17_03_bigfile.py —— 大文件、上下文管理器与四个常见坑"""
import os
import shutil
from pathlib import Path

WORK = Path(__file__).resolve().parent / "_tmp" / "ch17_03"
if WORK.exists():
    shutil.rmtree(WORK)
WORK.mkdir(parents=True)

big = WORK / "big.txt"
with open(big, "w", encoding="utf-8") as f:
    for i in range(1000):
        f.write(f"row {i}\n")

print("=== 三种读法的行数一致，内存占用完全不同 ===")
print("read_text + splitlines：", len(big.read_text(encoding="utf-8").splitlines()))

count = 0
with open(big, encoding="utf-8") as f:
    for line in f:
        count += 1
print("逐行迭代：", count, "行")

print("=== 把逐行读封装成生成器：调用方只关心数据 ===")


def iter_lines(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield line.rstrip("\n")


print("前 3 行：", [line for _, line in zip(range(3), iter_lines(big))])

print("=== 手写上下文管理器：保证一定关闭 ===")


class ManagedFile:
    def __init__(self, path, mode="r", encoding="utf-8"):
        self.path = path
        self.mode = mode
        self.encoding = encoding
        self.handle = None

    def __enter__(self):
        self.handle = open(self.path, self.mode, encoding=self.encoding)
        return self.handle

    def __exit__(self, exc_type, exc, tb):
        self.handle.close()
        return False


with ManagedFile(big) as fh:
    print("第一行：", fh.readline().strip())

print("=== 坑 1：忘记 close ===")
fh = open(big, encoding="utf-8")
fh.readline()
print("关了吗：", fh.closed)
fh.close()
print("close 之后：", fh.closed)
try:
    fh.read()
except ValueError as e:
    print("关闭后再读：ValueError:", e)

print("=== 坑 2：with 之外还想用文件对象 ===")
with open(big, encoding="utf-8") as fh2:
    data = fh2.read()
print("数据已经读进内存，可以继续用：", len(data.splitlines()), "行")
try:
    fh2.read()
except ValueError as e:
    print("但文件对象已失效：ValueError:", e)

print("=== 坑 3：写入没有 flush，读到的可能是旧的 ===")
flush_demo = WORK / "flush.txt"
w = open(flush_demo, "w", encoding="utf-8")
w.write("写入但没 flush")
w.flush()
print("flush 之后读到：", repr(flush_demo.read_text(encoding="utf-8")))
w.close()

print("=== 坑 4：os.chdir 改变的是整个进程的工作目录 ===")
before = Path.cwd()
os.chdir(WORK)
print("切到临时目录后，相对路径 big.txt 存在：", Path("big.txt").exists())
os.chdir(before)
print("切回原目录：", Path.cwd() == before)

print("=== 删除临时目录 ===")
shutil.rmtree(WORK)
print("清理完成：", WORK.exists())