"""ch11_02_keyfuncs.py —— lambda 的主场：key 函数与 map/filter"""
import operator
from itertools import groupby

students = [("小明", 92), ("小红", 85), ("小刚", 92)]
print("按分数：", sorted(students, key=lambda t: t[1]))
print("分数降序、同分按姓名：", sorted(students, key=lambda t: (-t[1], t[0])))

print("=== 多关键字：返回元组即可 ===")
words = ["bb", "a", "ccc", "dd"]
print("先长度后字典序：", sorted(words, key=lambda w: (len(w), w)))

print("=== max/min 也接受 key ===")
print("最长：", max(words, key=len), "| 最短：", min(words, key=len))

print("=== groupby 要求先排序 ===")
data = [("水果", "苹果"), ("蔬菜", "白菜"), ("水果", "香蕉")]
data.sort(key=lambda p: p[0])
for k, group in groupby(data, key=lambda p: p[0]):
    print(k, [g[1] for g in group])

print("=== map / filter 返回惰性迭代器 ===")
nums = [1, 2, 3, 4]
m = map(lambda x: x * 2, nums)
print("map 对象类型：", type(m).__name__, "| 转列表：", list(m))
print("filter：", list(filter(lambda x: x % 2 == 0, nums)))

print("=== 与推导式对比 ===")
print("map+lambda：", list(map(lambda x: x * 2, nums)))
print("推导式：", [x * 2 for x in nums])
print("内置函数够了就别写 lambda：", list(map(str, nums)))

print("=== operator.itemgetter 比 lambda 更快 ===")
pairs = [(1, "b"), (1, "a"), (0, "z")]
print("lambda 版：", sorted(pairs, key=lambda p: (p[0], p[1])))
print("itemgetter 版：", sorted(pairs, key=operator.itemgetter(0, 1)))
print("attrgetter 版：")
from collections import namedtuple

Point = namedtuple("Point", "x y")
pts = [Point(1, 5), Point(1, 2), Point(0, 9)]
print(sorted(pts, key=operator.attrgetter("x", "y")))