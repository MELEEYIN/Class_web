"""ch04_01_arith.py —— 算术、比较链与位运算"""
print("=== 四种除法 ===")
print(7 / 2, 7 // 2, 7 % 2, divmod(7, 2))
print(-7 / 2, -7 // 2, -7 % 2, divmod(-7, 2))
print("负数取模跟着除数走：", -7 % 3, 7 % -3)
print("浮点整除向下取整：", 7.0 // 2, -7.0 // 2)
print("幂是右结合：", 2 ** 3 ** 2, "负指数给小数：", 10 ** -2)
print("零除的两种情况：")
try:
    print(1 / 0)
except ZeroDivisionError as e:
    print("  ZeroDivisionError:", e)
try:
    print(1 % 0)
except ZeroDivisionError as e:
    print("  ZeroDivisionError:", e)

print("=== 比较可以连写 ===")
x = 5
print(1 < x < 10, 0 <= x <= 4 == 4)
print("字符串按字典序比较：", "apple" < "banana", "a" < "B")   # 大写字母编码更小

print("=== 位运算 ===")
print(5 & 3, 5 | 3, 5 ^ 3, ~5)
print(1 << 10, -8 >> 1)
print("位运算优先级低于算术：", 1 << 2 + 3)     # 1 << 5

print("=== NaN 不等于自己 ===")
nan = float("nan")
print(nan == nan, nan != nan)