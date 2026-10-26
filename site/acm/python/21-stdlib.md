# 21 · 常用标准库

> **本质**：标准库是「装机自带的一套小工具」——`json`、`re`、`datetime`、`collections` 这些模块解决的问题，每个项目都要重写一遍，所以 Python 直接把答案放进了解释器发行包里，`import` 即用，无需 pip。

**读完这一章你能做到**

1. 拿到需求先想「标准库里有没有」，而不是先装第三方包。
2. 用 `json` 在字符串与数据结构间往返，并说得清 `ensure_ascii` 与错误位置。
3. 用 `datetime` 算日期差、做格式化与解析，并知道 naive/aware 混用会抛什么。
4. 用 `collections` 与 `itertools` 把「手写循环+字典」压缩成两行，且知道它们都是惰性的。
5. 用 `argparse`、`logging`、`subprocess` 写出一支像样的命令行脚本。

## 21.1 标准库地图

| 模块 | 一句话 | 最常用 | 常见坑 |
| --- | --- | --- | --- |
| `os` | 操作系统接口 | `path.join`、`environ`、`makedirs` | 路径拼接用 `+` 丢分隔符 |
| `sys` | 解释器自身 | `argv`、`version_info`、`path`、`stdin` | `sys.exit(0)` 的 0 是成功 |
| `datetime` | 日期时间 | `date`/`datetime`/`timedelta` | naive 与 aware 混算 |
| `json` | JSON 读写 | `dumps`/`loads`/`dump`/`load` | 中文被转义、`datetime` 不可序列化 |
| `re` | 正则 | `findall`/`sub`/`match`/`compile` | 忘记 `r""`、贪婪匹配 |
| `collections` | 增强容器 | `Counter`/`defaultdict`/`deque` | `defaultdict` 读一下也会插入 |
| `itertools` | 迭代器工具 | `accumulate`/`groupby`/`product` | `groupby` 必须先排序 |
| `functools` | 函数工具 | `lru_cache`/`reduce`/`partial` | 缓存参数必须可哈希 |
| `math` | 数学函数 | `isclose`/`gcd`/`comb`/`inf` | 浮点用 `==` 比较 |
| `random` | 伪随机 | `randint`/`choice`/`shuffle` | 用它生成密码/令牌 |
| `argparse` | 命令行参数 | `add_argument`/`parse_args` | 必填参数缺失直接 `SystemExit(2)` |
| `logging` | 日志 | `getLogger`/`basicConfig` | 用 `print` 调试后忘了删 |
| `subprocess` | 起子进程 | `run(...capture_output=True)` | 不检查 `returncode` |

## 21.2 `os` 与 `sys`：和外界打交道

第 17 章已经用 `pathlib` 做路径操作，`os.path` 只在维护老代码时才用——两套 API 混着写最容易出错。

```pycon
>>> import os, sys
>>> os.path.join("a", "b") == "a" + os.sep + "b"
True
>>> os.path.splitext("report.tar.gz")
('report.tar', '.gz')
>>> sys.version_info >= (3, 10)
True
```

`os.sep` 在 Windows 上是 `\`、Linux 上是 `/`，所以「手写 `"/"` 拼路径」在 Windows 上也能跑（Windows 接受 `/`），但 `os.path.join` 与 `Path / "x"` 才是唯一正确的做法。

`sys` 里最该记住的四个属性：

| 属性 | 用途 | 注意 |
| --- | --- | --- |
| `sys.argv` | 命令行参数列表，`argv[0]` 是脚本名 | 自己解析太脆弱，用 `argparse` |
| `sys.version_info` | 版本元组，可比较 | 判断特性用 `>= (3, 10)` |
| `sys.path` | 模块搜索路径列表 | 可以 append，但别在库代码里干 |
| `sys.stdin/stdout/stderr` | 标准流 | 重定向测试时替换它 |

```python
# 示例：examples/ch21_03_sys_time_math.py
import math
import os
import sys
from datetime import date, datetime, timedelta, timezone

print(sys.version_info[:2] >= (3, 10), sys.platform, sys.getrecursionlimit())
print(os.path.join("data", "out.txt") == "data" + os.sep + "out.txt")
print(os.path.basename("/a/b/c.txt"), os.path.splitext("c.txt"))

d = date(2024, 2, 29)
print(d, d.weekday(), d.isoformat())
print((date(2024, 3, 1) - date(2024, 2, 1)).days)
print(date(2024, 1, 31) + timedelta(days=1))

dt = datetime(2024, 1, 1, 9, 30)
print(dt + timedelta(hours=2, minutes=45))
print(dt.strftime("%Y/%m/%d %H:%M:%S"))
print(datetime.strptime("2024-03-05 08:00", "%Y-%m-%d %H:%M"))

utc = datetime(2024, 1, 1, tzinfo=timezone.utc)
print(utc.astimezone(timezone(timedelta(hours=8))).isoformat())
print(datetime(2024, 1, 1) == datetime(2024, 1, 1, tzinfo=timezone.utc))

print(math.isclose(0.1 + 0.2, 0.3), 0.1 + 0.2 == 0.3)
print(math.gcd(12, 18), math.lcm(4, 6), math.factorial(5))
print(math.comb(5, 2), math.perm(5, 2))
print(math.floor(-2.5), math.ceil(-2.5), math.trunc(-2.5))
print(math.inf > 1e308, math.isnan(float("nan")), float("nan") == float("nan"))
print(math.hypot(3, 4), math.sqrt(16), math.log2(8), math.log(100, 10))
print(round(math.pi, 4), round(math.e, 4))
```

```text
True win32 1000
True
c.txt ('c', '.txt')
2024-02-29 3 2024-02-29
29
2024-02-01
2024-01-01 12:15:00
2024/01/01 09:30:00
2024-03-05 08:00:00
2024-01-01T08:00:00+08:00
False
True False
6 12 120
10 20
-3 -2 -2
True True False
5.0 4.0 3.0 2.0
3.1416 2.7183
```

## 21.3 `datetime`：三个类型，一条时间线

`date`（年月日）、`time`（时分秒）、`datetime`（两者之和）、`timedelta`（时长）。做算术只会用到后两个：

```pycon
>>> from datetime import date, datetime, timedelta, timezone
>>> date(2024, 1, 31) + timedelta(days=1)
datetime.date(2024, 2, 1)
>>> datetime(2024, 1, 1, 9, 30) + timedelta(minutes=45)
datetime.datetime(2024, 1, 1, 10, 15)
>>> datetime(2024, 1, 1) - datetime(2023, 12, 31)
datetime.timedelta(days=1)
```

跨月加法是**真的日历运算**（1 月 31 日 + 1 天 = 2 月 1 日），不是「加 86400 秒」——夏令时切换那天两者会差一小时。

格式化与解析是一对互逆操作，格式串写错会直接抛 `ValueError`：

```pycon
>>> from datetime import date, datetime, timedelta, timezone
>>> datetime(2024, 3, 5, 8, 0).strftime("%Y-%m-%d %H:%M")
'2024-03-05 08:00'
>>> datetime.strptime("2024-03-05", "%Y-%m-%d").date()
datetime.date(2024, 3, 5)
>>> date(2024, 1, 1).weekday(), date(2024, 1, 1).isoweekday()
(0, 1)
```

`weekday()` 周一为 0，`isoweekday()` 周一为 1——竞赛题里「这年的第几天」用 `%j`，星期几用 `isoweekday()`，别混。

最常写的格式符：`%Y` 四位年、`%m` 月、`%d` 日、`%H:%M:%S` 时分秒、`%j` 年内第几天、`%f` 微秒。**不要用 `%A`、`%B`**（星期/月名）——它们受系统 locale 影响，同一份代码在中文 Windows 上会输出「星期一」。

时区是新手最大的坑：**naive（无 `tzinfo`）与 aware（有 `tzinfo`）不能相减**，会抛 `TypeError: can't subtract offset-naive and offset-aware datetimes`。

```pycon
>>> from datetime import datetime, timedelta, timezone
>>> utc = datetime(2024, 1, 1, tzinfo=timezone.utc)
>>> utc.astimezone(timezone(timedelta(hours=8))).isoformat()
'2024-01-01T08:00:00+08:00'
>>> datetime(2024, 1, 1) == datetime(2024, 1, 1, tzinfo=timezone.utc)
False
```

最后一行 `False` 不是 bug：naive 的 `2024-01-01 00:00` 按**本机时区**解释，与 UTC 零点不是同一时刻。约定是：**内部一律存 UTC aware 时间，展示时再 `astimezone()` 成本地时区**。需要 IANA 时区（`Asia/Shanghai`，能自动处理夏令时）得装 `tzdata`，标准库只提供 `timezone(timedelta(...))` 这种固定偏移。

## 21.4 `json`：数据交换的通用语

四个函数：`dumps`（对象→字符串）、`loads`（字符串→对象）、`dump`/`load`（同上，直接对文件对象）。类型映射是固定的：

| Python | JSON | 说明 |
| --- | --- | --- |
| `dict` | object | 键必须是 `str` |
| `list`/`tuple` | array | 读回来一律是 `list` |
| `str` | string | 默认转成 `\uXXXX` |
| `int`/`float` | number | 大整数精度取决于对端 |
| `True`/`False`/`None` | `true`/`false`/`null` | 三个名字大小写固定 |
| `datetime`、`set`、自定义类 | — | **不可序列化**，抛 `TypeError` |

```pycon
>>> import json
>>> json.dumps({"b": 1, "a": [1, 2]}, sort_keys=True)
'{"a": [1, 2], "b": 1}'
>>> json.dumps("中", ensure_ascii=False), json.dumps("中")
('"中"', '"\\u4e2d"')
>>> json.loads('{"a": 1}')["a"]
1
>>> try:
...     json.loads("{'a': 1}")
... except json.JSONDecodeError as e:
...     print(e.msg, e.pos)
Expecting property name enclosed in double quotes 1
```

三个实用参数：`ensure_ascii=False`（中文可读，体积也小）、`indent=2`（人看）、`sort_keys=True`（diff 稳定）。`JSONDecodeError` 的 `.pos` 是字符偏移，`.lineno`/`.colno` 是行列——报错时把它们一起打出来，否则「JSON 解析失败」等于没说。

```python
# 示例：examples/ch21_02_json_re.py
import datetime
import json
import re

data = {"name": "小明", "age": 18, "tags": ["py", "竞赛"], "vip": False}
s = json.dumps(data, ensure_ascii=False, sort_keys=True)
print(s)
print(json.dumps(data, indent=2, ensure_ascii=False).splitlines()[1])

back = json.loads(s)
print(back == data, back["tags"][1])
print(json.dumps("中文"))                       # 默认全是 \u 转义
print(json.loads('{"a": [1, 2.5, "x"], "b": null}'))

try:
    json.loads('{"a": 1,}')
except json.JSONDecodeError as e:
    print(type(e).__name__, "|", e.msg, "| 位置", e.pos)

try:
    json.dumps({"t": datetime.date(2024, 1, 1)})
except TypeError as e:
    print(type(e).__name__, "|", e)

print(re.findall(r"\d+", "a1b22c333"))
print(re.split(r",\s*", "a, b,c"))
print(re.sub(r"(\w+)@(\w+)\.com", r"\2:\1", "tom@mail.com"))

m = re.match(r"(?P<y>\d{4})-(?P<m>\d{2})", "2024-03")
print(m.groupdict(), m.group(2), m.groups())

print(re.match(r"<.*>", "<a><b>").group(), re.match(r"<.*?>", "<a><b>").group())
print(re.findall(r"[a-z]+", "Ab Cd", re.IGNORECASE))

for mm in re.finditer(r"\d+", "x10y200"):
    print(mm.group(), mm.span())

pat = re.compile(r"^\d{3}-\d{4}$")
print(bool(pat.fullmatch("123-4567")), bool(pat.fullmatch("12-4567")))
print(re.sub(r"\s+", " ", "  a   b  ").strip())
```

```text
{"age": 18, "name": "小明", "tags": ["py", "竞赛"], "vip": false}
  "name": "小明",
True 竞赛
"\u4e2d\u6587"
{'a': [1, 2.5, 'x'], 'b': None}
JSONDecodeError | Illegal trailing comma before end of object | 位置 7
TypeError | Object of type date is not JSON serializable
['1', '22', '333']
['a', 'b', 'c']
mail:tom
{'y': '2024', 'm': '03'} 03 ('2024', '03')
<a><b> <a>
['Ab', 'Cd']
10 (1, 3)
200 (4, 7)
True False
a b
```

> **⚠️ 易错**：JSON 只认双引号。`{'a': 1}` 是合法的 Python 字典字面量，却是非法 JSON；反过来 `json.loads` 读 `NaN`、`Infinity` 也不合规（Python 默认接受，`parse_constant` 可以禁掉）。跨语言传数据时以严格 JSON 为准。

## 21.5 `re`：正则的四个动作

匹配（`match`/`search`/`fullmatch`）、查找全部（`findall`/`finditer`）、替换（`sub`）、切分（`split`）。**永远写原始字符串 `r"..."`**，否则 `"\d"` 会先被 Python 当转义处理。

```pycon
>>> import re
>>> re.findall(r"\d+", "a1b22")
['1', '22']
>>> re.sub(r"(\w+)@(\w+)", r"\2@\1", "tom@mail")
'mail@tom'
>>> m = re.match(r"(?P<y>\d{4})-(?P<m>\d{2})", "2024-03")
>>> m.group("y"), m.group(2)
('2024', '03')
```

贪婪与非贪婪只差一个 `?`，结果差很多：

```pycon
>>> import re
>>> re.match(r"<.*>", "<a><b>").group()
'<a><b>'
>>> re.match(r"<.*?>", "<a><b>").group()
'<a>'
>>> re.fullmatch(r"\d{3}", "123") is not None
True
```

`match` 只从开头试（等价于 `^`），`search` 扫全文，`fullmatch` 要求整串匹配。竞赛里「读一整行并按格式解析」几乎总用 `re.fullmatch` 或 `re.findall`，少用 `match`——`match` 成功一半也算成功，最容易漏边界。

性能上：**循环里反复用的正则必须 `re.compile`**。`re` 模块内部有 512 条的缓存，但编译一次存进变量既明确又快，还能让 `pat.fullmatch(s)` 读起来更像一个判断。

## 21.6 `collections`：四个增强容器

```pycon
>>> from collections import Counter, defaultdict, deque, namedtuple
>>> c = Counter("abracadabra")
>>> c.most_common(2)
[('a', 5), ('b', 2)]
>>> c["z"]
0
>>> sorted(c)
['a', 'b', 'c', 'd', 'r']
```

`Counter` 是「计数专用字典」：缺键返回 0 而不抛 `KeyError`，`most_common(n)` 直接给排行榜，还能做 `+`/`-`/`&`/`|` 的多重集运算。统计词频、票数、字符出现次数，一行顶十行。

```pycon
>>> from collections import defaultdict
>>> dd = defaultdict(list)
>>> dd["k"].append(1)
>>> dict(dd)
{'k': [1]}
>>> dd2 = defaultdict(int)
>>> dd2["没见过的键"] += 1
>>> dict(dd2)
{'没见过的键': 1}
```

`defaultdict` 把「键不存在就建一个默认值」写进了 `__getitem__`。**代价是读操作也会插入键**——所以用它遍历完再 `len()` 会变多，判存在要用 `in`。

```pycon
>>> from collections import deque
>>> dq = deque([1, 2, 3], maxlen=3)
>>> dq.append(4); dq
deque([2, 3, 4], maxlen=3)
>>> dq.appendleft(0); dq
deque([0, 2, 3], maxlen=3)
```

`deque` 两端插入删除都是 O(1)，`list` 的头部插入是 O(n)。BFS 队列、滑动窗口、最近 N 条记录，全用它。`maxlen` 一到就自动挤掉另一头，写成环形缓冲只要一行。

```pycon
>>> from collections import namedtuple
>>> P = namedtuple("P", "x y")
>>> P(1, 2)._replace(y=5)
P(x=1, y=5)
>>> P(1, 2)[1]
2
```

`namedtuple` 是「有字段名的元组」：能解包、能索引（所以排序、比较都和元组一样快），又能 `p.x`。字段不可变，`_replace` 返回新对象。想加方法就继承它；想可变、想默认值，直接上第 18 章的 `dataclass`。

## 21.7 `itertools`：把循环写成流水线

它们是**惰性的**：返回迭代器，不建列表，所以能处理无限序列。

```pycon
>>> import itertools as it
>>> list(it.accumulate([1, 2, 3, 4]))
[1, 3, 6, 10]
>>> list(it.islice(it.count(10), 3))
[10, 11, 12]
>>> list(it.chain([1], [2, 3]))
[1, 2, 3]
>>> list(it.pairwise([1, 2, 3]))
[(1, 2), (2, 3)]
```

| 工具 | 作用 | 典型场景 |
| --- | --- | --- |
| `count(start, step)` | 无限等差 | 配合 `islice` 取前 N 个 |
| `cycle(seq)` | 无限循环 | 轮流分配、轮询 |
| `repeat(x, n)` | 重复 n 次 | 批量初始化 |
| `accumulate` | 前缀和/前缀积 | 区间和、累积最大 |
| `chain` / `chain.from_iterable` | 串联 | 拼接多个列表 |
| `islice` | 切片迭代器 | 取无限序列的一段 |
| `groupby` | 相邻分组 | 游程编码 |
| `product` / `permutations` / `combinations` | 笛卡尔积/排列/组合 | 暴力枚举 |
| `pairwise`（3.10+） | 相邻对 | 相邻差、滑动比较 |

`groupby` 有一个必踩的坑：**它只合并相邻的相同键**，所以分组前必须先按同一个键排序。

```pycon
>>> import itertools as it
>>> [k for k, g in it.groupby("aabbbc")]
['a', 'b', 'c']
>>> [list(g) for k, g in it.groupby("aabbbc")]
[['a', 'a'], ['b', 'b', 'b'], ['c']]
>>> [(k, list(g)) for k, g in it.groupby("abab")]
[('a', ['a']), ('b', ['b']), ('a', ['a']), ('b', ['b'])]
```

`it.product([1, 2], "ab")` 是双重循环的替代品，`combinations(xs, 2)` 是「枚举所有二元组」的标准答案——两者都比手写嵌套 `for` 短，且顺序确定（按输入顺序的字典序）。

```pycon
>>> import itertools as it
>>> list(it.product([1, 2], "ab"))
[(1, 'a'), (1, 'b'), (2, 'a'), (2, 'b')]
>>> list(it.combinations([1, 2, 3], 2))
[(1, 2), (1, 3), (2, 3)]
>>> list(it.permutations([1, 2], 2))
[(1, 2), (2, 1)]
```

## 21.8 `functools`：三个高频工具

```pycon
>>> from functools import lru_cache, partial, reduce
>>> @lru_cache(maxsize=None)
... def fib(n):
...     return n if n < 2 else fib(n - 1) + fib(n - 2)
...
>>> fib(10)
55
>>> fib.cache_info().hits > 0
True
>>> reduce(lambda x, y: x * y, [1, 2, 3, 4])
24
>>> int2 = partial(int, base=2)
>>> int2("1010")
10
```

`lru_cache` 把函数变成记忆化版本，是「递归写对了却 TLE」的第一号解药；它缓存的是**参数元组**，所以参数必须可哈希（传 `list` 会抛 `TypeError: unhashable type`）。`partial` 把部分参数提前绑定，专门用来给回调/`key` 函数做适配。`reduce` 在 Python 3 里被挪进了 `functools`，能用 `sum`/`math.prod` 的场合别用它（可读性差）。

## 21.9 `math` 与 `random`

```pycon
>>> import math
>>> math.isclose(0.1 + 0.2, 0.3)
True
>>> math.floor(-2.5), math.ceil(-2.5), math.trunc(-2.5)
(-3, -2, -2)
>>> math.gcd(12, 18), math.comb(5, 2), math.perm(5, 2)
(6, 10, 20)
>>> math.inf > 1e308, math.nan == math.nan, math.isnan(math.nan)
(True, False, True)
>>> round(math.pi, 4)
3.1416
>>> math.log(100, 10)
2.0
```

`math.inf` 是浮点无穷（`float("inf")` 等价），`1e308` 是有限浮点的量级；`nan != nan` 是 IEEE 754 的规定，判空要用 `math.isnan`。`math.comb`/`math.perm` 从 3.8 起自带，大数组合数不再需要手写阶乘（`factorial(1000)` 有 2568 位，`comb(1000, 500)` 更大，但 int 无上限，见第 3 章）。

```pycon
>>> import random
>>> random.seed(7)
>>> a = [random.randint(1, 6) for _ in range(3)]
>>> random.seed(7)
>>> [random.randint(1, 6) for _ in range(3)] == a
True
>>> random.seed(1)
>>> s1 = random.sample(["a", "b", "c", "d"], 2); random.seed(1); s2 = random.sample(["a", "b", "c", "d"], 2)
>>> s1 == s2
True
```

`random` 是**伪随机**：同一个种子给出同一串数。这正是复现 bug、固定测试数据的手段（`random.seed(0)` 后输出可写进断言）。`random.shuffle(xs)` 原地改列表并返回 `None`；`random.sample(xs, k)` 不重复取 k 个；`random.choices(xs, weights=..., k=n)` 可重复且有权重。

> **⚠️ 易错**：`random` 不能用来生成密码、令牌、验证码。它的输出可预测，密码学安全要用 `secrets.token_hex(16)` / `secrets.randbelow(100)`。

## 21.10 `argparse`：命令行参数

```pycon
>>> import argparse
>>> p = argparse.ArgumentParser(prog="tool")
>>> _ = p.add_argument("path")
>>> _ = p.add_argument("-n", type=int, default=3)
>>> a = p.parse_args(["f.txt", "-n", "5"])
>>> a
Namespace(path='f.txt', n=5)
>>> a.path, a.n
('f.txt', 5)
```

`parse_args` 返回一个 `Namespace`，字段名就是参数名（`--count` 会变成 `count`，下划线化）。位置参数靠顺序，可选参数靠 `-`/`--` 前缀；`type=int` 会自动转换，转失败就报错退出。必填可选参数缺失时它打印用法并 `sys.exit(2)`——所以**单元测试里要把 `parse_args` 的参数显式传进去**，别让它去读 `sys.argv`。

```python
# 示例：examples/ch21_04_cli_logging.py
import argparse
import contextlib
import io
import logging
import subprocess
import sys


def build_parser():
    p = argparse.ArgumentParser(prog="tool", description="生成报告")
    p.add_argument("path", help="输入文件")
    p.add_argument("-n", "--count", type=int, default=3, help="条数")
    p.add_argument("-v", "--verbose", action="store_true")
    return p


args = build_parser().parse_args(["data.txt", "-n", "5", "-v"])
print(args)
print(args.path, args.count, args.verbose)

err = io.StringIO()
try:
    with contextlib.redirect_stderr(err):
        build_parser().parse_args([])
except SystemExit as e:
    print("code", e.code, "| 说是必填:", "required" in err.getvalue())

logging.basicConfig(stream=sys.stdout, level=logging.INFO,
                    format="%(levelname)s %(name)s %(message)s", force=True)
log = logging.getLogger("demo")
log.debug("debug 低于 INFO，不会出现")
log.info("开始处理 %s", "任务")
log.warning("磁盘已用 %d%%", 90)
log.setLevel(logging.ERROR)
print("logger 级别改为 ERROR 后:", log.isEnabledFor(logging.INFO))

r = subprocess.run([sys.executable, "-c", "print('child ok')"],
                   capture_output=True, text=True)
print(r.returncode, repr(r.stdout))

bad = subprocess.run([sys.executable, "-c", "raise SystemExit(3)"],
                     capture_output=True, text=True)
print(bad.returncode, repr(bad.stdout))

try:
    subprocess.run([sys.executable, "-c", "import sys; sys.exit(1)"],
                   check=True, capture_output=True)
except subprocess.CalledProcessError as e:
    print(type(e).__name__, "returncode =", e.returncode)

try:
    subprocess.run([sys.executable, "-c", "import time; time.sleep(2)"],
                   timeout=0.5, capture_output=True)
except subprocess.TimeoutExpired as e:
    print(type(e).__name__, "timeout =", e.timeout)
```

```text
Namespace(path='data.txt', count=5, verbose=True)
data.txt 5 True
code 2 | 说是必填: True
INFO demo 开始处理 任务
WARNING demo 磁盘已用 90%
logger 级别改为 ERROR 后: False
0 'child ok\n'
3 ''
CalledProcessError returncode = 1
TimeoutExpired timeout = 0.5
```

## 21.11 `logging`：比 `print` 多五件事

级别（`DEBUG < INFO < WARNING < ERROR < CRITICAL`）、时间戳、来源模块名、输出目的地、开关控制。`basicConfig` 只生效一次，第二次调用什么都不做（除非 `force=True`，3.8+）。

```python
# 片段：生产脚本的日志骨架
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)      # 每个模块一个 logger，名字就是模块名

log.info("处理 %d 条记录", len(rows))   # 用 %s 占位，别用 f-string
```

三个约定：①`getLogger(__name__)` 而不是 `getLogger("app")`，这样按模块名就能关掉某个模块的日志；②传参用 `%s` 占位而不是 f-string——日志级别不够时字符串根本不会被格式化，f-string 则总是先算一遍；③库代码里**不要**调 `basicConfig`，配置权归应用。异常用 `log.exception("...")`，它等价于 `error(..., exc_info=True)`，会自动带上 traceback。

## 21.12 `subprocess`：起一个子进程

`subprocess.run` 是唯一推荐的入口（`os.system`、`os.popen` 已过时，且有注入风险）。

```pycon
>>> import subprocess, sys
>>> r = subprocess.run([sys.executable, "-c", "print('child ok')"], capture_output=True, text=True)
>>> r.returncode, r.stdout
(0, 'child ok\n')
>>> bad = subprocess.run([sys.executable, "-c", "raise SystemExit(3)"], capture_output=True, text=True)
>>> bad.returncode
3
```

四条规则：①命令写成**列表**，不要写 `shell=True` 拼字符串（否则用户输入里的 `;` 就是命令注入）；②`capture_output=True` + `text=True` 拿字符串而不是字节；③**一定检查 `returncode`**，或者直接 `check=True` 让它抛 `CalledProcessError`；④给外部命令加 `timeout=`，否则它卡住你的脚本也卡住。

```python
# 片段：调用外部程序并处理失败
try:
    r = subprocess.run([exe, "--version"], capture_output=True, text=True,
                       timeout=10, check=True)
    print(r.stdout.strip())
except subprocess.CalledProcessError as e:
    print("失败", e.returncode, e.stderr[:200])
except subprocess.TimeoutExpired:
    print("超时")
except FileNotFoundError:
    print("程序不存在")
```

`FileNotFoundError` 是「命令没装」的典型信号，Windows 上还可能是「有空格没加引号但因为用了列表所以不会」——列表形式天然解决了空格问题。

## 21.a 与 C++ 的差别

| 维度 | Python | C++ |
| --- | --- | --- |
| 依赖管理 | 标准库 `import` 即用，第三方走 pip | `#include` 头文件 + 链接库 |
| 日期时间 | `datetime` 内置，带时区对象 | C++20 前无标准日期，靠 `time_t` + `strftime` |
| JSON | `json` 内置 | 需 nlohmann/json 等第三方 |
| 正则 | `re` 内置，语法接近 PCRE | C++11 `std::regex`，性能与支持都弱 |
| 哈希表计数 | `Counter` 一行 | `std::unordered_map` 手写 `++m[k]` |
| 排列组合 | `itertools` 惰性生成 | `std::next_permutation` 需先排序 |
| 随机 | `random`（Mersenne Twister） | `<random>` 引擎 + 分布两层 |
| 命令行 | `argparse` 自动生成帮助与报错 | 手写 `argc/argv` 解析 |
| 日志 | `logging` 五级 + 格式化 | 无标准方案，常自造宏 |
| 子进程 | `subprocess.run` 一个函数 | `fork/exec` 或 `system()` |

最本质的差别：C++ 的标准库是「**给你积木**」（容器 + 算法），Python 的标准库是「**给你成品**」（直接能做 JSON、日志、命令行、HTTP）。所以 C++ 项目里大量脚手架代码，在 Python 里往往只是十几个 `import`。

## 21.b 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `json.dumps` 出来全是 `\u4e2d` | 默认 `ensure_ascii=True` | 加 `ensure_ascii=False` |
| `json.dumps(obj)` 抛 `TypeError: not JSON serializable` | `datetime`/`set` 不被支持 | 先 `default=str` 或手动转 ISO 字符串 |
| `re.findall` 返回 `[]` 但明明有 | 忘了 `r""`，`\d` 被当转义 | 所有 pattern 都写原始字符串 |
| `re.match` 匹配到一半也算成功 | `match` 不是全串匹配 | 用 `fullmatch` 或 `\Z` |
| `groupby` 分组结果碎成一片 | 只合并相邻相同键 | 先 `sorted(xs, key=...)` |
| `defaultdict` 的 `len()` 莫名变大 | 读操作会插入默认值 | 判存在用 `in`，别用 `[]` 试探 |
| `lru_cache` 抛 `unhashable type` | 传了 `list`/`dict` 参数 | 参数转 `tuple`，或自己写缓存 |
| `naive` 与 `aware` 相减报 `TypeError` | 一个有时区一个没有 | 统一 `tzinfo=timezone.utc` |
| `strftime("%A")` 输出中文 | 依赖系统 locale | 用数字格式，或自己映射表 |
| `argparse` 在测试里读到了 pytest 的参数 | 用了 `sys.argv` | 显式传 `parse_args([...])` |
| `basicConfig` 第二次调用没反应 | 它只配置一次 | `force=True` |
| 子进程失败但脚本继续跑 | 没检查 `returncode` | `check=True` 或断言返回码 |

## 21.c 练习

**基础 1**：统计一段文本的词频，输出前 3 名及次数；要求忽略大小写与标点。

验收：输入 `"The cat, the DOG! the bird."` 输出 `the 3`、`cat 1`、`dog 1`（同频按字母序）。

**基础 2**：写 `days_between(a: str, b: str) -> int`，接受 `"2024-01-01"` 形式，返回相差天数（可正可负）。

验收：`days_between("2024-03-01", "2024-02-01") == 29`（2024 是闰年）；格式错误抛 `ValueError`。

**基础 3**：把 `{"name": "小明", "score": 92.5, "at": datetime(2024, 1, 1)}` 序列化成 JSON 字符串再读回，`at` 字段用 ISO 格式保存。

验收：往返后 `data["at"] == "2024-01-01T00:00:00"`，且 `json.loads` 不抛异常。

**变式**：用 `re` 写一个 `mask_phone(s)`，把 `13812345678` 变成 `138****5678`，其它长度原样返回。

验收：`mask_phone("13812345678") == "138****5678"`；`mask_phone("123") == "123"`。

**挑战**：写一支命令行工具 `wordcount.py`：`python wordcount.py FILE [-n N] [--ignore-case]`，用 `argparse` 解析、`Counter` 统计、`logging` 输出进度（`--verbose` 时开 INFO）；文件不存在时给出友好错误并退出码 2。

验收：`--help` 有中文说明；正常文件输出前 N 名；不存在文件时 stderr 有提示且 `echo $?` 为 2。

## 21.d 小结

1. 先问「标准库有没有」：`json`/`re`/`datetime`/`collections`/`itertools` 能省掉大部分脚手架代码，而且零依赖、无版本风险。
2. 三个容器与三个工具是提效重点：`Counter` 计数、`defaultdict` 聚合、`deque` 做队列；`itertools` 惰性流水线、`functools.lru_cache` 记忆化、`argparse` 接命令行。
3. 精度与时间两条红线：浮点比较用 `math.isclose`，时间统一 UTC aware；`random` 只用于模拟，安全场景换 `secrets`。

下一章进入并发：同一份代码用 `threading`、`multiprocessing`、`asyncio` 三种方式各写一遍，并说清 GIL 到底限制了什么。
