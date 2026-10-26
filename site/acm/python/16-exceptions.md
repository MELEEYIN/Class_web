# 16 · 异常处理

> **本质**：异常是 Python **唯一的错误传递机制**——没有错误码、没有 `errno` 返回值。`raise` 沿调用栈向上抛，`try/except` 在某一层截住它。`finally` 无论走哪条路都执行，`else` 只在 `try` 体没有抛异常时执行。一个 `except` 分支被触发后，**它上面已经被跳过的语句不会重跑**。

**读完这一章你能做到**

- 画出任意 `try/except/else/finally` 组合的执行顺序；
- 用经典的异常类层次写出清晰的 `except` 分支（窄前宽后）；
- 定义带结构化数据的自定义异常，用 `raise ... from e` 保留因果链；
- 解释为什么 `except Exception: pass` 是最糟糕的写法，以及 `finally` 里 `return` 的危险；
- 在 LBYL 与 EAFP 之间做出有理由的选择。

---

## 16.1 四个关键字的执行顺序

```python
# 示例：examples/ch16_01_basics.py
"""ch16_01_basics.py —— try/except/else/finally 的执行顺序"""


def step(name):
    print("  [执行]", name)


print("=== 无异常时：try -> else -> finally ===")
try:
    step("try")
except ValueError:
    step("except")
else:
    step("else：没有异常")
finally:
    step("finally")

print("=== 有异常时：try 中断 -> except -> finally（else 跳过） ===")
try:
    step("try")
    raise ValueError("出事了")
except ValueError as e:
    step(f"except 捕获 {e}")
else:
    step("else：不会执行")
finally:
    step("finally")

print("=== 多个 except：只匹配第一个能接住的 ===")
for exc in (ValueError("值错"), KeyError("缺键"), TypeError("类型错")):
    try:
        raise exc
    except (ValueError, KeyError) as e:
        print(f"  {type(e).__name__} 被元组分支接住：{e}")
    except TypeError as e:
        print(f"  {type(e).__name__} 被单独分支接住：{e}")

print("=== 顺序很重要：宽的先写会吞掉窄的 ===")
try:
    raise KeyError("具体错误")
except Exception as e:
    print("  宽泛分支先接住：", type(e).__name__)

print("=== 未被捕获的异常会继续往上抛 ===")


def inner():
    raise RuntimeError("内层炸了")


def outer():
    try:
        inner()
    except ValueError:
        print("  接不住 RuntimeError")
    finally:
        print("  finally 仍然执行")


try:
    outer()
except RuntimeError as e:
    print("  最外层接住：", e)

print("=== except 里的 as 变量在块结束后被删除 ===")
try:
    raise ValueError("测试")
except ValueError as err:
    print("  块内可用：", err)
try:
    print(err)
except NameError as e:
    print("  块外：NameError:", e)

print("=== 再 raise 同一个异常对象：traceback 会叠加 ===")


def reraise_twice():
    try:
        try:
            1 / 0
        except ZeroDivisionError as e:
            raise e
    except ZeroDivisionError as e2:
        return f"{type(e2).__name__}: {e2}"


print(reraise_twice())
```

```text
=== 无异常时：try -> else -> finally ===
  [执行] try
  [执行] else：没有异常
  [执行] finally
=== 有异常时：try 中断 -> except -> finally（else 跳过） ===
  [执行] try
  [执行] except 捕获 出事了
  [执行] finally
=== 多个 except：只匹配第一个能接住的 ===
  ValueError 被元组分支接住：值错
  KeyError 被元组分支接住：'缺键'
  TypeError 被单独分支接住：类型错
=== 顺序很重要：宽的先写会吞掉窄的 ===
  宽泛分支先接住： KeyError
=== 未被捕获的异常会继续往上抛 ===
  finally 仍然执行
  最外层接住： 内层炸了
=== except 里的 as 变量在块结束后被删除 ===
  块内可用： 测试
  块外：NameError: name 'err' is not defined
=== 再 raise 同一个异常对象：traceback 会叠加 ===
ZeroDivisionError: division by zero
```

执行顺序表：

| 情况 | try | except | else | finally |
| --- | --- | --- | --- | --- |
| 无异常 | 跑完 | 跳过 | **执行** | **执行** |
| 匹配到异常 | 中断 | **执行** | 跳过 | **执行** |
| 异常不匹配 | 中断 | 跳过 | 跳过 | **执行**，然后继续抛 |
| try 内 `return` | 中断 | — | 跳过 | **执行**（然后返回） |
| try 内 `break`/`continue` | 中断 | — | 跳过 | **执行**（然后跳出） |

四条容易忽略的细节：

1. **`else` 的价值**是把"只有成功才做的事"和 `try` 体分开，避免把 `else` 里的异常也一起捕获。典型场景：`try: data = json.loads(s)` / `except ValueError:` / `else: process(data)` —— 这样 `process` 里的 `ValueError` 不会被误当成"JSON 解析失败"。
2. **`except` 的顺序是首个匹配**。`except Exception` 写在前面，后面的分支永远轮不到——这属于**逻辑失效**而不是语法错误，最容易被忽略。
3. **`as` 变量在 `except` 块结束时被 `del`**，防止引用循环。块外再用就是 `NameError`。
4. **`raise e` 会追加一层 traceback**。想原样透传用裸 `raise`，想加信息用 `raise NewError(...) from e`。

```pycon
>>> try:
...     x = int("abc")
... except ValueError as e:
...     print("捕获：", e)
捕获： invalid literal for int() with base 10: 'abc'
>>> try:
...     {}["k"]
... except KeyError as e:
...     print("缺键：", e)
缺键： 'k'
```

注意 `KeyError` 的 `str()` 会带上引号（因为它的参数是键对象本身，`str` 走 `repr`），而 `ValueError` 的参数是字符串，`str` 直接输出。日志里看到 `'k'` 这种带引号的消息，基本就是 `KeyError`。

---

## 16.2 自定义异常与异常链

```python
# 示例：examples/ch16_02_custom.py
"""ch16_02_custom.py —— 自定义异常、raise from、assert"""


class AppError(Exception):
    """所有业务异常的基类"""


class ValidationError(AppError):
    def __init__(self, field, value):
        super().__init__(f"字段 {field} 的值 {value!r} 非法")
        self.field = field
        self.value = value


class NotFoundError(AppError):
    pass


print("=== 自定义异常可以带结构化数据 ===")
try:
    raise ValidationError("age", -1)
except AppError as e:
    print("类型：", type(e).__name__)
    print("消息：", e)
    print("附带字段：", e.field, "| 附带值：", e.value)
    print("是 AppError 的子类：", isinstance(e, AppError))
    print("也是 Exception 的子类：", isinstance(e, Exception))

print("=== 按基类捕获所有业务异常 ===")
for exc in (ValidationError("name", ""), NotFoundError("用户不存在")):
    try:
        raise exc
    except AppError as e:
        print(f"  [{type(e).__name__}] {e}")

print("=== raise from：把原因挂成 __cause__ ===")
try:
    try:
        int("abc")
    except ValueError as e:
        raise AppError("解析配置失败") from e
except AppError as e:
    print("最外层消息：", e)
    print("原因类型：", type(e.__cause__).__name__)
    print("原因消息：", e.__cause__)

print("=== 不写 from：解释器自动挂 __context__ ===")
try:
    try:
        int("abc")
    except ValueError:
        raise AppError("没写 from 的版本")
except AppError as e:
    print("__context__ 类型：", type(e.__context__).__name__)
    print("__cause__ 是：", e.__cause__)

print("=== from None：主动切断原因链 ===")
try:
    try:
        int("abc")
    except ValueError:
        raise AppError("对外只暴露这个") from None
except AppError as e:
    print("__cause__：", e.__cause__, "| __suppress_context__：", e.__suppress_context__)

print("=== assert 只在调试期可靠 ===")


def set_age(age):
    assert age >= 0, f"age 不能为负，收到 {age}"
    return age


print("合法值：", set_age(3))
try:
    set_age(-1)
except AssertionError as e:
    print("AssertionError:", e)

print("=== 异常对象可以携带任意属性 ===")
err = AppError("业务失败")
err.code = 4001
err.detail = {"retry": False}
print(err.code, err.detail)

print("=== 异常的 __str__ 与 repr ===")
print("str：", str(err))
print("repr：", repr(err))
```

```text
=== 自定义异常可以带结构化数据 ===
类型： ValidationError
消息： 字段 age 的值 -1 非法
附带字段： age | 附带值： -1
是 AppError 的子类： True
也是 Exception 的子类： True
=== 按基类捕获所有业务异常 ===
  [ValidationError] 字段 name 的值 '' 非法
  [NotFoundError] 用户不存在
=== raise from：把原因挂成 __cause__ ===
最外层消息： 解析配置失败
原因类型： ValueError
原因消息： invalid literal for int() with base 10: 'abc'
=== 不写 from：解释器自动挂 __context__ ===
__context__ 类型： ValueError
__cause__ 是： None
=== from None：主动切断原因链 ===
__cause__： None | __suppress_context__： True
=== assert 只在调试期可靠 ===
合法值： 3
AssertionError: age 不能为负，收到 -1
=== 异常对象可以携带任意属性 ===
4001 {'retry': False}
=== 异常的 __str__ 与 repr ===
str： 业务失败
repr： AppError('业务失败')
```

**异常类该怎么设计**：总是定义一个项目自己的基类（如 `AppError`），所有业务异常继承它。好处是上层可以用一个 `except AppError` 兜住所有"可预期的业务失败"，同时不会把 `KeyError`、`TypeError` 这类**真 bug** 一起吞掉。

**异常链的三条通道**：

| 写法 | `__cause__` | `__context__` | traceback 显示 |
| --- | --- | --- | --- |
| `raise B(...) from a` | 是 `a` | 是 `a` | "The above exception was the direct cause of..." |
| `raise B(...)`（在 except 内） | `None` | 是 `a` | "During handling of the above exception, another exception occurred" |
| `raise B(...) from None` | `None` | 是 `a` 但被抑制 | 只显示 `B` |

选择标准很实用：**"因为底层错了，所以业务层也失败"用 `from e`**；**"底层错误对外不暴露，换成统一错误"用 `from None`**。

`assert` 的三条限制：① 用 `python -O` 运行时**全部被移除**，所以不能拿它做输入校验；② `assert` 的第二个参数是断言失败时的消息，别写成元组（`assert x, ("a", "b")` 会抛 `AssertionError: ('a', 'b')`）；③ 生产代码做校验应该 `if not cond: raise ValueError(...)`。

> **⚠️ 易错** `err.code = 4001` 这种临时挂属性只适合小脚本。要长期维护就写进 `__init__`，否则调用方无法从类型上知道有哪些字段。

---

## 16.3 `with` 与 `finally`：资源与控制的边界

```python
# 示例：examples/ch16_03_patterns.py
"""ch16_03_patterns.py —— EAFP、with 吞异常、finally 的边界"""
import sys

print("=== LBYL 与 EAFP ===")
data = {"a": 1}
if "b" in data:
    print("LBYL 拿到：", data["b"])
else:
    print("LBYL：键不存在")

try:
    print("EAFP 拿到：", data["b"])
except KeyError as e:
    print("EAFP：KeyError", e)

print("get 的默认值更省事：", data.get("b", 0))

print("=== with 的 __exit__ 返回 True 会吞掉异常 ===")


class Swallow:
    def __enter__(self):
        print("  进入")
        return self

    def __exit__(self, exc_type, exc, tb):
        print("  退出，异常类型：", exc_type.__name__ if exc_type else None)
        return True


try:
    with Swallow():
        raise ValueError("本来会被吞掉")
    print("  with 之后的语句照常执行")
except ValueError:
    print("  不该走到这里")

print("=== __exit__ 返回 False/None，异常继续传播 ===")


class PassThrough:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        print("  清理资源，然后放行")
        return False


try:
    with PassThrough():
        raise ValueError("继续往上抛")
except ValueError as e:
    print("  外层捕获：", e)

print("=== finally 里 return 会压掉异常与返回值 ===")


def swallow_by_return():
    try:
        raise ValueError("原始异常")
    finally:
        return "finally 的返回值"


print("结果：", swallow_by_return())


def keep_value():
    try:
        return "try 的返回值"
    finally:
        print("  finally 仍然执行")


print("结果：", keep_value())

print("=== 循环里的 try/finally：continue 也会走 finally ===")
for i in range(3):
    try:
        if i == 1:
            continue
        print("  处理", i)
    finally:
        print("  finally 拿到 i =", i)

print("=== 裸 raise 重新抛出当前异常 ===")


def check(n):
    try:
        if n < 0:
            raise ValueError("不能为负")
    except ValueError:
        print("  记录日志后继续抛")
        raise


try:
    check(-1)
except ValueError as e:
    print("  外层收到：", e)

print("=== sys.exc_info() 取当前异常三元组 ===")
try:
    1 / 0
except ZeroDivisionError:
    exc_type, exc_val, exc_tb = sys.exc_info()
    print("类型：", exc_type.__name__)
    print("值：", exc_val)
    print("有 traceback 对象：", exc_tb is not None)

print("=== 别捕获 BaseException ===")
print("BaseException 的子类：", [c.__name__ for c in BaseException.__subclasses__()][:4])
print("Exception 是它的子类：", issubclass(Exception, BaseException))
```

```text
=== LBYL 与 EAFP ===
LBYL：键不存在
EAFP：KeyError 'b'
get 的默认值更省事： 0
=== with 的 __exit__ 返回 True 会吞掉异常 ===
  进入
  退出，异常类型： ValueError
  with 之后的语句照常执行
=== __exit__ 返回 False/None，异常继续传播 ===
  清理资源，然后放行
  外层捕获： 继续往上抛
=== finally 里 return 会压掉异常与返回值 ===
结果： finally 的返回值
  finally 仍然执行
结果： try 的返回值
=== 循环里的 try/finally：continue 也会走 finally ===
  处理 0
  finally 拿到 i = 0
  finally 拿到 i = 1
  处理 2
  finally 拿到 i = 2
=== 裸 raise 重新抛出当前异常 ===
  记录日志后继续抛
  外层收到： 不能为负
=== sys.exc_info() 取当前异常三元组 ===
类型： ZeroDivisionError
值： division by zero
有 traceback 对象： True
=== 别捕获 BaseException ===
BaseException 的子类： ['BaseExceptionGroup', 'Exception', 'GeneratorExit', 'KeyboardInterrupt']
Exception 是它的子类： True
```

**`with` 就是 `try/finally` 的语法糖**，但更安全：它保证 `__exit__` 一定执行，并把"是否吞掉异常"变成一个**显式契约**（返回 `True` 吞，返回假值放行）。`open()`、`threading.Lock`、数据库连接、临时目录都用它。手写 `try/finally: f.close()` 容易漏掉，`with open(...)` 不会。

**`finally` 里 `return` 是明确的坏实践**——它会把正在传播的异常**静默压掉**（示例里 `ValueError` 消失了，函数返回字符串）。同理，`finally` 里 `break`/`continue` 也会压掉异常。Python 3.14 起 `finally` 里 `break/continue/return` 会发 `SyntaxWarning`，正是为了提醒这个坑。

**LBYL vs EAFP**：Python 社区倾向 EAFP（Easier to Ask Forgiveness than Permission）——直接做，出错再处理。原因是 Python 里"检查"与"使用"之间存在时间窗口（多线程/文件被删），而且 `try` 在没有异常时几乎零开销（3.11 起零成本异常表）。但 LBYL 更易读时就用 LBYL：`if "b" in data` 比 `try/except KeyError` 更直白，而 `data.get("b", 0)` 更省事。

**永远不要 `except BaseException`**：它会把 `KeyboardInterrupt`（Ctrl+C）、`SystemExit`（`sys.exit()`）一起吞掉，导致程序无法中断、退出码错误。要兜底就捕 `Exception`。

```pycon
>>> def safe_div(a, b):
...     try:
...         return a / b
...     except ZeroDivisionError:
...         return None
...     finally:
...         print("  清理")
>>> safe_div(6, 3)
  清理
2.0
>>> safe_div(1, 0)
  清理
```

---

## 16.4 异常在多线程/异步里的行为差异

| 场景 | 异常去哪里 | 处理方式 |
| --- | --- | --- |
| 普通函数 | 调用栈向上 | `try/except` |
| 线程 `threading.Thread` | **不会传回主线程**，默认打印到 stderr | 线程函数内部自己 `try/except`，或 `Thread(..., target=wrapper)` |
| 进程池 `Pool`/`Executor` | 序列化后由 `future.result()` 重新抛出 | 必须调用 `result()` 才会触发 |
| `asyncio` 任务 | 存在 `Task` 上，未取走时在 GC 时打印"never retrieved" | `await task` 或 `task.add_done_callback` |
| `asyncio.gather` | 第一个异常默认会让整个 gather 抛出 | `return_exceptions=True` 收集 |

这条表解释了"为什么我的线程明明报错了程序却什么都没干"——线程里的异常默认只打印 traceback，不会让主进程失败。22 章会给出完整写法。

---

## 16.5 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 错误传递 | 返回码 / 异常 / `std::expected` | 只有异常（外加 `None`/`False` 约定） |
| 捕获语法 | `catch (const std::exception& e)` | `except ValueError as e` |
| 类型匹配 | 按继承，可 `catch (...)` | 按继承，`except BaseException` 才等价 `...` |
| 析构保障 | RAII | `with` / `finally` / `__del__` |
| 重新抛出 | `throw;` | 裸 `raise` |
| 未捕获异常 | `std::terminate` | 打印 traceback，进程退出码 1 |
| 性能 | 零开销（无异常时） | 3.11+ 零成本异常表，`try` 块几乎免费 |
| 检查型异常 | 无 | 无（错误全在运行期） |

C++ 程序员要改的第一个习惯：**没有"返回值判断错误"这一套**。函数要么返回结果，要么抛异常，不会同时给你一个 `-1` 和一个 `errno`。第二个习惯：**异常不是"罕见情况"**——`StopIteration`、`KeyError` 在 Python 里是日常控制流。

---

## 16.6 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 报错被吞，程序"什么都没发生" | `except Exception: pass` | 至少 `logging.exception(...)` 记录 |
| 后面的 `except` 永远不执行 | 宽泛分支写在前 | 窄的写前，宽的写后 |
| Ctrl+C 无法中断 | `except BaseException` | 捕 `Exception` |
| `NameError` 出现在 `except` 块之后 | `as` 变量已被删除 | 提前存到别的变量 |
| 异常信息看不出根因 | 没写 `from e` | `raise NewError(...) from e` |
| 函数本该抛异常却返回了值 | `finally` 里有 `return` | 把 `return` 移出 `finally` |
| `assert` 在校验输入，线上失效 | `-O` 会移除断言 | 改用 `if not ...: raise ValueError(...)` |
| 线程报错但主程序正常退出 | 线程异常不外传 | 线程内 `try/except` + 记录 |
| `json.loads` 的 `ValueError` 与业务 `ValueError` 混在一起 | `try` 范围太大 | 缩小 `try`，把处理逻辑放 `else` |
| 自定义异常没继承 `Exception` | 继承了 `BaseException` | 改成 `class X(Exception)` |

---

## 16.7 练习

**1.（顺序）** 写一个 `divide(a, b)`：`b == 0` 时抛 `ZeroDivisionError`（用 `raise`），其它情况返回商；调用方用 `try/except/else/finally` 打印四段标记，验证四段的执行顺序。

验收：成功时打印 try、else、finally 三段；失败时打印 try、except、finally 三段。

**2.（自定义异常）** 设计 `ConfigError(Exception)`、`ConfigParseError(ConfigError)`、`ConfigMissingError(ConfigError)`。写 `load_config(text)`：空文本抛 `ConfigMissingError`，非法 JSON 抛 `ConfigParseError`（`from e` 保留原始 `ValueError`）。用两段坏输入验证。

验收：两段输入分别抛出对应子类；`__cause__` 的类型是 `ValueError`；用 `except ConfigError` 能一次捕住两者。

**3.（with）** 写一个 `Timer` 上下文管理器，`__enter__` 返回自身，`__exit__` 打印"耗时 X.XX 秒"（用 `time.perf_counter()`，不要打印固定值）。再写一个 `suppress(*excs)` 上下文管理器，只吞掉指定类型的异常。

验收：`with suppress(ValueError): raise ValueError` 不报错；`with suppress(ValueError): raise KeyError` 会抛出 `KeyError`。

**4.（变式）** 下面代码哪里有问题？修好它并解释：

```text
def read_int(s):
    try:
        return int(s)
    except Exception:
        return 0
    finally:
        print("读取完成")
```

验收：指出 `except Exception` 把 `TypeError`/`MemoryError` 这类真 bug 一起吞成 `0`，并改成只捕 `ValueError`：`int(None)` 必须抛 `TypeError` 而非返回 `0`，`int("abc")` 返回 `0` 且打印一次"读取完成"。

**5.（挑战）** 用 `try/except/else/finally` + 自定义异常实现一个"批量处理 + 部分失败不中断"的函数：处理 10 条记录，坏记录收集到 `errors` 列表（含索引与异常），最后返回 `(成功数, errors)`，并保证无论成败都打印汇总。

验收：10 条里 3 条坏时返回 `(7, [...])`，`errors` 里每项包含索引与异常消息，汇总打印一次。

---

## 16.8 小结

1. **`try` 无异常走 `else` 再走 `finally`**；有异常则走 `except` 再走 `finally`；不匹配就带着 `finally` 继续往上抛。
2. **窄异常在前、宽异常在后**，自定义异常都继承项目基类，跨层用 `raise ... from e` 保留因果。
3. **`finally` 里不 `return`/`break`**；资源交给 `with`；兜底只捕 `Exception`，绝不捕 `BaseException`。

程序的另一大副作用来源是磁盘：下一章讲文件 IO 与 `pathlib`——编码为什么会炸、`with` 为什么必须写、`os.path` 与 `pathlib.Path` 该用哪个。
