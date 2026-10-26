"""ch18_03_magic.py —— 魔术方法：让自定义对象像内置类型一样工作"""
import functools


class Money:
    def __init__(self, amount):
        self.amount = amount

    def __repr__(self):
        return f"Money({self.amount})"

    def __str__(self):
        return f"￥{self.amount}"

    def __eq__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return self.amount == other.amount

    def __hash__(self):
        return hash(self.amount)

    def __add__(self, other):
        if isinstance(other, Money):
            return Money(self.amount + other.amount)
        return NotImplemented

    def __lt__(self, other):
        return self.amount < other.amount

    def __len__(self):
        return len(str(self.amount))


a, b = Money(30), Money(12)
print("str：", str(a), "| repr：", repr(a))
print("容器里显示的是 repr：", [a, b])

print("=== 相等与哈希 ===")
print("Money(5) == Money(5)：", Money(5) == Money(5))
print("Money(5) == Money(6)：", Money(5) == Money(6))
print("Money(5) == '5'：", Money(5) == "5")
print("去重后集合大小：", len({Money(5), Money(5), Money(6)}))

print("=== 算术与比较 ===")
print("相加：", a + b)
try:
    a + 1
except TypeError as e:
    print("TypeError:", e)
print("排序：", [str(m) for m in sorted([a, b, Money(21)])])
print("len 走 __len__：", len(Money(12345)))

print("=== 定义了 __eq__ 却没定义 __hash__ 就不可哈希 ===")


class Unhashable:
    def __init__(self, v):
        self.v = v

    def __eq__(self, other):
        return isinstance(other, Unhashable) and self.v == other.v


try:
    {Unhashable(1)}
except TypeError as e:
    print("TypeError:", e)

print("=== 容器协议：__len__ / __getitem__ / __contains__ / __iter__ ===")


class Deck:
    def __init__(self):
        self._cards = ["A", "K", "Q"]

    def __len__(self):
        return len(self._cards)

    def __getitem__(self, index):
        return self._cards[index]

    def __contains__(self, value):
        return value in self._cards

    def __iter__(self):
        return iter(self._cards)


deck = Deck()
print("len：", len(deck), "| deck[0]：", deck[0], "| deck[1:]：", deck[1:])
print("'K' in deck：", "K" in deck, "| 遍历：", [c for c in deck])
print("bool 看 __len__：", bool(Deck()), "| 空序列为假")


class Empty:
    def __len__(self):
        return 0


print("len 为 0 的对象：", bool(Empty()))

print("=== __call__：实例也能像函数一样调用 ===")


class Multiplier:
    def __init__(self, k):
        self.k = k

    def __call__(self, x):
        return x * self.k


double = Multiplier(2)
print("double(21)：", double(21))
print("是 callable：", callable(double))

print("=== total_ordering：只写两个比较，补齐全部 ===")


@functools.total_ordering
class Version:
    def __init__(self, parts):
        self.parts = tuple(parts)

    def __eq__(self, other):
        return self.parts == other.parts

    def __lt__(self, other):
        return self.parts < other.parts

    def __repr__(self):
        return "Version" + repr(self.parts)


v1, v2 = Version((1, 2)), Version((1, 10))
print(v1, v2)
print("<：", v1 < v2, "| <=：", v1 <= Version((1, 2)), "| >：", Version((2, 0)) > v2, "| >=：", v1 >= v1)