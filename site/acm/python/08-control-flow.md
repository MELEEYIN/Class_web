# 08 · 流程控制

> **本质**：Python 的 `if` 判断的是**真值**（任何对象都能转 `bool`），`for` 遍历的是**可迭代对象**（不是计数器）。把这两条记住，`for i in range(n)` 就只是"遍历一个数字序列"的特例，而不是 C++ 里那个三段式 `for`。

**读完这一章你能做到**

- 用真值规则写出 `if not xs:`、`if name:` 这类地道判断；
- 说清 `range(a, b, step)` 与 C++ `for (i = a; i < b; i += step)` 的等价关系；
- 用 `enumerate` / `zip` 取代"用下标取值"的老写法；
- 用 `for ... else` 表达"没找到"，避免多层 `flag` 变量；
- 知道 `break` 只能跳出一层，嵌套退出要借助函数 `return`。

---

## 8.1 条件与真值

```python
# 示例：examples/ch08_01_conditions.py
"""ch08_01_conditions.py —— 条件与真值、链式比较、三元与 match"""
score = 85
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
elif score >= 60:
    grade = "C"
else:
    grade = "D"
print("成绩：", score, "等级：", grade)

print("=== 什么算真 ===")
for v in [0, 1, -1, "", "0", [], [0], {}, None, 0.0]:
    print(repr(v), "->", bool(v))

print("=== 链式比较 ===")
x = 5
print(0 <= x < 10, 0 < x < 3, x < 10 < 20)
print("链式等价于 and：", (0 <= x) and (x < 10))

print("=== 条件表达式（三元） ===")
n = -7
print("绝对值：", n if n >= 0 else -n)
print("奇偶：", "偶数" if n % 2 == 0 else "奇数")
print("链式三元：", "负" if n < 0 else ("零" if n == 0 else "正"))

print("=== 不要在条件里写 == True ===")
flags = [True, False, True]
print([f for f in flags if f])
print("and/or 返回操作数：", None and 1, 0 or "默认值", 1 and 2)

print("=== match/case（3.10+） ===")


def describe(cmd):
    match cmd:
        case "quit" | "exit":
            return "退出"
        case ["go", direction]:
            return f"向 {direction} 移动"
        case {"n": n}:
            return f"收到 n={n}"
        case int() | float():
            return "数字"
        case _:
            return "未知"


print(describe("quit"), describe(["go", "北"]), describe({"n": 3}))
print(describe(2.5), describe("zzz"))
```

```text
成绩： 85 等级： B
=== 什么算真 ===
0 -> False
1 -> True
-1 -> True
'' -> False
'0' -> True
[] -> False
[0] -> True
{} -> False
None -> False
0.0 -> False
=== 链式比较 ===
True False True
链式等价于 and： True
=== 条件表达式（三元） ===
绝对值： 7
奇偶： 奇数
链式三元： 负
=== 不要在条件里写 == True ===
[True, True]
and/or 返回操作数： None 默认值 2
=== match/case（3.10+） ===
退出 向 北 移动 收到 n=3
数字 未知
```

真值表（`bool(x)` 为假的全集，记住这几类就够）：

| 值 | `bool` | 说明 |
| --- | --- | --- |
| `0`、`0.0`、`0j`、`Decimal("0")` | `False` | 数值零 |
| `""`、`b""` | `False` | 空序列 |
| `[]`、`()`、`{}`、`set()` | `False` | 空容器 |
| `None` | `False` | 空值 |
| `False` | `False` | 本身 |
| 其余一切（含 `"0"`、`[0]`、`-1`） | `True` | 非空即真 |

所以"判空"就直接写在条件里：

```pycon
>>> xs = []
>>> if not xs:
...     print("空列表")
空列表
>>> name = "0"
>>> "空串" if not name else "非空"
'非空'
```

`if/elif/else` 的顺序语义与 C++ 一样：**从上往下，第一个为真的分支执行后整体结束**。区别只在于括号和花括号都省了，靠缩进。

`match/case` 是 3.10 引入的结构化匹配：`|` 表示"或"，`["go", direction]` 是**序列模式**（顺便绑定 `direction`），`{"n": n}` 是**映射模式**（只要含 `n` 键即匹配，多出的键忽略），`int() | float()` 是**类模式**（顺便做类型判断），`_` 是兜底。它**不是** `switch`，因为会解构绑定；也不做"贯穿"。

> **💡 提示** `match` 里的名字**永远是绑定**而不是比较：`case SOME_CONST:` 会匹配一切并把值绑到 `SOME_CONST`，永远为真。要用常量比较得写 `case Color.RED:`（点号形式）或提前放进 `if`。

---

## 8.2 `range`：循环的"计数器"

```python
# 示例：examples/ch08_02_loops.py
"""ch08_02_loops.py —— range、enumerate、zip 与循环 else"""
print("=== range 是半开区间 ===")
print(list(range(5)))
print(list(range(2, 6)))
print(list(range(10, 0, -3)))
r = range(0, 10, 2)
print("range 是惰性序列：", r, "| 长度", len(r), "| 第 3 个元素", r[3])
print("range 支持 in（O(1) 算术判断）：", 4 in r, 5 in r)

print("=== for 遍历的是可迭代对象 ===")
for ch in "ab":
    print("字符", ch)
for k, v in [("a", 1), ("b", 2)]:
    print(k, v)
for i in range(2):
    print("range 循环", i)

print("=== enumerate 与 zip ===")
for i, name in enumerate(["甲", "乙"], start=1):
    print(i, name)
names = ["甲", "乙"]
ages = [20, 21]
print(list(zip(names, ages)))
print("不等长按最短截断：", list(zip(names, ages, [1, 2, 3])))

print("=== while ===")
n = 3
while n > 0:
    print("倒计时", n)
    n -= 1

print("=== for/while 的 else：没被 break 才执行 ===")
for i in range(5):
    if i == 2:
        break
else:
    print("不会执行：被 break 打断了")
for i in range(5):
    if i == 6:
        break
else:
    print("会执行：循环正常走完")

print("=== continue 与 break ===")
for i in range(6):
    if i % 2:
        continue
    if i == 4:
        break
    print("偶数", i)
```

```text
=== range 是半开区间 ===
[0, 1, 2, 3, 4]
[2, 3, 4, 5]
[10, 7, 4, 1]
range 是惰性序列： range(0, 10, 2) | 长度 5 | 第 3 个元素 6
range 支持 in（O(1) 算术判断）： True False
=== for 遍历的是可迭代对象 ===
字符 a
字符 b
a 1
b 2
range 循环 0
range 循环 1
=== enumerate 与 zip ===
1 甲
2 乙
[('甲', 20), ('乙', 21)]
不等长按最短截断： [('甲', 20, 1), ('乙', 21, 2)]
=== while ===
倒计时 3
倒计时 2
倒计时 1
=== for/while 的 else：没被 break 才执行 ===
会执行：循环正常走完
=== continue 与 break ===
偶数 0
偶数 2
```

对照表：

| 需求 | C++ | Python |
| --- | --- | --- |
| `i` 从 0 到 n-1 | `for (int i = 0; i < n; i++)` | `for i in range(n)` |
| `i` 从 a 到 b-1 | `for (int i = a; i < b; i++)` | `for i in range(a, b)` |
| 步长 s | `for (int i = a; i < b; i += s)` | `for i in range(a, b, s)` |
| 递减 | `for (int i = n; i > 0; i--)` | `for i in range(n, 0, -1)` |
| 遍历元素+下标 | 手写 `i` 再 `v[i]` | `for i, v in enumerate(vs)` |
| 并行遍历两个序列 | 同下标访问 | `for a, b in zip(xs, ys)` |

`range` 是**惰性序列**而不是列表：`range(10**9)` 不占 10^9 个元素的内存，`len()` 是 O(1)，`in` 是 O(1)（纯算术）。这点与 C++ 的循环变量一致——都是"算出来的"，不是"存好的"。

`for ... else` 是最反直觉但很省事的结构：**`else` 在循环"自然走完"时执行；一旦 `break` 就不执行**。所以"找了但没找到"可以直接：

```pycon
>>> target = 7
>>> for x in [1, 3, 5]:
...     if x == target:
...         print("找到了")
...         break
... else:
...     print("没找到")
没找到
```

`while ... else` 同理。注意事项：**`continue` 不影响 `else`**，因为它不算"打断"。

---

## 8.3 循环套路：提前退出与哨兵

```python
# 示例：examples/ch08_03_patterns.py
"""ch08_03_patterns.py —— 循环里的常用套路"""


def first_even(xs):
    """找第一个偶数，没有就返回 None"""
    for x in xs:
        if x % 2 == 0:
            return x
    return None


def find_pair(xs, target):
    """找第一对下标 i<j 满足和为 target"""
    for i in range(len(xs)):
        for j in range(i + 1, len(xs)):
            if xs[i] + xs[j] == target:
                return (i, j)
    return None


def gcd(a, b):
    """辗转相除"""
    while b:
        a, b = b, a % b
    return a


def has_duplicate(grid):
    """嵌套循环里发现重复立刻返回"""
    seen = set()
    for row in grid:
        for cell in row:
            if cell in seen:
                return True
            seen.add(cell)
    return False


print("=== 找第一个满足条件的：靠 return 提前退出 ===")
print(first_even([1, 3, 4, 5]), first_even([1, 3]))

print("=== 双层循环找下标对 ===")
print(find_pair([2, 7, 11, 15], 9), find_pair([1, 2], 99))

print("=== while：辗转相除求最大公约数 ===")
print(gcd(48, 18), gcd(17, 5))

print("=== 哨兵值：读到 0 停止累加 ===")
total = 0
for x in [3, 1, 0, 9]:
    if x == 0:
        break
    total += x
print("哨兵前的和：", total)

print("=== 嵌套循环的提前退出 ===")
print(has_duplicate([[1, 2], [2, 3]]), has_duplicate([[1, 2], [3, 4]]))

print("=== while True + break：命令循环 ===")
cmds = ["add", "add", "quit", "add"]
count = 0
for cmd in cmds:
    if cmd == "quit":
        break
    count += 1
print("执行了", count, "条命令")
```

```text
=== 找第一个满足条件的：靠 return 提前退出 ===
4 None
=== 双层循环找下标对 ===
(0, 1) None
=== while：辗转相除求最大公约数 ===
6 1
=== 哨兵值：读到 0 停止累加 ===
哨兵前的和： 4
=== 嵌套循环的提前退出 ===
True False
=== while True + break：命令循环 ===
执行了 2 条命令
```

三条实战经验：

1. **"找第一个"用 `return`，不要用 `flag`**。`break` 只跳出最内层，而 `return` 直接结束整个函数——这就是为什么 Python 里的搜索逻辑常被包成一个小函数。
2. **哨兵循环**（读到 `0` / `EOF` / 空行停止）是输入题的标配模板，见第 2 章 `sys.stdin.read().split()` 的写法。
3. **`while True` + `break`** 比"先在循环外读一次，再在循环尾再读一次"的写法清楚得多（避免重复的读入代码）。

`while` 的条件在每次迭代前重新求值，所以循环体内**必须**有让条件变化的语句，否则死循环（C++ 同样，但 Python 没有"编译期算出来"的优化，`while True:` 会真的一直跑）。

---

## 8.4 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 块结构 | `{ }` | 缩进（4 空格） |
| 条件类型 | 必须是 `bool`（或可隐式转换） | 任意对象，按真值表转 `bool` |
| 循环 | 三段式 `for`，`i` 自己维护 | `for` 遍历可迭代对象 |
| 遍历容器 | 迭代器 / 下标 | 直接 `for x in xs` |
| 下标+元素 | 手写 | `enumerate` |
| 循环 else | 无 | `for/while ... else`（无 `break` 时执行） |
| switch | `switch` / `goto` | `match/case`（3.10+，带解构与守卫） |
| 三元 | `c ? a : b` | `a if c else b` |
| 跳转 | `break` / `continue` / `goto` | 只有 `break` / `continue`，嵌套退出靠 `return` 或异常 |

---

## 8.5 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `IndentationError: expected an indented block` | 冒号后没缩进 | `if x:` 下一行缩进 4 空格 |
| 两个分支都执行了 | 忘了 `elif` 写成 `if` | 中间用 `elif` |
| `if x = 1:` 报 `SyntaxError` | `=` 是赋值 | 比较用 `==` |
| `while` 死循环 | 循环体没改变条件 | 确认有 `n -= 1` / `break` |
| `break` 只跳出一层 | Python 不提供 `goto` | 抽成函数用 `return` |
| `for ... else` 意外执行 | `else` 是"没 break"，不是"没进入循环" | 空序列不 `break`，`else` **会**执行 |
| `range(n, 0)` 一个都不循环 | 半开区间且起点 > 终点 | 写 `range(n, 0, -1)` |
| 改列表时用 `for x in xs: xs.remove(x)` 漏元素 | 遍历中改长度 | 遍历副本 `for x in xs[:]` |
| `case SOME_CONST` 匹配一切 | `match` 里裸名字是绑定 | 用 `case Color.RED:` 或 `if` |
| 条件里写 `if x == True` | 多余且掩盖真值语义 | 直接 `if x:`；要区分 `1` 才用 `is True` |

---

## 8.6 练习

**1.（分支）** 读入一个整数分数，输出等级：`>=90` 为 `A`、`80-89` 为 `B`、`60-79` 为 `C`、其余 `D`。

验收：边界值 90、89、60、59 各测一遍，输出与预期完全一致。

**2.（循环基本）** 输出 1 到 100 之间所有能被 3 整除但不能被 5 整除的数，每行 10 个。

验收：最后一个数为 99；不足 10 个也换行。

**3.（enumerate/zip）** 给定两个等长列表（姓名、分数），输出 `1. 小明 92` 形式的排名，按分数降序；分数相同按姓名升序。

验收：用 `sorted` + `zip` 完成，不手写冒泡。

**4.（变式）** 用 `for ... else` 实现 `contains_prime(xs)`：判断列表里是否有素数，输出"有/没有"，不允许使用额外的 `flag` 变量。

验收：`[4, 6, 8, 9]` 输出"没有"；`[4, 7]` 输出"有"。

**5.（挑战）** 打印九九乘法表（三角形，下三角），每行用 `\t` 分隔，行末不留多余制表符；再用 `match/case` 写一个 `calc(op, a, b)` 支持 `+ - * /`，除零返回错误提示而不是崩溃。

验收：第 9 行共 9 个算式；`calc("/", 1, 0)` 返回错误提示字符串。

---

## 8.7 小结

1. **`if` 判真值**：空容器、`0`、`""`、`None` 都为假，无需 `len(xs) > 0`。
2. **`for` 遍历可迭代对象**，`range` 只是最常用的那一个；`enumerate`/`zip` 免去下标管理。
3. **`for ... else` 表示"没被 break"**，是"找没找到"的最简写法；嵌套退出用函数 `return`。

下一章把"循环 + 立刻追加到列表"这段样板代码压缩成一行：列表推导式、生成器表达式与字典推导式。
