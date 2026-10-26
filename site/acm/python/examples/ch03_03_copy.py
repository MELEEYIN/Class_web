"""ch03_03_copy.py —— 浅拷贝 / 深拷贝 / 不可变"""
import copy

a = [1, [2, 3]]
b = a.copy()             # 浅拷贝：只复制最外层
c = copy.deepcopy(a)     # 深拷贝：递归复制所有层次

b[0] = 100
b[1].append(99)

print("a =", a)
print("b =", b)
print("c =", c)

print("--- 不可变对象：改了就是新对象 ---")
s = "abc"
t = s
s += "d"
print(s, t, s is t)

tup = (1, [2, 3])
try:
    tup[0] = 9
except TypeError as e:
    print("TypeError:", e)
tup[1].append(9)          # 元素可变，容器仍不可变
print("元组内部被改了:", tup)

print("--- 浅拷贝对字典/集合 ---")
d = {"k": [1, 2]}
d2 = dict(d)
d2["k"].append(3)
print(d, d2)

print("--- 列表乘法的陷阱 ---")
grid = [[0] * 3] * 3
grid[0][0] = 1
print(grid)
grid2 = [[0] * 3 for _ in range(3)]
grid2[0][0] = 1
print(grid2)