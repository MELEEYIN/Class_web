# 02 · 缩进与基础语法

> **本质**：Python 用**缩进代替花括号**来表达"哪些语句属于同一个块"。所以缩进不是排版喜好，而是语法本身——它错了，程序连编译都过不去，报的还是语法错误而不是格式错误。

**读完这一章你能做到**

- 写出缩进正确的多层嵌套代码，并且一眼看出 `IndentationError` / `TabError` 的原因；
- 分清"隐式续行（括号）"和"显式续行（反斜杠）"，知道为什么优先用前者；
- 说清注释、文档字符串、三引号字符串三者的区别；
- 正确使用 `print(sep=, end=)`，并知道 `input()` 永远返回字符串；
- 随手写出一个带 `main()` 和 `__name__` 守卫的完整程序模板。

---

## 2.1 语句、换行，以及那个可有可无的分号

Python 的语句以**换行**结束，不需要分号。分号只在一种情况下合法——把多条语句压到一行：

```pycon
>>> a = 1; b = 2; print(a + b)
3
>>> a = 1
>>> b = 2
>>> a + b
3
```

第二段是正常写法。第一段能跑，但 PEP 8 明确不建议（除了 `x = 1; y = 2` 这种极短的初始化）。也不要写行尾分号——它无害但没意义，反而让从 C++ 过来的人以为"必须加分号"。

这里顺带看清**语句**和**表达式**的差别：表达式会**产生一个值**，语句不会。

```pycon
>>> 2 + 3 * 4
14
>>> print(2 + 3 * 4)
14
>>> x = print("print 是有副作用的语句")
print 是有副作用的语句
>>> x is None
True
```

REPL 里裸写 `2 + 3 * 4` 会自动回显 `14`，这是因为**表达式有值**；`print(...)` 回显不出东西，因为它的返回值是 `None`。这条区别在第 11 章（lambda 只能写表达式）、第 09 章（推导式只能是表达式）里会反复用到。

---

## 2.2 缩进是语法的骨架

规则只有四条：

1. **冒号** `:` 结束一个头部（`if` / `for` / `while` / `def` / `class` / `try` / `with`），下一行起进入一个块；
2. 同一个块内，每行缩进**必须完全相同**；
3. 块的结束靠**减少缩进**表示（回到上一层的缩进量）；
4. 缩进量由你定，但**全项目统一用 4 个空格**是 PEP 8 的硬性建议。

```python
# 片段：三层嵌套，看缩进如何表达"归属"
def grade(score):
    if score >= 90:                 # 第 1 层
        level = "A"
        if score == 100:            # 第 2 层
            level = "A+"
    else:                           # 回到第 1 层
        level = "B"
    return level
```

`level = "A+"` 属于 `if score == 100`；`return level` 的缩进退回函数体那一层，所以它属于 `grade`，不属于任何 `if`。**在 C++ 里这两行会因为花括号位置不同而语义不同，缩进却可以是任意丑的；在 Python 里缩进就是语义，长得一样就是同一层。**

---

## 2.3 缩进错误的四种真身

把这四种错误放在一起看，比一条条背有用：

```python
# 示例：examples/ch02_03_errors.py
"""ch02_03_errors.py —— 缩进错误的四种真身"""

cases = {
    "缺少缩进": "if True:\nprint(1)",
    "多余缩进": "print(1)\n    print(2)",
    "缩进对不上": "if True:\n    print(1)\n  print(2)",
    "Tab 与空格混用": "if True:\n\tprint(1)\n        print(2)",
}

for name, src in cases.items():
    try:
        compile(src, "<demo>", "exec")
        print(f"{name}: 通过了（这是意外）")
    except (IndentationError, TabError) as e:
        print(f"{name}: {type(e).__name__}: {e.msg}")
```

```text
缺少缩进: IndentationError: expected an indented block after 'if' statement on line 1
多余缩进: IndentationError: unexpected indent
缩进对不上: IndentationError: unindent does not match any outer indentation level
Tab 与空格混用: TabError: inconsistent use of tabs and spaces in indentation
```

`compile()` 在这里当"照妖镜"用：它把一段字符串当源码编译，语法错误立刻暴露，而且不用真的执行。这也是 IDE 和 linter 检查你代码的原理。

`TabError` 是 `IndentationError` 的子类，专门抓"一行用 Tab、另一行用空格凑出相同视觉宽度"的情况——肉眼完全看不出区别，这就是为什么**永远不要用 Tab 缩进 Python**。VS Code 里把 `editor.insertSpaces` 设为 `true`、`tabSize` 设为 `4` 即可。

> **⚠️ 易错** 复制粘贴网页代码时最常见的翻车：原文用 Tab，你本地用空格，看起来对齐，一跑就 `TabError: inconsistent use of tabs and spaces in indentation`。修法不是手动改缩进（改不干净），而是让编辑器"显示空白字符"后整段重排。

---

## 2.4 续行：优先括号，反斜杠兜底

一行太长要换行，两种办法：

```pycon
>>> total = (1 +
...          2 +
...          3)
>>> total
6
>>> other = 1 + \
...         2
>>> other
3
```

括号（`()`、`[]`、`{}`）内**可以随便换行，包括注释**，这叫**隐式续行**，是官方推荐的排版方式——函数调用、长表达式、字典字面量都靠它。

反斜杠 `\` 是**显式续行**，只在个别没法加括号的地方才用（例如长 `assert`、长 `with` 的早期写法）。反斜杠后面**不能有任何字符**（包括空格和注释），否则续行失效并直接报 `SyntaxError`。这就是"能用括号就别用反斜杠"的实际理由。

```python
# 片段：隐式续行 + 缩进对齐，PEP 8 推荐的排版
result = some_function(arg_one,
                       arg_two,
                       keyword=value)
```

---

## 2.5 注释、文档字符串与 `pass`

```python
# 示例：examples/ch02_02_docstring.py
"""ch02_02_docstring.py —— 文档字符串不是注释"""
import math


def area(r):
    """返回半径为 r 的圆面积。

    参数 r 必须为正数；否则返回 None。
    """
    if r <= 0:
        return None
    return math.pi * r * r


def nothing():
    pass                            # 空块必须用 pass 占位


print("第一行文档：", area.__doc__.splitlines()[0])
print("第二行文档：", area.__doc__.splitlines()[1])
print("area(2) =", round(area(2), 4))
print("area(-1) =", area(-1))
print("nothing() =", nothing())

print("模块自己的 __doc__：", __doc__)

text = """这只是一个普通的多行字符串，
不赋值给函数的第一条语句时，它就不是文档字符串。"""
print("行数：", text.count("\n") + 1)
```

```text
第一行文档： 返回半径为 r 的圆面积。
第二行文档： 
area(2) = 12.5664
area(-1) = None
nothing() = None
模块自己的 __doc__： ch02_02_docstring.py —— 文档字符串不是注释
行数： 2
```

三种"看起来像注释"的东西，作用完全不同：

| 形式 | 是什么 | 存不存在于运行时 | 用途 |
| --- | --- | --- | --- |
| `# 文字` | 注释 | 不存（编译时丢弃） | 解释"为什么这么写" |
| 函数/类/模块的**第一句** `"""…"""` | 文档字符串（docstring） | 存在，挂在 `__doc__` | `help()` 的来源，写接口说明 |
| 任意位置的 `"""…"""` | 普通字符串字面量 | 存（若被使用） | 多行文本、SQL、正则 |

`area.__doc__` 里保留了换行和缩进，所以取第一行要用 `splitlines()[0]`。**给每个公开函数写一句 docstring**是唯一值得坚持的注释规则：它会被 `help()`、IDE 悬停、`pydoc` 直接读出来。而 `#` 注释应该解释**意图**，不是复述代码（`i += 1  # i 加 1` 是噪声）。

`pass` 是"什么都不做"的占位语句。Python 的块不能为空，所以：

```pycon
>>> def todo():
...     pass
>>> todo() is None
True
>>> class Empty:
...     pass
>>> Empty.__name__
'Empty'
```

---

## 2.6 编码：源码是 UTF-8，输入输出另算

Python 3 的源文件**默认 UTF-8**，不需要 `# -*- coding: utf-8 -*-`（那是 Python 2 的遗留物，看到它说明你在抄十年前的代码）。

```pycon
>>> import sys
>>> sys.getdefaultencoding()
'utf-8'
>>> "中文".encode("utf-8")
b'\xe4\xb8\xad\xe6\x96\x87'
```

但**读写文件**和**控制台输出**的编码是另一回事：`open()` 不指定 `encoding` 时用系统默认（Windows 上常是 GBK/CP936），这就是"在我电脑上好好的，到别人电脑上 `UnicodeDecodeError`"的来源。规矩很简单：**凡是 `open()` 都显式写 `encoding="utf-8"`**（第 17 章）。控制台乱码则设环境变量 `PYTHONIOENCODING=utf-8`，或 `chcp 65001`。

---

## 2.7 `print` 的参数与 `input` 的返回值

```pycon
>>> print("a", "b", "c")
a b c
>>> print("a", "b", "c", sep="-")
a-b-c
>>> print("x", "y", sep=", ", end="!\n")
x, y!
>>> print()
```

- `sep` 决定多个参数之间插什么（默认一个空格），`end` 决定结尾加什么（默认换行）；
- `print()` 无参数就输出一个空行；
- 竞速题里 `print(*ans, sep="\n")` 一次输出整个列表，比循环 `print` 快得多。

`input(prompt)` 读一行，**永远返回 `str`**，而且**去掉行尾换行符**。所以：

```python
# 片段：一次读两个整数
a, b = map(int, input().split())
```

`map(int, ...)` 把每个片段转成整数；`split()` 无参数按任意空白切分。不写 `int()` 就会变成 `"1" + "2" == "12"` 这种"看不见的类型错误"。输入结束（EOF）时 `input()` 抛 `EOFError`，所以刷题时常用 `sys.stdin.read().split()` 一次性读完（第 17 章）。

---

## 2.8 一个可以当模板的最小程序

```python
# 示例：examples/ch02_04_template.py
"""ch02_04_template.py —— 一个可以直接抄去用的最小程序模板"""
import sys


def solve(a: int, b: int) -> int:
    """返回两个整数之和。"""
    return a + b


def main() -> None:
    data = sys.stdin.read().split()
    if not data:                    # 没有输入时走演示分支，方便直接运行
        print("没有输入，走演示分支")
        print(solve(1, 2))
        return
    a, b = int(data[0]), int(data[1])
    print(solve(a, b))


if __name__ == "__main__":
    main()
```

```text
没有输入，走演示分支
3
```

四个要点：**读入集中在一个函数**（`main`）、**计算集中在另一个函数**（`solve`，方便单独测试）、**守卫保证导入无副作用**、**没有全局变量**。这个形状可以套用到任何一题。

---

## 2.9 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 块的边界 | `{}` | 缩进（4 空格） |
| 语句结束 | `;` 必需 | 换行即可，`;` 只能压行 |
| 缩进错了 | 只是难看，编译照过 | `IndentationError`，编译不通过 |
| 长行换行 | 自由，编译器不管 | 括号内自由；反斜杠必须行尾无字符 |
| 注释 | `//`、`/* */` | `#`（无块注释，用 `"""` 字符串代替） |
| 文档 | 注释或 Doxygen | docstring 挂在 `__doc__`，`help()` 可读 |
| 空块 | `{}` 或 `;` | `pass` |
| 程序入口 | `int main()` 固定 | 无入口，自上而下执行；约定 `main()` + 守卫 |

---

## 2.10 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `IndentationError: expected an indented block after 'if' statement` | 冒号后没有缩进 | 冒号下一行缩进 4 空格 |
| `IndentationError: unexpected indent` | 没有头部却缩进了 | 检查是否多了一层缩进 |
| `IndentationError: unindent does not match any outer indentation level` | 减缩进时没退回任何已有层级 | 对齐到某个已有的层级 |
| `TabError: inconsistent use of tabs and spaces` | Tab 与空格混用 | 全文件替换为 4 空格 |
| `SyntaxError` 指向的行看着没问题 | 真正的问题在上一行（少 `:`、括号未闭合） | 检查上一行 |
| 反斜杠续行后报 `SyntaxError` | `\` 后面有空格或注释 | 删掉 `\` 后的所有字符，或改用括号 |
| `int(input())` 遇到空行崩 | `input()` 返回 `""`，`int("")` 抛 `ValueError` | 先判空，或改用 `sys.stdin.read().split()` |
| 输出多了一个空行 / 少了换行 | `print` 默认 `end="\n"`，与 `end=""` 混用 | 统一约定结尾换行 |
| 中文注释乱码 | 文件不是 UTF-8 存的 | 编辑器另存为 UTF-8（无 BOM） |
| 复制来的代码报 `SyntaxError: invalid syntax. Is this intended to be part of the string?` | 字符串里用了同种引号嵌套 | 外层用单引号或转义 |

---

## 2.11 练习

**1.（缩进判断）** 下面这段代码会报什么错？为什么？动手验证。

```python
# 片段
def f():
    if True:
        print("a")
      print("b")
```

验收：能说出错误类型、原因，并给出两种正确写法（对齐到 `if` 层或 `print("a")` 层）。

**2.（续行）** 把下面这行改写成用隐式续行的漂亮写法（每行不超过 40 字符）：

```python
# 片段
result = compute(alpha=1, beta=2, gamma=3, delta=4, epsilon=5)
```

验收：`python -c "compile(open('x.py').read(), 'x', 'exec')"` 不报错，且行尾没有反斜杠。

**3.（docstring）** 给 `ch02_04_template.py` 的 `solve` 补一段 docstring，说明参数、返回值、异常情况，然后用 `help()` 打印出来。

验收：`help(solve)` 能看到完整说明，且 `solve.__doc__` 非空。

**4.（变式）** 写 `greet()`：不接收参数时返回 `"你好"`，接收一个名字时返回 `"你好，X"`（X 是传入的名字）。用两种方式实现：一次用两个 `def` 重载式写法，一次用默认参数。

验收：`greet()` 得 `"你好"`，`greet("小明")` 得 `"你好，小明"`，并说明为什么 Python 不能像 C++ 那样写两个同名 `greet`。

**5.（挑战）** 实现一个"安全的读入"函数 `read_ints()`：从标准输入读到 EOF，返回所有整数的列表，忽略空白行，遇到非整数时**跳过该行并在 stderr 打印警告**。

验收：输入 `1 2\n\nabc\n3\n` 时返回 `[1, 2, 3]`，且 stderr 出现一条含 `abc` 的警告；直接运行无输入时返回 `[]` 不崩溃。

---

## 2.12 小结

1. **缩进就是语法**：冒号开块、同级缩进必须一致、减缩进表示出块；缩进错了是 `SyntaxError` 家族，不是格式警告。
2. **长行优先用括号隐式续行**，反斜杠只在没别的办法时用；注释用 `#`，接口说明用 docstring。
3. **`print` 有 `sep`/`end`，`input()` 永远返回字符串**；一个"读入函数 + 计算函数 + 守卫"的模板能套所有题。

下一章处理最常见的语义差异：**变量到底是什么**——为什么 `b = a` 之后改 `b` 会连带改掉 `a`。
