"""ch10_03_firstclass.py —— 函数是对象：赋值、传参、无重载、覆盖"""


def square(x):
    return x * x


f = square
print("函数可以赋值给变量：", f(4), "| 同一个对象：", f is square, "|", square.__name__)

print("=== 作为参数（高阶函数） ===")


def apply_all(fn, xs):
    return [fn(x) for x in xs]


print(apply_all(square, [1, 2, 3]))
print(apply_all(str.upper, ["a", "b"]))

print("=== 没有重载：后定义覆盖前定义 ===")


def report(x):
    return "一参版"


def report(x, y=0):
    return "两参版"


print(report(1), report(1, 2))

print("=== 函数的元信息 ===")
print("square 的 docstring：", square.__doc__)


def documented(x):
    """把 x 转成字符串"""
    return str(x)


print("docstring：", documented.__doc__, "| 注解：", documented.__annotations__)

print("=== 注解不做事，类型检查靠工具 ===")


def typed(a: int, b: int) -> int:
    return a + b


print("传字符串也能跑：", typed("a", "b"))

print("=== 函数能放进容器、能做返回值 ===")
ops = {"加": lambda a, b: a + b, "减": lambda a, b: a - b}
print(ops["加"](3, 4), ops["减"](3, 4))


def make_adder(n):
    def adder(x):
        return x + n
    return adder


add10 = make_adder(10)
print("闭包工厂：", add10(5), add10(-1))