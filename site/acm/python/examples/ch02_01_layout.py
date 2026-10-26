"""ch02_01_layout.py —— 缩进成块、续行、print 的参数"""
import sys


def classify(n):
    if n > 0:                       # 冒号开启一个块
        return "正数"                # 4 个空格，同一块内必须一致
    elif n < 0:
        return "负数"
    else:
        return "零"


print(classify(3), classify(-1), classify(0))

total = (1 + 2 +                    # 括号内可以自由换行：隐式续行
         3 + 4)
print("隐式续行:", total)

total2 = 1 + 2 + \
    3 + 4                           # 反斜杠续行：能用括号就别用它
print("显式续行:", total2)

print("a", "b", "c")                # 默认 sep=" "，end="\n"
print("a", "b", "c", sep="-")
print("没有换行", end="")
print("接着打印")

print("默认源文件编码:", sys.getdefaultencoding())
print("相邻字符串字面量会自动拼接:", "a" "b")

value = print("print 的返回值是")
print("也就是:", value)