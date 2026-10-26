"""ch08_01_conditions.py —— 条件与真值、链式比较、三元与 match"""
score = 85
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
elif score >= 60:
    grade = "C"
else:
    grade = "D"
print("成绩：", score, "等级：", grade)

print("=== 什么算真 ===")
for v in [0, 1, -1, "", "0", [], [0], {}, None, 0.0]:
    print(repr(v), "->", bool(v))

print("=== 链式比较 ===")
x = 5
print(0 <= x < 10, 0 < x < 3, x < 10 < 20)
print("链式等价于 and：", (0 <= x) and (x < 10))

print("=== 条件表达式（三元） ===")
n = -7
print("绝对值：", n if n >= 0 else -n)
print("奇偶：", "偶数" if n % 2 == 0 else "奇数")
print("链式三元：", "负" if n < 0 else ("零" if n == 0 else "正"))

print("=== 不要在条件里写 == True ===")
flags = [True, False, True]
print([f for f in flags if f])
print("and/or 返回操作数：", None and 1, 0 or "默认值", 1 and 2)

print("=== match/case（3.10+） ===")


def describe(cmd):
    match cmd:
        case "quit" | "exit":
            return "退出"
        case ["go", direction]:
            return f"向 {direction} 移动"
        case {"n": n}:
            return f"收到 n={n}"
        case int() | float():
            return "数字"
        case _:
            return "未知"


print(describe("quit"), describe(["go", "北"]), describe({"n": 3}))
print(describe(2.5), describe("zzz"))