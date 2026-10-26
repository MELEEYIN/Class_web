# 14 · 作用域与 LEGB

> **本质**：Python 的变量作用域是**编译期就定好的静态划分**，只有四层：Local（函数内）、Enclosing（外层函数）、Global（模块）、Built-in（内置）。同一个名字在同一个作用域里**只能属于一层**——而"属于哪一层"由这个作用域里有没有对它赋值决定，不看执行顺序。这一条决定了 `UnboundLocalError` 为什么会出现。

**读完这一章你能做到**

- 画出任意一段嵌套代码的 LEGB 查找路径；
- 用 `co_varnames` / `co_names` / `co_cellvars` / `co_freevars` 验证编译期判定；
- 准确区分"只读全局""改全局""改外层"三种意图在语法上的差异；
- 解释类体与推导式的作用域为什么和函数不同；
- 避免遮蔽内置名字这类自伤式错误。

---

## 14.1 四层查找，逐层实测

```python
# 示例：examples/ch14_01_legb.py
"""ch14_01_legb.py —— LEGB 四层查找实证"""
x = "global"


def outer():
    x = "enclosing"

    def inner():
        print("inner 看到：", x)

    inner()
    print("outer 看到：", x)


outer()
print("模块级看到：", x)

print("=== 名字解析由赋值决定：局部优先 ===")


def shadow():
    x = "local"
    print("shadow 里：", x)


shadow()
print("模块级仍是：", x)

print("=== 找不到才往外走，最后才是内置 ===")
print(len("abc"))


def use_builtin():
    return len([1, 2, 3])


print(use_builtin())

print("=== 局部判定是编译期决定的 ===")


def broken():
    print("调用前 x 是：", x)
    x = "local"


try:
    broken()
except UnboundLocalError as e:
    print("UnboundLocalError:", e)

print("=== 从 __code__ 看编译期的判定 ===")
print("broken 的局部变量：", broken.__code__.co_varnames)
print("broken 引用的全局名：", broken.__code__.co_names)
print("outer 的局部变量：", outer.__code__.co_varnames)
print("外层的 cell 变量：", outer.__code__.co_cellvars)

print("=== 遮蔽内置名字的代价 ===")
list = [1, 2, 3]
print("list 现在是：", list)
try:
    print(list("ab"))
except TypeError as e:
    print("TypeError:", e)
del list
print("del 之后 list 恢复：", list("ab"))
```

```text
inner 看到： enclosing
outer 看到： enclosing
模块级看到： global
=== 名字解析由赋值决定：局部优先 ===
shadow 里： local
模块级仍是： global
=== 找不到才往外走，最后才是内置 ===
3
3
=== 局部判定是编译期决定的 ===
UnboundLocalError: cannot access local variable 'x' where it is not associated with a value
=== 从 __code__ 看编译期的判定 ===
broken 的局部变量： ('x',)
broken 引用的全局名： ('print',)
outer 的局部变量： ('inner',)
外层的 cell 变量： ('x',)
=== 遮蔽内置名字的代价 ===
list 现在是： [1, 2, 3]
TypeError: 'list' object is not callable
del 之后 list 恢复： ['a', 'b']
```

四个作用域，一张图记住：

```text
Built-in   内置命名空间（len、print、list……）
   ↑ 找不到才往上走
Global     模块级（一个 .py 文件就是一层）
   ↑
Enclosing  外层函数的局部作用域（可以有多个嵌套层）
   ↑
Local      当前函数的局部作用域
```

`broken` 里那句 `print("调用前 x 是：", x)` 为什么不是打印 `global`？因为**编译期**就已经把这个函数体里所有被赋值的名字收集成"局部变量表"（`co_varnames` 里有 `x`），于是 `x` 被判定为局部名。执行到 `print` 时这个局部名还没被绑定，抛 `UnboundLocalError`。

这就是 Python 和 C++ 最根本的差别之一：**C++ 里局部变量从声明处开始生效，Python 里"只要函数体内出现过对该名的赋值，整个函数体内它就是局部变量"**。

```pycon
>>> g = 1
>>> def f():
...     return g
>>> f()
1
>>> def h():
...     g = 2
...     return g
>>> h()
2
>>> g
1
```

`outer.__code__.co_cellvars` 是 `('x',)`——因为内层函数引用了它，`x` 从普通局部变量升级成 **cell 变量**（12 章讲的 `__closure__` 就是装它的）。`broken` 的 `co_names` 里则有 `print`，说明 `print` 是按"全局/内置名"去查的。

遮蔽内置名字的后果很具体：`list = [1, 2, 3]` 之后 `list("ab")` 抛 `TypeError: 'list' object is not callable`——因为 `list` 这名字现在指向一个列表对象。`del list` 删掉模块级的绑定后，查找重新落到 builtins。**永远不要用 `list`/`dict`/`str`/`id`/`input`/`sum`/`max`/`type` 做变量名。**

---

## 14.2 `global` 与 `nonlocal` 的边界

```python
# 示例：examples/ch14_02_global_nonlocal.py
"""ch14_02_global_nonlocal.py —— global / nonlocal 的边界"""

count = 0


def bump():
    global count
    count += 1


bump()
bump()
print("count =", count)

print("=== 只读全局变量不需要 global ===")
message = "模块级消息"


def read_only():
    return message


print(read_only())

print("=== global 可以在函数里新建模块级名字 ===")
print("调用前 'fresh' 在 globals 里吗：", "fresh" in globals())


def make_global():
    global fresh
    fresh = "由函数创建"


make_global()
print("调用后 'fresh' 在 globals 里吗：", "fresh" in globals(), "| 值：", fresh)

print("=== nonlocal 可以跨多层 ===")


def outer():
    n = 0

    def mid():
        nonlocal n

        def inner():
            nonlocal n
            n += 1

        inner()
        inner()

    mid()
    return n


print("inner 改到了 outer 的 n：", outer())

print("=== global 直接跳到模块级，跳过外层 ===")
level = "模块级"


def outer2():
    level = "外层"

    def inner2():
        global level
        return level

    return inner2()


print("inner2 返回：", outer2())

print("=== nonlocal 不能指向模块级 ===")
src = "def f():\n    nonlocal level\n"
try:
    compile(src, "<s>", "exec")
except SyntaxError as e:
    print("SyntaxError:", e.msg)

print("=== 同一层里 nonlocal 也必须真有外层绑定 ===")
src2 = "def g():\n    x = 0\n    nonlocal x\n"
try:
    compile(src2, "<s>", "exec")
except SyntaxError as e:
    print("SyntaxError:", e.msg)
```

```text
count = 2
=== 只读全局变量不需要 global ===
模块级消息
=== global 可以在函数里新建模块级名字 ===
调用前 'fresh' 在 globals 里吗： False
调用后 'fresh' 在 globals 里吗： True | 值： 由函数创建
=== nonlocal 可以跨多层 ===
inner 改到了 outer 的 n： 2
=== global 直接跳到模块级，跳过外层 ===
inner2 返回： 模块级
=== nonlocal 不能指向模块级 ===
SyntaxError: no binding for nonlocal 'level' found
=== 同一层里 nonlocal 也必须真有外层绑定 ===
SyntaxError: name 'x' is assigned to before nonlocal declaration
```

三条硬规则：

| 意图 | 写法 | 关键点 |
| --- | --- | --- |
| 只读全局 | 直接用名字 | 不需要声明，LEGB 会找到 |
| 改全局 | 函数首行 `global n` | 声明后该名字在整个函数体里指向模块级 |
| 改外层函数的变量 | 函数首行 `nonlocal n` | 外层必须真的有这个绑定，否则 `SyntaxError` |
| 新建模块级名字 | `global fresh` + 赋值 | 名字在执行赋值前**不存在**于 `globals()` |

`compile` 阶段就报错，说明 `nonlocal` 的合法性是**静态检查**的：解释器在编译时确认外层作用域里存在同名绑定，不存在就直接拒绝。这和运行期才可能的 `NameError` 不同，属于"写错了根本跑不起来"。（示例里用 `compile()` 是为了让错误可打印，直接写进文件会导致整个模块加载失败。）

> **⚠️ 易错** `global` 与 `nonlocal` 都是**编译指令**，必须写在函数体里、且位于对该名字的任何使用之前（习惯上放第一行）。写在 `if` 分支里虽然合法，但会让人误判作用域，不要这么写。

---

## 14.3 类作用域与推导式作用域：两个例外

```python
# 示例：examples/ch14_03_special.py
"""ch14_03_special.py —— 类作用域、推导式作用域与海象运算符的特殊规则"""

print("=== 1. 类体是按顺序执行的普通语句块 ===")


class C:
    value = 10
    doubled = value * 2

    def method(self):
        return value


print("类体内可以直接用前面的类变量：", C.doubled)
try:
    C().method()
except NameError as e:
    print("方法体里却看不到：NameError:", e)


class D:
    value = 10

    def method(self):
        return self.value


print("正确做法是用 self 访问：", D().method())

print("=== 2. 推导式有独立作用域，同样看不到类变量 ===")
try:
    class E:
        value = 10
        squares = [value * i for i in range(3)]
except NameError as e:
    print("NameError:", e)


class F:
    value = 10
    squares = [i * i for i in range(3)]


print("不引用类变量的推导式没问题：", F.squares)

print("=== 3. for 循环变量泄漏，推导式变量不泄漏 ===")
for i in range(3):
    pass
print("for 结束后 i =", i)

squares = [j * j for j in range(3)]
print("推导式结果：", squares)
try:
    print(j)
except NameError as e:
    print("NameError:", e)

print("=== 4. 海象运算符是例外：值会送到外层 ===")
values = [(last := x * 10) for x in range(4)]
print("列表：", values)
print("海象留在外层的 last =", last)

print("=== 5. locals() / globals() ===")


def show_locals():
    a = 1
    b = 2
    return sorted(locals())


print("函数内的局部名字：", show_locals())
print("模块级 globals 里有 __name__：", "__name__" in globals())
print("模块级 globals 里有 __builtins__：", "__builtins__" in globals())

print("=== 6. 函数体里的名字在调用时才解析 ===")


def caller():
    return later()


def later():
    return "later 在这里"


print(caller())

print("=== 7. 同层重复定义：后者覆盖前者，但闭包看的是同一份绑定 ===")


def same_scope():
    def helper():
        return "第一版"

    def first():
        return helper()

    def helper():
        return "第二版"

    return first()


print(same_scope())
```

```text
=== 1. 类体是按顺序执行的普通语句块 ===
类体内可以直接用前面的类变量： 20
方法体里却看不到：NameError: name 'value' is not defined
正确做法是用 self 访问： 10
=== 2. 推导式有独立作用域，同样看不到类变量 ===
NameError: name 'value' is not defined
不引用类变量的推导式没问题： [0, 1, 4]
=== 3. for 循环变量泄漏，推导式变量不泄漏 ===
for 结束后 i = 2
推导式结果： [0, 1, 4]
NameError: name 'j' is not defined
=== 4. 海象运算符是例外：值会送到外层 ===
列表： [0, 10, 20, 30]
海象留在外层的 last = 30
=== 5. locals() / globals() ===
函数内的局部名字： ['a', 'b']
模块级 globals 里有 __name__： True
模块级 globals 里有 __builtins__： True
=== 6. 函数体里的名字在调用时才解析 ===
later 在这里
=== 7. 同层重复定义：后者覆盖前者，但闭包看的是同一份绑定 ===
第二版
```

两个"例外"的本质：

1. **类体不是 Enclosing 作用域**。类体本身是一个执行的命名空间，`doubled = value * 2` 能用前面的类变量（顺序执行、同一字典）；但类体内 `def` 出来的函数**只把类体当 Global 来查**，所以 `method` 里直接写 `value` 会 `NameError`。想访问实例/类属性必须走 `self.value` / `C.value`。唯一的隐藏通道是零参 `super()` 用到的 `__class__` cell。
2. **推导式（与生成器表达式）有自己的函数作用域**。所以 `[value * i for i in range(3)]` 写在类体里会崩——推导式的内层看不到类体。`[i * i for i in range(3)]` 不引用类变量就没问题。顺带的好处是推导式变量**不会泄漏**到外层（`j` 在推导式结束后不存在），而普通 `for` 循环变量会留在当前作用域里。

`for` 之后 `i` 仍是 2，这一点和 C++ 不同：C++ 的循环变量作用域只在循环体内（C++11 `for (int i : ...)`），Python 的 `for` 不创建作用域。

海象运算符 `:=` 是推导式作用域规则的例外——赋值表达式的目标属于**外层**作用域，所以 `last` 在推导式之后还能用。这是"把中间结果带出来"的合法写法。

`same_scope()` 返回"第二版"：`first` 的 `helper` 是按名字在闭包里查，定义时先后无关、调用时看最终绑定——和 11 章晚绑定同一个机制。

---

## 14.4 一个实战问题：为什么要 `if __name__ == "__main__"` 之外还要小心全局状态

```text
# 不推荐的全局单例
cache = {}
def load(k):
    if k not in cache:
        cache[k] = expensive(k)
    return cache[k]

# 推荐：用参数或类持有状态
class Cache:
    def __init__(self):
        self._data = {}
    def load(self, k):
        return self._data.setdefault(k, expensive(k))
```

模块级可变全局状态的代价：① 任何函数都能改，测试之间互相污染；② 多线程/多进程下行为不同（fork 后子进程有独立副本，线程共享）；③ 单元测试难以隔离。真要用全局，就明确写 `global` 声明，并在文档里注明"模块级状态"。

---

## 14.5 与 C++ 的差别

| 维度 | C++ | Python |
| --- | --- | --- |
| 作用域确定时机 | 编译期词法作用域 | 编译期静态划分 + 运行期 LEGB 查找 |
| 局部变量生效点 | 声明处到块结束 | 整个函数体（赋值判定） |
| 块作用域 | `{}` 就是作用域 | 只有函数/类/模块/推导式才是作用域 |
| 循环变量 | 循环体内 | 泄漏到当前作用域 |
| 修改外部变量 | 引用捕获 / `static` | `global` / `nonlocal` |
| 同名遮蔽 | 内层块遮蔽外层 | 内层函数遮蔽外层；类体不参与闭包查找 |
| 未初始化使用 | 未定义行为 / 编译错误 | `UnboundLocalError` / `NameError` |

---

## 14.6 易错点清单

| 现象 | 原因 | 一行修复 |
| --- | --- | --- |
| `UnboundLocalError` | 函数体内有赋值，名字被判成局部 | 加 `global` / `nonlocal`，或改用别的名字 |
| `NameError: name 'x' is not defined` | 名字在任何一层都不存在 | 检查拼写与定义顺序 |
| 类里 `return value` 报 `NameError` | 类体不是闭包作用域 | 用 `self.value` |
| 类体里推导式引用类变量崩了 | 推导式有独立作用域 | 改用 `self` 或在推导式外用局部变量接一下 |
| `nonlocal` 报 `SyntaxError: no binding for nonlocal ...` | 外层没有该绑定 | 先在外层赋值，或改用 `global` |
| `list(...)` 报 `'list' object is not callable` | 遮蔽了内置名字 | 改名，别用内置名 |
| 循环后变量还在 | `for` 不创建作用域 | 需要隔离就包进函数/推导式 |
| 删了对象引用仍不释放 | 闭包/全局容器持有 | 见 12 章与 24 章 |
| 测试之间互相影响 | 模块级可变全局状态 | 用类持有状态或 `pytest` fixture |

---

## 14.7 练习

**1.（基础）** 给定 `x = "g"`，写三个函数分别输出 `"g"`、在函数内新建同名局部变量输出 `"l"`、用 `global` 改掉全局的 `x` 再输出。运行后打印模块级 `x` 的最终值。

验收：三次输出依次为 `g`、`l`、`l`，且最后模块级 `x` 是 `l`（第三次改的）。

**2.（诊断）** 下面代码为什么抛 `UnboundLocalError`？改成正确版本并说明改了哪一处：

```text
n = 0
def inc():
    n = n + 1
    return n
```

验收：修改后连续调用两次返回 1、2，且模块级 `n` 变为 2。

**3.（作用域推理）** 不运行，先写出输出，再运行验证：

```text
x = "global"
def f():
    x = "outer"
    def g():
        return x
    x = "changed"
    return g()
print(f())
```

验收：能解释为什么结果是 `changed`（绑定在调用时读取）。

**4.（变式）** 写一个函数 `make_counter()` 返回 `add()` 与 `reset()` 两个函数，共享同一个计数；`reset` 把计数归零。只允许用 `nonlocal`，不允许用列表或属性。

验收：`add()` 三次得 1、2、3，`reset()` 后再 `add()` 得 1。

**5.（挑战）** 用 `dis` 或 `__code__` 解释下面两个函数字节码的差异，并说明哪一个会 `UnboundLocalError`：

```text
def a():
    print(x)
def b():
    print(x)
    x = 1
```

验收：打印两者的 `co_varnames`，`a` 为空、`b` 含 `x`；能说明 `LOAD_GLOBAL` 与 `LOAD_FAST` 的区别。

---

## 14.8 小结

1. **LEGB 是编译期静态划分**，一个名字在一个作用域里只属于一层，由"是否赋值"决定。
2. **改全局用 `global`，改外层用 `nonlocal`**；只读不需要声明；`nonlocal` 找不到外层绑定是 `SyntaxError`。
3. **类体不是 Enclosing，推导式有独立作用域，`for` 不创建作用域**——这三个例外解释了大部分"奇怪"的 `NameError`。

下一章转向 Python 最优雅的机制：迭代器与生成器——`for` 到底调用了什么、`yield` 如何把函数变成状态机、以及为什么它能用 O(1) 内存处理 GB 级数据。
