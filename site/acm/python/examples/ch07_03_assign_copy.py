"""ch07_03_assign_copy.py —— 切片赋值、切片拷贝与浅拷贝"""
import copy

a = [1, 2, 3, 4, 5, 6]
a[1:3] = ["x", "y", "z"]
print("等长区间可替换成更长的序列：", a)
a[0:0] = ["head"]
print("插到最前：", a)
a[1:3] = []
print("赋空列表等于删除一段：", a)
del a[::2]
print("del 带步长：", a)
try:
    a[::2] = [0, 1]
except ValueError as e:
    print("ValueError:", e)

print("=== 切片就是浅拷贝 ===")
b = [1, 2, 3]
c = b[:]
c.append(4)
print("b:", b, "| c:", c, "| b is c:", b is c)
inner = [[1], [2]]
d = inner[:]
d[0].append(99)
print("内层被共用：", inner, "|", d)
e = copy.deepcopy(inner)
e[0].append(0)
print("deepcopy 之后互不影响：", inner, "|", e)

print("=== 不可变对象也能切 ===")
t = (1, 2, 3, 4)
print("元组切片：", t[1:3], type(t[1:3]).__name__)
print("字符串切片：", "abcdef"[::2])

print("=== slice 对象：给切片起名字 ===")
s = "abcdefgh"
FRONT = slice(0, 3)
print(s[FRONT], s[FRONT] == s[0:3])
print("slice 的三个属性：", FRONT.start, FRONT.stop, FRONT.step)


def middle(xs, n=1):
    """掐头去尾各 n 个元素"""
    return xs[n:len(xs) - n]


print("middle 演示：", middle("abcdef", 2), middle([1, 2, 3], 1))