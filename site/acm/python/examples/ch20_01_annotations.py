"""ch20_01_annotations.py —— 注解是表达式，存在 __annotations__ 里"""

import sys
import typing


def add(a: int, b: int) -> int:
    return a + b


print("函数注解：", add.__annotations__)
print("结果类型：", type(add(1, 2)).__name__)

print("=== 运行时不检查 ===")
print("传字符串照样跑：", add("py", "thon"))
print("传列表也跑：", add([1], [2]))
print("传什么都不会 TypeError：", add(1.5, True))

print("=== 注解可以是任意表达式，字符串会原样保留 ===")


def weird(x: "不存在的类型") -> "也不是类型":
    return x


print("字符串注解：", weird.__annotations__)
try:
    typing.get_type_hints(weird)
except NameError as e:
    print("get_type_hints 解析失败 ->", type(e).__name__ + ":", e)

print("=== 前向引用：类还没定义完就引用自己 ===")


class Node:
    def __init__(self, value: int, nxt: "Node | None" = None) -> None:
        self.value = value
        self.nxt = nxt


hints = typing.get_type_hints(Node.__init__)
print("解析后 value：", hints["value"].__name__)
print("解析后 nxt：", hints["nxt"])
print("nxt 是联合类型：", typing.get_origin(hints["nxt"]) is typing.Union)

print("=== 变量注解进 __annotations__，局部变量不进 ===")
count: int = 0
names: list[str] = []
mod = sys.modules[__name__]
print("模块级注解（3.14 起按需生成）：", mod.__annotations__)


def local_anno():
    x: int = 1
    return sorted(locals())


print("局部变量注解不产生任何运行时对象：", local_anno())


class Account:
    rate: float = 1.0
    history: list[str]


print("类注解：", Account.__annotations__)
print("注解不是属性，没有默认值时并不存在：", hasattr(Account, "history"))

print("=== 注解可以挂函数、类、模块，也是可反射的元数据 ===")
print("add 的注解键：", sorted(add.__annotations__))
print("类型本身也是对象：", add.__annotations__["a"] is int)
print("注解不会进函数签名检查：", add.__defaults__ is None)