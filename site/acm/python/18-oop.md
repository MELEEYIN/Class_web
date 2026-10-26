# 18 · 面向对象

> **本质**：类是一张「有哪些属性、怎么算」的图纸，实例是一个带自己小字典的对象；`obj.attr` 不是一条内存偏移，而是一次沿 MRO 的运行时查表。

**读完这一章你能做到**

1. 说清 `obj.x` 每一步去哪找，知道为什么 `self` 必须写在参数表里。
2. 用 `@dataclass` 十行写完全参构造、相等、`repr`，不再手抄样板代码。
3. 用 `property` 给字段加校验，让 `t.celsius = -300` 当场抛错。
4. 读懂菱形继承下的 MRO，明白 `super()` 找的不是「父类」而是「MRO 上的下一个」。
5. 写出实现了 `__len__` / `__getitem__` / `__eq__` / `__hash__` 的对象，让它能当内置类型用。

## 18.1 类和实例到底存了什么

`class` 语句执行完，得到的是一个**对象**（类本身也是对象）。类体里写的名字进 `类的 __dict__`，`__init__` 里 `self.xxx =` 写的名字进**每个实例自己的 `__dict__`**。属性访问就是先查实例字典，再沿继承链查类字典。

```pycon
>>> class Point:
...     dim = 2
...     def __init__(self, x, y):
...         self.x, self.y = x, y
...     def norm1(self):
...         return abs(self.x) + abs(self.y)
...
>>> p = Point(3, -4)
>>> sorted(k for k in Point.__dict__ if not k.startswith("__"))
['dim', 'norm1']
>>> p.__dict__
{'x': 3, 'y': -4}
>>> p.dim
2
```

方法也是类字典里的一个普通函数对象，`p.norm1` 之所以不用传 `self`，是因为取属性时**绑定**了一次：

```pycon
>>> class Calc:
...     def twice(self, n):
...         return 2 * n
...
>>> c = Calc()
>>> Calc.twice(c, 21)
42
>>> type(Calc.twice).__name__
'function'
>>> type(c.twice).__name__
'method'
>>> c.twice.__self__ is c
True
>>> Calc.twice.__qualname__
'Calc.twice'
```

`Calc.twice` 是**函数**，`c.twice` 是**方法对象**：取属性时解释器把函数和 `c` 绑在一起。所以「`self` 是隐式传的第一个参数」不是语法糖，而是绑定机制的结果——这也解释了为什么 `Calc.twice()` 少传参数只会得到一个 `TypeError`（提示缺少位置参数），而不是什么「类方法调用失败」。

查表顺序用一个小实验钉死：实例字典 → 类型 → 父类 → … → `object`。

```pycon
>>> class A:
...     v = "A.v"
...
>>> class B(A):
...     v = "B.v"
...
>>> b = B()
>>> b.v
'B.v'
>>> b.v = "instance"
>>> b.v
'instance'
>>> del b.v
>>> b.v
'B.v'
>>> "v" in b.__dict__
False
```

```python
# 示例：examples/ch18_01_class_basics.py
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
```

```text
两个点： Point(1, 2) Point(3, 4)
类属性 count： 2 | 通过实例也能读到： 2
=== 实例属性遮蔽类属性 ===
p.count： 99 | q.count： 2 | Point.count： 2
删掉实例属性后回到类属性： 2
=== self 就是实例本身 ===
p.move 是绑定方法： <bound method Point.move of Point(1, 2)>
返回值就是 self： True
链式调用： Point(3, 4) | 现在 p = Point(3, 4)
=== 可变类属性是所有实例共享的 ===
b1.items： ['a'] | b2.items： ['a']
是同一个列表： True
修正版 b1： ['a'] | b2： []
=== 单下划线是约定，双下划线会被改名 ===
单下划线：约定别碰
直接访问 s.__hidden -> AttributeError: 'Secret' object has no attribute '__hidden'
__dict__ 里真实存在的键： ['_Secret__hidden']
通过方法访问： 双下划线：被改名
按改名后的名字访问： 双下划线：被改名
=== 实例字典与类字典 ===
p.__dict__： {'x': 3, 'y': 4}
Point 里的自定义名字： ['count', 'move']
方法本身是函数对象： function
通过类调用要手动传 self： Point(5, 5)
=== 类属性在类体里可以直接算 ===
Config.double： 20 | 实例也能读到： 20
```

三件事在这段输出里同时成立：赋值 `b.v = ...` **只在实例字典里新建一个键**，不碰类；`del` 之后重新落到类属性；`Point.count += 1` 这种「读类属性再写回类属性」必须写全名，写 `self.count += 1` 会先读类属性、再在实例字典里造一个遮蔽它的新键。

> **⚠️ 易错**：类体里 `items = []` 是所有实例共享的同一个列表。`Bag()` 建两个对象，`b1.add("a")` 之后 `b2.items` 也是 `['a']`。凡是可变默认状态，一律写进 `__init__` 的 `self.items = []`，或者用 `@dataclass` 的 `field(default_factory=list)`。

## 18.2 类属性、实例属性与遮蔽

| 写法 | 落在哪 | 生命周期 | 典型用途 |
| --- | --- | --- | --- |
| `class C: n = 0` | `C.__dict__` | 随类 | 常量、计数器、默认配置 |
| `self.n = 0` | 实例 `__dict__` | 随实例 | 每个对象自己的状态 |
| `C.n = 5` | 改类字典 | 随类 | 全局开关、注册表 |
| `@property` | 类字典里的描述符 | 随类 | 计算属性 + 校验 |

同名时**实例赢**，且这个遮蔽是单实例的：`p.count = 99` 之后 `q.count` 仍是类值。类属性改了，没被遮蔽的实例立刻看到新值；已经被遮蔽的不受影响。

```pycon
>>> class Cfg:
...     retries = 3
...
>>> a, b = Cfg(), Cfg()
>>> a.retries = 10
>>> b.retries, Cfg.retries
(3, 3)
>>> Cfg.retries = 5
>>> a.retries, b.retries
(10, 5)
```

另一个坑在类体内部：类体的作用域**不是**闭包作用域，所以方法里不能直接读类体中的名字。

```pycon
>>> class Bad:
...     value = 42
...     def get(self):
...         return value
...
>>> try:
...     Bad().get()
... except NameError as e:
...     print(type(e).__name__, e)
NameError name 'value' is not defined
>>> class Good:
...     value = 42
...     def get(self):
...         return self.value
...
>>> Good().get()
42
```

## 18.3 命名约定与名字改写

Python 用命名表达可见性，编译器只对**双下划线开头、不以双下划线结尾**的名字动手：在类 `S` 里写 `self.__v`，实际存成 `self._S__v`。这叫名字改写（name mangling），目的是让子类不会意外覆盖父类的私有实现。

```pycon
>>> class S:
...     def __init__(self):
...         self.__v = 1
...     def get(self):
...         return self.__v
...
>>> s = S()
>>> s.get()
1
>>> list(s.__dict__)
['_S__v']
>>> s._S__v
1
>>> try:
...     s.__v
... except AttributeError as e:
...     print(type(e).__name__, e)
AttributeError 'S' object has no attribute '__v'
```

改写只在**类体内**发生，所以子类里写的 `self.__v` 会变成 `self._子类名__v`，是另一个槽位。而 `super().__init__()` 内部的 `self.__v` 是在父类体里编译的，改写前缀仍是父类名——这就是双下划线「恰好」能保护私有字段的原因。

```pycon
>>> class T:
...     def __init__(self):
...         self.__x__ = 9
...         self._y = 10
...
>>> T().__dict__
{'__x__': 9, '_y': 10}
```

| 写法 | 含义 | 是否被改写 | 外部能访问吗 |
| --- | --- | --- | --- |
| `name` | 公开 | 否 | 能 |
| `_name` | 内部实现，约定别碰 | 否 | 能（靠自觉） |
| `__name` | 类私有 | 是 → `_Cls__name` | 要写全名才能 |
| `__name__` | 协议钩子 | 否 | 能，别自造 |
| `name_` | 避开关键字（`class_`） | 否 | 能 |

> **⚠️ 易错**：`from module import *` 不会导入下划线开头的名字；单元测试要访问 `obj._Cls__v` 时，说明你正在测试私有实现，该停下来看设计。

## 18.4 继承与 `super()`

继承有两层含义：**接口兼容**（子类能当父类用）和**代码复用**（不重写就沿用）。`isinstance` 检查整条链，`type` 只看精确类型——判断「是不是某类东西」永远用 `isinstance`。

```pycon
>>> class Animal:
...     def __init__(self, name):
...         self.name = name
...     def speak(self):
...         return self.name + " 发出声音"
...
>>> class Dog(Animal):
...     def speak(self):
...         return self.name + " 汪汪"
...
>>> d = Dog("旺财")
>>> isinstance(d, Animal), type(d) is Animal
(True, False)
>>> isinstance(True, int), type(True) is int
(True, False)
```

`super()` 的正确心智模型是「在 `type(self)` 的 MRO 上，从**当前类之后**继续找下一个」。它不是「父类引用」，所以在多继承里能保证每个类只被调一次。

```pycon
>>> class Base:
...     def tag(self):
...         return ["Base"]
...
>>> class Left(Base):
...     def tag(self):
...         return ["Left"] + super().tag()
...
>>> class Right(Base):
...     def tag(self):
...         return ["Right"] + super().tag()
...
>>> class Both(Left, Right):
...     def tag(self):
...         return ["Both"] + super().tag()
...
>>> Both().tag()
['Both', 'Left', 'Right', 'Base']
```

注意 `Base` 只出现一次、且排在最后——这是合作式多继承（cooperative inheritance）的效果：每一层都调 `super()`，链条自然走完。只要有一层忘了调 `super().__init__()`，后面的初始化全部静默丢失。

```python
# 示例：examples/ch18_02_inherit.py
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
```

```text
旺财 汪汪 | 咪咪 发出声音（喵）
子类没写 __init__ 就用父类的： 我是 Dog，叫 旺财
isinstance 看整条继承链： True True
type 只看精确类型： False True
=== super() 调用父类实现 ===
小黑 汪汪，而且是奶声奶气
=== MRO：菱形继承时的查找顺序 ===
D 的 MRO： ['D', 'B', 'C', 'A', 'object']
D().who()： D -> B -> C -> A
=== 合作式 super：每个类都调一次 ===
初始化顺序： ['Both', 'Left', 'Right', 'Base']
Both 的 MRO： ['Both', 'Left', 'Right', 'Base', 'object']
=== 抽象基类：强制子类实现 ===
Square 的面积是 9.00
Circle 的面积是 3.14
TypeError: Can't instantiate abstract class Shape without an implementation for abstract method 'area'
TypeError: Can't instantiate abstract class Bad without an implementation for abstract method 'area'
=== 覆盖与扩展：调父类再加工 ===
大黄 汪汪
=== 用 mixin 组合能力 ===
{"age": 18, "name": "小明"}
User 的 MRO： ['User', 'JsonMixin', 'object']
```

**覆盖要调父类**：想「在父类行为上加点东西」就先 `super().speak()` 再加工，而不是复制一遍父类代码。想彻底替换就不调，这是有意为之的替换（override）而不是扩展（extend），写注释说明。

## 18.5 MRO：多继承的查找顺序

Python 用 C3 线性化算出一条顺序，存在 `Cls.__mro__` 里。规则是：子类在父类前、按声明顺序、且每个类只出现一次。

```pycon
>>> class A:
...     def who(self):
...         return "A"
...
>>> class B(A):
...     def who(self):
...         return "B" + super().who()
...
>>> class C(A):
...     def who(self):
...         return "C" + super().who()
...
>>> class D(B, C):
...     pass
...
>>> [k.__name__ for k in D.__mro__]
['D', 'B', 'C', 'A', 'object']
>>> D().who()
'BCA'
>>> class E(C, B):
...     pass
...
>>> [k.__name__ for k in E.__mro__]
['E', 'C', 'B', 'A', 'object']
>>> E().who()
'CBA'
```

`D().who()` 里 `super()` 是在 `B` 的方法体里编译的，但它按 `type(self)` 即 `D` 的 MRO 走，于是 B 之后是 C，C 之后是 A。把声明顺序从 `(B, C)` 换成 `(C, B)`，输出就从 `BCA` 变 `CBA`——**多继承的行为由声明顺序决定**，这也是它危险的地方。

C3 会拒绝矛盾的继承图：

```pycon
>>> class X: pass
...
>>> class Y(X): pass
...
>>> try:
...     class Z(X, Y): pass
... except TypeError as e:
...     print(type(e).__name__ + ":", e)
TypeError: Cannot create a consistent method resolution order (MRO) for bases X, Y
```

> **💡 提示**：需要多继承时，让第一个基类是「真正的主体」，其余是 mixin（只提供一两个方法、自己不实例化、不写 `__init__`）。`class User(JsonMixin)` 这种单主体 + 能力组合是安全的；两个都有状态的主体类做多继承，早晚撞上 MRO。

## 18.6 魔术方法：让对象长得像内置类型

魔术方法（dunder method）不是给你直接调的，是解释器在特定语法下替你调的：`len(x)` 找 `__len__`，`x + y` 找 `__add__`，`print(x)` 找 `__str__`，`[x]` 找 `__repr__`。写对了，你的对象就能进 `sorted`、`for`、`in`、`set`。

**`__str__` 给人看，`__repr__` 给开发者看**。只写一个时，写 `__repr__`——它同时服务调试、容器显示和日志。

```pycon
>>> class M:
...     def __init__(self, v):
...         self.v = v
...     def __str__(self):
...         return f"值={self.v}"
...     def __repr__(self):
...         return f"M({self.v})"
...
>>> m = M(7)
>>> print(m)
值=7
>>> str(m), repr(m)
('值=7', 'M(7)')
>>> [m]
[M(7)]
>>> f"{m} / {m!r}"
'值=7 / M(7)'
```

`__repr__` 的验收标准是：`eval(repr(x)) == x` 尽量成立。

**`__eq__` 与 `__hash__` 是一份契约**：相等的对象必须有相同哈希；一旦你定义了 `__eq__`，Python 会把 `__hash__` 设成 `None`，对象立刻变成不可哈希——这是故意的，防止「相等但哈希不同」破坏字典。

```pycon
>>> class P:
...     def __init__(self, v):
...         self.v = v
...     def __eq__(self, other):
...         return isinstance(other, P) and self.v == other.v
...
>>> try:
...     hash(P(1))
... except TypeError as e:
...     print(type(e).__name__, e)
TypeError unhashable type: 'P'
>>> P(1) == P(1)
True
>>> P(1) == 1
False
```

`__eq__` 里遇到不认识的类型要 `return NotImplemented`（不是 `False`），这样 Python 才会去试对方的 `__eq__`。

**容器协议**四个方法就够用了：

```pycon
>>> class Deck:
...     def __init__(self):
...         self._c = ["A", "K", "Q"]
...     def __len__(self):
...         return len(self._c)
...     def __getitem__(self, i):
...         return self._c[i]
...
>>> d = Deck()
>>> len(d), d[0], d[-1], d[1:]
(3, 'A', 'Q', ['K', 'Q'])
>>> [c for c in Deck()]
['A', 'K', 'Q']
>>> "K" in Deck()
True
```

只写 `__getitem__`，`for` 和 `in` 就自动能用（解释器退回到「从 0 开始索引直到 `IndexError`」）；`in` 的退路是逐个 `==` 比较，O(n)。补上 `__contains__` 才能自己决定怎么做。补上 `__iter__` 才能返回真正的迭代器（第 15 章）。

| 语法 | 调用的方法 | 不写时的默认 |
| --- | --- | --- |
| `len(x)` | `__len__` | `TypeError` |
| `x[i]` / `x[a:b]` | `__getitem__` | `TypeError` |
| `x[i] = v` | `__setitem__` | `TypeError` |
| `for v in x` / `in` | `__iter__` → 退化用 `__getitem__` | 不可迭代 |
| `bool(x)` | `__bool__` → 退化用 `__len__` | 恒 `True` |
| `x == y` / `x < y` | `__eq__` / `__lt__` | 比身份 |
| `x + y` | `__add__` | `TypeError` |
| `print(x)` / `f"{x}"` | `__str__` → 退化 `__repr__` | 带地址的默认形式 |
| `x()` | `__call__` | 不可调用 |
| `with x:` | `__enter__` / `__exit__` | `TypeError` |

只写 `__lt__` 和 `__eq__`，其余比较可以由 `functools.total_ordering` 补齐：

```pycon
>>> import functools
>>> @functools.total_ordering
... class V:
...     def __init__(self, t):
...         self.t = tuple(t)
...     def __eq__(self, o):
...         return self.t == o.t
...     def __lt__(self, o):
...         return self.t < o.t
...
>>> V((1, 2)) < V((1, 10)), V((1, 2)) <= V((1, 2)), V((2, 0)) > V((1, 9))
(True, True, True)
```

元组比较是按元素字典序，所以 `(1, 2) < (1, 10)`——这正是版本号排序写错的原因：字符串 `"1.2" < "1.10"` 是 `False`，拆成整数元组才是对的。

```python
# 示例：examples/ch18_03_magic.py
"""ch18_03_magic.py —— 魔术方法：让自定义对象像内置类型一样工作"""
import functools


class Money:
    def __init__(self, amount):
        self.amount = amount

    def __repr__(self):
        return f"Money({self.amount})"

    def __str__(self):
        return f"￥{self.amount}"

    def __eq__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return self.amount == other.amount

    def __hash__(self):
        return hash(self.amount)

    def __add__(self, other):
        if isinstance(other, Money):
            return Money(self.amount + other.amount)
        return NotImplemented

    def __lt__(self, other):
        return self.amount < other.amount

    def __len__(self):
        return len(str(self.amount))


a, b = Money(30), Money(12)
print("str：", str(a), "| repr：", repr(a))
print("容器里显示的是 repr：", [a, b])

print("=== 相等与哈希 ===")
print("Money(5) == Money(5)：", Money(5) == Money(5))
print("Money(5) == Money(6)：", Money(5) == Money(6))
print("Money(5) == '5'：", Money(5) == "5")
print("去重后集合大小：", len({Money(5), Money(5), Money(6)}))

print("=== 算术与比较 ===")
print("相加：", a + b)
try:
    a + 1
except TypeError as e:
    print("TypeError:", e)
print("排序：", [str(m) for m in sorted([a, b, Money(21)])])
print("len 走 __len__：", len(Money(12345)))

print("=== 定义了 __eq__ 却没定义 __hash__ 就不可哈希 ===")


class Unhashable:
    def __init__(self, v):
        self.v = v

    def __eq__(self, other):
        return isinstance(other, Unhashable) and self.v == other.v


try:
    {Unhashable(1)}
except TypeError as e:
    print("TypeError:", e)

print("=== 容器协议：__len__ / __getitem__ / __contains__ / __iter__ ===")


class Deck:
    def __init__(self):
        self._cards = ["A", "K", "Q"]

    def __len__(self):
        return len(self._cards)

    def __getitem__(self, index):
        return self._cards[index]

    def __contains__(self, value):
        return value in self._cards

    def __iter__(self):
        return iter(self._cards)


deck = Deck()
print("len：", len(deck), "| deck[0]：", deck[0], "| deck[1:]：", deck[1:])
print("'K' in deck：", "K" in deck, "| 遍历：", [c for c in deck])
print("bool 看 __len__：", bool(Deck()), "| 空序列为假")


class Empty:
    def __len__(self):
        return 0


print("len 为 0 的对象：", bool(Empty()))

print("=== __call__：实例也能像函数一样调用 ===")


class Multiplier:
    def __init__(self, k):
        self.k = k

    def __call__(self, x):
        return x * self.k


double = Multiplier(2)
print("double(21)：", double(21))
print("是 callable：", callable(double))

print("=== total_ordering：只写两个比较，补齐全部 ===")


@functools.total_ordering
class Version:
    def __init__(self, parts):
        self.parts = tuple(parts)

    def __eq__(self, other):
        return self.parts == other.parts

    def __lt__(self, other):
        return self.parts < other.parts

    def __repr__(self):
        return "Version" + repr(self.parts)


v1, v2 = Version((1, 2)), Version((1, 10))
print(v1, v2)
print("<：", v1 < v2, "| <=：", v1 <= Version((1, 2)), "| >：", Version((2, 0)) > v2, "| >=：", v1 >= v1)
```

```text
str： ￥30 | repr： Money(30)
容器里显示的是 repr： [Money(30), Money(12)]
=== 相等与哈希 ===
Money(5) == Money(5)： True
Money(5) == Money(6)： False
Money(5) == '5'： False
去重后集合大小： 2
=== 算术与比较 ===
相加： ￥42
TypeError: unsupported operand type(s) for +: 'Money' and 'int'
排序： ['￥12', '￥21', '￥30']
len 走 __len__： 5
=== 定义了 __eq__ 却没定义 __hash__ 就不可哈希 ===
TypeError: cannot use 'Unhashable' as a set element (unhashable type: 'Unhashable')
=== 容器协议：__len__ / __getitem__ / __contains__ / __iter__ ===
len： 3 | deck[0]： A | deck[1:]： ['K', 'Q']
'K' in deck： True | 遍历： ['A', 'K', 'Q']
bool 看 __len__： True | 空序列为假
len 为 0 的对象： False
=== __call__：实例也能像函数一样调用 ===
double(21)： 42
是 callable： True
=== total_ordering：只写两个比较，补齐全部 ===
Version(1, 2) Version(1, 10)
<： True | <=： True | >： True | >=： True
```

## 18.7 `@dataclass`：删掉样板代码

一个只有字段的类，`__init__`、`__repr__`、`__eq__` 全是手抄的噪音。`@dataclass` 按**带注解的类属性**自动生成这三样。

```pycon
>>> from dataclasses import dataclass, field, asdict, replace
>>> @dataclass
... class Item:
...     name: str
...     price: float
...     tags: list = field(default_factory=list)
...
>>> i = Item("键盘", 199.0)
>>> i
Item(name='键盘', price=199.0, tags=[])
>>> i == Item("键盘", 199.0)
True
>>> Item("a", 1).tags is Item("b", 2).tags
False
>>> asdict(i)
{'name': '键盘', 'price': 199.0, 'tags': []}
>>> replace(i, price=99.0).price
99.0
```

`default_factory` 不是啰嗦，`default_factory=list` 才是「每个实例新建一个空列表」。写成 `tags: list = []` 会被直接拒绝：

```pycon
>>> from dataclasses import dataclass
>>> try:
...     @dataclass
...     class Bad:
...         tags: list = []
... except ValueError as e:
...     print(type(e).__name__ + ":", e)
ValueError: mutable default <class 'list'> for field tags is not allowed: use default_factory
```

常用参数一览：

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `frozen=True` | 不可变，自动生成 `__hash__` | 可进 `set`、可当 `dict` 键 |
| `order=True` | 按字段顺序生成 `<` `<=` `>` `>=` | 排序按字段声明顺序 |
| `eq=False` | 不生成 `__eq__`，用身份比较 | 想自己写比较时 |
| `slots=True` | 3.10+，生成 `__slots__`，省内存 | 不能再乱加属性 |
| `kw_only=True` | 3.10+，字段只能按关键字传 | 参数多时防错位 |

字段顺序有硬规矩：**没有默认值的字段必须在有默认值的之前**，否则 `TypeError: non-default argument 'x' follows default argument`。要在字段上附带「不参与比较/不参与 repr」的元信息，用 `field(compare=False, repr=False)`。

`__post_init__` 是唯一能放校验的地方——它在生成的 `__init__` 末尾被调用：

```pycon
>>> from dataclasses import dataclass
>>> @dataclass
... class Span:
...     lo: int
...     hi: int
...     def __post_init__(self):
...         if self.lo > self.hi:
...             raise ValueError(f"lo({self.lo}) 不能大于 hi({self.hi})")
...
>>> Span(1, 5)
Span(lo=1, hi=5)
>>> try:
...     Span(5, 1)
... except ValueError as e:
...     print(type(e).__name__, ":", e)
ValueError : lo(5) 不能大于 hi(1)
```

```python
# 示例：examples/ch18_04_dataclass_property.py
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
```

```text
Item(name='键盘', price=199.0, tags=['外设'], qty=2)
total： 398.0
asdict： {'name': '键盘', 'price': 199.0, 'tags': ['外设'], 'qty': 2}
=== dataclass 白送的方法 ===
相等按字段比： True
两个实例共享同一个 tags 列表： False
replace 造新对象： Item(name='键盘', price=199.0, tags=['外设'], qty=5)
=== frozen：不可变且可哈希 ===
不可变： Point(x=1, y=2)
FrozenInstanceError: cannot assign to field 'x'
能进 set： 2
=== order=True：直接可排序 ===
[Version(major=1, minor=2), Version(major=1, minor=10), Version(major=2, minor=0)]
=== __post_init__：字段校验 ===
ValueError: lo(5) 不能大于 hi(1)
合法： Span(lo=1, hi=5)
=== property：把方法伪装成属性并加校验 ===
摄氏： 25 | 华氏： 77.0
设华氏 212 后摄氏： 100.0
ValueError: 低于绝对零度：-300
赋值失败后原值没变： 100.0
只读属性 -> AttributeError: property 'area' of 'Circle' object has no setter
=== classmethod 与 staticmethod ===
Date(2024, 2, 29)
闰年判断： True False False
三种方法绑定差异： method function function
  cls 是子类： SubDate
Date(2000, 1, 1)
=== 属性名与字段名撞车：实例化时才炸 ===
类定义本身不报错： Bad
AttributeError: property 'x' of 'Bad' object has no setter
```

> **💡 提示**：`@dataclass` 与普通类不是二选一。字段多、需要比较与 `repr` 的数据类用它；有复杂 `__init__` 逻辑或大量方法的行为类，手写更清楚。

## 18.8 `property`：属性门面 + 校验

`property` 把一个 getter 变成「看起来是字段」的只读属性，再加一个 setter 就能在赋值时校验。这是 Python 加字段校验的标准做法——不需要写 `set_celsius()`。

```pycon
>>> class T:
...     def __init__(self, c):
...         self.celsius = c
...     @property
...     def celsius(self):
...         return self._celsius
...     @celsius.setter
...     def celsius(self, v):
...         if v < -273.15:
...             raise ValueError(f"低于绝对零度：{v}")
...         self._celsius = v
...     @property
...     def fahrenheit(self):
...         return self._celsius * 9 / 5 + 32
...
>>> t = T(100)
>>> t.fahrenheit
212.0
>>> try:
...     t.celsius = -300
... except ValueError as e:
...     print(type(e).__name__, e)
ValueError 低于绝对零度：-300
>>> t.celsius
100
>>> try:
...     t.fahrenheit = 0
... except AttributeError as e:
...     print(type(e).__name__, e)
AttributeError property 'fahrenheit' of 'T' object has no setter
```

三个要点：

1. **内部真值换个名字存**（`_celsius`），否则 `self.celsius = v` 会递归调自己 → `RecursionError`。
2. `__init__` 里也走 setter（`self.celsius = c`），校验逻辑只有一份。
3. 没有 setter 就是只读，赋值抛 `AttributeError: ... has no setter`，这是最便宜的「不可变」。

> **⚠️ 易错**：`@dataclass` 的字段名和 `property` 同名时，报错发生在**实例化**，不是类定义：
> `AttributeError: property 'x' of 'Bad' object has no setter`。因为生成的 `__init__` 里 `self.x = x` 撞上了只读描述符。别用同一套字段名重定义属性——要么字段名带下划线，要么用 `__post_init__` 赋值。

## 18.9 `classmethod`、`staticmethod`、普通方法

三种方法只差在「第一个参数是什么」：

| 写法 | 第一个参数 | 通过实例调 | 通过类调 | 典型用途 |
| --- | --- | --- | --- | --- |
| `def m(self)` | 实例 | ✅ | 要手动传 | 读写实例状态 |
| `@classmethod def m(cls)` | 类 | ✅（`cls` 是 `type(self)`） | ✅ | 备选构造器、注册表 |
| `@staticmethod def m()` | 无 | ✅ | ✅ | 与类主题相关的纯函数 |

```pycon
>>> class D:
...     def __init__(self, v):
...         self.v = v
...     @classmethod
...     def from_string(cls, s):
...         return cls(int(s))
...     @staticmethod
...     def is_even(n):
...         return n % 2 == 0
...
>>> D.from_string("42").v
42
>>> D.is_even(3), D(0).is_even(4)
(False, True)
>>> class E(D):
...     pass
...
>>> type(E.from_string("1")).__name__
'E'
```

`from_string` 里用 `cls(...)` 而不是硬写 `D(...)`，子类调用时才返回子类实例——这是工厂方法必须用 `classmethod` 的唯一理由。`staticmethod` 本质上只是「放在类命名空间里的普通函数」，`D.is_even` 拿到的就是函数本身。

## 18.10 抽象基类与鸭子类型

Python 没有 `interface` 关键字，靠两件事：**鸭子类型**（有 `speak()` 就能当动物用）和**抽象基类**（用 `ABC` 声明「必须实现」，实例化时就拦住）。

```pycon
>>> from abc import ABC, abstractmethod
>>> class Shape(ABC):
...     @abstractmethod
...     def area(self):
...         ...
...     def describe(self):
...         return f"{type(self).__name__} 面积 {self.area():.2f}"
...
>>> try:
...     Shape()
... except TypeError as e:
...     print(type(e).__name__ + ":", e)
TypeError: Can't instantiate abstract class Shape without an implementation for abstract method 'area'
>>> class Sq(Shape):
...     def __init__(self, a):
...         self.a = a
...     def area(self):
...         return self.a ** 2
...
>>> Sq(3).describe()
'Sq 面积 9.00'
```

`ABC` 帮你在**构造时**就失败，而不是等到调用 `area()` 才发现没实现。子类忘了实现任何一个 `@abstractmethod`，`TypeError` 消息里会点名那个方法。

需要「按接口做 `isinstance` 检查」但不想强制继承时，用 `typing.Protocol`（3.8+，3.12 起可直接用于 `isinstance`）：

```pycon
>>> from typing import Protocol, runtime_checkable
>>> @runtime_checkable
... class Sized(Protocol):
...     def __len__(self) -> int: ...
...
>>> isinstance([1, 2], Sized), isinstance(42, Sized)
(True, False)
```

> **💡 提示**：`abc` 还提供 `collections.abc` 里那批现成基类（`Sequence`、`Mapping`、`Iterable`）。自定义容器继承它们，能免费得到 `__contains__`、`keys()`、`items()` 这些派生方法，只需实现少数几个核心方法。

## 18.a 与 C++ 的差别

| 维度 | Python | C++ |
| --- | --- | --- |
| 访问控制 | 只有命名约定 + 名字改写，运行时无强制 | `private/protected/public` 编译期强制 |
| 方法派发 | 一律动态查 MRO，无虚函数概念 | 要 `virtual` 才动态；非虚按静态类型 |
| 重载 | 不支持，同名方法后者覆盖前者 | 按参数类型/个数重载 |
| 析构 | 引用计数归零即回收，`__del__` 不保证时机 | 确定性析构，作用域结束必调 |
| 对象位置 | 一律堆上，变量是引用 | 栈/堆可选，`sizeof` 精确 |
| 多继承 | 允许，C3 线性化出 MRO | 允许，菱形需 `virtual` 继承，无线性化 |
| `const` 成员函数 | 没有，靠约定 | `const` 限定可调用性 |
| 构造 | `__init__` 里逐字段赋值，无初始化列表 | 成员初始化列表、构造顺序固定 |
| 模板/泛型 | 类型注解 + `typing`，运行时擦除 | 模板特化，编译期实例化 |
| 值/引用语义 | 一切皆引用，`==` 可自定义 | 值语义默认，`==` 需重载 |

最需要适应的一条：**Python 的对象总是堆上的引用**，`a = b` 从不复制（第 3 章）。C++ 里 `Point p = q;` 是拷贝构造，Python 里 `p = q` 只是给同一个对象多贴一个名字。

## 18.b 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 两个实例共享一个列表 | 可变类属性 / 可变默认参数 | 状态写进 `__init__`，或用 `field(default_factory=list)` |
| `TypeError: missing 1 required positional argument: 'self'` | 用类名直接调实例方法 | 传实例，或改成 `@staticmethod` |
| `AttributeError: 'X' object has no attribute '__v'` | 名字被改写成 `_X__v` | 用 `self._X__v`，或加公开 getter |
| 改了父类字段却报 `RecursionError` | property 的 setter 里又赋给自己 | 内部真值存 `self._x` |
| 子类 `__init__` 后父类字段不存在 | 忘了 `super().__init__(...)` | 每个 `__init__` 首行调 `super()` |
| `__eq__` 写了，对象进 `set` 报 `unhashable` | 定义 `__eq__` 会清空 `__hash__` | 同时定义 `__hash__`，或 `frozen=True` |
| 多继承行为诡异 | 声明顺序决定 MRO | 打印 `Cls.__mro__`，主体类放第一个 |
| `TypeError: non-default argument follows default argument` | dataclass 字段顺序 | 无默认值字段排前面 |
| 只读属性赋值报错 | 只有 getter 没有 setter | 加 `@x.setter`，或改用方法 |
| `isinstance` 判类型时漏掉子类 | 用了 `type(x) is C` | 改 `isinstance(x, C)` |
| `setattr` 乱加属性，拼错名字不报错 | 默认 `__dict__` 自由增删 | 用 `__slots__` 或 `dataclass(slots=True)` |
| 覆盖方法后父类逻辑消失 | 忘了 `super().method()` | 先调父类再加工 |

## 18.c 练习

**基础 1**：写 `Rectangle` 类，`width`/`height` 两个字段，提供 `area()` 与 `perimeter()`；再写 `Square` 继承它，用 `Square(3)` 表示边长 3。

验收：`Square(3).area() == 9` 且 `Square(3).perimeter() == 12`，`isinstance(Square(3), Rectangle)` 为 `True`。

**基础 2**：给 `Rectangle` 加 `__repr__` 和 `__eq__`，让 `Rectangle(2, 3) == Rectangle(2, 3)` 为 `True`，且 `print([Rectangle(2, 3)])` 输出 `[Rectangle(2, 3)]`。

验收：`repr(Rectangle(2, 3)) == 'Rectangle(2, 3)'`；把两个不同尺寸的放进 `set` 得到 2 个元素（需要你补 `__hash__`）。

**基础 3**：用 `@dataclass` 写 `Student`（`name`、`scores: list[int]`），加 `average()` 方法，并保证两个 `Student("a", [])` 的 `scores` 不是同一个列表。

验收：`Student("a", []).scores is Student("b", []).scores` 为 `False`；`Student("x", [80, 90]).average() == 85.0`。

**变式**：写 `BankAccount`，`balance` 用 `property` 保护：外部只能读不能直接写，`deposit(n)` / `withdraw(n)` 里校验 `n > 0` 且余额不足时抛 `ValueError`。

验收：`a.withdraw(200)` 在余额 100 时抛 `ValueError`；`a.balance = 999` 抛 `AttributeError`；两次失败操作后 `a.balance` 仍是原值。

**挑战**：写一个 `Matrix` 类，实现 `__init__(rows: list[list[float]])`、`__repr__`、`__eq__`、`__add__`（维度不符抛 `ValueError`）、`__matmul__`（矩阵乘法，内维不符抛 `ValueError`）、`__len__`（返回行数），并让它支持 `for row in m`。

验收：`(Matrix([[1, 2]]) + Matrix([[3, 4]])) == Matrix([[4, 6]])`；`Matrix([[1, 2]]) @ Matrix([[1], [2]])` 得到 `Matrix([[5]])`；维度不符时 `type(e) is ValueError`；`list(Matrix([[1], [2]])) == [[1], [2]]`。

## 18.d 小结

1. `obj.attr` 是一次运行时查表：实例 `__dict__` → 类型 → MRO，所以类属性只是「所有实例共享的默认值」，可变的话就成灾。
2. 魔术方法让自定义对象接入内置语法，`__eq__` 与 `__hash__` 必须成对出现，`__repr__` 是唯一必须写的调试接口。
3. 日常写类先想 `@dataclass`，要校验用 `property`，要组合用 mixin + `super()`，多继承前先打印 `__mro__`。

下一章我们把类拆成文件和目录：`import` 到底按什么顺序找、`__init__.py` 有什么用、`python -m` 与 `python file.py` 为什么行为不同。
