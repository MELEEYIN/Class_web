"""ch20_03_generics.py —— TypeVar、Generic、Protocol 与 overload"""

from typing import Generic, Protocol, TypeVar, overload, runtime_checkable

T = TypeVar("T")


def first(items: list[T]) -> T:
    return items[0]


print("泛型函数：", first([1, 2]), "|", first(["a", "b"]))
print("T 在运行时只是 TypeVar：", T)

print("=== 泛型类 ===")


class Stack(Generic[T]):
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()

    def __len__(self) -> int:
        return len(self._items)


s: Stack[int] = Stack()
s.push(1)
s.push(2)
print("出栈：", s.pop(), "| 剩余长度：", len(s))
print("参数化后的类：", Stack[int])
print("Stack[int] 与 Stack[str] 不是同一个对象：", Stack[int] is not Stack[str])
print("但实例的类型都是 Stack：", type(s).__name__)

print("=== 约束与上界 ===")
N = TypeVar("N", int, float)


def double(x: N) -> N:
    return x * 2


print("约束为 int/float：", double(2), "|", double(1.5))

print("=== Protocol：结构化子类型，鸭子类型的正式写法 ===")


@runtime_checkable
class HasArea(Protocol):
    def area(self) -> float: ...


class Sq:
    def __init__(self, a: float) -> None:
        self.a = a

    def area(self) -> float:
        return self.a ** 2


print("Sq 没继承 HasArea，isinstance 仍通过：", isinstance(Sq(2), HasArea))
print("int 没有 area()：", isinstance(3, HasArea))
print("Protocol 也能当注解用：", HasArea.__name__)

print("=== overload 只服务类型检查器 ===")


@overload
def stub(x: int) -> int: ...


try:
    stub(1)
except NotImplementedError as e:
    print("只剩 stub 时调用 ->", type(e).__name__ + ":", str(e).splitlines()[0])
print("它被换成了占位函数：", stub.__name__)


@overload
def parse(s: str) -> int: ...
@overload
def parse(s: bytes) -> int: ...
def parse(s):
    return int(s)


print("运行时只剩最后一个定义：", parse("42"), "|", parse(b"7"))
print("签名只留实现那一版，形参个数：", parse.__code__.co_argcount)