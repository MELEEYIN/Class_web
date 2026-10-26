# 17 · 文件 IO 与 pathlib

> **本质**：`open()` 打开的是**一带缓冲的字节流**，`encoding` 决定字节与字符串怎么互转。读写的正解永远是 `with open(...) as f:`——`with` 保证文件句柄在离开代码块时关闭，哪怕中途抛了异常。路径操作则首选 `pathlib.Path`：用 `/` 拼路径、用 `.suffix`/`.stem` 拆名字、用 `.glob()` 找文件，全部是对象方法，不靠字符串拼斜杠。

**读完这一章你能做到**

- 选对模式（`r/w/a/x`、`b`、`+`）与编码，不再出现乱码与 `UnicodeDecodeError`；
- 用逐行迭代处理 GB 级文件而不爆内存；
- 用 `pathlib` 完成拼路径、取扩展名、递归匹配、建目录、删除文件；
- 判断要不要 `flush`、`newline=""`、二进制模式；
- 避开"文件没关""`with` 外继续用对象""`chdir` 污染全局状态"这三类坑。

---

## 17.1 文本模式的读写与编码

```python
# 示例：examples/ch17_01_text_io.py
"""ch17_01_text_io.py —— 文本/二进制读写、编码与文件指针"""
import shutil
from pathlib import Path

WORK = Path(__file__).resolve().parent / "_tmp" / "ch17_01"
if WORK.exists():
    shutil.rmtree(WORK)
WORK.mkdir(parents=True)

p = WORK / "hello.txt"

print("=== 写：w 清空重建，a 追加 ===")
with open(p, "w", encoding="utf-8") as f:
    f.write("第一行\n")
    f.write("第二行\n")
print("写入后字节数：", p.stat().st_size, "（UTF-8 下每个汉字 3 字节）")

with open(p, "a", encoding="utf-8") as f:
    f.write("追加行\n")

with open(p, encoding="utf-8") as f:
    print("整个读出：", repr(f.read()))

print("=== 逐行迭代：内存里只有一行 ===")
with open(p, encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        print(f"  第{i}行 {line!r}")

print("=== 去掉行尾换行 ===")
with open(p, encoding="utf-8") as f:
    lines = [line.rstrip("\n") for line in f]
print(lines, "| 行数：", len(lines))

print("=== Path.read_text / splitlines 一步到位 ===")
print(p.read_text(encoding="utf-8").splitlines())

print("=== 编码不一致会抛 UnicodeDecodeError ===")
gbk = WORK / "gbk.txt"
gbk.write_bytes("中文内容".encode("gbk"))
try:
    gbk.read_text(encoding="utf-8")
except UnicodeDecodeError as e:
    print("UnicodeDecodeError 原因：", e.reason, "| 出错字节位置：", e.start)
print("用 gbk 解码：", gbk.read_text(encoding="gbk"))

print("=== 二进制模式：字节就是字节 ===")
blob = WORK / "data.bin"
with open(blob, "wb") as f:
    f.write(bytes([0, 1, 2, 255]))
print("read_bytes：", blob.read_bytes())
with open(blob, "rb") as f:
    print("先读 2 字节：", f.read(2))
    print("tell 位置：", f.tell())
    f.seek(0)
    print("seek 回 0 再全读：", f.read())

print("=== print 直接写文件 ===")
log = WORK / "log.txt"
with open(log, "w", encoding="utf-8") as f:
    print("第一行", file=f)
    print("第二行", file=f, end="")
print("log.txt 内容：", repr(log.read_text(encoding="utf-8")))

print("=== 文件不存在 ===")
try:
    open(WORK / "nope.txt", encoding="utf-8")
except FileNotFoundError as e:
    print("FileNotFoundError errno =", e.errno, "| strerror =", e.strerror)

print("=== 换行符：newline 参数决定写什么、按什么读 ===")
crlf = WORK / "crlf.txt"
with open(crlf, "w", encoding="utf-8", newline="") as f:
    f.write("a\r\nb\r\n")
print("写成 CRLF 的原始字节：", crlf.read_bytes())
print("按通用换行读出：", crlf.read_text(encoding="utf-8").splitlines())

print("=== 追加模式的文件指针 ===")
with open(log, "a", encoding="utf-8") as f:
    print("追加的一行", file=f)
print("追加后：", log.read_text(encoding="utf-8").splitlines())

shutil.rmtree(WORK)
print("清理完成，临时目录还在吗：", WORK.exists())
```

```text
=== 写：w 清空重建，a 追加 ===
写入后字节数： 22 （UTF-8 下每个汉字 3 字节）
整个读出： '第一行\n第二行\n追加行\n'
=== 逐行迭代：内存里只有一行 ===
  第1行 '第一行\n'
  第2行 '第二行\n'
  第3行 '追加行\n'
=== 去掉行尾换行 ===
['第一行', '第二行', '追加行'] | 行数： 3
=== Path.read_text / splitlines 一步到位 ===
['第一行', '第二行', '追加行']
=== 编码不一致会抛 UnicodeDecodeError ===
UnicodeDecodeError 原因： invalid continuation byte | 出错字节位置： 0
用 gbk 解码： 中文内容
=== 二进制模式：字节就是字节 ===
read_bytes： b'\x00\x01\x02\xff'
先读 2 字节： b'\x00\x01'
tell 位置： 2
seek 回 0 再全读： b'\x00\x01\x02\xff'
=== print 直接写文件 ===
log.txt 内容： '第一行\n第二行'
=== 文件不存在 ===
FileNotFoundError errno = 2 | strerror = No such file or directory
=== 换行符：newline 参数决定写什么、按什么读 ===
写成 CRLF 的原始字节： b'a\r\nb\r\n'
按通用换行读出： ['a', 'b']
=== 追加模式的文件指针 ===
追加后： ['第一行', '第二行追加的一行']
清理完成，临时目录还在吗： False
```

模式表（背下来就不再用错）：

| 模式 | 含义 | 文件不存在 | 文件已存在 | 指针初始位置 |
| --- | --- | --- | --- | --- |
| `"r"` | 只读（默认） | `FileNotFoundError` | 正常打开 | 开头 |
| `"w"` | 只写 | 创建 | **清空** | 开头 |
| `"a"` | 追加写 | 创建 | 保留内容 | 末尾 |
| `"x"` | 独占创建 | 创建 | `FileExistsError` | 开头 |
| `"r+"` | 读写 | 报错 | 保留内容 | 开头 |
| `"rb"`/`"wb"` | 二进制 | 同上规则 | 同上 | 同上 |

编码的三条结论：

1. **`encoding` 必须显式写**。不写就用平台默认编码（Windows 中文系统是 GBK/CP936，Linux/macOS 多为 UTF-8），于是同一份代码在同学机器上就乱码。项目里统一 `encoding="utf-8"`。Python 3.15 起默认变 UTF-8（PEP 686），但现在还不能依赖它；也可以设 `PYTHONUTF8=1` 强制。
2. **`UnicodeDecodeError` 说明"字节流与声明编码不匹配"**，不是文件坏了。示例里 GBK 编码的中文用 UTF-8 解，第一个字节就 `invalid start byte`。
3. **`len(str)` 是字符数，`st_size` 是字节数**。UTF-8 下每个汉字 3 字节，所以"第一行\n"是 10 字节。

`repr(line)` 在调试文件内容时极其有用——它能让你一眼看出行尾是 `'\n'`、`'\r\n'` 还是根本没有换行符。`rstrip("\n")` 只去 `\n`，若文件是 CRLF 会留下 `\r`；最稳的是 `line.rstrip("\r\n")` 或直接用 `str.splitlines()`（它会处理 `\r\n`、`\n`、`\r` 三种）。

`newline=""` 的作用：写模式下不转换 `\n`（否则 Windows 会自动写成 `\r\n`）；读模式下禁用通用换行翻译。只有在需要精确控制换行时（生成 CSV、协议报文）才用。

```pycon
>>> from pathlib import Path
>>> p = Path("_tmp_demo.txt")
>>> _ = p.write_text("a\nb\n", encoding="utf-8")
>>> p.read_text(encoding="utf-8").splitlines()
['a', 'b']
>>> p.read_text(encoding="utf-8") == "a\nb\n"
True
>>> p.unlink()
>>> p.exists()
False
```

> **💡 提示** 小文件（< 几 MB）用 `Path.read_text()` / `write_text()` 最省事；大文件、需要逐行处理、需要追加，就必须 `open()`。`read_text` 没有 `append` 参数，追加只能 `open(..., "a")`。

---

## 17.2 `pathlib`：路径是对象，不是字符串

```python
# 示例：examples/ch17_02_pathlib.py
"""ch17_02_pathlib.py —— 路径运算、目录遍历与文件元数据"""
import os
import shutil
from pathlib import Path

WORK = Path(__file__).resolve().parent / "_tmp" / "ch17_02"
if WORK.exists():
    shutil.rmtree(WORK)
(WORK / "src" / "app").mkdir(parents=True)
(WORK / "logs").mkdir()

(WORK / "src" / "main.py").write_text("print('hi')\n", encoding="utf-8")
(WORK / "src" / "app" / "utils.py").write_text("x = 1\n", encoding="utf-8")
(WORK / "logs" / "a.log").write_text("log\n", encoding="utf-8")


def rel(p):
    return p.relative_to(WORK).as_posix()


print("=== 用 / 拼路径，而不是字符串加斜杠 ===")
p = WORK / "src" / "main.py"
print("相对路径：", rel(p))
print("name：", p.name, "| stem：", p.stem, "| suffix：", p.suffix)
print("parent：", rel(p.parent))
print("parts 末三段：", p.parts[-3:])

print("=== with_suffix / with_name：换扩展名、换文件名 ===")
print(rel(p.with_suffix(".txt")))
print(rel(p.with_name("other.py")))

print("=== 属性判断与元数据 ===")
print("exists：", p.exists(), "| is_file：", p.is_file(), "| is_dir：", p.is_dir())
print("父目录是目录：", p.parent.is_dir())
print("大小：", p.stat().st_size, "字节")

print("=== 列目录：iterdir 只列一层 ===")
for child in sorted(WORK.iterdir()):
    print("  ", rel(child), "| 是目录：", child.is_dir())

print("=== glob 与 rglob：按模式匹配 ===")
for f in sorted((WORK / "src").glob("*.py")):
    print("  顶层匹配：", rel(f))
for f in sorted(WORK.rglob("*.py")):
    print("  递归匹配：", rel(f))
print("所有 .log：", [rel(f) for f in WORK.rglob("*.log")])

print("=== read_text / write_text：小文件的最短路径 ===")
new = WORK / "logs" / "b.txt"
new.write_text("你好\n", encoding="utf-8")
print("读回：", repr(new.read_text(encoding="utf-8")))

with open(new, "a", encoding="utf-8") as f:
    f.write("第二行\n")
print("追加后行列表：", new.read_text(encoding="utf-8").splitlines())

print("=== rename / unlink ===")
renamed = new.with_name("c.txt")
new.rename(renamed)
print("改名后：原名存在 =", new.exists(), "| 新名存在 =", renamed.exists())
renamed.unlink()
print("删除后：", renamed.exists())

print("=== mkdir 的层层创建与幂等 ===")
deep = WORK / "src" / "app" / "deep" / "deeper"
deep.mkdir(parents=True, exist_ok=True)
print("多级目录已建好：", deep.is_dir())
deep.mkdir(parents=True, exist_ok=True)
print("重复创建不报错：", deep.is_dir())
try:
    (WORK / "src").mkdir()
except FileExistsError as e:
    print("不加 exist_ok 就报 FileExistsError，errno =", e.errno)

print("=== 相对路径与绝对路径 ===")
print("Path('a/b') 是绝对路径吗：", Path("a/b").is_absolute())
print("resolve 之后呢：", Path("a/b").resolve().is_absolute())
print("resolve 只补全、不检查存在：", Path("不存在的目录/x.txt").resolve().name)

print("=== os.path 与 pathlib 的对照 ===")
print("splitext：", os.path.splitext("main.py")[1], "| Path.suffix：", Path("main.py").suffix)
print("basename：", os.path.basename(os.path.join("a", "b.txt")), "| Path.name：", Path("a/b.txt").name)

print("=== 统计目录总大小 ===")
total = sum(f.stat().st_size for f in WORK.rglob("*") if f.is_file())
print("所有文件字节合计：", total)

shutil.rmtree(WORK)
print("清理完成：", WORK.exists())
```

```text
=== 用 / 拼路径，而不是字符串加斜杠 ===
相对路径： src/main.py
name： main.py | stem： main | suffix： .py
parent： src
parts 末三段： ('ch17_02', 'src', 'main.py')
=== with_suffix / with_name：换扩展名、换文件名 ===
src/main.txt
src/other.py
=== 属性判断与元数据 ===
exists： True | is_file： True | is_dir： False
父目录是目录： True
大小： 13 字节
=== 列目录：iterdir 只列一层 ===
   logs | 是目录： True
   src | 是目录： True
=== glob 与 rglob：按模式匹配 ===
  顶层匹配： src/main.py
  递归匹配： src/app/utils.py
  递归匹配： src/main.py
所有 .log： ['logs/a.log']
=== read_text / write_text：小文件的最短路径 ===
读回： '你好\n'
追加后行列表： ['你好', '第二行']
=== rename / unlink ===
改名后：原名存在 = False | 新名存在 = True
删除后： False
=== mkdir 的层层创建与幂等 ===
多级目录已建好： True
重复创建不报错： True
不加 exist_ok 就报 FileExistsError，errno = 17
=== 相对路径与绝对路径 ===
Path('a/b') 是绝对路径吗： False
resolve 之后呢： True
resolve 只补全、不检查存在： x.txt
=== os.path 与 pathlib 的对照 ===
splitext： .py | Path.suffix： .py
basename： b.txt | Path.name： b.txt
=== 统计目录总大小 ===
所有文件字节合计： 25
清理完成： False
```

`Path` 的常用属性与方法，按"我要干什么"查表：

| 需求 | 写法 | 说明 |
| --- | --- | --- |
| 拼路径 | `base / "sub" / "f.txt"` | `/` 会自动处理分隔符 |
| 取文件名 | `p.name` | `"main.py"` |
| 取主干 | `p.stem` | `"main"` |
| 取扩展名 | `p.suffix` | `".py"`（含点） |
| 换扩展名 | `p.with_suffix(".txt")` | 返回新路径，不改原对象 |
| 取父目录 | `p.parent` | 可链式 `p.parent.parent` |
| 拆成各级 | `p.parts` | 元组，Windows 下含盘符 |
| 是否绝对 | `p.is_absolute()` | 不判断存在性 |
| 转绝对 | `p.resolve()` | 解析 `..` 与符号链接，**不检查存在** |
| 存在性 | `p.exists()` / `is_file()` / `is_dir()` | 三次系统调用 |
| 大小/时间 | `p.stat().st_size` / `.st_mtime` | `st_mtime` 是浮点秒 |
| 建目录 | `p.mkdir(parents=True, exist_ok=True)` | 两个关键字几乎总要写 |
| 列一层 | `p.iterdir()` | 生成器，需 `sorted` 才有序 |
| 递归匹配 | `p.rglob("*.py")` | 等价 `glob("**/*.py")` |
| 改名/移动 | `p.rename(target)` | 跨盘会被 `replace` 拒绝 |
| 删除文件 | `p.unlink()` | 目录要 `rmdir()`/`shutil.rmtree()` |
| 读文本 | `p.read_text(encoding="utf-8")` | 一次读完 |
| 写文本 | `p.write_text(s, encoding="utf-8")` | `"w"` 语义，清空重建 |

几个必须点明的行为：

- **`iterdir()` 的顺序是文件系统的顺序**，不是字典序。要稳定输出必须 `sorted()`——这和 `os.listdir()` 一样。
- **`resolve()` 不检查存在**，`Path("不存在的目录/x.txt").resolve()` 照样返回绝对路径。要判断存在用 `exists()`。
- **跨盘 `rename` 会失败**（`OSError: [WinError 17]`），要移动用 `shutil.move`。
- **`Path` 对象不可变**：`p.with_suffix(".txt")` 返回新对象，`p` 本身没变。这点和 `str` 一样（3 章讲过）。

`os.path` 与 `pathlib` 怎么选：新代码一律 `pathlib`。例外是**需要把路径当字符串传给外部库/子进程**时，用 `str(p)` 或 `p.as_posix()`（后者永远用正斜杠，跨平台更安全）。

---

## 17.3 大文件与四个真实存在的坑

```python
# 示例：examples/ch17_03_bigfile.py
"""ch17_03_bigfile.py —— 大文件、上下文管理器与四个常见坑"""
import os
import shutil
from pathlib import Path

WORK = Path(__file__).resolve().parent / "_tmp" / "ch17_03"
if WORK.exists():
    shutil.rmtree(WORK)
WORK.mkdir(parents=True)

big = WORK / "big.txt"
with open(big, "w", encoding="utf-8") as f:
    for i in range(1000):
        f.write(f"row {i}\n")

print("=== 三种读法的行数一致，内存占用完全不同 ===")
print("read_text + splitlines：", len(big.read_text(encoding="utf-8").splitlines()))

count = 0
with open(big, encoding="utf-8") as f:
    for line in f:
        count += 1
print("逐行迭代：", count, "行")

print("=== 把逐行读封装成生成器：调用方只关心数据 ===")


def iter_lines(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield line.rstrip("\n")


print("前 3 行：", [line for _, line in zip(range(3), iter_lines(big))])

print("=== 手写上下文管理器：保证一定关闭 ===")


class ManagedFile:
    def __init__(self, path, mode="r", encoding="utf-8"):
        self.path = path
        self.mode = mode
        self.encoding = encoding
        self.handle = None

    def __enter__(self):
        self.handle = open(self.path, self.mode, encoding=self.encoding)
        return self.handle

    def __exit__(self, exc_type, exc, tb):
        self.handle.close()
        return False


with ManagedFile(big) as fh:
    print("第一行：", fh.readline().strip())

print("=== 坑 1：忘记 close ===")
fh = open(big, encoding="utf-8")
fh.readline()
print("关了吗：", fh.closed)
fh.close()
print("close 之后：", fh.closed)
try:
    fh.read()
except ValueError as e:
    print("关闭后再读：ValueError:", e)

print("=== 坑 2：with 之外还想用文件对象 ===")
with open(big, encoding="utf-8") as fh2:
    data = fh2.read()
print("数据已经读进内存，可以继续用：", len(data.splitlines()), "行")
try:
    fh2.read()
except ValueError as e:
    print("但文件对象已失效：ValueError:", e)

print("=== 坑 3：写入没有 flush，读到的可能是旧的 ===")
flush_demo = WORK / "flush.txt"
w = open(flush_demo, "w", encoding="utf-8")
w.write("写入但没 flush")
w.flush()
print("flush 之后读到：", repr(flush_demo.read_text(encoding="utf-8")))
w.close()

print("=== 坑 4：os.chdir 改变的是整个进程的工作目录 ===")
before = Path.cwd()
os.chdir(WORK)
print("切到临时目录后，相对路径 big.txt 存在：", Path("big.txt").exists())
os.chdir(before)
print("切回原目录：", Path.cwd() == before)

print("=== 删除临时目录 ===")
shutil.rmtree(WORK)
print("清理完成：", WORK.exists())
```

```text
=== 三种读法的行数一致，内存占用完全不同 ===
read_text + splitlines： 1000
逐行迭代： 1000 行
=== 把逐行读封装成生成器：调用方只关心数据 ===
前 3 行： ['row 0', 'row 1', 'row 2']
=== 手写上下文管理器：保证一定关闭 ===
第一行： row 0
=== 坑 1：忘记 close ===
关了吗： False
close 之后： True
关闭后再读：ValueError: I/O operation on closed file.
=== 坑 2：with 之外还想用文件对象 ===
数据已经读进内存，可以继续用： 1000 行
但文件对象已失效：ValueError: I/O operation on closed file.
=== 坑 3：写入没有 flush，读到的可能是旧的 ===
flush 之后读到： '写入但没 flush'
=== 坑 4：os.chdir 改变的是整个进程的工作目录 ===
切到临时目录后，相对路径 big.txt 存在： True
切回原目录： True
=== 删除临时目录 ===
清理完成： False
```

四条经验：

1. **文件对象有缓冲区**。`w.write("...")` 只是写进 Python 的缓冲区，还没落到磁盘；`flush()` 强制落盘，`close()` 也会 flush。所以"写完立刻用别的进程读"必须先 `flush`（或者干脆用 `with`）。
2. **`with` 结束后文件对象关闭，但已经读出的数据仍然可用**。别把 `open()` 的结果赋给全局变量再用——要么在 `with` 里读完，要么用 `Path.read_text()`。
3. **`for line in f` 是最省内存的写法**：它复用同一个行对象（CPython 优化），内存里只有一行。`f.readlines()` 会把整个文件的每一行都变成字符串对象，1 GB 文件直接吃掉几 GB 内存。
4. **`os.chdir` 是进程级全局副作用**。任何相对路径的含义都会变，多线程下更是一场灾难。需要换目录时用 `Path` 拼绝对路径，或者临时 `chdir` 后 `try/finally` 切回来（示例里就是这样做的）。

一个实用习惯：处理大文件时用**生成器**包一层，调用方拿到的就是普通可迭代对象，既不关心文件大小，也不用管关闭时机——这与 15 章的"生成器 O(1) 内存"是同一个道理。

---

## 17.4 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 打开 | `std::ifstream f(path)` | `open(path, "r", encoding=...)` |
| 关闭 | 析构自动（RAII） | `with`（`__del__` 不可靠） |
| 文本/二进制 | `std::ios::binary` 标志 | 模式里加 `b` |
| 编码 | 字节，无编码概念 | 文本模式自动编解码，`encoding` 必填 |
| 逐行 | `std::getline(f, line)` | `for line in f` |
| 错误 | `f.is_open()` / 异常标志 | 直接抛 `FileNotFoundError` |
| 路径 | `std::filesystem::path` | `pathlib.Path` |
| 目录遍历 | `directory_iterator` | `iterdir()` / `rglob()` |

好消息是 C++17 的 `std::filesystem::path` 与 `pathlib.Path` 设计思路几乎一致，迁移成本很低。要注意的是 Python 的**文本模式默认做了编码转换与换行翻译**，而 C++ 的 `ifstream` 只给原始字节——这就是为什么 Python 里会撞 `UnicodeDecodeError`，而 C++ 里不会（它只是给你一堆字节）。

---

## 17.5 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 中文乱码 / `UnicodeDecodeError` | 没写 `encoding` 或写错 | `open(..., encoding="utf-8")` |
| `ValueError: I/O operation on closed file` | 在 `with` 外继续用文件对象 | 在 `with` 内用完，或改用 `read_text` |
| Windows 上写出 `\r\n`，跟预期不符 | 文本模式自动翻译换行 | `newline=""` |
| 写完后别的进程读不到内容 | 缓冲区未 flush | `f.flush()` 或用 `with` |
| `FileNotFoundError` 但文件明明在 | 相对路径的基准是**当前工作目录** | 用 `Path(__file__).parent / ...` |
| 目录遍历顺序每次不同 | `iterdir` 不排序 | `sorted(p.iterdir())` |
| `FileExistsError` | `mkdir` 没加 `exist_ok=True` | `mkdir(parents=True, exist_ok=True)` |
| 跨盘 `rename` 失败 | `rename` 不做拷贝 | 用 `shutil.move` |
| 1 GB 文件把内存吃满 | 用了 `readlines()`/`read()` | 改成 `for line in f` |
| `chdir` 之后别处全崩 | 进程级全局状态 | 不 `chdir`，用绝对路径 |
| 读 CSV 首行多个 `\ufeff` | 文件带 BOM | `encoding="utf-8-sig"` |

---

## 17.6 练习

**1.（基础）** 写 `word_count(path)`：读一个 UTF-8 文本文件，返回 `(行数, 词数, 字符数)`；要求逐行处理，不许一次性 `read()`。

验收：对你自造的三行文件，结果与 `wc` 的语义一致；换成 10 万行文件时内存不随文件增长（可用 `tracemalloc` 粗略验证）。

**2.（基础）** 写 `tail(path, n)`：返回文件最后 n 行（不要求 O(1)，但要求逐行处理）；再写 `head(path, n)` 用生成器 + `islice` 实现。

验收：`tail(p, 3)` 与 `p.read_text().splitlines()[-3:]` 结果相同；`head(p, 2)` 只读了 2 行（可用带计数副作用的生成器验证）。

**3.（编码）** 造一个 GBK 编码的文件，写一个 `to_utf8(src, dst)` 把它转成 UTF-8；遇到无法解码的字节用 `errors="replace"` 处理并统计替换次数。

验收：转换后文件能被 `encoding="utf-8"` 正常读出；含非法字节的文件不抛异常，替换次数 > 0。

**4.（pathlib）** 写 `scan(root)`：返回 `{"py": [...], "txt": [...]}`，列出 `root` 下所有对应扩展名的文件（相对路径，用 `as_posix()`），并按路径排序。

验收：在含子目录的测试目录上运行，两类文件都齐全、有序、都是正斜杠相对路径。

**5.（挑战）** 写一个 `atomic_write(path, text)`：先写到同目录的临时文件，再 `os.replace` 覆盖目标，保证"要么是旧内容，要么是完整新内容"，中途崩溃也不会留下半个文件。再用 `tempfile.TemporaryDirectory()` 写一个在其内部生成报告、退出时自动清理的流程。

验收：写入过程中模拟异常（`raise` 在 `flush` 之后、`replace` 之前），目标文件仍是旧内容；临时目录用完后 `exists()` 为 `False`。

---

## 17.7 小结

1. **`with open(p, "r", encoding="utf-8") as f`** 是唯一正确的打开方式；模式与编码决定"读到什么"。
2. **大文件逐行迭代，小文件 `read_text()`**；`readlines()` 只适合明确很小的文件。
3. **路径操作用 `pathlib`**：`/` 拼接、`.suffix` 拆名、`rglob` 找文件、`mkdir(parents=True, exist_ok=True)` 建目录。

有了文件读写，下一步该把"数据 + 行为"打包起来——第 18 章进入面向对象：类、继承、魔术方法、MRO、`dataclass` 与 `property`。
