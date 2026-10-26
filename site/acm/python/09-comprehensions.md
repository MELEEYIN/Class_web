# 09 · 推导式

> **本质**：推导式是"循环 + 追加"这段样板代码的语法压缩。它由 C 层循环驱动、预先知道结果规模，所以比手写 `for` + `append` 快 1.5～2 倍；但它的可读性有明确上限——**嵌套超过两层、带复杂条件，就该退回普通循环**。

**读完这一章你能做到**

- 一眼读懂"`if` 在 `for` 前 / 后"的两种语义差异；
- 用嵌套推导式一次构造二维表、展平二维表；
- 用字典推导式建反查表与下标表；
- 知道生成器表达式为什么省内存、为什么只能消费一次；
- 判断什么时候**不该**用推导式。

---

## 9.1 列表推导式的骨架

`[表达式 for 变量 in 可迭代对象 if 条件]` —— 三块分别对应"要什么 / 从哪来 / 要不要"。

```python
# 示例：examples/ch09_01_listcomp.py
"""ch09_01_listcomp.py —— 列表推导式：过滤、映射、嵌套与条件位置"""
import itertools

nums = list(range(1, 11))
print("平方：", [x * x for x in nums])
print("偶数平方：", [x * x for x in nums if x % 2 == 0])
print("奇偶标记：", ["偶" if x % 2 == 0 else "奇" for x in nums[:4]])
print("两个 for：", [(i, j) for i in range(2) for j in range(2)])
out = []
for i in range(2):
    for j in range(2):
        out.append((i, j))
print("上面的写法等价于：", out)

print("=== 嵌套推导式造二维表 ===")
print([[i * j for j in range(1, 4)] for i in range(1, 4)])

print("=== 展平二维 ===")
grid = [[1, 2], [3, 4]]
print("读懂顺序：for row -> for x：", [x for row in grid for x in row])
print("对照 itertools.chain：", list(itertools.chain.from_iterable(grid)))

print("=== 过滤 + 变换 ===")
words = ["Hello", "world", "", "  "]
print([w.strip().lower() for w in words if w.strip()])

print("=== 条件的位置决定语义 ===")
print("if 在 for 后 = 过滤：", [x for x in nums if x > 8])
print("if/else 在 for 前 = 变换：", [x if x > 8 else 0 for x in nums])
try:
    compile("[x for x in range(3) if x > 1 else 0]", "<s>", "eval")
except SyntaxError as e:
    print("过滤位置不能写 else -> SyntaxError:", e.msg)
```

```text
平方： [1, 4, 9, 16, 25, 36, 49, 64, 81, 100]
偶数平方： [4, 16, 36, 64, 100]
奇偶标记： ['奇', '偶', '奇', '偶']
两个 for： [(0, 0), (0, 1), (1, 0), (1, 1)]
上面的写法等价于： [(0, 0), (0, 1), (1, 0), (1, 1)]
=== 嵌套推导式造二维表 ===
[[1, 2, 3], [2, 4, 6], [3, 6, 9]]
=== 展平二维 ===
读懂顺序：for row -> for x： [1, 2, 3, 4]
对照 itertools.chain： [1, 2, 3, 4]
=== 过滤 + 变换 ===
['hello', 'world']
=== 条件的位置决定语义 ===
if 在 for 后 = 过滤： [9, 10]
if/else 在 for 前 = 变换： [0, 0, 0, 0, 0, 0, 0, 0, 9, 10]
过滤位置不能写 else -> SyntaxError: invalid syntax
```

与手写循环的等价关系，逐行对照：

```text
[x * x for x in xs if x > 0]     ≡   out = []
                                     for x in xs:
                                         if x > 0:
                                             out.append(x * x)
```

**两个 `if` 的位置完全不同**，这是本章最容易混的一处：

| 写法 | 位置 | 语义 | 结果个数 |
| --- | --- | --- | --- |
| `[f(x) for x in xs if cond(x)]` | `if` 在 `for` 之后 | **过滤**，不满足就丢弃 | ≤ len(xs) |
| `[f(x) if cond(x) else g(x) for x in xs]` | `if` 在 `for` 之前 | **三元变换**，每项都有结果 | == len(xs) |
| `[f(x) for x in xs if c1 if c2]` | 多个 `if` 串联 | 依次过滤（相当于 `and`） | ≤ len(xs) |

所以 `[x for x in xs if x > 0 else 0]` 是**语法错误**（过滤位置不接受 `else`），必须把 `if/else` 挪到前面。

---

## 9.2 嵌套：书写顺序 = 循环嵌套顺序

`[[i * j for j in range(1, 4)] for i in range(1, 4)]` 读法是"**从外到内、从左到右**"：

```text
for i in range(1, 4):        ← 外层，产出 3 个列表
    [i * j for j in range(1, 4)]   ← 内层，每个列表 3 个元素
```

展平则是把两个 `for` 写在**同一个**推导式里，顺序与写嵌套 `for` 一致：

```pycon
>>> grid = [[1, 2], [3, 4]]
>>> [x for row in grid for x in row]
[1, 2, 3, 4]
>>> [[x * 2 for x in row] for row in grid]
[[2, 4], [6, 8]]
```

一旦出现"三个 `for`"或"外层还带条件"，可读性就崩了。经验线是：**推导式里最多两个 `for`，且总长度不超过一行 79 字符**；再复杂就抽函数。

> **💡 提示** 展平二维还有 `itertools.chain.from_iterable(grid)`，它对任意层数的可迭代对象都只遍历一次，比嵌套推导式更省内存（尤其矩阵很大时）。第 21 章展开。

---

## 9.3 字典与集合推导式

```python
# 示例：examples/ch09_02_dict_set.py
"""ch09_02_dict_set.py —— 字典、集合推导式与反查表"""
words = ["apple", "Banana", "cherry"]
print("长度表：", {w: len(w) for w in words})
print("带过滤：", {w: len(w) for w in words if len(w) > 5})
print("反转键值：", {v: k for k, v in {"a": 1, "b": 2}.items()})
print("下标表：", {w: i for i, w in enumerate(words)})
print("键重复时后者覆盖：", {len(w) % 2: w for w in words})
print("按长度合并：", {len(w): w for w in words})

print("=== 集合推导式 ===")
print("去重后的长度：", sorted({len(w) for w in words}))
print("平方的个位：", sorted({x * x % 10 for x in range(5)}))
print("与 map 等价：", sorted(set(map(len, words))))

print("=== 用推导式建索引：查表代替循环 ===")
prices = {"苹果": 5, "香蕉": 3}
print("总价：", sum(prices[f] * n for f, n in [("苹果", 2), ("香蕉", 4)]))
by_len = {len(w): w for w in words}
print("长度为 6 的词：", by_len.get(6))
```

```text
长度表： {'apple': 5, 'Banana': 6, 'cherry': 6}
带过滤： {'Banana': 6, 'cherry': 6}
反转键值： {1: 'a', 2: 'b'}
下标表： {'apple': 0, 'Banana': 1, 'cherry': 2}
键重复时后者覆盖： {1: 'apple', 0: 'cherry'}
按长度合并： {5: 'apple', 6: 'cherry'}
=== 集合推导式 ===
去重后的长度： [5, 6]
平方的个位： [0, 1, 4, 6, 9]
与 map 等价： [5, 6]
=== 用推导式建索引：查表代替循环 ===
总价： 22
长度为 6 的词： cherry
```

要点：

- **字典推导式**语法是 `{k: v for ...}`，冒号不能省；`{len(w) for w in words}` 是集合（结果无重复、无序）；
- **重复键静默覆盖**——`{len(w): w for w in words}` 里 `Banana` 与 `cherry` 长度都是 6，最终只留后者。要保留全部就得用"值变列表"的写法：`{k: [w for w in words if len(w) == k] for k in {...}}`；
- **反查表**（`{v: k for k, v in d.items()}`）是"从值找键"的标准手段，前提是值唯一；
- 集合推导式天生去重，配合 `sorted` 才有稳定输出（第 6 章的无序规则同样适用）。

---

## 9.4 生成器表达式：把方括号换成圆括号

```python
# 示例：examples/ch09_03_genexp.py
"""ch09_03_genexp.py —— 生成器表达式：惰性、一次性、省内存"""
import itertools

gen = (x * x for x in range(5))
print("类型：", type(gen).__name__)
print("逐个取：", next(gen), next(gen))
print("剩余转列表：", list(gen))
print("已耗尽，带默认值取：", next(gen, "空"))
try:
    next(gen)
except StopIteration as e:
    print("StopIteration:", repr(e))

print("=== 直接喂给聚合函数 ===")
print("sum：", sum(x * x for x in range(5)))
print("max：", max(len(w) for w in ["a", "bbb", "cc"]))
print("any/all：", any(x > 3 for x in range(5)), all(x >= 0 for x in range(5)))
print("join：", "-".join(str(x) for x in range(3)))

print("=== 长度对比：列表要全部算完，生成器按需 ===")
lst = [x for x in range(1000)]
g = (x for x in range(1000))
print("列表能 len：", len(lst), "| 生成器不能 len，只能数：", sum(1 for _ in g))

print("=== 推导式里的循环变量不外泄 ===")
x = "外部"
print([x for x in range(3)], "| 外部 x 仍是：", x)

print("=== 惰性：可以套在无限流上 ===")
squares = (x * x for x in itertools.count(1))
print("前 4 个平方：", list(itertools.islice(squares, 4)))

print("=== 注意：生成器只能消费一次 ===")
g2 = (c for c in "ab")
print("sum 吃掉后：", "".join(g2), "| 再取给默认值：", next(g2, "空"))
```

```text
类型： generator
逐个取： 0 1
剩余转列表： [4, 9, 16]
已耗尽，带默认值取： 空
StopIteration: StopIteration()
=== 直接喂给聚合函数 ===
sum： 30
max： 3
any/all： True True
join： 0-1-2
=== 长度对比：列表要全部算完，生成器按需 ===
列表能 len： 1000 | 生成器不能 len，只能数： 1000
=== 推导式里的循环变量不外泄 ===
[0, 1, 2] | 外部 x 仍是： 外部
=== 惰性：可以套在无限流上 ===
前 4 个平方： [1, 4, 9, 16]
=== 注意：生成器只能消费一次 ===
sum 吃掉后： ab | 再取给默认值： 空
```

三类"推导式"的区别：

| 写法 | 结果类型 | 何时计算 | 内存 | 能否重复遍历 |
| --- | --- | --- | --- | --- |
| `[f(x) for x in xs]` | `list` | 立即全部算完 | O(n) | ✅ |
| `{f(x) for x in xs}` | `set` | 立即 | O(n) | ✅（无序） |
| `{k: v for ...}` | `dict` | 立即 | O(n) | ✅（插入序） |
| `(f(x) for x in xs)` | generator | **按需一项一项算** | O(1) | ❌ 只能消费一次 |

生成器表达式的三个实战判断：

1. **作为函数唯一实参时可以省括号**：`sum(x*x for x in xs)` 不需写成 `sum((...))`；
2. **只能消费一次**——`sum(g)` 之后再 `list(g)` 得空列表，这是新手最常见的"数据消失"原因；
3. **不会预先算长度**，所以 `len(g)` 报 `TypeError`，需要计数就 `sum(1 for _ in g)`（而这也把流消耗掉了）。

`lst = [x for x in range(1000)]` 与 `g = (x for x in range(1000))` 在元素个数上一模一样，但**内存差一个数量级**：前者要存 1000 个对象引用，后者只存一个栈帧与游标。处理 10^7 行日志时，这个差别就是"跑得动"与 `MemoryError` 之差。

---

## 9.5 什么时候不用推导式

推导式不是越用越好，以下三种情况退回普通循环更清楚：

1. **需要 `try/except`**——推导式里不能写语句。要给每个元素容错，得先写一个 `safe_int(x)` 函数再推导。
2. **循环体有副作用**（打印、写文件、追加到多个容器）——推导式是为"生成值"设计的，副作用应该显式写。
3. **三层以上嵌套或两个以上条件**——`[a for b in B for c in C for a in f(b, c) if g(a) if h(a)]` 没人能在 10 秒内读懂。

一个可操作的判据：**推导式写出来超过一行（79 字符）就拆**。

---

## 9.6 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 转换+过滤 | 手写 `for` + `push_back`，或 `std::transform` + `remove_if` | 一行推导式 |
| 惰性求值 | `std::views::filter` / `transform`（C++20 ranges） | 生成器表达式 |
| 字典构造 | 手写 `map` 插入 | `{k: v for ...}` |
| 去重集合 | `std::set` 插入 | `{f(x) for x in xs}` |
| 循环变量作用域 | 块作用域 | 推导式内私有（3.x），**不外泄** |
| 性能 | 编译器可向量化 | C 层循环，比手写 `for`+`append` 快约 1.5～2 倍 |

---

## 9.7 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `SyntaxError: invalid syntax` 出现在 `if ... else` 处 | 把三元写进了过滤位置 | `[f(x) if c else g(x) for x in xs]` |
| 推导式写成了"每项都保留"却想过滤 | `if` 放在了 `for` 前面 | 挪到 `for` 之后 |
| `TypeError: 'generator' object is not subscriptable` | 生成器不能下标/切片 | `list(g)` 或改用列表推导式 |
| 第二次遍历生成器是空的 | 生成器一次性 | 需要多次遍历就落地成 `list` |
| `TypeError: 'int' object is not iterable` | `for x in 5` | `for x in range(5)` |
| 字典推导式漏了冒号 | 写成了 `{k, v for ...}` | `{k: v for ...}` |
| 结果顺序每次都不同 | 用了集合推导式 | 输出前 `sorted(...)` |
| 推导式里改了外部列表 | 副作用混入 | 退回普通 `for` |
| `NameError` 用了推导式变量名 | 3.x 里推导式变量不外泄 | 在外层自己赋值 |
| 大数据 `MemoryError` | 用了列表推导式 | 改生成器表达式 |

---

## 9.8 练习

**1.（基础）** 用一行推导式生成 1～20 中所有 3 的倍数的平方。

验收：结果为 `[9, 36, 81, 144, 225, 324]`。

**2.（过滤+变换）** 给定字符串列表，输出"长度 ≥ 3 的单词"的全大写形式；长度 < 3 的转成 `"??"` 保留位置（两种需求各写一行）。

验收：两行结果长度分别 ≤ 原长、== 原长，且能解释差异。

**3.（字典推导式）** 给定 `scores = {"语文": 92, "数学": 58, "英语": 76}`，输出 `{科目: "及格"/"不及格"}`，以及"分数→科目"的反查表。

验收：反查表用 `{v: k for k, v in ...}` 实现；说明若两科同分会发生什么。

**4.（变式）** 用嵌套推导式构造 5×5 乘法表（第 i 行第 j 列存 `i * j`），再用一行展平成 25 个元素的列表。

验收：`table[2][3] == 6`；展平结果长度为 25，且 `flat[0] == 1`、`flat[-1] == 25`。

**5.（挑战）** 用生成器表达式实现 `running_max(xs)`：一次遍历产出"到目前为止的最大值"序列（惰性，不落地成列表），并用 `itertools.islice` 只取前 5 项打印。

验收：`list(running_max([3, 1, 4, 1, 5]))` 得 `[3, 3, 4, 4, 5]`；对 `range(10**6)` 输入不会一次性建表（说明为什么）。

---

## 9.9 小结

1. **`if` 在 `for` 后是过滤、在 `for` 前是三元**，这是推导式唯一的语法陷阱。
2. **嵌套顺序 = 书写顺序**，最多两层；展平把两个 `for` 写在一起。
3. **方括号立刻算完，圆括号按需算且只能消费一次**；大数据用生成器表达式。

下一章进入函数：位置参数、默认值、`*args` / `**kwargs`、仅关键字参数，以及那个著名的"默认参数用可变对象"的坑。
