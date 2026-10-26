# 示例：examples/ch26_03_traps.py

print("== 与 is:")
a = int("1000")
b = int("1000")
print(" 值相等:", a == b, "| 是同一对象:", a is b)
print(" 小整数被缓存:", int("256") is int("256"))

print()
print("字符串组合判断:")
role = "guest"
print(" 错误写法 role == 'admin' or 'root' ->", repr(role == "admin" or "root"))
print(" 正确写法 role in ('admin', 'root') ->", repr(role in ("admin", "root")))

print()
print("strip 的语义:")
print(" 只去两端空白:", repr("  a b  ".strip()))
print(" 参数是字符集合:", repr("xyhxy".strip("xy")))

print()
print("浮点比较:")
print(" 0.1 + 0.2 == 0.3 ->", 0.1 + 0.2 == 0.3)
print(" 实际误差:", repr(0.1 + 0.2 - 0.3))

print()
print("除法:")
print(" 7 / 2  =", 7 / 2, "| 类型", type(7 / 2).__name__)
print(" 7 // 2 =", 7 // 2, "| 类型", type(7 // 2).__name__)

print()
print("遮蔽内置名:")
lst = list
list = [1, 2, 3]
try:
    list("abc")
except TypeError as e:
    print(" 遮蔽后调不动:", e)
list = lst
print(" 恢复后:", list("abc"))

print()
print("隐式字符串拼接:")
print(" 相邻字面量自动连:", repr("abc" "def"))
print(" 混合元组需要逗号:", ("abc" "def", "x"))