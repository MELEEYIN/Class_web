# 20 · 类型注解与 typing

> **本质**：注解是**挂在函数和类上的元数据**，解释器把它存进 `__annotations__` 就完事——不检查、不转换、不影响执行速度，真正的检查发生在运行之前的静态分析工具里。

**读完这一章你能做到**

1. 说清 `def f(x: int) -> int` 在运行时到底做了什么（以及没做什么）。
2. 用内置泛型 `list[int]`、`dict[str, list[int]]`、`str | None` 写出准确的签名，不再写裸 `list`。
3. 知道什么时候用 `TypedDict`、`Literal`、`Callable`、`Protocol`，各自的运行时代价是零。
4. 跑起 `mypy`/`pyright`，把「传错参数类型」这类 bug 拦在运行之前。
5. 不被 `Any` 与 `# type: ignore` 骗过去——知道它们把检查关掉了，而不是修好了。

## 20.1 注解只是元数据

```pycon
>>> def add(a: int, b: int) -> int:
...     return a + b
...
>>> add.__annotations__
{'a': <class 'int'>, 'b': <class 'int'>, 'return': <class 'int'>}
>>> add("py", "thon")
'python'
>>> add([1], [2])
[1, 2]
```

`add("py", "thon")` 返回 `'python'`——注解没有拦住任何东西。这是新手最大的误解：**以为写了 `: int` 就有运行时类型检查**。Python 的选择是「注解即文档 + 静态工具即检查器」，代价是运行时零开销，收益是所有类型错误在 CI 里就能发现。

注解的值可以是**任意表达式**，不限于类型：

```pycon
>>> def f(x: "任意字符串", y: 1 + 2) -> None:
...     return None
...
>>> f.__annotations__
{'x': '任意字符串', 'y': 3, 'return': None}
```

所以「注解里的名字写错了」在定义时通常不报错——只在有人真的去解析它时才炸：

```pycon
>>> import typing
>>> def bad(x: "不存在的类型") -> None:
...     return None
...
>>> bad.__annotations__
{'x': '不存在的类型', 'return': None}
>>> try:
...     typing.get_type_hints(bad)
... except NameError as e:
...     print(type(e).__name__ + ":", e)
NameError: name '不存在的类型' is not defined
```

`typing.get_type_hints()` 是「把注解求值成真正的类型对象」的官方入口，字符串和前向引用都靠它解析。

> **💡 提示**：Python 3.14 起注解采用延迟求值（PEP 649）：模块/类的注解不再在定义时逐个求值，而是按需通过 `__annotate__` 计算。所以 `__annotations__` 在某些对象上要**通过模块或类对象访问**才拿得到，直接引用裸名字可能 `NameError`。3.7～3.13 里等价的做法是文件首行写 `from __future__ import annotations`（全部变成字符串）；3.14 之后这个 `__future__` 导入变成了默认行为的开关，可继续保留以兼容旧版本。

## 20.2 注解写在哪，存在哪

| 位置 | 写法 | 存到哪 | 会被检查吗 |
| --- | --- | --- | --- |
| 函数参数 | `def f(x: int)` | `f.__annotations__["x"]` | mypy 检查调用处 |
| 返回值 | `def f() -> int` | `f.__annotations__["return"]` | 检查 `return` 语句 |
| 模块变量 | `count: int = 0` | 模块 `__annotations__` | 检查赋值与使用 |
| 类属性 | `rate: float` | 类 `__annotations__` | 检查（`dataclass` 会用它生成 `__init__`） |
| 局部变量 | `x: int = 1` | **不存**，只给检查器看 | 检查，但运行时无痕 |
| 类型别名 | `Vector = list[float]` | 就是个普通变量 | 只是约定 |

局部变量注解连 `locals()` 里都不会多出东西——它是纯粹的「写给工具看的注释」：

```pycon
>>> def local():
...     x: int = 1
...     return sorted(locals())
...
>>> local()
['x']
```

```python
# 示例：examples/ch20_01_annotations.py
"""ch20_01_annotations.py —— 注解是表达式，存在 __annotations__ 里"""

import sys
import typing


def add(a: int, b: int) -> int:
    return a + b


print("函数注解：", add.__annotations__)
print("结果类型：", type(add(1, 2)).__name__)

print("=== 运行时不检查 ===")
print("传字符串照样跑：", add("py", "thon"))
print("传列表也跑：", add([1], [2]))
print("传什么都不会 TypeError：", add(1.5, True))

print("=== 注解可以是任意表达式，字符串会原样保留 ===")


def weird(x: "不存在的类型") -> "也不是类型":
    return x


print("字符串注解：", weird.__annotations__)
try:
    typing.get_type_hints(weird)
except NameError as e:
    print("get_type_hints 解析失败 ->", type(e).__name__ + ":", e)

print("=== 前向引用：类还没定义完就引用自己 ===")


class Node:
    def __init__(self, value: int, nxt: "Node | None" = None) -> None:
        self.value = value
        self.nxt = nxt


hints = typing.get_type_hints(Node.__init__)
print("解析后 value：", hints["value"].__name__)
print("解析后 nxt：", hints["nxt"])
print("nxt 是联合类型：", typing.get_origin(hints["nxt"]) is typing.Union)

print("=== 变量注解进 __annotations__，局部变量不进 ===")
count: int = 0
names: list[str] = []
mod = sys.modules[__name__]
print("模块级注解（3.14 起按需生成）：", mod.__annotations__)


def local_anno():
    x: int = 1
    return sorted(locals())


print("局部变量注解不产生任何运行时对象：", local_anno())


class Account:
    rate: float = 1.0
    history: list[str]


print("类注解：", Account.__annotations__)
print("注解不是属性，没有默认值时并不存在：", hasattr(Account, "history"))

print("=== 注解可以挂函数、类、模块，也是可反射的元数据 ===")
print("add 的注解键：", sorted(add.__annotations__))
print("类型本身也是对象：", add.__annotations__["a"] is int)
print("注解不会进函数签名检查：", add.__defaults__ is None)
```

```text
函数注解： {'a': <class 'int'>, 'b': <class 'int'>, 'return': <class 'int'>}
结果类型： int
=== 运行时不检查 ===
传字符串照样跑： python
传列表也跑： [1, 2]
传什么都不会 TypeError： 2.5
=== 注解可以是任意表达式，字符串会原样保留 ===
字符串注解： {'x': '不存在的类型', 'return': '也不是类型'}
get_type_hints 解析失败 -> NameError: name '不存在的类型' is not defined
=== 前向引用：类还没定义完就引用自己 ===
解析后 value： int
解析后 nxt： __main__.Node | None
nxt 是联合类型： True
=== 变量注解进 __annotations__，局部变量不进 ===
模块级注解（3.14 起按需生成）： {'count': <class 'int'>, 'names': list[str]}
局部变量注解不产生任何运行时对象： ['x']
类注解： {'rate': <class 'float'>, 'history': list[str]}
注解不是属性，没有默认值时并不存在： False
=== 注解可以挂函数、类、模块，也是可反射的元数据 ===
add 的注解键： ['a', 'b', 'return']
类型本身也是对象： True
注解不会进函数签名检查： True
```

多加一行注解的运行时成本是**零**（3.14 之前定义时要构造类型对象，微秒级；3.14 起连这一步都推迟了）。所以「有没有注解」不该由性能决定，而该由「这个函数会不会被别人调用」决定。

## 20.3 容器参数化：`list[int]` 而不是 `List[int]`

`list`、`dict`、`tuple`、`set`、`frozenset`、`type` 从 3.9 起支持下标参数化，`typing.List` 那一套已经过时（写出来不算错，但会触发 `DeprecationWarning`，`ruff` 有规则自动替换）。

```pycon
>>> from typing import get_args, get_origin
>>> get_origin(list[int]) is list
True
>>> get_args(dict[str, list[int]])
(<class 'str'>, list[int])
>>> tuple[int, str], tuple[int, ...]
(tuple[int, str], tuple[int, ...])
```

三种容器注解的语义不同，别写混：

| 注解 | 含义 | 能接受的值 |
| --- | --- | --- |
| `list[int]` | 变长的 int 列表 | `[1, 2, 3]`、`[]` |
| `tuple[int, str]` | **定长**，位置类型固定 | `(1, "a")` |
| `tuple[int, ...]` | 变长，元素同类型 | `(1, 2, 3)` |
| `dict[str, list[int]]` | 键值类型都要标 | `{"a": [1]}` |
| `set[int]` | 可哈希元素的集合 | `{1, 2}` |

参数化**不产生新类型**，只是造了一个带 `__origin__`/`__args__` 的 `GenericAlias` 对象：

```pycon
>>> type(list[int]).__name__
'GenericAlias'
>>> type(list[int]()).__name__
'list'
>>> list[int] == list[int]
True
```

`list[int] is list[int]` 是 `False`（每次访问都新建），但 `==` 为 `True`——所以缓存判断用 `==`。运行时不校验元素类型：`x: list[int] = [1, "a"]` 照跑，只有 mypy 会喊。

## 20.4 可选值与联合类型

`Optional[X]` 的准确读法是「`X` 或 `None`」，**不是**「可以不传」。参数「可以不传」是默认值的事：

```pycon
>>> from typing import Optional
>>> Optional[int] == (int | None)
True
>>> def f(a: int, b: Optional[int] = None) -> None: ...
...
>>> f(1)
>>> f(1, 2)
>>> f(1, None)
```

`X | None` 是 3.10+ 的写法（PEP 604），更短、更易读，且能直接用在 `isinstance` 里（3.10+）：

```pycon
>>> isinstance(3, int | str)
True
>>> isinstance(3.5, int | str)
False
>>> str(int | None)
'int | None'
```

多类型联合就继续 `|`：`int | str | None`。**顺序无关**，`int | str == str | int` 为 `True`。旧代码里的 `Union[int, str]` 与之等价，可以放心换掉。

> **⚠️ 易错**：`Optional[int]` 与 `int = None` 是两件事。前者说「值可能是 None」，后者说「不传时是 None」。如果一个参数永远不该是 `None`，就不要写成 `Optional`——否则每个调用点都得处理 `None` 分支，注解反而成了负担。

## 20.5 五个高频 typing 工具

**`Callable[[参数类型], 返回类型]`**——函数作为参数时用它，比 `Any` 强得多：

```pycon
>>> from typing import Callable
>>> def apply(f: Callable[[int], int], x: int) -> int:
...     return f(x)
...
>>> apply(lambda n: n * 3, 7)
21
```

**`Literal[...]`**——把取值限定为几个常量，比 `str` 精确得多：

```pycon
>>> from typing import Literal
>>> Mode = Literal["r", "w", "a"]
>>> Mode.__args__
('r', 'w', 'a')
>>> def open_mode(m: Mode) -> str:
...     return "打开 " + m
...
>>> open_mode("r")
'打开 r'
```

**`TypedDict`**——给「字段固定的字典」加类型，运行时仍是普通 `dict`，适合解析 JSON：

```pycon
>>> from typing import TypedDict
>>> class User(TypedDict):
...     name: str
...     age: int
...
>>> sorted(User.__required_keys__)
['age', 'name']
>>> u = User(name="小明", age=18)
>>> u
{'name': '小明', 'age': 18}
>>> User(name=1, age="x")
{'name': 1, 'age': 'x'}
```

最后一行说明它**不做运行时校验**：`TypedDict` 的价值是让 mypy 在你写 `u["nmae"]` 时报警。要运行时校验就用 `pydantic` 之类（第 21 章会提到它不在标准库里）。

**`Any`**——关掉检查。它和「没写注解」不同：没写时 mypy 默认视为 `Any`（除非开了 `disallow_untyped_defs`），写了 `Any` 则是明确宣告「这里我不管」。函数边界上出现 `Any` 是合理的（比如处理任意 JSON），业务逻辑里出现 `Any` 通常是偷懒。

**`Final` / `ClassVar`**——前者表示「只赋值一次」，后者表示「类变量，不属于实例」：

```pycon
>>> from typing import ClassVar, Final
>>> class C:
...     table: ClassVar[dict[str, int]] = {}
...     limit: Final = 100
...
>>> C.table, C.limit
({}, 100)
```

```python
# 示例：examples/ch20_02_containers.py
"""ch20_02_containers.py —— 容器泛型、联合、Literal、TypedDict"""

from collections.abc import Iterable, Iterator, Sequence
from typing import Any, Callable, Final, Literal, Optional, TypedDict

Vector = list[float]


def scale(v: Vector, k: float) -> Vector:
    return [x * k for x in v]


print("类型别名在运行时就是 list[float]：", Vector)
print("scale：", scale([1.0, -2.0], 2))
print("别名与本体相等：", Vector == list[float])

print("=== 容器参数化 ===")
print("list[int]：", list[int])
print("dict[str, list[int]]：", dict[str, list[int]])
print("tuple[int, str] 定长：", tuple[int, str])
print("tuple[int, ...] 变长同类型：", tuple[int, ...])
print("运行时不校验参数个数（只有类型检查器会报）：", list[int, str])
print("参数化只影响静态检查，实例仍是 list：", type(list[int]()).__name__)

print("=== 可选与联合 ===")


def find(name: str) -> str | None:
    return {"a": "A"}.get(name)


print("Optional[str] 与 str | None 等价：", Optional[str] == (str | None))
print("find('a')：", find("a"), "| find('z')：", find("z"))
print("联合顺序无关：", (int | str) == (str | int))

print("=== Literal：把取值限定成枚举 ===")
Mode = Literal["r", "w", "a"]
print("Literal 的可选值：", Mode.__args__)


def open_mode(m: Mode) -> str:
    return f"打开模式 {m}"


print(open_mode("r"))

print("=== TypedDict：给字典加字段说明 ===")


class User(TypedDict):
    name: str
    age: int
    tags: list[str]


u: User = {"name": "小明", "age": 18, "tags": ["python"]}
print("运行时就是普通 dict：", type(u).__name__, "|", u)
print("字段注解：", User.__annotations__)
print("必填字段：", sorted(User.__required_keys__))
print("没有额外运行时校验：", {**u, "extra": 1}["extra"])

print("=== Callable 与 Any ===")


def apply(f: Callable[[int], int], x: int) -> int:
    return f(x)


print("apply(lambda)：", apply(lambda n: n * 3, 7))
sq: Callable[[float], float] = lambda v: v * v
print("Callable 只是注解：", sq(1.5))
any_value: Any = 1
any_value = "现在变成字符串了"
print("Any 表示放弃检查：", any_value)

LIMIT: Final = 100
print("Final 只是标记，运行时照样能改：", LIMIT)
LIMIT = 200
print("改了也不报错：", LIMIT)

print("=== collections.abc：按能力而不是按类型注解 ===")


def total(xs: Iterable[int]) -> int:
    return sum(xs)


def head(xs: Sequence[int]) -> int:
    return xs[0]


print("total(list)：", total([1, 2, 3]))
print("total(生成器)：", total(x for x in range(4)))
print("head(list)：", head([9, 8]))
print("dict 是 Iterable 但不是 Sequence：", isinstance({}, Iterable), isinstance({}, Sequence))
print("range 是 Sequence：", isinstance(range(3), Sequence))
print("生成器是 Iterator 不是 Sequence：",
      isinstance((x for x in []), Iterator), isinstance((x for x in []), Sequence))
```

```text
类型别名在运行时就是 list[float]： list[float]
scale： [2.0, -4.0]
别名与本体相等： True
=== 容器参数化 ===
list[int]： list[int]
dict[str, list[int]]： dict[str, list[int]]
tuple[int, str] 定长： tuple[int, str]
tuple[int, ...] 变长同类型： tuple[int, ...]
运行时不校验参数个数（只有类型检查器会报）： list[int, str]
参数化只影响静态检查，实例仍是 list： list
=== 可选与联合 ===
Optional[str] 与 str | None 等价： True
find('a')： A | find('z')： None
联合顺序无关： True
=== Literal：把取值限定成枚举 ===
Literal 的可选值： ('r', 'w', 'a')
打开模式 r
=== TypedDict：给字典加字段说明 ===
运行时就是普通 dict： dict | {'name': '小明', 'age': 18, 'tags': ['python']}
字段注解： {'name': <class 'str'>, 'age': <class 'int'>, 'tags': list[str]}
必填字段： ['age', 'name', 'tags']
没有额外运行时校验： 1
=== Callable 与 Any ===
apply(lambda)： 21
Callable 只是注解： 2.25
Any 表示放弃检查： 现在变成字符串了
Final 只是标记，运行时照样能改： 100
改了也不报错： 200
=== collections.abc：按能力而不是按类型注解 ===
total(list)： 6
total(生成器)： 6
head(list)： 9
dict 是 Iterable 但不是 Sequence： True False
range 是 Sequence： True
生成器是 Iterator 不是 Sequence： True False
```

`Final` 在运行时**不阻止**重新赋值（上面输出里值被改成了 200）——它只让 mypy 报 `Cannot assign to final name`。这是理解整章的关键：注解层的规则全靠工具执行，解释器一概不管。

## 20.6 泛型：`TypeVar` 与 `Generic`

想让「传入 `list[int]` 返回 `int`，传入 `list[str]` 返回 `str`」这种关系被检查器理解，就需要类型变量：

```pycon
>>> from typing import TypeVar
>>> T = TypeVar("T")
>>> def first(items: list[T]) -> T:
...     return items[0]
...
>>> first([1, 2])
1
>>> first(["a"])
'a'
>>> T
~T
```

`T` 在运行时就是个 `TypeVar` 对象（`~T`），只在类型检查器眼里有意义。约束可以写死成若干类型，或用 `bound` 表示「某个类的子类」：

```pycon
>>> from typing import TypeVar
>>> Num = TypeVar("Num", int, float)
>>> Named = TypeVar("Named", bound="str | bytes")
>>> Num.__constraints__
(<class 'int'>, <class 'float'>)
>>> Named.__bound__
ForwardRef('str | bytes')
```

`bound` 传字符串时保存的是 `ForwardRef`（延迟解析），传真实类型（`bound=int`）则直接就是那个类——这也正是循环引用场景要写字符串形式的原因：它在运行时不会被求值。

泛型类用 `Generic[T]` 声明，字段与方法就能引用 `T`：

```python
# 片段
class Stack(Generic[T]):
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()
```

`Stack[int]` 与 `Stack[str]` 在运行时是**两个不同的对象**（每次参数化新建），但实例的 `type()` 都是 `Stack`——类型参数在运行时被丢弃（类型擦除），和 Java 泛型一样，与 C++ 模板的「每个实例化生成一份代码」完全不同。

内置泛型能覆盖 90% 的场景。真要写库、要给 `Sequence` 排序、要实现 `__iter__` 返回 `Iterator[T]`，才需要自己上 `TypeVar`；业务代码里手写 `Generic` 通常是过度设计。

## 20.7 `Protocol`：结构化子类型

第 18 章的 `ABC` 要求**显式继承**。但很多情况下，一个类只是「恰好有 `area()` 方法」，你并不想逼它继承你的基类——这正是 `Protocol`（3.8+）解决的问题，也就是把鸭子类型写进类型系统。

```pycon
>>> from typing import Protocol, runtime_checkable
>>> @runtime_checkable
... class HasArea(Protocol):
...     def area(self) -> float: ...
...
>>> class Sq:
...     def area(self) -> float:
...         return 4.0
...
>>> isinstance(Sq(), HasArea)
True
>>> isinstance(3, HasArea)
False
```

`runtime_checkable` 才让 `isinstance` 可用，且它只检查**方法名是否存在**，不检查签名——所以它便宜但不严格。

| 维度 | `ABC` 继承 | `Protocol` |
| --- | --- | --- |
| 需要改被检查的类吗 | 要，必须继承 | 不用，隐式满足 |
| 能检查第三方类吗 | 不能（改不了它的代码） | 能 |
| 运行时 `isinstance` | 支持，严格 | 需 `runtime_checkable`，只看名字 |
| 报错时机 | 实例化时 `TypeError` | 静态检查时 |
| 适合 | 自己的类层次 | 描述「能力」、跨库接口 |

## 20.8 `overload` 与它的运行时真相

想表达「`parse(str) -> int`、`parse(bytes) -> int`」这种按参数类型分派，用 `@overload`：

```pycon
>>> from typing import overload
>>> @overload
... def parse(s: str) -> int: ...
...
>>> try:
...     parse("1")
... except NotImplementedError as e:
...     print(type(e).__name__ + ":", str(e).splitlines()[0])
NotImplementedError: You should not call an overloaded function. A series of @overload-decorated functions outside a stub module should always be followed by an implementation that is not @overload-ed.
>>> parse.__name__
'_overload_dummy'
```

`@overload` 的桩函数**没有实现**，装饰器会把它换成占位函数 `_overload_dummy`，调用即抛 `NotImplementedError`。所以必须再写一个不带 `@overload` 的实现收尾，而且桩的个数与顺序对运行时毫无意义——最后生效的只有实现那一版：

```pycon
>>> from typing import overload
>>> @overload
... def parse(s: str) -> int: ...
...
>>> @overload
... def parse(s: bytes) -> int: ...
...
>>> def parse(s):
...     return int(s)
...
>>> parse("42"), parse(b"7")
(42, 7)
>>> parse.__code__.co_argcount
1
```

跳过分派逻辑，直接在函数里 `isinstance` 判断，往往比 overload 更可读——`overload` 只值得用在「同一个名字、完全不同的参数形状」的库 API 上。

```python
# 示例：examples/ch20_03_generics.py
"""ch20_03_generics.py —— TypeVar、Generic、Protocol 与 overload"""

from typing import Generic, Protocol, TypeVar, overload, runtime_checkable

T = TypeVar("T")


def first(items: list[T]) -> T:
    return items[0]


print("泛型函数：", first([1, 2]), "|", first(["a", "b"]))
print("T 在运行时只是 TypeVar：", T)

print("=== 泛型类 ===")


class Stack(Generic[T]):
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()

    def __len__(self) -> int:
        return len(self._items)


s: Stack[int] = Stack()
s.push(1)
s.push(2)
print("出栈：", s.pop(), "| 剩余长度：", len(s))
print("参数化后的类：", Stack[int])
print("Stack[int] 与 Stack[str] 不是同一个对象：", Stack[int] is not Stack[str])
print("但实例的类型都是 Stack：", type(s).__name__)

print("=== 约束与上界 ===")
N = TypeVar("N", int, float)


def double(x: N) -> N:
    return x * 2


print("约束为 int/float：", double(2), "|", double(1.5))

print("=== Protocol：结构化子类型，鸭子类型的正式写法 ===")


@runtime_checkable
class HasArea(Protocol):
    def area(self) -> float: ...


class Sq:
    def __init__(self, a: float) -> None:
        self.a = a

    def area(self) -> float:
        return self.a ** 2


print("Sq 没继承 HasArea，isinstance 仍通过：", isinstance(Sq(2), HasArea))
print("int 没有 area()：", isinstance(3, HasArea))
print("Protocol 也能当注解用：", HasArea.__name__)

print("=== overload 只服务类型检查器 ===")


@overload
def stub(x: int) -> int: ...


try:
    stub(1)
except NotImplementedError as e:
    print("只剩 stub 时调用 ->", type(e).__name__ + ":", str(e).splitlines()[0])
print("它被换成了占位函数：", stub.__name__)


@overload
def parse(s: str) -> int: ...
@overload
def parse(s: bytes) -> int: ...
def parse(s):
    return int(s)


print("运行时只剩最后一个定义：", parse("42"), "|", parse(b"7"))
print("签名只留实现那一版，形参个数：", parse.__code__.co_argcount)
```

```text
泛型函数： 1 | a
T 在运行时只是 TypeVar： ~T
=== 泛型类 ===
出栈： 2 | 剩余长度： 1
参数化后的类： __main__.Stack[int]
Stack[int] 与 Stack[str] 不是同一个对象： True
但实例的类型都是 Stack： Stack
=== 约束与上界 ===
约束为 int/float： 4 | 3.0
=== Protocol：结构化子类型，鸭子类型的正式写法 ===
Sq 没继承 HasArea，isinstance 仍通过： True
int 没有 area()： False
Protocol 也能当注解用： HasArea
=== overload 只服务类型检查器 ===
只剩 stub 时调用 -> NotImplementedError: You should not call an overloaded function. A series of @overload-decorated functions outside a stub module should always be followed by an implementation that is not @overload-ed.
它被换成了占位函数： _overload_dummy
运行时只剩最后一个定义： 42 | 7
签名只留实现那一版，形参个数： 1
```

## 20.9 跑起静态检查器

命令行两行，效果立刻可见：

```bash
python -m pip install mypy      # 或：pip install pyright / ruff
mypy app.py --strict
```

`mypy` 的常见报错与含义：

| 报错 | 含义 | 处理 |
| --- | --- | --- |
| `Argument 1 to "f" has incompatible type "str"; expected "int"` | 传错类型 | 改调用方，或放宽签名 |
| `Missing return statement` | 声称返回非 `None` 却有分支不返回 | 补齐分支或改 `-> None` |
| `Item "None" of "Optional[X]" has no attribute "y"` | 没判空 | 先 `if x is None: ...` |
| `Need type annotation for "x"`（strict 下） | 空容器推不出元素类型 | 写 `x: list[int] = []` |
| `Cannot assign to final name` | 给 `Final` 重新赋值 | 去掉 `Final` 或改逻辑 |
| `Function is missing a type annotation` | 严格模式要求全标注 | 补注解 |

配置放 `pyproject.toml`，别在命令行堆参数：

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_unused_ignores = true
```

**渐进式接入**是最实际的路径：先把新代码标全，老代码加 `disallow_untyped_defs = false`；只在公共 API 与数据边界（HTTP、DB、JSON）上强制。全项目一次开 `--strict` 的结果通常是几百条报错，然后所有人开始写 `# type: ignore`，等于关掉了检查。

注解还能在运行时被你自己的代码用起来——这是「元数据」的另一半价值：

```pycon
>>> import functools
>>> def checked(fn):
...     ann = fn.__annotations__
...     @functools.wraps(fn)
...     def wrapper(*args):
...         for name, value in zip(fn.__code__.co_varnames, args):
...             want = ann.get(name)
...             if want is not None and not isinstance(value, want):
...                 raise TypeError(f"{name} 需要 {want.__name__}，收到 {type(value).__name__}")
...         return fn(*args)
...     return wrapper
...
>>> @checked
... def area(w: float, h: float) -> float:
...     return w * h
...
>>> area(2.0, 3.0)
6.0
>>> try:
...     area(2, 3.0)
... except TypeError as e:
...     print(type(e).__name__ + ":", e)
TypeError: w 需要 float，收到 int
```

这种「用注解做运行时校验」的思路正是 `pydantic`、`dataclasses-json`、FastAPI 请求校验的底层原理。注意它只适用于简单类型：`list[int]` 这种参数化类型要自己拆 `get_args` 递归比较，`Union` 要逐个试——所以生产里直接选现成库。

## 20.10 注解的工程约定

1. **公共 API 必标**：模块里被别的模块用的函数、类、常量，参数与返回值都标。
2. **内部短函数可省**：三行的局部辅助函数，注解带来的噪音大于收益。
3. **数据边界必标**：解析 JSON、读配置、接 HTTP，用 `TypedDict` 或 `dataclass` 把结构写下来。
4. **不要用注解替代运行时校验**：外部输入永远要 `if not isinstance(...)` 或走 `pydantic`。注解不会替你拦住恶意的 JSON。
5. **`Any` 要写出来**，不要靠「没写注解」隐式得到 `Any`——显式才看得见技术债。
6. **`# type: ignore[code]` 带错误码**，并配 `warn_unused_ignores = true`，否则 ignore 会越积越多。

## 20.a 与 C++ 的差别

| 维度 | Python | C++ |
| --- | --- | --- |
| 类型检查时机 | 可选、运行前由外部工具做 | 强制、编译期 |
| 注解的作用 | 元数据，运行时几乎无痕 | 决定内存布局、重载解析、代码生成 |
| 泛型 | `TypeVar` + 擦除，一份代码 | 模板实例化，每种类型一份代码 |
| 类型密度 | 渐进式，可部分标注 | 全部静态，无例外 |
| 类型别名 | `Vector = list[float]` 就是赋值 | `using Vector = ...`，编译期实体 |
| 空值 | `None` 是普通值，类型里写 `X | None` | 引用不可空，指针可空 |
| 类型推断 | mypy 局部推断，不能推断参数 | `auto`、模板实参推导 |
| 重载 | 只有静态 `overload` 桩 | 编译期真重载 |
| 常量 | `Final`（仅检查） | `const`/`constexpr`（编译期强制） |
| 检查命令 | `mypy app.py` | 编译器本身就是检查器 |

一句话：C++ 的类型是**编译器的输入**，Python 的类型是**工具的输入**。这解释了为什么 Python 里 `int` 能溢出成任意精度（第 3 章）、为什么 `list[int]` 装字符串也能跑——运行时的对象根本不知道注解的存在。

## 20.b 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 以为写了 `: int` 就会报 `TypeError` | 注解不做运行时检查 | 需要校验就显式 `isinstance` 或上 `pydantic` |
| `mypy` 报 `Need type annotation` | 空容器推不出元素类型 | `xs: list[int] = []` |
| `Optional[X]` 到处判空，很烦 | 把「默认 None」误写成「可为 None」 | 不该是 None 就去掉 `Optional` |
| `list[int, str]` 没报错 | 运行时不校验参数个数 | 只有 mypy 会报 `"list" expects 1 type argument` |
| 前向引用报 `NameError` | 类还没定义完就引用自己 | 写字符串 `"Node | None"`，或 `from __future__ import annotations` |
| `Final` 变量被改了还不报错 | `Final` 只是静态标记 | 靠 review/mypy，运行时要靠 `frozen` 数据类 |
| `# type: ignore` 越来越多 | 用它掩盖设计问题 | 带错误码 + `warn_unused_ignores` |
| `TypedDict` 拼错键没报错 | 运行时是普通 dict | 用 mypy 检查，或用 `dataclass` |
| `overload` 桩函数被调用 | 忘了写实现 | 最后一个不带 `@overload` 的定义必须有函数体 |
| 给 `Any` 赋值后到处漏检查 | `Any` 传染 | 边界用 `Any`，进来立刻收窄成具体类型 |
| 注解里的类型名写错，导入时才崩 | 3.14 延迟求值 | 用 `typing.get_type_hints` 在测试里跑一遍 |

最后一条值得一条断言：**给每个用了前向引用的模块加一个测试**，`typing.get_type_hints(obj)` 跑一遍就够，能在 CI 里抓住「注解里的名字写错/漏 import」。

## 20.c 练习

**基础 1**：给一个 `def moving_average(xs, k)` 补全注解（返回 `list[float]`），并保证 mypy `--strict` 下无报错。

验收：`mypy --strict` 对文件无输出；`moving_average([1, 2, 3], 2) == [1.5, 2.5]`。

**基础 2**：用 `TypedDict` 描述 `{"id": int, "name": str, "tags": list[str]}` 的字典，写一个 `def summarize(rec: Item) -> str` 返回 `name + 标签数量`。

验收：mypy 能抓出 `summarize({"id": 1, "name": "a"})` 缺字段；运行时 `summarize({...})` 正常返回字符串。

**基础 3**：写 `def parse_pair(s: str) -> tuple[str, int]`，用 `split` + `int`，并让 mypy 认可返回值是二元组而不是 `tuple[str, ...]`。

验收：`parse_pair("a 3") == ("a", 3)`；错误输入抛 `ValueError`，且被 `except ValueError` 捕获。

**变式**：定义 `Protocol` 类 `Closeable`（有 `close() -> None`），写 `def close_all(items: list[Closeable]) -> int` 返回成功关闭的数量；传入有 `close` 的对象与没有的对象各试一次。

验收：`isinstance` 对实现类返回 `True`、对 `int` 返回 `False`；`close_all` 能接受列表里的不同类实例。

**挑战**：给第 18 章的 `Stack` 加完整泛型注解（`Generic[T]`、`__init__`、`push`、`pop`、`__len__`），再写一个 `Last[T]` 泛型函数返回末元素；额外要求 `Stack[int]` 与 `Stack[str]` 在 mypy 下互不兼容，并写测试断言「运行时不擦除信息到影响功能」。

验收：`mypy --strict` 通过；`s: Stack[int] = Stack(); s.push("a")` 被 mypy 报错；`Stack[int] is not Stack[str]` 为 `True`。

## 20.d 小结

1. 注解是元数据：解释器只存不查，`__annotations__` / `get_type_hints` 让它可反射，运行时不产生任何校验。
2. 写注解的规矩是「容器参数化 + 联合用 `|` + 函数入口出口标全」，`TypedDict` 管字典、`Protocol` 管能力、`Literal` 管枚举。
3. 检查器要渐进式接入：公共 API 与数据边界强制，靠 `mypy --strict` 在 CI 卡住回归，别用 `Any` 和 `# type: ignore` 换一时清静。

下一章打开标准库工具箱：路径、时间、JSON、正则、计数、组合、随机、命令行、日志——每一样都给出能直接抄进项目的写法。
