# 05 · 字符串

> **本质**：Python 的 `str` 是**不可变的 Unicode 码点序列**——不是 `char[]`，不是字节数组。每一次"修改"都在造新对象，所以循环里用 `+` 拼字符串是 O(n²)；而每一次格式化都该用 f-string，它比 `%` 和 `.format` 都快且更短。

**读完这一章你能做到**

- 熟练用 `split` / `join` / `strip` / `replace` / `find` 处理一行文本；
- 说清 `len(s)` 数的是字符还是字节，并在读写文件时不踩编码坑；
- 用 f-string 写出对齐、补零、千分位、百分比、进制、日期、调试输出；
- 知道为什么循环里 `s += x` 慢，并改成 `"".join(...)`；
- 区分"找不到"的两种 API：`find` 返回 -1，`index` 抛 `ValueError`。

---

## 5.1 字面量、转义与不可变性

四种写法：

```pycon
>>> 'single', "double", 'contains "quote"'
('single', 'double', 'contains "quote"')
>>> "a" "b"          # 相邻字面量自动拼接（编译期完成）
'ab'
>>> r"C:\new\table"  # raw：反斜杠不当转义
'C:\\new\\table'
>>> """第一行
... 第二行"""
'第一行\n第二行'
```

常用转义：`\n` 换行、`\t` 制表、`\\` 反斜杠本身、`\'`、`\"`、`\0` 空字符、`\x41`（十六进制字节）、`\u4e2d`（Unicode 码点，即"中"）。**路径优先用 `pathlib` 或 `/`**，别跟反斜杠搏斗（第 17 章）。

`str` 不可变，意味着：

```pycon
>>> s = "abc"
>>> s.upper()
'ABC'
>>> s
'abc'
>>> try:
...     s[0] = "x"
... except TypeError as e:
...     print(type(e).__name__, e)
TypeError 'str' object does not support item assignment
```

所有"修改"类方法（`upper`、`replace`、`strip`、`zfill`…）都**返回新串**，原串不动。这和 C++ 的 `std::string` 完全不同——那边 `s.append()` 是原地改。

---

## 5.2 长度是字符，不是字节

```pycon
>>> len("中文")
2
>>> len("中文".encode("utf-8"))
6
>>> "中文".encode("utf-8")
b'\xe4\xb8\xad\xe6\x96\x87'
```

- `len(str)` = **码点个数**（不是"看起来几个字"，emoji 组合字符可能算多个）；
- `len(s.encode("utf-8"))` = **字节数**，中文一个字 3 字节；
- `str` 与 `bytes` 之间用 `encode` / `decode` 转换，**不能直接相加**（`"a" + b"b"` 报 `TypeError`）。

```pycon
>>> b"abc".decode("utf-8")
'abc'
>>> try:
...     b"\xff".decode("utf-8")
... except UnicodeDecodeError as e:
...     print(type(e).__name__, e)
UnicodeDecodeError 'utf-8' codec can't decode byte 0xff in position 0: invalid start byte
```

这类报错 90% 来自"文件是 GBK，你按 UTF-8 读"。修法不是 `try/except`，而是**找到正确的编码**：中文 Windows 导出的 CSV 常见 `encoding="gbk"`，网页与代码一律 UTF-8。

---

## 5.3 常用方法分四组

```python
# 示例：examples/ch05_01_methods.py
"""ch05_01_methods.py —— 字符串不可变、常用方法与切片式查询"""
s = "Hello, Python"
print("长度（字符数）：", len(s))
print("长度（UTF-8 字节数）：", len(s.encode("utf-8")), len("中文".encode("utf-8")))

print("=== 不可变：所有修改都返回新串 ===")
t = s.lower()
print(s, "|", t, "| 原串没变:", s is not t)
try:
    s[0] = "h"
except TypeError as e:
    print("TypeError:", e)
try:
    print(s + 1)
except TypeError as e:
    print("TypeError:", e)

print("=== 清洗与切分 ===")
print(repr("  hi \n".strip()), repr("xxhixx".strip("x")))
print("a,b,,c".split(","))
print("a b  c\n d".split())
print("a,b,c".split(",", 1))
print("x".join(["a", "b"]))
print("=" * 10)

print("=== 查询：find 给 -1，index 抛异常 ===")
print(s.find("Python"), s.find("Java"))
try:
    s.index("Java")
except ValueError as e:
    print("ValueError:", e)
print(s.count("l"), s.startswith(("Hi", "Hello")), s.endswith("on"))
print("包含判断：", "Python" in s)

print("=== 变形与排版 ===")
print("42".zfill(5), "ab".center(6, "*"), "ab".ljust(5, ".") + "|")
print("PyThOn".lower(), "PyThOn".upper(), "py thon".title(), "py thon".capitalize())
print("a1".isalnum(), "42".isdigit(), "abc".isalpha())
print(repr("  多余空白  ".strip()))
```

```text
长度（字符数）： 13
长度（UTF-8 字节数）： 13 6
=== 不可变：所有修改都返回新串 ===
Hello, Python | hello, python | 原串没变: True
TypeError: 'str' object does not support item assignment
TypeError: can only concatenate str (not "int") to str
=== 清洗与切分 ===
'hi' 'hi'
['a', 'b', '', 'c']
['a', 'b', 'c', 'd']
['a', 'b,c']
axb
==========
=== 查询：find 给 -1，index 抛异常 ===
7 -1
ValueError: substring not found
2 True True
包含判断： True
=== 变形与排版 ===
00042 **ab** ab...|
python PYTHON Py Thon Py thon
True True True
'多余空白'
```

| 组 | 方法 | 要点 |
| --- | --- | --- |
| 清洗 | `strip` / `lstrip` / `rstrip` / `replace` | 不带参数时去**所有空白**（空格、`\t`、`\n`）；带参数时按字符集合逐个剥离，`"xxhixx".strip("x")` 得 `'hi'` |
| 切分 | `split` / `rsplit` / `splitlines` / `partition` | 无参数 `split()` 按任意连续空白切**且丢空串**；`split(",")` 会保留空串；`partition` 总是返回三元组 |
| 查询 | `find` / `rfind` / `index` / `count` / `startswith` / `endswith` / `in` | `find` 找不到返回 `-1`，`index` 抛 `ValueError`；`startswith` 可传 tuple 试多个前缀 |
| 变形 | `upper` / `lower` / `capitalize` / `title` / `swapcase` | 都是**返回新串**；`title()` 会把 `"it's"` 变成 `"It'S"`，别用于人名 |
| 排版 | `zfill` / `center` / `ljust` / `rjust` | 补零 `zfill` 会保留符号：`"-42".zfill(5)` 得 `'-0042'` |

> **💡 提示** 判断"是不是数字"要分清：`s.isdigit()` 只认十进制数字字符，`"１２".isdigit()`（全角）也为真；`"1.5".isdigit()` 为假。要判断字符串能否转 `int`，最稳的是 `try: int(s) except ValueError`——这叫 EAFP（第 16 章）。

---

## 5.4 拼接：`+` 为什么慢

`str` 不可变，所以 `s = s + x` 每次都要**新建一个更长的串并复制全部旧内容**。拼接 n 次总代价是 `O(n²)`：

```text
第 1 次复制 1 个字符，第 2 次复制 2 个……第 n 次复制 n 个 → n(n+1)/2
```

10 万次 `+=` 就是约 50 亿字符复制，妥妥 TLE。正确做法是**收集到列表再一次 join**（`join` 先算总长度，一次分配一次复制，O(n)）：

```pycon
>>> parts = [str(i) for i in range(4)]
>>> "".join(parts)
'0123'
>>> "-".join(parts)
'0-1-2-3'
>>> "".join([])
''
```

同样的道理，构造大量行时用 `"\n".join(lines)`，别在循环里 `print` 十次（`print` 有 IO 开销，第 17 章会讲用 `sys.stdout.write` 或一次性 join）。

---

## 5.5 f-string：日常首选

```python
# 示例：examples/ch05_02_format.py
"""ch05_02_format.py —— 三代格式化：%、format、f-string"""
from datetime import date

name, score = "小明", 92.4567
print("=== % 旧式（知道就行，新代码别用） ===")
print("%s 得分 %.2f" % (name, score))
print("%5s|%-5s|" % ("ab", "ab"))

print("=== str.format ===")
print("{} 得分 {:.2f}".format(name, score))
print("{0}-{1}-{0}".format("A", "B"))
print("{n} 得分 {s:.1f}".format(n=name, s=score))

print("=== f-string：日常首选 ===")
print(f"{name} 得分 {score:.2f}")
print(f"舍入到整数：{score:.0f}，科学计数：{score:.2e}")
print(f"宽度对齐：[{42:>6}][{42:<6}][{42:^6}]")
print(f"补零：[{42:06d}]，带符号：[{42:+d}][{-42:+d}]")
print(f"千分位：{1234567:,}，百分比：{0.256:.1%}")
print(f"进制：{255:#x} {255:x} {5:#b} {8:o}")
print(f"repr：{name!r}，调试语法：{score=}")
width = 8
print(f"嵌套宽度：[{42:>{width}}]")
print(f"日期：{date(2024, 1, 5):%Y-%m-%d}，{date(2024, 1, 5):%A}")

print("=== 拼接性能：join 而不是 + ===")
parts = [str(i) for i in range(5)]
print("+ 拼接:", "".join(parts) == "0" + "1" + "2" + "3" + "4")
print("join 结果:", "|".join(parts))
```

```text
=== % 旧式（知道就行，新代码别用） ===
小明 得分 92.46
   ab|ab   |
=== str.format ===
小明 得分 92.46
A-B-A
小明 得分 92.5
=== f-string：日常首选 ===
小明 得分 92.46
舍入到整数：92，科学计数：9.25e+01
宽度对齐：[    42][42    ][  42  ]
补零：[000042]，带符号：[+42][-42]
千分位：1,234,567，百分比：25.6%
进制：0xff ff 0b101 10
repr：'小明'，调试语法：score=92.4567
嵌套宽度：[      42]
日期：2024-01-05，Friday
=== 拼接性能：join 而不是 + ===
+ 拼接: True
join 结果: 0|1|2|3|4
```

格式说明符的完整语法是 `{值:填充符 对齐 宽度 . 精度 类型}`，记住高频的十来个就够：

| 写法 | 结果 | 用途 |
| --- | --- | --- |
| `{x:.2f}` | `3.14` | 保留 2 位小数（四舍五入，不是银行家舍入） |
| `{x:>6}` `{x:<6}` `{x:^6}` | 右/左/居中，宽度 6 | 表格对齐 |
| `{x:06d}` | `000042` | 编号补零（注意 `0` 是填充符的简写） |
| `{x:,}` | `1,234,567` | 千分位 |
| `{x:.1%}` | `25.6%` | 百分比（自动乘 100 加 `%`） |
| `{x:#x}` `{x:#b}` `{x:o}` | `0xff` `0b101` `10` | 进制 |
| `{x!r}` | `'小明'` | 带引号的 `repr`，调试看清类型 |
| `{x=}` | `score=92.4567` | 调试语法，连变量名一起打印（3.8+） |
| `{x:>{w}}` | 宽度取自变量 | 列宽动态 |
| `{d:%Y-%m-%d}` | `2024-01-05` | 日期格式化 |

三个必知限制：

1. **f-string 的引号冲突**：3.12 之前，`f"{d["k"]}"` 是非法的（同种引号嵌套），要写 `f"{d['k']}"`；3.12+ 放开了；
2. **f-string 不能在表达式里放反斜杠**（3.12 起放宽），`f"{'\n'.join(xs)}"` 在旧版要拆成两步；
3. **f-string 在定义处就求值**，不像模板那样延后——写日志时如果格式化开销大，用 `logging` 的 `%s` 惰性风格（第 21 章）。

> **⚠️ 易错** `f"{score:.2f}"` 与 `round(score, 2)` 行为不同：格式化是"按显示精度四舍五入（half-even 一半）"，`round` 返回 float。**判题输出一律用格式化**，别用 `round` 再 `print`（`round(2.5)` 得 `2`，输出会错）。

---

## 5.6 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 类型 | `std::string` 是字节序列，`char` 为元素 | `str` 是 Unicode 码点序列，元素还是 `str` |
| 可变性 | `s += x`、`s[0] = 'a'` 原地改 | 不可变，一切"修改"返回新串 |
| 长度 | `s.size()` 字节数 | `len(s)` 字符数，字节数要 `len(s.encode())` |
| 拼接 | `+`/`append` 均摊 O(1) | `+` 每次 O(n)，批量用 `join` |
| 格式化 | `printf("%.2f")` / `cout << setprecision` | f-string `f"{x:.2f}"` |
| 单字符 | `char` | 长度 1 的 `str`，没有 `char` 类型 |
| 大小写/查找 | `std::toupper`、`s.find()` 返回 `npos` | 方法调用 `.upper()`、`.find()` 返回 `-1` |
| 数字→串 | `to_string` | `str(x)` / f-string |

---

## 5.7 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `AttributeError: 'str' object has no attribute 'append'` | 想往字符串追加 | `s += x` 或收集到 list 再 `join` |
| `TypeError: 'str' object does not support item assignment` | 想按下标赋值 | 切片拼接：`s = s[:i] + "x" + s[i+1:]` |
| `TypeError: can only concatenate str (not "int") to str` | 字符串加数字 | f-string 或 `str(n)` |
| `UnicodeDecodeError` | 用错编码读文件 | `open(..., encoding="utf-8")` 或 `"gbk"` |
| `"a,b".split(",")` 得到多余空串 | 分隔符形式会保留空字段 | 用 `split()`（无参）或过滤 `if x` |
| `s.find(x)` 返回 `-1` 被当成下标用 | `find` 不抛异常 | 先判断 `if s.find(x) != -1` 或改用 `in` |
| `f"{d["k"]}"` 报 `SyntaxError` | 同种引号嵌套（3.12 前） | `f"{d['k']}"` |
| `"中文".len()` 报错 | 方法不存在 | `len("中文")` |
| 循环里 `+=` 拼接导致 TLE | 每次 O(n) 复制 | `"".join(parts)` |
| `"0"` 判断为真 | 非空字符串恒为真 | `s.strip() == "0"` 或转 int |

---

## 5.8 练习

**1.（清洗）** 读一行形如 `" 姓名 : 小明 , 分数 : 92 "` 的文本，输出 `('小明', 92)`。

验收：`split(",")` + `split(":")` + `strip()` + `int()`，输入里有多余空格也能正确解析。

**2.（对齐表格）** 给定 `[("小明", 92.4567), ("张三", 8.5)]`，输出两列左对齐、分数保留 2 位小数、总宽 20 字符的表格。

验收：两行的分数列**右对齐**且小数点对齐，姓名列左对齐。

**3.（拼接性能）** 写两个函数：`by_plus(words)` 用 `+=` 拼接，`by_join(words)` 用 `join`，对 20000 个短词各跑一次，**打印两个结果是否相等**（不要打印耗时）。

验收：两者结果相等，并说明为什么 `by_plus` 的复杂度是 O(n²)。

**4.（变式）** 实现 `truncate(s, n)`：超过 n 个字符时截断并加 `"…"`，保证总长不超过 n；中文按字符算。

验收：`truncate("abcdef", 4) == "abc…"`、`truncate("中文测试", 10) == "中文测试"`、`truncate("中文测试", 3) == "中文…"`。

**5.（挑战）** 实现 `word_count(text)`：统计英文单词出现次数，返回按次数降序、次数相同按字母升序的列表，并处理大小写与标点。

验收：`word_count("The cat, the CAT!")` 得 `[("the", 2), ("cat", 2)]`（顺序：次数相同按字母序）。

---

## 5.9 小结

1. **`str` 不可变**：所有方法是"返回新串"，按下标赋值必然 `TypeError`。
2. **`len` 数字符、`encode` 数字节**，读写文件一律显式 `encoding="utf-8"`。
3. **格式化用 f-string**，拼接用 `join`；`+=` 在循环里是 O(n²)，是 TLE 的常见来源。

下一章把字符串放进容器：列表、元组、字典、集合——四种结构的选择直接决定程序的复杂度。
