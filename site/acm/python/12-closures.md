# 12 · 闭包

> **本质**：闭包就是"**函数 + 它引用的外层变量**"。这些外层变量不存在函数对象内部的字典里，而是被放在 `__closure__` 的 cell 中，函数与 cell 一起返回，所以外层函数已经返回了，这些变量依然活着。这既是 Python 实现状态封装最轻的方式，也是"晚绑定"的根源。

**读完这一章你能做到**

- 一眼判断一段代码是否构成闭包，并指出它的自由变量；
- 用 `__closure__` / `co_freevars` 亲手验证闭包捕获的是"变量"不是"值"；
- 说清 `nonlocal` 什么时候必须写、什么时候不写也合法；
- 用闭包实现计数器、缓存、带配置的工厂，并知道什么时候该换成类；
- 认出闭包造成的内存不释放问题。

---

## 12.1 三要素与一次验证

```python
# 示例：examples/ch12_01_closure.py
"""ch12_01_closure.py —— 闭包的三要素与 __closure__ 实证"""


def make_multiplier(n):
    def mul(x):
        return x * n
    return mul


double = make_multiplier(2)
triple = make_multiplier(3)
print(double(5), triple(5))
print("不同的函数对象：", double is triple, "| 名字都是：", double.__name__)

print("=== 自由变量存在 __closure__ 里 ===")
print("外层函数的自由变量：", make_multiplier.__code__.co_freevars)
print("mul 的自由变量：", double.__code__.co_freevars)
cells = double.__closure__
print("cell 个数：", len(cells))
print("cell 里存的值：", cells[0].cell_contents)
print("另一个闭包互不影响：", triple.__closure__[0].cell_contents)


def plain(x):
    return x + 1


print("不引用外层变量时 __closure__ 是：", plain.__closure__)

print("=== 同一外层里的两个闭包共享变量 ===")


def make_pair():
    n = 0

    def get():
        return n

    def inc():
        nonlocal n
        n += 1

    return get, inc


get, inc = make_pair()
print("初始：", get())
inc()
inc()
print("两次 inc 之后：", get())
print("两个闭包的 cell 是同一个对象：", get.__closure__[0] is inc.__closure__[0])
```

```text
10 15
不同的函数对象： False | 名字都是： mul
=== 自由变量存在 __closure__ 里 ===
外层函数的自由变量： ()
mul 的自由变量： ('n',)
cell 个数： 1
cell 里存的值： 2
另一个闭包互不影响： 3
不引用外层变量时 __closure__ 是： None
=== 同一外层里的两个闭包共享变量 ===
初始： 0
两次 inc 之后： 2
两个闭包的 cell 是同一个对象： True
```

闭包的三个条件：**内层函数**、**引用了外层函数的变量（自由变量）**、**外层函数把内层函数返回出去**。缺一不可——`make_multiplier` 内部的 `mul` 在返回前就已经引用了 `n`，返回后 `n` 的 cell 被 `__closure__` 攥住，于是 `n` 不会被回收。

关键词是"**变量，不是值**"。这也解释了 11 章的晚绑定：三个 lambda 的 cell 指向同一个 `i`，循环结束后它自然是 2。

```pycon
>>> def make_adder(n):
...     return lambda x: x + n
>>> add5 = make_adder(5)
>>> add5(10)
15
>>> add5.__closure__[0].cell_contents
5
```

> **💡 提示** `__closure__` 是只读元组，但 cell 里的值**可以通过 `cell_contents` 读**。想改就老老实实写 `nonlocal`，别去动 `cell_contents`——那属于实现细节（而且在某些解释器实现里不可赋值）。

---

## 12.2 `nonlocal`：改外层变量必须声明

```python
# 示例：examples/ch12_02_nonlocal.py
"""ch12_02_nonlocal.py —— nonlocal / global：什么时候必须声明"""


def counter_wrong():
    count = 0

    def inc():
        count += 1
        return count

    return inc


try:
    counter_wrong()()
except UnboundLocalError as e:
    print("UnboundLocalError:", e)


def counter_right():
    count = 0

    def inc():
        nonlocal count
        count += 1
        return count

    return inc


c = counter_right()
print("加上 nonlocal：", c(), c(), c())

print("=== 只读外层变量不需要 nonlocal ===")


def read_only():
    msg = "外层变量"

    def show():
        return msg

    return show


print(read_only()())

print("=== 改可变对象的内容也不需要 nonlocal ===")


def append_only():
    bucket = []

    def add(x):
        bucket.append(x)
        return bucket

    return add


a = append_only()
print(a(1), a(2))

print("=== global 改模块级变量 ===")
total = 0


def bump():
    global total
    total += 1


bump()
bump()
print("total =", total)

print("=== 用函数属性保存状态：另一种常见写法 ===")


def counter_obj():
    def inc():
        inc.count += 1
        return inc.count

    inc.count = 0
    return inc


c2 = counter_obj()
print(c2(), c2(), "| 属性值：", c2.count)
```

```text
UnboundLocalError: cannot access local variable 'count' where it is not associated with a value
加上 nonlocal： 1 2 3
=== 只读外层变量不需要 nonlocal ===
外层变量
=== 改可变对象的内容也不需要 nonlocal ===
[1, 2] [1, 2]
=== global 改模块级变量 ===
total = 2
=== 用函数属性保存状态：另一种常见写法 ===
1 2 | 属性值： 2
```

为什么 `count += 1` 会 `UnboundLocalError`？因为 `+=` 是**赋值语句**，Python 编译期看到函数体内有对 `count` 的赋值，就把 `count` 判定为**局部变量**；于是 `count + 1` 读的是一个还没赋值的局部名，直接报错。

规则表：

| 操作 | 需要声明吗 | 说明 |
| --- | --- | --- |
| 只读外层变量 | 不需要 | 名字解析按 LEGB 找到外层 cell |
| `x = ...` 重新绑定外层名字 | **需要 `nonlocal`** | 否则被当成新局部变量 |
| `x.append(...)` 改可变对象内容 | 不需要 | 没重新绑定名字，只是调用方法 |
| `x += 1`（`x` 是外层数字） | **需要 `nonlocal`** | `+=` 含赋值 |
| 改模块级变量 | **需要 `global`** | 跳过局部与外层封闭作用域 |
| 只在内层读 `global` 变量 | 不需要 | 读操作按 LEGB 走到模块级 |

`UnboundLocalError: cannot access local variable 'count' where it is not associated with a value` 这个报错几乎总是一个信号：**你想改的是外层变量，但漏了 `nonlocal`**。

---

## 12.3 闭包能干什么：三种正当用法

```python
# 示例：examples/ch12_03_stateful.py
"""ch12_03_stateful.py —— 用闭包做有状态工具：缓存、配置、限次"""
import functools


def memoize(fn):
    cache = {}

    @functools.wraps(fn)
    def wrapper(*args):
        if args not in cache:
            cache[args] = fn(*args)
        return cache[args]

    wrapper.cache = cache
    return wrapper


@memoize
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)


print("fib(30) =", fib(30))
print("手写缓存里的键数：", len(fib.cache))


@functools.cache
def fib2(n):
    return n if n < 2 else fib2(n - 1) + fib2(n - 2)


print("functools.cache 版本：", fib2(30), "| 条目数：", fib2.cache_info().currsize)

print("=== 带配置的工厂：闭包记住参数 ===")


def make_formatter(prefix, *, upper=False):
    def fmt(msg):
        text = f"{prefix}: {msg}"
        return text.upper() if upper else text

    return fmt


info = make_formatter("[INFO]")
warn = make_formatter("[WARN]", upper=True)
print(info("启动完成"))
print(warn("磁盘快满"))

print("=== 限次调用：状态藏在 cell 里 ===")


def limit_calls(n):
    calls = 0

    def guard(fn):
        @functools.wraps(fn)
        def wrapper(*a, **kw):
            nonlocal calls
            if calls >= n:
                return "已达上限"
            calls += 1
            return fn(*a, **kw)

        return wrapper

    return guard


@limit_calls(2)
def ping():
    return "pong"


print(ping(), ping(), ping())
```

```text
fib(30) = 832040
手写缓存里的键数： 31
functools.cache 版本： 832040 | 条目数： 31
=== 带配置的工厂：闭包记住参数 ===
[INFO]: 启动完成
[WARN]: 磁盘快满
=== 限次调用：状态藏在 cell 里 ===
pong pong 已达上限
```

三类场景：

1. **缓存/记忆化**：`cache` 字典被 `wrapper` 的 cell 记住，跨调用存活。`functools.cache` 就是这个思路的官方实现（还有 `lru_cache(maxsize=N)` 做容量控制）。
2. **配置工厂**：`make_formatter("[INFO]")` 生成一个"已经记住前缀"的函数，比每次调用都传 `prefix` 更省心。`functools.partial` 能覆盖简单情形，但闭包能写出更复杂的逻辑。
3. **状态机/限流/重试**：`calls` 计数藏在 cell 里，外部无法直接篡改（比挂在函数属性上更隐蔽）。

闭包 vs 类，怎么选：

| 维度 | 闭包 | 类 |
| --- | --- | --- |
| 状态个数 | 1～2 个 | 多字段、需要多个方法 |
| 需要被 `isinstance` 判断 / 继承 | 不行 | 可以 |
| 序列化（pickle） | 通常不行 | 通常可以 |
| 代码量 | 更少 | 更多 |
| 可调试性 | 状态藏在 cell，不容易看 | 打印对象就能看全部状态 |

判据很简单：**状态多于两个、或需要多个方法互相协作，就写类**。闭包适合"一个函数 + 一点记忆"。

---

## 12.4 陷阱：内存不释放

闭包会**延长外层变量的生命周期**。这在缓存场景是特性，在下列场景就是 bug：

```text
def load(path):
    data = open(path, "rb").read()      # 几百 MB
    def size():
        return len(data)                # 闭包捕获 data
    return size

s = load("big.bin")                     # 返回后 data 依然占着内存
```

只要 `s` 活着，`data` 就活着——即使你只想要一个数字。修法是**只捕获需要的东西**：

```text
def load_size(path):
    with open(path, "rb") as f:
        n = len(f.read())               # 读完就算，不留 data
    return lambda: n                    # 只捕获 int
```

同类问题还有：在长生命周期的对象上挂闭包回调（回调捕获了 `self`、捕获了整个大列表），导致看着删掉了却仍占内存。诊断手段是 `sys.getrefcount` 和 `tracemalloc`（第 24 章）。

---

## 12.5 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 状态存放 | lambda 的捕获成员（值或引用） | `__closure__` 的 cell |
| 何时确定捕获 | 编译期由捕获列表决定 | 编译期由名字解析决定，值在**调用时**读 |
| 按值捕获 | `[=]`/`[x]` 定义时拷贝 | 只能靠默认参数 `lambda x=x:` 模拟 |
| 修改捕获变量 | `mutable` + 捕获 | `nonlocal` |
| 生命周期 | 捕获拷贝随对象销毁 | cell 随函数对象被 GC |
| 类型 | 每个 lambda 独立类型 | 都是 `function` 类型 |

C++ 程序员最容易踩的是"默认参数模拟按值捕获"这一条：**Python 没有捕获列表**，所以要么 `i=i`，要么用工厂函数。

---

## 12.6 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `UnboundLocalError: cannot access local variable 'x'` | 想改外层变量却没 `nonlocal` | 加 `nonlocal x` |
| 循环里闭包全用最后一个值 | 晚绑定 | 默认参数 / 工厂函数 |
| `NameError: name 'x' is not defined` | 外层变量根本没定义 | 检查是否漏赋值 |
| 缓存字典无限增长 | `memoize` 没有容量上限 | 用 `functools.lru_cache(maxsize=N)` |
| 函数返回后变量"居然还在" | 闭包攥着 cell | 这是特性；不想留就只捕获需要的值 |
| 删了对象内存没降 | 闭包引用链 | `tracemalloc` 定位，拆掉引用 |
| 两个闭包互相干扰状态 | 它们共享同一个 cell | 每次工厂调用独立生成 |
| `nonlocal` 报 `SyntaxError: no binding for nonlocal` | 外层没有同名变量 | 先在外层赋值，或用 `global` |
| 在类方法里用 `nonlocal` 想改实例属性 | 作用域搞混 | 改 `self.x`，不用 `nonlocal` |

---

## 12.7 练习

**1.（基础）** 写 `make_power(exp)`，返回 `f(base)` 计算 `base ** exp`；用它造出平方与立方函数。

验收：`make_power(2)(3) == 9`、`make_power(3)(2) == 8`，且两者互不干扰。

**2.（计数器）** 写 `make_counter(start=0, step=1)`，返回一个每次调用递增并返回当前值的函数；要求支持两个独立计数器互不影响。

验收：`c1 = make_counter(); c2 = make_counter(10, 5)`；`c1()` 连续调用得到 1、2，`c2()` 得到 15、20。

**3.（nonlocal 判断）** 下面四段代码哪些会报错？先判断再运行验证：

```text
① def f(): x = 1
     def g(): return x
② def f(): x = 1
     def g(): x = 2
③ def f(): x = []
     def g(): x.append(1)
④ def f(): x = 0
     def g(): x += 1
```

验收：逐条给出结论并说明原因（赋值 vs 改内容）。

**4.（变式）** 用闭包实现 `once(fn)`：包装后第一次调用执行 `fn` 并返回结果，之后每次调用都直接返回第一次的结果（不重复执行）。打印 `fn` 实际被调用的次数。

验收：调用 3 次，`fn` 只执行 1 次，三次返回值相同。

**5.（挑战）** 用闭包实现 `rate_limiter(max_calls, period)`：一个"时间窗内最多调用 N 次"的限制器（时间用 `time.monotonic()`，只打印是否放行，别打印时间数值）。再加一个 `make_cache(maxsize)` 实现容量受限的缓存（满了清空最旧的）。

验收：连调 `max_calls+1` 次，第 `max_calls+1` 次返回"拒绝"；缓存超过 `maxsize` 后条目数不超过上限。

---

## 12.8 小结

1. **闭包 = 函数 + `__closure__` 里的 cell**，捕获的是变量，调用时才读值。
2. **改外层变量要 `nonlocal`**，改可变对象内容不用；`global` 只用于模块级。
3. **状态少用闭包、状态多用类**；闭包会延长变量寿命，注意内存。

下一章用闭包装配出 Python 最标志性的语法糖：装饰器——`@` 到底做了什么、为什么要 `functools.wraps`、带参数的装饰器为什么是"三层函数"。
