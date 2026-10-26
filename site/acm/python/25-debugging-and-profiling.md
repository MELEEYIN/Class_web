# 25 · 调试与性能剖析

> **本质**：调试是**缩小「我以为」和「实际」的差距**，性能是**找到那 5% 真正花时间的代码**。两件事都靠同一套动作：先观测，再假设，最后才改。

**读完这一章你能做到**

1. 从一段 traceback 里三秒定位「哪一行、哪一层、什么异常」，并读懂 `from e` 造成的链式异常。
2. 用 `breakpoint()`/`pdb` 与 IDE 断点检查运行中状态，而不是靠到处 `print`。
3. 用 `logging` 分级输出，用 `warnings` 提示废弃，用 `assert` 守住不变量。
4. 用 `cProfile` + `pstats` 按调用次数与耗时排序找热点，并知道 `timeit` 的正确用法。
5. 识别五类典型性能反模式，并说出正确的替代写法。

## 25.1 读 traceback：自下而上，最后三行才是关键

```
Traceback (most recent call last):
  File "app.py", line 12, in <module>
    main()
  File "app.py", line 8, in main
    load("abc")
  File "app.py", line 5, in load
    return int(text)
ValueError: invalid literal for int() with base 10: 'abc'
```

四步读法：

1. **最后一行**：异常类型 + 消息。`ValueError: invalid literal for int()` 已经说明「给 `int()` 的字符串不是数字」。
2. **倒数第二段**：真正出错的位置（`load` 的 `int(text)`），这一帧是你写的代码。
3. **往上**：调用链，`<module>` → `main` → `load`，说明它是怎么走到这里的。
4. **`most recent call last`**：最外层在最上面，最内层在最下面——和 C++ 的栈展开方向相反，别读反。

`KeyError` 有个著名坑：它的参数是**键对象本身**，`str(e)` 打印的是这个键的 `repr`——所以你会看到一对多余的引号，误以为是字符串内容的一部分。

```pycon
>>> try:
...     {}["缺失的键"]
... except KeyError as e:
...     print("str :", str(e))
...     print("repr:", repr(e))
...     print("args:", e.args)
str : '缺失的键'
repr: KeyError('缺失的键')
args: ('缺失的键',)
```

对比一下 `ValueError`：`str(ValueError("坏值"))` 就是 `坏值`，没有引号。`KeyError`/`IndexError` 这类「参数是被查找对象」的异常都保留了 `repr` 风格。

所以 `print(f"读配置失败: {e}")` 只说「键名」，不说「哪个文件、哪个函数」。这类消息要自己补上下文——`raise KeyError(f"配置缺少 {key!r}")`。

链式异常是 `raise ... from e` 的产物，traceback 会输出两段并用 `The above exception was the direct cause of the following exception` 连接：

```pycon
>>> def parse(t):
...     return int(t)
...
>>> try:
...     try:
...         parse("abc")
...     except ValueError as e:
...         raise RuntimeError("解析配置失败") from e
... except RuntimeError as err:
...     print("本层:", type(err).__name__, "|", err)
...     print("根因:", type(err.__cause__).__name__, "|", err.__cause__)
...     print("抑制标记:", err.__suppress_context__)
本层: RuntimeError | 解析配置失败
根因: ValueError | invalid literal for int() with base 10: 'abc'
抑制标记: True
```

`err.__cause__` 是 `from e` 指定的原因，`err.__context__` 是「在这个 except 里又抛异常」时自动挂上的上下文。注意上面那个 `True`：**只要写了 `from`**，`__suppress_context__` 就被置为 `True`，traceback 不再打印 `__context__`；`from e` 是「换成更清楚的原因」，`from None` 是「原因就是没有，别展示下游噪音」，两者都会掐掉自动上下文。

| 写法 | `__cause__` | `__suppress_context__` | traceback 展示 |
| --- | --- | --- | --- |
| `raise B()` 在 except 内 | `None` | `False` | `During handling of the above exception...` + 两段 |
| `raise B() from a` | `a` | `True` | `The above exception was the direct cause...` + 两段 |
| `raise B() from None` | `None` | `True` | 只有 `B` 一段 |

```python
# 示例：examples/ch25_01_traceback.py
import traceback


def parse(text):
    return int(text)


def load(raw):
    try:
        return parse(raw)
    except ValueError as e:
        raise RuntimeError("解析配置失败") from e


def main():
    try:
        load("abc")
    except RuntimeError as e:
        tb = traceback.extract_tb(e.__traceback__)
        print("帧数:", len(tb))
        print("调用链:", " -> ".join(f.name for f in tb))
        print("本层异常:", type(e).__name__, "|", e)
        cause = e.__cause__
        print("根因:", type(cause).__name__, "|", cause)
        print("只格式化异常行:", traceback.format_exception_only(type(cause), cause)[0].strip())
        print("是否自动产生的上下文:", e.__context__ is cause)


main()

try:
    assert 3 * 7 == 22, f"乘法算错了：3*7 = {3 * 7}"
except AssertionError as e:
    print("断言失败信息:", e)

print("__debug__ =", __debug__, "（用 python -O 运行会变成 False，assert 全部消失）")

try:
    {}["缺失的键"]
except KeyError as e:
    print("KeyError 的参数是键本身:", e, "| repr:", repr(e))
    print("想打印消息要用 e.args:", e.args)
```

```text
帧数: 2
调用链: main -> load
本层异常: RuntimeError | 解析配置失败
根因: ValueError | invalid literal for int() with base 10: 'abc'
只格式化异常行: ValueError: invalid literal for int() with base 10: 'abc'
是否自动产生的上下文: True
断言失败信息: 乘法算错了：3*7 = 21
__debug__ = True （用 python -O 运行会变成 False，assert 全部消失）
KeyError 的参数是键本身: '缺失的键' | repr: KeyError('缺失的键')
想打印消息要用 e.args: ('缺失的键',)
```

## 25.2 别用 `print` 调试：三条替代

| 手段 | 用途 | 为什么比 `print` 好 |
| --- | --- | --- |
| `assert` | 守住「绝不该发生」的条件 | 自带消息，`-O` 下自动消失，零成本 |
| `logging` | 保留上下文、可分级、可关掉 | 带时间/模块名，能留在生产里 |
| `breakpoint()` | 停下来检查全部局部变量 | 一次看到所有变量与调用栈 |

```pycon
>>> try:
...     assert 3 * 7 == 22, f"乘法算错了：3*7 = {3 * 7}"
... except AssertionError as e:
...     print(type(e).__name__ + ":", e)
AssertionError: 乘法算错了：3*7 = 21
```

`assert` 的三条纪律：①消息里写**实际值**，不要只写「不满足」；②**不要用 assert 校验外部输入**（`-O` 下会被删掉，安全性归零）；③它适合放「不变量」——循环中间状态、函数入口的契约。

`print` 调试的真正问题是**它不可关闭**：调完忘了删，输出里混着 `1`、`here`、`xxx`，还得回头清理。`logging.debug` 只要提高一级就全消失。

## 25.3 `breakpoint()` 与 `pdb`

Python 3.7 起内置 `breakpoint()`，等价于 `import pdb; pdb.set_trace()`（可用 `PYTHONBREAKPOINT` 环境变量换成 ipdb/pudb）。程序跑到这一行会停住，进入交互式调试器。

七个够用的命令：

| 命令 | 缩写 | 作用 |
| --- | --- | --- |
| `list` | `l` | 看当前行附近的源码 |
| `next` | `n` | 执行下一行（不进入函数） |
| `step` | `s` | 进入被调用的函数 |
| `continue` | `c` | 继续到下一个断点 |
| `print expr` | `p` | 求值并打印（可 `p locals()`） |
| `where` | `w` | 打印调用栈 |
| `quit` | `q` | 退出（会中止程序） |

`p locals()` 是最好用的一条：一次看到当前帧的所有局部变量，比在五个地方插 `print` 快得多。`!` 前缀可以执行任意语句（`!x = 5` 改值继续跑），这让「把可疑变量改成边界值试试」变成两秒钟的事。

> **💡 提示**：调试器是**交互式**的，所以本章示例不能自动校验 `pdb` 会话。真实工作流是：在可疑行前插 `breakpoint()`，`python script.py` 跑起来，`n`/`s` 单步，`p` 查值。IDE（VS Code、PyCharm）的断点是同一套机制的图形界面，红点 + 条件断点（`i == 99`）比手动插 `if i == 99: breakpoint()` 干净。

## 25.4 `logging`：可关闭的 `print`

```python
# 示例：examples/ch25_03_logging_warn.py
import logging
import sys
import warnings

logging.basicConfig(stream=sys.stdout, level=logging.INFO,
                    format="%(levelname)s %(name)s %(message)s", force=True)
log = logging.getLogger("dbg")

log.debug("DEBUG 低于 INFO，默认不打印")
log.info("用户 %s 登录失败，第 %d/%d 次", "tom", 2, 5)
log.warning("磁盘剩余 %d MB", 120)
log.error("数据库连接超时，重试 %d 次", 3)


def old_api():
    warnings.warn("old_api 将在 4.0 移除，请改用 new_api",
                  DeprecationWarning, stacklevel=2)


with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    old_api()
    print("捕获警告数:", len(caught))
    print("类别:", caught[0].category.__name__)
    print("消息:", caught[0].message)
    print("位置指向调用方:", caught[0].filename.endswith("ch25_03_logging_warn.py"))

with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("error")
    try:
        old_api()
    except DeprecationWarning as e:
        print("把警告升级为异常后:", str(e))

print("__debug__ =", __debug__, "| 解释器:", sys.version_info.major, sys.version_info.minor)
print("日志是否低于阈值:", log.isEnabledFor(logging.DEBUG),
      "| 是否启用 INFO:", log.isEnabledFor(logging.INFO))
```

```text
INFO dbg 用户 tom 登录失败，第 2/5 次
WARNING dbg 磁盘剩余 120 MB
ERROR dbg 数据库连接超时，重试 3 次
捕获警告数: 1
类别: DeprecationWarning
消息: old_api 将在 4.0 移除，请改用 new_api
位置指向调用方: True
把警告升级为异常后: old_api 将在 4.0 移除，请改用 new_api
__debug__ = True | 解释器: 3 14
日志是否低于阈值: False | 是否启用 INFO: True
```

四个约定（第 21 章讲过配置，这里讲用法）：

1. **级别要选对**：`debug` 给排查细节、`info` 给正常流程（启动、任务数）、`warning` 给「能继续但要关注」、`error` 给「这次操作失败」、`critical` 给「进程要死了」。
2. **占位不要 f-string**：`log.info("处理 %d 条", n)` 在级别不够时不会格式化，f-string 总是先算一遍。
3. **异常用 `log.exception`**：它自动带上 traceback，等价于 `error(..., exc_info=True)`。
4. **`logger = logging.getLogger(__name__)`**：名字就是模块名，粒度和模块对齐。

`warnings` 与 `logging` 分工不同：`warnings` 面向**代码使用者**（「这个 API 要废弃了」「这个用法有坑」），可被 `-W error` 升级成异常，也可以在测试里 `catch_warnings(record=True)` 断言；`logging` 面向**运行观测**。

## 25.5 计时：`perf_counter` 与 `timeit`

```pycon
>>> import timeit
>>> timeit.timeit("sum(range(100))", number=1000) > 0
True
>>> timeit.timeit(stmt="'-'.join(str(i) for i in range(50))", number=100) > 0
True
>>> import time
>>> hasattr(time, "perf_counter") and hasattr(time, "perf_counter_ns")
True
```

三条规矩：

1. **别用 `time.time()` 测耗时**：它取的是墙钟时间，会被系统对时（NTP）跳变影响，而且精度可能只有 15ms（Windows 上尤其）。用 `time.perf_counter()`。
2. **单次测量毫无意义**：毫秒级操作的噪声可能比结果还大。`timeit` 会跑多次取最小值，`number=` 控制循环次数。
3. **`timeit` 的语句里不要包含准备数据**：`setup=` 里放准备代码，`stmt=` 只放被测表达式，否则你测的是「构造 + 计算」。

写基准时唯一诚实的输出是**相对比较**（A 比 B 快多少倍），而不是「本机跑了 0.0031 秒」——后者换个机器就变了。本章示例因此只断言「慢 100 倍以上」这种稳健结论。

## 25.6 `cProfile`：找出真正花时间的地方

直觉定位热点几乎总是错的。`cProfile` 是标准库自带的确定性剖析器，记录每次函数调用的次数与耗时。

```python
# 片段：最常用的三步
import cProfile, pstats

profiler = cProfile.Profile()
profiler.enable()
main()                      # 被测代码
profiler.disable()
pstats.Stats(profiler).sort_stats("cumulative").print_stats(15)
```

输出五列要会读：

| 列 | 含义 | 怎么用 |
| --- | --- | --- |
| `ncalls` | 调用次数（`a/b` 表示总/原始） | 次数异常高 → 循环里重复计算 |
| `tottime` | 函数自身耗时（不含子调用） | **排第一优先看这列** |
| `percall` | `tottime/ncalls` | 单次成本 |
| `cumtime` | 含子调用的累计耗时 | 找「哪条路径整体最贵」 |
| `filename:lineno` | 位置 | 点进去看实现 |

排序方式决定你看到什么：`sort_stats("tottime")` 找「自己很贵」的函数，`sort_stats("cumulative")` 找「整条链路很贵」的入口，`sort_stats("calls")` 找「被调了几万次」的小函数。**先看 `tottime`，再看 `cumtime`**——前者是真正消耗 CPU 的地方，后者只是把子调用的账算在父函数头上。

命令行也能用，不必改代码：

```bash
python -m cProfile -s tottime script.py | head -20
```

```python
# 示例：examples/ch25_02_profile.py
import cProfile
import pstats
import timeit
import tracemalloc


def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)


def build(n):
    return [i * i for i in range(n)]


profiler = cProfile.Profile()
profiler.enable()
value = fib(20)
rows = build(100_000)
profiler.disable()

print("fib(20) =", value, "| build 结果长度:", len(rows))

stats = pstats.Stats(profiler)
key = (fib.__code__.co_filename, fib.__code__.co_firstlineno, "fib")
print("fib 被调用次数:", stats.stats[key][1])
print("统计条目数 >= 2:", len(stats.stats) >= 2)


def scan_count(data, target):
    ops = 0
    for x in data:
        ops += 1
        if x == target:
            break
    return ops


hay = list(range(1000))
hay_set = set(hay)
print("线性扫描到末位需要比较:", scan_count(hay, 999), "次")

t_list = timeit.timeit(lambda: 999 in hay, number=1000)
t_set = timeit.timeit(lambda: 999 in hay_set, number=1000)
print("list 版比 set 版慢 100 倍以上:", t_list > t_set * 100)

t0 = timeit.default_timer()
total = sum(build(50_000))
elapsed = timeit.default_timer() - t0
print("求和结果:", total, "| 耗时小于 1 秒:", elapsed < 1.0)

tracemalloc.start()
chunks = [bytearray(1000) for _ in range(10)]
snapshot = tracemalloc.take_snapshot()
tracemalloc.stop()
top = snapshot.statistics("filename")[0]
print("内存快照条目 > 0:", len(snapshot.statistics("filename")) > 0)
print("最大块至少 9000 字节:", top.size >= 9000)
print("chunks 占用约 10000 字节:", 9_000 <= sum(len(c) for c in chunks) <= 11_000)
```

```text
fib(20) = 6765 | build 结果长度: 100000
fib 被调用次数: 21891
统计条目数 >= 2: True
线性扫描到末位需要比较: 1000 次
list 版比 set 版慢 100 倍以上: True
求和结果: 41665416675000 | 耗时小于 1 秒: True
内存快照条目 > 0: True
最大块至少 9000 字节: True
chunks 占用约 10000 字节: True
```

`cProfile` 有两个局限：①它自己也消耗时间（通常 1.5～3 倍慢），所以**看比例不看绝对值**；②它只到函数粒度，看不到函数内部哪一行慢——那要用 `line_profiler`（第三方，`@profile` 装饰器）。另外 `cProfile` 不统计 C 扩展内部（numpy 的矩阵乘法会显示成一次调用），这类要换 `perf`/`py-spy` 这类采样剖析器。

## 25.7 复杂度：先量级，再常数

```pycon
>>> data = list(range(1000))
>>> target = 999
>>> ops = sum(1 for i, x in enumerate(data) if (x == target) or True)
>>> ops
1000
```

一次 `in` 检查在 list 上是 O(n)：999 在末位就要比 1000 次。换成 `set` 是 O(1) 的哈希查找——同一份数据、同一个判断，差三个数量级。**这类问题的收益远大于任何微优化**（把 `for` 改成推导式只能省 20%）。

排序与查找的常见选择：

| 需求 | 朴素做法 | 复杂度 | 正确做法 | 复杂度 |
| --- | --- | --- | --- | --- |
| 判断存在 | `x in list` | O(n) | `x in set` | O(1) |
| 多次查找 | 每次线性扫 | O(n·m) | 先建 `dict` | O(n+m) |
| 去重保序 | 手动循环 | O(n²) | `dict.fromkeys` | O(n) |
| 计数 | 两次遍历 | O(n²) | `Counter` | O(n) |
| 拼接字符串 | `s += x` 循环 | O(n²) | `"".join(parts)` | O(n) |
| 取前 k 大 | 全排序 | O(n log n) | `heapq.nlargest` | O(n log k) |

第 5 章讲过 `+=` 拼字符串的二次复杂度，这里补一句原因：`str` 不可变，每次 `+=` 都新建一个对象并复制全部旧内容，n 次就是 1+2+…+n。

## 25.8 内存：`tracemalloc`

```pycon
>>> import tracemalloc
>>> tracemalloc.start()
>>> data = [bytearray(1000) for _ in range(10)]
>>> snap = tracemalloc.take_snapshot()
>>> tracemalloc.stop()
>>> top = snap.statistics("lineno")[0]
>>> top.size >= 9_000
True
>>> isinstance(top.traceback[0].lineno, int)
True
```

`tracemalloc` 按分配点统计峰值与当前占用，是「内存为什么一直涨」的第一把工具。三步用法：`start()` → 跑可疑代码 → `take_snapshot()`，然后 `statistics("lineno")` 按行聚合、`compare_to(old, "lineno")` 看两次快照之间多了什么。

对象为什么没被回收，用 `gc` 与 `sys.getrefcount` 查：

```pycon
>>> import gc, sys
>>> gc.disable()
>>> a = []
>>> b = [a]
>>> sys.getrefcount(a) >= 2
True
>>> gc.collect() >= 0
True
>>> gc.enable()
```

引用计数是主力回收机制（对象引用归零立即释放），`gc` 只负责**循环引用**。所以「闭包持有大对象」「全局缓存永不清理」「异常对象的 traceback 持有整个栈帧」是三类最常见的内存泄漏。

## 25.9 五类性能反模式

| 反模式 | 症状 | 正确写法 |
| --- | --- | --- |
| 循环里 `s += x` 拼字符串 | 数据一多就卡死 | `"".join(parts)` |
| 循环里 `list.append` + 手工计算 | 比推导式慢 20%～40% | 列表推导式 |
| 循环里重复算不变量 | `for` 内 `len(xs)`、属性查找 | 提到循环外，或局部变量 |
| 用 `in list` 反复查存在 | O(n²) | 先转 `set`/`dict` |
| 每行都 `print` 调试 | IO 拖慢十倍 | `logging`（级别不够时零成本） |

还有一类是**测量方法错误**：用 `time.time()`、只跑一次、把准备数据算进计时、在有其他负载的机器上测。这类「假数据」比不测更糟——它会让你去优化一个根本不热的地方。

## 25.a 与 C++ 的差别

| 维度 | Python | C++ |
| --- | --- | --- |
| 调试器 | `pdb`/`breakpoint()`，源码级 | `gdb`/`lldb`，可看寄存器与内存 |
| 崩溃现场 | traceback 带源码行（若有 .py） | core dump + 符号表 |
| 断言 | `assert`（`-O` 可移除） | `assert`（`NDEBUG` 移除）+ `static_assert` |
| 性能剖析 | `cProfile`（函数级）、`line_profiler` | `perf`、`valgrind --tool=callgrind`、VTune |
| 采样剖析 | `py-spy`（可附到运行中进程） | `perf record` |
| 内存工具 | `tracemalloc`、`gc`、`objgraph` | Valgrind、ASan、Massif |
| 优化手段 | 换算法/数据结构、C 扩展、numpy、PyPy | 编译选项、内联、SIMD、缓存友好布局 |
| 优化上限 | 常数级提升几倍，算法级差数量级 | 常数级也能差 10 倍以上（缓存/向量化） |
| 计时精度 | `perf_counter` 纳秒级 | `chrono::steady_clock` |

最本质的差别：C++ 的性能问题常常在**指令级**（缓存未命中、分支预测、虚函数开销），Python 的性能问题几乎总在**算法与对象创建**上。所以 Python 优化的第一步永远是「换数据结构/换算法」，最后才是「换成 C 扩展」。而 Python 的调试优势是**不需要重新编译**：改一行、重跑、断点即到。

## 25.b 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 只看 traceback 第一段，找不到出错行 | 方向读反了 | 从**最后一段**往上看 |
| `print(f"错误: {e}")` 只打印了键名 | `KeyError` 的 `str` 就是键 | 自己补上下文：`f"缺少 {key!r}"` |
| 加了 `-O` 后参数校验失效 | `assert` 被整体删除 | 输入校验用 `if ... raise` |
| 断点不生效 | `breakpoint()` 在未执行的分支里 | 用条件断点或确认那行真的跑了 |
| `pdb` 里 `q` 直接退出整个程序 | `quit` 就是中止 | 用 `c` 继续，或 `disable` 断点 |
| 计时结果每次都不一样 | 用了 `time.time()` + 单次测量 | `timeit` + `perf_counter` |
| 优化后反而更慢 | 优化了不热的 5% | 先 `cProfile` 排序再动手 |
| `cProfile` 显示某函数耗时巨大 | 那是 `cumtime`，含子调用 | 看 `tottime` 列 |
| 内存一直涨但找不到分配点 | 没有快照对比 | `tracemalloc` 两次快照 `compare_to` |
| 日志在生产里把磁盘写满 | `DEBUG` 级别留在配置里 | 用环境变量控制级别 |
| 警告刷屏后没人看 | 没分类、没升级 | 测试里 `-W error`，废弃用 `DeprecationWarning` |
| 生产环境不能断点 | 交互式调试器不可用 | `py-spy dump --pid` 抓栈，或加结构化日志 |

## 25.c 练习

**基础 1**：写一个三层调用的函数链，让最内层抛 `ZeroDivisionError`，在中间层用 `raise ... from e` 包装成自定义异常，最外层打印「调用链 / 根因 / 是否是显式 cause」。要求输出不含文件绝对路径。

验收：输出恰好三行，包含 `main -> middle -> inner` 形式的调用链与 `ZeroDivisionError`；把 `from e` 改成 `from None` 后根因行消失。

**基础 2**：用 `timeit` 比较 `"".join(str(i) for i in range(200))` 与循环 `+=` 拼接的耗时，断言前者至少快 2 倍，并打印两种写法在 n=200 时的操作次数（提示：`+=` 的复制次数是 1+2+…+n）。

验收：比较结论稳定（多次运行都成立）；操作次数打印为 `20100`。

**基础 3**：给一段故意写慢的代码（循环里 `x in list`、循环里 `s += c`）做剖析，用 `pstats.sort_stats("tottime")` 打印前 5 行，指出热点函数名。

验收：能打印出热点函数名与其 `ncalls`；改造后同一基准的相对耗时下降（断言「改造后比改造前快 5 倍以上」）。

**变式**：用 `tracemalloc` 对比两个版本的峰值内存：一个把 10 万个 int 存进 `list`，一个存进 `array("i")`，打印两者的峰值字节数与自己计算的比值。

验收：两个 `peak` 都能打印出来且 `list` 版本明显更大；比值断言成立（提示：int 对象约 28 字节 + 指针 8 字节）。

**挑战**：写一个 `debug_report(obj)` 函数，不依赖交互式调试器，输出：`repr`、`type`、`dir` 过滤后的公共属性、`sys.getsizeof`、以及若为容器时的元素类型统计；用它诊断一个「看起来是 list 其实是 list of list」的嵌套错误。

验收：对 `[[1, 2], [3]]` 能指出「元素类型是 list，深度 2」；对 `[1, 2]` 输出深度 1；输出行数固定、不含内存地址。

## 25.d 小结

1. traceback 从**最后一段**读起：异常类型 → 出错帧 → 调用链；`from e` 造出的 `__cause__` 是根因，`__context__` 是自动上下文。
2. 调试三件套替掉 `print`：`assert` 守不变量、`logging` 留可关闭的痕迹、`breakpoint()` 一次看全部局部变量。
3. 性能先量级后常数：`cProfile` 按 `tottime` 排序找热点、`timeit` 做相对比较、`tracemalloc` 找内存增长点；换数据结构通常比任何微优化收益大一个数量级。

下一章把前面所有内容收成一份清单：新手在 Python 里最常踩的坑，每一条都给出「症状 → 原因 → 改法」，可以直接当自查表用。
