"""ch18_04_dataclass_property.py —— dataclass、property、类方法与静态方法"""
from dataclasses import dataclass, field, asdict, replace


@dataclass
class Item:
    name: str
    price: float
    tags: list[str] = field(default_factory=list)
    qty: int = 1

    def total(self):
        return self.price * self.qty


item = Item("键盘", 199.0, ["外设"], 2)
print(item)
print("total：", item.total())
print("asdict：", asdict(item))

print("=== dataclass 白送的方法 ===")
print("相等按字段比：", Item("a", 1.0) == Item("a", 1.0))
print("两个实例共享同一个 tags 列表：", Item("x", 1).tags is Item("y", 2).tags)
print("replace 造新对象：", replace(item, qty=5))

print("=== frozen：不可变且可哈希 ===")


@dataclass(frozen=True)
class Point:
    x: int
    y: int


pt = Point(1, 2)
print("不可变：", pt)
try:
    pt.x = 9
except Exception as e:
    print(type(e).__name__ + ":", e)
print("能进 set：", len({Point(1, 2), Point(1, 2), Point(3, 4)}))

print("=== order=True：直接可排序 ===")


@dataclass(order=True)
class Version:
    major: int
    minor: int


print(sorted([Version(1, 10), Version(1, 2), Version(2, 0)]))

print("=== __post_init__：字段校验 ===")


@dataclass
class Span:
    lo: int
    hi: int

    def __post_init__(self):
        if self.lo > self.hi:
            raise ValueError(f"lo({self.lo}) 不能大于 hi({self.hi})")


try:
    Span(5, 1)
except ValueError as e:
    print("ValueError:", e)
print("合法：", Span(1, 5))

print("=== property：把方法伪装成属性并加校验 ===")


class Temperature:
    def __init__(self, celsius=0.0):
        self.celsius = celsius

    @property
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError(f"低于绝对零度：{value}")
        self._celsius = value

    @property
    def fahrenheit(self):
        return self._celsius * 9 / 5 + 32

    @fahrenheit.setter
    def fahrenheit(self, value):
        self.celsius = (value - 32) * 5 / 9


t = Temperature(25)
print("摄氏：", t.celsius, "| 华氏：", t.fahrenheit)
t.fahrenheit = 212
print("设华氏 212 后摄氏：", round(t.celsius, 6))
try:
    t.celsius = -300
except ValueError as e:
    print("ValueError:", e)
print("赋值失败后原值没变：", t.celsius)


class Circle:
    def __init__(self, r):
        self.r = r

    @property
    def area(self):
        return 3.14159 * self.r ** 2


try:
    Circle(2).area = 10
except AttributeError as e:
    print("只读属性 -> AttributeError:", e)

print("=== classmethod 与 staticmethod ===")


class Date:
    def __init__(self, y, m, d):
        self.y, self.m, self.d = y, m, d

    def __repr__(self):
        return f"Date({self.y}, {self.m}, {self.d})"

    @classmethod
    def from_string(cls, s):
        return cls(*map(int, s.split("-")))

    @staticmethod
    def is_leap(year):
        return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


print(Date.from_string("2024-02-29"))
print("闰年判断：", Date.is_leap(2024), Date.is_leap(2023), Date.is_leap(1900))
print("三种方法绑定差异：",
      type(Date.from_string).__name__, type(Date.is_leap).__name__, type(Date.__init__).__name__)


class SubDate(Date):
    @classmethod
    def from_string(cls, s):
        print("  cls 是子类：", cls.__name__)
        return super().from_string(s)


print(SubDate.from_string("2000-01-01"))

print("=== 属性名与字段名撞车：实例化时才炸 ===")


@dataclass
class Bad:
    x: int = 0

    @property
    def x(self):
        return 1


print("类定义本身不报错：", Bad.__name__)
try:
    Bad()
except AttributeError as e:
    print("AttributeError:", e)