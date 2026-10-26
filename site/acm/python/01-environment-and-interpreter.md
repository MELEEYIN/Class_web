# 01 · 环境与解释器

> **本质**：Python 程序先被**编译**成字节码（`.pyc`），再由虚拟机循环执行——它不是"边读边执行"的脚本，也不是 C++ 那种"编译成机器码再运行"的二进制。理解这一层，你就知道 `SyntaxError` 为什么在程序跑起来之前就出现，也知道 `.pyc` 和 `__pycache__` 是谁生成的。

**读完这一章你能做到**

- 在 Windows / macOS / Linux 上装好 3.10+ 的 Python，并用一条命令确认版本与解释器路径；
- 区分 `python x.py`、`python -c`、`python -m` 三种运行方式各自适合什么场景；
- 解释 `if __name__ == "__main__":` 到底在判断什么；
- 分得清"编译期错误"和"运行期错误"，遇到 `SyntaxError` 不再怀疑逻辑；
- 说出 `.pyc` 什么时候生成、为什么删了也没事。

---

## 1.1 一次运行到底发生了什么

执行 `python hello.py`，CPython 做的事分四步：

1. **读源码**，按 UTF-8 解码成文本；
2. **编译**成字节码（一种给虚拟机看的中间指令），语法错误在这一步抛出 `SyntaxError`；
3. **缓存**字节码到同目录的 `__pycache__/hello.cpython-314.pyc`（只有被 `import` 的模块才会缓存，直接运行的主脚本不缓存）；
4. **执行**字节码——一个 `while` 循环不断取下一条指令，操作各种对象。

对比 C++：`g++` 把源码变成 `hello.exe` 机器码，CPU 直接执行；Python 把源码变成字节码，由解释器"代为执行"。所以 Python **没有独立的编译步骤**，但也**不是**逐行解释——第 2 步是一次性完成的，语法错误会在任何一行执行之前全部报出来。

```pycon
>>> import sys
>>> sys.version_info.major
3
>>> type(sys)
<class 'module'>
>>> sys.maxsize
9223372036854775807
```

`sys.maxsize` 在 64 位机器上恒为 `2**63 - 1`，这是 `list` 索引、`len()` 能表达的整数上限——不是 Python 整数的上限（Python 的 `int` 没有上限，见第 03 章）。

---

## 1.2 装好并确认版本

| 平台 | 推荐做法 |
| --- | --- |
| Windows | 官网安装包（勾选 **Add python.exe to PATH**），或 `winget install Python.Python.3.12`；多版本用 `py -0p` 列出、`py -3.12 x.py` 指定 |
| macOS | `brew install python@3.12`（别动系统自带的 `/usr/bin/python3`） |
| Linux | `sudo apt install python3 python3-venv python3-pip` |

三条命令确认你装对了：

```bash
python --version          # 期望 Python 3.10 以上
python -c "import sys; print(sys.executable)"   # 打印解释器绝对路径
py -0p                    # Windows 专有：列出所有已安装版本及路径
```

**为什么必须 3.10+**：本书用到 `match` 语句（3.10）、`X | None` 类型写法（3.10）、`itertools.batched`（3.12）。用 3.8 跑会直接 `SyntaxError`，而且报错位置往往离真正的问题很远。

`sys.executable` 值得记住：它告诉你**当前这个程序用的到底是哪个 Python**。新手 90% 的"装了包装不上/模块找不到"都是因为 `pip` 和 `python` 指向了两个不同的解释器。

---

## 1.3 REPL 是最快的草稿纸

不带参数运行 `python` 进入交互式环境（REPL：读入—求值—打印—循环）：

```text
>>> 1 + 2
3
>>> _ * 10          # _ 保存上一次的结果
30
>>> for i in range(3):
...     print(i)    # 需要缩进的块，用空行结束
...
0
1
2
>>> exit()          # 或 Ctrl-Z 回车（Windows）、Ctrl-D（macOS/Linux）
```

三个必须养成的习惯：

- 想验证"这行代码到底返回什么"时，**先开 REPL**，别急着写文件跑；
- 遇到看不懂的对象，`dir(obj)` 看它有什么方法，`help(obj.method)` 看文档；
- REPL 里 `_` 是上一次的结果，调试时常用来接着算。

REPL 的局限：不能保存、不能断点、多行块容易敲错。**超过 5 行就该建文件**。

---

## 1.4 三种运行方式

| 方式 | 命令 | 适用场景 |
| --- | --- | --- |
| 跑文件 | `python main.py` | 正常开发、提交判题 |
| 跑一行 | `python -c "print(6*7)"` | 验证环境、临时计算 |
| 跑模块 | `python -m http.server 8000` | 运行"以模块形式提供入口"的工具，`-m` 会把它当模块导入，`sys.path[0]` 是当前目录而不是模块目录 |

`-m` 是新手最陌生也最有用的一种：`python -m venv .venv`、`python -m pip install x`、`python -m json.tool`、`python -m pdb x.py`、`python -m timeit`。**凡是有模块入口的工具，都应该用 `-m` 调用**，这样能保证用的是"当前这个 Python 解释器"的模块，而不是 PATH 上另一个。

```pycon
>>> import subprocess, sys
>>> out = subprocess.run([sys.executable, "-c", "print(6*7)"], capture_output=True, text=True)
>>> out.stdout.strip()
'42'
>>> out.returncode
0
```

这里把 `sys.executable` 当成"当前解释器"传给子进程，是写脚本时最稳的做法——永远不要硬编码 `"python"`。

---

## 1.5 脚本的身份：`__name__`

同一个文件，**直接运行**和**被导入**是两种身份，区别只在 `__name__`：

- 直接运行：`__name__ == "__main__"`
- 被导入：`__name__` 等于模块名（文件名去掉 `.py`）

这就是那句到处出现的 `if __name__ == "__main__":` 的全部含义——**"我是被直接运行的，不是被导入的，可以执行主流程了"**。

```python
# 示例：examples/ch01_02_main_guard.py
"""ch01_02_main_guard.py —— 被直接运行 vs 被导入，同一个文件两种身份"""


def main():
    print("main() 开始工作")
    print("这里的 __name__ =", __name__)


if __name__ == "__main__":
    main()
```

```text
main() 开始工作
这里的 __name__ = __main__
```

直接运行它，`main()` 会被调用。现在换一个文件把它**导入**：

```python
# 示例：examples/ch01_03_import_it.py
"""ch01_03_import_it.py —— 导入别人的模块：__name__ 变了，还有 .pyc"""
import importlib.util
from pathlib import Path

here = Path(__file__).parent
spec = importlib.util.spec_from_file_location("run_modes_demo", here / "ch01_02_main_guard.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)          # 导入时 main() 不会自动执行

print("导入后，对方的 __name__ =", mod.__name__)
mod.main()                            # 想跑就显式调用

pyc = sorted(p.name for p in (here / "__pycache__").glob("ch01_02*"))
print("导入产生了字节码缓存：", pyc)
```

```text
导入后，对方的 __name__ = run_modes_demo
main() 开始工作
这里的 __name__ = run_modes_demo
导入产生了字节码缓存： ['ch01_02_main_guard.cpython-314.pyc']
```

两个结论一次拿到：**导入不会触发主流程**（守卫生效），**导入会生成 `.pyc`**（缓存字节码，加速下次导入）。名字里的 `cpython-314` 是解释器标识 + 版本号，换版本就换文件名，所以多版本共存不会互相污染。

---

## 1.6 编译期错误 vs 运行期错误

这是初学者最容易误判的一类问题：**报错时间点不同，排查方向就不同**。

```python
# 示例：examples/ch01_01_interpreter.py
"""ch01_01_interpreter.py —— 解释器身份、编译期错误与运行期错误"""
import platform
import sys
from pathlib import Path


def add(a, b):
    return a + b


print("版本三元组：", sys.version_info[:3])
print("实现：", platform.python_implementation())
print("本文件运行时的 __name__：", __name__)
print("sys.path[0] 指向脚本所在目录：", Path(sys.path[0]).name)

print("--- 编译期就能发现的错 ---")
try:
    compile("def f(:\n    pass", "<demo>", "exec")
except SyntaxError as e:
    print("SyntaxError:", e.msg, "| 第", e.lineno, "行")

print("--- 编译通过、执行到才炸的错 ---")
try:
    add(1, "2")
except TypeError as e:
    print("TypeError:", e)

print("--- 另外两种运行方式，本质都是执行同一份字节码 ---")
print(add(1, 2))
```

```text
版本三元组： (3, 14, 7)
实现： CPython
本文件运行时的 __name__： __main__
sys.path[0] 指向脚本所在目录： examples
--- 编译期就能发现的错 ---
SyntaxError: invalid syntax | 第 1 行
--- 编译通过、执行到才炸的错 ---
TypeError: unsupported operand type(s) for +: 'int' and 'str'
--- 另外两种运行方式，本质都是执行同一份字节码 ---
3
```

| 类型 | 例子 | 什么时候出现 | 排查方向 |
| --- | --- | --- | --- |
| `SyntaxError` / `IndentationError` / `TabError` | 少冒号、括号没闭合、缩进不对 | 整个文件**一行都没执行**之前 | 看报错行与上一行，多半是上一行少了个 `:` 或 `)` |
| `NameError` | 用了没定义的名字 | 执行到那一行时 | 拼写、作用域（第 14 章） |
| `TypeError` / `ValueError` | 类型不对、转换失败 | 执行到那一行时 | 打印入参的 `type()` |
| `IndexError` / `KeyError` | 下标越界、键不存在 | 执行到那一行时 | 边界条件 |

`SyntaxError` 有个特征：**报错位置常常比真正的问题晚一行**。比如 `if x == 1` 少了冒号，报错会指向下一行的 `print`。看到"莫名其妙的 `SyntaxError`"，先检查**报错行和它上面一行**。

---

## 1.7 CPython 与 PyPy：什么时候该在意

| 实现 | 特点 | 适合 |
| --- | --- | --- |
| CPython | 官方实现，C 写的，生态最全 | 默认选它，所有第三方库都以它为准 |
| PyPy | 带 JIT，纯计算循环能快 3～10 倍 | 竞赛里被卡常数的纯 Python 大循环；但不支持部分 C 扩展 |

竞赛判题机几乎都是 CPython。当你在 CPython 上 TLE、而算法复杂度明明够时，去查两件事：是不是用了 `list` 的 `in`（O(n)）、是不是在循环里做字符串拼接（O(n²)）。换 PyPy 是最后手段，而且很多 OJ 不提供。

---

## 1.8 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 执行方式 | 编译成机器码，CPU 直接跑 | 编译成字节码，虚拟机循环执行 |
| 构建步骤 | `g++ -o a a.cpp` | 无，`python a.py` 一步到底（`.pyc` 是自动缓存） |
| 语法检查时机 | 编译期 | 编译期（整个文件），但**类型错误只能等运行时** |
| 入口 | 必须有 `main()` | 没有 `main`，语句按缩进顺序直接执行；约定写 `main()` + 守卫 |
| 类型检查 | 静态、强制 | 动态、运行时；注解不参与检查（第 20 章） |
| 速度 | 快（1×） | 慢（常见 10～100×），靠内置函数与库补 |
| 编译产物 | `.exe` / `.o` | `__pycache__/*.pyc`，删掉会自动重建 |

---

## 1.9 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `'python' 不是内部或外部命令` | 安装时没勾 PATH | 重装并勾选，或用 `py x.py` |
| `pip install` 成功但 `import` 报 `ModuleNotFoundError` | `pip` 和 `python` 不是同一个解释器 | `python -m pip install 包名` |
| 脚本名叫 `random.py` / `json.py`，导入标准库就崩 | 当前目录的 `sys.path[0]` 优先，遮蔽了标准库 | 改名，删掉同名 `.pyc` |
| 双击 `.py` 窗口一闪而过 | 程序跑完就关闭 | 在终端里跑，或末尾 `input("按回车退出")` |
| 输出中文变乱码 | 控制台代码页不是 UTF-8 | `chcp 65001`，或设 `PYTHONIOENCODING=utf-8` |
| `python -m 模块` 报 `No module named` | `-m` 的搜索路径是当前目录，不是脚本目录 | 在项目根目录执行，或 `cd` 到正确位置 |
| 改了代码但行为没变 | 跑的是另一个文件，或导入的是旧的 `.pyc` | 打印 `__file__` 确认在跑哪个文件 |
| `SyntaxError` 指向的行看起来没问题 | 问题在上一行（少冒号、括号没闭合） | 检查报错行的**上一行** |

---

## 1.10 练习

**1.（环境自检）** 写一个 `env.py`，打印三行：解释器版本三元组、实现名称、`sys.executable` 的**文件名**（不是全路径）。

验收：形如 `(3, 12, 4)` / `CPython` / `python.exe`，且能在终端里用 `python env.py` 跑通。

**2.（三种运行方式）** 分别用 `python -c` 和 `python -m` 完成一件事：`-c` 算 `2**100` 的位数，`-m` 启动一个静态文件服务器（提示：`python -m http.server`）。

验收：`-c` 输出 `31`；`-m` 能在浏览器打开 `http://localhost:8000`。

**3.（守卫）** 把练习 1 的 `env.py` 改成"既能直接运行打印环境，又能被其他文件导入后调用 `show()` 打印环境"。

验收：`python env.py` 打印一次；另一个文件 `import env` 时不打印，调用 `env.show()` 才打印。

**4.（变式）** 故意写一个 `SyntaxError`（比如少一个右括号），观察报错的行号，再写一个 `TypeError`，比较两者出现时机。

验收：能说清"前者一行都没执行，后者前面的 `print` 已经执行了"。

**5.（挑战）** 写 `run_once.py`：里面的 `main()` 会写一行日志到 `run.log`（追加模式）。要求无论被直接运行多少次、被导入多少次，**每次进程只写一行**。

验收：`python run_once.py && python run_once.py` 之后 `run.log` 恰好 2 行；被导入时不写。

---

## 1.11 小结

1. **Python 是"编译到字节码 + 虚拟机执行"**：语法错误在运行前全部抛出，类型错误只能等执行到那一行。
2. **`python`、`python -m`、`python -c` 是三种入口**，装包一律用 `python -m pip` 保证解释器一致。
3. **`if __name__ == "__main__":` 判断的是"我是不是主程序"**，这是让文件既能跑又能被导入的唯一标准写法。

下一章进入 Python 最"冒犯"C++ 程序员的地方：**缩进就是语法**，以及由此带来的一整套排版规则。
