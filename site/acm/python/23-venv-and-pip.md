# 23 · 虚拟环境与 pip 依赖管理

> **本质**：虚拟环境就是一个**独立的 `site-packages` 目录加上一份指向它的解释器副本**；`pip` 只是往那个目录里装包的下载器。所谓「配环境」，90% 的问题都是「装错了目录」或「版本没说清」。

**读完这一章你能做到**

1. 30 秒内为一个新项目建好虚拟环境，并确认 `import` 走的是自己那份。
2. 用 `pip` 装、卸、查、冻结依赖，知道 `python -m pip` 为什么比裸 `pip` 稳。
3. 读懂并写出 `==`、`>=`、`~=`、extras、环境标记这些约束，解释它们各自锁住了什么。
4. 把依赖从 `requirements.txt` 迁到 `pyproject.toml`，并说清锁文件存在的意义。
5. 判断一个「在我机器上能跑」的报错，是缺包、装错环境，还是版本冲突。

## 23.1 为什么必须有虚拟环境

系统里那个 Python（`C:\Python314\python.exe`、`/usr/bin/python3`）是给操作系统自己用的。往它的 `site-packages` 里装东西，会有三个后果：

1. **版本打架**：项目 A 要 `requests 2.28`，项目 B 要 `2.31`，全局只能留一个。
2. **污染系统**：某些 Linux 发行版依赖系统 Python 的特定包版本，装错会让包管理器坏掉。
3. **无法复现**：你的机器上「恰好」有那个包，别人没有；反过来你卸掉一个包，别的项目就崩了。

虚拟环境把「解释器 + 一份独立的包目录」打包成一个文件夹，删掉文件夹就等于彻底回滚——这是它比「全局装 + 手动卸载」强的地方。

```bash
# Windows PowerShell
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # 提示符前出现 (.venv)
python -c "import sys; print(sys.prefix)"

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

| 目的 | Windows | macOS / Linux |
| --- | --- | --- |
| 创建 | `python -m venv .venv` | `python3 -m venv .venv` |
| 激活（bash/zsh） | `.venv\Scripts\activate` | `source .venv/bin/activate` |
| 激活（PowerShell） | `.venv\Scripts\Activate.ps1` | — |
| 退出 | `deactivate` | `deactivate` |
| 删除 | 删掉整个 `.venv` 目录 | 删掉整个 `.venv` 目录 |
| 直接在环境里跑 | `.venv\Scripts\python.exe -m pip ...` | `.venv/bin/python -m pip ...` |

> **💡 提示**：**激活不是必须的**。`.venv\Scripts\python.exe -m pip install x` 与「激活后 `pip install x`」完全等价，而且不会因为你忘了激活而装错地方。CI 脚本、Makefile、编辑器的解释器设置，全都应该用**绝对路径调解释器**，而不是依赖 `activate`。

PowerShell 首次激活可能报 `无法加载文件 ...Activate.ps1，因为在此系统上禁止运行脚本`——执行策略的问题，用 `.venv\Scripts\python.exe` 直接调用即可绕开，或临时 `Set-ExecutionPolicy -Scope Process RemoteSigned`。

## 23.2 环境到底改了什么

激活虚拟环境只做三件事：把 `.venv/Scripts`（或 `bin`）插到 `PATH` 最前面、设 `VIRTUAL_ENV`、让 `sys.prefix` 指向 `.venv`。判断「我现在在哪个环境里」，看 `sys.prefix` 与 `sys.base_prefix` 是否相等就够了。

```pycon
>>> import sys, sysconfig
>>> site = sysconfig.get_paths()["purelib"]
>>> site.endswith("site-packages")
True
>>> sysconfig.get_paths()["stdlib"] != site
True
>>> sys.prefix == sys.base_prefix
True
```

上面最后一行输出 `True` 说明这段代码**没在虚拟环境里跑**（本文档的示例就是直接在系统解释器下校验的）。有环境时它是 `False`，而 `sys.prefix` 会等于 `.venv` 的绝对路径。写诊断脚本时这一行比任何环境变量都可靠。

```python
# 示例：examples/ch23_01_env_info.py
import importlib.metadata as md
import platform
import sys
import sysconfig

print("解释器版本:", platform.python_version())
print("实现:", platform.python_implementation())
print("在虚拟环境中:", sys.prefix != sys.base_prefix)
print("site-packages 路径已配置:", bool(sysconfig.get_paths()["purelib"]))

for name in ("pip", "setuptools", "wheel"):
    try:
        print(f"{name:<12} {md.version(name)}")
    except md.PackageNotFoundError:
        print(f"{name:<12} 未安装")

dists = list(md.distributions())
print("已安装发行包数量 > 10:", len(dists) > 10)
print("标准库模块名已知 > 100:", len(sys.stdlib_module_names) > 100)

mods = [m for m in ("json", "re", "sqlite3", "tkinter", "ssl") if m in sys.stdlib_module_names]
print("标准库覆盖含:", ",".join(mods))

try:
    import tomllib
    print("tomllib 可用（3.11+ 内置 TOML 解析）:", tomllib is not None)
except ImportError:
    print("tomllib 不可用，需要 pip install tomli")
```

```text
解释器版本: 3.14.7
实现: CPython
在虚拟环境中: False
site-packages 路径已配置: True
pip          26.2.1
setuptools   84.0.0
wheel        未安装
已安装发行包数量 > 10: True
标准库模块名已知 > 100: True
标准库覆盖含: json,re,sqlite3,tkinter,ssl
tomllib 可用（3.11+ 内置 TOML 解析）: True
```

`site-packages` 就是「第三方包的安装目标目录」。`pip install` 的本质是把 wheel 解压到这个目录，再写一份 `.dist-info` 元数据——所以「装了但 import 不到」几乎总是两件事之一：装的目录不是当前解释器的目录，或者包名与导入名不一致（`pip install opencv-python` → `import cv2`）。

## 23.3 pip 的六条命令

```bash
python -m pip install requests               # 装
python -m pip install "requests==2.31.0"     # 装指定版本（注意引号，别让 shell 吃掉 > <）
python -m pip install -r requirements.txt    # 按文件装
python -m pip uninstall requests             # 卸
python -m pip list                           # 看装了什么
python -m pip show requests                  # 看单个包的版本/依赖/位置
python -m pip freeze > requirements.txt      # 导出当前精确版本
```

一律用 `python -m pip` 而不是裸 `pip`：裸 `pip` 走 `PATH`，在有多份 Python 的机器上（Windows 尤其）非常容易装到另一个解释器里，症状是「明明装了却 `ModuleNotFoundError`」。`python -m pip` 保证用的是**当前 `python` 对应的那份 pip**。

`pip show` 是排查依赖的第一把工具，输出里 `Location` 一行直接告诉你包装在哪：

```text
Name: requests
Version: 2.31.0
Requires: certifi, charset-normalizer, idna, urllib3
Location: ...\site-packages
```

`Location` 和你 `sysconfig.get_paths()["purelib"]` 不一致 → 装错环境，到此为止不用再看别的。

`pip freeze` 只导出「你显式装过或作为依赖被装上的」全部包，格式是 `name==version`，适合做**锁文件**；`requirements.txt` 里则更适合写**宽松范围**（人维护），两者职责不同，见 23.5。

国内网络慢就换索引，注意这是**永久配置**，会写进 `pip.ini`/`pip.conf`：

```bash
python -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
python -m pip config list
python -m pip install -i https://pypi.org/simple requests   # 或只对这一次生效
```

## 23.4 版本约束：每个符号锁住了什么

| 写法 | 含义 | 举例 | 什么时候用 |
| --- | --- | --- | --- |
| `==1.2.3` | 精确等于 | `requests==2.31.0` | 锁文件、复现线上 |
| `>=1.2,<2` | 区间 | `flask>=2,<3` | 库的依赖声明（防大版本破坏） |
| `~=1.4.2` | 兼容版本：`>=1.4.2, ==1.4.*` | `django~=4.2.0` | 允许补丁更新，不许升 minor |
| `!=1.5.0` | 排除某版本 | `numpy!=1.24.0` | 规避已知 bug 版本 |
| `foo[extra]` | 带可选依赖 | `requests[security]` | 需要附加功能 |
| `foo; python_version<"3.11"` | 环境标记 | 按平台/版本条件安装 | 跨平台兼容 |
| `foo @ https://...whl` | 直接给 URL | 内网私有包 | 无法从 PyPI 取 |

**只写包名不写版本是最危险的做法**：今天装到 2.31、半年后同事装到 3.0，代码在谁那儿跑得起来全看运气。库里声明依赖用「下界 + 上界」（`>=2,<3`），应用里用锁文件钉死（`==2.31.0`）。

`~=` 常被误解，记住它的展开规则：`~=X.Y.Z` 等价 `>=X.Y.Z, ==X.Y.*`，即**允许最后一位变**；`~=X.Y` 等价 `>=X.Y, ==X.*`。

```pycon
>>> from packaging.version import Version  # 若未安装：python -m pip install packaging
>>> Version("2.31.0") < Version("2.9.0")
False
>>> Version("2.10.0") > Version("2.9.0")
True
>>> Version("2.9.0") == Version("2.9")
True
```

版本号是**按数字段比较**的，不是字符串比较——`"2.10" < "2.9"` 在字符串里成立，在版本里相反。这就是「必须用工具比版本、不要自己切分字符串」的原因。

## 23.5 依赖文件的三种形态

**① `requirements.txt`**：最简单，适合脚本、小项目、教学示例。

```text
# 直接依赖
requests>=2.31,<3
rich[toml]>=13

# 仅 Windows
pywin32>=306; sys_platform == "win32"

# 仅 Python < 3.11
tomli>=2; python_version < "3.11"
```

**② `pyproject.toml`（PEP 621，现代标准）**：项目元数据 + 依赖 + 工具配置放一处，`pip install .` 就能装成包。

```toml
[project]
name = "demo"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "requests>=2.31,<3",
    "rich[toml]>=13",
]

[project.optional-dependencies]
dev = ["pytest>=8", "mypy>=1.10", "ruff"]

[project.scripts]
demo = "demo.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

装法两条：`pip install .`（装本项目 + 依赖）、`pip install -e ".[dev]"`（可编辑安装 + 开发依赖）。`-e` 的关键效果是「改源码立即生效」，不用每次重装。

**③ 锁文件**：把**整棵依赖树**（含间接依赖）的精确版本写死，保证任何机器、任何时间装出来一模一样。

```bash
# 生成与使用（pip 自带，最简单）
python -m pip freeze > requirements.lock
python -m pip install -r requirements.lock

# 更专业的做法
pip-compile requirements.in -o requirements.txt     # pip-tools
uv pip compile requirements.in -o requirements.txt  # uv
```

三者的分工一句话：`pyproject.toml` 说「我要什么」，`requirements.txt` 说「大致什么范围」，锁文件说「**就是这些**」。

```pycon
>>> import tomllib
>>> cfg = tomllib.loads('''
... [project]
... name = "demo"
... requires-python = ">=3.10"
... dependencies = ["requests>=2.31,<3", "rich[toml]>=13"]
... ''')
>>> p = cfg["project"]
>>> p["name"], len(p["dependencies"]), p["requires-python"]
('demo', 2, '>=3.10')
```

`tomllib` 是 3.11 起内置的只读 TOML 解析器（3.10 及更早要 `pip install tomli`）。用它做「读配置」的脚本，不必引入第三方库。

```python
# 示例：examples/ch23_02_deps.py
import importlib.metadata as md
import tempfile
from pathlib import Path

REQ = """# 注释行会被忽略
pip>=20
nonexistent-package-xyz==1.0
"""
OPS = ("==", ">=", "<=", "~=", ">", "<")


def split_spec(text):
    for op in OPS:
        if op in text:
            name, _, ver = text.partition(op)
            return name, op, ver
    return text, "", ""


with tempfile.TemporaryDirectory() as td:
    path = Path(td) / "requirements.txt"
    path.write_text(REQ, encoding="utf-8")
    raw = path.read_text(encoding="utf-8").splitlines()
    specs = [ln.strip() for ln in raw if ln.strip() and not ln.lstrip().startswith("#")]

print("文件行数:", len(raw), "| 有效依赖:", len(specs))

for spec in specs:
    name, op, want = split_spec(spec)
    try:
        have = md.version(name)
    except md.PackageNotFoundError:
        print(f"{spec:<28} 未安装 -> 需要 pip install")
        continue
    print(f"{name:<8} 要求 {op}{want:<6} 已装 {have}")

report = {}
for dist in md.distributions():
    name = dist.metadata["Name"] or "?"
    report[name.lower()] = dist.version
print("索引条目 > 10:", len(report) > 10)
print("索引里有 pip:", "pip" in report)
print("同一包名不会重复:", len(report) == len({k.lower() for k in report}))
```

```text
文件行数: 3 | 有效依赖: 2
pip      要求 >=20     已装 26.2.1
nonexistent-package-xyz==1.0 未安装 -> 需要 pip install
索引条目 > 10: True
索引里有 pip: True
同一包名不会重复: True
```

## 23.6 依赖冲突长什么样

`pip` 的解析器在装包时会回溯搜索一组满足所有约束的版本；找不到就报 `ResolutionImpossible`：

```text
ERROR: Cannot install a==1.0 and b==2.0 because these package versions have
conflicting dependencies.
The conflict is caused by:
    The user requested a==1.0
    The user requested b==2.0
    b 2.0 depends on a>=3.0
```

三条处理路径，按推荐顺序：

1. **升级冲突方**：`pip install -U b`，看新版是否放宽了约束。
2. **降级自己**：把 `a` 的约束从 `==1.0` 换成 `>=3.0`（通常是你锁得太死）。
3. **隔离**：两个需求真的不可共存时，拆成两个服务/两个虚拟环境——这才是正解，别用 `--force-reinstall` 硬凑。

`pip check` 能在事后体检：它检查已装包的依赖是否都满足，输出 `No broken requirements found.` 才算干净。

## 23.7 工具生态：一句话定位

| 工具 | 定位 | 什么时候选它 |
| --- | --- | --- |
| `venv` + `pip` | 标准库自带，零依赖 | 默认选择，教学与脚本 |
| `uv` | Rust 写的极速替代，兼容 pip 命令 | 装包慢得难以忍受时；也管 Python 版本 |
| `poetry` | 依赖 + 打包 + 发布一体 | 要发 PyPI 包 |
| `pipx` | 把**命令行工具**装进独立环境 | 装 `ruff`/`black`/`yt-dlp` 这类要全局用的工具 |
| `conda` / `mamba` | 跨语言（含 C 库）二进制分发 | 科学计算、需要非 Python 依赖（CUDA、GDAL） |
| `hatch` / `pdm` | 现代打包与工作流 | 新项目想做标准化打包 |

`pipx` 值得单独记住：`pipx install ruff` 之后 `ruff` 在全局可用，但它装在自己的虚拟环境里，不会污染任何项目——比 `pip install --user` 干净得多。

## 23.8 让环境可复现

一份能让别人复现的最小 CI 步骤：

```bash
python -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python -m pytest -q
```

要做到「字节级一致」，还得三件事：①固定 Python 小版本（`requires-python` + CI 矩阵）；②用 `--require-hashes` 校验包内容；③把系统级依赖（编译工具链、CUDA）写进容器镜像。

```text
# requirements.lock 带哈希的形态
requests==2.31.0 \
    --hash=sha256:58cd2187c01e70e6e26505bca751777aa9f2ee0b7f4300988b709f44e013003f
```

`pip install --require-hashes -r requirements.lock` 会拒绝任何哈希不匹配的包——这是防供应链篡改的最低成本手段。

## 23.a 与 C++ 的差别

| 维度 | Python | C++ |
| --- | --- | --- |
| 依赖单位 | 包（wheel/sdist），运行时 import | 头文件 + 静态/动态库 |
| 隔离机制 | 虚拟环境（独立 `site-packages`） | 无标准机制，靠构建目录 / vcpkg / conan |
| 全局状态 | `sys.path` 顺序决定谁生效 | `-I`/`-L` 顺序决定谁生效 |
| 版本约束 | `==`、`>=`、`~=` 由安装器解析 | 无标准版本语法，靠包管理器约定 |
| 二进制兼容 | pure-Python 包跨版本通用；C 扩展绑 ABI（`cp312`） | 全部绑 ABI，需重编译 |
| 分发 | `pip install` 自动拉依赖 | 手动配 `find_package` / CMake |
| 构建 | 多数包有预编译 wheel，无编译步骤 | 几乎总要编译 |
| 冲突排查 | `pip check`、`pip show` | 链接错误、ODR 违规 |
| 复现 | 锁文件 + 哈希 | lockfile（conan/vcpkg）+ 编译器版本 |

关键差别是**「装」与「编」**：C++ 的依赖问题表现为编译/链接错误，早发现；Python 的依赖问题常常到运行到某个分支才 `ImportError`，所以更需要测试与锁文件兜底。另一个差别是 C 扩展的 ABI 标签（`cp312-cp312-win_amd64`）——同一个包在 3.12 与 3.13 上是**两个不同的 wheel**，这就是「升级 Python 小版本后某些包装不上」的原因。

## 23.b 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `pip install` 成功但 `import` 报 `ModuleNotFoundError` | 装到了另一个解释器 | 一律 `python -m pip`；`pip show` 看 Location |
| 忘激活环境就 pip install | 装进了系统 Python | 用 `.venv\Scripts\python.exe -m pip` |
| 包名与导入名对不上 | 分发名 ≠ 模块名 | `opencv-python`→`cv2`，`Pillow`→`PIL`，查 `pip show -f` |
| `pip install` 报 `ResolutionImpossible` | 约束互相矛盾 | 放宽上界 / `pip check` 定位 / 拆环境 |
| `error: Microsoft Visual C++ 14.0 required` | 装的是 sdist，需要编译 | 升级 pip 拿 wheel，或装 Build Tools |
| 升级 Python 后包装不上 | wheel 只有旧 ABI 标签 | 等包发新 wheel，或用旧版本解释器 |
| PowerShell 里 `pip install "x>=1"` 报错 | `>` 被 shell 当重定向 | 始终加引号 |
| `requirements.txt` 里 `#` 注释导致解析失败 | 行内注释只在行首有效 | 注释单独占行 |
| 同事装出来版本不同 | 没锁版本 | 提交锁文件，CI 用锁文件装 |
| 删除 `.venv` 后 IDE 仍报错 | 解释器路径失效 | 重新选解释器 / 重建环境 |
| `pip install -e .` 后改动不生效 | 装的是普通模式 | 用 `-e`，并确认 `[build-system]` 正确 |
| 用 `sudo pip install` | 污染系统 Python | 用 venv；全局工具用 `pipx` |

## 23.c 练习

**基础 1**：为本章建一个干净环境并装 `requests`，用一条命令打印「装在哪、什么版本」。

验收：`pip show requests` 的 `Location` 落在 `.venv` 目录内；`python -c "import requests, sys; print(requests.__file__.startswith(sys.prefix))"` 输出 `True`。

**基础 2**：写一份 `requirements.txt`，包含：`requests` 允许 2.x、`rich` 带 `[jupyter]` 额外依赖、仅在 Windows 上装 `pywin32`、仅在 Python < 3.11 时装 `tomli`。

验收：`pip install -r requirements.txt --dry-run` 在 Windows 与 Linux 上解析出的包列表不同；`pip-compile`（或 `uv pip compile`）能生成锁文件。

**基础 3**：把基础 2 的依赖改写成 `pyproject.toml` 的 `[project]` 段，并加一个 `dev` 可选依赖组（`pytest`、`ruff`）。

验收：`pip install -e ".[dev]"` 成功后 `python -c "import demo"` 可用（目录里有包）；`pip show demo` 显示版本 `0.1.0`。

**变式**：故意制造冲突——同时要求 `a==1.0` 与某个依赖 `a>=3` 的包（可用两个本地小包模拟），复现 `ResolutionImpossible`，然后用三种方式之一修好。

验收：能粘贴出完整报错里的 `The conflict is caused by:` 段；修好后 `pip check` 输出 `No broken requirements found.`。

**挑战**：写一个 `check_env.py`，读 `pyproject.toml`，逐条检查 `dependencies` 是否已安装且版本满足（用 `packaging.specifiers`），缺的打印建议的 `pip install` 命令，最后以退出码 1 结束。

验收：缺包时退出码为 1 且列出全部缺失项；全部满足时输出 `OK`、退出码 0；版本不满足时指出「已装 X，需要 Y」。

## 23.d 小结

1. 一个项目一个 `.venv`，判断是否在环境里看 `sys.prefix != sys.base_prefix`；调 pip 一律 `python -m pip`。
2. 依赖要分两层写：项目声明宽松范围（`>=2.31,<3`），锁文件钉死精确版本（含间接依赖与哈希）。
3. 依赖问题先分三类再动手：装错环境（看 `Location`）、包名不符（查 `pip show -f`）、版本冲突（`pip check` + 放宽上界）。

下一章给这些代码上保险：`pytest` 怎么写测试、`fixture` 与参数化怎么复用、`unittest` 什么时候还得用，以及覆盖率到底该看什么。
