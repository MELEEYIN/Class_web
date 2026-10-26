"""ch18_01_class_basics.py —— 类、实例、属性与命名习惯"""


class Point:
    count = 0

    def __init__(self, x, y):
        self.x = x
        self.y = y
        Point.count += 1

    def move(self, dx, dy):
        self.x += dx
        self.y += dy
        return self

    def __repr__(self):
        return f"Point({self.x}, {self.y})"


p = Point(1, 2)
q = Point(3, 4)
print("两个点：", p, q)
print("类属性 count：", Point.count, "| 通过实例也能读到：", p.count)

print("=== 实例属性遮蔽类属性 ===")
p.count = 99
print("p.count：", p.count, "| q.count：", q.count, "| Point.count：", Point.count)
del p.count
print("删掉实例属性后回到类属性：", p.count)

print("=== self 就是实例本身 ===")
print("p.move 是绑定方法：", p.move)
print("返回值就是 self：", p.move(1, 1) is p)
print("链式调用：", p.move(1, 0).move(0, 1), "| 现在 p =", p)

print("=== 可变类属性是所有实例共享的 ===")


class Bag:
    items = []

    def add(self, item):
        self.items.append(item)


b1, b2 = Bag(), Bag()
b1.add("a")
print("b1.items：", b1.items, "| b2.items：", b2.items)
print("是同一个列表：", b1.items is b2.items)


class SafeBag:
    def __init__(self):
        self.items = []

    def add(self, item):
        self.items.append(item)


s1, s2 = SafeBag(), SafeBag()
s1.add("a")
print("修正版 b1：", s1.items, "| b2：", s2.items)

print("=== 单下划线是约定，双下划线会被改名 ===")


class Secret:
    def __init__(self):
        self._internal = "单下划线：约定别碰"
        self.__hidden = "双下划线：被改名"

    def reveal(self):
        return self.__hidden


s = Secret()
print(s._internal)
try:
    print(s.__hidden)
except AttributeError as e:
    print("直接访问 s.__hidden ->", type(e).__name__ + ":", e)
print("__dict__ 里真实存在的键：", [k for k in s.__dict__ if "hidden" in k])
print("通过方法访问：", s.reveal())
print("按改名后的名字访问：", s._Secret__hidden)

print("=== 实例字典与类字典 ===")
print("p.__dict__：", p.__dict__)
print("Point 里的自定义名字：", sorted(k for k in Point.__dict__ if not k.startswith("__")))
print("方法本身是函数对象：", type(Point.move).__name__)
print("通过类调用要手动传 self：", Point.move(Point(0, 0), 5, 5))

print("=== 类属性在类体里可以直接算 ===")


class Config:
    base = 10
    double = base * 2

    def __init__(self, name):
        self.name = name


print("Config.double：", Config.double, "| 实例也能读到：", Config("demo").double)