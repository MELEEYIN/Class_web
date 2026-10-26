"""几何形状：包里的叶子模块，只依赖标准库。"""

import math


class Circle:
    def __init__(self, r):
        self.r = r

    def area(self):
        return math.pi * self.r ** 2


class Square:
    def __init__(self, a):
        self.a = a

    def area(self):
        return self.a ** 2