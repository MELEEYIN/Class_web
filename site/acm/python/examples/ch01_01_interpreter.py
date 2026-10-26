"""ch01_01_interpreter.py —— 解释器身份、编译期错误与运行期错误"""
import platform
import sys
from pathlib import Path


def add(a, b):
    return a + b


print("版本三元组：", sys.version_info[:3])
print("实现：", platform.python_implementation())
print("本文件运行时的 __name__：", __name__)
print("sys.path[0] 指向脚本所在目录：", Path(sys.path[0]).name)

print("--- 编译期就能发现的错 ---")
try:
    compile("def f(:\n    pass", "<demo>", "exec")
except SyntaxError as e:
    print("SyntaxError:", e.msg, "| 第", e.lineno, "行")

print("--- 编译通过、执行到才炸的错 ---")
try:
    add(1, "2")
except TypeError as e:
    print("TypeError:", e)

print("--- 另外两种运行方式，本质都是执行同一份字节码 ---")
print(add(1, 2))