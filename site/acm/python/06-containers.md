# 06 · 列表、元组、字典、集合

> **本质**：Python 只有四种内置容器，但它们的**查找复杂度**与**可变性**完全不同。做题 90% 的超时不是因为算法写错，而是因为把该用 `set`/`dict` 的地方写成了 `list` 的 `in`——那是 O(n) 与 O(1) 的差距。

**读完这一章你能做到**

- 分清四种容器，按"要不要按名字查""要不要改""要不要去重"三问选型；
- 记住"原地方法返回 `None`"这条规矩，不再写出 `x = a.sort()` 的 `NoneType` 报错；
- 用元组解包、`*rest`、`namedtuple` 写出比 C++ `pair`/`struct` 更短的代码；
- 用 `get` / `setdefault` / `|=` 处理字典的缺失键与合并；
- 知道为什么 `[[0] * 3] * 3` 建不出二维数组。

---

## 6.1 四种容器一览

| 容器 | 字面量 | 可变 | 有序 | 元素要求 | `in` / 按名查 | 典型用途 |
| --- | --- | --- | --- | --- | --- | --- |
| `list` | `[1, 2]` | ✅ | ✅ 按位置 | 任意 | O(n) | 序列、栈、队列（尾部） |
| `tuple` | `(1, 2)` | ❌ | ✅ 按位置 | 任意 | O(n) | 固定记录、字典键、函数多返回值 |
| `dict` | `{"a": 1}` | ✅ | ✅ 插入序 | 键必须可哈希 | **O(1)** | 按名字查、计数、缓存 |
| `set` | `{1, 2}` | ✅ | ❌ | 必须可哈希 | **O(1)** | 去重、集合运算 |

三句话选型：**要按下标/顺序 → list；要按名字查 → dict；只要"在不在" → set；一组值打包后不再改 → tuple**。

> **⚠️ 易错** `{}` 是空**字典**不是空集合；空集合只能写 `set()`。`(1)` 是整数 1，单元素元组要写 `(1,)`。

---

## 6.2 列表：增删改查

```python
# 示例：examples/ch06_01_lists.py
"""ch06_01_lists.py —— 列表：增删改查、原地方法与返回值陷阱"""
nums = [3, 1, 4, 1, 5]
print("原列表：", nums, "长度：", len(nums))

print("=== 增 ===")
nums.append(9)
nums.extend([2, 6])
nums.insert(0, 0)
print(nums)

print("=== 删：四种姿势 ===")
last = nums.pop()
first = nums.pop(0)
nums.remove(1)
del nums[-1]
print(nums, "| pop 出：", last, first)
try:
    nums.remove(99)
except ValueError as e:
    print("ValueError:", e)

print("=== 查 ===")
data = [10, 20, 20, 30]
print(data.index(20), data.count(20), 30 in data, 99 in data)

print("=== 原地方法返回 None：NoneType 报错的头号来源 ===")
a = [3, 1, 2]
b = a.sort()
print("a =", a, "| b =", b)
try:
    b.append(4)
except AttributeError as e:
    print("AttributeError:", e)
print("sorted 返回新列表：", sorted(a), "| a 仍是", a)

print("=== 排序 key ===")
words = ["pear", "fig", "banana"]
print(sorted(words, key=len), sorted(words, key=lambda w: (len(w), w)))
print(sorted([(2, "b"), (1, "z")]))

print("=== 切片赋值能改长度 ===")
c = [1, 2, 3, 4, 5]
c[1:4] = ["x"]
print(c)
c[1:2] = []
print(c)

print("=== 嵌套列表的别名陷阱 ===")
grid = [[0] * 2] * 2
grid[0][0] = 1
print(grid, "| 两个子列表是同一对象：", grid[0] is grid[1])
grid2 = [[0] * 2 for _ in range(2)]
grid2[0][0] = 1
print(grid2, "| 独立子列表：", grid2[0] is not grid2[1])
```

```text
原列表： [3, 1, 4, 1, 5] 长度： 5
=== 增 ===
[0, 3, 1, 4, 1, 5, 9, 2, 6]
=== 删：四种姿势 ===
[3, 4, 1, 5, 9] | pop 出： 6 0
ValueError: list.remove(x): x not in list
=== 查 ===
1 2 True False
=== 原地方法返回 None：NoneType 报错的头号来源 ===
a = [1, 2, 3] | b = None
AttributeError: 'NoneType' object has no attribute 'append'
sorted 返回新列表： [1, 2, 3] | a 仍是 [1, 2, 3]
=== 排序 key ===
['fig', 'pear', 'banana'] ['fig', 'pear', 'banana']
[(1, 'z'), (2, 'b')]
=== 切片赋值能改长度 ===
[1, 'x', 5]
[1, 5]
=== 嵌套列表的别名陷阱 ===
[[1, 0], [1, 0]] | 两个子列表是同一对象： True
[[1, 0], [0, 0]] | 独立子列表： True
```

四个操作对应的复杂度：`append` / `pop()` 尾部 O(1)；`insert(0, x)` / `pop(0)` 头部 O(n)（整表后移）；`remove(x)` / `index(x)` / `in` O(n)。所以**不要用 list 当队列**——头部弹出是 O(n)，`collections.deque` 才是 O(1)（第 21 章）。

`sort` 与 `sorted` 的分工是本节的第二个重点：

```pycon
>>> a = [3, 1, 2]
>>> a.sort()                      # 原地，返回 None
>>> a
[1, 2, 3]
>>> sorted(a, reverse=True)       # 返回新列表
[3, 2, 1]
>>> sorted(["bb", "a", "ccc"], key=len)
['a', 'bb', 'ccc']
```

排序是**稳定**的，所以多关键字排序可以用"从次要关键字到主要关键字依次 `sort`"，也可以像示例里那样返回元组 `key=lambda w: (len(w), w)`。`sort(key=...)` 每个元素只调用一次 key 函数，不是比较时反复调用——这就是 Python 排序比 C++ 手写比较器快的原因（Timsort + 键提取）。

> **💡 提示** 切片赋值（`c[1:4] = ["x"]`）能一次替换多段并改变长度，这是 `list` 独有的能力；`list[i:j] = []` 就是"删除一段"。步长不为 1 时长度必须一致：`c[::2] = ["a"]` 会报 `ValueError`。

---

## 6.3 元组：不可变 + 解包

```python
# 示例：examples/ch06_02_tuples.py
"""ch06_02_tuples.py —— 元组：不可变、解包、单元素与哈希"""
from collections import namedtuple

t = (1, 2, 3)
print(t, len(t), t[0], t[-1], t[1:])
print("空元组：", (), "| 单元素必须带逗号：", (1,), "| 这不是元组：", (1))

print("=== 不可变的含义 ===")
try:
    t[0] = 99
except TypeError as e:
    print("TypeError:", e)
u = t + (4,)
print("拼接产生新元组：", u, "| 原元组：", t)

print("=== 解包：Python 最有用的语法糖之一 ===")
a, b = 1, 2
a, b = b, a
print("交换后：", a, b)
x, y = (3, 4)
print(x, y)
first, *rest = [1, 2, 3, 4]
print(first, rest)
head, *mid, tail = "abcd"
print(head, mid, tail)
print("divmod 返回元组：", divmod(7, 2))
for i, ch in enumerate("ab"):
    print(i, ch)

print("=== 元组作字典键 ===")
pos = {(0, 0): "起点", (1, 2): "终点"}
print(pos[(1, 2)])
try:
    {[1]: "x"}
except TypeError as e:
    print("TypeError:", e)

print("=== 不可变的记录：namedtuple ===")
Point = namedtuple("Point", "x y")
p = Point(3, 4)
print(p, p.x, p[1])
print("按位置解包：", tuple(p))
print("可变性对比：list 能改，tuple 只能重建")
```

```text
(1, 2, 3) 3 1 3 (2, 3)
空元组： () | 单元素必须带逗号： (1,) | 这不是元组： 1
=== 不可变的含义 ===
TypeError: 'tuple' object does not support item assignment
拼接产生新元组： (1, 2, 3, 4) | 原元组： (1, 2, 3)
=== 解包：Python 最有用的语法糖之一 ===
交换后： 2 1
3 4
1 [2, 3, 4]
a ['b', 'c'] d
divmod 返回元组： (3, 1)
0 a
1 b
=== 元组作字典键 ===
终点
TypeError: cannot use 'list' as a dict key (unhashable type: 'list')
=== 不可变的记录：namedtuple ===
Point(x=3, y=4) 3 4
按位置解包： (3, 4)
可变性对比：list 能改，tuple 只能重建
```

要点：

- `a, b = b, a` 一步交换，底层是先把右值打包成元组再解包，**不需要临时变量**；
- `first, *rest = ...` 的星号只能有一个，`head, *mid, tail` 也能用（3.0+）；
- 元组**可哈希**所以能当字典键/集合元素，列表不行；若要键里含可变内容，用 `tuple(lst)` 转换；
- `namedtuple` 是"带字段名的元组"，`p.x` 与 `p[0]` 等价，仍然不可变、仍可哈希，比手写 `class` 轻得多（`dataclass` 见第 18 章）。

元组的"不可变"是**浅**的：`t = (1, [2]); t[1].append(3)` 是合法的，因为改的是列表内部。这一点与 list 的别名问题同源（第 3 章）。

---

## 6.4 字典：按名字 O(1) 查

```python
# 示例：examples/ch06_03_dicts.py
"""ch06_03_dicts.py —— 字典：查找、默认值、插入序与合并"""
scores = {"语文": 92, "数学": 88}
print(scores, len(scores))
scores["英语"] = 95
scores["语文"] = 90
print("插入序即遍历序：", scores)
print("键：", list(scores), "| 值：", list(scores.values()))

print("=== 取值三种方式 ===")
print(scores["数学"])
print(scores.get("化学"), "|", scores.get("化学", 0))
try:
    scores["化学"]
except KeyError as e:
    print("KeyError:", e)

print("=== 计数：get 与 setdefault ===")
cnt = {}
for ch in "abca":
    cnt[ch] = cnt.get(ch, 0) + 1
print(cnt)
cnt2 = {}
for ch in "abca":
    cnt2.setdefault(ch, 0)
    cnt2[ch] += 1
print(cnt2, "| 已有键时 setdefault 返回旧值：", cnt2.setdefault("a", 999))

print("=== 删除与弹出 ===")
d = {"a": 1, "b": 2}
print(d.pop("a"), d, d.pop("zz", "默认值"))
del d["b"]
print(d)
try:
    d.pop("b")
except KeyError as e:
    print("KeyError:", e)

print("=== 合并：update 原地，| 新建 ===")
x = {"a": 1, "b": 2}
y = {"b": 20, "c": 30}
z = x | y
print("| 结果：", z, "| x 未变：", x)
x.update(y)
print("update 后 x：", x)
print("** 解包构造：", {**y, "d": 4})

print("=== 遍历与构造 ===")
for k, v in {"p": 1, "q": 2}.items():
    print(k, v)
print(dict(zip(["a", "b"], [1, 2])))
print(dict(a=1, b=2))
print("键可以是元组：", {("x", 1): "点"}[("x", 1)])
try:
    {["x"]: 1}
except TypeError as e:
    print("TypeError:", e)
```

```text
{'语文': 92, '数学': 88} 2
插入序即遍历序： {'语文': 90, '数学': 88, '英语': 95}
键： ['语文', '数学', '英语'] | 值： [90, 88, 95]
=== 取值三种方式 ===
88
None | 0
KeyError: '化学'
=== 计数：get 与 setdefault ===
{'a': 2, 'b': 1, 'c': 1}
{'a': 2, 'b': 1, 'c': 1} | 已有键时 setdefault 返回旧值： 2
=== 删除与弹出 ===
1 {'b': 2} 默认值
{}
KeyError: 'b'
=== 合并：update 原地，| 新建 ===
| 结果： {'a': 1, 'b': 20, 'c': 30} | x 未变： {'a': 1, 'b': 2}
update 后 x： {'a': 1, 'b': 20, 'c': 30}
** 解包构造： {'b': 20, 'c': 30, 'd': 4}
=== 遍历与构造 ===
p 1
q 2
{'a': 1, 'b': 2}
{'a': 1, 'b': 2}
键可以是元组： 点
TypeError: cannot use 'list' as a dict key (unhashable type: 'list')
```

必须记住的四条：

1. **`d[k]` 缺键抛 `KeyError`，`d.get(k)` 返回 `None`**。判断"有没有"用 `k in d`，不用 `d.get(k)`——`d.get(k)` 在"值是 `None`"时分不清。
2. **插入序 = 遍历序**（3.7 起是语言保证，不是实现细节）。所以 `print(d)` 的输出是确定性的，可以直接比对。
3. **`update` 改自己，`|` 造新字典**；同名键**右边覆盖左边**。`d |= other` 是 3.9+ 的原地版本。
4. **键必须可哈希**：`str`、`int`、`float`、`tuple`、`frozenset`、`None` 可以，`list`、`dict`、`set` 不行。

计数是最常见的字典用法，两种写法都行，但**更快的是 `collections.Counter`**：`Counter("abca")` 直接得 `{'a': 2, 'b': 1, 'c': 1}`，还自带 `most_common()`（第 21 章）。

> **⚠️ 易错** 遍历字典时**增删键**会抛 `RuntimeError: dictionary changed size during iteration`。要改就先 `list(d)` 或 `list(d.items())` 复制一份再遍历。

---

## 6.5 集合：去重与集合运算

```python
# 示例：examples/ch06_04_sets.py
"""ch06_04_sets.py —— 集合：去重、集合运算与可哈希要求"""
s = {3, 1, 2}
print("元素个数：", len(s), "| 想稳定输出用 sorted：", sorted(s))
print("空集合只能写 set()：", set(), "| 而 {} 是空字典：", type({}).__name__)

print("=== 去重 ===")
words = ["a", "b", "a", "c"]
print("set 去重后元素数：", len(set(words)))
print("保序去重：", list(dict.fromkeys(words)))

print("=== 增删与成员判断 ===")
s.add(4)
s.discard(99)
print(sorted(s))
s.remove(4)
try:
    s.remove(99)
except KeyError as e:
    print("KeyError:", e)
print("成员判断：", 2 in s, 99 in s)

print("=== 集合运算 ===")
a = set("abcd")
b = set("cdef")
print("交集：", sorted(a & b), "| 并集：", sorted(a | b))
print("差集：", sorted(a - b), "| 对称差：", sorted(a ^ b))
print("子集：", {"a", "b"} <= a, "| 真子集：", a < a)
print("方法写法等价：", sorted(a.intersection(b)) == sorted(a & b))

print("=== 就地运算 ===")
c = {1, 2}
c |= {3}
c &= {2, 3, 9}
print(sorted(c))

print("=== 元素必须可哈希 ===")
try:
    {{1, 2}}
except TypeError as e:
    print("TypeError:", e)
print("元组可入集合：", sorted({(1, 2), (0, 2)}))
print("frozenset 可作字典键：", {frozenset({1, 2}): "ok"}[frozenset({2, 1})])
```

- `set` **无序**：`print({3, 1, 2})` 的输出顺序取决于哈希值，不同进程都可能不同。**要做稳定输出就 `sorted(s)`**，想"去重且保留原顺序"用 `list(dict.fromkeys(xs))`（利用字典的插入序）。
- `discard` 删不存在的元素**不报错**，`remove` 会抛 `KeyError`——不确定在不在就用 `discard`。
- 集合运算的运算符版要求两边都是集合：`a & [1]` 报 `TypeError`，得写 `a & set([1])` 或用方法版 `a.intersection([1])`（方法接受任何可迭代对象）。
- `frozenset` 是不可变集合，能作字典键/集合元素。

---

## 6.6 复杂度决定能不能过题

| 操作 | `list` | `tuple` | `dict` | `set` |
| --- | --- | --- | --- | --- |
| 按下标取 `x[i]` | O(1) | O(1) | ✗ | ✗ |
| 按值查 `v in x` | O(n) | O(n) | O(1)（查键） | O(1) |
| 追加 | `append` O(1) 均摊 | ✗ | O(1) 均摊 | O(1) 均摊 |
| 头插入 | O(n) | ✗ | ✗ | ✗ |
| 删除中间元素 | O(n) | ✗ | O(1) | O(1) |
| 内存 | 最省 | 更省 | 较大（哈希表） | 较大 |

一个真实规模的对照：10^5 个整数，查 10^5 次"在不在"——

```text
元素个数： 3 | 想稳定输出用 sorted： [1, 2, 3]
空集合只能写 set()： set() | 而 {} 是空字典： dict
=== 去重 ===
set 去重后元素数： 3
保序去重： ['a', 'b', 'c']
=== 增删与成员判断 ===
[1, 2, 3, 4]
KeyError: 99
成员判断： True False
=== 集合运算 ===
交集： ['c', 'd'] | 并集： ['a', 'b', 'c', 'd', 'e', 'f']
差集： ['a', 'b'] | 对称差： ['a', 'b', 'e', 'f']
子集： True | 真子集： False
方法写法等价： True
=== 就地运算 ===
[2, 3]
=== 元素必须可哈希 ===
TypeError: cannot use 'set' as a set element (unhashable type: 'set')
元组可入集合： [(0, 2), (1, 2)]
frozenset 可作字典键： ok
```

所以"判重 + 计数 + 查表"一律先想 `set`/`dict`，这是 Python 做题最省时的优化。

---

## 6.7 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 动态数组 | `std::vector<int>` | `list`，无需声明元素类型与容量 |
| 定长数组 | `int a[10]` / `std::array` | `[0] * 10`（运行期创建，无栈上限） |
| 键值对 | `std::map`（红黑树 O(log n)）/ `unordered_map` | `dict`，哈希 O(1)，**保插入序** |
| 去重 | `std::set` / `std::unordered_set` | `set`，运算符 `& \| - ^` 直接可用 |
| 多返回值 | `std::pair` / `std::tuple` + `get<0>` | 直接 `return a, b` + 解包 |
| 定长记录 | `struct` | `tuple` / `namedtuple` / `dataclass` |
| 原地修改返回值 | `v.sort()` 返回 `void` | 返回 `None`（链式调用必踩坑） |
| 排序稳定性 | `std::sort` 不稳定，`stable_sort` 才稳定 | `sort` / `sorted` **都稳定** |
| 二维数组 | `vector<vector<int>>(n, vector<int>(m))` | `[[0] * m for _ in range(n)]` |

---

## 6.8 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `AttributeError: 'NoneType' object has no attribute 'append'` | `x = a.sort()` / `a.append` 之外还接了原地方法 | 原地方法单独一行，或改用 `sorted(a)` |
| `IndexError: list index out of range` | 下标越界（负下标从 -1 开始但不会更负） | 先判 `len`，或用 `try/except IndexError` |
| `ValueError: list.remove(x): x not in list` | `remove` 找不到元素 | 先 `if x in a`，或用 `while x in a` |
| `KeyError: 'k'` | 直接 `d[k]` 取缺失键 | `d.get(k, 默认值)` 或先 `if k in d` |
| `TypeError: unhashable type: 'list'` | 用列表当键/集合元素 | 转 `tuple(lst)` |
| `RuntimeError: dictionary changed size during iteration` | 遍历时改字典 | `for k in list(d):` |
| `[[0] * 3] * 3` 改一行全变 | 三行是同一个列表的别名 | `[[0] * 3 for _ in range(3)]` |
| `{{1, 2}}` 报 `TypeError` | 集合元素必须可哈希 | 用 `frozenset` 或改成列表 |
| 两个列表 `==` 为 True 改了其中一个另一个也变 | 浅拷贝/别名 | `copy.deepcopy` 或新建 |
| `sorted(s)` 与 `print(s)` 顺序不一致 | 集合无序 | 输出前一律 `sorted` |
| `(1)` 不是元组导致解包报错 | 缺逗号 | 写 `(1,)` |

---

## 6.9 练习

**1.（列表基本操作）** 给定 `nums = [3, 1, 4, 1, 5, 9, 2, 6]`，输出：去重后**保序**的列表、升序列表、最大值及其下标、总和与平均值（保留 2 位小数）。

验收：不用第三方库；去重结果顺序与原列表首次出现顺序一致。

**2.（字典计数）** 统计一段文本里每个单词出现次数，按次数降序、次数相同按单词升序输出前 3 名。

验收：`"the cat the dog the bird cat"` 输出 `the 3`、`cat 2`、`bird 1`（各占一行）。

**3.（集合运算）** 给定两个班级的花名册（列表），输出去重后的并集（有序）、交集、只在一班的人。

验收：三行输出都用 `sorted` 保证顺序稳定。

**4.（变式）** 实现 `two_sum(nums, target)`，返回**第一个**满足 `nums[i] + nums[j] == target`（`i < j`）的下标对；要求对 10^5 规模不超时。

验收：`two_sum([2, 7, 11, 15], 9) == (0, 1)`，并说明时间复杂度为什么是 O(n)。

**5.（挑战）** 实现 `group_anagrams(words)`：把字母异位词分到一组，组内按字典序、组间按首词字典序输出。

验收：`["eat", "tea", "tan", "ate", "nat", "bat"]` 分成 3 组，`["ate", "eat", "tea"]` 一组；只能用内置类型（提示：排序后的字符串当字典键）。

---

## 6.10 小结

1. **list 按下标、dict 按名字、set 判存在、tuple 打包不变**——选型就是选复杂度。
2. **原地方法返回 `None`**，`sort`/`append`/`extend` 都别接收返回值。
3. **`[[0]*m]*n` 是 n 个别名**，二维表一律用推导式建。

下一章把容器切成片段：切片 `s[a:b:c]` 的语义、负数下标、越界为什么不报错，以及切片与拷贝的关系。
