"""ch04_02_logic.py —— and/or 返回操作数、短路求值、海象运算符"""


def check(v):
    print("  调用 check(", v, ")")
    return v > 0


print("=== and / or 返回的是操作数，不是 True/False ===")
print(0 or "默认值")
print("" or None)
print(3 and 0)
print(2 and 3)
print(not [])

print("=== 短路：右边的函数压根不执行 ===")
print(check(5) and check(-1) and check(9))
print(check(-1) and check(9) and check(7))

print("=== 用 or 给默认值，用 and 做守卫 ===")
config = {}
level = config.get("level") or "info"
print("level =", level)
name = None
print(name and name.upper())

print("=== 海象运算符 := （3.8+） ===")
data = ["10", "x", "30"]
for s in data:
    if (n := s.isdigit()) and n:
        print("  纯数字行:", s)
nums = [int(s) for s in data if (t := s.strip()).isdigit()]
print("过滤后的数字:", nums)

print("=== 三目表达式的正确形态 ===")
print("负数" if -3 < 0 else "非负")

print("=== in / not in ===")
print(2 in [1, 2, 3], "py" in "python", "k" in {"k": 1})
print("4 in range(1, 5):", 4 in range(1, 5))