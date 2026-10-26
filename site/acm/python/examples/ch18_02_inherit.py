"""ch18_02_inherit.py —— 继承、super、MRO 与抽象基类"""
from abc import ABC, abstractmethod


class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        return f"{self.name} 发出声音"

    def describe(self):
        return f"我是 {type(self).__name__}，叫 {self.name}"


class Dog(Animal):
    def speak(self):
        return f"{self.name} 汪汪"


class Cat(Animal):
    def speak(self):
        return super().speak() + "（喵）"


d, c = Dog("旺财"), Cat("咪咪")
print(d.speak(), "|", c.speak())
print("子类没写 __init__ 就用父类的：", d.describe())
print("isinstance 看整条继承链：", isinstance(d, Animal), isinstance(d, Dog))
print("type 只看精确类型：", type(d) is Animal, type(d) is Dog)

print("=== super() 调用父类实现 ===")


class Puppy(Dog):
    def speak(self):
        return super().speak() + "，而且是奶声奶气"


print(Puppy("小黑").speak())

print("=== MRO：菱形继承时的查找顺序 ===")


class A:
    def who(self):
        return "A"


class B(A):
    def who(self):
        return "B -> " + super().who()


class C(A):
    def who(self):
        return "C -> " + super().who()


class D(B, C):
    def who(self):
        return "D -> " + super().who()


print("D 的 MRO：", [k.__name__ for k in D.__mro__])
print("D().who()：", D().who())

print("=== 合作式 super：每个类都调一次 ===")
order = []


class Base:
    def __init__(self):
        order.append("Base")
        super().__init__()


class Left(Base):
    def __init__(self):
        order.append("Left")
        super().__init__()


class Right(Base):
    def __init__(self):
        order.append("Right")
        super().__init__()


class Both(Left, Right):
    def __init__(self):
        order.append("Both")
        super().__init__()


Both()
print("初始化顺序：", order)
print("Both 的 MRO：", [k.__name__ for k in Both.__mro__])

print("=== 抽象基类：强制子类实现 ===")


class Shape(ABC):
    @abstractmethod
    def area(self):
        ...

    def describe(self):
        return f"{type(self).__name__} 的面积是 {self.area():.2f}"


class Square(Shape):
    def __init__(self, side):
        self.side = side

    def area(self):
        return self.side ** 2


class Circle(Shape):
    def __init__(self, r):
        self.r = r

    def area(self):
        return 3.14159 * self.r ** 2


print(Square(3).describe())
print(Circle(1).describe())
try:
    Shape()
except TypeError as e:
    print("TypeError:", e)
try:
    class Bad(Shape):
        pass

    Bad()
except TypeError as e:
    print("TypeError:", e)

print("=== 覆盖与扩展：调父类再加工 ===")


class LoudDog(Dog):
    def speak(self):
        return super().speak().upper()


print(LoudDog("大黄").speak())

print("=== 用 mixin 组合能力 ===")


class JsonMixin:
    def to_json(self):
        import json
        return json.dumps(self.__dict__, ensure_ascii=False, sort_keys=True)


class User(JsonMixin):
    def __init__(self, name, age):
        self.name = name
        self.age = age


print(User("小明", 18).to_json())
print("User 的 MRO：", [k.__name__ for k in User.__mro__])