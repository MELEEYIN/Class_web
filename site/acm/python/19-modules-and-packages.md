# 19 · 模块与包：导入机制

> **本质**：`import` 不是「把文件内容抄进来」，而是一次在 `sys.modules` 字典里查表、必要时执行模块体、然后把**模块对象**绑到你当前命名空间的函数调用。

**读完这一章你能做到**

1. 说清 `import x` 的四个步骤，知道第二次 `import` 为什么不再执行代码。
2. 分清 `import pkg.sub` 与 `from pkg import sub` 各自绑定了什么名字。
3. 写出带 `__init__.py`、能 `python -m` 运行的包，并解释相对导入什么时候会失败。
4. 看懂 `ImportError: cannot import name 'X' from partially initialized module`，用三种办法拆掉循环依赖。
5. 按 PEP 8 组织一个项目的目录与导入顺序，不再把 `sys.path.append` 当万能药。

## 19.1 `import` 到底做了什么

执行 `import pkgdemo` 时，CPython 按顺序做四件事：

1. 查 `sys.modules`——已有就直接取出来，**模块体不再执行**。
2. 没有就交给 `importlib` 的查找器，沿 `sys.path` 找到模块（或包的 `__init__.py`）。
3. 新建一个 `module` 对象，塞进 `sys.modules`，然后**执行模块体的顶层代码**（`def`、`class`、赋值都在这时发生）。
4. 在**当前**命名空间里绑定名字（`import pkgdemo` 绑的是 `pkgdemo` 这个名字）。

```pycon
>>> import math, sys
>>> type(math).__name__
'module'
>>> math is sys.modules["math"]
True
>>> math.__name__
'math'
>>> "sqrt" in dir(math)
True
```

「模块就是对象」是理解一切的前提：它能被赋值、放进列表、当参数传。`sys.modules` 是一个普通字典——所以「删除缓存再导入」这种操作是可行且危险的（第 19.8 节）。

第 1 步的缓存是性能与语义的双重保证。`importlib.reload` 会**重新执行模块体**，但改的是同一个模块对象的 `__dict__`，身份不变：

```pycon
>>> import json, importlib
>>> importlib.reload(json) is json
True
>>> json.__name__
'json'
```

```python
# 示例：examples/ch19_01_module_basics.py
"""ch19_01_module_basics.py —— 模块是对象、导入缓存与名字绑定"""

import importlib
import sys
from pathlib import Path

import pkgdemo
from pkgdemo.shapes import Circle

print("sys.path[0] 的目录名：", Path(sys.path[0]).name)
print("本脚本的 __name__：", __name__)
print("被导入模块的 __name__：", pkgdemo.__name__)
print("包暴露的名字 __all__：", pkgdemo.__all__)
print("包的 __path__ 是普通列表：", isinstance(pkgdemo.__path__, list),
      "| 目录名：", [Path(p).name for p in pkgdemo.__path__])

print("=== 同一个模块只执行一次 ===")
print("sys.modules 里缓存的就是它：", sys.modules["pkgdemo"] is pkgdemo)
import pkgdemo as again

print("再 import 一次拿到同一个对象：", again is pkgdemo)
print("子模块会变成包的属性：", pkgdemo.shapes.__name__)

print("=== reload 重新执行模块体，但对象不变 ===")
importlib.reload(pkgdemo)
print("reload 之后还是同一个对象：", sys.modules["pkgdemo"] is pkgdemo)

print("=== 四种导入写法指向同一个类 ===")
import pkgdemo.shapes as sh
from pkgdemo.utils import area_table

print("直接导入的类就是子模块里的类：", Circle is sh.Circle)
print("包属性访问也是同一个：", pkgdemo.shapes.Circle is Circle)
print("工具函数结果：", area_table())
print("shapes 的公开名字：", [n for n in dir(sh) if not n.startswith("_")])
```

```text
[pkgdemo] 包体执行了，__name__=pkgdemo
sys.path[0] 的目录名： examples
本脚本的 __name__： __main__
被导入模块的 __name__： pkgdemo
包暴露的名字 __all__： ['Circle', 'Square', 'area_table']
包的 __path__ 是普通列表： True | 目录名： ['pkgdemo']
=== 同一个模块只执行一次 ===
sys.modules 里缓存的就是它： True
再 import 一次拿到同一个对象： True
子模块会变成包的属性： pkgdemo.shapes
=== reload 重新执行模块体，但对象不变 ===
[pkgdemo] 包体执行了，__name__=pkgdemo
reload 之后还是同一个对象： True
=== 四种导入写法指向同一个类 ===
直接导入的类就是子模块里的类： True
包属性访问也是同一个： True
工具函数结果： [('circle r=2', 12.57), ('square a=2', 4)]
shapes 的公开名字： ['Circle', 'Square', 'math']
```

看输出里的两处 `[pkgdemo]`：第一次是 `import pkgdemo` 触发，第二次是 `reload` 触发。中间那次 `import pkgdemo as again` 什么也没打印——它走了缓存。`importlib.reload` 在调试交互式脚本时有用，在生产代码里几乎总是错的选择：旧对象还持有旧函数，模块处于「一半新一半旧」的状态。

> **💡 提示**：`import` 的代价集中在「第一次」：找文件 + 编译 `.py` → `.pyc` + 执行模块体。所以把 `import` 放在文件顶部不会拖慢循环里的代码，只是拖慢启动。反过来，把 `import` 塞进热循环里每次都要查一次 `sys.modules`（虽是字典查询，但仍有开销）。

## 19.2 五种导入写法与它们绑定什么

| 写法 | 绑定的名字 | 能直接用的 | 什么时候用 |
| --- | --- | --- | --- |
| `import math` | `math` | `math.sqrt` | 最清楚，首选 |
| `import numpy as np` | `np` | `np.array` | 名字长或有社区约定 |
| `import xml.etree.ElementTree` | `xml` | `xml.etree.ElementTree.X` | 少见，容易踩坑 |
| `from math import sqrt` | `sqrt` | `sqrt` | 短名字、频繁使用 |
| `from math import sqrt as s` | `s` | `s` | 避免与本地名字冲突 |
| `from math import *` | 全部公开名 | 直接用 | 只在交互式环境，代码里禁用 |

第三行是最容易误判的一行：`import a.b.c` 只把 **`a`** 绑进你的命名空间，`b`、`c` 只是挂在模块对象上。

```pycon
>>> import xml.etree.ElementTree
>>> xml.etree.ElementTree.__name__
'xml.etree.ElementTree'
>>> try:
...     etree
... except NameError as e:
...     print(type(e).__name__, e)
NameError name 'etree' is not defined
>>> from xml.etree import ElementTree
>>> ElementTree.__name__
'xml.etree.ElementTree'
```

`from ... import ...` 拿到的是**同一个对象**，不是拷贝——两个模块共享同一个函数、同一个类、同一个模块级变量：

```pycon
>>> from math import sqrt
>>> import math
>>> sqrt is math.sqrt
True
>>> import importlib
>>> m1 = importlib.import_module("collections.abc")
>>> m1 is importlib.import_module("collections.abc")
True
```

`from x import *` 的实际行为由 `x.__all__` 决定：有 `__all__` 就只导入列表里的名字，没有就导入所有不以 `_` 开头的名字。

```pycon
>>> import os
>>> isinstance(os.__all__, list) and "path" in os.__all__
True
```

## 19.3 `__name__`、`__file__` 与主程序守卫

每个模块都有几个自动填充的属性：

| 属性 | 值 | 用途 |
| --- | --- | --- |
| `__name__` | 被导入时是模块名，直接运行时是 `"__main__"` | 判断「我是不是被当程序跑」 |
| `__file__` | 源文件路径 | 定位同目录资源 |
| `__doc__` | 模块文档字符串 | 帮助信息 |
| `__package__` | 所属包名，顶层模块为 `""` | 相对导入的锚点 |
| `__path__` | 只有**包**才有，子模块搜索目录 | 区分包与普通模块 |
| `__dict__` | 模块的全局命名空间 | 反射、动态注册 |

守卫语句的全部作用是：**同一份代码，既能被 import 复用，又能被直接运行**。

```pycon
>>> src = "print('__name__ =', __name__)"
>>> exec(compile(src, "<s>", "exec"), {"__name__": "__main__"})
__name__ = __main__
>>> exec(compile(src, "<s>", "exec"), {"__name__": "mymod"})
__name__ = mymod
```

两行 `exec` 模拟了两种运行方式：直接跑时 `__name__` 是 `"__main__"`，被导入时是模块名。所以

```python
# 片段
def main():
    ...

if __name__ == "__main__":
    main()
```

的意思是「只有我当主角时才跑 `main()`；被 import 时只提供函数」。**没有这层守卫，导入即执行**——包括发请求、写文件、连数据库。

> **⚠️ 易错**：`if __name__ == "__main__"` 写成 `if __name__ is "__main__"` 也可能「恰好」成立（短字符串驻留），但这是未定义行为，换个解释器就失效。字符串比较永远用 `==`。

## 19.4 包：带 `__path__` 的模块

**包就是有 `__path__` 属性的模块**。`mypkg/__init__.py` 执行后产生的模块对象，`__name__` 是 `"mypkg"`，`__path__` 是 `["…/mypkg"]`，于是 Python 知道「再往里找子模块时去这个目录搜」。

`__init__.py` 可以做四件事，按推荐顺序：

1. **只放文档字符串和版本号**（最安全，导入无副作用）。
2. **导出租**：`from .shapes import Circle`，让用户写 `from pkgdemo import Circle` 而不是 `from pkgdemo.shapes import Circle`。
3. 定义 `__all__`，控制 `from pkgdemo import *`。
4. 做初始化（注册插件、配置日志）——**代价是 import 就有副作用**，能不做就不做。

```python
# 示例：examples/ch19_02_package_imports.py
"""ch19_02_package_imports.py —— 包结构、__init__ 的职责与 __all__"""

import sys

import pkgdemo
from pkgdemo import utils
from pkgdemo.shapes import Square

print("包版本：", pkgdemo.VERSION)
print("__init__ 预先导入了子模块：", "shapes" in dir(pkgdemo))
print("导入 utils 后它也成了包的属性：", "utils" in dir(pkgdemo))
print("相对导入解析出的仍是同一个模块：", utils.Circle is pkgdemo.shapes.Circle)

print("=== __all__ 决定 from pkg import * 拿什么 ===")
ns = {}
exec("from pkgdemo import *", ns)
print("星号导入得到的名字：", sorted(k for k in ns if not k.startswith("__")))
print("没写进 __all__ 的 VERSION 不在里面：", "VERSION" in ns)

print("=== 主程序的 __name__ 是 __main__ ===")
print("本脚本 __name__：", __name__)
print("sys.modules['__main__'] 就是本脚本：", sys.modules["__main__"].__name__ == "__main__")
print("被导入的包不会显示为 __main__：", pkgdemo.__name__)

print("=== 子模块的公开接口 ===")
print("Square(3).area()：", Square(3).area())
print("utils 只暴露一个函数：", [n for n in dir(utils) if not n.startswith("_")])
```

```text
[pkgdemo] 包体执行了，__name__=pkgdemo
包版本： 1.0
__init__ 预先导入了子模块： True
导入 utils 后它也成了包的属性： True
相对导入解析出的仍是同一个模块： True
=== __all__ 决定 from pkg import * 拿什么 ===
星号导入得到的名字： ['Circle', 'Square', 'area_table']
没写进 __all__ 的 VERSION 不在里面： False
=== 主程序的 __name__ 是 __main__ ===
本脚本 __name__： __main__
sys.modules['__main__'] 就是本脚本： True
被导入的包不会显示为 __main__： pkgdemo
=== 子模块的公开接口 ===
Square(3).area()： 9
utils 只暴露一个函数： ['Circle', 'Square', 'area_table']
```

输出里 `__init__` 预先导入了子模块：`True` 一行说明「导出租」的副作用——`import pkgdemo` 会连带执行 `shapes.py` 与 `utils.py`。包越大，启动越慢。这就是 `import numpy` 要几百毫秒的原因。

`__all__` 只影响星号导入，**不影响** `pkgdemo.Circle` 这种显式访问：

```pycon
>>> ns = {}
>>> exec("from os import *", ns)
>>> "path" in ns and "sep" in ns
True
>>> "sys" in ns
False
```

目录结构对照（`pkgdemo` 是本例的真实结构）：

```text
examples/
├── pkgdemo/
│   ├── __init__.py      # 包体：导出租、版本号、__all__
│   ├── __main__.py      # python -m pkgdemo 的入口
│   ├── shapes.py        # 叶子模块：只依赖标准库
│   └── utils.py         # 上层模块：用相对导入复用 shapes
├── ch19_01_module_basics.py
└── ch19_02_package_imports.py
```

## 19.5 相对导入与绝对导入

包内模块之间互相引用，有两种写法：

```python
# 片段：pkgdemo/utils.py 里
from .shapes import Circle        # 相对：当前包内的 shapes
from ..other import helper        # 相对：上一级包
from pkgdemo.shapes import Circle # 绝对：从顶层包名开始
```

**推荐绝对导入**：一眼能看出依赖来自哪里，移动文件时不用改。相对导入只有一个优势——包改名时不用动。`from . import shapes` 和 `from .shapes import Circle` 的区别只是绑定 `shapes` 还是 `Circle`。

相对导入的锚点是 `__package__`，没有包上下文就无从解析：

```text
ImportError: attempted relative import with no known parent package
```

```python
# 示例：examples/ch19_03_import_tricks.py
"""ch19_03_import_tricks.py —— python -m、相对导入失败与循环导入"""

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")


def run(args):
    r = subprocess.run([sys.executable] + args, cwd=HERE, capture_output=True,
                       text=True, encoding="utf-8", env=ENV)
    return r.returncode, r.stdout, r.stderr


print("=== python -m pkgdemo：把包当程序跑 ===")
code, out, err = run(["-m", "pkgdemo"])
print("退出码：", code)
print(out.rstrip())

print("=== 直接运行包内模块：相对导入必然失败 ===")
code, out, err = run([str(HERE / "pkgdemo" / "utils.py")])
print("退出码：", code)
print([n for n in err.splitlines() if n.startswith("ImportError")][-1])

print("=== 循环导入：报错发生在「拿不到名字」的那一刻 ===")
tmp = tempfile.mkdtemp()
p = Path(tmp)
(p / "a_cyc.py").write_text("import b_cyc\nX = 1\n", encoding="utf-8")
(p / "b_cyc.py").write_text("from a_cyc import X\n", encoding="utf-8")
sys.path.insert(0, tmp)
try:
    import a_cyc
except ImportError as e:
    print(type(e).__name__ + ":", str(e).rsplit(" (", 1)[0])
finally:
    sys.path.remove(tmp)
    shutil.rmtree(tmp)
    sys.modules.pop("a_cyc", None)
    sys.modules.pop("b_cyc", None)

print("=== 清理后 sys.modules 里没有残留 ===")
print("a_cyc" in sys.modules, "b_cyc" in sys.modules)
```

```text
=== python -m pkgdemo：把包当程序跑 ===
退出码： 0
[pkgdemo] 包体执行了，__name__=pkgdemo
[__main__] 通过 python -m pkgdemo 运行
包的 __name__ 是 pkgdemo，而本文件是： __main__
r=1 的圆面积： 3.1416
=== 直接运行包内模块：相对导入必然失败 ===
退出码： 1
ImportError: attempted relative import with no known parent package
=== 循环导入：报错发生在「拿不到名字」的那一刻 ===
ImportError: cannot import name 'X' from partially initialized module 'a_cyc' (most likely due to a circular import)
=== 清理后 sys.modules 里没有残留 ===
False False
```

「退出码：1」那一段就是直接 `python pkgdemo/utils.py` 的结果：此时 `utils.py` 的 `__name__` 是 `"__main__"`、`__package__` 是 `None`，`.` 无从解析，直接报错。正确做法是 `python -m pkgdemo.utils`——由解释器先建立包上下文。

> **⚠️ 易错**：报这个错时，99% 的情况不是「文件放错了」，而是**运行方式错了**。把 `python 包/模块.py` 改成 `python -m 包.模块`，或者在项目根目录运行。

## 19.6 `python -m` 与 `python file.py`

同一个文件，两种启动方式差别很大：

| | `python file.py` | `python -m pkg.mod` |
| --- | --- | --- |
| `sys.path[0]` | 脚本所在目录 | 当前工作目录 `""` |
| `__name__` | `"__main__"` | `"__main__"` |
| `__package__` | `None` 或 `""` | `"pkg"`（相对导入可用） |
| 能 import 到项目里的其它包 | 只有当脚本目录恰好是项目根时 | 只要在项目根运行就行 |
| 包入口 | 不适用 | 找 `pkg/__main__.py` |

`python -m pkgdemo` 的执行链是：导入 `pkgdemo`（跑 `__init__.py`）→ 找到 `__main__.py` → 以 `__name__ = "__main__"` 执行它。所以输出里先有包体那一行，才有 `[__main__]` 那两行。

`-m` 的另一个常见用途是跑标准库工具：`python -m json.tool data.json`、`python -m http.server`、`python -m venv .venv`、`python -m pytest`（第 23、24 章）。

## 19.7 `sys.path` 是什么，别乱改

`sys.path` 是一个字符串列表，导入查找器按顺序遍历它。构成（按优先级）：

| 位置 | 内容 | 何时出现 |
| --- | --- | --- |
| `sys.path[0]` | 脚本目录；用 `-m` 时是 `""`（当前目录） | 总是 |
| 环境变量 `PYTHONPATH` | 若干目录 | 设置时 |
| 标准库目录 | `lib/python3.x` | 总是 |
| `site-packages` | 三方库 | 总是（除非 `-S`） |
| `.pth` 文件里的额外目录 | 由三方包写入 | 视安装情况 |

```pycon
>>> import sys
>>> len(sys.path) >= 3
True
>>> sys.path.insert(0, "/tmp") is None
True
>>> sys.path[0]
'/tmp'
>>> sys.path.pop(0)
'/tmp'
```

改 `sys.path` 能立刻生效，所以很多人拿它当救命稻草。代价是：**同一份代码在不同机器上导入到不同的模块**，而且顺序不同结果不同。正经做法是把项目根（或包目录的父目录）通过安装成可编辑包（`pip install -e .`）或设置 `PYTHONPATH` 解决，而不是在代码里 `sys.path.append("..")`。

## 19.8 循环导入

`a.py` 导入 `b.py`，`b.py` 又导入 `a.py`。Python 不会死循环——它在**执行模块体之前**就把空模块放进 `sys.modules`，第二次导入拿到的是那个「半成品」。于是报错点不在 `import` 语句，而在**你试图从半成品里取名字的那一刻**：

```pycon
>>> import sys, tempfile, shutil, pathlib
>>> d = tempfile.mkdtemp()
>>> p = pathlib.Path(d)
>>> _ = (p / "a_cyc.py").write_text("import b_cyc\nX = 1\n", encoding="utf-8")
>>> _ = (p / "b_cyc.py").write_text("from a_cyc import X\n", encoding="utf-8")
>>> sys.path.insert(0, d)
>>> try:
...     import a_cyc
... except ImportError as e:
...     print(type(e).__name__ + ":", str(e).rsplit(" (", 1)[0])
ImportError: cannot import name 'X' from partially initialized module 'a_cyc' (most likely due to a circular import)
>>> sys.path.remove(d)
>>> shutil.rmtree(d)
>>> "a_cyc" in sys.modules
False
```

注意 `X = 1` 写在 `import b_cyc` **之后**——这正是要害。三种解法，按推荐顺序：

1. **拆公共模块**：把双方都需要的类型移到 `types.py` / `models.py`，让依赖变成单向的 `a → common ← b`。
2. **延迟导入**：把 `import b` 移到函数体内，等到真正调用时才解析。
3. **改成 `import a` 再 `a.X`**：模块对象已经存在（只是半成品），属性访问发生在运行时，那时 `X` 可能已经就绪。这是最脆弱的办法。

```python
# 片段：延迟导入
def send_report():
    from .mailer import send      # 只在真正发信时才导入
    return send(...)
```

> **💡 提示**：循环导入通常不是「写法问题」，而是**设计问题**——两个模块互相依赖，说明职责被切错了。看到 `ImportError ... partially initialized`，先问「这两个模块为什么需要彼此」，而不是先去找 `import` 挪到哪一行。

## 19.9 命名空间包与 `__pycache__`

**命名空间包**（3.3+）：目录里没有 `__init__.py` 也能当包用，此时 `__path__` 会合并所有同名目录。它让「多个分发包共享同一个顶层包名」成为可能（如 `google.cloud.*`），但日常项目里**建议保留 `__init__.py`**：显式、能放版本号、不会被别的同名目录意外合并。

**`__pycache__`** 是编译缓存：`.pyc` 存字节码，命中就不重新编译。它由解释器自动管理，不该提交进 git（`.gitignore` 里加一行）。判断是否过期看「源文件 mtime + size」——所以 `git checkout` 换了时间戳但内容没变时会重编译一次，无害。

```pycon
>>> import importlib.util
>>> spec = importlib.util.find_spec("json")
>>> from pathlib import Path
>>> Path(spec.origin).name
'__init__.py'
>>> spec.submodule_search_locations is not None
True
```

`find_spec` 是「只看不导」的官方接口：写插件加载器、检查依赖是否装好时用它，比 `try: import` 干净。

## 19.10 组织一个项目的推荐结构

```text
myproj/
├── pyproject.toml
├── README.md
├── src/
│   └── myproj/
│       ├── __init__.py
│       ├── __main__.py        # python -m myproj
│       ├── cli.py
│       ├── core.py
│       └── utils.py
└── tests/
    ├── test_core.py
    └── test_cli.py
```

四条硬规矩：

1. **一个包只暴露必要的名字**：`__init__.py` 里用 `__all__` 列出来，内部模块加 `_` 前缀。
2. **导入顺序按 PEP 8 分三段**，段间空一行：标准库 → 三方库 → 本项目。`isort` / `ruff check --select I` 能自动排。
3. **顶层不要写执行逻辑**：只要不是 `if __name__ == "__main__"` 里，就不该有副作用。
4. **测试与源码分开**：`tests/` 平级于 `src/`，用 `pip install -e .` 让 `import myproj` 可用（第 23 章）。

## 19.a 与 C++ 的差别

| 维度 | Python | C++ |
| --- | --- | --- |
| 复用机制 | 运行时导入模块对象 | 编译期 `#include` 文本展开 + 链接 |
| 声明与定义 | 只有一份 `.py`，无头文件 | `.h` 声明 + `.cpp` 定义，需保持一致 |
| 名字空间 | 模块名即命名空间 | `namespace {}`，可嵌套可匿名 |
| 导入位置 | 任意位置都可 `import`（含函数内） | `#include` 只能文件顶层 |
| 重复包含 | 自动去重（`sys.modules`） | 需要 `#pragma once` / include guard |
| 循环依赖 | 运行时 `ImportError`，可用延迟导入绕过 | 前置声明解决类型循环，链接期报未定义 |
| 名字冲突 | 后者覆盖前者，静默 | 重定义是编译错误 |
| 编译单元 | 无，模块即单元 | 每个 `.cpp` 独立编译再链接 |
| 可见性控制 | `_` 约定 + `__all__` | `static`、匿名 namespace、`extern` |
| 版本/依赖 | `pip` + 虚拟环境，可多版本共存 | 系统级链接，符号冲突靠 ABI/so 名 |

最需要转变的观念：**C++ 的「编译期解析、链接期绑定」在 Python 里全部推迟到运行时**。所以拼错模块名不会在写代码时被发现，只在执行到那一行时炸；也因此可以按需导入、可以在函数里 `import`、可以做插件热加载。

## 19.b 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `ModuleNotFoundError: No module named 'x'` | 目录不在 `sys.path` / 包没装 | 在项目根运行，或 `pip install -e .` |
| `attempted relative import with no known parent package` | 直接跑了包内文件 | 改 `python -m 包.模块` |
| `cannot import name 'X' from partially initialized module` | 循环导入 | 拆公共模块或延迟导入 |
| 改了代码没生效 | 命中 `__pycache__` 或常驻进程未重启 | 删 `__pycache__`，重启进程 |
| `import` 一个目录报 `ModuleNotFoundError` | 缺 `__init__.py`（或写成命名空间包） | 补 `__init__.py` |
| 文件名叫 `json.py` 后连标准库都坏了 | 同名文件遮蔽标准库（`sys.path[0]` 优先） | 改名，别用标准库名 |
| `from x import *` 拿不到想要的 | `__all__` 没写或漏了名字 | 显式写 `__all__`，或改显式导入 |
| 导入就发请求/建连接 | 模块顶部有执行逻辑 | 移进 `if __name__ == "__main__"` 或函数 |
| 两个模块里改的「同一个」变量不同步 | `from x import v` 绑的是值，不是引用 | 改 `import x` 再 `x.v` |
| 包名与 pip 包名不一致导致 `pip install` 后仍导入失败 | 分发包名 ≠ 模块名 | 看 `pyproject.toml` 的 `[project] name` 与包目录名 |

最后一条值得单独强调：`from config import DEBUG` 之后，`config.DEBUG = True` 在你这里是没用的——`DEBUG` 已经是当前命名空间里的一个独立名字，绑的是导入那一刻的布尔值。要「共享可变状态」，永远 `import config` 再 `config.DEBUG`。（这与第 3 章的「名字不是盒子」是同一条规则。）

## 19.c 练习

**基础 1**：建 `mypkg/` 包，含 `__init__.py`（写 `__version__ = "0.1.0"` 并导出 `greet`）与 `greet.py`（`def greet(name): return f"hi {name}"`）。在项目根用一句话验证 `from mypkg import greet; greet("py")`。

验收：`from mypkg import greet, __version__` 不报错；`greet("py") == "hi py"`。

**基础 2**：给包加 `__main__.py`，让 `python -m mypkg` 打印版本号和一条问候。

验收：`python -m mypkg` 退出码 0，输出含 `0.1.0`；`python mypkg/__main__.py` 报 `ImportError`（说明它依赖包上下文）。

**基础 3**：写两个模块 `a.py`（定义 `VALUE = 10`）与 `b.py`（`from a import VALUE`，并提供 `def bump(): global VALUE; VALUE += 1`）。运行后观察 `b.VALUE` 与 `a.VALUE` 是否同步。

验收：`b.bump()` 之后 `a.VALUE` 仍是 10，`b.VALUE` 变成 11——用文字解释为什么（绑定，不是引用）。

**变式**：把 `a.py`/`b.py` 改成互相导入（`a` 需要 `b.helper`，`b` 需要 `a.VALUE`），先用 `import a; a.VALUE` 形式让它工作，再用「拆公共模块」重构一版，对比两者行数与你更愿意维护哪个。

验收：两版都能 `python -m` 跑通；重构版里 `a.py`、`b.py` 都不再互相 `import`。

**挑战**：写一个 `plugins/` 目录 + `loader.py`：`loader.py` 用 `importlib` 扫描目录、按文件名动态导入每个模块、调用模块里的 `register()` 收集返回值。要求：不修改 `sys.path`、坏插件（导入抛异常的）被跳过并打印模块名、输出按文件名排序保证确定性。

验收：放 3 个插件（1 个故意 import 不存在的模块）时，`loader.load()` 返回 2 个注册项且顺序稳定；坏插件的名字出现在跳过列表里；`sys.path` 长度前后不变。

## 19.d 小结

1. `import` = 查 `sys.modules` → 找文件 → 执行模块体 → 把模块对象绑名字；第二次导入只做第一和第四步。
2. 包是带 `__path__` 的模块，`__init__.py` 决定「导入包时顺手做了什么」；`python -m 包` 走 `__main__.py`，`python 包/文件.py` 会让相对导入失效。
3. 循环导入与改不动配置项的根源都是同一件事——**导入绑的是名字，不是引用**；要共享可变状态就导入模块，别导入值。

下一章给这套名字与对象加上类型说明：注解写在哪、`typing` 怎么用、为什么 `mypy` 能在不运行代码的情况下抓出一批 bug。
