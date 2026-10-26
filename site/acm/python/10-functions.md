# 10 · 函数与参数

> **本质**：Python 的函数调用是"**按名字绑定实参**"，不是按位置对齐内存。位置参数只是"没有名字的绑定"；有名字的实参可以任意顺序给。默认值在 `def` 执行时求值一次并挂在 `__defaults__` 上——这就是可变默认值会"记住上次结果"的根源。

**读完这一章你能做到**

- 分清位置参数、关键字参数、默认参数、`*args`、`**kwargs` 的使用边界；
- 解释为什么 `def f(x, bucket=[])` 是 bug，并写出正确版本；
- 用 `*` 强制仅关键字、用 `/` 强制仅位置（3.8+），把 API 设计得更难用错；
- 写出能原样转发参数的包装函数（装饰器的前提）；
- 说清 Python 为什么**没有重载**，以及怎么替代。

---

## 10.1 定义、调用与返回值

```python
# 示例：examples/ch10_01_params.py
"""ch10_01_params.py —— 位置参数、关键字参数、默认值与调用检查"""


def greet(name, greeting="你好", punct="!"):
    return f"{greeting}，{name}{punct}"


print(greet("小明"))
print(greet("小明", "早上好"))
print(greet("小明", punct="?"))
print(greet(greeting="嗨", name="小红"))

print("=== 位置参数必须在关键字参数之前 ===")
print(greet("小明", punct="。", greeting="晚安"))
try:
    eval('greet(name="小明", "早")')
except SyntaxError as e:
    print("SyntaxError:", e.msg)

print("=== 调用时的参数校验 ===")
try:
    greet()
except TypeError as e:
    print("TypeError:", e)
try:
    greet("a", "b", "c", "d")
except TypeError as e:
    print("TypeError:", e)
try:
    greet("a", nick="x")
except TypeError as e:
    print("TypeError:", e)

print("=== 默认值只在定义时求值一次：可变默认值陷阱 ===")


def bad(item, bucket=[]):
    bucket.append(item)
    return bucket


print(bad(1), bad(2), bad(3))
print("三次调用共用同一个列表：", bad.__defaults__)


def good(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket


print(good(1), good(2))

print("=== 返回值 ===")


def no_return():
    pass


print("没有 return 就返回：", repr(no_return()))


def divmod_like(a, b):
    return a // b, a % b


print("多返回值其实是元组：", divmod_like(7, 2))
q, r = divmod_like(7, 2)
print("解包拿到：", q, r)
```

```text
你好，小明!
早上好，小明!
你好，小明?
嗨，小红!
=== 位置参数必须在关键字参数之前 ===
晚安，小明。
SyntaxError: positional argument follows keyword argument
=== 调用时的参数校验 ===
TypeError: greet() missing 1 required positional argument: 'name'
TypeError: greet() takes from 1 to 3 positional arguments but 4 were given
TypeError: greet() got an unexpected keyword argument 'nick'
=== 默认值只在定义时求值一次：可变默认值陷阱 ===
[1, 2, 3] [1, 2, 3] [1, 2, 3]
三次调用共用同一个列表： ([1, 2, 3],)
[1] [2]
=== 返回值 ===
没有 return 就返回： None
多返回值其实是元组： (3, 1)
解包拿到： 3 1
```

三条调用规则：

1. **位置参数按顺序填**，关键字参数按名字填，**关键字必须写在位置之后**（`greet(name="小明", "早")` 是 `SyntaxError`）；
2. **同一个参数不能给两次**：`greet("小明", name="小红")` 抛 `TypeError: got multiple values for argument 'name'`；
3. **没有 `return`（或只写 `return`）返回 `None`**——不是"返回最后一个表达式值"，那是 Ruby/JS 箭头函数的规则。

`return a, b` 只是 `return (a, b)` 的省略写法：多返回值就是元组，接收端用解包。这一点比 C++ 的 `std::pair`/`std::tuple` 轻得多。

---

## 10.2 默认参数：定义时求值一次

这是 Python 最著名的坑，必须从机制上理解：

```text
def f(x, bucket=[]):     ← 执行 def 时，创建一个空列表对象，
    ...                    并把它存进 f.__defaults__
```

所以 `bucket` 的默认值**不是每次调用新建**，而是**同一个对象反复使用**。`bad(1)`、`bad(2)`、`bad(3)` 追加进同一个列表，`bad.__defaults__` 里能看到累积结果。

```pycon
>>> def bad(x, acc=[]):
...     acc.append(x)
...     return acc
>>> bad(1)
[1]
>>> bad(2)
[1, 2]
>>> bad.__defaults__
([1, 2],)
```

正确写法是**默认 `None` + 函数内新建**：

```pycon
>>> def good(x, acc=None):
...     if acc is None:
...         acc = []
...     acc.append(x)
...     return acc
>>> good(1), good(2)
([1], [2])
```

同样的道理适用于 `{}`（字典）、`set()`、以及任何可变对象（包括 `datetime.now()` 这种"每次想要新值"的表达式——它只会在导入时算一次）。

> **⚠️ 易错** 别用 `if not acc:` 代替 `if acc is None:`——调用方传一个**空列表**时 `not acc` 也为真，会把对方传入的容器丢掉，改成一新建的。判 `None` 用 `is`。

---

## 10.3 `*args`、`**kwargs` 与参数解包

```python
# 示例：examples/ch10_02_varargs.py
"""ch10_02_varargs.py —— *args、**kwargs、仅关键字与仅位置参数"""


def total(*args):
    return sum(args)


print(total(), total(1, 2, 3))


def show(*args, **kwargs):
    print("args:", args, "| kwargs:", kwargs)


show(1, 2, name="a", age=3)

print("=== 调用时解包 ===")
nums = [1, 2, 3]
print("total(*nums)：", total(*nums))


def point(x, y, z=0):
    return (x, y, z)


print(point(*[1, 2], **{"z": 9}))

print("=== 转发：包装函数原样传递参数 ===")


def logged(fn):
    def wrapper(*args, **kwargs):
        print(f"调用 {fn.__name__} args={args} kwargs={kwargs}")
        return fn(*args, **kwargs)
    return wrapper


@logged
def add(a, b, base=0):
    return a + b + base


print("结果：", add(2, 3, base=10))

print("=== 仅关键字参数：* 之后必须写名字 ===")


def rect(*, width, height):
    return width * height


print(rect(width=2, height=3))
try:
    rect(2, 3)
except TypeError as e:
    print("TypeError:", e)

print("=== 仅位置参数：/ 之前不能写名字（3.8+） ===")


def power(base, /, exp=2):
    return base ** exp


print(power(3), power(3, 3))
try:
    power(base=3)
except TypeError as e:
    print("TypeError:", e)

print("=== 完整的参数顺序 ===")


def full(a, b=2, /, c=3, *args, d, e=5, **kwargs):
    return (a, b, c, args, d, e, kwargs)


print(full(1, d=4))
print(full(1, 2, 3, 4, 5, d=6, x=7))
```

```text
0 6
args: (1, 2) | kwargs: {'name': 'a', 'age': 3}
=== 调用时解包 ===
total(*nums)： 6
(1, 2, 9)
=== 转发：包装函数原样传递参数 ===
调用 add args=(2, 3) kwargs={'base': 10}
结果： 15
=== 仅关键字参数：* 之后必须写名字 ===
6
TypeError: rect() takes 0 positional arguments but 2 were given
=== 仅位置参数：/ 之前不能写名字（3.8+） ===
9 27
TypeError: power() got some positional-only arguments passed as keyword arguments: 'base'
=== 完整的参数顺序 ===
(1, 2, 3, (), 4, 5, {})
(1, 2, 3, (4, 5), 6, 5, {'x': 7})
```

参数顺序的完整语法（从左到右固定）：

```text
def f(pos_only, /, pos_or_kw, *args, kw_only, **kwargs):
      └── 仅位置 ──┘  └─ 两者都行 ─┘  └变长位置┘ └必须写名字┘ └任意关键字┘
```

| 写法 | 在函数内是什么 | 调用方式 |
| --- | --- | --- |
| `def f(a, b)` | 普通参数 | `f(1, 2)` / `f(a=1, b=2)` |
| `def f(*args)` | **元组** | `f(1, 2, 3)` → `args == (1, 2, 3)` |
| `def f(**kw)` | **字典** | `f(x=1)` → `kw == {"x": 1}` |
| `def f(a, *, b)` | `b` 仅关键字 | `f(1, b=2)`，`f(1, 2)` 报错 |
| `def f(a, /)` | `a` 仅位置 | `f(1)`，`f(a=1)` 报错 |
| `f(*xs)` | 调用时解包 | 等价于把 `xs` 摊开 |
| `f(**d)` | 调用时解包 | 等价于按 `d` 的键给关键字 |

`*args` 收的是**元组**不是列表，`**kwargs` 收的是**字典**。名字 `args`/`kwargs` 只是约定，写 `*items`、`**opts` 完全等价——但保持约定，别人一眼能懂。

**仅关键字参数**是给 API 设计者的礼物：`def rect(*, width, height)` 强迫调用方写名字，`rect(2, 3)` 直接被拒绝。标准库里大量使用（`print(*objects, sep=" ", end="\n", file=None, flush=False)` 全是仅关键字）。

---

## 10.4 函数是对象：一级公民

```python
# 示例：examples/ch10_03_firstclass.py
"""ch10_03_firstclass.py —— 函数是对象：赋值、传参、无重载、覆盖"""


def square(x):
    return x * x


f = square
print("函数可以赋值给变量：", f(4), "| 同一个对象：", f is square, "|", square.__name__)

print("=== 作为参数（高阶函数） ===")


def apply_all(fn, xs):
    return [fn(x) for x in xs]


print(apply_all(square, [1, 2, 3]))
print(apply_all(str.upper, ["a", "b"]))

print("=== 没有重载：后定义覆盖前定义 ===")


def report(x):
    return "一参版"


def report(x, y=0):
    return "两参版"


print(report(1), report(1, 2))

print("=== 函数的元信息 ===")
print("square 的 docstring：", square.__doc__)


def documented(x):
    """把 x 转成字符串"""
    return str(x)


print("docstring：", documented.__doc__, "| 注解：", documented.__annotations__)

print("=== 注解不做事，类型检查靠工具 ===")


def typed(a: int, b: int) -> int:
    return a + b


print("传字符串也能跑：", typed("a", "b"))

print("=== 函数能放进容器、能做返回值 ===")
ops = {"加": lambda a, b: a + b, "减": lambda a, b: a - b}
print(ops["加"](3, 4), ops["减"](3, 4))


def make_adder(n):
    def adder(x):
        return x + n
    return adder


add10 = make_adder(10)
print("闭包工厂：", add10(5), add10(-1))
```

```text
函数可以赋值给变量： 16 | 同一个对象： True | square
=== 作为参数（高阶函数） ===
[1, 4, 9]
['A', 'B']
=== 没有重载：后定义覆盖前定义 ===
两参版 两参版
=== 函数的元信息 ===
square 的 docstring： None
docstring： 把 x 转成字符串 | 注解： {}
=== 注解不做事，类型检查靠工具 ===
传字符串也能跑： ab
=== 函数能放进容器、能做返回值 ===
7 -1
闭包工厂： 15 9
```

四个必须知道的结论：

1. **函数是普通对象**：能赋值、能放进列表/字典、能当参数、能当返回值。这支撑了装饰器、回调、策略表。
2. **没有重载**：Python 里同名函数**后定义覆盖前定义**，`report` 只剩两参版。要"按参数类型分派"得在函数内判断（`isinstance`）或用 `functools.singledispatch`，也可以用 `match/case`。
3. **`__doc__` 是文档字符串，`__annotations__` 是注解字典**——注解**只在运行期存着，不做任何检查**。`typed("a", "b")` 返回 `'ab'` 而不会报错，检查交给 `mypy`/IDE（第 20 章）。
4. **嵌套函数返回时形成闭包**，`make_adder(10)` 返回的 `adder` 记住了 `n=10`（第 12 章详述）。

---

## 10.5 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 参数传递 | 值传递 / 引用 `&` / 指针 | 全部"按对象引用传递"，不可变对象表现像值 |
| 默认参数 | 头文件声明里给，调用时求值 | `def` 处求值**一次**，可变默认值是坑 |
| 重载 | 支持，编译期按类型分派 | 不支持，同名覆盖 |
| 变长参数 | `va_list` / 模板参数包 | `*args` / `**kwargs`，直接可用 |
| 关键字实参 | 无（C++20 指定初始化器部分类似） | `f(name=1)`，可任意顺序 |
| 返回多值 | `std::tuple` + `std::get` | `return a, b` + 解包 |
| 函数作为值 | 函数指针 / `std::function` / lambda | 天然是一等对象 |
| 类型检查 | 编译期强制 | 运行期不检查，注解仅作文档 |

最后一行要特别注意"按对象引用传递"的说法：Python 官方叫 **call by object reference**（也叫 call by sharing）。效果是——函数内**改对象内容**调用方可见，**重新绑定名字**调用方不可见。这在第 3 章已用 `append` 与 `=` 演示过。

---

## 10.6 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 连续调用返回的列表越来越长 | 可变默认值 `=[]` | 默认 `None`，函数内新建 |
| `TypeError: f() got multiple values for argument 'a'` | 位置与关键字给了同一个参数 | 只保留一种给法 |
| `TypeError: f() missing 1 required positional argument` | 少传参数 | 给默认值或补参数 |
| `TypeError: f() got an unexpected keyword argument` | 名字拼错 / 没写 `**kwargs` | 检查签名拼写 |
| `SyntaxError: positional argument follows keyword argument` | 关键字写在了位置参数前 | 位置参数全部前置 |
| 调用方传入的空列表被忽略 | 用 `if not acc:` 判默认值 | `if acc is None:` |
| 改函数参数后调用方数据也变了 | 按引用传递 + 原地改 | 需要副本就 `list(x)` / `copy.copy` |
| 同名函数只有最后一个生效 | 没有重载 | 改名、`isinstance` 分派或 `singledispatch` |
| `f(*args)` 报 `TypeError` 说参数个数不对 | `args` 不是序列/是生成器 | 先 `list()` 或确认长度 |
| 装饰器包一层后签名/文档全变 | 只用 `*args, **kwargs` 转发 | `functools.wraps` 保留元信息 |

---

## 10.7 练习

**1.（基础）** 写 `format_price(amount, currency="￥", digits=2)`，输出如 `￥1,234.50`。要求 `digits` 与 `currency` 都能用关键字指定。

验收：`format_price(1234.5)` 得 `￥1,234.50`；`format_price(1234.5, digits=0)` 得 `￥1,234`。

**2.（可变默认值）** 写 `add_tag(tag, tags=[])` 的**错误版**与**正确版**，各调用两次说明差异，并打印错误版的 `__defaults__`。

验收：错误版第二次返回含两个元素；正确版每次只含一个。

**3.（*args/**kwargs）** 写 `stats(*nums, ndigits=2)`：返回 `(个数, 和, 平均, 最大, 最小)`，平均保留 `ndigits` 位；空输入返回全 0 且不抛异常。

验收：`stats(1, 2, 3)` 得 `(3, 6, 2.0, 3, 1)`；`stats()` 不崩溃。

**4.（变式）** 写 `call_log(fn)` 装饰器：打印每次调用的**函数名、位置参数元组、关键字字典**，再原样调用返回结果；用 `functools.wraps` 保留原函数的 `__name__` 与 `__doc__`。

验收：装饰后 `fn.__name__` 仍是原名；`fn(1, k=2)` 打印 `args=(1,) kwargs={'k': 2}`。

**5.（挑战）** 用 `functools.singledispatch`（或 `match/case`）实现 `describe(x)`：`int` 返回"整数"、`list` 返回"列表，共 n 项"、`str` 返回"字符串，长度 n"、其他返回"其他"。

验收：`describe(1)`、`describe([1, 2])`、`describe("ab")`、`describe(1.5)` 四种输入各返回正确字符串；`bool` 输入说明为什么被当成 `int`。

---

## 10.8 小结

1. **调用按名字绑定**：位置在前、关键字在后，同一参数不能给两次。
2. **默认值定义时求值一次**，可变默认值必踩坑——默认写 `None`，函数内新建。
3. **`*args` 收元组、`**kwargs` 收字典**，`*` / `/` 能把参数强制成"只能写名字"或"只能按位置"。

下一章只讲一个工具：`lambda`。它短得只能装一个表达式，但配合 `sorted(key=...)`、`map`、`filter` 与回调，是函数式写法的入口；也会讲清它的两个限制（不能写语句、不能有注解）。
