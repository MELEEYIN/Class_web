# 13 · 装饰器

> **本质**：装饰器就是"**接收函数、返回函数**的可调用对象"，`@deco` 只是 `f = deco(f)` 的语法糖，发生在**函数定义完成的那一刻**（一次），而 wrapper 内部那段增强逻辑发生在**每次调用时**。理解这一点，带参数的装饰器为什么是三层函数、多个装饰器为什么从下往上，全部自然成立。

**读完这一章你能做到**

- 手写 `wrapper(*args, **kwargs)` 把参数与返回值原样传递，不用背模板；
- 说清 `@deco` 展开成什么、装饰器主体在什么时刻执行一次；
- 用 `functools.wraps` 保住 `__name__`/`__doc__`，并解释不写会坏在哪里；
- 写出带参数的装饰器、类装饰器、重试装饰器；
- 判断多个装饰器的包装顺序与执行顺序。

---

## 13.1 从 `@` 展开说起

```python
# 示例：examples/ch13_01_basic.py
"""ch13_01_basic.py —— 装饰器到底做了什么"""


def trace(fn):
    def wrapper(*args, **kwargs):
        print(f"  -> 调用 {fn.__name__}{args}")
        result = fn(*args, **kwargs)
        print(f"  <- 返回 {result!r}")
        return result

    return wrapper


def add(a, b):
    return a + b


added = trace(add)
print("手动包装的结果：", added(1, 2))


@trace
def mul(a, b):
    return a * b


print("语法糖包装的结果：", mul(3, 4))
print("mul 现在指向的是：", mul.__name__)

print("=== 装饰器在定义时执行一次，包装函数在调用时执行 ===")


def loud(fn):
    print("  装饰器主体运行，装饰了", fn.__name__)

    def wrapper():
        return fn().upper()

    return wrapper


print("准备定义 hello")


@loud
def hello():
    return "hello"


print("hello 定义完成")
print("第一次调用：", hello())
print("第二次调用：", hello())

print("=== 多个装饰器：由下向上包装，由上向下执行 ===")


def deco_a(fn):
    def wrapper():
        return "A(" + fn() + ")"

    return wrapper


def deco_b(fn):
    def wrapper():
        return "B(" + fn() + ")"

    return wrapper


@deco_a
@deco_b
def inner():
    return "x"


print(inner())

print("=== 忘了 return 就会丢掉返回值 ===")


def careless(fn):
    def wrapper(*args, **kwargs):
        fn(*args, **kwargs)

    return wrapper


@careless
def get_answer():
    return 42


print("careless 包装后：", get_answer())
```

```text
  -> 调用 add(1, 2)
  <- 返回 3
手动包装的结果： 3
  -> 调用 mul(3, 4)
  <- 返回 12
语法糖包装的结果： 12
mul 现在指向的是： wrapper
=== 装饰器在定义时执行一次，包装函数在调用时执行 ===
准备定义 hello
  装饰器主体运行，装饰了 hello
hello 定义完成
第一次调用： HELLO
第二次调用： HELLO
=== 多个装饰器：由下向上包装，由上向下执行 ===
A(B(x))
=== 忘了 return 就会丢掉返回值 ===
careless 包装后： None
```

三条关键结论，逐条对上上面的输出：

1. **`@trace` 之后，`mul` 这个名字已经指向 `wrapper`**，不再是原来的函数。所以 `mul.__name__` 印出来是 `wrapper`（13.2 用 `wraps` 修）。
2. **装饰器主体在定义时执行一次**：`装饰器主体运行，装饰了 hello` 出现在 `准备定义 hello` 之后、`hello 定义完成` 之前。之后每次调用只跑 `wrapper` 内部。
3. **多个装饰器从下往上包装**：`@deco_a` 在最上面反而最后执行——`@deco_a @deco_b def inner` 等价于 `inner = deco_a(deco_b(inner))`，所以结果是 `A(B(x))`。

```pycon
>>> def deco(fn):
...     def wrapper(*a, **kw):
...         return fn(*a, **kw) + "!"
...     return wrapper
>>> @deco
... def hi():
...     return "hi"
>>> hi()
'hi!'
>>> hi.__name__
'wrapper'
```

同步把 `@` 记成一行等式：**`@deco` ≡ `f = deco(f)`**。那么 `@deco("x")` 呢？等价于 `f = deco("x")(f)` —— 先调用 `deco("x")` 得到一个装饰器，再用它装饰 `f`。这就是"带参数装饰器要三层"的唯一原因。

---

## 13.2 `functools.wraps`：别把函数身份弄丢

```python
# 示例：examples/ch13_02_wraps.py
"""ch13_02_wraps.py —— functools.wraps：保住被装饰函数的元数据"""
import functools


def no_wraps(fn):
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)

    return wrapper


def with_wraps(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)

    return wrapper


@no_wraps
def alpha():
    """alpha 的说明文档"""
    return 1


@with_wraps
def beta():
    """beta 的说明文档"""
    return 2


print("不加 wraps：name =", alpha.__name__, "| doc =", alpha.__doc__)
print("加了 wraps：name =", beta.__name__, "| doc =", beta.__doc__)
print("wraps 还补了 __wrapped__：", hasattr(beta, "__wrapped__"), beta.__wrapped__.__name__)

print("=== 用函数属性计数：wraps 之后属性名不会串 ===")


def counted(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        return fn(*args, **kwargs)

    wrapper.calls = 0
    return wrapper


@counted
def ping():
    return "pong"


ping()
ping()
ping()
print(ping.__name__, "被调用", ping.calls, "次")

print("=== 标准库现成的装饰器：lru_cache ===")


@functools.lru_cache(maxsize=None)
def slow_square(n):
    print("  真正计算", n)
    return n * n


print(slow_square(4))
print(slow_square(4))
print(slow_square(5))
print(slow_square.cache_info())

print("=== 类方法/静态方法本质上也是装饰器 ===")


class Demo:
    def method(self):
        return "普通方法"

    @staticmethod
    def static():
        return "静态方法不需要 self"

    @property
    def value(self):
        return 100


d = Demo()
print(d.method(), "|", Demo.static(), "|", d.value)
print("staticmethod 是装饰器函数：", type(Demo.__dict__["static"]).__name__)
```

```text
不加 wraps：name = wrapper | doc = None
加了 wraps：name = beta | doc = beta 的说明文档
wraps 还补了 __wrapped__： True beta
=== 用函数属性计数：wraps 之后属性名不会串 ===
ping 被调用 3 次
=== 标准库现成的装饰器：lru_cache ===
  真正计算 4
16
16
  真正计算 5
25
CacheInfo(hits=1, misses=2, maxsize=None, currsize=2)
=== 类方法/静态方法本质上也是装饰器 ===
普通方法 | 静态方法不需要 self | 100
staticmethod 是装饰器函数： staticmethod
```

`functools.wraps` 是 `functools.update_wrapper` 的简写，它把 `__module__`、`__name__`、`__qualname__`、`__doc__`、`__dict__` 一并拷到 wrapper 上，并额外设置 `__wrapped__` 指回原函数。不写的代价很具体：

| 不问 `wraps` 就会坏的场景 | 表现 |
| --- | --- |
| 日志/追踪 | 日志里全是 `wrapper`，看不出是谁被调用 |
| `functools.lru_cache` 叠加顺序 | 缓存键正确，但报错信息里函数名丢失 |
| `inspect.signature` / 自动生成文档 | 拿到的签名是 `(*args, **kwargs)` |
| pytest 收集用例 | 测试函数名变成 `wrapper`，用例互相覆盖 |
| `pickle` / `multiprocessing` | 拿不到真实 `__qualname__`，序列化失败 |

> **💡 提示** `@functools.wraps(fn)` 写在**内层 wrapper 定义之前**，不要漏。这是唯一一个"照抄模板也必须保留"的装饰器。

`slow_square.cache_info()` 输出 `CacheInfo(hits=1, misses=1, maxsize=None, currsize=1)`：`4` 命中一次缓存、`5` 未命中，说明缓存按**参数**做键，且第二次调用没有真正计算（没有打印"真正计算 4"）。

`staticmethod`/`classmethod`/`property` 本身就是装饰器——`Demo.__dict__["static"]` 的类型是 `staticmethod`，说明它们把函数替换成了一个描述符对象。第 18 章细讲。

---

## 13.3 带参数的装饰器 = 三层函数

```python
# 示例：examples/ch13_03_params.py
"""ch13_03_params.py —— 带参数的装饰器（三层函数）、类装饰器、重试"""
import functools


def repeat(times):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            return [fn(*args, **kwargs) for _ in range(times)]

        return wrapper

    return decorator


@repeat(3)
def say(msg):
    return msg


print(say("hi"))


@repeat(1)
def once(x):
    return x


print(once(7))


def retry(times, exceptions=(ValueError,)):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return f"{fn(*args, **kwargs)}（第 {attempt} 次成功）"
                except exceptions as e:
                    if attempt == times:
                        return f"全部失败：{type(e).__name__}"

        return wrapper

    return decorator


calls = {"n": 0}


@retry(3)
def flaky():
    calls["n"] += 1
    if calls["n"] < 3:
        raise ValueError("还没准备好")
    return "OK"


print(flaky())
print("flaky 实际被调用", calls["n"], "次")

calls2 = {"n": 0}


@retry(2)
def always_bad():
    calls2["n"] += 1
    raise ValueError("永远失败")


print(always_bad())
print("always_bad 实际被调用", calls2["n"], "次")

print("=== 类装饰器：实现 __call__ 的实例可以当装饰器 ===")


class Tag:
    def __init__(self, name):
        self.name = name

    def __call__(self, fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            return f"<{self.name}>{fn(*args, **kwargs)}</{self.name}>"

        return wrapper


@Tag("b")
def bold(text):
    return text


print(bold("粗体"))
print("名字仍是：", bold.__name__)

print("=== 装饰器叠加：计时 + 日志 ===")
log = []


def logged(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        log.append(fn.__name__)
        return fn(*args, **kwargs)

    return wrapper


def doubled(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs) * 2

    return wrapper


@logged
@doubled
def base(n):
    return n + 1


print(base(3))
print("日志：", log)
```

```text
['hi', 'hi', 'hi']
[7]
OK（第 3 次成功）
flaky 实际被调用 3 次
全部失败：ValueError
always_bad 实际被调用 2 次
=== 类装饰器：实现 __call__ 的实例可以当装饰器 ===
<b>粗体</b>
名字仍是： bold
=== 装饰器叠加：计时 + 日志 ===
8
日志： ['base']
```

三层的职责分工，记住这张表就不会写乱：

| 层 | 例子里的名字 | 拿到什么 | 返回什么 | 何时执行 |
| --- | --- | --- | --- | --- |
| 第 1 层 | `repeat(times)` | 装饰器**参数** | 装饰器 | `@repeat(3)` 求值时 |
| 第 2 层 | `decorator(fn)` | **被装饰的函数** | wrapper | 函数定义时 |
| 第 3 层 | `wrapper(*args)` | **调用参数** | 调用的结果 | 每次调用 |

`retry` 演示了参数化装饰器最实用的形态：`attempt` 循环、异常白名单用元组参数传、最后一次失败不再抛而是返回失败信息。注意 `except exceptions as e` 里只做判定，`return` 在循环内——不要在循环外写 `else`，否则第一次成功也会被继续循环。

**类装饰器**：只要一个对象实现了 `__call__`，它就是可调用对象，就能当装饰器。`@Tag("b")` 先构造实例（记住 `name`），实例被调用时再装饰函数。状态放在实例属性里，比闭包更直观——这就是"状态多就用类"的具体体现。

**执行顺序**：`@logged @doubled def base` → `base(3)` 得 `(3+1)*2 = 8`；outer `logged` 先记日志再调用，所以 `log` 是 `['base']`（`wraps` 让 `fn.__name__` 仍是 `base`，而不是 `wrapper`）。

---

## 13.4 什么时候不该用装饰器

| 场景 | 问题 | 更好的做法 |
| --- | --- | --- |
| 只在一个函数上用一次 | 多了一层调用栈和阅读成本 | 直接写在内联代码里 |
| 装饰器里改了参数语义（如悄悄加默认值） | 调用方看不出来，调试极痛 | 显式参数 |
| 需要访问 `self` 的实例状态 | 函数装饰器拿不到 `self` 之外的东西 | 写类方法 / 用描述符 |
| 异步函数 | 普通 wrapper 会把协程包成同步函数，返回 coroutine 而非结果 | `async def wrapper` 并 `await` |
| 大量小函数都加同一装饰器 | 每次调用多一次 Python 层函数调用 | 性能敏感路径改用内联写法 |

异步装饰器是新手最容易翻车的一条：

```text
def bad_deco(fn):                 # ✗ 对 async def 用同步 wrapper
    def wrapper(*a, **kw):
        return fn(*a, **kw)       # 返回的是 coroutine，没 await
    return wrapper

def good_deco(fn):                # ✓
    @functools.wraps(fn)
    async def wrapper(*a, **kw):
        return await fn(*a, **kw)
    return wrapper
```

---

## 13.5 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 是什么 | 编译期语法糖 / 元编程 | 运行期的高阶函数 |
| 作用对象 | 类、函数、变量（attribute/declspec） | 任何可调用对象（函数、类、实例） |
| 执行时机 | 编译期展开 | 定义函数时执行一次 |
| 能否改签名 | 不能 | 能（wrapper 可以任意改） |
| 类型检查 | 模板推导在编译期 | 运行期无签名约束 |
| 典型用途 | `[[nodiscard]]`、`@property` 类比 | 日志、缓存、重试、权限、计时 |

---

## 13.6 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 被装饰函数返回 `None` | wrapper 忘了 `return fn(...)` | 补 `return` |
| 只能传固定参数的函数 | wrapper 写死 `def wrapper()` | 用 `*args, **kwargs` |
| 日志里全是 `wrapper` | 没用 `functools.wraps` | 内层加 `@functools.wraps(fn)` |
| `@deco(3)` 报 `TypeError: 'int' object is not callable` | 把参数化装饰器写成了两层 | 加一层，返回 `decorator` |
| `@deco` 加参数化版本直接写 `@deco`（不调用） | `deco` 返回的是 decorator 而不是 wrapper | 必须写 `@deco()` |
| 多装饰器顺序搞反 | 以为从上往下包 | 从下往上包装 |
| 缓存不生效 | `lru_cache` 放在了会变参数的装饰器外层 | 让 `lru_cache` **紧贴**原函数（写在最下面） |
| 异步函数变 coroutine | 同步 wrapper | `async def wrapper` + `await` |
| 装饰器在导入时就打印了 | 主体代码写在外层 | 把副作用移进 wrapper |

---

## 13.7 练习

**1.（基础）** 写 `@log_calls`，每次调用打印 `函数名 参数 返回值`，并要求保留原函数名与文档字符串。

验收：`print(f.__name__, f.__doc__)` 输出原函数的名称与文档；调用两次打印两行。

**2.（基础）** 写 `@once`：被装饰函数无论调用多少次，只真正执行一次，之后返回第一次的结果。

验收：连调 3 次，内部计数器显示只执行 1 次，三次返回值相同。

**3.（参数化）** 写 `@repeat(n)`，把函数调用结果重复 n 次收进列表返回；`n=1` 时列表长度为 1。

验收：`@repeat(3) def f(x): return x*2`，`f(5)` 得到 `[10, 10, 10]`。

**4.（变式）** 写 `@retry(times=3, delay=0)` 装饰器：函数抛 `ValueError` 时重试，最多 `times` 次；全部失败则把最后一次异常继续抛出（不是吞掉）。用一个前两次失败、第三次成功的函数验证。

验收：函数实际被调用 3 次并返回成功值；另写一个永远失败的函数，确认最终抛出 `ValueError`。

**5.（挑战）** 写一个能同时用于同步函数和 `async def` 函数的 `@timed` 装饰器：判断 `inspect.iscoroutinefunction(fn)` 走两条分支，打印每次调用的耗时（用 `time.perf_counter()`，只打印"耗时 X 毫秒"的格式，不要把数字写死进预期）。再用 `pytest` 或 `unittest` 给 `repeat` 和 `retry` 各写一个用例（第 24 章会系统讲测试）。

验收：同步函数与 `async def` 函数都能被装饰且都打印耗时；两个测试用例通过。

---

## 13.8 小结

1. **`@deco` = `f = deco(f)`**，装饰器主体在定义时执行一次，wrapper 在每次调用时执行。
2. **wrapper 必须 `return fn(*args, **kwargs)`**，内层必须 `@functools.wraps(fn)`。
3. **带参数的装饰器是三层**：参数层 → 收函数层 → 收调用参数层；多个装饰器从下往上包。

装饰器之所以能工作，靠的是"函数能看见外层名字"这条规则。下一章把这条规则彻底讲清：作用域与 LEGB——为什么在函数里给全局变量赋值会 `UnboundLocalError`、`global` 与 `nonlocal` 的边界在哪。
