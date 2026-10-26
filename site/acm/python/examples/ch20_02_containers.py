"""ch20_02_containers.py —— 容器泛型、联合、Literal、TypedDict"""

from collections.abc import Iterable, Iterator, Sequence
from typing import Any, Callable, Final, Literal, Optional, TypedDict

Vector = list[float]


def scale(v: Vector, k: float) -> Vector:
    return [x * k for x in v]


print("类型别名在运行时就是 list[float]：", Vector)
print("scale：", scale([1.0, -2.0], 2))
print("别名与本体相等：", Vector == list[float])

print("=== 容器参数化 ===")
print("list[int]：", list[int])
print("dict[str, list[int]]：", dict[str, list[int]])
print("tuple[int, str] 定长：", tuple[int, str])
print("tuple[int, ...] 变长同类型：", tuple[int, ...])
print("运行时不校验参数个数（只有类型检查器会报）：", list[int, str])
print("参数化只影响静态检查，实例仍是 list：", type(list[int]()).__name__)

print("=== 可选与联合 ===")


def find(name: str) -> str | None:
    return {"a": "A"}.get(name)


print("Optional[str] 与 str | None 等价：", Optional[str] == (str | None))
print("find('a')：", find("a"), "| find('z')：", find("z"))
print("联合顺序无关：", (int | str) == (str | int))

print("=== Literal：把取值限定成枚举 ===")
Mode = Literal["r", "w", "a"]
print("Literal 的可选值：", Mode.__args__)


def open_mode(m: Mode) -> str:
    return f"打开模式 {m}"


print(open_mode("r"))

print("=== TypedDict：给字典加字段说明 ===")


class User(TypedDict):
    name: str
    age: int
    tags: list[str]


u: User = {"name": "小明", "age": 18, "tags": ["python"]}
print("运行时就是普通 dict：", type(u).__name__, "|", u)
print("字段注解：", User.__annotations__)
print("必填字段：", sorted(User.__required_keys__))
print("没有额外运行时校验：", {**u, "extra": 1}["extra"])

print("=== Callable 与 Any ===")


def apply(f: Callable[[int], int], x: int) -> int:
    return f(x)


print("apply(lambda)：", apply(lambda n: n * 3, 7))
sq: Callable[[float], float] = lambda v: v * v
print("Callable 只是注解：", sq(1.5))
any_value: Any = 1
any_value = "现在变成字符串了"
print("Any 表示放弃检查：", any_value)

LIMIT: Final = 100
print("Final 只是标记，运行时照样能改：", LIMIT)
LIMIT = 200
print("改了也不报错：", LIMIT)

print("=== collections.abc：按能力而不是按类型注解 ===")


def total(xs: Iterable[int]) -> int:
    return sum(xs)


def head(xs: Sequence[int]) -> int:
    return xs[0]


print("total(list)：", total([1, 2, 3]))
print("total(生成器)：", total(x for x in range(4)))
print("head(list)：", head([9, 8]))
print("dict 是 Iterable 但不是 Sequence：", isinstance({}, Iterable), isinstance({}, Sequence))
print("range 是 Sequence：", isinstance(range(3), Sequence))
print("生成器是 Iterator 不是 Sequence：",
      isinstance((x for x in []), Iterator), isinstance((x for x in []), Sequence))