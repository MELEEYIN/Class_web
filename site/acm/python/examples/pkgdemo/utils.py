"""上层工具：用相对导入复用同包的 shapes。"""

from .shapes import Circle, Square


def area_table():
    return [("circle r=2", round(Circle(2).area(), 2)), ("square a=2", Square(2).area())]