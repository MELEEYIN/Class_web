# 15 · 迭代器与生成器

> **本质**：`for` 循环只做三件事——`iter(obj)` 拿到迭代器、反复 `next()`、捕获 `StopIteration` 收工。**可迭代对象**是"能交出一个迭代器"的东西（有 `__iter__`），**迭代器**是"记得自己走到哪"的东西（有 `__iter__` 和 `__next__`）。生成器则是编译器帮你写好的迭代器：函数体里出现 `yield`，这个函数就从"一次算完"变成"一次算一点"的状态机。

**读完这一章你能做到**

- 手写 `__iter__`/`__next__` 实现自己的迭代器；
- 说清"可迭代对象"与"迭代器"的区别，以及为什么列表能反复遍历、生成器不能；
- 用 `yield` 写生成器，用 `send` 双向通信、用 `yield from` 委托；
- 用生成器表达式与 `itertools` 搭出 O(1) 内存的流水线；
- 认出"边遍历边修改""迭代器被提前耗尽"这两类高频 bug。

---

## 15.1 `for` 的三步展开

```python
# 示例：examples/ch15_01_iterate.py
"""ch15_01_iterate.py —— for 的展开与 iter/next"""
items = [10, 20, 30]
it = iter(items)
print("iter(list) 的类型：", type(it).__name__)
print(next(it), next(it), next(it))
try:
    next(it)
except StopIteration as e:
    print("StopIteration:", repr(e))

print("=== 可迭代对象 vs 迭代器 ===")
print("list 有 __iter__：", hasattr(items, "__iter__"))
print("list 自己有 __next__ 吗：", hasattr(items, "__next__"))
print("iter(list) 有 __next__：", hasattr(it, "__next__"))
print("迭代器上 iter() 返回自己：", iter(it) is it)

print("=== 迭代器是一次性的 ===")
gen = (x * 2 for x in range(3))
print("第一次 list：", list(gen))
print("第二次 list：", list(gen))
print("列表可以反复迭代：", list(items), list(items))

print("=== for 的等价展开 ===")
it2 = iter(items)
total = 0
while True:
    try:
        total += next(it2)
    except StopIteration:
        break
print("while 循环求和：", total, "| sum()：", sum(items))

print("=== 自己实现一个迭代器类 ===")


class Countdown:
    def __init__(self, start):
        self.n = start

    def __iter__(self):
        return self

    def __next__(self):
        if self.n <= 0:
            raise StopIteration
        self.n -= 1
        return self.n + 1


print("解包进列表：", [*Countdown(3)])
c = Countdown(2)
print("第一遍：", list(c))
print("第二遍（已被耗尽）：", list(c))

print("=== 可变的迭代器：用 while 边改边迭代会很危险 ===")
nums = [1, 2, 3, 4]
for n in nums:
    if n == 2:
        nums.remove(n)
print("边遍历边删的结果：", nums)

print("=== 安全做法：先拷贝或反向遍历 ===")
nums2 = [1, 2, 3, 4]
for n in nums2[:]:
    if n == 2:
        nums2.remove(n)
print("遍历副本：", nums2)

print("=== enumerate / zip 返回的都是迭代器 ===")
e = enumerate("ab")
print(type(e).__name__, list(e), list(e))
z = zip([1, 2], "ab")
print(next(z), list(z))
```

```text
iter(list) 的类型： list_iterator
10 20 30
StopIteration: StopIteration()
=== 可迭代对象 vs 迭代器 ===
list 有 __iter__： True
list 自己有 __next__ 吗： False
iter(list) 有 __next__： True
迭代器上 iter() 返回自己： True
=== 迭代器是一次性的 ===
第一次 list： [0, 2, 4]
第二次 list： []
列表可以反复迭代： [10, 20, 30] [10, 20, 30]
=== for 的等价展开 ===
while 循环求和： 60 | sum()： 60
=== 自己实现一个迭代器类 ===
解包进列表： [3, 2, 1]
第一遍： [2, 1]
第二遍（已被耗尽）： []
=== 可变的迭代器：用 while 边改边迭代会很危险 ===
边遍历边删的结果： [1, 3, 4]
=== 安全做法：先拷贝或反向遍历 ===
遍历副本： [1, 3, 4]
=== enumerate / zip 返回的都是迭代器 ===
enumerate [(0, 'a'), (1, 'b')] []
(1, 'a') [(2, 'b')]
```

`for` 的等价展开就是示例里那段 `while`：

```text
_it = iter(obj)              # ① 要一个迭代器
while True:
    try:
        x = next(_it)        # ② 一个一个取
    except StopIteration:    # ③ 取完了就退出
        break
    ...循环体...
```

由此可以推出几条实用结论：

1. **`for` 不要求有索引**。任何交出迭代器的对象都能被遍历——文件对象、生成器、`dict` 的键、`re.finditer` 的结果都一样。这就是 Python 的"鸭子类型迭代协议"。
2. **迭代器遍历到一半就是"半耗尽"状态**，继续 `for` 会从断点接着走，而不是从头。示例里 `list(e)` 第二次是 `[]`，因为 `e` 已经走到底了。
3. **`list`、`tuple`、`dict`、`str` 是可迭代对象但不是迭代器**：它们没有 `__next__`，每次都 `iter()` 出一个新的迭代器，所以能反复遍历。而生成器、`enumerate`、`zip`、`map`、`filter`、文件对象**本身就是迭代器**，因此一次性。

`[*Countdown(3)]` 是"可迭代解包"——`[*x]` 等价于 `list(x)`，`*` 后跟任何可迭代对象都行。第二遍 `list(c)` 为空，正说明 `Countdown` 实例自己就是迭代器。

**边遍历边删**是另一类经典 bug：`for n in nums` 背后是一个按索引推进的列表迭代器，`remove` 让列表变短、后面的元素整体前移，迭代器却已经走到下一个位置，于是 `3` 被跳过。结果 `[1, 3, 4]` 里的 `3` 还在。修法有两种：遍历副本 `nums2[:]`，或用推导式重建 `nums2 = [n for n in nums2 if n != 2]`（后者更符合 Python 习惯）。

```pycon
>>> it = iter([1, 2])
>>> next(it)
1
>>> try:
...     while True:
...         _ = next(it)
... except StopIteration:
...     print("取完了")
取完了
>>> list(iter("abc"))
['a', 'b', 'c']
```

---

## 15.2 生成器：`yield` 就是"暂停点"

```python
# 示例：examples/ch15_02_generators.py
"""ch15_02_generators.py —— yield 把函数变成状态机"""


def counter(n):
    print("  [生成器启动]")
    i = 0
    while i < n:
        yield i
        i += 1
    print("  [生成器走到结尾]")


c = counter(3)
print("调用生成器函数后拿到：", type(c).__name__)
print("此时函数体执行了吗？看下面有没有打印")
print("next 一次：", next(c))
print("next 两次：", next(c))
for v in c:
    print("for 接着拿到：", v)
try:
    next(c)
except StopIteration:
    print("耗尽后再 next：StopIteration")

print("=== 惰性：只处理被取走的那部分 ===")


def read_rows(rows):
    for r in rows:
        print("  真正读取：", r)
        yield r


rows = ["第1行", "第2行", "第3行"]
pipeline = (r for r in read_rows(rows) if r != "第2行")
print("只取一个：", next(pipeline))
print("再取一个：", next(pipeline))

print("=== send：把值送回生成器内部 ===")


def accumulator():
    total = 0
    while True:
        x = yield total
        if x is None:
            return total
        total += x


acc = accumulator()
print("预激得到初始值：", next(acc))
print("send(10)：", acc.send(10))
print("send(5)：", acc.send(5))
try:
    acc.send(None)
except StopIteration as e:
    print("结束时的 return 值放在 StopIteration.value：", e.value)

print("=== yield from：把子生成器整段委托出去 ===")


def inner():
    yield 1
    yield 2
    return "inner 的返回值"


def outer():
    result = yield from inner()
    print("  外层拿到了子生成器的 return：", result)
    yield 3


print(list(outer()))

print("=== 生成器表达式 vs 列表推导式 ===")
squares_list = [x * x for x in range(4)]
squares_gen = (x * x for x in range(4))
print("列表：", squares_list, "| 类型：", type(squares_list).__name__)
print("生成器求和：", sum(squares_gen), "| 类型：", type(squares_gen).__name__)

print("=== 无限生成器 + 手写 take ===")


def naturals():
    n = 0
    while True:
        yield n
        n += 1


def take(it, k):
    out = []
    for _, v in zip(range(k), it):
        out.append(v)
    return out


print(take(naturals(), 5))
print(take((x * x for x in naturals()), 5))
```

```text
调用生成器函数后拿到： generator
此时函数体执行了吗？看下面有没有打印
  [生成器启动]
next 一次： 0
next 两次： 1
for 接着拿到： 2
  [生成器走到结尾]
耗尽后再 next：StopIteration
=== 惰性：只处理被取走的那部分 ===
  真正读取： 第1行
只取一个： 第1行
  真正读取： 第2行
  真正读取： 第3行
再取一个： 第3行
=== send：把值送回生成器内部 ===
预激得到初始值： 0
send(10)： 10
send(5)： 15
结束时的 return 值放在 StopIteration.value： 15
=== yield from：把子生成器整段委托出去 ===
  外层拿到了子生成器的 return： inner 的返回值
[1, 2, 3]
=== 生成器表达式 vs 列表推导式 ===
列表： [0, 1, 4, 9] | 类型： list
生成器求和： 14 | 类型： generator
=== 无限生成器 + 手写 take ===
[0, 1, 2, 3, 4]
[0, 1, 4, 9, 16]
```

生成器的执行模型与普通函数完全不同：

| 阶段 | 普通函数 | 生成器函数 |
| --- | --- | --- |
| 调用 `counter(3)` | 立即执行函数体 | **什么都不做**，只创建生成器对象 |
| 第一次 `next()` | 已经算完了 | 从头执行到第一个 `yield`，吐出值并**挂起** |
| 再次 `next()` | 无 | 从挂起处**继续**，局部变量全部保留 |
| 走到结尾 | 返回值 | 抛 `StopIteration`（`return x` 把 `x` 放进 `e.value`） |

关键点是"**挂起时局部变量不销毁**"。示例里 `i`、`n` 在两次 `next` 之间一直活着，这就是"状态机"的物理含义——不需要类、不需要保存中间状态的字段。

`send` 让通道变成双向：`x = yield total` 中，`total` 是**吐出去**的值，`x` 是**送进来**的值。注意必须先 `next(acc)` 或 `acc.send(None)` 把生成器"预激"到第一个 `yield`，否则 `TypeError: can't send non-None value to a just-started generator`。

`yield from inner()` 把整个子生成器的迭代权交出去，并且能拿到子生成器的 `return` 值——这是协程（`asyncio`）的语法基础，22 章会再利用它。

惰性有多实在？`pipeline` 只取两行时，`read_rows` 里的"真正读取"也只打印了两次。对于 10 GB 的日志文件，这意味着**内存里永远只有正在处理的那一行**。

> **💡 提示** 生成器表达式写成函数调用的唯一实参时，括号可省：`sum(x*x for x in data)`。写成 `sum((x*x for x in data))` 也没错，只是多余。

---

## 15.3 `itertools`：把流水线拼起来

```python
# 示例：examples/ch15_03_itertools.py
"""ch15_03_itertools.py —— itertools 与生成器流水线"""
import itertools

print("=== 无限迭代器必须配 islice ===")
print(list(itertools.islice(itertools.count(10, 2), 5)))
print(list(itertools.islice(itertools.cycle("ab"), 5)))
print(list(itertools.repeat("x", 3)))

print("=== chain / zip / zip_longest ===")
print(list(itertools.chain([1, 2], "cd", (3,))))
print(list(zip([1, 2, 3], "ab")))
print(list(itertools.zip_longest([1, 2, 3], "ab", fillvalue="-")))
print(list(itertools.pairwise("abcd")))

print("=== accumulate / groupby ===")
print(list(itertools.accumulate([1, 2, 3, 4])))
print(list(itertools.accumulate([1, 2, 3, 4], lambda a, b: a * b)))

data = sorted([("a", 1), ("b", 2), ("a", 3)], key=lambda p: p[0])
for key, group in itertools.groupby(data, key=lambda p: p[0]):
    print(key, list(group))

print("=== combinations / permutations / product ===")
print(list(itertools.combinations("abc", 2)))
print(list(itertools.permutations("ab")))
print(list(itertools.product([1, 2], "xy")))

print("=== 生成器流水线：读 -> 过滤 -> 转换 -> 汇总 ===")
rows = [" 1,2 ", "3,4", "坏行", "5,6"]


def parse(rows):
    for r in rows:
        parts = r.strip().split(",")
        if len(parts) != 2:
            continue
        yield int(parts[0]), int(parts[1])


def scaled(pairs, k):
    for a, b in pairs:
        yield a * k, b * k


total = sum(a + b for a, b in scaled(parse(rows), 10))
print("全部合格行的合计（放大 10 倍）：", total)

first_pair = next(parse(rows))
print("只取第一对：", first_pair)

print("=== tee：把一个迭代器分两路（缓存会增长，慎用大流） ===")
src = iter([1, 2, 3])
a, b = itertools.tee(src, 2)
print("第一路：", list(a))
print("第二路：", list(b))

print("=== 生成器函数里的 return 会终结迭代 ===")


def gen_with_return():
    yield 1
    return
    yield 2


print(list(gen_with_return()))
```

```text
=== 无限迭代器必须配 islice ===
[10, 12, 14, 16, 18]
['a', 'b', 'a', 'b', 'a']
['x', 'x', 'x']
=== chain / zip / zip_longest ===
[1, 2, 'c', 'd', 3]
[(1, 'a'), (2, 'b')]
[(1, 'a'), (2, 'b'), (3, '-')]
[('a', 'b'), ('b', 'c'), ('c', 'd')]
=== accumulate / groupby ===
[1, 3, 6, 10]
[1, 2, 6, 24]
a [('a', 1), ('a', 3)]
b [('b', 2)]
=== combinations / permutations / product ===
[('a', 'b'), ('a', 'c'), ('b', 'c')]
[('a', 'b'), ('b', 'a')]
[(1, 'x'), (1, 'y'), (2, 'x'), (2, 'y')]
=== 生成器流水线：读 -> 过滤 -> 转换 -> 汇总 ===
全部合格行的合计（放大 10 倍）： 210
只取第一对： (1, 2)
=== tee：把一个迭代器分两路（缓存会增长，慎用大流） ===
第一路： [1, 2, 3]
第二路： [1, 2, 3]
=== 生成器函数里的 return 会终结迭代 ===
[1]
```

三组最常用的工具：

| 类别 | 函数 | 用途 | 注意 |
| --- | --- | --- | --- |
| 无限 | `count`/`cycle`/`repeat` | 生成无限序列 | 必须配 `islice`/`zip` 截断 |
| 拼接 | `chain`/`chain.from_iterable`/`zip_longest` | 串联多个可迭代对象 | `zip` 以最短为准，`zip_longest` 补 `fillvalue` |
| 组合 | `combinations`/`permutations`/`product` | 枚举组合（DFS 题的现成工具） | 结果数是阶乘级，别盲目 `list()` |
| 累积 | `accumulate`/`pairwise`/`groupby` | 前缀和、相邻对、分组 | `groupby` **要求先按同一 key 排序** |

`groupby` 是所有新手都踩过的坑：它只把**相邻**的同 key 元素归到一组，跟 SQL 的 `GROUP BY` 语义不同。`sorted(..., key=...)` 之后再 `groupby` 才对。

`pairwise` 是 3.10 新增的，等价于 `zip(s, s[1:])` 但不需要切片（因此能用于生成器）。示例输出 `[('a', 'b'), ('b', 'c'), ('c', 'd')]`。

流水线是生成器最实用的形态：`parse` 负责解析、`scaled` 负责变换、`sum` 负责汇总，三层各司其职，中间**没有任何列表落地**。数据量从 4 行变成 4000 万行，代码一个字都不用改。

```pycon
>>> import itertools
>>> list(itertools.islice(itertools.count(), 3))
[0, 1, 2]
>>> list(itertools.chain("ab", [1]))
['a', 'b', 1]
>>> list(itertools.accumulate([1, 2, 3]))
[1, 3, 6]
>>> def g():
...     yield 1
...     return "done"
>>> gg = g()
>>> next(gg)
1
>>> try:
...     next(gg)
... except StopIteration as e:
...     print("return 值：", e.value)
return 值： done
```

---

## 15.4 什么时候用生成器，什么时候用列表

| 判据 | 生成器 | 列表 |
| --- | --- | --- |
| 数据量 | 大/无限/流式 | 小、需要反复访问 |
| 是否需要 `len()`、索引、切片 | 不行（`len` 会 TypeError） | 可以 |
| 是否需要遍历多次 | 不行（一次性） | 可以 |
| 是否需要 `sort`/`reverse` | 不行 | 可以 |
| 内存 | O(1) | O(n) |
| 调试 | `print` 一次就消耗了，不方便 | 随时看 |

一句话判据：**"只需要按顺序过一遍"就用生成器，"需要反复访问或随机访问"就用列表**。拿不准时先用列表，等内存/延迟真的成问题时再换。

---

## 15.5 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 迭代协议 | `begin()/end()` 迭代器对 | `__iter__`/`__next__` + `StopIteration` |
| 取值方式 | `*it` / `it->` | `next(it)` |
| 结束判断 | `it != end` | 异常 `StopIteration` |
| 协程式产出 | C++20 协程 / 手写状态机 | `yield` 一行搞定 |
| 惰性求值 | ranges / views | 生成器表达式 |
| 一次性 | 迭代器可以拷贝复用 | 迭代器共享状态，耗尽就是耗尽 |

`begin/end` 与 `iter(next)` 最大的差异在**结束信号**：C++ 靠比较哨兵位置，Python 靠抛异常。抛异常看起来"重"，但 CPython 对 `StopIteration` 有专门优化，`for` 循环的开销主要来自逐次函数调用而非异常。

---

## 15.6 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 第二次遍历得到空 | 迭代器已耗尽 | 改用列表，或重新创建迭代器 |
| `TypeError: object of type 'generator' has no len()` | 生成器没有长度 | 先 `list()` 或改用计数 |
| `can't send non-None value to a just-started generator` | 没预激 | 先 `next(g)` |
| `groupby` 分组结果碎成很多段 | 没按同一 key 排序 | 先 `sorted(key=...)` |
| 边遍历边 `remove` 漏元素 | 索引位移 | 遍历副本或用推导式重建 |
| 生成器里 `return x` 拿不到 `x` | 值在 `StopIteration.value` | 用 `try/except` 或 `yield from` |
| `next()` 报 `TypeError: 'int' object is not an iterator` | 传了可迭代对象而非迭代器 | 先 `iter(obj)` |
| 循环里 `print` 一次生成器就"没了" | `print` 内部可能消耗 | 先用 `list()` 落地再调试 |
| 无限生成器 `list()` 卡死 | 没有截断 | 用 `islice`/`take` |

---

## 15.7 练习

**1.（基础）** 写生成器 `countdown(n)`，从 `n` 递减到 1；再用它求 `sum(countdown(5))`。

验收：`list(countdown(3)) == [3, 2, 1]`，`sum(countdown(5)) == 15`。

**2.（基础）** 写一个 `Fib` 类，实现 `__iter__`/`__next__`，能无限产出斐波那契数列的前 n 项（`Fib(6)` 得到 `[0, 1, 1, 2, 3, 5]`）。

验收：`list(Fib(6))` 正确；同一实例第二次 `list()` 为空（迭代器特性）。

**3.（生成器）** 写生成器 `read_numbers(path)`：逐行读文件、跳过空行与 `#` 注释、把每行转成 `float`，遇到无法转换的内容打印警告后跳过。用你自己造的一个小文件测试。

验收：合格行全部产出，坏行有警告、不中断整体处理，且文件不需要一次性读进内存。

**4.（变式）** 用 `itertools` 与生成器搭一条流水线：从 `1..100` 中筛出 3 的倍数，平方，取前 5 个，求和。要求**不出现任何中间列表**。

验收：结果为 3²+6²+9²+12²+15² = 495，且 `type` 检查显示中间对象是生成器。

**5.（挑战）** 写生成器 `chunked(iterable, size)`，把任意可迭代对象切成固定大小的块（最后一块可以更小），并用它实现一个"每 1000 条写一次数据库"的批处理框架骨架（用 `print` 代替写库）。再用 `send` 实现一个可以随时"暂停/继续"的处理循环。

验收：`list(chunked(range(7), 3)) == [[0,1,2],[3,4,5],[6]]`；对生成器输入也能工作；批处理打印的次数等于 `ceil(总数/1000)`。

---

## 15.8 小结

1. **`for` = `iter()` + 反复 `next()` + 捕 `StopIteration`**；可迭代对象交迭代器，迭代器记位置。
2. **`yield` 把函数变成状态机**，挂起时局部变量保留；`send` 双向通信，`yield from` 委托。
3. **生成器 O(1) 内存、一次性**；需要反复访问或随机访问就换列表。

到目前为止，程序一旦出错就会以 `Traceback` 崩掉。下一章把"崩"变成"可控"：异常处理——`try/except/else/finally` 的执行顺序、异常链 `raise from`、以及为什么 `except Exception: pass` 是最糟的代码。
