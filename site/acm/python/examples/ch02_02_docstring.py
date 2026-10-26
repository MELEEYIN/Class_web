"""ch02_02_docstring.py —— 文档字符串不是注释"""
import math


def area(r):
    """返回半径为 r 的圆面积。

    参数 r 必须为正数；否则返回 None。
    """
    if r <= 0:
        return None
    return math.pi * r * r


def nothing():
    pass                            # 空块必须用 pass 占位


print("第一行文档：", area.__doc__.splitlines()[0])
print("第二行文档：", area.__doc__.splitlines()[1])
print("area(2) =", round(area(2), 4))
print("area(-1) =", area(-1))
print("nothing() =", nothing())

print("模块自己的 __doc__：", __doc__)

text = """这只是一个普通的多行字符串，
不赋值给函数的第一条语句时，它就不是文档字符串。"""
print("行数：", text.count("\n") + 1)