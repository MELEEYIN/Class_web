"""ch06_02_tuples.py —— 元组：不可变、解包、单元素与哈希"""
from collections import namedtuple

t = (1, 2, 3)
print(t, len(t), t[0], t[-1], t[1:])
print("空元组：", (), "| 单元素必须带逗号：", (1,), "| 这不是元组：", (1))

print("=== 不可变的含义 ===")
try:
    t[0] = 99
except TypeError as e:
    print("TypeError:", e)
u = t + (4,)
print("拼接产生新元组：", u, "| 原元组：", t)

print("=== 解包：Python 最有用的语法糖之一 ===")
a, b = 1, 2
a, b = b, a
print("交换后：", a, b)
x, y = (3, 4)
print(x, y)
first, *rest = [1, 2, 3, 4]
print(first, rest)
head, *mid, tail = "abcd"
print(head, mid, tail)
print("divmod 返回元组：", divmod(7, 2))
for i, ch in enumerate("ab"):
    print(i, ch)

print("=== 元组作字典键 ===")
pos = {(0, 0): "起点", (1, 2): "终点"}
print(pos[(1, 2)])
try:
    {[1]: "x"}
except TypeError as e:
    print("TypeError:", e)

print("=== 不可变的记录：namedtuple ===")
Point = namedtuple("Point", "x y")
p = Point(3, 4)
print(p, p.x, p[1])
print("按位置解包：", tuple(p))
print("可变性对比：list 能改，tuple 只能重建")