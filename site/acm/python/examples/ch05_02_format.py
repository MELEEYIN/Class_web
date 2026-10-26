"""ch05_02_format.py —— 三代格式化：%、format、f-string"""
from datetime import date

name, score = "小明", 92.4567
print("=== % 旧式（知道就行，新代码别用） ===")
print("%s 得分 %.2f" % (name, score))
print("%5s|%-5s|" % ("ab", "ab"))

print("=== str.format ===")
print("{} 得分 {:.2f}".format(name, score))
print("{0}-{1}-{0}".format("A", "B"))
print("{n} 得分 {s:.1f}".format(n=name, s=score))

print("=== f-string：日常首选 ===")
print(f"{name} 得分 {score:.2f}")
print(f"舍入到整数：{score:.0f}，科学计数：{score:.2e}")
print(f"宽度对齐：[{42:>6}][{42:<6}][{42:^6}]")
print(f"补零：[{42:06d}]，带符号：[{42:+d}][{-42:+d}]")
print(f"千分位：{1234567:,}，百分比：{0.256:.1%}")
print(f"进制：{255:#x} {255:x} {5:#b} {8:o}")
print(f"repr：{name!r}，调试语法：{score=}")
width = 8
print(f"嵌套宽度：[{42:>{width}}]")
print(f"日期：{date(2024, 1, 5):%Y-%m-%d}，{date(2024, 1, 5):%A}")

print("=== 拼接性能：join 而不是 + ===")
parts = [str(i) for i in range(5)]
print("+ 拼接:", "".join(parts) == "0" + "1" + "2" + "3" + "4")
print("join 结果:", "|".join(parts))