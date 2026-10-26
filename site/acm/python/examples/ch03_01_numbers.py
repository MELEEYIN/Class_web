"""ch03_01_numbers.py —— int / float / Decimal / Fraction / bool"""
print("=== int：任意精度，不溢出 ===")
print(2 ** 100)
print(10 ** 20 // 7)
print(len(str(2 ** 200)))          # 大整数转字符串也没问题

print("=== float：二进制浮点，有误差 ===")
print(0.1 + 0.2)
print(0.1 + 0.2 == 0.3)
print(f"{0.1 + 0.2:.20f}")         # 看真实的二进制近似值
print(1e16 + 1)                    # 精度只有 15~17 位十进制
print(2 ** 53, 2 ** 53 + 1, float(2 ** 53) + 1)
print(round(2.675, 2))             # 不是 2.68

print("=== Decimal / Fraction：要精确就用它们 ===")
from decimal import Decimal, getcontext
from fractions import Fraction

getcontext().prec = 30
print(Decimal("0.1") + Decimal("0.2"))
print(Decimal("1.1") * Decimal("3"))
print(Fraction(1, 3) + Fraction(1, 6))

print("=== bool 是 int 的子类 ===")
print(True + True)
print(isinstance(True, int), type(True) is int)
print(sum([True, False, True, True]))   # 统计满足条件的个数

print("=== 除法总是返回 float ===")
print(4 / 2, type(4 / 2).__name__)
print(4 // 2, type(4 // 2).__name__)