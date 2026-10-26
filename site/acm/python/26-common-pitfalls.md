# 26 · 新手常见坑

> **本质**：Python 的坑几乎都来自三个设计决定——**名字绑定对象**（不是持有值）、**默认参数只求值一次**、**一切在运行时才检查**。把这三条记牢，能解释掉这一章九成的问题。

**读完这一章你能做到**

1. 在写代码的当下就认出「可变默认参数」「浅拷贝」「晚绑定」这三类陷阱，而不是等线上出错的第 3 天。
2. 说清 `is` 与 `==`、`in list` 与 `in set`、`+=` 与 `join` 的差别，并给出替换写法。
3. 不再写裸 `except:`、不再在 `try` 里吞掉异常、不再用 `finally` 里的 `return`。
4. 认出「遮蔽内置名」「模块名撞标准库」「循环导入」三类导入期问题。
5. 把本章末尾的自查表当 checklist，交付前逐条过一遍。

## 26.1 可变默认参数：默认值只算一次

函数定义时，`def` 这一行会**执行**——默认值表达式当场求值，结果挂在函数对象的 `__defaults__` 上。之后每次调用，用的是同一个对象。

```pycon
>>> def add(item, bucket=[]):
...     bucket.append(item)
...     return bucket
...
>>> add("a")
['a']
>>> add("b")
['a', 'b']
>>> add.__defaults__
(['a', 'b'],)
```

`add("a")` 与 `add("b")` 之间没有任何其它调用，`bucket` 却记住了上一次的内容。原因就在 `add.__defaults__`：那个 `[]` 是**一个**列表，两次调用都拿到它。这类 bug 特别难查，因为「函数有状态」这件事从调用点完全看不出来。

```pycon
>>> def add_ok(item, bucket=None):
...     if bucket is None:
...         bucket = []
...     bucket.append(item)
...     return bucket
...
>>> add_ok("a"), add_ok("b")
(['a'], ['b'])
>>> add_ok.__defaults__
(None,)
```

**规则**：默认值只能是不可变对象（`int`、`str`、`None`、`tuple`、`frozenset`）。需要容器就用 `None` 哨兵，或者在 `dataclass` 里用 `field(default_factory=list)`（第 18 章）。

```python
# 示例：examples/ch26_01_mutable_default.py


def add_item_bad(item, bucket=[]):
    bucket.append(item)
    return bucket


def add_item_ok(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket


print("默认参数只在定义时求值一次，所以两次调用共用同一个列表：")
print(" 第 1 次:", add_item_bad("a"))
print(" 第 2 次:", add_item_bad("b"))
print(" 默认值就存在函数对象上:", add_item_bad.__defaults__)

print()
print("None 哨兵版每调用一次新建一个：")
print(" 第 1 次:", add_item_ok("a"))
print(" 第 2 次:", add_item_ok("b"))

print()
rows = [[0] * 2] * 2          # 外层 tuple 重复的是同一个 list 的引用
rows[0][0] = 9
print("[[0]*2]*2 只改一格:", rows)

grid = [[0] * 2 for _ in range(2)]
grid[0][0] = 9
print("推导式版本只改一格:", grid)

print()
a = [1, 2]
b = a
b.append(3)
print("b = a 之后改 b，a 也变了:", a, "| 是同一对象:", a is b)
c = a[:]
c.append(4)
print("a[:] 拷贝后改 c，a 不变:", a, c)
```

```text
默认参数只在定义时求值一次，所以两次调用共用同一个列表：
 第 1 次: ['a']
 第 2 次: ['a', 'b']
 默认值就存在函数对象上: (['a', 'b'],)

None 哨兵版每调用一次新建一个：
 第 1 次: ['a']
 第 2 次: ['b']

[[0]*2]*2 只改一格: [[9, 0], [9, 0]]
推导式版本只改一格: [[9, 0], [0, 0]]

b = a 之后改 b，a 也变了: [1, 2, 3] | 是同一对象: True
a[:] 拷贝后改 c，a 不变: [1, 2, 3] [1, 2, 3, 4]
```

> **⚠️ 易错**：`bucket=[]` 的写法不会报错、不会警告，甚至在测试里也常常"刚好"通过——因为多数测试只调一次。它只在**同一进程内多次调用**时暴露，而线上服务恰好就是这种环境。

## 26.2 别名与浅拷贝：改一个，两个都变

赋值 `b = a` 从不复制对象，它只是让 `b` 指向 `a` 指向的那个对象。要复制才用 `copy.copy`/`a[:]`/`list(a)`。

```pycon
>>> a = [1, 2]
>>> b = a
>>> b.append(3)
>>> a
[1, 2, 3]
>>> a is b
True
>>> c = a[:]
>>> c.append(4)
>>> a
[1, 2, 3]
```

浅拷贝只复制**第一层**。嵌套结构里，内层元素仍是共享的：

```pycon
>>> import copy
>>> a = [[1, 2]]
>>> b = copy.copy(a)
>>> b.append("新元素")
>>> a
[[1, 2]]
>>> b[0].append(9)
>>> a
[[1, 2, 9]]
>>> c = copy.deepcopy(a)
>>> c[0].append(99)
>>> a
[[1, 2, 9]]
```

`b.append` 只动外层，`a` 不受影响；`b[0].append` 动的是共享的内层列表，`a` 跟着变。`deepcopy` 才逐层复制。

矩阵初始化是同一个坑的高频变体：

```pycon
>>> rows = [[0] * 2] * 2
>>> rows[0][0] = 9
>>> rows
[[9, 0], [9, 0]]
>>> grid = [[0] * 2 for _ in range(2)]
>>> grid[0][0] = 9
>>> grid
[[9, 0], [0, 0]]
```

`[...] * 2` 重复的是**引用**。把外层换成推导式就没事，因为有 2 次独立的 `[0] * 2`。同理，`[[]] * 3`、`"abc".split()` 之后 `[x] * n` 都要警惕。

> **💡 提示**：判断「这次赋值是否安全」只需要问一句：右边是**不可变对象**吗？`int`/`str`/`tuple`（且元素全不可变）/`frozenset` 可以随便共享；`list`/`dict`/`set`/自定义类实例一律当作"共享"对待，需要独立副本就显式复制。

## 26.3 `is` 比的是身份，不是值

```pycon
>>> a = int("1000")
>>> b = int("1000")
>>> a == b, a is b
(True, False)
>>> int("256") is int("256")
True
>>> [] is []
False
>>> None is None
True
```

`is` 判断「是不是同一块内存」，`==` 判断「值是否相等」。`int("256") is int("256")` 为 `True` 是因为 CPython 缓存了 -5～256 的小整数（`[]` 每次新建，所以 `False`）。这个缓存是实现细节，**不能依赖**：`int("1000") is int("1000")` 就是 `False`。

唯一该用 `is` 的地方：

| 场景 | 写法 | 为什么 |
| --- | --- | --- |
| 判 `None` | `x is None` | `None` 是单例，`==` 可能被自定义 `__eq__` 干扰 |
| 判 `True`/`False` | `if flag:` 而不是 `if flag is True:` | 前者接受所有真值 |
| 判哨兵对象 | `if arg is _MISSING:` | 哨兵是独一无二的 |
| 判类型 | `isinstance(x, C)` | 别用 `type(x) is C`（漏子类） |

## 26.4 边遍历边改容器

```pycon
>>> nums = [1, 2, 2, 3, 2, 4]
>>> bad = nums[:]
>>> for x in bad:
...     if x == 2:
...         bad.remove(x)
...
>>> bad
[1, 3, 2, 4]
```

本该删掉三个 2，结果只删了两个。`for` 内部靠索引推进，删元素让后面的元素整体前移，索引照样 +1，于是跳过了一个。这类 bug 的结果依赖数据排列，同样的代码在不同输入下有时"正确"。

`dict` 更直接，改大小就抛异常：

```pycon
>>> d = {"a": 1}
>>> try:
...     for k in d:
...         d[k + "2"] = 2
... except RuntimeError as e:
...     print(type(e).__name__ + ":", e)
RuntimeError: dictionary changed size during iteration
```

三种正确写法：

```text
# 推导式：只读原表，产新表
evens = [x for x in nums if x != 2]

# 遍历副本：要原地改原表时
for x in nums[:]:
    if x == 2:
        nums.remove(x)

# 倒序遍历：按下标删时
for i in range(len(nums) - 1, -1, -1):
    if nums[i] == 2:
        del nums[i]
```

对 `dict`/`set`，一律 `for k in list(d):` 或 `for k in sorted(d):`——后者顺便让输出顺序稳定。

```python
# 示例：examples/ch26_02_loop_mutation.py

nums = [1, 2, 2, 3, 2, 4]

bad = nums[:]
for x in bad:
    if x == 2:
        bad.remove(x)
print("边遍历边删（漏删）:", bad)

good = [x for x in nums if x != 2]
print("推导式过滤      :", good)

good2 = nums[:]
for x in nums[:]:              # 遍历副本，改原列表
    if x == 2:
        good2.remove(x)
print("遍历副本        :", good2)

print()
d = {"a": 1, "b": 2}
try:
    for k in d:
        d[k + "!"] = 0        # 边遍历边插入
except RuntimeError as e:
    print("遍历中改 dict 大小:", type(e).__name__ + ":", e)
print("遍历 list(d) 可行  :", sorted(k + "!" for k in list(d)))

print()
for i in range(3):
    pass
print("for 结束后 i 还在:", i)

handlers = [lambda: i for _ in range(3)]
print("lambda 晚绑定     :", [h() for h in handlers])
fixed = [lambda i=i: i for i in range(3)]
print("默认参数固定值    :", [f() for f in fixed])
```

```text
边遍历边删（漏删）: [1, 3, 2, 4]
推导式过滤      : [1, 3, 4]
遍历副本        : [1, 3, 4]

遍历中改 dict 大小: RuntimeError: dictionary changed size during iteration
遍历 list(d) 可行  : ['a!', 'a!!', 'b!']

for 结束后 i 还在: 2
lambda 晚绑定     : [2, 2, 2]
默认参数固定值    : [0, 1, 2]
```

## 26.5 晚绑定：lambda 与闭包记住的是变量

```pycon
>>> fs = [lambda: i for i in range(3)]
>>> [f() for f in fs]
[2, 2, 2]
>>> fs = [lambda i=i: i for i in range(3)]
>>> [f() for f in fs]
[0, 1, 2]
```

`lambda: i` 里的 `i` 是**自由变量**，闭包捕获的是单元格（cell）而不是当时的值。等三个 lambda 都被调用时，循环早已结束，`i` 停在 `2`。用默认参数 `i=i` 把值在**定义时**固定下来，是最简洁的修法（第 11 章还有 `partial` 与工厂函数两种）。

同一个机制还带来「循环变量泄漏」：

```pycon
>>> for i in range(3):
...     pass
...
>>> i
2
```

`for` 不创建作用域，循环结束后 `i` 依然存在并保留最后一个值。C++ 里 `for (int i = 0; ...)` 的 `i` 出了循环就没了，这里不会。三个后果要留意：①`i` 可能覆盖外层的同名变量；②在函数里，`i` 若在循环前被引用会触发 `UnboundLocalError`（第 14 章）；③推导式**不会**泄漏（它有独立作用域），所以 `[i for i in range(3)]` 之后 `i` 不变。

## 26.6 异常处理的四种错法

**错法一：裸 `except:`**。它连 `KeyboardInterrupt`、`SystemExit` 都接，Ctrl+C 都停不下来：

```pycon
>>> issubclass(KeyboardInterrupt, Exception)
False
>>> try:
...     raise KeyboardInterrupt
... except Exception as e:
...     print("这个分支接不到")
... except BaseException as e:
...     print("只有 BaseException 能接:", type(e).__name__)
只有 BaseException 能接: KeyboardInterrupt
```

第一行 `False` 就是根因：`KeyboardInterrupt` 直接继承 `BaseException`，跟 `Exception` 是兄弟。所以 `except Exception` 分支完全不执行。**至少写 `except Exception:`**，需要放行 Ctrl+C 就只能这样；写裸 `except:` 等于连「用户要中断」都当成正常流程。

**错法二：`except` 写多个类型不用元组**。`except A or B:` 根本不是"或"：

```pycon
>>> try:
...     [][0]
... except KeyError or IndexError as e:
...     print("这个分支不会执行")
... except IndexError as e:
...     print("实际由第二个分支接住:", type(e).__name__)
实际由第二个分支接住: IndexError
```

`KeyError or IndexError` 先求值成 `KeyError`（类对象为真），所以第一个分支等价于 `except KeyError`。正确写法是元组：`except (KeyError, IndexError) as e:`。

**错法三：`pass` 吞掉一切**。`except Exception: pass` 会让「文件不存在」和「解析失败」看起来一模一样，排查从 5 分钟变成 5 小时。要忽略也必须留下证据：`logging.warning("跳过 %s: %s", path, e)`。

**错法四：`finally` 里 `return`**。它会把正在传播的异常直接吃掉：

```pycon
>>> def f():
...     try:
...         raise ValueError("这个异常会消失")
...     finally:
...         return "finally 的 return 赢了"
...
>>> f()
'finally 的 return 赢了'
```

（3.12 起，解释器会在编译这句时发一条 `SyntaxWarning: 'return' in a 'finally' block`——官方的态度很明确：这不是"风格问题"，是要吞异常的写法。）

`finally` 的 `return`/`break`/`continue` 会**丢弃**异常与返回值。同类问题还有「`except` 里 `return` 之后 `finally` 又改返回值」。规矩：`finally` 只做清理，不做控制流。

## 26.7 资源、路径与编码

**不关文件**。`open()` 不配 `with`，写缓冲可能不落盘，Windows 上还删不掉文件：

```pycon
>>> import shutil, tempfile
>>> from pathlib import Path
>>> work = Path(tempfile.mkdtemp())          # 只在这里造临时文件，不污染当前目录
>>> f = (work / "demo.txt").open("w", encoding="utf-8")
>>> _ = f.write("内容")
>>> f.closed
False
>>> f.close()
>>> f.closed
True
>>> with (work / "demo.txt").open("w", encoding="utf-8") as g:
...     _ = g.write("内容")
...
>>> g.closed
True
>>> shutil.rmtree(work)
```

而且一旦 `write` 抛异常，`close` 就永远不执行。`with open(...) as f:` 保证离开代码块时关闭，异常时也关。

**相对路径依赖当前工作目录**。`open("data.csv")` 找的是 `os.getcwd()`，不是脚本所在目录。双击运行 vs 命令行运行 vs 被别处 import，cwd 全都不同，这就是"在我机器上好好的"的经典来源。用 `Path(__file__).resolve().parent / "data.csv"` 定位脚本旁的资源（第 17 章）。

**反斜杠是转义符**。`"C:\new\table.txt"` 里的 `\n` 是换行、`\t` 是制表符：

```pycon
>>> len("C:\new\table.txt"), len(r"C:\new\table.txt")
(14, 16)
>>> print("C:\temp")
C:	emp
```

同一个路径，`\n` 和 `\t` 各占**一个**字符，所以长度少了 2；看起来像 `C:\new\table.txt` 的字符串，实际是 `C:` + 换行 + `ew` + 制表符 + `able.txt`。

写路径永远用：原始字符串 `r"C:\new"`、正斜杠 `"C:/new"`，或者 `pathlib.Path`。第三种最好，因为它在 Windows 上也能正确拼。

**编码不写死**。`open()` 不写 `encoding=` 时用**平台默认**（中文 Windows 是 GBK，Linux 是 UTF-8）。同一份代码在两台机器上行为不同，读别人的 UTF-8 文件就 `UnicodeDecodeError`。规矩：文本 IO 永远显式 `encoding="utf-8"`。

## 26.8 名字与导入

**遮蔽内置名**。`list = [...]`、`sum = 0`、`id = 1`、`type = "x"` 都会让后面的内置函数失效：

```pycon
>>> sum = 0
>>> for i in (1, 2, 3):
...     sum += i
...
>>> sum
6
>>> try:
...     sum([1, 2])
... except TypeError as e:
...     print(type(e).__name__ + ":", e)
TypeError: 'int' object is not callable
```

错误信息 `'int' object is not callable` 完全没提"你把 sum 覆盖了"，所以这类 bug 特别费时间。约定：`lst`、`total`、`idx`、`kind` 之类加后缀，绝不用内置名当变量名（第 3 章命名约定表）。

**模块名撞标准库**。自己建 `random.py`、`json.py`、`types.py`、`email.py`，同目录下 `import random` 会导入你自己的文件，然后 `random.randint` 报 `AttributeError`——因为标准库被顶掉了。表现是"标准库坏了"，根因是文件名。

**`from m import *`**。它把 `m` 里所有不以 `_` 开头的名字倒进当前命名空间，两个模块都导出 `process` 时后者静默覆盖前者，且看不出是谁。只用显式导入；包作者该用 `__all__` 明确导出面（第 19 章）。

**循环导入**。`a.py` 开头 `import b`、`b.py` 开头 `import a`，谁先被导入谁就拿到"半成品"模块，典型报错是 `cannot import name 'X' from partially initialized module 'a' (most likely due to a circular import)`。修法：把共享部分抽到第三个模块；或把 `import` 挪进函数体内延迟到调用时；或用 `import a` 而不是 `from a import X`（前者只绑模块名，晚一点取属性仍然可行）。

## 26.9 数字与字符串

```pycon
>>> 0.1 + 0.2 == 0.3
False
>>> round(0.1 + 0.2, 10) == 0.3
True
>>> 7 / 2, 7 // 2
(3.5, 3)
>>> try:
...     "3" + 3
... except TypeError as e:
...     print(type(e).__name__ + ":", e)
TypeError: can only concatenate str (not "int") to str
>>> "3" * 3
'333'
```

四个高频点：

- **浮点别用 `==`**。用 `math.isclose(a, b, rel_tol=1e-9)` 或比较差值；金额用 `Decimal`（第 3 章）。
- **`/` 永远返回 `float`**。`4 / 2` 是 `2.0` 不是 `2`；需要整数用 `//`，需要"真除法但取整"用 `int(a / b)` 时要留意负数方向（`int(-3.5) == -3`，而 `-7 // 2 == -4`）。
- **`+` 不隐式转类型**。C++ 里 `"a" + 1` 编译不过，Python 里 `"3" + 3` 运行时抛 `TypeError`。要么 `str(3)`，要么 f-string。
- **`*` 对字符串是重复**。`"3" * 3` 是 `'333'`，不是 `9`；`[0] * 3` 是 `[0, 0, 0]`。想数学乘就先把类型转对。

还有三个字符串方法误用：`strip("ab")` 删的是**字符集合** `{a, b}` 而不是子串 `"ab"`；`s.replace` 返回新串（`str` 不可变，原地改无效）；`split()` 不带参数按任意空白切并丢空串，`split(" ")` 会在连续空格处产生空串。判空用 `if not s.strip():`，判"包含子串"用 `in`，判前后缀用 `startswith`/`endswith`。

```python
# 示例：examples/ch26_03_traps.py

print("== 与 is:")
a = int("1000")
b = int("1000")
print(" 值相等:", a == b, "| 是同一对象:", a is b)
print(" 小整数被缓存:", int("256") is int("256"))

print()
print("字符串组合判断:")
role = "guest"
print(" 错误写法 role == 'admin' or 'root' ->", repr(role == "admin" or "root"))
print(" 正确写法 role in ('admin', 'root') ->", repr(role in ("admin", "root")))

print()
print("strip 的语义:")
print(" 只去两端空白:", repr("  a b  ".strip()))
print(" 参数是字符集合:", repr("xyhxy".strip("xy")))

print()
print("浮点比较:")
print(" 0.1 + 0.2 == 0.3 ->", 0.1 + 0.2 == 0.3)
print(" 实际误差:", repr(0.1 + 0.2 - 0.3))

print()
print("除法:")
print(" 7 / 2  =", 7 / 2, "| 类型", type(7 / 2).__name__)
print(" 7 // 2 =", 7 // 2, "| 类型", type(7 // 2).__name__)

print()
print("遮蔽内置名:")
lst = list
list = [1, 2, 3]
try:
    list("abc")
except TypeError as e:
    print(" 遮蔽后调不动:", e)
list = lst
print(" 恢复后:", list("abc"))

print()
print("隐式字符串拼接:")
print(" 相邻字面量自动连:", repr("abc" "def"))
print(" 混合元组需要逗号:", ("abc" "def", "x"))
```

```text
== 与 is:
 值相等: True | 是同一对象: False
 小整数被缓存: True

字符串组合判断:
 错误写法 role == 'admin' or 'root' -> 'root'
 正确写法 role in ('admin', 'root') -> False

strip 的语义:
 只去两端空白: 'a b'
 参数是字符集合: 'h'

浮点比较:
 0.1 + 0.2 == 0.3 -> False
 实际误差: 5.551115123125783e-17

除法:
 7 / 2  = 3.5 | 类型 float
 7 // 2 = 3 | 类型 int

遮蔽内置名:
 遮蔽后调不动: 'list' object is not callable
 恢复后: ['a', 'b', 'c']

隐式字符串拼接:
 相邻字面量自动连: 'abcdef'
 混合元组需要逗号: ('abcdef', 'x')
```

## 26.10 性能上的三个直觉错误

| 直觉 | 实际 | 正确做法 |
| --- | --- | --- |
| `s += x` 拼接很快 | 每次新建字符串，O(n²) | `"".join(parts)` |
| `in list` 和 `in set` 差不多 | O(n) vs O(1)，n=10⁵ 差万倍 | 先转 `set`/`dict` |
| 循环里少写一行就能快 | 函数调用与属性查找才是大头 | 把 `len()`、`obj.attr` 提到循环外 |

```pycon
>>> import timeit
>>> slow = min(timeit.repeat("s = ''\nfor i in range(3000): s += 'x'", number=1, repeat=3))
>>> fast = min(timeit.repeat("''.join(['x'] * 3000)", number=1, repeat=3))
>>> fast < slow
True
>>> import math
>>> math.isclose(1e16 + 1, 1e16)
True
```

同样拼出 3000 个字符，`+=` 循环比 `join` 慢一个数量级以上（本机约 20 倍，具体数字不写死，只断言方向）。`math.isclose` 那一行是另一个坑的反面：`1e16 + 1 == 1e16` 在浮点里成立，因为 `1e16` 附近的精度间隔已经是 2。

还有一个反向坑：**过早优化**。把清晰的推导式改成手工 `append` 循环只省 20%，却让代码难读；而把 `in list` 换成 `in set` 能省 99.9%。先量级、后常数（第 25 章）。

## 26.a 与 C++ 的差别

| 现象 | C++ | Python |
| --- | --- | --- |
| 变量赋值 | 按值复制（或显式引用） | 只绑名字，改的是同一个对象 |
| 默认参数 | 每次调用重新求值 | **定义时求值一次**，共享同一对象 |
| `is`/`==` | 指针比较 / `operator==` | 身份比较 / 值比较，两者语义完全不同 |
| 循环变量作用域 | 循环结束即销毁 | 泄漏到函数体，循环后仍可用 |
| lambda 捕获 | `[=]` 按值、`[&]` 按引用，显式 | 闭包默认按**变量**捕获（晚绑定） |
| 遍历中修改容器 | 迭代器失效，UB | list 静默跳过，dict 抛 `RuntimeError` |
| 类型检查 | 编译期，错误无法通过 | 运行时，只在实际执行到那行时报错 |
| 整数除法 | `/` 截断，`%` 符号随被除数 | `/` 浮点，`//` 向下取整，`%` 符号随除数 |
| 导入 | `#include` 文本复制 | 模块对象 + `sys.modules` 缓存，可循环导入出问题 |
| 名字遮蔽 | 局部作用域可遮蔽，易发现 | 变量能遮蔽内置函数，报错信息不提示根因 |

最本质的一条：C++ 的多数坑在**编译期**被拦下（类型不匹配、未声明、迭代器失效有 UB 但至少不静默），Python 的坑在**运行时**才表现，而且常常不报错——它给你一个错的结果。所以 Python 更需要测试，也更需要把这份自查表当真。

## 26.b 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 函数调用结果一次比一次长 | 默认参数是 `[]`/`{}`，定义时只建一次 | 改 `None` 哨兵或 `default_factory` |
| 改了 b，a 也变了 | 赋值只绑名字，没复制 | `b = a[:]` / `copy.copy` / `deepcopy` |
| 嵌套列表改一处全变 | `[[0]*n]*m` 共享内层 | `[[0]*n for _ in range(m)]` |
| `x is 1000` 时对时错 | `is` 比身份，小整数有缓存 | 比值用 `==`，判 `None` 才用 `is` |
| 循环里删元素删不干净 | 索引推进 + 元素前移，跳过 | 推导式重建 / 遍历副本 / 倒序删 |
| 遍历 dict 时插入报 `RuntimeError` | 迭代中改变了大小 | `for k in list(d):` |
| 三个 lambda 全返回同一个值 | 闭包晚绑定，捕获的是变量 | `lambda i=i: i` 或 `partial` |
| 循环后变量还在，覆盖了外层 | `for` 不建作用域 | 换名字，或在函数内用 |
| Ctrl+C 停不下程序 | 裸 `except:` 接了 `BaseException` | 至少 `except Exception:` |
| `except A or B` 只抓到 A | 先求值成 `A`，不是元组 | `except (A, B) as e:` |
| 异常莫名消失 | `finally` 里的 `return` 吞掉 | `finally` 只做清理 |
| 写出的文件是乱码 | `open` 用了平台默认编码 | `encoding="utf-8"` |
| 脚本单独跑正常，被 import 就找不到文件 | 相对路径依赖 cwd | `Path(__file__).parent / ...` |
| 路径里的 `\n` `\t` 变成换行制表符 | 反斜杠转义 | 原始串 `r"C:\new"` 或 `pathlib` |
| `'int' object is not callable` | 变量遮蔽了内置名 | 改名，别用 `sum`/`list`/`id` |
| `import random` 后属性不存在 | 同目录有同名 `random.py` | 重命名自己的模块 |
| `cannot import name ... partially initialized` | 循环导入 | 抽公共模块 / 延迟导入 |
| `0.1 + 0.2 != 0.3` | 二进制浮点表示 | `math.isclose` 或 `Decimal` |
| `"3" + 3` 抛 `TypeError` | 无隐式类型转换 | `str(3)` 或 f-string |
| 数据一大就卡 | `+=` 拼串 / `in list` | `join` / 转 `set` |

## 26.c 练习

**基础 1**：写一个 `History` 类，`add(x)` 追加并返回当前全部记录，默认构造不共享状态；再用两个实例互相验证。然后故意把它改成 `def __init__(self, items=[])`，跑同一个验证脚本，把失败现象记录成一行注释（不要求保留错误版本）。

验收：`History().add(1)` 后再 `History().add(2)` 返回 `[2]`；错误版本返回 `[1, 2]`，且注释里写清"默认参数在定义时求值"。

**基础 2**：给定 `nums = [1, 2, 2, 3, 2, 4]`，用三种写法（推导式、遍历副本、倒序 del）各删掉所有 `2`，断言三者结果都是 `[1, 3, 4]`，并打印"边遍历边删"的错误结果作对照。

验收：三种正确结果一致；错误版本打印 `[1, 3, 2, 4]`。

**基础 3**：写一个 `safe_int(text, default=None)`：`text` 不是整数时返回 `default`，并 `logging.warning` 记录原文；`text` 为 `None` 时抛 `TypeError`（因为那是调用方的 bug，不该被吞）。三条断言覆盖三种输入。

验收：`safe_int("12") == 12`、`safe_int("x", 0) == 0` 且有 warning 记录、`safe_int(None)` 抛 `TypeError`。

**变式**：把 26.5 的三个 lambda 修好，用三种方式各写一遍（默认参数、`functools.partial`、工厂函数），断言三者都返回 `[0, 1, 2]`。

验收：三个版本的输出完全一致；任一版本里 `lambda` 体内都不出现裸 `i` 的自由变量引用。

**挑战**：写一个 `lint(source: str) -> list[str]`，用 `ast` 静态扫出本章的四类问题：①`def` 的参数默认值是 `list`/`dict`/`set` 字面量；②`is` 与字面量比较（`1`/`"x"`/`[]`）；③`except` 处理了 `BaseException` 或裸 `except`；④`for` 循环体里对同一名字调用 `.append/.remove/.pop`。返回形如 `"第 3 行: 可变默认参数"` 的列表。

验收：对一段故意写错 4 处的源码，返回 4 条且行号正确；对一段正确代码返回空列表。

## 26.d 小结

1. 三类大坑同源：**名字绑定对象**（别名、浅拷贝）、**定义时求值一次**（默认参数、lambda 闭包）、**运行时才查**（类型、导入、遍历中改容器）。
2. 判断赋值是否安全只问一句"右边可变吗"；判断闭包是否安全只看"捕获的是值还是变量"；判断异常处理是否安全只看"`except` 有没有窄到具体类型"。
3. 性能与正确性的优先级永远是：先换数据结构与算法（数量级），再改常数（20%），最后才谈微优化；`timeit` 与 `cProfile` 是唯一可信的裁判。

到这里 26 章正文结束。这套内容从「解释器怎么跑一行代码」讲到「怎么不踩坑」，每一章的示例都能直接运行、输出都是实测。接下来请读 `00-guide.md` 的学习路线，按周推进；写完每章练习后回到对应章节的"易错点清单"逐条自测，通过后再进下一章。
