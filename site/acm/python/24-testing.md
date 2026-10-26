# 24 · 测试：unittest 与 pytest

> **本质**：测试是**把「我以为它会这样」写成可执行的断言**，让机器每次改完代码都替你重跑一遍。它不证明代码正确，只证明「这些已知情况仍然对」。

**读完这一章你能做到**

1. 用 `unittest` 写出一组能跑、能报错定位、能跳过已知 bug 的测试。
2. 用 `pytest` 的裸 `assert`、`fixture`、`parametrize` 把测试写得比被测代码还短。
3. 用 `unittest.mock` 把时间、网络、随机数这些不确定的东西换成确定值。
4. 说清「该测什么」：边界、异常、等价类，以及为什么覆盖率 100% 也可能全是废测试。
5. 把测试接进一条命令（`pytest -q`）与 CI。

> **💡 提示**：本章可运行的示例都用**标准库 `unittest`**（无需安装任何包），所以本文档能自动校验它们的真实输出。`pytest` 部分给出完整代码与终端输出，但需要你先 `python -m pip install pytest` 才能跑——它是第三方包，不属于标准库。

## 24.1 测试替你拦住什么

三类收益，按重要性排序：

1. **回归网**：改 A 功能弄坏 B 功能，是项目里最常见的 bug。有测试时它在提交前就红；没测试时它在上线后才发现。
2. **可执行的文档**：新同事读 `test_parse_date.py` 比读实现更快知道「这个函数接受什么、拒绝什么」。
3. **设计压力**：一个函数难测，通常意味着它有隐藏的全局状态、副作用或过多依赖。写测试的过程会逼你把它拆小。

| 层次 | 数量级 | 速度 | 例子 |
| --- | --- | --- | --- |
| 单元测试 | 几百上千 | 毫秒 | `safe_div(1, 0)` 抛 `ValueError` |
| 集成测试 | 几十 | 秒 | 接口 + 数据库一起跑 |
| 端到端测试 | 几个 | 分钟 | 起服务、发 HTTP、断言响应 |
| 手工验证 | 越少越好 | — | 只在无法自动化时用 |

新手最常犯的错是「只写端到端」：一个真实数据库 + 一个真实网络调用，让整个测试套件从 0.2 秒变成 2 分钟，于是没人愿意跑，测试就死了。**单元测试要多而快，越往上越少**。

## 24.2 `unittest`：标准库自带的那套

骨架四件套：继承 `TestCase`、方法名以 `test_` 开头、用 `self.assertXxx` 断言、用 `python -m unittest` 运行。

```pycon
>>> try:
...     assert 1 + 1 == 3, "加法坏了"
... except AssertionError as e:
...     print(type(e).__name__ + ":", e)
AssertionError: 加法坏了
```

断言失败就是抛 `AssertionError`，测试框架捕获它并把「哪一行、什么值」报给你。`assert` 的第二个参数一定要写——否则报错只有 `AssertionError` 四个字，等于没报。

常用断言一张表：

| 断言 | 判断 | 备注 |
| --- | --- | --- |
| `assertEqual(a, b)` | `a == b` | 最常用 |
| `assertNotEqual(a, b)` | `a != b` | |
| `assertTrue(x)` / `assertFalse(x)` | 真值 | 别用它代替具体断言 |
| `assertIs(a, b)` / `assertIsNone(x)` | 身份 | 判 `None` 用它而不是 `==` |
| `assertIn(a, seq)` | 成员 | 检查子串/字典键 |
| `assertAlmostEqual(a, b, places=7)` | 四舍五入到 7 位后相等 | 浮点专用 |
| `assertRaises(Err, fn, *args)` | 抛指定异常 | 推荐用 `with` 形式 |
| `assertWarns(Warn)` | 发出警告 | 逐步废弃 API 时用 |

浮点断言为什么必须用 `assertAlmostEqual`，一次失败就说清了：

```pycon
>>> import unittest
>>> tc = unittest.TestCase()
>>> tc.assertAlmostEqual(0.1 + 0.2, 0.3, places=7)
>>> print("places=7 通过")
places=7 通过
>>> try:
...     tc.assertAlmostEqual(0.1 + 0.2, 0.3, places=20)
... except AssertionError as e:
...     print(str(e).splitlines()[0])
0.30000000000000004 != 0.3 within 20 places (5.551115123125783e-17 difference)
```

`assertEqual` 对这两个数会直接失败——这是第 3 章讲过的二进制浮点误差在测试层的表现。

```python
# 示例：examples/ch24_01_unittest.py
import io
import unittest


def safe_div(a, b):
    if b == 0:
        raise ValueError("除数不能为 0")
    return a / b


class TestSafeDiv(unittest.TestCase):
    def test_normal(self):
        self.assertEqual(safe_div(6, 3), 2)

    def test_float(self):
        self.assertAlmostEqual(safe_div(1, 3), 0.3333, places=4)

    def test_zero(self):
        with self.assertRaises(ValueError) as ctx:
            safe_div(1, 0)
        self.assertEqual(str(ctx.exception), "除数不能为 0")

    def test_many_cases(self):
        for a, b in [(1, 1), (4, 2), (9, 3)]:
            with self.subTest(a=a, b=b):
                self.assertEqual(safe_div(a * b, b), a)

    @unittest.expectedFailure
    def test_known_bug(self):
        self.assertEqual(safe_div(1, 3), 0.33)


suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestSafeDiv)
buffer = io.StringIO()
result = unittest.TextTestRunner(stream=buffer, verbosity=2).run(suite)

print("用例数:", result.testsRun)
print("失败:", len(result.failures), "| 错误:", len(result.errors))
print("预期失败:", len(result.expectedFailures), "| 跳过:", len(result.skipped))
print("整体通过:", result.wasSuccessful())
for case, _ in result.expectedFailures:
    print("被标记为预期失败的方法:", case._testMethodName)
```

```text
用例数: 5
失败: 0 | 错误: 0
预期失败: 1 | 跳过: 0
整体通过: True
被标记为预期失败的方法: test_known_bug
```

四个值得记住的机制：

- **`setUp` / `tearDown`**：每个测试方法前后各跑一次，用于建临时文件、连数据库；`tearDown` 里必须清理干净，否则测试之间互相污染，顺序一变就挂。
- **`subTest`**：一组相似输入放一个方法里，用 `with self.subTest(...)` 包住，失败时只报那一条并继续跑剩下的——比复制五个方法清爽。
- **`@unittest.expectedFailure`**：把「已知会失败」的用例标记出来，套件整体仍算通过，修好后它会变成 `unexpected success` 提醒你删掉标记。
- **`@unittest.skip("原因")`**：临时跳过（依赖未装的环境、未实现的平台）。

运行方式有三种，最常用的是发现模式：

```bash
python -m unittest                          # 发现当前目录的 test*.py
python -m unittest tests.test_calc          # 跑单个模块
python -m unittest tests.test_calc.TestSafeDiv.test_zero   # 跑单个方法
python -m unittest -v                       # 每个用例一行
```

## 24.3 `pytest`：为什么几乎所有人都换用它

`pytest` 兼容 `unittest` 的用例（能直接跑 `TestCase`），但自己那套写法更短：

| 对比项 | `unittest` | `pytest` |
| --- | --- | --- |
| 断言 | `self.assertEqual(a, b)` | `assert a == b` |
| 失败信息 | 需要写 msg | 自动显示两边的值 |
| 用例组织 | 必须继承类 | 普通函数即可 |
| 前置准备 | `setUp`/`tearDown` | `fixture`（可组合、可作用域化） |
| 参数化 | 手写循环 + `subTest` | `@pytest.mark.parametrize` |
| 临时目录 | 自己 `tempfile` + 清理 | 内置 `tmp_path` fixture |
| 环境变量/`sys.path` | 手动 | `monkeypatch` fixture |
| 插件生态 | 无 | 覆盖率、并行、超时、随机顺序几千个 |

装与跑就两步：

```bash
python -m pip install pytest
pytest -q                 # 安静模式
pytest -x                 # 第一个失败就停
pytest -k "parse and not slow"    # 按名字过滤
pytest --lf               # 只跑上次失败的
```

文件名要匹配 `test_*.py` 或 `*_test.py`，函数名以 `test_` 开头，类名以 `Test` 开头且不能有 `__init__`——这是 pytest 的发现规则，不符合就「0 tests ran」，比报错更难查。

```text
# test_calc.py（需要先 pip install pytest）
import pytest
from calc import safe_div


def test_normal():
    assert safe_div(6, 3) == 2


def test_float():
    assert safe_div(1, 3) == pytest.approx(0.3333, abs=1e-4)


def test_zero():
    with pytest.raises(ValueError, match="除数不能为 0"):
        safe_div(1, 0)


@pytest.mark.parametrize("a,b,want", [
    (1, 1, 1),
    (4, 2, 2),
    (9, 3, 3),
    (0, 5, 0),
])
def test_many(a, b, want):
    assert safe_div(a * b, b) == want
```

```text
# 终端输出（耗时随机器不同）
$ pytest -q
.......                                                              [100%]
7 passed in 0.02s
```

失败的输出信息量是 `unittest` 比不了的：

```text
# 把 test_zero 的期望改成 ZeroDivisionError 后会看到：
$ pytest -q
.F.....                                                              [100%]
________________________________ test_zero _________________________________
    def test_zero():
        with pytest.raises(ZeroDivisionError, match="除数不能为 0"):
>           safe_div(1, 0)
E           Failed: DID NOT RAISE <class 'ZeroDivisionError'>
=========================== short test summary info ============================
FAILED test_calc.py::test_zero - Failed: DID NOT RAISE <class 'ZeroDivisionError'>
1 failed, 6 passed in 0.03s
```

它直接把源码那几行贴出来并用 `>` 指出出错表达式，连「期望抛什么、实际抛了什么」都写了。

## 24.4 fixture：把「准备」和「清理」写成依赖

`fixture` 是「一个带 `return`（或 `yield`）的函数，名字出现在测试函数参数里就自动注入」。

```text
# conftest.py —— 放在项目根目录或 tests/ 下，自动被发现
import pytest


@pytest.fixture
def sample_rows():
    return [{"id": 1, "score": 90}, {"id": 2, "score": 50}]


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "test.db"
    path.write_text("v1", encoding="utf-8")
    yield path                      # yield 之前是准备，之后是清理
    path.unlink()
```

```text
# test_report.py
def test_total(sample_rows):
    assert sum(r["score"] for r in sample_rows) == 140


def test_db_written(db):
    assert db.read_text(encoding="utf-8") == "v1"
```

四个必会要点：

1. **作用域**：`@pytest.fixture(scope="session")` 能在整个测试会话里只建一次（数据库连接、浏览器），默认是 `function`（每个测试都重建）。
2. **`yield` 即清理**：`yield` 之后的代码在测试结束后执行，等价于 `tearDown`，但**不必写在另一个方法里**。
3. **可组合**：`db` 依赖 `tmp_path`，`report` 依赖 `db`，pytest 自动按依赖顺序建、按相反顺序拆。
4. **`autouse=True`**：强制每个测试都用（比如全局打补丁），慎用——它让测试的依赖关系变得不可见。

内置的三个高频 fixture：`tmp_path`（临时目录 `pathlib.Path`，自动清理）、`monkeypatch`（改环境变量/属性/`sys.path`，测试后自动还原）、`capsys`（捕获 `print` 输出）。

## 24.5 mock：把不确定的东西钉死

测试里最讨厌三样东西：**当前时间、网络、随机数**。`unittest.mock` 用「假对象」替换它们。

```pycon
>>> from unittest.mock import MagicMock
>>> fake = MagicMock(return_value=42)
>>> fake("参数")
42
>>> fake.call_args
call('参数')
>>> fake.assert_called_once_with("参数")
>>> fake.call_count
1
```

`MagicMock()` 的属性访问、调用、下标全都返回新的 mock，所以不用提前声明结构；`return_value` 决定调它返回什么；`side_effect` 可以让它依次返回不同值或抛异常。

```python
# 示例：examples/ch24_02_mock.py
import sys
from unittest.mock import MagicMock, patch

mod = sys.modules[__name__]


def now():
    import time
    return time.time()


def is_expired(created, ttl=60):
    return now() - created > ttl


with patch.object(mod, "now", return_value=1000.0):
    print("未过期:", not is_expired(970.0))
    print("已过期:", is_expired(900.0))

fake = MagicMock(return_value={"ok": True})
print("返回值:", fake("/api"))
print("调用参数:", fake.call_args)
print("调用次数:", fake.call_count)
fake.assert_called_once_with("/api")

send = MagicMock()
for i in range(3):
    send(i)
print("全部调用:", [c.args for c in send.call_args_list])

client = MagicMock()
client.get.return_value.status_code = 200
resp = client.get("https://example.com")
print("链式属性打桩:", resp.status_code, "| 调用的方法名:", client.get.call_args.args)

with patch.object(mod, "now", side_effect=RuntimeError("时钟坏了")):
    try:
        is_expired(1.0)
    except RuntimeError as e:
        print("side_effect 抛异常:", e)
```

```text
未过期: True
已过期: True
返回值: {'ok': True}
调用参数: call('/api')
调用次数: 1
全部调用: [(0,), (1,), (2,)]
链式属性打桩: 200 | 调用的方法名: ('https://example.com',)
side_effect 抛异常: 时钟坏了
```

打补丁的两种写法，**优先用 `patch.object`**：

| 写法 | 用法 | 什么时候用 |
| --- | --- | --- |
| `with patch("模块.名字", ...)` | 按字符串路径打补丁 | 名字确定、补丁目标是导入过来的符号 |
| `with patch.object(mod, "名字", ...)` | 直接给对象+属性名 | **最稳**，不依赖模块被叫什么名字 |

字符串形式最容易踩的坑是「补丁打在了导入方还是定义方」。规则是：**补丁要打在「使用它的那个模块」的命名空间里**。`from time import time` 之后，`patch("time.time")` 是无效的——因为你的模块里已经有独立的 `time` 名字了，要 `patch("你的模块.time")`。

`MagicMock` 的一个隐患：它接受任何调用、任何属性，于是「你拼错了方法名」也照样通过。所以关键断言要落到 `assert_called_once_with(...)` 上，而不是「没报错就算过」。

## 24.6 该测什么：边界、异常、等价类

「测得多」不等于「测得对」。对每个函数，按四类准备用例：

1. **正常路径**：典型输入 → 期望输出。
2. **边界**：空集合、单个元素、0、负数、最大长度、闰年 2 月 29 日、字符串首尾。
3. **异常路径**：非法输入是否抛**正确的异常类型**（不是「随便抛一个」）。
4. **不变量/性质**：排序后长度不变、编码再解码能还原、`f(x) >= 0`。

浮点比较单独拎出来，因为 `==` 几乎总是错的：

```pycon
>>> import math
>>> def approx(a, b, tol=1e-9):
...     return math.isclose(a, b, rel_tol=tol, abs_tol=tol)
...
>>> approx(0.1 + 0.2, 0.3)
True
>>> approx(1e-12, 0.0), approx(1e-12, 0.0, 1e-13)
(True, False)
>>> approx(1e9, 1e9 + 1.0)
True
```

`rel_tol`（相对容差）和 `abs_tol`（绝对容差）要一起给：只给相对容差时，和 0 比较永远失败（任何数相对 0 的误差都是无穷大）；只给绝对容差时，大数比较过严。

```python
# 示例：examples/ch24_03_assert.py
import math


def approx(a, b, tol=1e-9):
    return math.isclose(a, b, rel_tol=tol, abs_tol=tol)


def check(cond, desc):
    print(("ok    " if cond else "FAIL  ") + desc)
    return cond


results = [
    check(approx(0.1 + 0.2, 0.3), "0.1+0.2 约等于 0.3"),
    check(not (0.1 + 0.2 == 0.3), "但 0.1+0.2 == 0.3 为假，所以不能用 =="),
    check(approx(1e-12, 0.0), "1e-12 在默认绝对容差之内"),
    check(not approx(1e-12, 0.0, 1e-13), "容差收紧到 1e-13 后不通过"),
    check(approx(1e9, 1e9 + 1.0), "相对容差让大数的 1 之差也可接受"),
]
print("通过", sum(results), "/", len(results))


def safe_div(a, b):
    if b == 0:
        raise ValueError("除数不能为 0")
    return a / b


for args, want in [((6, 3), 2), ((1, 4), 0.25)]:
    got = safe_div(*args)
    print("边界内:", args, "→", got, "| 与期望一致:", approx(got, want))

try:
    safe_div(1, 0)
except ValueError as e:
    print("异常路径:", type(e).__name__, "|", e)
```

```text
ok    0.1+0.2 约等于 0.3
ok    但 0.1+0.2 == 0.3 为假，所以不能用 ==
ok    1e-12 在默认绝对容差之内
ok    容差收紧到 1e-13 后不通过
ok    相对容差让大数的 1 之差也可接受
通过 5 / 5
边界内: (6, 3) → 2.0 | 与期望一致: True
边界内: (1, 4) → 0.25 | 与期望一致: True
异常路径: ValueError | 除数不能为 0
```

## 24.7 覆盖率：看趋势，别看数字

```bash
python -m pip install pytest-cov
pytest --cov=myapp --cov-report=term-missing
```

输出里 `Missing` 一列指出**哪些行没被执行**，比总百分比有用得多：

```text
Name              Stmts   Miss  Cover   Missing
-----------------------------------------------
myapp/calc.py        12      2    83%   14-15
```

三条经验：

- **80% 左右的覆盖率**通常已经能挡住大部分回归；追到 100% 往往靠 `# pragma: no cover` 作弊。
- **分支覆盖率**（`--cov-branch`）比行覆盖率有意义：`if` 只走了一边，行覆盖仍是 100%。
- **没被断言的执行毫无价值**：跑过一行不等于验证了那行的结果。覆盖率衡量「有没有跑到」，测试质量靠断言。

## 24.8 目录结构与命名

```text
project/
├── src/myapp/
│   ├── __init__.py
│   └── calc.py
├── tests/
│   ├── conftest.py            # 共享 fixture
│   ├── test_calc.py           # 与被测模块同名，一一对应
│   └── test_cli.py
└── pyproject.toml             # [tool.pytest.ini_options] 放配置
```

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q --strict-markers"
markers = ["slow: 需要几秒以上的用例"]
```

命名约定只有一条值得坚持：**测试文件与测试函数名描述「被破坏的行为」**，而不是「函数名」。`test_zero_division_raises_value_error` 比 `test_div_2` 有用得多——半年前失败时，前者直接告诉你哪里坏了。

## 24.a 与 C++ 的差别

| 维度 | Python | C++ |
| --- | --- | --- |
| 测试框架 | `unittest`（标准库）、`pytest`（事实标准） | GoogleTest、Catch2、doctest，均需引入 |
| 断言 | 运行时 `assert` / `assertXxx` | 编译期 `static_assert` + 运行时 `EXPECT_EQ` |
| 编译期检查 | 无（靠 mypy） | 类型/常量表达式在编译期就能挂 |
| mock | 运行时替换属性，无需接口 | 需虚函数/接口或模板注入，常靠代码生成 |
| 发现用例 | 按文件名/函数名前缀自动发现 | 注册宏 + 链接 + `main` 里 `RUN_ALL_TESTS()` |
| 参数化 | `@pytest.mark.parametrize` | `INSTANTIATE_TEST_SUITE_P` 宏 |
| 浮点比较 | `pytest.approx` / `assertAlmostEqual` | `EXPECT_NEAR(a, b, eps)` |
| 覆盖率 | `coverage.py`（字节码级） | gcov/llvm-cov（编译期插桩） |
| 运行命令 | `pytest -q` | 编译 + 链接 + 运行可执行文件 |

最本质的差别：C++ 的测试要**先编译**才能跑，所以反馈周期以秒计；Python 改一行就能重跑，所以鼓励「红-绿-重构」的小步循环。反过来，C++ 的编译期断言能在写代码时就挡住一类错误，Python 只能靠测试与类型检查器补位。

## 24.b 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `pytest` 报 `no tests ran` | 文件名/函数名不匹配发现规则 | 改成 `test_*.py`、`test_*` 函数 |
| 用例单独跑过、全跑就挂 | 测试间共享了可变状态 | 每次在 `setUp`/fixture 里重建数据 |
| `assertEqual` 比较浮点总失败 | 二进制浮点误差 | 用 `assertAlmostEqual` / `pytest.approx` |
| `assertRaises` 里代码没抛异常，用例却过了 | 断言写在 `with` 块外 | 断言调用必须写在 `with` 内 |
| `patch("time.time")` 无效 | 补丁打错了命名空间 | 打在「使用方模块」的名字上 |
| mock 拼错方法名仍然通过 | `MagicMock` 接受一切 | 加 `assert_called_once_with(...)` |
| 测试依赖真实网络 | 没 mock 外部调用 | `patch.object` 替换请求函数 |
| 测试跑了 3 分钟没人跑 | 大量集成/端到端用例 | 拆成单元测试 + 打 `@pytest.mark.slow` |
| 覆盖率 100% 但线上仍炸 | 只执行没断言、边界没测 | 补断言 + 边界/异常用例 |
| `tmp_path` 之外用了固定文件名 | 并发跑测试时互相覆盖 | 一切临时文件走 `tmp_path` |
| `conftest.py` 放在包内没被发现 | 位置不对 | 放项目根或 `tests/` 下 |
| 测试改了全局配置没还原 | 用了 `os.environ[...]=` 直接赋值 | 用 `monkeypatch.setenv` 自动还原 |

## 24.c 练习

**基础 1**：为 `def parse_int(s: str) -> int` 写 6 个用例：正常、负数、带空格、空串、`"3.5"`、`None`。分别断言返回值或异常类型。

验收：`python -m unittest` 全部通过；把实现改成 `return 0` 后至少 3 个用例失败。

**基础 2**：给一个「判断闰年」的 `is_leap(y)` 写参数化测试，覆盖 1900（非闰）、2000（闰）、2023、2024。

验收：`unittest` 用 `subTest` 或 `pytest` 用 `parametrize` 均可；4 条断言全过，且删掉 `% 400` 分支时有且仅有 1900/2000 两条失败。

**基础 3**：写一个函数 `now_iso()` 返回当前时间字符串，再用 mock 固定时间，断言输出恰好是 `"2024-01-01T00:00:00"`。

验收：不 mock 时输出随时间变化；mock 后断言稳定通过，且测试连跑两次结果相同。

**变式**：给读 JSON 配置的函数写测试，用 `tmp_path` 造三个文件：正常、缺字段、非法 JSON；断言三种情况的返回值或异常。

验收：三个用例互不影响，随机顺序执行（`pytest -p no:randomly` 关闭/开启）结果一致；临时文件不残留。

**挑战**：为一个「带重试的下载函数」（最多 3 次、间隔递增、全失败抛异常）写测试：全部用 mock，不产生真实网络请求，并断言「重试了 3 次」「每次间隔符合预期」。

验收：`mock.call_count == 3`；间隔断言通过（时间也被 mock）；把最大重试次数改成 5 时测试失败并指出实际调用次数。

## 24.d 小结

1. 测试是回归网 + 可执行文档：一层单元测试（多、快）+ 少量集成/端到端，比全是端到端有用得多。
2. `unittest` 够用且零依赖；`pytest` 的裸 `assert`、`fixture`、`parametrize` 让测试短一半，值得装。
3. 测四类东西——正常、边界、异常、不变量；浮点只用 `approx`，时间/网络/随机一律 mock；覆盖率看 `Missing` 行，不看百分比。

下一章处理「代码跑得慢/跑得不对」：怎么用 `pdb` 和断点定位、`traceback` 怎么读、`cProfile` 与 `timeit` 怎么找出真正的热点。
