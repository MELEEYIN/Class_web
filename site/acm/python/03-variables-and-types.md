# 03 · 变量与数据类型

> **本质**：Python 的变量不是装数据的盒子，而是**贴在对象上的名字**。`a = b` 从不让数据搬家，它只是让第二个名字贴上同一个对象；真正决定程序行为的，是这个对象**可不可变**。

**读完这一章你能做到**

- 看见 `b = a` 就立刻判断出改 `b` 会不会影响 `a`；
- 说出 `0.1 + 0.2` 不等于 `0.3` 的原因，并在需要精确时改用 `Decimal`；
- 区分"重新绑定"和"原地修改"，知道函数传参改不动调用方的哪种写法；
- 一眼认出 `[[0] * 3] * 3` 这类"三行共用一个列表"的隐形 bug；
- 正确选择 `is` 与 `==`，并用 `is None` 判断缺失值。

---

## 3.1 变量是名字，不是盒子

C++ 里 `int a = 1; int b = a;` 会在栈上开出两块 4 字节，改 `b` 永远碰不到 `a`。Python 完全不是这样：赋值语句 `b = a` 只做一件事——**在命名空间里记录"名字 b 指向对象 a 所指的那个对象"**。

```pycon
>>> a = [1, 2]
>>> b = a                 # b 是 a 的别名，不是副本
>>> b.append(3)
>>> a
[1, 2, 3]
>>> a is b
True
```

`is` 判断两个名字是不是同一个对象（比的是 id），`==` 判断内容是否相等。上面两次 `append` 只有一次真正发生，因为 `a` 和 `b` 根本就是同一个列表。

不可变对象看起来"安全"，其实原理一样，只是**没人能改它**：

```pycon
>>> x = 10
>>> y = x
>>> y += 1                # int 不可变，+= 实际上是造了个新对象 11
>>> x, y
(10, 11)
```

所以判断影响的规则只有一条：**改的是"对象的内容"还是"名字的指向"**。

```python
# 示例：examples/ch03_02_binding.py
"""ch03_02_binding.py —— 变量是名字，不是盒子"""
a = [1, 2, 3]
b = a                    # 别名：两个名字贴同一个列表
b.append(4)
print("a =", a)
print("b =", b)
print("a is b :", a is b)

c = a[:]                 # 切片 = 浅拷贝，得到新列表
c.append(5)
print("a =", a)
print("c =", c)
print("a is c :", a is c)

x = 10
y = x
y += 1                   # int 不可变，+= 造出一个新对象
print("x, y =", x, y)

print("--- 函数参数：改内容 vs 换名字 ---")


def add_item(lst):
    lst.append("新")      # 原地修改，调用方看得见


def rebind(lst):
    lst = lst + ["新"]    # 重新绑定，调用方看不见


box1 = ["旧"]
add_item(box1)
print("add_item 之后:", box1)

box2 = ["旧"]
rebind(box2)
print("rebind 之后:", box2)

print("--- is 与 == ---")
p = int("256")
q = int("256")
print("256 缓存:", p is q, p == q)
r = int("300")
s = int("300")
print("300 不复用:", r is s, r == s)
print("None 只能用 is:", None is None, [] is [])
```

```text
a = [1, 2, 3, 4]
b = [1, 2, 3, 4]
a is b : True
a = [1, 2, 3, 4]
c = [1, 2, 3, 4, 5]
a is c : False
x, y = 10 11
--- 函数参数：改内容 vs 换名字 ---
add_item 之后: ['旧', '新']
rebind 之后: ['旧']
--- is 与 == ---
256 缓存: True True
300 不复用: False True
None 只能用 is: True False
```

`add_item` 改了调用方的列表，`rebind` 没改——因为 `lst = lst + ["新"]` 只是让**函数内部的这个名字**改贴新对象，外面那个列表连碰都没被碰到。这是 Python 传参的全部机制，叫「按对象引用传递」：传的是名字所指的对象，不是对象副本。

> **⚠️ 易错** 把 Python 的参数当 C++ 的 `&` 引用：`x = x + [1]` 不会影响调用方，`x.append(1)` 会。想改调用方，要么原地改，要么 `return` 回去再赋给原变量。

---

## 3.2 六个内置类型先认清

`type()` 返回类型对象，`isinstance()` 判断"是不是这一类（含子类）"：

```pycon
>>> type(42), type(4.2), type("4"), type(True), type(None)
(<class 'int'>, <class 'float'>, <class 'str'>, <class 'bool'>, <class 'NoneType'>)
>>> isinstance(True, int), isinstance(42, float)
(True, False)
```

| 类型 | 字面量 | 可变性 | 典型用途 |
| --- | --- | --- | --- |
| `int` | `42`、`0xff`、`0b1010`、`1_000_000` | 不可变 | 计数、编号、大整数运算 |
| `float` | `3.14`、`1e-5`、`float("inf")` | 不可变 | 物理量、概率、近似计算 |
| `bool` | `True`、`False` | 不可变 | 条件、开关、`sum()` 计数 |
| `str` | `'a'`、`"a"`、`f"{x}"` | 不可变 | 文本、路径、输出 |
| `NoneType` | `None` | 不可变 | "没有值"的哨兵 |
| `complex` | `1+2j` | 不可变 | 很少用，了解即可 |

数值类型之间会自动提升：`int` 混进 `float` 运算就变 `float`，`bool` 混进 `int` 就当 0/1。字符串**不会**自动变数字，`"1" + 1` 直接 `TypeError`。

---

## 3.3 整数：没有溢出，但有代价

C++ 的 `int` 32 位、`long long` 64 位，`1e18 * 1e18` 溢出成垃圾值；Python 的 `int` 用变长数组存，**永远不会溢出**，代价是大数运算变慢（内部按 30 位一"段"做长乘法）。

```pycon
>>> 2 ** 100
1267650600228229401496703205376
>>> len(str(2 ** 200))
61
>>> 10 ** 30 // 7
142857142857142857142857142857
```

竞赛里 `n ≤ 10^5` 的阶乘、`a^b mod p` 直接算就行，不用手写高精度。唯一的硬限制是 **3.11 起，`str()` 一个超过 4300 位的整数会抛 `ValueError`**（防止有人拿 `2**100000000` 做 DoS），需要时先 `sys.set_int_max_str_digits(0)`。

```python
# 示例：examples/ch03_01_numbers.py
"""ch03_01_numbers.py —— int / float / Decimal / Fraction / bool"""
print("=== int：任意精度，不溢出 ===")
print(2 ** 100)
print(10 ** 20 // 7)
print(len(str(2 ** 200)))          # 大整数转字符串也没问题

print("=== float：二进制浮点，有误差 ===")
print(0.1 + 0.2)
print(0.1 + 0.2 == 0.3)
print(f"{0.1 + 0.2:.20f}")         # 看真实的二进制近似值
print(1e16 + 1)                    # 精度只有 15~17 位十进制
print(2 ** 53, 2 ** 53 + 1, float(2 ** 53) + 1)
print(round(2.675, 2))             # 不是 2.68

print("=== Decimal / Fraction：要精确就用它们 ===")
from decimal import Decimal, getcontext
from fractions import Fraction

getcontext().prec = 30
print(Decimal("0.1") + Decimal("0.2"))
print(Decimal("1.1") * Decimal("3"))
print(Fraction(1, 3) + Fraction(1, 6))

print("=== bool 是 int 的子类 ===")
print(True + True)
print(isinstance(True, int), type(True) is int)
print(sum([True, False, True, True]))   # 统计满足条件的个数

print("=== 除法总是返回 float ===")
print(4 / 2, type(4 / 2).__name__)
print(4 // 2, type(4 // 2).__name__)
```

```text
=== int：任意精度，不溢出 ===
1267650600228229401496703205376
14285714285714285714
61
=== float：二进制浮点，有误差 ===
0.30000000000000004
False
0.30000000000000004441
1e+16
9007199254740992 9007199254740993 9007199254740992.0
2.67
=== Decimal / Fraction：要精确就用它们 ===
0.3
3.3
1/2
=== bool 是 int 的子类 ===
2
True False
3
=== 除法总是返回 float ===
2.0 float
2 int
```

最后两行是个高频陷阱：`4 / 2` 是 `2.0` 而不是 `2`。**`/` 永远返回 float**，要整数结果必须写 `//`。

---

## 3.4 浮点：为什么 `0.1 + 0.2 != 0.3`

`float` 是 IEEE-754 双精度：1 位符号、11 位指数、52 位尾数，等价于 `m / 2^k` 形式的二进制小数。而 `0.1` 在二进制里是无限循环小数，只能截断存储，于是误差在加法里累积：

```pycon
>>> 0.1 + 0.2
0.30000000000000004
>>> 0.1 + 0.2 == 0.3
False
>>> f"{0.1 + 0.2:.20f}"
'0.30000000000000004441'
>>> abs((0.1 + 0.2) - 0.3) < 1e-9        # 正确姿势：比误差
True
```

两条工程结论：

1. **永远不要用 `==` 比较两个算出来的浮点数**，用 `abs(a - b) < eps`（`math.isclose(a, b)` 更稳，它按相对误差判断）；
2. **金额、分数这类必须精确的场景，用 `Decimal`（十进制）或 `Fraction`（有理数）**，并且 `Decimal` 一定要用**字符串**构造。

```pycon
>>> from decimal import Decimal
>>> Decimal("0.1") + Decimal("0.2")
Decimal('0.3')
>>> Decimal(0.1)                        # 传 float 会把误差原样带进来
Decimal('0.1000000000000000055511151231257827021181583404541015625')
>>> from fractions import Fraction
>>> Fraction(1, 3) + Fraction(1, 6)
Fraction(1, 2)
```

顺带记住两个数：`2**53 = 9007199254740992` 是 float 能**精确表示连续整数**的上界，超过它相邻整数就共用同一个 float；`round()` 用的是"银行家舍入"（.5 取偶），所以 `round(2.675, 2)` 得 `2.67`，`round(0.5)` 得 `0`、`round(1.5)` 得 `2`。竞赛判题输出浮点通常要求 `%.2f` 或误差 ≤ 1e-6，正是为了绕开这些。

---

## 3.5 `bool` 是 `int` 的子类

`True` 就是 `1`，`False` 就是 `0`，`bool` 继承自 `int`。这带来一个实用技巧——**布尔值求和就是计数**：

```pycon
>>> True + True
2
>>> sum([True, False, True, True])
3
```

但它也埋了坑：`isinstance(True, int)` 是 `True`，所以 `1 == True`、`0 == False` 都成立，`{1: "a"}[True]` 能取到 `"a"`。做"类型严格相等"判断时要用 `type(x) is bool`。

---

## 3.6 可变与不可变：决定"多个名字"会不会互相影响

| 类别 | 类型 | 能否原地改 |
| --- | --- | --- |
| 不可变 | `int` `float` `bool` `str` `tuple` `frozenset` `bytes` `None` | 不能，任何"修改"都产生新对象 |
| 可变 | `list` `dict` `set` `bytearray`、绝大多数自定义类实例 | 能，改的是同一块内存 |

不可变带来两个直接后果：**可以作字典的键、可以放进集合**（因为哈希值不会变），以及**在函数里"改"它其实改不到调用方**。

```pycon
>>> {(1, 2): "点", "x": 1}[(1, 2)]
'点'
>>> d = {}
>>> try:
...     d[[1, 2]] = "线"
... except TypeError as e:
...     print(type(e).__name__, e)
TypeError cannot use 'list' as a dict key (unhashable type: 'list')
```

上面的 `TypeError: unhashable type: 'list'` 是新手最常见的报错之一，根因就是 list 可变、没有稳定哈希。把键换成 `tuple(lst)` 即可。

元组本身不可变，但**里面装的若是可变对象，那个对象仍然能被改**：

```pycon
>>> t = (1, [2, 3])
>>> t[0] = 9
Traceback (most recent call last):
    ...
TypeError: 'tuple' object does not support item assignment
>>> t[1].append(9)
>>> t
(1, [2, 3, 9])
```

"不可变"约束的是**这一层的引用关系**，不是递归的深不可变。理解这一点，`tuple` 能不能当 dict 键就有了判断标准：`(1, [2])` 不可哈希，`(1, (2, 3))` 可以。

---

## 3.7 浅拷贝、深拷贝，与 `[[0] * 3] * 3`

`b = a` 是别名；`a[:]`、`list(a)`、`a.copy()`、`copy.copy(a)` 是**浅拷贝**：只复制最外层容器，里面的元素仍是共享的。`copy.deepcopy(a)` 才递归复制到底。

```text
# 示例：examples/ch03_03_copy.py 的运行结果（完整源码见该文件）
```

```python
# 示例：examples/ch03_03_copy.py
"""ch03_03_copy.py —— 浅拷贝 / 深拷贝 / 不可变"""
import copy

a = [1, [2, 3]]
b = a.copy()             # 浅拷贝：只复制最外层
c = copy.deepcopy(a)     # 深拷贝：递归复制所有层次

b[0] = 100
b[1].append(99)

print("a =", a)
print("b =", b)
print("c =", c)

print("--- 不可变对象：改了就是新对象 ---")
s = "abc"
t = s
s += "d"
print(s, t, s is t)

tup = (1, [2, 3])
try:
    tup[0] = 9
except TypeError as e:
    print("TypeError:", e)
tup[1].append(9)          # 元素可变，容器仍不可变
print("元组内部被改了:", tup)

print("--- 浅拷贝对字典/集合 ---")
d = {"k": [1, 2]}
d2 = dict(d)
d2["k"].append(3)
print(d, d2)

print("--- 列表乘法的陷阱 ---")
grid = [[0] * 3] * 3
grid[0][0] = 1
print(grid)
grid2 = [[0] * 3 for _ in range(3)]
grid2[0][0] = 1
print(grid2)
```

```text
a = [1, [2, 3, 99]]
b = [100, [2, 3, 99]]
c = [1, [2, 3]]
--- 不可变对象：改了就是新对象 ---
abcd abc False
TypeError: 'tuple' object does not support item assignment
元组内部被改了: (1, [2, 3, 9])
--- 浅拷贝对字典/集合 ---
{'k': [1, 2, 3]} {'k': [1, 2, 3]}
--- 列表乘法的陷阱 ---
[[1, 0, 0], [1, 0, 0], [1, 0, 0]]
[[1, 0, 0], [0, 0, 0], [0, 0, 0]]
```

看第一组：`b[1].append(99)` 之后 `a` 的内层列表也变成了 `[2, 3, 99]`，因为浅拷贝只复制了"指向内层列表的那根指针"。`c` 保持干净，因为 `deepcopy` 连内层一起复制了。再看最后两行：`[[0] * 3] * 3` 里三个"行"是**同一个列表对象**（乘法复制的是引用），改一行等于改三行；用推导式逐行新建才对。

> **💡 提示** 二维数组/矩阵一律用 `[[0] * m for _ in range(n)]`。`[[0] * m] * n` 是 Python 教程里最高频的 bug 模板，判题时表现为"改了一个格子，一整列都变了"。

---

## 3.8 `None`：一个专门表示"没有"的对象

`None` 是 `NoneType` 的唯一实例，表示"这里没有值"。它**不是** 0、`""`、`False`，也不等于空容器。所有比较里只有 `is None` 是对的：

```pycon
>>> x = None
>>> x is None
True
>>> not x
True
>>> x == 0
False
```

判断"函数有没有返回值/有没有找到"时，用 `is None` 而不是 `== None`：前者比 id（永远 O(1)），后者会调用可能被重载的 `__eq__`，而且 flake8 会直接报 `E711`。

```pycon
>>> def find(xs, target):
...     for i, v in enumerate(xs):
...         if v == target:
...             return i
...     return None
>>> idx = find([3, 1, 4], 9)
>>> print(idx is None)
True
>>> print(idx == 0)          # 用索引真假判断的经典翻车点
False
```

如果 `find` 返回 `0`（第一个位置就命中），`if not idx:` 会把"找到了"误判成"没找到"。**返回索引、又可能返回"没找到"时，一律 `is None` 判断**，或者干脆用 `if idx is not None:`。

---

## 3.9 类型转换与真值判断

```python
# 示例：examples/ch03_04_convert.py
"""ch03_04_convert.py —— 类型转换、真值与 None"""
print(int("42"), int("  7  "), int("-8"))
print(int("1f", 16), int("0b1010", 2), int("1_000"))
print(int(3.99), int(-3.99), round(3.99))
print(float("1e3"), float("0.5"), float("inf") > 10 ** 308)
print(str(1.0), str(10), str(True), str([1, 2]))
print(list("abc"), tuple([1, 2]), sorted({"b", "a"}))

print("--- 真值判断 ---")
for v in [0, 3, -1, 0.0, "", "0", [], [0], {}, None]:
    print(f"{v!r:>6}  ->  {bool(v)}")

print("--- None ---")
def find(xs, target):
    for i, v in enumerate(xs):
        if v == target:
            return i
    return None

print(find([3, 1, 4], 4), find([3, 1, 4], 9))
idx = find([3, 1, 4], 9)
print("用 is 判断:", idx is None)
print("用 == 判断的坑:", idx == 0)

print("--- 会炸的转换 ---")
for expr in ['int("abc")', 'int("3.5")', 'int(None)', 'float("1,5")']:
    try:
        eval(expr)
    except (ValueError, TypeError) as e:
        print(f"{expr:<14} -> {type(e).__name__}: {e}")
```

```text
42 7 -8
31 10 1000
3 -3 4
1000.0 0.5 True
1.0 10 True [1, 2]
['a', 'b', 'c'] (1, 2) ['a', 'b']
--- 真值判断 ---
     0  ->  False
     3  ->  True
    -1  ->  True
   0.0  ->  False
    ''  ->  False
   '0'  ->  True
    []  ->  False
   [0]  ->  True
    {}  ->  False
  None  ->  False
--- None ---
2 None
用 is 判断: True
用 == 判断的坑: False
--- 会炸的转换 ---
int("abc")     -> ValueError: invalid literal for int() with base 10: 'abc'
int("3.5")     -> ValueError: invalid literal for int() with base 10: '3.5'
int(None)      -> TypeError: int() argument must be a string, a bytes-like object or a real number, not 'NoneType'
float("1,5")   -> ValueError: could not convert string to float: '1,5'
```

要记住的真值规则：**空即假**——`0`、`0.0`、`""`、`[]`、`{}`、`()`、`set()`、`None` 全为 `False`，其余为真。两个反直觉点：字符串 `"0"` 和 `"False"` 是**非空字符串**，真值为 `True`；`-1` 也是真值。

转换的坑集中在 `int()`：它只认"整数字面量"，`int("3.5")` 抛 `ValueError`，要先 `int(float("3.5"))`；`int(3.99)` 是**截断**（向零取整，得 3），而 `int(-3.99)` 得 -3，不是 C 语言里某些实现的向下取整。

> **⚠️ 易错** `bool("False")` 是 `True`。从配置文件/命令行读到的 `"False"`、`"0"`、`"no"` 必须显式映射：`s.strip().lower() in {"1", "true", "yes", "on"}`。

---

## 3.10 命名与"常量"约定

| 写法 | 含义 | 例子 |
| --- | --- | --- |
| `snake_case` | 变量、函数、模块 | `user_count`、`parse_line` |
| `PascalCase` | 类 | `class TreeNode` |
| `_leading` | 内部使用（约定，不强制） | `_cache` |
| `__dunder__` | Python 保留的协议名 | `__init__`、`__len__` |
| `UPPER_CASE` | 常量（**约定**，Python 没有 const） | `MAX_N = 10 ** 5` |
| `_` | 丢弃不用的值 | `for _ in range(n)` |

变量名会**遮蔽内置函数**：`list = [1, 2]` 之后 `list("ab")` 就报 `TypeError: 'list' object is not callable`。同理别用 `id`、`type`、`sum`、`input`、`next`、`str` 当变量名。想表达"这是常量"，写全大写；想在类型检查层面强制只读，用 `typing.Final`（见第 20 章）。

---

## 3.11 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 变量的本质 | 一块有类型的内存 | 命名空间里的一条"名字 → 对象"记录 |
| `b = a` | 复制值（或调拷贝构造） | 新建别名，零复制 |
| 类型 | 编译期固定，声明即分配 | 运行期跟着对象走，名字可随时改指别的类型 |
| 整数 | 32/64 位，溢出回绕 | 任意精度，不溢出，大数变慢 |
| `4 / 2` | `2`（int 除法） | `2.0`（`/` 永远 float，整除用 `//`） |
| 传参 | 值传递 / `&` 引用 / 指针 | 按对象引用传递：改内容可见，重新绑定不可见 |
| 布尔 | 独立的 `bool`，可隐式转 `int` | `bool` **继承自** `int`，`True + True == 2` |
| 数组拷贝 | `std::vector` 深拷贝语义 | `a.copy()` 只是浅拷贝，深拷贝要 `deepcopy` |
| 常量 | `const` / `constexpr` 编译期强制 | 只有大写命名约定，无强制力（`Final` 仅类型检查期） |
| 空值 | `nullptr` / `NULL` | `None`，用 `is None` 判断 |

---

## 3.12 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| 改 `b` 结果 `a` 也变了 | `b = a` 是别名 | 要独立副本就 `b = a.copy()` / `copy.deepcopy(a)` |
| 改矩阵一个格子，整列都变 | `[[0]*m]*n` 复制的是同一行的引用 | `[[0]*m for _ in range(n)]` |
| `0.1 + 0.2 == 0.3` 为 `False` | 二进制浮点无法精确表示 0.1 | `math.isclose(a, b)` 或 `Decimal("0.1")` |
| `round(2.675, 2)` 得 `2.67` | 银行家舍入 + 二进制误差 | 金额用 `Decimal`，按需 `quantize` |
| `4 / 2` 输出 `2.0`，格式错 | `/` 永远返回 float | 要整数用 `//`；要显示 `2` 用 `int()` 或 `f"{x:.0f}"` |
| `d[[1,2]] = ...` 报 `unhashable` | list 可变，不能当键 | `d[tuple(lst)]` |
| `x == None` 被判为不严谨 | `==` 会走 `__eq__` | 一律 `x is None` |
| `if not idx:` 把索引 0 当"没找到" | 0 为假 | `if idx is not None:` |
| `int("3.5")` 抛 `ValueError` | `int()` 只认整数字面量 | `int(float("3.5"))` |
| `bool("False")` 是 `True` | 非空字符串恒为真 | 显式白名单判断 |
| `list = [...]` 后 `list()` 报错 | 内置名被遮蔽 | 换个变量名，必要时 `del list` |
| 元组里塞了列表，改了列表发现"元组变了" | 元组只保证本层引用不变 | 需要真不可变就用 `tuple` + `tuple`，别混放可变对象 |

---

## 3.13 练习

**1.（预测输出）** 不运行，写出结果，再跑一遍核对：

```python
# 片段
a = [1, 2, 3]
b = a
b += [4]
c = a[:]
c += [5]
print(a, b, c)
```

验收：能解释为什么 `a` 和 `b` 都变成 `[1, 2, 3, 4]`，而 `c` 是 `[1, 2, 3, 4, 5]`（提示：`+=` 对 list 走 `__iadd__`，是原地扩展）。

**2.（修 bug）** 下面代码本意是造一个 3×3 的零矩阵，然后把主对角线设为 1，但输出全错：

```python
# 片段
g = [[0] * 3] * 3
for i in range(3):
    g[i][i] = 1
print(g)
```

验收：改成正确写法，输出

```text
[[1, 0, 0], [0, 1, 0], [0, 0, 1]]
```

**3.（判断同一性）** 写一个函数 `same_object(a, b) -> bool`，判断两个列表是不是同一个对象，并说明为什么不能用 `==` 代替。

验收：`same_object(x, x)` 为 `True`，`same_object([1], [1])` 为 `False`。

**4.（精确计算）** 用 `Decimal` 计算 `0.1 + 0.2`、`1.1 * 3`，输出必须是 `0.3` 和 `3.3`；再打印 `Decimal(0.1)` 看看直接传 float 会带进什么。

验收：两个结果分别为 `Decimal('0.3')`、`Decimal('3.3')`，并能说出为什么必须用字符串构造。

**5.（挑战）** 实现 `safe_int(s) -> int | None`：接受 `"42"`、`" 7 "`、`"3.9"`（截断为 3）、`"1e3"`（1000），非法输入返回 `None` 而不抛异常。

验收：`safe_int("3.9") == 3`、`safe_int("1e3") == 1000`、`safe_int("abc") is None`、`safe_int(None) is None`，且全程不产生未捕获异常。

---

## 3.14 小结

1. **变量是名字，赋值是贴标签**：`b = a` 不复制数据，只有"改内容"才互相影响，"换指向"不影响别人。
2. **可变性决定一切**：list/dict/set 可变且共享，int/str/tuple 不可变所以安全；要独立副本就明确写 `.copy()` 或 `deepcopy()`。
3. **数值要认清边界**：int 不溢出、`/` 返回 float、浮点不能用 `==` 比、要精确就 `Decimal("0.1")`。

下一章我们把这些对象放进表达式里，看看运算符——尤其是 `//`、`%` 对负数的处理、`and/or` 的短路返回值和 `:=` 海象运算符——是怎么工作的。
