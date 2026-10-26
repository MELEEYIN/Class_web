# 11 · lambda

> **本质**：`lambda` 只是"**匿名的一行 `def`**"，函数体必须是**一个表达式**（不能有 `return`、赋值、多语句）。它没有变快、没有变魔法，唯一价值是**在需要一个一次性小函数的位置就地写出来**——典型场景是 `sorted(key=...)`。

**读完这一章你能做到**

- 一眼分辨哪些代码能用 lambda，哪些必须用 `def`；
- 用 lambda 写多关键字排序、`max(key=...)`、分派表；
- 说清 `map`/`filter` 为什么返回迭代器，以及何时改用推导式；
- 避开"循环里建的 lambda 全用最后一个值"这个经典坑；
- 知道 PEP 8 为什么说"别给 lambda 赋值命名"。

---

## 11.1 语法：单表达式

```python
# 示例：examples/ch11_01_basics.py
"""ch11_01_basics.py —— lambda 只有一个表达式：语法、限制与等价写法"""
add = lambda a, b: a + b
print(add(2, 3), "| 名字：", add.__name__)

square = lambda x: x * x
print(square(5))

print("=== 表达式 vs 语句 ===")
print("三元也是表达式：", (lambda x: "偶" if x % 2 == 0 else "奇")(4))
for bad in ["lambda x: x = 1", "f = lambda x: return x", "lambda x, y: x; y"]:
    try:
        compile(bad, "<s>", "exec")
        print("能编译：", bad)
    except SyntaxError as e:
        print(f"{bad!r} -> SyntaxError: {e.msg}")

print("=== 默认值、无参、*args 都能用 ===")
print((lambda: "无参")())
print((lambda a, b=10: a * b)(3))
print((lambda *xs: sum(xs))(1, 2, 3))

print("=== 立即调用 ===")
print((lambda n: n * 2)(21))

print("=== lambda 里也能写条件与推导式 ===")
print((lambda xs: [x for x in xs if x > 0])([-1, 2, -3, 4]))
print((lambda d: d.get("k", "默认"))({"a": 1}))
```

```text
5 | 名字： <lambda>
25
=== 表达式 vs 语句 ===
三元也是表达式： 偶
'lambda x: x = 1' -> SyntaxError: cannot assign to lambda
'f = lambda x: return x' -> SyntaxError: invalid syntax
能编译： lambda x, y: x; y
=== 默认值、无参、*args 都能用 ===
无参
30
6
=== 立即调用 ===
42
=== lambda 里也能写条件与推导式 ===
[2, 4]
默认
```

`lambda 参数: 表达式` 与 `def` 的对应关系：

```text
square = lambda x: x * x     ≡   def square(x):
                                     return x * x
```

**三个硬限制**（都是语法层面的，没法绕过）：

| 限制 | 后果 | 替代 |
| --- | --- | --- |
| 函数体只能是**表达式** | 不能写 `return`、赋值、`if` 语句、`for` 语句 | 用 `def` |
| 不能写**注解** | `lambda x: int -> int` 不合法 | 用 `def` |
| 不能有**文档字符串** | `__doc__` 恒为 `None` | 用 `def` |

表达式里能放的东西都能进 lambda：三元、推导式、`d.get(k, default)`、嵌套调用。所以"lambda 只能写一行"这句话不准确——它限制的是**语句**，不是字符数。

---

## 11.2 主场：key 函数

`sorted`、`max`、`min`、`groupby` 都吃 `key=` 参数，那里是 lambda 最正当的用法：

```python
# 示例：examples/ch11_02_keyfuncs.py
"""ch11_02_keyfuncs.py —— lambda 的主场：key 函数与 map/filter"""
import operator
from itertools import groupby

students = [("小明", 92), ("小红", 85), ("小刚", 92)]
print("按分数：", sorted(students, key=lambda t: t[1]))
print("分数降序、同分按姓名：", sorted(students, key=lambda t: (-t[1], t[0])))

print("=== 多关键字：返回元组即可 ===")
words = ["bb", "a", "ccc", "dd"]
print("先长度后字典序：", sorted(words, key=lambda w: (len(w), w)))

print("=== max/min 也接受 key ===")
print("最长：", max(words, key=len), "| 最短：", min(words, key=len))

print("=== groupby 要求先排序 ===")
data = [("水果", "苹果"), ("蔬菜", "白菜"), ("水果", "香蕉")]
data.sort(key=lambda p: p[0])
for k, group in groupby(data, key=lambda p: p[0]):
    print(k, [g[1] for g in group])

print("=== map / filter 返回惰性迭代器 ===")
nums = [1, 2, 3, 4]
m = map(lambda x: x * 2, nums)
print("map 对象类型：", type(m).__name__, "| 转列表：", list(m))
print("filter：", list(filter(lambda x: x % 2 == 0, nums)))

print("=== 与推导式对比 ===")
print("map+lambda：", list(map(lambda x: x * 2, nums)))
print("推导式：", [x * 2 for x in nums])
print("内置函数够了就别写 lambda：", list(map(str, nums)))

print("=== operator.itemgetter 比 lambda 更快 ===")
pairs = [(1, "b"), (1, "a"), (0, "z")]
print("lambda 版：", sorted(pairs, key=lambda p: (p[0], p[1])))
print("itemgetter 版：", sorted(pairs, key=operator.itemgetter(0, 1)))
print("attrgetter 版：")
from collections import namedtuple

Point = namedtuple("Point", "x y")
pts = [Point(1, 5), Point(1, 2), Point(0, 9)]
print(sorted(pts, key=operator.attrgetter("x", "y")))
```

```text
按分数： [('小红', 85), ('小明', 92), ('小刚', 92)]
分数降序、同分按姓名： [('小刚', 92), ('小明', 92), ('小红', 85)]
=== 多关键字：返回元组即可 ===
先长度后字典序： ['a', 'bb', 'dd', 'ccc']
=== max/min 也接受 key ===
最长： ccc | 最短： a
=== groupby 要求先排序 ===
水果 ['苹果', '香蕉']
蔬菜 ['白菜']
=== map / filter 返回惰性迭代器 ===
map 对象类型： map | 转列表： [2, 4, 6, 8]
filter： [2, 4]
=== 与推导式对比 ===
map+lambda： [2, 4, 6, 8]
推导式： [2, 4, 6, 8]
内置函数够了就别写 lambda： ['1', '2', '3', '4']
=== operator.itemgetter 比 lambda 更快 ===
lambda 版： [(0, 'z'), (1, 'a'), (1, 'b')]
itemgetter 版： [(0, 'z'), (1, 'a'), (1, 'b')]
attrgetter 版：
[Point(x=0, y=9), Point(x=1, y=2), Point(x=1, y=5)]
```

三个 key 技巧：

1. **多关键字返回元组**：`key=lambda t: (-t[1], t[0])` 表示"分数降序、姓名升序"。降序靠**取负号**（数字）或 `reverse=True`（整体），不能只对某一列降序——那就得靠元组取负。
2. **`key` 函数每个元素只调用一次**（Timsort 先把键算完再排），所以 key 里做点计算不会导致 O(n log n) 次调用。
3. **能用内置/`operator` 就别写 lambda**：`key=len`、`key=str.lower`、`key=operator.itemgetter(1)` 都比 lambda 快（省一次 Python 函数调用），而且更好读。

`map` / `filter` 在 Python 3 里返回**迭代器**（惰性），所以要 `list()` 才能看到全部；多个 `map` 串联时这也是优势（不产生中间列表）。但**大多数情况下列表推导式更好读**，`map` 的适用面在缩小。

---

## 11.3 晚绑定：循环里造 lambda

这是 lambda 最著名的事故：

```python
# 示例：examples/ch11_03_latebinding.py
"""ch11_03_latebinding.py —— 晚绑定：循环里建 lambda 的经典坑"""
fns = [lambda: i for i in range(3)]
print("全都取最后一个 i：", [f() for f in fns])

fns2 = [lambda i=i: i for i in range(3)]
print("用默认参数立即绑定：", [f() for f in fns2])

fns3 = []
for i in range(3):
    fns3.append((lambda n: (lambda: n))(i))
print("套一层函数固定值：", [f() for f in fns3])

print("=== 名字在调用时才查找 ===")
x = 1
g = lambda: x
x = 2
print("定义后改变量，结果跟着变：", g())

print("=== 计数器：lambda 做不了累加，需要 nonlocal ===")


def make_counter():
    count = 0

    def inc():
        nonlocal count
        count += 1
        return count

    return inc


c = make_counter()
print(c(), c(), c())

print("=== 分派表：lambda 放进字典 ===")
ops = {
    "+": lambda a, b: a + b,
    "-": lambda a, b: a - b,
    "*": lambda a, b: a * b,
}
for op, a, b in [("+", 3, 4), ("-", 3, 4), ("*", 3, 4)]:
    print(f"{a} {op} {b} = {ops[op](a, b)}")
```

```text
全都取最后一个 i： [2, 2, 2]
用默认参数立即绑定： [0, 1, 2]
套一层函数固定值： [0, 1, 2]
=== 名字在调用时才查找 ===
定义后改变量，结果跟着变： 2
=== 计数器：lambda 做不了累加，需要 nonlocal ===
1 2 3
=== 分派表：lambda 放进字典 ===
3 + 4 = 7
3 - 4 = -1
3 * 4 = 12
```

为什么 `[lambda: i for i in range(3)]` 全都返回 2？因为**函数体里的 `i` 是自由变量，在调用时才去外层查找**（这叫晚绑定 / late binding）。循环结束时 `i` 已经是 2，三个 lambda 查到的都是同一个 `i`。

三种修法：

| 修法 | 写法 | 原理 |
| --- | --- | --- |
| 默认参数 | `lambda i=i: i` | 默认值在**定义时**求值，把当前值绑进函数对象 |
| 工厂函数 | `(lambda n: (lambda: n))(i)` | 每层函数调用产生独立的 `n` |
| `functools.partial` | `partial(print, i)` | 参数被提前固化 |

同样的原理也解释 `g = lambda: x; x = 2` 之后 `g()` 返回 2——闭包存的是**变量**，不是值（第 12 章会从 `__closure__` 层面验证）。

---

## 11.4 什么时候别用 lambda

PEP 8 的原话是"**永远不要用赋值语句把 lambda 绑定到名字**"（`f = lambda x: ...`），因为那本该写成 `def`：名字有意义、能写文档、能调试栈里显示函数名。

四条经验：

1. **`f = lambda ...` → 改 `def f(...)`**。`__name__` 会是 `<lambda>`，报错栈里也难读。
2. **lambda 里超过一个逗号或一个 `if/else` → 改 `def`**。可读性会迅速崩塌。
3. **需要 `try/except`、循环、多个赋值 → 不可能**，直接用 `def`。
4. **作为回调的默认值**（`on_done=lambda r: None`）是 lambda 少数"小而美"的正当用法——但它同样有晚绑定风险。

一个易忽略的事实：**lambda 和 def 创建的函数没有性能差异**，二者都是同一个函数对象类型。lambda 不"更轻"。

---

## 11.5 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 语法 | `[cap](args) -> T { body }` | `lambda args: expr` |
| 函数体 | 任意语句块 | **仅一个表达式** |
| 捕获 | 显式捕获列表 `[=]` `[&x]` | 自动按名字查闭包，无需声明 |
| 捕获时机 | 按值捕获=定义时拷贝；按引用=调用时读 | 一律"晚绑定"，存变量不存值 |
| 返回类型 | 可推导可显式 | 无注解能力 |
| 赋值给变量 | 常用（`auto f = [...]`） | 反模式，应用 `def` |
| 性能 | 内联优化、零开销 | 与普通函数相同，无特殊优化 |
| 调用开销 | 可内联消除 | 每次调用都有 Python 层开销 |

C++ 的捕获列表是显式的，所以"晚绑定"问题在 C++ 里靠 `[=]` 显式按值捕获就避开了；Python 没有捕获列表，只能靠默认参数或工厂函数。

---

## 11.6 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 循环里造的 lambda 全返回最后一个值 | 晚绑定 | `lambda i=i: i` 或工厂函数 |
| `SyntaxError: invalid syntax` 在 `=` 处 | lambda 体里赋值 | 用 `def` 或海象 `:=`（谨慎） |
| `map(...)` 打印出 `<map object at 0x...>` | 返回迭代器 | `list(map(...))` |
| 第二次 `list(m)` 是空的 | 迭代器一次性 | 落地成列表或重建 map |
| 排序结果不是想要的顺序 | `key` 返回了单值而非元组 | `key=lambda t: (t[1], t[0])` |
| 想某一列降序但有字符串列 | 元组里不能对 str 取负 | 分两次稳定排序，或 `reverse` |
| 报错栈里全是 `<lambda>` 看不出位置 | 匿名函数无名字 | 关键逻辑改 `def` |
| `f.__doc__` 是 `None` | lambda 无 docstring | 用 `def` |
| `lambda` 里调用 `print` 看似无输出 | 表达式求值有副作用但被丢弃/顺序问题 | 别在 lambda 里做副作用 |
| `sorted(key=lambda x: x.attr)` 报 `AttributeError` | 列表里混了 `None` | key 里处理 `None` |

---

## 11.7 练习

**1.（基础）** 用 lambda 写四个函数：加、减、乘、除（除零返回 `None`），放进字典按符号分派。

验收：`calc["/"](1, 0)` 得 `None`，`calc["+"](2, 3)` 得 `5`。

**2.（key 排序）** 给定 `[("语文", 92), ("数学", 100), ("英语", 88)]`，按分数降序输出。

验收：输出 `[('数学', 100), ('语文', 92), ('英语', 88)]`。

**3.（多关键字）** 给定学生列表 `[(姓名, 班级, 分数)]`，先按班级升序、再按分数降序排序。

验收：用 `key=lambda t: (t[1], -t[2])`；若分数是字符串则说明为什么这招失效。

**4.（变式）** 修好这段代码，让它输出 `[0, 1, 2]`：

```python
# 片段
fns = [lambda: i for i in range(3)]
print([f() for f in fns])
```

验收：至少给出两种修法（默认参数、工厂函数），并解释晚绑定的机制。

**5.（挑战）** 用 `map`/`filter` 和 lambda 实现：读入一组整数，过滤掉负数，把剩下的平方，最后求和；再用推导式 + 生成器表达式写一遍，比较两者长度与可读性。

验收：两种写法结果相同；说明为什么第二种（生成器表达式）不需要中间列表。

---

## 11.8 小结

1. **lambda 是单表达式的匿名 def**：不能 `return`、不能赋值、不能注解。
2. **它的主场是 `key=` 和一次性回调**；`f = lambda ...` 应该写成 `def`。
3. **闭包晚绑定**：循环里的 lambda 共享变量，要用默认参数或工厂函数把值固定下来。

下一章把"晚绑定"讲透：闭包怎么捕获变量、`__closure__` 里存了什么、`nonlocal` 为什么必需，以及用闭包实现计数器与缓存。
