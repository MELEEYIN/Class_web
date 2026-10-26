"""ch06_04_sets.py —— 集合：去重、集合运算与可哈希要求"""
s = {3, 1, 2}
print("元素个数：", len(s), "| 想稳定输出用 sorted：", sorted(s))
print("空集合只能写 set()：", set(), "| 而 {} 是空字典：", type({}).__name__)

print("=== 去重 ===")
words = ["a", "b", "a", "c"]
print("set 去重后元素数：", len(set(words)))
print("保序去重：", list(dict.fromkeys(words)))

print("=== 增删与成员判断 ===")
s.add(4)
s.discard(99)
print(sorted(s))
s.remove(4)
try:
    s.remove(99)
except KeyError as e:
    print("KeyError:", e)
print("成员判断：", 2 in s, 99 in s)

print("=== 集合运算 ===")
a = set("abcd")
b = set("cdef")
print("交集：", sorted(a & b), "| 并集：", sorted(a | b))
print("差集：", sorted(a - b), "| 对称差：", sorted(a ^ b))
print("子集：", {"a", "b"} <= a, "| 真子集：", a < a)
print("方法写法等价：", sorted(a.intersection(b)) == sorted(a & b))

print("=== 就地运算 ===")
c = {1, 2}
c |= {3}
c &= {2, 3, 9}
print(sorted(c))

print("=== 元素必须可哈希 ===")
try:
    {{1, 2}}
except TypeError as e:
    print("TypeError:", e)
print("元组可入集合：", sorted({(1, 2), (0, 2)}))
print("frozenset 可作字典键：", {frozenset({1, 2}): "ok"}[frozenset({2, 1})])