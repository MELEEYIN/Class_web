"""ch04_03_assign.py —— 增量赋值、链式赋值、解包"""
print("=== += 对可变对象是原地改 ===")
a = [1, 2]
b = a
b += [3]
print("a =", a, "b =", b, "a is b:", a is b)

c = [1, 2]
d = c
d = d + [3]          # + 造新对象，d 改指新表
print("c =", c, "d =", d, "c is d:", c is d)

print("=== += 对元组只能重建 ===")
t = (1, 2)
try:
    t[0] = 9
except TypeError as e:
    print("TypeError:", e)
t += (3,)            # 这不是原地改，是造了新元组
print("t =", t)

print("=== 链式赋值与交换 ===")
x = y = 0
x, y = 1, 2
x, y = y, x
print("x, y =", x, y)

print("=== 解包 ===")
first, *rest = [1, 2, 3, 4]
print("first =", first, "rest =", rest)
head, *mid, tail = "abcdef"
print("head =", head, "mid =", mid, "tail =", tail)
(a, b), c = (1, 2), 3
print("嵌套解包:", a, b, c)
try:
    p, q = [1, 2, 3]
except ValueError as e:
    print("ValueError:", e)

print("=== 可读性：别用 _ 以外的星号解包做副作用 ===")
total = sum([1, 2, 3])
print("sum 的返回值:", total)