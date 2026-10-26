# 04 · 运算符

> **本质**：Python 的运算符大多"长得像 C++、语义不一样"。最要命的三处是——`/` 永远返回浮点、`//` 和 `%` 对负数按**向下取整**配套、`and`/`or` 返回的是**操作数本身**而不是布尔值。这三条不掌握，写出来的代码会静默算错。

**读完这一章你能做到**

- 算对任何负数的 `//`、`%`、`divmod`，并解释"余数符号跟除数走"；
- 预测 `a and b`、`a or b` 返回的具体值，用它们写默认值和守卫；
- 分清 `==`、`is`、`in` 三者的语义与复杂度差异；
- 用位运算做集合标志位与快速乘除，避开优先级陷阱；
- 说清 `+=` 对列表是原地修改、对元组是重建对象。

---

## 4.1 算术运算符：四种除法

```pycon
>>> 7 / 2, 7 // 2, 7 % 2, divmod(7, 2)
(3.5, 3, 1, (3, 1))
>>> -7 // 2, -7 % 2, divmod(-7, 2)
(-4, 1, (-4, 1))
```

- `/` 是**真除法**，永远返回 `float`，`4 / 2` 得 `2.0`（第 03 章强调过）；
- `//` 是**向下取整**除法（floor），不是"截断"：`-7 // 2` 是 `-4`，不是 C 语言的 `-3`；
- `%` 的结果符号**跟除数一致**：`-7 % 3 == 2`、`7 % -3 == -2`。所以 `x % n` 在 `n > 0` 时永远落在 `[0, n)`，这个性质让 `%` 成为环形下标、哈希、日期计算的可靠工具；
- `divmod(a, b)` 一次给出 `(a // b, a % b)`，永不破坏 `a == b * (a // b) + (a % b)` 这条恒等式。

```pycon
>>> -7 % 3, 7 % -3, 7 % 3
(2, -2, 1)
>>> 2 ** 3 ** 2
512
>>> 10 ** -2
0.01
>>> 7.0 // 2
3.0
```

`**` 是**右结合**：`2 ** 3 ** 2` 等于 `2 ** 9`。负指数给出浮点结果。`//` 只要有一个操作数是浮点，结果就是浮点。

```python
# 示例：examples/ch04_01_arith.py
"""ch04_01_arith.py —— 算术、比较链与位运算"""
print("=== 四种除法 ===")
print(7 / 2, 7 // 2, 7 % 2, divmod(7, 2))
print(-7 / 2, -7 // 2, -7 % 2, divmod(-7, 2))
print("负数取模跟着除数走：", -7 % 3, 7 % -3)
print("浮点整除向下取整：", 7.0 // 2, -7.0 // 2)
print("幂是右结合：", 2 ** 3 ** 2, "负指数给小数：", 10 ** -2)
print("零除的两种情况：")
try:
    print(1 / 0)
except ZeroDivisionError as e:
    print("  ZeroDivisionError:", e)
try:
    print(1 % 0)
except ZeroDivisionError as e:
    print("  ZeroDivisionError:", e)

print("=== 比较可以连写 ===")
x = 5
print(1 < x < 10, 0 <= x <= 4 == 4)
print("字符串按字典序比较：", "apple" < "banana", "a" < "B")   # 大写字母编码更小

print("=== 位运算 ===")
print(5 & 3, 5 | 3, 5 ^ 3, ~5)
print(1 << 10, -8 >> 1)
print("位运算优先级低于算术：", 1 << 2 + 3)     # 1 << 5

print("=== NaN 不等于自己 ===")
nan = float("nan")
print(nan == nan, nan != nan)
```

```text
=== 四种除法 ===
3.5 3 1 (3, 1)
-3.5 -4 1 (-4, 1)
负数取模跟着除数走： 2 -2
浮点整除向下取整： 3.0 -4.0
幂是右结合： 512 负指数给小数： 0.01
零除的两种情况：
  ZeroDivisionError: division by zero
  ZeroDivisionError: division by zero
=== 比较可以连写 ===
True False
字符串按字典序比较： True False
=== 位运算 ===
1 7 6 -6
1024 -4
位运算优先级低于算术： 32
=== NaN 不等于自己 ===
False True
```

两个细节值得记住：`0 <= x <= 4 == 4` 是**链式比较**，等价于 `0 <= x and x <= 4 and 4 == 4`，所以它不报错反而为真——链式比较里 `==` 和 `<` 可以混写，但可读性差，别这么写；`1 << 2 + 3` 得 32 而不是 20，因为算术运算符优先级**高于**移位，这种地方一律加括号。

---

## 4.2 `and` / `or` 返回操作数，不是布尔值

这是 C++ 程序员最容易翻车的一条：C++ 的 `&&`/`||` 产出 `bool`，Python 的 `and`/`or` 产出**决定结果的那个操作数**。

```pycon
>>> 0 or "默认值"
'默认值'
>>> 3 and 0
0
>>> 2 and 3
3
>>> not []
True
```

规则：

- `a and b`：`a` 为假就返回 `a`，否则返回 `b`；
- `a or b`：`a` 为真就返回 `a`，否则返回 `b`；
- 两者都是**短路**的：右边可能根本不执行。

```python
# 示例：examples/ch04_02_logic.py
"""ch04_02_logic.py —— and/or 返回操作数、短路求值、海象运算符"""


def check(v):
    print("  调用 check(", v, ")")
    return v > 0


print("=== and / or 返回的是操作数，不是 True/False ===")
print(0 or "默认值")
print("" or None)
print(3 and 0)
print(2 and 3)
print(not [])

print("=== 短路：右边的函数压根不执行 ===")
print(check(5) and check(-1) and check(9))
print(check(-1) and check(9) and check(7))

print("=== 用 or 给默认值，用 and 做守卫 ===")
config = {}
level = config.get("level") or "info"
print("level =", level)
name = None
print(name and name.upper())

print("=== 海象运算符 := （3.8+） ===")
data = ["10", "x", "30"]
for s in data:
    if (n := s.isdigit()) and n:
        print("  纯数字行:", s)
nums = [int(s) for s in data if (t := s.strip()).isdigit()]
print("过滤后的数字:", nums)

print("=== 三目表达式的正确形态 ===")
print("负数" if -3 < 0 else "非负")

print("=== in / not in ===")
print(2 in [1, 2, 3], "py" in "python", "k" in {"k": 1})
print("4 in range(1, 5):", 4 in range(1, 5))
```

```text
=== and / or 返回的是操作数，不是 True/False ===
默认值
None
0
3
True
=== 短路：右边的函数压根不执行 ===
  调用 check( 5 )
  调用 check( -1 )
False
  调用 check( -1 )
False
=== 用 or 给默认值，用 and 做守卫 ===
level = info
None
=== 海象运算符 := （3.8+） ===
  纯数字行: 10
  纯数字行: 30
过滤后的数字: [10, 30]
=== 三目表达式的正确形态 ===
负数
=== in / not in ===
True True True
4 in range(1, 5): True
```

注意 `check(-1) and check(9) and check(7)` 只打印了**一次** `调用 check`：第一个是假，后面两个被短路掉了。这就是 `if 列表 and 列表[0] > 0:` 之所以安全的原因。

两个实用模式：

- **默认值**：`config.get("level") or "info"`——但小心 `0`、`""`、`False` 也会被当成"没有值"而替换掉，需要区分时用 `if x is None`；
- **守卫**：`name and name.upper()`，`None` 时直接得 `None`，不会 `AttributeError`。

> **⚠️ 易错** `or` 给默认值会吞掉合法的假值。`count = user_input or 0` 在 `user_input == 0` 时没问题；但 `volume = config.get("volume") or 100` 在用户明确设了 `0` 时会错误地变成 `100`。要保留 0，就写 `v = config.get("volume"); volume = 100 if v is None else v`。

---

## 4.3 `==`、`is`、`in`：三种"相等"

| 运算符 | 比什么 | 典型误用 |
| --- | --- | --- |
| `==` | 值是否相等（走 `__eq__`） | `x == None`（应 `is None`） |
| `is` | 是否同一个对象（比 id） | `a is 256`（小整数缓存，随版本变） |
| `in` | 是否包含（走 `__contains__`） | 在 `list` 上做 10^5 次查询——O(n²) |

```pycon
>>> a = [1, 2]
>>> b = [1, 2]
>>> a == b, a is b
(True, False)
>>> p = int("256"); q = int("256")
>>> p is q, p == q
(True, True)
>>> r = int("300"); s = int("300")
>>> r is s, r == s
(False, True)
```

`p is q` 为真是**小整数缓存**（-5～256 的对象在解释器启动时就建好并复用）的结果，与"值相等"无关；换成 300 就立刻断言失败。所以**永远不要用 `is` 比较数字**，`is` 只用在三个场景：`is None`、`is True/False`（严格比较时）、`x is y` 判断同一对象。另外从 3.12 起，`256 is 256` 这种字面量写法会直接给 `SyntaxWarning`。

`in` 的复杂度差异必须背下来：

```pycon
>>> 99999 in list(range(100000))
True
>>> 99999 in set(range(100000))
True
```

两行结果一样，但前者要逐个比 10 万次，后者一次哈希。`n = 10^5` 的题目里，`if x in 已访问` 用 list 就是 10^10 次比较，换 `set` 就是 10^5 次。

---

## 4.4 位运算与标志位

```pycon
>>> 5 & 3, 5 | 3, 5 ^ 3
(1, 7, 6)
>>> ~5, -8 >> 1
(-6, -4)
>>> 1 << 10
1024
```

- `^` 是**异或**，不是乘方（Python 的乘方是 `**`）——这是从 C++ 抄代码时的高频笔误；
- `~x == -x - 1`（补码），`~5 == -6`；
- `>>` 对负数是算术右移（保留符号），`-8 >> 1 == -4`；
- 位运算优先级**低于**比较和算术：`x & 1 == 0` 实际是 `x & (1 == 0)`，永远为 0。**必须写 `(x & 1) == 0`**。

标志位组合的经典写法（权限、状态、选项）：

```pycon
>>> READ, WRITE, EXEC = 0b001, 0b010, 0b100
>>> perm = READ | WRITE
>>> perm & EXEC
0
>>> bool(perm & READ), bool(perm & EXEC)
(True, False)
>>> perm ^ READ          # 翻转某一位
2
```

在 Python 里也可以用 `set` 或 `IntFlag` 枚举达到同样目的，但位运算省内存、能塞进单个整数存数据库，竞赛里还能做状态压缩 DP。

---

## 4.5 增量赋值与解包

```python
# 示例：examples/ch04_03_assign.py
"""ch04_03_assign.py —— 增量赋值、链式赋值、解包"""
print("=== += 对可变对象是原地改 ===")
a = [1, 2]
b = a
b += [3]
print("a =", a, "b =", b, "a is b:", a is b)

c = [1, 2]
d = c
d = d + [3]          # + 造新对象，d 改指新表
print("c =", c, "d =", d, "c is d:", c is d)

print("=== += 对元组只能重建 ===")
t = (1, 2)
try:
    t[0] = 9
except TypeError as e:
    print("TypeError:", e)
t += (3,)            # 这不是原地改，是造了新元组
print("t =", t)

print("=== 链式赋值与交换 ===")
x = y = 0
x, y = 1, 2
x, y = y, x
print("x, y =", x, y)

print("=== 解包 ===")
first, *rest = [1, 2, 3, 4]
print("first =", first, "rest =", rest)
head, *mid, tail = "abcdef"
print("head =", head, "mid =", mid, "tail =", tail)
(a, b), c = (1, 2), 3
print("嵌套解包:", a, b, c)
try:
    p, q = [1, 2, 3]
except ValueError as e:
    print("ValueError:", e)

print("=== 可读性：别用 _ 以外的星号解包做副作用 ===")
total = sum([1, 2, 3])
print("sum 的返回值:", total)
```

```text
=== += 对可变对象是原地改 ===
a = [1, 2, 3] b = [1, 2, 3] a is b: True
c = [1, 2] d = [1, 2, 3] c is d: False
=== += 对元组只能重建 ===
TypeError: 'tuple' object does not support item assignment
t = (1, 2, 3)
=== 链式赋值与交换 ===
x, y = 2 1
=== 解包 ===
first = 1 rest = [2, 3, 4]
head = a mid = ['b', 'c', 'd', 'e'] tail = f
嵌套解包: 1 2 3
ValueError: too many values to unpack (expected 2, got 3)
=== 可读性：别用 _ 以外的星号解包做副作用 ===
sum 的返回值: 6
```

关键区别在 `b += [3]` 与 `d = d + [3]`：`+=` 对列表调用 `__iadd__`（原地 extend），所以 `a is b` 仍为真；`+` 调用 `__add__` 造新列表，`d` 改了指向，`c` 不受影响。**给列表追加元素用 `+=`/`append`，给元组"追加"必然是重建**。

`a, b = b, a` 是交换，因为右边先算成一个元组再解包，不存在 C++ `swap` 那种临时变量问题。

---

## 4.6 优先级速查

由高到低（只列常用的）：

```text
**   →   +x -x ~x   →   * / // %   →   + -   →   << >>   →   &   →   ^   →   |   →
== != < <= > >= in, not in, is, is not   →   not   →   and   →   or   →   if-else（三目）→  = += :=
```

两条硬规矩：

1. **位运算与比较混用必须加括号**：`(x & 1) == 0`、`(a | b) != 0`；
2. **`not` 优先于 `and`/`or`**，所以 `not a and b` 是 `(not a) and b`；想表达"不是（a 且 b）"要写 `not (a and b)`。

---

## 4.7 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| `/` | 整型相除得整数 | 永远得 `float`，整除用 `//` |
| `-7 / 2` | `-3`（截断） | `-3.5`；`-7 // 2 == -4`（向下取整） |
| `%` 负数 | 符号跟被除数 | 符号跟**除数** |
| `&&` / `||` | 产出 `bool` | 产出**操作数本身** |
| `^` | 异或 | 异或（**不是**乘方，乘方是 `**`） |
| `++` / `--` | 有 | 没有，写 `i += 1` |
| 赋值表达式 | 无 | `:=` 海象运算符 |
| 自增对容器 | 无此概念 | `lst += [x]` 原地扩展，`tuple += (x,)` 重建 |
| 比较链 | 不支持 | `1 < x < 10` 合法且只求值一次 |

---

## 4.8 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `-7 // 2` 期望 `-3` 却得 `-4` | `//` 是向下取整 | 要截断用 `int(-7 / 2)` |
| `-7 % 3` 期望 `-1` 却得 `2` | 余数符号跟除数 | 要 C 语义用 `math.fmod(a, b)` |
| `x & 1 == 0` 永远为假 | `==` 优先级高于 `&` | `(x & 1) == 0` |
| `2 ^ 10` 想算乘方得 `8` | `^` 是异或 | `2 ** 10` |
| `if a == 1 or 2:` 恒为真 | `or` 只判断 `2` 的真值 | `if a in (1, 2):` |
| `x = 0; x = x or 5` 得 5 | `or` 把 0 当假 | `x if x is not None else 5` |
| `if x in big_list` 超时 | list 的 `in` 是 O(n) | 改用 `set`/`dict` |
| `i++` 报 `SyntaxError` | Python 没有自增运算符 | `i += 1` |
| `not a == b` 结果反了 | 优先级：`==` 高于 `not` | `not (a == b)` 或 `a != b` |
| `a = b = []` 后改一个两个都变 | 两个名字指向同一个列表 | 分别赋值 `a, b = [], []` |

---

## 4.9 练习

**1.（负数运算）** 不用电脑，算出 `-9 // 4`、`-9 % 4`、`divmod(-9, 4)`、`9 % -4`，然后写代码验证。

验收：四个结果全对，并能用 `a == b * (a // b) + (a % b)` 自证。

**2.（短路）** 写 `safe_get(d, key, default)`：`d` 可能是 `None`，也可能是没有该键的 dict，两种情况都返回 `default`，且**不能**用 `try/except`。

验收：`safe_get(None, "a", 1) == 1`、`safe_get({}, "a", 1) == 1`、`safe_get({"a": 0}, "a", 1) == 0`（注意 0 不能被默认值吃掉）。

**3.（位运算）** 用位运算统计一个非负整数二进制里 `1` 的个数（不许用 `bin().count()`）。

验收：`popcount(0) == 0`、`popcount(7) == 3`、`popcount(1023) == 10`。

**4.（变式）** 实现 `toggle(flags, bit)` 与 `has(flags, bit)`：分别翻转某一位、判断某一位是否置位。

验收：`has(toggle(0b101, 0b010), 0b010) is True`，且 `toggle` 不修改原值。

**5.（挑战）** 写一个"运算符优先级自查表"程序：对 8 组表达式（每组含 `&`、`==`、`<<`、`not`、`and`、`or`、三目）打印"按优先级理解的结果"和"加括号后的结果"，两者相同才算通过。

验收：8 组全通过，且程序输出里能看出哪几组**不加括号就会算错**。

---

## 4.10 小结

1. **`/` 得浮点、`//` 向下取整、`%` 跟除数同号**，三者由 `divmod` 统一保证恒等式。
2. **`and`/`or` 返回操作数**，可用于默认值和短路守卫，但要小心吞掉 `0`/`""` 这类合法假值。
3. **`is` 比身份、`==` 比值、`in` 比包含**；`in` 用在 `list` 上是 O(n)，大规模查重必须用 `set`。

下一章进入最常用的对象：字符串——以及让 C++ 程序员最羡慕的 f-string。
